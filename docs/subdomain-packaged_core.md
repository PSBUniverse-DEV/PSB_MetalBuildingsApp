# Subdomain & Packaged Core — Architecture Plan

This document explains why we are moving away from Vercel's microfrontend system, what we are replacing it with, and how to get there step by step.

---

## Why We Are Changing

We originally set up PSBUniverse using Vercel's `@vercel/microfrontends` package. This was meant to let multiple apps share routes under one domain, like a single unified app.

But in practice, our apps are **not** true microfrontends. They are **independent standalone apps** that the core portal links to via cards. Each app:

- Has its own repo
- Has its own Vercel deployment
- Has its own build pipeline
- Can run completely on its own

The microfrontend layer adds complexity (extra config files, extra dependencies, routing rules) without giving us anything we actually use. It also creates confusion about what our architecture really is.

**What we actually have is a Portal Pattern:**

```
PSBUniverse Core (the portal)
├── Handles login and authentication
├── Shows the dashboard with app cards
├── Manages user roles and permissions
├── Provides shared layout (header, sidebar)
└── Links out to module apps:
    ├── PSB_MetalBuildingsApp (metal buildings configurator)
    └── PSB_GutterApp (gutter estimator)
```

Each module app is a full copy of core's shared code (auth, UI components, layout) kept in sync via `sync-repo.ps1`, plus its own domain-specific modules.

---

## What Is Shared Across All 3 Repos

All three repos contain identical copies of these folders, kept in sync by merging from the core git remote:

```
Shared code (synced via git):
├── src/core/
│   ├── auth/           — login, session, role checks, AuthProvider
│   ├── layout/         — AppLayout wrapper
│   └── supabase/       — database client setup
├── src/shared/
│   ├── components/
│   │   ├── layout/     — Header, PageContainer
│   │   └── ui/         — TableZ, Button, Modal, Card, Toast, icons, etc.
│   └── utils/          — databind helpers, navbar loader, toast system
├── scripts/
│   ├── generate-routes.js
│   ├── create-module.js
│   └── sync-repo.ps1
├── config/
│   └── app.js          — environment URLs for all apps
└── docs/               — architecture docs, guides
```

What is **unique** to each repo:

```
PSBUniverse-core:
└── src/modules/
    ├── admin/          — application-setup, card-module-setup, user-master, etc.
    └── psbpages/       — dashboard, login, profile, documentation, examples

PSB_MetalBuildingsApp:
└── src/modules/
    └── metal-buildings/ — 3D configurator, building specs, Three.js renderer
    (also has three.js, @react-three/fiber, @react-three/drei as extra dependencies)

PSB_GutterApp:
└── src/modules/
    └── gutter/         — gutter estimator, pricing, specs
```

### How Sync Works — One-Way Downstream Only

This is a critical architectural rule: **code flows from core to modules, never the other way.**

```
Sync direction:

               PSBUniverse-core
                  (upstream)
                  /       \
                 /         \
                ↓           ↓
         Metal Repo     Gutter Repo
          (consumer)     (consumer)
```

When a module repo runs `sync-repo.ps1`, this is what happens:

```
What sync-repo.ps1 does:
├── 1. Pull latest main from origin (the module repo's own remote)
├── 2. Fetch latest from core remote into core-main branch
├── 3. Merge core-main into main (core changes flow into the module repo)
└── 4. Push main to origin (the module repo's own remote — NOT to core)
```

What sync-repo.ps1 NEVER does:

```
FORBIDDEN:
├── git push core main       — NEVER push to core from a module repo
├── git push core anything   — module repos are consumers, not contributors
└── Any modification of core's remote history
```

Why this matters: if modules could push upstream, a junior dev's accidental edit to shared UI or auth could corrupt the source of truth for ALL apps simultaneously.

To enforce this, `sync-repo.ps1` disables the push URL for the core remote every time it runs:

```
git remote set-url --push core no_push_allowed
```

This means even if someone accidentally types `git push core main`, git will reject it. The governance is baked into the script itself.

---

## Phase 1 — Remove Microfrontend Plumbing

**Goal:** Strip out the Vercel microfrontend layer from all 3 repos. Nothing changes visually — apps still work the same. We just remove unnecessary complexity.

