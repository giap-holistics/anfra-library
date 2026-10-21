import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme, initialTheme } from '@/components/theme-toggle';
import { App } from './App';
import './index.css';

// Before the first render, so the page doesn't flash the other theme.
applyTheme(initialTheme());

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
