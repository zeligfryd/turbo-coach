import { NewPlanForm } from "@/components/plans/new-plan-form";

export default function NewPlanPage() {
  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New training plan</h1>
        <p className="text-sm text-muted-foreground">
          Set the broad strokes. You can flesh out blocks, weeks, and workouts in the editor next.
        </p>
      </div>
      <NewPlanForm />
    </div>
  );
}