**What to do in PSBUniverse-core first, then sync to the other repos:**

```
Files to DELETE:
├── microfrontends.json              — microfrontend routing config (not needed)
└── scripts/add-microfrontend.js     — script to register new MFE apps (not needed)

Files to EDIT:
├── package.json
│   └── Remove "@vercel/microfrontends" from dependencies
├── next.config.mjs
│   └── Remove the "import { withMicrofrontends }" line
│   └── Remove the "withMicrofrontends()" wrapper
│   └── Just do: export default nextConfig;
└── config/app.js
    └── Add ALL module app URLs so every repo knows about every app:
        modules: {
          core: "...",
          metal: "...",
          gutter: "...",
        }
```

**After editing core:**

- Run `npm install` to update the lockfile
- Run `npm run build` to verify nothing broke
- Commit and push
- In Metal and Gutter repos, run `sync-repo.ps1` to pull in the changes
- Run `npm install` and `npm run build` in each to verify

---

## Phase 2 — Cross-App Navigation

**Goal:** Make sure users can move between apps smoothly.

```
How navigation should work:
├── Core portal (dashboard)
│   ├── User sees app cards
│   ├── Clicks "Metal Buildings" card
│   │   └── Browser navigates to metal app URL (from config/app.js)
│   └── Clicks "Gutter" card
│       └── Browser navigates to gutter app URL (from config/app.js)
│
├── Metal Buildings app
│   ├── Header shows "Back to Portal" link
│   │   └── Uses buildAbsoluteAppUrl("/dashboard") to go back to core
│   └── Can also link to Gutter if needed
│       └── Uses buildModuleUrl("gutter", "/") from config/app.js
│
└── Gutter app
    ├── Header shows "Back to Portal" link
    │   └── Uses buildAbsoluteAppUrl("/dashboard") to go back to core
    └── Can also link to Metal if needed
        └── Uses buildModuleUrl("metal", "/") from config/app.js
```

**Key rule:** Every repo's `config/app.js` lists ALL sibling apps, not just the ones it directly links to. This keeps things consistent and makes future cross-linking easy.

---

## Phase 3 — Custom Domain & Shared Auth

**Goal:** Move from random `.vercel.app` domains to professional subdomains under one brand domain. This also makes authentication work seamlessly across all apps.

### The Problem Right Now

```
Current (dev) domains:
├── psbuniverse-dev.vercel.app        — core portal
├── psb-metal-buildings-app.vercel.app — metal app
└── psb-gutter-app.vercel.app         — gutter app
```

These are completely separate domains. That means:

- Login cookies do NOT carry over between apps
- Users have to log in again when switching apps
- Sessions are isolated per domain

### The Solution — Subdomains

```
Production domains (after setup):
├── portal.psbuniverse.com    → PSBUniverse-core Vercel project
├── metal.psbuniverse.com     → PSB_MetalBuildingsApp Vercel project
└── gutter.psbuniverse.com    → PSB_GutterApp Vercel project
```

Because these are all under `.psbuniverse.com`, browsers can share cookies across them. That means:

- User logs in on `portal.psbuniverse.com`
- Cookie is set for `.psbuniverse.com` (note the dot — means "all subdomains")
- When user clicks through to `metal.psbuniverse.com`, the cookie is already there
- No re-login needed

### Steps To Set This Up

```
Domain setup:
├── 1. Buy psbuniverse.com
│   └── Recommended: Cloudflare (cheap renewals, good DNS management)
│
├── 2. Set up Cloudflare DNS records
│   ├── portal.psbuniverse.com → CNAME to cname.vercel-dns.com
│   ├── metal.psbuniverse.com  → CNAME to cname.vercel-dns.com
│   └── gutter.psbuniverse.com → CNAME to cname.vercel-dns.com
│
├── 3. In each Vercel project, add the custom domain
│   ├── PSBUniverse-core        → portal.psbuniverse.com
│   ├── PSB_MetalBuildingsApp   → metal.psbuniverse.com
│   └── PSB_GutterApp           → gutter.psbuniverse.com
│
├── 4. Configure Supabase auth cookies
│   └── Set cookie domain to ".psbuniverse.com"
│   └── This makes the auth session available on all subdomains
│
└── 5. Update config/app.js prod URLs
    └── modules: {
          core: "https://portal.psbuniverse.com",
          metal: "https://metal.psbuniverse.com",
          gutter: "https://gutter.psbuniverse.com",
        }
```

