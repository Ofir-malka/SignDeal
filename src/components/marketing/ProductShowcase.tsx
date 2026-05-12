"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimateIn }      from "@/components/marketing/ui/AnimateIn";
import { GlassCard }      from "@/components/marketing/ui/GlassCard";
import { SectionBadge }   from "@/components/marketing/ui/SectionBadge";
import { SectionWrapper } from "@/components/marketing/ui/SectionWrapper";

/**
 * ProductShowcase — interactive 4-panel product walkthrough.
 *
 * Visual upgrade (Phase 6.5):
 *   • Premium browser/app frame wraps the active mock panel
 *   • Soft violet/indigo gradient glow sits behind the frame for depth
 *   • 3 floating mini status chips around the frame (desktop only, aria-hidden)
 *   • Tab bar: stronger active ring + shadow; easier tap targets
 *   • Panel container: overflow-hidden to prevent mobile scroll bleed
 *
 * Client component — tabs use local useState.
 * All 4 panels render in the DOM (opacity transition) for instant tab switches.
 */

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS = [
  { id: "contract", label: "חוזה חדש בדקה" },
  { id: "signing",  label: "חתימה מהנייד"  },
  { id: "payment",  label: "תשלום מאובטח" },
  { id: "dashboard",label: "דשבורד מעקב"  },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ─── Mock panels ──────────────────────────────────────────────────────────────

/** Panel 1 — contract creation form */
function ContractPanel() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-violet-400/20 text-violet-300 border border-violet-400/30 font-medium">
            טיוטה
          </span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span className="text-xs font-bold text-white">חוזה תיווך חדש</span>
          </div>
        </div>

        {/* Contract type selector */}
        <div>
          <p className="text-[10px] text-indigo-400 mb-1 font-medium">סוג חוזה</p>
          <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 flex items-center justify-between">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="text-xs text-indigo-200">החתמת מתעניין</span>
          </div>
        </div>

        {/* Form fields */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "שם לקוח",    val: "יוסי כהן",              full: false },
            { label: "טלפון",      val: "050-000-0000",           full: false },
            { label: "כתובת נכס",  val: "רוטשילד 15, תל אביב",   full: true  },
            { label: "מחיר (₪)",  val: "2,800,000",              full: false },
            { label: "עמלה (₪)",  val: "28,000",                 full: false },
          ].map(({ label, val, full }) => (
            <div key={label} className={full ? "col-span-2" : ""}>
              <p className="text-[10px] text-indigo-400 mb-1">{label}</p>
              <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white/80 text-right truncate">
                {val}
              </div>
            </div>
          ))}
        </div>

        {/* Template preview strip */}
        <div className="bg-indigo-900/40 border border-white/10 rounded-lg p-3 text-right">
          <p className="text-[10px] text-indigo-400 mb-1 font-medium">תצוגה מקדימה — תבנית</p>
          <p className="text-[11px] text-indigo-200/70 leading-relaxed line-clamp-2">
            הסכם תיווך זה נחתם בין <span className="text-violet-300">יוסי כהן</span> לבין המתווך,
            בגין נכס הנמצא ב<span className="text-violet-300">רוטשילד 15, תל אביב</span>...
          </p>
        </div>

        {/* Action */}
        <button className="w-full bg-violet-500/30 border border-violet-400/50 text-violet-200 text-xs font-bold py-3 rounded-xl text-center hover:bg-violet-500/40 transition-colors flex items-center justify-center gap-2">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
          </svg>
          שלח לחתימה ב-SMS
        </button>
      </div>
    </GlassCard>
  );
}

