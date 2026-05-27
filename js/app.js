// ============================================================
// SC Hub Mining v3 — app.js (Core Module)
// Initialization, data loading, helpers, navigation
// ============================================================

// Global data object
let D = null;

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');

  try {
    const res = await fetch('data/mining_data.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    D = await res.json();
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    errorEl.innerHTML = `<div class="card" style="border-color:var(--red)">
      <div style="color:var(--red);font-weight:700">Failed to load mining_data.json</div>
      <div style="color:var(--text-secondary);margin-top:4px">${err.message}</div>
    </div>`;
    return;
  }

  loadingEl.style.display = 'none';

  // Initialize modules — each wrapped so one failure doesn't crash everything
  initNav();
  initFooter();
  try { loadInventory(); } catch(e) { console.error('Inventory init failed:', e); }
  try { renderWelcome(); } catch(e) { console.error('Welcome render failed:', e); }
  try { initMapEvents(); } catch(e) { console.error('Map init failed:', e); }

  // Check URL for material finder pre-selection
  try { parseFinderURL(); } catch(e) { console.error('URL parse failed:', e); }
}

// ============================================================
// URL SHARING — parse ?ores=X,Y&pins=X@LOC&sys=Stanton&method=ship
// ============================================================
function parseFinderURL() {
  const params = new URLSearchParams(window.location.search);
  const oresParam = params.get('ores') || params.get('need');
  if (!oresParam) return;

  // Ore code aliases — accept common spelling variants and in-game names
  const ORE_ALIASES = {
    'ALUMINIUM': 'ALUMINUM', 'QUANTAINIUM': 'QUANTANIUM', 'SILERON': 'STILERON',
    'HEPHAESTANITE': 'HEPHAESTANITE', // already correct but included for clarity
  };
  // Also build reverse lookup from display names
  const displayToCode = {};
  for (const [code, ore] of Object.entries(D.ores || {})) {
    if (ore.display_name) displayToCode[ore.display_name.toUpperCase()] = code;
  }

  function resolveOreCode(raw) {
    const upper = raw.toUpperCase();
    if (D.ores?.[upper] || D.ore_elements?.[upper]) return upper;
    if (ORE_ALIASES[upper]) return ORE_ALIASES[upper];
    if (displayToCode[upper]) return displayToCode[upper];
    return null;
  }

  const parts = oresParam.split(',').map(s => s.trim()).filter(Boolean);
  const ores = [];
  const pins = {};

  for (const part of parts) {
    if (part.includes('@')) {
      const [ore, loc] = part.split('@');
      const code = ore ? resolveOreCode(ore) : null;
      if (code) { ores.push(code); pins[code] = loc.toUpperCase(); }
    } else {
      const code = resolveOreCode(part);
      if (code) ores.push(code);
    }
  }

  if (ores.length === 0) return;

  finderOres = new Set(ores);
  finderPins = {};
  for (const [ore, loc] of Object.entries(pins)) {
    if (ores.includes(ore)) finderPins[ore] = loc;
  }

  const sys = params.get('sys') || params.get('system');
  if (sys) finderSystem = sys;
  const method = params.get('method');
  if (method) {
    finderMethod = method === 'surface' ? 'all' : method;
  }

  // Use rAF to ensure DOM is painted before switching tab
  requestAnimationFrame(() => { switchTab('finder'); });
}

// ============================================================
// FOOTER — Attribution
// ============================================================
function initFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  
  footer.innerHTML = `
    <div class="footer-content">
      <div class="footer-credits">
        Refinery yields: <a href="https://uexcorp.space" target="_blank">UEX Corp</a>
      </div>
      <div class="footer-disclaimer">
        This site is not endorsed by or affiliated with the Cloud Imperium or Roberts Space Industries group of companies. 
        All game content and materials are copyright Cloud Imperium Rights LLC and Cloud Imperium Rights Ltd.. 
        Star Citizen®, Squadron 42®, Roberts Space Industries®, and Cloud Imperium® are registered trademarks of Cloud Imperium Rights LLC. All rights reserved.
      </div>
    </div>
  `;
}

