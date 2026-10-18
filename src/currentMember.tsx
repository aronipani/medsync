// The person being looked after right now. Picking a person on any screen (Today, Scan, History, Stock, Buy)
// carries over to every other screen for the rest of the session, so scans don't drift back to the first person.
// Kept in memory only: a fresh start of the app begins again with no one chosen.
import React, { createContext, useContext, useMemo, useState } from 'react';
import { useStore } from './store.tsx';

type Pair = [string | undefined, (id: string | undefined) => void];
const Ctx = createContext<Pair | null>(null);

export function CurrentMemberProvider({ children }: { children: React.ReactNode }) {
  const [id, setId] = useState<string | undefined>();
  const pair = useMemo<Pair>(() => [id, setId], [id]);
  return <Ctx.Provider value={pair}>{children}</Ctx.Provider>;
}

/** The chosen person (undefined: everyone / nobody chosen yet) and a setter shared by all screens. */
export function useCurrentMember(): Pair {
  const pair = useContext(Ctx);
  const { state } = useStore();
  if (!pair) throw new Error('useCurrentMember outside CurrentMemberProvider');
  const [id, set] = pair;
  // A person who was removed is no longer chosen.
  return [id && state.members.some((m) => m.id === id) ? id : undefined, set];
}
