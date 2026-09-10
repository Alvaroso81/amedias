import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { runInNewContext } from 'node:vm'

async function moduleUrl(path) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8')
  for (const match of [...source.matchAll(/from '(\.\.?\/[^']+)'/g)]) {
    const dependency = new URL(match[1] + (match[1].endsWith('.ts') ? '' : '.ts'), new URL(path, import.meta.url))
    source = source.replace(match[0], `from ${JSON.stringify(await moduleUrl(dependency.href))}`)
  }
  return 'data:text/javascript,' + encodeURIComponent(ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
  }).outputText)
}
const { parseReceipt, parseReceiptBlocks, receiptLines } = await import(await moduleUrl('../src/utils/receiptParser.ts'))
const { MAX_IMAGE_BYTES, validateReceipt } = await import(await moduleUrl('../src/types/receiptScan.ts'))
const categories = [{ id: 'super', name: 'Supermercado' }, { id: 'transport', name: 'Transporte' },
  { id: 'clothes', name: 'Ropa' }, { id: 'food', name: 'Restaurantes' }]

test('A: Mercadona subtotal and IVA are not the final total', () => {
  const result = parseReceipt('MERCADONA\nSUBTOTAL 60,00\nIVA 8,42\nTOTAL 68,42', categories)
  assert.equal(result.totalCents, 6842)
})
test('B: tender/change and larger numbers never replace TOTAL', () => {
  assert.equal(parseReceipt('TOTAL 20,50\nENTREGADO 30\nCAMBIO 9,50', []).totalCents, 2050)
})
test('C: Spanish dates, real calendar validation and ambiguity', () => {
  for (const date of ['06/09/2026', '06-09-2026', '06.09.2026', '06/09/26']) {
    assert.equal(parseReceipt(date, []).date, '2026-09-06')
  }
  assert.equal(parseReceipt('31/02/2026', []).date, null)
  assert.equal(parseReceipt('06/09/2026\n07/09/2026', []).date, null)
  assert.equal(parseReceipt('CADUCIDAD 06/09/2026', []).date, null)
})
test('D: comma, point, currency and thousands convert to integer cents', () => {
  for (const amount of ['68,42', '68.42', '68,42 €', '€ 68,42']) {
    assert.equal(parseReceipt('TOTAL ' + amount, []).totalCents, 6842)
  }
  assert.equal(parseReceipt('TOTAL EUR 1.234,56', []).totalCents, 123456)
  assert.equal(parseReceipt('TOTAL\n68,42', []).totalCents, 6842)
})
test('E/F: missing total/date and ambiguous totals remain empty', () => {
  const result = parseReceipt('MERCADONA\nSUBTOTAL 60,00\nIVA 8,42', categories)
  assert.equal(result.totalCents, null)
  assert.equal(result.date, null)
  assert.equal(parseReceipt('TOTAL 20,50\nTOTAL 30,50', []).totalCents, null)
  assert.equal(parseReceipt('TOTAL 20,50 30,50', []).totalCents, null)
  assert.equal(parseReceipt('TOTAL USD 20.50', []).totalCents, null)
  assert.equal(parseReceipt('TOTAL -20,50', []).totalCents, null)
  assert.equal(parseReceipt('TOTAL 20,50', [], 30).totalCents, null)
})
test('G/H/I: merchant skips metadata; category must exist by normalized name', () => {
  const result = parseReceipt('FACTURA SIMPLIFICADA\nCIF A123\nCalle Mayor\nMERCADONA\nTOTAL 20,50', categories)
  assert.equal(result.merchant, 'Mercadona')
  assert.equal(result.suggestedCategoryId, 'super')
  assert.equal(parseReceipt('MERCADONA\nTOTAL 20,50', []).suggestedCategoryId, null)
  for (const [merchant, id] of [['Repsol', 'transport'], ['Zara', 'clothes'], ["McDonald's", 'food'], ['Bar Pepe', 'food']]) {
    assert.equal(parseReceipt(merchant + '\nTOTAL 20,50', categories).suggestedCategoryId, id)
  }
})
test('scanner has no upload/auth/storage integration and retains manual form boundary', async () => {
  const service = await readFile(new URL('../src/services/receiptScanner.ts', import.meta.url), 'utf8')
  const worker = await readFile(new URL('../src/services/receiptOcr.worker.ts', import.meta.url), 'utf8')
  const local = await readFile(new URL('../src/services/localReceiptOcr.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(service + worker + local, /supabase|OPENAI|Authorization|FormData|localStorage|\.rpc\(/)
  assert.match(service, /await import\('\.\/localReceiptOcr'\)/)
  assert.match(local, /worker\.terminate\(\)/)
  const page = await readFile(new URL('../src/pages/AddExpensePage.tsx', import.meta.url), 'utf8')
  const callback = page.slice(page.indexOf('<ReceiptScanner'), page.indexOf('<form className="add-expense-form"'))
  assert.doesNotMatch(callback, /createExpense|handleSubmit|setPaidBy|setPaymentSource|setSplits|setNote/)
})

test('worker lifecycle releases resources on result, error and cancellation during initialization', async () => {
  const source = (await readFile(new URL('../src/services/localReceiptOcr.ts', import.meta.url), 'utf8'))
    .replace("new URL('./receiptOcr.worker.ts', import.meta.url)", "'test-worker'")
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS,
  } }).outputText
  const instances = []
  const exports = {}
  runInNewContext(compiled, { exports, DOMException,
    require: () => ({ validateReceipt }),
    Worker: class {
      terminated = false
      constructor() { instances.push(this) }
      terminate() { this.terminated = true }
      postMessage(value) { this.payload = value }
    },
  })
  for (const outcome of ['result', 'error', 'abort']) {
    const controller = new AbortController()
    const promise = exports.localReceiptOcr([new Blob(['image'])], categories, controller.signal)
    const worker = instances.at(-1)
    assert.equal(worker.terminated, false)
    if (outcome === 'result') {
      worker.onmessage({ data: { type: 'result', result: parseReceipt('TOTAL 20,50', categories) } })
      assert.equal((await promise).totalCents, 2050)
    } else {
      if (outcome === 'abort') controller.abort()
      else worker.onmessage({ data: { type: 'error' } })
      await assert.rejects(promise)
    }
    assert.equal(worker.terminated, true)
  }
  assert.equal(instances.length, 3)
})