/** Panel 2 — SMS + signing page mock */
function SigningPanel() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-medium">
            מאובטח ✓
          </span>
          <span className="text-xs font-bold text-white">חתימה דיגיטלית</span>
        </div>

        {/* SMS bubble */}
        <div className="bg-green-500/10 border border-green-400/20 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <span className="text-[10px] text-green-400 font-semibold">SMS נשלח ← 050-000-0000</span>
          </div>
          <p className="text-xs text-green-200/80 leading-relaxed">
            שלום יוסי, חוזה התיווך מוכן לחתימתך מ-SignDeal.
            <span className="text-green-400 underline ml-1 cursor-pointer">לחצו לחתימה</span>
          </p>
        </div>

        {/* Signing interface */}
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] text-indigo-400">חוזה תיווך — יוסי כהן</span>
            <span className="text-[10px] text-emerald-400 font-medium">🔒 מאובטח</span>
          </div>

          {/* Contract excerpt */}
          <div className="px-4 py-3 space-y-1.5 border-b border-white/10">
            {["שם הלקוח: יוסי כהן", "נכס: רוטשילד 15, תל אביב", "עמלת תיווך: ₪28,000"].map((line) => (
              <p key={line} className="text-[11px] text-indigo-300/70 text-right">{line}</p>
            ))}
          </div>

          {/* Signature area */}
          <div className="p-4">
            <p className="text-[10px] text-indigo-400 text-right mb-2">חתימה</p>
            <div className="bg-white/5 rounded-lg h-14 flex items-center justify-center relative overflow-hidden border border-white/10">
              <svg viewBox="0 0 260 55" className="w-full h-10 opacity-95" aria-hidden="true">
                <path
                  d="M18 38 Q35 14 55 34 Q74 52 96 28 Q116 6 140 36 Q162 60 188 30 Q210 6 240 32"
                  fill="none" stroke="#a78bfa" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex items-center justify-center gap-2 mt-2.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[11px] text-emerald-400 font-semibold">נחתם — היום, 10:14</span>
            </div>
          </div>
        </div>

        {/* Broker notification */}
        <div className="bg-violet-500/10 border border-violet-400/20 rounded-lg px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[10px] text-violet-300 font-medium">התראה נשלחה למתווך ✓</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
      </div>
    </GlassCard>
  );
}

