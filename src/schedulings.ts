import { Duration, Schedule } from "effect"

export const softScheduleRetrying = Schedule.intersect(
  Schedule.exponential(Duration.millis(100), 2),
  Schedule.recurs(2),
)

export const hardScheduleRetrying = Schedule.intersect(
  Schedule.exponential(Duration.millis(100), 3),
  Schedule.recurs(4),
)
