/** Safety cap so a pathological delegation tree can never stall a refresh. */
export const MAX_DESCENDANTS = 200

/** Safety cap for the upward root walk, guarding against a cyclic parent chain. */
const MAX_DEPTH = 100

/**
 * Walks the delegation tree upward via `parentID` and returns the topmost
 * (root) session id. Returns the input id when no parent is known. Cycle-safe:
 * a repeated id stops the walk.
 */
export function rootSessionID(sessionID: string, getParent: (sessionID: string) => string | undefined): string {
  let current = sessionID
  const seen = new Set<string>([current])
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const parent = getParent(current)
    if (!parent || seen.has(parent)) {
      break
    }
    seen.add(parent)
    current = parent
  }
  return current
}

/**
 * Walks the delegation tree (task subagents run in child sessions, which can
 * have their own children) and returns every descendant session id. Best-effort:
 * if the children endpoint is missing or fails, only the root is resolved.
 */
export async function descendantSessionIDs(rootID: string, fetchChildren: (sessionID: string) => Promise<string[]>): Promise<string[]> {
  const found: string[] = []
  const seen = new Set<string>([rootID])

  function visit(parents: string[]): Promise<void> {
    if (parents.length === 0 || found.length >= MAX_DESCENDANTS) {
      return Promise.resolve()
    }

    return Promise.all(parents.map((parentID) => fetchChildren(parentID).catch(() => undefined))).then((childLists) => {
      const nextParents: string[] = []
      for (const children of childLists) {
        if (!children) {
          break
        }
        for (const childID of children) {
          if (found.length >= MAX_DESCENDANTS) {
            break
          }
          if (seen.has(childID)) {
            continue
          }
          seen.add(childID)
          found.push(childID)
          nextParents.push(childID)
        }
      }
      return visit(nextParents)
    })
  }

  await visit([rootID])

  return found
}
