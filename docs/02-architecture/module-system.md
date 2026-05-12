# Module System

This guide covers everything about building modules: the required contract, folder structure, routing, auth integration, and the step-by-step build process.

> **New here?** Start with the [Getting Started Guide](../01-getting-started/getting-started-v2.md) first — it covers GitHub setup, dependencies, environment config, running the app, and building your first module. This page is the detailed reference.

---

## What Is a Module?

A module is a self-contained feature that plugs into PSBUniverse Core. Each module lives in its own folder under `src/modules/` and is automatically discovered by the platform at runtime.

**Core** handles authentication, RBAC, and routing.
**Your module** handles domain features, pages, and workflows.

---

## Folder Structure

```
src/modules/<module-name>/
  index.js                    ← Module definition (required)
  data/
    myModule.data.js          ← Client-safe helpers: model, utilities, batch orchestration
    myModule.actions.js       ← "use server" file: DB queries & Server Actions
  pages/
    DashboardPage.js          ← Server component entry (loads data, renders view)
    DashboardView.jsx         ← "use client" — all UI, hooks, sub-components
```

The only **required** file is `index.js`. For a simple module you may only need `index.js` + one page. As your module grows, add a `data/` folder for backend logic.

### Why This Structure?

| File | Responsibility |
|------|---------------|
| `index.js` | Identity — tells core "I exist, here are my routes" |
| `data/*.data.js` | Client-safe utilities (model mappers, constants, batch logic) |
| `data/*.actions.js` | Server Actions — all DB access lives here (`"use server"`) |
| `pages/*Page.js` | Server entry — loads data, passes to view |
| `pages/*View.jsx` | Client component — all UI, state, and interactivity |

**Previous structure (deprecated):** Older modules may still have `components/`, `hooks/`, `services/`, `repo/`, `model/`, `utils/`, `view/` folders. New modules should use the flat structure above.

---

## Module Definition Contract

Every module must export a default object from `index.js`.

> **In simple terms:** Think of `index.js` as your module's ID card. It tells the system your module's name, which app it belongs to, and what URLs it serves. Without this file, the system doesn't know your module exists.

```js
const myModule = {
  key: "metal-buildings",
  module_key: "metal-app",
  name: "Metal Buildings",
  description: "Metal Buildings application.",
  icon: "building",
  group_name: "Applications",
  group_desc: "Business applications.",
  order: 200,
  routes: [
    { path: "/metal-buildings", page: "DashboardPage" },
    { path: "/metal-buildings/settings", page: "SettingsPage" },
  ],
};

export default myModule;
```

> **`app_id` is resolved automatically.** The core matches your `module_key` to the `module_key` column in `psb_s_application` and injects `app_id` at load time. If no matching active row exists, the app throws an error.

> **For example:** If your `module_key` is `"metal-app"`, the system looks for a row in the `psb_s_application` table where `module_key = 'metal-app'`. It grabs the `app_id` from that row (say, `5`) and gives it to your module. You never type `app_id: 5` yourself.

### Field Reference

| Field | Required | Purpose |
|-------|----------|---------|
| `key` | Yes | Unique module ID (lowercase, dashes, no spaces) |
| `module_key` | Yes | Matches `module_key` in `psb_s_application`. Core resolves `app_id` from this. |
| `name` | Yes | Display name shown on the dashboard |
| `description` | No | Short text shown under the module card |
| `icon` | No | Font Awesome icon name (e.g. `building`) |
| `group_name` | No | Dashboard group this card belongs to |
| `group_desc` | No | Description for the group |
| `order` | No | Sort order (lower = appears first) |
| `public` | No | If `true`, skip `ModuleAccessGate` — page renders without RBAC check. Used for system pages (login, dashboard). |
| `microfrontend` | No | Links to a child app name in `microfrontends.json`. Only for external modular apps. Enables auto-sync of route paths on build. |
| `routes` | Yes | Array of route definitions (see below) |

### Route Definition

Each route maps a URL to a page file:

```js
{ path: "/metal-buildings/settings", page: "SettingsPage" }
```

- `path` — The URL the user visits. **Must** start with `/`.
- `page` — The filename inside your `pages/` folder, **without** the `.js` extension.

