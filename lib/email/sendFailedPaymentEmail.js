import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendFailedPaymentEmail({ to, fullName, portalUrl }) {
  try {
    const appUrl =
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";

    const safeName = fullName || "Member";
    const billingLink = portalUrl || `${appUrl}/account/billing`;

    const { data, error } = await resend.emails.send({
      from: "Gym Notifications <notify@yourgym.com>",
      to,
      subject: "⚠️ Payment Failed - Update Your Billing Info",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Hi ${safeName},</h2>
          <p>We couldn’t process your latest membership payment.</p>
          <p>Please update your billing information to avoid an interruption.</p>

          <p style="margin: 20px 0;">
            <a href="${billingLink}"
               style="display:inline-block;padding:12px 16px;border-radius:10px;
                      text-decoration:none;background:#f59e0b;color:#111;font-weight:700;">
              Update Billing Info
            </a>
          </p>

          <p>If that button doesn't work, copy and paste this link:</p>
          <p><a href="${billingLink}">${billingLink}</a></p>
        </div>
      `,
    });

    if (error) console.error("❌ Failed to send failed payment email:", error.message);
    else console.log(`📧 Failed payment email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email send error:", err);
  }
}