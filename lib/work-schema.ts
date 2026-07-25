import type { SupabaseClient } from "@supabase/supabase-js";

export const WORK_SCHEMA_UPDATE_REQUIRED = "work_schema_update_required";

function isMissingRpc(error: { code?: string } | null) {
  return ["42883", "PGRST202"].includes(error?.code ?? "");
}

/**
 * Verifies that the database implements the Work contract before the client
 * attempts a state transition. Older schemas fail closed instead of falling
 * back to a direct update of tasks.status.
 */
export async function requireWorkSchema(supabase: SupabaseClient<any>) {
  const { error } = await supabase.rpc("assert_work_schema_ready");
  if (!error) return;
  if (isMissingRpc(error)) throw new Error(WORK_SCHEMA_UPDATE_REQUIRED);
  throw error;
}
