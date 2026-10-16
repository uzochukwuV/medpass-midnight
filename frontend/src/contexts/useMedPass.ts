import { useContext } from 'react';
import { MedPassContext } from './MedPassProvider';

export function useMedPass() {
  const ctx = useContext(MedPassContext);
  if (!ctx) throw new Error('useMedPass must be used inside <MedPassProvider>');
  return ctx;
}
