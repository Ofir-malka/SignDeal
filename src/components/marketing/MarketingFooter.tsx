import Link from "next/link";

/**
 * Public marketing footer.
 * Server component — no interactivity required.
 *
 * Structure:
 *  - Top band:  brand column + 3 link columns
 *  - Bottom bar: copyright + contact email
 */

const PRODUCT_LINKS = [
  { label: "יתרונות",       href: "#features" },
  { label: "איך זה עובד",  href: "#how"      },
  { label: "מחירים",        href: "#pricing"  },
  { label: "שאלות נפוצות", href: "#faq"      },
] as const;

const ACCOUNT_LINKS = [
  { label: "התחברות",       href: "/login"    },
  { label: "הרשמה חינם",    href: "/register" },
] as const;

const LEGAL_LINKS = [
  { label: "תנאי שימוש",        href: "/legal/terms"   },
  { label: "מדיניות פרטיות",    href: "/legal/privacy" },
  { label: "מדיניות עוגיות",    href: "/legal/cookies" },
] as const;

/* ── Logo mark (matches NavBar) ── */
function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center shrink-0">
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="white" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span className="text-white font-semibold text-lg tracking-tight">SignDeal</span>
    </div>
  );
}

/* ── Link column ── */
function FooterColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
        {title}
      </p>
      {children}
    </div>
  );
}

export function MarketingFooter() {
  return (
    <footer
      dir="rtl"
      className="bg-indigo-950 border-t border-white/10"
    >
      {/* ── Top band ──────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">

          {/* Brand column */}
          <div className="flex flex-col gap-4 lg:col-span-1">
            <LogoMark />
            <p className="text-sm text-indigo-200/70 leading-relaxed max-w-xs">
              פלטפורמה לניהול חוזי תיווך, חתימות דיגיטליות וגביית עמלות — לסוכני נדל״ן ישראלים.
            </p>
            <p className="text-xs text-indigo-400/60 italic">
              חתמו. גבו. סגרו.
            </p>
          </div>

          {/* Product links */}
          <FooterColumn title="מוצר">
            <nav aria-label="ניווט מוצר">
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {PRODUCT_LINKS.map(({ label, href }) => (
                  <li key={href}>
                    <a
                      href={href}
                      className="text-sm text-indigo-200/70 hover:text-white transition-colors"
                    >
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </FooterColumn>

          {/* Account links */}
          <FooterColumn title="חשבון">
            <nav aria-label="ניווט חשבון">
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {ACCOUNT_LINKS.map(({ label, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-indigo-200/70 hover:text-white transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </FooterColumn>

          {/* Legal + contact */}
          <FooterColumn title="מידע משפטי">
            <nav aria-label="קישורים משפטיים">
              <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
                {LEGAL_LINKS.map(({ label, href }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm text-indigo-200/70 hover:text-white transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                <li className="mt-2 pt-2 border-t border-white/10">
                  <a
                    href="mailto:support@signdeal.co.il"
                    className="text-sm text-indigo-200/70 hover:text-white transition-colors flex items-center gap-2"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    support@signdeal.co.il
                  </a>
                </li>
              </ul>
            </nav>
          </FooterColumn>

        </div>
      </div>

      {/* ── Bottom bar ────────────────────────────────────────────────── */}
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-indigo-400/50 text-center sm:text-right">
            © {new Date().getFullYear()} SignDeal. כל הזכויות שמורות.
          </p>
          <p className="text-xs text-indigo-400/40">
            נבנה בישראל 🇮🇱
          </p>
        </div>
      </div>
    </footer>
  );
}
