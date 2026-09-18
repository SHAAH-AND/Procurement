# ProcureFlow

ProcureFlow is a procurement SaaS platform for managing workspaces, users,
vendors, requisitions, approvals, RFQs, items, and purchasing workflows.

This repository is a JavaScript/TypeScript monorepo. It contains the browser
application, the NestJS/Prisma service used for local development and
integration testing, Catalyst serverless functions used by the deployed
application, shared packages, deployment tooling, and verification tests.

## Repository map

| Directory | Purpose |
| --- | --- |
| `frontend` | React 19 + Vite frontend |
| `backend` | NestJS + Prisma backend for local development and tests |
| `backend/functions` | Catalyst serverless functions deployed to production |
| `database` | Prisma schema, seeds, local Postgres/Redis compose |
| `packages` | Code shared by more than one application |
| `docs` | Product, architecture, security, and deployment documentation |
| `infra/tools` | Operational checks and deployment helpers |
| `verification` | Pre-deployment functional and security verification |
| `docker-compose.yml` | Local PostgreSQL and Redis services |

The deployed Catalyst project is defined in `catalyst.json`. Read
[`docs/architecture/backend-boundaries.md`](docs/architecture/backend-boundaries.md)
before adding an endpoint so that the correct backend is changed.

## Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- Docker Desktop for the local PostgreSQL and Redis services
- Google Chrome for browser verification stages
- Catalyst CLI for deployment work

## Getting started

```bash
npm ci
copy .env.example .env.local
docker compose up -d
npm run db:push
npm run dev:web
```

Run the backend in a second terminal:

```bash
npm run dev:backend
```

The frontend is normally available at `http://localhost:5173`. The optional
local proxy is available through `node local-proxy.js` after a frontend build.

## Common commands

```bash
npm run build              # build all workspaces
npm run build:web          # build the frontend
npm run build:backend      # build the NestJS backend
npm run lint               # lint frontend and backend
npm run typecheck          # type-check frontend and backend
npm run test               # run backend unit tests
npm run test:e2e           # run backend end-to-end tests
npm run verify             # run the pre-deployment verification gate
npm run db:push            # apply the local Prisma schema
npm run db:seed            # seed local development data
```

## Configuration and secrets

`.env.example` documents the Catalyst API configuration. Real secrets belong
in the Catalyst console or in an untracked local environment file. Never
commit `.env` files, tokens, OAuth secrets, database credentials, or generated
deployment artifacts.

## Deployment

Read [`docs/operations/deployment.md`](docs/operations/deployment.md) and run
the verification gate before deploying:

```bash
npm run verify
```

Deploy the Catalyst functions separately, then deploy the client. Confirm the
health endpoint after deployment.

## Documentation

- [Architecture](docs/architecture/README.md)
- [Development workflow](CONTRIBUTING.md)
- [Deployment operations](docs/operations/README.md)
- [Product documentation](docs/product/README.md)
- [Security policy](SECURITY.md)
- [Verification suite](verification/README.md)

## License

This is proprietary software. See the repository access and distribution
policy maintained by the project owners.
