import type { StructureNode } from '@holistics/anfra-sdk/common';
import { Frame, type LucideIcon, Shapes, SlidersHorizontal, Table2 } from 'lucide-react';

/** Each kind's pill, colored so a glance tells containers, blocks, queries and controls apart. */
export const kindPills: Record<StructureNode['kind'], string> = {
  container: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  block: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300',
  query: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  control: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
};

/** Each kind's icon, shown in its colored badge. */
export const kindIcons: Record<StructureNode['kind'], LucideIcon> = {
  container: Frame,
  block: Shapes,
  query: Table2,
  control: SlidersHorizontal,
};
