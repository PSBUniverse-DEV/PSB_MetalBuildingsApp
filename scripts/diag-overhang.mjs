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

// 1. Find the roof_overhang feature
const { data: feats, error: fErr } = await supabase
  .from("metal_s_feature")
  .select("feature_id, name, render_key, is_active")
  .eq("render_key", "roof_overhang");
console.log("FEATURES:", JSON.stringify(feats, null, 2), fErr?.message ?? "");

const fid = feats?.[0]?.feature_id;
if (fid) {
  // 2. All option rows for it
  const { data: opts, error: oErr } = await supabase
    .from("metal_s_feature_option")
    .select("*")
    .eq("feature_id", fid)
    .order("sort_order");
  console.log("OPTIONS:", JSON.stringify(opts, null, 2), oErr?.message ?? "");
}

// ─── Simulate the fixed lookup (mirrors ConfiguratorViewV1.jsx) ───
const { data: allOpts } = await supabase
  .from("metal_s_feature_option")
  .select("option_id, feature_id, name, price, multiplier, min_width, max_width, min_length, max_length, is_active");

function normalizeOverhangName(name) {
  if (name == null) return null;
  const cleaned = String(name).trim().replace(/['"″′”’]/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) && cleaned !== "" ? num : cleaned.toLowerCase();
}

function lookup(overhangName, w, l) {
  const wantSize = normalizeOverhangName(overhangName);
  const candidates = (allOpts ?? [])
    .filter((o) => o.feature_id === 46 && o.is_active !== false && normalizeOverhangName(o.name) === wantSize)
    .sort((a, b) => ((a.sort_order ?? 0) - (b.sort_order ?? 0)) || ((a.option_id ?? 0) - (b.option_id ?? 0)));
  return candidates.find((o) => {
    const minW = o.min_width != null ? Number(o.min_width) : null;
    const maxW = o.max_width != null ? Number(o.max_width) : null;
    const minL = o.min_length != null ? Number(o.min_length) : null;
    const maxL = o.max_length != null ? Number(o.max_length) : null;
    if (minW != null && w < minW) return false;
    if (maxW != null && w > maxW) return false;
    if (minL != null && l < minL) return false;
    if (maxL != null && l > maxL) return false;
    return true;
  }) ?? null;
}

console.log("\nLOOKUP SIMULATION (base $2,006):");
const cases = [
  ["6\"", 12, 20], ["12\"", 12, 20], ["18\"", 12, 20],
  ["12\"", 12, 70], ["12\"", 40, 40], ["12\"", 40, 60],
  ["18\"", 12, 55], ["18\"", 12, 60], ["18\"", 40, 60], ["18\"", 40, 61],
];
for (const [sel, w, l] of cases) {
  const m = lookup(sel, w, l);
  const f = m?.multiplier != null ? Number(m.multiplier) : 0;
  console.log(`  ${sel} @ ${w}x${l} -> ${m ? `option ${m.option_id} (${JSON.stringify(m.name)}) factor ${f}` : "NO MATCH (factor 0)"} | upcharge $${(2006 * f).toFixed(2)}`);
}

