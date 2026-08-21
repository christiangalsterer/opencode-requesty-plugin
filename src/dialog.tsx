/** @jsxImportSource @opentui/solid */
import { Show, For, type JSX } from 'solid-js'
import type { TuiThemeCurrent } from '@opencode-ai/plugin/tui'
import type { ModelUsage, TokenBreakdown } from './api'
import type { RequestyStore } from './state'
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
  formatTokenInline,
  formatTokens,
  formatUsd,
  isProjectionOverLimit,
  modelAnalyticsUrl,
  padEnd,
  padStart,
  renderBar,
  severityColor,
  shortModel,
  spendRatio,
  spendSeverity,
  type Pace,
  type SpendThresholds
} from './format'

export type DetailDialogProps = {
  store: RequestyStore
  theme: TuiThemeCurrent
  thresholds: SpendThresholds
  showKeyName: boolean
  onClose: () => void
  onRefresh: () => void
}

export function RequestyDetailDialog(props: DetailDialogProps): JSX.Element {
  const theme = () => props.theme
  const data = () => props.store.data()
  const state = () => props.store.state()
  const fetchedAt = () => (state().status === 'ready' ? formatTimestamp((state() as { fetchedAt: Date }).fetchedAt) : '—')

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingTop={1}>
      <Title store={props.store} theme={theme()} showKeyName={props.showKeyName} />

      <Show when={state().status === 'error'}>
        <CenteredMessage theme={theme()} error>
          {(state() as { message: string }).message}
        </CenteredMessage>
      </Show>

      <Show
        when={data()}
        fallback={<CenteredMessage theme={theme()}>{state().status === 'loading' ? 'Loading Requesty usage…' : 'No data yet.'}</CenteredMessage>}
      >
        <KpiRow store={props.store} theme={theme()} thresholds={props.thresholds} />
        <BudgetSection store={props.store} theme={theme()} thresholds={props.thresholds} />
        <ModelSection store={props.store} theme={theme()} />
      </Show>

      <Footer fetchedAt={fetchedAt()} theme={theme()} />
    </box>
  )
}

function Title(props: { store: RequestyStore; theme: TuiThemeCurrent; showKeyName: boolean }): JSX.Element {
  return (
    <text fg={props.theme.text}>
      <Show when={props.store.data()} fallback={<strong>Requesty</strong>}>
        <a href={analyticsUrl(props.store.data()!.keyInfo.name)}>
          <strong>Requesty{props.showKeyName ? ` (${props.store.data()!.keyInfo.name})` : ''}</strong>
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
    if (pace === 'over') return props.theme.error
    if (pace === 'under') return props.theme.success
    return props.theme.textMuted
  }

  return (
    <box flexDirection="row" gap={3} paddingY={1} flexWrap="wrap">
      <Metric label="Spent" value={formatUsd(spend())} theme={props.theme} color={props.theme.text} />
      <Show when={limit() > 0}>
        <Metric label="Limit" value={formatUsd(limit())} theme={props.theme} color={props.theme.text} />
        <Metric label="Remaining" value={formatUsd(limit() - spend())} theme={props.theme} color={severityColor(severity(), props.theme)} />
      </Show>
      <Show when={projectionParts()}>
        <TrendMetric
          label="End of Month"
          value={`~${formatUsd(projectionParts()!.projected)}`}
          theme={props.theme}
          color={isProjectionOverLimit(spend(), limit()) ? props.theme.error : props.theme.text}
          indicator={projectionParts()!.arrow ? { text: projectionParts()!.arrow, color: paceColor(projectionParts()!.pace) } : undefined}
        />
      </Show>
      <Show when={monthDelta()}>
        <TrendMetric
          label="last month"
          value={formatUsd(data().lastMonthSpend)}
          theme={props.theme}
          color={props.theme.text}
          indicator={{
            text: `${monthDelta()!.arrow} ${monthDelta()!.sign}${monthDelta()!.pct}%`,
            color: monthDelta()!.pct > 0 ? props.theme.error : monthDelta()!.pct < 0 ? props.theme.success : props.theme.textMuted
          }}
        />
      </Show>
    </box>
  )
}

function Metric(props: {
  label: string
  value: string
  theme: TuiThemeCurrent
  color: TuiThemeCurrent['text']
  tokens?: TokenBreakdown
}): JSX.Element {
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0}>
      <text fg={props.color}>
        <strong>{props.value}</strong>
        <Show when={props.tokens}> {formatTokenInline(props.tokens!.input, props.tokens!.output)}</Show>
      </text>
      <text fg={props.theme.textMuted}>{props.label}</text>
    </box>
  )
}

