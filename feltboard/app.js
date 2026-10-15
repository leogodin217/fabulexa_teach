// Feltboard — rows, never circles.
// A manual renderer for teaching data concepts: tiny tables, hand-declared
// provenance, presentation-quality output. Zero dependencies by policy
// (see ../DEPENDENCIES.md). The board is native SVG so exports are built-in.
'use strict';

/* ------------------------------------------------------------------ state */

const PALETTE = ['#2E6FB7', '#E0782A', '#3E9A4E', '#8A5CB8', '#1F9E9E',
  '#C94F6D', '#8A8F2E', '#5A6B7A'];
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, ' +
  '"Helvetica Neue", Arial, sans-serif';
const SVGNS = 'http://www.w3.org/2000/svg';

let scene = newScene();
const ui = {
  pinned: null,       // 'tableId:rowIdx' — persistent highlight (shows in exports)
  hover: null,        // same shape, transient
  linking: null,      // result row currently having its links edited
  expanded: new Set() // result rows showing their member rows
};

// rebuilt on every renderBoard()
let rowEls = {};      // key -> {rect, baseFill, left, right, midY, color}
let overlayEl = null;

function newScene() {
  return {
    feltboard: 1,
    title: 'Untitled scene',
    options: { present: false, expandMode: 'inplace', dimRepeats: true, showLinks: 'hover' },
    tables: [],   // {id, name, color, role, grain, columns, rows, keys, ghosts}
    links: [],    // {fromTable, fromRow, toTable, toRow} — from source, to result
    tints: {},    // tableId -> {colIdx: sourceTableId}
    annotations: {} // 'tableId:rowIdx' -> text
  };
}

function normalize(s) {
  const base = newScene();
  s.options = Object.assign(base.options, s.options || {});
  s.tables = (s.tables || []).map(t => Object.assign(
    { keys: [], ghosts: [], grain: '', role: 'source' }, t));
  s.links = s.links || [];
  s.tints = s.tints || {};
  s.annotations = s.annotations || {};
  return s;
}

/* ------------------------------------------------------------------ utils */

const $ = id => document.getElementById(id);
const K = (t, r) => `${t}:${r}`;
const slug = s => (s || 'scene').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'scene';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

const measureCtx = document.createElement('canvas').getContext('2d');
function measure(text, size, weight) {
  measureCtx.font = `${weight || 400} ${size}px ${FONT}`;
  return measureCtx.measureText(String(text)).width;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
}

function sz() {
  return scene.options.present
    ? { font: 17, rowH: 36, pad: 11, title: 20, gap: 60, margin: 30, keyBand: 21 }
    : { font: 13, rowH: 27, pad: 8, title: 15, gap: 46, margin: 22, keyBand: 16 };
}

