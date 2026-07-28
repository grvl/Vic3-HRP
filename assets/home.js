/* Landing page shell: theme toggle + the two top-level tabs (Ideologies / Lore). */
(() => {
'use strict';

const THEME_KEY = 'v3hrp.theme';
const TAB_KEY = 'v3hrp.tab';

/* ---------- theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const frame = document.querySelector('.app-frame');
  if (frame && frame.contentWindow) {
    try { frame.contentWindow.document.documentElement.setAttribute('data-theme', theme); } catch (e) { /* cross-origin, ignore */ }
  }
}
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme) applyTheme(savedTheme);

document.getElementById('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

/* re-apply theme to the ideology iframe once it loads, in case a theme was picked before it finished */
const frameEl = document.querySelector('.app-frame');
if (frameEl) frameEl.addEventListener('load', () => applyTheme(document.documentElement.getAttribute('data-theme') || 'dark'));

/* ---------- tabs ---------- */
const tabButtons = document.querySelectorAll('#mainTabs .tab');
const panels = {
  ideologies: document.getElementById('panel-ideologies'),
  lore: document.getElementById('panel-lore'),
};
const navToggle = document.getElementById('navToggle');

function showTab(view, { pushHash = true } = {}) {
  if (!panels[view]) view = 'ideologies';
  tabButtons.forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== view; });
  navToggle.hidden = view !== 'lore';
  localStorage.setItem(TAB_KEY, view);
  if (pushHash) {
    const hash = location.hash.replace(/^#/, '');
    if (view === 'lore' && !hash.startsWith('lore')) location.hash = '#lore';
    else if (view === 'ideologies' && hash.startsWith('lore')) history.replaceState(null, '', location.pathname + location.search);
  }
}

tabButtons.forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.view)));

function tabFromHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('lore')) return 'lore';
  if (hash.startsWith('ideolog')) return 'ideologies';
  return null;
}

const initialTab = tabFromHash() || localStorage.getItem(TAB_KEY) || 'ideologies';
showTab(initialTab, { pushHash: false });

window.addEventListener('hashchange', () => {
  const t = tabFromHash();
  if (t) showTab(t, { pushHash: false });
});

window.showLoreTab = () => showTab('lore');
})();
