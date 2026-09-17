import { SRTGeminiModel, BatchSizeOption } from './types';

export const SRT_BATCH_SIZE = 200;
export const SRT_BATCH_SIZE_STORAGE_KEY = 'srt_batch_size';
export const SRT_MODEL_ID_STORAGE_KEY = 'srt_model_id';

export const SRT_BATCH_SIZE_OPTIONS: BatchSizeOption[] = [
  {
    value: 50,
    label: '50 lines',
    description: 'Safest — fewest failures, but many API calls and longer total time',
  },
  {
    value: 100,
    label: '100 lines',
    description: 'Balanced — moderate API calls, low failure risk',
  },
  {
    value: 150,
    label: '150 lines',
    description: 'Faster — fewer API calls, slightly higher mismatch chance',
  },
  {
    value: 200,
    label: '200 lines',
    description: 'Fastest — fewest API calls, but higher mismatch risk on large files',
  },
];

// Benchmarked 2026-09-17 on a free-tier key: 100-line batch, 49 hard words.
// Pro models have no free-tier quota, so they are not offered.
// The first entry is the default.
export const SRT_MODELS: SRTGeminiModel[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    info: 'Recommended — reliable, good quality (~17s per 100 lines)',
    rpm: 10,
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    info: 'Best quality, most natural Bangla (~25s per 100 lines) · sometimes busy, retries automatically',
    rpm: 10,
  },
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash Lite',
    info: 'Fastest (~4s per 100 lines) · skips a few hard words',
    rpm: 15,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    info: 'Accurate but slowest (~30s per 100 lines)',
    rpm: 10,
  },
];
