"use client";

import { useState, useTransition } from "react";
import { useRouter }               from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
// Serialisable shape passed from the server component — no Date objects.
export type AdminUserRow = {
  id:        string;
  fullName:  string;
  email:     string;
  role:      "BROKER" | "ADMIN";
  createdAt: string; // ISO
  subscription: {
    plan:        "STANDARD" | "GROWTH" | "PRO" | "AGENCY";
    status:      "INCOMPLETE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
    trialEndsAt: string | null; // ISO
  } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────
// Active plan values only — STARTER and ENTERPRISE are deprecated.
const PLANS    = ["STANDARD", "GROWTH", "PRO", "AGENCY"] as const;
const STATUSES = ["INCOMPLETE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

function RoleBadge({ role }: { role: "BROKER" | "ADMIN" }) {
  return (
    <span
      className={[
        "inline-block px-2 py-0.5 rounded text-xs font-semibold",
        role === "ADMIN"
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-600",
      ].join(" ")}
    >
      {role}
    </span>
  );
}

// ── Per-row component (owns local action state) ────────────────────────────────
function UserRow({ user }: { user: AdminUserRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Local select state — initialised from server data
  const [plan,   setPlan]   = useState<string>(user.subscription?.plan   ?? "STANDARD");
  const [status, setStatus] = useState<string>(user.subscription?.status ?? "EXPIRED");

  const [error, setError] = useState<string | null>(null);
  const [busy,  setBusy]  = useState<"plan" | "status" | "role" | null>(null);

  async function callApi(
    endpoint: "plan" | "status" | "role",
    body: Record<string, string>,
  ) {
    setBusy(endpoint);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/${endpoint}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      // Refresh server data so the table reflects the DB truth
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(null);
    }
  }

  const disabled = isPending || busy !== null;

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 text-sm">
      {/* Name + email */}
      <td className="py-3 px-3 min-w-[180px]">
        <div className="font-medium text-gray-900">{user.fullName}</div>
        <div className="text-gray-500 text-xs">{user.email}</div>
      </td>

      {/* Role */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <RoleBadge role={user.role} />
          <button
            disabled={disabled}
            onClick={() =>
              callApi("role", {
                role: user.role === "ADMIN" ? "BROKER" : "ADMIN",
              })
            }
            className="text-xs text-indigo-600 hover:text-indigo-900 disabled:opacity-40 underline-offset-2 hover:underline transition-colors"
          >
            {busy === "role" ? "…" : user.role === "ADMIN" ? "Demote" : "Promote"}
          </button>
        </div>
      </td>

      {/* Plan */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            disabled={disabled}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button
            disabled={disabled || plan === (user.subscription?.plan ?? "STANDARD")}
            onClick={() => callApi("plan", { plan })}
            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {busy === "plan" ? "…" : "Save"}
          </button>
        </div>
      </td>

      {/* Status */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={disabled}
            className="text-xs border border-gray-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <button
            disabled={disabled || status === (user.subscription?.status ?? "EXPIRED")}
            onClick={() => callApi("status", { status })}
            className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700 disabled:opacity-40 transition-colors"
          >
            {busy === "status" ? "…" : "Save"}
          </button>
        </div>
      </td>

      {/* Trial ends */}
      <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
        {fmtDate(user.subscription?.trialEndsAt)}
      </td>

      {/* Created */}
      <td className="py-3 px-3 text-gray-500 whitespace-nowrap">
        {fmtDate(user.createdAt)}
      </td>

      {/* Inline error */}
      {error && (
        <td className="py-3 px-3 text-red-600 text-xs">{error}</td>
      )}
    </tr>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export function UsersTable({ users }: { users: AdminUserRow[] }) {
  if (users.length === 0) {
    return <p className="text-gray-500 text-sm py-8 text-center">No users found.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
          <tr>
            <th className="py-2.5 px-3">User</th>
            <th className="py-2.5 px-3">Role</th>
            <th className="py-2.5 px-3">Plan</th>
            <th className="py-2.5 px-3">Status</th>
            <th className="py-2.5 px-3">Trial Ends</th>
            <th className="py-2.5 px-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow key={u.id} user={u} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
