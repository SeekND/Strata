// ============================================================
// SC Hub Mining v3 — refinery.js (Refinery Advisor)
// Compare refinery yields + refining methods (merged)
// ============================================================

// Refinery state
let refineryState = {
  ore: null,
  system: 'all',
};

// ============================================================
// MAIN RENDER
// ============================================================
function renderRefinery() {
  const panel = document.getElementById('panel-refinery');
  if (!panel) return;

  // Build ore options
  const oreOptions = Object.entries(D.ores || {})
    .filter(([code]) => !['INERTMATERIAL'].includes(code))
    .sort(([, a], [, b]) => (a.display_name || '').localeCompare(b.display_name || ''))
    .map(([code, ore]) => `<option value="${code}">${ore.display_name}</option>`)
    .join('');

  panel.innerHTML = `
    <div class="section-header">// Refinery Advisor</div>
    <div style="color:var(--text-secondary);margin-bottom:16px">
      Compare refinery yields by ore and system. Yields from <a href="https://uexcorp.space" target="_blank" style="color:var(--cyan)">UEX Corp API</a>.
    </div>
    
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px">
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">ORE</label>
        <select id="refinery-ore" class="dm-select" style="min-width:180px">
          <option value="">— All Ores —</option>
          ${oreOptions}
        </select>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">SYSTEM</label>
        <select id="refinery-system" class="dm-select">
          <option value="all">All Systems</option>
          <option value="Stanton">Stanton</option>
          <option value="Pyro">Pyro</option>
          <option value="Nyx">Nyx</option>
        </select>
      </div>
    </div>
    
    <div id="refinery-results"></div>
    
    <div style="margin-top:24px" id="refining-methods-section"></div>
  `;

  // Restore state
  if (refineryState.ore) document.getElementById('refinery-ore').value = refineryState.ore;
  if (refineryState.system) document.getElementById('refinery-system').value = refineryState.system;

  // Event listeners
  document.getElementById('refinery-ore').addEventListener('change', e => {
    refineryState.ore = e.target.value || null;
    renderRefineryResults();
  });
  
  document.getElementById('refinery-system').addEventListener('change', e => {
    refineryState.system = e.target.value;
    renderRefineryResults();
  });

  renderRefineryResults();
  renderRefiningMethods();
}

// ============================================================
// RENDER RESULTS
// ============================================================
function renderRefineryResults() {
  const container = document.getElementById('refinery-results');
  if (!container) return;

  const stations = D.refineries?.stations || {};
  const { ore, system } = refineryState;

  let filtered = Object.entries(stations);
  if (system !== 'all') {
    filtered = filtered.filter(([, s]) => s.system === system);
  }

  if (ore) {
    renderSingleOreView(container, filtered, ore);
  } else {
    renderAllOresView(container, filtered);
  }
}

// ============================================================
// SINGLE ORE VIEW
// ============================================================
function renderSingleOreView(container, stations, oreCode) {
  const ranked = stations
    .map(([name, s]) => ({
      name, system: s.system, location: s.location,
      yield: s.yields?.[oreCode]?.value,
    }))
    .filter(s => s.yield != null)
    .sort((a, b) => b.yield - a.yield);

  if (ranked.length === 0) {
    container.innerHTML = `<div class="card" style="color:var(--text-secondary);text-align:center;padding:40px">
      No refinery yield data for <strong>${oreName(oreCode)}</strong>.
    </div>`;
    return;
  }

  const maxYield = Math.max(...ranked.map(r => r.yield));
  const minYield = Math.min(...ranked.map(r => r.yield));

  let html = `
    <div style="margin-bottom:12px;font-size:13px">
      <strong>${oreName(oreCode)}</strong> yields at ${ranked.length} refineries.
      Best: <span style="color:var(--green)">${fmtYield(maxYield)}</span>,
      Worst: <span style="color:var(--red)">${fmtYield(minYield)}</span>
    </div>
    <table class="eq-table">
      <thead><tr>
        <th style="text-align:left">Refinery</th>
        <th>System</th>
        <th>Location</th>
        <th>Yield</th>
        <th style="width:150px">Comparison</th>
      </tr></thead>
      <tbody>
  `;

  for (const r of ranked) {
    const barWidth = maxYield > minYield ? ((r.yield - minYield) / (maxYield - minYield) * 100) : 50;
    const isBest = r.yield === maxYield;
    const isWorst = r.yield === minYield && ranked.length > 1;

    html += `<tr>
      <td style="text-align:left">
        <div style="font-weight:600${isBest ? ';color:var(--green)' : ''}">${r.name}</div>
      </td>
      <td>${systemTag(r.system)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${r.location || '\u2014'}</td>
      <td class="mono ${r.yield > 0 ? 'v-pos' : r.yield < 0 ? 'v-neg' : ''}">${fmtYield(r.yield)}</td>
      <td>
        <div style="height:8px;background:var(--bg-dark);border-radius:4px;overflow:hidden">
          <div style="width:${barWidth}%;height:100%;background:${isBest ? 'var(--green)' : isWorst ? 'var(--red)' : 'var(--cyan)'}"></div>
        </div>
      </td>
    </tr>`;
  }

  html += '</tbody></table>';
  container.innerHTML = html;
}

