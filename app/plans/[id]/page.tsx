import type { UIMessage } from "ai";
import { redirect } from "next/navigation";
import {
  getPlan,
  getPlanCoachConversation,
  listArchetypes,
  listPlanAdaptations,
} from "../actions";
import { PlanEditorShell } from "@/components/plans/plan-editor-shell";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PlanPage({ params }: PageProps) {
  const { id } = await params;
  const [planResult, archetypeResult, adaptationsResult, conversationResult] =
    await Promise.all([
      getPlan(id),
      listArchetypes(),
      listPlanAdaptations(id),
      getPlanCoachConversation(id),
    ]);

  if (!planResult.success || !planResult.plan) {
    redirect("/plans");
  }

  return (
    <PlanEditorShell
      plan={planResult.plan}
      archetypes={archetypeResult.success ? archetypeResult.archetypes : []}
      adaptations={adaptationsResult.success ? adaptationsResult.adaptations : []}
      initialCoachMessages={
        (conversationResult.success ? conversationResult.messages : []) as UIMessage[]
      }
    />
  );
}
