/**
 * Centralized Hebrew copy for the Grow pre-iframe onboarding preparation screen
 * (GrowLaunchForm + TermsConsentBox). Kept in one place so disclosure/legal copy
 * is easy to review and update without touching component logic.
 *
 * Intentionally NO hardcoded Grow prices (e.g. monthly fee / clearing %): Grow
 * sets and changes those, so we describe the cost structure generically and send
 * the broker to Grow's own pricing/terms during onboarding.
 */

export const GROW_PREP_INTRO = {
  title: "חיבור לסליקת Grow",
  points: [
    "Grow היא ספקית סליקה (תשלומים) חיצונית, נפרדת מ-SignDeal.",
    "החיבור מאפשר לך לקבל תשלומים מלקוחות דרך SignDeal.",
    "השלמת ההרשמה מתבצעת בטופס המאובטח של Grow (בשלב הבא).",
    "עם אישור Grow, SignDeal יקבל מ-Grow את סטטוס ההרשמה ואת פרטי ההתחברות לסליקה — לצורך הפעלת קבלת התשלומים.",
  ],
};

/** Short, business-oriented value proposition shown at the top of the screen. */
export const GROW_PREP_VALUE_PROP =
  "לאחר אישור Grow, תוכל/י לקבל תשלומים מלקוחות ישירות דרך SignDeal.";

export const GROW_PRICING_DISCLOSURE = {
  title: "שירות חיצוני בתשלום",
  points: [
    "Grow היא שירות חיצוני בתשלום.",
    "דמי השימוש, עמלות הסליקה וחיובים נוספים נקבעים על-ידי Grow בהתאם למחירון ולתנאים העדכניים שלה.",
    "מומלץ לעיין במחירון העדכני של Grow לפני המשך ההרשמה.",
  ],
};

/**
 * Official Grow pricing page. The link is rendered ONLY when this is a valid
 * http(s) URL. Do NOT hardcode prices — point to Grow's official pricing page.
 * The broker sees the LABEL (not the raw URL); the link opens in a new tab.
 */
export const GROW_PRICING_URL: string = "https://grow.business/fees-sale/";
export const GROW_PRICING_LINK_LABEL = "מחירון Grow המעודכן";

export const GROW_FUNDS_DISCLOSURE = {
  title: "מי מבצע את הסליקה",
  points: [
    "SignDeal אינה גורם הסליקה ואינה מעבדת את התשלומים.",
    "SignDeal אינה מחזיקה בכספי הלקוחות.",
    "התשלומים מעובדים ישירות על-ידי Grow.",
    "Grow אחראית לעיבוד התשלומים ולהתחשבנות (סליקה והעברת כספים) בהתאם לתנאיה.",
  ],
};

export const GROW_TERMS_INTRO =
  "לפני המעבר לטופס המאובטח של Grow, יש לקרוא ולאשר את ההצהרות הבאות:";

export const GROW_TERMS_DECLARATIONS = [
  "אני מבין/ה ש-Grow היא ספקית סליקה חיצונית, נפרדת מ-SignDeal.",
  "אני מבין/ה כי שירות Grow כרוך בעמלות נפרדות (דמי שימוש, עמלות סליקה וחיובים נוספים) בהתאם למחירון Grow.",
  "אני מאשר/ת העברת הפרטים שהזנתי (מספר עסק וטלפון נייד) ל-Grow לצורך ההרשמה.",
  "אני מצהיר/ה כי אני מורשה/ית לחבר עסק זה ל-Grow.",
  "אני מבין/ה כי אישור Grow כפוף לבדיקות ולתנאים של Grow.",
  "אני מבין/ה כי SignDeal אינה מחזיקה בכספים ואינה אחראית לעיבוד התשלומים.",
];

export const GROW_PREP_COPY = {
  businessNumberLabel: "מספר עוסק / ח.פ / ת.ז",
  businessNumberHelper: "ספרות בלבד (8–9 ספרות).",
  businessNumberError: "יש להזין מספר תקין (8–9 ספרות, ספרות בלבד).",
  phoneLabel: "טלפון נייד (להרשמת Grow)",
  phoneHelper: "מספר ישראלי המתחיל ב-05, 10 ספרות, ללא רווחים או מקפים.",
  phoneError: 'יש להזין מספר נייד תקין: 05 ואחריו 8 ספרות (סה"כ 10).',
  checkboxLabel: "קראתי את כל ההצהרות לעיל ואני מאשר/ת אותן.",
  scrollHint: "יש לגלול עד סוף התנאים כדי לאשר",
  submitIdle: "המשך להרשמת Grow ←",
  submitBusy: "מתחבר…",
  afterSubmitHelper:
    'בלחיצה על "המשך" ייפתח טופס ההרשמה המאובטח של Grow. את פרטי העסק, חשבון הבנק ושאר הפרטים ממלאים בתוך Grow.',
};
