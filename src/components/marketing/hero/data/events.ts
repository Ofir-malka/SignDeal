/**
 * Hero event pool — the "living fintech feed" simulation data.
 *
 * Events are drawn in sequence (with wrapping) by useEventSimulator.
 * Each event carries:
 *   • id          — stable React key
 *   • label       — Hebrew display text (kept short — max ~18 chars)
 *   • sub         — secondary detail line
 *   • color       — Tailwind text color class for the icon/dot
 *   • dotCls      — Tailwind bg color class for the timeline dot
 *   • icon        — which icon variant to render (handled in TimelineEventFeed)
 *   • weight      — "high" events trigger the micro-haptic flash ring
 *
 * Pool design principles:
 *  • Emotional-financial weight — every event feels like a real milestone.
 *  • Progressive narrative — reads as a complete deal lifecycle top→bottom.
 *  • Enough variety (13 events) that a 2-minute visit never loops visibly.
 *  • Labels ≤ 18 Hebrew chars so they fit the card without truncation.
 */

export type HeroEventIcon =
  | "contract"   // document / contract created
  | "sms"        // SMS dispatched or opened
  | "signature"  // digital signature
  | "payment"    // payment request or receipt
  | "transfer"   // funds transferred to broker
  | "check"      // generic ✓ completion
  | "shield"     // verification / security
  | "star";      // high-value milestone

export type HeroEventWeight = "normal" | "high";

export interface HeroEvent {
  id:     string;
  label:  string;
  sub:    string;
  color:  string;   // Tailwind text-* class
  dotCls: string;   // Tailwind bg-* class
  icon:   HeroEventIcon;
  weight: HeroEventWeight;
}

export const HERO_EVENTS: HeroEvent[] = [
  {
    id:     "ev-contract-created",
    label:  "חוזה נוצר",
    sub:    "חוזה תיווך — יוסי כהן",
    color:  "text-violet-300",
    dotCls: "bg-violet-400",
    icon:   "contract",
    weight: "normal",
  },
  {
    id:     "ev-sms-sent",
    label:  "SMS נשלח ללקוח",
    sub:    "נשלח ל-054-xxx-1234",
    color:  "text-blue-300",
    dotCls: "bg-blue-400",
    icon:   "sms",
    weight: "normal",
  },
  {
    id:     "ev-sms-opened",
    label:  "לקוח פתח את ה-SMS",
    sub:    "נפתח בנייד — 12 שנ׳ לאחר השליחה",
    color:  "text-blue-300",
    dotCls: "bg-blue-400",
    icon:   "sms",
    weight: "normal",
  },
  {
    id:     "ev-doc-verified",
    label:  "מסמך אומת דיגיטלית",
    sub:    "זיהוי ביומטרי הושלם",
    color:  "text-indigo-300",
    dotCls: "bg-indigo-400",
    icon:   "shield",
    weight: "normal",
  },
  {
    id:     "ev-signed",
    label:  "הלקוח חתם בהצלחה",
    sub:    "חתימה דיגיטלית אומתה",
    color:  "text-emerald-300",
    dotCls: "bg-emerald-400",
    icon:   "signature",
    weight: "high",
  },
  {
    id:     "ev-payment-requested",
    label:  "בקשת תשלום נשלחה",
    sub:    "לינק מאובטח ב-SMS",
    color:  "text-amber-300",
    dotCls: "bg-amber-400",
    icon:   "payment",
    weight: "normal",
  },
  {
    id:     "ev-payment-received",
    label:  "תשלום התקבל",
    sub:    "₪12,000 שולמו בהצלחה",
    color:  "text-emerald-300",
    dotCls: "bg-emerald-400",
    icon:   "payment",
    weight: "high",
  },
  {
    id:     "ev-fee-approved",
    label:  "עמלת תיווך אושרה",
    sub:    "₪12,000 · אחוז 2% מהנכס",
    color:  "text-amber-300",
    dotCls: "bg-amber-400",
    icon:   "check",
    weight: "normal",
  },
  {
    id:     "ev-transfer-done",
    label:  "₪12,000 הועברו לחשבון",
    sub:    "העברה בנקאית אושרה",
    color:  "text-emerald-300",
    dotCls: "bg-emerald-400",
    icon:   "transfer",
    weight: "high",
  },
  {
    id:     "ev-payment-complete",
    label:  "התשלום הושלם",
    sub:    "קבלה נשלחה אוטומטית",
    color:  "text-violet-300",
    dotCls: "bg-violet-400",
    icon:   "check",
    weight: "normal",
  },
  {
    id:     "ev-deal-closed",
    label:  "החוזה נסגר בהצלחה",
    sub:    "31 דק׳ מחוזה לתשלום ✓",
    color:  "text-emerald-300",
    dotCls: "bg-emerald-400",
    icon:   "star",
    weight: "high",
  },
  {
    id:     "ev-new-contract",
    label:  "חוזה חדש נפתח",
    sub:    "דירה ברחוב הרצל, ת״א",
    color:  "text-violet-300",
    dotCls: "bg-violet-400",
    icon:   "contract",
    weight: "normal",
  },
  {
    id:     "ev-sms-2",
    label:  "SMS נשלח ללקוח",
    sub:    "נשלח ל-052-xxx-9876",
    color:  "text-blue-300",
    dotCls: "bg-blue-400",
    icon:   "sms",
    weight: "normal",
  },
] as const satisfies HeroEvent[];
