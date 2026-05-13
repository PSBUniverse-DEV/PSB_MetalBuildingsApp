import { createClient } from "@supabase/supabase-js";
const sb = createClient(
  "https://xwcwqhfcanqwymmtqdwu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Y3dxaGZjYW5xd3ltbXRxZHd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDk2NzAxMiwiZXhwIjoyMDkwNTQzMDEyfQ.6o7kYt03g2pkAqwoL1gxOberNQJo0HZkUXHsfUF15Qo"
);

async function main() {
  // 1. ALTER metal_s_style — add default dimensions & wall config
  console.log("1. Adding columns to metal_s_style...");
  const alter1 = await sb.rpc("exec_sql", { sql: `
    ALTER TABLE metal_s_style
      ADD COLUMN IF NOT EXISTS default_width INT DEFAULT 12,
      ADD COLUMN IF NOT EXISTS default_length INT DEFAULT 20,
      ADD COLUMN IF NOT EXISTS default_height INT DEFAULT 6,
      ADD COLUMN IF NOT EXISTS default_roof_overhang TEXT DEFAULT '0',
      ADD COLUMN IF NOT EXISTS has_walls BOOLEAN DEFAULT false;
  `});
  if (alter1.error) console.log("  rpc failed, trying direct SQL...");

  // Fallback: if rpc doesn't exist, update via data operations
  // Let's just try updating the rows — if columns don't exist, we'll know
  const testUpdate = await sb.from("metal_s_style").select("default_width").limit(1);
  if (testUpdate.error && testUpdate.error.message.includes("default_width")) {
    console.log("  Columns don't exist yet. Need to add via Supabase SQL editor.");
    console.log("  Run this SQL in Supabase SQL Editor:\n");
    console.log(`
ALTER TABLE metal_s_style
  ADD COLUMN IF NOT EXISTS default_width INT DEFAULT 12,
  ADD COLUMN IF NOT EXISTS default_length INT DEFAULT 20,
  ADD COLUMN IF NOT EXISTS default_height INT DEFAULT 6,
  ADD COLUMN IF NOT EXISTS default_roof_overhang TEXT DEFAULT '0',
  ADD COLUMN IF NOT EXISTS has_walls BOOLEAN DEFAULT false;

-- Set per-style defaults based on NorthEdge reference
UPDATE metal_s_style SET default_width=12, default_length=20, default_height=6,  default_roof_overhang='0',  has_walls=false WHERE render_key='regular';
UPDATE metal_s_style SET default_width=12, default_length=20, default_height=7,  default_roof_overhang='6',  has_walls=false WHERE render_key='aframe';
UPDATE metal_s_style SET default_width=12, default_length=20, default_height=8,  default_roof_overhang='6',  has_walls=false WHERE render_key='vertical';
UPDATE metal_s_style SET default_width=22, default_length=25, default_height=8,  default_roof_overhang='6',  has_walls=true  WHERE render_key='garage';
UPDATE metal_s_style SET default_width=12, default_length=20, default_height=12, default_roof_overhang='6',  has_walls=true  WHERE render_key='barn';
UPDATE metal_s_style SET default_width=32, default_length=20, default_height=10, default_roof_overhang='6',  has_walls=false WHERE render_key='truss';

-- Style-to-feature defaults table
CREATE TABLE IF NOT EXISTS metal_s_style_default (
  style_default_id SERIAL PRIMARY KEY,
  style_id INT NOT NULL REFERENCES metal_s_style(style_id),
  feature_id INT NOT NULL REFERENCES metal_s_feature(feature_id),
  option_id INT REFERENCES metal_s_feature_option(option_id),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(style_id, feature_id)
);
    `);
  } else {
    console.log("  Columns already exist or were added successfully.");
    // Set the values
    const styles = [
      { render_key: "regular",  default_width: 12, default_length: 20, default_height: 6,  default_roof_overhang: "0",  has_walls: false },
      { render_key: "aframe",   default_width: 12, default_length: 20, default_height: 7,  default_roof_overhang: "6",  has_walls: false },
      { render_key: "vertical", default_width: 12, default_length: 20, default_height: 8,  default_roof_overhang: "6",  has_walls: false },
      { render_key: "garage",   default_width: 22, default_length: 25, default_height: 8,  default_roof_overhang: "6",  has_walls: true },
      { render_key: "barn",     default_width: 12, default_length: 20, default_height: 12, default_roof_overhang: "6",  has_walls: true },
      { render_key: "truss",    default_width: 32, default_length: 20, default_height: 10, default_roof_overhang: "6",  has_walls: false },
    ];
    for (const s of styles) {
      const { render_key, ...vals } = s;
      const r = await sb.from("metal_s_style").update(vals).eq("render_key", render_key);
      console.log(`  ${render_key}: ${r.error ? r.error.message : "OK"}`);
    }
  }

  // 2. CREATE metal_s_style_default
  console.log("\n2. Creating metal_s_style_default...");
  const testTable = await sb.from("metal_s_style_default").select("*").limit(1);
  if (testTable.error) {
    console.log("  Table doesn't exist. Run the CREATE TABLE SQL above in Supabase SQL Editor.");
  } else {
    console.log("  Table already exists.");
  }

  // Verify
  console.log("\n3. Verify metal_s_style after updates...");
  const verify = await sb.from("metal_s_style").select("style_id, name, render_key, default_width, default_length, default_height, default_roof_overhang, default_roof_pitch, has_walls").order("sort_order");
  if (verify.error) console.log("  ERROR:", verify.error.message);
  else console.table(verify.data);
}
main().catch(console.error);
