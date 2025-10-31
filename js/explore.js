// 📁 js/explore.js

/* =========================
 *  Normalisation & tokens
 * ========================= */
const norm = s => (s || '').toString().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '');
const tokens = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);

// === Cache normalisé pour accélérer la recherche (titre/desc) ===
const _cache = new WeakMap();
function _prep(item) {
  let c = _cache.get(item);
  if (c) return c;

  // Parties de titre: title + otherTitles + id
  const titleParts = [];
  if (item.title) titleParts.push(item.title);
  if (Array.isArray(item.otherTitles)) titleParts.push(...item.otherTitles);
  else if (typeof item.otherTitles === 'string') titleParts.push(...item.otherTitles.split(','));
  if (item.id) titleParts.push(String(item.id));

  const titleNorm = norm(titleParts.join(' | '));
  const titleToks = new Set(tokens(titleNorm));

  const descNorm = norm(item.description || '');
  const descToks = new Set(tokens(descNorm));

  c = { titleNorm, titleToks, descNorm, descToks };
  _cache.set(item, c);
  return c;
}

/* =========================
 *  Similarité : priorités
 * ========================= */
const EXCLUDED_KEYS = new Set(['female lead', 'male lead']);

function _extractPriority(raw) {
  const m = String(raw || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  return m ? parseFloat(m[1]) : Number.POSITIVE_INFINITY;
}
function _genreKey(raw) {
  return norm(String(raw || '')
    .replace(/\(dominant\)/ig, '')
    .replace(/[0-9.]+/g, '')
    .trim());
}
function _isDominantRank(rank) {
  return Number.isFinite(rank) && Math.floor(rank) === 1;
}

let _getWeight = null; // défini dans initExplorer

function _rankFor(raw) {
  const n = _extractPriority(raw);
  if (Number.isFinite(n)) return n;
  const k = _genreKey(raw);
  if (!k) return Number.POSITIVE_INFINITY;
  if (typeof _getWeight === 'function') {
    const w = Number(_getWeight(k));
    if (Number.isFinite(w)) return w;
  }
  return Number.POSITIVE_INFINITY;
}
function _keyRank(key) {
  if (!key) return Number.POSITIVE_INFINITY;
  if (typeof _getWeight === 'function') {
    const w = Number(_getWeight(key));
    if (Number.isFinite(w)) return w;
  }
  return Number.POSITIVE_INFINITY;
}

function _leadOf(it) {
  const ks = (Array.isArray(it.genres) ? it.genres : []).map(_genreKey);
  if (ks.includes('female lead')) return 'FEMALE';
  if (ks.includes('male lead')) return 'MALE';
  return 'OTHER';
}

// [{key, rank, order, dominant}]
function _genresWithRanks(it) {
  const arr = Array.isArray(it.genres) ? it.genres : [];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const raw = arr[i];
    const key = _genreKey(raw);
    if (!key) continue;
    const rank = _rankFor(raw);
    out.push({ key, rank, order: i, dominant: _isDominantRank(rank) });
  }
  return out;
}

// 2 meilleurs genres (ignore EXCLUDED_KEYS)
function _bestPrimaryWithRanks(it) {
  const meta = _genresWithRanks(it).filter(m => m.key && !EXCLUDED_KEYS.has(m.key));
  meta.sort((a, b) => (a.rank - b.rank) || (a.order - b.order) || (a.key < b.key ? -1 : 1));
  const prim = meta[0] || { key: '', rank: Number.POSITIVE_INFINITY };
  const sec = meta[1] || { key: '', rank: Number.POSITIVE_INFINITY };
  return [prim, sec];
}

// signature stable
function _signature(it) {
  const meta = _genresWithRanks(it).filter(m => m.key && !EXCLUDED_KEYS.has(m.key));
  meta.sort((a, b) => (a.rank - b.rank) || (a.order - b.order) || (a.key < b.key ? -1 : 1));
  return meta.map(m => m.key);
}
function _sharedCount(a, b) {
  const A = new Set(_signature(a));
  const B = new Set(_signature(b));
  let c = 0; for (const k of A) if (B.has(k)) c++;
  return c;
}

/* =========================
 *  Fuzzy titre & desc
 * ========================= */
function editDistance(a, b) {
  a = norm(a); b = norm(b);
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}
function sim(a, b) { const L = Math.max(a?.length || 0, b?.length || 0); if (!L) return 0; return 1 - (editDistance(a, b) / L); }

