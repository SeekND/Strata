// ============================================================
// DATA + STATE
// ============================================================
let D = null; // mining_data.json
let finderOres = new Set();
let finderSystem = 'all';
let finderMethod = 'all';
let finderRefSystem = 'all';
let locSystem = 'all';
let locType = 'all';
let refOre = '';
let refSystem = 'all';

// ============================================================
// HELPERS
// ============================================================
function fmtProb(p) {
  if (p == null) return '<span class="mono v-na">\u2014</span>';
  const pct = (p * 100);
  const cls = pct >= 50 ? 'v-pos' : pct >= 20 ? 'v-warn' : 'v-neg';
  const barCls = pct >= 50 ? 'prob-high' : pct >= 20 ? 'prob-med' : 'prob-low';
  return `<span class="prob-bar"><span class="prob-track"><span class="prob-fill ${barCls}" style="width:${Math.min(pct,100)}%"></span></span><span class="mono ${cls}">${pct.toFixed(0)}%</span></span>`;
}

function fmtPct(p) {
  if (p == null) return '<span class="mono v-na">\u2014</span>';
  return `<span class="mono">${(p*100).toFixed(1)}%</span>`;
}

function fmtYield(v) {
  if (v == null) return '<span class="mono v-na">\u2014</span>';
  const cls = v > 0 ? 'v-pos' : v < 0 ? 'v-neg' : 'v-zero';
  return `<span class="mono ${cls}">${v > 0 ? '+' : ''}${v}%</span>`;
}

function fmtScans(n) {
  if (!n) return '';
  if (n >= 100) return `<span class="mono v-pos">${n}</span>`;
  if (n >= 20) return `<span class="mono v-warn">${n}</span>`;
  return `<span class="mono v-neg">${n}</span>`;
}

function confidence(scans) {
  if (scans >= 100) return '<span class="tag tag-best">HIGH</span>';
  if (scans >= 20) return '<span class="tag" style="background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(240,192,64,0.25)">MED</span>';
  return '<span class="tag tag-worst">LOW</span>';
}

function systemTag(sys) {
  const s = (sys||'').toLowerCase();
  return `<span class="tag tag-system tag-${s}">${sys}</span>`;
}

function miningTag(method) {
  if (method === 'fps_vehicle') return '<span class="tag tag-roc">FPS/VEH</span>';
  if (method === 'fps') return '<span class="tag tag-hand">FPS</span>';
  if (method === 'vehicle') return '<span class="tag tag-vehicle">VEHICLE</span>';
  if (method === 'hand_vehicle') return '<span class="tag tag-roc">FPS/VEH</span>';
  if (method === 'hand') return '<span class="tag tag-hand">FPS</span>';
  if (method === 'roc_hand') return '<span class="tag tag-roc">FPS/VEH</span>';
  return '<span class="tag tag-ship">SHIP</span>';
}

function locDisplayName(code) {
  const loc = D.locations[code];
  if (!loc) return code;
  const name = loc.display_name || code;
  // ST- mining bases → "Mining Base #xxx"
  if (code.startsWith('ST-')) {
    const short = code.replace('ST-', '');
    const parent = loc.parent ? `, ${D.locations[loc.parent]?.display_name || D.planets[loc.parent]?.name || loc.parent}` : '';
    return `Mining Base #${short}`;
  }
  return name;
}

function locFullLabel(code) {
  const loc = D.locations[code];
  if (!loc) return code;
  let label = locDisplayName(code) + ' \u2014 ' + loc.system;
  if (loc.parent) {
    const parentName = D.planets[loc.parent]?.name || D.locations[loc.parent]?.display_name || loc.parent;
    label += ', ' + parentName;
  }
  return label;
}

function locName(code) {
  const loc = D.locations[code];
  return loc ? loc.display_name : code;
}

function getLocSystem(code) {
  const loc = D.locations[code];
  return loc ? loc.system : 'Unknown';
}

function oreName(code) {
  const ore = D.ores[code];
  return ore ? ore.display_name : code;
}

function scanConf(scans) {
  if (scans >= 100) return 'conf-high';
  if (scans >= 20) return 'conf-med';
  return 'conf-low';
}

function confColor(scans) {
  if (scans >= 100) return '#3dd68c';
  if (scans >= 20) return '#f0c040';
  return '#e84040';
}

function confChip(label, scans) {
  // Proportional bar: scans/(scans+200) gives 0-1 for bar width
  const w = Math.round(Math.min(100, (scans / (scans + 200)) * 100));
  const c = confColor(scans);
  return `<span class="also-chip" style="--conf-w:${w}%;--conf-c:${c}">${label}</span>`;
}

function getLocationSignals(locCode, selectedOres) {
  // Cross-reference: which rock types spawn at this location AND contain selected ores?
  const rtlData = D.rock_type_locations[locCode];
  if (!rtlData?.rockTypes) return [];
  const loc = D.locations[locCode];
  if (!loc) return [];
  const sysKey = loc.system.toUpperCase();
  const sysRockTypes = D.rock_types[sysKey] || {};

  const results = [];
  for (const [rtype, rtlInfo] of Object.entries(rtlData.rockTypes)) {
    const rtData = sysRockTypes[rtype];
    if (!rtData?.ores) continue;
    // Which of the selected ores does this rock type contain?
    const matchedOres = [];
    for (const ore of selectedOres) {
      const oreInRock = rtData.ores[ore];
      if (oreInRock && oreInRock.prob >= 0.05) {
        matchedOres.push({ code: ore, prob: oreInRock.prob });
      }
    }
    if (matchedOres.length === 0) continue;
    results.push({
      type: rtype,
      spawnProb: rtlInfo.prob || 0,
      spawnScans: rtlInfo.scans || 0,
      massMed: rtData.mass?.med || 0,
      massMin: rtData.mass?.min || 0,
      massMax: rtData.mass?.max || 0,
      instMed: rtData.inst?.med || 0,
      matchedOres,
    });
  }
  // Sort by spawn probability (most likely to see first)
  results.sort((a, b) => b.spawnProb - a.spawnProb);
  return results;
}

function signalIcon(locCode, selectedOres) {
  // Only for ship-mining locations with rock type data
  const signals = getLocationSignals(locCode, selectedOres);
  if (signals.length === 0) return '';
  return ` <span class="sig-icon" data-sigloc="${locCode}">\u{1F4E1}</span>`;
}

function showSigTooltip(locCode, anchorEl, selectedOres) {
  const tt = document.getElementById('sig-tooltip');
  if (!tt) return;
  const signals = getLocationSignals(locCode, selectedOres);
  if (signals.length === 0) { tt.style.display = 'none'; return; }

  const loc = D.locations[locCode];
  const locLabel = loc ? locDisplayName(locCode) : locCode;
  const multi = selectedOres.length > 1;

  let rows = signals.slice(0, 5).map(s => {
    const spawnPct = (s.spawnProb * 100).toFixed(0);
    const spawnCls = s.spawnProb >= 0.25 ? 'v-pos' : s.spawnProb >= 0.15 ? 'v-warn' : 'v-neg';
    // Show which selected ores this rock contains (with ore-in-rock probability)
    const oreChips = multi ? s.matchedOres.map(o => {
      const pCls = o.prob >= 0.25 ? 'v-pos' : o.prob >= 0.10 ? 'v-warn' : 'v-neg';
      return `<span class="mono ${pCls}" style="font-size:10px">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`;
    }).join(' ') : (() => {
      const o = s.matchedOres[0];
      const pCls = o.prob >= 0.25 ? 'v-pos' : o.prob >= 0.10 ? 'v-warn' : 'v-neg';
      return `<span class="mono ${pCls}" style="font-size:10px">${(o.prob*100).toFixed(0)}% in rock</span>`;
    })();
    return `<div class="sig-tt-row"><strong>${s.type}</strong> <span class="mono ${spawnCls}">${spawnPct}%</span> <span class="sg-range">mass ~${s.massMed.toLocaleString()}</span></div><div style="padding-left:68px;margin-bottom:3px">${oreChips}</div>`;
  }).join('');

  tt.innerHTML = `<div class="sig-tt-title">Mass at ${locLabel}</div>${rows}<div class="sig-tt-hint">% = chance this rock type spawns here. Mass = average mass.</div>`;

  const rect = anchorEl.getBoundingClientRect();
  tt.style.display = 'block';
  // Position: try below, clamp to viewport
  const ttWidth = 300;
  let left = rect.left;
  if (left + ttWidth > window.innerWidth) left = window.innerWidth - ttWidth - 10;
  if (left < 5) left = 5;
  tt.style.left = left + 'px';
  tt.style.top = (rect.bottom + 6) + 'px';
}

function hideSigTooltip() {
  const tt = document.getElementById('sig-tooltip');
  if (tt) tt.style.display = 'none';
}

function getOreAt(locCode) {
  const data = D.ore_locations[locCode];
  if (!data) return [];
  return Object.entries(data.ores || {})
    .filter(([k]) => k !== 'INERTMATERIAL')
    .map(([k, v]) => ({code: k, ...v}))
    .sort((a, b) => b.prob - a.prob);
}

function getRefineryYield(stationName, oreCode) {
  const station = D.refineries.stations[stationName];
  if (!station) return null;
  const y = station.yields[oreCode];
  return y ? y.value : null;
}

function getBestRefinery(oreCode) {
  return D.computed.best_refinery[oreCode] || null;
}

function getRegionRefineries(locCode) {
  const loc = D.locations[locCode];
  if (!loc) return [];
  const sys = loc.system;
  return Object.entries(D.refineries.stations)
    .filter(([, s]) => s.system === sys)
    .map(([name, s]) => ({name, ...s}));
}

// ============================================================
// MAP DISTANCE — compute positions from map_positions JSON
// ============================================================

/**
 * Compute XY for any location code using the map_positions data.
 * Returns {x, y} in a normalized coordinate space, or null if unknown.
 * Uses the same angle+ring→XY math as drawSystemMap.
 */
function computeLocXY(locCode) {
  const loc = D.locations[locCode];
  if (!loc) return null;
  const sys = loc.system?.toLowerCase();
  if (!sys) return null;
  const positions = D.map_positions[sys] || {};
  const planets = D.planets || {};

  // Canonical size for distance comparison
  const size = 1000;
  const cx = size / 2, cy = size / 2;
  let maxRing = 1;
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring > maxRing) maxRing = pos.ring;
  }
  const cfgC = positions._config || {};
  const ringSpacing = (size * (cfgC.ring_scale || 36) / 100) / (maxRing + 0.5);
  const edgeR = size * (cfgC.edge_scale || 46) / 100;

  // Build per-ring multipliers (same as drawSystemMap)
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

  // Direct position (planet or station with map_positions entry)
  if (positions[locCode]) {
    const p = positions[locCode];
    if (p.edge) return toXY(p.angle, edgeR);
    if (p.ring) return toXY(p.angle, getRingR(p.ring));
  }

  // L-point: use parent position + lpoint offset
  if (loc.lpoint && loc.parent && positions[loc.parent]) {
    return lpointXY(positions[loc.parent], loc.lpoint);
  }

  // Moon/child: use parent position
  if (loc.parent && positions[loc.parent]) {
    const pp = positions[loc.parent];
    return toXY(pp.angle, getRingR(pp.ring));
  }

  // Asteroid belt: use map_positions belt_radius if available
  if (loc.type === 'asteroid_belt') {
    const beltPos = positions[locCode];
    const beltR = beltPos?.belt_radius
      ? beltPos.belt_radius * ringSpacing
      : (maxRing * ringSpacing + edgeR) * 0.52;
    return {x: cx, y: cy - beltR};
  }

  // Gate: check jump_gates for angle
  for (const [, gate] of Object.entries(D.jump_gates || {})) {
    if (gate.system === loc.system && gate.name === loc.display_name) {
      const gateKey = Object.keys(positions).find(k =>
        positions[k].edge && k.toLowerCase().includes(gate.destination.toLowerCase()));
      if (gateKey) return toXY(positions[gateKey].angle, edgeR);
    }
  }

  // Gateway refinery: "PYRO_GATE" style key
  const gateKey = locCode.replace(/-/g, '_');
  if (positions[gateKey]?.edge) return toXY(positions[gateKey].angle, edgeR);

  return null;
}

/**
 * Find nearest + best refineries for an ore at a location, using map distance.
 * Returns {nearest, best, selfYield, isBelt}
 * - nearest: closest refinery that is NOT the location itself
 * - best: highest yield refinery (prefers nearest when yields tie)
 * - selfYield: if location IS a refinery, its yield for this ore (or null)
 * - For belts: nearest=null, only best
 */
function findRefineries(locCode, oreCode) {
  const loc = D.locations[locCode];
  if (!loc) return {nearest: null, best: null, selfYield: null, isBelt: false};
  const sys = loc.system;
  const locXY = computeLocXY(locCode);
  const isBelt = loc.type === 'asteroid_belt';

  // Collect all same-system refineries with distance
  const allRefs = [];
  let selfYield = null;
  for (const [sname, sdata] of Object.entries(D.refineries.stations)) {
    if (sdata.system !== sys) continue;
    const refCode = refStationToLocCode(sname);
    const refXY = computeLocXY(refCode);
    const dist = (locXY && refXY)
      ? Math.sqrt((locXY.x - refXY.x) ** 2 + (locXY.y - refXY.y) ** 2)
      : 9999;
    const y = sdata.yields[oreCode]?.value ?? null;

    // If this station IS our location, record selfYield but don't add to candidates
    if (refCode === locCode) {
      selfYield = y;
      continue;
    }
    allRefs.push({name: sname, yield: y, code: refCode, dist});
  }

  if (allRefs.length === 0) return {nearest: null, best: null, selfYield, isBelt};

  // Nearest by distance (skip for belts) — always from other stations
  let nearest = null;
  if (!isBelt) {
    nearest = allRefs.reduce((a, b) => a.dist < b.dist ? a : b);
  }

  // Best by yield — prefer nearest when yields are equal
  const withYield = allRefs.filter(r => r.yield != null);
  let best = null;
  if (withYield.length > 0) {
    best = withYield.reduce((a, b) => {
      if (a.yield === b.yield) return a.dist < b.dist ? a : b; // tie-break by distance
      return a.yield > b.yield ? a : b;
    });
  }

  // Belt fallback: if no yield data, pick closest as "best"
  if (isBelt && !best) {
    best = allRefs.reduce((a, b) => a.dist < b.dist ? a : b);
  }

  return {nearest, best, selfYield, isBelt};
}

// ============================================================
// NAVIGATION — handled by switchTab() in INIT section
// ============================================================

// ============================================================
// CHIPS HELPER
// ============================================================
function buildChips(container, options, current, setter, renderer) {
  container.innerHTML = '';
  options.forEach(([label, value]) => {
    const chip = document.createElement('div');
    chip.className = 'chip' + (current === value ? ' active' : '');
    chip.textContent = label;
    chip.onclick = () => { setter(value); renderer(); };
    container.appendChild(chip);
  });
}

