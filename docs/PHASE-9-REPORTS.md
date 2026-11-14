# Fase 9 — Informes

Estado: informe de conciliación implementado.

## Alcance

- Informe por ejecución con cuenta, periodo, saldos netos, diferencia, pendientes, estado de propuestas, movimientos de ambos libros y coincidencias confirmadas.
- Ajustes aprobados y cuentas contables aparecen en el informe y en la hoja XLSX.
- Exportación CSV en UTF-8 con BOM y separador punto y coma; los campos de texto se protegen contra fórmulas de hoja de cálculo.
- Exportación XLSX con hojas Resumen, Movimientos, Coincidencias y Ajustes.
- Vista imprimible con marca de agua PRELIMINAR, fecha de generación y espacios de firma. En el navegador se puede guardar como PDF.
- Un periodo cerrado se presenta como CERRADA y se omite la marca preliminar en la vista imprimible.

## Rutas

- `GET /api/reconciliations/reports/:runId`
- `GET /api/reconciliations/reports/:runId/export?format=csv|xlsx`
- `GET /reports/reconciliation`

La autorización usa el alcance organizacional y de cuentas bancarias existentes.

## Límites conocidos

- PDF se imprime desde el navegador; el API no produce un PDF binario ni firma digital.
- Los formatos contables de importación/exportación son todavía genéricos; no hay plantilla específica de Siigo, World Office u otro ERP.
- Los informes operan sobre ejecuciones y periodos cargados; el dashboard de cartera/GMF permanece fuera de alcance y oculto hasta una fase posterior.
- La consulta carga todos los movimientos del periodo para exportarlos. Hace falta medir memoria y tiempo para 50.000 filas y paginar el reporte visual.
