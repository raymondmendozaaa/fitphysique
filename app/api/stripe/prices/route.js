// app/api/stripe/prices/route.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20", // or whatever you're already using
});

// super simple in-memory cache: { price_id: { amount_cents, currency, cachedAt } }
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const priceCache = new Map();

async function fetchPrice(priceId) {
  const now = Date.now();
  const cached = priceCache.get(priceId);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const price = await stripe.prices.retrieve(priceId);
  const amount_cents = price.unit_amount ?? null;
  const currency = price.currency ?? "usd";

  const entry = { amount_cents, currency, cachedAt: now };
  priceCache.set(priceId, entry);
  return entry;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const priceIds = Array.isArray(body.price_ids) ? body.price_ids : [];

    if (!priceIds.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "price_ids array is required" }),
        { status: 400 }
      );
    }

    // Dedupe
    const unique = Array.from(new Set(priceIds.filter(Boolean)));

    const result = {};
    for (const id of unique) {
      try {
        const info = await fetchPrice(id);
        result[id] = {
          amount_cents: info.amount_cents,
          currency: info.currency,
        };
      } catch (e) {
        console.error("Failed to fetch price", id, e);
        // leave it out; client can show "—" for missing
      }
    }

    return new Response(JSON.stringify({ ok: true, prices: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Stripe prices route error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: "Server error fetching prices" }),
      { status: 500 }
    );
  }
}