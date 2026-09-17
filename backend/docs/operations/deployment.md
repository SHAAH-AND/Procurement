# Deployment

The deployment runbook is maintained in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md) for compatibility with existing
operational links. This page is the stable entry point for new contributors.

Before deploying:

```bash
npm run verify
```

Deploy the functions individually, then deploy the client. Confirm the live
health endpoint and build version after deployment.
