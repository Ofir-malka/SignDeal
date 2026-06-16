/**
 * Unit tests for findActiveSecretRef — the Layer-1 owner-tuple lookup used by
 * singleton owners (e.g. the Platform Grow-SaaS merchant key, which has no owner
 * row to hold its secretRef).
 *
 * The crypto / ids / audit / sentry / prisma deps are mocked (findActiveSecretRef
 * uses none of them), so importing the accessor is hermetic and needs no KEK env.
 * purpose-map is intentionally REAL, so the R1/R2/R3 validation is genuinely
 * exercised — including that it runs BEFORE any DB query (fail-closed).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { encryptedSecret: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/audit/log-audit-event", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));
vi.mock("./crypto", () => ({ encryptSecret: vi.fn(), decryptSecret: vi.fn(), rewrapSecret: vi.fn() }));
vi.mock("./ids", () => ({ generateSecretId: vi.fn() }));

import { findActiveSecretRef } from "./accessor";
import { SecretRailMismatchError, SecretValidationError } from "./errors";

const PLATFORM = {
  purpose: "GROW_SAAS_MERCHANT_API_KEY",
  rail: "A",
  ownerType: "Platform",
  ownerId: "grow_saas",
} as const;

beforeEach(() => vi.clearAllMocks());

describe("findActiveSecretRef", () => {
  it("returns the active secretRef and queries by the non-purged owner tuple", async () => {
    mocks.findFirst.mockResolvedValue({ id: "ref_abc" });
    await expect(findActiveSecretRef({ ...PLATFORM })).resolves.toBe("ref_abc");
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        ownerType: "Platform",
        ownerId: "grow_saas",
        purpose: "GROW_SAAS_MERCHANT_API_KEY",
        purgedAt: null,
      },
      select: { id: true },
    });
  });

  it("returns null when no active secret exists", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(findActiveSecretRef({ ...PLATFORM })).resolves.toBeNull();
  });

  it("rejects a Rail B caller (R2) before touching the DB", async () => {
    await expect(findActiveSecretRef({ ...PLATFORM, rail: "B" })).rejects.toBeInstanceOf(
      SecretRailMismatchError,
    );
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a wrong ownerType (R3) before touching the DB", async () => {
    await expect(
      findActiveSecretRef({ ...PLATFORM, ownerType: "Subscription" }),
    ).rejects.toBeInstanceOf(SecretValidationError);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown purpose (R1) before touching the DB", async () => {
    await expect(
      findActiveSecretRef({ ...PLATFORM, purpose: "BOGUS_PURPOSE" }),
    ).rejects.toBeInstanceOf(SecretValidationError);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
