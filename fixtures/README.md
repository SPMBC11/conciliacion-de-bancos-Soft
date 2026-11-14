# Archivos de prueba (100 % ficticios)

Generados con `node fixtures/generate.mjs`. **Nunca** agregue aquí extractos o auxiliares reales: el repositorio es público.

| Archivo                        | Contenido                                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `banco-demo-a-2026-10.csv`     | Extracto de “Banco Demo A” (corriente COP ****7890), octubre 2026, CSV `;` en Windows-1252, con fila de título y fila de totales |
| `banco-demo-a-2026-10.ofx`     | El mismo extracto en OFX 1.x                                                                                                     |
| `auxiliar-demo-a-2026-10.xlsx` | Auxiliar 111005 del software ficticio “ERP Demo”, con encabezados de empresa y saldos al pie (sin columna de saldo)              |

Saldo inicial de ambos: $ 15.250.000,75. El escenario completo (para el motor de la Fase 6) está descrito al inicio de `generate.mjs`.

Para probar: Administración → Periodos → abrir Octubre 2026 · Cuentas bancarias → crear la cuenta · Centro documental → Subir archivo.
