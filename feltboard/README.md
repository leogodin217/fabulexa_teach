# Feltboard

*Rows, never circles.*

A manual renderer for teaching data concepts. You author tiny tables and declare how an
operation transforms them; feltboard renders a presentation-quality, provenance-colored
visualization you can hover, expand, present, and export. It computes nothing — like the
classroom felt board it's named for, you place every piece by hand, and that's the point:
the demonstration is exactly the claim you chose to make.

**No install.** Use it at
**https://leogodin217.github.io/fabulexa_teach/feltboard/**, or open `index.html` in a
browser — same thing. One HTML file, one CSS file, one JS file, zero dependencies
(policy: [../DEPENDENCIES.md](../DEPENDENCIES.md)).

## Workflow

1. **Paste tables** from a spreadsheet (copy from Excel/Sheets arrives tab-separated;
   first line = headers), then **Apply data**. Each table gets a color.
2. **Declare uniqueness**: select column chips, **Mark selected columns unique**.
   Single keys get a `unique` bracket; composite keys get `unique together`. Feltboard
   verifies the claim against the rows — duplicates turn the bracket red and outline the
   offending cells (which is itself a demo of what a key violation *is*).
3. **Build the result table**: paste or type it, set its role to **result**, and set
   each column's source table so it tints with that table's color.
4. **Link provenance by hand**: select a result row, **Edit links**, click the source
   rows that produced it (Esc finishes). Hovering any row now highlights its lineage;
   selecting a row pins the highlight so it appears in exports.
5. **Expand**: click the ▸ on a result row to fold out the rows behind it — in place
   (pivot-table drill-down) or in a side panel (room for an annotation like
   `450 + 895 = 1,345`), switchable in the options.
6. **Ghost** rows that didn't survive the operation; write the literal cell value
   `NULL` to render a real NULL (styled as different-in-kind, everywhere).
7. **Present** hides the editor and enlarges everything for recording; **SVG/PNG**
   export exactly what's on the board, slide-quality.

Two built-in examples (`Example: joins`, `Example: group by`) show the full vocabulary
on the stores / email-lists / campaigns dataset — including fan-out, orphan rows, NULLs
from a left join, composite keys, and a 17-rows-collapse-to-6 GROUP BY.

## Scenes are files

**Save scene** writes plain JSON (`*.feltboard.json`) you can keep in git and reuse
across videos; **Open…** loads one. The board also autosaves to your browser's
localStorage as a convenience, but the file is the real artifact.

Scene shape (informal):

```json
{
  "feltboard": 1,
  "title": "SQL joins: stores × email lists × campaigns",
  "options": { "present": false, "expandMode": "inplace",
               "dimRepeats": true, "showLinks": "hover" },
  "tables": [
    { "id": "stores", "name": "Stores", "color": "#2E6FB7", "role": "source",
      "grain": "one row per store",
      "columns": ["ID", "Region", "Location"],
      "rows": [["1001", "Northeast", "New Ipswich"]],
      "keys": [["ID"]],
      "ghosts": [5, 6] }
  ],
  "links": [
    { "fromTable": "stores", "fromRow": 0, "toTable": "result", "toRow": 0 }
  ],
  "tints": { "result": { "0": "stores", "3": "email" } },
  "annotations": { "result:0": "max(4010, 4035, 4040) = 4040" }
}
```

`links` always point source → result. `tints` map a result table's column index to the
source table that column came from. `ghosts` are row indices rendered faded.
`annotations` key is `tableId:rowIndex`.

## Principles (why it's built this way)

- **Rows only.** It never renders an abstraction of a table. SQL tables are bags, not
  sets; Venn diagrams can't show fan-out, NULL keys, or duplicates. Actual rows can.
- **It renders claims, it doesn't compute.** You are the query engine. The one
  exception is verification: checking a uniqueness claim is a duplicate scan, not query
  processing. (A declarative-ops tier may come later; see the project plan.)
- **The board is native SVG**, so export is the built-in canvas API and the saved SVG
  is self-contained.
