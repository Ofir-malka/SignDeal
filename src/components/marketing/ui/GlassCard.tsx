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

const VARIANTS: Record<Variant, string> = {
  base:     "bg-white/5 border border-white/10 backdrop-blur-sm",
  elevated: "bg-white/10 border border-white/20 backdrop-blur-md",
};

export function GlassCard({ variant = "base", className = "", children }: Props) {
  return (
    <div className={["rounded-2xl", VARIANTS[variant], className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}
