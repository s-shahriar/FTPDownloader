import { useState, useRef } from 'react';
import { Alert } from 'react-native';
import { SRTGeminiModel, SRTSelectedFile, RateLimitError, CountMismatchError, BatchStats } from './types';
import { readSubtitleFile, saveSubtitleFile } from './fileOperations';
import { detectFormat, parse, buildSubtitle, makeOutputName } from './subtitleParser';
import { chunk, sleep, sleepWithCountdown } from './helpers';
import { annotateBatch } from './geminiAnnotate';
import { getGeminiApiKey } from '../services/GeminiService';

interface UseSubtitleProcessorParams {
  model: SRTGeminiModel;
  selectedFile: SRTSelectedFile | null;
  onLog: (message: string) => void;
  batchSize: number;
}

function fmtTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function pct(part: number, total: number): string {
  return total > 0 ? `${((part / total) * 100).toFixed(1)}%` : '—';
}

function printReport(
  stats: BatchStats[],
  totalElapsedMs: number,
  totalLines: number,
  onLog: (msg: string) => void,
) {
  const totRetries = stats.reduce((a, s) => a + s.retryCount, 0);
  const totChanged = stats.reduce((a, s) => a + s.linesChanged, 0);
  const failedBatches = stats.filter(s => !s.success).length;

  onLog('');
  onLog('─── SUMMARY ───────────────────');
  onLog(`  Time taken    : ${fmtTime(totalElapsedMs)}`);
  onLog(`  Lines changed : ${totChanged} / ${totalLines}  (${pct(totChanged, totalLines)})`);
  onLog(`  Retries       : ${totRetries}`);
  onLog(`  Failed batches: ${failedBatches === 0 ? 'None' : failedBatches}`);
  onLog('───────────────────────────────');
}

export function useSubtitleProcessor({
  model,
  selectedFile,
  onLog,
  batchSize,
}: UseSubtitleProcessorParams) {
  const [processing, setProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const cancelProcessing = () => {
    abortRef.current?.abort();
  };

  const processSubtitle = async () => {
    const key = await getGeminiApiKey();
    if (!key) {
      Alert.alert('Missing API Key', 'Open Settings and add your Gemini API key first.');
      return;
    }
    if (!selectedFile) {
      Alert.alert('Missing File', 'Select a subtitle file first.');
      return;
    }

    setProcessing(true);
    setStatusMsg('');
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    try {
      const { name, uri } = selectedFile;
      const format = detectFormat(name);

      setStatusMsg('Reading file…');
      const content = await readSubtitleFile(uri);

      const blocks = parse(content, format);
      const batches = chunk(blocks, batchSize);
      const delayMs = Math.ceil(60_000 / model.rpm) + 500;

      onLog(`Processing ${blocks.length} lines in ${batches.length} batch(es)…\n`);

      const allStats: BatchStats[] = [];
      const jobStartTime = Date.now();

      for (let i = 0; i < batches.length; i++) {
        if (signal.aborted) (() => { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; })();
        const batch = batches[i];

        const stat: BatchStats = {
          batchIndex: i,
          lineCount: batch.length,
          apiTimeMs: 0,
          rateDelayMs: 0,
          rateLimitWaitMs: 0,
          retryCount: 0,
          linesChanged: 0,
          promptTokens: 0,
          responseTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          success: false,
        };

        let annotated: string[] = batch.map(b => b.text);
        const maxRetries = 3;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          setStatusMsg(`Batch ${i + 1} / ${batches.length}  (${model.label})`);
          try {
            const result = await annotateBatch(key, model.id, batch.map(b => b.text));
            annotated = result.texts;
            stat.apiTimeMs += result.apiTimeMs;
            stat.promptTokens = result.promptTokens;
            stat.responseTokens = result.responseTokens;
            stat.totalTokens = result.totalTokens;
            stat.cachedTokens = result.cachedTokens;
            stat.success = true;
            break;
          } catch (err: any) {
            if (err instanceof RateLimitError && attempt < maxRetries) {
              stat.retryCount++;
              const rlStart = Date.now();
              await sleepWithCountdown(err.retryAfterMs, remaining => {
                setStatusMsg(`Rate limited — retrying in ${remaining}s…`);
              }, signal);
              stat.rateLimitWaitMs += Date.now() - rlStart;
            } else if (err instanceof CountMismatchError && attempt < maxRetries) {
              stat.retryCount++;
              setStatusMsg(`Count mismatch — retrying batch ${i + 1}…`);
            } else {
              onLog(`Batch ${i + 1} failed: ${err.message}`);
              break;
            }
          }
        }

        annotated.forEach((newText, j) => {
          if (newText && newText.trim() && newText !== batch[j].text) {
            batch[j].text = newText;
            stat.linesChanged++;
          }
        });

        if (i < batches.length - 1) {
          const delayStart = Date.now();
          await sleep(delayMs, signal);
          stat.rateDelayMs = Date.now() - delayStart;
        }

        allStats.push(stat);
      }

      // Retry failed batches
      const failedIndices = allStats
        .filter(s => !s.success)
        .map(s => s.batchIndex);

      if (failedIndices.length > 0) {
        onLog(`\nRetrying ${failedIndices.length} failed batch(es)…`);

        for (const fi of failedIndices) {
          if (signal.aborted) (() => { const e = new Error('Cancelled'); e.name = 'AbortError'; throw e; })();
          const batch = batches[fi];
          const existingStat = allStats.find(s => s.batchIndex === fi)!;

          setStatusMsg(`Retrying batch ${fi + 1} / ${batches.length}`);

          const delayStart = Date.now();
          await sleep(delayMs, signal);
          existingStat.rateDelayMs += Date.now() - delayStart;

          try {
            const result = await annotateBatch(key, model.id, batch.map(b => b.text));
            let retryChanged = 0;
            result.texts.forEach((newText, j) => {
              if (newText && newText.trim() && newText !== batch[j].text) {
                batch[j].text = newText;
                retryChanged++;
              }
            });
            existingStat.apiTimeMs += result.apiTimeMs;
            existingStat.promptTokens += result.promptTokens;
            existingStat.responseTokens += result.responseTokens;
            existingStat.totalTokens += result.totalTokens;
            existingStat.cachedTokens += result.cachedTokens;
            existingStat.linesChanged += retryChanged;
            existingStat.retryCount++;
            existingStat.success = true;
          } catch (retryErr: any) {
            existingStat.retryCount++;
            onLog(`Batch ${fi + 1} retry failed: ${retryErr.message}`);
          }
        }

        const stillFailed = allStats.filter(s => !s.success).length;
        if (stillFailed > 0) {
          onLog(`${stillFailed} batch(es) still failed — original text kept.`);
        }
      }

      const totalElapsedMs = Date.now() - jobStartTime;

      setStatusMsg('Saving…');
      const outputContent = buildSubtitle(blocks, format, content);
      const outputFilename = makeOutputName(name);

      onLog(`Saving ${outputFilename}…`);
      await saveSubtitleFile(outputFilename, outputContent, uri);

      printReport(allStats, totalElapsedMs, blocks.length, onLog);
      setStatusMsg('');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        onLog('\nCancelled by user.');
        setStatusMsg('');
      } else {
        onLog(`\nError: ${err.message}`);
        Alert.alert('Error', err.message);
      }
    } finally {
      abortRef.current = null;
      setProcessing(false);
      setStatusMsg('');
    }
  };

  return {
    processing,
    statusMsg,
    processSubtitle,
    cancelProcessing,
  };
}
