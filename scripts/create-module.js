#!/usr/bin/env node

/**
 * create-module.js
 *
 * Scaffolds a new module OR updates an existing one.
 *
 * Usage:
 *   npm run create-module -- metal-buildings
 *   npm run create-module -- admin/inventory-tracker
 *   npm run create-module -- psbpages/reports
 *
 * NEW module:
 *   Creates all files under src/modules/<group?>/<module-name>/
 *   Runs generate-routes.js to sync page wrappers + rewrites.
 *
 * EXISTING module:
 *   Fills in missing files only (won't overwrite your work).
 *   Runs generate-routes.js to sync page wrappers + rewrites.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = path.resolve(process.cwd());
const MODULES_DIR = path.join(ROOT, "src", "modules");

// ---------------------------------------------------------------------------
// 1. Parse arguments
// ---------------------------------------------------------------------------

const allArgs = process.argv.slice(2);
const rawInput = allArgs.filter((a) => !a.startsWith("--"))[0];

if (!rawInput) {
  console.error(`
  Usage:  npm run create-module -- <module-name>

  The module name can include a group prefix with a slash:

  Examples:
    npm run create-module -- metal-buildings           →  src/modules/metal-buildings/
    npm run create-module -- admin/inventory-tracker   →  src/modules/admin/inventory-tracker/
    npm run create-module -- psbpages/reports          →  src/modules/psbpages/reports/
  `);
  process.exit(1);
}

// Parse "admin/inventory-tracker" → group="admin", rawName="inventory-tracker"
// Parse "metal-buildings"         → group=null,    rawName="metal-buildings"
const parts = rawInput.replace(/^\/+/, "").split("/").filter(Boolean);
const group = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
const rawName = parts[parts.length - 1];

// ---------------------------------------------------------------------------
// 2. Name conversions
// ---------------------------------------------------------------------------

function toPascalCase(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
}

function toCamelCase(slug) {
  const p = toPascalCase(slug);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function toDisplayName(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const moduleSlug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const pascal = toPascalCase(moduleSlug);
const camel = toCamelCase(moduleSlug);
const displayName = toDisplayName(moduleSlug);

const routePath = group ? `/${group}/${moduleSlug}` : `/${moduleSlug}`;
const moduleDir = group
  ? path.join(MODULES_DIR, group, moduleSlug)
  : path.join(MODULES_DIR, moduleSlug);

const isExisting = fs.existsSync(moduleDir);
const appName = `psb-${moduleSlug}-app`;

// Relative path from repo root for display
const moduleDirRel = path.relative(ROOT, moduleDir).replace(/\\/g, "/");

// ---------------------------------------------------------------------------
// 3. Compute paths for checklist
// ---------------------------------------------------------------------------

const filePaths = {
  index:   `${moduleDirRel}/index.js`,
  page:    `${moduleDirRel}/pages/${pascal}Page.js`,
  view:    `${moduleDirRel}/pages/${pascal}View.jsx`,
  actions: `${moduleDirRel}/data/${camel}.actions.js`,
  data:    `${moduleDirRel}/data/${camel}.data.js`,
  appPage: `src/app${routePath}/page.js`,
  rewrites: `src/app/rewrites.json`,
};

// ---------------------------------------------------------------------------
// 4. File templates
// ---------------------------------------------------------------------------

const GROUP_DEFAULTS = {
  admin: { group_name: "Administration", group_desc: "Tools for system configuration and management." },
  psbpages: { group_name: "System", group_desc: "Core system pages." },
};

const groupInfo = GROUP_DEFAULTS[group] || {
  group_name: "TODO: Pick a sidebar group",
  group_desc: "TODO: Describe this group",
};

// ── index.js ───────────────────────────────────────────────


const indexContent = `\
/**
 * Module Definition — ${moduleSlug}
 * ═══════════════════════════════════════════════════════════
 *
 * This file registers your module with PSBUniverse Core.
 * The route generator reads this to auto-create page files
 * under src/app/ when you run \`npm run dev\` or \`npm run build\`.
 *
 * ───────────────────────────────────────────────────────────
 * SETUP CHECKLIST — Verify these are done before your PR
 * ───────────────────────────────────────────────────────────
 *
 * FILES (auto-created by create-module script):
 *   ☐ ${filePaths.index}             ← You are here
 *   ☐ ${filePaths.page}              ← Server component (loads data)
 *   ☐ ${filePaths.view}             ← Client component (all UI)
 *   ☐ ${filePaths.actions}  ← Server Actions (DB queries)
 *   ☐ ${filePaths.data}     ← Client helpers (forms, constants)
 *
 * AUTO-GENERATED (do NOT edit — created on npm run dev/build):
 *   ☐ ${filePaths.appPage}       ← Route wrapper
 *   ☐ ${filePaths.rewrites}                     ← URL rewrites (if psbpages/)
 *
 * DATABASE SETUP (manual — ask senior dev if unsure):
 *   ☐ psb_s_application  → Ensure your app exists (module_key must match below)
 *   ☐ psb_s_appcard      → Add card with route_path = "${routePath}"
 *   ☐ psb_m_appcardgroup → Add/use a group for your cards
 *   ☐ psb_m_appcardroleaccess → Assign roles that can see this card
 *   ☐ psb_s_role          → Ensure roles exist for your app
 *   ☐ psb_m_userapproleaccess → Assign users to roles for testing
 *
 * HOW TO VERIFY EVERYTHING WORKS:
 *   1. Run \`npm run dev\`
 *   2. Open http://localhost:3000${routePath}
 *   3. You should see "${displayName}" heading with "This page is ready."
 *   4. If 404 → check that ${filePaths.appPage} exists (run npm run gen:routes)
 *   5. If "No Access" → check your role mappings in the database
 *   6. If module not on dashboard → check psb_s_appcard has this route_path
 *
 * UPDATING ROUTES:
 *   If you change the path below, just run \`npm run dev\` or \`npm run build\`.
 *   The old page wrapper is auto-deleted and a new one is created.
 *   But you MUST also update psb_s_appcard.route_path in the database.
 *
 * DOCS: docs/02-architecture/module-system.md
 * ═══════════════════════════════════════════════════════════
 */
