/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo, createSignal, type JSX } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { formatLimit, formatPercent, formatProjectionParts, formatTokenBreakdown, formatTokenInline, formatTokens, formatUsd, analyticsUrl, isProjectionOverLimit, padEnd, padStart, renderBar, shortModel, spendRatio, spendSeverity, severityColor, type Pace, type SpendThresholds } from "./format"

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
  monthlyProjection: boolean
}

function paceColor(pace: Pace | undefined, theme: TuiThemeCurrent) {
  if (pace === "over") return theme.error
  if (pace === "under") return theme.success
  return theme.textMuted
}

export function RequestySidebarWidget(props: WidgetProps): JSX.Element {
  const theme = () => props.theme
  const snapshot = createMemo(() => ({
    // Read host-tracked state to force sidebar slot repaints on session/message updates.
    data: props.store.data(),
    messagesLength: props.api.state.session.messages(props.sessionID).length,
    version: props.store.version(),
  }))

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().text}>
        <Show
          when={snapshot().data}
          fallback={<strong>Requesty</strong>}
        >
          <a href={analyticsUrl(snapshot().data!.keyInfo.name)}>
            <strong>Requesty{props.showKeyName ? ` (${snapshot().data!.keyInfo.name})` : ""}</strong>
          </a>
        </Show>
      </text>
      <box flexDirection="column" paddingTop={1}>
        <Show
          when={props.store.state().status !== "error"}
          fallback={
            <box flexDirection="column">
              <text fg={theme().error}>Requesty: {props.store.state().status === "error" ? (props.store.state() as { message: string }).message : ""}</text>
              <Show when={snapshot().data}>
                <Snapshot store={props.store} theme={theme()} maxModels={props.maxModels} thresholds={props.thresholds} showTokens={props.showTokens} stale />
              </Show>
            </box>
          }
        >
          <Show
            when={snapshot().data}
            fallback={
              <text fg={theme().textMuted}>
                {props.store.state().status === "loading" ? "Loading Requesty usage…" : "Requesty: waiting for first refresh…"}
              </text>
            }
          >
            <Snapshot store={props.store} theme={theme()} maxModels={props.maxModels} thresholds={props.thresholds} showTokens={props.showTokens} />
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
  stale?: boolean
}

function Snapshot(props: SnapshotProps): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const models = () => data().models.slice(0, props.maxModels)
  const projectionParts = () => formatProjectionParts(spend(), limit())
  const projectionOverLimit = () => isProjectionOverLimit(spend(), limit())
  const [expanded, setExpanded] = createSignal(true)

  return (
    <box flexDirection="column">
      <box flexDirection="column" paddingRight={1}>
        <Show when={limit() > 0}>
          <box flexDirection="row" justifyContent="space-between" alignItems="center">
            <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
              {renderBar(ratio(), 24)}
            </text>
            <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
              {formatPercent(ratio())}
            </text>
          </box>
        </Show>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={props.theme.textMuted}>{formatUsd(spend())} / {formatLimit(limit())}</text>
          <Show when={projectionParts() || props.stale}>
            <box flexDirection="row">
              <Show when={projectionParts()}>
                <text fg={projectionOverLimit() ? props.theme.error : props.theme.textMuted}>
                  ~{formatUsd(projectionParts()!.projected)} EOM{" "}
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
                <text fg={props.theme.textMuted}>Daily {formatUsd(data().dailyAvg)}</text>
                <text fg={props.theme.textMuted}>30d {formatUsd(data().avg30d)}</text>
              </box>
            </box>
          }
        >
          <box flexDirection="column" gap={0}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={props.theme.textMuted}>{padEnd("Today", 9)} {padStart(formatUsd(data().todaySpend), 10)}</text>
              <text fg={props.theme.textMuted}>{formatTokenInline(data().todayTokens.input, data().todayTokens.output)}</text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={props.theme.textMuted}>{padEnd("Daily avg", 9)} {padStart(formatUsd(data().dailyAvg), 10)}</text>
              <text fg={props.theme.textMuted}>{formatTokenInline(data().dailyAvgTokens.input, data().dailyAvgTokens.output)}</text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={props.theme.textMuted}>{padEnd("7d avg", 9)} {padStart(formatUsd(data().avg7d), 10)}</text>
              <text fg={props.theme.textMuted}>{formatTokenInline(data().avg7dTokens.input, data().avg7dTokens.output)}</text>
            </box>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={props.theme.textMuted}>{padEnd("30d avg", 9)} {padStart(formatUsd(data().avg30d), 10)}</text>
              <text fg={props.theme.textMuted}>{formatTokenInline(data().avg30dTokens.input, data().avg30dTokens.output)}</text>
            </box>
          </box>
        </Show>
      </box>
      <text> </text>
      <Show when={models().length > 0}>
        <box
          flexDirection="row"
          gap={1}
          // @ts-expect-error selectable is a runtime Renderable property not yet in BoxProps
          selectable={true}
          onMouseDown={() => setExpanded((e) => !e)}
        >
          <text fg={props.theme.text}>
            <strong>{expanded() ? "▼" : "▶"} Top Models (Current Month)</strong>
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
                  {"  "}
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
    props.store.version()
    props.api.state.session.messages(props.sessionID).length

    const d = props.store.data()
    const status = props.store.state().status
    const limit = d?.keyInfo.monthly_limit ?? 0
    const spend = d?.keyInfo.monthly_spend ?? 0
    const ratio = spendRatio(spend, limit)
    const name = d?.keyInfo.name ?? ""
    const color = !d || limit <= 0
      ? props.theme.textMuted
      : severityColor(spendSeverity(ratio, props.thresholds), props.theme)
    const projectionParts = formatProjectionParts(spend, limit)
    const projectionOverLimit = isProjectionOverLimit(spend, limit)

    const parts: { text: string; color?: unknown; href?: string }[] = []
    if (d) {
      const averages: string[] = []
      if (props.todaySpend) {
        let label = `T ${formatUsd(d.todaySpend)}`
        if (props.showTokens) {
          label += ` ${formatTokenInline(d.todayTokens.input, d.todayTokens.output)}`
        }
        averages.push(label)
      }
      if (props.dailyAvg) averages.push(`D ${formatUsd(d.dailyAvg)}`)
      if (props.avg7d) averages.push(`7d ${formatUsd(d.avg7d)}`)
      if (props.avg30d) averages.push(`30d ${formatUsd(d.avg30d)}`)
      if (averages.length > 0) {
        parts.push({ text: `${averages.join(" · ")} `, color: props.theme.textMuted })
      }
    }
    if (status === "loading" && !d) {
      parts.push({ text: "Requesty …", color: props.theme.textMuted })
    } else if (status === "error" && !d) {
      parts.push({ text: "Requesty !", color: props.theme.textMuted })
    } else if (!d) {
      parts.push({ text: "Requesty …", color: props.theme.textMuted })
    } else {
      const label = limit > 0
        ? `${formatUsd(spend)}/${formatUsd(limit)} ${formatPercent(ratio)}${props.showKeyName ? ` (${name})` : ""}`
        : `${formatUsd(spend)}/unlimited${props.showKeyName ? ` (${name})` : ""}`
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
            <a href={seg.href!} style={{ fg: seg.color }}>{seg.text}</a>
          </Show>
        )}
      </For>
    </text>
  )
}
