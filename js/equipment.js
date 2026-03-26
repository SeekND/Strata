// ============================================================
// SC Hub Mining v3 — equipment.js (Equipment Browser)
// Browse and compare lasers, modules, and gadgets
// ============================================================

// Equipment state
let equipState = {
  tab: 'lasers',
  sortBy: 'name',
  sortDir: 'asc',
};

// ============================================================
// MAIN RENDER
// ============================================================
function renderEquipment() {
  const panel = document.getElementById('panel-equipment');
  if (!panel) return;

  panel.innerHTML = `
    <div class="section-header">// Equipment Browser</div>
    
    <div class="chip-group" id="equip-tab-chips" style="margin-bottom:16px"></div>
    
    <div id="equip-content"></div>
  `;

  // Build tab chips
  buildChips(
    document.getElementById('equip-tab-chips'),
    [['Lasers', 'lasers'], ['Modules', 'modules'], ['Gadgets', 'gadgets']],
    equipState.tab,
    v => { equipState.tab = v; },
    renderEquipmentContent
  );

  renderEquipmentContent();
}

// ============================================================
// RENDER CONTENT
// ============================================================
function renderEquipmentContent() {
  const container = document.getElementById('equip-content');
  if (!container) return;

  switch (equipState.tab) {
    case 'lasers':
      renderLasers(container);
      break;
    case 'modules':
      renderModules(container);
      break;
    case 'gadgets':
      renderGadgets(container);
      break;
  }
}

