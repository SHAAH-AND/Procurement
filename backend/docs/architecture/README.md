# Architecture

## System overview

The repository contains a React/Vite client, a NestJS/Prisma service used for
local development and tests, and Catalyst serverless functions that are
deployed through `catalyst.json`.

## Documents

- [Backend boundaries](backend-boundaries.md)

## Architectural rules

- Keep UI behavior in the owning frontend feature.
- Keep API behavior in the backend that owns the deployed route.
- Keep database access behind the relevant service or repository boundary.
- Put cross-application contracts in `packages`, not in application internals.
- Document changes that affect deployment, tenancy, authentication, or data
  migrations.
