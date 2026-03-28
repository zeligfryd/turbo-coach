import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitOptions = {
  /** Identifier for this limit (e.g. "coach", "pacing") */
  key: string;
  /** Rolling window in seconds (default: 60) */
  windowSeconds?: number;
  /** Max requests per window (default: 20) */
  maxRequests?: number;
};

/**
 * Check a per-user rate limit via the DB `check_rate_limit` RPC.
 * Returns a 429 NextResponse if limited, or null if the request is allowed.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  options: RateLimitOptions
): Promise<NextResponse | null> {
  const { key, windowSeconds = 60, maxRequests = 20 } = options;

  const { data: allowed, error } = await supabase.rpc("check_rate_limit", {
    p_user_id: userId,
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });

  if (error) {
    // Fail open — don't block the request if the rate-limit check itself fails
    console.warn("[RateLimit] check failed:", error.message);
    return null;
  }

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429 }
    );
  }

  return null;
}
