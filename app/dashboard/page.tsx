export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-16 items-center">
      <h1 className="text-3xl lg:text-4xl !leading-tight mx-auto max-w-xl text-center">
        Welcome to Turbo Coach
      </h1>
      <p className="text-muted-foreground text-center max-w-xl">
        Your cycling training companion. Navigate to Workouts to browse the workout library.
      </p>
    </div>
  );
}
