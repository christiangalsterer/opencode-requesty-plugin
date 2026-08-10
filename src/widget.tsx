/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { formatLimit, formatPercent, formatTokenBreakdown, formatTokens, formatUsd, analyticsUrl, monthName, padEnd, padStart, renderBar, shortModel, spendRatio, spendSeverity, severityColor, type SpendThresholds } from "./format"

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
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
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
  )
}

function Snapshot(props: WidgetProps & { stale?: boolean }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const models = () => data().models.slice(0, props.maxModels)

  return (
    <box flexDirection="column">
      <text fg={props.theme.text}>
        {formatUsd(spend())} / {formatLimit(limit())}
        {props.stale ? " (stale)" : ""}
      </text>
      <Show when={limit() > 0}>
        <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
          {renderBar(ratio())} {formatPercent(ratio())}
        </text>
        <text> </text>
      </Show>
      <Show when={models().length > 0}>
        <text fg={props.theme.text}>
          <strong>Top models ({monthName()})</strong>
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
  const data = () => props.store.data()
  const limit = () => data()?.keyInfo.monthly_limit ?? 0
  const spend = () => data()?.keyInfo.monthly_spend ?? 0
  const ratio = () => spendRatio(spend(), limit())
  const status = () => props.store.state().status

  const label = () => {
    if (status() === "loading" && !data()) return "Requesty …"
    if (status() === "error" && !data()) return "Requesty !"
    if (!data()) return "Requesty …"
    const name = data()!.keyInfo.name
    if (limit() > 0) return `${formatUsd(spend())}/${formatUsd(limit())} ${formatPercent(ratio())} (${name})`
    return `${formatUsd(spend())}/unlimited (${name})`
  }

  const color = () => {
    if (!data() || limit() <= 0) return props.theme.textMuted
    return severityColor(spendSeverity(ratio(), props.thresholds), props.theme)
  }

  return (
    <text fg={color()}>
      <a href={analyticsUrl(data()?.keyInfo.name ?? "")}>{label()}</a>
    </text>
  )
}
