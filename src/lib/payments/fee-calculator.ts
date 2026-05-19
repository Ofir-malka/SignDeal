/**
 * fee-calculator.ts
 *
 * Pure fee-calculation logic — no DB, no HTTP, no side-effects.
 * Consumed by the payment-request route and future webhook handler.
 *
 * Three fee modes (mapped directly to the FeePaidBy Prisma enum):
 *
 *   BROKER  — broker absorbs all fees; customer pays base commission only
 *     grossAmount = amount
 *     netAmount   = amount − processorFee − platformFee
 *
 *   CLIENT  — customer pays all fees on top; broker receives full commission
 *     grossAmount = amount + processorFee + platformFee
 *     netAmount   = amount
 *
 *   SPLIT   — hybrid (platform default): customer pays processorFee, broker absorbs platformFee
 *     grossAmount = amount + processorFee
 *     netAmount   = amount − platformFee
 *
 * Example (SPLIT, amount=1,000,000 agorot = ₪10,000, processorFee=1.4%, platformFee=2%, minPlatformFee=500):
 *   processorFee → 14,000   grossAmount → 1,014,000
 *   platformFee  → max(20,000, 500) = 20,000   netAmount → 980,000
 *
 * Example (SPLIT, amount=20,000 agorot = ₪200, processorFee=1.4%, platformFee=2%, minPlatformFee=500):
 *   rawPlatformFee = 400 agorot (₪4) — below minimum
 *   platformFee    → max(400, 500) = 500 agorot (₪5 minimum applied)
 *   processorFee   → 280   grossAmount → 20,280
 *   netAmount      → 19,500
 *
 * .env keys (all optional; defaults shown):
 *   FEE_MODE=SPLIT                  # BROKER | CLIENT | SPLIT
 *   PROVIDER_FEE_PERCENT=1.4        # payment processor's cut (e.g. Stripe ILS rate)
 *   PLATFORM_FEE_PERCENT=2          # SignDeal platform cut
 *   MINIMUM_PLATFORM_FEE=500        # floor in agorot (₪5 = 500); 0 = no floor
 */

// Mirrors the Prisma FeePaidBy enum values exactly — no translation needed.
export type FeeMode = "BROKER" | "CLIENT" | "SPLIT";

export interface FeeConfig {
  providerFeePercent:  number;  // 0–100, e.g. 1.4 means 1.4%
  platformFeePercent:  number;  // 0–100, e.g. 2 means 2%
  minimumPlatformFee:  number;  // floor in agorot; 0 = no floor
  feeMode:             FeeMode;
}

export interface FeeBreakdown {
  // mirrors Payment model field names exactly — passes directly into prisma.payment.upsert
  amount:             number;  // base commission, in agorot
  processorFee:       number;  // payment-processor cut, in agorot
  platformFee:        number;  // SignDeal platform cut (after minimum applied), in agorot
  grossAmount:        number;  // total charged to customer, in agorot
  netAmount:          number;  // broker net after fees, in agorot
  feePaidBy:          FeeMode; // passes directly to Prisma as FeePaidBy
  // config snapshot (stored for auditability)
  providerFeePercent: number;
  platformFeePercent: number;
}

/**
 * Calculates a full fee breakdown.
 * All monetary values are in agorot (integer). Fractional agorot are rounded.
 *
 * The minimum platform fee floor is applied BEFORE the gross/net split so that
 * all downstream amounts (grossAmount, netAmount, application_fee_amount) are
 * consistent with the final platformFee value.
 */
export function calculateFees(amount: number, config: FeeConfig): FeeBreakdown {
  const processorFee = Math.round(amount * config.providerFeePercent / 100);

  // Apply minimum floor: platformFee is always at least minimumPlatformFee agorot.
  // Math.max(0, ...) guards against negative values if percent or amount are 0.
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

  return {
    amount,
    processorFee,
    platformFee,
    grossAmount,
    netAmount,
    feePaidBy:          config.feeMode,
    providerFeePercent: config.providerFeePercent,
    platformFeePercent: config.platformFeePercent,
  };
}

const VALID_FEE_MODES = new Set<FeeMode>(["BROKER", "CLIENT", "SPLIT"]);

/**
 * Reads fee config from environment variables.
 *
 *   FEE_MODE                 BROKER | CLIENT | SPLIT  (default: SPLIT)
 *   PROVIDER_FEE_PERCENT     processor's cut, e.g. "1.4" for Stripe ILS (default: "0")
 *   PLATFORM_FEE_PERCENT     SignDeal's cut, e.g. "2" for 2%           (default: "0")
 *   MINIMUM_PLATFORM_FEE     floor in agorot, e.g. "500" for ₪5        (default: "0")
 *
 * All four must be set in Vercel Environment Variables to collect real revenue.
 * Defaults to 0% / no floor — safe for local dev and CI (no money moved).
 */
export function defaultFeeConfig(): FeeConfig {
  const raw = (process.env.FEE_MODE ?? "SPLIT").trim().toUpperCase();

  return {
    providerFeePercent: parseFloat(process.env.PROVIDER_FEE_PERCENT  ?? "0") || 0,
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT  ?? "0") || 0,
    minimumPlatformFee: parseInt  (process.env.MINIMUM_PLATFORM_FEE  ?? "0", 10) || 0,
    feeMode:            VALID_FEE_MODES.has(raw as FeeMode) ? (raw as FeeMode) : "SPLIT",
  };
}
