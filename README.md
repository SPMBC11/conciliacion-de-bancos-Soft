# FinAgent AI — Conciliación bancaria

Plataforma web de conciliación bancaria para Colombia: se sube el extracto del banco y el auxiliar contable, un motor determinista propone coincidencias y el contador revisa, concilia, aprueba y genera el informe oficial (diferencia $0).

> v1 **sin inteligencia artificial**: motor de reglas determinista + revisión manual.
> Repositorio público: **nunca** subir extractos, auxiliares ni datos bancarios reales.

## Requisitos

- Node.js 24 (`nvm use`)
- Docker Desktop (Compose v2)

## Arranque rápido

```bash
cp .env.example .env      # valores de desarrollo, sin secretos reales
npm install
npm run infra:up          # PostgreSQL, Redis, almacenamiento S3 (SeaweedFS), Mailpit
npm run db:migrate        # aplica migraciones
npm run dev               # API :3000, worker y web :5173
```

Crear la primera organización y su Propietario (imprime un enlace de invitación; el correo también llega a Mailpit):

```bash
npm run build -w @finagent/domain -w @finagent/contracts && npm run build -w @finagent/api
npm run bootstrap -w @finagent/api -- --nit 900000001-1 --name "Mi Empresa S.A.S." --email yo@empresa.co
```

Abrir el enlace, definir la contraseña (mínimo 12 caracteres) y entrar en http://localhost:5173. El registro de usuarios es solo por invitación.

| Servicio                        | URL                            |
| ------------------------------- | ------------------------------ |
| Web                             | http://localhost:5173          |
| API                             | http://localhost:3000/api      |
| Swagger (OpenAPI)               | http://localhost:3000/api/docs |
| Mailpit (correos de desarrollo) | http://localhost:8025          |

Todo en contenedores (sin Node local): `docker compose --profile app up --build`.

## Scripts

| Comando                           | Qué hace                                                   |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                     | API + worker + web con recarga automática                  |
| `npm test`                        | Pruebas de todos los paquetes (la API requiere `infra:up`) |
| `npm run lint` / `npm run format` | ESLint / Prettier                                          |
| `npm run typecheck`               | Verificación de tipos                                      |
| `npm run db:migrate`              | Crea/aplica migraciones en desarrollo                      |

## Estructura

```text
apps/api          NestJS: API REST (main.ts) y worker de colas (worker.ts), Prisma
apps/web          React + Vite + Tailwind
packages/domain   Lógica financiera pura (dinero exacto, motor, saldos ajustados)
packages/contracts Esquemas Zod compartidos entre API y web
infra/            Dockerfiles, nginx, configuración del almacenamiento
docs/             Documentación por fase
```

## Documentación

- [Fase 0 — Auditoría y planificación](docs/PHASE-0-AUDIT.md)
- [Fase 1 — Fundación](docs/PHASE-1-FOUNDATION.md)
- [Fase 2 — Design system y layout](docs/PHASE-2-DESIGN-SYSTEM.md)
- [Fase 3 — Autenticación y administración](docs/PHASE-3-AUTH.md)
