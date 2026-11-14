# Fase 10 — QA y preparación

Estado: verificación automatizada local ejecutada; preparación de producción pendiente.

## Verificaciones al 13/11/2026

- `npm run typecheck -w @finagent/api`: PASS.
- `npm run typecheck -w @finagent/web`: PASS.
- `npm run build -w @finagent/web`: PASS.
- `npm test -w @finagent/web`: PASS (91 pruebas).
- `npm test -w @finagent/api`: PASS (48 pruebas; 1 omitida), sobre `finagent_test` aislada.
- `npm test` del monorepo: PASS (184 pruebas aprobadas; 2 omitidas entre API, web, dominio y parsers).
- `npm run test:e2e`: PASS (2 pruebas smoke).
- Rendimiento: PASS para importación de 50.000 transacciones sintéticas y motor puro con 50.000 movimientos/25.000 pares exactos (95 ms en la máquina actual).
- `npm run format:check`: PASS.
- `npm audit --omit=dev`: 0 vulnerabilidades de producción. Se actualizó `fast-xml-parser` a 5.12.1 y se verificó la suite de parsers.
- El árbol de desarrollo mantiene 7 avisos moderados de `minimatch` en la cadena de `typescript-eslint`; `npm audit fix` propone un downgrade incompatible con el stack actual, por lo que no se forzó.
- ESLint de los archivos cambiados: PASS.
- Migración Fase 8: aplicada a la base de pruebas PostgreSQL 16.
- La migración se comprobó tras corregir un uso inicial de `uuidv7()` no disponible en PostgreSQL 16; IDs los genera Prisma, como en migraciones anteriores.
- Playwright: PASS (4 verificaciones: login e informe en Chromium escritorio y viewport móvil).

## No verificado todavía

- E2E de conciliación completo con datos semilla, accesibilidad automatizada/manual, vista responsive en tamaños físicos, carga de ambigüedad y persistencia en PostgreSQL a 50.000 movimientos, revisión de seguridad independiente y recuperación de copias.
- Despliegue de producción, gestor de secretos, dominios/TLS, observabilidad y retención.
- El flujo de cierre requiere cero movimientos pendientes; las partidas conciliatorias formales, su antigüedad/seguimiento y exportación por ERP son tareas pendientes.
- Roles de elaborador, revisor y aprobador aún comparten el permiso `reconciliations.prepare`; hace falta separación de funciones antes de usar en producción.

## Siguiente paso recomendado

Extender E2E a importación y conciliación con fixture sintético; medir escenarios ambiguos y escritura PostgreSQL, revisar accesibilidad manualmente con archivos anonimizados y acordar plantillas de exportación antes del despliegue.
