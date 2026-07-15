# ProjectHub

A project management app for a small B2B SaaS team: track tasks, assign owners, set deadlines, and see progress across every project from one dashboard.

## Product

- **Dashboard** (`/`): cross-project totals, active/overdue/due-this-week counts, global status breakdown, recent activity feed.
- **Projects** (`/projects`, `/projects/:id`): project cards with progress bars; detail view shows task list, status/priority breakdown, overdue count.
- **Tasks** (`/tasks`): all tasks across projects, filterable by project/assignee/status, with inline status/assignee/due-date editing.
- **Team** (`/team`): member directory with create/edit/delete.
- Entities: Member, Project (status: planning/active/on_hold/completed), Task (status: todo/in_progress/in_review/done; priority: low/medium/high/urgent).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
