// ── Contract UI label dictionary ──────────────────────────────────────────────
// Maps each supported language to every UI string used in:
//   • ContractTemplate  (HTML signing page document body)
//   • ContractPDF       (PDF document body)
//   • ContractPreview   (wizard Step 5 mock preview)
//   • SigningPage       (public /contracts/sign/[token] page)
//
// Adding a new language:
//   1. Add it to ContractLang.
//   2. Add a full entry to LABELS.
//   3. isRtlLang — add to the RTL set if needed.

export type ContractLang = "HE" | "EN" | "FR" | "RU";

export interface LabelSet {
  // ── Document fields (ContractTemplate + ContractPDF) ──────────────────────
  docNumber:       string;
  date:            string;
  address:         string;
  dealType:        string;
  price:           string;
  commission:      string;
  clientSignature: string;
  notYetSigned:    string;
  /** Full "signed on <date>" sentence — structure varies by language */
  signedNote:      (date: string) => string;
  footer:          string;
  // Fallback layout section labels
  clientDetails:   string;
  fullName:        string;
  idNumber:        string;
  phone:           string;
  email:           string;
  propertyDetails: string;
  commissionTerms: string;
  terms:           string;
  signature:       string;

  // ── Preview labels (ContractPreview in wizard Step 5) ─────────────────────
  issueDate:           string;
  parties:             string;
  brokerageAgreement:  string;
  previewNote:         string;
  /** "The agreed brokerage fee for this transaction is <commission>. Payment…" */
  commissionSentence:  (commission: string) => string;
  previewTermsList:    string[];

  // ── Signing page (SigningPage.tsx) ────────────────────────────────────────
  pageTitle:          string;
  consentText:        string;
  signHere:           string;
  clearSignature:     string;
  signButton:         string;
  signingInProgress:  string;
  signatureRequired:  string;
  completeDetails:    string;
  continueToSign:     string;
  updateError:        string;
  saveError:          string;
  signedTitle:        string;
  signedMessage:      (name: string) => string;
  canceledTitle:      string;
  canceledMessage:    string;
  notFoundTitle:      string;
  notFoundMessage:    string;
  paymentButton:      string;
  brokerWillContact:  string;
}

