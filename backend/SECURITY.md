# Security Policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Report it privately
to the project security owner with the affected component, reproduction steps,
impact, and any suggested mitigation.

Do not include credentials, tokens, customer data, or other secrets in a
report or commit.

## Repository security rules

- Secrets must be stored in Catalyst environment variables or an approved
  secret manager.
- `.env*` files are ignored except for `.env.example`.
- Authentication and authorization changes require verification coverage.
- Tenant and workspace isolation must be tested when data access changes.
- Dependencies should be kept current and reviewed through CI.

## Security checks

The repository verification suite includes authentication, headers, error
leakage, and authorization checks. Run `npm run verify` before deployment.
