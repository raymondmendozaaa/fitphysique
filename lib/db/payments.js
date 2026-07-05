// lib/db/payments.js
export async function fetchPaymentByStripeRefs(
  supabase,
  {
    stripe_session_id = null,
    stripe_payment_intent = null,
    invoice_id = null,
  } = {}
) {
  if (!supabase) throw new Error("Supabase client is required");

  const orParts = [];
  if (stripe_session_id) {
    orParts.push(`stripe_session_id.eq.${stripe_session_id}`);
  }
  if (stripe_payment_intent) {
    orParts.push(`stripe_payment_intent.eq.${stripe_payment_intent}`);
  }
  if (invoice_id) {
    orParts.push(`invoice_id.eq.${invoice_id}`);
  }

  if (orParts.length === 0) return null;

  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .or(orParts.join(","))
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function insertPayment(
  supabase,
  {
    user_id,
    amount,
    method,
    status,
    payment_date,
    stripe_session_id = null,
    stripe_payment_intent = null,
    stripe_subscription_id = null,
    invoice_id = null,
    source = null,
    notes = null,
    guest_pass_id = null,
    membership_id = null,
    location_id = null,
  }
) {
  if (!supabase) throw new Error("Supabase client is required");

  const { data, error } = await supabase
    .from("payments")
    .insert({
      user_id,
      amount,
      method,
      status,
      payment_date,
      stripe_session_id,
      stripe_payment_intent,
      stripe_subscription_id,
      invoice_id,
      source,
      notes,
      guest_pass_id,
      membership_id,
      location_id,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data || null;
}

export async function attachGuestPassToPayment(
  supabase,
  paymentId,
  guestPassId
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!paymentId) throw new Error("paymentId is required");
  if (!guestPassId) throw new Error("guestPassId is required");

  const { error } = await supabase
    .from("payments")
    .update({ guest_pass_id: guestPassId })
    .eq("id", paymentId);

  if (error) throw error;
  return true;
}

export async function attachMembershipToPayment(
  supabase,
  paymentId,
  membershipId,
  {
    stripe_subscription_id = null,
    stripe_payment_intent = null,
  } = {}
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!paymentId) throw new Error("paymentId is required");
  if (!membershipId) throw new Error("membershipId is required");

  const updates = {
    membership_id: membershipId,
  };

  if (stripe_subscription_id) {
    updates.stripe_subscription_id = stripe_subscription_id;
  }

  if (stripe_payment_intent) {
    updates.stripe_payment_intent = stripe_payment_intent;
  }

  const { error } = await supabase
    .from("payments")
    .update(updates)
    .eq("id", paymentId);

  if (error) throw error;
  return true;
}

export async function updatePaymentStripeIntent(
  supabase,
  paymentId,
  stripePaymentIntent
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!paymentId) throw new Error("paymentId is required");
  if (!stripePaymentIntent) throw new Error("stripePaymentIntent is required");

  const { error } = await supabase
    .from("payments")
    .update({ stripe_payment_intent: stripePaymentIntent })
    .eq("id", paymentId);

  if (error) throw error;
  return true;
}

export async function fetchPaymentsForUser(supabase, userId) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userId) return [];

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function fetchLatestPaymentForUser(supabase, userId) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userId) return null;

  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function fetchLatestPaymentBySubscription(
  supabase,
  stripeSubscriptionId
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!stripeSubscriptionId) return null;

  const { data, error } = await supabase
    .from("payments")
    .select("id, stripe_payment_intent, membership_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .order("payment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function patchMissingPaymentIntentBySubscription(
  supabase,
  {
    userId,
    stripeSubscriptionId,
    stripePaymentIntent,
  }
) {
  if (!supabase) throw new Error("Supabase client is required");
  if (!userId) throw new Error("userId is required");
  if (!stripeSubscriptionId) throw new Error("stripeSubscriptionId is required");
  if (!stripePaymentIntent) throw new Error("stripePaymentIntent is required");

  const { error } = await supabase
    .from("payments")
    .update({ stripe_payment_intent: stripePaymentIntent })
    .eq("user_id", userId)
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .is("stripe_payment_intent", null);

  if (error) throw error;
  return true;
}