/**
 * fee-calculator.ts
 *
 * Pure fee-calculation logic — no DB, no HTTP, no side-effects.
 * Consumed by the payment-request route and tests.
 *
 * ── Modes ─────────────────────────────────────────────────────────────────────
 *
 *   BREAK_EVEN_SPLIT  (FEE_MODE=BREAK_EVEN_SPLIT)  ← production mode
 *     SignDeal earns 0 profit on payment processing.
 *     The actual Stripe cost stack is modelled exactly:
 *       totalProcessingCost = percentageFee + stripeFixedFee + payoutFee
 *       clientShare = ceil(totalProcessingCost / 2)   ← never under-collects
 *       brokerShare = totalProcessingCost − clientShare
 *       grossAmount = commission + clientShare
 *       netAmount   = commission − brokerShare
 *       applicationFeeAmount = totalProcessingCost
 *     Invariant: netAmount + applicationFeeAmount = grossAmount (always)
 *
 *   Legacy modes (BROKER | CLIENT | SPLIT) — preserved for backward compatibility.
 *     These retain the old behaviour where applicationFeeAmount = platformFee.
 *     They are NOT recommended for production use with Stripe Connect because
 *     processorFee is not included in application_fee_amount, causing the
 *     platform to absorb Stripe's processing costs from its own balance.
 *     See architecture notes in the codebase for the full explanation.
 *
 *     BROKER  — broker absorbs all fees; customer pays base commission only
 *       grossAmount = commission
 *       netAmount   = commission − processorFee − platformFee
 *
 *     CLIENT  — customer pays all fees on top; broker receives full commission
 *       grossAmount = commission + processorFee + platformFee
 *       netAmount   = commission
 *
 *     SPLIT   — hybrid: customer pays processorFee, broker absorbs platformFee
 *       grossAmount = commission + processorFee
 *       netAmount   = commission − platformFee
 *
 * ── Env vars ──────────────────────────────────────────────────────────────────
 *
 *   FEE_MODE                    BREAK_EVEN_SPLIT | BROKER | CLIENT | SPLIT
 *                               (default: SPLIT — safe for local dev)
 *
 *   BREAK_EVEN_SPLIT vars (all default to 0 — must be set explicitly in prod):
 *   STRIPE_PROCESSING_PERCENT   Stripe base processing rate, e.g. "4.4"
 *   STRIPE_FX_PERCENT           FX conversion surcharge, e.g. "1.0"
 *   CONNECT_VOLUME_PERCENT      Connect platform volume fee, e.g. "0.25"
 *   STRIPE_FIXED_FEE_AGOROT     Per-transaction fixed fee in agorot (≈$0.30)
 *   PAYOUT_FIXED_FEE_AGOROT     Per-payout fixed fee in agorot (≈$0.25)
 *
 *   Legacy vars (used by BROKER | CLIENT | SPLIT; default to 0):
 *   PROVIDER_FEE_PERCENT        Payment processor's cut, e.g. "1.4"
 *   PLATFORM_FEE_PERCENT        SignDeal's cut, e.g. "2"
 *   MINIMUM_PLATFORM_FEE        Floor in agorot, e.g. "500" for ₪5
 */

// ── Types ─────────────────────────────────────────────────────────────────────

// Mirrors the Prisma FeePaidBy enum exactly — no translation needed.
export type FeeMode = "BROKER" | "CLIENT" | "SPLIT" | "BREAK_EVEN_SPLIT";

export interface FeeConfig {
  feeMode: FeeMode;

  // ── BREAK_EVEN_SPLIT config ───────────────────────────────────────────────
  /** Stripe's base processing percentage for ILS/IL cards, e.g. 4.4 */
  stripeProcessingPercent: number;
  /** FX conversion surcharge percentage, e.g. 1.0 */
  stripeFxPercent:         number;
  /** Connect platform volume fee percentage, e.g. 0.25 */
  connectVolumePercent:    number;
  /** Stripe's fixed per-transaction fee in agorot (e.g. 111 ≈ $0.30 at ₪3.7/$1) */
  stripeFixedFeeAgorot:    number;
  /**
   * Stripe's fixed per-payout fee in agorot.
   *
   * ⚠ Set to 0 in production (PAYOUT_FIXED_FEE_AGOROT=0).
   *
   * The $0.25 Stripe payout fee is charged once per payout disbursement, not
   * once per payment.  A broker with 20 payments in a weekly payout is charged
   * $0.25 total, not $0.25 × 20.  Including it per-payment over-charges clients
   * on every transaction — confirmed by live test: a ₪10 commission collected
   * ₪2.61 instead of the actual ₪1.48 Stripe cost when this was set to 93.
   *
   * If the platform ever needs to recover payout costs, model them as a separate
   * monthly fee or amortise across the expected payment volume.
   */
  payoutFixedFeeAgorot:    number;

