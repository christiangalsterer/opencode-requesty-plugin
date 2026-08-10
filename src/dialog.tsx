/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { formatLimit, formatPercent, formatTokenBreakdown, formatTokens, formatUsd, monthName, padEnd, padStart, renderBar, severityColor, shortModel, spendRatio, spendSeverity, type SpendThresholds } from "./format"

export type DetailDialogProps = {
  store: RequestyStore
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
  onClose: () => void
  onRefresh: () => void
}

export function RequestyDetailDialog(props: DetailDialogProps): JSX.Element {
  const theme = () => props.theme
  const data = () => props.store.data()
  const state = () => props.store.state()

  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} paddingTop={1}>
      <text fg={theme().text}>
        <strong>Requesty.ai — key usage ({monthName()})</strong>
      </text>

      <Show when={data()} fallback={<text fg={theme().textMuted}>{state().status === "loading" ? "Loading…" : "No data yet."}</text>}>
        <KeySummary store={props.store} theme={theme()} thresholds={props.thresholds} />
        <ModelTable store={props.store} theme={theme()} />
      </Show>

      <Show when={state().status === "error"}>
        <text fg={theme().error}>{(state() as { message: string }).message}</text>
      </Show>

      <text fg={theme().textMuted} paddingTop={1}>
        r: refresh · esc: close
      </text>
    </box>
  )
}

function KeySummary(props: { store: RequestyStore; theme: TuiThemeCurrent; thresholds: SpendThresholds }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const fetchedAt = () => {
    const state = props.store.state()
    return state.status === "ready" ? state.fetchedAt.toLocaleTimeString() : "—"
  }

  return (
    <box flexDirection="column" paddingTop={1}>
      <text fg={props.theme.text}>Key: {data().keyInfo.name}</text>
      <text fg={props.theme.text}>
        Monthly spend: {formatUsd(spend())} of {formatLimit(limit())}
      </text>
      <Show when={limit() > 0}>
        <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
          {renderBar(ratio(), 30)} {formatPercent(ratio())}
        </text>
      </Show>
      <text fg={props.theme.textMuted}>Updated: {fetchedAt()}</text>
    </box>
  )
}

function ModelTable(props: { store: RequestyStore; theme: TuiThemeCurrent }): JSX.Element {
  const models = () => props.store.data()?.models ?? []
  const totalSpend = () => models().reduce((sum, model) => sum + model.spend, 0)

  return (
    <box flexDirection="column" paddingTop={1}>
      <Show when={models().length > 0} fallback={<text fg={props.theme.textMuted}>No model usage recorded this month.</text>}>
        <text fg={props.theme.textMuted}>
          {padEnd("Model", 30)} {padStart("Spend", 10)} {padStart("Share", 7)} {padEnd("Tokens (↑in ↓out)", 24)} {padStart("Reqs", 7)}
        </text>
        <For each={models()}>
          {(model) => (
            <text fg={props.theme.text}>
              {padEnd(shortModel(model.model, 29), 30)} {padStart(formatUsd(model.spend), 10)}{" "}
              {padStart(totalSpend() > 0 ? formatPercent(model.spend / totalSpend()) : "—", 7)}{" "}
              {padEnd(`${formatTokens(model.totalTokens)} ${formatTokenBreakdown(model.inputTokens, model.outputTokens)}`, 24)}{" "}
              {padStart(formatTokens(model.requests), 7)}
            </text>
          )}
        </For>
        <text fg={props.theme.textMuted} paddingTop={1}>
          Total: {formatUsd(totalSpend())} across {models().length} model{models().length === 1 ? "" : "s"}
        </text>
      </Show>
    </box>
  )
}
