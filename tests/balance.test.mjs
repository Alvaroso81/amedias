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
const { getBalanceBreakdown } = load(resolve('src/utils/balance.ts'))
const { getCurrentBalance } = load(resolve('src/utils/statistics.ts'))
const members=[{userId:'a',displayName:'Álvaro'},{userId:'r',displayName:'Rosario'}]
function expense(id,amount,payer='a',type='common',source='member',date='2026-10-01') {
 return {id,amount,expenseType:type,paymentSource:source,expenseDate:date,createdAt:date,description:id,
 payments:[{userId:payer,displayName:members.find(m=>m.userId===payer).displayName,amount}],
 splits:[{userId:'a',displayName:'Álvaro',shareAmount:amount/2},{userId:'r',displayName:'Rosario',shareAmount:amount/2}]}
}
function settlement(amount,from='r',to='a',date='2026-10-02') {return {id:'s'+amount,amount,fromUserId:from,toUserId:to,settlementDate:date,createdAt:date}}
function assertReconciles(expenses,settlements,user='a') {
 const result=getBalanceBreakdown(expenses,settlements,members,user)
 const totals=new Map(members.map(m=>[m.userId,0]))
 for(const row of result.rows) for(const impact of row.impacts) totals.set(impact.userId,(totals.get(impact.userId)??0)+Math.round(impact.amount*100))
 assert.equal(totals.get(user),Math.round(result.balance.currentUserAmount*100))
 const canonical=getCurrentBalance(expenses.filter(e=>e.expenseType==='common'),settlements,members)
 assert.equal(result.balance.amount,canonical.amount)
 assert.equal(result.balance.creditor?.member.userId??null,canonical.creditor?.userId??null)
 assert.equal(result.rows.at(-1)?.balance.amount??0,result.balance.amount)
 return result
}
test('all included effects and final running balance reconcile with the current formula',()=>{
 const expenses=[expense('Mercadona',80),expense('Ocio',51,'r')]
 const result=assertReconciles(expenses,[settlement(10)])
 assert.equal(result.balance.amount,4.5);assert.equal(result.rows.length,3)
 assert.equal(result.rows[0].balance.amount,40)
})
test('personal expenses and common fund payments never enter the balance ledger',()=>{
 const result=assertReconciles([expense('included',80),expense('secret',200,'a','personal'),expense('fund',400,'a','common','common_fund')],[])
 assert.deepEqual(result.rows.map(r=>r.record.id),['included']);assert.equal(result.balance.amount,40)
})
test('a partial settlement reduces the same debt, and a total settlement equilibrates it',()=>{
 const expenses=[expense('Purchase',200)]
 assert.equal(assertReconciles(expenses,[settlement(25)]).balance.amount,75)
 assert.equal(assertReconciles(expenses,[settlement(100)]).balance.amount,0)
 assert.equal(assertReconciles(expenses,[settlement(100)]).balance.creditor,null)
})
test('overpayment reverses the balance; reverse-direction payments increase it',()=>{
 assert.equal(assertReconciles([expense('Purchase',200)],[settlement(120)]).balance.creditor.member.userId,'r')
 assert.equal(assertReconciles([expense('Purchase',200)],[settlement(20,'a','r')]).balance.amount,120)
})
test('amounts reconcile in cents with mixed payers, uneven shares and many small entries',()=>{
 const expenses=Array.from({length:1000},(_,i)=>({...expense('e'+i,.03,i%2?'a':'r'),splits:[{userId:'a',displayName:'Álvaro',shareAmount:.01},{userId:'r',displayName:'Rosario',shareAmount:.02}]}))
 assert.equal(assertReconciles(expenses,[]).balance.amount,5)
 const mixed={...expense('mixed',80),payments:[{userId:'a',amount:60,displayName:'Álvaro'},{userId:'r',amount:20,displayName:'Rosario'}]}
 assert.equal(assertReconciles([mixed],[]).balance.amount,20)
})
test('chronological ledger includes older common expenses and can be viewed by either member',()=>{
 const result=assertReconciles([expense('new',80,'a','common','member','2026-10-03'),expense('old',20,'r','common','member','2025-01-01')],[settlement(5)],'r')
 assert.deepEqual(result.rows.map(r=>r.record.id),['old','s5','new'])
 assert.equal(result.balance.currentUserAmount,-25)
})

