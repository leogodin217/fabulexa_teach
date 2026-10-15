# Dependency policy

This repo targets **zero runtime dependencies**, and holds the line deliberately.
Supply-chain attacks are now routine; for a small public teaching tool, the strongest
posture isn't vetting dependencies well — it's not having them.

## The rules

1. **Zero runtime dependencies is the default and the target.** Tables, colors, row
   links, expand/collapse are DOM/CSS/SVG. Scenes render as native SVG, so PNG export
   is the built-in canvas API — no html2canvas-class libraries.
2. **No build step, no npm.** The dominant supply-chain surface for a project like this
   is the transitive dev-dependency graph behind a bundler. It should not exist. The
   repo is the app: `index.html` plus a handful of JS/CSS files readable end to end.
3. **No CDN at runtime.** A `<script src="https://cdn...">` is a live supply-chain
   dependency on every page load, for every user, forever. Anything ever adopted is
   **vendored**: committed to this repo as a reviewed file.
4. **If a library ever earns its way in** (the realistic future case is DuckDB-WASM for
   a real-SQL tier), it must be:
   - boring and massively deployed, with zero or near-zero transitive dependencies;
   - vendored at an exact version **pinned by content hash** (a version tag can be
     re-pointed; a hash can't);
   - no younger than **30 days** at adoption (the window in which compromised releases
     get caught and yanked);
   - upgraded manually, on our schedule, by reviewing the diff of the vendored file.

## Why this is also a feature

This is a public resource meant to be forked and remixed by teachers and writers.
Zero dependencies means: view source and it's all here, nothing phones home, copy one
directory and you own it outright — no install, no toolchain, no rot.
