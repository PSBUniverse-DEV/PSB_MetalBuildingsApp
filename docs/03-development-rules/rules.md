# Development Rules

These are the non-negotiable rules for building anything inside PSBUniverse. Every developer must follow these.

Breaking these rules can break RBAC, module consistency, and platform stability.

---

## Core Principles

1. **Modules do not define systems.** Modules only build features.
2. **Shared components are the single source of truth.** All UI comes from `shared/components/ui`.
3. **Logic lives in the module, not inside shared UI components.** The module controls data, filters, and state. Shared components render and emit events.
4. **Core is infrastructure.** It handles auth, RBAC, routing, and layout. Modules consume core services — they don't replace them.

---

## UI Rules

### Do

- Import all UI from `@/shared/components/ui`:

  ```js
  import { Button, TableZ, Modal } from "@/shared/components/ui";
  ```

- Follow consistent spacing, layout, and styling.
- Handle all UI states: loading, empty, error, no-access.

### Do Not

- Create your own `Button`, `Modal`, or `TableZ` inside a module.
- Use random inline styles.
- Override shared component styles from module code.
- Redesign the app shell layout.

---

## Module Rules

### Module Structure

```
src/modules/<module-name>/
  index.js
  data/
  pages/
```

### Module Is Responsible For

- Defining pages
- Managing state
- Fetching data
- Defining filters
- Configuring the table

### Module Must Not

- Modify core
- Implement auth
- Implement RBAC logic
- Create system-level components

---

## RBAC Rules

### RBAC Controls

- Access to modules (app-level)
- Access to features/actions (card-level)
- Whether columns exist in a table
- Whether a table is visible at all

### RBAC Must Not

- Exist inside UI components
- Exist inside Table logic

Correct:

```js
if (!canViewTable) return null;
```

Wrong:

```js
// Inside Table.js
if (row.role !== "Admin") hideColumn("salary");  // NO
```

---

## Table Rules

The shared `TableZ` component is a **controlled, display-only renderer**. The module owns all data and logic. For automatic data binding, use `TableX` instead.

> **In simple terms:** `TableZ` is like a TV screen — it just shows whatever you give it. It doesn't fetch data or make decisions. Your module is the remote control: it decides what data to show, how to sort it, and what happens when the user clicks something. You pass everything to `TableZ` via props.

### Standard Table Features

The shared table supports all of these out of the box:

1. Sorting
2. Global search
3. Pagination
4. Filters (hardcoded or databound)
5. Column resize
6. Column visibility
7. Row actions
8. Export (CSV or Excel)
9. Loading and empty states

### Required Behavior

- Table is **controlled by parent** — all data passed via props.
- All events (sort, filter, page, search) are handled by the parent module.
- Source of truth for sort, pagination, filters, and column state lives in the module.

### Not Allowed

- Table fetches its own data.
- Table manages business logic.
- Table stores state internally.
- Passing manual children rows.

### Standard Table Props

```js
<TableZ
  columns={columns}
  data={data}
  loading={loading}
  total={total}
  page={page}
  pageSize={pageSize}
  filters={filtersConfig}
  appliedFilters={appliedFilters}
  sort={sort}
  onFilterChange={handleFilterChange}
  onSortChange={handleSortChange}
  onPageChange={handlePageChange}
  onSearchChange={handleSearch}
  onColumnVisibilityChange={handleColumnVisibilityChange}
  onColumnResizeChange={handleColumnResizeChange}
  actions={actions}
  onExport={handleExport}
/>
```

### Filter Rules

- Filters **must** be defined in the module and passed to the table.
- The table renders filter controls and emits changes — it does not define or fetch filters.
- Databound filter options are fetched by the module and passed as `options`.

```js
const filtersConfig = [
  { key: "status", label: "Status", type: "select", options: [...] },
  { key: "app_id", label: "Application", type: "select", dataSource: fetchApps, options: appOptions },
];
```

### Column Visibility

- **UI** controls visibility (user toggles columns on/off).
- **RBAC** controls existence (module decides which columns are in the array at all).

> **For example:** A "Notes" column might be toggleable by the user (visibility). But a "Salary" column for non-HR roles wouldn't even be in the columns array — it's removed by your code before the table ever sees it (existence).

### Column Resize

- Drag to resize column width.
- Enforce minimum width.
- Table emits resize changes; module persists width state and re-passes `columns`.

### Row Actions

Actions are config-driven, not hardcoded:

> **In simple terms:** Instead of writing `<button onClick={...}>Edit</button>` manually for every row, you define actions as a list of objects. The table reads that list and creates the buttons for you.

```js
const actions = [
  { label: "Edit", onClick: handleEdit },
  { label: "Delete", onClick: handleDelete, variant: "danger" },
];
```

**Row action `type` values are limited to:** `primary`, `secondary`, `danger`.
Do not pass `success` or `warning` to row actions. If your business meaning is success/warning, map it to a supported type.

### Table Customization (Allowed)

Beyond the standard features, these customizations are allowed:

1. **Action columns** — config-driven row actions via the `actions` prop.
2. **Checkbox selection** — row selection for batch operations.
3. **Row click** — open a side panel or detail view on row click.
4. **Master-detail view** — expandable row detail within the table.