const ${camel}Module = {
  key: "${moduleSlug}",
  module_key: "psbuniverse",          // ← change to your app key from Application Setup
  name: "${displayName}",
  description: "TODO: Describe what this module does.",
  icon: "box",                        // ← pick from https://fontawesome.com/search?o=r&m=free
  group_name: "${groupInfo.group_name}",
  group_desc: "${groupInfo.group_desc}",
  order: 200,                         // ← adjust to control sidebar position
  routes: [
    { path: "${routePath}", page: "${pascal}Page" },
  ],
};

export default ${camel}Module;
`;

// ── pages/Page.js (Server Component) ──────────────────────

const pageContent = `\
/**
 * Server Component — ${pascal}Page.js
 *
 * Runs on the server. Loads data, then passes it to the View.
 *
 * WHAT TO DO:
 *   1. Import your load function from "../data/${camel}.actions"
 *   2. Call it with \`await\`
 *   3. Pass the result as props to ${pascal}View
 *
 * RULES:
 *   - No useState, useEffect, or onClick here — those go in the View.
 *   - Do NOT wrap JSX in try/catch (causes a React lint error).
 */
import ${pascal}View from "./${pascal}View";
// import { load${pascal}Data } from "../data/${camel}.actions";

export const dynamic = "force-dynamic";

export default async function ${pascal}Page() {
  // TODO: Load your data here
  // const { items } = await load${pascal}Data();

  return <${pascal}View />;
}
`;

// ── pages/View.jsx (Client Component) ─────────────────────

const viewContent = `\
/**
 * Client Component — ${pascal}View.jsx
 *
 * Runs in the browser. All UI, hooks, and interaction go here.
 *
 * PATTERN:
 *   1. Create a custom hook (use${pascal}) at the top for state & logic.
 *   2. In the default export, call the hook and render your UI.
 *   3. Import helpers from "../data/${camel}.data" (forms, mappers, constants).
 *   4. Import server actions from "../data/${camel}.actions" (save, delete).
 *   5. Use shared UI from "@/shared/components/ui/" (TableZ, Card, Modal, etc).
 */
"use client";

export default function ${pascal}View(/* { items } */) {
  return (
    <main className="container py-4">
      <h2>${displayName}</h2>
      <p className="text-muted">This page is ready for development.</p>
    </main>
  );
}
`;

// ── data/actions.js (Server Actions) ──────────────────────

const actionsContent = `\
/**
 * Server Actions — ${camel}.actions.js
 *
 * Runs on the server. This is the ONLY place you talk to the database.
 *
 * WHAT TO DO:
 *   1. Import getSupabaseAdmin from "@/core/supabase/admin"
 *   2. Write one async function per operation:
 *        load___()   → SELECT
 *        create___() → INSERT
 *        update___() → UPDATE
 *        delete___() → DELETE or soft-delete
 *   3. Return clean objects — no raw DB internals.
 *
 * EXAMPLE:
 *   export async function load${pascal}Data() {
 *     const supabase = getSupabaseAdmin();
 *     const { data, error } = await supabase
 *       .from("your_table_name")
 *       .select("*")
 *       .order("created_at", { ascending: false });
 *     if (error) throw new Error(error.message);
 *     return { items: data ?? [] };
 *   }
 */
