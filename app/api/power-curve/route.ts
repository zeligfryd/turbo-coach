import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputePowerCurve } from "@/lib/power/aggregate";
import type { PowerCurvePoint, PowerProfile } from "@/lib/power/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check cache
    const { data: cache, error: cacheError } = await supabase
      .from("power_curve_cache")
      .select("all_time, last_42d, profile, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (cache && !cacheError && !forceRefresh) {
      const allTime = (cache as any).all_time as PowerCurvePoint[];
      const last42d = (cache as any).last_42d as PowerCurvePoint[];
      const profile = (cache as any).profile as PowerProfile | null;

      // Check freshness — recompute in background if older than 1 hour
      const age = Date.now() - new Date((cache as any).updated_at).getTime();
      if (age > 3600_000) {
        recomputePowerCurve(supabase, user.id).catch(console.warn);
      }

      return NextResponse.json({ allTime, last42d, profile });
    }

    if (forceRefresh) {
      // Delete old cache so we know if recompute succeeded
      await supabase.from("power_curve_cache").delete().eq("user_id", user.id);
      await recomputePowerCurve(supabase, user.id);
      const { data: fresh } = await supabase
        .from("power_curve_cache")
        .select("all_time, last_42d, profile")
        .eq("user_id", user.id)
        .maybeSingle();
      if (fresh) {
        return NextResponse.json({
          allTime: (fresh as any).all_time as PowerCurvePoint[],
          last42d: (fresh as any).last_42d as PowerCurvePoint[],
          profile: (fresh as any).profile as PowerProfile | null,
        });
      }
      // Recompute failed — fall through to no-cache path
    }

    // No cache — check if we have an ICU connection (required for power curves)
    const { data: conn } = await supabase
      .from("icu_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!conn) {
      return NextResponse.json({
        allTime: [],
        last42d: [],
        profile: null,
        needsMoreData: true,
        activityCount: 0,
        message: "Connect intervals.icu in your profile to enable power curve analysis.",
      });
    }

    // Count activities with power data
    const { count } = await supabase
      .from("icu_activities")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("avg_power", "is", null)
      .gt("avg_power", 0);

    if (!count || count < 5) {
      return NextResponse.json({
        allTime: [],
        last42d: [],
        profile: null,
        needsMoreData: true,
        activityCount: count ?? 0,
      });
    }

    // Trigger initial computation — runs in background, client will poll
    recomputePowerCurve(supabase, user.id).catch((err) => {
      console.error("[PowerCurve API] Background computation failed:", err);
    });

    return NextResponse.json({
      allTime: [],
      last42d: [],
      profile: null,
      computing: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[PowerCurve API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
