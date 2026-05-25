import { createClient } from "@supabase/supabase-js";

let supabase = null;

export function initSupabase(url, key) {
  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  if (!supabase) {
    supabase = createClient(url, key);

    // Disable cross-tab BroadcastChannel to prevent one tab's refresh from
    // triggering auth state changes (and re-renders) in other tabs.
    // Tab-switch catch-up is handled by AuthProvider's visibilitychange listener.
    if (supabase.auth.broadcastChannel) {
      supabase.auth.broadcastChannel.close();
      supabase.auth.broadcastChannel = null;
    }
  }

  return supabase;
}

export function getSupabase() {
  if (!supabase) {
    throw new Error("Supabase not initialized");
  }

  return supabase;
}
