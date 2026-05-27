// ============================================================
// SC Hub Mining v3 — finder.js
// Material Finder + Expedition Planner
// Secondary ore scoring, location pinning, URL sharing
// ============================================================
let finderOres = new Set();
let finderSystem = 'all';
let finderMethod = 'all';
let finderRefSystem = 'all';
let finderExpeditionMode = false;
let finderPins = {}; // {ORE_CODE: 'LOC_CODE'}
let finderOreSearch = ''; // search filter for ore list
let finderFleet = { prospector: 0, mole_solo: 0, mole_crew: 0, golem: 0, moleCrew: 3 };
function loadFleet() { try { const s=localStorage.getItem('sc_hub_fleet'); if(s) finderFleet=JSON.parse(s); } catch(e){} }
function saveFleet() { try { localStorage.setItem('sc_hub_fleet',JSON.stringify(finderFleet)); } catch(e){} }
function resetFleet() { finderFleet={prospector:0,mole_solo:0,mole_crew:0,golem:0,moleCrew:3}; saveFleet(); renderFinder(); }
function adjustFleet(k,d) { finderFleet[k]=Math.max(0,(finderFleet[k]||0)+d); saveFleet(); renderFinder(); }
function totalFleet() { return finderFleet.prospector+finderFleet.mole_solo+finderFleet.mole_crew+finderFleet.golem; }
loadFleet();
const FINDER_EXCLUDE = new Set(['lagrange_field', 'asteroid_cluster']);

// ============================================================
// URL SHARING — update URL when state changes (no page reload)
// ============================================================
function updateFinderURL() {
  if (finderOres.size === 0) {
    // Clear URL params if no ores selected
    if (window.location.search) history.replaceState(null, '', window.location.pathname);
    return;
  }
  const parts = [...finderOres].map(ore => {
    if (finderPins[ore]) return `${ore}@${finderPins[ore]}`;
    return ore;
  });
  const params = new URLSearchParams();
  params.set('ores', parts.join(','));
  if (finderSystem !== 'all') params.set('sys', finderSystem);
  if (finderMethod !== 'all') params.set('method', finderMethod);
  history.replaceState(null, '', '?' + params.toString());
}

/** Build a shareable URL string for display/copy */
function getShareURL() {
  const base = window.location.origin + window.location.pathname;
  if (finderOres.size === 0) return base;
  const parts = [...finderOres].map(ore => {
    if (finderPins[ore]) return `${ore}@${finderPins[ore]}`;
    return ore;
  });
  let url = `${base}?ores=${parts.join(',')}`;
  if (finderSystem !== 'all') url += `&sys=${finderSystem}`;
  if (finderMethod !== 'all') url += `&method=${finderMethod}`;
  return url;
}

/** Toggle pin for ore at location */
function togglePin(ore, locCode) {
  if (finderPins[ore] === locCode) {
    delete finderPins[ore];
  } else {
    finderPins[ore] = locCode;
  }
  updateFinderURL();
  renderFinder();
}

/** Clear all pins */
function clearPins() {
  finderPins = {};
  updateFinderURL();
  renderFinder();
}

// ============================================================
// SECONDARY SCORE HELPER — used everywhere
// Given target ore + location data, compute secondary contribution
// ============================================================
function computeSecondaryScore(targetOre, locData, method) {
  let score = 0;
  const details = [];
  const ores = locData.ores?.[method] || [];
  for (const entry of ores) {
    if (!isOreVisible(entry, locData.type)) continue;
    const comp = getOreComposition(entry.ore, method === 'ship' ? 'surface' : method);
    if (!comp) continue;
    const sp = comp.parts?.find(p => p.ore === targetOre && p.ore !== comp.primary_ore);
    if (sp) {
      const avg = ((sp.min_pct || 0) + (sp.max_pct || 0)) / 2 / 100;
      const c = (entry.relative_probability ?? 0) * avg;
      score += c;
      details.push({ rock: entry.ore, rockName: oreName(entry.ore), pct: (avg * 100).toFixed(0), contribution: c });
    }
  }
  return { score, details };
}

/** Check if ore is ground-mineable (no refinery, no ship needed) */
function isGroundOre(oreCode) {
  const mm = D.ores?.[oreCode]?.mining_method || '';
  return ['fps', 'vehicle', 'fps_vehicle'].includes(mm);
}

