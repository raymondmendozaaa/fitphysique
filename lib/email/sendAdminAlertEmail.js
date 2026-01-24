// lib/email/sendAdminAlertEmail.js
import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;
const alertTo = process.env.ALERT_EMAIL_TO; // e.g., owner or you
const alertFrom = process.env.ALERT_EMAIL_FROM || 'alerts@your-domain.com';

let resend = null;
if (resendApiKey) {
  resend = new Resend(resendApiKey);
}

export async function sendAdminAlertEmail({ subject, text }) {
  if (!resend || !alertTo) return; // silently skip if not configured
  try {
    await resend.emails.send({
      from: alertFrom,
      to: [alertTo],
      subject,
      text,
    });
  } catch (e) {
    // Don't throw—alerts should never break the main flow
    console.error('sendAdminAlertEmail failed:', e?.message || e);
  }
}