import path from "path";
import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import type { Contract } from "@/lib/contracts-data";
import { parseDocumentLines, splitAtClauses } from "@/lib/contracts/resolve-template";
import { getLabels, isRtlLang } from "@/lib/contracts/labels";
import { formatPropertyAddress, parsePropertyAddress } from "@/lib/format-address";

// ── Broker info passed from the PDF route ─────────────────────────────────────
export type BrokerInfo = {
  fullName:      string;
  licenseNumber: string | null;
  phone:         string | null;
  idNumber:      string | null;
  logoUrl:       string | null;
};

// ── Font ──────────────────────────────────────────────────────────────────────
Font.register({
  family: "Heebo",
  fonts: [
    { src: path.join(process.cwd(), "public", "fonts", "Heebo-Regular.ttf"), fontWeight: 400 },
    { src: path.join(process.cwd(), "public", "fonts", "Heebo-Bold.ttf"),    fontWeight: 700 },
  ],
});

// ── Static styles (direction-independent) ────────────────────────────────────
const S = StyleSheet.create({
  // Page base — direction overridden per-render below
  pageBase: {
    fontFamily:        "Heebo",
    fontSize:          10,
    color:             "#1a1a1a",
    backgroundColor:   "#ffffff",
    paddingTop:        28,
    paddingBottom:     36,
    paddingHorizontal: 36,
  },

  // Header
  headerRow: {
    alignItems:        "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingBottom:     14,
    marginBottom:      16,
  },
  brokerBlock: {
    width: 130,
    gap:   3,
  },
  brokerLogo: {
    width:        48,
    height:       48,
    marginBottom: 5,
    objectFit:    "contain",
  },
  brokerName: {
    fontSize:   9,
    fontWeight: 700,
    color:      "#111827",
  },
  brokerMeta: {
    fontSize: 8,
    color:    "#6b7280",
  },
  headerCenter: {
    flex:              1,
    alignItems:        "center",
    paddingHorizontal: 8,
  },
  headerSpacer: {
    width: 130,
  },
  docTitle: {
    fontSize:     15,
    fontWeight:   700,
    color:        "#111827",
    textAlign:    "center",
    marginBottom: 3,
  },
  docSubtitle: {
    fontSize:     8,
    color:        "#6b7280",
    textAlign:    "center",
    marginBottom: 6,
  },
  metaRow: {
    flexDirection:  "row",
    gap:            16,
    justifyContent: "center",
  },
  metaText: {
    fontSize: 8,
    color:    "#9ca3af",
  },

  // Property table
  table: {
    borderWidth:  1,
    borderColor:  "#e5e7eb",
    borderRadius: 4,
    marginBottom: 14,
  },
  tableRowBase: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#f3f4f6",
  },
  tableRowLast: {},
  tableLabel: {
    width:             "35%",
    backgroundColor:   "#f9fafb",
    paddingHorizontal: 10,
    paddingVertical:   6,
    fontSize:          9,
    fontWeight:        700,
    color:             "#6b7280",
  },
  tableValue: {
    flex:              1,
    paddingHorizontal: 10,
    paddingVertical:   6,
    fontSize:          9,
    fontWeight:        700,
    color:             "#111827",
  },

  // Document body
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize:          8,
    fontWeight:        700,
    color:             "#9ca3af",
    letterSpacing:     1,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingBottom:     4,
    marginBottom:      8,
  },
  bodyText: {
    fontSize:     9,
    color:        "#374151",
    lineHeight:   1.6,
    marginBottom: 4,
  },
  bold: {
    fontWeight: 700,
    color:      "#111827",
  },

  // Numbered clause
  listItem: {
    marginBottom: 5,
    gap:          6,
  },
  listNum: {
    width:      14,
    fontSize:   9,
    fontWeight: 700,
    color:      "#6b7280",
    textAlign:  "center",
  },
  listText: {
    flex:       1,
    fontSize:   9,
    color:      "#374151",
    lineHeight: 1.6,
  },

  // Field rows (fallback layout)
  fieldRowBase: {
    borderBottomWidth: 0.5,
    borderBottomColor: "#f9fafb",
    paddingVertical:   4,
  },
  fieldLabel: {
    width:    110,
    fontSize: 9,
    color:    "#6b7280",
  },
  fieldValue: {
    flex:       1,
    fontSize:   9,
    fontWeight: 700,
    color:      "#111827",
  },

  // Signature
  sigLabel: {
    fontSize:     8,
    fontWeight:   700,
    color:        "#6b7280",
    marginBottom: 6,
  },
  sigImageBox: {
    borderWidth:     1,
    borderColor:     "#e5e7eb",
    borderRadius:    4,
    height:          80,
    overflow:        "hidden",
    backgroundColor: "#ffffff",
  },
  sigImage: {
    width:     "100%",
    height:    "100%",
    objectFit: "contain",
  },
  sigPlaceholder: {
    borderWidth:     1,
    borderColor:     "#e5e7eb",
    borderStyle:     "dashed",
    borderRadius:    4,
    height:          80,
    justifyContent:  "center",
    alignItems:      "center",
    backgroundColor: "#f9fafb",
  },
  sigPlaceholderText: {
    fontSize:  8,
    color:     "#9ca3af",
    textAlign: "center",
  },
  sigDate: {
    fontSize:  8,
    color:     "#9ca3af",
    marginTop: 4,
  },
  sigNote: {
    fontSize:  8,
    color:     "#9ca3af",
    textAlign: "center",
    marginTop: 10,
  },
  sigNameRow: {
    justifyContent: "space-between",
    marginTop:      6,
  },
  sigNameText: {
    fontSize: 8,
    color:    "#6b7280",
  },

  // Footer
  footer: {
    position:       "absolute",
    bottom:         20,
    left:           36,
    right:          36,
    fontSize:       7.5,
    color:          "#d1d5db",
    textAlign:      "center",
    borderTopWidth: 0.5,
    borderTopColor: "#f3f4f6",
    paddingTop:     6,
  },
});

