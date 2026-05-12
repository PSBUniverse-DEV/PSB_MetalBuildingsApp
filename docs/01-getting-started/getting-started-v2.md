# Getting Started (v2) — Developer Guide

Everything you need to go from zero to running your first module inside PSBUniverse Core. Follow every step in order. Run each command one at a time. Do not skip steps.

---

## Part 1: GitHub Setup

### 1.1 — Clone your app repo

Your senior dev will give you a repo name (e.g. `PSB_MetalBuildingsApp`). Clone it:

```bash
git clone https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git
cd PSB_MetalBuildingsApp
```

> Replace `PSB_MetalBuildingsApp` with whatever repo name you were given.

### 1.2 — Open it in VS Code

```bash
code .
```

Use the VS Code terminal for everything from here on.

### 1.3 — Confirm you're on main

```bash
git branch
```

You should see `* main`. If not, run `git checkout main`.

### 1.4 — Connect to the core repo

Core is the shared platform. You pull updates from it, but you **never push to it**.

```bash
git remote add core https://github.com/PSBUniverse-DEV/PSBUniverse-core.git
git remote set-url --push core no_push_allowed
```

> If you see "remote core already exists" — that's fine, skip it.

### 1.5 — Verify your remotes

```bash
git remote -v
```

You should see:

```
core    https://github.com/PSBUniverse-DEV/PSBUniverse-core.git (fetch)
core    no_push_allowed (push)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (fetch)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (push)
```

- **origin** = your app repo (you push here)
- **core** = the shared platform (you only pull from here, never push)

### 1.6 — First sync with core

```bash
git fetch core
git branch core-main core/main
git checkout core-main
git pull core main
git checkout main
git merge core-main -m "Merge upstream core changes into main"
git push origin main
```

> If you see "branch core-main already exists" — that's fine, skip that line.

### 1.7 — Set your git identity (once per computer)

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

---

## Part 2: Install Dependencies

### 2.1 — Install packages

```bash
npm install
```

This installs everything the project needs: Next.js, React, Supabase, Bootstrap, etc.

> **PowerShell users:** If `npm` doesn't work, use `npm.cmd` instead.

### 2.2 — Verify node version

```bash
node -v
```

You need Node.js **v18 or higher**. If you're lower than that, download a newer version from [nodejs.org](https://nodejs.org).

---

## Part 3: Environment Setup (`.env.local`)

### 3.1 — Create the file

Create a file called `.env.local` in the project root (same folder as `package.json`). This file holds your database keys. It's never committed to git — it's already in `.gitignore`.

### 3.2 — Add your keys

Paste this into `.env.local` and fill in the values. Ask your senior dev for the actual keys:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

That's it. Three values. All three come from the Supabase dashboard under **Settings → API**.

### 3.3 — Optional settings (you probably don't need these)

```env
NEXT_PUBLIC_ENV=local
```

This controls which environment the app thinks it's in:

| Value | What it does |
|-------|-------------|
| `local` (default) | Points to http://localhost:3000 |
| `dev` | Points to the Vercel staging URL |
| `prod` | Points to production |

Leave it as `local` unless your senior tells you otherwise.

---

## Part 4: Run the App

### 4.1 — Start the dev server

```bash
npm run dev
```

Open **http://localhost:3000** in your browser. You should see the login page.

### 4.2 — What happens behind the scenes

When you run `npm run dev`, two things happen automatically before the server starts:

1. **Route generation** — a script scans all modules and creates the route files Next.js needs (under `src/app/`). You'll see `gen:routes` output in the terminal.
2. **Dev server** — Next.js starts with webpack and serves your app on port 3000.

You don't need to do anything for step 1 — it's automatic.

### 4.3 — First-time expectations

- The first page load is slow (webpack is compiling everything). This is normal.
- You might see a `PackFileCacheStrategy` warning in the terminal. Ignore it.
- After login you'll land on the **dashboard**.

### 4.4 — Verify the build works

Before you start writing code, make sure the project builds clean:

```bash
npm run build
```

If this fails on a fresh clone, **don't try to fix it** — tell your senior dev.

---

## Part 5: The Module System

This is how you create pages in PSBUniverse. Every page lives inside a **module**.

### 5.1 — Create your module

```bash
npm run create-module -- metal-buildings
```

This creates a folder with five files:

