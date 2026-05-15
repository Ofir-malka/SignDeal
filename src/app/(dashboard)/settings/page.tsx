/**
 * /settings
 *
 * Phase 1: redirects to /settings/billing (the only real settings page for now).
 * When we add profile / notification settings, convert this to a hub page with tabs.
 */
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/billing");
}
