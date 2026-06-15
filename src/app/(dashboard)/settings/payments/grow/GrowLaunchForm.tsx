"use client";

/**
 * GrowLaunchForm — the Grow onboarding PREPARATION screen shown before Grow's
 * hosted iframe. It:
 *   • explains that Grow is an external payment provider and what the connection does,
 *   • discloses that Grow is a paid external service (fees set by Grow, not us),
 *   • discloses that SignDeal is NOT the processor and does not hold funds,
 *   • collects ONLY the two GetLink seed fields (businessNumber + phone) —
 *     everything else (business name, owner, email, bank, KYC) is collected by
 *     Grow inside the iframe and must NOT be duplicated here,
 *   • requires a scroll-gated terms/consent checkbox before continuing.
 *
 * On a real 201 from POST /api/grow/onboarding/start it stores { sessionId,
 * formUrl } in sessionStorage (NOT the URL, NOT the DB) and navigates to the
 * dedicated full-page screen at /settings/payments/grow/onboarding, where Grow's
 * hosted registration form is shown in the iframe. The server fills the rest of
 * the GetLink lead (marketer, price_quote, is_direct_debit=1, is_send_sms=0,
 * website=""). Consent is a client-side gate only (no backend persistence in v1).
 */

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { writeGrowLaunch } from "./onboardingLaunch";
import { TermsConsentBox } from "./TermsConsentBox";
import {
  GROW_PREP_INTRO,
  GROW_PREP_VALUE_PROP,
  GROW_PRICING_DISCLOSURE,
  GROW_PRICING_URL,
  GROW_PRICING_LINK_LABEL,
  GROW_FUNDS_DISCLOSURE,
  GROW_PREP_COPY,
} from "./onboardingContent";
import {
  isValidIsraeliMobile,
  isValidBusinessNumber,
  digitsOnly,
  canContinue,
} from "@/lib/grow/onboarding/launch-validation";

