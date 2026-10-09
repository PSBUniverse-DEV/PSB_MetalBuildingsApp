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

// Business fix (approved): the 12" overhang rule for W12–30 (× 0.15) applies
// at ANY building length — the '>= 60' length limit was incorrect.
// Clear the length bounds on that row (option_id 59).
const TARGET_ID = 59;

const { data: before } = await supabase
  .from("metal_s_feature_option")
  .select("*")
  .eq("option_id", TARGET_ID);
console.log("BEFORE:", JSON.stringify(before, null, 2));

const target = before?.[0];
if (!target) {
  console.error(`option_id ${TARGET_ID} not found — aborting.`);
  process.exit(1);
}
if (target.min_width !== 12 || target.max_width !== 30 || Number(target.multiplier) !== 0.15) {
  console.error("Row shape unexpected (expected W12-30, multiplier 0.15) — aborting.", target);
  process.exit(1);
}

const { data: updated, error } = await supabase
  .from("metal_s_feature_option")
  .update({ min_length: null, max_length: null, updated_at: new Date().toISOString() })
  .eq("option_id", TARGET_ID)
  .select();
if (error) {
  console.error("UPDATE FAILED:", error.message);
  process.exit(1);
}
console.log("AFTER:", JSON.stringify(updated, null, 2));
