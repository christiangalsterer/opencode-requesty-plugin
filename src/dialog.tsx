/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from "solid-js"
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { ModelUsage } from "./api"
import type { RequestyStore } from "./state"
import {
  analyticsUrl,
  daysRemaining,
  daysToExhaustion,
  formatMonthDeltaParts,
  formatOutputInputRatio,
  formatPercent,
  formatProjectionParts,
  formatTimestamp,
  formatTokenBreakdown,
  formatTokens,
  formatUsd,
  isProjectionOverLimit,
  padEnd,
  padStart,
  renderBar,
  severityColor,
  shortModel,
  spendRatio,
  spendSeverity,
  type Pace,
  type SpendThresholds,
} from "./format"

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
  const fetchedAt = () =>
    state().status === "ready"
      ? formatTimestamp((state() as { fetchedAt: Date }).fetchedAt)
      : "—"

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1} gap={1}>
      <Title store={props.store} theme={theme()} />

      <Show when={state().status === "error"}>
        <CenteredMessage theme={theme()} error>
          {(state() as { message: string }).message}
        </CenteredMessage>
      </Show>

      <Show
        when={data()}
        fallback={
          <CenteredMessage theme={theme()}>
            {state().status === "loading" ? "Loading Requesty usage…" : "No data yet."}
          </CenteredMessage>
        }
      >
        <KpiRow store={props.store} theme={theme()} thresholds={props.thresholds} />
        <BudgetSection store={props.store} theme={theme()} thresholds={props.thresholds} />
        <ModelSection store={props.store} theme={theme()} />
      </Show>

      <Footer fetchedAt={fetchedAt()} theme={theme()} />
    </box>
  )
}

function Title(props: { store: RequestyStore; theme: TuiThemeCurrent }): JSX.Element {
  return (
    <text fg={props.theme.text}>
      <Show when={props.store.data()} fallback={<strong>Requesty</strong>}>
        <a href={analyticsUrl(props.store.data()!.keyInfo.name)}>
          <strong>Requesty ({props.store.data()!.keyInfo.name})</strong>
        </a>
      </Show>
    </text>
  )
}

function CenteredMessage(props: { children: string; theme: TuiThemeCurrent; error?: boolean }): JSX.Element {
  return (
    <box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
      <text fg={props.error ? props.theme.error : props.theme.textMuted}>{props.children}</text>
    </box>
  )
}

function KpiRow(props: { store: RequestyStore; theme: TuiThemeCurrent; thresholds: SpendThresholds }): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const severity = () => spendSeverity(ratio(), props.thresholds)
  const projectionParts = () => formatProjectionParts(spend(), limit())
  const monthDelta = () => formatMonthDeltaParts(spend(), data().lastMonthSpend)
  const paceColor = (pace: Pace | undefined) => {
    if (pace === "over") return props.theme.error
    if (pace === "under") return props.theme.success
    return props.theme.textMuted
  }

  return (
    <box flexDirection="row" gap={3} paddingY={1} flexWrap="wrap">
      <Metric label="Spent" value={formatUsd(spend())} theme={props.theme} color={props.theme.text} />
      <Show when={limit() > 0}>
        <Metric label="Limit" value={formatUsd(limit())} theme={props.theme} color={props.theme.text} />
        <Metric
          label="Remaining"
          value={formatUsd(limit() - spend())}
          theme={props.theme}
          color={severityColor(severity(), props.theme)}
        />
      </Show>
      <Show when={projectionParts()}>
        <box flexDirection="column">
          <text
            fg={isProjectionOverLimit(spend(), limit()) ? props.theme.error : props.theme.text}
          >
            <strong>~{formatUsd(projectionParts()!.projected)}</strong>
          </text>
          <text fg={props.theme.textMuted}>
            End of Month{" "}
            <Show when={projectionParts()!.arrow}>
              <span style={{ fg: paceColor(projectionParts()!.pace) }}>{projectionParts()!.arrow}</span>
            </Show>
          </text>
        </box>
      </Show>
      <Show when={monthDelta()}>
        <box flexDirection="column">
          <text fg={props.theme.text}>
            <strong>{formatUsd(data().lastMonthSpend)}</strong>
          </text>
          <text fg={props.theme.textMuted}>
            last month{" "}
            <span
              style={{
                fg:
                  monthDelta()!.pct > 0
                    ? props.theme.error
                    : monthDelta()!.pct < 0
                      ? props.theme.success
                      : props.theme.textMuted,
              }}
            >
              {monthDelta()!.arrow}
            </span>{" "}
            {monthDelta()!.sign}{monthDelta()!.pct}%
          </text>
        </box>
      </Show>
    </box>
  )
}

function Metric(props: {
  label: string
  value: string
  theme: TuiThemeCurrent
  color: TuiThemeCurrent["text"]
}): JSX.Element {
  return (
    <box flexDirection="column">
      <text fg={props.color}>
        <strong>{props.value}</strong>
      </text>
      <text fg={props.theme.textMuted}>{props.label}</text>
    </box>
  )
}

