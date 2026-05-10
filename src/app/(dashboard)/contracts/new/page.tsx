import { DashboardShell }   from "@/components/DashboardShell";
import { NewContractWizard } from "@/components/NewContractWizard";

// ── Allowed values coming in via query params ──────────────────────────────────
const VALID_TYPES  = ["interested", "exclusivity", "cooperation"] as const;
const VALID_DEALS  = ["rental", "sale"] as const;
type ContractType  = typeof VALID_TYPES[number];
type DealType      = typeof VALID_DEALS[number];

// ── Page ───────────────────────────────────────────────────────────────────────
// searchParams opts this page into dynamic rendering (fine — it's an auth-gated
// dashboard page that is never statically pre-rendered anyway).

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp         = await searchParams;
  const rawType    = typeof sp.type === "string" ? sp.type : undefined;
  const rawDeal    = typeof sp.deal === "string" ? sp.deal : undefined;

  // Only accept known values; anything else is treated as "not set"
  const initialType = VALID_TYPES.includes(rawType as ContractType)
    ? (rawType as ContractType)
    : undefined;

  const initialDeal = VALID_DEALS.includes(rawDeal as DealType)
    ? (rawDeal as DealType)
    : undefined;

  return (
    <DashboardShell>
      <NewContractWizard initialType={initialType} initialDeal={initialDeal} />
    </DashboardShell>
  );
}
