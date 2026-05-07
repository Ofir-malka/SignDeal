import type { ReactNode } from "react";
import type { Contract } from "@/lib/contracts-data";
import { parseDocumentLines, splitAtClauses } from "@/lib/contracts/resolve-template";
import { getLabels, isRtlLang } from "@/lib/contracts/labels";
import { formatPropertyAddress } from "@/lib/format-address";

// ─── Document-body renderer ───────────────────────────────────────────────────
// Parses a generatedText string (from the DB snapshot) into styled React nodes.
// Convention (enforced by seed-templates.mts):
//   line 1 = title  →  <h2>
//   line 2 = subtitle →  <p class="subtitle">
//   "N. text…" lines →  numbered clause rows
//   blank lines       →  vertical spacer
//   everything else   →  regular paragraph

function DocumentBody({ text }: { text: string }) {
  const lines = parseDocumentLines(text);

  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        if (line.type === "title") {
          return (
            <h2 key={i} className="text-lg font-bold text-gray-900 text-center pb-0.5">
              {line.text}
            </h2>
          );
        }
        if (line.type === "subtitle") {
          return (
            <p key={i} className="text-xs text-gray-500 text-center pb-1">
              {line.text}
            </p>
          );
        }
        if (line.type === "blank") {
          return <div key={i} className="h-2" />;
        }
        if (line.type === "numbered") {
          return (
            <div key={i} className="flex gap-2.5 leading-relaxed">
              <span className="shrink-0 font-semibold text-gray-600 w-5">{line.num}.</span>
              <span className="flex-1 text-gray-700">{line.text}</span>
            </div>
          );
        }
        // para
        return (
          <p key={i} className="text-gray-800">
            {line.text}
          </p>
        );
      })}
    </div>
  );
}

// ─── Property table ───────────────────────────────────────────────────────────

