import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

// ── GET /api/contract-templates/[id] ─────────────────────────────────────────
// Returns the full template including content (for editing / preview).

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;

    const { id } = await params;
    const template = await prisma.contractTemplate.findFirst({
      where: { id, isActive: true },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    return NextResponse.json(template);
  } catch (error) {
    console.error("[GET /api/contract-templates/:id]", error);
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 });
  }
}

// ── PATCH /api/contract-templates/[id] ───────────────────────────────────────
// Updates title and/or content; bumps version automatically.
// TODO: Restrict to admin role when roles are introduced.

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;

    const { id } = await params;
    const body = await request.json();
    const { title, content } = body;

    if (!title && !content) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = await prisma.contractTemplate.findFirst({
      where: { id, isActive: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const updated = await prisma.contractTemplate.update({
      where: { id },
      data: {
        ...(title   ? { title:   title.trim()   } : {}),
        ...(content ? { content: content.trim() } : {}),
        version: { increment: 1 },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[PATCH /api/contract-templates/:id]", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// ── DELETE /api/contract-templates/[id] ──────────────────────────────────────
// Soft-delete only — existing contracts that reference this template are unaffected
// because generatedText is an immutable snapshot on the Contract record.
// TODO: Restrict to admin role when roles are introduced.

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;

    const { id } = await params;
    const existing = await prisma.contractTemplate.findFirst({
      where: { id, isActive: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    await prisma.contractTemplate.update({
      where: { id },
      data:  { isActive: false },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE /api/contract-templates/:id]", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
