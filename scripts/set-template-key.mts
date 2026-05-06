import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

// Load env
const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const adapter = new PrismaPg({ connectionString: DB_URL });
const prisma  = new PrismaClient({ adapter } as never);

async function main() {
  const templates = await (prisma as never as { contractTemplate: { findMany: Function } }).contractTemplate.findMany({
    select: { id: true, title: true, templateKey: true, isActive: true },
  }) as Array<{ id: string; title: string; templateKey: string | null; isActive: boolean }>;

  console.log("=== Templates ===");
  console.log(JSON.stringify(templates, null, 2));

  if (templates.length === 0) { console.log("No templates found"); return; }

  const target = templates.find((t) => t.isActive) ?? templates[0];
  const updated = await (prisma as never as { contractTemplate: { update: Function } }).contractTemplate.update({
    where: { id: target.id },
    data:  { templateKey: "INTERESTED_BUYER" },
    select: { id: true, title: true, templateKey: true },
  });
  console.log("\n=== Updated ===");
  console.log(JSON.stringify(updated, null, 2));
}

main().catch(console.error).finally(() => (prisma as never as { $disconnect: Function }).$disconnect());