```
src/modules/metal-buildings/
  index.js                        ← Defines your module (name, icon, routes)
  pages/
    MetalBuildingsPage.js         ← Server component (loads data from DB)
    MetalBuildingsView.jsx        ← Client component (all your UI goes here)
  data/
    metalBuildings.actions.js     ← Server Actions (database queries)
    metalBuildings.data.js        ← Client helpers (form builders, constants)
```

It also auto-generates a route file under `src/app/` so Next.js knows about your page.

> If your module belongs to a group, add a prefix: `npm run create-module -- admin/metal-buildings`

### 5.2 — Open `index.js` and fill it in

The script pre-fills most values. You need to update these:

```javascript
const metalBuildingsModule = {
  key: "metal-buildings",           // ← don't change this
  module_key: "metal-app",          // ← ask your senior for the correct value
  name: "Metal Buildings",
  description: "Metal Buildings application.",
  icon: "building",                 // ← pick from fontawesome.com/search
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,                       // ← lower number = appears first
  routes: [
    { path: "/metal-buildings", page: "MetalBuildingsPage" },
  ],
};
```

**What each field means:**

| Field | What it does | Who gives you the value |
|-------|-------------|------------------------|
| `key` | Unique ID for your module | Auto-generated |
| `module_key` | Links to an application in the database | Ask your senior |
| `name` | Display name on the dashboard | You pick |
| `icon` | Font Awesome icon name | You pick |
| `group_name` | Which card group it sits in | Ask your senior |
| `order` | Sort position on the dashboard | You pick |
| `routes` | What URLs your module has | You define |

### 5.3 — The two-file pattern (Page + View)

Every page has two files:

| File | Runs on | What goes here |
|------|---------|---------------|
| `MetalBuildingsPage.js` | Server | Load data from the database, pass it to the View |
| `MetalBuildingsView.jsx` | Browser | All UI — buttons, forms, tables, useState, onClick |

Think of it like a kitchen: the **Page** goes to the fridge and grabs ingredients (data), the **View** cooks and plates the food (renders UI).

**Rules:**
- Page files must NOT have `"use client"` at the top.
- View files MUST have `"use client"` at the top.
- Don't mix them up — server code can't use `useState` or `onClick`.

### 5.4 — Adding more pages

Want `/metal-buildings/settings`? Run one command:

```bash
npm run new-page -- modules/metal-buildings/index.js settings
```

This creates `pages/SettingsPage.js` and `pages/SettingsView.jsx`, adds the route to your `index.js`, and generates the `src/app/` wrapper — all in one step.

The route generator also runs automatically on `npm run dev` and `npm run build`.

```javascript
// Output in index.js
routes: [
  { path: "/metal-buildings", page: "MetalBuildingsPage" },
  { path: "/metal-buildings/settings", page: "SettingsPage" },  // ← new
],
```

### 5.5 — Database queries (Server Actions)

All database code goes in `data/metalBuildings.actions.js`. This file has `"use server"` at the top, which means it runs on the server — the browser never sees these queries.

```javascript
"use server";
import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadMetalBuildingsData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("your_table_name")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return { items: data ?? [] };
}
```

Then call it from your Page:

```javascript
// MetalBuildingsPage.js
import MetalBuildingsView from "./MetalBuildingsView";
import { loadMetalBuildingsData } from "../data/metalBuildings.actions";

export default async function MetalBuildingsPage() {
  const { items } = await loadMetalBuildingsData();
  return <MetalBuildingsView items={items} />;
}
```

### 5.6 — Where NOT to put your code

| Folder | Rule |
|--------|------|
| `src/modules/your-module/` | YOUR code goes here |
| `src/app/` | Auto-generated — never edit |
| `src/core/` | Platform internals — don't touch |
| `src/shared/` | Shared UI components — don't modify, but you can import from here |
| `scripts/` | Build scripts — don't touch |

---

## Part 6: Microfrontends (External Modular Apps)

If your app is a **microfrontend** (a separate repo that plugs into the main platform), there are a few extra steps.

### 6.1 — What is a microfrontend?

Instead of your code living inside `src/modules/`, it lives in its own repo and its own Vercel project. The core platform routes certain URLs to your app. For example, `/metal-buildings` gets handled by your separate app instead of core.

### 6.2 — Register your app

Your repo is a copy of core, so you already have the `add-mfe` script. Run it on **your** repo:

```bash
npm run add-mfe -- metal-buildings
```

This adds your app's routing entry to `microfrontends.json` in your repo.

### 6.3 — Send the file to your senior dev

After running the command, send your updated `microfrontends.json` to your senior dev (Slack, Teams, email — whatever your team uses).