// ============================================================
// MAIN RENDER
// ============================================================
function renderFinder() {
  const panel = document.getElementById('panel-finder');
  if (!panel) return;
  if (!document.getElementById('finder-system-chips')) {
    panel.innerHTML = '<div class="finder-grid"><div class="finder-sidebar"><div class="section-title">// Select Materials</div><div class="filter-row"><span class="filter-label">System:</span><div id="finder-system-chips" class="chip-group"></div></div><div class="filter-row"><span class="filter-label">Method:</span><div id="finder-method-chips" class="chip-group"></div></div><div class="filter-row"><span class="filter-label">Refinery:</span><div id="finder-ref-chips" class="chip-group"></div></div><div id="finder-mode-toggle" style="margin-bottom:8px"></div><div id="finder-ore-list"></div></div><div class="finder-main"><div id="finder-results"></div></div></div>';
  }
  buildChips(document.getElementById('finder-system-chips'),[['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],finderSystem,v=>{finderSystem=v},renderFinder);
  buildChips(document.getElementById('finder-method-chips'),[['All','all'],['Ship','ship'],['FPS','fps'],['Vehicle','vehicle']],finderMethod,v=>{finderMethod=v},renderFinder);
  buildChips(document.getElementById('finder-ref-chips'),[['All','all'],['Stanton','Stanton'],['Pyro','Pyro'],['Nyx','Nyx']],finderRefSystem,v=>{finderRefSystem=v},renderFinder);

  // Expedition toggle + fleet builder
  const modeEl = document.getElementById('finder-mode-toggle');
  if (modeEl) {
    if (finderOres.size >= 1) {
      let toggleHtml = `<div style="padding:8px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
        <div class="chip ${finderExpeditionMode?'active':''}" onclick="finderExpeditionMode=!finderExpeditionMode;renderFinder()" style="width:100%;text-align:center">${finderExpeditionMode ? '\u2605 Expedition Mode ON' : '\u2606 Expedition Mode'}</div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;text-align:center">${finderExpeditionMode ? 'Showing trip planner' : 'Plan a mining expedition'}</div>`;
      if (finderExpeditionMode) {
        const f = finderFleet;
        const fleetRow = (key, label) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0"><span style="font-size:11px">${label}</span><div style="display:flex;align-items:center;gap:4px"><span class="chip" onclick="adjustFleet('${key}',-1)" style="padding:1px 6px;font-size:12px;cursor:pointer">\u2212</span><span class="mono" style="width:20px;text-align:center;font-size:13px;color:${f[key]>0?'var(--cyan)':'var(--text-dim)'}">${f[key]}</span><span class="chip" onclick="adjustFleet('${key}',1)" style="padding:1px 6px;font-size:12px;cursor:pointer">+</span></div></div>`;
        toggleHtml += `<div style="margin-top:8px"><div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">FLEET:</div>
          ${fleetRow('prospector', 'Prospector')}
          ${fleetRow('mole_solo', 'MOLE (solo)')}
          ${fleetRow('mole_crew', 'MOLE (crew)')}
          ${fleetRow('golem', 'Golem')}`;
        if (f.mole_crew > 0) {
          toggleHtml += `<div style="display:flex;justify-content:space-between;align-items:center;padding:3px 0;margin-left:12px"><span style="font-size:10px;color:var(--text-dim)">MOLE crew size</span><div style="display:flex;gap:4px">${[2,3].map(n=>`<span class="chip ${f.moleCrew===n?'active':''}" onclick="finderFleet.moleCrew=${n};saveFleet();renderFinder()" style="padding:1px 8px;font-size:11px">${n}</span>`).join('')}</div></div>`;
        }
        const total = totalFleet();
        toggleHtml += `<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px;color:var(--text-dim)">${total} ship${total!==1?'s':''}</span>`;
        if (total > 0) toggleHtml += `<span class="chip" onclick="resetFleet()" style="font-size:9px;padding:1px 6px">Reset</span>`;
        else toggleHtml += `<span style="font-size:10px;color:var(--yellow)">Add ships or auto-assign</span>`;
        toggleHtml += `</div></div>`;
      }
      toggleHtml += '</div>';
      modeEl.innerHTML = toggleHtml;
    } else { modeEl.innerHTML = ''; }
  }

  // Ore list
  const oreList = document.getElementById('finder-ore-list');
  const oresArr = [];
  for (const [code, ore] of Object.entries(D.ores || {})) {
    if (ore.form === 'waste') continue;
    const mm = ore.mining_method || 'ship';
    if (finderMethod === 'ship' && mm !== 'ship') continue;
    if (finderMethod === 'fps' && mm !== 'fps' && mm !== 'fps_vehicle') continue;
    if (finderMethod === 'vehicle' && mm !== 'vehicle' && mm !== 'fps_vehicle') continue;
    // For fps_vehicle ores, tag them with the filtered method so the user knows context
    let displayMethod = mm;
    if (mm === 'fps_vehicle' && finderMethod === 'fps') displayMethod = 'fps';
    if (mm === 'fps_vehicle' && finderMethod === 'vehicle') displayMethod = 'vehicle';
    oresArr.push({code, name: ore.display_name, method: displayMethod});
  }
  oresArr.sort((a, b) => a.name.localeCompare(b.name));

  // Search box
  let searchHtml = `<input type="text" id="finder-ore-search" placeholder="Search materials..." style="width:100%;padding:6px 10px;margin-bottom:6px;background:var(--bg-input,var(--bg-card));border:1px solid var(--border);color:var(--text-primary);font-family:var(--font-mono);font-size:12px;outline:none" value="${finderOreSearch || ''}">`;
  const searchTerm = (finderOreSearch || '').toLowerCase();
  const filtered = searchTerm ? oresArr.filter(o => o.name.toLowerCase().includes(searchTerm) || o.code.toLowerCase().includes(searchTerm)) : oresArr;

  oreList.innerHTML = searchHtml + filtered.map(({code, name, method}) =>
    `<div class="chip ${finderOres.has(code)?'active':''}" data-ore="${code}" style="margin-bottom:2px">${miningMethodTag(method||'ship')} ${name}</div>`
  ).join('');

  // Search event
  const searchInput = document.getElementById('finder-ore-search');
  if (searchInput) {
    searchInput.addEventListener('input', e => { finderOreSearch = e.target.value; renderFinder(); });
    // Restore cursor position after re-render
    if (document.activeElement?.id !== 'finder-ore-search' && finderOreSearch) {
      requestAnimationFrame(() => { searchInput.focus(); searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length; });
    }
  }

  oreList.querySelectorAll('.chip[data-ore]').forEach(chip => {
    chip.onclick = () => {
      const c = chip.dataset.ore;
      if (finderOres.has(c)) { finderOres.delete(c); delete finderPins[c]; }
      else finderOres.add(c);
      updateFinderURL();
      renderFinder();
    };
  });

  // Pin summary + share button (below expedition toggle)
  const pinCount = Object.keys(finderPins).length;
  if (modeEl && finderOres.size > 0) {
    let extraHtml = '';
    if (pinCount > 0) {
      extraHtml += `<div style="font-size:10px;color:var(--yellow);margin-top:4px;text-align:center">\u{1F4CC} ${pinCount} location${pinCount > 1 ? 's' : ''} pinned <span class="chip" onclick="clearPins()" style="font-size:9px;padding:1px 6px;margin-left:4px">Clear</span></div>`;
    }
    extraHtml += `<div style="margin-top:6px"><button class="chip" onclick="copyShareURL()" style="width:100%;text-align:center;font-size:10px">\u{1F517} Copy Share Link</button></div>`;
    modeEl.innerHTML += extraHtml;
  }

  if (finderExpeditionMode && finderOres.size >= 1) renderExpeditionPlanner();
  else renderFinderResults();
}

/** Copy share URL to clipboard */
function copyShareURL() {
  const url = getShareURL();
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.querySelector('.chip[onclick*="copyShareURL"]');
    if (btn) { const orig = btn.innerHTML; btn.innerHTML = '\u2714 Link copied!'; setTimeout(() => { btn.innerHTML = orig; }, 2000); }
  }).catch(() => { prompt('Copy this link:', url); });
}

/** Open a signal popup filtered to expedition ores + their secondary rocks */
function openExpeditionSignals() {
  const selectedOres = [...finderOres];
  // Collect all relevant ore codes: selected ores + secondary source rocks
  const allOres = new Set(selectedOres);
  for (const ore of selectedOres) {
    const comp = getOreComposition(ore);
    if (comp?.parts) {
      for (const p of comp.parts) { if (p.ore !== 'INERTMATERIAL') allOres.add(p.ore); }
    }
    // Also add ores whose rocks contain our target as secondary
    for (const [, compData] of Object.entries(D.compositions || {})) {
      for (const p of compData.parts || []) {
        if (p.ore === ore && p.ore !== compData.primary_ore) allOres.add(compData.primary_ore);
      }
    }
  }

  // Build signal table for these ores
  const tierColors = { legendary: '#F0C040', epic: '#9B7EDB', rare: '#4DC9F6', uncommon: '#3DD68C', common: '#7A8290' };
  let tableRows = '';
  const seen = new Set();
  const signals = Object.values(D.scanner_signals || {}).sort((a, b) => a.signal_value - b.signal_value);

  for (const sig of signals) {
    const baseOre = sig.ore_hint?.split('_')[0];
    if (!baseOre || !allOres.has(baseOre) || seen.has(baseOre)) continue;
    seen.add(baseOre);

    const name = oreName(baseOre);
    const maxC = typeof getClusterMax === 'function' ? getClusterMax(baseOre) : 3;
    const diff = getOreDifficulty(baseOre);
    const base = sig.signal_value;
    const tc = tierColors[sig.tier] || '#7A8290';
    const dc = diff?.resistance >= 0.7 ? '#F85149' : diff?.resistance >= 0.4 ? '#E8751A' : diff?.resistance >= 0 ? '#F0C040' : '#3DD68C';
    const dl = diff?.resistance >= 0.7 ? 'EXT' : diff?.resistance >= 0.4 ? 'HRD' : diff?.resistance >= 0 ? 'MED' : 'EZ';
    const isSelected = selectedOres.includes(baseOre);

    let cells = `<td style="color:${tc};font-weight:600${isSelected ? ';text-decoration:underline' : ''}">${name}${isSelected ? ' \u2605' : ''}</td>`;
    cells += `<td style="color:#4DC9F6;font-weight:700">${base.toFixed(0)}</td>`;
    for (let i = 2; i <= 5; i++) cells += i <= maxC ? `<td>${(base * i).toFixed(0)}</td>` : `<td style="color:#30363D">\u2014</td>`;
    cells += `<td style="color:${dc}">${dl}</td>`;
    tableRows += `<tr>${cells}</tr>`;
  }

  const rowCount = seen.size;
  const height = Math.min(80 + rowCount * 22, 600);
  const width = 420;

  const popupHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Expedition Signals</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0D1117;color:#E6EDF3;font-family:'Segoe UI',system-ui,sans-serif;font-size:11px;padding:4px;overflow-y:auto}
table{width:100%;border-collapse:collapse}th{background:#161B22;color:#E8751A;font-size:9px;text-transform:uppercase;letter-spacing:1px;padding:3px 4px;text-align:center;border-bottom:1px solid #30363D;position:sticky;top:0}
th:first-child{text-align:left}td{padding:3px 4px;text-align:center;border-bottom:1px solid #21262D;font-family:'Consolas','Courier New',monospace;font-size:11px}td:first-child{text-align:left;font-family:'Segoe UI',system-ui,sans-serif}
tr:hover td{background:#21262D}.hdr{display:flex;justify-content:space-between;align-items:center;padding:2px 4px 6px;border-bottom:1px solid #30363D;margin-bottom:4px}.hdr span{color:#E8751A;font-size:10px;letter-spacing:2px;text-transform:uppercase}.hdr small{color:#484F58;font-size:9px}</style>
</head><body><div class="hdr"><span>// Expedition Signals</span><small>${selectedOres.map(oreName).join(', ')}</small></div>
<table><thead><tr><th style="text-align:left">Ore</th><th>1\u00d7</th><th>2\u00d7</th><th>3\u00d7</th><th>4\u00d7</th><th>5\u00d7</th><th>Diff</th></tr></thead><tbody>${tableRows}</tbody></table>
<div style="padding:4px;font-size:9px;color:#484F58;margin-top:4px">\u2605 = target material. Others are rocks containing your targets as secondary.</div>
</body></html>`;

  const popup = window.open('', 'sc_hub_exp_signals', `width=${width},height=${height},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`);
  if (popup) { popup.document.write(popupHtml); popup.document.close(); }
  else alert('Popup blocked \u2014 please allow popups for the signal overlay.');
}

// ============================================================
// STANDARD TABLE — with secondary scoring
// ============================================================
function renderFinderResults() {
  const el = document.getElementById('finder-results');
  if (!el) return;
  if (finderOres.size === 0) { el.innerHTML = '<div class="card"><div class="card-title">Select one or more materials from the sidebar</div><div style="color:var(--text-secondary)">Click materials to find the best mining locations. Secondary ore in rock compositions is included in scoring.</div></div>'; return; }

  const selectedOres = [...finderOres];
  const scores = gatherLocationScores(selectedOres);
  scores.sort((a, b) => b.weightedScore - a.weightedScore);
  const top = scores.slice(0, 25);
  if (top.length === 0) { el.innerHTML = '<div class="card">No locations found for selected materials.</div>'; return; }

  let html = `<div class="section-title">// Top locations for ${selectedOres.map(oreName).join(' + ')} (${top.length} shown)</div>`;

  // Refinery insight
  const primaryOre = selectedOres[0];
  if (!isGroundOre(primaryOre)) {
    const primaryRef = findBestRefineryForOre(primaryOre, finderRefSystem);
    html += '<div class="insight"><div class="insight-title">Best Refineries</div>';
    if (primaryRef) {
      html += `<div>${oreName(primaryOre)}: <span class="highlight">${primaryRef.station}</span> ${fmtYield(primaryRef.value)} (${primaryRef.system})</div>`;
      for (let i = 1; i < selectedOres.length; i++) {
        if (!isGroundOre(selectedOres[i])) html += renderSecondaryRefInsight(selectedOres[i], primaryRef);
      }
    }
    html += '</div>';
  }

  // Table
  const hasScans = top.some(r => r.scans > 0);
  const hasSecondary = top.some(r => Object.values(r.secondaryInfo || {}).some(s => s.score > 0));
  html += '<div class="tbl-wrap"><table><thead><tr><th>Location</th><th>System</th>';
  selectedOres.forEach(ore => { html += `<th>${oreName(ore)}</th>`; });
  html += '<th>Score</th>';
  if (hasSecondary) html += '<th>+Secondary</th>';
  if (hasScans) html += '<th>Scans</th>';
  html += '<th>Also Found Here</th></tr></thead><tbody>';

  top.forEach(row => {
    html += '<tr>';
    const refs = isGroundOre(primaryOre) ? {} : findRefineries(row.code, primaryOre);
    html += `<td>${renderLocationCell(row, refs)}</td><td>${systemTag(row.system)}</td>`;
    selectedOres.forEach(ore => {
      const os = row.oreScores[ore];
      const prob = os ? (os.prob != null ? os.prob : os.relative_probability / 100) : null;
      const sec = row.secondaryInfo?.[ore];
      const isPinned = finderPins[ore] === row.code;
      const hasValue = prob != null || (sec?.score > 0);

      let cellContent = prob != null ? fmtProb(prob) : '<span class="mono v-na">\u2014</span>';
      if (sec?.score > 0 && prob == null) {
        cellContent = `<span class="mono" style="color:var(--yellow)" title="Via ${sec.details.map(d=>d.rockName).join(', ')}">${sec.score.toFixed(1)}\u2020</span>`;
      }

      const pinStyle = isPinned ? 'background:rgba(232,117,26,0.15);border:2px solid var(--accent);cursor:pointer' : (hasValue ? 'cursor:pointer' : '');
      const pinTitle = hasValue ? (isPinned ? 'Click to unpin' : 'Click to pin this location for ' + oreName(ore)) : '';
      const pinClick = hasValue ? `onclick="togglePin('${ore}','${row.code}')"` : '';

      html += `<td style="${pinStyle}" title="${pinTitle}" ${pinClick}>${cellContent}${isPinned ? ' <span style="color:var(--accent);font-size:10px">\u{1F4CC}</span>' : ''}</td>`;
    });
    html += `<td class="mono" style="font-weight:700">${(row.weightedScore * 100).toFixed(0)}%</td>`;
    if (hasSecondary) {
      const totalSec = Object.values(row.secondaryInfo || {}).reduce((s, v) => s + v.score, 0);
      if (totalSec > 0) {
        const secTip = Object.entries(row.secondaryInfo || {}).filter(([,v]) => v.score > 0).map(([ore, v]) => `${oreName(ore)}: ${v.details.map(d => `${d.rockName} ${d.pct}%`).join(', ')}`).join('\n');
        html += `<td class="mono" style="color:var(--yellow)" title="${secTip}">+${totalSec.toFixed(1)}</td>`;
      } else html += '<td></td>';
    }
    if (hasScans) html += `<td>${row.scans > 0 ? fmtScans(row.scans) + ' ' + confidence(row.scans) : '<span class="mono v-na">\u2014</span>'}</td>`;
    const others = getOreAt(row.code).filter(o => !selectedOres.includes(o.code) && o.prob >= 0.10).sort((a, b) => b.prob - a.prob).slice(0, 5);
    html += `<td><div class="also-list">${others.map(o => confChip(oreName(o.code) + ' ' + (o.prob * 100).toFixed(0) + '%', row.scans || 0)).join('')}</div></td></tr>`;
  });
  html += '</tbody></table></div>';

  // Secondary explanation if relevant
  if (hasSecondary) {
    html += '<div style="margin-top:8px;font-size:11px;color:var(--text-dim)">\u2020 = ore obtained as secondary from cracking other rocks at this location. Score includes secondary yield weighted by rock probability \u00d7 composition %.</div>';
  }

  el.innerHTML = html;
}

// ============================================================
// GATHER LOCATION SCORES — now with secondary scoring
// ============================================================
function gatherLocationScores(selectedOres) {
  const scores = [];
  for (const [locCode, locData] of Object.entries(D.location_ores || {})) {
    if (finderSystem !== 'all' && locData.system !== finderSystem) continue;
    if (FINDER_EXCLUDE.has(locData.type)) continue;
    const oreScores = {};
    const secondaryInfo = {};
    let totalProb = 0, found = 0;

    for (const ore of selectedOres) {
      const mm = D.ores?.[ore]?.mining_method || '';
      const oreIsGround = ['fps', 'vehicle', 'fps_vehicle'].includes(mm);

      // Determine search methods
      let methods;
      if (finderMethod === 'all') methods = ['ship', 'fps', 'vehicle'];
      else if (finderMethod === 'surface') methods = ['fps', 'vehicle'];
      else if (finderMethod === 'fps') methods = ['fps'];
      else if (finderMethod === 'vehicle') methods = ['vehicle'];
      else methods = [finderMethod];

      // For ground ores, always search both fps and vehicle
      if (oreIsGround) {
        if (!methods.includes('fps')) methods = [...methods, 'fps'];
        if (!methods.includes('vehicle')) methods = [...methods, 'vehicle'];
      }
      const searchMethods = [...new Set(methods)];

      for (const method of searchMethods) {
        const entry = (locData.ores?.[method] || []).find(o => o.ore === ore && isOreVisible(o, locData.type));
        if (entry) {
          const prob = (entry.relative_probability ?? 0) / 100;
          if (!oreScores[ore] || prob > oreScores[ore].prob) oreScores[ore] = { prob, method, relative_probability: entry.relative_probability ?? 0 };
        }
        // Compute secondary contribution
        const sec = computeSecondaryScore(ore, locData, method);
        if (sec.score > 0) {
          if (!secondaryInfo[ore] || sec.score > secondaryInfo[ore].score) secondaryInfo[ore] = sec;
        }
      }
      if (oreScores[ore]) { totalProb += oreScores[ore].prob; found++; }
      else if (secondaryInfo[ore]?.score > 0) {
        // Ore not directly present but available as secondary
        totalProb += secondaryInfo[ore].score / 100;
        found++;
      }
    }
    if (found === 0) continue;
    const avgProb = totalProb / selectedOres.length;
    // Add secondary boost to score
    const secBoost = Object.values(secondaryInfo).reduce((s, v) => s + v.score, 0) / 100 / selectedOres.length;
    const scans = locData.scans || 0;
    const baseScore = avgProb + secBoost * 0.3; // Secondary worth 30% of primary
    // Refinery convenience: boost locations near good refineries for ship ores
    const shipOres = selectedOres.filter(o => !['fps', 'vehicle', 'fps_vehicle'].includes(D.ores?.[o]?.mining_method || ''));
    const refBonus = shipOres.length > 0 ? shipOres.reduce((s, o) => s + computeRefineryConvenience(locCode, o), 0) / shipOres.length * 0.001 : 0;
    const finalScore = baseScore + refBonus;
    scores.push({ code: locCode, name: locData.name, system: locData.system, type: locData.type, oreScores, secondaryInfo, avgProb, found, scans, weightedScore: scans > 0 ? finalScore * (scans / (scans + 200)) : finalScore });
  }
  return scores;
}

// ============================================================
// EXPEDITION PLANNER — fleet assignment, wave display
// ============================================================
function renderExpeditionPlanner() {
  const el = document.getElementById('finder-results');
  if (!el) return;
  const selectedOres = [...finderOres];

  // Build stops (greedy cover with pins)
  const perOre = {};
  for (const ore of selectedOres) perOre[ore] = rankLocationsForOre(ore, finderMethod, finderSystem);
  const locCov = {};
  for (const ore of selectedOres) for (const loc of perOre[ore]) {
    if (!locCov[loc.code]) locCov[loc.code] = { name: loc.name, system: loc.system, type: loc.type, ores: {} };
    if (!locCov[loc.code].ores[ore] || loc.totalScore > locCov[loc.code].ores[ore].score)
      locCov[loc.code].ores[ore] = { score: loc.totalScore, prob: loc.primaryScore, method: loc.method, secondaryScore: loc.secondaryScore };
  }
  const ranked = Object.entries(locCov).map(([code, d]) => ({ code, ...d, oreCount: Object.keys(d.ores).length, totalScore: Object.values(d.ores).reduce((s, o) => s + o.score, 0) })).sort((a, b) => (b.oreCount * 100 + b.totalScore) - (a.oreCount * 100 + a.totalScore));
  const plan = []; const remaining = new Set(selectedOres);
  if (Object.keys(finderPins).some(o => selectedOres.includes(o))) {
    const pbl = {};
    for (const [o, l] of Object.entries(finderPins)) { if (!remaining.has(o)) continue; if (!pbl[l]) pbl[l] = []; pbl[l].push(o); }
    for (const [lc, pinnedOres] of Object.entries(pbl)) {
      let le = ranked.find(r => r.code === lc);
      // If pinned location isn't in ranked (secondary-only), create an entry
      if (!le) {
        const locData = D.location_ores?.[lc] || {};
        const loc = D.locations?.[lc];
        if (loc) {
          const ores = {};
          for (const ore of pinnedOres) {
            // Check for secondary score at this location
            for (const method of ['ship', 'fps', 'vehicle']) {
              const sec = computeSecondaryScore(ore, locData, method);
              if (sec.score > 0) { ores[ore] = { score: sec.score, prob: 0, method, secondaryScore: sec.score }; break; }
            }
          }
          if (Object.keys(ores).length > 0) {
            le = { code: lc, name: loc.display_name || lc, system: loc.system, type: loc.type, ores, oreCount: Object.keys(ores).length, totalScore: Object.values(ores).reduce((s, o) => s + o.score, 0) };
          }
        }
      }
      if (!le) continue;
      const ah = [...new Set([...Object.keys(le.ores).filter(o => remaining.has(o)), ...pinnedOres.filter(o => remaining.has(o))])];
      plan.push({ ...le, targetOres: ah, isPinned: true });
      ah.forEach(o => remaining.delete(o));
    }
  }
  for (const loc of ranked) { if (remaining.size === 0) break; const n = Object.keys(loc.ores).filter(o => remaining.has(o)); if (!n.length) continue; plan.push({ ...loc, targetOres: n }); n.forEach(o => remaining.delete(o)); }

  // Build ore details
  const stops = plan.map((stop, idx) => {
    const allGround = stop.targetOres.every(o => isGroundOre(o));
    const oreDetails = stop.targetOres.map(ore => {
      const diff = getOreDifficulty(ore); const ground = isGroundOre(ore);
      return { ore, name: oreName(ore), prob: stop.ores[ore]?.prob || 0, secScore: stop.ores[ore]?.secondaryScore || 0, method: stop.ores[ore]?.method || 'ship', difficulty: diff, nearRef: ground ? null : findRefineries(stop.code, ore), bestRef: ground ? null : findBestRefineryForOre(ore, finderRefSystem), isGround: ground, signal: ground ? null : getOreSignal(ore), comp: getOreComposition(ore) };
    });
    const hardest = oreDetails.filter(o => !o.isGround).reduce((a, b) => ((b.difficulty?.resistance || 0) > (a.difficulty?.resistance || 0) ? b : a), oreDetails[0]);
    return { stopNum: idx + 1, code: stop.code, name: stop.name, system: stop.system, type: stop.type, oreDetails, allGround, isPinned: stop.isPinned, hardestDiff: hardest?.difficulty, ores: stop.ores, targetOres: stop.targetOres };
  });

  // Fleet assignment
  const pool = buildFleetPool();
  const hasFleet = pool.length > 0;
  const assignments = hasFleet ? assignFleetToStops(stops, pool) : stops.map(s => {
    if (s.allGround) return { ...s, ship: null, shipLabel: getGroundEquip(s), loadout: null, warnings: [] };
    const rec = getShipRecommendation(s.hardestDiff);
    const lo = getLoadoutForOre(rec.key === 'mole' ? 'mole_crew' : rec.key || 'prospector', 'medium', s.oreDetails.find(o => !o.isGround)?.ore, s.hardestDiff);
    return { ...s, ship: { type: rec.key }, shipLabel: rec.ship, loadout: lo, warnings: [] };
  });

  // Optimize route order by distance
  const optimized = optimizeRoute(assignments);

  // Render
  const allSystems = [...new Set(stops.map(s => s.system))];
  const fleetLabel = hasFleet ? `${pool.length} ship${pool.length !== 1 ? 's' : ''} (${fleetSummaryText()})` : 'Auto-assign';
  let html = `<div class="section-title">// Expedition Planner \u2014 ${selectedOres.length} Material${selectedOres.length !== 1 ? 's' : ''}</div>`;
  html += `<div style="color:var(--text-secondary);margin-bottom:16px">${stops.length} stop${stops.length !== 1 ? 's' : ''}. Fleet: ${fleetLabel}. Route optimized by distance.</div>`;
  html += `<div class="card" style="border-left:3px solid var(--accent);margin-bottom:16px"><div style="display:flex;gap:24px;flex-wrap:wrap;align-items:center">
    <div><div style="font-size:11px;color:var(--text-dim)">STOPS</div><div style="font-size:24px;font-weight:700;color:var(--accent)">${stops.length}</div></div>
    <div><div style="font-size:11px;color:var(--text-dim)">MATERIALS</div><div style="font-size:24px;font-weight:700;color:var(--cyan)">${selectedOres.length - remaining.size}/${selectedOres.length}</div></div>
    <div><div style="font-size:11px;color:var(--text-dim)">FLEET</div><div style="font-size:14px;font-weight:700">${fleetLabel}</div></div>
    <div><div style="font-size:11px;color:var(--text-dim)">SYSTEMS</div><div style="font-size:14px;font-weight:700">${allSystems.map(s => systemTag(s)).join(' ')}</div></div>
    <div style="margin-left:auto">${remaining.size > 0 ? `<div style="color:var(--red)">\u26A0 ${[...remaining].map(oreName).join(', ')} not found</div>` : '<div style="color:var(--green)">\u2714 All materials covered</div>'}</div>
  </div></div>`;

  // Route summary
  if (optimized.length > 1) {
    const routeNames = optimized.filter(a => !a.isExtraShip).map(a => a.name);
    const refStops = optimized.routeRefinery ? [optimized.routeRefinery] : [];
    html += `<div style="margin-bottom:12px;font-size:12px;color:var(--text-secondary);padding:8px 12px;border-left:2px solid var(--accent)"><span style="color:var(--accent)">ROUTE:</span> ${routeNames.join(' \u2192 ')}${refStops.length ? ' \u2192 <span style="color:var(--green)">' + refStops[0] + '</span> (refine)' : ''}</div>`;
  }

  for (const a of optimized) html += renderExpStopCard(a);

  // Refinery + ground notes
  const shipOreList = stops.flatMap(s => s.oreDetails).filter(od => !od.isGround);
  if (shipOreList.length > 0) {
    const byRef = {};
    for (const od of shipOreList) {
      let ref = findBestRefineryForOre(od.ore, finderRefSystem);
      // Fallback: if no yield data, use nearest refinery from the stop
      if (!ref && od.nearRef?.nearest) {
        ref = { station: od.nearRef.nearest.name, value: od.nearRef.nearest.yield, system: D.locations?.[refStationToLocCode(od.nearRef.nearest.name)]?.system || '?' };
      }
      const key = ref?.station || 'Nearest refinery';
      if (!byRef[key]) byRef[key] = { ref, ores: [] };
      byRef[key].ores.push(od);
    }
    html += '<div class="card" style="margin-top:16px;border-left:3px solid var(--green)"><div class="section-title" style="margin-bottom:8px">// Refinery Plan</div>';
    for (const [station, data] of Object.entries(byRef)) {
      const yieldStr = data.ref?.value != null ? ' ' + fmtYield(data.ref.value) : '';
      html += `<div style="margin-bottom:6px;font-size:13px"><strong style="color:var(--green)">${station}</strong> ${data.ref?.system ? '(' + data.ref.system + ')' : ''} \u2014 ${data.ores.map(o => o.name + yieldStr).join(', ')}</div>`;
    }
    html += '</div>';
  }
  const groundOreList = stops.flatMap(s => s.oreDetails).filter(od => od.isGround);
  if (groundOreList.length > 0) html += `<div style="margin-top:12px;font-size:12px;color:var(--text-dim);padding:8px 12px;border-left:2px solid var(--border)">${groundOreList.map(o => o.name).join(', ')} \u2014 sold directly, no refining.</div>`;
  html += `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="chip green" onclick="exportExpedition()" style="padding:8px 16px">\u{1F4CB} Copy Plan</button><button class="chip" onclick="openExpeditionSignals()" style="padding:8px 16px">\u{1F4E1} Signal Guide</button><button class="chip" onclick="finderExpeditionMode=false;renderFinder()" style="padding:8px 16px">Back to Table</button></div>`;
  el.innerHTML = html;
}

// ============================================================
// FLEET HELPERS
// ============================================================
function buildFleetPool() {
  const pool = [];
  for (let i = 0; i < finderFleet.prospector; i++) pool.push({ type: 'prospector', id: `Prospector #${i + 1}`, label: 'Prospector' });
  for (let i = 0; i < finderFleet.mole_solo; i++) pool.push({ type: 'mole_solo', id: `MOLE Solo #${i + 1}`, label: 'MOLE (solo)' });
  for (let i = 0; i < finderFleet.mole_crew; i++) pool.push({ type: 'mole_crew', id: `MOLE Crew #${i + 1}`, label: `MOLE (${finderFleet.moleCrew}-crew)` });
  for (let i = 0; i < finderFleet.golem; i++) pool.push({ type: 'golem', id: `Golem #${i + 1}`, label: 'Golem' });
  return pool;
}
function fleetSummaryText() {
  const p = []; if (finderFleet.prospector) p.push(`${finderFleet.prospector} Prospector`); if (finderFleet.mole_solo) p.push(`${finderFleet.mole_solo} MOLE solo`); if (finderFleet.mole_crew) p.push(`${finderFleet.mole_crew} MOLE crew`); if (finderFleet.golem) p.push(`${finderFleet.golem} Golem`); return p.join(', ') || 'none';
}
function getGroundEquip(stop) {
  const hasFps = stop.oreDetails.some(o => { const mm = D.ores?.[o.ore]?.mining_method || ''; return mm === 'fps' || mm === 'fps_vehicle'; });
  const hasVeh = stop.oreDetails.some(o => { const mm = D.ores?.[o.ore]?.mining_method || ''; return mm === 'vehicle' || mm === 'fps_vehicle'; });
  return hasFps && hasVeh ? 'ATLS Geo' : hasVeh ? 'ROC / GEO' : 'Pyro Multi-Tool';
}
function shipCapability(type, diff) {
  const res = diff?.resistance || 0; const instab = diff?.instability || 0;
  if (type === 'mole_crew') return 100;
  if (type === 'mole_solo') return res >= 0.7 ? 80 : 70;
  if (type === 'golem') return res >= 0.4 ? 60 : 40;
  return res >= 0.7 ? 10 : instab >= 800 ? 15 : 50;
}
function assignFleetToStops(stops, pool) {
  const results = [];
  const sorted = [...stops].sort((a, b) => (b.hardestDiff?.resistance || 0) - (a.hardestDiff?.resistance || 0));
  const assigned = []; // tracks which ships are used (for labelling reuse)

  // Phase 1: assign best available ship to each stop (reuse if needed)
  for (const stop of sorted) {
    if (stop.allGround) { results.push({ ...stop, ship: null, shipLabel: getGroundEquip(stop), loadout: null, warnings: [] }); continue; }

    // Pick best ship from full pool for this stop's difficulty
    const ranked = [...pool].sort((a, b) => shipCapability(b.type, stop.hardestDiff) - shipCapability(a.type, stop.hardestDiff));
    const best = ranked[0];
    const hardOre = stop.oreDetails.find(o => !o.isGround);
    const lo = getLoadoutForOre(best.type, 'optimized', hardOre?.ore, stop.hardestDiff);
    const isReuse = assigned.includes(best);
    if (!isReuse) assigned.push(best);
    results.push({ ...stop, ship: best, shipLabel: `${best.id} (${best.label})`, loadout: lo, warnings: getShipWarnings(best.type, stop.oreDetails), isReuse });
  }

  // Phase 2: extra ships (more ships than stops) → add as duplicates at hardest stops
  const usedIds = new Set(results.filter(r => r.ship).map(r => r.ship.id));
  const extras = pool.filter(s => !usedIds.has(s.id));
  for (const extra of extras) {
    const shipStops = results.filter(r => !r.allGround && r.ship);
    if (!shipStops.length) break;
    shipStops.sort((a, b) => (b.hardestDiff?.resistance || 0) - (a.hardestDiff?.resistance || 0));
    const tgt = shipStops[0];
    const lo = getLoadoutForOre(extra.type, 'optimized', tgt.oreDetails.find(o => !o.isGround)?.ore, tgt.hardestDiff);
    results.push({ ...tgt, ship: extra, shipLabel: `${extra.id} (${extra.label})`, loadout: lo, warnings: getShipWarnings(extra.type, tgt.oreDetails), isExtraShip: true });
  }

  results.sort((a, b) => a.stopNum - b.stopNum);
  return results;
}
function getShipWarnings(type, oreDetails) {
  const w = [];
  for (const od of oreDetails) {
    if (od.isGround || !od.difficulty) continue;
    if (od.difficulty.resistance >= 0.7 && type === 'prospector') w.push(`${od.name} EXTREME \u2014 Prospector will struggle`);
    if (od.difficulty.resistance >= 0.7 && type === 'golem') w.push(`${od.name} EXTREME \u2014 needs Sabir every rock`);
    if (od.difficulty.instability >= 800 && type === 'prospector') w.push(`${od.name} extreme instability \u2014 risky solo`);
  }
  return w;
}
function getShipRecommendation(diff) {
  const ships = D.equipment?.ships || {}; const res = diff?.resistance || 0;
  if (res >= 0.7 || (diff?.instability || 0) >= 800) return { ship: ships.mole?.name || 'MOLE (crew)', key: 'mole' };
  if (res >= 0.4) return { ship: ships.prospector?.name || 'Prospector', key: 'prospector' };
  return { ship: ships.prospector?.name || 'Prospector', key: 'prospector' };
}

// ============================================================
// ROUTE OPTIMIZATION — nearest-neighbor TSP with refinery endpoint
// ============================================================
function distBetween(codeA, codeB) {
  const a = computeLocXY(codeA); const b = computeLocXY(codeB);
  if (!a || !b) return 9999;
  // Cross-system = very far
  const locA = D.locations?.[codeA]; const locB = D.locations?.[codeB];
  if (locA?.system !== locB?.system) return 50000;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function optimizeRoute(assignments) {
  // Separate real stops from extras
  const realStops = assignments.filter(a => !a.isExtraShip);
  const extras = assignments.filter(a => a.isExtraShip);

  if (realStops.length <= 1) {
    const result = [...realStops, ...extras];
    result.forEach((a, i) => a.stopNum = i + 1);
    return result;
  }

  // Find the primary refinery location (most ores refined there)
  const refCounts = {};
  for (const a of realStops) {
    for (const od of (a.oreDetails || [])) {
      if (od.isGround) continue;
      const ref = findBestRefineryForOre(od.ore, finderRefSystem);
      if (ref) { const key = ref.station; refCounts[key] = (refCounts[key] || 0) + 1; }
    }
  }
  let bestRefStation = null; let bestRefCount = 0;
  for (const [station, count] of Object.entries(refCounts)) {
    if (count > bestRefCount) { bestRefStation = station; bestRefCount = count; }
  }
  const bestRefCode = bestRefStation ? refStationToLocCode(bestRefStation) : null;

  // Group by system
  const bySystem = {};
  for (const stop of realStops) {
    const sys = stop.system || 'unknown';
    if (!bySystem[sys]) bySystem[sys] = [];
    bySystem[sys].push(stop);
  }

  // Within each system: nearest-neighbor TSP
  // Try to end near the refinery if it's in this system
  const orderedStops = [];
  for (const [sys, sysStops] of Object.entries(bySystem)) {
    if (sysStops.length <= 1) { orderedStops.push(...sysStops); continue; }

    // Try every starting point, pick route with shortest total distance
    let bestRoute = null; let bestDist = Infinity;
    for (let startIdx = 0; startIdx < sysStops.length; startIdx++) {
      const route = []; const remaining = [...sysStops];
      let current = remaining.splice(startIdx, 1)[0];
      route.push(current);
      let totalDist = 0;

      while (remaining.length > 0) {
        let nearestIdx = 0; let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const d = distBetween(current.code, remaining[i].code);
          if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
        }
        totalDist += nearestDist;
        current = remaining.splice(nearestIdx, 1)[0];
        route.push(current);
      }

      // Bonus: if route ends near the refinery, slightly prefer it
      if (bestRefCode) {
        const lastToRef = distBetween(current.code, bestRefCode);
        totalDist += lastToRef * 0.3; // Weighted — ending near refinery is good but not critical
      }

      if (totalDist < bestDist) { bestDist = totalDist; bestRoute = route; }
    }
    orderedStops.push(...bestRoute);
  }

  // Renumber
  orderedStops.forEach((a, i) => a.stopNum = i + 1);

  // Attach extras after the stop they belong to
  const result = [];
  for (const stop of orderedStops) {
    result.push(stop);
    const matching = extras.filter(e => e.code === stop.code);
    matching.forEach(e => { e.stopNum = stop.stopNum; result.push(e); });
  }

  // Attach route summary info
  result.routeRefinery = bestRefStation ? (bestRefStation.split(' - ')[1] || bestRefStation) : null;
  return result;
}

// ============================================================
// RENDER STOP CARD
// ============================================================
function renderExpStopCard(a) {
  let oreRows = a.oreDetails.map(od => {
    const dc = od.difficulty?.resistance >= 0.7 ? 'var(--red)' : od.difficulty?.resistance >= 0.4 ? 'var(--accent)' : od.difficulty?.resistance >= 0 ? 'var(--yellow)' : 'var(--green)';
    const dl = od.difficulty?.resistance >= 0.7 ? 'EXTREME' : od.difficulty?.resistance >= 0.4 ? 'HARD' : od.difficulty?.resistance >= 0 ? 'MEDIUM' : 'EASY';
    let refCell = '\u2014';
    if (od.isGround) refCell = '<span style="color:var(--text-dim)">Sell direct</span>';
    else if (od.nearRef?.nearest && od.bestRef) {
      const nS = od.nearRef.nearest.name.split(' - ')[1] || od.nearRef.nearest.name;
      const bS = od.bestRef.station.split(' - ')[1] || od.bestRef.station;
      refCell = od.nearRef.nearest.name === od.bestRef.station
        ? `<span style="color:var(--green)">${nS}</span> ${od.nearRef.nearest.yield != null ? fmtYield(od.nearRef.nearest.yield) : ''}`
        : `${nS} ${od.nearRef.nearest.yield != null ? fmtYield(od.nearRef.nearest.yield) : ''} \u2192 <span style="color:var(--green)">${bS}</span> ${fmtYield(od.bestRef.value)}`;
    }
    else if (od.bestRef) refCell = `<span style="color:var(--green)">${od.bestRef.station.split(' - ')[1] || od.bestRef.station}</span> ${fmtYield(od.bestRef.value)}`;
    else if (od.nearRef?.nearest) {
      const nS = od.nearRef.nearest.name.split(' - ')[1] || od.nearRef.nearest.name;
      refCell = `${nS} ${od.nearRef.nearest.yield != null ? fmtYield(od.nearRef.nearest.yield) : ''} <span style="color:var(--text-dim)">(nearest)</span>`;
    }

    let det = '<div style="padding:8px 0 4px;font-size:12px;color:var(--text-secondary);display:grid;gap:4px">';
    const hasDirectPresence = od.prob > 0;
    // Only show ore's own signal/composition when it's directly found here
    if (hasDirectPresence && od.signal && !od.isGround) { const s = od.signal; const mc = typeof getClusterMax === 'function' ? getClusterMax(od.ore) : 3; let cl = `1\u00d7=${s.signal_value.toFixed(0)}`; for (let i = 2; i <= Math.min(mc, 5); i++) cl += `, ${i}\u00d7=${(s.signal_value * i).toFixed(0)}`; det += `<div>\u{1F4E1} <span style="color:var(--cyan)">${tierTag(s.tier)}</span> Signal: <span class="mono" style="color:var(--cyan)">${s.signal_value.toFixed(0)}</span> \u2014 ${cl}</div>`; }
    if (hasDirectPresence && od.comp?.parts?.length > 1 && !od.isGround) { const secs = od.comp.parts.filter(p => p.ore !== od.comp.primary_ore && p.ore !== 'INERTMATERIAL'); if (secs.length) det += `<div>\u{1F48E} Rock: ${od.name} + ${secs.map(p => `<span style="color:var(--yellow)">${oreName(p.ore)}</span> ${p.min_pct.toFixed(0)}\u2013${p.max_pct.toFixed(0)}%`).join(', ')}</div>`; }
    if (!hasDirectPresence && od.secScore > 0) {
      det += `<div style="color:var(--yellow)">\u{1F4CC} ${od.name} not found directly here \u2014 available as secondary in other rocks</div>`;
    }
    if (od.secScore > 0 && !od.isGround) {
      const locData = D.location_ores?.[a.code];
      if (locData) {
        const secSrc = computeSecondaryScore(od.ore, locData, od.method);
        if (secSrc.details.length) {
          const setupMass = a.loadout?.max_mass || (a.loadout?.turrets ? Math.max(...a.loadout.turrets.map(t => t.max_mass || 0)) : null);
          det += '<div style="margin-top:4px;padding:6px 8px;background:rgba(240,192,64,0.05);border-left:2px solid var(--yellow)">';
          det += `<div style="color:var(--yellow);font-weight:600;margin-bottom:4px">${od.name} also found in:</div>`;
          for (const d of secSrc.details) {
            const ss = getOreSignal(d.rock); const sd = getOreDifficulty(d.rock);
            const sdl = sd ? (sd.resistance >= 0.7 ? 'EXTREME' : sd.resistance >= 0.4 ? 'HARD' : sd.resistance >= 0 ? 'MEDIUM' : 'EASY') : '';
            const sdc = sd ? (sd.resistance >= 0.7 ? 'var(--red)' : sd.resistance >= 0.4 ? 'var(--accent)' : sd.resistance >= 0 ? 'var(--yellow)' : 'var(--green)') : 'var(--text-dim)';
            let rl = `<span style="color:${sdc}">[${sdl}]</span> <strong>${d.rockName}</strong> rocks (${d.pct}% ${od.name})`;
            if (ss) { const mc2 = typeof getClusterMax === 'function' ? getClusterMax(d.rock) : 3; let cs = ''; for (let c = 1; c <= Math.min(mc2, 5); c++) cs += `${c}\u00d7=${(ss.signal_value * c).toFixed(0)} `; rl += ` | sigs: <span class="mono" style="color:var(--cyan)">${cs.trim()}</span>`; }
            if (setupMass) rl += ` | setup mass: <span class="mono">${setupMass.toLocaleString()}</span>`;
            det += `<div style="margin:3px 0">\u2514 ${rl}</div>`;
          }
          det += `<div style="margin-top:4px;color:var(--text-dim)">Secondary score: +${secSrc.score.toFixed(1)}</div></div>`;
        }
      }
    }
    if (hasDirectPresence && !od.isGround && od.difficulty) {
      // Difficulty description (not a gear recommendation \u2014 the loadout column
      // on the right already shows what's equipped, so showing alternative gear
      // here would conflict)
      const traits = [];
      if (od.difficulty.resistance >= 0.7) traits.push('<span style="color:var(--red)">extreme resistance</span>');
      else if (od.difficulty.resistance >= 0.4) traits.push('high resistance');
      if (od.difficulty.instability >= 700) traits.push('<span style="color:var(--red)">extreme instability</span>');
      else if (od.difficulty.instability >= 300) traits.push('unstable');
      if (od.difficulty.explosion_multiplier >= 100) traits.push(`<span style="color:var(--red)">${od.difficulty.explosion_multiplier.toFixed(0)}\u00d7 explosion</span>`);
      if (traits.length) det += `<div style="color:var(--text-dim)">Rock traits: ${traits.join(', ')}</div>`;
    }
    det += '</div>';
    const secNote = od.secScore > 0 ? ' <span style="color:var(--yellow);font-size:10px">+sec</span>' : '';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)"><div style="display:flex;gap:12px;align-items:center"><div style="flex:1;min-width:120px"><span style="font-weight:600;font-size:14px">${od.name}</span> ${miningMethodTag(od.method)} ${hasDirectPresence && od.signal && !od.isGround ? tierTag(od.signal.tier) : ''}</div><div class="mono" style="color:var(--cyan);width:70px;text-align:right">${hasDirectPresence ? od.prob.toFixed(1) + '%' : '<span style="color:var(--yellow)">sec</span>'}${secNote}</div><div style="width:70px;text-align:center"><span style="color:${dc};font-size:11px;font-weight:600">${hasDirectPresence ? dl : ''}</span></div><div style="flex:1;font-size:12px;color:var(--text-secondary)">${refCell}</div></div>${det}</div>`;
  }).join('');

  let shipHtml = '';
  if (a.allGround) { shipHtml = `<div style="text-align:right"><div style="font-size:11px;color:var(--text-dim)">EQUIPMENT</div><div style="font-size:14px;font-weight:600">${a.shipLabel}</div></div>`; }
  else if (a.shipLabel) {
    let loInfo = ''; const lo = a.loadout;
    if (lo) {
      if (lo.turrets && Array.isArray(lo.turrets)) { loInfo = lo.turrets.map((t, i) => { const ln = D.equipment?.lasers?.[t.laser]?.name || t.laser; const ms = (t.modules || []).map(m => D.equipment?.modules?.[m]?.name || m).join('+'); return `T${i + 1}: ${ln}${ms ? ' [' + ms + ']' : ''}`; }).join('<br>'); }
      else if (lo.laser) { const ln = D.equipment?.lasers?.[lo.laser]?.name || lo.laser; const ms = (lo.modules || []).map(m => D.equipment?.modules?.[m]?.name || m).join(' + '); loInfo = `${ln}${ms ? ' + ' + ms : ''}`; if (lo.gadgets?.length) loInfo += ` + ${lo.gadgets.map(g => D.equipment?.gadgets?.[g]?.name || g).join(', ')}`; if (lo.max_mass) loInfo += `<br><span style="color:var(--text-dim)">Mass ~${lo.max_mass.toLocaleString()} | ${lo.effective_power?.toLocaleString() || '?'} power</span>`; }
    }
    const title = a.ship?.id ? (a.isExtraShip ? 'EXTRA SHIP' : a.isReuse ? 'ASSIGNED (sequential)' : 'ASSIGNED') : 'RECOMMENDED';
    shipHtml = `<div style="text-align:right;max-width:400px"><div style="font-size:11px;color:var(--text-dim)">${title}</div><div style="font-size:14px;font-weight:600">${a.shipLabel}</div><div style="font-size:11px;color:var(--text-secondary);line-height:1.5">${loInfo}</div>`;
    if (a.warnings?.length) shipHtml += a.warnings.map(w => `<div style="font-size:10px;color:var(--red)">\u26A0 ${w}</div>`).join('');
    shipHtml += '</div>';
  }

  const pinBadge = a.isPinned ? ' <span style="color:var(--accent);font-size:10px">\u{1F4CC} pinned</span>' : '';
  const extraBadge = a.isExtraShip ? ' <span style="color:var(--cyan);font-size:10px">\u{1F6A2} extra</span>' : '';
  const bc = a.isExtraShip ? 'var(--cyan)' : a.isPinned ? 'var(--accent)' : a.stopNum === 1 ? 'var(--green)' : 'var(--cyan)';
  return `<div class="card" style="margin-bottom:12px;border-left:3px solid ${bc}"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px"><div><div style="font-size:11px;color:var(--text-dim)">STOP ${a.stopNum}${pinBadge}${extraBadge}</div><div style="font-size:18px;font-weight:700">${a.name}</div><div style="margin-top:4px">${systemTag(a.system)} <span style="color:var(--text-dim)">${a.type || ''}</span></div></div>${shipHtml}</div><div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;display:flex;gap:12px"><span style="flex:1;min-width:120px">MATERIAL</span><span style="width:70px;text-align:right">PROB</span><span style="width:70px;text-align:center">DIFF</span><span style="flex:1">REFINERY</span></div>${oreRows}</div>`;
}

// ============================================================
// EXPORT — full clipboard
// ============================================================
function exportExpedition() {
  // Minimal rebuild of plan + assignments (same logic as render)
  const selectedOres = [...finderOres];
  const perOre = {}; for (const ore of selectedOres) perOre[ore] = rankLocationsForOre(ore, finderMethod, finderSystem);
  const locCov = {}; for (const ore of selectedOres) for (const loc of perOre[ore]) { if (!locCov[loc.code]) locCov[loc.code] = { name: loc.name, system: loc.system, type: loc.type, ores: {} }; if (!locCov[loc.code].ores[ore] || loc.totalScore > locCov[loc.code].ores[ore].score) locCov[loc.code].ores[ore] = { score: loc.totalScore, prob: loc.primaryScore, method: loc.method, secondaryScore: loc.secondaryScore || 0 }; }
  const ranked = Object.entries(locCov).map(([c, d]) => ({ code: c, ...d, oreCount: Object.keys(d.ores).length, totalScore: Object.values(d.ores).reduce((s, o) => s + o.score, 0) })).sort((a, b) => (b.oreCount * 100 + b.totalScore) - (a.oreCount * 100 + a.totalScore));
  const plan = []; const rem = new Set(selectedOres);
  if (Object.keys(finderPins).some(o => selectedOres.includes(o))) { const pbl = {}; for (const [o, l] of Object.entries(finderPins)) { if (!rem.has(o)) continue; if (!pbl[l]) pbl[l] = []; pbl[l].push(o); } for (const [lc] of Object.entries(pbl)) { const le = ranked.find(r => r.code === lc); if (!le) continue; const ah = Object.keys(le.ores).filter(o => rem.has(o)); plan.push({ ...le, targetOres: ah, isPinned: true }); ah.forEach(o => rem.delete(o)); } }
  for (const loc of ranked) { if (rem.size === 0) break; const n = Object.keys(loc.ores).filter(o => rem.has(o)); if (!n.length) continue; plan.push({ ...loc, targetOres: n }); n.forEach(o => rem.delete(o)); }

  const stops = plan.map((stop, idx) => {
    const allGround = stop.targetOres.every(o => isGroundOre(o));
    const oreDetails = stop.targetOres.map(ore => { const diff = getOreDifficulty(ore); return { ore, name: oreName(ore), prob: stop.ores[ore]?.prob || 0, secScore: stop.ores[ore]?.secondaryScore || 0, method: stop.ores[ore]?.method || 'ship', difficulty: diff, isGround: isGroundOre(ore) }; });
    const hardest = oreDetails.filter(o => !o.isGround).reduce((a, b) => ((b.difficulty?.resistance || 0) > (a.difficulty?.resistance || 0) ? b : a), oreDetails[0]);
    return { stopNum: idx + 1, code: stop.code, name: stop.name, system: stop.system, targetOres: stop.targetOres, oreDetails, allGround, hardestDiff: hardest?.difficulty, ores: stop.ores };
  });

  const pool = buildFleetPool(); const hasFleet = pool.length > 0;
  const assignments = hasFleet ? assignFleetToStops(stops, pool) : stops.map(s => { if (s.allGround) return { ...s, shipLabel: getGroundEquip(s), loadout: null }; const rec = getShipRecommendation(s.hardestDiff); const lo = getLoadoutForOre(rec.key === 'mole' ? 'mole_crew' : rec.key || 'prospector', 'medium', s.oreDetails.find(o => !o.isGround)?.ore, s.hardestDiff); return { ...s, ship: { type: rec.key }, shipLabel: rec.ship, loadout: lo }; });

  let text = `**\u2550\u2550\u2550 EXPEDITION PLAN \u2550\u2550\u2550**\n**Materials:** ${selectedOres.map(oreName).join(', ')}\n`;
  text += `**Stops:** ${plan.length} | **Systems:** ${[...new Set(plan.map(s => s.system))].join(', ')}`;
  if (hasFleet) text += ` | **Fleet:** ${fleetSummaryText()}`;
  text += '\n';

  // Optimize route
  const optimized = optimizeRoute(assignments);
  const routeNames = optimized.filter(a => !a.isExtraShip).map(a => a.name);
  if (routeNames.length > 1) {
    text += `**Route:** ${routeNames.join(' \u2192 ')}${optimized.routeRefinery ? ' \u2192 ' + optimized.routeRefinery + ' (refine)' : ''}\n`;
  }
  text += '\n';

  for (const a of optimized) {
    let shipLine = a.shipLabel || 'Auto';
    if (!a.allGround && a.loadout) {
      const lo = a.loadout;
      if (lo.turrets && Array.isArray(lo.turrets)) { shipLine += '\n' + lo.turrets.map((t, ti) => { const ln = D.equipment?.lasers?.[t.laser]?.name || t.laser; const ms = (t.modules || []).map(m => D.equipment?.modules?.[m]?.name || m).join(' + '); return `  T${ti + 1}: ${ln}${ms ? ' + ' + ms : ''}${t.max_mass ? ' (mass ~' + t.max_mass.toLocaleString() + ')' : ''}`; }).join('\n'); }
      else if (lo.laser) { const ln = D.equipment?.lasers?.[lo.laser]?.name || lo.laser; const ms = (lo.modules || []).map(m => D.equipment?.modules?.[m]?.name || m).join(' + '); shipLine += ` | ${ln}${ms ? ' + ' + ms : ''}`; if (lo.gadgets?.length) shipLine += ` + ${lo.gadgets.map(g => D.equipment?.gadgets?.[g]?.name || g).join(', ')}`; if (lo.max_mass) shipLine += ` | Mass ~${lo.max_mass.toLocaleString()} | ${lo.effective_power?.toLocaleString() || '?'} power`; }
    }

    text += `\`\`\`\nSTOP ${a.stopNum}: ${a.name} (${a.system})${a.isExtraShip ? ' [EXTRA SHIP]' : ''}\nShip: ${shipLine}\n${'\u2500'.repeat(44)}\n`;

    for (const ore of (a.targetOres || [])) {
      const ground = isGroundOre(ore); const diff = getOreDifficulty(ore); const signal = ground ? null : getOreSignal(ore); const comp = getOreComposition(ore);
      const dl = diff ? (diff.resistance >= 0.7 ? 'EXTREME' : diff.resistance >= 0.4 ? 'HARD' : diff.resistance >= 0 ? 'MEDIUM' : 'EASY') : '?';
      const prob = a.ores?.[ore]?.prob?.toFixed(1) || '?'; const secScore = a.ores?.[ore]?.secondaryScore || 0;
      let refStr = ground ? '(Sell direct)' : '';
      if (!ground) { const nearRef = findRefineries(a.code, ore); const bestRef = findBestRefineryForOre(ore, finderRefSystem); if (nearRef?.nearest && bestRef) { const nS = nearRef.nearest.name.split(' - ')[1] || nearRef.nearest.name; const bS = bestRef.station.split(' - ')[1] || bestRef.station; refStr = nearRef.nearest.name === bestRef.station ? `| Refinery: ${nS} ${bestRef.value > 0 ? '+' : ''}${bestRef.value}%` : `| Near: ${nS} ${nearRef.nearest.yield != null ? (nearRef.nearest.yield > 0 ? '+' : '') + nearRef.nearest.yield + '%' : ''} | Best: ${bS} ${bestRef.value > 0 ? '+' : ''}${bestRef.value}%`; } else if (bestRef) refStr = `| Best: ${bestRef.station} ${bestRef.value > 0 ? '+' : ''}${bestRef.value}%`; }
      text += `\n[${dl}] ${oreName(ore)} \u2014 ${prob}%${secScore > 0 ? ' (+sec)' : ''} ${refStr}\n`;
      if (signal) { const mc = typeof getClusterMax === 'function' ? getClusterMax(ore) : 3; let cl = ''; for (let c = 1; c <= Math.min(mc, 5); c++) cl += `${c}\u00d7=${(signal.signal_value * c).toFixed(0)} `; text += `  Signal: ${signal.signal_value.toFixed(0)} (${signal.tier}) | ${cl.trim()}\n`; }
      if (comp?.parts?.length > 1) { const secs = comp.parts.filter(p => p.ore !== comp.primary_ore && p.ore !== 'INERTMATERIAL'); if (secs.length) text += `  Rock composition: ${secs.map(p => `${oreName(p.ore)} ${p.min_pct.toFixed(0)}-${p.max_pct.toFixed(0)}%`).join(', ')}\n`; }
      if (secScore > 0 && !ground) { const locData = D.location_ores?.[a.code]; if (locData) { const secSrc = computeSecondaryScore(ore, locData, a.ores?.[ore]?.method || 'ship'); const setupMass = a.loadout?.max_mass || (a.loadout?.turrets ? Math.max(...a.loadout.turrets.map(t => t.max_mass || 0)) : null); for (const d of secSrc.details) { const ss = getOreSignal(d.rock); const sd = getOreDifficulty(d.rock); const sdl = sd ? (sd.resistance >= 0.7 ? 'EXTREME' : sd.resistance >= 0.4 ? 'HARD' : sd.resistance >= 0 ? 'MED' : 'EASY') : ''; let sl = `  \u2514 Also in [${sdl}] ${d.rockName} rocks (${d.pct}%)`; if (ss) { const mc2 = typeof getClusterMax === 'function' ? getClusterMax(d.rock) : 3; let cs = ''; for (let c = 1; c <= Math.min(mc2, 5); c++) cs += `${c}\u00d7=${(ss.signal_value * c).toFixed(0)} `; sl += ` sigs: ${cs.trim()}`; } if (setupMass) sl += ` | setup mass: ${setupMass.toLocaleString()}`; text += sl + '\n'; } } }
      if (diff && !ground) { const tips = []; if (diff.resistance >= 0.7) tips.push('Sabir gadget + Surge module essential'); else if (diff.resistance >= 0.4) tips.push('Surge or Rime module recommended'); if (diff.instability >= 700) tips.push('BoreMax gadget first'); else if (diff.instability >= 300) tips.push('Optimum or Torpid module recommended'); if (diff.explosion_multiplier >= 100) tips.push(`Explosion ${diff.explosion_multiplier.toFixed(0)}\u00d7`); if (tips.length) text += `  \u2192 ${tips.join(' | ')}\n`; }
    }
    text += '```\n';
  }

  const seen = new Set(); const shipOresInPlan = optimized.flatMap(a => (a.targetOres || []).filter(o => !isGroundOre(o) && !seen.has(o) && seen.add(o)));
  if (shipOresInPlan.length) { text += '\n**Refinery Plan:**\n'; const byRef = {}; for (const ore of shipOresInPlan) { const ref = findBestRefineryForOre(ore, finderRefSystem); const key = ref?.station || 'No data'; if (!byRef[key]) byRef[key] = { ref, ores: [] }; byRef[key].ores.push(ore); } for (const [station, data] of Object.entries(byRef)) text += `\u2022 **${station}**${data.ref ? ' (' + data.ref.system + ')' : ''} \u2014 ${data.ores.map(o => oreName(o) + (data.ref ? ' ' + (data.ref.value > 0 ? '+' : '') + data.ref.value + '%' : '')).join(', ')}\n`; }
  const groundOresInPlan = [...new Set(optimized.flatMap(a => (a.targetOres || []).filter(o => isGroundOre(o))))];
  if (groundOresInPlan.length) text += `\n*${groundOresInPlan.map(oreName).join(', ')} \u2014 sold directly, no refining.*\n`;

  navigator.clipboard.writeText(text).then(() => { const btn = document.querySelector('.chip.green[onclick*="exportExpedition"]'); if (btn) { const orig = btn.innerHTML; btn.innerHTML = '\u2714 Copied!'; btn.style.color = 'var(--green)'; setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000); } }).catch(() => { prompt('Copy expedition plan:', text); });
}

// HELPERS
// ============================================================
function findBestRefineryForOre(oreCode, sysFilter) {
  let best = null;
  for (const [name, station] of Object.entries(D.refineries?.stations || {})) {
    if (sysFilter && sysFilter !== 'all' && station.system !== sysFilter) continue;
    const y = station.yields?.[oreCode];
    if (y && y.value != null && (!best || y.value > best.value)) best = { station: name, value: y.value, system: station.system };
  }
  return best;
}

function renderSecondaryRefInsight(ore, primaryRef) {
  const ps = D.refineries?.stations?.[primaryRef.station];
  const yap = ps?.yields?.[ore]?.value;
  let own = findBestRefineryForOre(ore, finderRefSystem);
  let line = `<div>${oreName(ore)}: `;
  if (yap != null) line += `<span style="color:var(--text-secondary)">${primaryRef.station.split(' - ')[1] || primaryRef.station}</span> ${fmtYield(yap)}`;
  else line += `<span style="color:var(--text-dim)">${primaryRef.station.split(' - ')[1] || primaryRef.station} \u2014</span>`;
  if (own && own.station !== primaryRef.station) {
    const delta = own.value - (yap || 0);
    line += ` \u00a0\u2022\u00a0 Best: <span class="highlight">${own.station}</span> ${fmtYield(own.value)}`;
    if (delta > 0) line += ` <span style="color:var(--yellow)">(+${delta}% more)</span>`;
  }
  return line + '</div>';
}

function renderLocationCell(row, refs) {
  const isMission = row.type === 'mission_location';
  let c = `<div><strong>${locDisplayName(row.code)}</strong>${isMission ? ' <span style="font-size:9px;color:var(--purple);border:1px solid var(--purple);padding:1px 4px;border-radius:3px;vertical-align:middle">MISSION</span>' : ''}</div>`;
  if (!refs || !refs.nearest) return c;
  if (refs.isBelt && refs.best) {
    c += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">${refs.best.name.split(' - ')[1] || refs.best.name}</span> ${refs.best.yield != null ? fmtYield(refs.best.yield) : ''} <span class="tag tag-best" style="font-size:8px">BEST</span></div>`;
  } else if (refs.selfYield != null && refs.best && refs.best.yield - refs.selfYield > 2) {
    c += `<div class="delta-box"><span style="color:var(--text-dim)">Here</span> ${fmtYield(refs.selfYield)} <span class="delta-arrow">\u2192</span> <span style="color:var(--green)">${refs.best.name.split(' - ')[1] || refs.best.name}</span> ${fmtYield(refs.best.yield)} <span class="delta-gain">(+${refs.best.yield - refs.selfYield}%)</span></div>`;
  } else if (refs.selfYield != null) {
    c += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">Refine here</span> ${fmtYield(refs.selfYield)}</div>`;
  } else if (refs.nearest && refs.best && refs.best.name !== refs.nearest.name && refs.nearest.yield != null && refs.best.yield != null && refs.best.yield - refs.nearest.yield > 2) {
    const d = refs.best.yield - refs.nearest.yield;
    c += `<div class="delta-box"><span style="color:var(--text-dim)">${refs.nearest.name.split(' - ')[1] || refs.nearest.name}</span> ${fmtYield(refs.nearest.yield)} <span class="delta-arrow">\u2192</span> <span style="color:var(--green)">${refs.best.name.split(' - ')[1] || refs.best.name}</span> ${fmtYield(refs.best.yield)} <span class="delta-gain">(+${d}%)</span></div>`;
  } else if (refs.nearest) {
    const n = refs.nearest.name.split(' - ')[1] || refs.nearest.name;
    if (refs.nearest.yield != null) {
      const same = !refs.best || refs.nearest.name === refs.best.name;
      c += `<div class="delta-box" style="border-color:var(--green)"><span style="color:var(--green)">${n}</span> ${fmtYield(refs.nearest.yield)}${same ? ' <span class="tag tag-best" style="font-size:8px">NEAREST+BEST</span>' : ''}</div>`;
    } else c += `<div class="delta-box"><span style="color:var(--text-secondary)">${n}</span> <span style="font-size:10px;color:var(--text-dim)">nearest</span></div>`;
  }
  return c;
}

function renderCompositionParts(comp) {
  if (!comp?.parts?.length) return '';
  let h = '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)"><div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">ROCK COMPOSITION</div><div style="display:flex;flex-wrap:wrap;gap:8px">';
  for (const p of comp.parts) {
    const pr = p.ore === comp.primary_ore;
    const pct = p.min_pct === p.max_pct ? p.min_pct.toFixed(0) + '%' : p.min_pct.toFixed(0) + '\u2013' + p.max_pct.toFixed(0) + '%';
    h += `<div style="padding:6px 10px;background:${pr ? 'rgba(61,214,140,0.1)' : 'rgba(90,98,112,0.1)'};border:1px solid ${pr ? 'rgba(61,214,140,0.3)' : 'var(--border)'};border-radius:4px;font-size:12px"><span style="color:${pr ? 'var(--green)' : 'var(--text-secondary)'}">${oreName(p.ore)}</span> <span class="mono" style="color:var(--text-dim)">${pct}</span></div>`;
  }
  return h + '</div></div>';
}

function openFinderForOre(oreCode) { finderOres.clear(); finderOres.add(oreCode); finderExpeditionMode = false; switchTab('finder'); }

// ============================================================
// SCORING (used by quickmine.js)
// ============================================================
function rankLocationsForOre(targetOre, methodFilter = 'all', systemFilter = 'all') {
  const results = [];
  const mm = D.ores?.[targetOre]?.mining_method || '';
  const isGround = ['fps', 'vehicle', 'fps_vehicle'].includes(mm);

  // Determine which data method keys to search
  let methods;
  if (methodFilter === 'all') methods = ['ship', 'fps', 'vehicle'];
  else if (methodFilter === 'surface') methods = ['fps', 'vehicle'];
  else if (methodFilter === 'vehicle') methods = ['vehicle', 'fps'];
  else if (methodFilter === 'fps') methods = ['fps', 'vehicle'];
  else methods = [methodFilter];

  // For ground ores, always search both fps and vehicle regardless
  if (isGround && !methods.includes('fps')) methods.push('fps');
  if (isGround && !methods.includes('vehicle')) methods.push('vehicle');

  for (const [lc, ld] of Object.entries(D.location_ores || {})) {
    if (systemFilter !== 'all' && ld.system !== systemFilter) continue;
    if (FINDER_EXCLUDE.has(ld.type)) continue;
    for (const method of methods) {
      // For ship filter, skip fps/vehicle methods
      if (methodFilter === 'ship' && method !== 'ship') continue;

      const ores = ld.ores?.[method] || [];
      const oe = ores.find(o => o.ore === targetOre && isOreVisible(o, ld.type));
      if (!oe) continue;
      if (results.find(r => r.code === lc)) continue;
      const sec = computeSecondaryScore(targetOre, ld, method);
      const prob = oe.relative_probability ?? 0;
      const refConv = isGround ? 0 : computeRefineryConvenience(lc, targetOre) * 0.1;
      results.push({ code: lc, name: ld.name, system: ld.system, type: ld.type, method, primaryScore: prob, secondaryScore: sec.score, secondaryDetails: sec.details, refineryConvenience: refConv, totalScore: prob + sec.score + refConv });
    }
  }
  results.sort((a, b) => b.totalScore - a.totalScore);
  return results;
}
