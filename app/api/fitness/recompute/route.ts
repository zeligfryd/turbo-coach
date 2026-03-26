import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeFitness } from "@/lib/fitness/compute";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const result = await recomputeFitness(supabase, user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, daysComputed: result.daysComputed },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      daysComputed: result.daysComputed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
