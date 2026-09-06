import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/utils/savings.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText
const { parseSavingsCents, formatSavingsCents, savingsBalance, savingsContributed, savingsTargetShares } =
  await import('data:text/javascript,' + encodeURIComponent(compiled))

test('parses decimal text to exact cents and rejects excess precision/invalid amounts', () => {
  assert.equal(parseSavingsCents('0,29'), 29n)
  assert.equal(parseSavingsCents('1234.5'), 123450n)
  assert.equal(parseSavingsCents('9999999999,99'), 999999999999n)
  for (const value of ['0', '-1', '1.234', '1e3', 'NaN', '', '10000000000', '1,2.3']) {
    assert.throws(() => parseSavingsCents(value))
  }
})
test('withdrawals preserve each participant historical contribution', () => {
  const goal = { movements: [
    { type: 'contribution', contributorUserId: 'a', amountCents: 30000n },
    { type: 'contribution', contributorUserId: 'b', amountCents: 20000n },
    { type: 'withdrawal', contributorUserId: null, amountCents: 10000n },
  ] }
  assert.equal(savingsBalance(goal), 40000n)
  assert.equal(savingsContributed(goal, 'a'), 30000n)
  assert.equal(savingsContributed(goal, 'b'), 20000n)
})
test('30/70 targets and cent remainders are exact and independent of participant ordering', () => {
  const thirty = savingsTargetShares(400000n, [{userId:'a',percentage:30},{userId:'b',percentage:70}])
  assert.equal(thirty.get('a'),120000n)
  assert.equal(thirty.get('b'),280000n)
  const participants = [{userId:'c',percentage:34},{userId:'b',percentage:33},{userId:'a',percentage:33}]
  for (const target of [1n,2n,101n,999999999999n]) {
    const shares = savingsTargetShares(target,participants)
    const reversed = savingsTargetShares(target,[...participants].reverse())
    assert.equal([...shares.values()].reduce((a,b)=>a+b,0n),target)
    for (const [id,cents] of shares) assert.equal(reversed.get(id),cents)
  }
  const tie = savingsTargetShares(1n,[{userId:'b',percentage:50},{userId:'a',percentage:50}])
  assert.equal(tie.get('a'),1n)
  assert.equal(tie.get('b'),0n)
})
test('formatting retains cents without converting bigint totals to floating point', () => {
  assert.equal(formatSavingsCents(29n),'0,29 €')
  assert.equal(formatSavingsCents(9007199254740993n),'90.071.992.547.409,93 €')
})
