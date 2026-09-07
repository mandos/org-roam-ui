import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { createEmacsClient, EmacsClient } from "@/emacs/client";
import { createEmacsTransport } from "@/emacs/transport";

const EMACS_WS_URL = 'ws://localhost:35904'

const EmacsContext = createContext<EmacsClient | undefined>(undefined)

export function EmacsProvider({ children }: { children: React.ReactNode }) {
  const transportRef = useRef<ReturnType<typeof createEmacsTransport> | null>(null)
  if (transportRef.current === null) {
    transportRef.current = createEmacsTransport(EMACS_WS_URL)
  }

  const clientRef = useRef<ReturnType<typeof createEmacsClient> | null>(null)
  if (clientRef.current === null) {
    clientRef.current = createEmacsClient(transportRef.current)
  }

  useEffect(() => {
    transportRef.current?.open()

    return () => {
      transportRef.current?.close()
    }
  }, [])

  const value = useMemo<EmacsClient>(() => (clientRef.current!), [])

  return <EmacsContext.Provider value={value}>{children}</EmacsContext.Provider>
}

export function useEmacs(): EmacsClient {
  const ctx = useContext(EmacsContext)
  if (ctx === undefined) {
    throw new Error('useEmacs must be used within an EmacsProvider')
  }
  return ctx
}
