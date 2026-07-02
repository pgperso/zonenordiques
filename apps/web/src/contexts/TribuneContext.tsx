'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface TribuneInfo {
  id: number;
  name: string;
  slug: string;
}

interface TribuneContextValue {
  tribune: TribuneInfo | null;
  setTribune: (info: TribuneInfo | null) => void;
  membersOpen: boolean;
  setMembersOpen: (open: boolean) => void;
  openToolbarMessageId: number | null;
  setOpenToolbarMessageId: (id: number | null) => void;
}

const TribuneContext = createContext<TribuneContextValue>({
  tribune: null,
  setTribune: () => {},
  membersOpen: false,
  setMembersOpen: () => {},
  openToolbarMessageId: null,
  setOpenToolbarMessageId: () => {},
});

export function TribuneProvider({ children }: { children: React.ReactNode }) {
  const [tribune, setTribuneState] = useState<TribuneInfo | null>(null);
  const setTribune = useCallback((info: TribuneInfo | null) => setTribuneState(info), []);

  const [membersOpen, setMembersOpenState] = useState(false);
  const setMembersOpen = useCallback((open: boolean) => setMembersOpenState(open), []);

  const [openToolbarMessageId, setOpenToolbarMessageIdState] = useState<number | null>(null);
  const setOpenToolbarMessageId = useCallback((id: number | null) => setOpenToolbarMessageIdState(id), []);

  return (
    <TribuneContext.Provider value={{ tribune, setTribune, membersOpen, setMembersOpen, openToolbarMessageId, setOpenToolbarMessageId }}>
      {children}
    </TribuneContext.Provider>
  );
}

export function useTribune() {
  return useContext(TribuneContext);
}
