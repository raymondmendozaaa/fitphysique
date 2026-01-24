// lib/admin/createUserAdmin.js
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Creates an Auth user (admin API), then inserts a matching row into public.users.
 * If a user with the same email already exists in public.users, returns that row.
 * @returns {Promise<{ id: string }>}
 */
export async function createUserAdmin({
  full_name,
  email,
  role = "member",
  sendInvite = false,      // set true if you want to send Supabase invite email
  tempPassword = undefined // if provided, sets initial password
}) {
  if (!full_name || !email) throw new Error("full_name and email are required");

  // 0) If we already have a profile row with this email, reuse it
  const { data: existingProfile, error: existingErr } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingErr) throw new Error(`users lookup failed: ${existingErr.message}`);
  if (existingProfile?.id) {
    return { id: existingProfile.id };
  }

  // 1) Create Auth user (admin API)
  //    - If you want to require email verification, keep email_confirm=false and use invite.
  //    - If you want it immediately confirmed (common for admin-created members), set email_confirm=true.
  const { data: created, error: adminErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,       // if omitted, Supabase will generate one
    email_confirm: !sendInvite,   // confirm immediately unless you plan to invite
    user_metadata: { full_name },
  });
  if (adminErr) {
    // If Auth user already exists, try to attach to existing profile row (by email)
    // Otherwise bubble up the error.
    throw new Error(`auth.admin.createUser failed: ${adminErr.message}`);
  }
  const authUserId = created.user.id;

  // 2) Optionally send the invite email (if you want “set password” flow)
  if (sendInvite) {
    // Ignoring errors here won't block the core creation; you can handle/log if you prefer.
    await supabaseAdmin.auth.admin.inviteUserByEmail(email).catch(() => {});
  }

  // 3) Insert into public.users with the SAME id
  const { error: insertErr } = await supabaseAdmin
    .from("users")
    .insert({
      id: authUserId,     // <- match auth.users.id
      full_name,
      email,
      role,               // 'admin' | 'member' (your CHECK constraint)
      profile_url: null,
      onboarded: false,
    });
  if (insertErr) throw new Error(`insert into users failed: ${insertErr.message}`);

  return { id: authUserId };
}