function PropertyTable({
  contract: c,
  revealFullAddress,
  labels,
}: {
  contract:          Contract;
  revealFullAddress: boolean;
  labels:            ReturnType<typeof getLabels>;
}) {
  const rows: [string, string][] = [
    [labels.address,    formatPropertyAddress(c.propertyAddress, c.propertyCity, revealFullAddress)],
    [labels.dealType,   c.dealType],
    [labels.price,      c.propertyPrice],
    [labels.commission, c.commission],
  ];
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, value], i) => (
            <tr key={label} className={i < rows.length - 1 ? "border-b border-gray-100" : ""}>
              <td className="px-4 py-2.5 bg-gray-50 font-medium text-gray-500 w-1/3">{label}</td>
              <td className="px-4 py-2.5 text-gray-900 font-medium">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Primitives (fallback layout) ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-500 w-36 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium">{value || "—"}</span>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ContractTemplate({
  contract: c,
  hideAddress = false,
}: {
  contract:     Contract;
  hideAddress?: boolean;
}) {
  const labels   = getLabels(c.language);
  const isRtl    = isRtlLang(c.language);
  const dir      = isRtl ? "rtl" : "ltr";

  // True once the client has signed — covers SIGNED, PAYMENT_PENDING, and PAID.
  // Used for both the address reveal and the signature image display.
  const isSignedOrBeyond =
    c.signatureStatus === "נחתם"           ||
    c.signatureStatus === "ממתין לתשלום"  ||
    c.signatureStatus === "שולם";

  // Address reveal: show full address once signed, or when broker hasn't hidden it.
  const revealFullAddress = isSignedOrBeyond || !hideAddress;

  // ── HatimaTova-style layout (when real legal text exists) ──────────────────
  if (c.generatedText) {
    const parsed              = parseDocumentLines(c.generatedText);
    const { preamble, clauses } = splitAtClauses(parsed);

    return (
      <div
        className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100"
        dir={dir}
      >
        {/* ── Document number + date ─────────────────────────────────────── */}
        <div className="px-6 py-3 flex justify-between items-center text-xs text-gray-400">
          <span>
            {labels.docNumber}:{" "}
            <span className="font-mono font-semibold text-gray-600">
              {String(c.id).slice(-8).toUpperCase()}
            </span>
          </span>
          <span>{labels.date}: {c.createdDate}</span>
        </div>

        {/* ── Preamble (title, subtitle, opening paragraphs) ─────────────── */}
        <div className="px-6 py-5">
          <DocumentBody
            text={preamble
              .map((l) =>
                l.type === "blank" ? "" :
                l.type === "title" || l.type === "subtitle" || l.type === "para" ? l.text : "",
              )
              .join("\n")}
          />
        </div>

        {/* ── Property table ─────────────────────────────────────────────── */}
        <div className="px-6 py-4">
          <PropertyTable contract={c} revealFullAddress={revealFullAddress} labels={labels} />
        </div>

        {/* ── Legal clauses ──────────────────────────────────────────────── */}
        {clauses.length > 0 && (
          <div className="px-6 py-5">
            <div className="space-y-3 text-sm leading-relaxed">
              {clauses.map((line, i) => {
                if (line.type === "blank") return <div key={i} className="h-1.5" />;
                if (line.type === "numbered") {
                  return (
                    <div key={i} className="flex gap-2.5">
                      <span className="shrink-0 font-semibold text-gray-600 w-5">{line.num}.</span>
                      <span className="flex-1 text-gray-700">{line.text}</span>
                    </div>
                  );
                }
                return <p key={i} className="text-gray-700">{(line as { text: string }).text}</p>;
              })}
            </div>
          </div>
        )}

        {/* ── Signature ──────────────────────────────────────────────────── */}
        <div className="px-6 py-5">
          <p className="text-xs font-semibold text-gray-500 mb-4">{labels.clientSignature}</p>
          {isSignedOrBeyond && c.signatureData ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.signatureData}
                alt={labels.clientSignature}
                className="w-full max-h-[120px] object-contain"
              />
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-lg h-[100px] flex items-center justify-center bg-gray-50 mb-2">
              <span className="text-xs text-gray-400">{labels.notYetSigned}</span>
            </div>
          )}
          <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
            <span>{c.client}</span>
            {isSignedOrBeyond && c.signedDate && <span>{labels.date}: {c.signedDate}</span>}
          </div>
          {isSignedOrBeyond && c.signedDate && (
            <p className="text-[11px] text-gray-400 mt-3 text-center">
              {labels.signedNote(c.signedDate)}
            </p>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-3 bg-gray-50 rounded-b-xl">
          <p className="text-[10px] text-gray-400 text-center">
            {labels.footer}
          </p>
        </div>
      </div>
    );
  }

  // ── Fallback layout (no generatedText) ────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100" dir={dir}>

      {/* Header */}
      <div className="px-6 py-5 text-center">
        <p className="text-[11px] font-bold tracking-widest text-indigo-600 uppercase mb-1">SignDeal</p>
        <h1 className="text-xl font-bold text-gray-900">הזמנת שירותי תיווך</h1>
        <p className="text-sm text-gray-500 mt-0.5">{c.contractType}</p>
        <div className="flex justify-center gap-5 mt-3 text-xs text-gray-400">
          <span>
            {labels.docNumber}:{" "}
            <span className="font-mono font-medium text-gray-600">
              {String(c.id).slice(-8).toUpperCase()}
            </span>
          </span>
          <span>{labels.date}: {c.createdDate}</span>
        </div>
      </div>

      {/* Client details */}
      <div className="px-6 py-5">
        <Section title={labels.clientDetails}>
          <FieldRow label={labels.fullName} value={c.client}      />
          <FieldRow label={labels.idNumber} value={c.clientId}    />
          <FieldRow label={labels.phone}    value={c.clientPhone}  />
          <FieldRow label={labels.email}    value={c.clientEmail} />
        </Section>
      </div>

      {/* Property details */}
      <div className="px-6 py-5">
        <Section title={labels.propertyDetails}>
          <div className="border border-gray-200 rounded-lg overflow-hidden mt-1">
            <table className="w-full text-sm">
              <tbody>
                {(
                  [
                    [labels.address,  formatPropertyAddress(c.propertyAddress, c.propertyCity, revealFullAddress)],
                    [labels.dealType, c.dealType],
                    [labels.price,    c.propertyPrice],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <tr key={label} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5 text-gray-500 bg-gray-50 w-1/3 font-medium">{label}</td>
                    <td className="px-4 py-2.5 text-gray-900">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      {/* Commission */}
      <div className="px-6 py-5">
        <Section title={labels.commissionTerms}>
          <p className="text-sm text-gray-700 leading-relaxed">
            {labels.commission}:{" "}
            <span className="font-semibold text-gray-900">{c.commission}</span>
          </p>
        </Section>
      </div>

      {/* Terms */}
      <div className="px-6 py-5">
        <Section title={labels.terms}>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 leading-relaxed marker:text-gray-400">
            <li>המתווך מתחייב לפעול בנאמנות ובמקצועיות לקידום האינטרסים של הלקוח בעסקה.</li>
            <li>הלקוח מתחייב שלא לבצע עסקה הקשורה לנכס זה ללא תיווך המשרד במהלך תקופת ההסכם.</li>
            <li>
              {c.dealType === "שכירות"
                ? "תקופת ההתקשרות הינה 6 חודשים ממועד החתימה, ותחודש בהסכמת שני הצדדים."
                : "תקופת ההתקשרות הינה 12 חודשים ממועד החתימה, ותחודש בהסכמת שני הצדדים."}
            </li>
            <li>הסכם זה כפוף לחוק המתווכים במקרקעין, תשנ״ו-1996 ולכל דין רלוונטי אחר.</li>
            <li>סמכות שיפוטית לבירור כל מחלוקת תהא לבתי המשפט המוסמכים.</li>
          </ol>
        </Section>
      </div>

      {/* Signature */}
      <div className="px-6 py-5">
        <Section title={labels.signature}>
          <div className="mt-2 space-y-1.5">
            <p className="text-xs font-medium text-gray-500">{labels.clientSignature}</p>
            {isSignedOrBeyond && c.signatureData ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.signatureData}
                  alt={labels.clientSignature}
                  className="w-full max-h-[130px] object-contain"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-lg h-[110px] flex items-center justify-center bg-gray-50">
                <span className="text-xs text-gray-400">{labels.notYetSigned}</span>
              </div>
            )}
            {isSignedOrBeyond && c.signedDate && (
              <p className="text-xs text-gray-400">{labels.date}: {c.signedDate}</p>
            )}
          </div>
          {isSignedOrBeyond && c.signedDate && (
            <p className="text-[11px] text-gray-400 mt-3 text-center">
              {labels.signedNote(c.signedDate)}
            </p>
          )}
        </Section>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 rounded-b-xl">
        <p className="text-[10px] text-gray-400 text-center">
          {labels.footer}
        </p>
      </div>
    </div>
  );
}
