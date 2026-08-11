import { getFitnessData } from "./actions";
import { getWeeklySessionLoad } from "@/app/training/actions";
import { FitnessChart } from "@/components/fitness/fitness-chart";
import { SessionLoadChart } from "@/components/training/session-load-chart";

/**
 * Trends — the voluntary depth.
 *
 * Everything here is a level-2 or level-3 view: reached when you want to know
 * why a number says what it says, never required to use the app. The two
 * charts stay separate because they are separate units — CTL/ATL/TSB is bike
 * TSS from power, session load is sRPE x minutes across everything, and one
 * pair of axes would corrupt both.
 */
export default async function TrendsPage() {
  const [{ fitness, dailyLoads }, sessionLoad] = await Promise.all([
    getFitnessData(),
    getWeeklySessionLoad(12),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Trends</h1>
        <p className="text-sm text-muted-foreground">
          Fitness, fatigue and form from riding, and total load across everything.
        </p>
      </div>
      <FitnessChart fitness={fitness} dailyLoads={dailyLoads} />
      {sessionLoad.success && <SessionLoadChart weeks={sessionLoad.data} />}
    </div>
  );
}