const blocks = (...texts) => texts.map((text, index) => ({ index, text, confidence: 95 }))
test('multiphoto A: header, products and footer produce one receipt', () => {
  const result = parseReceiptBlocks(blocks('MERCADONA S.A.\n06/09/2026', 'productos...', 'SUBTOTAL 60,00\nIVA 8,42\nTOTAL 68,42'), categories)
  assert.equal(result.merchant, 'Mercadona')
  assert.equal(result.totalCents, 6842)
  assert.equal(result.date, '2026-09-06')
  assert.equal(result.suggestedCategoryId, 'super')
})
test('multiphoto B: consecutive and boundary overlap deduplicate without damaging totals', () => {
  const input = blocks('MERCADONA\n06/09/2026\n06/09/2026\nPAN 1,00', 'PAN 1,00\nTOTAL 68,42', 'TOTAL 68,42\nEFECTIVO 100,00\nCAMBIO 31,58')
  assert.equal(receiptLines(input).filter((line) => line.text === 'TOTAL 68,42').length, 1)
  assert.equal(parseReceiptBlocks(input, categories).totalCents, 6842)
  assert.equal(parseReceiptBlocks(input, categories).date, '2026-09-06')
})
test('multiphoto C/D: later known merchant and final total, never tender/change', () => {
  const result = parseReceiptBlocks(blocks('TICKET\nCAJA 1\n06/09/2026', 'CARREFOUR EXPRESS', 'TOTAL 20,50\nEFECTIVO 30,00\nCAMBIO 9,50'), categories)
  assert.equal(result.merchant, 'Carrefour')
  assert.equal(result.totalCents, 2050)
})
test('multiphoto E: metadata-only or unclear merchant stays null', () => {
  const result = parseReceiptBlocks(blocks('FACTURA SIMPLIFICADA\nCAJA\nEMPLEADO JUAN\nwww.tienda.es\ncontacto@tienda.es\nCIF B123\nCALLE MAYOR\nTEL 999999999', 'TOTAL 20,50'), categories)
  assert.equal(result.merchant, null)
  assert.equal(result.suggestedCategoryId, null)
})
test('merchant aliases normalize legal and store names; categories remain actual IDs', () => {
  for (const [text, merchant] of [['MERCADONA, S.A.', 'Mercadona'], ['LIDL SUPERMERCADOS', 'Lidl'], ['CARREFOUR MARKET', 'Carrefour'], ['CEPSA', 'Cepsa'], ['ZARA', 'Zara']]) {
    assert.equal(parseReceipt(text, categories).merchant, merchant)
    assert.equal(parseReceipt(text, []).suggestedCategoryId, null)
  }
  assert.equal(parseReceipt('CIF B123\nBar Pepe\nTOTAL 20,50', categories).merchant, 'Bar Pepe')
})
test('position biases final total and initial date; early explicit total remains useful', () => {
  assert.equal(parseReceiptBlocks(blocks('TOTAL 90,00', 'TOTAL 20,50'), []).totalCents, 2050)
  assert.equal(parseReceiptBlocks(blocks('TOTAL A PAGAR 20,50', 'TOTAL 90,00'), []).totalCents, 2050)
  assert.equal(parseReceiptBlocks(blocks('06/09/2026', '07/09/2026'), []).date, '2026-09-06')
  assert.equal(parseReceiptBlocks(blocks('MERCADONA', 'TOTAL 20,50\nTOTAL 30,50'), []).totalCents, null)
  assert.equal(parseReceiptBlocks(blocks('MERCADONA\nTOTAL', '20,50'), []).totalCents, 2050)
  assert.throws(() => parseReceiptBlocks([], []))
  assert.throws(() => parseReceiptBlocks(blocks(...Array(6).fill('TOTAL 20,50')), []))
})

