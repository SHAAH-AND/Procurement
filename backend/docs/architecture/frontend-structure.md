# Frontend structure

The web application uses feature ownership and workflow boundaries:

- `src/app` owns route composition and application configuration.
- `src/layouts` owns reusable page shells.
- `src/components` owns business-agnostic UI.
- `src/shared` owns genuinely cross-feature infrastructure.
- `src/features` owns pages, API adapters, hooks, schemas, types, and tests
  for a business capability.

Existing URLs are intentionally unchanged. Route groups now import through
feature boundaries, while temporary compatibility exports point at the legacy
`features/procurement/pages.tsx` implementation. This allows one feature to be
extracted and validated at a time without a risky all-at-once rewrite.

## Extraction order

1. Catalog items and suppliers
2. Purchase requests and approvals
3. RFQs
4. Purchase orders
5. Receiving
6. Payables
7. Settings and administration

Do not add new page implementations to `pages.tsx`. During extraction, keep
the old export names available until all route imports and tests use the new
feature-owned modules.
