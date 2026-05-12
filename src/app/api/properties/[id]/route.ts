import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

// ── DELETE /api/properties/[id] ───────────────────────────────────────────────
//
// Deletes a property owned by the authenticated broker.
//
// Safety rules:
//   • Ownership: only the broker who created the property may delete it.
//   • Linked contracts: if the property is linked to any contract (via
//     Contract.propertyId FK), deletion is blocked — the property is a
//     business record attached to a signed agreement. The caller receives
//     a 409 with a Hebrew message explaining why.
//   • If the property has no contracts, it is hard-deleted immediately.
//     There is no soft-delete: the property is not referenced by any other
//     model once contracts are cleared.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "מזהה נכס חסר" }, { status: 400 });
    }

    // ── Verify ownership ──────────────────────────────────────────────────────
    const property = await prisma.property.findFirst({
      where: { id, userId },
      include: { _count: { select: { contracts: true } } },
    });

    if (!property) {
      // 404 for not-found; also returned for wrong-owner to avoid enumeration.
      return NextResponse.json({ error: "הנכס לא נמצא" }, { status: 404 });
    }

    // ── Block deletion when contracts are linked ───────────────────────────────
    if (property._count.contracts > 0) {
      const count = property._count.contracts;
      return NextResponse.json(
        {
          error: `לא ניתן למחוק נכס המקושר ל-${count} ${count === 1 ? "חוזה" : "חוזים"}. ניתן למחוק את הנכס רק לאחר שכל החוזים המקושרים אליו הוסרו.`,
          code:  "HAS_CONTRACTS",
          contractCount: count,
        },
        { status: 409 },
      );
    }

    // ── Safe to delete ────────────────────────────────────────────────────────
    await prisma.property.delete({ where: { id } });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[DELETE /api/properties/:id]", error);
    return NextResponse.json({ error: "שגיאה במחיקת הנכס" }, { status: 500 });
  }
}
