/* 인식 엔진 프록시
 *
 * 브라우저에서 바로 부르면 CORS로 막히는 API를 대신 호출해 줍니다.
 * 키는 요청 본문으로 받아 그대로 전달만 하며, 서버에 저장하지 않습니다.
 * 본문에 키가 없으면 환경변수(GROQ_API_KEY / OCRSPACE_API_KEY / GEMINI_API_KEY)를 씁니다.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

const json = (o, s) => new Response(JSON.stringify(o), {
  status: s || 200,
  headers: { 'content-type': 'application/json; charset=utf-8', ...CORS }
});

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let b;
  try { b = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  const provider = String(b.provider || '');
  const key = (b.key || '').trim() || envKey(provider);
  if (!key) return json({ error: 'no_key' }, 501);

  try {
    if (provider === 'groq')     return await groq(key, b);
    if (provider === 'ocrspace') return await ocrspace(key, b);
    if (provider === 'gemini')   return await gemini(key, b);
    return json({ error: 'unknown_provider' }, 400);
  } catch (e) {
    return json({ error: 'upstream_failed', detail: String(e && e.message || e) }, 502);
  }
};

function envKey(p) {
  if (p === 'groq') return process.env.GROQ_API_KEY || '';
  if (p === 'ocrspace') return process.env.OCRSPACE_API_KEY || '';
  if (p === 'gemini') return process.env.GEMINI_API_KEY || '';
  return '';
}

async function groq(key, b) {
  if (b.ping) {
    const r = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { authorization: 'Bearer ' + key }
    });
    const d = await r.json().catch(() => null);
    return json({ status: r.status, ok: r.ok, data: d }, r.ok ? 200 : 502);
  }
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    body: JSON.stringify(b.payload)
  });
  const d = await r.json().catch(() => null);
  return json({ status: r.status, ok: r.ok, data: d }, r.ok ? 200 : 502);
}

async function ocrspace(key, b) {
  const form = new URLSearchParams();
  form.set('apikey', key);
  form.set('base64Image', b.image || '');
  form.set('language', b.language || 'kor');
  form.set('OCREngine', String(b.engine || 1));
  form.set('isOverlayRequired', 'false');
  form.set('scale', 'true');
  form.set('detectOrientation', 'true');
  const r = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString()
  });
  const d = await r.json().catch(() => null);
  return json({ status: r.status, ok: r.ok, data: d }, r.ok ? 200 : 502);
}

async function gemini(key, b) {
  const model = b.model || 'gemini-3.5-flash';
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(b.payload)
    }
  );
  const d = await r.json().catch(() => null);
  return json({ status: r.status, ok: r.ok, data: d }, r.ok ? 200 : 502);
}