test('one Tesseract instance recognizes photos sequentially and only returns a combined proposal', async () => {
  const source = await readFile(new URL('../src/services/receiptOcr.worker.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS } }).outputText
  let created = 0, inFlight = 0, maxInFlight = 0, terminated = 0
  const messages = [], seen = []
  const scope = { postMessage: (message) => messages.push(message) }
  const texts = ['MERCADONA S.A.\n06/09/2026', 'productos...', 'TOTAL 68,42']
  runInNewContext(compiled, { exports: {}, self: scope, require: (path) => path === 'tesseract.js' ? {
    OEM: { LSTM_ONLY: 1 }, PSM: { SINGLE_BLOCK: 6 },
    createWorker: async () => {
      created++
      return { setParameters: async () => {}, terminate: async () => { terminated++ },
        recognize: async (image) => {
          inFlight++; maxInFlight = Math.max(maxInFlight, inFlight)
          const i = seen.length; seen.push(image)
          await Promise.resolve(); inFlight--
          return { data: { text: texts[i], confidence: 95 } }
        } }
    },
  } : { parseReceiptBlocks } })
  const images = [new Blob(['1']), new Blob(['2']), new Blob(['3'])]
  const originals = [...images]
  await scope.onmessage({ data: { images, categories } })
  assert.equal(created, 1); assert.equal(maxInFlight, 1); assert.equal(terminated, 1)
  assert.deepEqual(seen, originals)
  assert.deepEqual(images, [null, null, null])
  const result = messages.find((message) => message.type === 'result')
  assert.equal(result.result.totalCents, 6842)
  assert.equal(result.result.merchant, 'Mercadona')
  assert.equal(messages.filter((message) => message.type === 'result').length, 1)
})

test('image preparation: size/type rejection, 1920px resize, JPEG compression and cleanup (mocked browser APIs)', async () => {
  let source = await readFile(new URL('../src/services/receiptScanner.ts', import.meta.url), 'utf8')
  source = source.slice(0, source.indexOf('export type ReceiptScanEngine'))
    .replace(/^import .*$/gm, '').replace(/^export type .*$/gm, '')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS,
  } }).outputText
  let revoked = 0
  let dimensions
  const qualities = []
  const canvas = { width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage() { dimensions = [canvas.width, canvas.height] } }),
    toBlob(resolve, mime, quality) { qualities.push(quality); resolve(new Blob(['jpeg'], { type: mime })) },
  }
  const exports = {}
  runInNewContext(compiled, { exports, MAX_IMAGE_BYTES, DOMException,
    Image: class { naturalWidth = 4000; naturalHeight = 3000; async decode() {} },
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => { revoked++ } },
    document: { createElement: () => canvas },
  })
  const signal = new AbortController().signal
  const prepare = exports.prepareReceiptImage
  await assert.rejects(prepare({ size: 16 * 1024 * 1024, type: 'image/jpeg' }, signal), /15 MB/)
  await assert.rejects(prepare({ size: 100, type: 'application/pdf' }, signal), /PDF/)
  assert.equal(revoked, 0)
  const blob = await prepare({ size: 1000, type: 'image/jpeg' }, signal)
  assert.equal(blob.type, 'image/jpeg')
  assert.deepEqual(dimensions, [1920, 1440])
  assert.deepEqual(qualities, [.86])
  assert.equal(revoked, 1)
  assert.equal(canvas.width, 0)
  assert.equal(canvas.height, 0)
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(prepare({ size: 1000, type: 'image/jpeg' }, cancelled.signal), /abort/i)
  assert.equal(revoked, 2)
})
