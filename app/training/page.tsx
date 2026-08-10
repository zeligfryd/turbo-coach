import { TrainingClient } from "@/components/training/training-client";

export default function TrainingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
        <p className="text-sm text-muted-foreground">
          Everything off the bike — what has gone stale, and what to do about it.
        </p>
      </div>
      <TrainingClient />
    </div>
  );
}
