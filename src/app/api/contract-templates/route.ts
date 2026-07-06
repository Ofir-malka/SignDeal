import { NextResponse }   from "next/server";
import { prisma }         from "@/lib/prisma";
import { requireUserId }  from "@/lib/require-user";
import { requireAdmin }   from "@/lib/require-admin";
import { logAuditEvent }  from "@/lib/audit/log-audit-event";

// ── GET /api/contract-templates ───────────────────────────────────────────────
// Returns active templates for the broker's template picker.
// Content field excluded — fetch the individual template for full content.

export async function GET() {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;

    const templates = await prisma.contractTemplate.findMany({
      where:   { isActive: true },
      select:  { id: true, title: true, templateKey: true, version: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error("[GET /api/contract-templates]", error);
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
  }
}

// ── POST /api/contract-templates ──────────────────────────────────────────────
// Platform templates are managed via `scripts/seed-templates.mts`.
// This endpoint is restricted to ADMIN role users only (DB-verified, not JWT).

export async function POST(request: Request) {
  try {
    const result = await requireAdmin();
    if (result instanceof NextResponse) return result;
    const { adminId } = result;

    const body = await request.json();
    const { title, content, templateKey, language } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!content || typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    const VALID_KEYS  = ["INTERESTED_BUYER", "OWNER_EXCLUSIVE", "BROKER_COOP", "INTERESTED_BUYER_RENTAL", "INTERESTED_BUYER_SALE", "INTERESTED_BUYER_BOTH", "OWNER_EXCLUSIVE_RENTAL"];
    const VALID_LANGS = ["HE", "EN", "FR", "RU", "AR"];

    const resolvedKey  = templateKey && VALID_KEYS.includes(templateKey)   ? templateKey              : undefined;
    const resolvedLang = language    && VALID_LANGS.includes(language)      ? language as "HE"|"EN"|"FR"|"RU"|"AR" : "HE";

    const template = await prisma.contractTemplate.create({
      data: {
        title:    title.trim(),
        content:  content.trim(),
        language: resolvedLang,
        ...(resolvedKey ? { templateKey: resolvedKey } : {}),
      },
    });

    // ── Audit: template created ───────────────────────────────────────────────
    // content is intentionally excluded from metadata.
    await logAuditEvent({
      userId:     adminId,
      action:     "admin.template.created",
      entityType: "contractTemplate",
      entityId:   template.id,
      metadata:   {
        title:       template.title,
        templateKey: template.templateKey ?? null,
        language:    template.language,
        isActive:    template.isActive,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error("[POST /api/contract-templates]", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
