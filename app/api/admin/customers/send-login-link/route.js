import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { fetchUserById, updateUserById } from "@/lib/db/users";

const resend = new Resend(process.env.RESEND_API_KEY);

// Admin Supabase client (SERVICE ROLE) – do NOT expose this to the browser
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getBaseUrl() {
  // Falls back from APP_URL → BASE_URL → localhost
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.APP_BASE_URL ||
    "http://localhost:3000"
  );
}

// From address used for Resend
const FROM_EMAIL =
  process.env.RESEND_FROM_DEV || "Fit Physique <onboarding@resend.dev>";

// In dev, Resend sandbox will ONLY send to your own email.
const DEV_TEST_RECIPIENT =
  process.env.RESEND_DEV_TEST_EMAIL || "raymondoza28@gmail.com";

export async function POST(req) {
  try {
    const { user_id, mode } = await req.json();

    if (!user_id) {
      return NextResponse.json(
        { ok: false, error: "Missing user_id." },
        { status: 400 }
      );
    }

    // mode: "login" (prefilled normal login) | "magic" (Supabase magic link)
    const normalizedMode = mode === "magic" ? "magic" : "login";

    // 1️⃣ Fetch user from DB
    const user = await fetchUserById(
      supabaseAdmin,
      user_id,
      "id, email, full_name"
    );

    if (!user) {
      console.error("User lookup failed:", userError);
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
    console.log("[send-login-link] baseUrl:", baseUrl, {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      APP_BASE_URL: process.env.APP_BASE_URL,
    });

    // 2️⃣ Build a normal login URL (with email prefilled)
    const loginUrl = `${baseUrl}/auth/login?email=${encodeURIComponent(
      user.email
    )}`;

    let subject;
    let html;

    if (normalizedMode === "login") {
      // Simple login link email
      subject = "Complete your gym account setup";
      html = `
        <p>Hi ${user.full_name || "there"},</p>
        <p>Your gym account is almost ready. Click the link below to log in and finish setting up your profile:</p>
        <p><a href="${loginUrl}">${loginUrl}</a></p>
        <p style="font-size: 12px; color: #666;">If you did not request this, you can ignore this email.</p>
      `;
    } else {
      // 3️⃣ MAGIC LINK
      if (process.env.NODE_ENV === "development") {
        // DEV ONLY:
        // Skip Supabase generateLink entirely and just use a local login URL.
        // This guarantees localhost instead of your Vercel SITE_URL.
        const magicUrlDev = loginUrl;
        console.log("[send-login-link] DEV magic link →", magicUrlDev);

        subject = "One-click login to your gym account (dev)";
        html = `
          <p>Hi ${user.full_name || "there"},</p>
          <p>Click the button below to log in to your gym account instantly (no password required in dev):</p>
          <p><a href="${magicUrlDev}">Log in to my account</a></p>
          <p style="font-size: 12px; color: #666;">
            This link is for development/testing only.
          </p>
        `;
      } else {
        // PRODUCTION:
        // Use the real Supabase magic link and let SITE_URL / redirectTo point to Vercel.
        const { data: linkData, error: linkError } =
          await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: user.email,
            options: {
              redirectTo: `${baseUrl}/member`,
            },
          });

        if (linkError) {
          console.error("generateLink error:", linkError);
          return NextResponse.json(
            { ok: false, error: "Failed to generate magic link." },
            { status: 500 }
          );
        }

        const rawMagicUrl =
          linkData?.properties?.action_link || linkData?.action_link;

        if (!rawMagicUrl) {
          return NextResponse.json(
            { ok: false, error: "Magic link was not returned." },
            { status: 500 }
          );
        }

        console.log("[send-login-link] PROD magicUrl:", rawMagicUrl);

        subject = "One-click login to your gym account";
        html = `
          <p>Hi ${user.full_name || "there"},</p>
          <p>Click the button below to log in to your gym account instantly (no password required):</p>
          <p><a href="${rawMagicUrl}">Log in to my account</a></p>
          <p style="font-size: 12px; color: #666;">
            This link works once and may expire after a short time. If you did not request this, you can ignore this email.
          </p>
        `;
      }
    }

    // 4️⃣ Decide who the email actually goes to
    const toEmail =
      process.env.NODE_ENV === "development" ? DEV_TEST_RECIPIENT : user.email;

    // 5️⃣ Send email with Resend **and check for errors**
    const { data, error: resendError } = await resend.emails.send({
      from: FROM_EMAIL,
      to: toEmail,
      subject,
      html,
    });

    if (resendError) {
      console.error("Resend send-login-link error:", resendError);

      const message =
        resendError.message || "Failed to send login email with Resend.";

      const isSandboxError = message.includes(
        "You can only send testing emails to your own email address"
      );

      return NextResponse.json(
        { ok: false, error: message },
        { status: isSandboxError ? 400 : 500 }
      );
    }

    console.log("send-login-link: email queued", {
      mode: normalizedMode,
      to: toEmail,
      data,
    });

    return NextResponse.json({
      ok: true,
      mode: normalizedMode,
      dev_rerouted: process.env.NODE_ENV === "development",
    });
  } catch (e) {
    console.error("send-login-link error:", e);
    return NextResponse.json(
      { ok: false, error: e.message || "Failed to send login email." },
      { status: 500 }
    );
  }
}