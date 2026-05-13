"use client";

import { useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import type { Contract } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";
import { ContractTemplate } from "@/components/ContractTemplate";
import { getLabels, isRtlLang } from "@/lib/contracts/labels";

async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer  = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


function Logo() {
  return (
    <div className="flex items-center justify-center gap-2">
      <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <span className="font-semibold text-gray-900 text-[17px] tracking-tight">SignDeal</span>
    </div>
  );
}


// ── Preview-mode banner ───────────────────────────────────────────────────────
// Shown to the contract owner (broker) instead of the signing UI.
// Replaces the signature canvas, consent checkbox, submit button, and client
// completion fields — the contract document itself remains visible.

function PreviewBanner() {
  return (
    <div
      dir="rtl"
      className="flex items-start gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4"
      role="status"
      aria-label="מצב צפייה בלבד"
    >
      {/* Lock icon */}
      <span className="shrink-0 mt-0.5 text-indigo-500" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </span>
      <div>
        <p className="text-sm font-semibold text-indigo-800">מצב צפייה בלבד</p>
        <p className="text-sm text-indigo-700 mt-0.5 leading-relaxed">
          מצב צפייה בלבד — רק הלקוח יכול לחתום על החוזה דרך הקישור שנשלח אליו.
        </p>
      </div>
    </div>
  );
}

export function SigningPage({ token, previewMode = false }: { token: string; previewMode?: boolean }) {
  const [contract, setContract]               = useState<Contract | null>(null);
  const [checked, setChecked]                 = useState(false);
  const [signed, setSigned]                   = useState(false);
  const [canceled, setCanceled]               = useState(false);
  const [notFound, setNotFound]               = useState(false);
  const [signing, setSigning]                 = useState(false);
  const [signError, setSignError]             = useState<string | null>(null);
  const [clientFormDone, setClientFormDone]   = useState(false);
  const [clientFormError, setClientFormError] = useState<string | null>(null);
  const [formEmail, setFormEmail]             = useState("");
  const [formIdNumber, setFormIdNumber]       = useState("");
  const sigRef                                = useRef<SignatureCanvas>(null);
  const [canvasEmpty, setCanvasEmpty]         = useState(true);

  // Language is only known after load; start with HE labels so pre-load
  // screens (notFound, loading) render in Hebrew — switch after contract loads.
  const lang = contract?.language ?? "HE";
  const L    = getLabels(lang);
  const isRtl = isRtlLang(lang);
  const dir  = isRtl ? "rtl" : "ltr";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/contracts/sign/${token}`);
        if (!res.ok) { setNotFound(true); return; }
        const data: ApiContractResponse = await res.json();
        const c = apiToContract(data);
        setContract(c);
        if (c.signatureStatus === "בוטל") { setCanceled(true); return; }
        if (c.signatureStatus === "פג תוקף") { setNotFound(true); return; }
        if (c.signatureStatus === "נחתם" ||
            c.signatureStatus === "ממתין לתשלום" ||
            c.signatureStatus === "שולם") { setSigned(true); return; }
      } catch {
        setNotFound(true);
      }
    }
    load();
  }, [token]);

  async function handleClientSubmit() {
    setClientFormError(null);
    const updateBody: Record<string, string> = {};
    if (formEmail.trim())    updateBody.clientEmail    = formEmail.trim();
    if (formIdNumber.trim()) updateBody.clientIdNumber = formIdNumber.trim();

    try {
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? L.updateError);
      }
    } catch (err) {
      setClientFormError(err instanceof Error ? err.message : L.updateError);
      return;
    }

    setContract((prev) => prev ? {
      ...prev,
      clientEmail: formEmail.trim() || prev.clientEmail,
      clientId:    formIdNumber.trim() || prev.clientId,
    } : null);
    setClientFormDone(true);
  }

  async function handleSign() {
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setSignError(L.signatureRequired);
      return;
    }
    setSigning(true);
    setSignError(null);
    try {
      const signatureData = sigRef.current.toDataURL("image/png");
      const signatureHash = await sha256(signatureData).catch(() => "");
      const res = await fetch(`/api/contracts/sign/${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureStatus: "SIGNED", signedAt: new Date().toISOString(), signatureData, signatureHash }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? L.saveError);
      }
      const updated: { payment?: { paymentUrl?: string | null } | null } =
        await res.json().catch(() => ({}));
      setContract((prev) => prev
        ? { ...prev, paymentUrl: updated.payment?.paymentUrl ?? prev.paymentUrl }
        : null);
      setSigned(true);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : L.saveError);
      setSigning(false);
    }
  }

  const needsClientInfo = !!contract && (!contract.clientEmail || !contract.clientId);

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir={dir}>
        <div className="text-center space-y-1">
          <p className="text-lg font-semibold text-gray-900">{L.notFoundTitle}</p>
          <p className="text-sm text-gray-500">{L.notFoundMessage}</p>
        </div>
      </div>
    );
  }

  if (!contract) return null;

  if (canceled) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir={dir}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 max-w-md w-full text-center space-y-5">
          <Logo />
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{L.canceledTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">{L.canceledMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir={dir}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-10 max-w-md w-full text-center space-y-5">
          <Logo />
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">{L.signedTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">{L.signedMessage(contract.client)}</p>
          </div>
          {contract.paymentUrl ? (
            <a
              href={contract.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white text-center transition-all"
            >
              {L.paymentButton}
            </a>
          ) : (
            <p className="text-sm text-gray-500">{L.brokerWillContact}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" dir={dir}>
      <div className="max-w-2xl mx-auto space-y-5">
        <Logo />

        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">{L.pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">{contract.contractType}</p>
        </div>

        {/* Preview-mode notice — shown to the broker/owner instead of the signing UI */}
        {previewMode && <PreviewBanner />}

        {/* Contract document — always shown (broker can preview what the client sees) */}
        <ContractTemplate contract={contract} hideAddress={contract.hideFullAddressFromClient} />

        {/* Client info form — hidden entirely in preview mode */}
        {!previewMode && needsClientInfo && !clientFormDone && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-5 space-y-4">
            <p className="text-sm font-semibold text-amber-800">{L.completeDetails}</p>
            {!contract!.clientEmail && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{L.email}</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            )}
            {!contract!.clientId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">{L.idNumber}</label>
                <input
                  type="text"
                  value={formIdNumber}
                  onChange={(e) => setFormIdNumber(e.target.value)}
                  placeholder="000000000"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            )}
            {clientFormError && (
              <p className="text-sm text-red-600">{clientFormError}</p>
            )}
            <button
              type="button"
              onClick={handleClientSubmit}
              disabled={
                (!contract!.clientEmail && !formEmail.trim()) ||
                (!contract!.clientId   && !formIdNumber.trim())
              }
              className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {L.continueToSign}
            </button>
          </div>
        )}

        {/* Signature section — hidden entirely in preview mode */}
        {!previewMode && (!needsClientInfo || clientFormDone) && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700">{L.consentText}</span>
            </label>

            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">{L.signHere}</p>
              <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden touch-none">
                <SignatureCanvas
                  ref={sigRef}
                  penColor="#1e1e1e"
                  backgroundColor="white"
                  canvasProps={{ className: "w-full", style: { height: "180px" } }}
                  onEnd={() => setCanvasEmpty(sigRef.current?.isEmpty() ?? true)}
                />
              </div>
              <button
                type="button"
                onClick={() => { sigRef.current?.clear(); setCanvasEmpty(true); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {L.clearSignature}
              </button>
            </div>

            {signError && (
              <p className="text-sm text-red-600">{signError}</p>
            )}
            <button
              type="button"
              disabled={!checked || canvasEmpty || signing}
              onClick={handleSign}
              className={`w-full py-3 rounded-lg text-sm font-semibold transition-all ${
                checked && !canvasEmpty && !signing
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {signing ? L.signingInProgress : L.signButton}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
