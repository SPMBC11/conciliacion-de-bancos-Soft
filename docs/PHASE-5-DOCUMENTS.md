# FASE 5 — Documentos e importación · FinAgent AI v1

Fecha: 13/11/2026 · Estado: **COMPLETADA — hito de prueba contigo pendiente (tus archivos reales)**

## 1. Qué se hizo

### Paquete `@finagent/parsers` (puro, probado)

| Pieza                | Detalle                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detección de formato | Por **firma de contenido** (no por extensión): XLSX (ZIP), XLS (OLE2), CSV/TXT, OFX, XML CAMT.053, PDF                                                                                                                                                                                                                                                               |
| Texto                | UTF-8 estricto y, si falla, **Windows-1252** (frecuente en portales bancarios colombianos)                                                                                                                                                                                                                                                                           |
| CSV                  | Separador detectado por constancia de columnas; ante empate se prefiere `;` porque la coma suele ser decimal (`1.500.000,00`)                                                                                                                                                                                                                                        |
| XLSX/XLS             | SheetJS 0.20.3 leyendo **solo valores**: sin fórmulas, macros ni enlaces externos. Fechas seriales de Excel convertidas sin zona horaria                                                                                                                                                                                                                             |
| Importes             | Texto → centavos exactos con separador de la plantilla; acepta `$`, `COP`, `(1.234,00)` y `1.234,00-`; rechaza ambigüedades y más de 2 decimales. Celdas numéricas de Excel validadas a 2 decimales                                                                                                                                                                  |
| Plantillas           | Hoja, fila de encabezado, primera fila de datos, columnas (fecha, fecha valor, descripción, referencia, documento/cheque, tercero, NIT, débito, crédito o valor con signo, saldo), formato de fecha, separador decimal, filas a omitir. **Débito/crédito según el lado**: en el extracto el débito es salida; en el auxiliar (cuenta de activo) el débito es entrada |
| OFX                  | 1.x (SGML sin cierres) y 2.x (XML): FITID, CHECKNUM, REFNUM, saldo LEDGERBAL                                                                                                                                                                                                                                                                                         |
| CAMT.053             | Saldos OPBD/CLBD, CRDT/DBIT, EndToEndId, fecha valor. **Rechaza DTD/entidades** (protección XXE)                                                                                                                                                                                                                                                                     |
| Saldos               | Apertura + Σ movimientos = cierre; saldo corrido fila a fila; detecta archivos en orden descendente                                                                                                                                                                                                                                                                  |
| Huellas              | De contenido (fecha + importe + referencia + descripción) para duplicados entre archivos y de origen (contenido + documento + fila) para trazabilidad                                                                                                                                                                                                                |
| Filas                | La numeración coincide con la del archivo original (las filas vacías se conservan al leer)                                                                                                                                                                                                                                                                           |

### Backend

| Área           | Detalle                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Carga          | Multipart, máx. 20 MB, cuenta con acceso del usuario y **periodo abierto** obligatorios. SHA-256; **el mismo archivo para la misma cuenta y lado se rechaza** sin duplicar registros. Original guardado como objeto **inmutable** en el almacenamiento privado (`org/<id>/documents/<id>`), con verificación de hash al leerlo. PDF → mensaje claro de “aún no compatible” |
| Reconocimiento | Al subir, se sugiere la plantilla cuyo encabezado coincida con el archivo                                                                                                                                                                                                                                                                                                  |
| Vista previa   | Misma lógica que la importación (lo que se revisa es lo que se guarda). Conteos, ecuación de saldos, advertencias, errores por fila y muestra                                                                                                                                                                                                                              |
| Advertencias   | Moneda distinta a la de la cuenta (**bloquea**), sin movimientos (bloquea), sin saldos (**pide indicarlos**), saldos que no cuadran (**exige justificación, que queda en auditoría**), saldo inicial distinto al final del periodo anterior (exige justificación), fechas fuera del periodo, filas ilegibles, posibles duplicados                                          |
| Importación    | Requiere `Idempotency-Key` (doble clic o reintento no duplican). Se procesa **en el worker** (BullMQ) con progreso, todo o nada en una transacción. Una sola importación vigente por documento (índice único parcial)                                                                                                                                                      |
| Duplicados     | Dentro del archivo y contra lo ya importado de la cuenta: se **marcan** como posible duplicado con referencia al original, **nunca se eliminan**; el usuario confirma o descarta                                                                                                                                                                                           |
| Movimientos    | `bank_transactions` y `accounting_transactions` con importe con signo (`NUMERIC(18,2)`), datos originales y normalizados, fila de origen y huellas. **Trigger en BD**: no se pueden borrar ni modificar sus datos de origen                                                                                                                                                |
| Plantillas     | Versionadas: cambiar la configuración crea una versión nueva; cada importación conserva la versión usada                                                                                                                                                                                                                                                                   |
| Aislamiento    | El trabajo del worker lleva la organización; un trabajo de otra organización no se procesa. Contexto de auditoría con origen `WORKER`                                                                                                                                                                                                                                      |

