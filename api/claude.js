// Serverless function (Vercel-style). Keeps your Anthropic API key on the
// server — the game's frontend never sees it.
//
// Deploy target: Vercel (zero config — files under /api become endpoints).
// For Netlify, move this file to netlify/functions/claude.js and adapt the
// handler signature (see README.md).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ code: 'server_error', error: 'Missing ANTHROPIC_API_KEY environment variable on the server.' });
    return;
  }

  const { turns } = req.body || {};
  if (!Array.isArray(turns) || turns.length === 0) {
    res.status(400).json({ code: 'server_error', error: 'Missing "turns" in request body.' });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // Check https://docs.claude.com for the latest recommended model id
        // if this one is ever retired.
        model: 'claude-sonnet-5',
        max_tokens: 2000,
        messages: turns.map(t => ({ role: t.role, content: t.content })),
      }),
    });

    const upstreamData = await upstream.json();

    if (!upstream.ok) {
      const code = upstream.status === 429 ? 'rate_limited' : 'server_error';
      res.status(upstream.status).json({ code, error: upstreamData?.error?.message || 'Anthropic API error' });
      return;
    }

    const text = (upstreamData.content || [])
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('');

    const cleaned = text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      res.status(502).json({ code: 'invalid_json', error: 'Model did not return valid JSON.' });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(500).json({ code: 'server_error', error: err.message || 'Unexpected server error.' });
  }
}
