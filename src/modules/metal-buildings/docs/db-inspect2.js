import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://xwcwqhfcanqwymmtqdwu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Y3dxaGZjYW5xd3ltbXRxZHd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk2NzAxMiwiZXhwIjoyMDkwNTQzMDEyfQ.6o7kYt03g2pkAqwoL1gxOberNQJo0HZkUXHsfUF15Qo"
);

async function main() {
  // All categories
  console.log("=== metal_s_category (ALL) ===");
  const c = await sb.from("metal_s_category").select("*").order("sort_order");
  console.table(c.data);

  // All pricing types
  console.log("\n=== metal_s_pricing_type (ALL) ===");
  const p = await sb.from("metal_s_pricing_type").select("*").order("sort_order");
  console.table(p.data);

  // All features with their category_id and pricing_type_id resolved
  console.log("\n=== metal_s_feature (ALL) ===");
  const f = await sb.from("metal_s_feature").select("*").order("sort_order");
  const cats = Object.fromEntries((c.data || []).map(x => [x.category_id, x.name]));
  const pts = Object.fromEntries((p.data || []).map(x => [x.pricing_type_id, x.code]));
  console.table(f.data.map(r => ({
    id: r.feature_id, name: r.name, category: cats[r.category_id] || r.category_id,
    pricing: pts[r.pricing_type_id] || r.pricing_type_id, render_key: r.render_key,
    active: r.is_active, sort: r.sort_order
  })));

  // All styles
  console.log("\n=== metal_s_style (ALL) ===");
  const s = await sb.from("metal_s_style").select("*").order("sort_order");
  console.table(s.data.map(r => ({
    id: r.style_id, name: r.name, render_key: r.render_key,
    default_roof_pitch: r.default_roof_pitch, active: r.is_active
  })));
}
main().catch(console.error);
