import { getFitnessData } from "./actions";
import { FitnessChart } from "@/components/fitness/fitness-chart";

export default async function FitnessPage() {
  const { fitness, dailyLoads } = await getFitnessData();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fitness</h1>
      <FitnessChart fitness={fitness} dailyLoads={dailyLoads} />
    </div>
  );
}
