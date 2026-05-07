/**
 * POST /api/contracts/[id]/send-reminder
 *
 * Sends a signing-reminder SMS to the client for a contract that is in
 * SENT or OPENED status (i.e. awaiting client signature).
 *
 * Auth required — broker only.
 * Records the attempt as a SIGNING_REMINDER Message row.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";
import { sendNotification } from "@/lib/messaging/notify";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireUserId();
    if (authResult instanceof NextResponse) return authResult;
    const { userId } = authResult;

    const { id } = await params;

    const contract = await prisma.contract.findFirst({
      where:  { id, userId },
      select: {
        id:             true,
        status:         true,
        signatureToken: true,
        userId:         true,
        client: {
          select: { id: true, name: true, phone: true },
        },
      },
    });

    if (!contract) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }

    // Only meaningful for contracts still awaiting signature
    if (!["SENT", "OPENED"].includes(contract.status)) {
      return NextResponse.json(
        { error: "תזכורות ניתן לשלוח רק לחוזים הממתינים לחתימה" },
        { status: 400 },
      );
    }

    if (!contract.signatureToken) {
      return NextResponse.json({ error: "Contract has no signing link" }, { status: 400 });
    }

    const baseUrl     = process.env.APP_BASE_URL?.trim() || "https://www.signdeal.co.il";
    const signingLink = `${baseUrl}/contracts/sign/${contract.signatureToken}`;

    const body =
      `שלום ${contract.client.name},\n` +
      `תזכורת: עדיין לא חתמת על ההסכם שנשלח אליך.\n` +
      `לחתימה דיגיטלית:\n${signingLink}\n\n` +
      `SignDeal`;

    console.log("[POST /api/contracts/[id]/send-reminder] sending reminder", {
      contractId: contract.id,
      clientName: contract.client.name,
    });

    const result = await sendNotification({
      type:           "SIGNING_REMINDER",
      channel:        "SMS",
      body,
      recipientPhone: contract.client.phone,
      userId:         contract.userId,
      contractId:     contract.id,
      clientId:       contract.client.id,
    });

    // skipped = blocked by SMS_TEST_PHONE guard — not a real failure
    if (result.skipped) {
      return NextResponse.json({ success: true, skipped: true, messageId: result.messageId });
    }

    if (!result.ok) {
      return NextResponse.json(
        { success: false, reason: result.reason },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    console.error("[POST /api/contracts/[id]/send-reminder]", error);
    return NextResponse.json({ error: "שגיאה בשליחת התזכורת" }, { status: 500 });
  }
}
