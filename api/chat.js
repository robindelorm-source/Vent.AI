export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, messages } = req.body;

  const debugInfo = {
    systemLength: system?.length || 0,
    systemPreview: system?.slice(0, 80) || 'EMPTY',
    messageCount: messages?.length || 0,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY
  };

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request', debug: debugInfo });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: system || 'You are a helpful assistant.',
        messages: messages.filter(m => m.content && m.content.trim() !== '')
      })
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text || null;

    return res.status(200).json({ text, debug: { ...debugInfo, anthropicError: data?.error || null } });

  } catch (error) {
    return res.status(500).json({ error: error.message, debug: debugInfo });
  }
}
