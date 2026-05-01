const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function extractText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;

  const chunks = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

function extractJson(text) {
  const clean = String(text || '').replace(/```json|```/g, '').trim();
  const start = clean.indexOf('{');
  if (start === -1) throw new Error('Model returned no JSON object.');

  let depth = 0;
  for (let i = start; i < clean.length; i += 1) {
    if (clean[i] === '{') depth += 1;
    if (clean[i] === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }

  throw new Error('Model returned incomplete JSON.');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { system, userMsg } = req.body || {};

    if (!system || !userMsg) {
      return res.status(400).json({ error: 'Missing system or userMsg.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY environment variable.' });
    }

    const openaiResp = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1',
        instructions: systemPrompt + "\nYou must return valid JSON only. No markdown.",
        input: userMsg + "\n\nReturn the result as valid JSON only.
        max_output_tokens: 8000,
        temperature: 0.2,
      }),
    });

    const payload = await openaiResp.json();

    if (!openaiResp.ok) {
      const message = payload?.error?.message || `OpenAI API error ${openaiResp.status}`;
      return res.status(openaiResp.status).json({ error: message });
    }

    const text = extractText(payload);
    const analysis = extractJson(text);

    return res.status(200).json({ analysis });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
}