The system resolves `SettingsPage` to `src/modules/metal-buildings/pages/SettingsPage.js`.

**You do not import the component** — core auto-discovers it at runtime.

---

## Server Components vs Client Components

Because page entry files are rendered by Next.js App Router as server components, there's one important rule:

> **In simple terms:** Server components run on the server (like a backend). They can talk to the database directly. Client components run in the user's browser — they handle clicks, forms, and animations. You can't do both in one file, so we split them: the Page file loads data on the server, then hands it to the View file which shows it in the browser.

> **Page entry files in `pages/` must be server components.**
> Do NOT put `"use client"` at the top of a page entry file.

The pattern is:

```js
// pages/DashboardPage.js — server component (no directive)
import { loadData } from "../data/myModule.actions.js";
import DashboardView from "./DashboardView.jsx";

export default async function DashboardPage() {
  const data = await loadData();
  return <DashboardView data={data} />;
}
```

```js
// pages/DashboardView.jsx — client component (all UI here)
"use client";

export default function DashboardView({ data }) {
  return <h1>Hello {data.name}!</h1>;
}
```

This is the standard Next.js App Router pattern with the "Blazor Mirror" layout:
- **Page file** = thin server entry (load data, render view)
- **View file** = all interactive UI, hooks, sub-components in one file

> **In simple terms:** "Blazor Mirror" is just the name we gave this pattern. It means: one file loads data (Page), another file shows it (View). That's it.

---

## Server Actions

Instead of API routes, modules use **Server Actions** for all database mutations. These live in `data/*.actions.js` files with `"use server"` at the top.

> **In simple terms:** A Server Action is a function you write that runs on the server, but you can call it from the browser like a normal function. You put `"use server"` at the top of the file, and Next.js handles the rest. No need to create API endpoints.
>
> **For example:** You write `loadMyData()` in `myModule.actions.js`. Your View file calls `loadMyData()` like any function. Behind the scenes, Next.js sends a request to the server, runs the function, and returns the result. You don't see any of that plumbing.

```js
// data/myModule.actions.js
"use server";

import { getSupabaseAdmin } from "@/core/supabase/admin";

export async function loadMyData() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("my_table").select("*");
  if (error) throw new Error(error.message);
  return data;
}

export async function createRecord(payload) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("my_table").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
```

**Rules:**
1. All `getSupabaseAdmin()` calls go in actions files only.
2. Actions files must start with `"use server"`.
3. Client code (views) can call these functions directly — Next.js handles the network boundary.

   > **For example:** In your View file you just write `const data = await loadMyData()`. You don't need `fetch()` or API URLs. Next.js turns this into a network call automatically.

4. **Do NOT create API routes** (`src/app/api/...`) for module CRUD. Use Server Actions instead.

---

## How Auto-Route Generation Works

Routes are generated automatically by `scripts/generate-routes.js`. This script scans every module's `index.js` for its `routes` array and creates thin `page.js` wrappers inside `src/app/`.

### What the Script Does

1. Scans all `src/modules/**/index.js` files.
2. Reads each module's `routes` array.
3. For each route, generates a `page.js` in the corresponding `src/app/` directory.
4. Each generated file imports the page component directly from the module.
5. Generated files are marked with `// @generated` — the script only overwrites files it owns.
6. Stale generated routes (from deleted modules) are automatically cleaned up.
7. Generates `src/app/rewrites.json` — clean URL rewrites for all `psbpages/` modules (e.g. `/dashboard` → `/psbpages/dashboard`). `next.config.mjs` reads this file automatically.
8. Syncs `microfrontends.json` — if a module has a `microfrontend` field and its route paths changed, the script updates the paths in `microfrontends.json` to match.
9. Prints a Layer 4 reminder — if modules with `microfrontend` fields are detected, it reminds you to check `psb_s_appcard.route_path` in the database.

### Example

Your module's `index.js`:

```js
routes: [{ path: "/metal-buildings", page: "DashboardPage" }]
```

The script generates `src/app/metal-buildings/page.js`:

```js
// @generated — do not edit. Run `npm run gen:routes` to regenerate.
import DashboardPage from "@/modules/metal-buildings/pages/DashboardPage";

export default function Page(props) {
  return <DashboardPage {...props} />;
}
```

