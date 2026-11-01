// Types for snooze.js, which is copied from switchboard (see
// scripts/sync-shared.mjs). Only what the app uses.

type Snoozable = { status?: string; snoozedUntil?: string | null };

export function projectSnoozed(project: Snoozable, nowMs: number, attention?: boolean): boolean;
export function projectWokeAt(project: Snoozable, nowMs: number): string | null;
export function resolveSnoozePresets(now?: Date): { id: string; label: string; whenLabel: string; snoozedUntil: string }[];
export function snoozeWakeDescription(snoozedUntil: string, now?: Date): string;
