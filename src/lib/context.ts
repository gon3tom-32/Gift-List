import { createContext, useContext } from 'react';
import type { HouseholdData } from './data';

export interface AppContextValue {
  data: HouseholdData;
  me: string;
  toast: (message: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppContext');
  return ctx;
}
