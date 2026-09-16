/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo, createSignal, type JSX } from 'solid-js'
import type { TuiPluginApi, TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import type { RequestyStore } from './state'
import {
  formatLimit,
  formatPercent,
  formatProjectionParts,
  formatTokenBreakdown,
  formatTokenInline,
  formatTokens,
  formatUsd,
  analyticsUrl,
  isProjectionOverLimit,
  padEnd,
  padStart,
  paceColor,
  renderBar,
  shortModel,
  spendRatio,
  spendSeverity,
  severityColor,
  sessionRepaintKey,
  type SpendThresholds
} from './format'

export type WidgetProps = {
  store: RequestyStore
  api: TuiPluginApi
  sessionID: string
  theme: TuiThemeCurrent
  /** Max number of models listed in the compact sidebar view. */
  maxModels: number
  /** Budget usage thresholds for bar coloring. */
  thresholds: SpendThresholds
  /** Show input/output token breakdown alongside spend in the averages block. */
  showTokens: boolean
  /** Show the API key nickname. */
  showKeyName: boolean
  /** Show the per-session cost collapsible section. */
  showSessionInfo: boolean
}

export type PromptIndicatorProps = {
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

export function RequestySidebarWidget(props: WidgetProps): JSX.Element {
  const theme = () => props.theme
  const snapshot = createMemo(() => ({
    // Read host-tracked state to force sidebar slot repaints on session/message updates.
    // Reading the message *content* (not just length) makes the slot repaint on
    // every message.updated — content mutates in place while the array length
    // stays constant, so a length-only hook would only fire on session start.
    data: props.store.data(),
    repaintKey: sessionRepaintKey(props.api.state.session.messages(props.sessionID))
  }))
  const snapshotProps = (stale?: boolean) => ({
    store: props.store,
    theme: theme(),
    maxModels: props.maxModels,
    thresholds: props.thresholds,
    showTokens: props.showTokens,
    showSessionInfo: props.showSessionInfo,
    stale
  })

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().text}>
        <Show when={snapshot().data} fallback={<strong>Requesty</strong>}>
          <a href={analyticsUrl(snapshot().data!.keyInfo.name)}>
            <strong>Requesty{props.showKeyName ? ` (${snapshot().data!.keyInfo.name})` : ''}</strong>
          </a>
        </Show>
      </text>
      <box flexDirection="column" paddingTop={1}>
        <Show
          when={props.store.state().status !== 'error'}
          fallback={
            <box flexDirection="column">
              <text fg={theme().error}>Requesty: {props.store.errorMessage() ?? ''}</text>
              <Show when={snapshot().data}>
                <Snapshot {...snapshotProps(true)} />
              </Show>
            </box>
          }
        >
          <Show
            when={snapshot().data}
            fallback={
              <text fg={theme().textMuted}>
                {props.store.state().status === 'loading' ? 'Loading Requesty usage…' : 'Requesty: waiting for first refresh…'}
              </text>
            }
          >
            <Snapshot {...snapshotProps()} />
          </Show>
        </Show>
      </box>
    </box>
  )
}

type SnapshotProps = {
  store: RequestyStore
  theme: TuiThemeCurrent
  maxModels: number
  thresholds: SpendThresholds
  showTokens: boolean
  showSessionInfo: boolean
  stale?: boolean
}

