# Getting Started

This is the complete setup guide for junior developers joining PSBUniverse. Follow every section in order. Run each command **one at a time**. Do not skip steps.

---

## Section 1: Clone Your App Repo

Your app repo (e.g. `PSB_MetalBuildingsApp`) is a fork of PSBUniverse-core. You clone **your app repo**, not core.

### Step 1: Clone

```bash
git clone https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git
cd PSB_MetalBuildingsApp
```

> Replace `PSB_MetalBuildingsApp` with your actual repo name. Ask your tech lead if you don't know it.

### Step 2: Open in VS Code

```bash
code .
```

A new VS Code window opens with the project. Use the terminal in that window from now on.

### Step 3: Confirm you're on `main`

```bash
git branch
```

You should see `* main`. If not:

```bash
git checkout main
```

---

## Section 2: Connect to Core

Your app needs a link to the shared PSBUniverse-core repo so you can pull platform updates.

### Step 4: Add the core remote

```bash
git remote add core https://github.com/PSBUniverse-DEV/PSBUniverse-core.git
```

> If you get "remote core already exists" — that's fine, move on.

### Step 5: Block pushes to core

You must never push your module code to core. This makes it impossible:

```bash
git remote set-url --push core no_push_allowed
```

### Step 6: Verify remotes

```bash
git remote -v
```

You should see four lines:

```
core    https://github.com/PSBUniverse-DEV/PSBUniverse-core.git (fetch)
core    no_push_allowed (push)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (fetch)
origin  https://github.com/PSBUniverse-DEV/PSB_MetalBuildingsApp.git (push)
```

- `origin` = your app repo (where you push your work)
- `core` = the shared platform (read-only — you only pull from here)

### Step 7: Fetch core and create the core-main branch

```bash
git fetch core
git branch core-main core/main
```

> If you get "a branch named 'core-main' already exists" — that's fine, move on.

### Step 8: Initial sync with core

Now pull the latest core into your repo. This is the same process you'll use every time the team announces a core update (Section 6), but you need to do it once during setup:

```bash
git checkout core-main
git pull core main
git checkout main
git rebase core-main
git push origin main --force-with-lease
```

> **If you see conflict errors**, don't panic. See Section 6 (Resolving Conflicts) below.

From now on, whenever the team says "core has been updated", follow **Section 6** — it has the complete step-by-step sync workflow including how to save work first and push after.

---

## Section 3: Prerequisites

Before you can run the app, make sure you have these installed:

| Tool | Minimum Version | Tested With |
|------|-----------------|-------------|
| Node.js | v18+ | v24.14.0 |
| npm | v9+ | v11.9.0 |
| Git | any recent version | — |

You also need access to the team's **Supabase** project. Ask your tech lead for:
- Supabase URL
- Supabase anon key
- Supabase service role key

---

## Section 4: Install and Configure

### Step 9: Install dependencies

```bash
npm install
```

This installs all dependencies: Next.js 16, React 19, Supabase JS, Bootstrap, TanStack Query/Table, FontAwesome, and dnd-kit.

> **PowerShell users:** If `npm` is blocked, use `npm.cmd` instead.

### Step 10: Create `.env.local`

