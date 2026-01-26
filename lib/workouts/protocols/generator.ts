import type { BuilderItem, WorkoutInterval } from "../types";
import type {
  WorkoutProtocol,
  UserParameters,
  ProtocolStructure,
  MainWorkStructure,
} from "./types";
import { replaceTemplateVariables } from "./types";

/**
 * Generate BuilderItem array from a workout protocol with user parameters
 */
export function generateFromProtocol(
  protocol: WorkoutProtocol,
  userParams: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const structure = protocol.structure;

  // Add warmup if present
  if (structure.warmup) {
    const warmupInterval: WorkoutInterval = {
      durationSeconds: structure.warmup.duration_seconds,
      intensityPercentStart: structure.warmup.start,
      intensityPercentEnd: structure.warmup.end,
    };
    items.push({ type: "interval", data: warmupInterval });
  }

  // Add main work
  const mainWorkItems = generateMainWork(structure.main_work, userParams);
  items.push(...mainWorkItems);

  // Add cooldown if present
  if (structure.cooldown) {
    const cooldownInterval: WorkoutInterval = {
      durationSeconds: structure.cooldown.duration_seconds,
      intensityPercentStart: structure.cooldown.start,
      intensityPercentEnd: structure.cooldown.end,
    };
    items.push({ type: "interval", data: cooldownInterval });
  }

  return items;
}

/**
 * Generate main work BuilderItems based on structure type
 */
function generateMainWork(
  mainWork: MainWorkStructure,
  params: UserParameters
): BuilderItem[] {
  switch (mainWork.type) {
    case "repeating_intervals":
      return generateRepeatingIntervals(mainWork, params);
    case "repeating_steady":
      return generateRepeatingSteady(mainWork, params);
    case "steady_block":
      return generateSteadyBlock(mainWork, params);
    case "over_under":
      return generateOverUnder(mainWork, params);
    case "pyramid":
      return generatePyramid(mainWork, params);
    case "sprint_intervals":
      return generateSprintIntervals(mainWork, params);
    default:
      throw new Error(`Unknown main work type: ${(mainWork as any).type}`);
  }
}

/**
 * Generate repeating intervals (e.g., 30/30)
 */
function generateRepeatingIntervals(
  structure: Extract<MainWorkStructure, { type: "repeating_intervals" }>,
  params: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const sets = replaceTemplateVariables(structure.sets, params);
  const repsPerSet = replaceTemplateVariables(structure.reps_per_set, params);

  for (let set = 0; set < sets; set++) {
    const repeatIntervals: WorkoutInterval[] = [];

    // Add the pattern once (the repeat group count handles repetitions)
    for (const segment of structure.pattern) {
      const interval: WorkoutInterval = {
        durationSeconds: replaceTemplateVariables(
          segment.duration_seconds,
          params
        ),
        intensityPercentStart: segment.intensity_percent,
      };
      repeatIntervals.push(interval);
    }

    // Wrap in repeat group
    items.push({
      type: "repeat",
      data: {
        count: repsPerSet,
        intervals: repeatIntervals,
      },
    });

    // Add rest between sets if not last set
    if (set < sets - 1 && structure.rest_between_sets > 0) {
      const restInterval: WorkoutInterval = {
        durationSeconds: structure.rest_between_sets,
        intensityPercentStart: 50, // Easy recovery
      };
      items.push({ type: "interval", data: restInterval });
    }
  }

  return items;
}

/**
 * Generate repeating steady intervals (e.g., 2x20)
 */
function generateRepeatingSteady(
  structure: Extract<MainWorkStructure, { type: "repeating_steady" }>,
  params: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const count = replaceTemplateVariables(structure.count, params);

  for (let i = 0; i < count; i++) {
    // Work interval
    const workInterval: WorkoutInterval = {
      durationSeconds: replaceTemplateVariables(
        structure.work.duration_seconds,
        params
      ),
      intensityPercentStart: structure.work.intensity_percent,
    };
    items.push({ type: "interval", data: workInterval });

    // Rest interval (if not last)
    if (i < count - 1) {
      const restInterval: WorkoutInterval = {
        durationSeconds: replaceTemplateVariables(
          structure.rest.duration_seconds,
          params
        ),
        intensityPercentStart: structure.rest.intensity_percent,
      };
      items.push({ type: "interval", data: restInterval });
    }
  }

  return items;
}

/**
 * Generate steady block (e.g., tempo, endurance)
 */
function generateSteadyBlock(
  structure: Extract<MainWorkStructure, { type: "steady_block" }>,
  params: UserParameters
): BuilderItem[] {
  const interval: WorkoutInterval = {
    durationSeconds: replaceTemplateVariables(
      structure.duration_seconds,
      params
    ),
    intensityPercentStart: structure.intensity_percent,
  };
  return [{ type: "interval", data: interval }];
}

/**
 * Generate over-under intervals
 */
