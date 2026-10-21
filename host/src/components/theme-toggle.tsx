import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

type Theme = 'light' | 'dark';

const stored = (): Theme | undefined => {
  try {
    const value = localStorage.getItem('theme');
    return value === 'light' || value === 'dark' ? value : undefined;
  } catch {
    return undefined;
  }
};

/** The theme in use: the reader's choice, once they made one, else light (it matches the Library's paper sidebar). */
export const initialTheme = (): Theme => stored() ?? 'light';

export const applyTheme = (theme: Theme) =>
  document.documentElement.classList.toggle('dark', theme === 'dark');

let current = initialTheme();
const listeners = new Set<() => void>();

const setTheme = (theme: Theme) => {
  current = theme;
  applyTheme(theme);
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The theme in use, and a way to flip it, shared by everything that offers the choice. */
export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, () => current);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Not remembered; it still applies for this page.
    }
    setTheme(next);
  };
  return [theme, toggle];
}

/**
 * Light or dark. Light until the reader picks one, which is remembered in this browser. Only the host's own UI is themed: a Data App draws itself.
 */
export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const label = theme === 'dark' ? 'Switch to light' : 'Switch to dark';
  return (
    <Button variant="ghost" size="icon" className="size-7" onClick={toggle} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  );
}
