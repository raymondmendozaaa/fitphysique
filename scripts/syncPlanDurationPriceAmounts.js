// scripts/syncPlanDurationPriceAmounts.js
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // service role required for backfills
);

async function main() {
  // Pull all rows missing amount_cents
  const { data: rows, error } = await supabase
    .from("plan_duration_prices")
    .select("id, stripe_price_id")
    .is("amount_cents", null);

  if (error) throw error;
  if (!rows?.length) {
    console.log("No rows need syncing. Done.");
    return;
  }

  console.log(`Found ${rows.length} rows to sync...`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const price = await stripe.prices.retrieve(row.stripe_price_id);

      // Some Stripe prices can have unit_amount null (e.g., tiered/usage-based).
      // If that happens, we skip and you can handle those specially.
      if (price.unit_amount == null) {
        console.warn(`Skipping ${row.stripe_price_id}: unit_amount is null`);
        skipped++;
        continue;
      }

      const { error: upErr } = await supabase
        .from("plan_duration_prices")
        .update({
          amount_cents: price.unit_amount,
          currency: (price.currency || "usd").toUpperCase(),
        })
        .eq("id", row.id);

      if (upErr) throw upErr;

      updated++;
      if (updated % 25 === 0) console.log(`Updated ${updated}/${rows.length}...`);
    } catch (e) {
      console.error(`Failed for ${row.stripe_price_id}:`, e);
    }
  }

  console.log(`Done. Updated: ${updated}. Skipped: ${skipped}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
