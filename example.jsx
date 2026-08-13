/** @jsxImportSource @opentui/solid */
import { Show, For, createMemo } from "solid-js";
import { formatCurrency, formatTokens } from "./client";
import { themeColors } from "./theme-utils";
export function RequestySidebar(props) {
    const c = themeColors(props.theme);
    const pct = () => props.data?.budget.percentUsed ?? 0;
    const barColor = () => {
        if (pct() >= 90)
            return c.error;
        if (pct() >= 70)
            return c.warning;
        return c.success;
    };
    const progressBar = createMemo(() => {
        const p = Math.min(100, Math.max(0, pct()));
        const filled = Math.round(p / 5);
        return "█".repeat(filled) + "░".repeat(20 - filled);
    });
    return (<box flexDirection="column" gap={0} paddingTop={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between" paddingBottom={0}>
        <text fg={c.white} attributes={1}>
          Requesty
        </text>
        <text fg={c.muted}>
          {props.data?.budget.name ?? ""}
        </text>
      </box>

      <Show when={props.error}>
        <text fg={c.red}>Error: {props.error}</text>
      </Show>

      <Show when={!props.error && props.data}>
        <box flexDirection="column" gap={0}>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={c.muted}>Spent</text>
            <text fg={c.text}>
              {formatCurrency(props.data.budget.monthlySpend, props.data.budget.currency)}
            </text>
          </box>

          <box flexDirection="row" justifyContent="space-between">
            <text fg={c.muted}>Limit</text>
            <text fg={c.text}>
              {props.data.budget.isUnlimited
            ? "unlimited"
            : formatCurrency(props.data.budget.monthlyLimit, props.data.budget.currency)}
            </text>
          </box>

          <Show when={!props.data.budget.isUnlimited}>
            <box flexDirection="row" justifyContent="space-between">
              <text fg={c.muted}>Remaining</text>
              <text fg={barColor()}>
                {formatCurrency(props.data.budget.remaining, props.data.budget.currency)}
              </text>
            </box>
          </Show>

          <Show when={!props.data.budget.isUnlimited}>
            <box flexDirection="row">
              <text fg={barColor()}>{progressBar()}</text>
              <text fg={c.muted}> {pct().toFixed(0)}%</text>
            </box>
          </Show>

          <box flexDirection="row" justifyContent="space-between" paddingTop={1}>
            <text fg={c.muted}>Requests (30d)</text>
            <text fg={c.text}>{props.data.usage.total.completionsRequests}</text>
          </box>

          <box flexDirection="row" justifyContent="space-between">
            <text fg={c.muted}>Tokens (30d)</text>
            <text fg={c.text}>
              {formatTokens(props.data.usage.total.totalTokens)}
            </text>
          </box>

          <Show when={props.data.usage.byModel.length > 0}>
            <text fg={c.muted} paddingTop={1} attributes={1}>
              Top Models
            </text>
            <For each={props.data.usage.byModel.slice(0, 5)}>
              {(m) => (<box flexDirection="row" justifyContent="space-between">
                  <text fg={c.text}>{m.model}</text>
                  <text fg={c.muted}>{formatCurrency(m.spend)}</text>
                </box>)}
            </For>
          </Show>
        </box>
      </Show>

      <Show when={!props.data && !props.error && props.loading}>
        <text fg={c.muted}>Loading budget...</text>
      </Show>

      <Show when={!props.data && !props.error && !props.loading}>
        <text fg={c.muted}>No budget data</text>
      </Show>
    </box>);
}
