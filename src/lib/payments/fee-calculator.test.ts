/**
 * Unit tests for fee-calculator.ts
 *
 * No DB, no Prisma, no network — pure function tests.
 * Run with: npm test
 *
 * Coverage:
 *   - BREAK_EVEN_SPLIT mode (production path)
 *       ₪100, ₪1,000, ₪10,000 commission amounts
 *       Odd-agorot rounding (ceil on client share)
 *       applicationFeeAmount === totalProcessingCost
 *       clientShare + brokerShare === totalProcessingCost
 *       netAmount + applicationFeeAmount === grossAmount  ← invariant
 *       platformProfitFee === 0
 *       platformFee === 0
 *   - Legacy modes (BROKER | CLIENT | SPLIT)
 *       Backward-compatibility smoke tests
 *       applicationFeeAmount === platformFee (old behaviour preserved)
 *   - defaultFeeConfig() env var parsing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { calculateFees, defaultFeeConfig, type FeeConfig } from "./fee-calculator";

// ── Shared test config for BREAK_EVEN_SPLIT ───────────────────────────────────
//
// Calibrated from a live ₪10 payment test (2026-05):
//   client paid ₪11.31 → applicationFee ₪2.61 → broker net ₪8.60
//   actual Stripe platform fees: $0.47 + $0.04 = $0.51 ≈ ₪1.48
//   over-collection = ₪2.61 − ₪1.48 = ₪1.13, caused by payoutFixedFeeAgorot=93
//
//   Fix: payoutFixedFeeAgorot = 0
//   The $0.25 payout fee is per-payout, not per-payment. A broker with 20
//   payments in one weekly payout pays $0.25 once — including it per-payment
//   over-charges clients on every transaction.
//
// Stripe cost stack (per-transaction, included):
//   4.4% (processing) + 1.0% (FX) + 0.25% (Connect volume) = 5.65% total
//   $0.30 per-transaction fixed ≈ 111 agorot (at ₪3.7/$1)
//   $0.25 per-PAYOUT fixed      → 0 agorot   (excluded: amortised across payout)

const BREAK_EVEN_CONFIG: FeeConfig = {
  feeMode:                 "BREAK_EVEN_SPLIT",
  stripeProcessingPercent: 4.4,
  stripeFxPercent:         1.0,
  connectVolumePercent:    0.25,
  stripeFixedFeeAgorot:    111,
  payoutFixedFeeAgorot:    0,    // ← 0 by design; see calibration notes above
  // Legacy fields — unused in BREAK_EVEN_SPLIT
  providerFeePercent: 0,
  platformFeePercent: 0,
  minimumPlatformFee: 0,
};

// ── BREAK_EVEN_SPLIT: ₪100 commission ────────────────────────────────────────

describe("BREAK_EVEN_SPLIT — ₪100 commission (10,000 agorot)", () => {
  // Manual calculation (payoutFixedFeeAgorot = 0):
  //   totalPercent   = 5.65%
  //   percentageFee  = round(10000 * 5.65 / 100) = round(565) = 565
  //   fixedFee       = 111 + 0 = 111
  //   totalCost      = 565 + 111 = 676
  //   clientShare    = ceil(676 / 2) = 338  (even — ceil is no-op)
  //   brokerShare    = 676 - 338 = 338
  //   grossAmount    = 10000 + 338 = 10338
  //   netAmount      = 10000 - 338 = 9662
  //   applicationFee = 676
  //   check: 9662 + 676 = 10338 ✓

  const result = calculateFees(10_000, BREAK_EVEN_CONFIG);

  it("totalProcessingCost is percentageFee + fixedFees", () => {
    expect(result.totalProcessingCost).toBe(676);
  });

  it("clientShare = ceil(totalProcessingCost / 2)", () => {
    expect(result.clientProcessingShare).toBe(338);
  });

  it("brokerShare = totalProcessingCost - clientShare", () => {
    expect(result.brokerProcessingShare).toBe(338);
  });

  it("clientShare + brokerShare === totalProcessingCost", () => {
    expect(result.clientProcessingShare + result.brokerProcessingShare)
      .toBe(result.totalProcessingCost);
  });

  it("grossAmount = commission + clientShare", () => {
    expect(result.grossAmount).toBe(10_338);
  });

  it("netAmount = commission - brokerShare", () => {
    expect(result.netAmount).toBe(9_662);
  });

  it("applicationFeeAmount === totalProcessingCost", () => {
    expect(result.applicationFeeAmount).toBe(result.totalProcessingCost);
    expect(result.applicationFeeAmount).toBe(676);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });

  it("platformProfitFee === 0", () => {
    expect(result.platformProfitFee).toBe(0);
  });

  it("platformFee === 0", () => {
    expect(result.platformFee).toBe(0);
  });

  it("processorFee === totalProcessingCost", () => {
    expect(result.processorFee).toBe(result.totalProcessingCost);
  });

  it("feePaidBy is BREAK_EVEN_SPLIT", () => {
    expect(result.feePaidBy).toBe("BREAK_EVEN_SPLIT");
  });
});

// ── BREAK_EVEN_SPLIT: ₪1,000 commission ──────────────────────────────────────

describe("BREAK_EVEN_SPLIT — ₪1,000 commission (100,000 agorot)", () => {
  // Manual calculation (payoutFixedFeeAgorot = 0):
  //   percentageFee  = round(100000 * 5.65 / 100) = round(5650) = 5650
  //   fixedFee       = 111 + 0 = 111
  //   totalCost      = 5761
  //   clientShare    = ceil(5761 / 2) = ceil(2880.5) = 2881
  //   brokerShare    = 5761 - 2881 = 2880
  //   grossAmount    = 100000 + 2881 = 102881
  //   netAmount      = 100000 - 2880 = 97120
  //   applicationFee = 5761
  //   check: 97120 + 5761 = 102881 ✓

  const result = calculateFees(100_000, BREAK_EVEN_CONFIG);

  it("totalProcessingCost", () => {
    expect(result.totalProcessingCost).toBe(5_761);
  });

  it("clientShare (odd total — ceil rounds up by 1)", () => {
    expect(result.clientProcessingShare).toBe(2_881);
  });

  it("brokerShare", () => {
    expect(result.brokerProcessingShare).toBe(2_880);
  });

  it("clientShare + brokerShare === totalProcessingCost", () => {
    expect(result.clientProcessingShare + result.brokerProcessingShare)
      .toBe(result.totalProcessingCost);
  });

  it("grossAmount", () => {
    expect(result.grossAmount).toBe(102_881);
  });

  it("netAmount", () => {
    expect(result.netAmount).toBe(97_120);
  });

  it("applicationFeeAmount === totalProcessingCost", () => {
    expect(result.applicationFeeAmount).toBe(5_761);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });

  it("platformProfitFee === 0", () => {
    expect(result.platformProfitFee).toBe(0);
  });
});

// ── BREAK_EVEN_SPLIT: ₪10,000 commission ─────────────────────────────────────

describe("BREAK_EVEN_SPLIT — ₪10,000 commission (1,000,000 agorot)", () => {
  // Manual calculation (payoutFixedFeeAgorot = 0):
  //   percentageFee  = round(1000000 * 5.65 / 100) = round(56500) = 56500
  //   fixedFee       = 111 + 0 = 111
  //   totalCost      = 56611
  //   clientShare    = ceil(56611 / 2) = ceil(28305.5) = 28306
  //   brokerShare    = 56611 - 28306 = 28305
  //   grossAmount    = 1000000 + 28306 = 1028306
  //   netAmount      = 1000000 - 28305 = 971695
  //   applicationFee = 56611
  //   check: 971695 + 56611 = 1028306 ✓

  const result = calculateFees(1_000_000, BREAK_EVEN_CONFIG);

  it("totalProcessingCost", () => {
    expect(result.totalProcessingCost).toBe(56_611);
  });

  it("clientShare", () => {
    expect(result.clientProcessingShare).toBe(28_306);
  });

  it("brokerShare", () => {
    expect(result.brokerProcessingShare).toBe(28_305);
  });

  it("grossAmount", () => {
    expect(result.grossAmount).toBe(1_028_306);
  });

  it("netAmount", () => {
    expect(result.netAmount).toBe(971_695);
  });

  it("applicationFeeAmount === totalProcessingCost", () => {
    expect(result.applicationFeeAmount).toBe(56_611);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });
});

// ── BREAK_EVEN_SPLIT: ₪10 calibration test (real live payment, 2026-05) ────────
//
// Live test results:
//   commission       ₪10.00 = 1000 agorot
//   client paid      ₪11.31 = 1131 agorot
//   applicationFee   ₪2.61  = 261 agorot  ← was over-collecting (payout fee included)
//   broker net       ₪8.60
//   actual Stripe    $0.47 + $0.04 = $0.51 ≈ ₪1.48
//
// With payoutFixedFeeAgorot = 0 (corrected):
//   percentageFee  = round(1000 * 5.65 / 100) = round(56.5) = 57
//   fixedFee       = 111 + 0 = 111
//   totalCost      = 168  ← ₪1.68 collected vs ₪1.48 actual (+₪0.20 buffer, acceptable)
//   clientShare    = ceil(168 / 2) = 84
//   brokerShare    = 84
//   grossAmount    = 1000 + 84 = 1084  (client pays ₪10.84 not ₪11.31)
//   netAmount      = 1000 - 84 = 916
//   applicationFee = 168
//   check: 916 + 168 = 1084 ✓

describe("BREAK_EVEN_SPLIT — ₪10 commission real-world calibration (1,000 agorot)", () => {
  const result = calculateFees(1_000, BREAK_EVEN_CONFIG);

  it("totalProcessingCost", () => {
    expect(result.totalProcessingCost).toBe(168);
  });

  it("clientShare = ceil(168 / 2) = 84", () => {
    expect(result.clientProcessingShare).toBe(84);
  });

  it("brokerShare = 84", () => {
    expect(result.brokerProcessingShare).toBe(84);
  });

  it("grossAmount = 1084 (client pays ₪10.84)", () => {
    expect(result.grossAmount).toBe(1_084);
  });

  it("netAmount = 916 (broker nets ₪9.16)", () => {
    expect(result.netAmount).toBe(916);
  });

  it("applicationFeeAmount = 168 (₪1.68 — close to actual ₪1.48 Stripe cost)", () => {
    expect(result.applicationFeeAmount).toBe(168);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });

  it("platformProfitFee === 0", () => {
    expect(result.platformProfitFee).toBe(0);
  });
});

// ── BREAK_EVEN_SPLIT: odd-agorot rounding ─────────────────────────────────────

describe("BREAK_EVEN_SPLIT — odd totalProcessingCost rounding", () => {
  // Use a config with no fixed fees and a percentage that produces an odd total.
  // commission = 200 agorot, totalPercent = 5.65%
  //   percentageFee  = round(200 * 5.65 / 100) = round(11.3) = 11  (odd)
  //   fixedFee       = 0
  //   totalCost      = 11
  //   clientShare    = ceil(11 / 2) = ceil(5.5) = 6   ← rounds UP (client pays more)
  //   brokerShare    = 11 - 6 = 5                      ← rounds DOWN (broker pays less)
  //   grossAmount    = 200 + 6 = 206
  //   netAmount      = 200 - 5 = 195
  //   check: 195 + 11 = 206 ✓  platform never under-collects by 1 agorot

  const noFixedConfig: FeeConfig = {
    ...BREAK_EVEN_CONFIG,
    stripeFixedFeeAgorot: 0,
    payoutFixedFeeAgorot: 0,
  };

  const result = calculateFees(200, noFixedConfig);

  it("totalProcessingCost is odd (11)", () => {
    expect(result.totalProcessingCost).toBe(11);
  });

  it("clientShare rounds up (ceil) — platform never under-collects", () => {
    expect(result.clientProcessingShare).toBe(6);
  });

  it("brokerShare rounds down — broker gets the benefit of the rounding", () => {
    expect(result.brokerProcessingShare).toBe(5);
  });

  it("clientShare + brokerShare === totalProcessingCost (no agorot lost)", () => {
    expect(result.clientProcessingShare + result.brokerProcessingShare)
      .toBe(result.totalProcessingCost);
  });

  it("grossAmount", () => {
    expect(result.grossAmount).toBe(206);
  });

  it("netAmount", () => {
    expect(result.netAmount).toBe(195);
  });

  it("applicationFeeAmount === totalProcessingCost", () => {
    expect(result.applicationFeeAmount).toBe(11);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });

  it("platformProfitFee === 0", () => {
    expect(result.platformProfitFee).toBe(0);
  });
});

// ── BREAK_EVEN_SPLIT: zero fees (all percentages and fixed = 0) ───────────────

describe("BREAK_EVEN_SPLIT — all fees zero (measurement/test mode)", () => {
  const zeroConfig: FeeConfig = {
    feeMode:                 "BREAK_EVEN_SPLIT",
    stripeProcessingPercent: 0,
    stripeFxPercent:         0,
    connectVolumePercent:    0,
    stripeFixedFeeAgorot:    0,
    payoutFixedFeeAgorot:    0,
    providerFeePercent:      0,
    platformFeePercent:      0,
    minimumPlatformFee:      0,
  };

  const result = calculateFees(50_000, zeroConfig);

  it("totalProcessingCost is 0", () => {
    expect(result.totalProcessingCost).toBe(0);
  });

  it("grossAmount equals commission when fees are zero", () => {
    expect(result.grossAmount).toBe(50_000);
  });

  it("netAmount equals commission when fees are zero", () => {
    expect(result.netAmount).toBe(50_000);
  });

  it("applicationFeeAmount is 0", () => {
    expect(result.applicationFeeAmount).toBe(0);
  });

  it("netAmount + applicationFeeAmount === grossAmount  [core invariant]", () => {
    expect(result.netAmount + result.applicationFeeAmount).toBe(result.grossAmount);
  });
});

// ── Legacy SPLIT mode — backward-compatibility ─────────────────────────────────

describe("Legacy SPLIT mode — backward compatibility", () => {
  const splitConfig: FeeConfig = {
    feeMode:             "SPLIT",
    providerFeePercent:  1.4,
    platformFeePercent:  2,
    minimumPlatformFee:  500,
    // BREAK_EVEN_SPLIT fields unused
    stripeProcessingPercent: 0,
    stripeFxPercent:         0,
    connectVolumePercent:    0,
    stripeFixedFeeAgorot:    0,
    payoutFixedFeeAgorot:    0,
  };

  describe("₪10,000 commission (1,000,000 agorot)", () => {
    // processorFee  = round(1000000 * 1.4 / 100) = 14000
    // platformFee   = max(round(1000000 * 2 / 100), 500) = max(20000, 500) = 20000
    // grossAmount   = 1000000 + 14000 = 1014000
    // netAmount     = 1000000 - 20000 = 980000
    // applicationFeeAmount = platformFee = 20000  (old behaviour)

    const result = calculateFees(1_000_000, splitConfig);

    it("processorFee", () => { expect(result.processorFee).toBe(14_000); });
    it("platformFee",  () => { expect(result.platformFee).toBe(20_000);  });
    it("grossAmount",  () => { expect(result.grossAmount).toBe(1_014_000); });
    it("netAmount",    () => { expect(result.netAmount).toBe(980_000);   });

    it("applicationFeeAmount === platformFee (legacy behaviour preserved)", () => {
      expect(result.applicationFeeAmount).toBe(result.platformFee);
    });

    it("feePaidBy is SPLIT", () => {
      expect(result.feePaidBy).toBe("SPLIT");
    });

    it("platformProfitFee === platformFee for legacy modes", () => {
      expect(result.platformProfitFee).toBe(result.platformFee);
    });
  });

  describe("minimum platform fee floor applied on small commission", () => {
    // commission = 20,000 (₪200)
    // processorFee  = round(20000 * 1.4 / 100) = round(280) = 280
    // rawPlatformFee = round(20000 * 2 / 100) = round(400) = 400
    // platformFee   = max(400, 500) = 500  ← minimum fires
    // grossAmount   = 20000 + 280 = 20280
    // netAmount     = 20000 - 500 = 19500

    const result = calculateFees(20_000, splitConfig);

    it("minimum platform fee floor is applied", () => {
      expect(result.platformFee).toBe(500);
    });

    it("grossAmount", () => { expect(result.grossAmount).toBe(20_280); });
    it("netAmount",   () => { expect(result.netAmount).toBe(19_500);   });

    it("applicationFeeAmount === platformFee (= minimum fee)", () => {
      expect(result.applicationFeeAmount).toBe(500);
    });
  });
});

// ── Legacy BROKER mode ────────────────────────────────────────────────────────

describe("Legacy BROKER mode", () => {
  const brokerConfig: FeeConfig = {
    feeMode:             "BROKER",
    providerFeePercent:  1.4,
    platformFeePercent:  2,
    minimumPlatformFee:  0,
    stripeProcessingPercent: 0,
    stripeFxPercent:         0,
    connectVolumePercent:    0,
    stripeFixedFeeAgorot:    0,
    payoutFixedFeeAgorot:    0,
  };

  const result = calculateFees(100_000, brokerConfig);

  // processorFee = 1400, platformFee = 2000
  // grossAmount = 100000 (broker absorbs all), netAmount = 96600

  it("grossAmount equals commission (broker absorbs all)", () => {
    expect(result.grossAmount).toBe(100_000);
  });

  it("netAmount = commission - processorFee - platformFee", () => {
    expect(result.netAmount).toBe(96_600);
  });

  it("applicationFeeAmount === platformFee", () => {
    expect(result.applicationFeeAmount).toBe(2_000);
  });
});

// ── Legacy CLIENT mode ────────────────────────────────────────────────────────

describe("Legacy CLIENT mode", () => {
  const clientConfig: FeeConfig = {
    feeMode:             "CLIENT",
    providerFeePercent:  1.4,
    platformFeePercent:  2,
    minimumPlatformFee:  0,
    stripeProcessingPercent: 0,
    stripeFxPercent:         0,
    connectVolumePercent:    0,
    stripeFixedFeeAgorot:    0,
    payoutFixedFeeAgorot:    0,
  };

  const result = calculateFees(100_000, clientConfig);

  // processorFee = 1400, platformFee = 2000
  // grossAmount = 103400, netAmount = 100000

  it("grossAmount = commission + processorFee + platformFee", () => {
    expect(result.grossAmount).toBe(103_400);
  });

  it("netAmount equals commission (client absorbs all)", () => {
    expect(result.netAmount).toBe(100_000);
  });

  it("applicationFeeAmount === platformFee", () => {
    expect(result.applicationFeeAmount).toBe(2_000);
  });
});

// ── defaultFeeConfig env var parsing ─────────────────────────────────────────

describe("defaultFeeConfig — env var parsing", () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    // Restore env after each test
    for (const key of Object.keys(process.env)) {
      if (!(key in ORIGINAL_ENV)) delete process.env[key];
    }
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it("defaults to SPLIT mode with all-zero fees when no env vars are set", () => {
    delete process.env.FEE_MODE;
    delete process.env.STRIPE_PROCESSING_PERCENT;
    delete process.env.STRIPE_FX_PERCENT;
    delete process.env.CONNECT_VOLUME_PERCENT;
    delete process.env.STRIPE_FIXED_FEE_AGOROT;
    delete process.env.PAYOUT_FIXED_FEE_AGOROT;
    delete process.env.PROVIDER_FEE_PERCENT;
    delete process.env.PLATFORM_FEE_PERCENT;
    delete process.env.MINIMUM_PLATFORM_FEE;

    const config = defaultFeeConfig();
    expect(config.feeMode).toBe("SPLIT");
    expect(config.stripeProcessingPercent).toBe(0);
    expect(config.stripeFixedFeeAgorot).toBe(0);
    expect(config.providerFeePercent).toBe(0);
    expect(config.platformFeePercent).toBe(0);
    expect(config.minimumPlatformFee).toBe(0);
  });

  it("reads BREAK_EVEN_SPLIT mode and all BREAK_EVEN_SPLIT vars", () => {
    process.env.FEE_MODE                  = "BREAK_EVEN_SPLIT";
    process.env.STRIPE_PROCESSING_PERCENT = "4.4";
    process.env.STRIPE_FX_PERCENT         = "1.0";
    process.env.CONNECT_VOLUME_PERCENT    = "0.25";
    process.env.STRIPE_FIXED_FEE_AGOROT   = "111";
    process.env.PAYOUT_FIXED_FEE_AGOROT   = "93";

    const config = defaultFeeConfig();
    expect(config.feeMode).toBe("BREAK_EVEN_SPLIT");
    expect(config.stripeProcessingPercent).toBe(4.4);
    expect(config.stripeFxPercent).toBe(1.0);
    expect(config.connectVolumePercent).toBe(0.25);
    expect(config.stripeFixedFeeAgorot).toBe(111);
    expect(config.payoutFixedFeeAgorot).toBe(93);
  });

  it("falls back to SPLIT for an unrecognised FEE_MODE value", () => {
    process.env.FEE_MODE = "INVALID_MODE";
    const config = defaultFeeConfig();
    expect(config.feeMode).toBe("SPLIT");
  });

  it("is case-insensitive for FEE_MODE", () => {
    process.env.FEE_MODE = "break_even_split";
    const config = defaultFeeConfig();
    expect(config.feeMode).toBe("BREAK_EVEN_SPLIT");
  });
});
