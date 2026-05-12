#!/usr/bin/env node

/**
 * add-microfrontend.js
 *
 * Registers a new child app in this host's microfrontends.json.
 * Core's microfrontends.json is the single source of truth.
 * After running this, the developer copies the file into their child repo.
 *
 * Usage:
 *   npm run add-mfe -- metal-buildings
 *   npm run add-mfe -- gutter
 *   npm run add-mfe -- insulation --fallback insulation-app.vercel.app
 *
 * Result:
 *   Adds an entry to microfrontends.json like:
 *   "psb-<name>-app": {
 *     "development": { "fallback": "psb-<name>-app.vercel.app" },
 *     "routing": [{ "group": "psb-<name>-app", "paths": ["/<name>", "/<name>/:path*"] }]
 *   }
 *
 * After adding, the developer must:
 *   1. Copy this file into their child repo root
 *   2. Ensure child repo's next.config.mjs uses withMicrofrontends()
 *   3. npm install @vercel/microfrontends in their child repo
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const MFE_PATH = path.join(ROOT, "microfrontends.json");

// ---------------------------------------------------------------------------
// 1. Parse arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const rawName = args.filter((a) => !a.startsWith("--"))[0];

if (!rawName) {
  console.error(`
  Usage:  npm run add-mfe -- <module-name> [--fallback <url>]

  Examples:
    npm run add-mfe -- gutter
    npm run add-mfe -- metal-buildings
    npm run add-mfe -- insulation --fallback my-custom-domain.vercel.app
  `);
  process.exit(1);
}

const slug = rawName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
const appName = `psb-${slug}-app`;
const routePath = `/${slug}`;

// Optional --fallback override
const fallbackIdx = args.indexOf("--fallback");
const fallbackUrl =
  fallbackIdx !== -1 && args[fallbackIdx + 1]
    ? args[fallbackIdx + 1]
    : `${appName}.vercel.app`;



// ---------------------------------------------------------------------------
// 2. Read existing microfrontends.json
// ---------------------------------------------------------------------------

if (!fs.existsSync(MFE_PATH)) {
  console.error(`\n  ERROR: microfrontends.json not found at:\n         ${MFE_PATH}\n`);
  process.exit(1);
}

const mfe = JSON.parse(fs.readFileSync(MFE_PATH, "utf-8"));

if (!mfe.applications) {
  mfe.applications = {};
}

// ---------------------------------------------------------------------------
// 3. Check for conflicts
// ---------------------------------------------------------------------------

if (mfe.applications[appName]) {
  console.error(`\n  ERROR: "${appName}" already exists in microfrontends.json.\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 4. Add the new entry
// ---------------------------------------------------------------------------

mfe.applications[appName] = {
  development: {
    fallback: fallbackUrl,
  },
  routing: [
    {
      group: appName,
      paths: [routePath, `${routePath}/:path*`],
    },
  ],
};

// ---------------------------------------------------------------------------
// 5. Write back
// ---------------------------------------------------------------------------

fs.writeFileSync(MFE_PATH, JSON.stringify(mfe, null, 2) + "\n", "utf-8");

console.log(`\n  ✔ Added "${appName}" to microfrontends.json`);
console.log(`    Routes:   ${routePath}, ${routePath}/:path*`);
console.log(`    Fallback: ${fallbackUrl}`);

// ---------------------------------------------------------------------------
// 6. Print instructions for the developer
// ---------------------------------------------------------------------------

console.log(`\n  NEXT STEPS (for the child repo dev):`);
console.log(`  ─────────────────────────────────────────────`);
console.log(`    1. Copy this file into your child repo root:`);
console.log(`       cp microfrontends.json <your-child-repo>/microfrontends.json`);
console.log(`    2. Ensure your child repo's next.config.mjs uses:`);
console.log(`       export default withMicrofrontends(nextConfig);`);
console.log(`    3. Install the package in your child repo:`);
console.log(`       cd <your-child-repo> && npm install @vercel/microfrontends`);
console.log(`    4. Commit + push core, then have the child dev merge core-main.`);
console.log(`  ─────────────────────────────────────────────\n`);