### Why Cloudflare Instead of Vercel for DNS

```
Cloudflare advantages:
├── Better DNS management UI (you will have many subdomains eventually)
├── Free DDoS protection and caching
├── Cheaper domain renewals (near wholesale pricing)
├── If you ever leave Vercel, DNS stays untouched (less vendor lock-in)
└── Industry standard combo: Cloudflare DNS + Vercel hosting
```

---

## Phase 4 — Shared Package Extraction (Future)

**Goal:** Replace the git-sync approach with proper npm packages. **Only do this when git-sync becomes painful.**

Right now, `sync-repo.ps1` merges core changes into module repos via git. This works fine for 3 repos. But if you eventually have 5+ module apps and merge conflicts happen weekly, it is time to extract shared code into installable packages.

```
Future package structure (only when needed):
├── @psb/ui
│   ├── TableZ, Button, Modal, Card, Toast
│   ├── icons, AppIcon
│   └── SearchBar, Dropdown, Input, Badge, StatusBadge
│
├── @psb/auth
│   ├── AuthProvider, useAuth
│   ├── bootstrap.actions
│   ├── access.js (hasAppAccess, hasCardAccess)
│   └── ModuleAccessGate
│
├── @psb/core
│   ├── supabase client setup
│   ├── AppLayout
│   └── Header, PageContainer
│
└── @psb/utils
    ├── databind helpers
    ├── navbar loader
    └── toast system
```

**When to extract:** When sync-repo merge conflicts become a weekly problem, or when you add a 4th or 5th module app.

**When NOT to extract:** Right now. 3 repos with git-sync is perfectly manageable.

---

## Phase 5 — Protecting Shared Code from Accidental Edits

**Goal:** Prevent junior devs working in module repos (Metal, Gutter) from accidentally modifying shared code that comes from core. This is the biggest real-world risk in our architecture.

### The Problem

After `sync-repo.ps1` runs, the shared folders (`src/core/`, `src/shared/`, `config/`, `scripts/`) land in the module repo as normal editable files. Nothing stops a developer from changing them. If they do:

```
What goes wrong:
├── Junior dev edits src/shared/components/ui/TableZ.js in Gutter repo
├── Their change works locally
├── They commit and push
├── Next time sync-repo.ps1 runs, MERGE CONFLICT
│   └── Core has the "real" version, Gutter has a rogue edit
├── Even worse: if the conflict is resolved wrong, the rogue edit wins
└── Now Gutter's TableZ behaves differently from Core's and Metal's
    └── Silent UI drift that nobody notices until something breaks
```

This is not a hypothetical — it WILL happen eventually.

### The Rule

```
In module repos (Metal, Gutter, and any future apps):

PROTECTED (do NOT edit — owned by core):
├── src/core/       — auth, supabase, layout
├── src/shared/     — UI components, utils
├── config/         — environment URLs
├── scripts/        — build and sync scripts
├── docs/           — architecture documentation
└── src/styles/     — global CSS and theme

YOUR CODE (edit freely — this is your module's own stuff):
├── src/modules/    — your module's pages, data, actions
├── src/app/        — your app's page routes
├── .env.local      — your environment variables
└── package.json    — ONLY to add module-specific dependencies
```

### Single Source of Truth — `config/protected-paths.json`

The protected folder list above needs to be used by sync-repo.ps1, the pre-commit hook, the CI workflow, and this document. If those paths are hardcoded in 4 different places, someone will eventually update one and forget the others — and then governance itself drifts.

To prevent that, we store the protected paths in one machine-readable file that all tools read from:

```
config/protected-paths.json
```

Contents:

```json
{
  "protected": [
    "src/core/",
    "src/shared/",
    "config/",
    "scripts/",
    "docs/",
    "src/styles/"
  ]
}
```

Then:

```
What reads this file:
├── sync-repo.ps1       — loads the list, checks for changes in those folders
├── pre-commit hook     — loads the list, blocks commits touching those folders
├── CI workflow          — loads the list, fails PRs modifying those folders
└── If you add a new protected folder later:
    └── Update this ONE file
    └── All tools pick it up automatically after sync
```