function el(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Paste from a spreadsheet arrives as TSV; bare CSV works as a fallback
// (naive split — no quoted commas; TSV is the supported path).
function parseGrid(text) {
  const lines = String(text).replace(/\r/g, '').split('\n')
    .filter(l => l.trim() !== '');
  if (!lines.length) return null;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const grid = lines.map(l => l.split(delim).map(c => c.trim()));
  const columns = grid[0];
  const rows = grid.slice(1).map(r => {
    const out = r.slice(0, columns.length);
    while (out.length < columns.length) out.push('');
    return out;
  });
  return { columns, rows };
}

function gridText(t) {
  return [t.columns.join('\t')].concat(t.rows.map(r => r.join('\t'))).join('\n');
}

const isNum = v => /^-?[\d,]+(\.\d+)?%?$/.test(String(v).trim());
const isNull = v => String(v).trim().toUpperCase() === 'NULL';

/* -------------------------------------------------------------- scene ops */

function tableById(id) { return scene.tables.find(t => t.id === id); }

function freshId(name) {
  let base = slug(name) || 't', id = base, n = 2;
  while (tableById(id)) id = `${base}-${n++}`;
  return id;
}

function addTable(name, text, role) {
  const parsed = parseGrid(text || 'Column A\tColumn B\nvalue\tvalue');
  const t = {
    id: freshId(name), name, role: role || 'source',
    color: PALETTE[scene.tables.length % PALETTE.length],
    grain: '', columns: parsed.columns, rows: parsed.rows, keys: [], ghosts: []
  };
  scene.tables.push(t);
  return t;
}

function applyData(t, text) {
  const parsed = parseGrid(text);
  if (!parsed) return;
  t.columns = parsed.columns;
  t.rows = parsed.rows;
  t.keys = t.keys.map(k => k.filter(c => t.columns.includes(c)))
    .filter(k => k.length);
  t.ghosts = t.ghosts.filter(r => r < t.rows.length);
  scene.links = scene.links.filter(l =>
    !(l.fromTable === t.id && l.fromRow >= t.rows.length) &&
    !(l.toTable === t.id && l.toRow >= t.rows.length));
  const tint = scene.tints[t.id];
  if (tint) for (const c in tint) if (+c >= t.columns.length) delete tint[c];
  for (const k in scene.annotations)
    if (k.startsWith(t.id + ':') && +k.split(':')[1] >= t.rows.length)
      delete scene.annotations[k];
}

function deleteTable(id) {
  scene.tables = scene.tables.filter(t => t.id !== id);
  scene.links = scene.links.filter(l => l.fromTable !== id && l.toTable !== id);
  delete scene.tints[id];
  for (const tid in scene.tints)
    for (const c in scene.tints[tid])
      if (scene.tints[tid][c] === id) delete scene.tints[tid][c];
  for (const k in scene.annotations)
    if (k.startsWith(id + ':')) delete scene.annotations[k];
  ui.pinned = ui.hover = ui.linking = null;
  ui.expanded.clear();
}

function membersOf(tableId, rowIdx) {
  return scene.links
    .filter(l => l.toTable === tableId && l.toRow === rowIdx)
    .map(l => ({ table: l.fromTable, row: l.fromRow }));
}

function partnersOf(key) {
  const [tid, rs] = key.split(':');
  const r = +rs, out = [];
  for (const l of scene.links) {
    if (l.fromTable === tid && l.fromRow === r) out.push(K(l.toTable, l.toRow));
    if (l.toTable === tid && l.toRow === r) out.push(K(l.fromTable, l.fromRow));
  }
  return out;
}

function toggleLink(fromKey, toKey) {
  const [ft, fr] = fromKey.split(':'), [tt, tr] = toKey.split(':');
  const same = l => l.fromTable === ft && l.fromRow === +fr &&
    l.toTable === tt && l.toRow === +tr;
  const i = scene.links.findIndex(same);
  if (i >= 0) scene.links.splice(i, 1);
  else scene.links.push({ fromTable: ft, fromRow: +fr, toTable: tt, toRow: +tr });
}

// Verify declared uniqueness. Returns {badRows:Set<rowIdx>, badKeys:Set<keyIdx>}.
function keyViolations(t) {
  const badRows = new Set(), badKeys = new Set();
  (t.keys || []).forEach((k, ki) => {
    const idxs = k.map(c => t.columns.indexOf(c)).filter(i => i >= 0);
    if (!idxs.length) return;
    const seen = new Map();
    t.rows.forEach((r, ri) => {
      const tup = idxs.map(i => r[i]).join('\u0001');
      if (seen.has(tup)) { badRows.add(ri); badRows.add(seen.get(tup)); badKeys.add(ki); }
      else seen.set(tup, ri);
    });
  });
  return { badRows, badKeys };
}

/* ------------------------------------------------------------ board (SVG) */

function geom(t) {
  const S = sz();
  const colW = t.columns.map((c, i) => {
    let w = measure(c, S.font, 600);
    for (const r of t.rows) w = Math.max(w, measure(r[i] ?? '', S.font));
    return Math.ceil(w) + S.pad * 2;
  });
  const colX = []; let x = 0;
  for (const w of colW) { colX.push(x); x += w; }
  const keyBand = t.keys.length ? t.keys.length * S.keyBand + 3 : 0;
  const titleH = S.title + 8 + (t.grain ? S.font + 3 : 0);
  // extent = horizontal room the table needs, titles and captions included
  const extent = Math.max(x,
    Math.ceil(measure(t.name, S.title, 700)) + 8,
    t.grain ? Math.ceil(measure(t.grain, S.font - 1)) + 8 : 0);
  return { colW, colX, width: x, extent, keyBand, titleH };
}

function expansionHeight(t, ri, S, geoms) {
  if (t.role !== 'result' || scene.options.expandMode !== 'inplace' ||
      !ui.expanded.has(K(t.id, ri))) return 0;
  const members = membersOf(t.id, ri);
  const ann = scene.annotations[K(t.id, ri)];
  if (!members.length && !ann) return 0;
  return members.length * Math.round(S.rowH * 0.85) +
    (ann ? S.font + 10 : 0) + 8;
}

function tableHeight(t, S, geoms) {
  const g = geoms[t.id];
  let h = g.titleH + g.keyBand + S.rowH * (t.rows.length + 1) + 4;
  t.rows.forEach((r, ri) => { h += expansionHeight(t, ri, S, geoms); });
  return h;
}

function renderBoard() {
  const svg = $('board');
  svg.innerHTML = '';
  svg.setAttribute('font-family', FONT);
  rowEls = {};

  const S = sz();
  const geoms = {};
  for (const t of scene.tables) geoms[t.id] = geom(t);

  const sources = scene.tables.filter(t => t.role !== 'result');
  const results = scene.tables.filter(t => t.role === 'result');

  const titleH = scene.title ? S.title + 16 : 0;
  const pos = {};
  let y = S.margin + titleH, leftW = 0;
  for (const t of sources) {
    pos[t.id] = { x: S.margin, y };
    y += tableHeight(t, S, geoms) + S.gap * 0.75;
    leftW = Math.max(leftW, geoms[t.id].extent);
  }
  const xR = sources.length ? S.margin + leftW + S.gap * 1.7 : S.margin;
  y = S.margin + titleH;
  let rightW = 0;
  for (const t of results) {
    pos[t.id] = { x: xR, y };
    y += tableHeight(t, S, geoms) + S.gap * 0.75;
    rightW = Math.max(rightW, geoms[t.id].extent);
  }

  // side-panel expansion reserves room to the right of the result column
  let panelInfo = null;
  if (scene.options.expandMode === 'panel') {
    const openKey = [...ui.expanded].pop();
    if (openKey) {
      const [tid, rs] = openKey.split(':');
      const t = tableById(tid);
      if (t && t.role === 'result' && +rs < t.rows.length)
        panelInfo = { t, ri: +rs };
      else ui.expanded.delete(openKey);
    }
  }

  // paper background — the board is always a light artboard, like a slide
  el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#FFFFFF' }, svg)
    .addEventListener('click', () => { pin(null); });

  const content = el('g', {}, svg);
  if (scene.title) el('text', {
    x: S.margin, y: S.margin + S.title - 4, 'font-size': S.title + 3,
    'font-weight': 700, fill: '#1A2733'
  }, content).textContent = scene.title;

  for (const t of scene.tables) drawTable(content, t, pos[t.id], S, geoms);
  if (panelInfo) drawSidePanel(content, panelInfo, xR + rightW + S.gap, pos[panelInfo.t.id], S, geoms);

  // size the board to what was actually drawn, so nothing ever clips
  const bb = content.getBBox();
  const W = Math.max(Math.ceil(bb.x + bb.width + S.margin), 320);
  const H = Math.max(Math.ceil(bb.y + bb.height + S.margin), 200);
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  overlayEl = el('g', { 'pointer-events': 'none' }, svg);
  refreshDynamic();
}

function drawTable(svg, t, p, S, geoms) {
  const g = geoms[t.id];
  const { badRows, badKeys } = keyViolations(t);
  const grp = el('g', {}, svg);

  // title + grain caption
  el('text', {
    x: p.x, y: p.y + S.title - 2, 'font-size': S.title, 'font-weight': 700,
    fill: '#1A2733'
  }, grp).textContent = t.name;
  if (t.grain) el('text', {
    x: p.x, y: p.y + S.title + S.font, 'font-size': S.font - 1,
    'font-style': 'italic', fill: '#5A6B7A'
  }, grp).textContent = t.grain;

  // uniqueness brackets above the header
  const headY = p.y + g.titleH + g.keyBand;
  t.keys.forEach((k, ki) => {
    const idxs = k.map(c => t.columns.indexOf(c)).filter(i => i >= 0);
    if (!idxs.length) return;
    const x1 = p.x + Math.min(...idxs.map(i => g.colX[i])) + 3;
    const x2 = p.x + Math.max(...idxs.map(i => g.colX[i] + g.colW[i])) - 3;
    const yb = headY - 4 - ki * S.keyBand;
    const bad = badKeys.has(ki);
    const col = bad ? '#C62828' : t.color;
    const path = `M ${x1} ${yb - 4} L ${x1} ${yb} L ${x2} ${yb} L ${x2} ${yb - 4}`;
    el('path', { d: path, stroke: col, 'stroke-width': 1.3, fill: 'none' }, grp);
    el('text', {
      x: (x1 + x2) / 2, y: yb - 6, 'font-size': Math.round(S.font * 0.78),
      'text-anchor': 'middle', fill: col,
      'font-weight': bad ? 700 : 400, 'font-style': 'italic'
    }, grp).textContent = bad ? '✗ not unique'
      : (k.length > 1 ? 'unique together' : 'unique');
  });

  // header
  const tint = scene.tints[t.id] || {};
  t.columns.forEach((c, ci) => {
    const src = tint[ci] !== undefined ? tableById(tint[ci]) : null;
    el('rect', {
      x: p.x + g.colX[ci], y: headY, width: g.colW[ci], height: S.rowH,
      fill: src ? src.color : t.color
    }, grp);
    el('text', {
      x: p.x + g.colX[ci] + S.pad, y: headY + S.rowH / 2 + S.font * 0.36,
      'font-size': S.font, 'font-weight': 600, fill: '#FFFFFF'
    }, grp).textContent = c;
  });

  // rows
  let rowY = headY + S.rowH;
  t.rows.forEach((r, ri) => {
    const rk = K(t.id, ri);
    const ghost = t.ghosts.includes(ri);
    const rg = el('g', ghost ? { opacity: 0.35 } : {}, grp);
    const baseFill = ri % 2 ? '#F4F6F8' : '#FFFFFF';
    const rect = el('rect', {
      x: p.x, y: rowY, width: g.width, height: S.rowH, fill: baseFill,
      stroke: '#E1E6EA', 'stroke-width': 0.5, cursor: 'pointer'
    }, rg);
    rowEls[rk] = {
      rect, baseFill, color: t.color,
      left: p.x, right: p.x + g.width, midY: rowY + S.rowH / 2
    };

    // union stripe: a row fed by exactly one source table wears its color
    if (t.role === 'result') {
      const srcs = [...new Set(membersOf(t.id, ri).map(m => m.table))];
      if (srcs.length === 1) {
        const st = tableById(srcs[0]);
        if (st) el('rect', {
          x: p.x, y: rowY, width: 4, height: S.rowH, fill: st.color,
          'pointer-events': 'none'
        }, rg);
      }
    }

    r.forEach((v, ci) => {
      const src = tint[ci] !== undefined ? tableById(tint[ci]) : null;
      if (src) el('rect', {
        x: p.x + g.colX[ci], y: rowY, width: g.colW[ci], height: S.rowH,
        fill: rgba(src.color, 0.09), 'pointer-events': 'none'
      }, rg);
      const nul = isNull(v);
      const dim = scene.options.dimRepeats && ri > 0 &&
        String(t.rows[ri - 1][ci]) === String(v) && String(v) !== '';
      const right = isNum(v);
      el('text', {
        x: right ? p.x + g.colX[ci] + g.colW[ci] - S.pad : p.x + g.colX[ci] + S.pad,
        y: rowY + S.rowH / 2 + S.font * 0.36,
        'font-size': S.font,
        'text-anchor': right ? 'end' : 'start',
        fill: nul ? '#9AA7B1' : (dim ? '#B7C0C8' : '#1A2733'),
        'font-style': nul ? 'italic' : 'normal',
        'pointer-events': 'none'
      }, rg).textContent = nul ? 'NULL' : v;
    });

    // red outline on key cells of duplicate rows
    if (badRows.has(ri)) {
      for (const k of t.keys) {
        const idxs = k.map(c => t.columns.indexOf(c)).filter(i => i >= 0);
        if (!idxs.length) continue;
        const x1 = Math.min(...idxs.map(i => g.colX[i]));
        const x2 = Math.max(...idxs.map(i => g.colX[i] + g.colW[i]));
        el('rect', {
          x: p.x + x1 + 1, y: rowY + 1, width: x2 - x1 - 2, height: S.rowH - 2,
          fill: 'none', stroke: '#C62828', 'stroke-width': 1.4,
          'pointer-events': 'none'
        }, rg);
      }
    }

    // expansion triangle for result rows that have members
    const hasMembers = t.role === 'result' &&
      (membersOf(t.id, ri).length || scene.annotations[rk]);
    if (hasMembers) {
      const open = ui.expanded.has(rk);
      const cx = p.x - 13, cy = rowY + S.rowH / 2;
      const tri = el('path', {
        d: open ? `M ${cx - 5} ${cy - 3} L ${cx + 5} ${cy - 3} L ${cx} ${cy + 5} Z`
                : `M ${cx - 3} ${cy - 5} L ${cx + 5} ${cy} L ${cx - 3} ${cy + 5} Z`,
        fill: '#8A94A0', cursor: 'pointer'
      }, rg);
      const hit = el('rect', {
        x: cx - 11, y: rowY, width: 22, height: S.rowH,
        fill: 'transparent', cursor: 'pointer'
      }, rg);
      const toggle = ev => {
        ev.stopPropagation();
        if (ui.expanded.has(rk)) ui.expanded.delete(rk);
        else {
          if (scene.options.expandMode === 'panel') ui.expanded.clear();
          ui.expanded.add(rk);
        }
        render();
      };
      tri.addEventListener('click', toggle);
      hit.addEventListener('click', toggle);
    }

    rect.addEventListener('mouseenter', () => { ui.hover = rk; refreshDynamic(); });
    rect.addEventListener('mouseleave', () => { ui.hover = null; refreshDynamic(); });
    rect.addEventListener('click', ev => {
      ev.stopPropagation();
      if (ui.linking) {
        if (rk !== ui.linking && tableById(t.id).role !== 'result') {
          toggleLink(rk, ui.linking);
          render();
        }
        return;
      }
      pin(ui.pinned === rk ? null : rk);
    });

    rowY += S.rowH;

    // in-place expansion: member rows fold out under the result row
    if (t.role === 'result' && scene.options.expandMode === 'inplace' &&
        ui.expanded.has(rk)) {
      rowY = drawMembers(grp, t, ri, p.x + 20, rowY, S, geoms);
    }
  });
}

function drawMembers(grp, t, ri, x, y, S, geoms) {
  const memH = Math.round(S.rowH * 0.85);
  const members = membersOf(t.id, ri);
  const ann = scene.annotations[K(t.id, ri)];
  if (!members.length && !ann) return y;
  const yTop = y;
  // keep source-table order stable
  const order = scene.tables.map(s => s.id);
  members.sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table) || a.row - b.row);
  for (const m of members) {
    const st = tableById(m.table);
    if (!st || m.row >= st.rows.length) continue;
    const sg = geoms[st.id];
    el('rect', {
      x, y, width: sg.width, height: memH, fill: rgba(st.color, 0.08),
      stroke: rgba(st.color, 0.35), 'stroke-width': 0.6, 'pointer-events': 'none'
    }, grp);
    el('rect', {
      x, y, width: 3, height: memH, fill: st.color, 'pointer-events': 'none'
    }, grp);
    st.rows[m.row].forEach((v, ci) => {
      const nul = isNull(v);
      const right = isNum(v);
      el('text', {
        x: right ? x + sg.colX[ci] + sg.colW[ci] - S.pad : x + sg.colX[ci] + S.pad,
        y: y + memH / 2 + S.font * 0.34,
        'font-size': S.font - 1, 'text-anchor': right ? 'end' : 'start',
        fill: nul ? '#9AA7B1' : '#39434C',
        'font-style': nul ? 'italic' : 'normal', 'pointer-events': 'none'
      }, grp).textContent = nul ? 'NULL' : v;
    });
    y += memH;
  }
  if (ann) {
    el('text', {
      x: x + 4, y: y + S.font + 2, 'font-size': S.font - 1,
      'font-style': 'italic', fill: '#55606A', 'pointer-events': 'none'
    }, grp).textContent = ann;
    y += S.font + 10;
  }
  el('path', {
    d: `M ${x - 8} ${yTop} L ${x - 8} ${y - 4}`,
    stroke: '#C5CBD2', 'stroke-width': 1.5, 'pointer-events': 'none'
  }, grp);
  return y + 8;
}

