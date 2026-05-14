/**
 * lib/pdf/generate-contract-pdf.tsx
 *
 * Reusable PDF generation utility.
 * Extracted from src/app/api/contracts/[id]/pdf/route.tsx so that
 * server-side code (e.g. the post-signing after() callback) can generate
 * a PDF buffer without making an HTTP call to the authenticated PDF route.
 *
 * Usage:
 *   const buffer = await generateContractPdf(contract.id, contract.userId);
 *   // buffer is a Node.js Buffer — convert to base64 for email attachments:
 *   const b64 = buffer.toString("base64");
 *
 * ── Auth note ────────────────────────────────────────────────────────────────
 * This function does NOT call requireUserId() — it is the caller's
 * responsibility to pass the correct brokerId (the owner of the contract).
 * When called from the signing callback, pass `contract.userId` directly.
 * When called from an authenticated API route, pass the session userId and
 * let the `where: { id, userId }` guard reject cross-user access.
 *
 * ── Error handling ───────────────────────────────────────────────────────────
 * Throws if the contract is not found or rendering fails.
 * Callers that must remain non-fatal (e.g. after() blocks) should wrap
 * this function in their own try/catch and handle null gracefully.
 */

import { renderToBuffer } from "@react-pdf/renderer";
import { prisma }         from "@/lib/prisma";
import { apiToContract, type ApiContractResponse } from "@/lib/api-contracts";
import { ContractPDF, type BrokerInfo }            from "@/components/ContractPDF";

/**
 * Generates a PDF for the given contract and returns it as a Node.js Buffer.
 *
 * @param contractId  The contract's cuid.
 * @param brokerId    The userId of the contract owner. Used as the ownership
 *                    filter — only returns the contract when it belongs to
 *                    this user, preventing cross-user PDF generation.
 * @throws {Error}    If the contract is not found (wrong id or wrong owner).
 * @throws {Error}    If @react-pdf/renderer fails to render (font missing, etc.)
 */
export async function generateContractPdf(
  contractId: string,
  brokerId:   string,
): Promise<Buffer> {
  // ── Load contract + broker info in one query ──────────────────────────────
  // Mirror the exact include shape used by the authenticated PDF route.
  const contract = await prisma.contract.findFirst({
    where:   { id: contractId, userId: brokerId },
    include: { client: true, payment: true, user: true },
  });

  if (!contract) {
    throw new Error(
      `generateContractPdf: contract not found — id=${contractId} brokerId=${brokerId}`,
    );
  }

  // ── Map Prisma result → ApiContractResponse ───────────────────────────────
  // Keeps the shape consistent with the authenticated route and with the
  // apiToContract() mapper that ContractPDF depends on.
  const apiShape: ApiContractResponse = {
    id:              contract.id,
    contractType:    contract.contractType,
    dealType:        contract.dealType,
    status:          contract.status,
    propertyAddress: contract.propertyAddress,
    propertyCity:    contract.propertyCity,
    propertyPrice:   contract.propertyPrice,
    commission:      contract.commission,
    commissionSale:  contract.commissionSale   ?? null,
    dealClosed:      contract.dealClosed,
    sentAt:          contract.sentAt?.toISOString()       ?? null,
    signedAt:        contract.signedAt?.toISOString()     ?? null,
    dealClosedAt:    contract.dealClosedAt?.toISOString() ?? null,
    createdAt:       contract.createdAt.toISOString(),
    client: {
      name:     contract.client.name,
      phone:    contract.client.phone,
      email:    contract.client.email,
      idNumber: contract.client.idNumber,
    },
    payment: contract.payment
      ? {
          status:     contract.payment.status,
          paidAt:     contract.payment.paidAt?.toISOString() ?? null,
          paymentUrl: contract.payment.paymentUrl             ?? null,
          provider:   contract.payment.provider               ?? null,
        }
      : null,
    signatureData:             contract.signatureData ?? null,
    signatureHash:             contract.signatureHash ?? null,
    userAgent:                 contract.userAgent     ?? null,
    propertyId:                contract.propertyId    ?? null,
    hideFullAddressFromClient: contract.hideFullAddressFromClient,
    generatedText:             contract.generatedText ?? null,
    templateId:                contract.templateId    ?? null,
    language:                  contract.language      ?? "HE",
  };

  const c = apiToContract(apiShape);

  // ── Build broker info ─────────────────────────────────────────────────────
  const broker: BrokerInfo = {
    fullName:      contract.user.fullName,
    licenseNumber: contract.user.licenseNumber ?? null,
    phone:         contract.user.phone         ?? null,
    idNumber:      contract.user.idNumber      ?? null,
    logoUrl:       contract.user.logoUrl       ?? null,
  };

  // ── Render ────────────────────────────────────────────────────────────────
  // renderToBuffer returns a Buffer. Fonts are loaded from
  // path.join(process.cwd(), "public/fonts/...") inside ContractPDF —
  // this resolves correctly in any Node.js server context (local dev, Vercel).
  return renderToBuffer(<ContractPDF contract={c} broker={broker} />);
}