function TrendMetric(props: {
  label: string
  value: string
  theme: TuiThemeCurrent
  color: TuiThemeCurrent['text']
  indicator?: { text: string; color: unknown }
}): JSX.Element {
  return (
    <box flexDirection="column">
      <text fg={props.color}>
        <strong>{props.value}</strong>
      </text>
      <text fg={props.theme.textMuted}>
        {props.label}
        <Show when={props.indicator}>
          {' '}
          <span style={{ fg: props.indicator!.color }}>{props.indicator!.text}</span>
        </Show>
      </text>
    </box>
  )
}

function BudgetSection(props: { store: RequestyStore; theme: TuiThemeCurrent; thresholds: SpendThresholds }): JSX.Element {
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

      <box flexDirection="column" gap={1}>
        <box flexDirection="row" gap={3} flexWrap="wrap">
          <Metric label="Today" value={formatUsd(data().todaySpend)} theme={props.theme} color={props.theme.text} tokens={data().todayTokens} />
          <Metric label="Daily avg" value={formatUsd(data().dailyAvg)} theme={props.theme} color={props.theme.text} tokens={data().dailyAvgTokens} />
        </box>
        <box flexDirection="row" gap={3} flexWrap="wrap">
          <Metric label="7d avg" value={formatUsd(data().avg7d)} theme={props.theme} color={props.theme.text} tokens={data().avg7dTokens} />
          <Metric label="30d avg" value={formatUsd(data().avg30d)} theme={props.theme} color={props.theme.text} tokens={data().avg30dTokens} />
        </box>
      </box>
    </box>
  )
}

function StatusBadge(props: { overBudget: boolean; theme: TuiThemeCurrent }): JSX.Element {
  return (
    <box paddingX={1} backgroundColor={props.overBudget ? props.theme.error : props.theme.success}>
      <text fg={props.theme.text}>{props.overBudget ? 'Over budget' : 'On track'}</text>
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
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={0}
      gap={0}
    >
      <Show when={models().length > 0} fallback={<text fg={props.theme.textMuted}>No model usage recorded this month.</text>}>
        <box paddingBottom={0.5}>
          <TableHeader theme={props.theme} />
        </box>
        <box flexDirection="column">
          <For each={models()}>
            {(model) => <ModelRow model={model} totalSpend={totalSpend()} keyName={data().keyInfo.name} theme={props.theme} />}
          </For>
        </box>
        <text fg={props.theme.textMuted}>
          Total: {formatUsd(monthSpend())} across {models().length} model{models().length === 1 ? '' : 's'}
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
          {padEnd('Model', 26)} {padStart('Spend', 9)} {padStart('Share', 6)} {padEnd('Tokens (↑In ↓Out)', 22)} {padStart('Reqs', 6)}{' '}
          {padStart('Out/In', 6)}
        </u>
      </strong>
    </text>
  )
}

function ModelRow(props: { model: ModelUsage; totalSpend: number; keyName: string; theme: TuiThemeCurrent }): JSX.Element {
  const share = props.totalSpend > 0 ? formatPercent(props.model.spend / props.totalSpend) : '—'
  return (
    <text fg={props.theme.text}>
      <a href={modelAnalyticsUrl(props.keyName, props.model.model)}>{padEnd(shortModel(props.model.model, 25), 26)}</a>{' '}
      {padStart(formatUsd(props.model.spend), 9)} {padStart(share, 6)}{' '}
      {padEnd(`${formatTokens(props.model.totalTokens)} ${formatTokenBreakdown(props.model.inputTokens, props.model.outputTokens)}`, 22)}{' '}
      {padStart(formatTokens(props.model.requests), 6)} {padStart(formatOutputInputRatio(props.model.inputTokens, props.model.outputTokens), 6)}
    </text>
  )
}

function Footer(props: { fetchedAt: string; theme: TuiThemeCurrent }): JSX.Element {
  return (
    <box flexDirection="row" border borderStyle="single" borderColor={props.theme.textMuted} paddingX={1} alignItems="center">
      <box flexDirection="row" gap={1}>
        <text fg={props.theme.text}>
          <strong>Refresh</strong>
        </text>
        <text fg={props.theme.textMuted}>r</text>
        <text fg={props.theme.textMuted}>·</text>
        <text fg={props.theme.text}>
          <strong>Close</strong>
        </text>
        <text fg={props.theme.textMuted}>esc</text>
      </box>
      <box flexGrow={1} />
      <text fg={props.theme.textMuted}>Updated: {props.fetchedAt}</text>
    </box>
  )
}
