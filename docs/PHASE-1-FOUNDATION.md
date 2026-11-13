# FASE 1 — Fundación · FinAgent AI v1

Fecha: 13/11/2026 · Estado: **COMPLETADA — pendiente de confirmación para iniciar la Fase 2**

## 1. Qué se hizo

| Área           | Resultado                                                                                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repositorio    | Git inicializado y conectado a `github.com/SPMBC11/conciliacion-de-bancos-Soft` (rama `main`). Monorepo con npm workspaces                                                                                                                                                                                                         |
| Backend        | NestJS 12 (ESM) con API REST bajo `/api`, Swagger en `/api/docs`, configuración validada con Zod al arrancar (falla rápido si falta una variable), logs estructurados JSON (pino) con **correlation ID** por solicitud, cabeceras de seguridad (helmet), CORS restringido al origen de la web, formato único de errores en español |
| Worker         | Proceso independiente (`worker.ts`) con BullMQ sobre Redis; comparte módulos con la API; cierre ordenado ante SIGTERM                                                                                                                                                                                                              |
| Base de datos  | PostgreSQL 16 + Prisma 7.10 (adaptador `pg`). Migración inicial: `organizations`, `users`, `audit_logs` con **trigger que bloquea UPDATE/DELETE/TRUNCATE** en auditoría                                                                                                                                                            |
| Almacenamiento | Bucket privado S3 creado por la API al arrancar (sin acceso anónimo)                                                                                                                                                                                                                                                               |
| Frontend       | React 19 + Vite 8 + Tailwind 4 + TanStack Query; página temporal de estado del sistema; proxy `/api` al backend                                                                                                                                                                                                                    |
| Dominio        | `packages/domain` con dinero exacto en centavos (`bigint`): parseo estricto, serialización, suma y formato es-CO                                                                                                                                                                                                                   |
| Contratos      | `packages/contracts` con esquemas Zod compartidos (salud y formato de error)                                                                                                                                                                                                                                                       |
| Calidad        | ESLint (con regla que prohíbe `parseFloat` en importes), Prettier, verificación de tipos, Vitest en todos los paquetes, umbral de cobertura del 80 % en el dominio                                                                                                                                                                 |
| Docker         | `docker-compose.yml` con infraestructura + perfil `app` (api, worker, web con nginx)                                                                                                                                                                                                                                               |

## 2. Cambios respecto a la Fase 0

| Cambio                                | Motivo                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MinIO → SeaweedFS 4.51**            | MinIO dejó de publicar imágenes Docker de su edición comunitaria (ninguna etiqueta disponible en Docker Hub ni quay.io). SeaweedFS (Apache-2.0) ofrece la misma API S3; el código usa el SDK estándar de AWS, así que el proveedor se puede cambiar solo con variables de entorno (en producción: S3, R2, etc.) |
| Solo 3 tablas en la migración inicial | Cada fase agrega las tablas que usa en su propia migración. Evita un esquema grande sin probar                                                                                                                                                                                                                  |
| `packages/parsers` aún no existe      | Se crea en la Fase 5, cuando haya parsers reales que probar                                                                                                                                                                                                                                                     |
| TypeScript 6.0 (no 7.0)               | `typescript-eslint` todavía no admite TypeScript 7                                                                                                                                                                                                                                                              |

## 3. Decisiones técnicas tomadas

- **Todo ESM** (API incluida), Node 24.
- **Pruebas de API con base de datos aislada `finagent_test`**: se crea si no existe y se le aplican migraciones con `migrate deploy` (no destructivo). Los datos de prueba nunca llegan a la base de desarrollo.
- **Scripts de instalación de npm**: solo se autorizaron los de Prisma, SWC y fsevents (`allowScripts` en `package.json`). Se bloquearon `@scarf/scarf` (telemetría incluida en Swagger UI) y `msgpackr-extract` (nativo opcional; BullMQ funciona sin él).
- **Dependencias nuevas y su motivo**: `nestjs-pino`/`pino-http` (logs estructurados con correlation ID), `helmet` (cabeceras de seguridad), `unplugin-swc` + `@swc/core` (las pruebas de NestJS con Vitest necesitan metadatos de decoradores), `concurrently` (correr API, worker y web a la vez en desarrollo), `pg` (adaptador de Prisma 7).

## 4. Cómo probarlo

```bash
cp .env.example .env
npm install
npm run infra:up
npm run db:migrate
npm test            # 9 pruebas
npm run dev         # abrir http://localhost:5173
```

## 5. Resultados de pruebas

| Prueba                                                                                                        | Estado              |
| ------------------------------------------------------------------------------------------------------------- | ------------------- |
| Dominio: parseo/serialización exactos, rechazo de formatos ambiguos (`1,5`, `1.234`), formato es-CO           | PASS                |
| **Prueba financiera 16**: 10.000 importes con decimales suman exacto (y se demuestra que `Number` falla)      | PASS                |
| API: `/api/health` con base de datos, Redis y almacenamiento arriba                                           | PASS                |
| API: errores con formato único en español y correlation ID propagado                                          | PASS                |
| BD: `audit_logs` rechaza UPDATE y DELETE                                                                      | PASS                |
| Web: estado por servicio con texto + icono (no solo color)                                                    | PASS                |
| Web: mensaje en español si la API no responde                                                                 | PASS                |
| Manual: worker procesa un trabajo de la cola `system`                                                         | PASS                |
| Manual: stack completo en contenedores (`--profile app`), migraciones automáticas, ruta SPA servida por nginx | PASS                |
| Manual: `npm run dev` levanta API, worker y web                                                               | PASS                |
| Lint, formato y verificación de tipos                                                                         | PASS                |
| Cobertura del dominio                                                                                         | 100 % (umbral 80 %) |

## 6. Riesgos y pendientes conocidos

| Tema                                         | Detalle                                                                                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm audit`: 1 vulnerabilidad moderada       | `minimatch` dentro de `typescript-eslint` (solo herramienta de desarrollo, no llega a producción). La única corrección automática es bajar `typescript-eslint` a una versión antigua; se acepta y se revisa en la Fase 10 |
| Imagen Docker de la API                      | Incluye `node_modules` completos. Imagen mínima de producción en la Fase 10                                                                                                                                               |
| Fila de prueba en la auditoría de desarrollo | La primera ejecución de las pruebas (antes de aislar `finagent_test`) dejó 1 registro `TEST` en la base de desarrollo; por diseño no se puede borrar. Se elimina solo si se recrea el volumen (`docker compose down -v`)  |
| Preguntas P1–P15 de la Fase 0                | Siguen sin respuesta; se usan los valores por defecto. Las más urgentes antes de la Fase 5: software contable (P1), bancos (P2) y archivos de ejemplo anonimizados                                                        |

## 7. Qué sigue — Fase 2 (design system y layout)

Tokens semánticos claro/oscuro con la paleta de marca, persistencia del tema, shadcn/ui, sidebar contraíble con la navegación de la sección 6, header, componentes globales (`StatCard`, `DataTable`, `MoneyCell`, `StatusBadge`, estados vacío/carga/error) y dashboard base con estados vacíos.
