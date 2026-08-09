/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { formatPercent, formatTokenBreakdown, formatTokens, formatUsd, monthName, renderBar, shortModel, spendSeverity, type SpendThresholds } from "./format"

export type WidgetProps = {
  store: RequestyStore
  theme: TuiThemeCurrent
  /** Max number of models listed in the compact sidebar view. */
  maxModels: number
  /** Budget usage thresholds for bar coloring. */
  thresholds: SpendThresholds
}

function spendColor(ratio: number, theme: TuiThemeCurrent, thresholds: SpendThresholds) {
  const severity = spendSeverity(ratio, thresholds)
  if (severity === "critical") return theme.error
  if (severity === "warning") return theme.warning
  return theme.success
}

export function RequestySidebarWidget(props: WidgetProps): JSX.Element {
  const theme = () => props.theme

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={theme().textMuted}>
        <strong>Requesty</strong>
        {props.store.data() ? ` (${props.store.data()!.keyInfo.name})` : ""}
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
  const ratio = () => (limit() > 0 ? spend() / limit() : 0)
  const models = () => data().models.slice(0, props.maxModels)

  return (
    <box flexDirection="column">
      <text fg={themeText(props)}>
        {formatUsd(spend())} / {limit() > 0 ? formatUsd(limit()) : "unlimited"}
        {props.stale ? " (stale)" : ""}
      </text>
      <Show when={limit() > 0}>
        <text fg={spendColor(ratio(), props.theme, props.thresholds)}>
          {renderBar(ratio())} {formatPercent(ratio())}
        </text>
      </Show>
      <Show when={models().length > 0}>
        <text fg={props.theme.textMuted} paddingTop={1}>
          Top models ({monthName()}):
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

function themeText(props: WidgetProps) {
  return props.theme.text
}

function padEnd(value: string, width: number): string {
  return value.length >= width ? value : value + " ".repeat(width - value.length)
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : " ".repeat(width - value.length) + value
}
