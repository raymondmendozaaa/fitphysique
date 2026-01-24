// lib/mailer.js
// Uses Resend (super simple). Swap with SendGrid/Postmark etc if you prefer.
export async function sendEmail({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY; // set this in your env
  if (!apiKey) throw new Error('RESEND_API_KEY not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'no-reply@example.com',
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend failed: ${text}`);
  }
  return res.json();
}