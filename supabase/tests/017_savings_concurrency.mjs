// LOCAL disposable DB only: node this-file.mjs /path/psql /tmp/socket test_db
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'

const [psql, host, database] = process.argv.slice(2)
assert(psql && /^\/(?:private\/)?tmp\//.test(host ?? '') && /test/i.test(database ?? ''),
  'Provide psql, a local /tmp socket directory, and a disposable test database.')
const args = ['-X', '-h', host, '-p', '55432', '-d', database, '-v', 'ON_ERROR_STOP=1', '-Atq']
function query(sql, onOutput) {
  const child = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = '', error = ''
  const timer = setTimeout(() => child.kill(), 15000)
  const result = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.stdout.on('data', chunk => { output += chunk; onOutput?.(output) })
    child.stderr.on('data', chunk => { error += chunk })
    child.on('close', code => { clearTimeout(timer); resolve({ code, output, error }) })
  })
  child.stdin.end(sql)
  return result
}
const owner = randomUUID(), household = randomUUID()
const auth = "set role authenticated; select set_config('request.jwt.claim.sub','" + owner + "',false);"
const setup = await query([
  "insert into auth.users(id,email) values ('" + owner + "','concurrent-" + owner + "@example.test');",
  "insert into public.households(id,name,created_by) values ('" + household + "','Concurrent savings test','" + owner + "');",
  auth,
  "select public.create_savings_goal('" + household + "','100 EUR concurrent','personal',null,null,null);",
].join('\n'))
assert.equal(setup.code, 0, setup.error)
const goal = setup.output.trim().split('\n').at(-1)
assert.match(goal, /^[a-f0-9-]{36}$/)
const contribution = await query(auth + "select public.add_savings_contribution('" + goal + "',10000,'" + owner + "','2026-09-06',null);")
assert.equal(contribution.code, 0, contribution.error)

let resolveLocked
const locked = new Promise(resolve => { resolveLocked = resolve })
const first = query([
  'begin;', auth,
  "select public.withdraw_from_savings_goal('" + goal + "',8000,'2026-09-06','first');",
  "select 'LOCK_HELD';",
  'select pg_sleep(1); commit;',
].join('\n'), output => { if (output.includes('LOCK_HELD')) resolveLocked() })
await Promise.race([locked, first.then(result => { throw new Error('First transaction failed before lock: ' + result.error) })])
const second = query(auth + "select public.withdraw_from_savings_goal('" + goal + "',8000,'2026-09-06','second');")
const [a,b] = await Promise.all([first,second])
assert.equal(a.code,0,a.error)
assert.notEqual(b.code,0,'Both withdrawals succeeded')
assert.match(b.error,/SAVINGS_INSUFFICIENT_BALANCE/)
const result = await query(auth + [
  "select sum(case when movement_type='contribution' then amount_cents else -amount_cents end) from public.savings_movements where goal_id='" + goal + "';",
  "select count(*) from public.savings_movements where goal_id='" + goal + "' and movement_type='withdrawal';",
].join('\n'))
assert.equal(result.code,0,result.error)
assert.deepEqual(result.output.trim().split('\n').slice(-2),['2000','1'])
console.log('SAVINGS_CONCURRENCY_N_PASSED: one withdrawal succeeded; one rejected; balance 20 EUR.')