/** Panel 3 — payment request + card mock */
function PaymentPanel() {
  return (
    <GlassCard variant="elevated" className="p-5 shadow-xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">

        {/* Top bar */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 font-medium">
            שולם ✓
          </span>
          <span className="text-xs font-bold text-white">בקשת תשלום</span>
        </div>

        {/* Amount */}
        <div className="bg-white/5 border border-white/10 rounded-xl py-6 text-center">
          <p className="text-[10px] text-indigo-400 mb-1.5">עמלת תיווך לתשלום</p>
          <p className="text-4xl font-black text-white tracking-tight">₪28,000</p>
          <p className="text-[10px] text-indigo-400/70 mt-1.5">חוזה — רוטשילד 15, תל אביב</p>
        </div>

        {/* Payment card mock */}
        <div className="bg-gradient-to-br from-violet-600/30 to-indigo-700/30 border border-violet-400/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1">
              <div className="w-6 h-4 rounded bg-amber-400/80" />
              <div className="w-6 h-4 rounded bg-amber-600/50 -ml-2" />
            </div>
            <span className="text-[10px] text-violet-300 font-medium">VISA</span>
          </div>
          <p className="text-xs text-indigo-200/60 tracking-widest mb-3">•••• •••• •••• 4242</p>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-indigo-400">תוקף: 12/27</span>
            <span className="text-[10px] text-indigo-400">יוסי כהן</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-2">
          {[
            { label: "בקשת תשלום נשלחה ב-SMS", done: true,  color: "text-violet-400" },
            { label: "לינק נפתח על ידי הלקוח",  done: true,  color: "text-blue-400"   },
            { label: "תשלום בוצע בכרטיס",        done: true,  color: "text-emerald-400"},
            { label: "אישור נשלח לשני הצדדים",   done: true,  color: "text-emerald-400"},
          ].map(({ label, done, color }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-400/20" : "bg-white/5"}`}>
                {done && (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span className={`text-[11px] ${done ? color : "text-indigo-500"}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

/** Panel 4 — dashboard overview mock */
function DashboardPanel() {
  const CONTRACTS = [
    { name: "יוסי כהן",    prop: "רוטשילד 15, ת״א",   amt: "₪28,000", status: "שולם ✓",          badge: "bg-emerald-400/20 text-emerald-300 border-emerald-400/30" },
    { name: "מיכל לוי",   prop: "דיזנגוף 8, ת״א",    amt: "₪14,500", status: "נחתם",            badge: "bg-violet-400/20 text-violet-300 border-violet-400/30"   },
    { name: "דוד אברהם",  prop: "יפו 33, ירושלים",    amt: "₪9,800",  status: "ממתין לחתימה",   badge: "bg-amber-400/20 text-amber-300 border-amber-400/30"       },
    { name: "שרה מזרחי",  prop: "הרצל 4, נתניה",      amt: "₪11,200", status: "ממתין לתשלום",   badge: "bg-blue-400/20 text-blue-300 border-blue-400/30"          },
  ] as const;

  return (
    <GlassCard variant="elevated" className="p-5 shadow-xl shadow-black/40 w-full">
      <div dir="rtl" className="space-y-4">

        {/* Dashboard header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
            <span className="text-[10px] text-emerald-400 font-medium">פעיל</span>
          </div>
          <span className="text-xs font-bold text-white">לוח הבקרה</span>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "חוזים פעילים", val: "4",       color: "text-violet-300" },
            { label: "סה״כ עמלות",   val: "₪63,500", color: "text-white"      },
            { label: "שולם החודש",   val: "₪28,000", color: "text-emerald-300"},
          ].map(({ label, val, color }) => (
            <div key={label} className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-2.5 text-center">
              <p className={`text-sm font-black ${color}`}>{val}</p>
              <p className="text-[9px] text-indigo-400/70 mt-0.5 leading-tight">{label}</p>
            </div>
          ))}
        </div>

        {/* Contract rows */}
        <div className="space-y-2">
          {CONTRACTS.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between bg-white/5 hover:bg-white/[0.08] rounded-xl px-3 py-2.5 gap-3 transition-colors"
            >
              <div className="min-w-0 flex-1 text-right">
                <p className="text-xs font-semibold text-white truncate">{row.name}</p>
                <p className="text-[10px] text-indigo-400/70 truncate">{row.prop}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${row.badge}`}>
                  {row.status}
                </span>
                <span className="text-[10px] text-white/40">{row.amt}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer action */}
        <div className="flex items-center justify-between pt-1 border-t border-white/10">
          <span className="text-[10px] text-indigo-400/50">עודכן כרגע</span>
          <button className="text-xs text-violet-400 font-medium flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            חוזה חדש
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

// Map tab id → panel component
const PANELS: Record<TabId, React.ReactNode> = {
  contract:  <ContractPanel />,
  signing:   <SigningPanel />,
  payment:   <PaymentPanel />,
  dashboard: <DashboardPanel />,
};

// Descriptions shown beside each panel
const PANEL_COPY: Record<TabId, { eyebrow: string; heading: string; body: string; bullets: string[] }> = {
  contract: {
    eyebrow:  "צעד 1",
    heading:  "חוזה מוכן תוך דקה",
    body:     "בחרו תבנית, מלאו שם לקוח, נכס ועמלה — המערכת מייצרת את החוזה המלא אוטומטית ומוכנת לשלוח.",
    bullets:  ["תבניות מאושרות לכל סוגי החוזים", "שדות חכמים עם מילוי מהיר", "תצוגה מקדימה לפני שליחה"],
  },
  signing: {
    eyebrow:  "צעד 2",
    heading:  "הלקוח חותם מהנייד",
    body:     "לינק חתימה אישי נשלח ב-SMS. הלקוח פותח בדפדפן, קורא את החוזה, וחותם עם האצבע — ללא אפליקציה.",
    bullets:  ["ללא הרשמה ללקוח", "חתימה עם האצבע מכל מכשיר", "התראה מיידית למתווך בחתימה"],
  },
  payment: {
    eyebrow:  "צעד 3",
    heading:  "גביית עמלה ישירות מהחוזה",
    body:     "לאחר החתימה, שלחו בקשת תשלום בלחיצה אחת. הלקוח משלם בכרטיס אשראי — הכסף מגיע אליכם ישירות.",
    bullets:  ["תשלום מאובטח בכרטיס אשראי", "אישור אוטומטי לשני הצדדים", "קבלה דיגיטלית מיידית"],
  },
  dashboard: {
    eyebrow:  "כל הזמן",
    heading:  "מעקב חכם בלוח הבקרה",
    body:     "כל החוזים, הסטטוסים והתשלומים במסך אחד. ראו בדיוק מי חתם, מי שילם ומה ממתין לטיפול.",
    bullets:  ["סטטוס חי לכל חוזה", "סיכום עמלות חודשי", "היסטוריית פעולות מלאה"],
  },
};

// ─── Floating status chips (desktop decorative) ───────────────────────────────

const FLOAT_CHIPS = [
  {
    label: "SMS נשלח",
    color: "text-green-300",
    dot:   "bg-green-400",
    cls:   "top-6 -right-5 lg:-right-8",
  },
  {
    label: "חוזה נחתם ✓",
    color: "text-violet-300",
    dot:   "bg-violet-400",
    cls:   "bottom-20 -right-5 lg:-right-10",
  },
  {
    label: "תשלום התקבל",
    color: "text-emerald-300",
    dot:   "bg-emerald-400",
    cls:   "-bottom-4 left-8",
  },
] as const;

// ─── Browser / app frame ──────────────────────────────────────────────────────

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    /* Outer wrapper: relative anchor for glow + floating chips */
    <div className="relative">

      {/* Background depth glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-8 rounded-[2.5rem] bg-violet-600/[0.09] blur-3xl pointer-events-none"
      />
      {/* Secondary inner glow */}
      <div
        aria-hidden="true"
        className="absolute -inset-2 rounded-3xl bg-indigo-500/[0.06] blur-xl pointer-events-none"
      />

      {/* Frame shell */}
      <div
        className="relative rounded-2xl overflow-hidden
                   border border-white/[0.13]
                   shadow-[0_28px_60px_-8px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.04)]
                   bg-indigo-950/90 backdrop-blur-xl"
      >
        {/* ── Fake browser chrome bar ── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] border-b border-white/[0.08]">
          {/* Traffic-light dots */}
          <div className="flex gap-1.5 shrink-0" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-red-400/60" />
            <div className="w-3 h-3 rounded-full bg-amber-400/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-400/60" />
          </div>

          {/* Fake URL bar */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1.5 bg-white/[0.05] border border-white/[0.08]
                            rounded-md px-3 py-1 max-w-[190px] w-full">
              <svg width="8" height="8" viewBox="0 0 24 24" fill="none"
                stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="text-[10px] text-indigo-400/70 font-mono tracking-tight truncate">
                app.signdeal.co.il
              </span>
            </div>
          </div>

          {/* Right spacer to visually center URL bar */}
          <div className="w-[42px] shrink-0" aria-hidden="true" />
        </div>

        {/* ── Panel content ── */}
        <div className="p-4 sm:p-5">
          {children}
        </div>
      </div>

      {/* ── Floating status chips — desktop only, purely decorative ── */}
      {FLOAT_CHIPS.map(({ label, color, dot, cls }) => (
        <div
          key={label}
          aria-hidden="true"
          className={[
            "hidden xl:flex items-center gap-2 absolute z-20",
            "bg-indigo-900/90 border border-white/[0.12] backdrop-blur-md",
            "rounded-xl px-3 py-2 shadow-lg shadow-black/40",
            "text-xs font-semibold",
            color,
            cls,
          ].join(" ")}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 animate-pulse ${dot}`} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ─── Exported section ─────────────────────────────────────────────────────────

export function ProductShowcase() {
  const [active, setActive] = useState<TabId>("contract");
  const copy = PANEL_COPY[active];

  return (
    <SectionWrapper id="product" className="border-t border-white/10">

      {/* ── Section header ──────────────────────────────────────────────── */}
      <div dir="rtl" className="flex flex-col items-center text-center mb-14">
        <AnimateIn delay={0}>
          <SectionBadge>המוצר</SectionBadge>
          <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight mt-2 max-w-3xl mx-auto">
            המערכת שעובדת בשבילכם
            <br className="hidden sm:block" />
            מהרגע שהלקוח מתעניין ועד שהעמלה נגבית
          </h2>
          <p className="text-indigo-200/65 mt-4 max-w-xl mx-auto text-base leading-relaxed">
            לחצו על כל שלב כדי לראות איך SignDeal נראה מבפנים.
          </p>
        </AnimateIn>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────── */}
      <AnimateIn delay={60}>
        <div
          dir="rtl"
          className="flex flex-wrap justify-center gap-2 mb-10"
          role="tablist"
          aria-label="שלבי המוצר"
        >
          {TABS.map((tab, i) => {
            const isActive = active === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className={[
                  "inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold",
                  "transition-all duration-200 border",
                  "min-h-[44px]", /* accessible touch target */
                  isActive
                    ? [
                        "bg-violet-600 border-violet-500/80 text-white",
                        "shadow-lg shadow-violet-500/35",
                        "ring-2 ring-violet-400/30 ring-offset-1 ring-offset-indigo-950",
                      ].join(" ")
                    : "bg-white/[0.05] border-white/10 text-indigo-200 hover:bg-white/10 hover:text-white hover:border-white/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0",
                    isActive ? "bg-white/25 text-white" : "bg-white/10 text-indigo-400",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                {tab.label}
              </button>
            );
          })}
        </div>
      </AnimateIn>

      {/* ── Panel + copy layout ─────────────────────────────────────────── */}
      <div
        dir="rtl"
        className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center"
      >
        {/* Copy column */}
        <AnimateIn delay={0} className="flex flex-col gap-5 text-right order-2 lg:order-1">
          <span className="text-sm font-semibold text-violet-400 tracking-wide">
            {copy.eyebrow}
          </span>

          <h3 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
            {copy.heading}
          </h3>

          <p className="text-indigo-200/75 leading-relaxed">
            {copy.body}
          </p>

          <ul className="space-y-2.5 mt-1" dir="rtl">
            {copy.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-right">
                <svg
                  className="shrink-0 mt-0.5 text-violet-400"
                  width="14" height="14" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span className="text-indigo-200/80 text-sm leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>

          <div className="pt-1">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white text-indigo-700 font-bold text-sm
                         px-6 py-3 rounded-xl hover:bg-indigo-50 active:scale-[0.98]
                         transition-all shadow-lg shadow-black/20"
            >
              נסו עכשיו — חינם
              <svg
                width="13" height="13" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
                className="rotate-180"
              >
                <polyline points="9 18 3 12 9 6" />
              </svg>
            </Link>
          </div>
        </AnimateIn>

        {/* Mock panel column */}
        <div
          id={`panel-${active}`}
          role="tabpanel"
          className="w-full max-w-sm lg:max-w-md mx-auto order-1 lg:order-2 overflow-visible"
          aria-label={TABS.find(t => t.id === active)?.label}
        >
          <AppFrame>
            {PANELS[active]}
          </AppFrame>
        </div>
      </div>

    </SectionWrapper>
  );
}