This file lives in `config/` which is itself protected and synced from core. Junior devs cannot modify it — the governance rules protect the governance config.

### Primary Protection — Sync-Repo Guard (built into the workflow)

Junior devs are already required to run `sync-repo.ps1` before starting work. This makes it the perfect place to add a guard — it checks whether the developer has modified any protected core files and blocks the sync until they revert.

```
How it works:
├── Developer opens their module repo to start work
├── Developer runs sync-repo.ps1 (as required)
├── BEFORE the script does anything, it checks:
│   │
│   ├── Step A: Check uncommitted changes (working tree + staged files)
│   │   └── "Did you modify any file in src/core/, src/shared/, config/, scripts/, docs/, or src/styles/?"
│   │
│   └── Step B: Check committed changes (your commits since last sync)
│       └── "Did any of your recent commits touch those same folders?"
│
├── If YES to either check:
│   ├── Script prints a clear error:
│   │   └── "WARNING: You have modified core files that are owned by PSBUniverse-core."
│   │   └── "These files are synced from core and should NOT be edited in module repos."
│   │   └── ""
│   │   └── "Modified core files:"
│   │   └── "  - src/shared/components/ui/Button.js"
│   │   └── "  - src/core/auth/useAuth.js"
│   │   └── ""
│   │   └── "What to do:"
│   │   └── "  1. Revert these changes: git checkout -- <file>"
│   │   └── "  2. If you need to change shared code, do it in PSBUniverse-core instead"
│   │   └── "  3. Then run sync-repo.ps1 to pull your core changes into this repo"
│   │
│   └── Script STOPS — sync does not proceed
│
└── If NO to both checks:
    └── Sync proceeds normally (pull, merge, push)
```

**Why this is the best primary guard:**

```
Advantages:
├── Already in the workflow — jr devs already run this script
├── Controlled by core — sync-repo.ps1 is synced from PSBUniverse-core
│   └── Jr devs cannot remove or weaken the guard
├── Lists the exact files — dev sees what they need to revert
├── Teaches the right workflow — error message tells them to fix in core instead
├── No extra tooling — no hooks to install, no CI to set up
├── Zero setup for jr devs — the protection is already inside the script they run
└── Enforces push protection — runs "git remote set-url --push core no_push_allowed" every sync
    └── Even if someone reconfigures their git remotes, the next sync re-locks it
```

**What it catches vs. what it misses:**

```
Catches:
├── Uncommitted changes to protected folders (most common jr dev mistake)
├── Staged changes to protected folders
└── Committed changes since the last sync (compares against core-main branch)

Misses:
├── A dev who commits + pushes a core file change and does NOT run sync-repo
│   └── The rogue change sits in the remote until the next sync
│   └── But this gap is small if syncs happen frequently (daily or before each work session)
│
└── Nothing stops the commit itself — it is a check-at-sync-time, not a block-at-commit-time
```

**Is this enough on its own?** No — not for a team of 5-7 devs. The gap (committing a core change between syncs) is too likely when multiple people are working simultaneously. Someone will commit and push a core file change without syncing first. The sync-repo guard is a great first layer, but it needs backup.

### Protection Layer 2 — Git Pre-Commit Hook (catches mistakes at commit time)

This is the most important backup layer. It runs automatically before every commit and blocks any commit that touches protected folders. Unlike the sync-repo guard, this catches the mistake **before** it reaches the remote repo.

```
How it works:
├── Developer modifies src/shared/components/ui/Button.js
├── Developer runs "git commit"
├── Pre-commit hook fires BEFORE the commit is created
├── Hook checks: "did any staged file touch a protected folder?"
├── Answer: YES
├── Hook prints:
│   └── "ERROR: You are editing shared core files."
│   └── "These are owned by PSBUniverse-core."
│   └── "Make your changes in PSBUniverse-core and run sync-repo.ps1 instead."
│   └── ""
│   └── "Protected files you modified:"
│   └── "  - src/shared/components/ui/Button.js"
│   └── ""
│   └── "To revert: git checkout -- src/shared/components/ui/Button.js"
├── Commit is REJECTED — nothing reaches the repo
└── Developer reverts their change and makes the fix in core instead
```

