# prisma/rollback

Hand-authored compensating ("down") scripts for forward-only Prisma migrations,
plus production operational notes. Nothing here is auto-applied — these are run
manually by an operator.

| Forward migration | Down script |
|---|---|
| `20260602120000_grow_phase1_foundation` | `20260602120000_grow_phase1_foundation.down.sql` |
| `20260603120000_grow_phase2a_onboarding` | `20260603120000_grow_phase2a_onboarding.down.sql` |
| `20260607120000_grow_rail_b_payment_fields` | `20260607120000_grow_rail_b_payment_fields.down.sql` |

---

## Enum value rollback note (MG-2)

The forward migration `20260603120000_grow_phase2a_onboarding` adds one enum value
(`GrowOnboardingStatus += 'PENDING_VERIFICATION'`). PostgreSQL **cannot drop a
single enum value**, so the paired down script leaves the value in place by default
(it is inert until written to a row) and provides a **commented, guarded type-swap**
for the rare case a clean type definition is required. Run that block manually only
after confirming `SELECT count(*) FROM "GrowOnboardingSession" WHERE "status" =
'PENDING_VERIFICATION';` returns `0`. All other Phase 2A objects (the new table, its
indexes/FK, and the 4 added columns) drop cleanly and unconditionally.

This migration adds **no** indexes on pre-existing large tables, so the MG-1
`CONCURRENTLY` consideration does not apply to it.

---

## Production `CREATE INDEX CONCURRENTLY` note (MG-1)

The forward migration `20260602120000_grow_phase1_foundation` creates two indexes
on **pre-existing** tables:

- `Payment_growTransactionId_idx` on `Payment("growTransactionId")`
- `Subscription_billingProvider_idx` on `Subscription("billingProvider")`

All other indexes in that migration are on **freshly created, empty** tables and
are safe to build transactionally.

Plain `CREATE INDEX` takes a `SHARE` lock that blocks writes to the table for the
duration of the build. On small tables this is sub-second and fine. On a large
production `Payment` / `Subscription`, build these two **out of band** with
`CONCURRENTLY` (which **cannot** run inside Prisma's migration transaction):

```sql
-- Run BEFORE deploying the migration, outside any transaction, one at a time:
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Payment_growTransactionId_idx"
    ON "Payment" ("growTransactionId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Subscription_billingProvider_idx"
    ON "Subscription" ("billingProvider");
```

Then, so the migration's own `CREATE INDEX` does not error on the now-existing
index, change those two lines in the migration's `migration.sql` to
`CREATE INDEX IF NOT EXISTS ...` before applying (Postgres will skip them).

> Decision gate: if `SELECT reltuples FROM pg_class WHERE relname IN
> ('Payment','Subscription');` shows small row counts, skip the out-of-band step
> and let the transactional `CREATE INDEX` in the migration run as-is.

If `CREATE INDEX CONCURRENTLY` is interrupted it can leave an `INVALID` index;
drop it (`DROP INDEX CONCURRENTLY "<name>";`) and retry.

---

## Additive-only note (MG-3)

`20260607120000_grow_rail_b_payment_fields` adds **4 nullable columns** to `Payment`
(`growProcessToken`, `growTransactionToken`, `growAsmachta`, `growRaw`) for the Rail B
(client→broker) Grow payment path. No enum changes, no indexes on pre-existing tables —
it drops cleanly. ⚠ Apply it to each environment **before** deploying the code that carries
the new schema: Prisma's default full-row `Payment` selects reference these columns, so a
code deploy without the migration would break existing `Payment` reads. The Grow payment
path itself stays inert while `GROW_PAYMENTS_ENABLED=false`.

## Applying a rollback

```sh
# psql against the target database, reviewing first:
psql "$DATABASE_URL" -1 -f prisma/rollback/20260602120000_grow_phase1_foundation.down.sql
```

After a manual rollback you must also reconcile Prisma's `_prisma_migrations`
table (delete the corresponding row) so `prisma migrate status` is consistent.