// ============================================================
// LASERS TABLE
// ============================================================
function renderLasers(container) {
  const lasers = D.equipment?.lasers || {};
  
  // Filter to ship lasers only (size > 0)
  const items = Object.entries(lasers)
    .filter(([, l]) => l.size > 0)
    .map(([key, l]) => ({ key, ...l }));

  // Sort
  items.sort((a, b) => {
    if (equipState.sortBy === 'name') return a.name.localeCompare(b.name);
    if (equipState.sortBy === 'size') return a.size - b.size;
    if (equipState.sortBy === 'power') return (b.max_power || 0) - (a.max_power || 0);
    if (equipState.sortBy === 'resistance') return (b.resistance || 0) - (a.resistance || 0);
    return 0;
  });

  if (equipState.sortDir === 'desc') items.reverse();

  container.innerHTML = `
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">
      ${items.length} mining lasers. Values show stat modifiers applied when equipped.
    </div>
    <table class="eq-table">
      <thead>
        <tr>
          <th style="text-align:left;cursor:pointer" onclick="sortEquip('name')">Name ${sortIcon('name')}</th>
          <th style="cursor:pointer" onclick="sortEquip('size')">Size ${sortIcon('size')}</th>
          <th>Slots</th>
          <th style="cursor:pointer" onclick="sortEquip('power')">Power ${sortIcon('power')}</th>
          <th style="cursor:pointer" onclick="sortEquip('resistance')">Resist ${sortIcon('resistance')}</th>
          <th>Instab</th>
          <th>Window</th>
          <th>Range</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(l => `
          <tr${l.bespoke ? ' style="opacity:0.7"' : ''}>
            <td style="text-align:left">
              <div style="font-weight:600">${l.name}</div>
              <div style="font-size:10px;color:var(--text-dim)">${l.manufacturer || ''}${l.bespoke ? ' (bespoke)' : ''}</div>
            </td>
            <td><span class="tag tag-${l.size === 1 ? 'uncommon' : 'rare'}">S${l.size}</span></td>
            <td class="mono">${l.module_slots || 0}</td>
            <td class="mono" style="color:var(--cyan)">${l.max_power || '—'}</td>
            <td class="mono ${modClass(l.resistance)}">${modValue(l.resistance)}</td>
            <td class="mono ${modClass(l.instability, true)}">${modValue(l.instability)}</td>
            <td class="mono ${modClass(l.optimal_window_size)}">${modValue(l.optimal_window_size)}</td>
            <td class="mono">${l.optimum_range || '—'}m</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================
// MODULES TABLE
// ============================================================
function renderModules(container) {
  const modules = D.equipment?.modules || {};
  
  const items = Object.entries(modules)
    .map(([key, m]) => ({ key, ...m }));

  // Sort - actives first, then passives
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  container.innerHTML = `
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">
      ${items.length} modules. <span style="color:var(--accent)">⚡ Active</span> modules have limited duration and uses.
    </div>
    <table class="eq-table">
      <thead>
        <tr>
          <th style="text-align:left">Name</th>
          <th>Type</th>
          <th>Resist</th>
          <th>Instab</th>
          <th>Power</th>
          <th>Window</th>
          <th>Catast</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(m => `
          <tr>
            <td style="text-align:left">
              <div style="font-weight:600">${m.name}</div>
              <div style="font-size:10px;color:var(--text-dim)">${m.manufacturer || ''}</div>
            </td>
            <td>${m.type === 'active' 
              ? '<span class="tag" style="background:rgba(232,117,26,0.15);color:var(--accent);border:1px solid rgba(232,117,26,0.3)">ACTIVE</span>'
              : '<span class="tag" style="background:rgba(90,98,112,0.15);color:var(--text-secondary);border:1px solid var(--border)">PASSIVE</span>'
            }</td>
            <td class="mono ${modClass(m.resistance)}">${modValue(m.resistance)}</td>
            <td class="mono ${modClass(m.instability, true)}">${modValue(m.instability)}</td>
            <td class="mono ${modClass(m.power_mod)}">${modValue(m.power_mod)}</td>
            <td class="mono ${modClass(m.optimal_window_size)}">${modValue(m.optimal_window_size)}</td>
            <td class="mono ${modClass(m.catastrophic_rate, true)}">${modValue(m.catastrophic_rate)}</td>
            <td class="mono">${m.lifetime ? `${m.lifetime}s` : '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ============================================================
// GADGETS TABLE
// ============================================================
function renderGadgets(container) {
  const gadgets = D.equipment?.gadgets || {};
  
  const items = Object.entries(gadgets)
    .map(([key, g]) => ({ key, ...g }));

  items.sort((a, b) => a.name.localeCompare(b.name));

  container.innerHTML = `
    <div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">
      ${items.length} gadgets. Throw at rocks when danger is below 25% (above 50% destroys gadget). Effects apply to the rock, not your ship.
    </div>
    <table class="eq-table">
      <thead>
        <tr>
          <th style="text-align:left">Name</th>
          <th>Resist</th>
          <th>Instab</th>
          <th>Window</th>
          <th>Cluster</th>
          <th>Uses</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(g => `
          <tr>
            <td style="text-align:left">
              <div style="font-weight:600">${g.name}</div>
              <div style="font-size:10px;color:var(--text-dim)">${g.manufacturer || ''}</div>
            </td>
            <td class="mono ${modClass(g.resistance)}">${modValue(g.resistance)}</td>
            <td class="mono ${modClass(g.instability, true)}">${modValue(g.instability)}</td>
            <td class="mono ${modClass(g.optimal_window_size)}">${modValue(g.optimal_window_size)}</td>
            <td class="mono ${modClass(g.cluster)}">${modValue(g.cluster)}</td>
            <td class="mono">${g.charges === -1 ? '∞' : g.charges}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="card" style="margin-top:16px;border-left:3px solid var(--purple)">
      <div style="font-size:13px;line-height:1.6">
        <strong>Gadget Tips:</strong><br>
        • <strong>Sabir</strong> — Best for high-resistance ores (-50% resist). Essential for Golem's bespoke laser.<br>
        • <strong>BoreMax</strong> — Best for extreme instability (-70% instab). Use on Quantanium.<br>
        • <strong>Waveshift</strong> — Widens window (+100%) and reduces instability (-35%). Good all-rounder.<br>
        • All gadgets are reusable and have no cost. Throw them early!
      </div>
    </div>
  `;
}

// ============================================================
// SORTING HELPERS
// ============================================================
function sortEquip(col) {
  if (equipState.sortBy === col) {
    equipState.sortDir = equipState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    equipState.sortBy = col;
    equipState.sortDir = 'asc';
  }
  renderEquipmentContent();
}

function sortIcon(col) {
  if (equipState.sortBy !== col) return '';
  return equipState.sortDir === 'asc' ? '↑' : '↓';
}

// ============================================================
// VALUE FORMATTING
// ============================================================
function modValue(v) {
  if (v == null || v === 0) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(v % 1 === 0 ? 0 : 1) + '%';
}

function modClass(v, invertColors = false) {
  if (v == null || v === 0) return 'v-na';
  // For most stats, positive is good. For instability/catastrophic, negative is good.
  if (invertColors) {
    return v < 0 ? 'v-pos' : 'v-neg';
  }
  return v > 0 ? 'v-pos' : 'v-neg';
}
