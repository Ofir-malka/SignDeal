import type { ReactNode } from "react";

type Variant = "base" | "elevated";

interface Props {
  /**
   * base     — subtle glass surface (bg-white/5, border-white/10, blur-sm)
   * elevated — stronger glass for hero/spotlight mocks (bg-white/10, border-white/20, blur-md)
   */
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

// Mobile performance: backdrop-blur is the #1 cause of iOS scroll jank.
// Every GlassCard with backdrop-filter creates a GPU compositing layer that
// must continuously sample + blur the pixels behind it on every scroll frame.
// With 20+ GlassCards across the homepage this makes scroll feel stuck/heavy.
// Fix: remove backdrop-blur below the sm breakpoint (768 px). A slightly
// higher base opacity compensates — the dark indigo background means the
// visual difference is imperceptible to the user.
const VARIANTS: Record<Variant, string> = {
  base:     "bg-white/[0.07] sm:bg-white/5  border border-white/10 sm:backdrop-blur-sm",
  elevated: "bg-white/[0.12] sm:bg-white/10 border border-white/20 sm:backdrop-blur-md",
};

export function GlassCard({ variant = "base", className = "", children }: Props) {
  return (
    <div className={["rounded-2xl", VARIANTS[variant], className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