// ── Direction helpers ─────────────────────────────────────────────────────────
// react-pdf's `direction` prop only affects text flow, NOT flex direction.
// We must manually set flexDirection and textAlign per element.

type FlexDir = "row" | "row-reverse";
type TextAlign = "left" | "right";

function rowDir(isRtl: boolean): FlexDir    { return isRtl ? "row-reverse" : "row"; }
function textDir(isRtl: boolean): TextAlign  { return isRtl ? "right" : "left"; }

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldRow({ label, value, isRtl }: { label: string; value: string; isRtl: boolean }) {
  const td = textDir(isRtl);
  return (
    <View style={[S.fieldRowBase, { flexDirection: rowDir(isRtl) }]}>
      <Text style={[S.fieldLabel, { textAlign: td }]}>{label}</Text>
      <Text style={[S.fieldValue, { textAlign: td }]}>{value || "—"}</Text>
    </View>
  );
}

// ── Broker header block ────────────────────────────────────────────────────────

function BrokerHeaderBlock({ broker, title, subtitle, docNum, docDate, isRtl, labels }: {
  broker:   BrokerInfo;
  title:    string;
  subtitle: string;
  docNum:   string;
  docDate:  string;
  isRtl:    boolean;
  labels:   ReturnType<typeof getLabels>;
}) {
  const td = textDir(isRtl);
  return (
    <View style={[S.headerRow, { flexDirection: rowDir(isRtl) }]}>
      {/* Broker block */}
      <View style={[S.brokerBlock, { alignItems: isRtl ? "flex-end" : "flex-start" }]}>
        {broker.logoUrl && <Image src={broker.logoUrl} style={S.brokerLogo} />}
        <Text style={[S.brokerName, { textAlign: td }]}>{broker.fullName}</Text>
        {broker.licenseNumber && <Text style={[S.brokerMeta, { textAlign: td }]}>{broker.licenseNumber}</Text>}
        {broker.phone         && <Text style={[S.brokerMeta, { textAlign: td }]}>{broker.phone}</Text>}
        {broker.idNumber      && <Text style={[S.brokerMeta, { textAlign: td }]}>{broker.idNumber}</Text>}
      </View>

      {/* Centre block */}
      <View style={S.headerCenter}>
        <Text style={S.docTitle}>{title}</Text>
        <Text style={S.docSubtitle}>{subtitle}</Text>
        <View style={S.metaRow}>
          <Text style={S.metaText}>{labels.docNumber}: {docNum}</Text>
          <Text style={S.metaText}>{labels.date}: {docDate}</Text>
        </View>
      </View>

      {/* Spacer */}
      <View style={S.headerSpacer} />
    </View>
  );
}

