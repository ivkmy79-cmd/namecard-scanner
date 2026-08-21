/* 명함 인식 프록시 (선택 사항)
 *
 * Netlify 환경변수 GEMINI_API_KEY 를 설정해 두면, 폰마다 키를 넣지 않아도
 * 이 함수가 대신 Gemini를 호출합니다. 설정하지 않으면 앱은 폰에 저장된
 * 개인 키로 직접 호출하므로, 이 파일이 없어도 앱은 정상 동작합니다.
 *
 * 설정: Netlify → Project configuration → Environment variables
 *       Key: GEMINI_API_KEY   Value: AIza... (aistudio.google.com/apikey 에서 발급)
 */

const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/';

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return json({ error: 'no_server_key' }, 501);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'bad_json' }, 400);
  }

  const image = body && body.image;
  if (!image || typeof image !== 'string') return json({ error: 'no_image' }, 400);
  if (image.length > 8_000_000) return json({ error: 'image_too_large' }, 413);

  const mime = (body.mime === 'image/png') ? 'image/png' : 'image/jpeg';
  const payload = {
    contents: [{
      parts: [
        { text: body.prompt || '' },
        { inline_data: { mime_type: mime, data: image } }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      ...(body.schema ? { responseSchema: body.schema } : {})
    }
  };

  let lastErr = 'unknown';
  const models = Array.isArray(body.models) && body.models.length ? body.models : MODELS;

  for (const model of models) {
    try {
      const r = await fetch(ENDPOINT + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload)
      });
      const data = await r.json().catch(() => null);
      if (r.ok && data) return json({ model, data }, 200);

      lastErr = (data && data.error && data.error.message) || ('HTTP ' + r.status);
      /* 모델이 없거나(404) 한도 초과(429)면 다음 모델로 */
      if (r.status !== 404 && r.status !== 429 && r.status !== 400) break;
    } catch (e) {
      lastErr = String(e && e.message || e);
    }
  }
  return json({ error: 'gemini_failed', detail: lastErr }, 502);
};

function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type'
  };
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cors() }
  });
}
