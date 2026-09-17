/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo, type JSX } from 'solid-js'
import type { TuiPluginApi, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import type { RequestyStore } from './state'
import {
  analyticsUrl,
  formatPercent,
  formatProjectionParts,
  formatTokenInline,
  formatUsd,
  isProjectionOverLimit,
  paceColor,
  severityColor,
  sessionRepaintKey,
  spendRatio,
  spendSeverity,
  type SpendThresholds
} from './format'

export type PromptProps = {
  store: RequestyStore
  api: TuiPluginApi
  sessionID: string
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
  todaySpend: boolean
  dailyAvg: boolean
  avg7d: boolean
  avg30d: boolean
  showTokens: boolean
  showKeyName: boolean
  showSessionInfo: boolean
  monthlyProjection: boolean
}

export function RequestyPromptWidget(props: PromptProps): JSX.Element {
  const segments = createMemo(() => {
    // Read host-tracked reactive state to force slot repaints on message updates.
    // Reading the message *content* (not just length) makes the slot repaint on
    // every message.updated — content mutates in place while the array length
    // stays constant, so a length-only hook would only fire on session start.
    sessionRepaintKey(props.api.state.session.messages(props.sessionID))

    const data = props.store.data()
    const status = props.store.state().status
    const limit = data?.keyInfo.monthly_limit ?? 0
    const spend = data?.keyInfo.monthly_spend ?? 0
    const ratio = spendRatio(spend, limit)
    const name = data?.keyInfo.name ?? ''
    const color = !data || limit <= 0 ? props.theme.textMuted : severityColor(spendSeverity(ratio, props.thresholds), props.theme)
    const projectionParts = formatProjectionParts(spend, limit)
    const projectionOverLimit = isProjectionOverLimit(spend, limit)

    const parts: { text: string; color?: unknown; href?: string }[] = []
    if (data) {
      const metrics: string[] = []
      if (props.showSessionInfo && data.sessionId === props.store.activeSessionID() && data.sessionTotalSpend > 0) {
        let label = `S ${formatUsd(data.sessionTotalSpend)}`
        if (props.showTokens) {
          label += ` ${formatTokenInline(data.sessionTotalTokens.input, data.sessionTotalTokens.output)}`
        }
        metrics.push(label)
      }
      if (props.todaySpend) {
        let label = `T ${formatUsd(data.todaySpend)}`
        if (props.showTokens) {
          label += ` ${formatTokenInline(data.todayTokens.input, data.todayTokens.output)}`
        }
        metrics.push(label)
      }
      if (props.dailyAvg) metrics.push(`D ${formatUsd(data.dailyAverage)}`)
      if (props.avg7d) metrics.push(`7d ${formatUsd(data.avg7d)}`)
      if (props.avg30d) metrics.push(`30d ${formatUsd(data.avg30d)}`)
      if (metrics.length > 0) {
        parts.push({ text: `${metrics.join(' · ')} `, color: props.theme.textMuted })
      }
    }
    if (!data) {
      parts.push({ text: status === 'error' ? 'Requesty !' : 'Requesty …', color: props.theme.textMuted })
    } else {
      const label =
        limit > 0
          ? `${formatUsd(spend)}/${formatUsd(limit)} ${formatPercent(ratio)}${props.showKeyName ? ` (${name})` : ''}`
          : `${formatUsd(spend)}/unlimited${props.showKeyName ? ` (${name})` : ''}`
      parts.push({ text: label, color, href: analyticsUrl(name) })
    }
    if (props.monthlyProjection && projectionParts) {
      const valueColor = projectionOverLimit ? props.theme.error : props.theme.textMuted
      parts.push({ text: ` ~${formatUsd(projectionParts.projected)} EOM`, color: valueColor })
      if (projectionParts.arrow) {
        parts.push({ text: projectionParts.arrow, color: paceColor(projectionParts.pace, props.theme) })
      }
    }
    return { parts, color }
  })

  return (
    <text fg={segments().color}>
      <For each={segments().parts}>
        {(seg) => (
          <Show when={seg.href} fallback={<span style={{ fg: seg.color }}>{seg.text}</span>}>
            <a href={seg.href!} style={{ fg: seg.color }}>
              {seg.text}
            </a>
          </Show>
        )}
      </For>
    </text>
  )
}