// ── Property table ─────────────────────────────────────────────────────────────

function PropertyTablePDF({ rows, isRtl }: { rows: [string, string][]; isRtl: boolean }) {
  const td = textDir(isRtl);
  return (
    <View style={S.table}>
      {rows.map(([label, value], i) => (
        <View
          key={label}
          style={[
            i < rows.length - 1 ? S.tableRowBase : S.tableRowLast,
            { flexDirection: rowDir(isRtl) },
          ]}
        >
          <Text style={[S.tableLabel, { textAlign: td }]}>{label}</Text>
          <Text style={[S.tableValue, { textAlign: td }]}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Document body (parsed generatedText) ──────────────────────────────────────

function DocBodyPDF({ lines, isRtl }: { lines: ReturnType<typeof parseDocumentLines>; isRtl: boolean }) {
  const td = textDir(isRtl);
  return (
    <>
      {lines.map((line, i) => {
        if (line.type === "title")    return <Text key={i} style={[S.docTitle,    { marginBottom: 3 }]}>{line.text}</Text>;
        if (line.type === "subtitle") return <Text key={i} style={[S.docSubtitle, { marginBottom: 4 }]}>{line.text}</Text>;
        if (line.type === "blank")    return <View key={i} style={{ height: 5 }} />;
        if (line.type === "numbered") {
          return (
            <View key={i} style={[S.listItem, { flexDirection: rowDir(isRtl) }]}>
              <Text style={S.listNum}>{line.num}.</Text>
              <Text style={[S.listText, { textAlign: td }]}>{line.text}</Text>
            </View>
          );
        }
        // para
        return <Text key={i} style={[S.bodyText, { textAlign: td }]}>{line.text}</Text>;
      })}
    </>
  );
}

// ── Main document ──────────────────────────────────────────────────────────────

export function ContractPDF({ contract: c, broker }: { contract: Contract; broker: BrokerInfo }) {
  const isSigned = c.signatureStatus === "נחתם";
  const isRtl    = isRtlLang(c.language);

  // Address reveal: once the client has signed (any post-signature status) the
  // full address appears in the PDF, matching ContractTemplate behaviour.
  const isSignedOrBeyond =
    c.signatureStatus === "נחתם"           ||
    c.signatureStatus === "ממתין לתשלום"  ||
    c.signatureStatus === "שולם";
  const revealFullAddress = isSignedOrBeyond || !c.hideFullAddressFromClient;
  const labels   = getLabels(c.language);
  const td       = textDir(isRtl);

  const today = new Date().toLocaleDateString("he-IL", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const docNum = String(c.id).slice(-8).toUpperCase();

  // Page style: merge base + direction
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageStyle: any[] = [S.pageBase, { direction: isRtl ? "rtl" : "ltr" }];

  // ── HatimaTova-style layout (when real legal text exists) ──────────────────
  if (c.generatedText) {
    const allLines               = parseDocumentLines(c.generatedText);
    const { preamble, clauses }  = splitAtClauses(allLines);

    const titleLine    = preamble.find((l) => l.type === "title");
    const subtitleLine = preamble.find((l) => l.type === "subtitle");
    const docTitle     = titleLine    ? titleLine.text    : "טופס הזמנת שירותי תיווך";
    const docSubtitle  = subtitleLine ? subtitleLine.text : "";

    // Strip title + subtitle — show remaining preamble as body
    const bodyPreamble = preamble.filter((l) => l.type !== "title" && l.type !== "subtitle");

    const { floor: propFloor, apartment: propApt } = parsePropertyAddress(c.propertyAddress);
    const propertyRows: [string, string][] = [
      [labels.address,    formatPropertyAddress(c.propertyAddress, c.propertyCity, revealFullAddress)],
      ...(propFloor ? [[labels.floor,     propFloor] as [string, string]] : []),
      ...(propApt   ? [[labels.apartment, propApt  ] as [string, string]] : []),
      [labels.dealType,   c.dealType],
      [labels.price,      c.propertyPrice],
      // BOTH: split into two commission rows
      ...(c.dealType === "גם וגם" && c.commissionSale
        ? [["עמלת שכירות", c.commission] as [string, string], ["עמלת מכירה", c.commissionSale] as [string, string]]
        : [[labels.commission, c.commission] as [string, string]]),
    ];

    const docLang = (c.language ?? "HE").toLowerCase();

    return (
      <Document title={`${docTitle} — ${c.client}`} language={docLang}>
        <Page size="A4" style={pageStyle}>

          <BrokerHeaderBlock
            broker={broker}
            title={docTitle}
            subtitle={docSubtitle}
            docNum={docNum}
            docDate={c.createdDate}
            isRtl={isRtl}
            labels={labels}
          />

          <PropertyTablePDF rows={propertyRows} isRtl={isRtl} />

          {bodyPreamble.length > 0 && (
            <View style={[S.section, { marginBottom: 10 }]}>
              <DocBodyPDF lines={bodyPreamble} isRtl={isRtl} />
            </View>
          )}

          {clauses.length > 0 && (
            <View style={S.section}>
              <DocBodyPDF lines={clauses} isRtl={isRtl} />
            </View>
          )}

          {/* Client signature */}
          <View style={[S.section, { marginTop: 16 }]}>
            <Text style={[S.sigLabel, { textAlign: td }]}>{labels.clientSignature}</Text>
            {isSigned && c.signatureData ? (
              <View style={S.sigImageBox}>
                <Image src={c.signatureData} style={S.sigImage} />
              </View>
            ) : (
              <View style={S.sigPlaceholder}>
                <Text style={S.sigPlaceholderText}>{labels.notYetSigned}</Text>
              </View>
            )}
            <View style={[S.sigNameRow, { flexDirection: rowDir(isRtl) }]}>
              <Text style={S.sigNameText}>{c.client}</Text>
              {isSigned && c.signedDate && (
                <Text style={S.sigDate}>{labels.date}: {c.signedDate}</Text>
              )}
            </View>
            {isSigned && c.signedDate && (
              <Text style={S.sigNote}>{labels.signedNote(c.signedDate)}</Text>
            )}
          </View>

          <Text style={S.footer} fixed>
            {labels.footer} · {today}
          </Text>

        </Page>
      </Document>
    );
  }

  // ── Fallback layout (no generatedText) ────────────────────────────────────
  const { floor: fbFloor, apartment: fbApt } = parsePropertyAddress(c.propertyAddress);
  const propertyRows: [string, string][] = [
    [labels.address,  formatPropertyAddress(c.propertyAddress, c.propertyCity, revealFullAddress)],
    ...(fbFloor ? [[labels.floor,     fbFloor] as [string, string]] : []),
    ...(fbApt   ? [[labels.apartment, fbApt  ] as [string, string]] : []),
    [labels.dealType, c.dealType],
    [labels.price,    c.propertyPrice],
  ];

  const terms = [
    "המתווך מתחייב לפעול בנאמנות ובמקצועיות לקידום האינטרסים של הלקוח בעסקה.",
    "הלקוח מתחייב שלא לבצע עסקה הקשורה לנכס זה ללא תיווך המשרד במהלך תקופת ההסכם.",
    c.dealType === "שכירות"
      ? "תקופת ההתקשרות הינה 6 חודשים ממועד החתימה, ותחודש בהסכמת שני הצדדים."
      : c.dealType === "גם וגם"
        ? "תקופת ההתקשרות הינה 12 חודשים ממועד החתימה עבור מכירה ו-6 חודשים עבור השכרה, ותחודש בהסכמת שני הצדדים."
        : "תקופת ההתקשרות הינה 12 חודשים ממועד החתימה, ותחודש בהסכמת שני הצדדים.",
    'הסכם זה כפוף לחוק המתווכים במקרקעין, תשנ"ו-1996 ולכל דין רלוונטי אחר.',
    "סמכות שיפוטית לבירור כל מחלוקת תהא לבתי המשפט המוסמכים.",
  ];

  const docLang = (c.language ?? "HE").toLowerCase();

  return (
    <Document title={`${labels.signature} — ${c.client}`} language={docLang}>
      <Page size="A4" style={pageStyle}>

        <BrokerHeaderBlock
          broker={broker}
          title="הזמנת שירותי תיווך"
          subtitle={c.contractType}
          docNum={docNum}
          docDate={c.createdDate}
          isRtl={isRtl}
          labels={labels}
        />

        {/* Broker */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>א. פרטי המתווך</Text>
          <FieldRow label="שם המתווך"   value={broker.fullName}             isRtl={isRtl} />
          <FieldRow label="מס׳ רישיון"  value={broker.licenseNumber ?? "—"} isRtl={isRtl} />
          <FieldRow label="טלפון"        value={broker.phone         ?? "—"} isRtl={isRtl} />
          <FieldRow label="ת״ז"          value={broker.idNumber      ?? "—"} isRtl={isRtl} />
        </View>

        {/* Client */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>ב. {labels.clientDetails}</Text>
          <FieldRow label={labels.fullName} value={c.client}               isRtl={isRtl} />
          <FieldRow label={labels.idNumber} value={c.clientId    || "—"}   isRtl={isRtl} />
          <FieldRow label={labels.phone}    value={c.clientPhone}           isRtl={isRtl} />
          <FieldRow label={labels.email}    value={c.clientEmail || "—"}   isRtl={isRtl} />
        </View>

        {/* Property */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>ג. {labels.propertyDetails}</Text>
          <PropertyTablePDF rows={propertyRows} isRtl={isRtl} />
        </View>

        {/* Commission */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>ד. {labels.commissionTerms}</Text>
          {c.dealType === "גם וגם" ? (
            <>
              <Text style={[S.bodyText, { textAlign: td }]}>
                {"עמלת שכירות: "}<Text style={S.bold}>{c.commission}</Text>
              </Text>
              {c.commissionSale && (
                <Text style={[S.bodyText, { textAlign: td }]}>
                  {"עמלת מכירה: "}<Text style={S.bold}>{c.commissionSale}</Text>
                </Text>
              )}
            </>
          ) : (
            <Text style={[S.bodyText, { textAlign: td }]}>
              {labels.commission}:{" "}
              <Text style={S.bold}>{c.commission}</Text>
            </Text>
          )}
        </View>

        {/* Terms */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>ה. {labels.terms}</Text>
          {terms.map((term, i) => (
            <View key={i} style={[S.listItem, { flexDirection: rowDir(isRtl) }]}>
              <Text style={S.listNum}>{i + 1}.</Text>
              <Text style={[S.listText, { textAlign: td }]}>{term}</Text>
            </View>
          ))}
        </View>

        {/* Signature */}
        <View style={S.section}>
          <Text style={[S.sectionTitle, { textAlign: td }]}>ו. {labels.signature}</Text>
          <Text style={[S.sigLabel, { textAlign: td }]}>{labels.clientSignature}</Text>
          {isSigned && c.signatureData ? (
            <View style={S.sigImageBox}>
              <Image src={c.signatureData} style={S.sigImage} />
            </View>
          ) : (
            <View style={S.sigPlaceholder}>
              <Text style={S.sigPlaceholderText}>{labels.notYetSigned}</Text>
            </View>
          )}
          {isSigned && c.signedDate && (
            <Text style={[S.sigDate, { textAlign: td }]}>{labels.date}: {c.signedDate}</Text>
          )}
          {isSigned && c.signedDate && (
            <Text style={S.sigNote}>{labels.signedNote(c.signedDate)}</Text>
          )}
        </View>

        <Text style={S.footer} fixed>
          {labels.footer} · {today}
        </Text>

      </Page>
    </Document>
  );
}
