// The few colors the inspector uses beyond the host's tokens, each with a dark variant.
import type { Tone } from '../../model/trust';

export const toneText: Record<Tone, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  error: 'text-destructive',
};

export const toneFill: Record<Tone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-destructive',
};

/** A query state's dot. */
export const stateDot: Record<string, string> = {
  success: 'bg-emerald-500',
  error: 'bg-destructive',
  executing: 'bg-sky-500 animate-pulse',
  idle: 'bg-muted-foreground/40',
};
