import type { UIMessage } from "ai";
import { redirect } from "next/navigation";
import {
  getPlan,
  getPlanCoachConversation,
  listArchetypes,
  listPlanAdaptations,
} from "../actions";
import { createClient } from "@/lib/supabase/server";
import { getPlanWorkoutNames } from "../composer-actions";
import { PlanEditorShell } from "@/components/plans/plan-editor-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlanPage({ params }: PageProps) {
  const { id } = await params;
  const [planResult, archetypeResult, adaptationsResult, conversationResult, workoutNames] =
    await Promise.all([
      getPlan(id),
      listArchetypes(),
      listPlanAdaptations(id),
      getPlanCoachConversation(id),
      getPlanWorkoutNames(id),
    ]);

  if (!planResult.success || !planResult.plan) {
    redirect("/plans");
  }

  // The workout preview shows watts, which needs the rider's FTP.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("users").select("ftp").eq("id", user.id).single()
    : { data: null };

  return (
    <PlanEditorShell
      plan={planResult.plan}
      archetypes={archetypeResult.success ? archetypeResult.archetypes : []}
      adaptations={adaptationsResult.success ? adaptationsResult.adaptations : []}
      initialCoachMessages={
        (conversationResult.success ? conversationResult.messages : []) as UIMessage[]
      }
      workoutsById={workoutNames.workouts}
      userFtp={(profile?.ftp as number | null) ?? null}
    />
  );
}
