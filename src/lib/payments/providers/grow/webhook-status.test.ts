import { describe, it, expect } from "vitest";
import { webhookStatusUpdateWhere } from "./webhook-status";

const P = "grow_payment";

describe("webhookStatusUpdateWhere — PROCESSED is terminal (never downgraded)", () => {
  it("(1) RECEIVED→PROCESSED: unconditional write, no status guard", () => {
    const w = webhookStatusUpdateWhere(P, "e1", "PROCESSED");
    expect(w).toEqual({ provider: P, eventId: "e1" });
    expect("status" in w).toBe(false); // applies to a RECEIVED (or any) row → PROCESSED lands
  });

  it("(2) RECEIVED→IGNORED: guarded so it applies only to non-PROCESSED rows", () => {
    const w = webhookStatusUpdateWhere(P, "e1", "IGNORED");
    expect(w).toEqual({ provider: P, eventId: "e1", status: { not: "PROCESSED" } });
    // current row is RECEIVED → not PROCESSED → the write matches and applies.
  });

  it("(3) duplicate IGNORED cannot overwrite an already-PROCESSED row", () => {
    const w = webhookStatusUpdateWhere(P, "e1", "IGNORED");
    // The not-PROCESSED guard means a row already at PROCESSED is excluded from the
    // updateMany → 0 rows matched → PROCESSED is preserved (no downgrade).
    expect(w.status).toEqual({ not: "PROCESSED" });
  });

  it("FAILED is likewise guarded (never downgrades PROCESSED)", () => {
    expect(webhookStatusUpdateWhere(P, "e1", "FAILED").status).toEqual({ not: "PROCESSED" });
  });

  it("re-affirming PROCESSED→PROCESSED stays unconditional (idempotent, harmless)", () => {
    expect("status" in webhookStatusUpdateWhere(P, "e1", "PROCESSED")).toBe(false);
  });
});