Create a file called `.env.local` in the project root. This file holds your secret keys and is **never committed to git** (it's already in `.gitignore`).

```env
# === REQUIRED ===
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get these values from the Supabase dashboard: **Settings → API**.

#### Optional Variables

These have defaults and you usually don't need to set them:

```env
NEXT_PUBLIC_ENV=local
USER_MASTER_APP_CARD_GROUP_TABLE=psb_m_appcardgroup
USER_MASTER_APP_CARD_TABLE=psb_s_appcard
USER_MASTER_APP_CARD_ROLE_ACCESS_TABLE=psb_m_appcardroleaccess
```

> **Note:** Module `app_id` values are resolved automatically from the `module_key` column in `psb_s_application`. There are no `*_APP_ID` env vars.

#### Environment Modes

The `NEXT_PUBLIC_ENV` variable controls which base URL the app uses (configured in `config/app.js`):

| Value | Base URL | When to Use |
|-------|----------|-------------|
| `local` (default) | http://localhost:3000 | Local development |
| `dev` | Vercel dev URL | Staging |
| `prod` | Production URL | Live deployment |

Do **not** change this to `dev` or `prod` locally unless your tech lead tells you to.

### Step 11: Start the dev server

```bash
npm run dev
```

The app opens at **http://localhost:3000** using **webpack**.

#### What to Expect on First Start

1. A `PackFileCacheStrategy` rename warning in the terminal — this is harmless. Ignore it.
2. The first page load may take a few seconds while webpack compiles.
3. Route files are auto-generated before the server starts (you'll see `gen:routes` output in the terminal).

### Step 12: Verify the app works

1. Open **http://localhost:3000** in your browser.
2. You should see the **login page**.
3. Sign in with your test account credentials (ask your tech lead if you don't have one).
4. After login, you should land on the **dashboard**.

### Step 13: Verify the build

Before starting any feature work, make sure the project builds without errors:

```bash
npm run build
```

If the build fails on a fresh clone, **do not try to fix it** — report it to your tech lead.

### Step 14: Run the linter

```bash
npm run lint
```

Fix any lint errors in your code before submitting a pull request.

---

## Section 5: Git Setup and Daily Workflow

### First-Time Git Config (Once Per Computer)

Before you can push, git needs to know who you are.

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Verify:

```bash
git config --global user.name
git config --global user.email
```

### Pushing Your Work (Every Time)

This is your daily workflow:

```bash
# 1. Make sure you're on main
git checkout main

# 2. Stage all changes
git add -A

# 3. Commit with a clear message
git commit -m "feat: add Metal Buildings module with initial config"

# 4. Push to your app repo
git push origin main
```

> **If you get "rejected"** — someone else pushed changes you don't have. Run `git pull origin main --rebase` then push again.

---

## Section 6: Syncing Core Updates

Only do this when the team says "the core has been updated." Do NOT do this on your own.

### Step-by-Step Sync

```bash
# 1. Save your current work
git add -A
git commit -m "wip: save work before syncing core"

# 2. Update core-main
git checkout core-main
git pull core main

# 3. Rebase your work on top of the updated core
git checkout main
git rebase core-main

# 4. Push (force needed because rebase rewrites history)
git push origin main --force-with-lease
```

> `--force-with-lease` is safer than `--force` — it refuses if someone else pushed to the branch since your last fetch.

### Resolving Conflicts

If git pauses during the rebase and reports conflicts:

1. Open the conflicted file — look for `<<<<<<<`, `=======`, `>>>>>>>` markers.
2. Decide which version to keep (or combine both). Delete the markers.
3. Save the file, then:

```bash
git add path/to/the/file.js
git rebase --continue
```

4. Repeat for any other conflicted files.

To abort and go back to how things were before the rebase:

```bash
git rebase --abort
```

**If you're unsure about a conflict, ask a senior dev for help.**

---

## Available npm Scripts

| Command | What It Does |
|---------|-------------|
| `npm run create-module -- <name>` | Scaffold a new module with all required files (e.g. `npm run create-module -- metal-buildings`) |
| `npm run dev` | Auto-generates routes, starts local dev server on port 3000 |
| `npm run build` | Auto-generates routes, creates a production build (run before every PR) |
| `npm run gen:routes` | Manually regenerate route files from module definitions |
| `npm run start` | Serve the production build locally |
| `npm run lint` | Run ESLint checks |

---

## Key URLs

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Main app |
| http://localhost:3000/login | Login page |
| http://localhost:3000/dashboard | Dashboard (after login) |
| http://localhost:3000/examples | Shared UI guide and playground |
| http://localhost:3000/examples/data-table | Data table reference example |
| http://localhost:3000/admin/application-setup | Admin: application setup |

---

## Project Structure

```
scripts/        ← Auto-route generator (do not edit)
src/
  app/          ← Auto-generated route files (do not edit)
  core/         ← Auth, layout, Supabase clients (DO NOT MODIFY)
  modules/      ← Your module code lives here
    admin/      ← Admin setup modules
    psbpages/   ← Platform pages (dashboard, login, profile)
  shared/       ← Shared UI components and utilities (DO NOT MODIFY)
  styles/       ← Global CSS and theme variables
config/         ← App configuration
docs/           ← Documentation
```

**Rules:**
1. Your work goes inside `src/modules/`. Use `npm run create-module -- <name>` to scaffold a new module.
2. Do **not** edit files in `src/core/`, `src/shared/`, `src/app/`, or `scripts/` without lead approval.
3. Route files in `src/app/` are auto-generated — never create or edit them manually.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails | Delete `node_modules` and `package-lock.json`, then run `npm install` again |
| Port 3000 already in use | Kill the other process, or run `PORT=3001 npm run dev` |
| Supabase connection errors | Double-check your `.env.local` values against the Supabase dashboard |
| Login redirects back to login | Check `.env.local`, check browser console for auth errors |
| Build fails on fresh clone | Don't fix it — report to tech lead |
| PowerShell blocks npm | Use `npm.cmd` instead of `npm` |
| `remote core already exists` | Already set up — move on |
| `branch core-main already exists` | Already set up — move on |
| Rebase conflict you don't understand | Run `git rebase --abort` and ask a senior dev |
| `rejected — failed to push` | Run `git pull origin main --rebase` then push again |
| `Make sure you configure user.name` | Go to Section 5 and run the `git config` commands |

---

## Quick Reference Card

| What you want to do | Command |
|---|---|
| Check what branch you're on | `git branch` |
| Switch to main | `git checkout main` |
| Stage all changes | `git add -A` |
| Commit your work | `git commit -m "your message"` |
| Push your work | `git push origin main` |
| Sync core updates | See Section 6 |

---

## Rules

1. **Always work on `main`** (or a feature branch). Never commit your work to `core-main`.
2. **`core-main` is read-only.** It's a mirror of the shared core. Don't touch it.
3. **Never push to `core`.** Only push to `origin`.
4. **Never edit files in `src/app/`.** Route files are auto-generated.
5. **Never edit files in `src/core/` or `src/shared/`** without lead approval.
6. **Commit often.** Small commits with clear messages are better than one giant commit.
7. **`.env*` files are excluded by `.gitignore`** — never commit credentials.