function BudgetSection(props: {
  store: RequestyStore
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
}): JSX.Element {
  const data = () => props.store.data()!
  const limit = () => data().keyInfo.monthly_limit
  const spend = () => data().keyInfo.monthly_spend
  const ratio = () => spendRatio(spend(), limit())
  const severity = () => spendSeverity(ratio(), props.thresholds)
  const barColor = () => severityColor(severity(), props.theme)
  const exhaustionDays = () => daysToExhaustion(spend(), limit(), data().avg7d)
  const overBudget = () => {
    const d = exhaustionDays()
    return d !== undefined && d <= daysRemaining()
  }

  return (
    <box
      border
      borderStyle="single"
      borderColor={props.theme.textMuted}
      title="Budget Overview"
      titleColor={props.theme.textMuted}
      flexDirection="column"
      padding={1}
      gap={1}
    >
      <Show when={limit() > 0}>
        <box flexDirection="row" alignItems="center" gap={1}>
          <box flexGrow={1}>
            <text fg={barColor()}>{renderBar(ratio(), 40)}</text>
          </box>
          <text fg={barColor()}>
            <strong>{formatPercent(ratio())}</strong>
          </text>
        </box>
      </Show>

      <box flexDirection="row" gap={2} alignItems="center" flexWrap="wrap">
        <Show when={limit() > 0}>
          <StatusBadge overBudget={overBudget()} theme={props.theme} />
        </Show>
        <Show when={exhaustionDays() !== undefined}>
          <text fg={props.theme.textMuted}>Exhausts in {exhaustionDays()}d (7d avg)</text>
        </Show>
      </box>

      <box flexDirection="row" gap={3} flexWrap="wrap">
        <Metric label="Today" value={formatUsd(data().todaySpend)} theme={props.theme} color={props.theme.text} />
        <Metric label="7d avg" value={formatUsd(data().avg7d)} theme={props.theme} color={props.theme.text} />
        <Metric label="30d avg" value={formatUsd(data().avg30d)} theme={props.theme} color={props.theme.text} />
      </box>

    </box>
  )
}

function StatusBadge(props: { overBudget: boolean; theme: TuiThemeCurrent }): JSX.Element {
  return (
    <box
      paddingX={1}
      backgroundColor={props.overBudget ? props.theme.error : props.theme.success}
    >
      <text fg={props.theme.text}>{props.overBudget ? "Over budget" : "On track"}</text>
    </box>
  )
}

function ModelSection(props: { store: RequestyStore; theme: TuiThemeCurrent }): JSX.Element {
  const data = () => props.store.data()!
  const models = () => data().models
  const totalSpend = () => models().reduce((sum, model) => sum + model.spend, 0)
  const monthSpend = () => data().keyInfo.monthly_spend

  return (
    <box
      border
      borderStyle="single"
      borderColor={props.theme.textMuted}
      title="Model Breakdown (Current Month)"
      titleColor={props.theme.textMuted}
      flexDirection="column"
      padding={1}
      gap={1}
    >
      <Show
        when={models().length > 0}
        fallback={<text fg={props.theme.textMuted}>No model usage recorded this month.</text>}
      >
        <TableHeader theme={props.theme} />
        <For each={models()}>
          {(model) => <ModelRow model={model} totalSpend={totalSpend()} theme={props.theme} />}
        </For>
        <text fg={props.theme.textMuted}>
          Total: {formatUsd(monthSpend())} across {models().length} model{models().length === 1 ? "" : "s"}
        </text>
      </Show>
    </box>
  )
}

function TableHeader(props: { theme: TuiThemeCurrent }): JSX.Element {
  return (
    <text fg={props.theme.textMuted}>
      <strong>
        <u>
          {padEnd("Model", 26)} {padStart("Spend", 9)} {padStart("Share", 6)} {padEnd("Tokens (↑in ↓out)", 22)}{" "}
          {padStart("Reqs", 6)} {padStart("Out/In", 6)}
        </u>
      </strong>
    </text>
  )
}

function ModelRow(props: { model: ModelUsage; totalSpend: number; theme: TuiThemeCurrent }): JSX.Element {
  const share = props.totalSpend > 0 ? formatPercent(props.model.spend / props.totalSpend) : "—"
  return (
    <text fg={props.theme.text}>
      {padEnd(shortModel(props.model.model, 25), 26)} {padStart(formatUsd(props.model.spend), 9)}{" "}
      {padStart(share, 6)}{" "}
      {padEnd(
        `${formatTokens(props.model.totalTokens)} ${formatTokenBreakdown(props.model.inputTokens, props.model.outputTokens)}`,
        22,
      )}{" "}
      {padStart(formatTokens(props.model.requests), 6)}{" "}
      {padStart(formatOutputInputRatio(props.model.inputTokens, props.model.outputTokens), 6)}
    </text>
  )
}

function Footer(props: { fetchedAt: string; theme: TuiThemeCurrent }): JSX.Element {
  return (
    <box
      flexDirection="row"
      border
      borderStyle="single"
      borderColor={props.theme.textMuted}
      paddingX={1}
      alignItems="center"
    >
      <text fg={props.theme.textMuted}>r: refresh · esc: close</text>
      <box flexGrow={1} />
      <text fg={props.theme.textMuted}>Updated: {props.fetchedAt}</text>
    </box>
  )
}