// ============================================================
// MATERIAL FINDER
// ============================================================
function renderFinder() {
  // System chips
  buildChips(document.getElementById('finder-system-chips'),
    [['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],
    finderSystem, v => finderSystem = v, renderFinder);

  // Method chips
  buildChips(document.getElementById('finder-method-chips'),
    [['All','all'],['Ship','ship'],['FPS/Vehicle','surface']],
    finderMethod, v => finderMethod = v, renderFinder);

  // Refinery system chips
  buildChips(document.getElementById('finder-ref-chips'),
    [['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],
    finderRefSystem, v => finderRefSystem = v, renderFinder);

  // Ore checkboxes
  const oreListEl = document.getElementById('finder-ore-list');
  let oreHtml = '';
  const isSurface = m => ['roc_hand','hand','hand_vehicle','vehicle','fps','fps_vehicle'].includes(m);
  const ores = Object.entries(D.ores)
    .filter(([, o]) => o.form !== 'waste')
    .filter(([, o]) => {
      if (finderMethod === 'all') return true;
      if (finderMethod === 'ship') return o.mining_method === 'ship';
      if (finderMethod === 'surface') return isSurface(o.mining_method);
      return true;
    })
    .sort((a, b) => a[1].display_name.localeCompare(b[1].display_name));

  ores.forEach(([code, ore]) => {
    const checked = finderOres.has(code);
    oreHtml += `<div class="chip ${checked ? 'active' : ''}" data-ore="${code}" style="margin-bottom:2px">${miningTag(ore.mining_method)} ${ore.display_name}</div>`;
  });
  oreListEl.innerHTML = oreHtml;
  oreListEl.querySelectorAll('.chip[data-ore]').forEach(chip => {
    chip.onclick = () => {
      const code = chip.dataset.ore;
      if (finderOres.has(code)) finderOres.delete(code); else finderOres.add(code);
      renderFinder();
    };
  });

  renderFinderResults();
}

function renderFinderResults() {
  const el = document.getElementById('finder-results');
  inlineMapLoc = null; // close any open inline map
  if (finderOres.size === 0) {
    el.innerHTML = '<div class="card"><div class="card-title">Select one or more materials from the sidebar</div><div style="color:var(--text-secondary)">Click materials to find the best mining locations. Locations are ranked by scan confidence and probability combined.</div></div>';
    return;
  }

  const selectedOres = [...finderOres];
  const hasSurfaceOres = selectedOres.some(o => D.ores[o]?.form === 'gem');

  // Score each location — weighted by scans (confidence) AND probability
  const locationScores = [];

  // Search ship mining locations
  for (const [locCode, locData] of Object.entries(D.ore_locations)) {
    const loc = D.locations[locCode];
    if (!loc) continue;
    if (finderSystem !== 'all' && loc.system !== finderSystem) continue;

    const oreScores = {};
    let totalProb = 0;
    let found = 0;
    for (const ore of selectedOres) {
      const oreData = (locData.ores || {})[ore];
      if (oreData) {
        oreScores[ore] = oreData;
        totalProb += oreData.prob;
        found++;
      }
    }
    if (found === 0) continue;

    const avgProb = totalProb / selectedOres.length;
    const scans = locData.scans || 0;
    const confWeight = scans / (scans + 200);
    const weightedScore = avgProb * confWeight;

    locationScores.push({
      code: locCode, loc, oreScores, avgProb, found,
      scans, users: locData.users, weightedScore,
    });
  }

  // Also search ROC/hand mining locations for surface ores
  if (hasSurfaceOres) {
    for (const [locCode, locData] of Object.entries(D.roc_hand_mining || {})) {
      // Skip if already scored from ship mining
      if (locationScores.find(s => s.code === locCode)) continue;
      const loc = D.locations[locCode];
      if (!loc) continue;
      if (finderSystem !== 'all' && loc.system !== finderSystem) continue;

      const oreScores = {};
      let totalProb = 0;
      let found = 0;
      for (const ore of selectedOres) {
        const oreData = (locData.ores || {})[ore];
        if (oreData) {
          oreScores[ore] = oreData;
          totalProb += oreData.prob;
          found++;
        }
      }
      if (found === 0) continue;

      const avgProb = totalProb / selectedOres.length;
      const scans = locData.finds || 0;
      const confWeight = scans / (scans + 200);
      const weightedScore = avgProb * confWeight;

      locationScores.push({
        code: locCode, loc, oreScores, avgProb, found,
        scans, users: locData.users, weightedScore, isSurface: true,
      });
    }
  }

  // Sort by weighted score (scans * probability combined)
  locationScores.sort((a, b) => b.weightedScore - a.weightedScore);
  const top = locationScores.slice(0, 25);

  if (top.length === 0) {
    el.innerHTML = '<div class="card">No locations found for selected materials in this system.</div>';
    return;
  }

  let html = `<div class="section-title">// Top locations for ${selectedOres.map(oreName).join(' + ')} (${top.length} shown)</div>`;

  // Multi-material refinery insight
  // Find best refinery for first (primary) ore — that's where the player will likely go
  const primaryOre = selectedOres[0];
  const primaryRef = (() => {
    let best = null;
    for (const [name, station] of Object.entries(D.refineries.stations)) {
      if (finderRefSystem !== 'all' && station.system !== finderRefSystem) continue;
      const y = station.yields[primaryOre];
      if (y && y.value != null && (!best || y.value > best.value)) {
        best = {station: name, value: y.value, system: station.system};
      }
    }
    return best;
  })();

  html += '<div class="insight"><div class="insight-title">Best Refineries</div>';
  if (primaryRef) {
    // Show primary ore's best refinery
    html += `<div>${oreName(primaryOre)}: <span class="highlight">${primaryRef.station}</span> ${fmtYield(primaryRef.value)} (${primaryRef.system})</div>`;

    // For each additional ore, show: yield at primary refinery + their own best
    for (let i = 1; i < selectedOres.length; i++) {
      const ore = selectedOres[i];
      // Yield at primary refinery for this ore
      const primaryStation = D.refineries.stations[primaryRef.station];
      const yieldAtPrimary = primaryStation?.yields[ore]?.value;

      // This ore's own best refinery
      let ownBest = null;
      for (const [name, station] of Object.entries(D.refineries.stations)) {
        if (finderRefSystem !== 'all' && station.system !== finderRefSystem) continue;
        const y = station.yields[ore];
        if (y && y.value != null && (!ownBest || y.value > ownBest.value)) {
          ownBest = {station: name, value: y.value, system: station.system};
        }
      }

      let line = `<div>${oreName(ore)}: `;
      // Show yield at primary refinery first
      if (yieldAtPrimary != null) {
        line += `<span style="color:var(--text-secondary)">${primaryRef.station.split(' - ')[1] || primaryRef.station}</span> ${fmtYield(yieldAtPrimary)}`;
      } else {
        line += `<span style="color:var(--text-dim)">${primaryRef.station.split(' - ')[1] || primaryRef.station} \u2014</span>`;
      }
      // Then show own best if different
      if (ownBest && ownBest.station !== primaryRef.station) {
        const delta = ownBest.value - (yieldAtPrimary || 0);
        line += ` \u00a0\u2022\u00a0 Best: <span class="highlight">${ownBest.station}</span> ${fmtYield(ownBest.value)}`;
        if (delta > 0) line += ` <span style="color:var(--yellow)">(+${delta}% more)</span>`;
      }
      line += '</div>';
      html += line;
    }
  }
  html += '</div>';

  html += '<div class="tbl-wrap"><table><thead><tr><th>Location</th><th>System</th>';
  selectedOres.forEach(ore => { html += `<th>${oreName(ore)}</th>`; });
  html += '<th>Score</th><th>Scans</th><th>Also Found Here</th></tr></thead><tbody>';

  top.forEach(row => {
    html += `<tr>`;
    // Location cell: line 1 = map btn + name + signal, line 2 = refinery delta
    const refs = findRefineries(row.code, primaryOre);
    let locCell = `<div><span class="loc-map-btn" data-loc="${row.code}">\u{1F5FA}\uFE0F</span> ${locDisplayName(row.code)} ${signalIcon(row.code, selectedOres)}</div>`;
    if (refs.isBelt && refs.best) {
      const bShort = refs.best.name.split(' - ')[1] || refs.best.name;
      locCell += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">${bShort}</span> ${refs.best.yield != null ? fmtYield(refs.best.yield) : ''} <span class="tag tag-best" style="font-size:8px">BEST</span></div>`;
    } else if (refs.selfYield != null && refs.best) {
      // Location IS a refinery — show self yield + best if meaningfully better
      const bestDelta = refs.best.yield - refs.selfYield;
      if (bestDelta > 2) {
        const bShort = refs.best.name.split(' - ')[1] || refs.best.name;
        locCell += `<div class="delta-box"><span style="color:var(--text-dim)">Here</span> ${fmtYield(refs.selfYield)} <span class="delta-arrow">\u2192</span> <span style="color:var(--green)">${bShort}</span> ${fmtYield(refs.best.yield)} <span class="delta-gain">(+${bestDelta}%)</span></div>`;
      } else {
        locCell += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">Refine here</span> ${fmtYield(refs.selfYield)}</div>`;
      }
    } else if (refs.nearest && refs.best && refs.best.name !== refs.nearest.name && refs.nearest.yield != null && refs.best.yield != null && refs.best.yield - refs.nearest.yield > 2) {
      const delta = refs.best.yield - refs.nearest.yield;
      const nShort = refs.nearest.name.split(' - ')[1] || refs.nearest.name;
      const bShort = refs.best.name.split(' - ')[1] || refs.best.name;
      locCell += `<div class="delta-box"><span style="color:var(--text-dim)">${nShort}</span> ${fmtYield(refs.nearest.yield)} <span class="delta-arrow">\u2192</span> <span style="color:var(--green)">${bShort}</span> ${fmtYield(refs.best.yield)} <span class="delta-gain">(+${delta}%)</span></div>`;
    } else if (refs.nearest) {
      const nShort = refs.nearest.name.split(' - ')[1] || refs.nearest.name;
      if (refs.nearest.yield != null) {
        const isSameAsBest = !refs.best || refs.nearest.name === refs.best.name;
        locCell += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">${nShort}</span> ${fmtYield(refs.nearest.yield)}${isSameAsBest ? ' <span class="tag tag-best" style="font-size:8px">NEAREST+BEST</span>' : ''}</div>`;
      } else {
        locCell += `<div class="delta-box"><span style="color:var(--text-secondary)">${nShort}</span> <span style="font-size:10px;color:var(--text-dim)">nearest refinery</span></div>`;
      }
    }
    html += `<td>${locCell}</td>`;
    html += `<td>${systemTag(row.loc.system)}</td>`;
    selectedOres.forEach(ore => {
      const os = row.oreScores[ore];
      html += `<td>${os ? fmtProb(os.prob) : '<span class="mono v-na">\u2014</span>'}</td>`;
    });
    html += `<td class="mono" style="font-weight:700">${(row.weightedScore * 100).toFixed(0)}%</td>`;
    html += `<td>${fmtScans(row.scans)} ${confidence(row.scans)}</td>`;

    // Also found here — sorted by scan-weighted confidence (prob * scans), colored bottom border
    const allOres = getOreAt(row.code);
    const others = allOres
      .filter(o => !selectedOres.includes(o.code) && o.prob >= 0.10)
      .sort((a, b) => (b.prob * row.scans) - (a.prob * row.scans))
      .slice(0, 5);
    html += `<td><div class="also-list">${others.map(o => {
      return confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, row.scans);
    }).join('')}</div></td>`;
    html += `</tr>`;
  });

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ============================================================
// LOCATION EXPLORER
// ============================================================
function renderLocation() {
  buildChips(document.getElementById('loc-system-chips'),
    [['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],
    locSystem, v => locSystem = v, renderLocation);

  buildChips(document.getElementById('loc-type-chips'),
    [['All','all'],['Planet','planet'],['Moon','moon'],['Lagrange','lagrange'],['Belt','asteroid_belt'],['Cluster','cluster'],['Ring','ring'],['Mining Base','mining_base']],
    locType, v => locType = v, renderLocation);

  const search = (document.getElementById('loc-search').value || '').toLowerCase();

  const locs = Object.entries(D.locations)
    .filter(([code, loc]) => {
      if (locSystem !== 'all' && loc.system !== locSystem) return false;
      if (locType !== 'all' && loc.type !== locType) return false;
      if (search && !loc.display_name.toLowerCase().includes(search) && !code.toLowerCase().includes(search) && !locDisplayName(code).toLowerCase().includes(search)) return false;
      // Only hide mining bases when showing 'all' types and not searching
      if (!search && locType === 'all' && loc.type === 'mining_base') return false;
      return true;
    })
    .sort((a, b) => {
      const aScans = D.ore_locations[a[0]]?.scans || 0;
      const bScans = D.ore_locations[b[0]]?.scans || 0;
      return bScans - aScans;
    });

  let html = `<div class="section-title">// ${locs.length} Locations</div>`;
  html += '<div class="tbl-wrap"><table><thead><tr><th>Location</th><th>System</th><th>Type</th><th>Scans</th><th>Top Ores (sorted by confidence)</th><th>Refinery</th></tr></thead><tbody>';

  locs.slice(0, 60).forEach(([code, loc]) => {
    const locScans = D.ore_locations[code]?.scans || 0;
    // Sort ores by confidence-weighted score
    const ores = getOreAt(code)
      .map(o => ({...o, weight: o.prob * (locScans / (locScans + 200))}))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);
    const hasRef = loc.has_refinery;
    const conf = scanConf(locScans);

    html += `<tr>`;
    html += `<td>${locDisplayName(code)}</td>`;
    html += `<td>${systemTag(loc.system)}</td>`;
    html += `<td><span class="mono" style="font-size:11px">${loc.type.replace('_',' ')}</span></td>`;
    html += `<td>${fmtScans(locScans)} ${confidence(locScans)}</td>`;
    html += `<td><div class="also-list">${ores.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, locScans)).join('')}</div></td>`;
    html += `<td>${hasRef ? '<span class="tag tag-best">REFINERY</span>' : ''}</td>`;
    html += `</tr>`;
  });

  html += '</tbody></table></div>';
  if (locs.length > 60) html += `<div style="color:var(--text-dim);margin-top:8px;font-size:12px">Showing 60 of ${locs.length} — use filters to narrow</div>`;

  document.getElementById('loc-results').innerHTML = html;
}

// ============================================================
// REFINERY ADVISOR
// ============================================================
function renderRefinery() {
  // Ore select
  const sel = document.getElementById('ref-ore-select');
  if (sel.options.length <= 1) {
    const ores = Object.entries(D.ores)
      .filter(([, o]) => o.form !== 'waste' && o.form !== 'gem' && o.uex_name)
      .sort((a, b) => a[1].display_name.localeCompare(b[1].display_name));
    ores.forEach(([code, ore]) => {
      const opt = document.createElement('option');
      opt.value = code; opt.textContent = ore.display_name;
      sel.appendChild(opt);
    });
  }
  if (refOre) sel.value = refOre;

  buildChips(document.getElementById('ref-system-chips'),
    [['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],
    refSystem, v => refSystem = v, renderRefinery);

  const el = document.getElementById('ref-results');
  if (!refOre) {
    el.innerHTML = '<div class="card">Select a material to compare refinery yields across all stations.</div>';
    return;
  }

  // Get all stations with yield for this ore
  const stations = [];
  for (const [name, station] of Object.entries(D.refineries.stations)) {
    if (refSystem !== 'all' && station.system !== refSystem) continue;
    const y = station.yields[refOre];
    if (y && y.value != null) {
      stations.push({name, system: station.system, value: y.value,
                     week: y.value_week, month: y.value_month,
                     capacity: station.capacity_scu});
    }
  }
  stations.sort((a, b) => b.value - a.value);

  if (stations.length === 0) {
    el.innerHTML = '<div class="card">No refinery data for this material.</div>';
    return;
  }

  const best = stations[0];
  const worst = stations[stations.length - 1];
  const delta = best.value - worst.value;

  let html = `<div class="section-title">// ${oreName(refOre)} Refinery Yields (${stations.length} stations)</div>`;

  // Insight box
  if (delta > 3) {
    html += `<div class="insight"><div class="insight-title">Refinery Delta</div>`;
    html += `Best: <span class="highlight">${best.name}</span> at ${fmtYield(best.value)}`;
    html += ` vs Worst: <span class="warn">${worst.name}</span> at ${fmtYield(worst.value)}`;
    html += ` \u2014 <span class="highlight">${delta}% difference!</span></div>`;
  }

  html += '<div class="tbl-wrap"><table><thead><tr><th>Station</th><th>System</th><th>Yield</th><th>7d Avg</th><th>30d Avg</th><th>Capacity</th><th></th></tr></thead><tbody>';

  stations.forEach((s, i) => {
    const isBest = i === 0;
    const isWorst = i === stations.length - 1 && stations.length > 2;
    html += `<tr>`;
    html += `<td>${s.name}${isBest ? ' <span class="tag tag-best">BEST</span>' : ''}${isWorst ? ' <span class="tag tag-worst">WORST</span>' : ''}</td>`;
    html += `<td>${systemTag(s.system)}</td>`;
    html += `<td style="font-size:16px;font-weight:700">${fmtYield(s.value)}</td>`;
    html += `<td>${fmtYield(s.week)}</td>`;
    html += `<td>${fmtYield(s.month)}</td>`;
    html += `<td>${s.capacity ? `<span class="mono">${s.capacity.toLocaleString()} SCU</span>` : '<span class="mono v-na">\u2014</span>'}</td>`;
    html += `<td></td></tr>`;
  });

  html += '</tbody></table></div>';
  el.innerHTML = html;
}

// ============================================================
// REFINING METHODS
// ============================================================
function renderMethods() {
  const methods = D.refineries.methods || [];
  let html = '';
  methods.sort((a, b) => b.rating_yield - a.rating_yield);
  methods.forEach(m => {
    html += `<div class="method-card"><div class="method-name">${m.name}</div>`;
    html += `<div class="method-stat">Yield: ${renderPips(m.rating_yield, 3)}</div>`;
    html += `<div class="method-stat">Cost: ${renderPips(m.rating_cost, 3)}</div>`;
    html += `<div class="method-stat">Speed: ${renderPips(m.rating_speed, 3)}</div>`;
    html += `<div style="margin-top:6px;font-size:11px;color:var(--text-dim)">Code: ${m.code}</div>`;
    html += `</div>`;
  });
  document.getElementById('methods-grid').innerHTML = html;
}

function renderPips(value, max) {
  let html = '<span class="bar">';
  for (let i = 1; i <= max; i++) {
    html += `<span class="pip${i <= value ? ' on' : ''}"></span>`;
  }
  return html + '</span>';
}

// ============================================================
// SYSTEM MAP — shared drawing engine + popup
// ============================================================
let mapSystem = 'Stanton';
let mapHitAreas = []; // {x, y, r, code, type, data}

const MAP_COLORS = {
  star: '#f0c040', planet: '#4dc9f6', moon: '#8a9ab0',
  lagrange: '#e8751a', refinery: '#3dd68c', gate: '#9b7edb',
  orbitLine: 'rgba(77,201,246,0.15)', ring: 'rgba(232,117,26,0.35)',
  station: '#3dd68c', text: '#5a6270', textBright: '#dce0e8',
  highlight: '#ffffff', routeNearest: 'rgba(90,98,112,0.7)', routeBest: '#3dd68c',
};

/**
 * Draw a system map on any canvas. Returns {hitAreas, posMap}.
 * posMap: {locCode: {x, y}} for every drawn element (planets, L-points, gates, belts, stations, moons).
 * opts: {highlight: locCode, routes: [{fromCode, toCode, color, dashed, label}]}
 */
function drawSystemMap(canvas, system, opts = {}) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  const hitAreas = [];
  const posMap = {};

  const sysKey = system.toLowerCase();
  const positions = D.map_positions[sysKey] || {};
  const planets = D.planets || {};
  const gates = D.jump_gates || {};
  const locations = D.locations || {};

  let maxRing = 1;
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring > maxRing) maxRing = pos.ring;
  }
  const cfg = positions._config || {};
  const ringSpacing = (size * (cfg.ring_scale || 36) / 100) / (maxRing + 0.5);
  const edgeR = size * (cfg.edge_scale || 46) / 100;
  const s = v => Math.max(v, 2);

  const toXY = (angle, radius) => ({
    x: cx + Math.cos((angle - 90) * Math.PI / 180) * radius,
    y: cy + Math.sin((angle - 90) * Math.PI / 180) * radius,
  });

  // Helper: compute L-point XY from parent planet position
  function lpointXY(parentPos, lp) {
    const radius = getRingR(parentPos.ring);
    let lAngle, lRadius;
    if (lp === 1) { lAngle = parentPos.angle; lRadius = radius - ringSpacing * 0.3; }
    else if (lp === 2) { lAngle = parentPos.angle; lRadius = radius + ringSpacing * 0.3; }
    else if (lp === 3) { lAngle = parentPos.angle + 180; lRadius = radius; }
    else if (lp === 4) { lAngle = parentPos.angle - 60; lRadius = radius; }
    else if (lp === 5) { lAngle = parentPos.angle + 60; lRadius = radius; }
    else return null;
    return toXY(lAngle, lRadius);
  }

  // Helper: draw text with black outline for readability
  const drawLabel = (text, x, y, font, color, align) => {
    ctx.font = font;
    ctx.textAlign = align || 'center';
    ctx.strokeStyle = 'rgba(8,10,14,0.9)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  };

  // Build per-ring multipliers from positioned nodes
  const ringMults = {};
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring_mult && pos.ring_mult !== 1.0) {
      ringMults[pos.ring] = pos.ring_mult;
    }
  }
  const getRingR = (r) => r * (ringMults[r] || 1.0) * ringSpacing;

  // Orbit rings (using per-ring multipliers)
  for (let r = 1; r <= maxRing; r++) {
    ctx.beginPath(); ctx.arc(cx, cy, getRingR(r), 0, Math.PI * 2);
    ctx.strokeStyle = MAP_COLORS.orbitLine; ctx.lineWidth = 1; ctx.stroke();
  }

  // Star
  const starR = s(size * 0.016);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, starR * 4);
  grad.addColorStop(0, 'rgba(240,192,64,0.4)'); grad.addColorStop(1, 'rgba(240,192,64,0)');
  ctx.beginPath(); ctx.arc(cx, cy, starR * 4, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, starR, 0, Math.PI * 2); ctx.fillStyle = MAP_COLORS.star; ctx.fill();
  drawLabel(system.toUpperCase(), cx, cy + starR + 14, `700 ${s(size * 0.022)}px Rajdhani`, MAP_COLORS.textBright);

  // Belts
  for (const [code, loc] of Object.entries(locations)) {
    if (loc.system !== system) continue;
    if (loc.type === 'asteroid_belt') {
      const beltPos = positions[code];
      const beltRadius = beltPos?.belt_radius
        ? beltPos.belt_radius * ringSpacing
        : (maxRing * ringSpacing + edgeR) * 0.52;
      const beltColor = beltPos?.belt_color === 'grey' ? 'rgba(120,130,145,0.35)' : MAP_COLORS.ring;
      ctx.beginPath(); ctx.arc(cx, cy, beltRadius, 0, Math.PI * 2);
      ctx.strokeStyle = beltColor; ctx.lineWidth = size * 0.02; ctx.stroke();
      drawLabel(loc.display_name, cx, cy - beltRadius - 4, `500 ${s(size * 0.014)}px 'Share Tech Mono'`, beltColor);
      posMap[code] = {x: cx, y: cy - beltRadius};
      hitAreas.push({x: cx, y: cy - beltRadius, r: 14, code, type: 'belt', data: {
        name: loc.display_name, scans: D.ore_locations[code]?.scans || 0}});
    }
    if (loc.type === 'ring' && loc.parent) {
      const parentPos = positions[loc.parent];
      if (parentPos?.ring) {
        const pp = toXY(parentPos.angle, getRingR(parentPos.ring));
        ctx.beginPath(); ctx.arc(pp.x, pp.y, s(size * 0.03), 0, Math.PI * 2);
        ctx.strokeStyle = MAP_COLORS.ring; ctx.lineWidth = 2; ctx.stroke();
        posMap[code] = pp;
      }
    }
  }

  // Planets, stations, L-points, other positioned nodes
  for (const [code, pos] of Object.entries(positions)) {
    if (code === '_config') continue;
    if (pos.edge) continue;
    if (pos.belt_radius) continue; // belts drawn separately
    if (!pos.ring) continue; // safety: skip malformed entries
    const radius = getRingR(pos.ring);
    const {x, y} = toXY(pos.angle, radius);

    const loc = locations[code];
    const isGate = loc?.type === 'gate' || code.includes('GATE');

    if (isGate) {
      const gR = s(size * 0.008);
      const gateHasRef = loc?.has_refinery || Object.keys(D.refineries.stations).some(sn => sn.includes(loc?.display_name || code));
      ctx.beginPath(); ctx.arc(x, y, gR, 0, Math.PI * 2);
      ctx.strokeStyle = gateHasRef ? MAP_COLORS.refinery : MAP_COLORS.gate; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, gR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = gateHasRef ? MAP_COLORS.refinery : MAP_COLORS.gate; ctx.fill();
      drawLabel(loc?.display_name || code, x, y - gR - 4, `600 ${s(size * 0.013)}px Rajdhani`, gateHasRef ? MAP_COLORS.refinery : MAP_COLORS.gate);
      posMap[code] = {x, y};
      hitAreas.push({x, y, r: gR + 3, code, type: 'gate', data: {
        name: loc?.display_name || code, destination: '', refinery: gateHasRef, scans: D.ore_locations[code]?.scans || 0}});
      continue;
    }

    if (pos.station) {
      const stR = s(size * 0.008);
      const isRef = loc?.has_refinery;
      ctx.fillStyle = isRef ? MAP_COLORS.station : MAP_COLORS.lagrange;
      ctx.fillRect(x - stR, y - stR, stR * 2, stR * 2);
      drawLabel(loc?.display_name || code, x, y - stR - 3, `600 ${s(size * 0.014)}px Rajdhani`, isRef ? MAP_COLORS.station : MAP_COLORS.text);
      posMap[code] = {x, y};
      hitAreas.push({x, y, r: stR + 4, code, type: 'station', data: {
        name: loc?.display_name || code, refinery: isRef, scans: D.ore_locations[code]?.scans || 0}});
      continue;
    }

    const planet = planets[code];
    if (planet && planet.system !== system) continue;

    // Draw planet or generic positioned node
    const pR = s(size * (planet ? 0.018 : 0.012));
    ctx.beginPath(); ctx.arc(x, y, pR, 0, Math.PI * 2);
    ctx.fillStyle = planet ? MAP_COLORS.planet : MAP_COLORS.text; ctx.fill();
    posMap[code] = {x, y};

    // Moons (only for planets)
    const moons = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'moon');
    if (planet) {
      const moonR = s(size * 0.003);
      moons.forEach(([mcode], i) => {
        const mAngle = (i / Math.max(moons.length, 1)) * Math.PI * 2;
        const mDist = pR * 0.55;
        const mx = x + Math.cos(mAngle) * mDist;
        const my = y + Math.sin(mAngle) * mDist;
        ctx.beginPath(); ctx.arc(mx, my, moonR, 0, Math.PI * 2);
        ctx.fillStyle = MAP_COLORS.moon; ctx.fill();
        posMap[mcode] = {x: mx, y: my, parentXY: {x, y}};
      });
    }

    const label = planet?.name || locations[code]?.display_name || code;
    drawLabel(label, x, y - pR - 4, `600 ${s(size * 0.016)}px Rajdhani`, MAP_COLORS.textBright);
    if (moons.length > 0) {
      drawLabel(`${moons.length}m`, x, y + pR + 10, `500 ${s(size * 0.011)}px 'Share Tech Mono'`, MAP_COLORS.text);
    }

    const lpoints = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'lagrange');
    const childRings = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'ring');
    const childStations = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'station');
    hitAreas.push({x, y, r: pR + 3, code, type: planet ? 'planet' : 'node', data: {
      name: label, system, note: planet?.note || '',
      moons: moons.map(([c, l]) => ({code: c, name: l.display_name, scans: D.ore_locations[c]?.scans || 0})),
      lpoints: lpoints.map(([c, l]) => ({code: c, name: l.display_name, refinery: l.has_refinery})),
      rings: childRings.map(([c, l]) => ({code: c, name: l.display_name, scans: D.ore_locations[c]?.scans || 0})),
      stations: childStations.map(([c, l]) => ({name: l.display_name, refinery: l.has_refinery})),
      scans: D.ore_locations[code]?.scans || 0,
    }});

    // L-points
    const lpR = s(size * 0.006);
    lpoints.forEach(([lcode, lloc]) => {
      const lp = lloc.lpoint; if (!lp) return;
      const lpos = lpointXY(pos, lp);
      if (!lpos) return;
      const isRef = lloc.has_refinery;
      ctx.save(); ctx.translate(lpos.x, lpos.y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = isRef ? MAP_COLORS.refinery : MAP_COLORS.lagrange;
      ctx.fillRect(-lpR, -lpR, lpR * 2, lpR * 2); ctx.restore();
      drawLabel(lloc.display_name, lpos.x, lpos.y - lpR - 3, `600 ${s(size * 0.011)}px 'Share Tech Mono'`, isRef ? MAP_COLORS.refinery : MAP_COLORS.text);
      posMap[lcode] = lpos;
      hitAreas.push({x: lpos.x, y: lpos.y, r: lpR + 3, code: lcode, type: 'lagrange', data: {
        name: lloc.display_name, refinery: isRef, scans: D.ore_locations[lcode]?.scans || 0}});
    });
  }

  // Jump gates
  const gateR = s(size * 0.008);
  for (const [gkey, gate] of Object.entries(gates)) {
    if (gate.system !== system) continue;
    let posKey = null;
    for (const [pk, pv] of Object.entries(positions)) {
      if (pv.edge && pk.toLowerCase().includes(gate.destination.toLowerCase())) { posKey = pk; break; }
    }
    if (!posKey) continue;
    const gp = toXY(positions[posKey].angle, edgeR);
    // Check if this gateway has a refinery
    const gwRefinery = Object.keys(D.refineries.stations).some(sn =>
      sn.toLowerCase().includes(gate.name.toLowerCase()) ||
      sn.toLowerCase().includes(gate.destination.toLowerCase() + ' gateway'));
    const gwColor = gwRefinery ? MAP_COLORS.refinery : MAP_COLORS.gate;
    ctx.beginPath(); ctx.arc(gp.x, gp.y, gateR, 0, Math.PI * 2);
    ctx.strokeStyle = gwColor; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(gp.x, gp.y, gateR * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = gwColor; ctx.fill();
    drawLabel(`${gate.destination} GW`, gp.x, gp.y - gateR - 4, `600 ${s(size * 0.013)}px Rajdhani`, gwColor);
    // Map gate location codes too (gateway names in locations)
    const gwLocCode = Object.keys(locations).find(k => {
      const l = locations[k];
      return l.system === system && l.type === 'gate' && l.display_name?.toLowerCase().includes(gate.destination.toLowerCase());
    });
    if (gwLocCode) posMap[gwLocCode] = gp;
    const gwKey = `${gate.destination.toUpperCase()}_GATE`;
    posMap[gwKey] = gp;
    const gwScans = D.ore_locations[gwKey]?.scans || D.ore_locations[gwLocCode]?.scans || 0;
    hitAreas.push({x: gp.x, y: gp.y, r: gateR + 3, code: gwKey || gkey, type: 'gate', data: {
      name: gate.name, destination: gate.destination, refinery: gwRefinery, scans: gwScans}});
  }

  // ---- Resolve missing positions via parent chain ----
  for (const [code, loc] of Object.entries(locations)) {
    if (loc.system !== system || posMap[code]) continue;
    // Try parent planet
    if (loc.parent && posMap[loc.parent]) {
      posMap[code] = {...posMap[loc.parent]};
    }
    // Try region match — find a planet in the same region
    if (!posMap[code] && loc.region) {
      const regionBase = loc.region.split('_')[0];
      for (const [pk, pl] of Object.entries(planets)) {
        if (pl.system === system && posMap[pk] && pk.toLowerCase().startsWith(regionBase.slice(0, 3))) {
          posMap[code] = {...posMap[pk]};
          break;
        }
      }
    }
  }

  // ---- OVERLAY: highlight + routes ----
  if (opts.highlight && posMap[opts.highlight]) {
    const hp = posMap[opts.highlight];
    const hr = s(size * 0.04);
    // Glow ring
    ctx.beginPath(); ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2);
    ctx.strokeStyle = MAP_COLORS.highlight; ctx.lineWidth = 2.5; ctx.stroke();
    const hGrad = ctx.createRadialGradient(hp.x, hp.y, hr * 0.5, hp.x, hp.y, hr * 1.8);
    hGrad.addColorStop(0, 'rgba(255,255,255,0.15)'); hGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(hp.x, hp.y, hr * 1.8, 0, Math.PI * 2); ctx.fillStyle = hGrad; ctx.fill();
  }

  if (opts.routes) {
    for (const route of opts.routes) {
      const fromP = posMap[route.fromCode];
      const toP = posMap[route.toCode];
      if (!fromP || !toP) continue;
      ctx.beginPath();
      ctx.moveTo(fromP.x, fromP.y); ctx.lineTo(toP.x, toP.y);
      ctx.strokeStyle = route.color || MAP_COLORS.routeBest;
      ctx.lineWidth = route.dashed ? 1.5 : 2;
      if (route.dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.stroke(); ctx.setLineDash([]);
      // Midpoint label
      if (route.label) {
        const mx = (fromP.x + toP.x) / 2, my = (fromP.y + toP.y) / 2;
        ctx.font = `700 ${s(size * 0.018)}px 'Share Tech Mono'`;
        ctx.fillStyle = route.color || MAP_COLORS.routeBest;
        ctx.textAlign = 'center';
        // Background for readability
        const tw = ctx.measureText(route.label).width;
        ctx.fillStyle = 'rgba(8,10,14,0.85)';
        ctx.fillRect(mx - tw/2 - 4, my - 8, tw + 8, 16);
        ctx.fillStyle = route.color || MAP_COLORS.routeBest;
        ctx.fillText(route.label, mx, my + 4);
      }
    }
  }

  return {hitAreas, posMap};
}

// Resolve refinery station name → location code for map positioning
function refStationToLocCode(stationName) {
  // "Refinement Processing - CRU-L1" → "CRU-L1"
  // "Refinement Center - Checkmate" → "CHECKMATE"
  // "Refinement Processing - Pyro Gateway (Stanton)" → look for gate
  const after = stationName.split(' - ')[1] || stationName;
  // Direct location match
  for (const code of Object.keys(D.locations)) {
    if (code === after || D.locations[code].display_name === after) return code;
  }
  // Gateway pattern: "Pyro Gateway (Stanton)" → PYRO_GATE
  const gwMatch = after.match(/^(\w+)\s+Gateway/i);
  if (gwMatch) return gwMatch[1].toUpperCase() + '_GATE';
  // Uppercase match
  const upper = after.toUpperCase().replace(/\s+/g, '');
  for (const code of Object.keys(D.locations)) {
    if (code.toUpperCase().replace(/[-_\s]/g, '') === upper) return code;
  }
  return after;
}

// ---- Tab map wrapper ----
function renderMap() {
  const canvas = document.getElementById('map-canvas');
  const container = canvas.parentElement;
  const size = Math.min(container.clientWidth - 2, 1100);
  canvas.width = size; canvas.height = size;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';

  const result = drawSystemMap(canvas, mapSystem);
  mapHitAreas = result.hitAreas;
  renderMapSidebar();
}

// ---- Inline map for Material Finder (shows under clicked row) ----
let inlineMapLoc = null; // currently open location

function toggleInlineMap(locCode, selectedOres, clickedRow) {
  const existing = document.getElementById('finder-inline-map');

  // If clicking the same location, close it
  if (existing && inlineMapLoc === locCode) {
    existing.remove();
    inlineMapLoc = null;
    return;
  }

  // Remove any existing inline map
  if (existing) existing.remove();

  const loc = D.locations[locCode];
  if (!loc) return;
  const system = loc.system;
  const primaryOre = selectedOres[0];
  const refs = findRefineries(locCode, primaryOre);

  // Build routes + info panel
  const routes = [];
  const fmtRefLabel = (name, y) => {
    const short = name.split(' - ')[1] || name;
    return y != null ? `${short} ${y > 0 ? '+' : ''}${y}%` : short;
  };

  if (refs.isBelt && refs.best) {
    routes.push({fromCode: locCode, toCode: refs.best.code, color: MAP_COLORS.routeBest, dashed: false,
      label: fmtRefLabel(refs.best.name, refs.best.yield)});
  } else if (refs.selfYield != null) {
    // Location IS a refinery — only route to best if meaningfully better
    if (refs.best && refs.best.yield - refs.selfYield > 2) {
      routes.push({fromCode: locCode, toCode: refs.best.code, color: MAP_COLORS.routeBest, dashed: false,
        label: fmtRefLabel(refs.best.name, refs.best.yield)});
    }
  } else if (refs.nearest) {
    // Normal location
    const yieldDelta = (refs.best?.yield ?? 0) - (refs.nearest?.yield ?? 0);
    if (refs.best && refs.nearest.name !== refs.best.name && yieldDelta > 2) {
      routes.push({fromCode: locCode, toCode: refs.nearest.code, color: MAP_COLORS.routeNearest, dashed: true,
        label: fmtRefLabel(refs.nearest.name, refs.nearest.yield)});
      routes.push({fromCode: locCode, toCode: refs.best.code, color: MAP_COLORS.routeBest, dashed: false,
        label: fmtRefLabel(refs.best.name, refs.best.yield)});
    } else {
      const c = (refs.nearest.yield != null) ? MAP_COLORS.routeBest : MAP_COLORS.routeNearest;
      routes.push({fromCode: locCode, toCode: refs.nearest.code, color: c, dashed: refs.nearest.yield == null,
        label: fmtRefLabel(refs.nearest.name, refs.nearest.yield)});
    }
  }

  // Count columns for colspan
  const colCount = clickedRow.cells.length;

  // Build info HTML
  let info = `<div class="sig-tt-title" style="font-size:10px">${locFullLabel(locCode)}</div>`;
  const oreData = D.ore_locations[locCode]?.ores || {};
  const rocData = D.roc_hand_mining[locCode]?.ores || {};
  info += '<div style="margin:6px 0 8px">';
  for (const ore of selectedOres) {
    const od = oreData[ore] || rocData[ore];
    if (od) {
      const pct = (od.prob * 100).toFixed(0);
      const cls = od.prob >= 0.50 ? 'v-pos' : od.prob >= 0.20 ? 'v-warn' : 'v-neg';
      info += `<div style="margin-bottom:2px">${miningTag(D.ores[ore]?.mining_method || 'ship')} <strong>${oreName(ore)}</strong> <span class="mono ${cls}">${pct}%</span>`;
      if (od.medPct != null) info += ` <span class="mono" style="font-size:11px;color:var(--text-dim)">med ${(od.medPct*100).toFixed(1)}%</span>`;
      info += '</div>';
    }
  }
  info += '</div>';

  if (refs.isBelt && refs.best) {
    info += '<div class="sig-tt-title" style="font-size:9px;margin-top:6px">Refinery</div>';
    const bShort = refs.best.name.split(' - ')[1] || refs.best.name;
    info += `<div style="margin-bottom:2px"><span style="color:var(--green)">\u25CF</span> <strong>${bShort}</strong> ${refs.best.yield != null ? fmtYield(refs.best.yield) : ''} <span class="tag tag-best" style="font-size:8px">BEST</span></div>`;
  } else if (refs.selfYield != null) {
    info += '<div class="sig-tt-title" style="font-size:9px;margin-top:6px">Refinery</div>';
    info += `<div style="margin-bottom:2px"><span style="color:var(--green)">\u25CF</span> <strong>Refine here</strong> ${fmtYield(refs.selfYield)}</div>`;
    if (refs.best && refs.best.yield - refs.selfYield > 2) {
      const delta = refs.best.yield - refs.selfYield;
      info += `<div style="margin-bottom:2px"><span style="color:var(--green)">\u25CF</span> <strong>${refs.best.name.split(' - ')[1] || refs.best.name}</strong> ${fmtYield(refs.best.yield)} <span style="font-size:10px;color:var(--green)">best</span> <span class="delta-gain" style="font-size:11px">(+${delta}% more)</span></div>`;
    }
  } else if (refs.nearest) {
    info += '<div class="sig-tt-title" style="font-size:9px;margin-top:6px">Refinery Route</div>';
    const nShort = refs.nearest.name.split(' - ')[1] || refs.nearest.name;
    const isSameAsBest = !refs.best || refs.nearest.name === refs.best.name;
    if (isSameAsBest) {
      info += `<div style="margin-bottom:2px"><span style="color:var(--green)">\u25CF</span> <strong>${nShort}</strong> ${refs.nearest.yield != null ? fmtYield(refs.nearest.yield) : ''} <span class="tag tag-best" style="font-size:8px">NEAREST+BEST</span></div>`;
    } else {
      info += `<div style="margin-bottom:2px"><span style="color:var(--text-dim)">\u25CF</span> <strong>${nShort}</strong> ${refs.nearest.yield != null ? fmtYield(refs.nearest.yield) : ''} <span style="font-size:10px;color:var(--text-dim)">nearest</span></div>`;
      if (refs.best) {
        const delta = (refs.nearest.yield != null && refs.best.yield != null) ? refs.best.yield - refs.nearest.yield : 0;
        info += `<div style="margin-bottom:2px"><span style="color:var(--green)">\u25CF</span> <strong>${refs.best.name.split(' - ')[1] || refs.best.name}</strong> ${fmtYield(refs.best.yield)} <span style="font-size:10px;color:var(--green)">best</span>`;
        if (delta > 0) info += ` <span class="delta-gain" style="font-size:11px">(+${delta}% more)</span>`;
        info += '</div>';
      }
    }
  }
  if (routes.length) info += `<div style="margin-top:6px;font-size:10px;color:var(--text-dim)"><span style="color:var(--text-dim)">---</span> nearest \u00a0 <span style="color:var(--green)">\u2582</span> best yield</div>`;

  // Create the inline row
  const tr = document.createElement('tr');
  tr.id = 'finder-inline-map';
  const td = document.createElement('td');
  td.colSpan = colCount;
  td.style.cssText = 'padding:0; border:1px solid var(--border)';
  td.innerHTML = `<div class="inline-map-layout">
    <div class="inline-map-canvas-wrap"><canvas id="inline-map-canvas"></canvas></div>
    <div class="inline-map-info">${info}</div>
  </div>`;
  tr.appendChild(td);
  clickedRow.after(tr);

  // Draw the map (square, fitting available width)
  const canvas = document.getElementById('inline-map-canvas');
  const wrapWidth = td.clientWidth;
  const mapSize = Math.min(880, Math.floor(wrapWidth * 0.6));
  canvas.width = mapSize; canvas.height = mapSize;
  canvas.style.width = mapSize + 'px'; canvas.style.height = mapSize + 'px';
  drawSystemMap(canvas, system, {highlight: locCode, routes});

  inlineMapLoc = locCode;
}

function renderMapSidebar() {
  const el = document.getElementById('map-system-info');
  // Count locations and top ores for this system
  let locCount = 0, totalScans = 0;
  const oreTotals = {};
  for (const [code, loc] of Object.entries(D.locations)) {
    if (loc.system !== mapSystem) continue;
    locCount++;
    const ld = D.ore_locations[code];
    if (!ld) continue;
    totalScans += ld.scans || 0;
    for (const [ore, stats] of Object.entries(ld.ores || {})) {
      if (ore === 'INERTMATERIAL') continue;
      if (!oreTotals[ore]) oreTotals[ore] = {prob: 0, count: 0};
      oreTotals[ore].prob += stats.prob; oreTotals[ore].count++;
    }
  }
  const topOres = Object.entries(oreTotals)
    .map(([code, t]) => ({code, avgProb: t.prob / t.count}))
    .sort((a, b) => b.avgProb - a.avgProb).slice(0, 8);

  let html = `<div class="map-info-title">// ${mapSystem} System</div>`;
  html += `<div style="font-family:'Share Tech Mono';font-size:11px;color:var(--text-secondary);margin-bottom:6px">${locCount} locations | ${totalScans.toLocaleString()} total scans</div>`;
  html += `<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Most common ores:</div>`;
  topOres.forEach(o => {
    const avgScans = Math.round(totalScans / Math.max(locCount, 1));
    html += `<div style="font-family:'Share Tech Mono';font-size:11px;margin-bottom:2px">${confChip(`${oreName(o.code)} avg ${(o.avgProb*100).toFixed(0)}%`, avgScans)}</div>`;
  });
  el.innerHTML = html;
}

// Map tooltip
function initMapEvents() {
  const canvas = document.getElementById('map-canvas');
  const tooltip = document.getElementById('map-tooltip');

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sx = mx * (canvas.width / rect.width), sy = my * (canvas.height / rect.height);

    let hit = null;
    for (const area of mapHitAreas) {
      const dx = sx - area.x, dy = sy - area.y;
      if (dx*dx + dy*dy <= (area.r+2)*(area.r+2)) { hit = area; break; }
    }

    if (hit) {
      let html = '';
      if (hit.type === 'planet') {
        const d = hit.data;
        html = `<div class="tt-title">${d.name}</div>`;
        if (d.note) html += `<div class="tt-sub">${d.note}</div>`;
        // Planet's own ores
        const planetOres = getOreAt(hit.code).slice(0, 5);
        if (planetOres.length) {
          html += `<div class="tt-row">${d.scans} scans</div>`;
          html += `<div class="also-list" style="margin:3px 0">${planetOres.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, d.scans)).join('')}</div>`;
        } else if (d.scans) {
          html += `<div class="tt-row">Surface scans: ${d.scans}</div>`;
        }
        if (d.moons.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">Moons:</div>`;
          d.moons.forEach(m => {
            const ores = getOreAt(m.code).slice(0, 3);
            html += `<div class="tt-row">${m.name} <span style="color:var(--text-dim)">${m.scans}sc</span></div>`;
            if (ores.length) html += `<div class="also-list">${ores.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, m.scans)).join('')}</div>`;
            const moonRings = Object.entries(D.locations).filter(([, l]) => l.parent === m.code && l.type === 'ring');
            moonRings.forEach(([rc, rl]) => {
              const rScans = D.ore_locations[rc]?.scans || 0;
              if (!rScans) return;
              const rOres = getOreAt(rc).slice(0, 3);
              html += `<div class="tt-row" style="padding-left:8px;color:var(--accent-bright)">\u2022 ${rl.display_name} <span style="color:var(--text-dim)">${rScans}sc</span></div>`;
              if (rOres.length) html += `<div class="also-list" style="padding-left:8px">${rOres.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, rScans)).join('')}</div>`;
            });
          });
        }
        if (d.rings?.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">Rings:</div>`;
          d.rings.forEach(r => {
            if (!r.scans) return;
            const ores = getOreAt(r.code).slice(0, 3);
            html += `<div class="tt-row" style="margin-top:3px">${r.name} <span style="color:var(--text-dim)">${r.scans}sc</span></div>`;
            if (ores.length) html += `<div class="also-list">${ores.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, r.scans)).join('')}</div>`;
          });
        }
        if (d.lpoints.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">L-Points:</div>`;
          d.lpoints.forEach(l => { html += `<div class="tt-row">${l.name}${l.refinery ? ' <span style="color:#3dd68c">REFINERY</span>' : ''}</div>`; });
        }
        if (d.stations.length) {
          d.stations.forEach(s => { html += `<div class="tt-row">${s.name}${s.refinery ? ' <span style="color:#3dd68c">REFINERY</span>' : ''}</div>`; });
        }
      } else if (hit.type === 'lagrange' || hit.type === 'station') {
        html = `<div class="tt-title">${hit.data.name}</div>`;
        if (hit.data.refinery) html += `<div class="tt-row" style="color:#3dd68c">Refinery</div>`;
        if (hit.data.scans) html += `<div class="tt-row">Scans: ${hit.data.scans}</div>`;
        const ores = getOreAt(hit.code).slice(0, 5);
        if (ores.length) html += `<div class="also-list" style="margin-top:4px">${ores.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, hit.data.scans)).join('')}</div>`;
      } else if (hit.type === 'gate') {
        html = `<div class="tt-title">${hit.data.name}</div>`;
        if (hit.data.destination) html += `<div class="tt-row">Jump to ${hit.data.destination}</div>`;
        if (hit.data.refinery) html += `<div class="tt-row" style="color:#3dd68c">Refinery</div>`;
        if (hit.data.scans) html += `<div class="tt-row">Scans: ${hit.data.scans}</div>`;
        const gateOres = getOreAt(hit.code).slice(0, 5);
        if (gateOres.length) html += `<div class="also-list" style="margin-top:4px">${gateOres.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, hit.data.scans)).join('')}</div>`;
      } else if (hit.type === 'belt' || hit.type === 'node') {
        html = `<div class="tt-title">${hit.data.name}</div><div class="tt-row">Scans: ${hit.data.scans}</div>`;
        const ores = getOreAt(hit.code).slice(0, 5);
        if (ores.length) html += `<div class="also-list" style="margin-top:4px">${ores.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, hit.data.scans)).join('')}</div>`;
      }

      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(mx + 12, canvas.parentElement.clientWidth - 310) + 'px';
      tooltip.style.top = (my - 10) + 'px';
      canvas.style.cursor = 'pointer';
    } else {
      tooltip.style.display = 'none';
      canvas.style.cursor = 'crosshair';
    }
  });

  canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

  document.getElementById('map-tabs').addEventListener('click', e => {
    const sys = e.target.dataset.sys;
    if (!sys) return;
    mapSystem = sys;
    document.querySelectorAll('.map-tab').forEach(t => t.classList.toggle('active', t.dataset.sys === sys));
    renderMap();
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('panel-map').classList.contains('active')) renderMap();
  });
}

