"use client";

/**
 * GrowOnboardingIframe — renders the REAL Grow-hosted registration form (large,
 * full-area) from `formUrl`, and listens for Grow's postMessage:
 *   { action: "success", source: "growRegister" } → onSuccess()
 *   { action: "close",   source: "growRegister" } → onClose()
 *
 * Origin safety: only messages whose origin EQUALS the origin of `formUrl` are
 * trusted. No sandbox attribute — the Grow form needs full function; CSP
 * `frame-src` restricts which origins may be framed. Chrome (header/close) is
 * provided by the parent screen, so this component is just the framed form.
 *
 * The parent passes MEMOIZED onSuccess/onClose so the listener subscribes once.
 */

import { useEffect } from "react";

interface Props {
  formUrl: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function GrowOnboardingIframe({ formUrl, onSuccess, onClose }: Props) {
  useEffect(() => {
    let allowedOrigin: string | null = null;
    try {
      allowedOrigin = new URL(formUrl).origin;
    } catch {
      allowedOrigin = null;
    }

    function handleMessage(event: MessageEvent) {
      if (!allowedOrigin || event.origin !== allowedOrigin) return; // trust only the form's origin
      const data = event.data as { action?: string; source?: string } | null;
      if (!data || data.source !== "growRegister") return;
      if (data.action === "success") onSuccess();
      else if (data.action === "close") onClose();
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [formUrl, onSuccess, onClose]);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <iframe
        src={formUrl}
        title="טופס הרשמה Grow"
        className="w-full border-0 bg-white"
        style={{ height: "calc(100vh - 220px)", minHeight: 560 }}
      />
    </div>
  );
}
