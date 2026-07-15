---
name: Orval schema naming collision with operationId
description: Orval auto-derives Body/Response type names from operationId; custom schemas with the same name cause TS2308 duplicate export errors.
---

Orval generates `{OperationId}Body` and `{OperationId}Response` names from the operationId in the OpenAPI spec.
If a schema in `components/schemas` has the same name as one of these auto-derived names, `tsc --build` fails with:

> Module './generated/api' has already exported a member named 'XyzResponse'

**Why:** Both the operation-level codegen and the schema-level codegen produce the same export symbol.

**How to apply:** Before running codegen, check that no schema name matches `{operationId}Response` or `{operationId}Body` patterns. If there's a collision, rename the schema (e.g. `AiQueryResponse` → `AiQueryAnswer`). The operation-derived name is always given priority by Orval, so rename the manual schema, not the operationId.