function panelWidth(info, S, geoms) {
  let w = 220;
  for (const m of membersOf(info.t.id, info.ri)) {
    const st = tableById(m.table);
    if (st) w = Math.max(w, geoms[st.id].width + 24);
  }
  const ann = scene.annotations[K(info.t.id, info.ri)];
  if (ann) w = Math.max(w, Math.ceil(measure(ann, S.font - 1)) + 28);
  return w;
}

function drawSidePanel(svg, info, x, resultPos, S, geoms) {
  const memH = Math.round(S.rowH * 0.85);
  const members = membersOf(info.t.id, info.ri);
  const rk = K(info.t.id, info.ri);
  const ann = scene.annotations[rk];
  const w = panelWidth(info, S, geoms);
  const label = info.t.rows[info.ri] ? info.t.rows[info.ri][0] : '';
  const h = S.rowH + members.length * memH + (ann ? S.font + 12 : 0) + 18;
  // align the panel with the expanded row, not the table's title
  const anchor = rowEls[rk];
  const y = anchor ? anchor.midY - S.rowH / 2 : resultPos.y;
  el('rect', {
    x, y, width: w, height: h, rx: 8, fill: '#FBFCFD',
    stroke: '#C5CBD2', 'stroke-width': 1
  }, svg);
  el('text', {
    x: x + 12, y: y + S.rowH * 0.7, 'font-size': S.font, 'font-weight': 700,
    fill: '#1A2733'
  }, svg).textContent = `Rows behind: ${label}`;
  let my = y + S.rowH + 2;
  const order = scene.tables.map(s => s.id);
  members.sort((a, b) => order.indexOf(a.table) - order.indexOf(b.table) || a.row - b.row);
  for (const m of members) {
    const st = tableById(m.table);
    if (!st || m.row >= st.rows.length) continue;
    const sg = geoms[st.id];
    el('rect', {
      x: x + 12, y: my, width: sg.width, height: memH,
      fill: rgba(st.color, 0.08), stroke: rgba(st.color, 0.35), 'stroke-width': 0.6
    }, svg);
    el('rect', { x: x + 12, y: my, width: 3, height: memH, fill: st.color }, svg);
    st.rows[m.row].forEach((v, ci) => {
      const nul = isNull(v), right = isNum(v);
      el('text', {
        x: right ? x + 12 + sg.colX[ci] + sg.colW[ci] - S.pad
                 : x + 12 + sg.colX[ci] + S.pad,
        y: my + memH / 2 + S.font * 0.34,
        'font-size': S.font - 1, 'text-anchor': right ? 'end' : 'start',
        fill: nul ? '#9AA7B1' : '#39434C',
        'font-style': nul ? 'italic' : 'normal'
      }, svg).textContent = nul ? 'NULL' : v;
    });
    my += memH;
  }
  if (ann) el('text', {
    x: x + 14, y: my + S.font + 4, 'font-size': S.font - 1,
    'font-style': 'italic', fill: '#55606A'
  }, svg).textContent = ann;
}

