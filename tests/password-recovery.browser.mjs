// Optional browser check: use an installed Playwright via PLAYWRIGHT_MODULE.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
import assert from 'node:assert/strict'
const browser = await chromium.launch({channel:'chrome', headless:true})
const base = 'http://127.0.0.1:5179/amedias/'
const user = {id:'11111111-1111-4111-8111-111111111111', aud:'authenticated',role:'authenticated',email:'recovery@example.test',app_metadata:{provider:'email'},user_metadata:{},identities:[],created_at:'2026-01-01T00:00:00Z'}
const encode = x => Buffer.from(JSON.stringify(x)).toString('base64url')
const token = encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),session_id:'test-session'})+'.test-signature'
const session = {access_token:token,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user}
const hash = '#access_token='+token+'&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery'
async function setup(width=390, prior=false) {
 const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'})
 const calls=[]; const failures=[]; const mode={recover:200,update:200,getUser:200}
 await context.route('**/*',async route=>{
  const request=route.request(); const url=new URL(request.url())
  if(url.origin==='http://127.0.0.1:5179') return route.continue()
  if(url.origin!=='https://amedias-auth.test') { failures.push('Unexpected origin: '+url.origin); return route.abort() }
  calls.push({path:url.pathname,method:request.method(),body:request.postDataJSON(),query:url.searchParams})
  let status=200,body={}
  if(url.pathname==='/auth/v1/recover') {status=mode.recover;body=status===200?{}:{message:'Email rate limit exceeded',code:'over_email_send_rate_limit'}}
  else if(url.pathname==='/auth/v1/user') {status=request.method()==='PUT'?mode.update:mode.getUser;body=status===200?user:{message:'Password is weak',code:status===422?'weak_password':'bad_jwt'}}
  else if(url.pathname==='/auth/v1/logout') body={}
  else if(url.pathname==='/auth/v1/token') body=session
  else if(url.pathname.startsWith('/rest/')) body=[]
  else failures.push('Unexpected path: '+url.pathname)
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
 })
 if(prior) await context.addInitScript(s=>localStorage.setItem('sb-amedias-auth-auth-token',JSON.stringify(s)),session)
 const page=await context.newPage();page.on('pageerror',e=>failures.push(e.message));page.setDefaultTimeout(10000)
 return {context,page,calls,mode,failures}
}
async function visible(page,text){await page.getByText(text,{exact:true}).waitFor({state:'visible'})}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
try {
 const a=await setup()
 await a.page.goto(base)
 await a.page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click()
 await a.page.getByLabel('Correo electrónico').fill('bad-email')
 await a.page.getByRole('button',{name:'Enviar enlace de recuperación'}).click()
 await visible(a.page,'Introduce un correo electrónico válido.')
 assert.equal(a.calls.length,0)
 a.mode.recover=429
 await a.page.getByLabel('Correo electrónico').fill('recovery@example.test')
 await a.page.getByRole('button',{name:'Enviar enlace de recuperación'}).click()
 await visible(a.page,'Has realizado demasiados intentos. Espera un momento y vuelve a probar.')
 a.mode.recover=200
 await a.page.getByRole('button',{name:'Enviar enlace de recuperación'}).click()
 await visible(a.page,'Revisa tu correo')
 assert.equal(a.calls.at(-1).query.get('redirect_to'),base+'?password-recovery=1')
 assert.equal(a.calls.at(-1).body.email,'recovery@example.test')
 await noOverflow(a.page)
 await a.page.screenshot({path:'/tmp/amedias-recovery-request.png',fullPage:true})
 assert.deepEqual(a.failures,[])
 await a.context.close()
 console.log('PASS request: invalid email, rate limit, retry, neutral confirmation, redirect')

 for (const width of [360,390,430,1280]) {
  const b=await setup(width)
  await b.page.goto(base+hash)
  await visible(b.page,'Elige una nueva contraseña')
  assert.equal(b.calls.some(c=>c.path.startsWith('/rest/')),false)
  await b.page.reload()
  await visible(b.page,'Elige una nueva contraseña')
  await b.page.getByLabel('Nueva contraseña',{exact:true}).fill('new-test-password')
  await b.page.getByLabel('Repetir nueva contraseña').fill('wrong-password')
  await b.page.getByRole('button',{name:'Guardar nueva contraseña'}).click()
  await visible(b.page,'Las contraseñas no coinciden.')
  assert.equal(b.calls.some(c=>c.method==='PUT'),false)
  await b.page.getByLabel('Repetir nueva contraseña').fill('new-test-password')
  b.mode.update=422
  await b.page.getByRole('button',{name:'Guardar nueva contraseña'}).click()
  await visible(b.page,'La nueva contraseña no cumple los requisitos de seguridad.')
  b.mode.update=200
  await noOverflow(b.page)
  await b.page.screenshot({path:`/tmp/amedias-recovery-${width}.png`,fullPage:true})
  await b.page.getByRole('button',{name:'Guardar nueva contraseña'}).click()
  await visible(b.page,'Contraseña actualizada')
  const updates=b.calls.filter(c=>c.method==='PUT')
  assert.equal(updates.length,2)
  assert.equal(updates.at(-1).body.password,'new-test-password')
  assert.equal('current_password' in updates.at(-1).body,false)
  assert.equal(b.calls.some(c=>c.path.startsWith('/rest/')),false)
  await b.page.getByRole('button',{name:'Continuar a Amedias'}).click()
  assert.equal(new URL(b.page.url()).searchParams.has('password-recovery'),false)
  assert.deepEqual(b.failures,[])
  await b.context.close()
  console.log(`PASS recovery ${width}px: callback, reload, validation, rejected update, success, explicit exit`)
 }
 for(const suffix of ['#error=access_denied&error_code=otp_expired&error_description=Expired', '#access_token=bad&refresh_token=bad&expires_in=3600&token_type=bearer&type=recovery']) {
  const c=await setup(390,true)
  if(suffix.includes('access_token=bad'))c.mode.getUser=401
  await c.page.goto(base+suffix)
  await visible(c.page,'Recuperar contraseña')
  assert.equal(await c.page.getByLabel('Nueva contraseña',{exact:true}).count(),0)
  assert.equal(c.calls.some(c=>c.method==='PUT'||c.path.startsWith('/rest/')),false)
  c.mode.getUser=200
  await c.page.reload()
  await visible(c.page,'Recuperar contraseña')
  assert.equal(await c.page.getByLabel('Nueva contraseña',{exact:true}).count(),0)
  assert.deepEqual(c.failures,[])
  await c.context.close()
 }
 console.log('PASS invalid links with existing login: expired/malformed, reload, no update or household fetch')
 const cancelled=await setup()
 await cancelled.page.goto(base+hash)
 await visible(cancelled.page,'Elige una nueva contraseña')
 await cancelled.page.getByRole('button',{name:'Cancelar',exact:true}).click()
 await cancelled.page.getByRole('button',{name:'Entrar',exact:true}).waitFor()
 assert.equal(cancelled.calls.some(c=>c.path==='/auth/v1/logout'),true)
 assert.equal(cancelled.calls.some(c=>c.method==='PUT'),false)
 assert.equal(new URL(cancelled.page.url()).search,'')
 await cancelled.context.close()
 console.log('PASS cancellation: recovery session closed, no password update')
 const offline=await setup()
 await offline.page.goto(base)
 await offline.page.getByRole('button',{name:'¿Olvidaste tu contraseña?'}).click()
 await offline.page.getByLabel('Correo electrónico').fill('recovery@example.test')
 await offline.page.route('**/auth/v1/recover**',r=>r.abort('failed'))
 await offline.page.getByRole('button',{name:'Enviar enlace de recuperación'}).click()
 await visible(offline.page,'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.')
 assert.equal(await offline.page.getByRole('button',{name:'Enviar enlace de recuperación'}).isEnabled(),true)
 await offline.context.close()
 console.log('PASS network error: retry available, no false success')
 const d=await setup()
 await d.page.goto(base+'?password-recovery=1')
 await visible(d.page,'Recuperar contraseña')
 await d.page.getByRole('button',{name:'Volver a iniciar sesión'}).click()
 await d.page.getByRole('button',{name:'Entrar',exact:true}).waitFor()
 assert.equal(new URL(d.page.url()).search,'')
 await d.context.close()
 console.log('PASS missing session: new recovery request and back to login')
} finally {await browser.close()}
