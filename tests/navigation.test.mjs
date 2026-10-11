import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/navigation/history.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const { createNavigation } = await import('data:text/javascript,' + encodeURIComponent(compiled))

function session() {
  const history = [{ external: true }]
  let position = 0
  let listener
  const browser = {
    get state() { return history[position] },
    replaceState(state) { history[position] = state },
    pushState(state) { history.splice(++position); history.push(state) },
    go(offset) {
      const next = position + offset
      if (next < 0 || next >= history.length) return
      position = next
      listener?.({ state: history[position] })
    },
    addEventListener(_, callback) { listener = callback },
    removeEventListener() { listener = null },
  }
  const navigation = createNavigation(browser, 'test-session')
  navigation.start()
  return { navigation, browser, history }
}

test('personal category drilldown restores each previous screen and its complete view state', () => {
  const { navigation: n } = session()
  n.navigate('statistics', {}, { root: true })
  const statistics = n.getSnapshot()
  const view = { scope: 'personal', tab: 'categories', period: 'month', date: new Date('2026-10-01T12:00:00') }
  n.setPageState(statistics.id, 'view', view)
  const filter = { scope: 'personal', categoryId: 'leisure', categoryName: 'Ocio', periodMode: 'month', anchorDate: '2026-10-01' }
  n.navigate('expenses', { statisticsFilter: filter })
  const list = n.getSnapshot()
  n.setPageState(list.id, 'search', 'Cine')
  n.navigate('expense-detail', { expenseId: 'cinema' })
  n.goBack()
  assert.equal(n.getSnapshot().page, 'expenses')
  assert.deepEqual(n.getSnapshot().params.statisticsFilter, filter)
  assert.equal(n.getPageState(list.id, 'search'), 'Cine')
  n.goBack()
  assert.equal(n.getSnapshot().id, statistics.id)
  assert.deepEqual(n.getPageState(statistics.id, 'view'), view)
  assert(n.getPageState(statistics.id, 'view').date instanceof Date)
})

test('Home detail returns to Home and a filtered list returns to the same list', () => {
  const { navigation: n } = session()
  n.navigate('expense-detail', { expenseId: 'a' })
  n.goBack()
  assert.equal(n.getSnapshot().page, 'home')
  n.navigate('expenses')
  const list = n.getSnapshot()
  n.setPageState(list.id, 'filters', { category: 'food', paidBy: 'member', expenseType: 'personal' })
  n.navigate('expense-detail', { expenseId: 'b' })
  n.goBack()
  assert.deepEqual(n.getPageState(n.getSnapshot().id, 'filters'), { category: 'food', paidBy: 'member', expenseType: 'personal' })
})

test('Savings and recurring management unwind multiple levels to the real origin', () => {
  const { navigation: n } = session()
  n.navigate('savings')
  n.navigate('savings-detail', { savingsId: 'trip' })
  n.navigate('savings-detail', { savingsId: 'trip', savingsMode: 'edit' })
  n.goBack()
  assert.equal(n.getSnapshot().params.savingsMode, undefined)
  n.goBack()
  assert.equal(n.getSnapshot().page, 'savings')
  n.goBack()
  assert.equal(n.getSnapshot().page, 'home')
  n.navigate('expense-detail', { expenseId: 'rent' })
  n.navigate('recurring-expenses', { templateId: 'rent-template', recurringMode: 'edit' })
  n.goBack()
  assert.equal(n.getSnapshot().params.expenseId, 'rent')
  n.navigate('recurring-expenses')
  n.navigate('recurring-occurrence', { occurrenceId: 'due' })
  n.goBack()
  assert.equal(n.getSnapshot().page, 'recurring-expenses')
})

test('Settings categories preserves its prior context', () => {
  const { navigation: n } = session()
  n.navigate('settings', {}, { root: true })
  const settings = n.getSnapshot()
  n.setPageState(settings.id, 'section', 'organisation')
  n.navigate('categories')
  n.goBack()
  assert.equal(n.getSnapshot().id, settings.id)
  assert.equal(n.getPageState(settings.id, 'section'), 'organisation')
})

test('browser Back/Forward restore session entries; history stores only opaque markers', () => {
  const { navigation: n, browser, history } = session()
  n.navigate('expenses')
  const list = n.getSnapshot()
  n.setPageState(list.id, 'search', 'private text')
  n.navigate('expense-detail', { expenseId: 'private-id' })
  browser.go(-1)
  assert.equal(n.getSnapshot().id, list.id)
  browser.go(1)
  assert.equal(n.getSnapshot().page, 'expense-detail')
  assert(!JSON.stringify(history).includes('private'))
  assert(!JSON.stringify(history).includes('expense-detail'))
  n.stop()
})

test('main tabs reset to a single root without growing browser history and remember root view state', () => {
  const { navigation: n, history, browser } = session()
  n.navigate('statistics', {}, { root: true })
  n.setPageState(n.getSnapshot().id, 'scope', 'personal')
  for (let i = 0; i < 100; i++) n.navigate(i % 2 ? 'statistics' : 'expenses', {}, { root: true })
  assert.equal(history.length, 1)
  assert.equal(n.getPageState(n.getSnapshot().id, 'scope'), 'personal')
  n.navigate('expenses', { statisticsFilter: { scope: 'personal', categoryName: 'Ocio' } })
  n.navigate('expense-detail', { expenseId: 'a' })
  n.navigate('settings', {}, { root: true })
  assert.equal(n.getSnapshot().page, 'settings')
  assert.equal(n.previous(), null)
  browser.go(1) // An obsolete forward entry must not resurrect the discarded drilldown.
  assert.equal(n.getSnapshot().page, 'settings')
  n.navigate('categories')
  assert.equal(history.length, 2)
})

test('replace completes a creation flow without returning to a submitted form', () => {
  const { navigation: n } = session()
  n.navigate('savings')
  n.navigate('add-savings')
  n.navigate('savings-detail', { savingsId: 'new' }, { replace: true })
  n.goBack()
  assert.equal(n.getSnapshot().page, 'savings')
})

test('new branches discard old forward state and stale async state updates cannot change the current page', () => {
  const { navigation: n, browser } = session()
  n.navigate('expenses')
  const list = n.getSnapshot()
  n.navigate('expense-detail', { expenseId: 'old' })
  n.goBack()
  n.navigate('savings')
  n.setPageState(list.id, 'search', 'late update')
  assert.equal(n.getSnapshot().page, 'savings')
  browser.go(1)
  assert.equal(n.getSnapshot().page, 'savings')
})
