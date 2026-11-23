# Semantic Model Explainer

Point the app at a Power BI semantic model and get a readable one-page summary: what is in it, how the tables relate,
which measures exist and how they are written, eight health checks with a score, and ready-made sample questions you can
run. It is a read-only Fabric App (Rayfin 2.0) that reads model metadata through a semantic model connector, so it never
calls the Execute Queries REST API directly and stores nothing.

## What it looks like

The home screen is a diagram of the model. Every table is a card listing its relationship keys first, then its
columns (with type) and measures; long tables show the first few and a "Show N more" link. Relationships run from the
key column on one card to the key column on the other, with dots flowing the way filters travel (from the one side to
the many side; both ways when the relationship filters both ways). Inactive relationships are dashed and still. Fact
tables sit in the centre column with their dimensions either side; tables with no relationships sit in a grid below.

- **Info panel:** click a table, a column, a measure or a relationship line to read about it. Tables show their role,
  description, counts, row count on demand, health findings, relationships and measures. Columns show data type, kind,
  format, the relationships they key and the measures that use them. Measures show their DAX (with copy), format,
  findings, what they use and what uses them. Relationships explain in words which table filters which, and on what.
  Everything in the panel links onward, and the focus is in the URL (`#/?focus=t:Sales`, `c:Sales|Customer Key`,
  `m:Sales|Total Sales`, `r:<index>`), so other screens link straight to it.
- **Find** any table, column or measure by name; hover a table or key column to light up its links; switch hidden
  columns and measures off to see what report authors see. Drag to pan, scroll to zoom, `Esc` clears the focus.
- **Other screens:** **Relationships** (compact diagram and the full list), **Tables & measures** (tables with columns
  and row counts, measures with highlighted DAX), **Health** (the score in a ring as the headline, tiles for documentation
  coverage, relationship risks, names and checklist progress, then a checklist of every flagged object to tick off, each linked to the diagram), **Sample questions**, **Summary** (printable one-pager with a map, or Markdown).
- With reduced motion the dots stop and arrowheads show the direction.

## 1. Prerequisites

- Microsoft Fabric with the **Fabric Apps** workload enabled and a workspace on a Fabric capacity.
- **Edit** permission (Contributor or higher) on that workspace to deploy.
- Tenant setting **Semantic Model Execute Queries REST API** enabled (Admin portal, Integration settings). The connector
  uses it under the signed-in user.
- Viewers need access to the app item and **Read + Build** permission on each bound semantic model.
- Node 20 or later.

## 2. Run locally

```bash
npm install            # at the repo root (npm workspaces)
cd apps/model-explainer
npm run dev            # offline demo on http://localhost:5210: three fictional models, persona switcher
npm run dev:fabric     # rayfin dev (note: connectors are not wired under rayfin dev, only after rayfin up)
```

The demo serves three fictional models through `MockModelClient`, so no tenant is needed:

| Demo model | What it shows |
|---|---|
| Sample Sales Model | 9 tables, 14 measures, 8 relationships; every health rule fires once (score 52). Names with spaces, an apostrophe (`Manager's Targets`) and brackets (`Size [cm]`, `Sales [Prior Year]`). |
| Sample Operations Model | 43 tables, no measures: several star schemas (two joined by a shared Region) and 8 unrelated tables; Sample questions explains why there is nothing to ask. |
| Sample Finance Model | Measure and relationship metadata blocked (403): those sections degrade, the rest keeps working. |

Tests: `npx vitest run` (unit tests for the domain logic, including the diagram layout) and `npx playwright test`
(smoke and acceptance at 390 px and 1280 px).

## 3. Deploy

The connector's model ids are not in the repo: `rayfin/rayfin.yml` reads them from the environment at `rayfin up`.

```yaml
connectors:
  - name: retail
    type: fabric-semanticmodel
    config:
      workspaceId: ${MODEL_WORKSPACE_ID}   # workspace that holds the semantic model
      itemId: ${MODEL_ITEM_ID}             # the semantic model's item id
```

Deploy with both variables set (Git Bash / macOS / Linux):

```bash
cd apps/model-explainer
MODEL_WORKSPACE_ID=<model-workspace-id> MODEL_ITEM_ID=<model-item-id> npx rayfin up --workspace-id <app-workspace-id>
```

PowerShell: `$env:MODEL_WORKSPACE_ID='<model-workspace-id>'; $env:MODEL_ITEM_ID='<model-item-id>'; npx rayfin up --workspace-id <app-workspace-id>`.

Or from the repo root, with the helper that sets them for you:

```bash
node tools/deploy-app.mjs model-explainer --workspace-id <app-workspace-id> --model-workspace-id <model-workspace-id> --model-item-id <model-item-id>
```