// ============================================================
// INVENTORY — per-location batch tracking with collection export
// ============================================================
const INV_KEY = 'schub_mining_inventory';
let inventory = []; // [{id, ore, quantity_scu, type, quality, location, date_added}]
let invView = 'ore';
let invNextId = 1;
let invEditId = null; // currently editing
let invShowCollected = false; // show collected tab

function loadInventory() {
  try {
    const raw = localStorage.getItem(INV_KEY);
    if (raw) {
      inventory = JSON.parse(raw);
      invNextId = Math.max(1, ...inventory.map(e => parseInt(e.id?.replace('inv_','') || '0'))) + 1;
    }
  } catch(e) { inventory = []; }
}

function saveInventory() {
  // Merge identical entries (same ore + type + quality + location)
  const merged = [];
  const keys = {};
  inventory.forEach(e => {
    const k = `${e.ore}|${e.type}|${e.quality}|${e.location}`;
    if (keys[k] !== undefined) {
      merged[keys[k]].quantity_scu += e.quantity_scu;
    } else {
      keys[k] = merged.length;
      merged.push({...e});
    }
  });
  inventory = merged;
  localStorage.setItem(INV_KEY, JSON.stringify(inventory));
}

function setInvView(view) {
  invView = view;
  document.getElementById('inv-view-ore').classList.toggle('active', view === 'ore');
  document.getElementById('inv-view-loc').classList.toggle('active', view === 'location');
  document.getElementById('inv-view-collected').classList.toggle('active', view === 'collected');
  renderInventory();
}

