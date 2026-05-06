import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/require-user";

export async function GET() {
  try {
    const result = await requireUserId();
    if (result instanceof NextResponse) return result;
    const { userId } = result;

    const clients = await prisma.client.findMany({
      where:   { userId },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(clients);
  } catch (error) {
    console.error("[GET /api/clients]", error);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}
