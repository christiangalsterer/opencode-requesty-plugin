/** @jsxImportSource @opentui/solid */
import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { testRender } from '@opentui/solid'
import { type DetailDialogProps, RequestyDetailDialog } from '../src/dialog'
import { WORKDAY_PROJECTION } from '../src/format'
import type { RequestyStore } from '../src/state'
import { makeData, makeStore, makeTheme, THRESHOLDS } from './helpers'

const BASE_PROPS: Omit<DetailDialogProps, 'store'> = {
  theme: makeTheme(),
  thresholds: THRESHOLDS,
  showKeyName: false
}

/** Render the detail dialog and return its whitespace-normalized frame. */
async function renderDialog(store: RequestyStore, overrides: Partial<DetailDialogProps> = {}): Promise<string> {
  const setup = await testRender(() => <RequestyDetailDialog {...BASE_PROPS} store={store} {...overrides} />, { width: 90, height: 40 })
  try {
    await setup.flush()
    return setup.captureCharFrame().replace(/\s+/g, ' ').trim()
  } finally {
    setup.renderer.destroy()
  }
}

describe('RequestyDetailDialog', () => {
  test('shows a loading message before any data arrives', async () => {
    const frame = await renderDialog(makeStore(undefined, { status: 'loading' }))
    assert.ok(frame.includes('Loading Requesty usage…'))
  })

  test('shows the error message when a refresh failed', async () => {
    const frame = await renderDialog(makeStore(undefined, { status: 'error', errorMessage: 'boom' }))
    assert.ok(frame.includes('boom'))
  })

  test('renders the KPI row, budget overview and footer when ready', async () => {
    const frame = await renderDialog(makeStore(makeData()))
    assert.ok(frame.includes('Requesty'))
    assert.ok(frame.includes('Spent'))
    assert.ok(frame.includes('Limit'))
    assert.ok(frame.includes('Remaining'))
    assert.ok(frame.includes('End of Month'))
    assert.ok(frame.includes('last month'))
    assert.ok(frame.includes('Budget Overview'))
    assert.ok(frame.includes('On track'))
    assert.ok(frame.includes('Updated:'))
  })

  test('labels the End of Month projection with the model that produced it', async () => {
    assert.ok((await renderDialog(makeStore(makeData()))).includes('End of Month (calendar)'))
    assert.ok((await renderDialog(makeStore(makeData({ projection: WORKDAY_PROJECTION })))).includes('End of Month (workdays)'))
  })

  test('renders the key name only when showKeyName is enabled', async () => {
    const store = makeStore(makeData())
    assert.ok(!(await renderDialog(store)).includes('(mykey)'))
    assert.ok((await renderDialog(store, { showKeyName: true })).includes('(mykey)'))
  })

  test('renders the model breakdown table and total', async () => {
    const frame = await renderDialog(makeStore(makeData()))
    assert.ok(frame.includes('Model Breakdown (Current Month)'))
    assert.ok(frame.includes('gpt-5'))
    assert.ok(frame.includes('$1.25'))
    assert.ok(frame.includes('Total: $2.50 across 1 model'))
  })

  test('shows the empty model state when no models are recorded', async () => {
    const frame = await renderDialog(makeStore(makeData({ models: [] })))
    assert.ok(frame.includes('No model usage recorded this month.'))
  })

  test('hides the limit-dependent metrics when the limit is unlimited', async () => {
    const data = makeData({
      keyInfo: {
        id: 'key-1',
        name: 'mykey',
        logging: false,
        monthly_spend: 3,
        monthly_limit: 0,
        permissions: { manage: 'none', completions: 'write' }
      }
    })
    const frame = await renderDialog(makeStore(data))
    assert.ok(frame.includes('Spent'))
    assert.ok(!frame.includes('Remaining'))
    assert.ok(!frame.includes('Limit'))
  })
})