function collectEntry(id) {
  const entry = inventory.find(e => e.id === id);
  if (!entry) return;
  entry.collected = true;
  entry.collected_date = new Date().toISOString().split('T')[0];
  saveInventory();
  renderInventory();
}

function uncollectEntry(id) {
  const entry = inventory.find(e => e.id === id);
  if (!entry) return;
  delete entry.collected;
  delete entry.collected_date;
  saveInventory();
  renderInventory();
}

function collectAllSelected() {
  const items = getCollectItems();
  items.forEach(ci => {
    const entry = inventory.find(e => e.id === ci.id);
    if (!entry) return;
    if (ci.collect_scu >= entry.quantity_scu) {
      // Collect entire entry
      entry.collected = true;
      entry.collected_date = new Date().toISOString().split('T')[0];
    } else {
      // Split: reduce original, create collected copy
      entry.quantity_scu -= ci.collect_scu;
      inventory.push({
        id: 'inv_' + (invNextId++),
        ore: entry.ore, quantity_scu: ci.collect_scu, type: entry.type,
        quality: entry.quality, location: entry.location,
        date_added: entry.date_added, collected: true,
        collected_date: new Date().toISOString().split('T')[0],
      });
    }
  });
  saveInventory();
  renderInventory();
}

function setCollectAll() {
  document.querySelectorAll('.inv-collect').forEach(input => {
    input.value = input.max;
  });
  updateCollectSummary();
}

function showAddEntry() {
  const form = document.getElementById('inv-add-form');
  if (form.style.display !== 'none' && !invEditId) { form.style.display = 'none'; return; }
  invEditId = null;
  renderAddForm();
}

function renderAddForm(defaults) {
  const form = document.getElementById('inv-add-form');
  const d = defaults || {};
  const oreOpts = Object.entries(D.ores)
    .filter(([,o]) => o.form !== 'waste')
    .sort((a,b) => a[1].display_name.localeCompare(b[1].display_name))
    .map(([code, o]) => `<option value="${code}" ${code===d.ore?'selected':''}>${o.display_name}</option>`).join('');

  const locOpts = ['cargo', ...Object.keys(D.locations).filter(k => {
    const l = D.locations[k]; return l.has_refinery || l.type === 'station';
  }).sort()].map(l => `<option value="${l}" ${l===d.location?'selected':''}>${l === 'cargo' ? 'In Cargo' : locName(l)}</option>`).join('');

  const isEdit = !!invEditId;
  form.innerHTML = `<div class="inv-form">
    <div class="inv-form-row"><label>Ore</label><select id="inv-f-ore" style="width:180px">${oreOpts}</select></div>
    <div class="inv-form-row"><label>Quantity</label><input type="number" id="inv-f-qty" value="${d.quantity_scu||1}" min="0.01" step="0.1"> <span style="color:var(--text-dim)">SCU</span></div>
    <div class="inv-form-row"><label>Type</label>
      <select id="inv-f-type"><option value="raw_ore" ${d.type==='raw_ore'?'selected':''}>Raw Ore</option><option value="refining" ${d.type==='refining'?'selected':''}>Refining</option><option value="refined" ${d.type==='refined'?'selected':''}>Refined</option></select>
    </div>
    <div class="inv-form-row"><label>Quality</label><input type="number" id="inv-f-quality" value="${d.quality||0}" min="0" max="1000" step="1"> <span style="color:var(--text-dim)">0-1000</span></div>
    <div class="inv-form-row"><label>Location</label><select id="inv-f-loc" style="width:180px">${locOpts}</select></div>
    <div class="inv-form-row"><label></label>
      <button class="chip green" onclick="${isEdit ? 'saveEdit()' : 'addEntry()' }">${isEdit ? 'Save' : 'Add'}</button>
      <button class="chip" onclick="invEditId=null;document.getElementById('inv-add-form').style.display='none'">Cancel</button>
    </div>
  </div>`;
  form.style.display = 'block';
}

