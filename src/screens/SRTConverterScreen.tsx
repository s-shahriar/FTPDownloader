import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants';
import { SRTGeminiModel, SRTSelectedFile, BatchSizeOption } from '../srt/types';
import {
  SRT_MODELS,
  SRT_BATCH_SIZE,
  SRT_BATCH_SIZE_OPTIONS,
  SRT_BATCH_SIZE_STORAGE_KEY,
  SRT_MODEL_ID_STORAGE_KEY,
} from '../srt/config';
import { makeOutputName } from '../srt/subtitleParser';
import { useSubtitleProcessor } from '../srt/useSubtitleProcessor';
import { getGeminiApiKey } from '../services/GeminiService';

const Wrapper = Platform.OS === 'web' ? View : SafeAreaView;

interface Props {
  navigation: any;
}

export function SRTConverterScreen({ navigation }: Props) {
  const [model, setModel] = useState<SRTGeminiModel>(SRT_MODELS[0]);
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [batchSize, setBatchSize] = useState<number>(SRT_BATCH_SIZE);
  const [batchSizeModalVisible, setBatchSizeModalVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SRTSelectedFile | null>(null);
  const [log, setLog] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const logScrollRef = useRef<ScrollView>(null);

  // Load persisted preferences and check API key
  useEffect(() => {
    getGeminiApiKey().then(key => setHasApiKey(!!key));

    AsyncStorage.getItem(SRT_MODEL_ID_STORAGE_KEY).then(id => {
      if (id) {
        const saved = SRT_MODELS.find(m => m.id === id);
        if (saved) setModel(saved);
      }
    });

    AsyncStorage.getItem(SRT_BATCH_SIZE_STORAGE_KEY).then(val => {
      const parsed = parseInt(val ?? '', 10);
      if (!isNaN(parsed)) setBatchSize(parsed);
    });
  }, []);

  const appendLog = (msg: string) => {
    setLog(prev => prev + msg + '\n');
    setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 80);
  };

  const { processing, statusMsg, processSubtitle, cancelProcessing } = useSubtitleProcessor({
    model,
    selectedFile,
    onLog: appendLog,
    batchSize,
  });

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const name = asset.name ?? asset.uri.split('/').pop() ?? 'subtitle';

      const lower = name.toLowerCase();
      if (!lower.endsWith('.srt') && !lower.endsWith('.ass') && !lower.endsWith('.ssa') && !lower.endsWith('.vtt')) {
        appendLog(`Unsupported file type: ${name}\nSupported: .srt, .ass, .ssa, .vtt`);
        return;
      }

      setSelectedFile({ name, uri: asset.uri });
      setLog('');
    } catch (err: any) {
      appendLog(`File pick error: ${err.message}`);
    }
  };

  const handleSelectModel = (m: SRTGeminiModel) => {
    setModel(m);
    AsyncStorage.setItem(SRT_MODEL_ID_STORAGE_KEY, m.id);
    setModelModalVisible(false);
  };

  const handleSelectBatchSize = (opt: BatchSizeOption) => {
    setBatchSize(opt.value);
    AsyncStorage.setItem(SRT_BATCH_SIZE_STORAGE_KEY, String(opt.value));
    setBatchSizeModalVisible(false);
  };

  const canProcess = hasApiKey && selectedFile && !processing;

  return (
    <Wrapper style={styles.wrapper}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerLabel}>SUBTITLE TRANSLATOR</Text>
          <Text style={styles.headerTitle}>SRT Converter</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* API Key warning */}
        {hasApiKey === false && (
          <TouchableOpacity
            style={styles.warningBanner}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="warning" size={18} color={COLORS.warning} />
            <Text style={styles.warningText}>
              No Gemini API key set. Go back and open Settings to add one.
            </Text>
          </TouchableOpacity>
        )}

        {/* Step 1 — Model */}
        <View style={styles.section}>
          <StepHeader step={1} title="GEMINI MODEL" />
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => setModelModalVisible(true)}
            disabled={processing}
          >
            <View style={styles.pickerContent}>
              <MaterialIcons name="smart-toy" size={18} color={COLORS.primary} />
              <View style={styles.pickerTextWrap}>
                <Text style={styles.pickerLabel}>{model.label}</Text>
                <Text style={styles.pickerSub} numberOfLines={1}>{model.info}</Text>
              </View>
            </View>
            <MaterialIcons name="expand-more" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Step 2 — File */}
        <View style={styles.section}>
          <StepHeader step={2} title="SUBTITLE FILE" />
          <TouchableOpacity
            style={[styles.filePicker, processing && styles.disabled]}
            onPress={handlePickFile}
            disabled={processing}
          >
            <MaterialIcons
              name={selectedFile ? 'insert-drive-file' : 'folder-open'}
              size={32}
              color={selectedFile ? COLORS.primary : COLORS.textSecondary}
            />
            <Text style={[styles.filePickerText, selectedFile && { color: COLORS.text }]}>
              {selectedFile ? selectedFile.name : 'Tap to select file'}
            </Text>
            {!selectedFile && (
              <Text style={styles.filePickerFormats}>.srt  ·  .ass  ·  .vtt</Text>
            )}
          </TouchableOpacity>

          {selectedFile && (
            <View style={styles.fileInfo}>
              <View style={styles.fileInfoRow}>
                <Text style={styles.fileInfoArrow}>↑</Text>
                <Text style={styles.fileInfoName} numberOfLines={1}>{selectedFile.name}</Text>
              </View>
              <View style={[styles.fileInfoRow, { marginTop: 6 }]}>
                <Text style={[styles.fileInfoArrow, { color: COLORS.success }]}>↓</Text>
                <Text style={[styles.fileInfoName, { color: COLORS.success }]} numberOfLines={1}>
                  {makeOutputName(selectedFile.name)}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Step 3 — Batch size */}
        <View style={styles.section}>
          <StepHeader step={3} title="BATCH SIZE" />
          <TouchableOpacity
            style={styles.pickerRow}
            onPress={() => setBatchSizeModalVisible(true)}
            disabled={processing}
          >
            <View style={styles.pickerContent}>
              <MaterialIcons name="layers" size={18} color={COLORS.primary} />
              <View style={styles.pickerTextWrap}>
                <Text style={styles.pickerLabel}>
                  {SRT_BATCH_SIZE_OPTIONS.find(o => o.value === batchSize)?.label ?? `${batchSize} lines`}
                </Text>
                <Text style={styles.pickerSub} numberOfLines={1}>
                  {SRT_BATCH_SIZE_OPTIONS.find(o => o.value === batchSize)?.description ?? ''}
                </Text>
              </View>
            </View>
            <MaterialIcons name="expand-more" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Process / Cancel button */}
        <View style={styles.section}>
          {!processing ? (
            <TouchableOpacity
              style={[styles.processBtn, !canProcess && styles.processBtnDisabled]}
              onPress={processSubtitle}
              disabled={!canProcess}
            >
              <MaterialIcons name="translate" size={20} color="#fff" />
              <Text style={styles.processBtnText}>Add Bengali Translations</Text>
            </TouchableOpacity>
          ) : (
            <View>
              {statusMsg ? (
                <Text style={styles.statusMsg}>{statusMsg}</Text>
              ) : null}
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelProcessing}>
                <ActivityIndicator size="small" color={COLORS.error} style={{ marginRight: 8 }} />
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Processing log */}
        {log.length > 0 && (
          <View style={styles.logContainer}>
            <View style={styles.logHeader}>
              <MaterialIcons name="terminal" size={14} color={COLORS.textSecondary} />
              <Text style={styles.logTitle}>Log</Text>
            </View>
            <ScrollView
              ref={logScrollRef}
              style={styles.logScroll}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.logText}>{log}</Text>
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* Model picker modal */}
      <Modal
        visible={modelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModelModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModelModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <TouchableOpacity activeOpacity={1}>
              <Text style={styles.modalTitle}>Select Model</Text>
              {SRT_MODELS.map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.modalOption, m.id === model.id && styles.modalOptionSelected]}
                  onPress={() => handleSelectModel(m)}
                >
                  <View style={styles.modalOptionContent}>
                    <Text style={[styles.modalOptionLabel, m.id === model.id && { color: COLORS.primary }]}>
                      {m.label}
                    </Text>
                    <Text style={styles.modalOptionInfo}>{m.info}</Text>
                  </View>
                  {m.id === model.id && (
                    <MaterialIcons name="check" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Batch size picker modal */}
      <Modal
        visible={batchSizeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBatchSizeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBatchSizeModalVisible(false)}
        >
          <View style={styles.modalSheet}>
            <TouchableOpacity activeOpacity={1}>
              <Text style={styles.modalTitle}>Select Batch Size</Text>
              {SRT_BATCH_SIZE_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.modalOption, opt.value === batchSize && styles.modalOptionSelected]}
                  onPress={() => handleSelectBatchSize(opt)}
                >
                  <View style={styles.modalOptionContent}>
                    <Text style={[styles.modalOptionLabel, opt.value === batchSize && { color: COLORS.primary }]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.modalOptionInfo}>{opt.description}</Text>
                  </View>
                  {opt.value === batchSize && (
                    <MaterialIcons name="check" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Wrapper>
  );
}