test('the household view reconciles with Statistics even when the viewer is a third member',()=>{
 const householdMembers=[...members,{userId:'third',displayName:'Tercero'}]
 const purchase=expense('shared',200)
 const result=getBalanceBreakdown([purchase],[],householdMembers,'third','household')
 const canonical=getCurrentBalance([purchase],[],householdMembers)
 assert.equal(result.balance.amount,canonical.amount)
 assert.equal(result.balance.creditor.member.userId,canonical.creditor.userId)
 assert.equal(result.balance.debtor.member.userId,canonical.debtor.userId)
 assert.equal(result.balance.currentUserAmount,0)
 assert.equal(result.rows.at(-1).balance.amount,100)
 assert.equal(getBalanceBreakdown([purchase],[],householdMembers,'third').balance.amount,0)
})

const { BalanceCard } = load(resolve('src/components/BalanceCard.tsx'))
const { SettlementDetailPage } = load(resolve('src/pages/SettlementDetailPage.tsx'))
const { BalanceDetailPage } = load(resolve('src/pages/BalanceDetailPage.tsx'))
const noop = () => {}
const render = (component, props) => renderToStaticMarkup(createElement(component, props))
test('the same balance offers He pagado to the debtor and He recibido to the creditor',()=>{
 const props={debtor:'Álvaro',creditor:'Rosario',amount:100,canSettle:true,onSettleAccounts:noop,onViewDetails:noop}
 assert.match(render(BalanceCard,{...props,status:'payable'}),/He pagado a Rosario/)
 assert.match(render(BalanceCard,{...props,status:'receivable'}),/He recibido de Álvaro/)
 assert.match(render(BalanceCard,{...props,status:'receivable'}),/aria-label="Ver detalle del balance"/)
 const balanced=render(BalanceCard,{...props,status:'settled',amount:0})
 assert.match(balanced,/Estáis equilibrados/);assert(!balanced.includes('He recibido'))
})
test('only settlement participants see edit and delete actions; third members retain read access',()=>{
 const props={settlement:settlement(25),members,statusMessage:null,onBack:noop,onEdit:noop,onDelete:async()=>{}}
 for(const currentUserId of ['a','r']) {
  const html=render(SettlementDetailPage,{...props,currentUserId})
  assert.match(html,/Editar liquidación/);assert.match(html,/Eliminar liquidación/)
 }
 const html=render(SettlementDetailPage,{...props,currentUserId:'third'})
 assert(!html.includes('Editar liquidación'));assert(!html.includes('Eliminar liquidación'))
 assert.match(html,/25,00/);assert.match(html,/Rosario/);assert.match(html,/Álvaro/)
})

test('the detail displays newest movements first while retaining chronological accumulated balances',()=>{
 const expenses=[expense('Gasto antiguo',20,'a','common','member','2026-10-01'),expense('Gasto reciente',80,'a','common','member','2026-10-03')]
 const settlements=[settlement(25,'r','a','2026-10-04')]
 const props={expenses,settlements,members,currentUserId:'a',loading:false,error:null,onRetry:noop,onSelectExpense:noop,onSelectSettlement:noop,onSettleAccounts:noop}
 const html=render(BalanceDetailPage,props).replaceAll('\u00a0',' ')
 const movements=html.split('class="card balance-ledger-row"').slice(1)
 assert.equal(movements.length,3)
 assert(movements[0].indexOf('Pago de Rosario a Álvaro')<movements[0].indexOf('25,00'))
 assert(movements[1].indexOf('Gasto reciente')<movements[1].indexOf('50,00'))
 assert(movements[2].indexOf('Gasto antiguo')<movements[2].indexOf('10,00'))
 assert(movements[0].split('Saldo acumulado')[1].includes('25,00'))
 assert(movements[1].split('Saldo acumulado')[1].includes('50,00'))
 assert(movements[2].split('Saldo acumulado')[1].includes('10,00'))
 assert.match(html,/del más reciente al más antiguo/)
 const chronological=getBalanceBreakdown(expenses,settlements,members,'a')
 assert.deepEqual(chronological.rows.map(row=>row.record.id),['Gasto antiguo','Gasto reciente','s25'])
 assert.equal(chronological.balance.amount,25)
})
