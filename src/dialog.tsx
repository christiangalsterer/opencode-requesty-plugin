/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { analyticsUrl, formatLimit, formatPercent, formatProjection, formatTokenBreakdown, formatTokens, formatUsd, padEnd, padStart, projectedMonthEnd, renderBar, severityColor, shortModel, spendRatio, spendSeverity, type SpendThresholds } from "./format"

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
  const fetchedAt = () => state().status === "ready" ? (state() as { fetchedAt: Date }).fetchedAt.toLocaleTimeString() : "—"

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}>
      <text fg={theme().text}>
        <Show
          when={data()}
          fallback={<strong>Requesty</strong>}
        >
          <a href={analyticsUrl(data()!.keyInfo.name)}>
            <strong>Requesty ({data()!.keyInfo.name})</strong>
          </a>
        </Show>
      </text>

      <Show when={data()} fallback={<text fg={theme().textMuted}>{state().status === "loading" ? "Loading…" : "No data yet."}</text>}>
        <KeySummary store={props.store} theme={theme()} thresholds={props.thresholds} />
        <ModelTable store={props.store} theme={theme()} />
      </Show>

      <Show when={state().status === "error"}>
        <text fg={theme().error}>{(state() as { message: string }).message}</text>
      </Show>

      <text fg={theme().textMuted} paddingTop={1}>
        {padEnd("r: refresh · esc: close", 60)}{padStart(`Updated: ${fetchedAt()}`, 22)}
      </text>
    </box>
  )
}

function KeySummary(props: { store: RequestyStore; theme: TuiThemeCurrent; thresholds: SpendThresholds }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const projection = () => formatProjection(spend(), limit())
  const projectionOverLimit = () => limit() > 0 && projectedMonthEnd(spend()) > limit()

  return (
    <box flexDirection="column" paddingTop={1}>
      <Show when={limit() > 0}>
        <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
          {renderBar(ratio(), 30)} {formatPercent(ratio())}
        </text>
      </Show>
      <text fg={props.theme.textMuted}>
        {formatUsd(spend())} / {formatLimit(limit())}
        <Show when={projection()}>
          {" / "}
          <span style={{ fg: projectionOverLimit() ? props.theme.error : undefined }}>
            {projection()}
          </span>
        </Show>
      </text>
      <text fg={props.theme.textMuted}>
        Today {formatUsd(data().todaySpend)} / 7d {formatUsd(data().avg7d)} / 30d {formatUsd(data().avg30d)}
      </text>
    </box>
  )
}

function ModelTable(props: { store: RequestyStore; theme: TuiThemeCurrent }): JSX.Element {
  const models = () => props.store.data()?.models ?? []
  const totalSpend = () => models().reduce((sum, model) => sum + model.spend, 0)
  const monthSpend = () => props.store.data()?.keyInfo.monthly_spend ?? totalSpend()

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
          Total: {formatUsd(monthSpend())} across {models().length} model{models().length === 1 ? "" : "s"}
        </text>
      </Show>
    </box>
  )
}