// ── Small inline component ──────────────────────────────────────────────────
function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <View style={stepStyles.row}>
      <View style={stepStyles.badge}>
        <Text style={stepStyles.badgeText}>{step}</Text>
      </View>
      <Text style={stepStyles.title}>{title}</Text>
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
});

// ── Main styles ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 16 : 12,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: COLORS.card,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: COLORS.primary,
    marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.text,
    letterSpacing: 0.5,
  },

  scrollView: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff8ec',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.warning,
    padding: 14,
    marginBottom: 4,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },

  // Section
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Picker row (model + batch size)
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pickerTextWrap: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pickerSub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // File picker
  filePicker: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '55',
    borderStyle: 'dashed',
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
  },
  filePickerText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  filePickerFormats: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
  },
  disabled: {
    opacity: 0.4,
  },
  fileInfo: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  fileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fileInfoArrow: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textDim,
    width: 16,
  },
  fileInfoName: {
    fontSize: 12,
    flex: 1,
    color: COLORS.primary,
  },

  // Process button
  processBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 16,
    ...Platform.select({
      android: { elevation: 4 },
      web: { boxShadow: '0 4px 20px rgba(61,127,255,0.35)' as any },
    }),
  },
  processBtnDisabled: {
    opacity: 0.4,
  },
  processBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: COLORS.error,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.error,
  },
  statusMsg: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 10,
  },

  // Log
  logContainer: {
    backgroundColor: '#0f1117',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2d3a',
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2d3a',
  },
  logTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: '#6b7394',
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  logScroll: {
    maxHeight: 280,
  },
  logText: {
    fontSize: 12,
    color: '#a8d8a8',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '12',
  },
  modalOptionContent: {
    flex: 1,
  },
  modalOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  modalOptionInfo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
});
