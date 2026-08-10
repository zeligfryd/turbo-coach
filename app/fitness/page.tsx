import { getFitnessData } from "./actions";
import { getWeeklySessionLoad } from "@/app/training/actions";
import { FitnessChart } from "@/components/fitness/fitness-chart";
import { SessionLoadChart } from "@/components/training/session-load-chart";

export default async function FitnessPage() {
  const [{ fitness, dailyLoads }, sessionLoad] = await Promise.all([
    getFitnessData(),
    getWeeklySessionLoad(12),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Fitness</h1>
      <FitnessChart fitness={fitness} dailyLoads={dailyLoads} />
      {sessionLoad.success && <SessionLoadChart weeks={sessionLoad.data} />}
    </div>
  );
}
