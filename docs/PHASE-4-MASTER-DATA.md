# FASE 4 — Configuración maestra · FinAgent AI v1

Fecha: 13/11/2026 · Estado: **COMPLETADA**

## 1. Qué se hizo

| Área                     | Resultado                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bancos                   | Catálogo de 17 bancos colombianos precargado (sincronizado al arrancar) + bancos propios por organización                                                                                                                                                                                                                                                                 |
| Cuentas bancarias        | Banco, nombre, número, tipo (corriente/ahorros), moneda (COP/USD), cuenta PUC, saldo inicial (`NUMERIC(18,2)`), fecha del saldo, estado. **Número cifrado con AES-256-GCM** (clave versionada), unicidad por **HMAC** (subclave HKDF) sin descifrar, mostrado como `****7890`. Ver el número completo exige permiso de gestión, queda en auditoría y se oculta a los 30 s |
| Validaciones contables   | La cuenta PUC de un banco debe ser del grupo **11 (Disponible)**, activa y que acepte movimiento. Duplicados (mismo banco y número, aunque se escriba con espacios o guiones) → 409                                                                                                                                                                                       |
| Alcance por cuenta       | Cada usuario ve **todas** las cuentas o **solo las seleccionadas**. Fuera de su alcance las cuentas responden 404 (no se revela su existencia). Se configura desde Usuarios                                                                                                                                                                                               |
| PUC                      | Código, nombre, naturaleza, nivel (clase → auxiliar, por longitud del código), acepta movimiento, estado. Cuenta padre obligatoria. Código inmutable. No se puede desactivar una cuenta usada por un banco o por el mapeo                                                                                                                                                 |
| Importación del PUC      | XLSX, XLS o CSV (máx. 5 MB) con **vista previa** (nuevas, actualizadas, errores por fila) y **todo o nada**. Detecta el encabezado aunque haya filas de título; columnas Naturaleza (D/C) y Movimiento (S/N) opcionales. Valida la **firma real** del archivo (no la extensión). Lee solo valores: no evalúa fórmulas ni macros                                           |
| PUC base                 | 34 cuentas de referencia (Decreto 2650 de 1993) para empezar; el contador las valida                                                                                                                                                                                                                                                                                      |
| Mapeo de notas bancarias | GMF, comisiones, IVA sobre comisiones, cuota de manejo, chequeras, gastos varios, intereses y retención en la fuente → cuenta PUC. Botón “Aplicar sugeridos” (solo cuentas que existan en su PUC)                                                                                                                                                                         |
| Periodos                 | Meses abiertos por organización (nunca futuros ni duplicados) con matriz mes × cuenta. El estado por cuenta (en conciliación, revisión, aprobado, cerrado) lo aportará la conciliación en las Fases 6–8                                                                                                                                                                   |
| Festivos                 | **Calculados por ley** (Ley 51 de 1983 “Emiliani” + fechas que dependen de la Pascua): 18 por año, verificados para 2025 y 2026. La organización puede agregar días no hábiles propios                                                                                                                                                                                    |
| Días hábiles             | `BusinessCalendar` en el dominio: lunes a viernes sin festivos; distancia y suma en días hábiles (lo usará la regla 2 del motor)                                                                                                                                                                                                                                          |
| Importes en pantalla     | Se escriben en formato colombiano (`1.234.567,89`) y se convierten a texto exacto sin pasar por `Number`; se rechazan formatos ambiguos (`1,234`, `12.34`)                                                                                                                                                                                                                |

### Endpoints nuevos

`GET/POST /api/banks` · `GET/POST /api/bank-accounts` · `GET/PATCH /api/bank-accounts/:id` · `POST /api/bank-accounts/:id/reveal-number` · `PUT /api/users/:memberId/bank-accounts` · `GET/POST /api/chart-of-accounts` · `PATCH /api/chart-of-accounts/:id` · `POST /api/chart-of-accounts/load-base` · `POST /api/chart-of-accounts/import[?dryRun=true]` · `GET/PUT /api/fee-mappings` · `POST /api/fee-mappings/apply-suggested` · `GET/POST /api/holidays` · `DELETE /api/holidays/:id` · `GET/POST /api/periods`

### Configuración nueva

`ENCRYPTION_KEY` (32 bytes en base64). **No debe cambiarse sin migrar los datos**: lo cifrado con la clave anterior no se podría leer. El `.env` local recibió una clave aleatoria propia.

## 2. Decisiones