  // ── Legacy mode config (BROKER | CLIENT | SPLIT) ─────────────────────────
  /** Legacy: Stripe percentage estimate used in old modes, e.g. 1.4 */
  providerFeePercent:  number;
  /** Legacy: SignDeal platform margin percentage, e.g. 2 */
  platformFeePercent:  number;
  /** Legacy: Minimum platform fee floor in agorot, e.g. 500 */
  minimumPlatformFee:  number;
}

export interface FeeBreakdown {
  // ── Core amounts (mirror Payment model field names exactly) ───────────────
  /** Base commission amount, in agorot. */
  amount:      number;
  /**
   * Total charged to the customer, in agorot.
   * BREAK_EVEN_SPLIT: commission + clientProcessingShare
   * Legacy modes: varies by mode
   */
  grossAmount: number;
  /**
   * Broker's net payout after fees, in agorot.
   * BREAK_EVEN_SPLIT: commission − brokerProcessingShare
   * Legacy modes: varies by mode
   */
  netAmount:   number;

  // ── Fee components (stored on Payment row) ────────────────────────────────
  /**
   * Total processing cost, in agorot.
   * BREAK_EVEN_SPLIT: totalProcessingCost (what Stripe actually costs)
   * Legacy modes: the estimated processorFee only
   */
  processorFee:  number;
  /**
   * Platform profit margin, in agorot.
   * BREAK_EVEN_SPLIT: always 0 (break-even, no platform profit)
   * Legacy modes: calculated platform margin
   */
  platformFee:   number;
  /** Fee mode used — maps directly to Prisma FeePaidBy enum. */
  feePaidBy:     FeeMode;

  // ── BREAK_EVEN_SPLIT detailed breakdown ───────────────────────────────────
  /** Config snapshot: Stripe base processing %, e.g. 4.4 */
  stripeProcessingPercent: number;
  /** Config snapshot: FX conversion %, e.g. 1.0 */
  stripeFxPercent:         number;
  /** Config snapshot: Connect volume %, e.g. 0.25 */
  connectVolumePercent:    number;
  /** Config snapshot: fixed per-transaction fee in agorot */
  stripeFixedFeeAgorot:    number;
  /** Config snapshot: fixed per-payout fee in agorot */
  payoutFixedFeeAgorot:    number;
  /** percentageFee + stripeFixedFeeAgorot + payoutFixedFeeAgorot */
  totalProcessingCost:     number;
  /**
   * Client's share of totalProcessingCost.
   * = ceil(totalProcessingCost / 2) — always rounds up to avoid under-collection.
   * BREAK_EVEN_SPLIT: equals half (rounded up); legacy modes: 0.
   */
  clientProcessingShare:   number;
  /**
   * Broker's share of totalProcessingCost.
   * = totalProcessingCost − clientProcessingShare
   * BREAK_EVEN_SPLIT: equals half (rounded down); legacy modes: 0.
   */
  brokerProcessingShare:   number;
  /**
   * SignDeal platform profit on this transaction.
   * BREAK_EVEN_SPLIT: always 0.
   * Legacy modes: equals platformFee.
   */
  platformProfitFee:       number;
  /**
   * The value to pass to Stripe's payment_intent_data.application_fee_amount.
   * BREAK_EVEN_SPLIT: totalProcessingCost (covers both Stripe's cut and keeps broker honest)
   * Legacy modes: platformFee (old behaviour — preserved for backward compat)
   *
   * Invariant (all modes): netAmount + applicationFeeAmount = grossAmount
   */
  applicationFeeAmount:    number;

  // ── Config snapshot (stored for auditability) ─────────────────────────────
  /** Legacy config snapshot. */
  providerFeePercent: number;
  /** Legacy config snapshot. */
  platformFeePercent: number;
}