**Why this matters for 5-7 devs:**

```
Without pre-commit hook:
├── Dev A modifies src/shared/components/ui/TableZ.js
├── Dev A commits and pushes (sync-repo guard doesn't fire — it only runs when YOU run it)
├── Dev B runs sync-repo.ps1 next day
├── MERGE CONFLICT between core's TableZ and Dev A's rogue edit
├── Dev B doesn't know which version is correct
└── Chaos

With pre-commit hook:
├── Dev A modifies src/shared/components/ui/TableZ.js
├── Dev A tries to commit
├── Hook blocks the commit immediately
├── Dev A sees the error, reverts, and makes the change in core instead
└── Problem never reaches the repo
```

The hook file lives at `.git/hooks/pre-commit` in each module repo. Since `.git/hooks/` is not tracked by git, we keep a copy at `scripts/hooks/pre-commit` and devs install it manually when setting up the repo.

### Protection Layer 3 — CODEOWNERS (requires senior approval for PRs)

Pre-commit hooks are local — they can be skipped with `git commit --no-verify`, or a dev might not have them installed. CODEOWNERS is the server-side safety net on GitHub.

```
How it works:
├── Developer opens a PR that modifies src/shared/components/ui/TableZ.js
├── GitHub sees CODEOWNERS rule: "/src/shared/ @senior-dev-username"
├── GitHub automatically requests review from @senior-dev-username
├── PR CANNOT be merged without their approval
└── Even if the hook was skipped, the change cannot land without senior review

CODEOWNERS rules for module repos:
├── /src/core/          @senior-dev-username
├── /src/shared/        @senior-dev-username
├── /config/            @senior-dev-username
├── /scripts/           @senior-dev-username
├── /docs/              @senior-dev-username
└── /src/styles/        @senior-dev-username

CODEOWNERS rules for core repo:
├── /src/core/          @senior-dev-username
├── /src/shared/        @senior-dev-username
└── /config/            @senior-dev-username
```

The CODEOWNERS file lives at `.github/CODEOWNERS` in each repo.

**Note:** CODEOWNERS requires GitHub branch protection rules to be enabled on the `main` branch. Without branch protection, CODEOWNERS is just a suggestion, not an enforcement.

### Protection Layer 4 — GitHub Actions CI Check (strongest enforcement)

This is the final safety net. It runs on every pull request and fails the build if any protected files were modified. Unlike hooks (local) and CODEOWNERS (can be dismissed by admins), a required CI check physically blocks the merge button.

```
How it works:
├── Developer pushes a branch with changes to src/shared/
├── GitHub Actions workflow runs automatically on the pull request
├── Workflow checks: "did any changed file touch a protected folder?"
├── Answer: YES
├── Workflow FAILS with a clear error message:
│   └── "This PR modifies protected core files that are owned by PSBUniverse-core."
│   └── "Protected files changed:"
│   └── "  - src/shared/components/ui/Button.js"
│   └── "Remove these changes and make them in PSBUniverse-core instead."
├── PR cannot be merged until the protected file changes are removed
└── This catches EVERYTHING — hooks skipped, CODEOWNERS dismissed, whatever
```

This is a GitHub Actions workflow file (`.github/workflows/protect-core.yml`) in each module repo.

### Protection Layer 5 — VS Code Read-Only Mode (prevents editing in the IDE)

VS Code has a built-in feature called `files.readonlyInclude` that marks files as read-only inside the editor. No extensions needed. This is the most seamless protection layer — devs literally cannot type in protected files.

**Important:** The readonly settings are NOT tracked in `.vscode/settings.json` in core. If they were, the senior dev would be locked out of editing shared code in the core repo too — VS Code has no way to detect which repo you're in.

Instead, `scripts/setup.ps1` adds the readonly rules only in module repos. It detects the repo type by counting git remotes — if the only remote points to PSBUniverse-core, it is the core repo (senior dev, push allowed). If there are 2+ remotes (origin + core), or the single remote points elsewhere (fresh module clone), it is a module repo and gets the readonly rules.

**The approach: lock everything, unlock only your module.**

setup.ps1 scans `src/modules/` and treats any folder that is NOT a core group (`admin`, `psbpages`) as the jr dev's own module. Those folders get excluded from readonly. Everything else stays locked.