"use server";

// import { getSupabaseAdmin } from "@/core/supabase/admin";
`;

// ── data/data.js (Client Helpers) ─────────────────────────

const dataContent = `\
/**
 * Client Helpers — ${camel}.data.js
 *
 * Runs in the browser. Helper functions for your View.
 * NO database calls here — that belongs in ${camel}.actions.js.
 *
 * WHAT TO PUT HERE:
 *   - Constants (column definitions, tab lists, default values)
 *   - Form builders (createEmptyForm, createFormFromRow)
 *   - Normalizers (trimming strings, converting nulls)
 *   - Display mappers (DB row → table-friendly object)
 *   - Batch helpers (tracking pending creates/updates/deletes)
 */
`;

// ---------------------------------------------------------------------------
// 5. Write files — skip existing (never overwrite dev work)
// ---------------------------------------------------------------------------

const files = [
  { rel: "index.js", content: indexContent },
  { rel: `pages/${pascal}Page.js`, content: pageContent },
  { rel: `pages/${pascal}View.jsx`, content: viewContent },
  { rel: `data/${camel}.actions.js`, content: actionsContent },
  { rel: `data/${camel}.data.js`, content: dataContent },
];

if (isExisting) {
  console.log(`\nUpdating existing module: ${displayName}`);
} else {
  console.log(`\nCreating module: ${displayName}`);
}
console.log(`  Folder: ${moduleDirRel}`);
console.log(`  Route:  ${routePath}\n`);

let created = 0;
let skipped = 0;

for (const file of files) {
  const filePath = path.join(moduleDir, file.rel);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(filePath)) {
    console.log(`  SKIP (exists) ${path.relative(ROOT, filePath)}`);
    skipped++;
  } else {
    fs.writeFileSync(filePath, file.content, "utf-8");
    console.log(`  CREATE  ${path.relative(ROOT, filePath)}`);
    created++;
  }
}

if (isExisting && created === 0) {
  console.log(`\n  All files already exist. No new files created.`);
}

// ---------------------------------------------------------------------------
// 6. Auto-generate route files
// ---------------------------------------------------------------------------

console.log(`\nRunning route generator...\n`);
execSync("node scripts/generate-routes.js", { cwd: ROOT, stdio: "inherit" });

// ---------------------------------------------------------------------------
// 7. Print summary with verification checklist
// ---------------------------------------------------------------------------

console.log(`\n${"═".repeat(60)}`);
console.log(`  ${isExisting ? "UPDATE" : "SETUP"} COMPLETE: ${displayName}`);
console.log(`${"═".repeat(60)}`);
console.log();
console.log(`  Module files:`);
for (const file of files) {
  const filePath = path.join(moduleDir, file.rel);
  const exists = fs.existsSync(filePath);
  console.log(`    ${exists ? "✅" : "❌"} ${moduleDirRel}/${file.rel}`);
}

console.log();
console.log(`  Auto-generated (do NOT edit):`);
const appPagePath = path.join(ROOT, "src", "app", ...routePath.split("/").filter(Boolean), "page.js");
console.log(`    ${fs.existsSync(appPagePath) ? "✅" : "❌"} ${filePaths.appPage}`);
console.log(`    ${fs.existsSync(path.join(ROOT, filePaths.rewrites)) ? "✅" : "❌"} ${filePaths.rewrites}`);

console.log();
console.log(`  Manual steps remaining:`);
console.log(`    ☐ Open ${filePaths.index} — set module_key, icon, group_name, order`);
console.log(`    ☐ DB: psb_s_application → ensure your app exists`);
console.log(`    ☐ DB: psb_s_appcard → add card with route_path = "${routePath}"`);
console.log(`    ☐ DB: psb_m_appcardroleaccess → assign roles`);
console.log(`    ☐ Run \`npm run dev\` → visit http://localhost:3000${routePath}`);
console.log(`    ☐ Verify: page loads with "${displayName}" heading`);
console.log(`    ☐ Verify: unauthorized user sees "No Access"`);

console.log();
console.log(`  Full guide: docs/02-architecture/module-system.md`);
console.log(`${"═".repeat(60)}\n`);
