export interface SubBlock {
  index: string;
  timing: string;
  text: string;
  // ASS only
  rawPrefix?: string;
  origText?: string;
}

export interface SRTGeminiModel {
  id: string;
  label: string;
  info: string;
  rpm: number;
}

export type SubFormat = 'srt' | 'ass' | 'vtt';

export interface SRTSelectedFile {
  name: string;
  uri: string;
}

export class RateLimitError extends Error {
  retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.retryAfterMs = retryAfterMs;
    this.name = 'RateLimitError';
  }
}

export class CountMismatchError extends Error {
  expected: number;
  received: number;

  constructor(expected: number, received: number) {
    super(`Count mismatch: expected ${expected}, got ${received}`);
    this.expected = expected;
    this.received = received;
    this.name = 'CountMismatchError';
  }
}

export interface AnnotateResult {
  texts: string[];
  apiTimeMs: number;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  cachedTokens: number;
}

export interface BatchStats {
  batchIndex: number;
  lineCount: number;
  apiTimeMs: number;
  rateDelayMs: number;
  rateLimitWaitMs: number;
  retryCount: number;
  linesChanged: number;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  cachedTokens: number;
  success: boolean;
}

export interface BatchSizeOption {
  value: number;
  label: string;
  description: string;
}
