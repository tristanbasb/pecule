import { useState } from 'react';

/** Petite préférence d'affichage mémorisée dans le navigateur (période, onglet…). */
export function useStoredState<T extends string>(key: string, initial: T, allowed?: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key) as T | null;
      return stored && (!allowed || allowed.includes(stored)) ? stored : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* préférence non mémorisée */
    }
  };
  return [value, set] as const;
}