// ── calculateFees — public entry point ────────────────────────────────────────

/**
 * Calculates a full fee breakdown for a given commission amount.
 *
 * All monetary values are in agorot (smallest ILS unit; 100 agorot = ₪1).
 * All arithmetic uses integers — no floating-point accumulation.
 *
 * @param amount - Base commission in agorot (must be a positive integer)
 * @param config - Fee configuration (from defaultFeeConfig() or test fixture)
 * @returns FeeBreakdown with all amounts and the correct applicationFeeAmount
 */
export function calculateFees(amount: number, config: FeeConfig): FeeBreakdown {
  if (config.feeMode === "BREAK_EVEN_SPLIT") {
    return calculateBreakEvenSplit(amount, config);
  }
  return calculateLegacyFees(amount, config);
}

// ── BREAK_EVEN_SPLIT calculation ──────────────────────────────────────────────

function calculateBreakEvenSplit(amount: number, config: FeeConfig): FeeBreakdown {
  // ── 1. Percentage-based processing cost ────────────────────────────────────
  const totalPercent = config.stripeProcessingPercent
    + config.stripeFxPercent
    + config.connectVolumePercent;

  const percentageFee = Math.round(amount * totalPercent / 100);

  // ── 2. Fixed processing costs ──────────────────────────────────────────────
  const fixedFee = config.stripeFixedFeeAgorot + config.payoutFixedFeeAgorot;

  // ── 3. Total actual Stripe cost ────────────────────────────────────────────
  const totalProcessingCost = percentageFee + fixedFee;

  // ── 4. 50/50 split with ceiling rounding on client share ───────────────────
  // ceil ensures the platform never under-collects by 1 agorot on odd totals.
  const clientProcessingShare = Math.ceil(totalProcessingCost / 2);
  const brokerProcessingShare = totalProcessingCost - clientProcessingShare;

  // ── 5. Gross and net amounts ───────────────────────────────────────────────
  const grossAmount = amount + clientProcessingShare;
  const netAmount   = amount - brokerProcessingShare;

  // ── 6. applicationFeeAmount covers the full Stripe cost ───────────────────
  // Platform collects totalProcessingCost via application_fee_amount, pays
  // Stripe from it, and retains nothing (break-even).
  // Invariant: netAmount + applicationFeeAmount = grossAmount  ← always true
  const applicationFeeAmount = totalProcessingCost;

  return {
    // Core amounts
    amount,
    grossAmount,
    netAmount,
    // Fee components stored on Payment row
    processorFee:  totalProcessingCost,   // Stripe's full cost = "processor fee" in DB
    platformFee:   0,                     // no platform profit
    feePaidBy:     "BREAK_EVEN_SPLIT",
    // BREAK_EVEN_SPLIT detailed breakdown
    stripeProcessingPercent: config.stripeProcessingPercent,
    stripeFxPercent:         config.stripeFxPercent,
    connectVolumePercent:    config.connectVolumePercent,
    stripeFixedFeeAgorot:    config.stripeFixedFeeAgorot,
    payoutFixedFeeAgorot:    config.payoutFixedFeeAgorot,
    totalProcessingCost,
    clientProcessingShare,
    brokerProcessingShare,
    platformProfitFee: 0,
    applicationFeeAmount,
    // Legacy config snapshot (not used in this mode; zero for clarity)
    providerFeePercent: 0,
    platformFeePercent: 0,
  };
}

// ── Legacy fee calculation (BROKER | CLIENT | SPLIT) ─────────────────────────

