import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await params;

    const client = await prisma.client.findFirst({
      where: { id, userId },
      include: { _count: { select: { contracts: true } } },
    });

    if (!client) {
      return NextResponse.json({ error: "לקוח לא נמצא" }, { status: 404 });
    }

    if (client._count.contracts > 0) {
      return NextResponse.json(
        { error: "לא ניתן למחוק לקוח עם חוזים קיימים" },
        { status: 400 }
      );
    }

    await prisma.client.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/clients/[id]]", error);
    return NextResponse.json({ error: "שגיאה במחיקת הלקוח" }, { status: 500 });
  }
}
