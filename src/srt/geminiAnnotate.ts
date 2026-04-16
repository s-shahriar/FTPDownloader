import { RateLimitError, CountMismatchError, AnnotateResult } from './types';

/**
 * Annotates a batch of subtitle texts with Bengali translations using Gemini API.
 * Only the .text strings are sent — index and timing never leave the device.
 */
export async function annotateBatch(
  apiKey: string,
  modelId: string,
  texts: string[]
): Promise<AnnotateResult> {
  const n = texts.length;
  const inputJson = JSON.stringify(texts);

  const prompt = `You are helping a Bengali speaker learn English through movie subtitles.

TASK: Return the same ${n} subtitle lines with Bengali translations added after uncommon English words.

════════════════════════════════════════
⚠ ABSOLUTE RULES — NEVER BREAK THESE:
════════════════════════════════════════
1. Return EXACTLY ${n} items in the JSON array — one per input line. No more, no fewer.
2. Do NOT split, merge, or reorder subtitle lines.
3. Do NOT add or remove newline characters (\\n) inside any subtitle line.
4. Do NOT change punctuation, spacing, capitalization, or any existing text.
5. Preserve ALL formatting tags exactly as they appear: <i>, </i>, <b>, </b>, {\\i1}, {\\i0}, etc.
6. If a line has no uncommon words → return it COMPLETELY UNCHANGED.

════════════════════════════════════════
ANNOTATION RULES:
════════════════════════════════════════
- Format: word (বাংলা অর্থ)  — placed immediately after the English word
- Only annotate B2–C1 level vocabulary: words a Bengali adult with 2–3 years of English would NOT know
- SKIP common everyday words — including but not limited to: is, was, the, have, go, come, get, make, said, good, bad, want, know, like, see, look, feel, tell, need, just, very, also, then, when, that, this, with, from, they, what, who, beautiful, truth, guest, believe, appear, serious, possible, ordinary, youth, identify, report, searching, yet, seems, kindly, reality, simple, bigger, challenging, total, correct, perfect, special, normal, allow, agree, admit, accept, avoid, begin, call, carry, catch, cause, choose, consider, continue, create, decide, depend, describe, discover, dream, enjoy, exist, expect, explain, fail, fall, follow, forget, happen, help, hope, imagine, include, involve, keep, lead, learn, leave, let, lose, love, manage, miss, move, offer, open, pay, play, prepare, prevent, produce, prove, provide, reach, realize, receive, remain, remember, remove, require, result, return, run, seem, send, set, show, sit, spend, stand, start, stay, stop, support, suppose, suggest, turn, understand, use, wait, win, wish, work, write, honestly, usually, typically, however, clearly, finally, basically, definitely, absolutely, literally, probably, technically, obviously, apparently, certainly, eventually, seriously, extremely, entirely, suddenly, properly, recently, attractive, romantic, miserable, lonely, dramatic, comfortable, uncomfortable, confusing, aggressive, mysterious, strict, decent, selfish, brave, proud, jealous, handsome, intense, weird, strange, disgusting, embarrassed, annoyed, focused, complicated, practical, impossible, incredible, depressing, violent, shocking, grateful, desperate, angry, guilty, nervous, obvious, familiar, independent, convinced, arrived, departing, ignore, pretend, recommend, complain, protect, deserve, appreciate, guarantee, mention, discuss, compare, propose, compete, remind, assume, announce, engage, burst, trick, spoil, approve, permission, decision, situation, generation, collection, responsibility, improvement, possibility, obligation, circumstance, distraction, competition, experiment, surgery, funeral, apartment, basement, closet, garage, angel, captain, celebrity, client, soul, event, gender, biology, favor, prize, secret, accent, context, trauma, cancer, vacation, paradise, nightmare, policy, bonds, toast, proposal, etc.
- ONLY annotate words like: perpetrator, clasp, nuance, flaunting, hesitation, rarity, coax, smudge, ploy, endured, obstinate, treacherous, mangled, desperation, compensation, deteriorate, surveillance, concealed, retaliate, extortion, etc.
- Use sentence context for the correct Bengali meaning — "bank" near "river" = নদীর তীর, not ব্যাংক
- Keep Bengali translation short: 1–3 Bengali words max
- Annotate each word only on its first occurrence per line
- PHRASAL VERBS (rule out, give up, hold on, look into, etc.): place the annotation AFTER the COMPLETE phrasal verb, never in the middle. Example — WRONG: "rule out (বাদ দেওয়া) it out" / CORRECT: "rule it out (বাদ দেওয়া)" — or skip the phrasal verb entirely if unsure.

EXAMPLE:
Input:  ["She was obstinate about leaving.", "Hello, how are you?", "The river bank was steep and treacherous."]
Output: ["She was obstinate (একগুঁয়ে) about leaving.", "Hello, how are you?", "The river bank (নদীর তীর) was steep and treacherous (বিপজ্জনক)."]

INPUT (${n} subtitle lines as JSON array):
${inputJson}

Respond with ONLY the JSON array. No explanation. No markdown code fences.`;

  const t0 = Date.now();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  const data = await response.json();
  const apiTimeMs = Date.now() - t0;

  const usage = data?.usageMetadata ?? {};
  const promptTokens: number = usage.promptTokenCount ?? 0;
  const responseTokens: number = usage.candidatesTokenCount ?? 0;
  const totalTokens: number = usage.totalTokenCount ?? 0;
  const cachedTokens: number = usage.cachedContentTokenCount ?? 0;

  if (data.error) {
    if (data.error.code === 429) {
      let retryAfterMs = 30_000;
      const retryInfo = (data.error.details ?? []).find(
        (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
      );
      if (retryInfo?.retryDelay) {
        const secs = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
        if (!isNaN(secs)) retryAfterMs = Math.ceil(secs * 1000) + 2_000;
      }
      throw new RateLimitError(data.error.message ?? 'Rate limited', retryAfterMs);
    }
    throw new Error(data.error.message ?? 'Gemini API error');
  }

  const responseText: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';

  const match = responseText.match(/\[[\s\S]*\]/);
  if (!match) return { texts, apiTimeMs, promptTokens, responseTokens, totalTokens, cachedTokens };

  const result: string[] = JSON.parse(match[0]);

  if (result.length !== n) throw new CountMismatchError(n, result.length);

  return { texts: result, apiTimeMs, promptTokens, responseTokens, totalTokens, cachedTokens };
}