function addEntry() {
  const ore = document.getElementById('inv-f-ore').value;
  const qty = parseFloat(document.getElementById('inv-f-qty').value) || 0;
  const type = document.getElementById('inv-f-type').value;
  const quality = parseInt(document.getElementById('inv-f-quality').value) || 0;
  const location = document.getElementById('inv-f-loc').value;
  if (!ore || qty <= 0) return;
  inventory.push({
    id: 'inv_' + (invNextId++), ore, quantity_scu: qty, type, quality,
    location, date_added: new Date().toISOString().split('T')[0],
  });
  saveInventory();
  document.getElementById('inv-add-form').style.display = 'none';
  renderInventory();
}

function editEntry(id) {
  const entry = inventory.find(e => e.id === id);
  if (!entry) return;
  invEditId = id;
  renderAddForm(entry);
}

function saveEdit() {
  const idx = inventory.findIndex(e => e.id === invEditId);
  if (idx === -1) return;
  inventory[idx].ore = document.getElementById('inv-f-ore').value;
  inventory[idx].quantity_scu = parseFloat(document.getElementById('inv-f-qty').value) || 0;
  inventory[idx].type = document.getElementById('inv-f-type').value;
  inventory[idx].quality = parseInt(document.getElementById('inv-f-quality').value) || 0;
  inventory[idx].location = document.getElementById('inv-f-loc').value;
  invEditId = null;
  saveInventory();
  document.getElementById('inv-add-form').style.display = 'none';
  renderInventory();
}

function removeEntry(id) {
  inventory = inventory.filter(e => e.id !== id);
  saveInventory();
  renderInventory();
}

function clearInventory() {
  if (!confirm('Clear all inventory entries?')) return;
  inventory = []; saveInventory(); renderInventory();
}

function typeTag(t) {
  if (t === 'refined') return '<span class="tag tag-best">REFINED</span>';
  if (t === 'refining') return '<span class="tag" style="background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(240,192,64,0.25)">REFINING</span>';
  return '<span class="tag tag-worst">RAW ORE</span>';
}

function collectCell(e) {
  return `<div style="display:flex;align-items:center;gap:2px">
    <button class="inv-row-actions" style="border:0" onclick="adjCollect('${e.id}',-1)">-</button>
    <input type="number" class="inv-collect" data-id="${e.id}" value="0" min="0" max="${e.quantity_scu}" step="0.1" onchange="updateCollectSummary()">
    <button class="inv-row-actions" style="border:0" onclick="adjCollect('${e.id}',1)">+</button>
    <button style="background:none;border:1px solid var(--border);color:var(--text-dim);font-size:9px;padding:1px 4px;cursor:pointer;font-family:'Share Tech Mono'" onclick="maxCollect('${e.id}')">All</button>
  </div>`;
}

function adjCollect(id, delta) {
  const input = document.querySelector(`.inv-collect[data-id='${id}']`);
  if (!input) return;
  let val = (parseFloat(input.value) || 0) + delta;
  val = Math.max(0, Math.min(parseFloat(input.max), val));
  input.value = val.toFixed(1);
  updateCollectSummary();
}

function maxCollect(id) {
  const input = document.querySelector(`.inv-collect[data-id='${id}']`);
  if (!input) return;
  input.value = input.max;
  updateCollectSummary();
}

function renderInventory() {
  const tableEl = document.getElementById('inv-table');
  const summaryEl = document.getElementById('inv-summary');
  const collectEl = document.getElementById('inv-collect-summary');

  const active = inventory.filter(e => !e.collected);
  const collected = inventory.filter(e => e.collected);

  if (invView === 'collected') {
    // Collected tab
    if (collected.length === 0) {
      tableEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-secondary);padding:30px">No collected items yet. Use the Collect column in By Ore or By Location view to mark items as collected.</div>';
    } else {
      let html = '<table><thead><tr><th>Ore</th><th>Qty</th><th>Type</th><th>Quality</th><th>Location</th><th>Collected</th><th></th></tr></thead><tbody>';
      collected.forEach(e => {
        html += `<tr style="opacity:0.7">
          <td>${miningTag(D.ores[e.ore]?.mining_method || 'ship')} ${oreName(e.ore)}</td>
          <td class="mono">${e.quantity_scu} SCU</td>
          <td>${typeTag(e.type)}</td>
          <td class="mono">${e.quality || 0}</td>
          <td>${e.location === 'cargo' ? 'In Cargo' : locName(e.location)}</td>
          <td class="mono" style="color:var(--text-dim)">${e.collected_date || ''}</td>
          <td><div class="inv-row-actions"><button onclick="uncollectEntry('${e.id}')">Undo</button><button class="del" onclick="removeEntry('${e.id}')">X</button></div></td>
        </tr>`;
      });
      html += '</tbody></table>';
      tableEl.innerHTML = html;
    }
    summaryEl.innerHTML = '';
    collectEl.innerHTML = `<div style="font-size:11px;color:var(--text-dim)">${collected.length} collected entries</div>`;
    return;
  }

  if (active.length === 0) {
    tableEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-secondary);padding:30px">No inventory entries yet. Click <strong>+ Add Entry</strong> to start tracking.</div>';
    summaryEl.innerHTML = ''; collectEl.innerHTML = '';
    return;
  }

  let html = '';
  if (invView === 'ore') {
    const groups = {};
    active.forEach(e => { if (!groups[e.ore]) groups[e.ore] = []; groups[e.ore].push(e); });

    for (const [ore, entries] of Object.entries(groups).sort((a,b) => oreName(a[0]).localeCompare(oreName(b[0])))) {
      const total = entries.reduce((s, e) => s + e.quantity_scu, 0);
      html += `<div class="inv-group-header">${miningTag(D.ores[ore]?.mining_method || 'ship')} ${oreName(ore)} <span class="total">${total.toFixed(1)} SCU</span></div>`;
      html += '<table><thead><tr><th>Qty</th><th>Type</th><th>Quality</th><th>Location</th><th>Collect</th><th></th></tr></thead><tbody>';
      entries.forEach(e => {
        html += `<tr>
          <td class="mono" style="font-weight:700">${e.quantity_scu} SCU</td>
          <td>${typeTag(e.type)}</td>
          <td class="mono">${e.quality || 0}</td>
          <td>${e.location === 'cargo' ? 'In Cargo' : locName(e.location)}</td>
          <td>${collectCell(e)}</td>
          <td><div class="inv-row-actions"><button onclick="editEntry('${e.id}')">Edit</button><button onclick="collectEntry('${e.id}')" style="color:var(--green)">Collected</button><button class="del" onclick="removeEntry('${e.id}')">X</button></div></td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
  } else {
    const groups = {};
    active.forEach(e => { const loc = e.location || 'unknown'; if (!groups[loc]) groups[loc] = []; groups[loc].push(e); });

    for (const [loc, entries] of Object.entries(groups).sort()) {
      const total = entries.reduce((s, e) => s + e.quantity_scu, 0);
      html += `<div class="inv-group-header">${loc === 'cargo' ? 'In Cargo' : locName(loc)} <span class="total">${total.toFixed(1)} SCU</span></div>`;
      html += '<table><thead><tr><th>Ore</th><th>Qty</th><th>Type</th><th>Quality</th><th>Collect</th><th></th></tr></thead><tbody>';
      entries.forEach(e => {
        html += `<tr>
          <td>${miningTag(D.ores[e.ore]?.mining_method || 'ship')} ${oreName(e.ore)}</td>
          <td class="mono" style="font-weight:700">${e.quantity_scu} SCU</td>
          <td>${typeTag(e.type)}</td>
          <td class="mono">${e.quality || 0}</td>
          <td>${collectCell(e)}</td>
          <td><div class="inv-row-actions"><button onclick="editEntry('${e.id}')">Edit</button><button onclick="collectEntry('${e.id}')" style="color:var(--green)">Collected</button><button class="del" onclick="removeEntry('${e.id}')">X</button></div></td>
        </tr>`;
      });
      html += '</tbody></table>';
    }
  }
  tableEl.innerHTML = html;

  // Summary sidebar
  const oreTotals = {};
  let grandTotal = 0;
  active.forEach(e => {
    if (!oreTotals[e.ore]) oreTotals[e.ore] = {raw: 0, refining: 0, refined: 0};
    oreTotals[e.ore][e.type === 'raw_ore' ? 'raw' : e.type] = (oreTotals[e.ore][e.type === 'raw_ore' ? 'raw' : e.type] || 0) + e.quantity_scu;
    grandTotal += e.quantity_scu;
  });
  let sumHtml = `<div class="map-info-title">// Summary</div>`;
  sumHtml += `<div style="font-family:'Share Tech Mono';font-size:12px;color:var(--accent);margin-bottom:6px">${active.length} active | ${collected.length} collected | ${grandTotal.toFixed(1)} SCU</div>`;
  for (const [ore, t] of Object.entries(oreTotals).sort((a,b) => oreName(a[0]).localeCompare(oreName(b[0])))) {
    const total = t.raw + t.refining + t.refined;
    let detail = [];
    if (t.refined > 0) detail.push(`<span class="v-pos">${t.refined.toFixed(1)}r</span>`);
    if (t.refining > 0) detail.push(`<span class="v-warn">${t.refining.toFixed(1)}ing</span>`);
    if (t.raw > 0) detail.push(`<span class="v-neg">${t.raw.toFixed(1)}raw</span>`);
    sumHtml += `<div style="font-size:12px;margin-bottom:2px"><strong>${oreName(ore)}</strong> <span class="mono">${total.toFixed(1)}</span> ${detail.join(' ')}</div>`;
  }
  summaryEl.innerHTML = sumHtml;
  updateCollectSummary();
}

function getCollectItems() {
  const items = [];
  document.querySelectorAll('.inv-collect').forEach(input => {
    const val = parseFloat(input.value) || 0;
    if (val > 0) {
      const entry = inventory.find(e => e.id === input.dataset.id);
      if (entry) items.push({...entry, collect_scu: val});
    }
  });
  return items;
}

function updateCollectSummary() {
  const items = getCollectItems();
  const el = document.getElementById('inv-collect-summary');
  if (items.length === 0) {
    el.innerHTML = `<div style="color:var(--text-dim);font-size:11px">Use -/+/All in Collect column, then export.</div>
      <button class="chip" onclick="setCollectAll()" style="margin-top:4px;width:100%;text-align:center;font-size:11px">Select All for Collection</button>
      <button class="chip" onclick="collectAllSelected()" style="margin-top:4px;width:100%;text-align:center;font-size:11px;color:var(--green)">Mark Selected as Collected</button>`;
    return;
  }
  const total = items.reduce((s, i) => s + i.collect_scu, 0);
  el.innerHTML = `<div style="font-family:'Share Tech Mono';font-size:12px;color:var(--green);margin-bottom:6px">${items.length} items | ${total.toFixed(1)} SCU selected</div>
    <button class="chip" onclick="setCollectAll()" style="width:100%;text-align:center;font-size:11px">Select All</button>
    <button class="chip" onclick="collectAllSelected()" style="margin-top:4px;width:100%;text-align:center;font-size:11px;color:var(--green)">Mark Selected as Collected</button>`;
}

// ============================================================
// EXPORTS — Collection contracts
// ============================================================
function showExport(text) {
  document.getElementById('inv-export-text').value = text;
  document.getElementById('inv-export-output').style.display = 'block';
}
function copyExport() { document.getElementById('inv-export-text').select(); document.execCommand('copy'); }

function exportCollectionText() {
  const items = getCollectItems();
  if (items.length === 0) { showExport('No items selected for collection.\nSet amounts in the Collect column first.'); return; }

  let text = '\u2550\u2550\u2550 COLLECTION CONTRACT \u2550\u2550\u2550\n';
  text += `Date: ${new Date().toISOString().split('T')[0]}\n\n`;

  // Group by location
  const byLoc = {};
  items.forEach(i => {
    const loc = i.location === 'cargo' ? 'In Cargo' : locName(i.location);
    if (!byLoc[loc]) byLoc[loc] = [];
    byLoc[loc].push(i);
  });

  text += 'PICKUP LOCATIONS:\n';
  for (const [loc, entries] of Object.entries(byLoc)) {
    const locTotal = entries.reduce((s, e) => s + e.collect_scu, 0);
    text += `\n  ${loc} (${locTotal.toFixed(1)} SCU)\n`;
    entries.forEach(e => {
      text += `    ${e.collect_scu} SCU ${oreName(e.ore)} (${e.type === 'raw_ore' ? 'Raw' : e.type === 'refining' ? 'Refining' : 'Refined'}, Q:${e.quality})\n`;
    });
  }

  const grandTotal = items.reduce((s, i) => s + i.collect_scu, 0);
  text += `\nTOTAL: ${grandTotal.toFixed(1)} SCU across ${Object.keys(byLoc).length} location(s)\n`;
  text += '\nGenerated by SC Hub Mining';
  showExport(text);
}

function exportJSON() {
  const items = getCollectItems();
  if (items.length === 0) {
    // Fall back to full inventory
    const all = {};
    inventory.forEach(e => {
      const name = oreName(e.ore);
      if (!all[name]) all[name] = {total_scu: 0, refined_scu: 0, raw_scu: 0};
      all[name].total_scu += e.quantity_scu;
      if (e.type === 'refined') all[name].refined_scu += e.quantity_scu;
      else all[name].raw_scu += e.quantity_scu;
    });
    showExport(JSON.stringify({source:'sc_hub_mining', date: new Date().toISOString().split('T')[0], available_materials: all}, null, 2));
    return;
  }
  const out = {};
  items.forEach(i => {
    const name = oreName(i.ore);
    if (!out[name]) out[name] = {scu: 0, quality: 0, type: ''};
    out[name].scu += i.collect_scu;
    out[name].quality = Math.max(out[name].quality, i.quality);
    out[name].type = i.type;
  });
  showExport(JSON.stringify({source:'sc_hub_mining', date: new Date().toISOString().split('T')[0], collection: out}, null, 2));
}

function exportDiscord() {
  const items = getCollectItems();
  if (items.length === 0) { showExport('No items selected. Set Collect amounts first.'); return; }

  const byLoc = {};
  items.forEach(i => {
    const loc = i.location === 'cargo' ? 'In Cargo' : locName(i.location);
    if (!byLoc[loc]) byLoc[loc] = [];
    byLoc[loc].push(i);
  });

  let text = `**Collection Contract** (${new Date().toISOString().split('T')[0]})\n`;
  for (const [loc, entries] of Object.entries(byLoc)) {
    text += `\n\`\`\`\n${loc}\n${'─'.repeat(loc.length)}\n`;
    entries.forEach(e => {
      const type = e.type === 'raw_ore' ? 'Raw' : e.type === 'refining' ? 'Rfng' : 'Refd';
      text += `${oreName(e.ore).padEnd(18)} ${e.collect_scu.toFixed(1).padStart(6)} SCU  ${type}  Q:${e.quality}\n`;
    });
    text += '```';
  }
  showExport(text);
}

// ============================================================
// WELCOME + DUMMY MINER
// ============================================================
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
  if (tab === 'map') setTimeout(() => renderMap(), 50);
  if (tab === 'signals' && D) renderSignalTab();
}

function initWelcome() {
  // ---- Populate Ship select ----
  const shipSel = document.getElementById('dm-ship');
  if (shipSel) {
    shipSel.innerHTML = '';
    const grpGround = document.createElement('optgroup');
    grpGround.label = 'Ground Mining';
    [['fps', 'FPS / Hand Mining'], ['roc', 'ROC / Vehicle']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      grpGround.appendChild(o);
    });
    shipSel.appendChild(grpGround);
    const grpShip = document.createElement('optgroup');
    grpShip.label = 'Ship Mining';
    [['prospector', 'Prospector (solo S1)'], ['mole', 'MOLE (S2, 1-3 crew)'], ['golem', 'Golem (bespoke)']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if (v === 'prospector') o.selected = true;
      grpShip.appendChild(o);
    });
    shipSel.appendChild(grpShip);
  }

  // ---- Populate Difficulty select ----
  const diffSel = document.getElementById('dm-diff');
  if (diffSel) {
    diffSel.innerHTML = '';
    [['easy', 'Easy (passive modules)'], ['medium', 'Medium (optimized)'], ['hard', 'Hard (active + gadgets)']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      if (v === 'easy') o.selected = true;
      diffSel.appendChild(o);
    });
  }

  // ---- Populate Crew select (MOLE only, hidden by default) ----
  const crewSel = document.getElementById('dm-crew');
  if (crewSel) {
    crewSel.innerHTML = '';
    [['1', '1 (solo)'], ['2', '2 crew'], ['3', '3 crew']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t;
      crewSel.appendChild(o);
    });
  }

  // ---- Populate Ore select ----
  dmPopulateOres();

  // ---- Sync visibility ----
  dmSyncUI();

  // Welcome stats
  const m = D.meta;
  let eqStats = '';
  if (D.equipment) {
    const eq = D.equipment;
    eqStats = `<br>Equipment: <strong>${Object.keys(eq.lasers||{}).length} lasers, ${Object.keys(eq.modules||{}).length} modules, ${Object.keys(eq.gadgets||{}).length} gadgets</strong>`;
  }
  document.getElementById('welcome-stats').innerHTML = `
    <div class="map-info-title">// Current Data</div>
    <div style="font-size:12px;color:var(--text-secondary);line-height:1.8">
      Patch: <strong>${m.current_patch}</strong><br>
      Updated: <strong>${m.data_updated}</strong><br>
      Locations: <strong>${m.total_mining_locations}</strong><br>
      Ores: <strong>${m.total_ores}</strong><br>
      Refineries: <strong>${m.total_refineries}</strong><br>
      Regolith data: <strong>${m.regolith_export_date}</strong>${eqStats}
    </div>`;
}