export const LABELS: Record<ContractLang, LabelSet> = {
  // ── Hebrew ────────────────────────────────────────────────────────────────
  HE: {
    docNumber:          "מסמך מס׳",
    date:               "תאריך",
    address:            "כתובת הנכס",
    dealType:           "סוג עסקה",
    price:              "מחיר",
    commission:         "עמלת תיווך",
    clientSignature:    "חתימת הלקוח",
    notYetSigned:       "טרם נחתם",
    signedNote:         (date) => `מסמך זה נחתם דיגיטלית ב-${date} ומאומת על ידי מערכת SignDeal.`,
    footer:             "מסמך זה הופק על ידי מערכת SignDeal · אינו מהווה ייעוץ משפטי",
    clientDetails:      "פרטי הלקוח",
    fullName:           "שם מלא",
    idNumber:           "תעודת זהות",
    phone:              "טלפון",
    email:              "דואר אלקטרוני",
    propertyDetails:    "פרטי הנכס",
    commissionTerms:    "עמלת תיווך",
    terms:              "תנאי ההסכם",
    signature:          "חתימה",
    // Preview
    issueDate:          "תאריך הפקה",
    parties:            "הצדדים להסכם",
    brokerageAgreement: "הסכם תיווך",
    previewNote:        "* זהו מסמך דמו בלבד. אין לו תוקף משפטי.",
    commissionSentence: (c) => `עמלת התיווך המוסכמת עבור עסקה זו הינה ${c}. התשלום יבוצע עם סגירת העסקה ולאחר חתימת הצדדים על חוזה מחייב.`,
    previewTermsList: [
      "המתווך יפעל בשקיפות מלאה ובהתאם לחוק המתווכים במקרקעין.",
      "הלקוח מאשר קבלת שירותי התיווך ומסכים לתשלום העמלה המפורטת לעיל.",
      "הסכם זה בתוקף ממועד חתימתו ועד לסיום העסקה או ביטולה בהסכמה הדדית.",
      "כל סכסוך שיתגלע יועבר לבוררות לפי הדין הישראלי.",
    ],
    // Signing page
    pageTitle:          "חתימה על חוזה",
    consentText:        "אני מאשר/ת שקראתי והבנתי את תנאי ההסכם",
    signHere:           "חתמו כאן",
    clearSignature:     "נקה חתימה",
    signButton:         "חתום/י על החוזה",
    signingInProgress:  "שומר חתימה...",
    signatureRequired:  "יש לחתום בתיבת החתימה לפני האישור.",
    completeDetails:    "נא להשלים פרטים חסרים לפני החתימה",
    continueToSign:     "המשך לחתימה",
    updateError:        "שגיאה בעדכון הפרטים. אנא נסה שוב.",
    saveError:          "שגיאה בשמירת החתימה. אנא נסה שוב.",
    signedTitle:        "החוזה נחתם בהצלחה",
    signedMessage:      (name) => `תודה, ${name}. החוזה נחתם ונשמר במערכת.`,
    canceledTitle:      "החוזה בוטל",
    canceledMessage:    "החוזה בוטל ואינו זמין לחתימה.",
    notFoundTitle:      "החוזה לא נמצא",
    notFoundMessage:    "הקישור אינו תקין או שהחוזה הוסר.",
    paymentButton:      "להמשיך לתשלום",
    brokerWillContact:  "הסוכן יצור איתך קשר בקרוב עם פרטי ההמשך.",
  },

  // ── English ───────────────────────────────────────────────────────────────
  EN: {
    docNumber:          "Doc. No.",
    date:               "Date",
    address:            "Property Address",
    dealType:           "Deal Type",
    price:              "Price",
    commission:         "Brokerage Fee",
    clientSignature:    "Client Signature",
    notYetSigned:       "Not yet signed",
    signedNote:         (date) => `This document was digitally signed on ${date} and verified by SignDeal.`,
    footer:             "Generated by SignDeal · Not legal advice",
    clientDetails:      "Client Details",
    fullName:           "Full Name",
    idNumber:           "ID Number",
    phone:              "Phone",
    email:              "Email",
    propertyDetails:    "Property Details",
    commissionTerms:    "Commission Terms",
    terms:              "Agreement Terms",
    signature:          "Signature",
    // Preview
    issueDate:          "Issue Date",
    parties:            "Agreement Parties",
    brokerageAgreement: "Brokerage Agreement",
    previewNote:        "* Preview only. Not legally binding.",
    commissionSentence: (c) => `The agreed brokerage fee for this transaction is ${c}. Payment is due upon closing and execution of a binding agreement by all parties.`,
    previewTermsList: [
      "The broker will act with full transparency and in accordance with applicable real estate brokerage law.",
      "The client acknowledges receipt of brokerage services and agrees to pay the fee specified above.",
      "This agreement is valid from the date of signing until the completion or mutual cancellation of the transaction.",
      "Any dispute arising shall be referred to arbitration under applicable law.",
    ],
    // Signing page
    pageTitle:          "Sign Agreement",
    consentText:        "I confirm that I have read and understood the terms of this agreement",
    signHere:           "Sign here",
    clearSignature:     "Clear",
    signButton:         "Sign Agreement",
    signingInProgress:  "Saving signature...",
    signatureRequired:  "Please sign in the signature box before confirming.",
    completeDetails:    "Please complete missing details before signing",
    continueToSign:     "Continue to Sign",
    updateError:        "Error updating details. Please try again.",
    saveError:          "Error saving signature. Please try again.",
    signedTitle:        "Agreement Signed Successfully",
    signedMessage:      (name) => `Thank you, ${name}. Your agreement has been signed and saved.`,
    canceledTitle:      "Agreement Canceled",
    canceledMessage:    "This agreement has been canceled and is no longer available for signing.",
    notFoundTitle:      "Agreement Not Found",
    notFoundMessage:    "The link is invalid or the agreement has been removed.",
    paymentButton:      "Proceed to Payment",
    brokerWillContact:  "Your broker will be in touch soon with next steps.",
  },

  // ── French ────────────────────────────────────────────────────────────────
  FR: {
    docNumber:          "Doc. n°",
    date:               "Date",
    address:            "Adresse du bien",
    dealType:           "Type de transaction",
    price:              "Prix",
    commission:         "Honoraires de courtage",
    clientSignature:    "Signature du client",
    notYetSigned:       "Non encore signé",
    signedNote:         (date) => `Ce document a été signé électroniquement le ${date} et vérifié par SignDeal.`,
    footer:             "Généré par SignDeal · Ne constitue pas un conseil juridique",
    clientDetails:      "Coordonnées du client",
    fullName:           "Nom complet",
    idNumber:           "Numéro d'identité",
    phone:              "Téléphone",
    email:              "E-mail",
    propertyDetails:    "Détails du bien",
    commissionTerms:    "Conditions d'honoraires",
    terms:              "Conditions de l'accord",
    signature:          "Signature",
    // Preview
    issueDate:          "Date d'émission",
    parties:            "Parties à l'accord",
    brokerageAgreement: "Accord de courtage",
    previewNote:        "* Aperçu uniquement. Non contraignant juridiquement.",
    commissionSentence: (c) => `Les honoraires de courtage convenus pour cette transaction s'élèvent à ${c}. Le paiement est dû à la conclusion et à la signature d'un accord contraignant entre les parties.`,
    previewTermsList: [
      "L'agent agira en toute transparence et conformément à la loi applicable sur le courtage immobilier.",
      "Le client reconnaît avoir reçu les services de courtage et accepte de payer les honoraires indiqués ci-dessus.",
      "Le présent accord est valable à compter de sa signature jusqu'à la réalisation ou l'annulation mutuelle de la transaction.",
      "Tout litige sera soumis à l'arbitrage conformément au droit applicable.",
    ],
    // Signing page
    pageTitle:          "Signature du contrat",
    consentText:        "Je confirme avoir lu et compris les conditions du présent accord",
    signHere:           "Signez ici",
    clearSignature:     "Effacer",
    signButton:         "Signer l'accord",
    signingInProgress:  "Enregistrement...",
    signatureRequired:  "Veuillez signer dans la zone de signature avant de confirmer.",
    completeDetails:    "Veuillez compléter les informations manquantes avant de signer",
    continueToSign:     "Continuer pour signer",
    updateError:        "Erreur lors de la mise à jour des informations. Veuillez réessayer.",
    saveError:          "Erreur lors de l'enregistrement de la signature. Veuillez réessayer.",
    signedTitle:        "Accord signé avec succès",
    signedMessage:      (name) => `Merci, ${name}. Votre accord a été signé et enregistré.`,
    canceledTitle:      "Accord annulé",
    canceledMessage:    "Cet accord a été annulé et n'est plus disponible pour signature.",
    notFoundTitle:      "Accord introuvable",
    notFoundMessage:    "Le lien est invalide ou l'accord a été supprimé.",
    paymentButton:      "Passer au paiement",
    brokerWillContact:  "Votre agent vous contactera prochainement avec la suite.",
  },

  // ── Russian ───────────────────────────────────────────────────────────────
  RU: {
    docNumber:          "Документ №",
    date:               "Дата",
    address:            "Адрес объекта",
    dealType:           "Тип сделки",
    price:              "Цена",
    commission:         "Брокерское вознаграждение",
    clientSignature:    "Подпись клиента",
    notYetSigned:       "Ещё не подписан",
    signedNote:         (date) => `Настоящий документ подписан электронно ${date} и проверен SignDeal.`,
    footer:             "Создано SignDeal · Не является юридической консультацией",
    clientDetails:      "Данные клиента",
    fullName:           "Полное имя",
    idNumber:           "Удостоверение личности",
    phone:              "Телефон",
    email:              "Эл. почта",
    propertyDetails:    "Сведения об объекте",
    commissionTerms:    "Условия вознаграждения",
    terms:              "Условия соглашения",
    signature:          "Подпись",
    // Preview
    issueDate:          "Дата выдачи",
    parties:            "Стороны соглашения",
    brokerageAgreement: "Брокерское соглашение",
    previewNote:        "* Только предпросмотр. Юридической силы не имеет.",
    commissionSentence: (c) => `Согласованное брокерское вознаграждение по данной сделке составляет ${c}. Оплата производится при закрытии сделки и подписании сторонами обязывающего договора.`,
    previewTermsList: [
      "Брокер будет действовать в полной прозрачности и в соответствии с применимым законодательством о брокерстве.",
      "Клиент подтверждает получение брокерских услуг и соглашается выплатить вознаграждение, указанное выше.",
      "Настоящее соглашение действует с даты его подписания до завершения сделки или её взаимной отмены.",
      "Любой возникший спор передаётся на рассмотрение в арбитраж в соответствии с применимым правом.",
    ],
    // Signing page
    pageTitle:          "Подписание договора",
    consentText:        "Я подтверждаю, что прочитал(-а) и понял(-а) условия настоящего соглашения",
    signHere:           "Подпишите здесь",
    clearSignature:     "Очистить",
    signButton:         "Подписать договор",
    signingInProgress:  "Сохранение...",
    signatureRequired:  "Пожалуйста, подпишите в поле для подписи перед подтверждением.",
    completeDetails:    "Пожалуйста, заполните недостающие данные перед подписанием",
    continueToSign:     "Продолжить к подписанию",
    updateError:        "Ошибка при обновлении данных. Пожалуйста, попробуйте снова.",
    saveError:          "Ошибка при сохранении подписи. Пожалуйста, попробуйте снова.",
    signedTitle:        "Договор подписан",
    signedMessage:      (name) => `Спасибо, ${name}. Ваш договор подписан и сохранён.`,
    canceledTitle:      "Договор отменён",
    canceledMessage:    "Этот договор был отменён и больше не доступен для подписания.",
    notFoundTitle:      "Договор не найден",
    notFoundMessage:    "Ссылка недействительна или договор был удалён.",
    paymentButton:      "Перейти к оплате",
    brokerWillContact:  "Ваш брокер свяжется с вами в ближайшее время.",
  },
};

/** Returns the label set for the given language, falling back to HE. */
export function getLabels(language?: string | null): LabelSet {
  const key = (language ?? "HE").toUpperCase() as ContractLang;
  return LABELS[key] ?? LABELS.HE;
}

/** True for languages that run right-to-left (HE, AR). */
export function isRtlLang(language?: string | null): boolean {
  const lang = (language ?? "HE").toUpperCase();
  return lang === "HE" || lang === "AR";
}
