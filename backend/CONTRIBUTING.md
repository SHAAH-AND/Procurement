# Contributing to ProcureFlow

## Before changing code

1. Read the root `README.md` and the relevant architecture documentation.
2. Confirm whether the change belongs in `frontend`, `backend`, or
   `backend/functions`.
3. Keep secrets and generated output out of commits.

## Development standards

- Use TypeScript for application and shared code.
- Keep business logic inside the owning feature or backend module.
- Reuse shared types and validation rather than duplicating contracts.
- Add or update tests for changed behavior.
- Use Prisma migrations for shared or production database changes.
- Keep public API and deployment documentation current.

## Validation

Run the smallest relevant checks locally, then run the full pre-deployment
verification suite for changes affecting deployed behavior:

```bash
npm run lint
npm run typecheck
npm run build
npm run test
npm run verify
```

## Pull requests

Pull requests should explain the user-visible change, implementation area,
configuration changes, migration requirements, and validation performed.
Keep unrelated refactoring out of feature pull requests.

## Commits

Use concise imperative commit messages. Preferred prefixes are `feat`, `fix`,
`refactor`, `docs`, `test`, `build`, and `chore`.
