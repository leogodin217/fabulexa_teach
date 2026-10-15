# Fabulexa Teach

Tools for teachers and writers: public presentation/explanation tools for people
teaching data concepts. The user is the *instructor* producing explanations (videos,
blogs, tutorials) — not the learner (that's workshop) and not the data pipeline
(that's composite → forge → loom).

First tool: the **row renderer** — tiny hand-authored tables, declared operations,
provenance-colored presentation-quality rendering. The founding plan lives in the vault:
`plan/fabulexa-teach-row-renderer-for-data-concept-explainers`.

## Principles (binding)

- **Rows only, never abstractions.** Never render an abstraction of a table — no Venn
  diagrams, no table icons. Every concept is demonstrated by actual rows with actual
  values. SQL tables are bags, not sets.
- **Render claims, don't compute (v1).** The author supplies inputs, outputs, and
  provenance links; the tool renders them. Cheap *verification* of a claim (e.g. a
  uniqueness duplicate-scan) is fine; query processing is a later, deliberate tier.
- **Author in a spreadsheet, render here.** Paste-as-TSV is the ingestion path. No
  Sheets plugin.
- **Scenes are files.** Plain JSON, versionable, reusable.
- **Zero runtime dependencies.** No build step, no npm, no CDN. The repo is the app.
  Policy and rationale in `DEPENDENCIES.md` — read it before adding ANY dependency,
  dev tooling included.

## Boundary

Teach **presents; it never generates data**. Its example datasets are deliberately
tiny and hand-authored — generating them would miss the point. It consumes no fleet
contract today; if a tool later reads published warehouses (e.g. complex_queries
links), that's a new contract discussed with the ecosystem repo first.

## Method

Deliberately lightweight: no sprint tooling, no arch-design/implement-sprint process.
Plans and findings live in the vault (`/note`); cross-repo questions go through
`/consult` (ecosystem for strategy). Each tool keeps its own directory so it can
graduate to its own repo if it grows.

## Mission check

Every feature answers *what does this teach?* first. A rendering that looks impressive
but obscures the mechanism is cut.