### When It Runs

- **`npm run dev`** — runs automatically via `predev` hook before starting the dev server.
- **`npm run build`** — runs automatically via `prebuild` hook before building.
- **`npm run gen:routes`** — run manually at any time.

### Key Rules

- **Never manually create or edit `page.js` files in `src/app/admin/` or `src/app/psbpages/`** — they are auto-generated.
- **Never manually edit `src/app/rewrites.json`** — it is regenerated on every build.
- **Never hardcode rewrites in `next.config.mjs`** — rewrites come from `rewrites.json` automatically.
- Generated files have a `// @generated` marker. The script will not overwrite files that lack this marker.
- If you rename a route in your `index.js`, the old generated file is automatically removed.

**You never need to edit any file outside your module folder.**

---

## Using Auth in Your Module

Use the `useAuth()` hook from core to access the current user's identity and roles:

```js
import { useAuth } from "@/core/auth/useAuth";

function MyFeature() {
  const { authUser, dbUser, roles, loading } = useAuth();

  if (loading) return <p>Loading...</p>;
  if (!dbUser) return <p>No business user found.</p>;

  return <div>User ID: {dbUser.user_id}</div>;
}
```

**Rules:**
1. Call `useAuth()` once and pass state down to child components.
2. Do **not** call `supabase.auth.getUser()` directly in module components.
3. Do **not** build a separate auth provider inside your module.

---

## Card Access Filtering

Core provides `hasCardAccess()` for filtering which features a user can see within your module:

```js
import { hasCardAccess } from "@/core/auth/access";
import { useAuth } from "@/core/auth/useAuth";

function CardsView({ cards, cardRoleAccess }) {
  const { roles } = useAuth();

  const visibleCards = cards.filter((card) =>
    hasCardAccess(card.card_id, roles, cardRoleAccess)
  );

  return visibleCards.map((card) => (
    <div key={card.card_id}>{card.card_name}</div>
  ));
}
```

### SQL Pattern for Loading Cards

```sql
SELECT c.*, g.*
FROM psb_s_appcard c
JOIN psb_m_appcardgroup g ON g.group_id = c.group_id
WHERE c.app_id = :module_app_id
  AND c.is_active = true
ORDER BY g.display_order, c.display_order;
```

Card-role mappings:

```sql
SELECT * FROM psb_m_appcardroleaccess WHERE is_active = true;
```

---

## Scaffolding a New Module

Use the built-in scaffolding command to create a new module — or run it on an existing module to fill in any missing files:

```bash
npm run create-module -- <module-name>
```

**New module:** Creates all 5 files, runs route generator, prints a verification checklist.
**Existing module:** Skips files that already exist (never overwrites your work), runs route generator, prints the same checklist so you can verify everything is in place.

The module name can include a group prefix with a slash:

```bash
# Creates src/modules/metal-buildings/
npm run create-module -- metal-buildings

# Creates src/modules/admin/inventory-tracker/
npm run create-module -- admin/inventory-tracker

# Creates src/modules/psbpages/reports/
npm run create-module -- psbpages/reports

# Run on an existing module to check/fill missing files
npm run create-module -- admin/user-master-setup
```

> *In simple terms:* You can run this command as many times as you want. It won't break anything. If the module exists, it just checks what's missing and fills in the gaps. If everything is there, it shows you a ✅ checklist.

### Registering a Microfrontend (External Modular App)

If your module lives in a **separate repo** (a microfrontend child app), here's how registration works.

**Core's `microfrontends.json` is the single source of truth.** All repos in the microfrontend group must have an identical copy.

#### Step 1: Developer runs `add-mfe` on their repo

Since each app repo is a copy of core, it already has the script:

```bash
# Run on your own repo
npm run add-mfe -- gutter

# Custom fallback URL
npm run add-mfe -- gutter --fallback my-gutter-app.vercel.app
```

This updates `microfrontends.json` in your repo with your app's routing entry.

#### Step 2: Developer sends the file to the senior dev

Send the updated `microfrontends.json` to the senior dev (Slack, Teams, etc.).

#### Step 3: Senior dev merges into core

The senior dev copies the routing entry into core's `microfrontends.json`, commits, and pushes.

#### Step 4: Developer merges core-main

