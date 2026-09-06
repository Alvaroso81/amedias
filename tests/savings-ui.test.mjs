// Component render checks, not browser or viewport tests.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cache = new Map()
function loadView(filename) {
  if (cache.has(filename)) return cache.get(filename)
  const exports = {}
  cache.set(filename,exports)
  const js = ts.transpileModule(readFileSync(filename,'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const localRequire = specifier => {
    if (!specifier.startsWith('.')) return require(specifier)
    const base = resolve(dirname(filename),specifier)
    const target = [base,base+'.tsx',base+'.ts'].find(path => existsSync(path))
    assert(target, 'Missing component dependency: '+specifier)
    return loadView(target)
  }
  new Function('require','module','exports',js)(localRequire,{exports},exports)
  return exports
}
const { AddActionDialog } = loadView(resolve(root,'src/components/AddActionDialog.tsx'))
const { BottomNavigation } = loadView(resolve(root,'src/components/BottomNavigation.tsx'))
const { SavingsSummaryCard } = loadView(resolve(root,'src/components/SavingsSummaryCard.tsx'))
const { SavingsPage } = loadView(resolve(root,'src/pages/SavingsPage.tsx'))
const noop = () => {}
const render = (component,props) => renderToStaticMarkup(createElement(component,props))
function goal(id,type,cents,archivedAt=null) {
  return { id,name:id,type,archivedAt,targetAmountCents:null,
    movements:[{type:'contribution',amountCents:cents}],participants:[] }
}

test('global + dialog exposes only Gasto, Ahorro and Cancelar with modal semantics', () => {
  const html = render(AddActionDialog,{onCancel:noop,onExpense:noop,onSavings:noop})
  assert.match(html,/¿Qué quieres añadir\?/)
  assert.match(html,/role="dialog"/)
  assert.match(html,/aria-modal="true"/)
  assert.equal((html.match(/<button/g) ?? []).length,3)
  for (const label of ['Gasto','Ahorro','Cancelar']) assert(html.includes(label))
})
test('bottom navigation remains five buttons with the global add selector', () => {
  const html = render(BottomNavigation,{
    currentPage:'savings',onAdd:noop,onGoExpenses:noop,onGoHome:noop,onGoStatistics:noop,onGoSettings:noop,
  })
  assert.equal((html.match(/<button/g) ?? []).length,5)
  assert.match(html,/aria-haspopup="dialog"/)
  assert(!html.includes('>Ahorros<'))
})
test('Home keeps visible shared and personal savings separate and excludes archived goals', () => {
  const html = render(SavingsSummaryCard,{
    goals:[goal('shared','shared',645000n),goal('personal','personal',85000n),goal('archived','shared',999999n,'2026-09-06')],
    loading:false,error:null,onOpen:noop,
  })
  assert.match(html,/6\.450,00 €/)
  assert.match(html,/850,00 €/)
  assert.match(html,/1 objetivo activo/)
  assert(!html.includes('7.300,00'))
  assert(!html.includes('9.999,99'))
})
test('savings list has separate sections and progress without mixing balances', () => {
  const shared = {...goal('Viaje Japón','shared',135000n),targetAmountCents:400000n}
  const html = render(SavingsPage,{
    goals:[shared,goal('Móvil','personal',45000n),goal('Anterior','shared',100n,'2026-09-06')],
    loading:false,error:null,onRetry:noop,onBack:noop,onCreate:noop,onOpen:noop,
  })
  for (const title of ['Compartidos','Personales','Archivados','Nuevo ahorro','Viaje Japón','Móvil','Anterior']) assert(html.includes(title))
  assert.match(html,/34 % del objetivo/)
  assert.match(html,/1\.350,00 €/)
  assert.match(html,/4\.000,00 €/)
})
