import { createContext, useContext } from 'react';
import type { HouseholdData } from './data';

/** How long an Undo button stays on screen. */
export const UNDO_MS = 7000;

/** A button on a toast, such as Undo. */
export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface AppContextValue {
  data: HouseholdData;
  me: string;
  toast: (message: string, action?: ToastAction) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