```bash
git checkout core-main
git pull core main
git checkout main
git merge core-main -m "Merge upstream core changes into main"
git push origin main
```

Now all repos have the same `microfrontends.json`.

#### One-time setup (if not already done)

- `@vercel/microfrontends` installed: `npm install @vercel/microfrontends`
- `next.config.mjs` using `withMicrofrontends()`:
  ```js
  import { withMicrofrontends } from '@vercel/microfrontends/next/config';
  const nextConfig = {};
  export default withMicrofrontends(nextConfig);
  ```

#### When a new child app is added later

The senior dev updates core's `microfrontends.json` and pushes. All developers merge core-main to get the updated file automatically.

> *In simple terms:* You run `add-mfe` on your repo, send the file to the senior, they merge it into core and push, then everyone merges core-main to sync.

### What It Generates

```
src/modules/<module-name>/
  index.js                          ← Module definition (pre-filled with your module name)
  data/
    <moduleName>.actions.js         ← "use server" — DB queries (with example code)
    <moduleName>.data.js            ← Client helpers (forms, mappers, constants)
  pages/
    <ModuleName>Page.js             ← Server component (loads data, passes to view)
    <ModuleName>View.jsx            ← "use client" — all UI and interaction
```

It also auto-runs `generate-routes.js` to create the `src/app/` page entry.

Every generated file includes documentation comments explaining what goes there.

### Built-In Checklist

The generated `index.js` includes a full setup checklist as a comment block at the top. It lists:

- **All file paths** your module needs (so you can verify they exist)
- **Auto-generated files** that you must NOT edit
- **Database tables** you need to set up (with the exact `route_path` value)
- **How to verify** everything works (URL to visit, what to look for, troubleshooting)
- **How to update routes** (change path → run build → update DB)

This means your devs can open `index.js` and follow the checklist top to bottom — no need to reference external docs for the basic setup.

### Terminal Output

After running the command, you'll see a summary with ✅/❌ status for every file:

```
════════════════════════════════════════════════════════════
  SETUP COMPLETE: Item Inventory
════════════════════════════════════════════════════════════

  Module files:
    ✅ src/modules/item-inventory/index.js
    ✅ src/modules/item-inventory/pages/ItemInventoryPage.js
    ✅ src/modules/item-inventory/pages/ItemInventoryView.jsx
    ✅ src/modules/item-inventory/data/itemInventory.actions.js
    ✅ src/modules/item-inventory/data/itemInventory.data.js

  Auto-generated (do NOT edit):
    ✅ src/app/item-inventory/page.js
    ✅ src/app/rewrites.json

  Manual steps remaining:
    ☐ Open index.js — set module_key, icon, group_name, order
    ☐ DB: psb_s_application → ensure your app exists
    ☐ DB: psb_s_appcard → add card with route_path = "/item-inventory"
    ☐ DB: psb_m_appcardroleaccess → assign roles
    ☐ Run `npm run dev` → visit http://localhost:3000/item-inventory
    ☐ Verify: page loads with "Item Inventory" heading
    ☐ Verify: unauthorized user sees "No Access"
════════════════════════════════════════════════════════════
```

If you run the command on an **existing** module, it shows `UPDATE COMPLETE` and skips files that already exist.

### Group Prefixes

| Prefix | Folder | Route | Sidebar Group |
|--------|--------|-------|---------------|
| _(none)_ | `src/modules/metal-buildings/` | `/metal-buildings` | You choose |
| `admin/` | `src/modules/admin/inventory-tracker/` | `/admin/inventory-tracker` | Administration |
| `psbpages/` | `src/modules/psbpages/reports/` | `/psbpages/reports` | System |

---

## Step-by-Step: Building a New Module

### 1. Register the App in the Database

If your app doesn't already exist in `psb_s_application`, add a row there first. This gives you an `app_id`.

### 2. Define Roles

Roles are governed centrally. If the needed roles don't exist yet, add them in `psb_s_role`. This is typically done by a senior dev or tech lead.

### 3. Add User-App-Role Mappings

Add rows in `psb_m_userapproleaccess` to link users → roles → your app. This is what gives users access to your module.

### 4. Set Up Cards and Groups