**Endpoints:** `POST /api/documents/upload` · `GET /api/documents` · `GET /api/documents/:id` · `GET /api/documents/:id/grid` · `POST /api/documents/:id/preview` · `POST /api/documents/:id/import` · `GET /api/documents/:id/download` · `GET /api/document-imports` · `GET /api/document-imports/:id` · `GET/POST /api/import-templates` · `GET/PATCH /api/import-templates/:id` · `GET /api/transactions` · `POST /api/transactions/:id/duplicate-decision`

### Frontend

Centro documental, Extractos bancarios y Archivos contables (listas por tipo), Importaciones (historial con progreso en vivo) y Plantillas. **Carga** con arrastrar y soltar (cuenta, tipo y periodo). **Detalle del documento** con el flujo completo:

1. **Mapeador visual de columnas**: adivina encabezado, columnas (nombres habituales de bancos y ERP colombianos), formato de fecha y separador decimal; resalta las columnas asignadas sobre las filas reales; vista previa **en vivo** mientras se ajusta; guardar como plantilla.
2. **Vista previa y validación**: conteos, ecuación de saldos con diferencia (verde solo si cuadra), advertencias, errores, muestra; saldos manuales si el archivo no los trae; justificación si no cuadran.
3. **Importación** con barra de progreso y lista de movimientos importados.

### Archivos de prueba ficticios (`fixtures/`)

Extracto CSV (Windows-1252, `;`, título y totales), el mismo extracto en OFX y un auxiliar XLSX de un “ERP Demo” (encabezados de empresa, saldos al pie). Octubre 2026 completo, diseñado para que la Fase 6 concilie a diferencia **$0**: coincidencias exactas, 1→N, N→1, festivo (12/10), GMF, comisión + IVA, rendimientos + retención, cuota de manejo, cheque no cobrado, consignación en tránsito, consignación no identificada, error de digitación y recibo duplicado en libros. Se regeneran con `node fixtures/generate.mjs`.

## 2. Rendimiento (entorno de referencia: MacBook Apple Silicon, Docker)

| Operación                                                                | 50.000 movimientos |
| ------------------------------------------------------------------------ | ------------------ |
| Carga + vista previa                                                     | 0,6 s              |
| Importación completa (filas de origen, movimientos, huellas, duplicados) | 16 s               |

Meta del MVP: importar **y conciliar** 50.000 en < 2 min. Queda margen para el motor (Fase 6). Prueba: `npm run test:perf -w @finagent/api`.

## 3. Resultados de pruebas