export function GrowLaunchForm() {
  const router = useRouter();
  const [businessNumber, setBusinessNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [touched, setTouched] = useState<{ phone: boolean; bn: boolean }>({ phone: false, bn: false });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneValid = isValidIsraeliMobile(phone);
  const bnValid = isValidBusinessNumber(businessNumber);
  const submitDisabled = !canContinue({ phone, businessNumber, consent, submitting });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/grow/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        // Values are already digit-sanitized by the input handlers.
        body: JSON.stringify({ businessNumber, phone }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        sessionId?: string;
        formUrl?: string;
        error?: string;
      };
      if (res.status === 201 && json.sessionId && json.formUrl) {
        // Hand off via sessionStorage (formUrl stays out of the URL), then navigate
        // in-app to the dedicated full-page onboarding screen.
        writeGrowLaunch({ sessionId: json.sessionId, formUrl: json.formUrl });
        router.push("/settings/payments/grow/onboarding");
        return;
      }
      if (res.status === 503) setError("חיבור Grow אינו פעיל כעת. נסה שוב מאוחר יותר.");
      else if (res.status === 409)
        setError(typeof json.error === "string" ? json.error : "העסק כבר קיים במערכת Grow.");
      else if (res.status === 422)
        setError(typeof json.error === "string" ? json.error : "לא ניתן להתחיל את ההרשמה — בדוק את הפרטים.");
      else if (res.status === 429) setError("יותר מדי ניסיונות. המתן מעט ונסה שוב.");
      else if (res.status === 502) setError("שירות Grow אינו זמין כעת. נסה שוב.");
      else if (res.status === 400) setError("יש למלא מספר עוסק וטלפון.");
      else setError("אירעה שגיאה בהתחלת ההרשמה. נסה שוב.");
    } catch {
      setError("אירעה שגיאה בהתחלת ההרשמה. נסה שוב.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Value proposition (business outcome) */}
      <div className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
        <p className="text-sm font-medium text-indigo-900 leading-relaxed">{GROW_PREP_VALUE_PROP}</p>
      </div>

      {/* 1. Explanation */}
      <CopySection title={GROW_PREP_INTRO.title} points={GROW_PREP_INTRO.points} />

      {/* 2. Pricing disclosure (no hardcoded numbers; link to Grow's official pricing) */}
      <DisclosureBox
        title={GROW_PRICING_DISCLOSURE.title}
        points={GROW_PRICING_DISCLOSURE.points}
        linkHref={GROW_PRICING_URL}
        linkLabel={GROW_PRICING_LINK_LABEL}
      />
      {/* 3. Funds disclosure */}
      <DisclosureBox title={GROW_FUNDS_DISCLOSURE.title} points={GROW_FUNDS_DISCLOSURE.points} />

      {/* 4. GetLink seed fields */}
      <div className="space-y-3">
        <div>
          <label htmlFor="grow-business-number" className="block text-xs font-medium text-gray-600 mb-1">
            {GROW_PREP_COPY.businessNumberLabel}
          </label>
          <input
            id="grow-business-number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={businessNumber}
            onChange={(e) => setBusinessNumber(digitsOnly(e.target.value).slice(0, 9))}
            onBlur={() => setTouched((t) => ({ ...t, bn: true }))}
            disabled={submitting}
            placeholder="לדוגמה: 512345678"
            aria-invalid={touched.bn && businessNumber !== "" && !bnValid}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <p className="mt-1 text-xs text-gray-400">{GROW_PREP_COPY.businessNumberHelper}</p>
          {touched.bn && businessNumber !== "" && !bnValid && (
            <p className="mt-1 text-xs text-red-600">{GROW_PREP_COPY.businessNumberError}</p>
          )}
        </div>

        <div>
          <label htmlFor="grow-phone" className="block text-xs font-medium text-gray-600 mb-1">
            {GROW_PREP_COPY.phoneLabel}
          </label>
          <input
            id="grow-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(digitsOnly(e.target.value).slice(0, 10))}
            onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
            disabled={submitting}
            placeholder="לדוגמה: 0501234567"
            aria-invalid={touched.phone && phone !== "" && !phoneValid}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <p className="mt-1 text-xs text-gray-400">{GROW_PREP_COPY.phoneHelper}</p>
          {touched.phone && phone !== "" && !phoneValid && (
            <p className="mt-1 text-xs text-red-600">{GROW_PREP_COPY.phoneError}</p>
          )}
        </div>
      </div>

      {/* 5. Terms + consent (scroll-gated) */}
      <TermsConsentBox checked={consent} onChange={setConsent} disabled={submitting} />

      {error && <p className="text-sm text-red-600 leading-relaxed">{error}</p>}

      {/* 6. Continue */}
      <button
        type="submit"
        disabled={submitDisabled}
        className="inline-flex items-center justify-center gap-2 w-full px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {submitting ? GROW_PREP_COPY.submitBusy : GROW_PREP_COPY.submitIdle}
      </button>

      <p className="text-xs text-gray-400 leading-relaxed">{GROW_PREP_COPY.afterSubmitHelper}</p>
    </form>
  );
}

function CopySection({ title, points }: { title: string; points: readonly string[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
      <ul className="list-disc space-y-1.5 pr-4 text-sm text-gray-600 leading-relaxed">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function DisclosureBox({
  title,
  points,
  linkHref,
  linkLabel,
}: {
  title: string;
  points: readonly string[];
  linkHref?: string;
  linkLabel?: string;
}) {
  const showLink = !!linkHref && !!linkLabel && /^https?:\/\//i.test(linkHref);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <h3 className="text-xs font-semibold text-gray-700 mb-1.5">{title}</h3>
      <ul className="list-disc space-y-1 pr-4 text-xs text-gray-600 leading-relaxed">
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {showLink && (
        <a
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          {linkLabel}
          <span aria-hidden="true">↗</span>
        </a>
      )}
    </div>
  );
}
