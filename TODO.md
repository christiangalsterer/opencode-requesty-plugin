# TODO

## Completed

- [x] **Sidebar: add projected month-end spend + pace marker line** — e.g. `~$42.80 EOM ↑`. Derived from monthly_spend + dayOfMonth/daysInMonth. No API change.
- [x] **format.ts: add pure helpers** — projectedMonthEnd(), dailyAverage(), paceMarker(), daysToExhaustion(), perModelUnitCosts(). Unit-test in test/logic.test.ts.
- [x] **README: update ASCII sidebar example** to reflect new sidebar line.
- [x] **Session prompt: show today's spend** left of the existing budget information, dimmed text, no link.
- [x] **Sidebar + dialog: daily spend trend line** — Today / 7-day avg / 30-day avg with inline labels.
- [x] **Dialog: add Budget section** — remaining budget, days-to-exhaustion, last-month delta.
- [x] **Dialog: per-model output/input token ratio column** (productivity signal; inputs already shown).
- [x] **Optional: last-month comparison** — second usage call for previous month window; show `▲ +42% vs last month`.

## Pending

### Medium

- [ ] **Preserve daily buckets in aggregateByModel** (or add separate aggregator) to enable sparkline. Currently daily resolution is fetched but discarded.

### Low

- [ ] **Dialog: daily-spend sparkline row** (▁▂▃▅▆█) under Budget section. Data already fetched via resolution:day.
- [ ] **Investigate: check raw UsageGroupedEntry for cached-token fields** to show cache hit rate.
- [ ] **Optional: most-expensive-single-day flag** from daily buckets (anomaly detection).
