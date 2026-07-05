// lib/db/users.js

export async function fetchUserById(
  supabase,
  userId,
  select = "*"
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userId) return null;

  const { data, error } = await supabase
    .from("users")
    .select(select)
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchAdminCustomerById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, customer_no, full_name, email, phone, role, created_at, onboarded, pricing_tier, pricing_tier_until"
  );
}

export async function fetchUserBasicIdentityById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, full_name, email"
  );
}

export async function fetchUserRoleById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, role"
  );
}

export async function fetchUserByEmail(
  supabase,
  email,
  select = "*"
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!email) return null;

  const { data, error } = await supabase
    .from("users")
    .select(select)
    .eq("email", email)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function updateUserById(supabase, userId, updates) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userId) throw new Error("userId is required");
  if (!updates || typeof updates !== "object") {
    throw new Error("updates object is required");
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchUserHouseholdFieldsById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, full_name, household_id, household_role"
  );
}

export async function updateUserHouseholdFields(
  supabase,
  userId,
  {
    household_id = null,
    household_role = null,
  } = {}
) {
  return updateUserById(supabase, userId, {
    household_id,
    household_role,
  });
}

export async function fetchUserPricingTierById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, pricing_tier, pricing_tier_until"
  );
}

export async function fetchUserAccessIdentityByEmailOrBarcode(
  supabase,
  { email = null, barcode = null } = {}
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!email && !barcode) return null;

  const orParts = [];
  if (email) orParts.push(`email.eq.${email}`);
  if (barcode) orParts.push(`barcode.eq.${barcode}`);

  const { data, error } = await supabase
    .from("users")
    .select("id, email, barcode")
    .or(orParts.join(","))
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchUserPasswordResetIdentityById(supabase, userId) {
  return fetchUserById(
    supabase,
    userId,
    "id, email, full_name"
  );
}

export async function insertUser(supabase, userPayload) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userPayload || typeof userPayload !== "object") {
    throw new Error("userPayload is required");
  }

  const { data, error } = await supabase
    .from("users")
    .insert(userPayload)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || null;
}