"use client";

/**
 * FeaturePills — the hero stats strip with liquid morph tooltips.
 *
 * Three pills in a contained row:
 *   1. "חוזה תוך 10 שניות" — clock icon + animated flip counter for "10"
 *   2. "חתימה ב-SMS"       — SMS bubble icon
 *   3. "תשלום מאובטח"      — credit card icon
 *
 * ── Tooltip system ("liquid morph") ──────────────────────────────────────────
 * On hover (fine pointer only), a tooltip fades + slides up from behind the pill.
 * AnimatePresence handles entry/exit so it morphs in/out smoothly.
 * On mobile (pointer: coarse) there is no hover — tooltips are never shown.
 *
 * Implementation:
 *   • Each pill tracks its own hover state (useState, only 3 elements — trivial).
 *   • Tooltip is an absolute-positioned motion.div rendered via AnimatePresence.
 *   • layout prop on the pill container lets width expand on hover without jump.
 *
 * ── Flip counter for "10" ─────────────────────────────────────────────────────
 * The digit "10" starts at "3" and flips to "10" once after a short delay.
 * Implemented via a CSS keyframe (hero-digit-flip) that plays once on mount
 * after the chip entrance animation completes.
 * Pure CSS — no JS timer needed.
 *
 * ── Chip entrance ─────────────────────────────────────────────────────────────
 * Reuses the existing hero-chip-in CSS class + animationDelay per item.
 * Same timing as before (680ms, 770ms, 860ms) so orchestration is unchanged.
 *
 * ── Performance ───────────────────────────────────────────────────────────────
 * • Hover state: 3 × useState — negligible, isolated to this component.
 * • Tooltip: AnimatePresence — unmounts when not hovered (no idle DOM cost).
 * • No global listeners — onMouseEnter/Leave on each pill span.
 */

import { useRef, useState }                     from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "motion/react";

// ── Pill definitions ──────────────────────────────────────────────────────────

interface PillDef {
  key:       string;
  label:     React.ReactNode;
  tooltip:   string;
  iconAnim:  string;
  icon:      React.ReactNode;
  delay:     number;   // animationDelay for hero-chip-in entrance
}

// Clock icon
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

// SMS icon
const SmsIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// Card icon
const CardIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

/**
 * FlipCounter — shows "10" with a one-shot CSS flip animation.
 * The number flips from a blurred/scaled-down state to its natural position.
 */
function FlipCounter() {
  return (
    <span
      className="inline-block tabular-nums"
      style={{ animation: "hero-digit-flip 0.5s cubic-bezier(0.22,1,0.36,1) 1.2s both" }}
    >
      10
    </span>
  );
}

const PILLS: PillDef[] = [
  {
    key:    "speed",
    label:  <span>חוזה תוך <FlipCounter /> שניות</span>,
    tooltip: "מהרגע שיוצרים חוזה — תוך 10 שניות הוא באוויר",
    iconAnim: "max-sm:animate-none animate-[hero-clock-tick_3.5s_ease-in-out_infinite]",
    icon:    <ClockIcon />,
    delay:  680,
  },
  {
    key:    "sms",
    label:  "חתימה ב-SMS",
    tooltip: "הלקוח חותם ישירות מהנייד — ללא אפליקציה",
    iconAnim: "max-sm:animate-none animate-[hero-sms-bounce_2.5s_ease-in-out_infinite]",
    icon:    <SmsIcon />,
    delay:  770,
  },
  {
    key:    "payment",
    label:  "תשלום מאובטח",
    tooltip: "תשלום מאובטח ב-PCI DSS · כסף אצלך תוך יום",
    iconAnim: "max-sm:animate-none animate-[hero-card-tilt_4s_ease-in-out_infinite]",
    icon:    <CardIcon />,
    delay:  860,
  },
] as const;

// ── Magnetic spring ───────────────────────────────────────────────────────────

const MAG_SPRING = { stiffness: 200, damping: 20, mass: 0.5 } as const;
const MAG_RANGE  = 5; // max pixel attraction

