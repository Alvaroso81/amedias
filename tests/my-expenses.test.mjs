import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const require = createRequire(import.meta.url)
const cache = new Map()
function load(file) {
 if (cache.has(file)) return cache.get(file)
 const exports = {};cache.set(file,exports)
 const compiled = ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2023,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
 const localRequire = name => {
  if (name.endsWith('.css')) return {}
  if (name === '../services/settlements') return { SettlementServiceError: class extends Error {} }
  if (!name.startsWith('.')) return require(name)
  const path=resolve(dirname(file),name);return load([path,path+'.ts',path+'.tsx'].find(existsSync))
 }
 new Function('require','module','exports',compiled)(localRequire,{exports},exports)
 return exports
}
const { getMyExpenses, sumExpenses, getCategoryStatistics, getMonthlyEvolution, getMonthlyAverage, getCategoryColor } = load(resolve('src/utils/statistics.ts'))
const { ExpensesPage } = load(resolve('src/pages/ExpensesPage.tsx'))
const { StatisticsCategoryChart } = load(resolve('src/components/StatisticsCategoryChart.tsx'))
const { StatisticsPage } = load(resolve('src/pages/StatisticsPage.tsx'))
const noop = () => {}
const render = (component, props) => renderToStaticMarkup(createElement(component, props)).replaceAll('\u00a0',' ')
const members=[{userId:'me',displayName:'Yo'},{userId:'other',displayName:'Otra persona'}]
function expense(id, amount, share, options={}) {
 return {id,householdId:'h',description:id,amount,expenseType:'common',paymentSource:'member',expenseDate:'2026-10-10',accountingMonth:'2026-10-01',categoryId:'food',category:{id:'food',name:'Comida',icon:'🍎'},
 payments:[{userId:'me',displayName:'Yo',amount}],splits:[{userId:'me',displayName:'Yo',sharePercent:share/amount*100,shareAmount:share},{userId:'other',displayName:'Otra persona',shareAmount:amount-share}],...options}
}
test('Mis gastos uses recorded shares, regardless of who pays, including exact uneven cents',()=>{
 const originals=[expense('fifty',100,50),expense('thirty',100,30),expense('seventy',100,70,{payments:[{userId:'other',amount:100}]}),expense('cent remainder',.03,.01)]
 const before=JSON.stringify(originals)
 const mine=getMyExpenses(originals,'me')
 assert.deepEqual(mine.map(e=>e.amount),[50,30,70,.01])
 assert.equal(sumExpenses(mine),150.01)
 assert.equal(JSON.stringify(originals),before)
 assert.deepEqual(mine.map(e=>e.id),originals.map(e=>e.id))
})
test('Mis gastos includes only own private records and common-fund expense shares',()=>{
 const own=expense('own',20,20,{expenseType:'personal',personalOwnerId:'me'})
 const foreign=expense('private foreign',300,300,{expenseType:'personal',personalOwnerId:'other'})
 const fund=expense('fund purchase',100,70,{paymentSource:'common_fund',payments:[]})
 const noShare=expense('zero',50,0)
 const mine=getMyExpenses([own,foreign,fund,noShare],'me')
 assert.deepEqual(mine.map(e=>e.id),['own','fund purchase'])
 assert.equal(sumExpenses(mine),90)
 // Contributions and settlements are separate records and never passed into spending aggregation.
 assert.equal(sumExpenses(getMyExpenses([fund],'me')),70)
})
test('totals, categories, averages and evolution use the same personal-plus-share amounts',()=>{
 const mine=getMyExpenses([expense('oct',100,30),expense('sep',100,50,{accountingMonth:'2026-09-01'}),expense('own',20,20,{expenseType:'personal',personalOwnerId:'me',categoryId:'leisure',category:{id:'leisure',name:'Ocio',icon:'🎬'}})],'me')
 assert.equal(sumExpenses(mine),100)
 const categories=getCategoryStatistics(mine,[])
 assert.deepEqual(categories.map(c=>[c.key,c.amount,c.count,c.percentage]),[['food',80,2,80],['leisure',20,1,20]])
 const anchor=new Date(2026,9,1)
 assert.deepEqual(getMonthlyEvolution(mine,'month',anchor).slice(-2).map(m=>m.amount),[50,50])
 assert.equal(getMonthlyAverage(mine,'history',anchor,anchor),50)
 assert.equal(getMonthlyEvolution(mine,'year',anchor).reduce((total,m)=>total+m.amount,0),100)
})
test('history evolution covers the full history rather than silently omitting older months',()=>{
 const data=[expense('old',20,10,{accountingMonth:'2025-01-01'}),expense('new',20,10)]
 const evolution=getMonthlyEvolution(getMyExpenses(data,'me'),'history',new Date(2026,9,1))
 assert.equal(evolution.length,22)
 assert.equal(evolution[0].key,'2025-01');assert.equal(evolution.at(-1).key,'2026-10')
 assert.equal(evolution.reduce((sum,m)=>sum+m.amount,0),20)
})
test('category drilldown includes own common shares and private expenses and reconciles its filtered total',()=>{
 const expenses=[expense('Shared food',100,30),expense('Own food',20,20,{expenseType:'personal',personalOwnerId:'me'}),expense('Other category',100,70,{categoryId:'leisure',category:{id:'leisure',name:'Ocio',icon:'🎬'}}),expense('Forbidden private',500,500,{expenseType:'personal',personalOwnerId:'other'})]
 const html=render(ExpensesPage,{expenses,currentUserId:'me',accountingMonthStartDay:1,members,loading:false,error:null,onRetry:noop,onSelectExpense:noop,statisticsFilter:{scope:'personal',categoryId:'food',categoryName:'Comida',periodMode:'month',anchorDate:'2026-10-01'}})
 assert.match(html,/Mis gastos del periodo/);assert.match(html,/<strong>50,00 €/)
 assert.match(html,/Shared food/);assert.match(html,/Own food/);assert.match(html,/30,00 €/)
 assert(!html.includes('Forbidden private'));assert(!html.includes('Other category'))
})
test('donut selection exposes category statistics and stable colors independent of ordering',()=>{
 const categories=getCategoryStatistics([expense('a',100,50),expense('b',20,10),expense('c',40,20,{categoryId:'leisure',category:{id:'leisure',name:'Ocio',icon:'🎬'}})],[])
 const html=render(StatisticsCategoryChart,{categories,selectedKey:'food',onSelect:noop,onViewExpenses:noop})
 assert.match(html,/aria-pressed="true"/);assert.match(html,/Ver gastos de Comida/)
 assert.match(html,/Número de gastos/);assert.match(html,/Ticket medio/);assert.match(html,/60,00 €/)
 const reversedHtml=render(StatisticsCategoryChart,{categories:[...categories].reverse(),selectedKey:'food',onSelect:noop,onViewExpenses:noop})
 assert.match(reversedHtml,new RegExp(getCategoryColor('food')))
 assert.match(reversedHtml,new RegExp(getCategoryColor('leisure')))
 assert.notEqual(getCategoryColor('food'),getCategoryColor('leisure'))
 assert.match(html,new RegExp(getCategoryColor('food')))
})
test('Statistics Mis gastos summary renders the share-based total and new visual cards',()=>{
 const month=new Date();const accountingMonth=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}-01`
 const common=expense('Shared',100,30,{accountingMonth})
 const personal=expense('Own',20,20,{expenseType:'personal',personalOwnerId:'me',accountingMonth})
 const html=render(StatisticsPage,{commonExpenses:[common],personalExpenses:[personal],currentUserId:'me',accountingMonthStartDay:1,members,settlements:[{id:'payment',fromUserId:'me',toUserId:'other',amount:999,settlementDate:accountingMonth}],loading:false,error:null,initialScope:'personal',onViewBalance:noop,onRetry:noop,onSelectCategory:noop})
 assert.match(html,/Mis gastos/);assert.match(html,/Total del periodo/);assert.match(html,/Variación vs periodo anterior/)
 assert.match(html,/Número de gastos/);assert.match(html,/Ticket medio/);assert.match(html,/50,00 €/)
 assert.match(html,/statistics-donut/);assert.match(html,/statistics-month-bars/)
})
