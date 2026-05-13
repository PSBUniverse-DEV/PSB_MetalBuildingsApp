import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://xwcwqhfcanqwymmtqdwu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Y3dxaGZjYW5xd3ltbXRxZHd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk2NzAxMiwiZXhwIjoyMDkwNTQzMDEyfQ.6o7kYt03g2pkAqwoL1gxOberNQJo0HZkUXHsfUF15Qo"
);

async function main() {
  const tables = [
    "metal_s_style", "metal_s_feature", "metal_s_feature_option",
    "metal_s_panel_location", "metal_s_panel_option",
    "metal_m_feature_matrix_price", "metal_m_feature_rate",
    "metal_s_door_window_item",
    "metal_s_color_group", "metal_s_color_option",
    "metal_s_leanto_style", "metal_s_leanto_side",
    "metal_m_leanto_price", "metal_m_leanto_style_compat",
    "metal_s_region",
    "metal_s_category",
    "metal_s_pricing_type",
    "metal_s_style_default",
  ];
  for (const t of tables) {
    const r = await sb.from(t).select("*").limit(3);
    if (r.error) {
      console.log(`--- ${t}: NOT FOUND`);
    } else {
      console.log(`\n=== ${t} === (sample)`);
      if (r.data.length > 0) {
        console.log("COLUMNS:", Object.keys(r.data[0]).join(", "));
        console.table(r.data);
      } else {
        console.log("(empty)");
      }
    }
  }
  // Row counts
  console.log("\n=== ROW COUNTS ===");
  for (const t of tables) {
    const r = await sb.from(t).select("*", { count: "exact", head: true });
    if (!r.error) console.log(`${t}: ${r.count}`);
  }
}
main().catch(console.error);
