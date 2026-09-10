export const normalizeReceiptText = (text: string) => text.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()

// Match complete header-like lines, not mentions in product descriptions.
const legal = '(?:[, .]*(?:S[ .]*A|S[ .]*L)[ .]*)?'
export const merchantAliases = [
  { name: 'Mercadona', pattern: new RegExp(`^MERCADONA${legal}$`), categories: ['SUPERMERCADO', 'SUPERMERCADOS'] },
  { name: 'Lidl', pattern: new RegExp(`^LIDL(?: SUPERMERCADOS)?${legal}$`), categories: ['SUPERMERCADO', 'SUPERMERCADOS'] },
  { name: 'Carrefour', pattern: new RegExp(`^CARREFOUR(?: EXPRESS| MARKET)?${legal}$`), categories: ['SUPERMERCADO', 'SUPERMERCADOS'] },
  { name: 'Aldi', pattern: new RegExp(`^ALDI(?: SUPERMERCADOS)?${legal}$`), categories: ['SUPERMERCADO', 'SUPERMERCADOS'] },
  { name: 'Repsol', pattern: new RegExp(`^REPSOL${legal}$`), categories: ['TRANSPORTE'] },
  { name: 'Cepsa', pattern: new RegExp(`^CEPSA${legal}$`), categories: ['TRANSPORTE'] },
  { name: 'BP', pattern: /^BP$/, categories: ['TRANSPORTE'] },
  { name: 'Zara', pattern: new RegExp(`^ZARA${legal}$`), categories: ['ROPA'] },
  { name: 'H&M', pattern: /^H\s*&\s*M$/, categories: ['ROPA'] },
  { name: "McDonald's", pattern: /^MC\s*DONALD['’]?S$/, categories: ['RESTAURANTES', 'RESTAURACION'] },
]

export function plausibleMerchant(line: string): boolean {
  const normalized = normalizeReceiptText(line)
  return line.length >= 5 && line.length <= 80 && !/[\d@/:]|www\.|\.com\b|\.es\b/i.test(line)
    && /^\p{L}[\p{L} '&’.,-]+$/u.test(line)
    && normalized.split(' ').length >= 2
    && !/\b(CIF|NIF|TEL|TELEFONO|CALLE|AVENIDA|AVDA|PLAZA|CP|CODIGO|POSTAL|TICKET|FACTURA|SIMPLIFICADA|BIENVENIDO|GRACIAS|FECHA|CLIENTE|CAJA|CAJERO|EMPLEADO|ATENDIDO|VENDEDOR|HORA|COMPRA|PRODUCTOS|ARTICULOS|TOTAL|SUBTOTAL|IVA|CAMBIO|EFECTIVO|ENTREGADO|DESCUENTO|IMPORTE|PAGAR|COPIA|ORIGINAL|COMERCIO|DESCONOCIDO|DESCRIPCION|UNIDADES)\b/.test(normalized)
}
