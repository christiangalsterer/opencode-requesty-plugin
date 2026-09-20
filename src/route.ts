import type { TuiRouteCurrent } from '@opencode-ai/plugin/tui'

/** Extract the session id from the host route; undefined for home/plugin routes. */
export function sessionIDFromRoute(route: TuiRouteCurrent): string | undefined {
  const params = route.name === 'session' ? route.params : undefined
  const sessionID = params?.sessionID
  return typeof sessionID === 'string' && sessionID.length > 0 ? sessionID : undefined
}
