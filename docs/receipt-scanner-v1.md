# Escaneo básico de tickets V1 — OCR local multifoto

## Funcionamiento y privacidad

Tesseract.js **7.0.0**, instalado y fijado en package-lock, reconoce el ticket en el navegador con el modelo español `spa` LSTM. No hay API de análisis, claves ni cargos por escaneo. La imagen y el OCR completo permanecen temporalmente en memoria; no se envían a Supabase, a un proveedor, a logs ni a analytics. Solo las cuatro propuestas llegan al formulario. Su posterior guardado manual usa el flujo existente de gastos.

Se ha retirado la función remota no desplegada y su configuración local. No hay código IA activo ni instrucciones de activación remota para esta V1. IA avanzada: futura versión. El tipo `ReceiptScanEngine` permite sustituir el motor desde el servicio sin rehacer la interfaz; solo se implementa la estrategia local.

## Descargas, lazy y offline

La descarga de software no es una subida de tickets: al escanear se descargan archivos públicos de jsDelivr mediante HTTPS, con versiones fijadas: worker Tesseract 7.0.0, núcleo WASM 7.0.0 y modelo `@tesseract.js-data/spa@1.0.0/4.0.0_best_int`. El CDN recibe metadatos normales de conexión, no la foto ni su texto. El modelo comprimido pesa 2.10 MB; el núcleo añade varios MB según la variante elegida por el dispositivo.

El servicio hace dynamic import solo al pulsar **Analizar ticket**, después de añadir entre 1 y 5 fotos. Seleccionar una foto prepara su miniatura pero no inicia OCR. Tesseract está dentro de un worker separado, no en el bundle principal. Las salidas OCR se emiten como módulos `.mjs`, fuera del patrón `*.js` del precache que ya existía. No se cambia el service worker ni su configuración. Esto evita que el precache descargue automáticamente el OCR al abrir Amedias.

Medición del build multifoto: principal 655.44 kB / 179.23 kB gzip, frente a 653.54 / 178.71 kB de la versión local de una foto. Cargador lazy 0.78 kB y worker OCR aproximadamente 24.64 kB; estos tamaños **no incluyen** los assets externos de varios MB. El aviso de bundle principal >500 kB sigue existiendo y no se aborda aquí.

Solo el modelo público se puede guardar en IndexedDB mediante la caché de Tesseract; no se cachean imágenes ni OCR. El resto depende de caché HTTP y disponibilidad del navegador. Primer uso requiere conexión; offline puede funcionar si todos los módulos/worker/WASM/modelo necesarios están disponibles, pero **no está garantizado**, ni siquiera por haber escaneado antes. Si falta algún archivo se ofrece reintento o entrada manual. No se bloquea anticipadamente usando navigator.onLine.

## Worker, imagen y estados

Se conserva selección de cámara trasera/archivo, EXIF mediante decodificación nativa, límite de entrada 15 MiB/60 MP y canvas hasta 1920 px. JPEG 0.86, fallback 0.76 si supera 2 MiB; no se añade contraste ni binarización sin evidencia de mejora. HEIC/HEIF solo funcionan si los decodifica el navegador; si no, se pide JPEG/PNG/captura. La orientación EXIF no corrige perspectiva ni una foto tomada físicamente de lado sin metadatos.

Un worker supervisor propio carga Tesseract, que ejecuta su núcleo en un worker hijo. Esto permite terminar el árbol también si la inicialización de Tesseract sigue pendiente. Se crea una sola sesión OCR por ticket y se reutiliza el mismo motor para todas sus fotos, con `await recognize` secuencial, nunca OCR simultáneo ni una imagen gigante fusionada. Se termina al acabar, fallar, cancelar, desmontar o superar el límite de 120 segundos por foto del lote (hasta 600 s para cinco). No se mantiene un núcleo WASM inactivo entre tickets. El modelo descargado se reutiliza desde caché cuando es posible.

La UI muestra miniaturas numeradas en dos columnas, permite añadir hasta cinco fotos y eliminar cualquiera, manteniendo el orden añadido de arriba hacia abajo. La selección múltiple conserva el orden entregado por el selector del sistema; para controlar exactamente el orden se pueden añadir una a una. No hay drag & drop ni sustitución en el mismo lugar: eliminar y añadir coloca la nueva al final.

Preparación secuencial con «Preparando fotos…»; solo se mantienen los blobs comprimidos usados también por las miniaturas (hasta 10 MiB en total, además de memoria de decodificación y WASM). Se liberan canvas y URLs de originales al preparar cada foto; los inputs se limpian al acabar la selección. El worker suelta su referencia a cada imagen tras leerla y conserva únicamente bloques `{index,text,confidence}` en memoria hasta interpretar el conjunto.

Durante OCR: «Analizando foto N de M…», porcentaje y «Interpretando ticket…». Se impiden doble envío y cambios durante preparación/OCR. Las miniaturas y blobs comprimidos se conservan mientras el modal permanece abierto para revisar/reintentar; se revocan sus URLs al eliminar, cancelar, cerrar con éxito o desmontar. Cancelar antes de analizar descarta todas las fotos; durante OCR termina el worker. No se guarda base64 en estado.

