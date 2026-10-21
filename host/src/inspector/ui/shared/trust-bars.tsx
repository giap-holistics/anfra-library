import { cn } from '@/lib/utils';
import { LEVELS, type Trust } from '../../model/trust';
import { toneFill } from './tone';

/** The trust meter: one rising bar per level, filled up to the one reached. */
export function TrustBars({ trust, size = 'md' }: { trust: Trust; size?: 'sm' | 'md' | 'lg' }) {
  const [base, rise] = size === 'sm' ? [4, 8] : size === 'lg' ? [20, 28] : [12, 16];
  return (
    <span
      className={cn('flex items-end', size === 'sm' ? 'gap-px' : size === 'lg' ? 'gap-1' : 'gap-0.5')}
      aria-hidden
    >
      {LEVELS.map((level) => (
        <span
          key={level}
          style={{ height: `${base + ((level - 1) * rise) / (LEVELS.length - 1)}px` }}
          className={cn(
            'rounded-sm',
            size === 'sm' ? 'w-[3px]' : size === 'lg' ? 'w-3' : 'w-2',
            // Small bars sit on a row's hover color, which hides bg-muted.
            level <= trust.level
              ? toneFill[trust.tone]
              : size === 'md'
                ? 'bg-muted'
                : 'bg-muted-foreground/25',
          )}
        />
      ))}
    </span>
  );
}
