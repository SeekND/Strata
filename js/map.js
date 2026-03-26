// ============================================================
// SC Hub Mining v3 — map.js (System Map)
// Interactive system map — restored from v2 with proper sizing,
// sidebar, text outlines, and rich hover tooltips
// ============================================================

let mapSystem = 'Stanton';
let mapHitAreas = [];

const MAP_COLORS = {
  star: '#f0c040',
  planet: '#4dc9f6',
  moon: '#a0a8b0',
  lagrange: '#e8751a',
  refinery: '#3dd68c',
  station: '#3dd68c',
  gate: '#9b7edb',
  ring: 'rgba(232,117,26,0.35)',
  orbitLine: 'rgba(255,255,255,0.08)',
  text: '#7a8290',
  textBright: '#dce0e8',
  highlight: '#fff',
  routeBest: '#3dd68c',
  routeNearest: '#7a8290',
};

// ============================================================
// MAIN RENDER
// ============================================================
function renderMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;
  const container = canvas.parentElement;
  const size = Math.min(container.clientWidth - 2, 1100);
  canvas.width = size; canvas.height = size;
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px';

  const result = drawSystemMap(canvas, mapSystem);
  mapHitAreas = result.hitAreas;
  renderMapSidebar();
}

// ============================================================
// DRAW SYSTEM MAP
// ============================================================
function drawSystemMap(canvas, system, opts = {}) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2, cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  const hitAreas = [];
  const posMap = {};

  const sysKey = system.toLowerCase();
  const positions = D.map_positions?.[sysKey] || {};
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

  // Text with black outline for readability
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

  // Per-ring multipliers
  const ringMults = {};
  for (const pos of Object.values(positions)) {
    if (pos.ring && pos.ring_mult && pos.ring_mult !== 1.0) ringMults[pos.ring] = pos.ring_mult;
  }
  const getRingR = (r) => r * (ringMults[r] || 1.0) * ringSpacing;

  // Orbit rings
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
  drawLabel(system.toUpperCase(), cx, cy + starR + 14, `700 ${s(size * 0.022)}px ${getFont()}`, MAP_COLORS.textBright);

  // Belts and rings
  let autoRingIdx = 0;
  for (const [code, loc] of Object.entries(locations)) {
    if (loc.system !== system) continue;
    if (loc.type === 'asteroid_belt') {
      const beltPos = positions[code];
      let beltRadius;
      if (beltPos?.ring) {
        // Use ring position if specified (e.g. Glaciem Ring at ring 3)
        beltRadius = getRingR(beltPos.ring);
      } else if (beltPos?.belt_radius) {
        beltRadius = beltPos.belt_radius * ringSpacing;
      } else {
        const baseR = (maxRing * ringSpacing + edgeR) * 0.45;
        beltRadius = baseR + (autoRingIdx * ringSpacing * 0.4);
        autoRingIdx++;
      }
      const beltColor = beltPos?.belt_color === 'grey' ? 'rgba(120,130,145,0.35)' : MAP_COLORS.ring;
      ctx.beginPath(); ctx.arc(cx, cy, beltRadius, 0, Math.PI * 2);
      ctx.strokeStyle = beltColor; ctx.lineWidth = size * 0.015; ctx.stroke();
      drawLabel(loc.display_name, cx, cy - beltRadius - 4, `500 ${s(size * 0.012)}px ${getMonoFont()}`, beltColor);
      posMap[code] = {x: cx, y: cy - beltRadius};
      hitAreas.push({x: cx, y: cy - beltRadius, r: 14, code, type: 'belt', data: {name: loc.display_name}});
    }
    if (loc.type === 'ring' && loc.parent) {
      // Skip rings whose parent is a moon — show in planet tooltip instead (e.g. Yela Belt)
      const parentLoc = locations[loc.parent];
      if (parentLoc?.type === 'moon') {
        // Don't draw visible ring — it'll appear in the parent planet's tooltip
        if (parentLoc?.parent && posMap[parentLoc.parent]) {
          posMap[code] = posMap[parentLoc.parent]; // resolve position to grandparent for distance calcs
        }
        continue;
      }
      let parentPos = positions[loc.parent];
      if (!parentPos?.ring) {
        if (parentLoc?.parent) parentPos = positions[parentLoc.parent];
      }
      if (parentPos?.ring) {
        const pp = toXY(parentPos.angle, getRingR(parentPos.ring));
        const ringR = s(size * 0.03);
        ctx.beginPath(); ctx.arc(pp.x, pp.y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = MAP_COLORS.ring; ctx.lineWidth = 2; ctx.stroke();
        drawLabel(loc.display_name, pp.x, pp.y + ringR + 8, `500 ${s(size * 0.010)}px ${getMonoFont()}`, MAP_COLORS.ring);
        posMap[code] = pp;
        hitAreas.push({x: pp.x, y: pp.y + ringR, r: 10, code, type: 'belt', data: {name: loc.display_name}});
      }
    }
  }

  // Planets, stations, L-points
  for (const [code, pos] of Object.entries(positions)) {
    if (code === '_config') continue;
    if (pos.edge || pos.belt_radius) continue;
    if (!pos.ring) continue;
    const radius = getRingR(pos.ring);
    const {x, y} = toXY(pos.angle, radius);

    const loc = locations[code];
    const isGate = loc?.type === 'gate' || code.includes('GATE');

    if (isGate) {
      const gateHasRefinery = hasGateRefinery(code, system);
      const gR = s(size * 0.008);
      ctx.beginPath(); ctx.arc(x, y, gR, 0, Math.PI * 2);
      ctx.strokeStyle = MAP_COLORS.gate; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, gR * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = MAP_COLORS.gate; ctx.fill();
      const gateInfo = findGateInfo(code, system, gates);
      const gateName = gateInfo?.name || loc?.display_name || code.replace(/_/g, ' ');
      drawLabel(gateName, x, y - gR - 4, `600 ${s(size * 0.013)}px ${getFont()}`, MAP_COLORS.gate);
      posMap[code] = {x, y};
      hitAreas.push({x, y, r: gR + 3, code, type: 'gate', data: {name: gateName, destination: gateInfo?.destination, refinery: gateHasRefinery}});
      continue;
    }

    if (pos.station) {
      const stR = s(size * 0.008);
      const isRef = loc?.has_refinery;
      ctx.fillStyle = isRef ? MAP_COLORS.station : MAP_COLORS.lagrange;
      ctx.fillRect(x - stR, y - stR, stR * 2, stR * 2);
      drawLabel(loc?.display_name || code, x, y - stR - 3, `600 ${s(size * 0.014)}px ${getFont()}`, isRef ? MAP_COLORS.station : MAP_COLORS.text);
      posMap[code] = {x, y};
      hitAreas.push({x, y, r: stR + 4, code, type: 'station', data: {name: loc?.display_name || code, refinery: isRef}});
      continue;
    }

    const planet = planets[code];
    if (planet && planet.system !== system) continue;

    const pR = s(size * (planet ? 0.018 : 0.012));
    ctx.beginPath(); ctx.arc(x, y, pR, 0, Math.PI * 2);
    ctx.fillStyle = planet ? MAP_COLORS.planet : MAP_COLORS.text; ctx.fill();
    posMap[code] = {x, y};

    // Moons
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
    drawLabel(label, x, y - pR - 4, `600 ${s(size * 0.016)}px ${getFont()}`, MAP_COLORS.textBright);
    if (moons.length > 0) {
      drawLabel(`${moons.length}m`, x, y + pR + 10, `500 ${s(size * 0.011)}px ${getMonoFont()}`, MAP_COLORS.text);
    }

    const lpoints = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'lagrange');
    const childRings = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'ring');
    const childStations = Object.entries(locations).filter(([, l]) => l.parent === code && l.type === 'station');
    // Include rings of moons (e.g. Yela Belt → parent=YEL which is moon of CRU)
    const moonRings = [];
    for (const [mcode] of moons) {
      const mRings = Object.entries(locations).filter(([, l]) => l.parent === mcode && l.type === 'ring');
      mRings.forEach(([rc, rl]) => moonRings.push({code: rc, name: rl.display_name, moonName: locations[mcode]?.display_name || mcode}));
    }

    hitAreas.push({x, y, r: pR + 3, code, type: planet ? 'planet' : 'node', data: {
      name: label, system, note: planet?.note || '',
      moons: moons.map(([c, l]) => ({code: c, name: l.display_name})),
      lpoints: lpoints.map(([c, l]) => ({code: c, name: l.display_name, refinery: l.has_refinery})),
      rings: childRings.map(([c, l]) => ({code: c, name: l.display_name})),
      moonRings,
      stations: childStations.map(([c, l]) => ({name: l.display_name, refinery: l.has_refinery})),
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
      drawLabel(lloc.display_name, lpos.x, lpos.y - lpR - 3, `600 ${s(size * 0.011)}px ${getMonoFont()}`, isRef ? MAP_COLORS.refinery : MAP_COLORS.text);
      posMap[lcode] = lpos;
      hitAreas.push({x: lpos.x, y: lpos.y, r: lpR + 3, code: lcode, type: 'lagrange', data: {
        name: lloc.display_name, refinery: isRef}});
    });
  }

  // Jump gates (edge of system)
  const gateR = s(size * 0.008);
  for (const [gkey, gate] of Object.entries(gates)) {
    if (gate.system !== system) continue;
    let posKey = null;
    for (const [pk, pv] of Object.entries(positions)) {
      if (pv.edge && pk.toLowerCase().includes(gate.destination.toLowerCase())) { posKey = pk; break; }
    }
    if (!posKey) continue;
    // Skip if already drawn (non-edge positioned gate)
    if (posMap[posKey]) continue;
    const gp = toXY(positions[posKey].angle, edgeR);
    const gateHasRef = hasGateRefinery(posKey, system);
    ctx.beginPath(); ctx.arc(gp.x, gp.y, gateR, 0, Math.PI * 2);
    ctx.strokeStyle = MAP_COLORS.gate; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(gp.x, gp.y, gateR * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = MAP_COLORS.gate; ctx.fill();
    drawLabel(`${gate.destination} GW`, gp.x, gp.y - gateR - 4, `600 ${s(size * 0.013)}px ${getFont()}`, MAP_COLORS.gate);
    const gwKey = `${gate.destination.toUpperCase()}_GATE`;
    posMap[gwKey] = gp;
    hitAreas.push({x: gp.x, y: gp.y, r: gateR + 3, code: gwKey, type: 'gate', data: {
      name: gate.name, destination: gate.destination, refinery: gateHasRef}});
  }

  // Edge stations from map_positions that aren't in locations or gates (PAS stations etc)
  const stR = s(size * 0.008);
  for (const [code, pos] of Object.entries(positions)) {
    if (code === '_config') continue;
    if (!pos.edge || !pos.station) continue;
    if (posMap[code]) continue; // Already drawn
    const gp = toXY(pos.angle, edgeR);
    const loc = locations[code];
    const name = loc?.display_name || MAP_NAME_OVERRIDES[code] || code.replace(/_/g, ' ');
    const isRef = loc?.has_refinery || false;
    ctx.fillStyle = isRef ? MAP_COLORS.station : MAP_COLORS.lagrange;
    ctx.fillRect(gp.x - stR, gp.y - stR, stR * 2, stR * 2);
    drawLabel(name, gp.x, gp.y - stR - 3, `600 ${s(size * 0.013)}px ${getFont()}`, isRef ? MAP_COLORS.station : MAP_COLORS.text);
    posMap[code] = gp;
    hitAreas.push({x: gp.x, y: gp.y, r: stR + 4, code, type: 'station', data: {name, refinery: isRef}});
  }

  // Resolve missing positions via parent chain
  for (const [code, loc] of Object.entries(locations)) {
    if (loc.system !== system || posMap[code]) continue;
    if (loc.parent && posMap[loc.parent]) {
      posMap[code] = {...posMap[loc.parent]};
    }
  }

  // Overlay: highlight + routes
  if (opts.highlight && posMap[opts.highlight]) {
    const hp = posMap[opts.highlight];
    const hr = s(size * 0.04);
    ctx.beginPath(); ctx.arc(hp.x, hp.y, hr, 0, Math.PI * 2);
    ctx.strokeStyle = MAP_COLORS.highlight; ctx.lineWidth = 2.5; ctx.stroke();
  }

  if (opts.routes) {
    for (const route of opts.routes) {
      const fromP = posMap[route.fromCode];
      const toP = posMap[route.toCode];
      if (!fromP || !toP) continue;
      ctx.beginPath(); ctx.moveTo(fromP.x, fromP.y); ctx.lineTo(toP.x, toP.y);
      ctx.strokeStyle = route.color || MAP_COLORS.routeBest;
      ctx.lineWidth = route.dashed ? 1.5 : 2;
      if (route.dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
      ctx.stroke(); ctx.setLineDash([]);
      if (route.label) {
        const mx = (fromP.x + toP.x) / 2, my = (fromP.y + toP.y) / 2;
        drawLabel(route.label, mx, my + 4, `700 ${s(size * 0.018)}px ${getMonoFont()}`, route.color || MAP_COLORS.routeBest);
      }
    }
  }

  return {hitAreas, posMap};
}

// Known items in map_positions that may not be in D.locations
const MAP_NAME_OVERRIDES = {
  PSA: 'PAS Alpha', PSD: 'PAS Delta', PST: 'PAS Theta', PSL: 'PAS Lambda',
};

// Gate helpers
function hasGateRefinery(code, system) {
  // Check refinery_stations for gates
  for (const [sname, station] of Object.entries(D.refineries?.stations || {})) {
    if (sname.toLowerCase().includes('gateway') && station.system === system) {
      // Match by code: "Refinement Processing - Pyro Gateway (Stanton)" → PYRO_GATE
      const dest = code.replace('_GATE', '').replace('_gate', '');
      if (sname.toLowerCase().includes(dest.toLowerCase())) return true;
    }
  }
  return false;
}

function findGateInfo(code, system, gates) {
  // Match position code (e.g. PYRO_GATE) to jump_gates entry
  const dest = code.replace('_GATE', '').replace('_gate', '');
  for (const [gkey, gate] of Object.entries(gates)) {
    if (gate.system === system && gate.destination.toUpperCase() === dest.toUpperCase()) return gate;
  }
  return null;
}

// Font helpers
function getFont() { return "'Space Grotesk', 'Rajdhani', sans-serif"; }
function getMonoFont() { return "'JetBrains Mono', 'Share Tech Mono', monospace"; }

// ============================================================
// MAP SIDEBAR — system summary + top ores
// ============================================================
function renderMapSidebar() {
  const el = document.getElementById('map-system-info');
  if (!el) return;

  let locCount = 0;
  const oreTotals = {};

  // Count from location_ores (new schema)
  for (const [code, locData] of Object.entries(D.location_ores || {})) {
    if (locData.system !== mapSystem) continue;
    locCount++;
    for (const method of ['ship', 'fps', 'vehicle']) {
      for (const entry of (locData.ores?.[method] || [])) {
        if (entry.ore === 'INERTMATERIAL') continue;
        if (!oreTotals[entry.ore]) oreTotals[entry.ore] = {prob: 0, count: 0};
        oreTotals[entry.ore].prob += entry.relative_probability / 100;
        oreTotals[entry.ore].count++;
      }
    }
  }

  // Also count from old schema
  for (const [code, loc] of Object.entries(D.locations || {})) {
    if (loc.system !== mapSystem) continue;
    const ld = D.ore_locations?.[code];
    if (!ld) continue;
    if (!D.location_ores?.[code]) locCount++;
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
  html += `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin-bottom:6px">${locCount} locations</div>`;
  html += `<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">Most common ores:</div>`;
  topOres.forEach(o => {
    html += `<div style="font-family:var(--font-mono);font-size:11px;margin-bottom:2px">${oreName(o.code)} <span class="mono" style="color:var(--text-secondary)">${(o.avgProb*100).toFixed(0)}%</span></div>`;
  });
  el.innerHTML = html;
}

// ============================================================
// MAP EVENTS — hover tooltips + system tab switching
// ============================================================
function initMapEvents() {
  const canvas = document.getElementById('map-canvas');
  const tooltip = document.getElementById('map-tooltip');
  if (!canvas || !tooltip) return;

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
          html += `<div class="also-list" style="margin:3px 0">${planetOres.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
        }
        if (d.moons.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">Moons:</div>`;
          d.moons.forEach(m => {
            const ores = getOreAt(m.code).slice(0, 3);
            html += `<div class="tt-row">${m.name}</div>`;
            if (ores.length) html += `<div class="also-list">${ores.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
          });
        }
        if (d.rings?.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">Rings:</div>`;
          d.rings.forEach(r => {
            const ores = getOreAt(r.code).slice(0, 3);
            html += `<div class="tt-row">${r.name}</div>`;
            if (ores.length) html += `<div class="also-list">${ores.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
          });
        }
        if (d.moonRings?.length) {
          d.moonRings.forEach(r => {
            const ores = getOreAt(r.code).slice(0, 3);
            html += `<div class="tt-row" style="margin-top:2px;color:var(--accent)">${r.name} <span style="color:var(--text-dim)">(${r.moonName})</span></div>`;
            if (ores.length) html += `<div class="also-list">${ores.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
          });
        }
        if (d.lpoints.length) {
          html += `<div class="tt-row" style="margin-top:4px;color:var(--accent)">L-Points:</div>`;
          d.lpoints.forEach(l => { html += `<div class="tt-row">${l.name}${l.refinery ? ' <span style="color:#3dd68c">REFINERY</span>' : ''}</div>`; });
        }
        if (d.stations?.length) {
          d.stations.forEach(s => { html += `<div class="tt-row">${s.name}${s.refinery ? ' <span style="color:#3dd68c">REFINERY</span>' : ''}</div>`; });
        }
      } else if (hit.type === 'lagrange' || hit.type === 'station') {
        html = `<div class="tt-title">${hit.data.name}</div>`;
        if (hit.data.refinery) html += `<div class="tt-row" style="color:#3dd68c">Refinery</div>`;
        const ores = getOreAt(hit.code).slice(0, 5);
        if (ores.length) html += `<div class="also-list" style="margin-top:4px">${ores.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
      } else if (hit.type === 'gate') {
        html = `<div class="tt-title">${hit.data.name}</div>`;
        if (hit.data.destination) html += `<div class="tt-row">Jump to ${hit.data.destination}</div>`;
        if (hit.data.refinery) html += `<div class="tt-row" style="color:#3dd68c">Refinery</div>`;
      } else if (hit.type === 'belt' || hit.type === 'node') {
        html = `<div class="tt-title">${hit.data.name}</div>`;
        const ores = getOreAt(hit.code).slice(0, 5);
        if (ores.length) html += `<div class="also-list" style="margin-top:4px">${ores.map(o => `<span class="also-chip">${oreName(o.code)} ${(o.prob*100).toFixed(0)}%</span>`).join('')}</div>`;
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

  document.getElementById('map-tabs')?.addEventListener('click', e => {
    const sys = e.target.dataset.sys;
    if (!sys) return;
    mapSystem = sys;
    document.querySelectorAll('.map-tab').forEach(t => t.classList.toggle('active', t.dataset.sys === sys));
    renderMap();
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('panel-map')?.classList.contains('active')) renderMap();
  });
}
