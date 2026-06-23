const HANDLED_EVENTS = new Set([
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
]);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, data } = req.body ?? {};

  // Acknowledge but ignore event types we don't track
  if (!type || !HANDLED_EVENTS.has(type)) {
    return res.status(200).json({ ignored: true });
  }

  const messageId = data?.email_id;
  const recipient = Array.isArray(data?.to) ? data.to[0] : data?.to;

  if (!messageId || !recipient) {
    return res.status(400).json({ error: 'Missing email_id or to in payload.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // Prefer note_id from Resend tags (fastest path); fall back to DB lookup
  let noteId = data?.tags?.note_id ?? null;

  if (!noteId) {
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}&select=note_id&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const rows = await lookup.json();
    noteId = rows?.[0]?.note_id ?? null;
  }

  const eventType = type.replace('email.', ''); // 'delivered', 'opened', etc.

  const insert = await fetch(`${supabaseUrl}/rest/v1/email_events`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      message_id: messageId,
      note_id: noteId,
      recipient,
      event_type: eventType,
    }),
  });

  if (!insert.ok) {
    const detail = await insert.text();
    return res.status(500).json({ error: 'Failed to record event.', detail });
  }

  return res.status(200).json({ ok: true, event: eventType });
};