// Gardé si besoin ailleurs (égalité approx)
function titleScore(item, q) {
  if (!q) return 1;
  const qn = norm(q);
  const fields = [item.title || '', ...(Array.isArray(item.otherTitles) ? item.otherTitles : (typeof item.otherTitles === 'string' ? item.otherTitles.split(',') : [])), item.id || ''];
  let best = 0;
  for (const f of fields) {
    const s = sim(qn, norm(f));
    const contains = norm(f).includes(qn) ? 0.15 : 0;
    best = Math.max(best, Math.min(1, s + contains));
  }
  return best;
}

// === Titre en mode AND strict (+ phrases "..." et exclusions -mot) ===
function titleMatchAND(item, q) {
  if (!q) return true;
  const { titleNorm, titleToks } = _prep(item);

  // Phrases "..." exactes
  const phrases = Array.from(q.matchAll(/"([^"]+)"/g)).map(m => norm(m[1])).filter(Boolean);
  let rest = q.replace(/"[^"]+"/g, ' ');

  // Exclusions -mot (optionnel)
  const negs = [];
  rest = rest.replace(/(^|\s)-(\S+)/g, (_, sp, word) => { negs.push(norm(word)); return ' '; });

  // Tous les autres mots -> AND
  const words = tokens(rest).filter(w => w.length > 1);

  // Exclusions : si un mot exclu est présent → KO
  for (const n of negs) {
    if (titleNorm.includes(n)) return false;
  }
  // Phrases exactes
  for (const p of phrases) {
    if (!titleNorm.includes(p)) return false;
  }
  // Mots: chacun doit être présent (token ou substring)
  for (const w of words) {
    if (titleToks.has(w)) continue;
    if (titleNorm.includes(w)) continue;
    return false;
  }
  return true;
}

// === Description AND + cache (avec filet fuzzy léger) ===
function descMatch(item, q) {
  if (!q) return true;
  const { descNorm, descToks } = _prep(item);

  // Phrases exactes
  const phrases = Array.from(q.matchAll(/"([^"]+)"/g)).map(m => norm(m[1])).filter(Boolean);
  let rest = q.replace(/"[^"]+"/g, ' ');

  // Exclusions -mot (optionnel)
  const negs = [];
  rest = rest.replace(/(^|\s)-(\S+)/g, (_, sp, word) => { negs.push(norm(word)); return ' '; });

  const wants = tokens(rest).filter(w => w.length > 1);

  for (const n of negs) {
    if (descNorm.includes(n)) return false;
  }
  for (const p of phrases) {
    if (!descNorm.includes(p)) return false;
  }
  for (const w of wants) {
    if (descNorm.includes(w)) continue;
    // petit filet de sécurité : token contenant w (préfixe) ou fuzzy léger
    let ok = false;
    for (const t of descToks) {
      if (t.length <= 2) continue;
      if (t.includes(w)) { ok = true; break; }
      if (w.length >= 4 && sim(w, t) >= 0.88) { ok = true; break; }
    }
    if (!ok) return false;
  }
  return true;
}

/* =========================
 *  Dates & filtres
 * ========================= */
function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts === 'object' && (ts.seconds || ts._seconds)) return (ts.seconds || ts._seconds) * 1000;
  const s = String(ts);
  const n = Date.parse(s);
  if (!Number.isNaN(n)) return n;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]) - 1, y = Number(m[3]);
    const dt = new Date(y, mo, d);
    return dt.getTime();
  }
  return 0;
}
const dateKey = (x) => tsToMs(x) || 0;

function hasAllGenres(item, required) {
  if (!required?.length) return true;
  const g = (item.genres || []).map(norm);
  return required.every(r => g.includes(norm(r)));
}
function hasNoExcluded(item, excluded) {
  if (!excluded?.length) return true;
  const g = (item.genres || []).map(norm);
  return !excluded.some(r => g.includes(norm(r)));
}

/* =========================
 *  Statut & progression
 * ========================= */
