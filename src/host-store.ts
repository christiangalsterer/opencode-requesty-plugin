import { descendantSessionIDs, rootSessionID } from './descendants'
import type { ProjectionSettings } from './settings'
import { type ActiveSession, createRequestyStore, type RequestyStore } from './state'

export interface RequestyHostStoreOptions {
  apiKey: string
  projection: ProjectionSettings
  createSignal: NonNullable<Parameters<typeof createRequestyStore>[0]['createSignal']>
  getSessionParentID: (sessionID: string) => string | undefined
  getSessionCreatedAt: (sessionID: string) => number | undefined
  fetchSessionChildren: (sessionID: string) => Promise<string[]>
  onError: (message: string) => void
  onRender: () => void
}

export function createRequestyHostStore(options: RequestyHostStoreOptions): RequestyStore {
  const activeSession = (sessionID: string): ActiveSession => {
    const rootID = rootSessionID(sessionID, options.getSessionParentID)
    return { id: rootID, created: options.getSessionCreatedAt(rootID) }
  }

  return createRequestyStore({
    apiKey: options.apiKey,
    projection: options.projection,
    createSignal: options.createSignal,
    activeSession,
    fetchSessionChildren: (sessionID) => descendantSessionIDs(sessionID, options.fetchSessionChildren),
    onError: options.onError,
    onRender: options.onRender
  })
}
