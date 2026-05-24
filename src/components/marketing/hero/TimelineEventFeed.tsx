"use client";

/**
 * TimelineEventFeed — fixed-height slot-based live event feed.
 *
 * ── Architecture (layout-shift free) ─────────────────────────────────────────
 * The feed container has a fixed pixel height equal to MAX_SLOTS × SLOT_HEIGHT.
 * It NEVER changes size regardless of how many events are visible or whether
 * an event is entering or exiting. This means the parent card never reflows.
 *
 * Each event row is `position: absolute; top: 0` and animates only its
 * CSS `transform: translateY` (via Framer Motion `y`).
 *
 *   • New event  → enters from y = −SLOT_HEIGHT (above the container).
 *   • Existing   → shifts down one slot: y goes from (i−1)×SH to i×SH.
 *   • Oldest out → exits to y = FEED_HEIGHT + SLOT_HEIGHT (below the
 *                  overflow-hidden boundary, becomes invisible).
 *
 * Opacity is also animated alongside y — purely via transform+opacity,
 * no layout-triggering properties.
 *
 * ── Why this replaces AnimatePresence mode="popLayout" ────────────────────────
 * `mode="popLayout"` removes exiting items from document flow immediately.
 * However, if the remaining items use the `layout` prop, React/Framer still
 * triggers a layout read+write on every event insertion to resolve new sizes.
 * This causes the card to "jump" because the feed container height is not fixed.
 *
 * With absolute positioning every item is already out of normal flow.
 * The container height is hard-coded. No layout read is ever triggered.
 *
 * ── TimelineFlow synchronisation ─────────────────────────────────────────────
 * SLOT_HEIGHT here MUST equal SLOT_HEIGHT in TimelineFlow.tsx (both = 46 px).
 * The connector geometry in TimelineFlow is derived from this constant.
 *
 * ── Motion restraint ─────────────────────────────────────────────────────────
 * Spring: stiffness 180 / damping 28 / mass 0.9 — heavy, damped, precise.
 * Exits use a quick ease (0.22 s) so the slot vacates before the next event
 * arrives in its place.
 * No `layout`, no `layoutId`, no `mode="popLayout"`.
 */

import { AnimatePresence, motion } from "motion/react";
import { TimelineFlow }            from "@/components/marketing/hero/TimelineFlow";
import {
  type HeroEvent,
  type HeroEventIcon,
}                                  from "@/components/marketing/hero/data/events";

// ── Fixed geometry ────────────────────────────────────────────────────────────

/** Height of one row slot in px. Keep in sync with TimelineFlow.tsx constant. */
const SLOT_HEIGHT = 46;
/** Maximum simultaneous rows. Equal to useEventSimulator WINDOW_SIZE. */
const MAX_SLOTS   = 4;
/** Feed container height — fixed, never changes. */
const FEED_HEIGHT = MAX_SLOTS * SLOT_HEIGHT; // 184 px

// ── Visual depth constants ────────────────────────────────────────────────────

/** Opacity by slot index — newest (0) full, older rows fade into history. */
const SLOT_OPACITY: readonly number[] = [1.00, 0.80, 0.65, 0.52];

/** Relative timestamp by slot index. Recomputed automatically on each insert. */
const SLOT_TIMES: readonly string[] = ["עכשיו", "5 שנ׳", "18 שנ׳", "45 שנ׳"];

// ── Motion config ─────────────────────────────────────────────────────────────

/**
 * Slot-shift spring — used for enter and shift animations.
 * Mass 0.9 = slightly heavy. Damping 28 = no oscillation.
 */
const SHIFT_SPRING = {
  type:      "spring" as const,
  stiffness: 180,
  damping:   28,
  mass:      0.9,
};

/** Exit: quick ease so the slot is clear before the container settles. */
const EXIT_TRANSITION = { duration: 0.22, ease: "easeIn" as const };

// ── Icon map ──────────────────────────────────────────────────────────────────

function EventIcon({ icon, color }: { icon: HeroEventIcon; color: string }) {
  const cls = `${color} shrink-0`;
  switch (icon) {
    case "contract":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "sms":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "signature":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "payment":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      );
    case "transfer":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "star":
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="currentColor" stroke="none" aria-hidden="true">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    default:
      return (
        <svg className={cls} width="11" height="11" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
  }
}

