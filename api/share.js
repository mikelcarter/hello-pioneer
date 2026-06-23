module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to, title, content } = req.body ?? {};

  if (!to || typeof to !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'A valid recipient email address is required.' });
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'Note title is required.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Email service is not configured.' });
  }

  const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'https://hello-pioneer-delta.vercel.app';

  const esc = s => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const bodyHtml = content && content.trim()
    ? `<p style="margin:0 0 28px;color:#333;font-size:15px;line-height:1.65;white-space:pre-wrap;">${esc(content)}</p>`
    : `<p style="margin:0 0 28px;color:#aaa;font-style:italic;font-size:15px;">(No body)</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0"
        style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <tr>
          <td style="background:#0F2747;padding:28px 32px;">
            <p style="margin:0;color:#C9A227;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
              Pioneer Notes
            </p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;font-weight:600;line-height:1.3;">
              A note was shared with you
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:32px;">
            <h2 style="margin:0 0 14px;color:#0F2747;font-size:19px;font-weight:600;">${esc(title)}</h2>
            ${bodyHtml}
            <a href="${siteUrl}"
              style="display:inline-block;background:#C9A227;color:#0F2747;text-decoration:none;
                     padding:13px 26px;border-radius:6px;font-size:14px;font-weight:700;">
              View all notes &rarr;
            </a>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #e8e8e8;">
            <p style="margin:0;color:#bbb;font-size:11px;">
              Shared via <a href="${siteUrl}" style="color:#0F2747;text-decoration:none;">Pioneer Notes</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Pioneer Notes <onboarding@resend.dev>',
      to: [to],
      subject: `Shared note: ${title}`,
      html,
    }),
  });

  const result = await r.json();

  if (!r.ok) {
    return res.status(r.status).json({ error: result.message ?? 'Failed to send email.' });
  }

  return res.status(200).json({ success: true, id: result.id });
};