| Decisión                                                               | Motivo                                                                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Festivos nacionales calculados, no guardados                           | Son ley; calcularlos evita mantener una tabla por año y errores de digitación. La tabla `holidays` guarda solo los propios de la organización |
| Periodo = mes de la organización; estado por cuenta en la conciliación | Decisión A12 de la Fase 0: una sola máquina de estados                                                                                        |
| Tablas `currencies` y `exchange_rates` no creadas                      | En v1 no se convierte entre monedas (cada cuenta se concilia en su moneda). Se crearán si se aprueba la diferencia en cambio (pregunta P5)    |
| SheetJS 0.20.3 desde su CDN oficial                                    | La versión de npm (0.18.5) tiene vulnerabilidades conocidas                                                                                   |
| Saldo inicial editable                                                 | Se bloqueará cuando la cuenta tenga una conciliación (Fase 6)                                                                                 |

## 3. Cómo probarlo

1. Plan de cuentas → “Importar Excel/CSV” (o “Cargar PUC base”) → “Aplicar sugeridos” en el mapeo.
2. Cuentas bancarias → “Nueva cuenta” (saldo en formato `15.250.000,75`).
3. Usuarios → columna “Cuentas bancarias” → limitar a un usuario.
4. Periodos → “Abrir \<mes\>”. Festivos → revisar el año y agregar uno propio.

## 4. Resultados de pruebas

| Prueba                                                                                                                                                                                                                                                 | Estado |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Festivos 2025 y 2026 exactos (incluye coincidencia del 30/06/2025); trasladables siempre en lunes (2024–2028)                                                                                                                                          | PASS   |
| **Prueba financiera 4**: viernes 13 → martes 17/11/2026 = 1 día hábil (fin de semana + festivo)                                                                                                                                                        | PASS   |
| PUC: niveles, naturaleza por clase, padre                                                                                                                                                                                                              | PASS   |
| Cifrado: ida y vuelta, nonce distinto, detección de manipulación, HMAC determinista                                                                                                                                                                    | PASS   |
| Cuenta bancaria: número nunca en claro (API ni BD), saldo exacto `15250000.75`, revelar auditado                                                                                                                                                       | PASS   |
| Duplicados y cuentas PUC inválidas (no Disponible / sin movimiento), importe con 3 decimales → 400                                                                                                                                                     | PASS   |
| Alcance por cuenta: usuario restringido solo ve sus cuentas; las demás → 404                                                                                                                                                                           | PASS   |
| **Prueba 24** (cuentas bancarias): otra organización no ve ni encuentra las cuentas                                                                                                                                                                    | PASS   |
| PUC base una sola vez; cuenta sin padre → 400                                                                                                                                                                                                          | PASS   |
| Importación Excel: vista previa con errores, todo o nada, encabezado con fila de título, actualización por código                                                                                                                                      | PASS   |
| Archivo con firma PDF y extensión .xlsx → rechazado                                                                                                                                                                                                    | PASS   |
| Mapeo sugerido (8 tipos), cuenta sin movimiento → 400, cuenta en uso no se desactiva                                                                                                                                                                   | PASS   |
| Festivos: 18 nacionales + propios; no duplicar un nacional                                                                                                                                                                                             | PASS   |
| Periodos: no futuros, no duplicados                                                                                                                                                                                                                    | PASS   |
| Revisor consulta pero no modifica datos maestros                                                                                                                                                                                                       | PASS   |
| Web: importes es-CO (entrada y salida), guía sin PUC, enmascarado, revelar solo con permiso, festivos por rol, **cada entrada del menú tiene ruta**                                                                                                    | PASS   |
| Navegador real: importación con errores → corregida → 22 cuentas; mapeo; 2 cuentas COP/USD; duplicado rechazado; Contador restringido ve 1 cuenta y sin botón de revelar; periodo; festivo propio; móvil sin scroll horizontal; sin errores de consola | PASS   |
| Totales: dominio 16 · API 34 · web 88                                                                                                                                                                                                                  | PASS   |

## 5. Errores encontrados y corregidos

- Las cuatro páginas nuevas no estaban registradas en el router (el menú las mostraba y daban “Página no disponible”). Se agregó una prueba que verifica que **toda entrada visible del menú tenga su ruta**.
- Las notificaciones tapaban los selectores del encabezado: ahora aparecen abajo a la derecha.

## 6. Qué sigue — Fase 5 (documentos e importación)

Almacenamiento privado de archivos, validación (firma, tamaño, SHA-256 para duplicados), plantillas de mapeo por banco y por software contable con interfaz visual, parsers CSV/XLSX (luego OFX, CAMT.053 y PDF digital), vista previa, validación de saldos, normalización y detección de duplicados.

> **Hito de prueba contigo tras la Fase 5:** subir tus dos archivos reales (anonimizados) y ver la vista previa correcta. Para eso necesito las respuestas a P1 (software contable) y P2 (bancos), idealmente con un extracto y un auxiliar de ejemplo **con datos ficticios o tachados**. El repositorio es público: no los subas al repo.
