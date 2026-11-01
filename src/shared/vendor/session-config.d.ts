// Types for session-config.js, which is copied from switchboard (see
// scripts/sync-shared.mjs). Only what the app uses.

export type Choice = { value: string | null; label: string; desc?: string };

export type Field = {
  key: string;
  label?: string;
  type: 'permission' | 'select' | 'boolean' | 'text' | 'textarea';
  default: unknown;
  choices?: Choice[];
  more?: boolean;
  hidden?: boolean;
  placeholder?: string;
  description?: string;
  suggestions?: string[];
};

export const FIELDS: Record<string, Field[]>;
export function fieldsFor(runtime: string): Field[];
export function fieldsBehindMore(runtime: string, values?: Record<string, unknown>): string[];
export function own(object: object | null | undefined, key: string): boolean;
