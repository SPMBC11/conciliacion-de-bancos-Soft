# FASE 2 — Design system y layout · FinAgent AI v1

Fecha: 13/11/2026 · Estado: **COMPLETADA — pendiente de confirmación para iniciar la Fase 3**

## 1. Qué se hizo

| Área        | Resultado                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tokens      | Variables semánticas en `apps/web/src/index.css` (`background`, `surface`, `foreground`, `muted-foreground`, `primary`, `success`, `warning`, `danger`, `overlay`…) para claro y oscuro. Los componentes no usan colores fijos                                                                                                                                                                                 |
| Tema        | Claro / Oscuro / Sistema, persistido en el navegador, aplicado **antes de pintar** (sin destello). Sin JavaScript se respeta la preferencia del sistema                                                                                                                                                                                                                                                        |
| Layout      | `AppLayout` con sidebar fijo y contraíble (recuerda la preferencia) en escritorio, cajón lateral en móvil/tablet, encabezado fijo, enlace “Saltar al contenido”                                                                                                                                                                                                                                                |
| Navegación  | `app/navigation.ts`: mapa completo de la sección 6 (40 rutas, 7 grupos) como única fuente de verdad. Cada ruta indica la fase en que queda funcional y **el menú solo muestra lo implementado** (regla “no crear enlaces sin funcionalidad”)                                                                                                                                                                   |
| Encabezado  | Logo textual, migas de pan, selector de periodo (mes/año, persistido), selector de tema                                                                                                                                                                                                                                                                                                                        |
| Componentes | `PageHeader`, `Breadcrumbs`, `StatCard`, `DataTable` (búsqueda, orden, paginación, selección múltiple, estados), `SearchInput`, `FilterBar`, `StatusBadge` (18 estados con texto + icono), `MoneyCell`, `EmptyState`, `LoadingState`, `ErrorState`, `Dialog`, `ConfirmationDialog` (con motivo obligatorio opcional), `ThemeSelector`, `Toaster`, `Tooltip`, `DropdownMenu`, `Button`, `Input`, `NativeSelect` |
| Dashboard   | `/dashboard` con saludo según la hora de Bogotá, 7 indicadores, 4 gráficos y 2 tablas, todo con **estados vacíos** (“Sin datos”), sin cifras inventadas                                                                                                                                                                                                                                                        |
| Galería     | `/design-system`, **solo en desarrollo** (no existe en el build de producción): todos los componentes con datos ficticios marcados “EJEMPLO”                                                                                                                                                                                                                                                                   |
| Rendimiento | Páginas cargadas bajo demanda (código separado por página)                                                                                                                                                                                                                                                                                                                                                     |

## 2. Accesibilidad (WCAG AA)

Se calculó el contraste de la paleta del master prompt y **cuatro combinaciones no cumplían 4,5:1**. Se ajustaron sin cambiar la identidad de marca:

| Problema                                                                              | Contraste   | Solución                                                                                                              |
| ------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Texto secundario claro `#64748B` sobre fondo y superficie secundaria                  | 4,27 – 4,43 | `#5B6B82` (4,86 – 5,43)                                                                                               |
| Éxito / advertencia / peligro claros como **texto** (`#16A36A`, `#E9A23B`, `#E05252`) | 2,17 – 3,82 | Tokens `*-text` para texto: `#0E7A4F`, `#9A5B00`, `#C0392B`. Los colores de marca siguen en iconos, rellenos y bordes |
| Texto blanco sobre primario oscuro `#3285FF`                                          | 3,54        | Texto `#071225` sobre el botón primario en oscuro (5,29)                                                              |
| Texto blanco sobre botón de peligro `#E05252`                                         | 3,82        | Fondo del botón con `danger-text` (`#C0392B`, 5,44)                                                                   |

Además: estados con texto + icono (nunca solo color), negativos con signo “−” además del color, foco visible, navegación por teclado (Radix), `aria-sort` en tablas, `aria-current` en el menú, títulos accesibles en modales, movimiento reducido respetado.

## 3. Decisiones técnicas

