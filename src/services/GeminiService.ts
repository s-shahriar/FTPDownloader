import { CATEGORIES } from '../constants';
import { Category } from '../types';

// ── Model IDs ──────────────────────────────────────────────────────────────
export const GEMINI_MODELS = {
  FLASH:      'gemini-2.5-flash',                  // default – best quality + grounding
  FLASH_LITE: 'gemini-3.1-flash-lite-preview',     // lighter alternative
} as const;

export type GeminiModel = typeof GEMINI_MODELS[keyof typeof GEMINI_MODELS];

export const GEMINI_MODEL_LABELS: Record<GeminiModel, string> = {
  'gemini-2.5-flash':              'Flash 2.5',
  'gemini-3.1-flash-lite-preview': 'Flash Lite 3.1',
};

const GEMINI_API_KEY = 'AIzaSyBcjOlwNAHiiRZ3TNLqV3ds0usWhMJlKTA';
const GEMINI_BASE    = 'https://generativelanguage.googleapis.com/v1beta/models';

// ── Result type ────────────────────────────────────────────────────────────
export type MediaIndustry =
  | 'Hollywood'
  | 'Bollywood'
  | 'South Indian'
  | 'Korean'
  | 'Japanese'
  | 'Chinese'
  | 'Anime'
  | 'Animation'
  | 'Other';

export type MediaType = 'movie' | 'tv_series';

export interface GeminiMatch {
  title:    string;
  year:     string | null;   // null for ongoing series
  industry: MediaIndustry;
  type:     MediaType;
  language: string;
  category: Category | null; // mapped from industry + type
}

// ── Category mapping – mirrors FTPDownloader's route structure ─────────────
//
//  movie_merged   (needsYear=true):  ENGLISH_MOVIES, SOUTH_INDIAN_MOVIES, ANIMATION_MOVIES
//  movie_with_year(needsYear=true):  HINDI_MOVIES
//  movie_flat     (needsYear=false): KOREAN_MOVIES, JAPANESE_MOVIES, CHINESE_MOVIES
//  tv_series      (needsYear=false): TV_WEB_SERIES
//  korean_tv_series(needsYear=false):KOREAN_TV_SERIES
//  anime_series   (needsYear=false): ANIME_CARTOON
//  movie_foreign  (needsYear=false): FOREIGN_MOVIES

function mapToCategory(industry: MediaIndustry, type: MediaType): Category | null {
  if (type === 'tv_series') {
    if (industry === 'Korean')  return CATEGORIES.KOREAN_TV_SERIES;
    if (industry === 'Anime')   return CATEGORIES.ANIME_CARTOON;
    return CATEGORIES.TV_WEB_SERIES;
  }

  switch (industry) {
    case 'Hollywood':    return CATEGORIES.ENGLISH_MOVIES;
    case 'Bollywood':    return CATEGORIES.HINDI_MOVIES;
    case 'South Indian': return CATEGORIES.SOUTH_INDIAN_MOVIES;
    case 'Korean':       return CATEGORIES.KOREAN_MOVIES;
    case 'Japanese':     return CATEGORIES.JAPANESE_MOVIES;
    case 'Chinese':      return CATEGORIES.CHINESE_MOVIES;
    case 'Anime':        return CATEGORIES.ANIME_CARTOON;
    case 'Animation':    return CATEGORIES.ANIMATION_MOVIES;
    case 'Other':        return CATEGORIES.FOREIGN_MOVIES;
    default:             return null;
  }
}

// ── Gemini API call ────────────────────────────────────────────────────────
export async function identifyMedia(
  query: string,
  model: GeminiModel,
): Promise<GeminiMatch[]> {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const prompt = `Search query: "${query}"

1. Extract the film/series title — strip any language or industry context words (e.g. "south indian", "hindi", "telugu", "korean", "dubbed").
2. Use Google Search to find ALL matching movies/series including 2024–2026 releases. If an industry hint was present, list those results first.
3. Return a JSON array only. Each item:
{ "title": string, "year": string|null, "industry": "Hollywood"|"Bollywood"|"South Indian"|"Korean"|"Japanese"|"Chinese"|"Anime"|"Animation"|"Other", "type": "movie"|"tv_series", "language": string }

South Indian = Tamil/Telugu/Malayalam/Kannada. Bollywood = Hindi Indian films. Anime = Japanese animation.
No markdown. No explanation. JSON array only.`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],   // ground with live Google Search
      generationConfig: {
        temperature: 0.1,
        // NOTE: responseMimeType cannot be used with google_search grounding
      },
    }),
  });

  if (!res.ok) {
    let msg = `Gemini API error ${res.status}`;
    try {
      const err = await res.json();
      msg = err?.error?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  let text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  if (!text) throw new Error('Empty response from Gemini');

  // Strip markdown code fences if present
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) text = jsonMatch[0];

  const raw: any[] = JSON.parse(text);
  return raw
    .filter(m => m.title && m.industry && m.type)
    .map(m => ({
      title:    String(m.title),
      year:     m.year ? String(m.year) : null,
      industry: m.industry as MediaIndustry,
      type:     m.type as MediaType,
      language: String(m.language ?? ''),
      category: mapToCategory(m.industry, m.type),
    }))
    .sort((a, b) => {
      // Sort by year descending (newest first), nulls last
      if (!a.year && !b.year) return 0;
      if (!a.year) return 1;
      if (!b.year) return -1;
      return parseInt(b.year) - parseInt(a.year);
    });
}
