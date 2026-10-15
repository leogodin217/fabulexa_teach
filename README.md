# Fabulexa Teach

Tools for people who **explain** data concepts — in videos, blog posts, tutorials, and
classrooms.

The idea: the best way to teach a data concept is tiny, real tables with actual values,
shown doing the thing — not abstractions. A seven-row table you can check by eye beats a
Venn diagram every time. (SQL tables are bags, not sets; a Venn diagram can't show
fan-out, NULL keys, or duplicates. These tools never render an abstraction of a table —
only rows.)

## Tools

### Feltboard *(first tool — in design)*

**Rows, never circles.** Like the classroom felt board it's named for: you place the
pieces by hand, move them while you talk, and everyone watches the mechanism happen.

Author tiny tables (paste straight from a spreadsheet), declare how an operation
transforms them, and render a presentation-quality, provenance-colored visualization:

- Source tables color-banded; result columns and rows tinted by origin.
- Hover a result row to highlight the source rows that produced it.
- GROUP BY results expand to reveal their member rows — in place or in a side panel.
- Uniqueness declared per column (or column-set) and verified against the data; join
  cardinality (1:1, 1:N, N:M) labeled from the keys, so fan-out is visible *before* it
  happens.
- Export slide-quality PNG/SVG; scenes save as plain JSON you can keep in git and reuse
  across videos.

It teaches joins, grouping, grain, set operations, window functions, NULL semantics,
and reshaping — by showing the mechanism, never pasting in the outcome.

## Principles

- **Rows only.** No circles, no icons, no table abstractions. Real rows, real values.
- **View source, it's all here.** Zero runtime dependencies, no build step, no CDN,
  nothing phones home. See [DEPENDENCIES.md](DEPENDENCIES.md).
- **Fork it.** A tool here is a handful of readable files. Copy it, restyle it, make a
  better tutorial than ours — that's the point.

Part of the [Fabulexa](https://github.com/leogodin217/fabulexa_complex_queries)
ecosystem: synthetic data generated from a process, for learning.
