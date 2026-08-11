import { TrainingClient } from "@/components/training/training-client";

/**
 * The off-bike library and its settings.
 *
 * Deliberately out of the main navigation: routines, exercises, target
 * intervals and templates are things you configure occasionally, not things
 * you visit daily. What used to open here — a three-step setup wizard standing
 * between you and the feature — is gone; nothing needs configuring before the
 * app is useful.
 */
export default function TrainingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Off-bike library</h1>
        <p className="text-sm text-muted-foreground">
          Routines, exercises and how often each area should come round.
        </p>
      </div>
      <TrainingClient />
    </div>
  );
}