## Parser y confianza

`src/utils/receiptParser.ts` centraliza:

- Cada bloque conserva foto, posición de línea y confianza. Se recorren sus líneas y se comparan los candidatos del conjunto, sin promediar la confianza de todas las fotos. Una foto borrosa no invalida el dato fiable de otra.
- Deduplicación: líneas consecutivas iguales tras normalizar mayúsculas/espacios y solapamiento exacto entre sufijo anterior y prefijo siguiente, hasta 30 líneas. No se usa comparación aproximada que pueda confundir importes distintos. Se conserva la primera aparición para comercio/fecha, la posterior para total y la mayor confianza de ambas lecturas.
- Total: etiquetas TOTAL, TOTAL A PAGAR, IMPORTE TOTAL, A PAGAR y TOTAL EUR. Descarta subtotal, IVA, efectivo, entregado, cambio y descuento. Da más peso a etiqueta explícita, últimas fotos y cercanía al final, nunca al número más grande. Un importe solo en la siguiente línea puede completar una etiqueta incluso entre fotos. Si candidatos distintos tienen puntuaciones demasiado próximas, queda vacío. Requiere dos decimales, admite coma/punto y miles, y devuelve céntimos enteros.
- Fecha: busca en todas las fotos, con ligera preferencia por las primeras. Formatos españoles actuales y calendario real; excluye caducidad/vencimiento y deja vacías las ambigüedades de prioridad equivalente.
- Comercio: aliases centralizados en `merchantAliases.ts` para nombres completos de cabecera; `MERCADONA S.A.` → Mercadona, `LIDL SUPERMERCADOS` → Lidl, `CARREFOUR EXPRESS/MARKET` → Carrefour, etc. Puede reconocerlos en cualquier foto, dando prioridad a las primeras. Sin alias, solo examina las primeras ocho líneas de la primera foto y descarta fiscalidad, direcciones, CP, teléfono, web/email, caja/empleado, fechas y encabezados genéricos. Sin candidato razonable o ante ambigüedad, `null` + aviso para escribir concepto.
- Categoría: se deriva preferentemente del comercio normalizado usando los nombres de las categorías activas reales. Nunca se fijan IDs ni se crean categorías. Alias nuevos y categorías asociadas se amplían en la misma utilidad.
- Confianza: umbral OCR por bloque 65 y puntuaciones heurísticas. No son probabilidades calibradas: una cifra mal reconocida todavía puede pasar.

Se reutiliza `ReceiptScanResult` y su validación. Sin total seguro: vacío + aviso; sin fecha: hoy + aviso; sin categoría fiable: selección manual. Una lectura fallida conserva el formulario; una lectura exitosa sustituye las cuatro propuestas. No cambia pagador, fondo, reparto, nota, mes contable manual, validación ni RPC de guardado. El escaneo no crea gastos.

## Verificación

Ejecutar `node --test tests/*.test.mjs`, `npm run lint`, `npm run build`, `git diff --check`, `npm audit` y `npm audit --omit=dev`. Los tests del parser usan textos OCR simulados: Mercadona subtotal/IVA/total, efectivo/cambio, formatos de fecha e importe, ausencia/ambigüedad de datos, comercio y categorías presentes/ausentes. También hay preparación de imagen y ciclo de vida del worker con APIs simuladas. Son pruebas de lógica, no de precisión visual.

Tests multifoto añadidos: A cabecera Mercadona/fecha + productos + total; B solapamientos; C Carrefour en segunda foto; D total frente a efectivo/cambio; E comercio incierto. También aliases, prioridades, límites, lectura secuencial con una sola instancia simulada, liberación de referencias y una única propuesta final. No son pruebas reales de Tesseract sobre fotos.

Comprobar que `dist/index.html` y el precache de `dist/sw.js` no incluyen módulos OCR; que el principal no contiene el motor y que los assets OCR solo se solicitan al analizar. La salida de build y el precache se inspeccionan estáticamente.

Pendiente en dispositivos reales: iPhone/Android PWA, workers anidados, cancelación, HEIC/EXIF, memoria/latencia con cinco fotos, offline parcial y precisión. Browser no tenía navegador conectado en esta sesión: no se han verificado visualmente los anchos 360, 375, 390, 393, 412 y 430 px. El CSS usa modal acotado al viewport, miniaturas en dos columnas flexibles y scroll vertical; requiere comprobarlo en navegador real con cinco fotos. Tickets borrosos, inclinados o con columnas pueden fallar. Los aliases son deliberadamente limitados; comercios desconocidos de una sola palabra quedan sin concepto, y solapamientos con errores OCR no se deduplican automáticamente. Todos los resultados requieren revisión manual.

Referencia: [API oficial de Tesseract.js](https://github.com/naptha/tesseract.js/blob/master/docs/api.md).

No se ha desplegado, ejecutado SQL, hecho commit ni push.
