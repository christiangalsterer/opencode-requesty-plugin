/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { RequestyStore } from "./state"
import { analyticsUrl, daysRemaining, daysToExhaustion, formatLimit, formatMonthDelta, formatOutputInputRatio, formatPercent, formatProjection, formatTimestamp, formatTokenBreakdown, formatTokens, formatUsd, padEnd, padStart, renderBar, severityColor, shortModel, spendRatio, spendSeverity, type SpendThresholds } from "./format"

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
  const fetchedAt = () => state().status === "ready" ? formatTimestamp((state() as { fetchedAt: Date }).fetchedAt) : "—"

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
        {padEnd("r: refresh · esc: close", 54)}{padStart(`Updated: ${fetchedAt()}`, 28)}
      </text>
    </box>
  )
}

function KeySummary(props: { store: RequestyStore; theme: TuiThemeCurrent; thresholds: SpendThresholds }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const exhaustionDays = () => daysToExhaustion(spend(), limit(), data().avg7d)
  const exhaustionLabel = () => {
    const d = exhaustionDays()
    if (d === undefined) return ""
    const status = d > daysRemaining() ? "On track" : "Over budget"
    return ` · ${status} · exhausts in ${d}d (7d average)`
  }
  const projection = () => formatProjection(spend(), limit())

  return (
    <box flexDirection="column" paddingTop={1}>
      <Show when={limit() > 0}>
        <text fg={severityColor(spendSeverity(ratio(), props.thresholds), props.theme)}>
          {renderBar(ratio(), 30)} {formatPercent(ratio())}
        </text>
      </Show>
      <text fg={props.theme.textMuted}>
        Spent {formatUsd(spend())}
      </text>
      <text fg={props.theme.textMuted}>
        Limit {formatLimit(limit())}
      </text>
      <Show when={limit() > 0}>
        <text fg={props.theme.textMuted}>
          Remaining: {formatUsd(limit() - spend())} ({daysRemaining()}d left){exhaustionLabel()}
        </text>
      </Show>
      <text fg={props.theme.textMuted}>
        Averages: today {formatUsd(data().todaySpend)} · 7d avg {formatUsd(data().avg7d)} · 30d avg {formatUsd(data().avg30d)}
      </text>
      <Show when={formatMonthDelta(spend(), data().lastMonthSpend)}>
        <text fg={props.theme.textMuted}>
          vs last month: {formatMonthDelta(spend(), data().lastMonthSpend)}
        </text>
      </Show>
      <Show when={projection()}>
        <text fg={props.theme.textMuted}>
          Estimation: {projection()}
        </text>
      </Show>
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
          {padEnd("Model", 26)} {padStart("Spend", 9)} {padStart("Share", 6)} {padEnd("Tokens (↑in ↓out)", 22)} {padStart("Reqs", 6)} {padStart("Out/In", 6)}
        </text>
        <For each={models()}>
          {(model) => (
            <text fg={props.theme.text}>
              {padEnd(shortModel(model.model, 25), 26)} {padStart(formatUsd(model.spend), 9)}{" "}
              {padStart(totalSpend() > 0 ? formatPercent(model.spend / totalSpend()) : "—", 6)}{" "}
              {padEnd(`${formatTokens(model.totalTokens)} ${formatTokenBreakdown(model.inputTokens, model.outputTokens)}`, 22)}{" "}
              {padStart(formatTokens(model.requests), 6)}{" "}
              {padStart(formatOutputInputRatio(model.inputTokens, model.outputTokens), 6)}
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