- Create groups in `psb_m_appcardgroup` (defines grouping and display order).
- Create cards in `psb_s_appcard` (defines feature cards and their route paths).
- Create card-role mappings in `psb_m_appcardroleaccess` (links cards to roles).

### 5. Scaffold the Module

Run the scaffolding command (see [Getting Started — Part 5](../01-getting-started/getting-started-v2.md#part-5-the-module-system) for a full walkthrough):

```bash
npm run create-module -- my-module
```

This creates the folder structure with pre-filled files. Then:

1. Open `index.js` — set `module_key`, `icon`, `group_name`, `order`
2. Add server actions in `data/myModule.actions.js`
3. Build your UI in `pages/MyModuleView.jsx`

Each generated file has comments explaining what to do.

### 6. Apply Card Access Checks

Use `hasCardAccess()` to hide/disable features the user shouldn't see.

### 7. Test

1. Login as a user **with** the role mapping → module appears, page loads.
2. Login as a user **without** the mapping → module is hidden, direct URL shows "No Access".

---

## What Modules Must Not Do

1. Modify core files.
2. Implement their own auth system.
3. Create roles or assign user-role mappings.
4. Hardcode permission labels (e.g. `if (roleName === "Admin")`).
5. Store separate auth state in a module-local provider.
6. Define route handlers that bypass core routing.
7. Create API routes (`src/app/api/...`) — use Server Actions instead.
8. Import `getSupabaseAdmin` outside of `"use server"` files.

---

## Updating a Module Path

When you change a route path (e.g. renaming `/metal-buildings` to `/metal`), multiple layers need to stay in sync. Here's what happens automatically and what you need to do manually.

### Step 1 — Change the path in `index.js`

This is the source of truth. Update the `routes` array:

```js
// Before
routes: [{ path: "/metal-buildings", page: "MetalBuildingsPage" }]

// After
routes: [{ path: "/metal", page: "MetalBuildingsPage" }]
```

### Step 2 — Run dev or build

```bash
npm run dev
# or
npm run build
```

This triggers `generate-routes.js`, which auto-fixes three things:

| What | What happens |
|------|-------------|
| Old `src/app/metal-buildings/page.js` | ✅ Deleted automatically |
| New `src/app/metal/page.js` | ✅ Created automatically |
| `src/app/rewrites.json` | ✅ Regenerated with new paths |
| `microfrontends.json` paths | ✅ Updated if module has `microfrontend` field |

### Step 3 — Update the database (manual)

The build will print a reminder like:

```
Layer 4 reminder: If you changed route paths, update psb_s_appcard.route_path in the DB:
  - "Metal Buildings" → route_path = '/metal'
```

Update `psb_s_appcard`:

```sql
UPDATE psb_s_appcard
SET route_path = '/metal'
WHERE route_path = '/metal-buildings';
```

> ⚠️ **If you skip this step**, the dashboard card will link to the old URL and users will get a 404.

### Step 4 — Update the child repo (external apps only)

If this is an external modular app, the **child repo's** `microfrontends.json` is NOT auto-updated (it's in a different repo). Open it and update the paths manually:

```json
"paths": ["/metal", "/metal/:path*"]
```

### Quick Reference

| Layer | Auto-fixed on build? | Manual action needed? |
|-------|---------------------|----------------------|
| Module `index.js` | — | You change it (Step 1) |
| App `page.js` wrappers | ✅ Yes | None |
| Rewrites (`rewrites.json`) | ✅ Yes | None |
| `microfrontends.json` (host) | ✅ Yes (if `microfrontend` field set) | None |
| `microfrontends.json` (child repo) | ❌ No | Update manually |
| Database `psb_s_appcard` | ❌ No | Update `route_path` |

---

## Adding More Pages

Use the `new-page` script to scaffold a new page:

```bash
npm run new-page -- modules/<group>/<module>/index.js <page-slug>
```

Example — add a "settings" page to an admin module:

```bash
npm run new-page -- modules/admin/my-module/index.js settings
```

This will:
1. Create `pages/SettingsPage.js` (server component)
2. Create `pages/SettingsView.jsx` (client component)
3. Add `{ path: "/admin/my-module/settings", page: "SettingsPage" }` to `index.js`
4. Run route generation to create the `src/app/` wrapper

No other files need to change.

### Manual alternative

If you prefer to do it by hand, add a route to `index.js` and create the corresponding page files:

```js
// index.js
routes: [
  { path: "/my-module", page: "DashboardPage" },
  { path: "/my-module/settings", page: "SettingsPage" },  // new
],
```

```js
// pages/SettingsPage.js — server component
import SettingsView from "./SettingsView.jsx";

export default async function SettingsPage() {
  return <SettingsView />;
}
```

```js
// pages/SettingsView.jsx — client component
"use client";

export default function SettingsView() {
  return <h1>Settings</h1>;
}
```

---

## URL to Component Flow

```
User opens /metal-buildings/settings
  → predev hook ran generate-routes.js at startup
  → src/app/metal-buildings/settings/page.js was auto-generated
  → Next.js matches the route to that page.js
  → page.js imports SettingsPage from your module
  → ModuleAccessGate checks app_id authorization (if not public)
  → component renders if authorized
  → "No Access" screen if unauthorized
```

---

## Navigation Within a Module

### Dashboard Navigation

Dashboard links come from filtered module metadata — only authorized modules appear as tiles.

### In-Module Navigation

Use Next.js `Link` for in-module transitions:

```js
import Link from "next/link";

<Link href="/my-module/settings">Settings</Link>
```

### Navigation Do Nots

1. Do **not** hardcode unauthorized routes into static navigation trees.
2. Do **not** assume dashboard filtering alone is enough — core also has a route gate.
3. Do **not** bypass the core route guard logic with custom route handling.

---

## Common Mistakes

| Mistake | Why It's a Problem |
|---------|--------------------|
| Missing `module_key` in module manifest | Core can't resolve `app_id` — module throws an error |
| Duplicate route paths across modules | First matched route is unpredictable |
| Route paths that don't start with `/` | Matching breaks, links are wrong |
| Relying on module-only checks for app entry | Weak route protection model — must use core gate |
| Putting `"use client"` on page entry files | Breaks server-side data loading |
| Wrong `page` filename in routes | Core can't find the file — page won't load |
| Creating API routes for module CRUD | Unnecessary — use Server Actions instead |
| Importing `getSupabaseAdmin` in client files | Build error — `server-only` module can't run in browser |

---

## Checklist Before PR

- [ ] `index.js` exports `key`, `module_key`, `name`, `routes`
- [ ] `module_key` has a matching active row in `psb_s_application`
- [ ] All route paths start with `/` and are unique
- [ ] Route `page` values match actual filenames in `pages/`
- [ ] Page files are server components (no `"use client"`)
- [ ] Module uses `useAuth()` from core
- [ ] Card visibility uses `hasCardAccess()`
- [ ] No hardcoded role names or permissions
- [ ] Authorized users can access the module
- [ ] Unauthorized users see "No Access"

---

## Why Modular Sub-Apps Exist (Architecture Philosophy)

PSBUniverse is a **modular SaaS platform**, not a monolithic app. Think of it like an operating system:

- **Core** = the operating system (auth, RBAC, routing, navigation)
- **Modules** = installed applications (Gutter Calculator, OHD Calculator, etc.)

Windows doesn't break when you update Chrome. That's the level of isolation we aim for.

### Key Principles

1. **Independent versioning** — each module can be updated without touching core or breaking other modules.
2. **Isolation of responsibility** — each module owns its own logic, UI, and workflows. Core does not contain module business logic.
3. **Roles are scoped per application** — a user can be Admin in one app and have no access in another. This is why applications and roles are linked.
4. **Plug-and-play** — new modules are registerable via Application Setup and appear automatically. Adding a new app does not require changing core code.
5. **Team scalability** — different teams work on different modules and deploy independently without stepping on each other.
6. **Locked core** — once core is stable, it rarely changes. Modules evolve around it. If core keeps changing for module needs, the architecture is wrong.

### What Not To Do

- Hardcode module logic inside core.
- Share UI components without proper abstraction.
- Create cross-module dependencies (one module reading another module's data).
- Treat roles as global instead of per-application.

### Success Criteria

You understand this system correctly if:

1. You can add a new module **without touching core**.
2. You can update a module **without affecting others**.
3. You can assign roles **per application**.
4. Core remains stable across changes.
