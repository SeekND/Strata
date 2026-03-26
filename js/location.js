// ============================================================
// SC Hub Mining v3 — location.js (Location Explorer)
// Explore what ores are available at each location
// ============================================================

// Location explorer state
let locationState = {
  location: null,
  system: 'all',
};

// ============================================================
// MAIN RENDER
// ============================================================
function renderLocation() {
  const panel = document.getElementById('panel-location');
  if (!panel) return;

  // Build location options
  const locationOptions = buildLocationOptions();

  panel.innerHTML = `
    <div class="section-header">// Location Explorer</div>
    <div style="color:var(--text-secondary);margin-bottom:16px">
      Select a location to see all available ores and mining opportunities.
    </div>
    
    <div class="location-controls" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">SYSTEM</label>
        <select id="location-system" class="dm-select">
          <option value="all">All Systems</option>
          <option value="Stanton">Stanton</option>
          <option value="Pyro">Pyro</option>
          <option value="Nyx">Nyx</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">LOCATION</label>
        <select id="location-select" class="dm-select" style="min-width:220px">
          <option value="">— Select Location —</option>
          ${locationOptions}
        </select>
      </div>
    </div>
    
    <div id="location-results"></div>
  `;

  // Restore state
  const systemSelect = document.getElementById('location-system');
  const locationSelect = document.getElementById('location-select');

  if (locationState.system) systemSelect.value = locationState.system;
  
  // Event listeners
  systemSelect.addEventListener('change', () => {
    locationState.system = systemSelect.value;
    locationState.location = null;
    updateLocationDropdown();
    renderLocationResults();
  });
  
  locationSelect.addEventListener('change', () => {
    locationState.location = locationSelect.value;
    renderLocationResults();
  });

  // Set initial location if present
  if (locationState.location) {
    locationSelect.value = locationState.location;
    renderLocationResults();
  }
}

// ============================================================
// BUILD LOCATION OPTIONS
// ============================================================
function buildLocationOptions() {
  const grouped = { Stanton: [], Pyro: [], Nyx: [] };
  
  for (const [code, locData] of Object.entries(D.location_ores || {})) {
    const sys = locData.system || 'Unknown';
    if (!grouped[sys]) grouped[sys] = [];
    grouped[sys].push({ code, name: locData.name, type: locData.type });
  }

  // Sort each group
  for (const sys of Object.keys(grouped)) {
    grouped[sys].sort((a, b) => a.name.localeCompare(b.name));
  }

  let html = '';
  for (const [sys, locs] of Object.entries(grouped)) {
    if (locs.length === 0) continue;
    if (locationState.system !== 'all' && sys !== locationState.system) continue;
    
    html += `<optgroup label="${sys}">`;
    for (const loc of locs) {
      html += `<option value="${loc.code}">${loc.name} (${loc.type || 'location'})</option>`;
    }
    html += '</optgroup>';
  }

  return html;
}

function updateLocationDropdown() {
  const locationSelect = document.getElementById('location-select');
  if (!locationSelect) return;
  
  locationSelect.innerHTML = `
    <option value="">— Select Location —</option>
    ${buildLocationOptions()}
  `;
}

