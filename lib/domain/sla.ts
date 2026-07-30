/**
 * When to nudge the approvers — PRD sections VI and VII.
 *
 * The clock counts company working minutes only, so a request filed at 16:30 on
 * Saturday reaches its first hour at 08:30 on Monday instead of at 17:30 that
 * evening. Nobody gets pinged at midnight.
 */

import { addWorkingMinutes, workingMinutesBetween } from "./workhours";

/** Minutes of working time after which each reminder goes out. */
export const SLA_REMINDER_MINUTES = [60, 120] as const;

export type SlaStage = 0 | 1 | 2;

/**
 * How many reminders a still-unclaimed request has earned by `now`:
 * 0 = none yet, 1 = the gentle nudge, 2 = the one that names all four approvers.
 */
export function slaStage(submittedAt: Date, now: Date): SlaStage {
  const elapsed = workingMinutesBetween(submittedAt, now);
  if (elapsed >= SLA_REMINDER_MINUTES[1]) return 2;
  if (elapsed >= SLA_REMINDER_MINUTES[0]) return 1;
  return 0;
}

/** The instant a given reminder becomes due, for display and for tests. */
export function slaDueAt(submittedAt: Date, stage: 1 | 2): Date {
  return addWorkingMinutes(submittedAt, SLA_REMINDER_MINUTES[stage - 1]);
}

/**
 * Whether stage `stage` should be sent now: it is due, and it has not been sent
 * before. Claimed requests stop the clock, so callers filter those out first.
 */
export function isReminderDue(
  submittedAt: Date,
  now: Date,
  remindersSent: number,
): { due: boolean; stage: SlaStage } {
  const stage = slaStage(submittedAt, now);
  return { due: stage > remindersSent, stage };
}

/** A request past its second reminder is what the "Quá hạn" tab lists. */
export function isOverdue(submittedAt: Date, now: Date): boolean {
  return slaStage(submittedAt, now) >= 2;
}