function statusOf(it, type, key) {
  const s = (it.statut || it.status || '').toLowerCase().trim();

  if (type === 'mangas' || type === 'novels') {
    const totalCh = Number(it.chTotal || 0);
    const who = key === 'J' ? (it.chJade ?? 0) : (it.chLus ?? 0);
    let chLus = 0;
    if (typeof who === 'string') {
      const parts = who.split('.').map(n => parseInt(n)).filter(n => !isNaN(n));
      if (parts.length) chLus = Math.max(...parts);
    } else if (typeof who === 'number') { chLus = who; }
    if (!chLus || chLus === 0) return 'nonCommence';
    if (['terminé', 'complet', 'abandonné'].some(t => s.includes(t)) && totalCh > 0 && chLus >= totalCh) return 'termine';
    return 'enCours';
  }

  if (type === 'animes' || type === 'series') {
    const epTotal = Number(it.episodeTotal || 0);
    const saTotal = Number(it.saisonTotal || 0);
    const ep = key === 'J' ? Number(it.episodeJ || 0) : Number(it.episodeM || 0);
    const sa = key === 'J' ? Number(it.saisonJ || 0) : Number(it.saisonM || 0);
    if (!ep && !sa) return 'nonCommence';
    if (['terminé', 'complet', 'abandonné'].some(t => s.includes(t)) && ep >= epTotal && sa >= saTotal) return 'termine';
    return 'enCours';
  }

  if (type === 'films') {
    const ecoute = (it.derniereEcoute || '').trim();
    return ecoute ? 'termine' : 'nonCommence';
  }
  return 'nonCommence';
}
function progressionPct(it, key) {
  const total = Number(it.chTotal || 0) || 0;
  if (!total) return 0;
  let lus = 0;
  const who = key === 'J' ? (it.chJade ?? 0) : (it.chLus ?? 0);
  if (typeof who === 'string') {
    const parts = who.split('.').map(n => parseInt(n)).filter(n => !isNaN(n));
    if (parts.length) lus = Math.max(...parts);
  } else if (typeof who === 'number') { lus = who; }
  return Math.max(0, Math.min(100, Math.round(100 * lus / total)));
}

/* =========================
 *  Comparateur Similarité (tri “similarity”)
 * ========================= */
function makeSimilarityTools() {
  const leadRank = v => v === 'FEMALE' ? 0 : v === 'MALE' ? 1 : 2;

  return {
    cmp(a, b, dir) {
      // 1) Lead
      const L1 = leadRank(_leadOf(a)), L2 = leadRank(_leadOf(b));
      if (L1 !== L2) return (L1 - L2) * dir;

      // 2) Dominant #1
      const [A1, A2] = _bestPrimaryWithRanks(a);
      const [B1, B2] = _bestPrimaryWithRanks(b);

      const gA = _keyRank(A1.key), gB = _keyRank(B1.key);
      if (gA !== gB) return (gA - gB) * dir;
      if (A1.key !== B1.key) return (A1.key < B1.key ? -1 : 1) * dir;

      // 3) Dominant #2
      const gA2 = _keyRank(A2.key), gB2 = _keyRank(B2.key);
      if (gA2 !== gB2) return (gA2 - gB2) * dir;
      if (A2.key !== B2.key) return (A2.key < B2.key ? -1 : 1) * dir;

      // 4) Genres en commun
      const common = _sharedCount(a, b);
      if (common !== 0) return (-common) * dir;

      // 5) Signature
      const SA = _signature(a).slice(0, 8).join('|');
      const SB = _signature(b).slice(0, 8).join('|');
      if (SA !== SB) return SA < SB ? -1 * dir : 1 * dir;

      // 6) Titre
      const ta = norm(a.title || ''), tb = norm(b.title || '');
      if (ta < tb) return -1 * dir;
      if (ta > tb) return 1 * dir;
      return 0;
    }
  };
}

/* =========================
 *  UI helpers + initExplorer
 * ========================= */
export function initCollapsible({ arrowSel, panelSel, defaultOpen = false }) {
  const arrow = document.querySelector(arrowSel);
  const panel = document.querySelector(panelSel);
  if (!arrow || !panel) return;
  let open = !!defaultOpen;
  const setState = () => {
    panel.style.display = open ? '' : 'none';
    arrow.textContent = open ? '▲' : '▼';
    arrow.setAttribute('aria-expanded', String(open));
  };
  arrow.addEventListener('click', () => { open = !open; setState(); });
  setState();
}