// ============================================================
// NAVIGATION
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tab}`);
  });

  // Render tab content
  const renderers = {
    'welcome': renderWelcome,
    'finder': renderFinder,
    'location': renderLocation,
    'signals': renderSignals,
    'refinery': renderRefinery,
    'map': renderMap,
    'equipment': renderEquipment,
    'inventory': renderInventory,
    'methods': renderMethods,
  };
  
  if (renderers[tab]) renderers[tab]();
}

function initNav() {
  document.getElementById('nav').addEventListener('click', e => {
    if (e.target.classList.contains('nav-btn')) {
      switchTab(e.target.dataset.tab);
    }
  });
}

// ============================================================
// FORMATTING HELPERS
// ============================================================
function fmtPct(p, decimals = 1) {
  if (p == null) return '<span class="mono v-na">—</span>';
  return `<span class="mono">${(p * 100).toFixed(decimals)}%</span>`;
}

function fmtYield(v) {
  if (v == null) return '<span class="mono v-na">—</span>';
  const cls = v > 0 ? 'v-pos' : v < 0 ? 'v-neg' : 'v-zero';
  return `<span class="mono ${cls}">${v > 0 ? '+' : ''}${v}%</span>`;
}

function fmtNum(n, decimals = 0) {
  if (n == null) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function fmtProb(p) {
  if (p == null) return '<span class="mono v-na">—</span>';
  const pct = p * 100;
  const cls = pct >= 50 ? 'v-pos' : pct >= 20 ? 'v-warn' : 'v-neg';
  return `<span class="mono ${cls}">${pct.toFixed(1)}%</span>`;
}

// ============================================================
// TAG HELPERS
// ============================================================
function systemTag(sys) {
  const s = (sys || '').toLowerCase();
  return `<span class="tag tag-system tag-${s}">${sys}</span>`;
}

function tierTag(tier) {
  const colors = {
    legendary: { bg: 'rgba(240,192,64,0.15)', color: 'var(--yellow)', border: 'rgba(240,192,64,0.3)' },
    epic: { bg: 'rgba(155,126,219,0.15)', color: 'var(--purple)', border: 'rgba(155,126,219,0.3)' },
    rare: { bg: 'rgba(77,201,246,0.15)', color: 'var(--cyan)', border: 'rgba(77,201,246,0.3)' },
    uncommon: { bg: 'rgba(61,214,140,0.15)', color: 'var(--green)', border: 'rgba(61,214,140,0.3)' },
    common: { bg: 'rgba(90,98,112,0.15)', color: 'var(--text-secondary)', border: 'rgba(90,98,112,0.3)' },
  };
  const c = colors[tier] || colors.common;
  return `<span class="tag" style="background:${c.bg};color:${c.color};border:1px solid ${c.border}">${(tier || 'unknown').toUpperCase()}</span>`;
}

function miningMethodTag(method) {
  if (method === 'fps') return '<span class="tag tag-hand">FPS</span>';
  if (method === 'vehicle') return '<span class="tag tag-vehicle">VEHICLE</span>';
  if (method === 'fps_vehicle' || method === 'hand_vehicle') return '<span class="tag tag-roc">FPS/VEH</span>';
  return '<span class="tag tag-ship">SHIP</span>';
}

function difficultyTag(resistance) {
  if (resistance == null) return '';
  if (resistance >= 0.7) return '<span class="tag tag-worst">EXTREME</span>';
  if (resistance >= 0.4) return '<span class="tag" style="background:rgba(232,117,26,0.15);color:var(--accent);border:1px solid rgba(232,117,26,0.3)">HARD</span>';
  if (resistance >= 0) return '<span class="tag" style="background:rgba(240,192,64,0.15);color:var(--yellow);border:1px solid rgba(240,192,64,0.3)">MEDIUM</span>';
  return '<span class="tag tag-best">EASY</span>';
}

function difficultyClass(resistance) {
  if (resistance >= 0.7) return 'extreme';
  if (resistance >= 0.4) return 'hard';
  if (resistance >= 0) return 'medium';
  return 'easy';
}

// ============================================================
// NAME LOOKUP HELPERS
// ============================================================
function oreName(code) {
  if (!code) return '—';
  const ore = D.ores?.[code];
  if (ore) return ore.display_name;
  const elem = D.ore_elements?.[code];
  if (elem) return elem.display_name;
  // Handle suffixes like SAVRILIUM_RCD_LARGE
  const baseCode = code.split('_')[0];
  const baseOre = D.ores?.[baseCode];
  if (baseOre) return baseOre.display_name;
  return code;
}

function locName(code) {
  const loc = D.locations?.[code];
  return loc?.display_name || code;
}

function locFullLabel(code) {
  const loc = D.locations?.[code];
  if (!loc) return code;
  let label = loc.display_name + ' — ' + loc.system;
  if (loc.parent) {
    const parentName = D.planets?.[loc.parent]?.name || D.locations?.[loc.parent]?.display_name || loc.parent;
    label += ', ' + parentName;
  }
  return label;
}

// ============================================================
// DATA ACCESS HELPERS
// ============================================================

/** Get ore difficulty from D.ores[code].difficulty or D.ore_elements */
function getOreDifficulty(code) {
  return D.ores?.[code]?.difficulty || D.ore_elements?.[code] || null;
}

/** Get scanner signal for an ore (surface context by default) */
function getOreSignal(oreCode, context = 'surface') {
  const signals = Object.values(D.scanner_signals || {});
  // Try exact match first
  let sig = signals.find(s => s.ore_hint === oreCode && s.mining_context === context);
  if (sig) return sig;
  // Try asteroid if surface not found
  if (context === 'surface') {
    sig = signals.find(s => s.ore_hint === oreCode && s.mining_context === 'asteroid');
  }
  return sig || null;
}

/** Get all signals for a context, sorted by signal value */
function getSignalsForContext(context) {
  return Object.entries(D.scanner_signals || {})
    .filter(([, s]) => s.mining_context === context)
    .map(([key, s]) => ({ key, ...s }))
    .sort((a, b) => a.signal_value - b.signal_value);
}

/** Get composition for an ore (what's in the rock) */
function getOreComposition(oreCode, context = 'surface') {
  const comps = Object.values(D.compositions || {});
  let comp = comps.find(c => c.primary_ore === oreCode && c.mining_context === context);
  if (!comp && context === 'surface') {
    comp = comps.find(c => c.primary_ore === oreCode && c.mining_context === 'asteroid');
  }
  return comp || null;
}

/** Get all compositions containing an ore as secondary */
function getCompositionsWithSecondary(oreCode) {
  return Object.values(D.compositions || {})
    .filter(c => c.parts?.some(p => p.ore === oreCode && p.ore !== c.primary_ore));
}

/** Get location ore data from location_ores */
function getLocationOres(locCode) {
  return D.location_ores?.[locCode] || null;
}

/** Get all locations that have a specific ore */
function getLocationsForOre(oreCode, method = 'all') {
  const results = [];
  
  for (const [code, locData] of Object.entries(D.location_ores || {})) {
    const methods = method === 'all' ? ['ship', 'fps', 'vehicle'] : [method];
    
    for (const m of methods) {
      const ores = locData.ores?.[m] || [];
      const oreEntry = ores.find(o => o.ore === oreCode && isOreVisible(o, locData.type));
      if (oreEntry) {
        results.push({
          code,
          name: locData.name,
          system: locData.system,
          type: locData.type,
          method: m,
          relative_probability: oreEntry.relative_probability,
          group_probability: locData.group_probabilities?.[m] || 0,
        });
      }
    }
  }
  
  // Sort by relative probability descending
  results.sort((a, b) => b.relative_probability - a.relative_probability);
  return results;
}

/** Get mining method for an ore based on ore_elements flags */
function getMiningMethod(oreCode) {
  const elem = D.ore_elements?.[oreCode];
  if (!elem) return 'ship';
  if (elem.is_fps && elem.is_vehicle) return 'fps_vehicle';
  if (elem.is_fps) return 'fps';
  if (elem.is_vehicle) return 'vehicle';
  return 'ship';
}

/** Check if ore appears as secondary in any composition */
function isSecondaryOre(oreCode) {
  return getCompositionsWithSecondary(oreCode).length > 0;
}

/** Get best refinery for an ore in a system */
function getBestRefinery(oreCode, systemFilter = 'all') {
  const stations = D.refineries?.stations || {};
  let best = null;

  for (const [name, station] of Object.entries(stations)) {
    if (systemFilter !== 'all' && station.system !== systemFilter) continue;
    const y = station.yields?.[oreCode];
    if (y?.value != null && (!best || y.value > best.value)) {
      best = { name, system: station.system, value: y.value };
    }
  }
  return best;
}

// ============================================================
// CHIP BUILDER UTILITY
// ============================================================
function buildChips(container, options, currentValue, onChange, renderFn) {
  if (!container) return;
  container.innerHTML = options.map(([label, value]) =>
    `<button class="chip${value === currentValue ? ' active' : ''}" data-value="${value}">${label}</button>`
  ).join('');
  container.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      onChange(chip.dataset.value);
      renderFn();
    });
  });
}

// ============================================================
// WELCOME / HOME TAB
// ============================================================
function renderWelcome() {
  // Header stats
  const meta = D.meta || {};
  document.getElementById('header-patch').textContent = `Patch ${meta.current_patch || '?'} • ${meta.data_updated || ''}`;
  document.getElementById('header-stats').innerHTML = `
    <span>${meta.total_ores || 0} ores</span>
    <span>${meta.total_location_ores || 0} locations</span>
    <span>${meta.total_scanner_signals || 0} signals</span>
    <span>${meta.total_refineries || 0} refineries</span>
  `;

  // Welcome sidebar stats
  const statsEl = document.getElementById('welcome-stats');
  if (statsEl) {
    const shipOres = Object.values(D.ore_elements || {}).filter(o => !o.is_fps && !o.is_vehicle && !o.special_type).length;
    const fpsOres = Object.values(D.ore_elements || {}).filter(o => o.is_fps).length;
    const vehOres = Object.values(D.ore_elements || {}).filter(o => o.is_vehicle).length;
    
    statsEl.innerHTML = `
      <div class="map-info-title">// Data Summary</div>
      <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
        <strong>${shipOres}</strong> ship-mineable ores<br>
        <strong>${fpsOres}</strong> FPS ores (caves)<br>
        <strong>${vehOres}</strong> vehicle ores (ROC)<br>
        <strong>${Object.keys(D.compositions || {}).length}</strong> rock compositions<br>
        <strong>${Object.keys(D.location_ores || {}).length}</strong> mapped locations
      </div>
    `;
  }

  // Mining mechanics summary
  renderMiningMechanics();
  
  // Initialize Quick Mine
  initQuickMine();
}

function renderMiningMechanics() {
  const el = document.getElementById('mining-explainer');
  if (!el) return;

  const params = D.mining_params || {};
  const ship = params.ship || {};
  const fps = params.fps || {};
  const vehicle = params.vehicle || {};

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <div style="font-weight:700;color:var(--accent);margin-bottom:6px">The Charge Meter</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
          Increase laser power → charge builds → fill the <span style="color:var(--green)">green zone</span> → rock fractures.
          The green zone is the "optimal window" — about <strong>${((ship.optimalWindowSize || 0.1) * 100).toFixed(0)}%</strong> of the meter for ship mining.
          Each ore has a <strong>thinness</strong> value that makes this window narrower or wider.
        </div>
      </div>
      <div>
        <div style="font-weight:700;color:var(--accent);margin-bottom:6px">Resistance &amp; Instability</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
          <strong>Resistance</strong> = how much power the rock absorbs. Higher = need more laser power.<br>
          <strong>Instability</strong> = the charge meter wobbles (${ship.instabilityWavePeriod || 3}-second wave cycle). Higher = harder to stay in the green zone.
        </div>
      </div>
      <div>
        <div style="font-weight:700;color:var(--accent);margin-bottom:6px">Explosions</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
          Overcharge past the green zone → fill the <span style="color:var(--red)">red zone</span> → <span style="color:var(--red)">explosion</span>.
          Each ore has an <strong>explosion multiplier</strong> — Quantanium's is 260×, Iron's is 20×.
          High instability ores like Quantanium are the most dangerous.
        </div>
      </div>
      <div>
        <div style="font-weight:700;color:var(--accent);margin-bottom:6px">Gadgets &amp; Extraction</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6">
          <strong>Gadgets</strong> modify the rock before you fire — throw them when danger is below 25% (above 50% destroys the gadget).
          After fracturing, <strong>child rocks</strong> spawn. Fracture them too, or extract directly if small enough.
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// SCAN CONFIDENCE HELPERS (adapted for new data)
// ============================================================
function fmtScans(n) {
  if (n == null || n === 0) return '<span class="mono v-na">—</span>';
  return `<span class="mono">${n.toLocaleString()}</span>`;
}

function confidence(scans) {
  if (!scans) return '';
  const pct = scans / (scans + 200) * 100;
  const cls = pct >= 33 ? 'v-pos' : pct >= 15 ? 'v-warn' : 'v-neg';
  return `<span class="mono ${cls}" style="font-size:10px">${pct.toFixed(0)}%</span>`;
}

function confColor(scans) {
  if (!scans) return 'var(--text-dim)';
  const pct = scans / (scans + 200);
  return pct >= 0.33 ? 'var(--green)' : pct >= 0.15 ? 'var(--yellow)' : 'var(--red)';
}

function confChip(label, scans) {
  const w = scans ? (scans / (scans + 200) * 100).toFixed(0) : 0;
  const c = confColor(scans);
  return `<span class="also-chip" style="--conf-w:${w}%;--conf-c:${c}">${label}</span>`;
}

// ============================================================
// LOCATION/ORE LOOKUPS (compatible with both data schemas)
// ============================================================

// Location types the game does not show info panels for — trust the preset ore list directly.
const PRESET_ONLY_TYPES = new Set(['ring', 'asteroid_belt', 'asteroid_cluster', 'lagrange_field', 'mission_location', 'hathor']);

/** True if an ore entry should be displayed for this location type. */
function isOreVisible(entry, locType) {
  if (PRESET_ONLY_TYPES.has(locType)) return true;
  return entry.panel_confirmed !== false;
}

/** Get ores at a location — works with both old ore_locations and new location_ores */
function getOreAt(locCode) {
  // New schema: location_ores
  const locData = D.location_ores?.[locCode];
  if (locData) {
    const ores = [];
    for (const method of ['ship', 'fps', 'vehicle']) {
      for (const entry of (locData.ores?.[method] || [])) {
        if (entry.ore === 'INERTMATERIAL' || !isOreVisible(entry, locData.type)) continue;
        // Avoid duplicates
        if (!ores.find(o => o.code === entry.ore)) {
          ores.push({code: entry.ore, prob: (entry.relative_probability ?? 0) / 100, method});
        }
      }
    }
    ores.sort((a, b) => b.prob - a.prob);
    return ores;
  }

  // Old schema: ore_locations
  const data = D.ore_locations?.[locCode];
  if (data) {
    return Object.entries(data.ores || {})
      .filter(([k]) => k !== 'INERTMATERIAL')
      .map(([k, v]) => ({code: k, ...v}))
      .sort((a, b) => b.prob - a.prob);
  }

  return [];
}

/** Get display name for a location code (with friendly labels) */
function locDisplayName(code) {
  const loc = D.locations?.[code];
  if (!loc) return code;
  if (code.match(/^ST-\w+-\w+$/)) return `Mining Base ${code.replace('ST-', '#')}`;
  return loc.display_name || code;
}

// ============================================================
// MAP DISTANCE — compute positions for refinery routing
// ============================================================
function computeLocXY(locCode) {
  const loc = D.locations?.[locCode];
  if (!loc) return null;
  const sys = loc.system?.toLowerCase();
  if (!sys) return null;
  const positions = D.map_positions?.[sys] || {};
  const planets = D.planets || {};

  const size = 1000;
  const cx = size / 2, cy = size / 2;
  let maxRing = 1;
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring > maxRing) maxRing = pos.ring;
  }
  const cfgC = positions._config || {};
  const ringSpacing = (size * (cfgC.ring_scale || 36) / 100) / (maxRing + 0.5);
  const edgeR = size * (cfgC.edge_scale || 46) / 100;

  const ringMults = {};
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring_mult && pos.ring_mult !== 1.0) ringMults[pos.ring] = pos.ring_mult;
  }
  const getRingR = (r) => r * (ringMults[r] || 1.0) * ringSpacing;

  const toXY = (angle, radius) => ({
    x: cx + Math.cos((angle - 90) * Math.PI / 180) * radius,
    y: cy + Math.sin((angle - 90) * Math.PI / 180) * radius,
  });

  const lpointXY = (parentPos, lp) => {
    const r = getRingR(parentPos.ring);
    let a, lr;
    if (lp === 1) { a = parentPos.angle; lr = r - ringSpacing * 0.3; }
    else if (lp === 2) { a = parentPos.angle; lr = r + ringSpacing * 0.3; }
    else if (lp === 3) { a = parentPos.angle + 180; lr = r; }
    else if (lp === 4) { a = parentPos.angle - 60; lr = r; }
    else if (lp === 5) { a = parentPos.angle + 60; lr = r; }
    else return null;
    return toXY(a, lr);
  };

  if (positions[locCode]) {
    const p = positions[locCode];
    if (p.edge) return toXY(p.angle, edgeR);
    if (p.ring) return toXY(p.angle, getRingR(p.ring));
  }
  if (loc.lpoint && loc.parent && positions[loc.parent]) {
    return lpointXY(positions[loc.parent], loc.lpoint);
  }
  if (loc.parent && positions[loc.parent]) {
    const pp = positions[loc.parent];
    return toXY(pp.angle, getRingR(pp.ring));
  }
  // Grandparent resolution — for rings of moons (e.g. YELB → YEL → CRU)
  if (loc.parent) {
    const parentLoc = D.locations?.[loc.parent];
    if (parentLoc?.parent && positions[parentLoc.parent]) {
      const gp = positions[parentLoc.parent];
      return toXY(gp.angle, getRingR(gp.ring));
    }
  }
  if (loc.type === 'asteroid_belt' || loc.type === 'ring') {
    const beltPos = positions[locCode];
    const beltR = beltPos?.belt_radius
      ? beltPos.belt_radius * ringSpacing
      : (maxRing * ringSpacing + edgeR) * 0.52;
    return {x: cx, y: cy - beltR};
  }
  const gateKey = locCode.replace(/-/g, '_');
  if (positions[gateKey]?.edge) return toXY(positions[gateKey].angle, edgeR);

  return null;
}

/** Resolve refinery station name to location code */
function refStationToLocCode(stationName) {
  const after = stationName.split(' - ')[1] || stationName;
  for (const code of Object.keys(D.locations || {})) {
    if (code === after || D.locations[code].display_name === after) return code;
  }
  const gwMatch = after.match(/^(\w+)\s+Gateway/i);
  if (gwMatch) return gwMatch[1].toUpperCase() + '_GATE';
  const upper = after.toUpperCase().replace(/\s+/g, '');
  for (const code of Object.keys(D.locations || {})) {
    if (code.toUpperCase().replace(/[-_\s]/g, '') === upper) return code;
  }
  return after;
}

/** Find nearest + best refineries for an ore at a location, using map distance */
function findRefineries(locCode, oreCode) {
  const loc = D.locations?.[locCode];
  if (!loc) return {nearest: null, best: null, selfYield: null, isBelt: false};
  const sys = loc.system;
  const locXY = computeLocXY(locCode);
  const isBelt = loc.type === 'asteroid_belt';

  const allRefs = [];
  let selfYield = null;
  for (const [sname, sdata] of Object.entries(D.refineries?.stations || {})) {
    if (sdata.system !== sys) continue;
    const refCode = refStationToLocCode(sname);
    const refXY = computeLocXY(refCode);
    const dist = (locXY && refXY)
      ? Math.sqrt((locXY.x - refXY.x) ** 2 + (locXY.y - refXY.y) ** 2)
      : 9999;
    const y = sdata.yields?.[oreCode]?.value ?? null;

    if (refCode === locCode) {
      selfYield = y;
      continue;
    }
    allRefs.push({name: sname, yield: y, code: refCode, dist});
  }

  if (allRefs.length === 0) return {nearest: null, best: null, selfYield, isBelt};

  let nearest = null;
  if (!isBelt) {
    nearest = allRefs.reduce((a, b) => a.dist < b.dist ? a : b);
  }

  const withYield = allRefs.filter(r => r.yield != null);
  let best = null;
  if (withYield.length > 0) {
    best = withYield.reduce((a, b) => {
      if (a.yield === b.yield) return a.dist < b.dist ? a : b;
      return a.yield > b.yield ? a : b;
    });
  }
  if (isBelt && !best) {
    best = allRefs.reduce((a, b) => a.dist < b.dist ? a : b);
  }

  return {nearest, best, selfYield, isBelt};
}

/** Compute a refinery convenience score for ranking: yield × proximity.
 *  Higher = better refinery access. Returns 0 for ground ores or no data.
 *  Used by rankLocationsForOre and gatherLocationScores to break ties. */
function computeRefineryConvenience(locCode, oreCode) {
  const loc = D.locations?.[locCode];
  if (!loc) return 0;
  const sys = loc.system;
  const locXY = computeLocXY(locCode);
  if (!locXY) return 0;
  const NORM_DIST = 100;
  let bestScore = 0;
  for (const [sname, sdata] of Object.entries(D.refineries?.stations || {})) {
    if (sdata.system !== sys) continue;
    const y = sdata.yields?.[oreCode]?.value;
    if (y == null || y <= 0) continue;
    const refCode = refStationToLocCode(sname);
    const refXY = computeLocXY(refCode);
    if (!refXY) continue;
    const dist = Math.sqrt((locXY.x - refXY.x) ** 2 + (locXY.y - refXY.y) ** 2);
    const score = y * (NORM_DIST / (NORM_DIST + dist));
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

// ============================================================
// PIPS RENDERER (for refining methods)
// ============================================================
function renderPips(value, max) {
  let html = '<span class="bar">';
  for (let i = 1; i <= max; i++) {
    html += `<span class="pip${i <= value ? ' on' : ''}"></span>`;
  }
  return html + '</span>';
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', init);