/** Populate the ore dropdown based on current ship selection */
function dmPopulateOres() {
  const sel = document.getElementById('dm-ore');
  const ship = document.getElementById('dm-ship')?.value || 'prospector';
  const prevOre = sel?.value || '';
  if (!sel) return;
  sel.innerHTML = '';

  const isGround = ship === 'fps' || ship === 'roc';

  const shipOres = [];
  const surfaceOres = [];
  Object.entries(D.ores)
    .filter(([,o]) => o.form !== 'waste')
    .sort((a,b) => a[1].display_name.localeCompare(b[1].display_name))
    .forEach(([code, o]) => {
      if (o.form === 'gem') surfaceOres.push([code, o]);
      else shipOres.push([code, o]);
    });

  if (!isGround) {
    // Ship mining — show ship ores only
    const grp = document.createElement('optgroup');
    grp.label = 'Ship Mining';
    shipOres.forEach(([code, o]) => {
      const opt = document.createElement('option');
      opt.value = code; opt.textContent = o.display_name;
      grp.appendChild(opt);
    });
    sel.appendChild(grp);
  } else {
    // Ground mining — filter by FPS vs Vehicle
    const filtered = surfaceOres.filter(([, o]) => {
      if (ship === 'fps') return o.mining_method === 'fps' || o.mining_method === 'fps_vehicle';
      if (ship === 'roc') return o.mining_method === 'vehicle' || o.mining_method === 'fps_vehicle';
      return true;
    });
    if (filtered.length) {
      const grp = document.createElement('optgroup');
      grp.label = ship === 'fps' ? 'FPS Mining' : 'Vehicle Mining';
      filtered.forEach(([code, o]) => {
        const opt = document.createElement('option');
        opt.value = code;
        const tag = o.mining_method === 'fps' ? 'FPS' : o.mining_method === 'vehicle' ? 'Vehicle' : 'FPS/Veh';
        opt.textContent = `${o.display_name} (${tag})`;
        grp.appendChild(opt);
      });
      sel.appendChild(grp);
    }
  }

  // Restore previous selection if still valid
  if (prevOre && sel.querySelector(`option[value="${prevOre}"]`)) {
    sel.value = prevOre;
  }
}

/** Sync UI visibility: crew selector shown only for MOLE, difficulty/ship visibility */
function dmSyncUI() {
  const ship = document.getElementById('dm-ship')?.value || 'prospector';
  const crewWrap = document.getElementById('dm-crew-wrap');
  const diffWrap = document.getElementById('dm-diff-wrap');
  const isGround = ship === 'fps' || ship === 'roc';

  if (crewWrap) crewWrap.style.display = ship === 'mole' ? '' : 'none';
  // Hide difficulty for ground mining OR optimized mode (auto-determines)
  const mode = document.getElementById('dm-mode')?.value || 'community';
  if (diffWrap) diffWrap.style.display = (isGround || mode === 'optimized') ? 'none' : '';
  // Hide mode toggle for ground mining
  const modeWrap = document.getElementById('dm-mode-wrap');
  if (modeWrap) modeWrap.style.display = isGround ? 'none' : '';
}

/** Called when ship changes — update ore list + UI sync */
function dmShipChanged() {
  dmPopulateOres();
  dmSyncUI();
  runDummyMiner();
}

/** Called when mode changes */
function dmModeChanged() {
  dmSyncUI();
  runDummyMiner();
}

// ============================================================
// MATHEMATICAL LOADOUT ENGINE
// ============================================================

/**
 * Compute an optimized loadout for a specific ore + ship + location.
 * Selects laser + modules based on actual rock difficulty data.
 *
 * Returns: { turrets: [{laser, modules, gadgets, effective_power, role, label}], total_power, notes }
 */
function dmComputeOptimalLoadout(ship, ore, system, crew) {
  const eq = D.equipment;
  if (!eq) return null;

  const profile = dmOreDifficulty(ore, system);
  if (!profile || !profile.rocks.length) return null;

  const shipInfo = eq.ships?.[ship === 'mole' ? 'mole' : ship];
  if (!shipInfo) return null;
  const laserSize = shipInfo.laser_size;
  const numCrew = ship === 'mole' ? Math.min(parseInt(crew) || 1, 3) : 1;
  const isBespoke = shipInfo.bespoke_laser;

  // Target: crack the heaviest common rock type for this ore (prob >= 15%)
  const commonRocks = profile.rocks.filter(r => r.prob >= 0.15);
  const targetRocks = commonRocks.length ? commonRocks : profile.rocks;
  const heaviestMed = Math.max(...targetRocks.map(r => r.massMed));
  const lightestMed = Math.min(...targetRocks.map(r => r.massMed));
  const avgRes = profile.avgRes;
  const avgInst = profile.avgInst;

  // Fragment mass after cracking a big rock: roughly 1/4 to 1/3 of parent
  const fragmentMass = Math.max(2000, Math.round(heaviestMed * 0.3));

  // Available lasers for this ship size
  const availableLasers = Object.entries(eq.lasers)
    .filter(([k, v]) => v.size === laserSize && v.max_power > 0 && !k.includes('test'))
    .sort((a, b) => b[1].max_power - a[1].max_power);

  // Available passive power modules
  const powerModules = Object.entries(eq.modules)
    .filter(([k, v]) => v.type === 'passive' && (v.power_mod || 0) > 0)
    .sort((a, b) => (b[1].power_mod || 0) - (a[1].power_mod || 0));

  // Available utility modules
  const utilityModules = Object.entries(eq.modules)
    .filter(([k, v]) => v.type === 'passive' && (v.filter || 0) > 0)
    .sort((a, b) => (b[1].filter || 0) - (a[1].filter || 0));

  // Active power modules (for burst)
  const activeModules = Object.entries(eq.modules)
    .filter(([k, v]) => v.type === 'active' && (v.power_mod || 0) > 0)
    .sort((a, b) => (b[1].power_mod || 0) - (a[1].power_mod || 0));

  // Window modules (for stability)
  const windowModules = Object.entries(eq.modules)
    .filter(([k, v]) => v.type === 'passive' && (v.optimal_window_size || 0) > 0)
    .sort((a, b) => (b[1].optimal_window_size || 0) - (a[1].optimal_window_size || 0));

  /**
   * Select best laser + modules for a given target mass and role.
   * role: 'primary' (crack big rocks) or 'fragment' (crack small pieces)
   */
  function buildTurret(targetMass, role) {
    let bestLaser, bestLaserKey;

    if (isBespoke) {
      bestLaserKey = shipInfo.stock_laser;
      bestLaser = eq.lasers[bestLaserKey];
    } else if (role === 'fragment') {
      // For fragments: pick softest laser with good resistance reduction
      const soft = availableLasers.filter(([, v]) => v.resistance < 0);
      if (soft.length) {
        // Pick lowest power with negative resistance — Hofstede is ideal
        [bestLaserKey, bestLaser] = soft[soft.length - 1];
      } else {
        [bestLaserKey, bestLaser] = availableLasers[availableLasers.length - 1];
      }
    } else {
      // For primary: pick highest power laser with good resistance
      // Prefer Helix (high power, -30% resist, neutral instab)
      const preferred = availableLasers.find(([, v]) => v.resistance <= 0 && v.instability <= 0);
      if (preferred) {
        [bestLaserKey, bestLaser] = preferred;
      } else {
        // Just pick highest power with negative resistance
        const negRes = availableLasers.filter(([, v]) => v.resistance <= 0);
        [bestLaserKey, bestLaser] = negRes.length ? negRes[0] : availableLasers[0];
      }
    }

    if (!bestLaser) return null;

    const slots = bestLaser.module_slots;
    const basePower = bestLaser.max_power;
    const modules = [];
    let totalPowerMod = 0;

    // Fill slots based on need
    const currentPower = () => Math.round(basePower * (100 + totalPowerMod) / 100);
    const needMorePower = () => currentPower() < targetMass * 0.35; // heuristic: power ~35% of mass

    if (role === 'primary') {
      // Fill with power modules until we have enough
      for (let i = 0; i < slots; i++) {
        if (needMorePower()) {
          // Add strongest available passive power module (no duplicates of same active)
          const next = powerModules.find(([k]) => !modules.includes(k) || eq.modules[k].type === 'passive');
          if (next) { modules.push(next[0]); totalPowerMod += next[1].power_mod || 0; continue; }
        }
        // Have enough power — add utility
        if (avgInst >= 40 && windowModules.length) {
          const wm = windowModules.find(([k]) => !modules.includes(k));
          if (wm) { modules.push(wm[0]); totalPowerMod += wm[1].power_mod || 0; continue; }
        }
        // Default: add filter
        const filt = utilityModules.find(([k]) => !modules.includes(k));
        if (filt) { modules.push(filt[0]); totalPowerMod += filt[1].power_mod || 0; continue; }
        // Last resort: more power
        const pm = powerModules.find(([k]) => !modules.includes(k));
        if (pm) { modules.push(pm[0]); totalPowerMod += pm[1].power_mod || 0; }
      }
    } else {
      // Fragment turret: prioritize window size + stability, less power
      for (let i = 0; i < slots; i++) {
        if (currentPower() < fragmentMass * 0.3) {
          const pm = powerModules.find(([k]) => !modules.includes(k));
          if (pm) { modules.push(pm[0]); totalPowerMod += pm[1].power_mod || 0; continue; }
        }
        const wm = windowModules.find(([k]) => !modules.includes(k));
        if (wm) { modules.push(wm[0]); totalPowerMod += wm[1].power_mod || 0; continue; }
        const filt = utilityModules.find(([k]) => !modules.includes(k));
        if (filt) { modules.push(filt[0]); totalPowerMod += filt[1].power_mod || 0; }
      }
    }

    // Gadget recommendation
    const gadgets = [];
    if (role === 'primary') {
      if (avgRes >= 0.20 || (isBespoke && avgRes >= 0.10)) {
        gadgets.push('shin_sabir'); // -50% resist on rock
      } else if (avgInst >= 60) {
        gadgets.push('thcn_boremax'); // -70% instab on rock
      }
    }

    const effPower = currentPower();
    const laserName = bestLaser.name || bestLaserKey;
    const modNames = modules.map(k => eq.modules[k]?.name || k).join(' + ');
    const label = role === 'fragment'
      ? `Fragment: ${laserName} + ${modNames || 'no modules'}`
      : `${laserName} + ${modNames || 'no modules'}`;

    return {
      laser: bestLaserKey, modules, gadgets,
      effective_power: effPower,
      role, label,
      max_mass: Math.round(effPower / 0.35), // inverse of heuristic
    };
  }

  // Build turret configs based on ship + crew
  const turrets = [];
  const notes = [];

  if (ship === 'mole') {
    // Primary turret(s) for cracking big rocks
    const primary = buildTurret(heaviestMed, 'primary');
    if (!primary) return null;

    if (numCrew === 1) {
      turrets.push({...primary, role: 'primary', assignment: 'Center turret'});
      // Fragment turret (solo uses one at a time, but suggest the setup)
      const frag = buildTurret(fragmentMass, 'fragment');
      if (frag) turrets.push({...frag, assignment: 'Right turret (small rocks)'});
      notes.push('Solo MOLE: use one turret at a time. Switch to right turret for fragments after cracking.');
    } else if (numCrew === 2) {
      turrets.push({...primary, assignment: 'Turret 1 (primary)'});
      turrets.push({...primary, assignment: 'Turret 2 (primary)'});
      const frag = buildTurret(fragmentMass, 'fragment');
      if (frag) turrets.push({...frag, assignment: 'Turret 3 (fragments, when 3rd joins)'});
      notes.push('2 primary turrets fire at same rock — combined power stacks.');
    } else {
      turrets.push({...primary, assignment: 'Turret 1 (primary)'});
      turrets.push({...primary, assignment: 'Turret 2 (primary)'});
      const frag = buildTurret(fragmentMass, 'fragment');
      if (frag) turrets.push({...frag, assignment: 'Turret 3 (fragments)'});
      notes.push('2 primary + 1 fragment turret. Fragment turret handles smaller pieces after crack.');
    }
  } else {
    // Single turret ships (Prospector, Golem)
    const primary = buildTurret(heaviestMed, 'primary');
    if (!primary) return null;
    turrets.push(primary);
  }

  // Calculate total effective power (primary turrets stacking)
  const primaryTurrets = turrets.filter(t => t.role === 'primary');
  const totalPower = primaryTurrets.reduce((s, t) => s + t.effective_power, 0);

  // Overkill warning
  if (totalPower > heaviestMed * 2 && lightestMed < heaviestMed * 0.5) {
    notes.push(`High power (${totalPower.toLocaleString()}) may make small rocks harder to control. Use gentle throttle on lighter rocks.`);
  }

  return { turrets, total_power: totalPower, notes, target_mass: heaviestMed, fragment_mass: fragmentMass };
}

/** Format optimized loadout for display */
function dmFormatOptimalLoadout(result) {
  const eq = D.equipment;
  if (!eq || !result) return '';
  let html = '';

  result.turrets.forEach(t => {
    const laser = eq.lasers?.[t.laser];
    const laserName = laser?.name || t.laser;
    const mods = [];
    if (laser?.resistance) mods.push(`<span class="${laser.resistance < 0 ? 'v-pos' : 'v-neg'}">${laser.resistance > 0 ? '+' : ''}${laser.resistance}% resist</span>`);
    if (laser?.instability) mods.push(`<span class="${laser.instability < 0 ? 'v-pos' : 'v-neg'}">${laser.instability > 0 ? '+' : ''}${laser.instability}% instab</span>`);

    const roleColor = t.role === 'fragment' ? 'var(--cyan)' : 'var(--accent)';
    const assignment = t.assignment ? `<span style="color:${roleColor};font-size:10px;font-family:'Share Tech Mono',monospace;letter-spacing:1px;text-transform:uppercase">${t.assignment}</span> ` : '';

    html += `<div style="margin-bottom:6px;padding:4px 0;${result.turrets.length > 1 ? 'border-bottom:1px solid var(--border)' : ''}">`;
    html += `${assignment}<strong>${laserName}</strong> <span style="color:var(--text-dim)">(S${laser?.size||'?'}, ${laser?.module_slots||0} slots)</span>${mods.length ? ' — ' + mods.join(', ') : ''}<br>`;

    if (t.modules.length) {
      const modNames = t.modules.map(k => {
        const m = eq.modules?.[k]; if (!m) return k;
        const badge = m.type === 'active' ? ` <span class="tag" style="background:rgba(232,117,26,0.15);color:var(--orange);border:1px solid rgba(232,117,26,0.3);font-size:10px">ACT ${m.lifetime}s</span>` : '';
        let powerTag = '';
        if (m.power_mod) powerTag = ` <span style="color:${m.power_mod > 0 ? 'var(--green)' : 'var(--red)'}"><strong>${m.power_mod > 0 ? '+' : ''}${m.power_mod}% power</strong></span>`;
        return `${m.name}${badge}${powerTag}`;
      });
      html += `Modules: ${modNames.join(' + ')}<br>`;
    }
    if (t.gadgets?.length) {
      // Gadgets tracked but shown once below, not per-turret
    }
    html += `<span class="mono" style="font-size:11px;color:var(--text-dim)">Power: ${t.effective_power.toLocaleString()}</span>`;
    html += `</div>`;
  });

  // Collect all gadgets from all turrets, deduplicate
  const allGadgets = [...new Set(result.turrets.flatMap(t => t.gadgets || []))];
  if (allGadgets.length) {
    const gNames = allGadgets.map(k => {
      const g = eq.gadgets?.[k]; if (!g) return k;
      const effect = [];
      if (g.resistance) effect.push(`${g.resistance > 0 ? '+' : ''}${g.resistance}% resist on rock`);
      if (g.instability) effect.push(`${g.instability > 0 ? '+' : ''}${g.instability}% instab on rock`);
      const effectStr = effect.length ? ` <span style="color:var(--text-dim)">(${effect.join(', ')})</span>` : '';
      return `${g.name} <span class="tag" style="background:rgba(77,201,246,0.15);color:var(--cyan);border:1px solid rgba(77,201,246,0.3);font-size:10px">GADGET</span>${effectStr}`;
    });
    html += `<div style="margin-top:4px">Gadget: ${gNames.join(', ')} <span style="color:var(--text-dim);font-size:11px">(1 per rock)</span></div>`;
  }

  if (result.notes?.length) {
    html += `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${result.notes.join('<br>')}</div>`;
  }
  return html;
}

/** Resolve the equipment loadout key for a ship + crew combo */
function dmLoadoutKey(ship, crew) {
  if (ship === 'mole') {
    const c = parseInt(crew) || 1;
    if (c >= 3) return 'mole_3crew';
    if (c >= 2) return 'mole_2crew';
    return 'mole_solo';
  }
  return ship;
}