function generateOverUnder(
  structure: Extract<MainWorkStructure, { type: "over_under" }>,
  params: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const sets = replaceTemplateVariables(structure.sets, params);
  const repsPerSet = replaceTemplateVariables(structure.reps_per_set, params);

  for (let set = 0; set < sets; set++) {
    const repeatIntervals: WorkoutInterval[] = [];

    // Add the pattern once (the repeat group count handles repetitions)
    for (const segment of structure.pattern) {
      const interval: WorkoutInterval = {
        durationSeconds: segment.duration_seconds,
        intensityPercentStart: segment.intensity_percent,
      };
      repeatIntervals.push(interval);
    }

    // Wrap in repeat group
    items.push({
      type: "repeat",
      data: {
        count: repsPerSet,
        intervals: repeatIntervals,
      },
    });

    // Add rest between sets if not last set
    if (set < sets - 1 && structure.rest_between_sets > 0) {
      const restInterval: WorkoutInterval = {
        durationSeconds: structure.rest_between_sets,
        intensityPercentStart: 50,
      };
      items.push({ type: "interval", data: restInterval });
    }
  }

  return items;
}

/**
 * Generate pyramid intervals
 */
function generatePyramid(
  structure: Extract<MainWorkStructure, { type: "pyramid" }>,
  params: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const sets = replaceTemplateVariables(structure.sets, params);

  for (let set = 0; set < sets; set++) {
    const repeatIntervals: WorkoutInterval[] = [];

    // Add all pyramid steps
    for (let i = 0; i < structure.steps.length; i++) {
      const step = structure.steps[i];
      const interval: WorkoutInterval = {
        durationSeconds: replaceTemplateVariables(step.duration_seconds, params),
        intensityPercentStart: step.intensity_percent,
      };
      repeatIntervals.push(interval);

      // Add rest between steps (if not last step)
      if (i < structure.steps.length - 1) {
        const restInterval: WorkoutInterval = {
          durationSeconds: structure.rest_duration,
          intensityPercentStart: 50,
        };
        repeatIntervals.push(restInterval);
      }
    }

    // Wrap in repeat group (even if only 1 set, for consistency)
    items.push({
      type: "repeat",
      data: {
        count: 1,
        intervals: repeatIntervals,
      },
    });

    // Add rest between sets if not last set
    if (set < sets - 1) {
      const restInterval: WorkoutInterval = {
        durationSeconds: structure.rest_duration * 2, // Longer rest between pyramid sets
        intensityPercentStart: 50,
      };
      items.push({ type: "interval", data: restInterval });
    }
  }

  return items;
}

/**
 * Generate sprint intervals
 */
function generateSprintIntervals(
  structure: Extract<MainWorkStructure, { type: "sprint_intervals" }>,
  params: UserParameters
): BuilderItem[] {
  const items: BuilderItem[] = [];
  const sets = replaceTemplateVariables(structure.sets, params);
  const repsPerSet = replaceTemplateVariables(structure.reps_per_set, params);

  for (let set = 0; set < sets; set++) {
    const repeatIntervals: WorkoutInterval[] = [];

    // Add the pattern once (the repeat group count handles repetitions)
    for (const segment of structure.pattern) {
      const interval: WorkoutInterval = {
        durationSeconds: replaceTemplateVariables(
          segment.duration_seconds,
          params
        ),
        intensityPercentStart: segment.intensity_percent,
      };
      repeatIntervals.push(interval);
    }

    // Wrap in repeat group
    items.push({
      type: "repeat",
      data: {
        count: repsPerSet,
        intervals: repeatIntervals,
      },
    });

    // Add rest between sets if not last set
    if (set < sets - 1 && structure.rest_between_sets > 0) {
      const restInterval: WorkoutInterval = {
        durationSeconds: structure.rest_between_sets,
        intensityPercentStart: 50,
      };
      items.push({ type: "interval", data: restInterval });
    }
  }

  return items;
}

/**
 * Calculate total duration for a protocol with given parameters
 */
export function calculateProtocolDuration(
  protocol: WorkoutProtocol,
  userParams: UserParameters
): number {
  const items = generateFromProtocol(protocol, userParams);
  return calculateItemsDuration(items);
}

/**
 * Calculate total duration for BuilderItem array
 */
function calculateItemsDuration(items: BuilderItem[]): number {
  let total = 0;
  for (const item of items) {
    if (item.type === "interval") {
      total += item.data.durationSeconds;
    } else {
      // For repeat groups, sum all intervals and multiply by count
      const groupDuration = item.data.intervals.reduce(
        (sum, interval) => sum + interval.durationSeconds,
        0
      );
      total += item.data.count * groupDuration;
    }
  }
  return total;
}

/**
 * Get parameter defaults from protocol
 */
export function getParameterDefaults(
  protocol: WorkoutProtocol
): UserParameters {
  const defaults: UserParameters = {};
  for (const param of protocol.parameters) {
    defaults[param.id] = param.default;
  }
  return defaults;
}

/**
 * Validate user parameters against protocol parameter definitions
 */
export function validateUserParameters(
  protocol: WorkoutProtocol,
  userParams: UserParameters
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const param of protocol.parameters) {
    const value = userParams[param.id];

    if (value === undefined) {
      errors.push(`Missing required parameter: ${param.label}`);
      continue;
    }

    if (typeof value !== "number") {
      errors.push(`Parameter ${param.label} must be a number`);
      continue;
    }

    if (param.min !== undefined && value < param.min) {
      errors.push(`${param.label} must be at least ${param.min}`);
    }

    if (param.max !== undefined && value > param.max) {
      errors.push(`${param.label} must be at most ${param.max}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