export function initAdvancedSortUI({
  primarySel = '#sortBy',
  hiddenSel = '#sortMulti',
  addSel = '#advAddSelect',
  clearSel = '#advClear',
  dropSel = '#advDrop',
  labels = {
    title: 'Titre A→Z', modif: 'Dernière modification', progress: 'Progression (%)',
    chapters: 'Chapitres total', date: 'Date (champ date)', lastRead: 'Dernière lecture',
    similarity: 'Similarité (priorités 1.x)'
  }
} = {}) {
  const drop = document.querySelector(dropSel);
  const add = document.querySelector(addSel);
  const clear = document.querySelector(clearSel);
  const hidden = document.querySelector(hiddenSel);
  const primary = document.querySelector(primarySel);

  if (!drop || !hidden) return;

  const curKeys = () => Array.from(drop.querySelectorAll('[data-key]')).map(n => n.getAttribute('data-key'));
  const syncHidden = () => { hidden.value = curKeys().join(','); };

  function makeChip(key) {
    const chip = document.createElement('div');
    chip.className = 'adv-chip';
    chip.setAttribute('draggable', 'true');
    chip.setAttribute('data-key', key);
    chip.innerHTML = `
      <span class="handle" aria-hidden="true">⋮⋮</span>
      <span class="label">${labels[key] || key}</span>
      <button type="button" class="remove" title="Retirer">×</button>
    `;
    chip.addEventListener('dragstart', e => {
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', key);
      e.dataTransfer.effectAllowed = 'move';
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      syncHidden();
    });
    chip.querySelector('.remove')?.addEventListener('click', () => {
      chip.remove();
      syncHidden();
    });
    return chip;
  }

  function addKey(key) {
    if (!key) return;
    const pk = primary?.value || '';
    if (key === pk) return;
    if (curKeys().includes(key)) return;
    drop.appendChild(makeChip(key));
    syncHidden();
  }

  add?.addEventListener('change', () => {
    addKey(add.value);
    add.value = '';
  });

  clear?.addEventListener('click', () => {
    drop.innerHTML = '';
    syncHidden();
  });

  drop.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = drop.querySelector('.adv-chip.dragging');
    const after = Array.from(drop.querySelectorAll('.adv-chip:not(.dragging)'))
      .find(ch => {
        const r = ch.getBoundingClientRect();
        return e.clientX < r.left + r.width / 2;
      });
    if (!dragging) return;
    if (!after) drop.appendChild(dragging);
    else drop.insertBefore(dragging, after);
  });

  primary?.addEventListener('change', () => {
    const pk = primary.value;
    drop.querySelectorAll('[data-key="' + pk + '"]').forEach(n => n.remove());
    syncHidden();
  });

  return { addKey, syncHidden, getKeys: curKeys };
}

/* =========================
 *  Explorateur (filtres + tri)
 * ========================= */
