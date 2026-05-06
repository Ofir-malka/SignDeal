import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";
import { ContractPDF, type BrokerInfo } from "@/components/ContractPDF";
import { requireUserId } from "@/lib/require-user";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await context.params;

    const contract = await prisma.contract.findFirst({
      where: { id, userId },
      include: { client: true, payment: true, user: true },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Build ApiContractResponse shape from Prisma result, then reuse existing mapper
    const apiShape: ApiContractResponse = {
      id:              contract.id,
      contractType:    contract.contractType,
      dealType:        contract.dealType,
      status:          contract.status,
      propertyAddress: contract.propertyAddress,
      propertyCity:    contract.propertyCity,
      propertyPrice:   contract.propertyPrice,
      commission:      contract.commission,
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
            paymentUrl: contract.payment.paymentUrl ?? null,
            provider:   contract.payment.provider   ?? null,
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

    const broker: BrokerInfo = {
      fullName:      contract.user.fullName,
      licenseNumber: contract.user.licenseNumber ?? null,
      phone:         contract.user.phone         ?? null,
      idNumber:      contract.user.idNumber      ?? null,
      logoUrl:       contract.user.logoUrl       ?? null,
    };

    const pdfBuffer = await renderToBuffer(<ContractPDF contract={c} broker={broker} />);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="contract-${String(id).slice(-8).toUpperCase()}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/contracts/:id/pdf]", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
