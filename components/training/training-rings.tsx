"use client";

/**
 * Today and the week, as two rings.
 *
 * Segmented rather than a continuous fill: one arc per session, so three
 * sessions is three arcs and finishing one lights one up. A percentage would
 * read as a score, and a smooth sweep would imply a session is partly done
 * when it is a thing you either did or did not.
 *
 * Deliberately not a habit tracker. There is no history, no streak, nothing
 * turns red, and the whole thing is absent on a day with nothing scheduled —
 * so it can be satisfying to fill without ever being something you are failing.
 * The satisfaction is meant to come from the arcs closing, not from a number
 * going up or a run being protected.
 */

import { Check } from "lucide-react";

import type { Goal } from "@/app/training/actions";
import { modalityColor } from "@/lib/training/display";

const SIZE = 104;
const CENTRE = SIZE / 2;

/**
 * Gap between segments, in degrees. Scaled to the count: a fixed 5° looked
 * right for three sessions and ate an eighth of the circle at nine.
 */
function gapFor(total: number): number {
  if (total <= 1) return 0;
  return Math.min(6, (360 / total) * 0.2);
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(radius: number, startDeg: number, endDeg: number): string {
  const start = polar(CENTRE, CENTRE, radius, endDeg);
  const end = polar(CENTRE, CENTRE, radius, startDeg);
  const large = endDeg - startDeg <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} 0 ${end.x} ${end.y}`;
}

function Ring({
  goal,
  radius,
  width,
  color,
  label,
}: {
  goal: Goal;
  radius: number;
  width: number;
  color: string;
  label: string;
}) {
  // Above about a dozen sessions the gaps eat the arcs, so the ring becomes a
  // single sweep rather than a dotted line that reads as noise.
  const segmented = goal.total <= 12;
  const step = 360 / goal.total;

  return (
    <g role="img" aria-label={label}>
      {segmented ? (
        Array.from({ length: goal.total }, (_, index) => {
          const gap = gapFor(goal.total);
          const isDone = index < goal.done;
          return (
            <path
              key={index}
              d={arcPath(radius, index * step + gap / 2, (index + 1) * step - gap / 2)}
              fill="none"
              strokeWidth={width}
              // Butt, not round. A round cap adds half the stroke width at each
              // end — 4px against a gap of about 3.8px — so adjacent segments
              // closed up and nine sessions rendered as one continuous arc.
              strokeLinecap="butt"
              stroke={color}
              // The waiting segments are the same colour, faint. A neutral grey
              // vanished into the card in dark mode, so you could not count
              // what was left — which is the only reason to segment at all.
              strokeOpacity={isDone ? 1 : 0.2}
            />
          );
        })
      ) : (
        <>
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={radius}
            fill="none"
            strokeWidth={width}
            stroke={color}
            strokeOpacity={0.2}
          />
          <path
            d={arcPath(radius, 0, Math.max(0.1, (goal.done / goal.total) * 360))}
            fill="none"
            strokeWidth={width}
            strokeLinecap="round"
            stroke={color}
          />
        </>
      )}
    </g>
  );
}

export function TrainingRings({ today, week }: { today: Goal | null; week: Goal | null }) {
  // Nothing scheduled, nothing to show. Rendering empty rings would invent an
  // expectation, which is exactly what the old coverage line did.
  if (!week) return null;

  const weekColor = modalityColor("bike");
  const todayColor = modalityColor("prehab");
  const todayComplete = today != null && today.done >= today.total;
  const weekComplete = week.done >= week.total;

  return (
    <section className="flex items-center gap-5 rounded-xl border border-border bg-card p-4">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="shrink-0"
        aria-hidden={false}
      >
        <Ring
          goal={week}
          radius={44}
          width={8}
          color={weekColor}
          label={`This week: ${week.done} of ${week.total} done`}
        />
        {today && (
          <Ring
            goal={today}
            radius={30}
            width={8}
            color={todayColor}
            label={`Today: ${today.done} of ${today.total} done`}
          />
        )}
        {/* The centre carries today, because that is the number you can still
            act on. A tick rather than "3 of 3" — once it is done the count is
            not the interesting part. */}
        {today ? (
          todayComplete ? (
            <Check
              x={CENTRE - 9}
              y={CENTRE - 9}
              width={18}
              height={18}
              stroke={todayColor}
              strokeWidth={2.5}
            />
          ) : (
            <text
              x={CENTRE}
              y={CENTRE}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-foreground text-[15px] font-semibold tabular-nums"
            >
              {today.total - today.done}
            </text>
          )
        ) : (
          <text
            x={CENTRE}
            y={CENTRE}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-muted-foreground text-[10px]"
          >
            rest
          </text>
        )}
      </svg>

      <div className="min-w-0 space-y-2.5">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: todayColor }}
              aria-hidden="true"
            />
            Today
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {today ? (
              todayComplete ? (
                "All done"
              ) : (
                <>
                  {today.done} of {today.total}
                </>
              )
            ) : (
              <span className="font-normal text-muted-foreground">Nothing scheduled</span>
            )}
          </p>
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: weekColor }}
              aria-hidden="true"
            />
            This week
          </p>
          <p className="text-sm font-semibold tabular-nums">
            {weekComplete ? (
              "All done"
            ) : (
              <>
                {week.done} of {week.total}
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
