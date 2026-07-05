import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { fetchUserById } from "@/lib/db/users";

const resend = new Resend(process.env.RESEND_API_KEY);

// Admin Supabase client (SERVICE ROLE)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000"
  );
}

const FROM_EMAIL =
  process.env.RESEND_FROM_DEV || "Fit Physique <onboarding@resend.dev>";

const DEV_TEST_RECIPIENT =
  process.env.RESEND_DEV_TEST_EMAIL || "raymondoza28@gmail.com";

export async function POST(req) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id." },
        { status: 400 }
      );
    }

    // 1️⃣ Look up the user in your "users" table
    let user;

    try {
      user = await fetchUserPasswordResetIdentityById(supabaseAdmin, user_id);
    } catch (userError) {
      console.error("[send-password-reset] User lookup failed:", userError);
      return NextResponse.json(
        { ok: false, error: "Failed to load user." },
        { status: 500 }
      );
    }

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "User not found." },
        { status: 404 }
      );
    }

    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "User has no email on file." },
        { status: 400 }
      );
    }

    const baseUrl = getBaseUrl();
    const redirectTo = `${baseUrl}/auth/password-reset`;

    // 2️⃣ Ask Supabase to create a "recovery" link
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email: user.email,
        options: {
          redirectTo,
        },
      });

    if (linkError) {
      console.error("[send-password-reset] generateLink error:", linkError);
      return NextResponse.json(
        { ok: false, error: "Failed to generate password reset link." },
        { status: 500 }
      );
    }

    const rawLink =
      linkData?.properties?.action_link || linkData?.action_link;

    if (!rawLink) {
      console.error("[send-password-reset] No action_link returned:", linkData);
      return NextResponse.json(
        { ok: false, error: "Password reset link was not returned." },
        { status: 500 }
      );
    }

    // 3️⃣ Force redirect_to to match our baseUrl (local or prod)
    let resetUrl = rawLink;
    try {
      const url = new URL(rawLink);
      url.searchParams.set("redirect_to", redirectTo);
      resetUrl = url.toString();
      console.log("[send-password-reset] resetUrl (rewritten):", resetUrl);
    } catch (e) {
      console.warn(
        "[send-password-reset] Failed to rewrite redirect_to, using raw URL",
        e
      );
    }

    // 4️⃣ Build the email body
    const subject = "Reset your Fit Physique password";
    const html = `
      <p>Hi ${user.full_name || "there"},</p>
      <p>We received a request to reset the password for your Fit Physique account.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#facc15;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">
          Reset my password
        </a>
      </p>
      <p style="font-size: 12px; color: #666;">
        If you did not request this, you can safely ignore this email.
      </p>
    `;

    // 5️⃣ Decide who it goes to (Resend dev sandbox)
    const toEmail =
      process.env.NODE_ENV === "development" ? DEV_TEST_RECIPIENT : user.email;

    const { data, error: resendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });

    if (resendError) {
      console.error(
        "[send-password-reset] Resend send error:",
        resendError
      );
      const message =
        resendError.message ||
        "Failed to send password reset email with Resend.";

      const isSandboxError = message.includes(
        "You can only send testing emails to your own email address"
      );

      return NextResponse.json(
        { ok: false, error: message },
        { status: isSandboxError ? 400 : 500 }
      );
    }

    console.log("[send-password-reset] email queued", {
      to: toEmail,
      data,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[send-password-reset] error:", e);
    return NextResponse.json(
      {
        ok: false,
        error: e.message || "Failed to send password reset email.",
      },
      { status: 500 }
    );
  }
}