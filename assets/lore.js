/* Renders data/lore.json into a side index, a top timeline bar, and the articles
 * themselves. Keeping the lore as data (rather than hand-written HTML) means a future
 * docx / Google Doc upload only has to become a new lore.json + assets/lore/<images>,
 * not a rewrite of this page.
 */
(() => {
'use strict';

const DATA_URL = 'data/lore.json';

const els = {
  index: document.getElementById('loreIndex'),
  articles: document.getElementById('loreArticles'),
  timeline: document.getElementById('timelineBar'),
  loading: document.getElementById('loreLoading'),
  navToggle: document.getElementById('navToggle'),
  scrim: document.getElementById('scrim'),
};

function shortDate(iso) {
  const [y, m] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function renderBodyItem(item) {
  if (typeof item === 'string') {
    const p = document.createElement('p');
    p.innerHTML = item;
    return p;
  }
  if (item && item.type === 'image') {
    const fig = document.createElement('figure');
    fig.className = 'lore-figure';
    const img = document.createElement('img');
    img.src = `assets/lore/${item.src}`;
    img.alt = item.alt || '';
    img.loading = 'lazy';
    fig.appendChild(img);
    if (item.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = item.caption;
      fig.appendChild(cap);
    }
    return fig;
  }
  return document.createTextNode('');
}

function renderEntry(entry) {
  const section = document.createElement('section');
  section.className = 'lore-entry';
  section.id = entry.id;

  const head = document.createElement('header');
  head.className = 'lore-entry-head';

  const num = document.createElement('span');
  num.className = 'lore-number';
  num.textContent = `No. ${entry.number}`;
  head.appendChild(num);

  const h2 = document.createElement('h2');
  if (entry.titleStyle === 'italic') h2.innerHTML = `<em>${entry.title}</em>`;
  else h2.textContent = entry.title;
  head.appendChild(h2);

  if (entry.subtitle) {
    const sub = document.createElement('p');
    sub.className = 'lore-sub';
    sub.innerHTML = entry.subtitle;
    head.appendChild(sub);
  }

  const meta = document.createElement('p');
  meta.className = 'lore-meta';
  const bits = [entry.dateline, entry.publication, entry.byline].filter(Boolean);
  meta.innerHTML = bits.map((b, i) => i === bits.length - 1 && bits.length > 1 ? `<em>${b}</em>` : b).join(' &middot; ');
  head.appendChild(meta);

  section.appendChild(head);

  const body = document.createElement('div');
  body.className = 'lore-body-text';
  (entry.body || []).forEach(item => body.appendChild(renderBodyItem(item)));
  (entry.images || []).forEach(img => body.appendChild(renderBodyItem({ type: 'image', ...img })));
  section.appendChild(body);

  return section;
}

function closeDrawer() {
  els.index.classList.remove('is-open');
  els.scrim.hidden = true;
  els.navToggle.setAttribute('aria-expanded', 'false');
}
function openDrawer() {
  els.index.classList.add('is-open');
  els.scrim.hidden = false;
  els.navToggle.setAttribute('aria-expanded', 'true');
}

function wireDrawer() {
  els.navToggle.addEventListener('click', () => {
    els.index.classList.contains('is-open') ? closeDrawer() : openDrawer();
  });
  els.scrim.addEventListener('click', closeDrawer);
}

function wireScrollSpy(entries) {
  const indexLinks = new Map();
  els.index.querySelectorAll('[data-target]').forEach(a => indexLinks.set(a.dataset.target, a));
  const tlPills = new Map();
  els.timeline.querySelectorAll('[data-target]').forEach(p => tlPills.set(p.dataset.target, p));

  const sections = entries.map(e => document.getElementById(e.id)).filter(Boolean);
  let current = null;
  const setActive = id => {
    if (id === current) return;
    current = id;
    indexLinks.forEach((a, key) => a.classList.toggle('is-active', key === id));
    tlPills.forEach((p, key) => p.classList.toggle('is-active', key === id));
    const activePill = tlPills.get(id);
    if (activePill) activePill.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };

  const io = new IntersectionObserver(obsEntries => {
    const visible = obsEntries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 });

  sections.forEach(s => io.observe(s));
}

function jumpTo(id) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  closeDrawer();
}

async function init() {
  let data;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    data = await res.json();
  } catch (err) {
    els.loading.innerHTML = `<p>Couldn't load the lore data (${err.message}).</p>`;
    return;
  }

  const entries = (data.entries || []).slice().sort((a, b) => a.dateSort.localeCompare(b.dateSort));

  els.index.innerHTML = '';
  const indexHead = document.createElement('div');
  indexHead.className = 'lore-index-head';
  indexHead.textContent = data.title || 'Lore';
  els.index.appendChild(indexHead);
  if (data.pod) {
    const pod = document.createElement('div');
    pod.className = 'lore-index-pod';
    pod.textContent = data.pod;
    els.index.appendChild(pod);
  }
  entries.forEach(entry => {
    const a = document.createElement('a');
    a.className = 'lore-index-item';
    a.href = `#${entry.id}`;
    a.dataset.target = entry.id;
    a.innerHTML = `<span class="idx-num">${entry.number}</span><span class="idx-title">${entry.title}</span>`;
    a.addEventListener('click', e => { e.preventDefault(); jumpTo(entry.id); });
    els.index.appendChild(a);
  });

  els.timeline.innerHTML = '';
  entries.forEach(entry => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'tl-pill';
    pill.dataset.target = entry.id;
    pill.title = entry.title;
    pill.innerHTML = `<span class="tl-date">${shortDate(entry.dateSort)}</span>`;
    pill.addEventListener('click', () => jumpTo(entry.id));
    els.timeline.appendChild(pill);
  });

  els.articles.innerHTML = '';
  entries.forEach(entry => els.articles.appendChild(renderEntry(entry)));

  wireDrawer();
  wireScrollSpy(entries);

  if (location.hash && location.hash.length > 1 && document.getElementById(location.hash.slice(1))) {
    setTimeout(() => jumpTo(location.hash.slice(1)), 50);
  }
}

init();
})();