// ============================================================
// RENDER LOCATION RESULTS
// ============================================================
function renderLocationResults() {
  const container = document.getElementById('location-results');
  if (!container) return;

  const { location } = locationState;
  if (!location) {
    container.innerHTML = `<div class="card" style="color:var(--text-secondary);text-align:center;padding:40px">
      Select a location above to explore available ores.
    </div>`;
    return;
  }

  const locData = D.location_ores?.[location];
  if (!locData) {
    container.innerHTML = `<div class="card" style="color:var(--text-secondary);text-align:center;padding:40px">
      No ore data found for this location.
    </div>`;
    return;
  }

  // Location header
  let html = `
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${locData.name}</div>
          <div style="margin-top:6px">${systemTag(locData.system)} <span style="color:var(--text-dim)">${locData.type || ''}</span></div>
        </div>
        <div style="text-align:right">
          ${renderGroupProbabilities(locData.group_probabilities)}
        </div>
      </div>
    </div>
  `;

  // Ores by method
  const methods = ['ship', 'fps', 'vehicle'];
  const methodLabels = { ship: 'Ship Mining', fps: 'FPS Mining (Cave)', vehicle: 'Vehicle Mining (ROC)' };
  
  for (const method of methods) {
    const ores = locData.ores?.[method];
    if (!ores || ores.length === 0) continue;

    // Sort by probability descending
    const sorted = [...ores].sort((a, b) => b.relative_probability - a.relative_probability);
    const maxProb = sorted[0]?.relative_probability || 1;

    html += `
      <div class="section-header" style="margin-top:20px">// ${methodLabels[method]}</div>
      <div style="margin-top:8px;display:grid;gap:8px">
    `;

    for (const oreEntry of sorted) {
      const diff = getOreDifficulty(oreEntry.ore);
      const signal = getOreSignal(oreEntry.ore);
      const barWidth = (oreEntry.relative_probability / maxProb * 100).toFixed(1);
      
      // Get composition
      const comp = getOreComposition(oreEntry.ore);
      const secondaries = comp?.parts?.filter(p => p.ore !== comp.primary_ore) || [];

      html += `
        <div class="card" style="padding:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:600;color:var(--text-primary)">${oreName(oreEntry.ore)}</span>
                ${signal ? tierTag(signal.tier) : ''}
                ${diff ? difficultyTag(diff.resistance) : ''}
              </div>
              ${secondaries.length > 0 ? `
                <div style="font-size:11px;color:var(--text-dim);margin-top:4px">
                  Contains: ${secondaries.map(s => `${oreName(s.ore)} ${s.min_pct.toFixed(0)}–${s.max_pct.toFixed(0)}%`).join(', ')}
                </div>
              ` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:12px">
              <div style="width:120px">
                <div style="height:6px;background:var(--bg-dark);border-radius:3px;overflow:hidden">
                  <div style="width:${barWidth}%;height:100%;background:var(--cyan)"></div>
                </div>
              </div>
              <div class="mono" style="width:50px;text-align:right;color:var(--cyan)">${oreEntry.relative_probability.toFixed(1)}</div>
              <button class="chip" onclick="openFinderForOre('${oreEntry.ore}')" style="font-size:11px;padding:4px 8px">
                Find More
              </button>
            </div>
          </div>
        </div>
      `;
    }

    html += '</div>';
  }

  // Best refinery for this location
  const bestRefinery = findBestRefineryForLocation(locData);
  if (bestRefinery) {
    html += `
      <div style="margin-top:24px;padding:12px;background:var(--bg-card);border-radius:6px;border-left:3px solid var(--green)">
        <div style="font-size:12px;color:var(--green);font-weight:600;margin-bottom:6px">
          Recommended Refinery
        </div>
        <div style="font-size:14px;color:var(--text-primary)">${bestRefinery.name}</div>
        <div style="font-size:12px;color:var(--text-secondary)">
          ${bestRefinery.system} system — best average yield for ores at this location
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ============================================================
// GROUP PROBABILITIES DISPLAY
// ============================================================
function renderGroupProbabilities(probs) {
  if (!probs) return '';
  
  const entries = [];
  if (probs.ship) entries.push(`<span style="color:var(--cyan)">Ship: ${probs.ship}%</span>`);
  if (probs.fps) entries.push(`<span style="color:var(--purple)">FPS: ${probs.fps}%</span>`);
  if (probs.vehicle) entries.push(`<span style="color:var(--accent)">Vehicle: ${probs.vehicle}%</span>`);
  
  if (entries.length === 0) return '';
  
  return `
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:4px">SPAWN DENSITY</div>
    <div style="font-size:12px">${entries.join(' • ')}</div>
  `;
}

// ============================================================
// FIND BEST REFINERY FOR LOCATION
// ============================================================
function findBestRefineryForLocation(locData) {
  // Get all ores at this location
  const allOres = new Set();
  for (const method of ['ship', 'fps', 'vehicle']) {
    for (const oreEntry of (locData.ores?.[method] || [])) {
      allOres.add(oreEntry.ore);
    }
  }

  if (allOres.size === 0) return null;

  // Score each refinery by average yield for these ores
  const stations = D.refineries?.stations || {};
  let best = null;
  let bestScore = -Infinity;

  for (const [name, station] of Object.entries(stations)) {
    let totalYield = 0;
    let count = 0;
    
    for (const ore of allOres) {
      const y = station.yields?.[ore];
      if (y?.value != null) {
        totalYield += y.value;
        count++;
      }
    }

    if (count > 0) {
      const avgYield = totalYield / count;
      if (avgYield > bestScore) {
        bestScore = avgYield;
        best = { name, system: station.system, avgYield };
      }
    }
  }

  return best;
}

// ============================================================
// QUICK ACCESS: Open location explorer for specific location
// ============================================================
function openLocationExplorer(locCode) {
  const locData = D.location_ores?.[locCode];
  if (locData) {
    locationState.system = locData.system || 'all';
    locationState.location = locCode;
  }
  switchTab('location');
}
