// Gemini APIクライアント共通部（バックオフ・responseSchema強制 §5-3）
// キーは環境変数のみ。コード・ログに値を出さない。
import 'dotenv/config';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// モデル名は公式の最新エイリアスを既定にし、環境変数で差し替え可能にする
export const MODEL_TRIAGE = process.env.GEMINI_MODEL_TRIAGE || 'gemini-flash-lite-latest';
export const MODEL_SUMMARIZE = process.env.GEMINI_MODEL_SUMMARIZE || 'gemini-flash-latest';

export function hasApiKey() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 構造化出力でGeminiを呼ぶ。429は指数バックオフ（60s→120s→240s、最大3回）。
 * @returns {Promise<any>} パース済みJSON
 */
export async function geminiJSON({ model, prompt, schema, maxOutputTokens = 8192 }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: schema,
      maxOutputTokens,
      temperature: 0.2,
    },
  };

  const backoffs = [60_000, 120_000, 240_000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    });

    // 429(レート制限)＋5xx(503等のモデル過負荷/一時障害)はバックオフして再試行
    if ((res.status === 429 || res.status >= 500) && attempt < backoffs.length) {
      console.warn(`[gemini] HTTP ${res.status}, backoff ${backoffs[attempt] / 1000}s (attempt ${attempt + 1})`);
      await sleep(backoffs[attempt]);
      continue;
    }
    if (!res.ok) {
      throw new Error(`[gemini] HTTP ${res.status} from ${model}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('[gemini] empty response');
    return JSON.parse(text); // 壊れていれば throw → 呼び出し側が1回リトライ（§5-2）
  }
}

/** JSONパース失敗時に1回だけリトライするラッパー（§5-2） */
export async function geminiJSONWithRetry(args) {
  try {
    return await geminiJSON(args);
  } catch (e) {
    console.warn(`[gemini] first attempt failed (${e.message}), retrying once`);
    return await geminiJSON(args);
  }
}