/** Get loadout for ship+difficulty+crew from equipment data */
function dmGetLoadout(ship, difficulty, crew) {
  const eq = D.equipment;
  if (!eq || !eq.loadouts) return null;
  const key = dmLoadoutKey(ship, crew);
  const shipLoadouts = eq.loadouts[key];
  if (!shipLoadouts) return null;
  return shipLoadouts[difficulty] || shipLoadouts['easy'] || null;
}

/** Render a single turret's laser + modules line */
function dmFormatTurretLine(turretData) {
  const eq = D.equipment;
  if (!eq) return '';
  const laserKey = turretData.laser;
  const modules = turretData.modules || [];
  const laser = eq.lasers?.[laserKey];
  let html = '';

  if (laser) {
    const mods = [];
    if (laser.resistance) mods.push(`<span class="${laser.resistance < 0 ? 'v-pos' : 'v-neg'}">${laser.resistance > 0 ? '+' : ''}${laser.resistance}% resist</span>`);
    if (laser.instability) mods.push(`<span class="${laser.instability < 0 ? 'v-pos' : 'v-neg'}">${laser.instability > 0 ? '+' : ''}${laser.instability}% instab</span>`);
    if (laser.filter) mods.push(`<span class="v-pos">${laser.filter}% filter</span>`);
    html += `<strong>${laser.name}</strong> <span style="color:var(--text-dim)">(S${laser.size}, ${laser.module_slots} slots)</span>${mods.length ? ' \u2014 ' + mods.join(', ') : ''}`;
  }
  if (modules.length) {
    const modNames = modules.map(k => {
      const m = eq.modules?.[k];
      if (!m) return k;
      const badge = m.type === 'active' ? ` <span class="tag" style="background:rgba(232,117,26,0.15);color:var(--orange);border:1px solid rgba(232,117,26,0.3);font-size:10px">ACT ${m.lifetime}s</span>` : '';
      let powerTag = '';
      if (m.power_mod) powerTag = ` <span style="color:${m.power_mod > 0 ? 'var(--green)' : 'var(--red)'}"><strong>${m.power_mod > 0 ? '+' : ''}${m.power_mod}% power</strong></span>`;
      const effect = [];
      if (m.resistance) effect.push(`${m.resistance > 0 ? '+' : ''}${m.resistance}% res`);
      if (m.instability) effect.push(`${m.instability > 0 ? '+' : ''}${m.instability}% inst`);
      if (m.optimal_window_size) effect.push(`${m.optimal_window_size > 0 ? '+' : ''}${m.optimal_window_size}% window`);
      if (m.extract_power_mod) effect.push(`${m.extract_power_mod > 0 ? '+' : ''}${m.extract_power_mod}% extract`);
      if (m.filter) effect.push(`${m.filter}% filter`);
      const effectStr = effect.length ? ` <span style="color:var(--text-dim)">(${effect.join(', ')})</span>` : '';
      return `${m.name}${badge}${powerTag}${effectStr}`;
    });
    html += '<br>Modules: ' + modNames.join(' + ');
  }
  return html;
}

/** Format a loadout for display — handles both single-turret and multi-turret formats */
function dmFormatLoadout(loadout) {
  const eq = D.equipment;
  if (!eq || !loadout) return '';

  // New per-turret format (MOLE)
  if (loadout.turrets && Array.isArray(loadout.turrets)) {
    let html = '';
    loadout.turrets.forEach((t, i) => {
      const roleColor = t.role?.toLowerCase().includes('extract') || t.role?.toLowerCase().includes('small') || t.role?.toLowerCase().includes('fragment')
        ? 'var(--cyan)' : 'var(--accent)';
      html += `<div style="margin-bottom:6px;padding:6px 0;${i < loadout.turrets.length - 1 ? 'border-bottom:1px solid var(--border)' : ''}">`;
      if (t.role) html += `<span style="color:${roleColor};font-size:10px;font-family:'Share Tech Mono',monospace;letter-spacing:1px;text-transform:uppercase">${t.role}</span><br>`;
      html += dmFormatTurretLine(t);
      html += `</div>`;
    });
    // Gadgets (shown once, not per-turret)
    if (loadout.gadgets?.length) {
      const gadNames = loadout.gadgets.map(k => {
        const g = eq.gadgets?.[k]; if (!g) return k;
        const effect = [];
        if (g.resistance) effect.push(`${g.resistance > 0 ? '+' : ''}${g.resistance}% resist on rock`);
        if (g.instability) effect.push(`${g.instability > 0 ? '+' : ''}${g.instability}% instab on rock`);
        if (g.cluster) effect.push(`${g.cluster > 0 ? '+' : ''}${g.cluster}% cluster`);
        const effectStr = effect.length ? ` <span style="color:var(--text-dim)">(${effect.join(', ')})</span>` : '';
        return `${g.name} <span class="tag" style="background:rgba(77,201,246,0.15);color:var(--cyan);border:1px solid rgba(77,201,246,0.3);font-size:10px">GADGET</span>${effectStr}`;
      });
      html += `<div style="margin-top:4px">Gadget: ${gadNames.join(', ')} <span style="color:var(--text-dim);font-size:11px">(1 per rock)</span></div>`;
    }
    return html;
  }

  // Legacy single-turret format (Prospector, Golem)
  const parts = [];
  parts.push(dmFormatTurretLine({laser: loadout.laser, modules: loadout.modules}));
  if (loadout.gadgets?.length) {
    const gadNames = loadout.gadgets.map(k => {
      const g = eq.gadgets?.[k]; if (!g) return k;
      const effect = [];
      if (g.resistance) effect.push(`${g.resistance > 0 ? '+' : ''}${g.resistance}% resist on rock`);
      if (g.instability) effect.push(`${g.instability > 0 ? '+' : ''}${g.instability}% instab on rock`);
      if (g.cluster) effect.push(`${g.cluster > 0 ? '+' : ''}${g.cluster}% cluster`);
      const effectStr = effect.length ? ` <span style="color:var(--text-dim)">(${effect.join(', ')})</span>` : '';
      return `${g.name} <span class="tag" style="background:rgba(77,201,246,0.15);color:var(--cyan);border:1px solid rgba(77,201,246,0.3);font-size:10px">GADGET</span>${effectStr}`;
    });
    parts.push('Gadget: ' + gadNames.join(', '));
  }
  return parts.join('<br>');
}

/** Compute ore mining difficulty profile for a given ore + system */
function dmOreDifficulty(ore, systemFilter) {
  const rocks = [];
  for (const [sys, types] of Object.entries(D.rock_types || {})) {
    if (systemFilter && systemFilter !== 'all' && sys !== systemFilter.toUpperCase()) continue;
    for (const [rtype, rdata] of Object.entries(types)) {
      if (!rdata?.ores) continue;
      const oreInRock = rdata.ores[ore];
      if (oreInRock && oreInRock.prob >= 0.10) {
        rocks.push({
          system: sys, type: rtype, prob: oreInRock.prob,
          massMed: rdata.mass?.med || 0, massMax: rdata.mass?.max || 0,
          res: rdata.res?.med || 0, inst: rdata.inst?.med || 0,
          scans: rdata.scans || 0,
        });
      }
    }
  }
  if (!rocks.length) return null;
  const avgRes = rocks.reduce((s, r) => s + r.res, 0) / rocks.length;
  const avgInst = rocks.reduce((s, r) => s + r.inst, 0) / rocks.length;
  const avgMass = rocks.reduce((s, r) => s + r.massMed, 0) / rocks.length;
  const scored = rocks.map(r => ({...r, diffScore: r.massMed * (1 + r.res)}));
  scored.sort((a, b) => a.diffScore - b.diffScore);
  return {
    rocks: scored, avgRes, avgInst, avgMass,
    easiest: scored[0], hardest: scored[scored.length - 1],
    minMassMed: Math.min(...rocks.map(r => r.massMed)),
    maxMassMed: Math.max(...rocks.map(r => r.massMed)),
    maxMassMax: Math.max(...rocks.map(r => r.massMax)),
  };
}

/** Generate dynamic gear recommendations based on ore difficulty */
function dmGearRecommendation(ore, profile, ship, diff) {
  const eq = D.equipment;
  if (!eq || !profile) return '';
  const tips = [];

  // --- Module recs based on ore resistance ---
  if (profile.avgRes >= 0.25) {
    tips.push(`<span style="color:var(--orange)">High resistance ore</span> — use <strong>Surge</strong> (${eq.modules?.active_surge?.resistance || -15.5}% res, ${eq.modules?.active_surge?.lifetime || 15}s) or <strong>Rime</strong> (${eq.modules?.active_rime?.resistance || -24.8}% res, ${eq.modules?.active_rime?.lifetime || 20}s) to cut through`);
  }

  // --- Instability handling ---
  if (profile.avgInst >= 40) {
    tips.push(`<span style="color:var(--orange)">Unstable rocks</span> — equip <strong>Optimum</strong> (-80% catastrophic rate) or <strong>Torpid</strong> (+60% window rate, -60% catastrophic). Throttle carefully near the green zone`);
  }
  if (profile.avgInst >= 80) {
    tips.push(`<span style="color:var(--red)">Extreme instability</span> — throw <strong>BoreMax</strong> gadget at rock first (${eq.gadgets?.thcn_boremax?.instability || -70}% instability on rock). Reusable, no cost`);
  }

  // --- Gadget recs based on difficulty ---
  if (diff === 'hard' && profile.avgRes >= 0.15) {
    tips.push(`Throw <strong>Sabir</strong> gadget at rock for <strong>${eq.gadgets?.shin_sabir?.resistance || -50}% resistance</strong> before firing. Reusable. Best gadget for tough rocks`);
  } else if (diff === 'medium' && profile.avgRes >= 0.25) {
    tips.push(`Consider throwing <strong>Sabir</strong> gadget (<strong>${eq.gadgets?.shin_sabir?.resistance || -50}% resist</strong> on rock) — makes medium setups handle hard rocks`);
  }

  if (diff === 'hard' && profile.avgRes < 0.15 && profile.maxMassMed > 8000) {
    tips.push(`Low resistance but heavy — <strong>OptiMax</strong> gadget (+60% cluster, -25% resist) boosts yield on big rocks`);
  }

  // --- Ship-specific ---
  if (ship === 'golem') {
    tips.push(`Golem's bespoke laser has <strong>+25% resistance</strong> — gadgets are essential. Always throw <strong>Sabir</strong> before cracking anything substantial`);
  }
  if (ship === 'prospector' && profile.maxMassMed > 15000) {
    tips.push(`Some rocks with this ore exceed Prospector limits. Use <strong>Surge + Stampede</strong> active modules for burst power, or bring a <strong>MOLE</strong>`);
  }

  // --- Filter tip for easy mode ---
  if (diff === 'easy') {
    tips.push(`Tip: <strong>FLTR</strong> passive module (up to 24% less inert material) improves cargo value — worth a slot if you're not struggling to crack`);
  }

  return tips.length
    ? `<div class="insight" style="margin-top:8px;border-color:var(--accent)"><div class="insight-title" style="color:var(--accent)">Gear Recommendations</div><div style="font-size:12px;line-height:1.8">${tips.map(t => '• ' + t).join('<br>')}</div></div>`
    : '';
}

/** Generate material-specific mining insight text */
function dmMaterialInsight(ore, profile) {
  if (!profile) return '';
  const tips = [];

  if (profile.avgRes >= 0.30) tips.push(`<strong>Very hard rock</strong> — high resistance (avg ${(profile.avgRes*100).toFixed(0)}%). Needs strong resistance modifiers or gadgets.`);
  else if (profile.avgRes >= 0.20) tips.push(`Moderate resistance (avg ${(profile.avgRes*100).toFixed(0)}%). Most optimized setups handle this.`);
  else if (profile.avgRes <= 0.10) tips.push(`<strong>Low resistance</strong> (avg ${(profile.avgRes*100).toFixed(0)}%) — easy to crack even with stock lasers.`);

  if (profile.avgInst >= 80) tips.push(`<span style="color:var(--red)">Extreme instability (avg ${profile.avgInst.toFixed(0)})</span> — BoreMax gadget and stability modules essential.`);
  else if (profile.avgInst >= 40) tips.push(`High instability (avg ${profile.avgInst.toFixed(0)}) — consider Optimum or Torpid modules.`);

  if (profile.maxMassMax > profile.maxMassMed * 3) {
    tips.push(`Rock sizes vary widely — median ${profile.minMassMed.toLocaleString()} to ${profile.maxMassMed.toLocaleString()}, but outliers up to <strong>${profile.maxMassMax.toLocaleString()}</strong>. Skip the giants or bring a bigger ship.`);
  }

  if (profile.rocks.length === 1) {
    tips.push(`Found in only <strong>1 rock type</strong> (${profile.rocks[0].type}) — limited spawn variety.`);
  }

  return tips.length ? tips.join('<br>') : '';
}

