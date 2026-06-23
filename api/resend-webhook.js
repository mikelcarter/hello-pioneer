const crypto = require('crypto');

const HANDLED_EVENTS = new Set([
  'email.delivered',
  'email.opened',
  'email.clicked',
  'email.bounced',
  'email.complained',
]);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, headers, secret) {
  const id        = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];

  if (!id || !timestamp || !signature) return false;

  // Reject replays older than 5 minutes
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  // Resend secrets are "whsec_<base64>" — strip prefix before decoding
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');

  const computed = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // Svix may send multiple space-separated signatures ("v1,<sig> v1,<sig>")
  return signature.split(' ').some(s => {
    const [ver, val] = s.split(',');
    return ver === 'v1' && val === computed;
  });
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Webhook secret is not configured.' });
  }

  // Must read raw body before any JSON parsing for signature verification
  const rawBody = await getRawBody(req);

  if (!verifySignature(rawBody, req.headers, secret)) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }

  const { type, data } = body;

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
  const dbHeaders = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  // Prefer note_id from Resend tags (avoids a DB round-trip); fall back to lookup
  let noteId = data?.tags?.note_id ?? null;

  if (!noteId) {
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/email_events?message_id=eq.${encodeURIComponent(messageId)}&select=note_id&limit=1`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const rows = await lookup.json();
    noteId = rows?.[0]?.note_id ?? null;
  }

  const eventType = type.replace('email.', '');

  const insert = await fetch(`${supabaseUrl}/rest/v1/email_events`, {
    method: 'POST',
    headers: { ...dbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ message_id: messageId, note_id: noteId, recipient, event_type: eventType }),
  });

  if (!insert.ok) {
    const detail = await insert.text();
    return res.status(500).json({ error: 'Failed to record event.', detail });
  }

  return res.status(200).json({ ok: true, event: eventType });
}

// Disable Vercel's automatic body parser — signature verification needs the raw bytes
handler.config = { api: { bodyParser: false } };

module.exports = handler;
