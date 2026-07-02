/**
 * seed-templates.mts
 *
 * Upserts platform contract templates by (templateKey, language).
 * These are lawyer-supplied legal texts — NOT user-editable from the UI.
 *
 * Usage:
 *   npm run seed:templates          ← loads .env automatically
 *   — or —
 *   DATABASE_URL="..." npx tsx scripts/seed-templates.mts
 *
 * Behaviour:
 *   • Finds each template by (templateKey, language).
 *   • If content changed → updates + increments version.
 *   • If content unchanged → skips (idempotent).
 *   • If not found → creates (version 1).
 *   • Never creates duplicates; safe to run repeatedly.
 *
 * ── LANGUAGE SUPPORT ─────────────────────────────────────────────────────────
 *   Templates are resolved by (templateKey + language).
 *   Default language = HE. If a requested language has no template, the server
 *   falls back to HE. Other languages (EN/FR/RU/AR) are stubbed as TODO.
 *
 * ── SUPPORTED PLACEHOLDERS ───────────────────────────────────────────────────
 * Use {{key}} syntax anywhere in `content`. Unknown keys are left as-is.
 *
 * Broker
 *   {{brokerName}}      full name of the broker
 *   {{brokerLicense}}   broker license number   (fallback: "—")
 *   {{brokerPhone}}     broker phone number      (fallback: "—")
 *   {{brokerIdNumber}}  broker ID number         (fallback: "—")
 *
 * Client
 *   {{clientName}}      client full name
 *   {{clientIdNumber}}  client ID number         (fallback: "—")
 *   {{clientPhone}}     client phone number
 *   {{clientEmail}}     client email address     (fallback: "—")
 *
 * Property & deal
 *   {{propertyAddress}} street address of the property
 *   {{propertyCity}}    city of the property
 *   {{propertyPrice}}   formatted price, e.g. ₪1,500,000
 *   {{dealType}}        "שכירות" or "מכירה"
 *   {{commission}}      formatted commission, e.g. ₪15,000
 *
 * Client (signing-page completion)
 *   {{clientAddress}}   client residential address    (fallback: "—")
 *
 * Rental
 *   {{rentalCommissionClause}}  full clause-6.1 sentence, built from the broker's
 *                               chosen rental commission mode (ONE_MONTH / FIXED)
 *
 * Sale
 *   {{saleCommissionClause}}    full clause-5.1 sentence, built from the broker's
 *                               chosen sale commission mode (PERCENT / FIXED);
 *                               PERCENT states the chosen percentage, FIXED (or
 *                               absent mode) states the stored commission amount
 *
 * Dates & metadata
 *   {{today}}           contract creation date, DD.MM.YYYY
 *   {{contractId}}      last 8 chars of contract ID, uppercased
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env relative to the project root
dotenvConfig({ path: resolve(process.cwd(), ".env") });

import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

// ── DB connection (mirrors src/lib/prisma.ts) ─────────────────────────────────

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("❌  DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma = new PrismaClient({ adapter } as never);
const p = prisma as any;

// ── Template definitions ──────────────────────────────────────────────────────
// Each entry identified by (key, language). Add a new entry for each language.
// All {{placeholders}} listed above are supported.

const TEMPLATES: Array<{
  key: "INTERESTED_BUYER" | "OWNER_EXCLUSIVE" | "BROKER_COOP" | "INTERESTED_BUYER_RENTAL" | "INTERESTED_BUYER_SALE";
  language: "HE" | "EN" | "FR" | "RU" | "AR";
  title: string;
  content: string;
}> = [

    // ── INTERESTED_BUYER · HE ─────────────────────────────────────────────────
    // Lawyer-approved Hebrew legal text per חוק המתווכים במקרקעין תשנ״ו 1996
    {
      key: "INTERESTED_BUYER",
      language: "HE",
      title: "החתמת מתעניין — טופס הזמנת שירותי תיווך",
      content: `טופס הזמנת שירותי תיווך
בהתאם לחוק המתווכים במקרקעין התשנ״ו 1996

הננו מזמינים מ: {{brokerName}}, סוכן תיווך נדל״ן,
ת.ז: {{brokerIdNumber}} רישיון מס: {{brokerLicense}} נייד: {{brokerPhone}}
שירותי תיווך עבור הנכס הרשום להלן כדלהלן:

קונה / שוכר

שם מלא {{clientName}} ת.ז. {{clientIdNumber}} טלפון {{clientPhone}}

1. אני הח״מ מבקש/ת בזה כי תפעלו בשמי ועבורי למציאת נכס כמפורט להלן. התחייבותי זו הינה לתשלום דמי תיווך בסכום המצויין מטה, מיד לאחר חתימת הסכם מחייב לרכישה / שכירת נכס בנדל״ן / מקרקעין.
2. הנני מצהיר/ה כי הנכס המצויין מטה הוצע לי לראשונה ע״י משרדכם.
3. ידוע לי כי הנתונים שמסרתם לי ביחס לנכסים שהצעתם לי לרכישה / השכרה, לקוחים מכל מדיה אפשרית ואין לי כל התנגדות לכך.
4. במידה ואני ו/או מטעמי, באופן ישיר או עקיף, יקנה או ישכור את אחד או יותר מן הנכסים המצויינים להלן, מבלי שתקבלו ממני את דמי התיווך, הנני מתחייב/ת לשלם לכם את כפל דמי התיווך המצויינים בסעיף 6 להלן, זאת כדמי פיצוי ו/או נזק מוסכם מראש.
5. הריני מאשר/ת מצהיר/ה בזה כי אתם הייתם הגורם המרכזי שהביא להתקשרות ביני ובין בעלי הנכס וכי אם וככל שיהא נכס שברצוני לרכוש ו/או לשכור, תחול עלי החובה להתייעץ עם בעלי מקצוע שונים, לרבות עו״ד ו/או מהנדס וכן לבדוק בעצמי ברשויות השונות את הזכויות בנכס, לרבות מצבו המשפטי ו/או הפיסי ו/או התכנוני.
6. מוסכם כי שכר טרחתכם יעמוד על 2% בצרוף מע״מ מכל עסקה בה ארכוש נכס, או בגובה דמי של חודש אחד, בצרוף מע״מ, בגין הסכם שכירות.
7. הנני מצהיר/ה כי במידה ואחתום על הסכם מחייב לעניין נכס שהוצע לי על ידכם, אזי חובת תשלום דמי תיווך תחול עלי גם אם מכל סיבה שהיא יבוטל אותו הסכם.
8. הנני מתחייב/ת שלא למסור כל מידע לצד ג׳ שהוא ביחס למידע שקבלתי מכם, אלא לשם קיום העסקה על ידי או מטעמי ותוך התחייבות מלאה לתשלום דמי התיווך כאמור בהתחייבות זו.`,
    },

    // ── INTERESTED_BUYER_RENTAL · HE ──────────────────────────────────────────
    // Rental variant of the interested-client flow. Resolved by
    // (contractType "החתמת מתעניין" + dealType RENTAL).
    // • Broker details are embedded in the body so they appear in the signed HTML
    //   view (ContractTemplate has no separate broker header), not only the PDF.
    // • Clause 6.1 is dynamic via {{rentalCommissionClause}} (ONE_MONTH / FIXED).
    // • Property facts (address/rent/commission) are intentionally NOT placed in the
    //   body — they render through PropertyTable, which honours hideFullAddressFromClient.
    // • The contract number is intentionally NOT in the body — the renderers' chrome
    //   (HTML top chip / PDF header meta row) already shows "מסמך מס׳" once per view.
    // • Original legal numbering is preserved; 6.1/6.2/6.3 render as paragraph text.
    {
      key: "INTERESTED_BUYER_RENTAL",
      language: "HE",
      title: "הזמנת שירותי תיווך לשכירות נכס מקרקעין",
      content: `הזמנת שירותי תיווך לשכירות נכס מקרקעין
בהתאם לחוק המתווכים במקרקעין התשנ״ו-1996

המתווך: {{brokerName}}, ת.ז {{brokerIdNumber}}, רישיון מתווך מס׳ {{brokerLicense}}, טלפון {{brokerPhone}}
הלקוח: {{clientName}}, ת.ז {{clientIdNumber}}, כתובת {{clientAddress}}, טלפון {{clientPhone}}, דוא״ל {{clientEmail}}

פרטי הנכסים והתחייבות הלקוח
1. הלקוח מאשר כי בשלב זה נמסרים לו פרטים כלליים אודות הנכסים המוצעים באמצעות המשרד, לרבות תיאורים, תמונות, נתונים ומידע נוסף לפי שיקול דעת המשרד. כתובתם המלאה של הנכסים תימסר ללקוח לאחר חתימת הסכם זה.
2. הלקוח מצהיר כי למיטב ידיעתו לא הוצג לו קודם לכן אף אחד מהנכסים נשוא הסכם זה באמצעות גורם אחר, וכי במועד החתימה אינו מכיר את העסקאות המוצעות ביחס אליהם.
3. ככל שהלקוח יטען לאחר חתימת ההסכם כי הכיר את הנכס או נחשף אליו טרם פנייתו למשרד, יהא עליו להציג אסמכתאות או ראיות התומכות בטענתו.
4. הלקוח מתחייב לשלם למשרד את דמי התיווך המוסכמים במקרה שיתקשר בעסקת מכירה, רכישה או שכירות ביחס לנכס שהוצג לו על ידי המשרד, בין אם ההתקשרות נעשתה באמצעות המשרד ובין אם נעשתה במישרין מול בעל הנכס או מי מטעמו.
5. מובהר כי עצם מסירת כתובת הנכס במועד מאוחר יותר אינה גורעת מתוקפו של הסכם זה ואינה פוגעת בהתחייבויות הצדדים מכוחו.
6. הצדדים מסכימים כי הסכם זה מהווה התחייבות חוזית מלאה ומחייבת לכל דבר ועניין, וכי כל הזכויות והחובות הקבועות בו יחולו ממועד חתימתו.
הזמנת שירותי תיווך והתחייבויות הלקוח
1. הלקוח פונה למתווך ומבקש לקבל ממנו שירותי תיווך במקרקעין ביחס לנכסים אשר פרטיהם יימסרו לו על ידי המתווך.
2. הלקוח מאשר כי קיבל מהמתווך מידע אודות הנכסים המפורטים בטופס זה, וכי מידע זה נמסר לו במסגרת פעילות התיווך של המתווך.
3. הלקוח מתחייב לעדכן את המתווך ללא דיחוי על כל פנייה, מגע, משא ומתן או התקשרות המתנהלים בינו ו/או מי מטעמו לבין בעל נכס שהוצג לו על ידי המתווך, וכן על כל חתימה על הסכם, זיכרון דברים, התחייבות או מסמך אחר הקשור לביצוע עסקה בנכס כאמור.
4. מובהר ומוסכם כי התקשרות בעסקה מכל סוג ביחס לאחד הנכסים שהוצגו ללקוח על ידי המתווך, בין במישרין ובין בעקיפין, בין באמצעות הלקוח ובין באמצעות אדם או גוף מטעמו, תקנה למתווך זכות לקבלת דמי תיווך בהתאם להוראות הסכם זה.
5. הלקוח מתחייב שלא להעביר לצד שלישי כל פרט, מידע או נתון שקיבל מהמתווך ביחס לנכסים שהוצגו לו, אלא לאחר קבלת אישור מראש ובכתב מהמתווך. במקרה של הפרת התחייבות זו, יהיה הלקוח אחראי לכל נזק שייגרם למתווך עקב כך.
דמי התיווך
6. עם השלמת התקשרות מחייבת בקשר לנכס שהוצג ללקוח על ידי המתווך, יהיה הלקוח חייב בתשלום דמי תיווך למתווך.
6.1 {{rentalCommissionClause}}
6.2 החיוב בדמי התיווך יתגבש במועד חתימת הסכם מחייב או במועד יצירת התחייבות מחייבת לביצוע העסקה, לפי המועד המוקדם מביניהם, והתשלום ישולם במועד זה.
6.3 אין בהתחייבות הלקוח כאמור כדי לפגוע בזכותו של המתווך לקבל דמי תיווך גם מצד נוסף לעסקה, ככל שהדבר מותר על פי דין.
הוראות נוספות
7. הלקוח מאשר כי הומלץ לו לבצע את כל הבדיקות המשפטיות, התכנוניות והמקצועיות הנדרשות באמצעות עורך דין ו/או בעלי מקצוע מתאימים טרם התקשרות בעסקה.
8. לאחר השלמת העסקה, יהא המתווך רשאי לעשות שימוש במידע בדבר ביצועה, לרבות לצורך פרסום העובדה שהנכס נמכר או הושכר, בכל אמצעי פרסום שיבחר.
9. כל שינוי, תיקון, הקלה, ארכה או ויתור בקשר להסכם זה יחייבו רק אם נערכו בכתב. הימנעות של מי מהצדדים ממימוש זכות כלשהי לא תיחשב כוויתור עליה ולא תמנע את מימושה בעתיד.
10. ככל שהסכם זה נחתם על ידי יותר מלקוח אחד, יחולו כל ההתחייבויות המפורטות בו על כל אחד מהם ביחד ולחוד. כל הודעה, אישור, התחייבות או מסמך שייחתמו על ידי אחד מהם בקשר להסכם זה, יחייבו גם את יתר החותמים.`,
    },

    // ── INTERESTED_BUYER_SALE · HE ────────────────────────────────────────────
    // Sale/purchase variant of the interested-client flow. Resolved by
    // (contractType "החתמת מתעניין" + dealType SALE).
    // • Broker details are embedded in the body so they appear in the signed HTML
    //   view (ContractTemplate has no separate broker header), not only the PDF.
    // • Clause 5.1 is dynamic via {{saleCommissionClause}} (PERCENT / FIXED).
    // • Property facts (address/price/commission) are intentionally NOT placed in
    //   the body — they render through PropertyTable.
    // • The contract number is intentionally NOT in the body — the renderers'
    //   chrome (HTML top chip / PDF header meta row) already shows "מסמך מס׳".
    // • The law-reference subtitle line is a platform addition (not in the source
    //   document) for structural consistency with the other templates.
    // • Original legal numbering is preserved; 5.1/5.2/5.3 render as paragraph text.
    {
      key: "INTERESTED_BUYER_SALE",
      language: "HE",
      title: "הזמנת שירותי תיווך למכירה נכס מקרקעין",
      content: `הזמנת שירותי תיווך למכירה נכס מקרקעין
בהתאם לחוק המתווכים במקרקעין התשנ״ו-1996

המתווך: {{brokerName}}, ת.ז {{brokerIdNumber}}, רישיון מתווך מס׳ {{brokerLicense}}, טלפון {{brokerPhone}}
הלקוח: {{clientName}}, ת.ז {{clientIdNumber}}, כתובת {{clientAddress}}, טלפון {{clientPhone}}, דוא״ל {{clientEmail}}

התחייבות לקבלת שירותי תיווך
1. הלקוח פונה למתווך ומבקש לקבל ממנו שירותי תיווך במקרקעין ביחס לנכסים אשר יוצגו לו על ידי המתווך מעת לעת.
2. הלקוח מאשר כי המתווך מסר לו מידע אודות הנכסים המפורטים בהסכם זה וכי מידע זה הועבר אליו במסגרת פעילות התיווך של המתווך.
3. הלקוח מתחייב לעדכן את המתווך ללא דיחוי בכל פנייה, משא ומתן, התקשרות או מגע שיתקיימו בינו ו/או מי מטעמו לבין בעל נכס שהוצג לו על ידי המתווך, וכן להודיע למתווך על חתימה על הסכם, זיכרון דברים או כל התחייבות מחייבת אחרת בקשר לנכס כאמור.
דמי תיווך
4. הלקוח מתחייב לשלם למתווך דמי תיווך במקרה שבו יתקשר בעסקה לרכישת אחד מהנכסים שהוצגו לו באמצעות המתווך, בין אם ההתקשרות בוצעה ישירות מול בעל הנכס ובין אם באמצעות צד אחר מטעמו.
5. שיעור דמי התיווך יהיה כדלקמן:
5.1 {{saleCommissionClause}}
5.2 הזכאות לדמי התיווך תקום במועד חתימת הסכם מחייב או במועד יצירת התחייבות מחייבת לביצוע העסקה, לפי המועד המוקדם מביניהם, והתשלום ישולם במועד זה.
5.3 אין בהתחייבות הלקוח כאמור כדי לגרוע מזכותו של המתווך לקבל דמי תיווך גם מהצד השני לעסקה, ככל שהדבר מותר על פי דין.
סודיות ושימוש במידע
6. הלקוח מתחייב שלא להעביר לצד שלישי מידע, מסמכים או פרטים שהועברו אליו על ידי המתווך בקשר לנכסים שהוצגו לו. הפרת התחייבות זו תחייב את הלקוח בפיצוי בגין כל נזק שייגרם למתווך עקב ההפרה.
הוראות כלליות
7. הלקוח מאשר כי הומלץ לו לקבל ייעוץ משפטי ו/או מקצועי מתאים בטרם התקשרות בעסקה, לרבות באמצעות עורך דין ובעלי מקצוע רלוונטיים אחרים.
8. לאחר השלמת העסקה, יהא המתווך רשאי לפרסם כי הנכס נמכר, הועבר או שווק בהצלחה, בכל אמצעי פרסום שימצא לנכון.
9. כל שינוי, תיקון, ויתור, הקלה או ארכה הנוגעים להסכם זה יהיו תקפים רק אם נערכו בכתב. הימנעות או עיכוב מצד מי מהצדדים במימוש זכות כלשהי לא ייחשבו כוויתור על אותה זכות.
10. כאשר צד להסכם מורכב ממספר אנשים, תחול על כולם אחריות ביחד ולחוד לכל התחייבויותיהם על פי הסכם זה. חתימתו, אישורו או התחייבותו של אחד מהם בכל עניין הקשור להסכם תחייב גם את יתר החותמים מטעמו.
11. למען הסר ספק, כל התקשרות של הלקוח ו/או מי מטעמו בקשר לנכס שהוצג על ידי המתווך, תיחשב לעסקה המזכה את המתווך בדמי התיווך המפורטים בהסכם זה.`,
    },

    // ── OWNER_EXCLUSIVE · HE ──────────────────────────────────────────────────
    {
      key: "OWNER_EXCLUSIVE",
      language: "HE",
      title: "החתמת בעל נכס / בלעדיות — הסכם שיווק ובלעדיות",
      content: `הסכם בלעדיות ושיווק נכס במקרקעין
בהתאם לחוק המתווכים במקרקעין התשנ״ו 1996

נערך ונחתם ביום {{today}} בין:

המתווך: {{brokerName}}, מס׳ רישיון {{brokerLicense}}, ת״ז {{brokerIdNumber}}, טל׳ {{brokerPhone}}

לבין:

בעל הנכס: {{clientName}}, ת״ז {{clientIdNumber}}, טל׳ {{clientPhone}}

1. הנכס המשווק ממוקם ב-{{propertyAddress}}, {{propertyCity}}. סוג העסקה: {{dealType}}. מחיר המבוקש: {{propertyPrice}}.
2. הבעלים מעניק למתווך זכות בלעדית לשווק ולמכור / להשכיר את הנכס.
3. במהלך תקופת הבלעדיות, הבעלים לא יפנה לכל מתווך אחר בקשר לנכס.
4. בגין שירותי התיווך והשיווק, יקבל המתווך עמלה בסך {{commission}}, אשר תשולם במועד סגירת העסקה וחתימת החוזה הסופי.
5. הסכם זה כפוף לחוק המתווכים במקרקעין, תשנ״ו-1996 ולכל דין רלוונטי. מסמך מס׳ {{contractId}}.`,
    },

    // ── BROKER_COOP · HE ──────────────────────────────────────────────────────
    {
      key: "BROKER_COOP",
      language: "HE",
      title: "הסכם שיתוף פעולה בין מתווכים",
      content: `הסכם שיתוף פעולה בין מתווכים
בהתאם לחוק המתווכים במקרקעין התשנ״ו 1996

נערך ונחתם ביום {{today}} בין:

מתווך א׳: {{brokerName}}, מס׳ רישיון {{brokerLicense}}, ת״ז {{brokerIdNumber}}, טל׳ {{brokerPhone}}
מתווך ב׳: {{clientName}}, ת״ז {{clientIdNumber}}, טל׳ {{clientPhone}}

1. הצדדים מסכימים לשתף פעולה בשיווק ומכירת / השכרת הנכס ב-{{propertyAddress}}, {{propertyCity}}. סוג העסקה: {{dealType}}. מחיר העסקה: {{propertyPrice}}.
2. העמלה הכוללת בגין העסקה הינה {{commission}}. הצדדים מסכימים לחלק את העמלה שווה בשווה, כל אחד 50%, אלא אם הוסכם אחרת בכתב.
3. כל אחד מהצדדים הינו בעל רישיון תיווך בתוקף בהתאם לחוק המתווכים במקרקעין, תשנ״ו-1996.
4. הסכם זה אינו יוצר שותפות, אלא שיתוף פעולה חד-פעמי לצורך עסקה זו בלבד. מסמך מס׳ {{contractId}}.`,
    },

    // ── INTERESTED_BUYER · EN ─────────────────────────────────────────────────
    // English legal text aligned with Israeli Real Estate Brokerage Law 1996
    {
      key: "INTERESTED_BUYER",
      language: "EN",
      title: "Brokerage Services Order Form",
      content: `Brokerage Services Order Form
Pursuant to the Real Estate Brokerage Law, 5756-1996

We hereby engage: {{brokerName}}, Real Estate Broker,
ID: {{brokerIdNumber}}  License No.: {{brokerLicense}}  Tel.: {{brokerPhone}}
to provide brokerage services for the property described below:

Buyer / Tenant

Full Name: {{clientName}}  ID: {{clientIdNumber}}  Phone: {{clientPhone}}

1. I, the undersigned, hereby request that you act on my behalf and for my benefit to locate a property as detailed below. I undertake to pay a brokerage fee in the amount specified below, immediately upon signing a binding agreement to purchase or lease real estate.
2. I declare that the property indicated below was first presented to me by your office.
3. I am aware that the information provided to me regarding properties offered for purchase or lease is sourced from all available media and I have no objection to this.
4. If I and/or anyone acting on my behalf, directly or indirectly, purchases or leases one or more of the properties listed below without paying the brokerage fee, I undertake to pay double the brokerage fee specified in clause 6 below, as liquidated damages agreed in advance.
5. I hereby confirm and declare that you were the primary cause that led to my engagement with the property owner, and that if and insofar as there is a property I wish to purchase and/or lease, I am obligated to consult with various professionals, including a lawyer and/or engineer, and to independently verify the property's rights at the relevant authorities, including its legal, physical and planning status.
6. It is agreed that your fee shall be 2% plus VAT of any transaction in which I purchase a property, or the equivalent of one month's rent plus VAT for a lease agreement.
7. I declare that if I sign a binding agreement regarding a property presented to me by you, the obligation to pay brokerage fees shall apply even if the agreement is cancelled for any reason.
8. I undertake not to disclose any information to any third party regarding information I received from you, except for the purpose of completing the transaction by me or on my behalf, subject to full commitment to payment of the brokerage fee as stated in this undertaking.`,
    },

    // ── INTERESTED_BUYER · FR ─────────────────────────────────────────────────
    // French legal text aligned with Israeli Real Estate Brokerage Law 1996
    {
      key: "INTERESTED_BUYER",
      language: "FR",
      title: "Formulaire de demande de services de courtage",
      content: `Formulaire de demande de services de courtage
Conformément à la Loi sur le courtage immobilier, 5756-1996

Nous faisons appel à : {{brokerName}}, agent immobilier,
CIN : {{brokerIdNumber}}  Licence n° : {{brokerLicense}}  Tél. : {{brokerPhone}}
pour fournir des services de courtage pour le bien décrit ci-dessous :

Acheteur / Locataire

Nom complet : {{clientName}}  CIN : {{clientIdNumber}}  Téléphone : {{clientPhone}}

1. Je, soussigné(e), demande par la présente que vous agissiez en mon nom et pour mon compte afin de trouver un bien tel que détaillé ci-dessous. Je m'engage à payer des honoraires de courtage d'un montant précisé ci-dessous, immédiatement après la signature d'un accord contraignant d'achat ou de location de bien immobilier.
2. Je déclare que le bien indiqué ci-dessous m'a été présenté pour la première fois par votre agence.
3. Je suis conscient(e) que les informations qui m'ont été fournies concernant les biens proposés à l'achat ou à la location proviennent de tous les médias disponibles et je n'y ai aucune objection.
4. Si moi et/ou toute personne agissant en mon nom, directement ou indirectement, achète ou loue un ou plusieurs des biens énumérés ci-dessous sans payer les honoraires de courtage, je m'engage à payer le double des honoraires de courtage précisés à la clause 6 ci-dessous, à titre de dommages et intérêts forfaitaires convenus à l'avance.
5. Je confirme et déclare par la présente que vous étiez la cause principale qui a conduit à mon engagement avec le propriétaire du bien, et que si et dans la mesure où il existe un bien que je souhaite acheter et/ou louer, je suis tenu(e) de consulter divers professionnels, dont un avocat et/ou un ingénieur, et de vérifier de manière indépendante les droits sur le bien auprès des autorités compétentes, y compris son statut juridique, physique et urbanistique.
6. Il est convenu que vos honoraires s'élèveront à 2 % plus TVA de toute transaction dans laquelle j'achète un bien, ou l'équivalent d'un mois de loyer plus TVA pour un contrat de location.
7. Je déclare que si je signe un accord contraignant concernant un bien qui m'a été présenté par vous, l'obligation de payer les honoraires de courtage s'appliquera même si l'accord est annulé pour quelque raison que ce soit.
8. Je m'engage à ne divulguer aucune information à un tiers concernant les informations que j'ai reçues de vous, sauf dans le but de finaliser la transaction par moi ou en mon nom, sous réserve d'un engagement total au paiement des honoraires de courtage tels qu'énoncés dans le présent engagement.`,
    },

    // ── INTERESTED_BUYER · RU ─────────────────────────────────────────────────
    // Russian legal text aligned with Israeli Real Estate Brokerage Law 1996
    {
      key: "INTERESTED_BUYER",
      language: "RU",
      title: "Бланк заказа брокерских услуг",
      content: `Бланк заказа брокерских услуг
В соответствии с Законом о брокерстве в сфере недвижимости, 5756-1996

Настоящим мы привлекаем: {{brokerName}}, агента по недвижимости,
Уд. личности: {{brokerIdNumber}}  Лицензия №: {{brokerLicense}}  Тел.: {{brokerPhone}}
для оказания брокерских услуг в отношении объекта недвижимости, описанного ниже:

Покупатель / Арендатор

Полное имя: {{clientName}}  Уд. личности: {{clientIdNumber}}  Телефон: {{clientPhone}}

1. Я, нижеподписавшийся(-аяся), настоящим прошу вас действовать от моего имени и в моих интересах для поиска объекта недвижимости, указанного ниже. Я обязуюсь выплатить брокерское вознаграждение в размере, указанном ниже, незамедлительно после подписания обязывающего соглашения о покупке или аренде недвижимости.
2. Я заявляю, что указанный ниже объект недвижимости был впервые предложен мне вашим офисом.
3. Мне известно, что информация, предоставленная мне об объектах, предлагаемых к покупке или аренде, получена из всех доступных источников, и я не возражаю против этого.
4. Если я и/или любое лицо, действующее от моего имени, прямо или косвенно, купит или арендует один или несколько из перечисленных ниже объектов без уплаты брокерского вознаграждения, я обязуюсь выплатить двойной размер брокерского вознаграждения, указанного в пункте 6 ниже, в качестве заранее оговорённой неустойки.
5. Настоящим я подтверждаю и заявляю, что вы являлись главной причиной, которая привела к моим переговорам с владельцем объекта, и что если и поскольку существует объект, который я хочу купить и/или арендовать, я обязан(-а) проконсультироваться с различными специалистами, в том числе с адвокатом и/или инженером, а также самостоятельно проверить права на объект в соответствующих органах, включая его правовой, физический и градостроительный статус.
6. Условлено, что ваше вознаграждение составит 2% плюс НДС от любой сделки, в которой я приобретаю объект, или эквивалент одного месяца аренды плюс НДС по договору аренды.
7. Я заявляю, что если я подпишу обязывающее соглашение в отношении объекта, представленного мне вами, обязательство по уплате брокерского вознаграждения сохраняется, даже если соглашение будет расторгнуто по любой причине.
8. Я обязуюсь не раскрывать какую-либо информацию третьим лицам относительно сведений, полученных мной от вас, за исключением случаев, необходимых для завершения сделки мной или от моего имени, при условии полного соблюдения обязательства по уплате брокерского вознаграждения, указанного в настоящем обязательстве.`,
    },
  ];

// ── Upsert logic ──────────────────────────────────────────────────────────────

async function upsertTemplates() {
  console.log("SignDeal — Contract Template Seeder");
  console.log("====================================\n");

  for (const tpl of TEMPLATES) {
    const label = `${tpl.key}·${tpl.language}`;

    const existing = await p.contractTemplate.findFirst({
      where: { templateKey: tpl.key, language: tpl.language },
    });

    if (!existing) {
      const created = await p.contractTemplate.create({
        data: {
          title: tpl.title,
          templateKey: tpl.key,
          language: tpl.language,
          content: tpl.content,
          isActive: true,
          version: 1,
        },
        select: { id: true, version: true },
      });
      console.log(`  ✅ CREATED  ${label}  (id=${created.id}, version=1)`);

    } else if (existing.content !== tpl.content || existing.title !== tpl.title) {
      const updated = await p.contractTemplate.update({
        where: { id: existing.id },
        data: {
          title: tpl.title,
          content: tpl.content,
          isActive: true,
          version: { increment: 1 },
        },
        select: { id: true, version: true },
      });
      console.log(`  🔄 UPDATED  ${label}  (id=${existing.id}, version=${existing.version} → ${updated.version})`);

    } else {
      console.log(`  ⏭  SKIPPED  ${label}  (id=${existing.id}, version=${existing.version}, no changes)`);
    }
  }

  // ── Sanity check: each HE template must have exactly 1 active row ─────────
  console.log("\n── Sanity check (HE templates) ───────────────────────────────");
  for (const key of ["INTERESTED_BUYER", "OWNER_EXCLUSIVE", "BROKER_COOP", "INTERESTED_BUYER_RENTAL", "INTERESTED_BUYER_SALE"] as const) {
    const rows = await p.contractTemplate.findMany({
      where: { templateKey: key, language: "HE", isActive: true },
      select: { id: true },
    });
    const ok = rows.length === 1;
    console.log(`  ${ok ? "✅" : "❌"} ${key}·HE: ${rows.length} active row${rows.length !== 1 ? "s (!!)" : ""}`);
  }

  console.log("\nDone.\n");
}

upsertTemplates()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => p.$disconnect());
