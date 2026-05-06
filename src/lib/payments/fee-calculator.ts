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
 * Example (SPLIT, amount=10,000, processorFee=1.7%, platformFee=0.5%):
 *   processorFee → 170   grossAmount → 10,170
 *   platformFee  →  50   netAmount   →  9,950
 *
 * .env keys (all optional; default to SPLIT with 0% fees in Phase 1):
 *   FEE_MODE=SPLIT                  # BROKER | CLIENT | SPLIT
 *   PROVIDER_FEE_PERCENT=1.7
 *   PLATFORM_FEE_PERCENT=0.5
 */

// Mirrors the Prisma FeePaidBy enum values exactly — no translation needed.
export type FeeMode = "BROKER" | "CLIENT" | "SPLIT";

export interface FeeConfig {
  providerFeePercent: number;  // 0–100, e.g. 1.7 means 1.7%
  platformFeePercent: number;  // 0–100, e.g. 0.5 means 0.5%
  feeMode:            FeeMode;
}

export interface FeeBreakdown {
  // mirrors Payment model field names exactly — passes directly into prisma.payment.upsert
  amount:             number;  // base commission, in agorot
  processorFee:       number;  // payment-processor cut, in agorot
  platformFee:        number;  // SignDeal platform cut, in agorot
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
 */
export function calculateFees(amount: number, config: FeeConfig): FeeBreakdown {
  const processorFee = Math.round(amount * config.providerFeePercent / 100);
  const platformFee  = Math.round(amount * config.platformFeePercent / 100);

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
 * Defaults to SPLIT mode with 0% fees in Phase 1 (no-op: grossAmount = amount, netAmount = amount).
 */
export function defaultFeeConfig(): FeeConfig {
  const raw = (process.env.FEE_MODE ?? "SPLIT").trim().toUpperCase();

  return {
    providerFeePercent: parseFloat(process.env.PROVIDER_FEE_PERCENT ?? "0") || 0,
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT ?? "0") || 0,
    feeMode:            VALID_FEE_MODES.has(raw as FeeMode) ? (raw as FeeMode) : "SPLIT",
  };
}