export function initExplorer(cfg) {
  const {
    type, items, genres, userKey,
    mount: { titleQ, descQ, inSel, outSel, status, minCh, maxCh, sortBy, sortDir, sortMulti, apply, reset, gridId },
    render
  } = cfg;

  _getWeight = cfg.getWeight || null;

  // Préparer le cache une fois (accélère énormément la recherche)
  if (Array.isArray(items)) items.forEach(_prep);

  const els = {
    qTitle: document.querySelector(titleQ),
    qDesc: document.querySelector(descQ),
    status: document.querySelector(status),
    minCh: document.querySelector(minCh),
    maxCh: document.querySelector(maxCh),
    sortBy: document.querySelector(sortBy),
    sortDir: document.querySelector(sortDir),
    sortMulti: sortMulti ? document.querySelector(sortMulti) : null,
    apply: document.querySelector(apply),
    reset: document.querySelector(reset),
    grid: document.getElementById(gridId)
  };

  const mkTS = (sel, opts) => {
    const node = document.querySelector(sel);
    if (!node) return null;
    if (node.tomselect) return node.tomselect;
    return new TomSelect(sel, { options: genres.map(g => ({ value: g, text: g })), plugins: ['remove_button'], create: false, persist: false, maxOptions: 500, ...opts });
  };
  const tsIn = mkTS(inSel);
  const tsOut = mkTS(outSel);

  const state = { dir: 1 };
  const tools = makeSimilarityTools();

  const byStr = f => (a, b) => f(a).localeCompare(f(b)) * state.dir;
  const byNum = f => (a, b) => ((f(a) ?? 0) - (f(b) ?? 0)) * state.dir;

  function applySort(out, key) {
    if (key === 'title') {
      out.sort(byStr(x => norm(x.title || '')));
    } else if (key === 'modif') {
      out.sort((a, b) => {
        const A = (a.modifieLe && (a.modifieLe.seconds || a.modifieLe._seconds)) ? (a.modifieLe.seconds || a.modifieLe._seconds) * 1000 : dateKey(a.modifieLe);
        const B = (b.modifieLe && (b.modifieLe.seconds || b.modifieLe._seconds)) ? (b.modifieLe.seconds || b.modifieLe._seconds) * 1000 : dateKey(b.modifieLe);
        return (B - A) * state.dir;
      });
    } else if (key === 'progress') {
      out.sort(byNum(x => progressionPct(x, userKey)));
    } else if (key === 'chapters' && (type === 'mangas' || type === 'novels')) {
      out.sort(byNum(x => Number(x.chTotal || 0)));
    } else if (key === 'date') {
      out.sort((a, b) => (dateKey(a.date) - dateKey(b.date)) * state.dir);
    } else if (key === 'lastRead') {
      out.sort((a, b) => (dateKey(a.derniereLecture) - dateKey(b.derniereLecture)) * state.dir);
    } else if (key === 'similarity') {
      out.sort((a, b) => tools.cmp(a, b, state.dir));
    }
  }

  function multiSort(arr, keys) {
    const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
    if (!list.length) return;
    for (let i = list.length - 1; i >= 0; i--) applySort(arr, list[i]);
  }

  let _applyRunning = false, _applyQueued = false;
  function scheduleApplyAll() {
    if (_applyRunning) { _applyQueued = true; return; }
    _applyRunning = true;
    requestAnimationFrame(() => {
      try { applyAll(); }
      finally { _applyRunning = false; if (_applyQueued) { _applyQueued = false; scheduleApplyAll(); } }
    });
  }

  function applyAll() {
    let out = Array.isArray(items) ? items.slice() : [];

    // --- Titre : AND strict (plus on tape, moins de résultats) ---
    if (els.qTitle && els.qTitle.value.trim()) {
      const tQ = els.qTitle.value.trim();
      out = out.filter(it => titleMatchAND(it, tQ));
      // Tri secondaire pour stabilité visuelle
      out.sort((a, b) => (norm(a.title || '')).localeCompare(norm(b.title || '')));
    }

    // --- Description : AND rapide via cache ---
    if (els.qDesc && els.qDesc.value.trim()) {
      const dQ = els.qDesc.value.trim();
      out = out.filter(it => descMatch(it, dQ));
    }

    const inVals = tsIn ? tsIn.getValue() : [];
    const outVals = tsOut ? tsOut.getValue() : [];
    out = out.filter(it => hasAllGenres(it, inVals) && hasNoExcluded(it, outVals));

    if (els.status && (els.status.value || '').trim()) {
      const want = els.status.value.trim();
      out = out.filter(it => statusOf(it, type, userKey) === want);
    }

    if (type === 'mangas' || type === 'novels') {
      const mn = Number(els.minCh?.value || '');
      const mx = Number(els.maxCh?.value || '');
      out = out.filter(it => {
        const ch = Number(it.chTotal || 0);
        if (!Number.isNaN(mn) && mn > 0 && ch < mn) return false;
        if (!Number.isNaN(mx) && mx > 0 && ch > mx) return false;
        return true;
      });
    }

    const dirBtn = els.sortDir;
    if (dirBtn) dirBtn.setAttribute('aria-pressed', state.dir === -1 ? 'true' : 'false');

    const primary = els.sortBy?.value || 'title';
    let stack = [];
    if (els.sortMulti && els.sortMulti.value) {
      stack = els.sortMulti.value.split(',').filter(Boolean);
    }
    const uniqueStack = stack.filter(k => k !== primary);

    multiSort(out, uniqueStack);
    applySort(out, primary);

    if (typeof render === 'function') render(out);
  }

  els.apply?.addEventListener('click', scheduleApplyAll);
  els.reset?.addEventListener('click', () => {
    if (els.qTitle) els.qTitle.value = '';
    if (els.qDesc) els.qDesc.value = '';
    if (els.status) els.status.value = '';
    if (els.minCh) els.minCh.value = '';
    if (els.maxCh) els.maxCh.value = '';
    try { tsIn?.clear(); } catch { }
    try { tsOut?.clear(); } catch { }
    if (els.sortMulti) { els.sortMulti.value = ''; }
    if (els.sortBy) els.sortBy.value = 'title';
    state.dir = 1;
    applyAll();
  });
  els.sortDir?.addEventListener('click', () => { state.dir *= -1; scheduleApplyAll(); });

  let tmr;
  [els.qTitle, els.qDesc].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      clearTimeout(tmr); tmr = setTimeout(scheduleApplyAll, 180);
    });
  });

  applyAll();
}

/* =========================================================
 *  Similarité pour Recos & Popups
 * ========================================================= */
