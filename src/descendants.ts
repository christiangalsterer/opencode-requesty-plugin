/** Safety cap so a pathological delegation tree can never stall a refresh. */
export const MAX_DESCENDANTS = 200

/**
 * Walks the delegation tree (task subagents run in child sessions, which can
 * have their own children) and returns every descendant session id. Best-effort:
 * if the children endpoint is missing or fails, only the root is resolved.
 */
export async function descendantSessionIDs(rootID: string, fetchChildren: (sessionID: string) => Promise<string[]>): Promise<string[]> {
  const found: string[] = []
  const seen = new Set<string>([rootID])
  const queue: string[] = [rootID]

  while (queue.length > 0 && found.length < MAX_DESCENDANTS) {
    const parentID = queue.shift()!
    try {
      const children = await fetchChildren(parentID)
      for (const childID of children) {
        if (found.length >= MAX_DESCENDANTS) break
        if (seen.has(childID)) continue
        seen.add(childID)
        found.push(childID)
        queue.push(childID)
      }
    } catch {
      break
    }
  }

  return found
}