function calculateLegacyFees(amount: number, config: FeeConfig): FeeBreakdown {
  const processorFee = Math.round(amount * config.providerFeePercent / 100);

  // Apply minimum floor: platformFee is at least minimumPlatformFee agorot.
  const rawPlatformFee = Math.round(amount * config.platformFeePercent / 100);
  const platformFee    = Math.max(rawPlatformFee, config.minimumPlatformFee);

  let grossAmount: number;
  let netAmount:   number;

  switch (config.feeMode) {
    case "CLIENT":
      // Customer pays all fees; broker keeps full commission
      grossAmount = amount + processorFee + platformFee;
      netAmount   = amount;
      break;

    case "SPLIT":
      // Customer pays processor fee; broker absorbs platform fee
      grossAmount = amount + processorFee;
      netAmount   = amount - platformFee;
      break;

    case "BROKER":
    default:
      // Broker absorbs everything; customer pays base commission only
      grossAmount = amount;
      netAmount   = amount - processorFee - platformFee;
      break;
  }

  // Legacy: applicationFeeAmount = platformFee only (old behaviour preserved).
  // NOTE: this means the platform absorbs Stripe's processing cost on legacy modes.
  // See architecture notes — this will be corrected when legacy modes are retired.
  const applicationFeeAmount = platformFee;

  return {
    // Core amounts
    amount,
    grossAmount,
    netAmount,
    // Fee components
    processorFee,
    platformFee,
    feePaidBy: config.feeMode as FeeMode,
    // BREAK_EVEN_SPLIT fields — zeroed out for legacy modes
    stripeProcessingPercent: 0,
    stripeFxPercent:         0,
    connectVolumePercent:    0,
    stripeFixedFeeAgorot:    0,
    payoutFixedFeeAgorot:    0,
    totalProcessingCost:     processorFee,   // estimated Stripe cost only
    clientProcessingShare:   0,
    brokerProcessingShare:   0,
    platformProfitFee:       platformFee,
    applicationFeeAmount,
    // Config snapshot
    providerFeePercent: config.providerFeePercent,
    platformFeePercent: config.platformFeePercent,
  };
}

// ── defaultFeeConfig — read from environment variables ────────────────────────

const VALID_FEE_MODES = new Set<FeeMode>(["BROKER", "CLIENT", "SPLIT", "BREAK_EVEN_SPLIT"]);

/**
 * Reads fee configuration from environment variables.
 *
 * All percentage and agorot values default to 0 — safe for local dev and CI
 * (no money moved, no fees charged). Production values must be set explicitly
 * in Vercel Environment Variables.
 *
 * For BREAK_EVEN_SPLIT (production):
 *   FEE_MODE=BREAK_EVEN_SPLIT
 *   STRIPE_PROCESSING_PERCENT=4.4   # Stripe card processing rate for ILS/IL
 *   STRIPE_FX_PERCENT=1.0           # Stripe FX conversion surcharge
 *   CONNECT_VOLUME_PERCENT=0.25     # Stripe Connect platform volume fee (per-transaction)
 *   STRIPE_FIXED_FEE_AGOROT=111     # ≈$0.30 per-transaction fixed fee at ₪3.7/$1
 *   PAYOUT_FIXED_FEE_AGOROT=0       # ← MUST be 0; payout fee is per-payout not per-payment
 *                                   #   (live test: setting this to 93 over-collected ₪2.61
 *                                   #    on a ₪10 commission vs actual Stripe cost of ₪1.48)
 *
 * For testing/measurement (all fees zeroed):
 *   FEE_MODE=SPLIT
 *   PROVIDER_FEE_PERCENT=0
 *   PLATFORM_FEE_PERCENT=0
 *   MINIMUM_PLATFORM_FEE=0
 */
export function defaultFeeConfig(): FeeConfig {
  const raw     = (process.env.FEE_MODE ?? "SPLIT").trim().toUpperCase();
  const feeMode = VALID_FEE_MODES.has(raw as FeeMode) ? (raw as FeeMode) : "SPLIT";

  return {
    feeMode,

    // BREAK_EVEN_SPLIT vars
    stripeProcessingPercent: parseFloat(process.env.STRIPE_PROCESSING_PERCENT ?? "0") || 0,
    stripeFxPercent:         parseFloat(process.env.STRIPE_FX_PERCENT          ?? "0") || 0,
    connectVolumePercent:    parseFloat(process.env.CONNECT_VOLUME_PERCENT      ?? "0") || 0,
    stripeFixedFeeAgorot:    parseInt  (process.env.STRIPE_FIXED_FEE_AGOROT    ?? "0", 10) || 0,
    payoutFixedFeeAgorot:    parseInt  (process.env.PAYOUT_FIXED_FEE_AGOROT    ?? "0", 10) || 0,

    // Legacy vars
    providerFeePercent: parseFloat(process.env.PROVIDER_FEE_PERCENT ?? "0") || 0,
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "0") || 0,
    minimumPlatformFee: parseInt  (process.env.MINIMUM_PLATFORM_FEE ?? "0", 10) || 0,
  };
}
