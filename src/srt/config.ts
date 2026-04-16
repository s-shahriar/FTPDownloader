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

export const SRT_MODELS: SRTGeminiModel[] = [
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    info: 'Recommended — best quality + speed (10 req/min · 250/day)',
    rpm: 10,
  },
  {
    id: 'gemini-3-flash-preview',
    label: 'Gemini 3 Flash Preview',
    info: 'Preview: good quality but slow (thinking model, ~35s/batch)',
    rpm: 10,
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite Preview',
    info: 'Preview: fast but unreliable (frequent count mismatches)',
    rpm: 15,
  },
  {
    id: 'gemini-3-pro-preview',
    label: 'Gemini 3 Pro Preview',
    info: 'Preview: highest quality but very slow (5 req/min)',
    rpm: 5,
  },
];
