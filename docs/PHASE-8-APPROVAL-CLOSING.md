# Fase 8 — Ajustes y cierre

Estado: implementación local completada para flujo básico de ajustes y cierre.

## Alcance construido

- Registro por cuenta y periodo con estados `PREPARATION → SUBMITTED → REVIEWED → APPROVED → CLOSED`, versión optimista y bitácora.
- Asientos de ajuste en borrador con cuentas PUC activas que aceptan movimiento, moneda de la cuenta y fecha del periodo.
- Cada línea debe tener débito o crédito positivo. La aprobación exige al menos dos líneas y suma exacta de débitos igual a créditos.
- Los asientos aprobados quedan inmutables desde el flujo de edición; el cierre conserva un snapshot con resumen de movimientos y totales de ajustes.
- El cierre requiere que todas las transacciones del periodo y arrastre estén conciliadas individualmente.
- La interfaz `/reconciliations/history` permite preparar el flujo, registrar un asiento de dos líneas y ejecutar transiciones con motivo.

## Endpoints

- `GET /api/reconciliations/records`
- `POST /api/reconciliations/records`
- `POST /api/reconciliations/adjustments`
- `POST /api/reconciliations/adjustments/:id/approve`
- `POST /api/reconciliations/records/:id/{submit|review|approve|close}`

Cada transición requiere motivo. El endpoint de aprobación por ahora comparte `reconciliations.prepare`; separar elaborador, revisor y aprobador en roles específicos queda como refinamiento de permisos.

## Verificación

La migración ya se aplica en `finagent_test`; la prueba integrada valida asiento balanceado, secuencia de aprobación y snapshot. En la suite API completa hubo 48 pruebas aprobadas y 1 omitida.

## Pendientes

- Exportación contable por plantilla, reversión formal de asientos aprobados, partidas conciliatorias y arrastre con responsable/seguimiento.
- Revisión de concurrencia por versión (`If-Match`) en transiciones.
