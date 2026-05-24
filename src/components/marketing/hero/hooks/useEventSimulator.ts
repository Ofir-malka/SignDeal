"use client";

/**
 * useEventSimulator — drives the "living feed" of events in the hero card.
 *
 * State machine:
 *   • Maintains a rolling window of the last N events from HERO_EVENTS.
 *   • Cycles through the pool in order (with wraparound) so the narrative
 *     always reads as a coherent deal lifecycle.
 *   • Emits a new event on an interval, advancing one step per tick.
 *   • On first mount, seeds the window with the first WINDOW_SIZE events
 *     (offset slightly so the card looks alive on arrival).
 *
 * ── Interval ─────────────────────────────────────────────────────────────────
 * Desktop (pointer: fine) : 4–5 s interval (2–3 s variance via jitter).
 * Mobile  (pointer: coarse): 8–10 s interval — less distracting on scroll.
 * Reduced motion           : interval set to 0 (no simulation).
 *
 * ── Returns ──────────────────────────────────────────────────────────────────
 * {
 *   events:    HeroEvent[]   — current window (WINDOW_SIZE items, newest first)
 *   activeId:  string        — id of the most-recently-arrived event (for flash ring)
 * }
 *
 * ── Performance ──────────────────────────────────────────────────────────────
 * • Interval is cleared and restarted inside useEffect with proper cleanup.
 * • No global listeners — isMobile is checked once after mount via matchMedia.
 * • State update is a single setState call (no intermediate derived state).
 */

import { useEffect, useRef, useState } from "react";
import { HERO_EVENTS, type HeroEvent } from "@/components/marketing/hero/data/events";

const WINDOW_SIZE    = 4;   // how many events to show in the card at once
const DESKTOP_BASE   = 4500; // ms between events on desktop
const DESKTOP_JITTER = 500;  // ±ms random variance
const MOBILE_BASE    = 8500;
const MOBILE_JITTER  = 1000;

function nextInterval(isMobile: boolean): number {
  const base   = isMobile ? MOBILE_BASE   : DESKTOP_BASE;
  const jitter = isMobile ? MOBILE_JITTER : DESKTOP_JITTER;
  return base + (Math.random() * jitter * 2 - jitter);
}

export interface SimulatorState {
  /** Current window of events, newest first. */
  events:   HeroEvent[];
  /** ID of the most recently added event (used for the flash ring). */
  activeId: string;
}

export function useEventSimulator(reduced: boolean): SimulatorState {
  // Seed window: events 0..WINDOW_SIZE-1, newest (index 0) last in pool order
  const initialEvents = HERO_EVENTS.slice(0, WINDOW_SIZE);

  const [state, setState] = useState<SimulatorState>({
    events:   initialEvents,
    activeId: initialEvents[0].id,
  });

  // Track which pool index comes next.
  const nextIndexRef = useRef<number>(WINDOW_SIZE % HERO_EVENTS.length);
  // Track whether we're on mobile — checked once after mount.
  const isMobileRef  = useRef<boolean>(false);

  useEffect(() => {
    // Don't run the simulation if reduced motion is requested.
    if (reduced) return;

    // Detect coarse pointer (touch / mobile) once after hydration.
    isMobileRef.current = window.matchMedia("(pointer: coarse)").matches;

    let timeoutId: ReturnType<typeof setTimeout>;

    function tick() {
      const idx   = nextIndexRef.current;
      const event = HERO_EVENTS[idx];

      nextIndexRef.current = (idx + 1) % HERO_EVENTS.length;

      setState(prev => ({
        events:   [event, ...prev.events.slice(0, WINDOW_SIZE - 1)],
        activeId: event.id,
      }));

      // Schedule next tick with fresh jitter.
      timeoutId = setTimeout(tick, nextInterval(isMobileRef.current));
    }

    // Kick off the first tick.
    timeoutId = setTimeout(tick, nextInterval(isMobileRef.current));

    return () => clearTimeout(timeoutId);
  }, [reduced]);

  return state;
}