| Prueba                                                                                                                                                                                                                                                                                                                      | Estado      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Parsers: importes, fechas, Windows-1252, separador, detección, CSV/XLSX con plantilla, OFX 1.x/2.x, CAMT.053, XXE, saldos, orden descendente, numeración de filas                                                                                                                                                           | PASS (21)   |
| **Prueba 5**: dos movimientos idénticos → posible duplicado, sin eliminar                                                                                                                                                                                                                                                   | PASS        |
| **Prueba 12**: mismo archivo (SHA-256) → detectado, sin duplicar registros                                                                                                                                                                                                                                                  | PASS        |
| **Prueba 13**: extracto que no cuadra → bloquea hasta justificar; justificación en auditoría                                                                                                                                                                                                                                | PASS        |
| Flujo completo: grilla → plantilla → sugerencia por encabezado → vista previa → importación idempotente → movimientos con signo correcto → fila de origen cruda y normalizada                                                                                                                                               | PASS        |
| Auxiliar sin saldos: exige saldos; débito = entrada; NIT del tercero                                                                                                                                                                                                                                                        | PASS        |
| OFX sin plantilla; duplicado entre archivos con referencia al original                                                                                                                                                                                                                                                      | PASS        |
| Plantillas versionadas                                                                                                                                                                                                                                                                                                      | PASS        |
| Movimientos inmutables en BD (UPDATE/DELETE rechazados)                                                                                                                                                                                                                                                                     | PASS        |
| **Prueba 24** (documentos y worker): otra organización no ve documentos, importaciones ni descargas; el worker no procesa trabajos ajenos                                                                                                                                                                                   | PASS        |
| **Worker real**: la API encola y BullMQ procesa hasta COMPLETED, auditado con origen WORKER                                                                                                                                                                                                                                 | PASS        |
| Rendimiento 50.000 movimientos                                                                                                                                                                                                                                                                                              | PASS (16 s) |
| Web: heurísticas del mapeador (extracto y auxiliar)                                                                                                                                                                                                                                                                         | PASS        |
| Navegador real con worker: abrir periodo elegido → subir extracto → mapeador adivina todo → vista previa cuadra → guardar plantilla → importar (20) → mismo archivo rechazado → auxiliar XLSX con saldos manuales → duplicado detectado → importar (13) → historial y plantillas → móvil sin scroll, sin errores de consola | PASS        |
| Totales: dominio 16 · parsers 21 · API 44 (+1 de rendimiento) · web 91                                                                                                                                                                                                                                                      | PASS        |

## 4. Errores encontrados y corregidos durante la fase

- **Separador de CSV**: papaparse elegía la coma cuando los importes usan coma decimal; se escribió una detección propia.
- **Huella de origen**: usaba el hash del archivo; el mismo archivo cargado legítimamente en otra cuenta chocaba. Ahora usa el id del documento.
- **Numeración de filas**: las filas vacías se descartaban y los números no coincidían con Excel. Corregido (la plantilla de demostración se actualizó a v2).
- **Worker sin la cola de importaciones** y **pruebas usando la cola de desarrollo**: dos ediciones que no se aplicaron por cambios de formato. Se agregó una prueba con un worker real y Redis aislado para pruebas (base 1).
- **Accesibilidad**: las listas desplegables dentro de su etiqueta anunciaban todas sus opciones; ahora tienen nombre propio.
- **Periodos**: solo se podía abrir el siguiente mes de la secuencia; ahora se elige el mes.

## 5. Pendientes y decisiones

| Tema                                 | Detalle                                                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PDF**                              | **No compatible en v1** todavía: se detecta y se informa con claridad. Cada banco tiene un diseño distinto y no se declara compatible un formato sin parser probado. Recomendación: pedir el extracto en Excel/CSV/OFX |
| TXT de ancho fijo                    | No implementado (los TXT delimitados sí)                                                                                                                                                                               |
| `document_validation_errors`         | Los errores se guardan en cada fila (`document_rows.errors`) en lugar de una tabla aparte                                                                                                                              |
| Cifrado en reposo del almacenamiento | Depende del proveedor S3 en producción (SSE); en desarrollo, SeaweedFS sin cifrado                                                                                                                                     |
| Retención                            | Política de 5/10 años pendiente de definir (P13); hoy nada se borra                                                                                                                                                    |

## 6. Hito de prueba contigo

**Ya puedes subir tus dos archivos reales y ver la vista previa.** Recomendaciones:

- Haz la prueba en tu entorno local; **no subas esos archivos al repositorio** (es público).
- Si el banco los entrega en PDF, pide la versión Excel/CSV desde su portal.
- Cuéntame qué banco y qué software contable son (P1/P2) y si el mapeador no adivinó algo: ajusto las heurísticas.

## 7. Qué sigue — Fase 6 (motor de conciliación)

Reglas 1 a 6 (exacta, importe + fecha en días hábiles, 1→N / N→1 con suma de subconjuntos acotada, aproximada, clasificación de notas bancarias, arrastre de pendientes), versionado de reglas, ejecuciones (`matching_runs`), clasificación de resultados y control de concurrencia (prueba 17).
