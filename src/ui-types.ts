import type { RGBA } from '@opentui/core'
import type { MessageRepaintFields } from './format'

/** Theme colors shared by UI components across OpenCode host versions. */
export interface RequestyTheme {
  text: RGBA
  textMuted: RGBA
  error: RGBA
  warning: RGBA
  success: RGBA
  primary: RGBA
  background: RGBA
}

/** Host session-message access used to trigger reactive widget repaints. */
export interface RequestyWidgetHost {
  readonly sessionMessages: (sessionID: string) => readonly MessageRepaintFields[]
}
