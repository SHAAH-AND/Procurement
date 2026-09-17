# Backend boundaries

ProcureFlow currently contains two backend surfaces:

| Surface | Location | Role |
| --- | --- | --- |
| Local application service | `backend` | NestJS API, Prisma access, local development, and automated tests |
| Deployed Catalyst API | `backend/functions/procurement_api` | Production serverless API configured by `catalyst.json` |
| Signup gate | `backend/functions/procurement_signup_gate` | Production signup workflow |

This is an intentional compatibility boundary while the platform uses both
local NestJS workflows and Catalyst production services. New work must identify
the deployed route and update the matching surface. Do not silently implement
only one side when the feature is expected to work locally and in production.

When the two implementations share a request or response contract, put that
contract in `packages` rather than copying types between applications.
