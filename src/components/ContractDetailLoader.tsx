"use client";

import { useEffect, useState } from "react";
import { ContractDetail } from "@/components/ContractDetail";
import type { Contract } from "@/lib/contracts-data";
import { type ApiContractResponse, apiToContract } from "@/lib/api-contracts";

export function ContractDetailLoader({ id }: { id: string }) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/contracts/${id}`);
        if (res.ok) {
          const data: ApiContractResponse = await res.json();
          setContract(apiToContract(data));
          return;
        }
        setError("החוזה לא נמצא");
      } catch {
        setError("שגיאה בטעינת החוזה. אנא נסה שוב.");
      }
    }

    load().finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">טוען חוזה...</p>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-gray-500">{error ?? "החוזה לא נמצא"}</p>
      </div>
    );
  }

  return <ContractDetail contract={contract} />;
}