```
How it works:
├── Core repo (PSBUniverse-core)
│   ├── 1 remote (PSBUniverse-Core) → senior dev detected
│   ├── .vscode/settings.json has NO readonly rules (tracked in git)
│   └── Senior dev edits everything freely
│
└── Module repos (Metal, Gutter)
    ├── 2+ remotes (origin + core) → jr dev detected
    ├── Jr dev runs setup.ps1 once after cloning
    ├── setup.ps1 scans src/modules/ for non-core folders
    │   └── e.g. finds metal-buildings/ (not admin/ or psbpages/)
    ├── Sets files.readonlyInclude to ** (everything locked)
    └── Sets files.readonlyExclude to unlock only dev's module + .env
```

Example: a jr dev in the Metal repo who ran `create-module -- metal-buildings` gets:

```json
"files.readonlyInclude": {
    "**": true
},
"files.readonlyExclude": {
    "**/.env*": true,
    "**/src/modules/metal-buildings/**": true
}
```

This means the dev can only type in their own module folder and `.env.local`. Everything else — `src/core/`, `src/shared/`, `config/`, `scripts/`, even `src/modules/admin/` — is read-only in VS Code.

```
What happens in VS Code after setup:
├── Protected files are still visible, searchable, and navigable
├── IntelliSense and Go-to-Definition still work on them
├── BUT the editor blocks typing — you literally cannot edit the file
├── VS Code shows a "read-only" indicator in the tab
├── Terminal commands (npm, git, node scripts) still work normally
│   └── Readonly is editor-only, not filesystem-level
└── If a new module is created later, re-run setup.ps1 to unlock it
```

**Why this is stronger than listing protected folders:** Instead of hoping you listed every folder that should be locked, you lock everything and only unlock what the dev actually needs. Any new file or folder added to core is automatically protected — zero maintenance.

**What it does NOT do:** This is editor-level only, not actual security. A dev can still edit files outside VS Code, or remove the readonly setting from their local `.vscode/settings.json`. That is why pre-commit hooks and CI are still required — they catch what the editor cannot.

**Sync safety:** Since setup.ps1 writes the readonly rules to `.vscode/settings.json` locally, and sync-repo merges from core (which does NOT have the readonly rules), there is no merge conflict. Core controls the base settings, setup.ps1 adds the module-repo-only readonly rules on top.

### Protection Layer 6 — README Warnings in Protected Folders

Every protected folder gets a small README that warns developers not to edit files there. This is the weakest layer — it relies on devs reading it — but it costs nothing and helps on platforms where VS Code readonly does not apply (e.g. browsing files on GitHub, or using a different editor).

```
Files to add (in core, then synced to all repos):
├── src/core/README.md
│   └── "WARNING: This folder is synced from PSBUniverse-core.
│        Do NOT modify in module repos. Changes will be overwritten
│        by sync-repo.ps1. Make changes in PSBUniverse-core instead."
│
├── src/shared/README.md
│   └── Same warning message
│
├── config/README.md
│   └── Same warning message
│
└── scripts/README.md
    └── Same warning message
```

### How All Layers Work Together

```
Defense in depth for 5-7 devs (weakest → strongest):
│
├── Layer 6: README warnings
│   └── Dev reads the warning and doesn't touch the file
│   └── (Weakest — relies on reading. Useful on GitHub.)
│
├── Layer 5: VS Code read-only mode
│   └── Dev opens a protected file, cannot type
│   └── (Good — instant feedback. Added by setup.ps1 in module repos only.)
│
├── Layer 1: sync-repo.ps1 guard
│   └── Dev runs sync before work, sees they modified a core file, reverts
│   └── (Good — but only fires when they sync)
│
├── Layer 2: Pre-commit hook
│   └── Dev tries to commit a core file change, gets blocked immediately
│   └── (Strong — catches at commit time, before it reaches the repo)
│
├── Layer 3: CODEOWNERS
│   └── Dev somehow commits and opens a PR, senior must approve
│   └── (Strong — server-side, but can be dismissed by admin)
│
└── Layer 4: GitHub Actions CI check
    └── PR fails the build, merge button is blocked
    └── (Strongest — cannot be bypassed without disabling the workflow)
```