Your senior will:
1. Copy your routing entry into core's `microfrontends.json`
2. Commit and push core

### 6.4 — Merge to sync

Once your senior pushes core, merge so everything is in sync:

```bash
git checkout core-main
git pull core main
git checkout main
git merge core-main -m "Merge upstream core changes into main"
git push origin main
```

Now your repo's `microfrontends.json` matches core's copy. Everyone is synced.

### 6.5 — Make sure your config is set up

Your `next.config.mjs` must use `withMicrofrontends()`:

```javascript
import { withMicrofrontends } from '@vercel/microfrontends/next/config';

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withMicrofrontends(nextConfig);
```

And install the package if you haven't already:

```bash
npm install @vercel/microfrontends
```

### 6.6 — When a new child app is added

Whenever your senior says "core's `microfrontends.json` has been updated", merge core-main (same as step 6.4). Your `microfrontends.json` will be updated automatically through the merge.

> **Why does everyone need the same file?** Vercel requires every repo in the group to have an identical `microfrontends.json`. If yours is outdated, your routing will break.

---

## Part 7: Scripts Reference

These are all the commands you'll use. Run them from the project root.

### Everyday commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Starts the dev server on http://localhost:3000. Auto-generates routes first. |
| `npm run build` | Creates a production build. Auto-generates routes first. Run before every PR. |
| `npm run lint` | Checks your code for errors. Fix everything it reports before submitting a PR. |

### Module commands

| Command | What it does |
|---------|-------------|
| `npm run create-module -- <name>` | Creates a new module with all 5 files. Safe to run on existing modules (skips files that exist). |
| `npm run gen:routes` | Manually regenerates route files from all module `index.js` definitions. Normally you don't need this — `dev` and `build` run it automatically. |

### Microfrontend commands

| Command | What it does |
|---------|-------------|
| `npm run add-mfe -- <name>` | Registers your app in `microfrontends.json`. Run this on your repo, then send the file to your senior dev. |

### What "auto-generates routes" means

When you run `npm run dev` or `npm run build`, a script called `generate-routes.js` runs first. It:

1. Reads every module's `index.js` to find all routes
2. Creates a page file under `src/app/` for each route (e.g. `src/app/metal-buildings/page.js`)
3. Deletes old page files for routes that no longer exist
4. Generates `src/app/rewrites.json` for URL rewriting

You never need to create or edit files under `src/app/`. The script handles it.

---

## Part 8: Daily Git Workflow

### Pushing your work

```bash
git add -A
git commit -m "feat: add Metal Buildings list page"
git push origin main
```

### Syncing core updates (when your senior tells you to)

```bash
# Save your work first
git add -A
git commit -m "wip: save before core sync"

# Update core-main
git checkout core-main
git pull core main

# Merge core changes into your main
git checkout main
git merge core-main -m "Merge upstream core changes into main"

# Push
git push origin main
```

### If you get a merge conflict

1. Open the file — look for `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. Pick which version to keep (or combine both). Delete the markers.
3. Save the file, then:

```bash
git add path/to/the/file.js
git merge --continue
```

If you're stuck, run `git merge --abort` to undo everything and ask your senior for help.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Delete `node_modules` and `package-lock.json`, then `npm install` again |
| Port 3000 in use | Kill the other process, or use `PORT=3001 npm run dev` |
| Login redirects back to login | Check `.env.local` — make sure all 3 values are correct |
| Module not on dashboard | Check that `module_key` in your `index.js` matches a value in `psb_s_application` |
| Page shows 404 | Run `npm run gen:routes` and check that `src/app/<your-route>/page.js` was created |
| Build fails on fresh clone | Don't fix it — tell your senior |
| PowerShell blocks npm | Use `npm.cmd` instead |
| `"use client"` error on Page file | Remove `"use client"` from your Page.js — only View files get that |
| `rejected — failed to push` | Run `git pull origin main` then push again |

---

## Quick Checklist

Use this before submitting a PR:

- [ ] `.env.local` has all 3 Supabase values
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` completes without errors
- [ ] `npm run lint` shows no errors
- [ ] Module `index.js` has correct `module_key` (asked senior)
- [ ] Page files do NOT have `"use client"`
- [ ] View files DO have `"use client"`
- [ ] Each route's `page` value matches a filename in `pages/`
- [ ] Module appears on the dashboard after login
- [ ] If microfrontend: ran `npm run add-mfe`, sent file to senior, merged after core push