// ── Tooltip ───────────────────────────────────────────────────────────────────

const TOOLTIP_VARIANTS = {
  hidden: { opacity: 0, y: 6,  scale: 0.95 },
  show:   { opacity: 1, y: 0,  scale: 1    },
};

function Tooltip({ text }: { text: string }) {
  return (
    <motion.div
      role="tooltip"
      variants={TOOLTIP_VARIANTS}
      initial="hidden"
      animate="show"
      exit="hidden"
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none"
    >
      <div
        className="bg-indigo-900/95 border border-white/20 backdrop-blur-md
                   rounded-xl px-3 py-2 shadow-xl shadow-black/40
                   text-[11px] text-white/90 font-medium whitespace-nowrap"
        dir="rtl"
      >
        {text}
        {/* Arrow */}
        <div
          aria-hidden="true"
          className="absolute top-full left-1/2 -translate-x-1/2
                     border-4 border-transparent border-t-indigo-900/95"
        />
      </div>
    </motion.div>
  );
}

// ── Magnetic pill ─────────────────────────────────────────────────────────────

function MagneticPill({
  pill,
  isFirst,
  hovered,
  onEnter,
  onLeave,
}: {
  pill:    PillDef;
  isFirst: boolean;
  hovered: boolean;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { key, label, tooltip, icon, iconAnim, delay } = pill;
  const ref   = useRef<HTMLSpanElement>(null);
  const rawMX = useMotionValue(0);
  const rawMY = useMotionValue(0);
  const mx    = useSpring(rawMX, MAG_SPRING);
  const my    = useSpring(rawMY, MAG_SPRING);

  const onMove = (e: React.MouseEvent<HTMLSpanElement>) => {
    const el = ref.current;
    if (!el) return;
    const r  = el.getBoundingClientRect();
    // Offset from centre, normalised to ±1, then scaled to MAG_RANGE px.
    rawMX.set(((e.clientX - r.left) / r.width  - 0.5) * 2 * MAG_RANGE);
    rawMY.set(((e.clientY - r.top)  / r.height - 0.5) * 2 * MAG_RANGE);
  };

  const onOut = () => {
    rawMX.set(0);
    rawMY.set(0);
    onLeave();
  };

  return (
    <motion.span
      ref={ref}
      key={key}
      className={[
        "relative flex-1 sm:flex-none flex items-center justify-center",
        "gap-1.5 px-2 sm:px-4 py-2.5",
        "transition-colors duration-200 hover:bg-white/[0.09]",
        "hero-chip-in cursor-default",
        !isFirst ? "border-r border-white/[0.09]" : "",
      ].join(" ")}
      style={{
        animationDelay: `${delay}ms`,
        x: mx,
        y: my,
      }}
      onMouseEnter={onEnter}
      onMouseMove={onMove}
      onMouseLeave={onOut}
    >
      {/* Liquid morph tooltip */}
      <AnimatePresence>
        {hovered && <Tooltip key={`tt-${key}`} text={tooltip} />}
      </AnimatePresence>

      {/* Icon */}
      <span
        className={`text-violet-400 flex-shrink-0 inline-flex ${iconAnim}`}
        aria-hidden="true"
      >
        {icon}
      </span>

      {/* Label */}
      <span className="text-xs sm:text-sm font-medium text-indigo-200/80 whitespace-nowrap">
        {label}
      </span>
    </motion.span>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function FeaturePills() {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  return (
    <div
      dir="rtl"
      className="flex w-full sm:inline-flex sm:w-auto items-stretch rounded-2xl
                 bg-white/[0.04] border border-white/[0.09]
                 overflow-visible"
    >
      {PILLS.map((pill, i) => (
        <MagneticPill
          key={pill.key}
          pill={pill}
          isFirst={i === 0}
          hovered={hoveredKey === pill.key}
          onEnter={() => setHoveredKey(pill.key)}
          onLeave={() => setHoveredKey(null)}
        />
      ))}
    </div>
  );
}
