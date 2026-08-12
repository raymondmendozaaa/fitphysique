import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createAuthClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );
}

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

export async function POST() {
  try {
    const authClient = await createAuthClient();

    const {
      data: { user: authUser },
      error: authError,
    } = await authClient.auth.getUser();

    if (authError || !authUser) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized." },
        { status: 401 }
      );
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("id, email, full_name")
      .eq("id", authUser.id)
      .maybeSingle();

    if (userError) {
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

    let resetUrl = rawLink;

    try {
      const url = new URL(rawLink);
      url.searchParams.set("redirect_to", redirectTo);
      resetUrl = url.toString();
    } catch (e) {
      console.warn(
        "[send-password-reset] Failed to rewrite redirect_to, using raw URL",
        e
      );
    }

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

    const toEmail =
      process.env.NODE_ENV === "development" ? DEV_TEST_RECIPIENT : user.email;

    const { data, error: resendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });

    if (resendError) {
      console.error("[send-password-reset] Resend send error:", resendError);

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