export function similarityScoreAgainstSet(candidate, refs) {
  if (!candidate || !Array.isArray(refs) || !refs.length) return 0;

  const leadC = _leadOf(candidate);
  const [C1, C2] = _bestPrimaryWithRanks(candidate);

  let best = -Infinity;
  for (const R of refs) {
    const leadR = _leadOf(R);
    const [R1, R2] = _bestPrimaryWithRanks(R);

    const leadPts = (leadC === leadR) ? 3 : 0;
    const g1gap = Math.abs(_keyRank(C1.key) - _keyRank(R1.key));
    const g2gap = Math.abs(_keyRank(C2.key) - _keyRank(R2.key));
    const domPts = (6 - Math.min(6, g1gap || 6)) + (4 - Math.min(4, g2gap || 4));
    const common = _sharedCount(candidate, R);
    const commonPts = common * 5;
    const keyPts =
      (C1.key && C1.key === R1.key ? 3 : 0) +
      (C2.key && C2.key === R2.key ? 2 : 0);

    const score = leadPts + domPts + commonPts + keyPts;
    if (score > best) best = score;
  }
  return best;
}

// Helpers exportés
export function primaryKeyOf(it) {
  const [p] = _bestPrimaryWithRanks(it);
  return (p?.key || '').trim();
}
export function secondaryKeyOf(it) {
  const [, s] = _bestPrimaryWithRanks(it);
  return (s?.key || '').trim();
}
function equalKey(a, b) {
  a = (a || '').trim(); b = (b || '').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  return sim(a, b) >= 0.9;
}

/* ==== Reco/Similaire avec relâchement progressif pour garantir du volume ==== */
export function rankBySimilarityToSet(pool, refs, limit, opts = {}) {
  const {
    strict = true,
    alsoMatchSecondary = true,
    enforceLead = true,
    minCount = Math.min(limit || 0, 24) // cible pratique
  } = opts;

  const P = Array.isArray(pool) ? pool.slice() : [];
  const R = Array.isArray(refs) ? refs.filter(Boolean) : [];
  if (!P.length || !R.length) return [];

  const primSet = new Set(R.map(primaryKeyOf).filter(Boolean));
  const secSet = new Set(R.map(secondaryKeyOf).filter(Boolean));
  const refLead = new Set(R.map(_leadOf));

  function filterOnce(cands, cfg) {
    let out = cands;
    if (cfg.strict) {
      out = out.filter(c => [...primSet].some(pk => equalKey(primaryKeyOf(c), pk)));
      if (cfg.alsoMatchSecondary) {
        const pass2 = out.filter(c => [...secSet].some(sk => equalKey(secondaryKeyOf(c), sk)));
        if (pass2.length) out = pass2;
      }
      if (cfg.enforceLead) {
        const passLead = out.filter(c => refLead.has(_leadOf(c)));
        if (passLead.length) out = passLead;
      }
    }
    return out;
  }

  // échelle de relâchement
  const ladders = [
    { strict: true, alsoMatchSecondary, enforceLead },
    { strict: true, alsoMatchSecondary, enforceLead: false },
    { strict: true, alsoMatchSecondary: false, enforceLead: false },
    { strict: false }
  ];

  let candidates = P;
  let picked = [];

  for (const step of (strict ? ladders : [ladders.at(-1)])) {
    candidates = filterOnce(P, step);
    if (!candidates.length) continue;

    picked = candidates
      .map(it => ({ it, score: similarityScoreAgainstSet(it, R) }))
      .sort((a, b) => b.score - a.score)
      .map(x => x.it);

    if ((picked.length >= minCount) || (!strict)) break;
  }

  const out = picked.length ? picked : P
    .map(it => ({ it, score: similarityScoreAgainstSet(it, R) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.it);

  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out;
}

export function autoSimilarFor(item, pool, limit = 12, opts = {}) {
  if (!item) return [];
  const id = (item.id || '').toString().toLowerCase().trim();
  const tt = (item.title || '').toString().toLowerCase().trim();
  const pool2 = (Array.isArray(pool) ? pool : []).filter(x => {
    const xid = (x.id || '').toString().toLowerCase().trim();
    const xtt = (x.title || '').toString().toLowerCase().trim();
    return !(xid && id && xid === id) && !(xtt && tt && xtt === tt);
  });
  return rankBySimilarityToSet(pool2, [item], limit, { minCount: Math.min(limit, 12), ...opts });
}