// ── Row content ───────────────────────────────────────────────────────────────

/**
 * EventRowContent — pure presentational component.
 * All animation (position, opacity) is handled by the parent motion.div in
 * TimelineEventFeed. This component only renders the visual content.
 */
function EventRowContent({
  event,
  slotIndex,
  isActive,
}: {
  event:      HeroEvent;
  slotIndex:  number;
  isActive:   boolean;
}) {
  const timeLabel = SLOT_TIMES[Math.min(slotIndex, SLOT_TIMES.length - 1)];
  const isFirst   = slotIndex === 0;

  return (
    <div className="flex items-start gap-2.5 pt-[3px]">

      {/* ── Dot ── */}
      <div className="relative z-10 shrink-0 mt-0.5 flex-none">
        <div
          className={[
            "w-[18px] h-[18px] rounded-full flex items-center justify-center",
            `${event.dotCls}/20 border border-current ${event.color}`,
          ].join(" ")}
        >
          {/* Inner dot: pulses only on the active (newest) slot. */}
          <div
            className={[
              "w-1.5 h-1.5 rounded-full",
              event.dotCls,
              isFirst && isActive ? "animate-pulse" : "",
            ].join(" ")}
          />
        </div>
      </div>

      {/* ── Text ── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <p className={`text-[11px] font-semibold ${event.color} flex items-center gap-1`}>
            <EventIcon icon={event.icon} color={event.color} />
            {event.label}
          </p>
          {/* Timestamp — slot-index-based, no Date.now() → no hydration mismatch. */}
          <span
            className={[
              "text-[9px] px-1.5 py-0.5 rounded-full shrink-0",
              isFirst
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "bg-white/[0.07] text-white/40",
            ].join(" ")}
          >
            {timeLabel}
          </span>
        </div>
        <p className="text-[10px] text-indigo-400/60 mt-0.5">{event.sub}</p>
      </div>

    </div>
  );
}

// ── Feed ──────────────────────────────────────────────────────────────────────

interface TimelineEventFeedProps {
  events:   HeroEvent[];
  activeId: string;
}

export function TimelineEventFeed({ events, activeId }: TimelineEventFeedProps) {
  return (
    /*
     * Fixed-height container. `overflow: hidden` clips rows that are
     * animating in from above or out below — the card height never changes.
     */
    <div
      className="relative"
      style={{ height: FEED_HEIGHT, overflow: "hidden" }}
    >
      {/* Connector line — numNodes drives geometry, not container height. */}
      <TimelineFlow numNodes={Math.min(events.length, MAX_SLOTS)} />

      <AnimatePresence initial={false}>
        {events.map((event, i) => (
          /*
           * Each row is `position: absolute; top: 0` so it occupies no
           * height in the layout. Its visual position is determined purely
           * by `y = i * SLOT_HEIGHT`.
           *
           * When a new event arrives (i shifts for all existing events):
           *   existing rows:  y = (i-1)*SH → y = i*SH  (spring shift down)
           *   new event:      y = -SH       → y = 0     (spring enter from top)
           *   oldest event:   AnimatePresence exit → y = FEED_HEIGHT (ease out)
           *
           * Opacity is co-animated with y — no separate opacity animation pass.
           */
          <motion.div
            key={event.id}
            initial={{ y: -SLOT_HEIGHT, opacity: 0 }}
            animate={{
              y:       i * SLOT_HEIGHT,
              opacity: SLOT_OPACITY[Math.min(i, SLOT_OPACITY.length - 1)],
            }}
            exit={{
              y:          FEED_HEIGHT,
              opacity:    0,
              transition: EXIT_TRANSITION,
            }}
            transition={SHIFT_SPRING}
            style={{
              position: "absolute",
              top:      0,
              left:     0,
              right:    0,
              height:   SLOT_HEIGHT,
              // Prevent any overflow within a slot from affecting siblings.
              overflow: "hidden",
            }}
          >
            <EventRowContent
              event={event}
              slotIndex={i}
              isActive={event.id === activeId}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
