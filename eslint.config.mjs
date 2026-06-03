import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * ── Grow secrets / audit boundary lint (Phase 1) ──────────────────────────────
 *
 * These rules are one of the THREE guards that keep the two payment rails and the
 * encrypted-secret core separated (the other two are the runtime R2/R4 checks and
 * the rail-pinned Layer 2 facades). They are intentionally conservative: a recon
 * pass confirmed no existing hand-written file violates any rule, so enabling them
 * is a no-op for current code and a tripwire for future regressions.
 *
 * Flat-config semantics that this file relies on: for any given file, each rule is
 * resolved by the LAST matching config object that mentions it. Exception blocks
 * therefore re-declare the full guard set they want (minus the one being relaxed)
 * and are ordered AFTER the global blocks.
 */

// ── Restricted-syntax selectors ───────────────────────────────────────────────

/** `.reveal()` is the single plaintext exit of RevealableSecret — gate it tightly. */
const NO_REVEAL = {
  selector: "CallExpression[callee.property.name='reveal']",
  message:
    "RevealableSecret.reveal() may be called only inline inside a Grow adapter (*.http.ts) or a test. Never reveal in general application code.",
};

/** Funnel every audit write through logAuditEvent() so sanitization always runs. */
const NO_DIRECT_AUDIT_CREATE = {
  selector:
    "CallExpression[callee.property.name='create'][callee.object.property.name='auditLog']",
  message:
    "Direct auditLog.create() is forbidden. Write audit rows through logAuditEvent() from @/lib/audit.",
};

/** Force all EncryptedSecret access through the Layer 1 accessor. */
const NO_DIRECT_ENCRYPTED_SECRET = {
  selector: "MemberExpression[property.name='encryptedSecret']",
  message:
    "Direct prisma.encryptedSecret access is forbidden outside src/lib/secrets/**. Use the Layer 1 accessor (storeSecret/readSecret/rotateSecret/purgeSecret).",
};

// ── Restricted-import groups ──────────────────────────────────────────────────

/** Layer 0/1 secret internals — private to src/lib/secrets/**. */
const SECRETS_INTERNAL_ALL = [
  "@/lib/secrets/accessor",
  "@/lib/secrets/crypto",
  "@/lib/secrets/kek",
  "@/lib/secrets/lifecycle",
  "@/lib/secrets/ids",
  "@/lib/secrets/purpose-map",
];

/** Same set minus the accessor — what a Layer 2 facade may NOT reach past. */
const SECRETS_INTERNAL_NO_ACCESSOR = SECRETS_INTERNAL_ALL.filter(
  (p) => p !== "@/lib/secrets/accessor",
);

const BAN_RAIL_B = {
  group: ["@/lib/payments", "@/lib/payments/*", "@/lib/payments/**"],
  message:
    "Rail separation: Rail A (billing) must never import Rail B (payments).",
};

const BAN_RAIL_A = {
  group: ["@/lib/billing", "@/lib/billing/*", "@/lib/billing/**"],
  message:
    "Rail separation: Rail B (payments) must never import Rail A (billing).",
};

const BAN_SECRETS_INTERNAL = {
  group: SECRETS_INTERNAL_ALL,
  message:
    "Layer 0/1 secret modules are private. Use the rail-scoped facade @/lib/billing/secrets or @/lib/payments/secrets.",
};

const BAN_SECRETS_DEEP_INTERNAL = {
  group: SECRETS_INTERNAL_NO_ACCESSOR,
  message:
    "A Layer 2 facade may use @/lib/secrets/accessor only — not the crypto/kek/lifecycle internals.",
};

const BAN_ALL_SECRETS_AT_EDGE = {
  group: [
    "@/lib/secrets",
    "@/lib/secrets/*",
    "@/lib/secrets/**",
    "@/lib/billing/secrets",
    "@/lib/billing/secrets/**",
    "@/lib/payments/secrets",
    "@/lib/payments/secrets/**",
  ],
  message:
    "Edge/proxy runtime must never import secret modules (KEK is server-only; no secret reads at the edge).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma-generated client — never lint generated output.
    "src/generated/**",
  ]),

  // ── A. Global syntax guards (all hand-written src) ──────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_DIRECT_ENCRYPTED_SECRET,
        NO_DIRECT_AUDIT_CREATE,
        NO_REVEAL,
      ],
    },
  },

  // ── B. Global import separation (app code) ──────────────────────────────────
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [BAN_SECRETS_INTERNAL] }],
    },
  },

  // ── C. Rail A (billing) may not import Rail B; secret internals still private ─
  {
    files: ["src/lib/billing/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BAN_SECRETS_INTERNAL, BAN_RAIL_B] },
      ],
    },
  },

  // ── D. Rail B (payments) may not import Rail A; secret internals still private ─
  {
    files: ["src/lib/payments/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BAN_SECRETS_INTERNAL, BAN_RAIL_A] },
      ],
    },
  },

  // ── E. Secrets core (Layer 0/1) owns prisma.encryptedSecret + internal imports ─
  {
    files: ["src/lib/secrets/**/*.{ts,tsx}"],
    rules: {
      // encryptedSecret access permitted here (this dir IS the owner);
      // keep the reveal + direct-audit guards as defense in depth.
      "no-restricted-syntax": ["error", NO_DIRECT_AUDIT_CREATE, NO_REVEAL],
      // Internal cross-imports between secret modules are allowed.
      "no-restricted-imports": "off",
    },
  },

  // ── F. Single audit writer lives in src/lib/audit/** ────────────────────────
  {
    files: ["src/lib/audit/**/*.{ts,tsx}"],
    rules: {
      // auditLog.create permitted here (this IS the single writer).
      "no-restricted-syntax": ["error", NO_DIRECT_ENCRYPTED_SECRET, NO_REVEAL],
    },
  },

  // ── G. Layer 2 billing facade: accessor allowed, opposite rail banned ───────
  {
    files: ["src/lib/billing/secrets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BAN_SECRETS_DEEP_INTERNAL, BAN_RAIL_B] },
      ],
    },
  },

  // ── H. Layer 2 payments facade: accessor allowed, opposite rail banned ──────
  {
    files: ["src/lib/payments/secrets/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [BAN_SECRETS_DEEP_INTERNAL, BAN_RAIL_A] },
      ],
    },
  },

  // ── I. Edge / proxy must never import secret material ───────────────────────
  {
    files: ["src/proxy.ts", "src/middleware.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [BAN_ALL_SECRETS_AT_EDGE] }],
    },
  },

  // ── J. Grow adapters may reveal inline (still no direct encryptedSecret/audit) ─
  {
    files: ["src/**/*.http.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        NO_DIRECT_ENCRYPTED_SECRET,
        NO_DIRECT_AUDIT_CREATE,
      ],
    },
  },

  // ── K. Tests may reveal + inspect EncryptedSecret (still no direct audit write) ─
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", NO_DIRECT_AUDIT_CREATE],
    },
  },
]);

export default eslintConfig;
