# ProcureFlow

ProcureFlow is the hotel-group procure-to-pay platform for the Galle Face
Hotel Group, deployed on Zoho Catalyst (project `94596000000014049`).
Requisitions, approvals, RFQs and vendor quotes, purchase orders, receiving,
bills with 3-way matching, payments, vendor credits, recurring bills, payment
batches and budgets — one calm flow, invitation-only.

Production: https://procurement.cloudhub.lk/app/

## Repository map

| Path | Purpose |
| --- | --- |
| `frontend/` | React 19 + Vite client. `npm run build` writes `frontend/dist`, which Catalyst serves from `/app` |
| `functions/procurement_api/` | The API — one Catalyst Advanced I/O function (Express, node20). `v1/` is the `/api/v1` surface the client uses |
| `functions/procurement_signup_gate/` | Catalyst custom user validation: public signup is denied unless an administrator approved |
| `verification/` | Pre-deploy gate (`verify.sh`), the end-to-end API suite (`v1test.mjs`) and a local Catalyst stand-in (`devserver.mjs`) |
| `tools/` | Operational checks and deploy helpers |
| `docs/` | Deployment guide, user guide, customer spec and project plan |
| `catalyst.json` | The two functions and the client are the only deployed targets |

## Prerequisites

- Node.js 20 or newer, npm 10 or newer
- Catalyst CLI (`npm i -g zcatalyst-cli`), logged in to the Catalyst org
- Google Chrome only for manual browser checks

## Getting started

```bash
npm --prefix frontend ci
npm --prefix functions/procurement_api ci
npm run verify                # backend suites + tsc + vite build
```

Run the client locally against a stand-in Catalyst (real API code, in-memory
Data Store, shimmed hosted auth):

```bash
npm run dev:catalyst          # http://127.0.0.1:3100
cd frontend && CATALYST_TARGET=http://127.0.0.1:3100 npm run dev
```

Open `http://localhost:5173/app/?asuser=admin@gallefacehotel.com`. Set
`FRESH=1` on the stand-in to start with no workspace and exercise setup.

## Deploying

Read [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). In short:

```bash
npm run verify
npm run deploy:api            # catalyst deploy --only functions:procurement_api
npm run deploy:gate           # catalyst deploy --only functions:procurement_signup_gate
npm run deploy:client         # build + catalyst deploy --only client
```

`catalyst deploy` targets Development. Promote to Production from the console
(Settings → Environments → Deployments), then confirm
`/server/procurement_api/api/v1/health` reports the expected build.

## Configuration and secrets

`.env.example` documents the function's environment variables. Real secrets
belong in the Catalyst console (Functions → procurement_api → Environment
Variables), never in the repo.

## History

`legacy/galle-face-production` holds the history of the previous deployable
repository (vanilla-JS client), kept for reference.
