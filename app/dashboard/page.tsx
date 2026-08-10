import { CoverageWidget } from "@/components/training/coverage-widget";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Turbo Coach</h1>
        <p className="text-sm text-muted-foreground">Your cycling training companion.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CoverageWidget />
      </div>
    </div>
  );
}
