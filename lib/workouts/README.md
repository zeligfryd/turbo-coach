# Workouts and Intervals

## Overview

Workouts are structured training sessions composed of intervals. Each interval defines a duration and optional power target(s).

## Database Schema

Workouts are stored in PostgreSQL with intervals as JSONB:

```sql
create table workouts (
  id uuid primary key,
  name text not null,
  category text not null,
  description text,
  tags text[],
  intervals jsonb not null,
  created_at timestamp,
  updated_at timestamp
);
```

## Interval Types

### 1. Constant Power Interval

A steady effort at a single power target.

```json
{
  "name": "Steady State",
  "durationSeconds": 600,
  "intensityPercentStart": 75
}
```

**Visual:** Flat rectangle at the specified intensity.

### 2. Ramp Interval

Power gradually changes from start to end intensity.

```json
{
  "name": "Warmup Ramp",
  "durationSeconds": 600,
  "intensityPercentStart": 50,
  "intensityPercentEnd": 75
}
```

**Visual:** Sloped polygon connecting start and end intensities.

**Multi-Zone Ramps:** When a ramp crosses zone boundaries (55%, 75%, 90%, 105%, 120%, 150%), it's automatically split and colored by zone.

### 3. Free Ride Interval

No power target - rider chooses effort level.

```json
{
  "name": "Free Ride",
  "durationSeconds": 600
}
```

**Visual:** Light pink wavy area at ~50% intensity (for display purposes).

## Power Zones

Intervals are colored by zone based on % FTP:

| Zone | Range | Color | Name |
|------|-------|-------|------|
| Z1 | 0-55% | Gray | Active Recovery |
| Z2 | 56-75% | Green | Endurance |
| Z3 | 76-90% | Orange | Tempo |
| Z4 | 91-105% | Red | Threshold |
| Z5 | 106-120% | Dark Red | VO2 Max |
| Z6 | 121-150% | Darker Red | Anaerobic |
| Z7 | 151%+ | Darkest Red | Neuromuscular |

## Type System

All intervals are validated with Zod schemas at runtime:

```typescript
export const WorkoutIntervalSchema = z.object({
  name: z.string(),
  durationSeconds: z.number().positive(),
  intensityPercentStart: z.number().min(0).optional(),
  intensityPercentEnd: z.number().min(0).optional(),
});
```

**Rules:**
- `intensityPercentStart` required for constant/ramp intervals
- `intensityPercentEnd` optional - presence makes it a ramp
- Both omitted = free ride

## Helper Functions

- `isFreeRideInterval()` - Check if interval is free ride
- `isRampInterval()` - Check if interval is a ramp
- `getIntervalAverageIntensity()` - Get average intensity (handles all types)
- `getIntervalIntensityAtTime()` - Get intensity at specific time (for ramps)
- `calculateZoneTime()` - Calculate time spent in each zone
- `calculateAverageIntensity()` - Calculate workout average intensity

## Chart Rendering

Charts use SVG with three element types:

- **Rectangles** - Constant intervals
- **Polygons** - Ramp intervals (one or multiple for multi-zone)
- **Paths** - Free ride intervals (wavy filled areas)

Rendering is shared between mini preview charts and full detail charts via `calculateChartElements()`.
