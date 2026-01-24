import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendFailedPaymentEmail({ to, fullName }) {
  try {
    const { data, error } = await resend.emails.send({
      from: 'Gym Notifications <notify@yourgym.com>',
      to,
      subject: '⚠️ Payment Failed – Update Your Info',
      html: `
        <h2>Hi ${fullName},</h2>
        <p>We couldn’t process your latest payment. Please log in to your account and update your billing info.</p>
        <p>Without action, your membership may be interrupted.</p>
        <a href="https://localhost:3000/account">Update Billing Info</a>
      `
    });

    if (error) console.error('❌ Failed to send failed payment email:', error.message);
    else console.log(`📧 Failed payment email sent to ${to}`);
  } catch (err) {
    console.error('❌ Email send error:', err);
  }
}