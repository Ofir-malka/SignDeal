"use client";

/**
 * Global Error Boundary — root-level catch-all for Next.js App Router.
 *
 * This boundary activates when an error is thrown in:
 *   • The root layout (src/app/layout.tsx)
 *   • Any Server Component that has no closer error.tsx ancestor
 *   • Any crash that propagates all the way to the root without being caught
 *
 * It MUST include <html> and <body> tags because it replaces the entire
 * root layout — Next.js cannot render the layout if it threw an error.
 *
 * The more specific src/app/error.tsx handles subtree errors (everything
 * inside the root layout that doesn't crash the layout itself). Both files
 * capture to Sentry so no error falls through untracked.
 *
 * Design notes:
 *   • Hebrew UI matches the existing error.tsx style for visual consistency.
 *   • dir="rtl" applied to <html> so the error page renders correctly.
 *   • Inline styles used for the minimal reset — Tailwind is not available
 *     here because the root layout (which loads the stylesheet) has crashed.
 *   • Sentry.captureException is called inside useEffect (Client Component
 *     lifecycle) because Sentry is a browser/Node singleton; calling it
 *     synchronously during render can cause issues with hydration.
 */

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Capture to Sentry with the error digest so it can be correlated with
    // server-side logs. The digest is a Next.js-generated opaque ID that links
    // the client error boundary activation to the server error that caused it.
    Sentry.captureException(error, {
      tags: { boundary: "global", digest: error.digest ?? "none" },
    });
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body
        style={{
          margin: 0,
          fontFamily: "system-ui, -apple-system, sans-serif",
          backgroundColor: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "1rem",
        }}
      >
        <div
          style={{
            background: "#ffffff",
            borderRadius: "1rem",
            border: "1px solid #e2e8f0",
            padding: "2rem",
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
          }}
        >
          {/* Error icon */}
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              background: "#fef2f2",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.25rem",
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#111827",
              marginBottom: "0.5rem",
            }}
          >
            משהו השתבש
          </h1>
          <p
            style={{
              color: "#6b7280",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              marginBottom: "1.75rem",
            }}
          >
            אירעה שגיאה בלתי צפויה. ניתן לנסות לרענן את הדף או לחזור לאחר
            רגע.
          </p>

          {/* Actions */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              alignItems: "center",
            }}
          >
            <button
              onClick={reset}
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "0.5rem",
                background:     "#4f46e5",
                color:          "#ffffff",
                border:         "none",
                borderRadius:   "0.5rem",
                padding:        "0.625rem 1.25rem",
                fontSize:       "0.875rem",
                fontWeight:     600,
                cursor:         "pointer",
                width:          "100%",
                justifyContent: "center",
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              נסה שוב
            </button>

            <a
              href="/"
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                border:         "1px solid #e5e7eb",
                background:     "#ffffff",
                color:          "#374151",
                borderRadius:   "0.5rem",
                padding:        "0.625rem 1.25rem",
                fontSize:       "0.875rem",
                fontWeight:     500,
                textDecoration: "none",
                width:          "100%",
              }}
            >
              חזרה לדף הבית
            </a>
          </div>

          {/* Error digest — shown only in dev for quick log correlation */}
          {process.env.NODE_ENV !== "production" && error.digest && (
            <p
              style={{
                marginTop:  "1.5rem",
                fontSize:   "0.75rem",
                color:      "#9ca3af",
                fontFamily: "monospace",
              }}
            >
              digest: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
