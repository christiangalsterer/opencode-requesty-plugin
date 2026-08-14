/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo, type JSX } from "solid-js"
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { formatLimit, formatPercent, formatProjection, formatTokenBreakdown, formatTokens, formatUsd, analyticsUrl, isProjectionOverLimit, monthName, padEnd, padStart, renderBar, shortModel, spendRatio, spendSeverity, severityColor, type SpendThresholds } from "./format"

export type WidgetProps = {
  store: RequestyStore
  theme: TuiThemeCurrent
  /** Max number of models listed in the compact sidebar view. */
  maxModels: number
  /** Budget usage thresholds for bar coloring. */
  thresholds: SpendThresholds
}

export type PromptIndicatorProps = {
  store: RequestyStore
  api: TuiPluginApi
  sessionID: string
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
  dailySpend: boolean
  monthlyProjection: boolean
}

export function RequestySidebarWidget(props: WidgetProps): JSX.Element {
  const theme = () => props.theme

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().text}>
        <Show
          when={props.store.data()}
          fallback={<strong>Requesty</strong>}
        >
          <a href={analyticsUrl(props.store.data()!.keyInfo.name)}>
            <strong>Requesty ({props.store.data()!.keyInfo.name})</strong>
          </a>
        </Show>
      </text>
      <box flexDirection="column" paddingTop={1}>
        <Show
          when={props.store.state().status !== "error"}
          fallback={
            <box flexDirection="column">
              <text fg={theme().error}>Requesty: {props.store.state().status === "error" ? (props.store.state() as { message: string }).message : ""}</text>
              <Show when={props.store.data()}>
                <Snapshot store={props.store} theme={theme()} maxModels={props.maxModels} thresholds={props.thresholds} stale />
              </Show>
            </box>
          }
        >
          <Show
            when={props.store.data()}
            fallback={
              <text fg={theme().textMuted}>
                {props.store.state().status === "loading" ? "Loading Requesty usage…" : "Requesty: waiting for first refresh…"}
              </text>
            }
          >
            <Snapshot store={props.store} theme={theme()} maxModels={props.maxModels} thresholds={props.thresholds} />
          </Show>
        </Show>
      </box>
    </box>
  )
}

function Snapshot(props: WidgetProps & { stale?: boolean }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const models = () => data().models.slice(0, props.maxModels)
  const projection = () => formatProjection(spend(), limit())
  const projectionOverLimit = () => isProjectionOverLimit(spend(), limit())

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
          <text fg={props.theme.textMuted}>{formatUsd(spend())}</text>
          <text fg={props.theme.textMuted}>·</text>
          <text fg={props.theme.textMuted}>{formatLimit(limit())}</text>
          <Show when={projection()}>
            <text fg={props.theme.textMuted}>·</text>
            <text fg={projectionOverLimit() ? props.theme.error : props.theme.textMuted}>
              {projection()}
            </text>
          </Show>
          <Show when={props.stale}>
            <text fg={props.theme.textMuted}>(stale)</text>
          </Show>
        </box>
        <box flexDirection="row" justifyContent="space-between">
          <text fg={props.theme.textMuted}>Today {formatUsd(data().todaySpend)}</text>
          <text fg={props.theme.textMuted}>·</text>
          <text fg={props.theme.textMuted}>7d {formatUsd(data().avg7d)}</text>
          <text fg={props.theme.textMuted}>·</text>
          <text fg={props.theme.textMuted}>30d {formatUsd(data().avg30d)}</text>
        </box>
      </box>
      <text> </text>
      <Show when={models().length > 0}>
        <text fg={props.theme.text}>
          <strong>Top Models ({monthName()})</strong>
        </text>
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
    const projectionLabel = formatProjection(spend, limit)
    const projectionOverLimit = isProjectionOverLimit(spend, limit)

    const parts: { text: string; color?: unknown; href?: string }[] = []
    if (d && props.dailySpend) {
      parts.push({ text: `${formatUsd(d.todaySpend)} `, color: props.theme.textMuted })
    }
    if (status === "loading" && !d) {
      parts.push({ text: "Requesty …", color: props.theme.textMuted })
    } else if (status === "error" && !d) {
      parts.push({ text: "Requesty !", color: props.theme.textMuted })
    } else if (!d) {
      parts.push({ text: "Requesty …", color: props.theme.textMuted })
    } else {
      const label = limit > 0
        ? `${formatUsd(spend)}/${formatUsd(limit)} ${formatPercent(ratio)} (${name})`
        : `${formatUsd(spend)}/unlimited (${name})`
      parts.push({ text: label, color, href: analyticsUrl(name) })
    }
    if (props.monthlyProjection && projectionLabel) {
      parts.push({ text: ` ${projectionLabel}`, color: projectionOverLimit ? props.theme.error : props.theme.textMuted })
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