// ============================================================
// ALL ORES VIEW — station cards
// ============================================================
function renderAllOresView(container, stations) {
  if (stations.length === 0) {
    container.innerHTML = `<div class="card" style="color:var(--text-secondary);text-align:center;padding:40px">
      No refineries in this system.
    </div>`;
    return;
  }

  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';

  for (const [name, station] of stations.sort(([a], [b]) => a.localeCompare(b))) {
    const yields = station.yields || {};
    const oreCount = Object.keys(yields).length;
    const yieldValues = Object.values(yields).map(y => y.value).filter(v => v != null);
    const avgYield = yieldValues.length > 0
      ? (yieldValues.reduce((a, b) => a + b, 0) / yieldValues.length).toFixed(1)
      : '\u2014';

    const topOres = Object.entries(yields)
      .filter(([, y]) => y.value != null)
      .sort(([, a], [, b]) => b.value - a.value)
      .slice(0, 3);

    html += `
      <div class="card" style="padding:12px">
        <div style="font-weight:700;color:var(--text-primary)">${name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">
          ${systemTag(station.system)} ${station.location || ''}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-dim)">
          ${oreCount} ores \u2022 Avg yield: <span class="mono" style="color:var(--cyan)">${avgYield}%</span>
        </div>
        ${topOres.length > 0 ? `
          <div style="margin-top:8px;font-size:11px">
            Best: ${topOres.map(([code, y]) =>
              `<span style="color:var(--text-primary)">${oreName(code)}</span> <span class="mono v-pos">${fmtYield(y.value)}</span>`
            ).join(', ')}
          </div>
        ` : ''}
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

// ============================================================
// REFINING METHODS — merged from standalone tab
// ============================================================
function renderRefiningMethods() {
  const container = document.getElementById('refining-methods-section');
  if (!container) return;

  const methods = D.refineries?.methods;
  if (!methods || (Array.isArray(methods) && methods.length === 0) || (!Array.isArray(methods) && Object.keys(methods).length === 0)) {
    container.innerHTML = '';
    return;
  }

  // Handle both array and object formats
  const methodList = Array.isArray(methods)
    ? methods
    : Object.entries(methods).map(([key, m]) => ({...m, _key: key}));

  if (methodList.length === 0) return;

  // Sort by yield rating descending
  methodList.sort((a, b) => (b.rating_yield || b.yield || 0) - (a.rating_yield || a.yield || 0));

  let html = `
    <div class="section-header">// Refining Methods</div>
    <div style="color:var(--text-secondary);margin-bottom:12px;font-size:13px">
      Method ratings from UEX Corp (1\u20133 scale). Actual yield varies per ore \u2014 select an ore above to see station-specific percentages.
    </div>
    <table class="eq-table">
      <thead><tr>
        <th style="text-align:left">Method</th>
        <th>Code</th>
        <th>Yield</th>
        <th>Cost</th>
        <th>Speed</th>
        <th>Best For</th>
      </tr></thead>
      <tbody>
  `;

  for (const m of methodList) {
    const name = m.name || m._key || '?';
    const code = m.code || '';
    const yieldR = m.rating_yield || m.yield || 0;
    const costR = m.rating_cost || m.cost || 0;
    const speedR = m.rating_speed || m.speed || 0;

    const yieldColor = yieldR >= 3 ? 'var(--green)' : yieldR >= 2 ? 'var(--text-primary)' : 'var(--text-dim)';
    const costColor = costR >= 3 ? 'var(--red)' : costR >= 2 ? 'var(--text-primary)' : 'var(--green)';
    const speedColor = speedR >= 3 ? 'var(--green)' : speedR >= 2 ? 'var(--text-primary)' : 'var(--text-dim)';

    // Generate recommendation
    let bestFor = '';
    if (yieldR >= 3 && costR <= 2) bestFor = '<span style="color:var(--green)">Valuable ores</span>';
    else if (speedR >= 3 && costR >= 3) bestFor = '<span style="color:var(--yellow)">Budget bulk</span>';
    else if (speedR >= 3) bestFor = '<span style="color:var(--cyan)">Quick runs</span>';
    else if (yieldR >= 3) bestFor = '<span style="color:var(--green)">Max yield</span>';
    else bestFor = '<span style="color:var(--text-dim)">General</span>';

    html += `<tr>
      <td style="text-align:left;font-weight:600">${name}</td>
      <td class="mono" style="color:var(--text-dim)">${code}</td>
      <td style="color:${yieldColor}">${renderPips(yieldR, 3)}</td>
      <td style="color:${costColor}">${renderPips(costR, 3)}</td>
      <td style="color:${speedColor}">${renderPips(speedR, 3)}</td>
      <td>${bestFor}</td>
    </tr>`;
  }

  html += '</tbody></table>';

  html += `
    <div style="margin-top:12px;font-size:12px;color:var(--text-dim);line-height:1.6">
      <strong>Yield</strong> = refined material output. <strong>Cost</strong> = processing fee. <strong>Speed</strong> = completion time.
      Higher is better for yield/speed, lower is better for cost.
      For valuable ores (Quantanium, Bexalite), always prioritise yield.
      For bulk common ores, speed may matter more.
    </div>
  `;

  container.innerHTML = html;
}

// Also expose as renderMethods for the nav tab renderer (backwards compat)
function renderMethods() {
  // Methods are now inside the Refinery tab — just switch to it
  switchTab('refinery');
}
