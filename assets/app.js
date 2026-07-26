/* Victoria 3 — Ideology Affinity Groups
 * Reads Groups / Rivalries / Details straight from a public Google Sheet at page load,
 * so the sheet stays the single source of truth (no commit needed to update the site).
 */
(() => {
'use strict';

/* ------------------------------------------------------------------ config */

const CONFIG = {
  sheetId: '1AKQuosLZ9HvXEDxx-GfRSqt710gxvuXucCxbr_e0cag',
  tabs: { groups: 'Groups', rivalries: 'Rivalries', details: 'Details' },
  snapshot: 'data/snapshot.json',
  cacheKey: 'v3ig.cache.v1',
  cacheTtlMs: 10 * 60 * 1000,
};

const BOND_LEVELS = {
  1: { name: 'Shared Sympathy',       color: 'var(--bond-1)' },
  2: { name: 'Strategic Alignment',   color: 'var(--bond-2)' },
  3: { name: 'Ideological Coalition', color: 'var(--bond-3)' },
  4: { name: 'Natural Partners',      color: 'var(--bond-4)' },
};
const RIVAL_LEVELS = {
  1: { name: 'Antagonism',        color: 'var(--rival-1)' },
  2: { name: 'Existential Threat', color: 'var(--rival-2)' },
};

/**
 * Ideology → icon filename (in assets/icons/, converted from the game's own
 * ideology_leader .dds textures). Most sheet names match the game's icon name once
 * normalised; the handful that don't (renamed, merged variants, or icons the game
 * itself never shipped for that ideology) are listed explicitly.
 */
const ICON_OVERRIDES = {
  'Authoritarian': 'authoritarian',
  'Humanitarian': 'ideology_leader_humanitarism',
  'Modernizer': 'idealogy_leader_modernizer',
  'Protectionist': 'ideology_leader_protectionism',
  'Jacksonian Democrat': 'jackson_democrat',
  'Luddite': 'luddite',
  'Mitogaku': 'mitogaku',
  'Carlist II': 'ideology_leader_carlist',       // no distinct icon shipped — reuses Carlist
  'Miguelist II': 'ideology_leader_miguelist',   // no distinct icon shipped — reuses Miguelist
  'Traditionalist Minoritarian': 'ideology_leader_traditionalist',
  'Shojoi': 'isolationist',                      // closest available match, not a confirmed 1:1
};
const iconCache = new Map();

/** Resolve an ideology name to its icon URL, or null if nothing matches. */
function iconFor(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const file = ICON_OVERRIDES[name]
    || 'ideology_leader_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const url = `assets/icons/${file}.png`;
  iconCache.set(name, url);
  return url;
}

/** An <img> that quietly removes itself (leaving the text-only layout) if the icon 404s. */
function iconImg(name, cls = 'ig-icon') {
  const img = el('img', cls);
  img.src = iconFor(name);
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

const bondInfo  = l => BOND_LEVELS[l]  || { name: 'Bond',    color: 'var(--bond-1)' };
const rivalInfo = l => RIVAL_LEVELS[l] || { name: 'Rivalry', color: 'var(--rival-1)' };

/* ------------------------------------------------------------------- utils */

const $  = s => document.querySelector(s);
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};
const slug = s => encodeURIComponent(String(s).trim().replace(/\s+/g, '-'));
const unslug = s => decodeURIComponent(String(s)).replace(/-/g, ' ');
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const alts = g => [...(g.altNames || [])];
/** "Utopian Reformists (aka Reformist Left)" — every name the sheet uses for this id. */
const groupLabel = g => g.name + (alts(g).length ? ` (aka ${alts(g).join(', ')})` : '');

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

/* RFC-4180-ish CSV parser — member lists contain commas, so quotes matter. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = text.replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some(v => v !== '')) rows.push(row);

  return rows
    .map(r => r.map(clean))
    .filter(r => r.some(v => v !== ''));
}

/* ------------------------------------------------------------------ loading */

function gvizUrl(tab) {
  // headers=1, NOT 0. With headers=0 gviz treats the header row as data, types each
  // column from the majority of its values, and blanks out cells that don't match —
  // so a text label sitting above 35 numbers ("Bond Lvl") comes back empty and the
  // column can never be found by name. headers=1 always emits the labels as strings.
  return `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq` +
         `?tqx=out:csv&sheet=${encodeURIComponent(tab)}&headers=1&_=${Date.now()}`;
}

async function fetchTab(tab) {
  const direct = gvizUrl(tab);
  const attempts = [direct, `https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`];

  let lastErr;
  for (const url of attempts) {
    try {
      const res = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // A sheet that isn't link-shared returns an HTML sign-in page, not CSV.
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('not public');
      return parseCSV(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('unreachable');
}

async function loadData({ force = false } = {}) {
  if (!force) {
    try {
      const hit = JSON.parse(localStorage.getItem(CONFIG.cacheKey) || 'null');
      if (hit && Date.now() - hit.at < CONFIG.cacheTtlMs) {
        return { ...hit.raw, source: 'cache', at: hit.at };
      }
    } catch {}
  }

  try {
    const [groups, rivalries, details] = await Promise.all([
      fetchTab(CONFIG.tabs.groups),
      fetchTab(CONFIG.tabs.rivalries),
      fetchTab(CONFIG.tabs.details),
    ]);
    if (groups.length < 2) throw new Error('empty Groups tab');
    const raw = { groups, rivalries, details };
    const at = Date.now();
    try { localStorage.setItem(CONFIG.cacheKey, JSON.stringify({ at, raw })); } catch {}
    return { ...raw, source: 'sheet', at };
  } catch (liveErr) {
    const res = await fetch(CONFIG.snapshot, { cache: 'no-cache' });
    if (!res.ok) throw liveErr;
    const snap = await res.json();
    return {
      groups: snap.Groups, rivalries: snap.Rivalries, details: snap.Details,
      source: 'snapshot', at: null, error: liveErr.message,
    };
  }
}

/* --------------------------------------------------------------- normalise */

/** Header-driven column lookup, so re-ordering columns in the sheet is safe. */
function columnMap(header, spec) {
  const lower = header.map(h => h.toLowerCase());
  const out = {};
  for (const [key, needles] of Object.entries(spec)) {
    out[key] = lower.findIndex(h => needles.some(n => h.includes(n)));
  }
  return out;
}

/**
 * Find the real header row. The header is not always row 0 — a tab can carry a
 * title or a note above it, and assuming row 0 silently mis-maps every column
 * that has no positional fallback. Score the first few rows and take the best.
 */
function findHeader(rows, spec, maxScan = 12) {
  let best = { index: 0, score: -1, map: columnMap(rows[0] || [], spec) };
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const map = columnMap(rows[i], spec);
    const score = Object.values(map).filter(v => v >= 0).length;
    if (score > best.score) best = { index: i, score, map };
  }
  return best;
}

/**
 * Last resort when the level column can't be found by name: find it by what it
 * contains. Scan every column not already claimed and take the one whose values are
 * overwhelmingly small standalone integers — that's a level column and nothing else is.
 */
function inferLevelColumn(rows, claimed) {
  const width = Math.max(0, ...rows.map(r => r.length));
  let best = -1, bestHits = 0;
  for (let c = 0; c < width; c++) {
    if (claimed.includes(c)) continue;
    let hits = 0, seen = 0;
    for (const row of rows) {
      const v = clean(row[c]);
      if (!v) continue;
      seen++;
      // "1", "1.0", "1,0", "Level 2 — Existential" all count; free text does not.
      if (/^(level\s*)?\d+([.,]\d+)?(\s*[-–—:].*)?$/i.test(v) && toLevel(v) <= 9) hits++;
    }
    if (seen >= 3 && hits / seen >= 0.8 && hits > bestHits) { bestHits = hits; best = c; }
  }
  return best;
}

/** Pull a level out of whatever the sheet hands us: 3, "3.0", "3,0", "Level 3 — …". */
function toLevel(v) {
  const m = String(v == null ? '' : v).replace(',', '.').match(/\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[0]));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalise(raw) {
  /* ---- groups ---- */
  const gHeader = findHeader(raw.groups, {
    id: ['id'], classification: ['classific', 'category'],
    name: ['group name', 'name'], level: ['bond', 'lvl', 'level'],
    members: ['member', 'ideolog'],
  });
  const gHead = raw.groups[gHeader.index] || [];
  const gc = gHeader.map;
  if (gc.id < 0) gc.id = 0;
  if (gc.name < 0) gc.name = 2;
  if (gc.members < 0) gc.members = gHead.length - 1;
  let levelInferred = false;
  if (gc.level < 0) {
    gc.level = inferLevelColumn(raw.groups.slice(gHeader.index + 1), [gc.id, gc.classification, gc.name, gc.members]);
    levelInferred = gc.level >= 0;
  }

  const groups = [];
  const groupById = new Map();
  const badLevels = [];
  let lastClassification = '';

  for (const row of raw.groups.slice(gHeader.index + 1)) {
    const id = clean(row[gc.id]).toUpperCase();
    if (!/^G\d+/i.test(id)) continue;

    const classification = clean(row[gc.classification]) || lastClassification;
    lastClassification = classification;

    const members = clean(row[gc.members])
      .split(/\s*,\s*/).map(clean).filter(Boolean);
    if (!members.length) continue;

    const name = clean(row[gc.name]) || id;
    const parsedLevel = gc.level >= 0 ? toLevel(row[gc.level]) : null;
    // Don't quietly pretend an unreadable level is 1 — that hides a column mismatch.
    if (parsedLevel == null) badLevels.push(`${id} ${name} (read “${clean(row[gc.level]) || '—'}”)`);
    const level = parsedLevel ?? 1;

    // Groups are keyed on the G-id. A repeated id is the same group under another
    // name: merge the members and keep the extra name as an alias.
    const existing = groupById.get(id);
    if (existing) {
      existing.altNames.add(name);
      existing.level = Math.max(existing.level, level);
      for (const m of members) if (!existing.members.includes(m)) existing.members.push(m);
      continue;
    }

    const g = {
      id,
      classification: classification || 'Uncategorised',
      name,
      level,
      members,
      altNames: new Set(),
    };
    groups.push(g);
    groupById.set(g.id, g);
  }

  /* ---- rivalries (group vs group, matched on the G-id: names drift between tabs) ---- */
  const rHeader = findHeader(raw.rivalries,
    { id: ['id'], level: ['level', 'lvl'], a: ['side a'], b: ['side b'] });
  const rc = rHeader.map;
  if (rc.a < 0) rc.a = 2;
  if (rc.b < 0) rc.b = 3;
  if (rc.level < 0) rc.level = 1;

  const sideText = v => clean(v).replace(/^vs\.?\s+/i, '');
  const sideId = v => (sideText(v).match(/^(G\d+)/i) || [])[1];
  const sideName = v => sideText(v).replace(/^G\d+\s*[-–—:.]?\s*/i, '').trim();

  /** Resolve a rivalry side to its group by id, recording any different name as an alias. */
  const resolveSide = cell => {
    const id = sideId(cell);
    if (!id) return null;
    const g = groupById.get(id.toUpperCase());
    if (!g) return null;
    const n = sideName(cell);
    if (n && n !== g.name) g.altNames.add(n);
    return g;
  };

  const rivalries = [];
  const unresolved = [];
  for (const row of raw.rivalries.slice(rHeader.index + 1)) {
    const aId = sideId(row[rc.a]), bId = sideId(row[rc.b]);
    if (!aId || !bId) continue;
    const a = resolveSide(row[rc.a]), b = resolveSide(row[rc.b]);
    if (!a || !b) { unresolved.push(`${aId} vs ${bId}`); continue; }
    rivalries.push({ id: clean(row[rc.id]), level: toLevel(row[rc.level]) ?? 1, a, b });
  }

  /* ---- per-ideology index ---- */
  const ideologies = new Map();
  const touch = name => {
    if (!ideologies.has(name)) {
      ideologies.set(name, { name, groups: [], bonds: new Map(), rivals: new Map() });
    }
    return ideologies.get(name);
  };

  for (const g of groups) {
    for (const m of g.members) touch(m).groups.push(g);
    for (const m of g.members) {
      const rec = ideologies.get(m);
      for (const other of g.members) {
        if (other === m) continue;
        const e = rec.bonds.get(other) || { name: other, level: 0, via: [] };
        e.level = Math.max(e.level, g.level);
        e.via.push(g);
        rec.bonds.set(other, e);
      }
    }
  }

  for (const r of rivalries) {
    const pairs = [[r.a, r.b], [r.b, r.a]];
    for (const [from, to] of pairs) {
      for (const m of from.members) {
        const rec = ideologies.get(m);
        if (!rec) continue;
        for (const other of to.members) {
          if (other === m) continue;                 // sheet rule: never both sides of a line
          const e = rec.rivals.get(other) || { name: other, level: 0, via: [] };
          e.level = Math.max(e.level, r.level);
          e.via.push({ mine: from, theirs: to, level: r.level });
          rec.rivals.set(other, e);
        }
      }
    }
  }

  /* primary classification = the one most of its groups belong to */
  for (const rec of ideologies.values()) {
    const tally = new Map();
    for (const g of rec.groups) tally.set(g.classification, (tally.get(g.classification) || 0) + 1);
    rec.classification = [...tally.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || 'Uncategorised';
    rec.maxBond  = Math.max(0, ...[...rec.bonds.values()].map(b => b.level));
    rec.maxRival = Math.max(0, ...[...rec.rivals.values()].map(b => b.level));
  }

  const details = raw.details.map(r => r.join(' ').trim()).filter(Boolean);
  const classOrder = [...new Set(groups.map(g => g.classification))];

  const aliased = groups.filter(g => g.altNames.size);

  return {
    groups, groupById, rivalries, ideologies, details, classOrder, unresolved, aliased,
    diagnostics: {
      badLevels,
      groupsHeaderRow: gHeader.index,
      groupsHeader: gHead,
      levelColumn: gc.level >= 0 ? (gHead[gc.level] || `column ${gc.level + 1}`) : null,
      levelInferred,
    },
  };
}

/* -------------------------------------------------------------------- state */

const state = { model: null, meta: null, view: 'ideology', selected: null, query: '' };

/* ------------------------------------------------------------------ render */

function relCard(entry, kind) {
  const info = kind === 'bond' ? bondInfo(entry.level) : rivalInfo(entry.level);
  const card = el('button', 'rel-card');
  card.style.setProperty('--lvl-color', info.color);
  card.type = 'button';

  const top = el('div', 'rel-card-top');
  top.append(iconImg(entry.name), el('div', 'rel-name', entry.name));
  top.append(el('span', 'lvl-badge', (kind === 'bond' ? 'L' : 'R') + entry.level));
  card.append(top);
  card.append(el('div', 'rel-label', info.name));

  const via = el('div', 'rel-via');
  if (kind === 'bond') {
    const strongest = entry.via.filter(g => g.level === entry.level);
    const best = [...new Set(strongest.map(g => g.name))];
    const rest = entry.via.length - strongest.length;
    const line = el('span', null, 'via ' + best.join(', ') + (rest > 0 ? ` (+${rest} weaker)` : ''));
    line.title = strongest.map(g => `${g.id} — ${groupLabel(g)}`).join('\n');
    via.append(line);
  } else {
    const lines = [...new Set(entry.via
      .filter(v => v.level === entry.level)
      .map(v => `${v.mine.name} vs ${v.theirs.name}`))];
    for (const l of lines.slice(0, 3)) via.append(el('span', null, l));
    if (lines.length > 3) via.append(el('span', null, `+${lines.length - 3} more lines`));
  }
  card.append(via);

  card.addEventListener('click', () => select(entry.name));
  return card;
}

/** A pair that holds a bond and a rivalry at once — both levels shown side by side. */
function frenemyCard({ name, bond, rival }) {
  const b = bondInfo(bond.level), r = rivalInfo(rival.level);
  const card = el('button', 'rel-card frenemy');
  card.type = 'button';
  card.style.setProperty('--bond-c', b.color);
  card.style.setProperty('--rival-c', r.color);

  const top = el('div', 'rel-card-top');
  top.append(iconImg(name), el('div', 'rel-name', name));
  const bBadge = el('span', 'lvl-badge', 'L' + bond.level);
  bBadge.style.setProperty('--lvl-color', b.color);
  const rBadge = el('span', 'lvl-badge', 'R' + rival.level);
  rBadge.style.setProperty('--lvl-color', r.color);
  top.append(bBadge, rBadge);
  card.append(top);

  const labels = el('div', 'frenemy-labels');
  const bl = el('span', null, b.name); bl.style.color = b.color;
  const rl = el('span', null, r.name); rl.style.color = r.color;
  labels.append(bl, el('span', 'sep', 'but'), rl);
  card.append(labels);

  const via = el('div', 'rel-via');
  const bonded = [...new Set(bond.via.filter(g => g.level === bond.level).map(g => g.name))];
  via.append(el('span', null, 'bonded via ' + bonded.join(', ')));
  const lines = [...new Set(rival.via.filter(v => v.level === rival.level)
    .map(v => `${v.mine.name} vs ${v.theirs.name}`))];
  for (const l of lines.slice(0, 2)) via.append(el('span', null, 'opposed by ' + l));
  if (lines.length > 2) via.append(el('span', null, `+${lines.length - 2} more lines`));
  card.append(via);

  card.addEventListener('click', () => select(name));
  return card;
}

function renderIdeology(root) {
  const rec = state.model.ideologies.get(state.selected);
  if (!rec) {
    root.append(Object.assign(el('div', 'callout'),
      { textContent: 'Pick an ideology from the list to see its bonds and rivalries.' }));
    return;
  }

  const head = el('div', 'page-head');
  const titleRow = el('div', 'page-title-row');
  titleRow.append(iconImg(rec.name, 'ig-icon ig-icon-lg'), el('h1', null, rec.name));
  head.append(titleRow);
  const bonds  = [...rec.bonds.values()].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const rivals = [...rec.rivals.values()].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const overlap = [...rec.bonds.keys()].filter(n => rec.rivals.has(n)).length;
  const summary = el('p');
  head.append(summary);

  const chips = el('div', 'chips');
  for (const g of [...rec.groups].sort((a, b) => b.level - a.level)) {
    const c = el('button', 'chip');
    const dot = el('span', 'dot');
    dot.style.background = bondInfo(g.level).color;
    c.title = `${g.id} — ${groupLabel(g)}`;
    c.append(dot, document.createTextNode(`${g.name} · L${g.level}`));
    if (alts(g).length) c.append(el('span', 'chip-alt', 'aka ' + alts(g).join(', ')));
    c.addEventListener('click', () => go('groups', g.id));
    chips.append(c);
  }
  head.append(chips);
  root.append(head);

  const both = new Set([...rec.bonds.keys()].filter(n => rec.rivals.has(n)));
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  summary.textContent =
    `${rec.classification} · ${plural(rec.groups.length, 'group')} · ` +
    `${plural(bonds.length - overlap, 'bond')} · ${plural(overlap, 'frenemy').replace('frenemys', 'frenemies')} · ` +
    `${plural(rivals.length - overlap, 'rivalry').replace('rivalrys', 'rivalries')}`;

  const bondsOnly  = bonds.filter(e => !both.has(e.name));
  const rivalsOnly = rivals.filter(e => !both.has(e.name));
  const frenemies  = [...both]
    .map(n => ({ name: n, bond: rec.bonds.get(n), rival: rec.rivals.get(n) }))
    .sort((a, b) => b.rival.level - a.rival.level || b.bond.level - a.bond.level
                 || a.name.localeCompare(b.name));

  const section = (title, sub, list, build, emptyMsg) => {
    const s = el('section', 'section');
    const h = el('div', 'section-head');
    h.append(el('h2', null, title), el('span', 'count', String(list.length)));
    s.append(h, el('p', 'section-sub', sub));
    if (!list.length) s.append(el('div', 'callout', emptyMsg));
    else {
      const grid = el('div', 'rel-grid');
      for (const e of list) grid.append(build(e));
      s.append(grid);
    }
    root.append(s);
  };

  section('Bonds',
    'Allies only. Highest shared group level wins — click any card to jump to that ideology.',
    bondsOnly, e => relCard(e, 'bond'),
    'No bonds — this ideology stands alone.');

  section('Frenemies',
    'Both at once — allies on one question, enemies on another.',
    frenemies, frenemyCard,
    'No frenemies — every relationship here is purely one or the other.');

  section('Rivalries',
    'Enemies only. Inherited from group-vs-group rivalry lines.',
    rivalsOnly, e => relCard(e, 'rival'),
    'No rivalries — nobody is out to get them.');
}

function renderGroups(root, focusId) {
  const head = el('div', 'page-head');
  head.append(el('h1', null, 'Affinity groups'));
  head.append(el('p', null, 'Every group and its members. An ideology can sit in several groups — two characters use the highest level they share.'));
  root.append(head);

  for (const cls of state.model.classOrder) {
    const list = state.model.groups.filter(g => g.classification === cls);
    if (!list.length) continue;
    const block = el('div', 'class-block');
    block.append(el('h3', 'class-title', cls));
    for (const g of list) {
      const card = el('div', 'group-card');
      card.id = 'group-' + g.id;
      card.style.setProperty('--lvl-color', bondInfo(g.level).color);
      const top = el('div', 'group-card-top');
      top.append(el('span', 'group-id', g.id), el('span', 'group-name', g.name));
      const badge = el('span', 'lvl-badge', `L${g.level} · ${bondInfo(g.level).name}`);
      badge.style.setProperty('--lvl-color', bondInfo(g.level).color);
      top.append(badge);
      if (alts(g).length) top.append(el('span', 'alt-names', 'aka ' + alts(g).join(' · ')));
      card.append(top);

      const chips = el('div', 'member-chips');
      for (const m of g.members) {
        const c = el('button', 'member-chip');
        c.append(iconImg(m), document.createTextNode(m));
        c.addEventListener('click', () => select(m));
        chips.append(c);
      }
      card.append(chips);
      block.append(card);
    }
    root.append(block);
  }

  if (focusId) {
    const target = root.querySelector('#group-' + CSS.escape(focusId));
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.style.borderColor = 'var(--accent)';
    }
  }
}

function renderRivalries(root) {
  const head = el('div', 'page-head');
  head.append(el('h1', null, 'Rivalry lines'));
  head.append(el('p', null, 'Each line is one self-contained group-vs-group pair. Members of one side treat members of the other as rivals at this level.'));
  root.append(head);

  for (const lvl of [2, 1]) {
    const list = state.model.rivalries.filter(r => r.level === lvl);
    if (!list.length) continue;
    const info = rivalInfo(lvl);
    const block = el('div', 'class-block');
    block.append(el('h3', 'class-title', `Level ${lvl} — ${info.name} (${list.length})`));
    for (const r of list) {
      const row = el('div', 'rival-row');
      row.style.setProperty('--lvl-color', info.color);
      const side = g => {
        const b = el('button', 'rival-side');
        b.style.cssText = 'background:none;border:0;text-align:left;cursor:pointer;padding:0';
        b.append(document.createTextNode(g.name), el('small', null,
          `${g.id} · ${g.members.length} ideologies` + (alts(g).length ? ` · aka ${alts(g).join(', ')}` : '')));
        b.addEventListener('click', () => go('groups', g.id));
        return b;
      };
      row.append(side(r.a), el('span', 'rival-vs', 'VS'), side(r.b));
      block.append(row);
    }
    root.append(block);
  }
}

function renderMatrix(root) {
  const head = el('div', 'page-head');
  head.append(el('h1', null, 'Relationship matrix'));
  head.append(el('p', null, 'Every ideology against every other. Digits are bond levels, ✕ is an existential rivalry, – is antagonism. Split cells are both at once.'));
  root.append(head);

  const legend = el('div', 'matrix-legend');
  for (const l of [1, 2, 3, 4]) {
    const s = el('span', null, ` Bond ${l} — ${BOND_LEVELS[l].name}`);
    const i = el('i'); i.style.background = BOND_LEVELS[l].color;
    s.prepend(i); legend.append(s);
  }
  for (const l of [1, 2]) {
    const s = el('span', null, ` Rivalry ${l} — ${RIVAL_LEVELS[l].name}`);
    const i = el('i'); i.style.background = RIVAL_LEVELS[l].color;
    s.prepend(i); legend.append(s);
  }
  root.append(legend);

  const names = [...state.model.ideologies.keys()].sort((a, b) => a.localeCompare(b));
  const wrap = el('div', 'matrix-scroll');
  const table = el('table', 'matrix');

  const thead = el('thead');
  const hr = el('tr');
  hr.append(el('th', 'corner'));
  for (const n of names) {
    const th = el('th');
    th.append(el('span', null, n));
    hr.append(th);
  }
  thead.append(hr);
  table.append(thead);

  const tbody = el('tbody');
  for (const rowName of names) {
    const rec = state.model.ideologies.get(rowName);
    const tr = el('tr');
    const th = el('th');
    th.append(iconImg(rowName, 'ig-icon ig-icon-sm'), document.createTextNode(rowName));
    th.addEventListener('click', () => select(rowName));
    tr.append(th);
    for (const colName of names) {
      const td = el('td');
      if (rowName === colName) { td.className = 'self'; tr.append(td); continue; }
      const b = rec.bonds.get(colName), r = rec.rivals.get(colName);
      if (b && r) {
        td.style.background = `linear-gradient(135deg, ${bondInfo(b.level).color} 50%, ${rivalInfo(r.level).color} 50%)`;
        td.textContent = b.level;
        td.title = `${rowName} ↔ ${colName}: bond ${b.level}, rivalry ${r.level}`;
      } else if (b) {
        td.style.background = bondInfo(b.level).color;
        td.textContent = b.level;
        td.title = `${rowName} ↔ ${colName}: bond ${b.level} — ${bondInfo(b.level).name}`;
      } else if (r) {
        td.style.background = rivalInfo(r.level).color;
        td.textContent = r.level === 2 ? '✕' : '–';
        td.title = `${rowName} ↔ ${colName}: rivalry ${r.level} — ${rivalInfo(r.level).name}`;
      }
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  root.append(wrap);
}

function renderNotes(root) {
  const head = el('div', 'page-head');
  head.append(el('h1', null, 'How to read this'));
  root.append(head);

  const body = el('div', 'notes-body');

  const bondLegend = el('div', 'legend-grid');
  for (const l of [1, 2, 3, 4]) {
    const it = el('div', 'legend-item');
    it.style.setProperty('--lvl-color', BOND_LEVELS[l].color);
    it.append(el('b', null, `Bond ${l} — ${BOND_LEVELS[l].name}`));
    bondLegend.append(it);
  }
  const rivalLegend = el('div', 'legend-grid');
  for (const l of [1, 2]) {
    const it = el('div', 'legend-item');
    it.style.setProperty('--lvl-color', RIVAL_LEVELS[l].color);
    it.append(el('b', null, `Rivalry ${l} — ${RIVAL_LEVELS[l].name}`));
    rivalLegend.append(it);
  }
  body.append(bondLegend, rivalLegend);

  for (const line of state.model.details) {
    const p = el('p', null, line);
    body.append(p);
  }

  const stats = el('p', 'lead',
    `${state.model.ideologies.size} ideologies · ${state.model.groups.length} groups · ${state.model.rivalries.length} rivalry lines.`);
  body.prepend(stats);

  if (state.model.aliased.length) {
    body.append(el('h2', null, 'Alternate group names'));
    body.append(el('p', null,
      'Groups are matched on their G-id, so a group named differently in another tab is still the same group. ' +
      'The first name is the one from the Groups tab; the rest are how the sheet also refers to it.'));
    const grid = el('div', 'legend-grid');
    for (const g of state.model.aliased) {
      const it = el('div', 'legend-item');
      it.style.setProperty('--lvl-color', bondInfo(g.level).color);
      it.append(el('b', null, `${g.id} — ${g.name}`));
      it.append(el('span', null, 'aka ' + alts(g).join(' · ')));
      grid.append(it);
    }
    body.append(grid);
  }

  const link = el('a', 'src-link', 'Open the source spreadsheet ↗');
  link.href = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/edit`;
  link.target = '_blank';
  link.rel = 'noopener';
  body.append(link);

  const d = state.model.diagnostics;
  if (d.levelInferred) {
    const note = el('div', 'banner');
    note.textContent =
      `Heads up: the “Bond Lvl” column header wasn't found by name in the Groups tab, so the ` +
      `level column was inferred from its contents instead (${d.levelColumn}). Levels still ` +
      `look right below, but if that ever changes, check the column header text.`;
    body.append(note);
  }
  if (d.badLevels.length) {
    const warn = el('div', 'banner');
    warn.textContent =
      `Couldn't read a bond level for ${d.badLevels.length} group(s), so they defaulted to 1. ` +
      (d.levelColumn ? `Level column matched: “${d.levelColumn}”. ` : 'No bond-level column was found in the header row. ') +
      `First few: ${d.badLevels.slice(0, 5).join('; ')}`;
    body.append(warn);
  }

  if (state.model.unresolved.length) {
    const warn = el('div', 'banner');
    warn.textContent = `Heads up: ${state.model.unresolved.length} rivalry line(s) point at a group ID that isn't in the Groups tab — ${state.model.unresolved.join(', ')}`;
    body.append(warn);
  }

  root.append(body);
}

/* ------------------------------------------------------------------ shell */

function renderSidebar() {
  const list = $('#ideologyList');
  list.textContent = '';
  const q = state.query.toLowerCase();

  const recs = [...state.model.ideologies.values()]
    .filter(r => !q
      || r.name.toLowerCase().includes(q)
      || r.groups.some(g => g.id.toLowerCase() === q
        || groupLabel(g).toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!recs.length) {
    list.append(el('p', 'empty-note', 'Nothing matches that search.'));
    return;
  }

  for (const cls of state.model.classOrder) {
    const group = recs.filter(r => r.classification === cls);
    if (!group.length) continue;
    list.append(el('div', 'list-heading', cls));
    for (const r of group) {
      const b = el('button', 'ideology-btn' + (r.name === state.selected ? ' is-active' : ''));
      b.append(iconImg(r.name), el('span', null, r.name));
      const mini = el('span', 'mini');
      const bd = el('b', null, `+${r.bonds.size}`); bd.style.color = 'var(--bond-3)';
      const rv = el('b', null, `−${r.rivals.size}`); rv.style.color = 'var(--rival-2)';
      mini.append(bd, rv);
      b.append(mini);
      b.addEventListener('click', () => { select(r.name); closeNav(); });
      list.append(b);
    }
  }
}

function renderContent(arg) {
  const root = $('#content');
  root.textContent = '';
  if (state.meta?.source === 'snapshot') {
    const banner = el('div', 'banner');
    banner.textContent = "Couldn't reach the live sheet — showing the bundled snapshot. Check that the sheet is shared with “anyone with the link”.";
    root.append(banner);
  }
  ({ ideology: renderIdeology, groups: renderGroups, rivalries: renderRivalries, matrix: renderMatrix, notes: renderNotes }
    [state.view] || renderIdeology)(root, arg);
  root.scrollTop = 0;
  window.scrollTo({ top: 0 });
}

function setView(view) {
  state.view = view;
  for (const t of document.querySelectorAll('.tab')) t.classList.toggle('is-active', t.dataset.view === view);
  $('#sidebar').style.display = view === 'ideology' ? '' : 'none';
  $('#navToggle').style.visibility = view === 'ideology' ? '' : 'hidden';
}

function select(name) {
  if (!state.model.ideologies.has(name)) return;
  state.selected = name;
  location.hash = `#/i/${slug(name)}`;
}

function go(view, arg) {
  location.hash = arg ? `#/${view}/${arg}` : `#/${view}`;
}

function applyHash() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const [head, arg] = parts;

  if (head === 'i' && arg) {
    const name = [...state.model.ideologies.keys()]
      .find(n => n.toLowerCase() === unslug(arg).toLowerCase());
    if (name) state.selected = name;
    setView('ideology');
    renderSidebar();
    renderContent();
    return;
  }
  if (['groups', 'rivalries', 'matrix', 'notes'].includes(head)) {
    setView(head);
    renderContent(arg ? arg.toUpperCase() : null);
    return;
  }
  setView('ideology');
  renderSidebar();
  renderContent();
}

function openNav()  { $('#sidebar').classList.add('is-open'); $('#scrim').hidden = false; $('#navToggle').setAttribute('aria-expanded', 'true'); }
function closeNav() { $('#sidebar').classList.remove('is-open'); $('#scrim').hidden = true; $('#navToggle').setAttribute('aria-expanded', 'false'); }

function setStatus() {
  const m = state.meta;
  const when = m.at ? new Date(m.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const label = m.source === 'sheet' ? `Live from sheet · ${when}`
              : m.source === 'cache' ? `Cached · ${when}`
              : 'Offline snapshot';
  $('#statusLine').textContent = `${state.model.ideologies.size} ideologies · ${label}`;
}

/* --------------------------------------------------------------- bootstrap */

async function boot({ force = false } = {}) {
  const btn = $('#refreshBtn');
  btn.classList.add('is-busy');
  try {
    const raw = await loadData({ force });
    state.meta = { source: raw.source, at: raw.at, error: raw.error };
    state.model = normalise(raw);

    if (!state.selected) {
      state.selected = [...state.model.ideologies.keys()].sort((a, b) => a.localeCompare(b))[0] || null;
    }
    setStatus();
    applyHash();
    if (force) toast(raw.source === 'sheet' ? 'Reloaded from the sheet.' : 'Live sheet unreachable — using snapshot.');
  } catch (e) {
    $('#content').textContent = '';
    const box = el('div', 'callout');
    box.textContent = 'Could not load the data: ' + e.message;
    $('#content').append(box);
    $('#statusLine').textContent = 'Load failed';
  } finally {
    btn.classList.remove('is-busy');
  }
}

/* events */
$('#tabs').addEventListener('click', e => {
  const t = e.target.closest('.tab');
  if (t) go(t.dataset.view);
});
$('#search').addEventListener('input', e => { state.query = e.target.value; renderSidebar(); });
$('#navToggle').addEventListener('click', () => ($('#sidebar').classList.contains('is-open') ? closeNav() : openNav()));
$('#scrim').addEventListener('click', closeNav);
$('#refreshBtn').addEventListener('click', () => boot({ force: true }));
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('v3ig.theme', next); } catch {}
});
window.addEventListener('hashchange', () => { if (state.model) applyHash(); });
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== $('#search')) { e.preventDefault(); openNav(); $('#search').focus(); }
  if (e.key === 'Escape') closeNav();
});

try {
  const saved = localStorage.getItem('v3ig.theme');
  if (saved) document.documentElement.dataset.theme = saved;
  else if (window.matchMedia('(prefers-color-scheme: light)').matches) document.documentElement.dataset.theme = 'light';
} catch {}

boot();
})();