Anything outside this list must be proposed and approved before implementation.

### Companion Example

The blessed reference implementation is at:

- **Page route:** `/psbpages/examples/data-table`
- **Module file:** `src/modules/psbpages/examples/pages/data-table/DataTablePage.js`
- **Server Actions:** `src/modules/psbpages/examples/data/dataTableExample.actions.js`

---

## Development Flow

---

# 🧱 Environment Architecture

## 🗄️ Databases (Supabase)

| Environment | Database       | Purpose            |
| ----------- | -------------- | ------------------ |
| Local Dev   | `PREMIUM-QAS`  | Developer machines |
| Dev/Test    | `PREMIUM-DEV`  | Testing / staging  |
| Production  | `PREMIUM-PROD` | Live system        |

---

## 🌐 Vercel Deployments

| Project Name      | Connected Database | Notes                              |
| ----------------- | ------------------ | ---------------------------------- |
| `PSBUniverse-DEV` | `PREMIUM-DEV`      | Uses anon + service keys from DEV  |
| `PSBUniverse`     | `PREMIUM-PROD`     | Uses anon + service keys from PROD |

---

## 💻 Local Development

* Runs **outside Vercel**
* Always connects to:
  👉 `PREMIUM-QAS`
* Used for:

  * Feature development
  * Debugging
  * Unsafe testing (don’t pollute DEV/PROD)

---

## 🧑‍💻 GitHub Repositories

| Repo               | Purpose     | Connected Environment                         |
| ------------------ | ----------- | --------------------------------------------- |
| `PSBUniverse`      | Development | Vercel: `PSBUniverse-DEV` + DB: `PREMIUM-DEV` |
| `PSBUniverse-PROD` | Production  | Vercel: `PSBUniverse` + DB: `PREMIUM-PROD`    |

---

# ⚠️ Critical Rules (Don’t screw this up)

* **NEVER connect local dev to PROD**
* **NEVER use PROD keys in DEV**
* **DEV = unstable, expect data resets**
* **PROD = locked down, audited only**

---

# 💡 What’s Good / What’s Risky

### ✅ Good

* Clear separation of environments
* Dedicated DB per stage
* Separate repos for PROD (prevents accidental deploys)

### ⚠️ Weak Points

* You’re using **service keys in Vercel** → if exposed, you're dead
  👉 These should **never touch client-side code**
* No mention of:

  * environment variable management
  * access control (who can deploy to PROD)
  * migration strategy (this will bite you hard later)

---

# 🔧 What You Should Add (Non-Optional)

### 1. Environment Variables Policy

* `.env.local` → QAS
* NEVER hardcode keys

### 2. DB Migration Flow

You need a pipeline:

```
QAS → DEV → PROD
```

Use migrations, not manual edits.

### 3. Deployment Control

* Protect `PSBUniverse-PROD` repo:

  * Require PR approval
  * No direct pushes


### Developer Flow

1. Follow the [Getting Started Guide](../01-getting-started/getting-started-v2.md) (GitHub, dependencies, `.env.local`).
2. Run `npm run create-module -- <module-name>` to scaffold the module.
3. Update `index.js` with your module's `module_key`, name, icon, and routes.
4. Register database records (app, groups, cards, card-role mappings).
5. Build pages and components.
6. Apply card access checks.
7. Test with authorized and unauthorized users.

### Senior Developer Flow

1. Review module contract and routing before code review.
2. Validate RBAC setup in database matches module expectations.
3. Verify shared component usage (no custom overrides).
4. Check that all table state is controlled by the module.
5. Confirm build and lint pass.

---

## Final Mental Model

| Concept | Role |
|---------|------|
| **Core** | The brain — auth, RBAC, routing, layout |
| **Modules** | The features — domain pages, workflows, data |
| **Shared Table** | The renderer — display-only, controlled, no business logic |

### Done Criteria

Your module is done when:

1. Module structure follows the required pattern.
2. RBAC is enforced (app-level by core, card-level by your module).
3. All UI uses shared components.
4. Table state is fully controlled by the module.
5. Build passes, lint passes.
6. Authorized and unauthorized user flows work correctly.

### Export

- Server-side only.
- Uses current filtered data context.
- CSV and Excel only.

### Reference Implementation

- Live example: `/psbpages/examples/data-table`
- Module file: `src/modules/psbpages/examples/pages/data-table/DataTablePage.js`
- Server Actions: `src/modules/psbpages/examples/data/dataTableExample.actions.js`

For the full shared UI guide and playground, visit `/psbpages/examples` in the dev server.

---

## Hard Rules (Non-Negotiable)

### Do Not

1. Install table libraries inside modules.
2. Build custom tables per page.
3. Fetch data inside the Table component.
4. Mix RBAC with UI logic.
5. Duplicate shared UI components.

### Must

1. Use the shared Table component.
2. Pass all data via props.
3. Keep logic in the module.
4. Keep UI rendering in shared components.

---

## Escalation Rule

If your work requires changing any of these:

1. Auth flow
2. RBAC model
3. Role governance
4. Core route guard logic

**Stop and escalate to the technical lead.** Do not make architecture changes inside module tasks.


