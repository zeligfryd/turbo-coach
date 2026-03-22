import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeModelOverrides } from "@/lib/ai/utils";
import { createClient } from "@/lib/supabase/server";
import { extractWorkoutFromDescription } from "@/lib/ai/workout-parser";

const ExtractionRequestSchema = z.object({
  description: z.string().min(1),
  runKey: z.string().optional(),
  modelOverrides: z.unknown().optional(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const payload = ExtractionRequestSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const isDev = process.env.NODE_ENV === "development";
    const modelOverrides = isDev ? sanitizeModelOverrides(payload.data.modelOverrides) : undefined;

    const extracted = await extractWorkoutFromDescription(
      payload.data.description,
      modelOverrides,
    );

    return NextResponse.json(extracted);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
