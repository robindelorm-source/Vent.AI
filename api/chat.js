import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const FREE_LIMIT = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { system, messages, sessionToken } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  // ── USER AUTH & LIMIT CHECK ──────────────────────────────
  let userId = null;
  let isPaid = false;
  let remainingMessages = FREE_LIMIT;

  if (sessionToken) {
    try {
      const session = await clerk.sessions.verifySession(sessionToken, sessionToken);
      userId = session.userId;

      const user = await clerk.users.getUser(userId);
      const meta = user.privateMetadata || {};
      const today = new Date().toISOString().slice(0, 10);

      isPaid = meta.isPaid === true;

      if (!isPaid) {
        const usageDate = meta.usageDate;
        const usageCount = usageDate === today ? (meta.usageCount || 0) : 0;
        remainingMessages = Math.max(0, FREE_LIMIT - usageCount);

        if (remainingMessages === 0) {
          return res.status(200).json({ error: 'limit_reached', remaining: 0 });
        }

        await clerk.users.updateUser(userId, {
          privateMetadata: {
            ...meta,
            usageCount: usageCount + 1,
            usageDate: today
          }
        });

        remainingMessages = Math.max(0, FREE_LIMIT - (usageCount + 1));
      }
    } catch (err) {
      console.error('Auth error:', err);
    }
  }

  // ── CALL ANTHROPIC ───────────────────────────────────────
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
        system: system,
        messages: messages
      })
    });

    const data = await response.json();
    const text = data?.content?.[0]?.text || null;

    return res.status(200).json({
      text,
      remaining: isPaid ? 999 : remainingMessages,
      isPaid
    });

  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: 'Something went wrong' });
  }
}
