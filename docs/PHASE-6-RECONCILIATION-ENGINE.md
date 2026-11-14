# FASE 6 — Motor de conciliación · FinAgent AI v1

Fecha: 13/11/2026 · Estado: **IMPLEMENTADA — pendiente de integración visual de la Fase 7**

Esta fase sigue la secuencia de `PHASE-5-DOCUMENTS.md` y el plan de diez fases del repositorio. El prompt maestro adjunto usa otra numeración para su propio plan; los documentos de fase ya existentes son la referencia de continuidad del proyecto.

## 1. Qué se implementó

### Dominio determinista (`@finagent/domain`)

- Motor puro y reproducible con importes en `bigint` de centavos. Moneda distinta nunca coincide.
- Regla 1: importe, moneda, fecha exacta y referencia o descripción coincidentes. Si la relación no es única en ambos lados, el resultado queda ambiguo.
- Regla 2: importe y referencia exactos dentro de tres días hábiles colombianos por defecto, con festivos nacionales y propios de la organización.
- Regla 3: suma exacta 1:N / N:1, máximo seis movimientos por defecto; se acotan los candidatos y los nodos de búsqueda para controlar el costo.
- Regla 4: diferencia de importe menor entre COP 1.000 y 0,1 % del importe, con similitud de referencia/concepto y fechas dentro de la tolerancia. Siempre requiere validación humana.
- Regla 5: clasificación determinista de GMF, comisiones, IVA de comisión, retenciones, intereses/rendimientos, chequeras y cuotas de manejo. Clasificar no crea asientos.
- Regla 6: movimientos pendientes de periodos anteriores se incluyen en la siguiente ejecución y quedan identificados como `CARRIED_FORWARD`.
- Se muestran explícitamente diferencias de fecha, diferencias de importe, duplicados posibles, movimientos sin contraparte y notas bancarias clasificadas.

### Persistencia y seguridad

- `matching_rule_versions` conserva cada configuración; una ejecución referencia la versión aplicada.
- `matching_runs` guarda cuenta, periodo, huella SHA-256 de entradas, conteos y clave idempotente.
- `matching_suggestions` guarda IDs de ambos lados, regla, estado, puntaje y explicación.
- `confirmed_matches` y `confirmed_match_items` registran aceptación humana y reversión con motivo.
- Índices únicos parciales en PostgreSQL impiden que dos ejecuciones confirmen simultáneamente el mismo movimiento. La reversión libera la relación sin borrar la bitácora.
- Las consultas filtran organización y alcance de cuenta. Los cambios de reglas, ejecuciones, confirmaciones y reversiones quedan auditados.
- Ninguna regla acepta automáticamente movimientos; una propuesta exacta también debe ser confirmada por una persona autorizada.

## 2. Endpoints

- `GET /api/reconciliations/rules` — devuelve la versión vigente (crea la versión inicial con valores por defecto si aún no existe).
- `PUT /api/reconciliations/rules` — crea una nueva versión; no altera ejecuciones anteriores.
- `POST /api/reconciliations/runs` — ejecuta sobre cuenta y periodo. Requiere `Idempotency-Key` de 8 a 128 caracteres.
- `GET /api/reconciliations/runs` y `GET /api/reconciliations/runs/:id` — consulta ejecuciones y propuestas.
- `POST /api/reconciliations/suggestions/:id/confirm` — confirmación humana; diferencias de importe/fecha requieren motivo.
- `POST /api/reconciliations/matches/:id/reverse` — reversión auditada con motivo obligatorio.

Permisos: `rules.manage`, `reconciliations.read` y `reconciliations.prepare`, verificados en backend.

## 3. Resultados de verificación

| Verificación                                                                                                             | Estado                                    |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| Dominio: coincidencia exacta, ambigüedad, días hábiles, diferencia de fecha, suma 1:N, monedas, clasificación y arrastre | PASS (8 nuevas)                           |
| Suite del dominio                                                                                                        | PASS (24 pruebas)                         |
| Cobertura del dominio                                                                                                    | PASS (91,26 % líneas; 88,44 % sentencias) |
| Typecheck de API y generación de Prisma Client                                                                           | PASS                                      |
| Migración contra PostgreSQL y pruebas de integración del API                                                             | PASS (46 pruebas; 1 omitida)              |
| Rendimiento del motor puro con 50.000 movimientos (25.000 pares exactos sintéticos)                                      | PASS (95 ms en la máquina de desarrollo)  |
| Vista de propuestas y revisión manual en navegador                                                                       | NOT IMPLEMENTED (Fase 7)                  |

## 4. Límites conocidos

- La suma de subconjuntos toma hasta 28 candidatos por referencia/fecha y limita la búsqueda a 2.000 nodos por movimiento; en escenarios altamente ambiguos puede dejar de proponer una agrupación válida. El resultado permanece pendiente, no se confirma incorrectamente.
- La clasificación de notas usa reglas de texto locales y no consulta IA ni crea asientos.
- Las propuestas de esta fase se consultan por API; la mesa de trabajo visual, paginación/virtualización y experiencia de deshacer se construyen en la Fase 7.
- La meta de menos de dos minutos para importar y conciliar 50.000 movimientos aún debe medirse con la integración real del motor.
- El benchmark de 50.000 filas mide el motor puro sobre pares exactos y no cubre persistencia PostgreSQL, propuestas ambiguas ni sumas de subconjuntos.

## 5. Qué sigue — Fase 7 (mesa de trabajo)

Centro de conciliación con doble panel paginado, propuestas agrupadas, revisión/confirmación, asociación manual, diferencias justificadas, acciones de deshacer y panel de saldos. Se verificará en la interfaz con el fixture ficticio de octubre de 2026.
