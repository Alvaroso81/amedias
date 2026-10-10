import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
}).outputText
const utilitySource = await readFile(new URL('../src/utils/passwordRecovery.ts', import.meta.url), 'utf8')
const hookSource = await readFile(new URL('../src/hooks/useAuth.ts', import.meta.url), 'utf8')

function utilities(href = 'https://example.test/amedias/') {
  const window = { location: { href }, history: { state: null, replaceState(_state, _title, url) { window.location.href = String(url) } } }
  const exports = {}
  runInNewContext(compile(utilitySource), { exports, window, URL, URLSearchParams })
  return { ...exports, window }
}

test('captures dashboard recovery before SDK consumes fragment and survives a reload', () => {
  const u = utilities('https://example.test/amedias/#access_token=test-token&refresh_token=test-refresh&type=recovery')
  assert.equal(u.capturePasswordRecovery().active, true)
  let url = new URL(u.window.location.href)
  assert.equal(url.hash.includes('access_token=test-token'), true)
  assert.equal(url.search, '?password-recovery=1')
  url.hash = ''
  u.window.location.href = url.toString()
  assert.equal(u.readPasswordRecoveryUrl(u.window.location.href).active, true)
  u.clearPasswordRecovery()
  assert.equal(u.window.location.href, 'https://example.test/amedias/')
})

test('invalid link stays invalid after reload even if SDK retains an older session', () => {
  const u = utilities('https://example.test/amedias/#error=access_denied&error_code=otp_expired')
  assert.equal(u.capturePasswordRecovery().invalid, true)
  u.markPasswordRecovery(true)
  assert.equal(new URL(u.window.location.href).hash, '')
  assert.equal(u.readPasswordRecoveryUrl(u.window.location.href).invalid, true)
})

test('login, registration and household invitations are not recovery links', () => {
  const u = utilities()
  for (const suffix of ['', '?invite=household-token', '#type=signup&access_token=signup-token']) {
    assert.equal(u.readPasswordRecoveryUrl('https://example.test/amedias/' + suffix).active, false)
  }
})

test('redirect uses deployment base without copying tokens or unrelated parameters', () => {
  const u = utilities()
  assert.equal(u.createPasswordRecoveryRedirectUrl('https://example.test', '/amedias/'),
    'https://example.test/amedias/?password-recovery=1')
  assert.equal(u.createPasswordRecoveryRedirectUrl('http://localhost:5173', '/'),
    'http://localhost:5173/?password-recovery=1')
})

test('new password requires length and matching confirmation, never the forgotten password', () => {
  const u = utilities()
  assert.ok(u.validateRecoveryPassword('', ''))
  assert.ok(u.validateRecoveryPassword('short', 'short'))
  assert.ok(u.validateRecoveryPassword('new-password', 'different'))
  assert.equal(u.validateRecoveryPassword('new-password', 'new-password'), null)
})

async function hook({ initial = { active: false, invalid: false }, callbackError = null, deferredSession = null } = {}) {
  const user = { id: 'recovery-user', email: 'recovery@example.test' }
  const session = { user }
  let listener, cleanup, timeout, index = 0, mounted = false, finished = 0
  const state = [], marks = []
  const auth = {
    initialize: async () => ({ error: callbackError }),
    getSession: () => deferredSession ?? Promise.resolve({ data: { session }, error: null }),
    getUser: async () => ({ data: { user }, error: null }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (fn) => { listener = fn; return { data: { subscription: { unsubscribe() {} } } } },
  }
  const exports = {}
  runInNewContext(compile(hookSource), { exports,
    window: { setTimeout: (fn) => { timeout = fn; return 1 }, clearTimeout() {} },
    require: (name) => {
      if (name === 'react') return {
        useState: (initial) => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value }] },
        useEffect: (fn) => { if (!mounted) { mounted = true; cleanup = fn() } },
      }
      if (name === '@supabase/supabase-js') return { isAuthRetryableFetchError: () => false }
      if (name.includes('passwordRecovery')) return { clearPasswordRecovery: () => { finished++ }, markPasswordRecovery: (invalid = false) => marks.push(invalid) }
      return { initialPasswordRecovery: initial, supabase: { auth } }
    },
  })
  const render = () => { index = 0; return exports.useAuth() }
  render()
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
  return { render, flush, emit: (event) => listener(event, session), cleanup: () => cleanup(), timeout: () => timeout(), marks, finished: () => finished, session }
}

test('PASSWORD_RECOVERY arriving before bootstrap completes is not lost', async () => {
  let resolve
  const deferredSession = new Promise(r => { resolve = r })
  const h = await hook({ deferredSession })
  h.emit('PASSWORD_RECOVERY')
  assert.equal(h.render().isPasswordRecovery, true)
  resolve({ data: { session: h.session }, error: null })
  await h.flush()
  assert.equal(h.render().loading, false)
  assert.equal(h.render().isPasswordRecovery, true)
  h.emit('USER_UPDATED')
  assert.equal(h.render().isPasswordRecovery, true)
  h.render().finishPasswordRecovery()
  assert.equal(h.render().isPasswordRecovery, false)
  assert.equal(h.finished(), 1)
  h.cleanup()
})

test('bad callback cannot authorize the reset screen using a previous login', async () => {
  const h = await hook({ initial: { active: true, invalid: false }, callbackError: { message: 'Invalid token' } })
  await h.flush()
  assert.ok(h.render().user)
  assert.equal(h.render().recoveryInvalid, true)
  assert.deepEqual(h.marks, [true])
  h.cleanup()
})

test('normal sign-in remains normal and bootstrap timeout protection is preserved', async () => {
  const h = await hook()
  await h.flush()
  assert.ok(h.render().user)
  assert.equal(h.render().isPasswordRecovery, false)
  h.cleanup()
  const stalled = await hook({ deferredSession: new Promise(() => {}) })
  stalled.timeout()
  assert.equal(stalled.render().loading, false)
  assert.match(stalled.render().error, /conectar/)
  stalled.cleanup()
})
