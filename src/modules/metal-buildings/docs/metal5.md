Good—this is where most systems silently fail.

If you don’t track **who changed what, when, and from what → to what**, your pricing system becomes **untrustworthy**. When a quote mismatch happens, you’ll have zero answers.

Let’s build this properly.

---

# 🧱 1. AUDIT LOG TABLE (CORE)

This is NOT optional.

```sql
AuditLogs
----------
Id INT PRIMARY KEY IDENTITY
EntityName VARCHAR(100)       -- e.g. 'CarportPrices', 'FeatureOptions'
EntityId INT                  -- affected row ID

ActionType VARCHAR(20)        -- INSERT | UPDATE | DELETE
FieldName VARCHAR(100) NULL   -- specific column changed

OldValue NVARCHAR(MAX) NULL
NewValue NVARCHAR(MAX) NULL

ChangedBy VARCHAR(100)        -- user/email
ChangedAt DATETIME DEFAULT GETDATE()

VersionId INT NULL            -- tie to pricing version
```

---

# 🧠 2. WHAT YOU LOG (DON’T LOG EVERYTHING BLINDLY)

## ✅ MUST LOG

* Price changes
* Rate changes
* Option additions/removals
* Discount rule changes
* Version activation

## ❌ DON’T BOTHER

* UI-only fields (labels, sort order)
* Temporary drafts (unless published)

---

# 🧩 3. HOW TO LOG CHANGES (BACKEND)

### Example: UPDATE price

```sql
-- BEFORE UPDATE
SELECT Price FROM CarportPrices WHERE Id = @Id
```

Then:

```js
if (oldPrice !== newPrice) {
  insertAuditLog({
    entity: 'CarportPrices',
    entityId: id,
    action: 'UPDATE',
    field: 'Price',
    oldValue: oldPrice,
    newValue: newPrice,
    user: currentUser,
    versionId: versionId
  });
}
```

---

# ⚠️ DO NOT rely on frontend for logging

If you log from frontend → it’s fake and bypassable.
**All logging must happen in backend or DB layer.**

---

# 🧱 4. AUTOMATE IT (DON’T HANDWRITE THIS EVERYWHERE)

## Option A (Recommended): Service Layer Wrapper

```js
function updateWithAudit(entity, id, updates, user) {
  const oldData = getById(entity, id);

  update(entity, id, updates);

  Object.keys(updates).forEach(field => {
    if (oldData[field] !== updates[field]) {
      logChange(...);
    }
  });
}
```

---

## Option B (Advanced): SQL Trigger

```sql
CREATE TRIGGER trg_CarportPrices_Update
ON CarportPrices
AFTER UPDATE
AS
BEGIN
  INSERT INTO AuditLogs (...)
  SELECT 
    'CarportPrices',
    i.Id,
    'UPDATE',
    'Price',
    d.Price,
    i.Price,
    SYSTEM_USER,
    GETDATE()
  FROM inserted i
  JOIN deleted d ON i.Id = d.Id
  WHERE i.Price <> d.Price
END
```

👉 Trigger = safer, but harder to maintain
👉 Service layer = more flexible

---

# 🧠 5. VERSION-AWARE AUDITING

Tie every change to a version:

```sql
VersionId INT
```

So you can answer:

> “What changed between v1 and v2?”

---

# 📊 6. ADMIN UI: AUDIT VIEWER

Don’t just log—make it usable.

## Table View

| Date | User | Entity | Field | Old | New |
| ---- | ---- | ------ | ----- | --- | --- |

---

## Filters

* Version
* Feature
* Date range
* User

---

## 🔥 Must-have feature: Diff Highlight

```diff
Price: 4500 → 4800
```

---

# 🧠 7. CRITICAL USE CASES

### 🔍 Debug pricing issue

> “Why did this quote increase?”

→ Check audit logs

---

### 🧾 Compliance / accountability

> “Who changed Michigan pricing?”

→ You have exact user + timestamp

---

### 🧪 Rollback support

You can reconstruct old values

---

# ⚠️ COMMON FAILURES

### ❌ Logging entire JSON blobs

→ unreadable garbage

### ❌ No field-level tracking

→ useless logs

### ❌ No user tracking

→ no accountability

### ❌ No version link

→ no context

---

# 🚀 8. OPTIONAL (BUT POWERFUL)

## Snapshot Before Activation

Store full version snapshot:

```sql
PricingSnapshots
----------------
Id
VersionId
JsonData
CreatedAt
```

👉 Backup before activating new pricing

---

## Change Summary Generator

Auto-generate:

```
Michigan v2:
- Base price +5%
- Windows +$20
- New door option added
```

---

# 💬 Final reality check

Without audit logs:

* You are guessing
* Your admin panel is dangerous
* Your pricing system is fragile

With audit logs:

* You have **traceability**
* You can **debug anything**
* You can **trust your system**

---

# 👉 Next step

If you want to go deeper, I’d push you into:

* Role-based permissions (who can edit vs approve)
* Approval workflow (no direct publish)
* Rollback system (one-click revert version)

Say it—and I’ll design it properly.
