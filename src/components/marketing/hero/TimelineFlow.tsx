"use client";

/**
 * TimelineFlow — electrically active vertical connector.
 *
 * ── Geometry (critical for bead ↔ node sync) ──────────────────────────────────
 * The connector is positioned so its top edge aligns with the centre of the
 * first timeline dot, and its bottom edge aligns with the last dot centre.
 * This means the bead's `top: 0%` == dot-0 centre, `top: 100%` == dot-(n-1)
 * centre — so bead and node ripples are mathematically synchronised.
 *
 * Slot geometry (must match TimelineEventFeed constants):
 *   SLOT_HEIGHT = 46 px per row slot
 *   DOT_OFFSET  = 11 px = mt-0.5 (2 px) + half of 18 px dot (9 px)
 *
 *   connector top    = DOT_OFFSET (11 px from feed container top)
 *   connector height = (numNodes − 1) × slotHeight
 *   node i at pct    = i / (numNodes − 1) × 100 %
 *
 * ── Bead ↔ node timing ────────────────────────────────────────────────────────
 * `hero-flow-bead` keyframe (linear, 3 s cycle):
 *   0 %  → top: 0 %   (start, t = 0 s)
 *   85 % → top: 100 % (end,   t = 2.55 s)
 *   100% → top: 100 %, opacity 0 (fade-out tail)
 *
 * Bead arrives at node i at t = (i / (n−1)) × 2.55 s.
 * `nodeDelays` returns exactly these values so each ripple ring fires the
 * instant the bead centre coincides with the dot centre.
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * Pure CSS — no JS timers, no MotionValues, no re-renders.
 * Reduced motion: global @media collapses all durations to 0.01 ms.
 */

// Matches TimelineEventFeed SLOT_HEIGHT constant.
const SLOT_HEIGHT  = 46;
// px from row top to dot centre: mt-0.5 (2 px) + half of w-[18px] dot (9 px).
const DOT_OFFSET   = 11;
// Bead reaches top: 100% at 85% of the 3 s cycle = 2.55 s.
const BEAD_TRAVEL  = 2.55;

/**
 * Compute animation-delay (seconds) for each node's ripple ring so it fires
 * exactly when the bead reaches that node's position on the connector.
 */
function nodeDelays(n: number): number[] {
  if (n <= 1) return [0];
  return Array.from({ length: n }, (_, i) =>
    parseFloat(((i / (n - 1)) * BEAD_TRAVEL).toFixed(2)),
  );
}

interface TimelineFlowProps {
  /** Number of event slots shown. Controls connector height and node count. */
  numNodes?: number;
}

export function TimelineFlow({ numNodes = 4 }: TimelineFlowProps) {
  // Guard: no connector needed for 0 or 1 events.
  if (numNodes <= 1) return null;

  const connectorH = (numNodes - 1) * SLOT_HEIGHT;
  const delays     = nodeDelays(numNodes);

  return (
    <div
      aria-hidden="true"
      className="absolute right-[9px] pointer-events-none select-none"
      style={{ top: DOT_OFFSET, height: connectorH, width: 1 }}
    >
      {/* ── Layer 1: Static base line ──────────────────────────────────────── */}
      <div className="absolute inset-0 bg-white/10" />

      {/* ── Layer 2: Gradient fill — breathing energy level ───────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, " +
            "rgba(167,139,250,0.70) 0%, " +
            "rgba(99,102,241,0.45) 50%, " +
            "rgba(96,165,250,0.20) 100%)",
          animation: "hero-flow-fill 3s ease-in-out infinite",
        }}
      />

      {/* ── Layer 3: Comet trail — lags 40 ms behind bead ────────────────── */}
      <div
        className="absolute right-1/2 translate-x-1/2 rounded-full pointer-events-none"
        style={{
          width:      "9px",
          height:     "9px",
          background: "rgba(167,139,250,0.55)",
          filter:     "blur(5px)",
          animation:  "hero-flow-bead 3s 0.04s linear infinite",
        }}
      />

      {/* ── Layer 4: Bead — bright white core + violet corona ─────────────── */}
      <div
        className="absolute right-1/2 translate-x-1/2 rounded-full pointer-events-none"
        style={{
          width:      "5px",
          height:     "5px",
          background: "white",
          boxShadow:
            "0 0 6px 3px rgba(167,139,250,1), " +
            "0 0 14px 5px rgba(139,92,246,0.80), " +
            "0 0 24px 8px rgba(139,92,246,0.40)",
          animation: "hero-flow-bead 3s linear infinite",
        }}
      />

      {/* ── Layer 5: Node ripple rings ─────────────────────────────────────── */}
      {/* Each ring sits at the dot centre for node i.
          animation-delay = time the bead takes to reach that position.        */}
      {delays.map((delay, i) => {
        const pct = (i / (numNodes - 1)) * 100;
        return (
          <div
            key={i}
            className="absolute right-1/2 rounded-full pointer-events-none"
            style={{
              width:       "10px",
              height:      "10px",
              marginRight: "-5px",
              top:         `${pct}%`,
              marginTop:   "-5px",
              background:  "transparent",
              border:      "1.5px solid rgba(167,139,250,0.85)",
              animation:   `hero-node-ripple 3s ${delay}s ease-out infinite`,
            }}
          />
        );
      })}
    </div>
  );
}
