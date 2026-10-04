import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually (no dotenv dependency)
const envFile = readFileSync(".env.local", "utf8");
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// 1. Find gutter-related features (any name/render_key variant)
const { data: feats, error: fErr } = await supabase
  .from("metal_s_feature")
  .select("feature_id, name, render_key, pricing_type_id, is_active")
  .or("name.ilike.%gutter%,render_key.ilike.%gutter%,name.ilike.%downspout%,render_key.ilike.%downspout%");
console.log("FEATURES:", JSON.stringify(feats, null, 2), fErr?.message ?? "");

// 2. All rate rows for those features (and all rows, for reference)
const ids = (feats ?? []).map((f) => f.feature_id);
if (ids.length) {
  const { data: rates, error: rErr } = await supabase
    .from("metal_m_feature_rate")
    .select("*")
    .in("feature_id", ids);
  console.log("RATES FOR GUTTER FEATURES:", JSON.stringify(rates, null, 2), rErr?.message ?? "");
}

const { data: allRates, error: aErr } = await supabase
  .from("metal_m_feature_rate")
  .select("*");
console.log("ALL RATES:", JSON.stringify(allRates, null, 2), aErr?.message ?? "");