The ids are in the model's URL in the Fabric portal: `.../groups/<workspace-id>/datasets/<item-id>`. The app and the
model can live in different workspaces. `rayfin up` builds with `npm run build:fabric`, uploads `dist/` to Fabric static
hosting and applies the connector configuration. The data service is disabled (`services.data.enabled: false`), so no
SQL database is created.

### Binding more models (up to 3)

1. `npx rayfin connector add` (type `fabric-semanticmodel`, pick the model). This writes `rayfin/connectors/<name>/` and
   a new entry under `connectors:` in `rayfin/rayfin.yml`.
2. In that new entry, replace the literal ids with variables of its own, for example
   `workspaceId: ${MODEL2_WORKSPACE_ID}` and `itemId: ${MODEL2_ITEM_ID}` (and `MODEL3_…` for a third), so no ids are
   committed.
3. Add one line to `src/config/models.ts`: `<name>: 'Label shown in the picker',`. The connector configs and runtimes
   are derived from that map in `src/config/fabric.ts`.
4. Deploy with every variable set, for example
   `MODEL_WORKSPACE_ID=… MODEL_ITEM_ID=… MODEL2_WORKSPACE_ID=… MODEL2_ITEM_ID=… npx rayfin up --workspace-id <app-workspace-id>`
   (`tools/deploy-app.mjs` only sets the first pair; export the others in the shell first).

## 4. Seed

Nothing to seed. The app has no SQL entities and no database: it reads models through connectors, and the demo data is
the fictional mock models in `src/mock/`. `Person` (identity) lives in an in-memory store in both modes. There are no
admin-only features, so no admin needs to be set.

## 5. How it works

| Piece | Where |
|---|---|
| Connector wiring (`connectorsService` + `fabricSemanticModel()` per model, 5,000-row default cap) | `src/config/fabric.ts`, `src/config/models.ts`, `src/app.config.ts` (`fabric: { data: false, extraServices }`) |
| Model picker, query client per model, metadata cache | `src/state/ModelContext.tsx`, `src/components/ModelBar.tsx` |
| Metadata: `INFO.<X>()` then `INFO.VIEW.<X>()` per section, typed `ModelMetadata` | `src/domain/metadata.ts`, `src/domain/parse.ts`, `src/domain/types.ts` |
| Health rules and score | `src/domain/findings.ts`, thresholds in `src/config/rules.ts` |
| Health indicators and the action checklist; ticks per model in localStorage | `src/domain/checklist.ts`, `src/state/useChecklistTicks.ts` |
| DAX builders (quote escaping) | `src/domain/dax.ts` |
| Sample questions | `src/domain/questions.ts` |
| Object ids, fact table detection and table roles | `src/domain/model.ts` |
| Diagram layout (cards with rows, columns either side of the facts, links between key rows) | `src/domain/schema.ts` |
| Findings mapped to objects, measure coverage, the ranked top issues | `src/domain/issues.ts` |
| Which measures use a column or measure (DAX text scan) | `src/domain/usage.ts` |
| The diagram (HTML cards, SVG links with flowing dots, pan and zoom) and the info panel | `src/components/SchemaDiagram.tsx`, `src/components/InfoPanel.tsx`, `src/pages/DiagramPage.tsx` |
| Compact relationship diagram and the Summary map (hand-written SVG, no graph library) | `src/domain/diagram.ts`, `src/components/StarChart.tsx`, `src/components/ModelMap.tsx` |
| DAX highlighting | `src/domain/daxTokens.ts`, `src/components/Dax.tsx` |
| One-pager Markdown | `src/domain/markdown.ts` |
| Mock engine and fixture models | `src/mock/` |

**Entities.** None owned by the app. `Person` and `AppMarker` exist only in `src/model.ts` for the shared runtime and
live in memory.

**Screens.** Diagram (table cards, animated relationship links, info panel for tables, columns, measures and
relationships, find, hidden fields switch) · Relationships (SVG diagram with pan and zoom by buttons, wheel, drag or
keyboard; key; list alternative) · Tables & measures: Tables (grid, drawer with columns, on-demand
`EVALUATE ROW("n", COUNTROWS('<table>'))`, Count all rows) and Measures (search, filters for missing description /
format string, highlighted DAX with copy) · Health (score ring with its status and calculation, eight tiles with status and meters,
a checklist with one tickable item per flagged object grouped by rule with progress and Show in diagram, passed and
skipped rules) · Sample questions (up to 6 numeric measures x 4 related text or date
columns, `EVALUATE TOPN(20, SUMMARIZECOLUMNS('<table>'[<column>], "v", [<measure>]), [v], DESC)`, grid + bar chart) ·
Summary (map, print, download .md, copy as Markdown). Earlier routes (`#/tables`, `#/health`, …) redirect to the new
ones.