/* ----------------------------------------------- hover / pin / link lines */

function pin(key) {
  ui.pinned = key;
  if (!key) ui.linking = null;
  renderPanel();
  refreshDynamic();
  updateBanner();
}

function drawLine(fromKey, toKey, faint) {
  const a = rowEls[fromKey], b = rowEls[toKey];
  if (!a || !b) return;
  const [l, r] = a.right <= b.left ? [a, b] : [b, a];
  const x1 = l.right + 2, x2 = r.left - 2;
  const dx = Math.max(24, (x2 - x1) / 2);
  const src = rowEls[fromKey];
  el('path', {
    d: `M ${x1} ${l.midY} C ${x1 + dx} ${l.midY} ${x2 - dx} ${r.midY} ${x2} ${r.midY}`,
    stroke: src.color, 'stroke-width': faint ? 1 : 1.8, fill: 'none',
    opacity: faint ? 0.25 : 0.9
  }, overlayEl);
}

function refreshDynamic() {
  if (!overlayEl) return;
  overlayEl.innerHTML = '';
  for (const k in rowEls) {
    rowEls[k].rect.setAttribute('fill', rowEls[k].baseFill);
    rowEls[k].rect.setAttribute('stroke', '#E1E6EA');
    rowEls[k].rect.setAttribute('stroke-width', 0.5);
  }
  if (scene.options.showLinks === 'all')
    for (const l of scene.links)
      drawLine(K(l.fromTable, l.fromRow), K(l.toTable, l.toRow), true);

  const active = [...new Set([ui.linking, ui.pinned, ui.hover].filter(Boolean))];
  for (const a of active) {
    const me = rowEls[a];
    if (!me) continue;
    me.rect.setAttribute('fill', rgba(me.color, 0.22));
    for (const p of partnersOf(a)) {
      const pe = rowEls[p];
      if (pe) pe.rect.setAttribute('fill', rgba(pe.color, 0.16));
      // color link lines by the source side
      const [srcKey, dstKey] = scene.links.some(l =>
        K(l.fromTable, l.fromRow) === a && K(l.toTable, l.toRow) === p)
        ? [a, p] : [p, a];
      drawLine(srcKey, dstKey, false);
    }
  }
  if (ui.linking && rowEls[ui.linking]) {
    const r = rowEls[ui.linking].rect;
    r.setAttribute('stroke', '#C62828');
    r.setAttribute('stroke-width', 1.8);
  }
}