### What to Implement and When

```
DO NOW (before junior devs start working):
├── Layer 5: VS Code read-only mode
│   └── Added by setup.ps1 in module repos only (core stays editable)
│   └── Jr devs get it automatically when they run setup.ps1
├── Layer 6: README warnings in protected folders
│   └── Add in core, syncs to all repos automatically
├── Layer 1: sync-repo.ps1 guard
│   └── Add in core, syncs to all repos automatically
├── Layer 2: Pre-commit hook
│   └── Add scripts/hooks/pre-commit in core (syncs to all repos)
│   └── Devs copy to .git/hooks/pre-commit manually during setup
└── Layer 3: CODEOWNERS
    └── Add .github/CODEOWNERS in each repo
    └── Enable branch protection on main branch in GitHub settings

DO SOON (when CI/CD is set up):
└── Layer 4: GitHub Actions CI check
    └── Add .github/workflows/protect-core.yml in each module repo
    └── Mark as required check in GitHub branch protection settings
```

### Governance Boundary — What This Protects vs. What Stays Fast

All of the above protects **shared infrastructure only**. Module-specific code is completely unguarded and should stay that way.

```
GOVERNED (protected, reviewed, controlled):
├── src/core/       — shared auth, layout, supabase
├── src/shared/     — shared UI components, utils
├── config/         — environment URLs, protected-paths.json
├── scripts/        — build and sync scripts
├── docs/           — architecture documentation
└── src/styles/     — global CSS and theme

UNGOVERNED (fast, free, no approvals needed):
├── src/modules/    — all feature development happens here
├── src/app/        — page routes (mostly auto-generated)
└── .env.local      — environment variables
```

If governance starts slowing down feature development inside `src/modules/`, something is wrong. The whole point is:

```
Protect the foundation. Let the features move fast.
```

Do not add approval requirements, hooks, or CI checks for module-specific code. That kills iteration speed for no benefit.

### Future Concern — Protected Dependencies in package.json

Not urgent, but worth knowing about: junior devs in module repos can currently upgrade shared dependencies like React, Next.js, Bootstrap, or Supabase. If one module repo upgrades React to a different major version than core, things can break silently across apps.

```
The risk:
├── Core uses react@19.2.4
├── Jr dev in Gutter repo runs "npm update" or manually bumps react
├── Gutter now uses react@20.x
├── Shared components (synced from core) were built for react@19
├── Subtle rendering bugs appear only in Gutter
└── Nobody knows why until someone checks the version mismatch
```

This is NOT something to solve now. But when the team grows or you start seeing version-related bugs across repos, consider adding a list of "core-controlled dependencies" to `config/protected-paths.json` and having the pre-commit hook or CI check for version changes in those deps.

---

## Summary of Key Decisions

```
Decisions made:
├── Architecture: Portal pattern, NOT runtime microfrontends
│   └── Core links to independent apps via cards
│
├── Code sharing: Git-sync (sync-repo.ps1) for now
│   └── Upgrade to npm packages only when pain is real
│
├── Domains: Subdomains under one brand domain
│   └── Enables shared auth cookies across all apps
│
├── DNS provider: Cloudflare (recommended)
│   └── Hosting stays on Vercel
│
├── Config consistency: Every repo lists ALL sibling app URLs
│   └── Makes cross-app linking easy and predictable
│
├── Repository governance: 6-layer defense for shared code in module repos
│   ├── config/protected-paths.json — single source of truth for scripts
│   ├── VS Code read-only mode — prevents editing in the IDE (zero setup)
│   ├── sync-repo.ps1 guard — catches at sync time
│   ├── Pre-commit hook — catches at commit time
│   ├── CODEOWNERS — requires senior approval on PRs
│   ├── GitHub Actions CI — blocks merge if protected files changed
│   └── README warnings in every protected folder
│
├── Governance boundary: protect the foundation, let features move fast
│   ├── Shared infra (src/core, src/shared, config, scripts) — governed
│   └── Module code (src/modules) — ungoverned, fast, no approvals
│
└── Don't over-split: 3 apps is fine
    └── Do NOT create separate apps for trim, windows, doors, etc.
    └── Keep those as modules inside the relevant app
```