function Snapshot(props: SnapshotProps): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const severity = () => spendSeverity(ratio(), props.thresholds)
  const barColor = () => severityColor(severity(), props.theme)
  const models = () => data().models.slice(0, props.maxModels)
  const projectionParts = () => formatProjectionParts(spend(), limit())
  const projectionOverLimit = () => isProjectionOverLimit(spend(), limit())
  const spendRows = () => [
    { label: 'Today', spend: data().todaySpend, tokens: data().todayTokens },
    { label: 'Daily avg', spend: data().dailyAverage, tokens: data().dailyAverageTokens },
    { label: '7d avg', spend: data().avg7d, tokens: data().avg7dTokens },
    { label: '30d avg', spend: data().avg30d, tokens: data().avg30dTokens }
  ]
  const [expanded, setExpanded] = createSignal(true)
  const [sessionExpanded, setSessionExpanded] = createSignal(true)
  const activeSessionId = () => props.store.activeSessionID()
  const sessionLoaded = () => activeSessionId() !== undefined && data().sessionId === activeSessionId()

  return (
    <box flexDirection="column">
      <box flexDirection="column" paddingRight={1}>
        <Show when={limit() > 0}>
          <box flexDirection="row" justifyContent="space-between" alignItems="center">
            <text fg={barColor()}>{renderBar(ratio(), 24)}</text>
            <text fg={barColor()}>{formatPercent(ratio())}</text>
          </box>
        </Show>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={props.theme.textMuted}>
            {formatUsd(spend())} / {formatLimit(limit())}
          </text>
          <Show when={projectionParts() || props.stale}>
            <box flexDirection="row">
              <Show when={projectionParts()}>
                <text fg={projectionOverLimit() ? props.theme.error : props.theme.textMuted}>
                  ~{formatUsd(projectionParts()!.projected)} EOM{' '}
                  <Show when={projectionParts()!.arrow}>
                    <span style={{ fg: paceColor(projectionParts()!.pace, props.theme) }}>{projectionParts()!.arrow}</span>
                  </Show>
                </text>
              </Show>
              <Show when={props.stale}>
                <text fg={props.theme.textMuted}> (stale)</text>
              </Show>
            </box>
          </Show>
        </box>
        <Show
          when={props.showTokens}
          fallback={
            <box flexDirection="column" gap={0}>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={props.theme.textMuted}>Today {formatUsd(data().todaySpend)}</text>
                <text fg={props.theme.textMuted}>7d {formatUsd(data().avg7d)}</text>
              </box>
              <box flexDirection="row" justifyContent="space-between">
                <text fg={props.theme.textMuted}>Daily {formatUsd(data().dailyAverage)}</text>
                <text fg={props.theme.textMuted}>30d {formatUsd(data().avg30d)}</text>
              </box>
            </box>
          }
        >
          <box flexDirection="column" gap={0}>
            <For each={spendRows()}>
              {(row) => (
                <box flexDirection="row" justifyContent="space-between">
                  <text fg={props.theme.textMuted}>
                    {padEnd(row.label, 9)} {padStart(formatUsd(row.spend), 10)}
                  </text>
                  <text fg={props.theme.textMuted}>{formatTokenInline(row.tokens.input, row.tokens.output)}</text>
                </box>
              )}
            </For>
          </box>
        </Show>
      </box>
      <text> </text>
      <Show when={props.showSessionInfo && activeSessionId()}>
        <box
          flexDirection="row"
          gap={1}
          // @ts-expect-error selectable is a runtime Renderable property not yet in BoxProps
          selectable={true}
          onMouseDown={() => setSessionExpanded((e) => !e)}
        >
          <text fg={props.theme.text}>
            <strong>{sessionExpanded() ? '▼' : '▶'} Session</strong>
            <Show when={data().subagentCount > 0}>
              {' '}
              <span style={{ fg: props.theme.textMuted }}>
                · {data().subagentCount} subagent{data().subagentCount === 1 ? '' : 's'}
              </span>
            </Show>
          </text>
        </box>
        <Show when={sessionExpanded()}>
          <Show when={sessionLoaded()} fallback={<text fg={props.theme.textMuted}> Session cost loading…</text>}>
            <box flexDirection="column">
              <text fg={props.theme.text}>
                {padEnd('Today', 27)}
                {padStart(formatUsd(data().sessionTodaySpend), 8)}
              </text>
              <text fg={props.theme.textMuted}>
                {'  '}
                {formatTokens(data().sessionTodayRequests)} reqs{' '}
                {formatTokenBreakdown(data().sessionTodayTokens.input, data().sessionTodayTokens.output)}
              </text>
              <text fg={props.theme.text}>
                {padEnd(`Since ${data().sessionStartLabel ?? '…'}`, 27)}
                {padStart(formatUsd(data().sessionTotalSpend), 8)}
              </text>
              <text fg={props.theme.textMuted}>
                {'  '}
                {formatTokens(data().sessionTotalRequests)} reqs{' '}
                {formatTokenBreakdown(data().sessionTotalTokens.input, data().sessionTotalTokens.output)}
              </text>
            </box>
          </Show>
        </Show>
        <text> </text>
      </Show>
      <Show when={models().length > 0}>
        <box
          flexDirection="row"
          gap={1}
          // @ts-expect-error selectable is a runtime Renderable property not yet in BoxProps
          selectable={true}
          onMouseDown={() => setExpanded((e) => !e)}
        >
          <text fg={props.theme.text}>
            <strong>{expanded() ? '▼' : '▶'} Top Models (Current Month)</strong>
          </text>
        </box>
        <Show when={expanded()}>
          <For each={models()}>
            {(model) => (
              <box flexDirection="column">
                <text fg={props.theme.text}>
                  {padEnd(shortModel(model.model, 26), 27)}
                  {padStart(formatUsd(model.spend), 8)}
                </text>
                <text fg={props.theme.textMuted}>
                  {'  '}
                  {formatTokens(model.totalTokens)} {formatTokenBreakdown(model.inputTokens, model.outputTokens)}
                </text>
              </box>
            )}
          </For>
        </Show>
      </Show>
      <Show when={models().length === 0}>
        <text fg={props.theme.textMuted}>No usage this month yet.</text>
      </Show>
    </box>
  )
}

export function RequestyPromptIndicator(props: PromptIndicatorProps): JSX.Element {
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