/* ------------------------------------------------------------ left panel */

function renderPanel() {
  const t = v => esc(v);

  // preserve un-applied textarea drafts across re-renders
  const drafts = {};
  for (const ta of document.querySelectorAll('#panel [data-table] [data-ta]')) {
    const tb = cardTable(ta);
    if (tb && ta.value !== gridText(tb)) drafts[tb.id] = ta.value;
  }

  let html = '<h1>Feltboard</h1><p class="tagline">rows, never circles</p>';

  html += `<input id="title" type="text" value="${t(scene.title)}" data-field="title" aria-label="Scene title">`;

  html += `<div class="row">
    <button data-act="example-joins">Example: joins</button>
    <button data-act="example-groupby">Example: group by</button>
    <button data-act="new-scene">New</button>
  </div>
  <div class="row">
    <button data-act="open">Open…</button>
    <button data-act="save">Save scene</button>
    <button data-act="export-svg">SVG</button>
    <button data-act="export-png">PNG</button>
    <button class="primary" data-act="present">Present</button>
  </div>
  <div class="opts">
    <label>expand
      <select data-field="expandMode">
        <option value="inplace"${scene.options.expandMode === 'inplace' ? ' selected' : ''}>in place</option>
        <option value="panel"${scene.options.expandMode === 'panel' ? ' selected' : ''}>side panel</option>
      </select>
    </label>
    <label>links
      <select data-field="showLinks">
        <option value="hover"${scene.options.showLinks === 'hover' ? ' selected' : ''}>on hover</option>
        <option value="all"${scene.options.showLinks === 'all' ? ' selected' : ''}>always</option>
        <option value="none"${scene.options.showLinks === 'none' ? ' selected' : ''}>never</option>
      </select>
    </label>
    <label><input type="checkbox" data-field="dimRepeats"${scene.options.dimRepeats ? ' checked' : ''}> dim repeats</label>
  </div>`;

  if (ui.pinned) {
    const [tid, rs] = ui.pinned.split(':');
    const pt = tableById(tid);
    if (pt && pt.rows[+rs]) {
      const ghost = pt.ghosts.includes(+rs);
      html += `<div id="selbox">
        <div class="what">${t(pt.name)} — row ${+rs + 1}: ${t(pt.rows[+rs][0] ?? '')}</div>
        <div class="row">`;
      if (pt.role === 'result')
        html += `<button data-act="edit-links">${ui.linking ? 'Done linking' : 'Edit links'}</button>`;
      html += `<button data-act="toggle-ghost">${ghost ? 'Unghost' : 'Ghost'}</button>
          <button data-act="unpin">Deselect</button>
        </div>`;
      if (pt.role === 'result')
        html += `<input type="text" placeholder="annotation, e.g. 450 + 895 = 1,345"
          value="${t(scene.annotations[ui.pinned] || '')}" data-field="annotation">`;
      html += `</div>`;
    }
  }

  for (const tb of scene.tables) {
    const { badKeys } = keyViolations(tb);
    html += `<div class="card" data-table="${t(tb.id)}">
      <div class="head">
        <input type="color" value="${t(tb.color)}" data-field="color" aria-label="table color">
        <input type="text" value="${t(tb.name)}" data-field="name" aria-label="table name">
        <select data-field="role">
          <option value="source"${tb.role !== 'result' ? ' selected' : ''}>source</option>
          <option value="result"${tb.role === 'result' ? ' selected' : ''}>result</option>
        </select>
        <button class="danger" data-act="del-table" title="delete table">×</button>
      </div>
      <div class="grain-row"><input type="text" placeholder="grain, e.g. one row per store"
        value="${t(tb.grain || '')}" data-field="grain"></div>
      <textarea rows="5" data-ta spellcheck="false">${t(drafts[tb.id] ?? gridText(tb))}</textarea>
      <div class="row"><button data-act="apply-data">Apply data</button>
        <span class="small">first line = headers; paste straight from a spreadsheet</span></div>
      <div class="chips">${tb.columns.map(c =>
        `<span class="chip" data-chip="${t(c)}">${t(c)}</span>`).join('')}</div>
      <div class="row"><button data-act="add-key">Mark selected columns unique</button></div>
      <div class="keylist">${tb.keys.map((k, ki) =>
        `<div class="k${badKeys.has(ki) ? ' bad' : ''}"><span>${t(k.join(' + '))} — ${badKeys.has(ki) ? 'not unique!' : 'unique'}</span>
         <button data-act="del-key" data-key="${ki}">×</button></div>`).join('')}</div>`;
    if (tb.role === 'result') {
      const tint = scene.tints[tb.id] || {};
      html += `<div class="tints"><div class="small">column colors (which table does each column come from?)</div>`;
      tb.columns.forEach((c, ci) => {
        html += `<div class="t"><span>${t(c)}</span><select data-field="tint" data-col="${ci}">
          <option value="">—</option>
          ${scene.tables.filter(s => s.id !== tb.id).map(s =>
            `<option value="${t(s.id)}"${tint[ci] === s.id ? ' selected' : ''}>${t(s.name)}</option>`).join('')}
        </select></div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="row"><button data-act="add-table">+ New table</button></div>`;

  html += `<details><summary>How to use</summary><ul>
    <li>Paste tables from a spreadsheet (tab-separated, first line = headers), then <b>Apply data</b>.</li>
    <li>Mark a table as <b>result</b>, select it row by row, and use <b>Edit links</b>: click the source rows that produced it. Esc finishes.</li>
    <li>Select column chips and <b>Mark unique</b> — composite keys get a “unique together” bracket, and violations show in red.</li>
    <li>Set each result column's source table to tint it with that table's color.</li>
    <li>Click the ▸ on a result row to fold out the rows behind it (group by!).</li>
    <li>Write cell value <b>NULL</b> to render a real NULL. <b>Ghost</b> a row to show it didn't survive.</li>
    <li><b>Present</b> hides this panel and enlarges everything; Esc exits. Exports capture exactly what you see.</li>
  </ul></details>
  <footer>feltboard — rows, never circles · part of
    <a href="https://github.com/leogodin217/fabulexa_teach">fabulexa_teach</a> · zero dependencies</footer>`;

  $('panel').innerHTML = html;
}

function updateBanner() {
  const b = $('banner');
  if (ui.linking) {
    b.textContent = 'Linking: click source rows that produced this result row · Esc to finish';
    b.classList.add('on');
  } else b.classList.remove('on');
}

/* ------------------------------------------------------------ panel events */

function cardTable(elem) {
  const card = elem.closest('[data-table]');
  return card ? tableById(card.getAttribute('data-table')) : null;
}

function wirePanel() {
  const panel = $('panel');

  panel.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (chip) { chip.classList.toggle('sel'); return; }
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const tb = cardTable(btn);
    const acts = {
      'example-joins': () => loadScene(exampleJoins()),
      'example-groupby': () => loadScene(exampleGroupBy()),
      'new-scene': () => loadScene(newScene()),
      'open': () => $('file').click(),
      'save': saveScene,
      'export-svg': exportSVG,
      'export-png': exportPNG,
      'present': () => setPresent(true),
      'add-table': () => { addTable(`Table ${scene.tables.length + 1}`, null); render(); },
      'del-table': () => { if (tb && confirm(`Delete table “${tb.name}”?`)) { deleteTable(tb.id); render(); } },
      'apply-data': () => {
        if (!tb) return;
        const ta = btn.closest('.card').querySelector('[data-ta]');
        applyData(tb, ta.value); render();
      },
      'add-key': () => {
        if (!tb) return;
        const sel = [...btn.closest('.card').querySelectorAll('.chip.sel')]
          .map(c => c.getAttribute('data-chip'));
        if (sel.length) { tb.keys.push(sel); render(); }
      },
      'del-key': () => { if (tb) { tb.keys.splice(+btn.getAttribute('data-key'), 1); render(); } },
      'edit-links': () => {
        ui.linking = ui.linking ? null : ui.pinned;
        renderPanel(); refreshDynamic(); updateBanner();
      },
      'toggle-ghost': () => {
        if (!ui.pinned) return;
        const [tid, rs] = ui.pinned.split(':');
        const pt = tableById(tid);
        const i = pt.ghosts.indexOf(+rs);
        if (i >= 0) pt.ghosts.splice(i, 1); else pt.ghosts.push(+rs);
        render();
      },
      'unpin': () => pin(null)
    };
    if (acts[act]) acts[act]();
  });

  panel.addEventListener('change', e => {
    const f = e.target.getAttribute('data-field');
    if (!f) return;
    const tb = cardTable(e.target);
    if (f === 'title') scene.title = e.target.value;
    else if (f === 'expandMode') { scene.options.expandMode = e.target.value; ui.expanded.clear(); }
    else if (f === 'showLinks') scene.options.showLinks = e.target.value;
    else if (f === 'dimRepeats') scene.options.dimRepeats = e.target.checked;
    else if (f === 'annotation' && ui.pinned) {
      if (e.target.value.trim()) scene.annotations[ui.pinned] = e.target.value.trim();
      else delete scene.annotations[ui.pinned];
    } else if (tb) {
      if (f === 'name') tb.name = e.target.value;
      else if (f === 'color') tb.color = e.target.value;
      else if (f === 'role') { tb.role = e.target.value; ui.expanded.clear(); }
      else if (f === 'grain') tb.grain = e.target.value;
      else if (f === 'tint') {
        scene.tints[tb.id] = scene.tints[tb.id] || {};
        const ci = e.target.getAttribute('data-col');
        if (e.target.value) scene.tints[tb.id][ci] = e.target.value;
        else delete scene.tints[tb.id][ci];
      }
    }
    render();
  });

  $('file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try { loadScene(normalize(JSON.parse(rd.result))); }
      catch (err) { alert('Could not read that scene file: ' + err.message); }
    };
    rd.readAsText(file);
    e.target.value = '';
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (ui.linking) { ui.linking = null; renderPanel(); refreshDynamic(); updateBanner(); }
    else if (scene.options.present) setPresent(false);
    else if (ui.pinned) pin(null);
  });
}