**Health rules.** Measures without a description (warning, more than 20% of visible measures) · Tables without a
description (info, any visible table) · Measures without a format string (warning, numeric measures by DataType: Number,
Currency, Integer, Decimal, Double, Int64) · Bidirectional relationships (warning) · Many-to-many relationships (warning)
· Inactive relationships (info) · Unfriendly names (info: visible tables, columns or measures with underscores, a leading
tbl/dim, or all caps of 4+ letters) · Large wide tables (info, more than 40 columns). **Score = 100 − 10 per warning (at
most 50) − 2 per info (at most 20)**; each rule counts once. Rules whose metadata is unavailable are skipped and listed.

**Security model.** Read-only. Every query goes through `client.connectors.<name>.executeQuery` with delegated auth, so
users only see models they can already query. Results are capped (metadata 20,000 rows, sample questions 100 rows,
connector default 5,000), row counts and sample questions run only on a click (Count all rows batches 20 tables per
query), and every `result.status` is checked before rendering. Names
are always quoted (`'` doubled in table names, `]` doubled in brackets) and generated DAX is checked for balanced
quoting before it runs. Nothing is persisted except the picked model and ticked checklist items, both in the viewer's localStorage.

## 6. VERIFY outcomes and known limits

| VERIFY | Outcome |
|---|---|
| DAX INFO functions through the connector | On the test tenant `INFO.TABLES()` / `INFO.MEASURES()` fail through the query API; `INFO.VIEW.TABLES/COLUMNS/MEASURES/RELATIONSHIPS()` work. The app tries `INFO.*` first, falls back to `INFO.VIEW.*`, and marks a section "not available for this model" (category, message, what was tried, Retry) when both fail. Both shapes are parsed (ids and numeric enums for `INFO.*`, names and text enums for `INFO.VIEW.*`); columns are matched by name with brackets stripped; `RowNumber-…` columns are excluded. |
| Measure DAX | On this tenant `INFO.VIEW.MEASURES` returns no expressions (`Expression` is null for every measure), verified against the deployed X10 Retail Demo Model. The Measures tab and one-pager then say "Expressions aren't exposed by the query API for this model" and show everything else. The offline demo models keep their DAX so the expression views can be shown. |
| Model ids in the repo | None: `rayfin.yml` reads `${MODEL_WORKSPACE_ID}` / `${MODEL_ITEM_ID}` at `rayfin up`. Deployed this way, the connector applied successfully. |
| Connector-only project | `services.data.enabled: false`, no `rayfin/data`. The shared runtime gets `fabric: { data: false }` so identity uses an in-memory store. |
| Connectors under `rayfin dev` | Not wired (platform limit); verify after `rayfin up`. |

Known limits:

- Many-to-many and one-to-one relationships with single-direction filtering are drawn with the arrow on the "from" end;
  `INFO.VIEW.RELATIONSHIPS` does not say which way they filter.
- When a measure's DataType is missing, "numeric" is inferred from the DAX (FORMAT/CONCATENATE/string literal = text).
- Sample questions only follow active relationships; questions over a many-to-many relationship may return repeated totals.
- The model picker is the title of the diagram's panel and a caption above every other screen's title (the shared
  AppShell has no header slot).
- The shared nav is static, so for models with nothing to ask (no measures) the Sample questions link is hidden with
  CSS; opening `#/probes` directly still explains why there are no questions.
- "Used by" in the info panel is a text scan of measure DAX, not a parser: references inside comments or strings count.
- The Fabric build embeds the Rayfin API URL (it contains the tenant and workspace ids) and the publishable key in the JS
  bundle, as every Rayfin app does. They are not secrets: the backend still requires a Fabric sign-in and checks access.
  The semantic model's ids are not in the bundle (they stay server-side in the connector configuration).

## 7. Later

- Paste-a-link support through a Function (explain any model without rebinding).
- A diff between two models.
- A column-usage scan (which columns no measure or relationship uses).
- Calculation groups, perspectives and roles (RLS) in the summary.

## 8. Gallery

**Title:** 12 Days of Fabric Apps: Day [#] – [Theme]: Semantic Model Explainer

**Blurb (60 words):** See your semantic model at a glance. Semantic Model Explainer reads a Power BI model through a
Fabric connector and draws every table as a card with its keys, columns and measures, linked by animated relationships
that show which way filters flow. Click anything for its DAX, relationships, usage and health findings; a printable
summary shares it.

**Tags:** Partner | 12 Days of Fabric Apps · Semantic model · Power BI · DAX · Data governance · Fabric Apps