function runDummyMiner() {
  const ore = document.getElementById('dm-ore').value;
  const sys = document.getElementById('dm-system').value;
  const ship = document.getElementById('dm-ship')?.value || 'prospector';
  const diff = document.getElementById('dm-diff')?.value || 'easy';
  const crew = document.getElementById('dm-crew')?.value || '1';
  const el = document.getElementById('dm-result');
  if (!ore) { el.innerHTML = ''; return; }

  const oreInfo = D.ores[ore];
  const isGround = ship === 'fps' || ship === 'roc';
  const eq = D.equipment;

  // ---- Find best location ----
  let bestLoc = null, bestScore = 0, bestScans = 0, bestProb = 0;

  if (isGround) {
    for (const [code, data] of Object.entries(D.roc_hand_mining || {})) {
      const loc = D.locations[code];
      if (!loc) continue;
      if (sys !== 'all' && loc.system !== sys) continue;
      const oreData = data.ores?.[ore];
      if (!oreData) continue;
      const scans = data.finds || 0;
      const confWeight = scans / (scans + 200);
      const score = oreData.prob * confWeight;
      if (score > bestScore) { bestLoc = code; bestScore = score; bestScans = scans; bestProb = oreData.prob; }
    }
  } else {
    for (const [code, data] of Object.entries(D.ore_locations)) {
      const loc = D.locations[code];
      if (!loc) continue;
      if (sys !== 'all' && loc.system !== sys) continue;
      const oreData = data.ores?.[ore];
      if (!oreData) continue;
      const scans = data.scans || 0;
      const confWeight = scans / (scans + 200);
      const score = oreData.prob * confWeight;
      if (score > bestScore) { bestLoc = code; bestScore = score; bestScans = scans; bestProb = oreData.prob; }
    }
  }

  if (!bestLoc) {
    if (oreInfo?.notes) {
      el.innerHTML = `<div class="insight"><div class="insight-title">Special Ore</div>${oreInfo.notes}</div>`;
    } else {
      el.innerHTML = '<div style="color:var(--text-dim)">No location data for this ore in the selected system.</div>';
    }
    return;
  }

  const loc = D.locations[bestLoc];
  let html = '';

  // ---- Top row: Location + Refineries ----
  html += `<div class="dm-row">`;
  html += `<div class="dm-box"><div class="dm-box-title">Go ${isGround ? 'Surface Mine' : 'Mine'} Here</div>
    <div class="dm-box-value">${locDisplayName(bestLoc)}</div>
    <div class="dm-box-sub">${systemTag(loc.system)} ${(bestProb*100).toFixed(0)}% chance | ${bestScans} ${isGround ? 'finds' : 'scans'} | ${confidence(bestScans)}</div></div>`;

  if (!isGround) {
    const refs = findRefineries(bestLoc, ore);
    let globalBest = null;
    if (sys === 'all') {
      for (const [sname, sdata] of Object.entries(D.refineries.stations)) {
        const y = sdata.yields[ore]?.value;
        if (y != null && (!globalBest || y > globalBest.value)) {
          globalBest = {name: sname, value: y, system: sdata.system};
        }
      }
    }
    if (refs.nearest) {
      const nYield = refs.nearest.yield != null ? `${fmtYield(refs.nearest.yield)} yield` : '<span class="mono" style="color:var(--text-dim)">nearest</span>';
      html += `<div class="dm-box"><div class="dm-box-title">Nearest Refinery</div>
        <div class="dm-box-value">${refs.nearest.name.split(' - ')[1] || refs.nearest.name}</div>
        <div class="dm-box-sub">${nYield}</div></div>`;
    }
    const bestToShow = globalBest && globalBest.value > (refs.best?.yield ?? -99) ? globalBest : refs.best;
    if (bestToShow && (!refs.nearest || bestToShow.name !== refs.nearest.name)) {
      const nYield = refs.nearest?.yield ?? 0;
      const bValue = bestToShow.value ?? bestToShow.yield ?? 0;
      const delta = bValue - nYield;
      html += `<div class="dm-box" style="border-color:var(--green)"><div class="dm-box-title">Best Refinery</div>
        <div class="dm-box-value" style="color:var(--green)">${bestToShow.name.split(' - ')[1] || bestToShow.name}</div>
        <div class="dm-box-sub">${fmtYield(bestToShow.value ?? bestToShow.yield)} yield ${delta > 0 ? `<span class="delta-gain">(+${delta}% more)</span>` : ''}</div></div>`;
    }
  }
  html += '</div>';

  // ---- Ship mining sections ----
  if (!isGround) {
    const mode = document.getElementById('dm-mode')?.value || 'community';
    const profile = dmOreDifficulty(ore, loc.system);
    let maxMass = 999999;
    const loadout = eq ? dmGetLoadout(ship, diff, crew) : null;

    if (mode === 'optimized' && eq) {
      // ---- OPTIMIZED MODE ----
      const optResult = dmComputeOptimalLoadout(ship, ore, loc.system, crew);
      if (optResult) {
        const optHtml = dmFormatOptimalLoadout(optResult);
        const shipInfo = eq.ships?.[ship];
        const shipLabel = shipInfo ? shipInfo.name : ship;
        const crewLabel = ship === 'mole' ? ` (${crew} crew)` : '';
        maxMass = optResult.target_mass || 999999;
        const primaryTurrets = optResult.turrets.filter(t => t.role === 'primary');
        const totalPower = primaryTurrets.reduce((s, t) => s + t.effective_power, 0);

        html += `<div class="insight" style="margin-top:8px;border-color:var(--green)">
          <div class="insight-title" style="color:var(--green)">Optimized for ${oreName(ore)} — ${shipLabel}${crewLabel} <span style="color:var(--text-dim);font-weight:normal">(${totalPower.toLocaleString()} power → targets mass ~${maxMass.toLocaleString()})</span></div>
          <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;font-family:\'Share Tech Mono\',monospace;letter-spacing:1px">COMPUTED FROM ORE DIFFICULTY DATA</div>
          <div style="font-size:12px;line-height:1.8">${optHtml}</div>
        </div>`;
      }
    } else if (loadout && eq) {
      // ---- COMMUNITY MODE ----
      maxMass = loadout.max_mass || 999999;
      const loadoutHtml = dmFormatLoadout(loadout);
      const shipInfo = eq.ships?.[ship];
      const shipLabel = shipInfo ? shipInfo.name : ship;
      const crewLabel = ship === 'mole' ? ` (${crew} crew)` : '';
      const diffLabels = {easy: 'Easy', medium: 'Medium', hard: 'Hard'};

      let crackSummary = '';
      if (profile) {
        const crackableRocks = profile.rocks.filter(r => r.massMed <= maxMass);
        if (crackableRocks.length) {
          const biggest = crackableRocks.reduce((a, b) => a.massMed > b.massMed ? a : b);
          const pctCovered = Math.round(crackableRocks.length / profile.rocks.length * 100);
          const risky = crackableRocks.filter(r => r.massMax > maxMass);
          const allClean = risky.length === 0;

          if (pctCovered === 100 && allClean) {
            crackSummary = `Can crack <strong>all</strong> ${oreName(ore)} rocks — biggest type: <strong>${biggest.type}</strong> (mass ~${biggest.massMed.toLocaleString()}, max ${biggest.massMax.toLocaleString()})`;
          } else if (pctCovered === 100 && !allClean) {
            crackSummary = `Can crack <strong>typical</strong> ${oreName(ore)} rocks in all ${crackableRocks.length} rock types — biggest type: <strong>${biggest.type}</strong> (mass ~${biggest.massMed.toLocaleString()})`;
            crackSummary += `<br><span style="color:var(--yellow)">Outliers in ${risky.map(r=>r.type).join(', ')} can exceed your limit (up to ${Math.max(...risky.map(r=>r.massMax)).toLocaleString()}) — skip the biggest rocks</span>`;
          } else {
            crackSummary = `Can crack <strong>${pctCovered}%</strong> of rock types with ${oreName(ore)} — biggest crackable: <strong>${biggest.type}</strong> (mass ~${biggest.massMed.toLocaleString()})`;
            if (risky.length) {
              crackSummary += `<br><span style="color:var(--yellow)">Some ${risky.map(r=>r.type).join(', ')} outliers above your limit — skip the biggest</span>`;
            }
          }
          // Show what next difficulty unlocks
          const nextDiff = diff === 'easy' ? 'medium' : diff === 'medium' ? 'hard' : null;
          if (nextDiff) {
            const nextLoadout = dmGetLoadout(ship, nextDiff, crew);
            if (nextLoadout && nextLoadout.max_mass > maxMass) {
              const nextCrackable = profile.rocks.filter(r => r.massMed <= nextLoadout.max_mass);
              const unlocked = nextCrackable.length - crackableRocks.length;
              if (unlocked > 0) {
                crackSummary += `<br><span style="color:var(--cyan)">↑ ${nextDiff} unlocks <strong>${unlocked} more</strong> rock type${unlocked>1?'s':''} (up to mass ~${nextLoadout.max_mass.toLocaleString()})</span>`;
              }
            }
          }
        } else {
          crackSummary = `<span style="color:var(--red)">No rock types with ${oreName(ore)} in your cracking range.</span>`;
          const nextDiff = diff === 'easy' ? 'medium' : diff === 'medium' ? 'hard' : null;
          if (nextDiff) {
            const nextLoadout = dmGetLoadout(ship, nextDiff, crew);
            if (nextLoadout && nextLoadout.max_mass > maxMass) {
              const nc = profile.rocks.filter(r => r.massMed <= nextLoadout.max_mass);
              if (nc.length) crackSummary += ` <span style="color:var(--cyan)">Try <strong>${nextDiff}</strong> to unlock ${nc.length} rock type${nc.length>1?'s':''}.</span>`;
            }
          }
        }
      }

        const effPower = loadout.effective_power || 0;
        const powerStr = effPower ? ` | ${effPower.toLocaleString()} power` : '';

      html += `<div class="insight" style="margin-top:8px;border-color:var(--orange)">
        <div class="insight-title" style="color:var(--orange)">Setup — ${shipLabel}${crewLabel} / ${diffLabels[diff] || diff}  <span style="color:var(--text-dim);font-weight:normal">(max mass ~${maxMass.toLocaleString()}${powerStr})</span></div>
        <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;font-family:'Share Tech Mono',monospace;letter-spacing:1px">COMMUNITY RECOMMENDED LOADOUT</div>
        <div style="font-size:12px;line-height:1.8">${loadoutHtml}</div>
        ${loadout.notes ? `<div style="margin-top:4px;font-size:11px;color:var(--text-secondary)">${loadout.notes}</div>` : ''}
        ${crackSummary ? `<div style="margin-top:6px;font-size:12px;line-height:1.6;padding-top:6px;border-top:1px solid var(--border)">${crackSummary}</div>` : ''}
      </div>`;
    }

    // ---- Dynamic Gear Recommendations ----
    if (profile && eq) {
      html += dmGearRecommendation(ore, profile, ship, diff);
    }

    // ---- Rock Types ----
    if (profile && profile.rocks.length) {
      const sysKey = loc.system.toUpperCase();
      const rtlData = D.rock_type_locations?.[bestLoc];
      const localRockTypes = rtlData?.rockTypes ? new Set(Object.keys(rtlData.rockTypes)) : null;

      html += `<div class="insight" style="margin-top:8px"><div class="insight-title">Rock Types with ${oreName(ore)} at ${locDisplayName(bestLoc)}</div>`;

      const displayRocks = localRockTypes
        ? profile.rocks.filter(r => r.system === sysKey && localRockTypes.has(r.type))
        : profile.rocks.filter(r => r.system === sysKey);

      if (displayRocks.length) {
        displayRocks.sort((a, b) => b.prob - a.prob);
        displayRocks.forEach(r => {
          const crackable = r.massMed <= maxMass;
          const allCrackable = r.massMax <= maxMass;
          const icon = crackable ? '<span style="color:var(--green)">&#9654;</span>' : '<span style="color:var(--red)">&#9650;</span>';
          const massColor = crackable ? (allCrackable ? 'var(--green)' : 'var(--yellow)') : 'var(--red)';
          const label = crackable ? (allCrackable ? '' : `<span style="color:var(--yellow)">some outliers</span>`) : `<span style="color:var(--red)">too heavy</span>`;
          const spawnProb = rtlData?.rockTypes?.[r.type]?.prob;
          const spawnStr = spawnProb != null ? `spawn ${(spawnProb*100).toFixed(0)}%` : '';

          html += `<div style="margin:3px 0;font-size:12px">
            ${icon} <strong>${r.type}</strong>
            <span class="mono">${(r.prob*100).toFixed(0)}% ore</span>
            <span class="mono" style="color:var(--text-dim)">${spawnStr}</span>
            <span class="mono" style="font-size:11px;color:${massColor}">mass ~${r.massMed.toLocaleString()}</span>
            <span class="mono" style="font-size:11px;color:var(--text-dim)">res ${(r.res*100).toFixed(0)}%</span>
            ${label}
          </div>`;
        });
      } else {
        html += `<div style="font-size:12px;color:var(--text-dim)">No rock type spawn data at this location.</div>`;
      }
      html += `<br><span style="color:var(--text-dim);font-size:11px"><a href="#" onclick="showSignalGuide();return false" style="color:var(--cyan)">Mass Guide</a> for details</span></div>`;
    }

    // ---- Material Insight ----
    if (profile) {
      const insight = dmMaterialInsight(ore, profile);
      if (insight) {
        html += `<div class="insight" style="margin-top:8px;border-color:var(--cyan)">
          <div class="insight-title" style="color:var(--cyan)">Material Insight — ${oreName(ore)}</div>
          <div style="font-size:12px;line-height:1.7">${insight}</div>
        </div>`;
      }
    }

    // Also found here
    const alsoOres = getOreAt(bestLoc).filter(o => o.code !== ore && o.code !== 'INERTMATERIAL' && o.prob >= 0.10).slice(0, 5);
    if (alsoOres.length) {
      html += `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary)">Also at ${loc.display_name}: `;
      html += alsoOres.map(o => confChip(`${oreName(o.code)} ${(o.prob*100).toFixed(0)}%`, bestScans)).join(' ');
      html += '</div>';
    }
  } else {
    // Ground mining
    const locData = D.roc_hand_mining[bestLoc];
    if (locData?.ores) {
      const others = Object.entries(locData.ores).filter(([k]) => k !== ore).sort((a, b) => b[1].prob - a[1].prob).slice(0, 4);
      if (others.length) {
        html += `<div style="margin-top:6px;font-size:12px;color:var(--text-secondary)">Also at ${loc.display_name}: `;
        html += others.map(([code, s]) => confChip(`${oreName(code)} ${(s.prob*100).toFixed(0)}%`, s.finds || 0)).join(' ');
        html += '</div>';
      }
    }
  }

  el.innerHTML = html;
}

// ============================================================
// SIGNAL GUIDE
// ============================================================
let sgSystem = 'Stanton';

function showSignalGuide() {
  switchTab('signals');
}

function renderSignalTab() {
  buildChips(document.getElementById('sg-system-chips'),
    [['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],
    sgSystem, v => { sgSystem = v; renderSignalTab(); }, renderSignalTab);

  const el = document.getElementById('signal-tab-content');
  const sysKey = sgSystem.toUpperCase();
  const rockTypes = D.rock_types[sysKey] || D.rock_types[sgSystem] || {};

  if (Object.keys(rockTypes).length === 0) {
    el.innerHTML = '<div style="color:var(--text-dim)">No rock type data for this system.</div>';
    return;
  }

  let html = '<div class="tbl-wrap"><table class="sg-table"><thead><tr><th>Rock Type</th><th>Mass (average)</th><th>Instability</th><th>Resistance</th><th>Scans</th><th>Top Ores</th></tr></thead><tbody>';

  const sorted = Object.entries(rockTypes)
    .filter(([, d]) => d && d.mass)
    .sort((a, b) => (b[1].mass?.med || 0) - (a[1].mass?.med || 0));

  sorted.forEach(([type, data]) => {
    const m = data.mass || {};
    const inst = data.inst || {};
    const res = data.res || {};
    const scans = data.scans || 0;
    const ores = Object.entries(data.ores || {})
      .filter(([k]) => k !== 'INERTMATERIAL')
      .sort((a, b) => b[1].prob - a[1].prob)
      .slice(0, 4);

    html += `<tr>`;
    html += `<td style="font-size:14px">${type}</td>`;
    html += `<td><span class="sg-med">${(m.med||0).toLocaleString()}</span> <span class="sg-range">${(m.min||0).toLocaleString()}-${(m.max||0).toLocaleString()}</span></td>`;
    html += `<td><span class="sg-med">${(inst.med||0).toFixed(1)}</span> <span class="sg-range">${(inst.min||0).toFixed(0)}-${(inst.max||0).toFixed(0)}</span></td>`;
    html += `<td><span class="sg-med">${(res.med||0).toFixed(2)}</span></td>`;
    html += `<td>${fmtScans(scans)} ${confidence(scans)}</td>`;
    html += `<td><div class="also-list">${ores.map(([code, s]) => confChip(`${oreName(code)} ${(s.prob*100).toFixed(0)}%`, scans)).join('')}</div></td>`;
    html += `</tr>`;
  });

  html += '</tbody></table></div>';
  html += `<div style="margin-top:10px;font-size:11px;color:var(--text-dim)">
    <strong>Mass</strong> = average mass. 
    <strong>Instability</strong> = how volatile (harder to control laser). 
    <strong>Resistance</strong> = toughness to crack. 
    Match the mass range from your scanner to identify the rock type.
  </div>`;
  el.innerHTML = html;
}

function renderSignalGuide(system, btn) {
  if (btn) {
    document.querySelectorAll('[data-sg]').forEach(b => b.classList.toggle('active', b.dataset.sg === system));
  }
  const el = document.getElementById('signal-guide-content');
  const sysKey = system.toUpperCase();
  const rockTypes = D.rock_types[sysKey] || D.rock_types[system] || {};

  if (Object.keys(rockTypes).length === 0) {
    el.innerHTML = '<div style="color:var(--text-dim)">No rock type data for this system.</div>';
    return;
  }

  let html = '<table class="sg-table"><thead><tr><th>Rock Type</th><th>Mass (average)</th><th>Instability</th><th>Resistance</th><th>Top Ores</th></tr></thead><tbody>';

  const sorted = Object.entries(rockTypes)
    .filter(([, d]) => d && d.mass)
    .sort((a, b) => (b[1].mass?.med || 0) - (a[1].mass?.med || 0));

  sorted.forEach(([type, data]) => {
    const m = data.mass || {};
    const inst = data.inst || {};
    const res = data.res || {};
    const ores = Object.entries(data.ores || {})
      .filter(([k]) => k !== 'INERTMATERIAL')
      .sort((a, b) => b[1].prob - a[1].prob)
      .slice(0, 4);

    html += `<tr>`;
    html += `<td>${type}</td>`;
    html += `<td><span class="sg-med">${(m.med||0).toLocaleString()}</span> <span class="sg-range">(${(m.min||0).toLocaleString()}-${(m.max||0).toLocaleString()})</span></td>`;
    html += `<td><span class="sg-med">${(inst.med||0).toFixed(1)}</span> <span class="sg-range">(${(inst.min||0).toFixed(0)}-${(inst.max||0).toFixed(0)})</span></td>`;
    html += `<td><span class="sg-med">${(res.med||0).toFixed(2)}</span></td>`;
    html += `<td><div class="also-list">${ores.map(([code, s]) => confChip(`${oreName(code)} ${(s.prob*100).toFixed(0)}%`, data.scans || 0)).join('')}</div></td>`;
    html += `</tr>`;
  });

  html += '</tbody></table>';
  el.innerHTML = html;
}

// ============================================================
// INIT
// ============================================================
document.getElementById('ref-ore-select').addEventListener('change', e => {
  refOre = e.target.value;
  renderRefinery();
});

document.getElementById('loc-search').addEventListener('input', () => renderLocation());

// Nav click — use switchTab for all navigation
document.getElementById('nav').addEventListener('click', e => {
  const tab = e.target.dataset.tab;
  if (tab) switchTab(tab);
});

fetch('./data/mining_data.json')
  .then(r => {
    if (!r.ok) return fetch('./mining_data.json');
    return r;
  })
  .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status} - mining_data.json not found`); return r.json(); })
  .then(data => {
    D = data;
    if (!D.map_positions) D.map_positions = {stanton: {}, pyro: {}, nyx: {}};

    document.getElementById('loading').style.display = 'none';
    document.getElementById('panel-welcome').classList.add('active');

    const m = D.meta;
    document.getElementById('header-patch').textContent = `Patch ${m.current_patch} | Data: ${m.data_updated}`;
    document.getElementById('header-stats').innerHTML =
      `<span>${m.total_mining_locations} locations</span><span>${m.total_ores} ores</span><span>${m.total_refineries} refineries</span>`;

    initWelcome();
    renderFinder();
    renderLocation();
    renderRefinery();
    renderMethods();
    initMapEvents();
    loadInventory();
    renderInventory();

    // Signal tooltip event delegation (Material Finder location rows)
    document.addEventListener('mouseenter', e => {
      const icon = e.target.closest('.sig-icon');
      if (icon && icon.dataset.sigloc) showSigTooltip(icon.dataset.sigloc, icon, [...finderOres]);
    }, true);
    document.addEventListener('mouseleave', e => {
      if (e.target.closest('.sig-icon')) hideSigTooltip();
    }, true);

    // Inline map — click map icon in finder results
    document.addEventListener('click', e => {
      const btn = e.target.closest('.loc-map-btn');
      if (btn && btn.dataset.loc) {
        e.stopPropagation();
        const tr = btn.closest('tr');
        if (tr) toggleInlineMap(btn.dataset.loc, [...finderOres], tr);
      }
    });
  })
  .catch(err => {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error').innerHTML = `<div class="error-box"><h3>Could not load mining_data.json</h3><p>Place <strong>mining_data.json</strong> in the <strong>data/</strong> folder.</p><code>${err.message}</code></div>`;
  });