function setPresent(on) {
  scene.options.present = on;
  document.body.classList.toggle('present', on);
  render();
}

/* ------------------------------------------------------------------- io */

function loadScene(s) {
  scene = normalize(s);
  ui.pinned = ui.hover = ui.linking = null;
  ui.expanded.clear();
  document.body.classList.toggle('present', !!scene.options.present);
  render();
}

function saveScene() {
  const blob = new Blob([JSON.stringify(scene, null, 2)], { type: 'application/json' });
  downloadBlob(blob, slug(scene.title) + '.feltboard.json');
}

function autosave() {
  try { localStorage.setItem('feltboard-scene', JSON.stringify(scene)); }
  catch (e) { /* private window etc. — fine, saving to file still works */ }
}

function svgMarkup() {
  const clone = $('board').cloneNode(true);
  clone.setAttribute('xmlns', SVGNS);
  return new XMLSerializer().serializeToString(clone);
}

function exportSVG() {
  downloadBlob(new Blob([svgMarkup()], { type: 'image/svg+xml' }), slug(scene.title) + '.svg');
}

function exportPNG() {
  const svg = $('board');
  const w = +svg.getAttribute('width'), h = +svg.getAttribute('height');
  const url = URL.createObjectURL(new Blob([svgMarkup()], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    const ctx = c.getContext('2d');
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    c.toBlob(b => downloadBlob(b, slug(scene.title) + '.png'), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert('PNG export failed — try the SVG export.'); };
  img.src = url;
}

/* --------------------------------------------------------------- examples */

function mkTable(id, name, color, role, grain, columns, rows, keys) {
  return { id, name, color, role, grain, columns, rows, keys: keys || [], ghosts: [] };
}

function exampleJoins() {
  const stores = mkTable('stores', 'Stores', '#2E6FB7', 'source',
    'one row per store', ['ID', 'Region', 'Location'], [
      ['1001', 'Northeast', 'New Ipswich'], ['1002', 'Northeast', 'Mason'],
      ['1003', 'Northeast', 'Greenville'], ['1004', 'Southwest', 'Queen Creek'],
      ['1005', 'Southwest', 'Las Vegas'], ['1006', 'Southwest', 'Mesa'],
      ['1007', 'Southwest', 'Tempe']
    ], [['ID']]);
  stores.ghosts = [5, 6]; // no email list → never reach the result

  const email = mkTable('email', 'Email Lists', '#E0782A', 'source',
    'one row per store per week', ['Store ID', 'Date', 'Total Email Addresses'], [
      ['1001', '1/5/2020', '4010'], ['1001', '1/12/2020', '4035'], ['1001', '1/19/2020', '4040'],
      ['1002', '1/5/2020', '0'], ['1002', '1/12/2020', '7'], ['1002', '1/19/2020', '25'],
      ['1003', '1/5/2020', '332'], ['1003', '1/12/2020', '329'], ['1003', '1/19/2020', '351'],
      ['1004', '1/5/2020', '2345'], ['1004', '1/12/2020', '2330'], ['1004', '1/19/2020', '2351'],
      ['1005', '1/5/2020', '456'], ['1005', '1/12/2020', '491'],
      ['1009', '1/5/2020', '246'], ['1009', '1/12/2020', '253'], ['1009', '1/19/2020', '267']
    ], [['Store ID', 'Date']]);
  email.ghosts = [14, 15, 16]; // store 1009 doesn't exist — orphan rows

  const camp = mkTable('campaigns', 'Campaigns', '#3E9A4E', 'source',
    'one row per campaign', ['Store ID', 'Date', 'Offer', 'Sent', 'Opened', 'Redeemed'], [
      ['1001', '1/5/2020', '10% Off', '2500', '450', '25'],
      ['1001', '1/12/2020', '20% Off', '2500', '895', '42'],
      ['1004', '1/12/2020', 'BOGO Fidget Spinner', '500', '125', '3'],
      ['1005', '1/12/2020', 'Free Candy Bar', '50', '42', '29']
    ], [['Store ID', 'Date']]);

  const R = []; // [storeRow, emailRow, campaignRow|null, resultCells]
  const srows = stores.rows, erows = email.rows, crows = camp.rows;
  const campAt = {};
  crows.forEach((c, i) => { campAt[c[0] + '|' + c[1]] = i; });
  erows.forEach((e, ei) => {
    const si = srows.findIndex(s => s[0] === e[0]);
    if (si < 0) return; // 1009 drops out
    const ci = campAt[e[0] + '|' + e[1]];
    const c = ci !== undefined ? crows[ci] : null;
    R.push([si, ei, ci !== undefined ? ci : null, [
      srows[si][0], srows[si][1], srows[si][2], e[1], e[2],
      c ? c[2] : 'NULL', c ? c[3] : 'NULL', c ? c[4] : 'NULL', c ? c[5] : 'NULL'
    ]]);
  });

  const result = mkTable('result', 'Stores with email list size and campaigns, by week',
    '#5A6B7A', 'result', 'one row per store per week',
    ['ID', 'Region', 'Location', 'Date', 'Total Email Addresses',
      'Offer', 'Sent', 'Opened', 'Redeemed'],
    R.map(r => r[3]), [['ID', 'Date']]);

  const links = [];
  R.forEach((r, ri) => {
    links.push({ fromTable: 'stores', fromRow: r[0], toTable: 'result', toRow: ri });
    links.push({ fromTable: 'email', fromRow: r[1], toTable: 'result', toRow: ri });
    if (r[2] !== null)
      links.push({ fromTable: 'campaigns', fromRow: r[2], toTable: 'result', toRow: ri });
  });

  return normalize({
    feltboard: 1,
    title: 'SQL joins: stores × email lists × campaigns',
    options: { present: false, expandMode: 'inplace', dimRepeats: true, showLinks: 'hover' },
    tables: [stores, email, camp, result],
    links,
    tints: { result: { 0: 'stores', 1: 'stores', 2: 'stores', 3: 'email', 4: 'email', 5: 'campaigns', 6: 'campaigns', 7: 'campaigns', 8: 'campaigns' } },
    annotations: {}
  });
}

function exampleGroupBy() {
  const email = mkTable('email', 'Email Lists', '#E0782A', 'source',
    'one row per store per week', ['Store ID', 'Date', 'Total Email Addresses'], [
      ['1001', '1/5/2020', '4010'], ['1001', '1/12/2020', '4035'], ['1001', '1/19/2020', '4040'],
      ['1002', '1/5/2020', '0'], ['1002', '1/12/2020', '7'], ['1002', '1/19/2020', '25'],
      ['1003', '1/5/2020', '332'], ['1003', '1/12/2020', '329'], ['1003', '1/19/2020', '351'],
      ['1004', '1/5/2020', '2345'], ['1004', '1/12/2020', '2330'], ['1004', '1/19/2020', '2351'],
      ['1005', '1/5/2020', '456'], ['1005', '1/12/2020', '491'],
      ['1009', '1/5/2020', '246'], ['1009', '1/12/2020', '253'], ['1009', '1/19/2020', '267']
    ], [['Store ID', 'Date']]);

  const groups = {};
  email.rows.forEach((r, ri) => (groups[r[0]] = groups[r[0]] || []).push(ri));
  const ids = Object.keys(groups);
  const result = mkTable('bystore', 'Emails by store (GROUP BY Store ID)', '#5A6B7A',
    'result', 'one row per store',
    ['Store ID', 'Weeks', 'Max Emails'],
    ids.map(id => {
      const rs = groups[id];
      const max = Math.max(...rs.map(ri => +email.rows[ri][2]));
      return [id, String(rs.length), String(max)];
    }), [['Store ID']]);

  const links = [];
  ids.forEach((id, gi) => groups[id].forEach(ri =>
    links.push({ fromTable: 'email', fromRow: ri, toTable: 'bystore', toRow: gi })));

  return normalize({
    feltboard: 1,
    title: 'GROUP BY: 17 rows collapse to 6',
    options: { present: false, expandMode: 'inplace', dimRepeats: true, showLinks: 'hover' },
    tables: [email, result],
    links,
    tints: { bystore: { 0: 'email', 1: 'email', 2: 'email' } },
    annotations: { 'bystore:0': 'max(4010, 4035, 4040) = 4040 — three rows in, one value out' }
  });
}

/* ------------------------------------------------------------------- init */

function render() {
  renderBoard();
  renderPanel();
  updateBanner();
  autosave();
}

document.addEventListener('DOMContentLoaded', () => {
  wirePanel();
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('feltboard-scene')); } catch (e) { /* ok */ }
  loadScene(saved && saved.feltboard ? normalize(saved) : exampleJoins());
});
