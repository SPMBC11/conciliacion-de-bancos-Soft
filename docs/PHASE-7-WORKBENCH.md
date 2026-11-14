# Fase 7 — Mesa de trabajo

Estado: implementada en la aplicación local.

## Entregado

- Centro de conciliación con extracto y auxiliar en paneles separados, búsqueda, paginación de servidor y virtualización de filas.
- Revisión de propuestas por grupo: pendientes, diferencias, movimientos sin identificar, duplicados y coincidencias confirmadas.
- Confirmación, rechazo y solicitud de revisión con permisos organizacionales y bitácora.
- Asociación manual 1:N, N:1 y N:N; valida cuenta, organización, moneda, disponibilidad y diferencia antes de guardar.
- Reversión auditada que libera los movimientos para revisión posterior.
- Resumen de movimientos, valores netos y pendientes con decimales exactos.

## API agregada

- `GET /api/reconciliations/runs/:id/suggestions`
- `GET /api/reconciliations/runs/:id/transactions`
- `GET /api/reconciliations/runs/:id/matches`
- `GET /api/reconciliations/runs/:id/summary`
- `POST /api/reconciliations/suggestions/:id/reject`
- `POST /api/reconciliations/suggestions/:id/request-review`
- `POST /api/reconciliations/matches/manual`

## Verificación

- Typecheck API y web: PASS.
- ESLint de los componentes de conciliación: PASS después de resolver avisos encontrados.
- Suite web: 91 pruebas aprobadas.
- Suite API antes de iniciar la Fase 8: 47 aprobadas, 1 omitida.
- La prueba de integración también cubre concurrencia de confirmación, reversión y retorno de movimientos a pendientes.

## Límites

- La virtualización y la respuesta visual requieren validación manual en navegador con datos grandes.
- Las diferencias y partidas abiertas no se consideran conciliadas por su saldo neto; el cierre de Fase 8 exige movimientos clasificados individualmente.