| Decisión                                                                           | Motivo                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Componentes estilo shadcn **escritos a mano** sobre Radix (`radix-ui`)             | El CLI de shadcn 4.22 se quedó esperando una respuesta interactiva. shadcn copia componentes al proyecto de todas formas; el resultado es equivalente y con tokens propios |
| TanStack Table **v8** (no v9)                                                      | La v9 cambió por completo su API; la v8 es estable y conocida. Migración evaluable más adelante                                                                            |
| `NativeSelect` para mes/año                                                        | Accesible y cómodo en móvil sin JavaScript extra                                                                                                                           |
| Importes siempre como string; orden por `parseAmount` (centavos)                   | Nunca `Number` para dinero, también en la UI                                                                                                                               |
| Sin selector de organización, notificaciones ni perfil en el encabezado            | Dependen de autenticación (Fase 3); no se muestran controles sin funcionalidad                                                                                             |
| Recharts no instalado aún                                                          | Los gráficos no tienen datos hasta la Fase 9; se instalará entonces                                                                                                        |
| `FileDropzone`, `ColumnMapper`, `ReconciliationSummaryPanel`, `NotificationCenter` | Se construyen en la fase que los usa (5, 7 y 8)                                                                                                                            |
| Virtualización de tablas                                                           | Se incorpora en la mesa de trabajo (Fase 7) junto con la paginación del servidor                                                                                           |

**Dependencias nuevas:** `react-router` (rutas), `radix-ui` (primitivas accesibles), `lucide-react` (iconos), `class-variance-authority` + `clsx` + `tailwind-merge` (variantes de estilo), `sonner` (notificaciones emergentes), `@tanstack/react-table` (tablas), `@testing-library/user-event` (pruebas de interacción), `@playwright/test` (capturas de verificación ahora; E2E en la Fase 10).

## 4. Cómo probarlo

```bash
npm run infra:up
npm run dev
```

- http://localhost:5173/dashboard — panel con estados vacíos.
- http://localhost:5173/design-system — galería (solo desarrollo).
- Cambiar el tema con el icono de sol/luna; contraer el menú; reducir la ventana a ancho de móvil.

## 5. Resultados de pruebas

| Prueba                                                                                                                            | Estado |
| --------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Contraste WCAG AA de todos los pares texto/superficie en claro y oscuro (33 verificaciones)                                       | PASS   |
| El bloque oscuro “por preferencia del sistema” es idéntico al de `data-theme=dark`                                                | PASS   |
| Formato es-CO de importes, fechas DD/MM/AAAA sin desfase y saludo según hora de Bogotá                                            | PASS   |
| Rutas únicas; el menú solo muestra pantallas implementadas                                                                        | PASS   |
| `/` redirige al panel; el menú marca la página actual; 404 en español                                                             | PASS   |
| Sidebar se contrae y recuerda la preferencia                                                                                      | PASS   |
| Dashboard sin datos: 7 × “Sin datos”, ningún porcentaje inventado                                                                 | PASS   |
| Tema: cambia, se aplica al documento y persiste                                                                                   | PASS   |
| 18 estados con texto visible; `MoneyCell` alineado, tabular y con negativo marcado                                                | PASS   |
| `DataTable`: vacío, búsqueda, sin resultados, error con reintento                                                                 | PASS   |
| `ConfirmationDialog` exige motivo y lo entrega                                                                                    | PASS   |
| Manual (Playwright): capturas en claro, oscuro y móvil (390 px) sin errores de consola ni scroll horizontal; menú móvil funcional | PASS   |
| Build de producción sin la galería ni Zod; imagen Docker web funcionando                                                          | PASS   |
| Total web: 66 pruebas · API: 3 · dominio: 4                                                                                       | PASS   |

## 6. Pendientes conocidos

| Tema                 | Detalle                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Tamaño del núcleo JS | 580 kB (175 kB comprimido): React, router, Radix y TanStack Query. Aceptable para una aplicación interna; revisión en la Fase 10        |
| Fuente Inter         | Se declara pero no se descarga (usa la fuente del sistema si Inter no está instalada). Se decide en la Fase 10 si se incluye localmente |

## 7. Qué sigue — Fase 3 (autenticación y administración)

Usuarios, organizaciones, invitaciones por correo, roles y permisos (RBAC en backend), sesiones con cookies seguras y refresh rotativo, rutas protegidas, selector de organización, perfil y auditoría inicial. Pruebas 18 (aprobación no autorizada → 403) y 24 (aislamiento entre organizaciones).
