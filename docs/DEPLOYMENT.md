# Deployment — Hotel Procurement

One Catalyst project serves **one hotel group**. There is no tenant switching
and no operator console: the people who run the hotel are the only people who
need to get in, and they are managed in Settings → Users.

## What ships

| Path | Role |
|---|---|
| `functions/procurement_api/` | The API — one Advanced I/O function, node20. `v1/` holds the `/api/v1` surface the React client uses |
| `functions/procurement_signup_gate/` | Custom user validation: public signup is denied unless an administrator approved |
| `frontend/` | The React + Vite client. `npm run build` writes `frontend/dist`, which Catalyst serves from `/app` |
| `verification/` | Pre-deploy gate and the local Catalyst stand-in (not deployed) |

Nothing else in the repo is deployed. `catalyst.json` names exactly these targets.

### Data model note

The React client talks only to `/api/v1`. Its documents — requests, orders,
receives, bills, payments, credits, RFQs, bids, awards, recurring bills,
payment batches, budgets and the settings store — live in two Data Store
tables, `V1Docs` (JSON header + indexed Kind/Status/OwnerID/RefID/DocNumber)
and `V1Lines` (JSON sub-collection rows keyed by DocID, with `LookupKey` for
vendor invite tokens). Both must exist in every environment the function runs
in; they are created through the console or the Catalyst API, not by code.
Masters — items, vendors, users, permission profiles, properties — are the
installation's existing tables, translated to the client's shape.

## Deploying

```bash
bash verification/verify.sh     # must exit 0 (backend suites + tsc + vite build)
catalyst deploy --only functions:procurement_api
catalyst deploy --only functions:procurement_signup_gate
npm run build && catalyst deploy --only client
```

`catalyst deploy` only ever targets **Development**. Promote to Production from
the console: Settings → Environments → Deployments → Create Deployment
(Development → Production) → Generate Diff → Initiate Deployment. The
Production URL is `https://procurement-932021889.catalystserverless.com/app/`
(custom domain `https://procurement.cloudhub.lk/app/`).

**Deploy the functions one at a time.** A plain `catalyst deploy` with two
functions fails one of them with `API Error: socket hang up`; the upload
succeeds and the platform hangs up during build. The failure is loud and
harmless (the previous version keeps serving), but it is easy to misread as a
broken function.

Then hard-reload the browser once and confirm the build:

```
https://<your-domain>/server/procurement_api/api/health
https://<your-domain>/server/procurement_api/api/v1/health
```

Both must report `"version": "5.0.0-procureflow-react"`. If they report
anything else, the function did not deploy — the client and the function
deploy separately and it is possible to ship one without the other. The
signed-in app shows the same build next to the user's name on Home.

## Local development

```bash
node verification/devserver.mjs          # real API on :3100, in-memory Data Store, shimmed Catalyst auth
cd frontend && CATALYST_TARGET=http://127.0.0.1:3100 npm run dev
```

Open `http://localhost:5173/app/?asuser=admin@gallefacehotel.com`. `FRESH=1`
on the stand-in starts with no workspace so the first-run setup screen can be
exercised.

## Configuration

Set in **Catalyst console → Functions → procurement_api → Configuration →
Environment Variables**:

| Variable | Required | Purpose |
|---|---|---|
| `APP_ORIGIN` | recommended | Canonical public origin. Every absolute URL handed to a browser or a supplier email is built from it. Defaults to `https://procurement.cloudhub.lk`. Deliberately **not** derived from the `Host` header. |
| `PROCUREFLOW_AUTH_ZAID` | required for user invitations | Zoho Accounts ZAID used when Catalyst creates and emails a new workspace-user invitation. The current project value is committed in `functions/procurement_api/catalyst-config.json`; deploy `procurement_api` after changing it. |
| `BOOKS_CLIENT_SECRET` | optional | Zoho Books OAuth secret. Without it the Books integration is simply unavailable; nothing else is affected. |
| `MAIL_FROM` | optional | Verified sender for outbound mail. |
| `ATTACHMENTS_FOLDER_ID` | optional | Legacy File Store fallback. Primary attachment storage is the Stratus bucket. |

**No secret is ever committed.** `.gitignore` excludes `.env*` apart from
`.env.example`.

After deploying, open `/server/procurement_api/api/health`. It should report
`"userInvitationsConfigured": true`. If it does not, use the Catalyst console
to set the variable for the active environment, then redeploy only
`procurement_api`.

## First run

The first person to sign in gets the setup screen. It creates:

- the workspace, with the full classification matrix in its settings
- **9 roles** in the approval hierarchy, laddered so escalation is one lookup
- **3 access profiles** (view/edit, +approve, administrator)
- **15 properties across 5 clusters** if the properties box is left empty,
  otherwise whatever is entered as `Name | Location | Cluster`
- **15 item-master custom fields** (UOM conversion, lead time, tax treatment,
  supplier approval status, par level, warranty…)

No sample catalogue is seeded. The customer's own items go in via
Items → Import.

Setup can only run once; a second attempt returns `409 ALREADY_SET_UP`.

## Approval routing

Every requisition carries two independent classifications:

- **Expenditure category** — Capex / Opex / Repair / AMC (drives reporting)
- **Budget status** — decides which approval route it walks:

| Budget status | Route |
|---|---|
| Within budget | HoD → Head of Finance → GM → Purchasing Manager → Central Procurement → Procurement Committee |
| Not budgeted | HoD → Head of Finance → GM → VP operations/CEO → **Board of Directors** |
| Exceeds budget | as *within budget*, then **Board of Directors** |

A property-level role (GM, Head of Finance) resolves to the holder **at that
requisition's property**, falling back to a head-office holder of the same
title.

**If a role on the route has nobody mapped to it**, the requisition stays
`Pending_Approval` with no approver and the UI says which role is vacant. It
does *not* fall through to approved. Fix it in Settings → Users by assigning
someone to that role.

## After deploying to a new customer

1. Sign in and complete the setup screen.
2. Settings → Users: add each person, set their **role** (this is what routes
   approvals) and their **profile** (this is what they may do).
3. Settings → Properties: check the cluster on each property — the group
   dashboard rolls up by cluster.
4. Items → Import: load the customer's catalogue.
5. Budgets: set per property and expense type, so the dashboard variance
   column means something.
