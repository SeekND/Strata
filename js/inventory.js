// ============================================================
// SC Hub Mining v3 — inventory.js (Inventory System)
// Full per-location batch tracking with collection + export
// ============================================================

const INV_KEY = 'schub_mining_inventory';
let inventory = []; // [{id, ore, quantity_scu, type, quality, location, date_added, collected, collected_date}]
let invView = 'ore';
let invNextId = 1;
let invEditId = null;

// ============================================================
// LOAD / SAVE
// ============================================================
function loadInventory() {
  try {
    const raw = localStorage.getItem(INV_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        inventory = parsed;
        invNextId = Math.max(1, ...inventory.map(e => parseInt(e.id?.replace('inv_', '') || '0'))) + 1;
      } else if (typeof parsed === 'object') {
        // Migrate from simple {ore: qty} format
        inventory = [];
        for (const [ore, qty] of Object.entries(parsed)) {
          if (qty > 0) {
            inventory.push({
              id: 'inv_' + (invNextId++), ore, quantity_scu: qty,
              type: 'raw_ore', quality: 0, location: 'cargo',
              date_added: new Date().toISOString().split('T')[0],
            });
          }
        }
      }
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
  try {
    localStorage.setItem(INV_KEY, JSON.stringify(inventory));
  } catch(e) { console.error('Failed to save inventory:', e); }
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function setInvView(view) {
  invView = view;
  document.getElementById('inv-view-ore')?.classList.toggle('active', view === 'ore');
  document.getElementById('inv-view-loc')?.classList.toggle('active', view === 'location');
  document.getElementById('inv-view-collected')?.classList.toggle('active', view === 'collected');
  renderInventory();
}

// ============================================================
// ADD / EDIT / REMOVE
// ============================================================
function showAddEntry() {
  const form = document.getElementById('inv-add-form');
  if (form.style.display !== 'none' && !invEditId) { form.style.display = 'none'; return; }
  invEditId = null;
  renderAddForm();
}

function renderAddForm(defaults) {
  const form = document.getElementById('inv-add-form');
  const d = defaults || {};
  const oreOpts = Object.entries(D.ores || {})
    .filter(([, o]) => o.form !== 'waste')
    .sort((a, b) => (a[1].display_name || '').localeCompare(b[1].display_name || ''))
    .map(([code, o]) => `<option value="${code}" ${code === d.ore ? 'selected' : ''}>${o.display_name}</option>`).join('');

  const locOpts = ['cargo', ...Object.keys(D.locations || {}).filter(k => {
    const l = D.locations[k]; return l.has_refinery || l.type === 'station';
  }).sort()].map(l => `<option value="${l}" ${l === d.location ? 'selected' : ''}>${l === 'cargo' ? 'In Cargo' : locName(l)}</option>`).join('');

  const isEdit = !!invEditId;
  form.innerHTML = `<div class="inv-form">
    <div class="inv-form-row"><label>Ore</label><select id="inv-f-ore" style="width:180px">${oreOpts}</select></div>
    <div class="inv-form-row"><label>Quantity</label><input type="number" id="inv-f-qty" value="${d.quantity_scu || 1}" min="0.01" step="0.1"> <span style="color:var(--text-dim)">SCU</span></div>
    <div class="inv-form-row"><label>Type</label>
      <select id="inv-f-type"><option value="raw_ore" ${d.type === 'raw_ore' ? 'selected' : ''}>Raw Ore</option><option value="refining" ${d.type === 'refining' ? 'selected' : ''}>Refining</option><option value="refined" ${d.type === 'refined' ? 'selected' : ''}>Refined</option></select>
    </div>
    <div class="inv-form-row"><label>Quality</label><input type="number" id="inv-f-quality" value="${d.quality || 0}" min="0" max="1000" step="1"> <span style="color:var(--text-dim)">0-1000</span></div>
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

// ============================================================
// COLLECTION SYSTEM
// ============================================================
function collectEntry(id) {
  const entry = inventory.find(e => e.id === id);
  if (!entry) return;
  entry.collected = true;
  entry.collected_date = new Date().toISOString().split('T')[0];
  saveInventory(); renderInventory();
}

function uncollectEntry(id) {
  const entry = inventory.find(e => e.id === id);
  if (!entry) return;
  delete entry.collected; delete entry.collected_date;
  saveInventory(); renderInventory();
}

function collectAllSelected() {
  const items = getCollectItems();
  items.forEach(ci => {
    const entry = inventory.find(e => e.id === ci.id);
    if (!entry) return;
    if (ci.collect_scu >= entry.quantity_scu) {
      entry.collected = true;
      entry.collected_date = new Date().toISOString().split('T')[0];
    } else {
      entry.quantity_scu -= ci.collect_scu;
      inventory.push({
        id: 'inv_' + (invNextId++), ore: entry.ore, quantity_scu: ci.collect_scu,
        type: entry.type, quality: entry.quality, location: entry.location,
        date_added: entry.date_added, collected: true,
        collected_date: new Date().toISOString().split('T')[0],
      });
    }
  });
  saveInventory(); renderInventory();
}

function setCollectAll() {
  document.querySelectorAll('.inv-collect').forEach(input => { input.value = input.max; });
  updateCollectSummary();
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

// ============================================================
// TYPE TAG HELPER
// ============================================================
function typeTag(t) {
  if (t === 'refined') return '<span class="tag tag-best">REFINED</span>';
  if (t === 'refining') return '<span class="tag" style="background:rgba(240,192,64,0.1);color:var(--yellow);border:1px solid rgba(240,192,64,0.25)">REFINING</span>';
  return '<span class="tag" style="background:rgba(232,64,64,0.1);color:var(--red);border:1px solid rgba(232,64,64,0.25)">RAW ORE</span>';
}

function collectCell(e) {
  return `<div style="display:flex;align-items:center;gap:2px">
    <button class="inv-row-actions" style="border:0" onclick="adjCollect('${e.id}',-1)">-</button>
    <input type="number" class="inv-collect" data-id="${e.id}" value="0" min="0" max="${e.quantity_scu}" step="0.1" onchange="updateCollectSummary()">
    <button class="inv-row-actions" style="border:0" onclick="adjCollect('${e.id}',1)">+</button>
    <button style="background:none;border:1px solid var(--border);color:var(--text-dim);font-size:9px;padding:1px 4px;cursor:pointer;font-family:var(--font-mono)" onclick="maxCollect('${e.id}')">All</button>
  </div>`;
}

// ============================================================
// MAIN RENDER
// ============================================================
function renderInventory() {
  const tableEl = document.getElementById('inv-table');
  const summaryEl = document.getElementById('inv-summary');
  const collectEl = document.getElementById('inv-collect-summary');
  if (!tableEl) return;

  const active = inventory.filter(e => !e.collected);
  const collected = inventory.filter(e => e.collected);

  if (invView === 'collected') {
    if (collected.length === 0) {
      tableEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-secondary);padding:30px">No collected items yet. Use the Collect column in By Ore or By Location view to mark items as collected.</div>';
    } else {
      let html = '<table><thead><tr><th>Ore</th><th>Qty</th><th>Type</th><th>Quality</th><th>Location</th><th>Collected</th><th></th></tr></thead><tbody>';
      collected.forEach(e => {
        html += `<tr style="opacity:0.7">
          <td>${miningMethodTag(D.ores?.[e.ore]?.mining_method || 'ship')} ${oreName(e.ore)}</td>
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
    if (summaryEl) summaryEl.innerHTML = '';
    if (collectEl) collectEl.innerHTML = `<div style="font-size:11px;color:var(--text-dim)">${collected.length} collected entries</div>`;
    return;
  }

  if (active.length === 0) {
    tableEl.innerHTML = '<div class="card" style="text-align:center;color:var(--text-secondary);padding:30px">No inventory entries yet. Click <strong>+ Add Entry</strong> to start tracking.</div>';
    if (summaryEl) summaryEl.innerHTML = '';
    if (collectEl) collectEl.innerHTML = '';
    return;
  }

  let html = '';
  if (invView === 'ore') {
    const groups = {};
    active.forEach(e => { if (!groups[e.ore]) groups[e.ore] = []; groups[e.ore].push(e); });

    for (const [ore, entries] of Object.entries(groups).sort((a, b) => oreName(a[0]).localeCompare(oreName(b[0])))) {
      const total = entries.reduce((s, e) => s + e.quantity_scu, 0);
      html += `<div class="inv-group-header">${miningMethodTag(D.ores?.[ore]?.mining_method || 'ship')} ${oreName(ore)} <span class="total">${total.toFixed(1)} SCU</span></div>`;
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
          <td>${miningMethodTag(D.ores?.[e.ore]?.mining_method || 'ship')} ${oreName(e.ore)}</td>
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
  if (summaryEl) {
    let sumHtml = `<div class="map-info-title">// Summary</div>`;
    sumHtml += `<div style="font-family:var(--font-mono);font-size:12px;color:var(--accent);margin-bottom:6px">${active.length} active | ${collected.length} collected | ${grandTotal.toFixed(1)} SCU</div>`;
    for (const [ore, t] of Object.entries(oreTotals).sort((a, b) => oreName(a[0]).localeCompare(oreName(b[0])))) {
      const total = t.raw + t.refining + t.refined;
      let detail = [];
      if (t.refined > 0) detail.push(`<span class="v-pos">${t.refined.toFixed(1)}r</span>`);
      if (t.refining > 0) detail.push(`<span class="v-warn">${t.refining.toFixed(1)}ing</span>`);
      if (t.raw > 0) detail.push(`<span class="v-neg">${t.raw.toFixed(1)}raw</span>`);
      sumHtml += `<div style="font-size:12px;margin-bottom:2px"><strong>${oreName(ore)}</strong> <span class="mono">${total.toFixed(1)}</span> ${detail.join(' ')}</div>`;
    }
    summaryEl.innerHTML = sumHtml;
  }
  updateCollectSummary();
}

// ============================================================
// COLLECTION SUMMARY
// ============================================================
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
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = `<div style="color:var(--text-dim);font-size:11px">Use -/+/All in Collect column, then export.</div>
      <button class="chip" onclick="setCollectAll()" style="margin-top:4px;width:100%;text-align:center;font-size:11px">Select All for Collection</button>
      <button class="chip" onclick="collectAllSelected()" style="margin-top:4px;width:100%;text-align:center;font-size:11px;color:var(--green)">Mark Selected as Collected</button>`;
    return;
  }
  const total = items.reduce((s, i) => s + i.collect_scu, 0);
  el.innerHTML = `<div style="font-family:var(--font-mono);font-size:12px;color:var(--green);margin-bottom:6px">${items.length} items | ${total.toFixed(1)} SCU selected</div>
    <button class="chip" onclick="setCollectAll()" style="width:100%;text-align:center;font-size:11px">Select All</button>
    <button class="chip" onclick="collectAllSelected()" style="margin-top:4px;width:100%;text-align:center;font-size:11px;color:var(--green)">Mark Selected as Collected</button>`;
}

// ============================================================
// EXPORTS
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
    const all = {};
    inventory.forEach(e => {
      const name = oreName(e.ore);
      if (!all[name]) all[name] = {total_scu: 0, refined_scu: 0, raw_scu: 0};
      all[name].total_scu += e.quantity_scu;
      if (e.type === 'refined') all[name].refined_scu += e.quantity_scu;
      else all[name].raw_scu += e.quantity_scu;
    });
    showExport(JSON.stringify({source: 'sc_hub_mining', date: new Date().toISOString().split('T')[0], available_materials: all}, null, 2));
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
  showExport(JSON.stringify({source: 'sc_hub_mining', date: new Date().toISOString().split('T')[0], collection: out}, null, 2));
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
    text += `\n\`\`\`\n${loc}\n${'\u2500'.repeat(loc.length)}\n`;
    entries.forEach(e => {
      const type = e.type === 'raw_ore' ? 'Raw' : e.type === 'refining' ? 'Rfng' : 'Refd';
      text += `${oreName(e.ore).padEnd(18)} ${e.collect_scu.toFixed(1).padStart(6)} SCU  ${type}  Q:${e.quality}\n`;
    });
    text += '```';
  }
  showExport(text);
}
