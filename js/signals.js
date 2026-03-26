// ============================================================
// SC Hub Mining v3 — signals.js (Signal Spectrum)
// Visual signal guide with dynamic cluster multiples per ore,
// rock composition info, and detachable popup window
// ============================================================

// Signal state
let signalState = {
  context: 'surface',
  tier: 'all',
};

// ============================================================
// CLUSTER MAX — derived from cluster_factor
// ============================================================
function getClusterMax(oreCode) {
  // Always show up to 5× — cluster_factor controls how often clusters form,
  // not the maximum size. Any ore CAN appear in clusters of 5, just rarer
  // for low cluster_factor ores. Players need all multiples to identify scans.
  return 5;
}

// ============================================================
// MAIN RENDER
// ============================================================
function renderSignals() {
  const panel = document.getElementById('panel-signals');
  if (!panel) return;

  panel.innerHTML = `
    <div class="section-header">// Signal Spectrum</div>
    <div style="color:var(--text-secondary);margin-bottom:16px">
      Scanner signals range from <span style="color:var(--yellow)">3170</span> (Legendary) to <span style="color:var(--text-dim)">4300</span> (Common).
      In clusters, signals are <strong>additive</strong> — a 2-rock Quantanium cluster reads 6340.
      Cluster columns shown up to each ore's likely max based on cluster factor.
    </div>
    
    <div class="signal-controls" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;align-items:flex-end">
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">CONTEXT</label>
        <div class="chip-group" id="signal-context-chips"></div>
      </div>
      <div>
        <label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">TIER</label>
        <div class="chip-group" id="signal-tier-chips"></div>
      </div>
    </div>
    
    <div id="signal-spectrum-visual"></div>
    <div id="signal-table" style="margin-top:20px"></div>
  `;

  buildChips(
    document.getElementById('signal-context-chips'),
    [['Surface', 'surface'], ['Asteroid', 'asteroid'], ['FPS', 'fps'], ['Vehicle', 'vehicle']],
    signalState.context,
    v => { signalState.context = v; },
    renderSignalContent
  );

  buildChips(
    document.getElementById('signal-tier-chips'),
    [['All', 'all'], ['Legendary', 'legendary'], ['Epic', 'epic'], ['Rare', 'rare'], ['Uncommon', 'uncommon'], ['Common', 'common']],
    signalState.tier,
    v => { signalState.tier = v; },
    renderSignalContent
  );

  renderSignalContent();
}

// ============================================================
// RENDER SIGNAL CONTENT
// ============================================================
function renderSignalContent() {
  renderSignalSpectrum();
  renderSignalTable();
}

// ============================================================
// VISUAL SPECTRUM BAR — fixed visibility
// ============================================================
function renderSignalSpectrum() {
  const container = document.getElementById('signal-spectrum-visual');
  if (!container) return;

  const signals = getSignalsForContext(signalState.context);
  if (signals.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:20px">
      No signals found for ${signalState.context} context.
    </div>`;
    return;
  }

  const filtered = signalState.tier === 'all'
    ? signals
    : signals.filter(s => s.tier === signalState.tier);

  if (filtered.length === 0) {
    container.innerHTML = `<div style="color:var(--text-dim);text-align:center;padding:20px">
      No ${signalState.tier} tier signals found.
    </div>`;
    return;
  }

  const allSignals = getSignalsForContext(signalState.context);
  const minSig = Math.min(...allSignals.map(s => s.signal_value));
  const maxSig = Math.max(...allSignals.map(s => s.signal_value));
  const range = maxSig - minSig;

  const tierColors = {
    legendary: '#F0C040',
    epic: '#9B7EDB',
    rare: '#4DC9F6',
    uncommon: '#3DD68C',
    common: '#7A8290',
  };

  // Build markers as absolutely positioned dots OUTSIDE the gradient
  let markersHtml = '';
  for (const sig of filtered) {
    const pct = range > 0 ? ((sig.signal_value - minSig) / range * 100) : 50;
    const color = tierColors[sig.tier] || '#7A8290';
    const name = oreName(sig.ore_hint);

    markersHtml += `
      <div class="sig-dot"
           style="left:${pct}%;background:${color};box-shadow:0 0 6px ${color}"
           data-signal="${sig.signal_value}"
           data-ore="${sig.ore_hint}"
           title="${name}: ${sig.signal_value}">
      </div>
    `;
  }

  container.innerHTML = `
    <div style="padding:0 10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);margin-bottom:4px">
        <span>\u2190 Rare (${minSig.toFixed(0)})</span>
        <span>Common (${maxSig.toFixed(0)}) \u2192</span>
      </div>
      <div style="position:relative;height:50px;margin-bottom:4px">
        <!-- Gradient background -->
        <div style="
          position:absolute;top:12px;left:0;right:0;height:24px;
          background:linear-gradient(90deg, #F0C040 0%, #9B7EDB 18%, #4DC9F6 40%, #3DD68C 65%, #4A505A 100%);
          border-radius:4px;opacity:0.25;
        "></div>
        <!-- Markers on top -->
        ${markersHtml}
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-dim)">
        <span>LEGENDARY</span>
        <span>EPIC</span>
        <span>RARE</span>
        <span>UNCOMMON</span>
        <span>COMMON</span>
      </div>
    </div>
  `;

  // Hover interaction for spectrum dots
  container.querySelectorAll('.sig-dot').forEach(dot => {
    dot.addEventListener('mouseenter', e => {
      showSignalTooltip(e.target, dot.dataset.signal, dot.dataset.ore);
    });
    dot.addEventListener('mouseleave', hideSignalTooltip);
  });
}

// ============================================================
// SIGNAL TOOLTIP — shows cluster multiples up to ore max
// ============================================================
let signalTooltip = null;

function showSignalTooltip(element, signal, oreCode) {
  hideSignalTooltip();

  const base = parseFloat(signal);
  const name = oreName(oreCode);
  const maxCluster = getClusterMax(oreCode);
  const cf = D.ore_elements?.[oreCode]?.cluster_factor ?? D.ores?.[oreCode]?.difficulty?.cluster_factor ?? 0;

  let rows = '';
  for (let i = 1; i <= maxCluster; i++) {
    const isBold = i === 1;
    rows += `<tr>
      <td style="padding:2px 8px;color:var(--text-dim)">${i}\u00d7</td>
      <td class="mono" style="padding:2px 8px;text-align:right;${isBold ? 'color:var(--cyan);font-weight:700' : 'color:var(--text-secondary)'}">${(base * i).toFixed(0)}</td>
    </tr>`;
  }

  signalTooltip = document.createElement('div');
  signalTooltip.className = 'signal-tooltip';
  signalTooltip.innerHTML = `
    <div style="font-weight:600;margin-bottom:6px;color:var(--text-primary)">${name}</div>
    <table style="font-size:12px;width:100%">${rows}</table>
    ${cf > 0 ? `<div style="font-size:10px;color:var(--text-dim);margin-top:6px">Cluster factor: ${cf.toFixed(1)}</div>` : ''}
  `;

  document.body.appendChild(signalTooltip);

  const rect = element.getBoundingClientRect();
  signalTooltip.style.position = 'fixed';
  signalTooltip.style.left = (rect.left + rect.width / 2) + 'px';
  signalTooltip.style.top = (rect.bottom + 8) + 'px';
  signalTooltip.style.transform = 'translateX(-50%)';
  signalTooltip.style.zIndex = '1000';
}

function hideSignalTooltip() {
  if (signalTooltip) {
    signalTooltip.remove();
    signalTooltip = null;
  }
}

// ============================================================
// SIGNAL TABLE — dynamic cluster columns per ore + rocks info
// ============================================================
function renderSignalTable() {
  const container = document.getElementById('signal-table');
  if (!container) return;

  const signals = getSignalsForContext(signalState.context);
  const filtered = signalState.tier === 'all'
    ? signals
    : signals.filter(s => s.tier === signalState.tier);

  if (filtered.length === 0) {
    container.innerHTML = '';
    return;
  }

  // Deduplicate by base ore code
  const deduped = new Map();
  for (const sig of filtered) {
    const baseOre = sig.ore_hint.split('_')[0];
    if (!deduped.has(baseOre) || sig.signal_value < deduped.get(baseOre).signal_value) {
      deduped.set(baseOre, sig);
    }
  }

  const uniqueSignals = Array.from(deduped.values()).sort((a, b) => a.signal_value - b.signal_value);

  // Determine max cluster across all visible ores for table column count
  const globalMax = Math.max(...uniqueSignals.map(s => getClusterMax(s.ore_hint.split('_')[0])));

  // Build column headers
  let clusterHeaders = '';
  for (let i = 1; i <= globalMax; i++) {
    clusterHeaders += `<th>${i}\u00d7${i === 1 ? ' (BASE)' : ' CLUSTER'}</th>`;
  }

  let html = `
    <table class="eq-table signal-table">
      <thead>
        <tr>
          <th style="text-align:left">ORE</th>
          <th>TIER</th>
          ${clusterHeaders}
          <th>DIFFICULTY</th>
          <th style="text-align:left">ROCKS CONTAINING</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const sig of uniqueSignals) {
    const base = sig.signal_value;
    const baseOre = sig.ore_hint.split('_')[0];
    const diff = getOreDifficulty(baseOre);
    const clusterMax = getClusterMax(baseOre);
    const cf = D.ore_elements?.[baseOre]?.cluster_factor ?? 0;

    // Build cluster cells
    let clusterCells = '';
    for (let i = 1; i <= globalMax; i++) {
      if (i <= clusterMax) {
        const isBase = i === 1;
        const isLikely = i <= Math.max(1, Math.ceil(cf * 5));
        clusterCells += `<td class="mono" style="${isBase ? 'color:var(--cyan);font-weight:700' : isLikely ? 'color:var(--text-primary)' : 'color:var(--text-secondary)'}">${(base * i).toFixed(0)}</td>`;
      } else {
        clusterCells += `<td class="mono" style="color:var(--border)">\u2014</td>`;
      }
    }

    // Find rock compositions containing this ore
    const rocks = getRocksForOre(baseOre, signalState.context);
    const rocksHtml = rocks.length > 0
      ? rocks.slice(0, 3).map(r => {
          const isPrimary = r.primary;
          return `<span style="color:${isPrimary ? 'var(--green)' : 'var(--yellow)'}; font-size:11px">${r.name}${isPrimary ? '' : ` (${r.pct}%)`}</span>`;
        }).join(', ')
      : '<span style="color:var(--text-dim);font-size:11px">Direct</span>';

    html += `
      <tr class="signal-row" data-ore="${baseOre}" data-signal="${base}" data-max="${clusterMax}">
        <td style="text-align:left">
          <span style="font-weight:600">${oreName(baseOre)}</span>
          ${cf > 0 ? `<span style="font-size:10px;color:var(--text-dim);margin-left:6px" title="Cluster factor: ${cf.toFixed(1)}">cf:${cf.toFixed(1)}</span>` : ''}
        </td>
        <td>${tierTag(sig.tier)}</td>
        ${clusterCells}
        <td>${diff ? difficultyTag(diff.resistance) : '<span class="v-na">\u2014</span>'}</td>
        <td style="text-align:left">${rocksHtml}</td>
      </tr>
    `;
  }

  html += '</tbody></table>';

  // Legend
  html += `
    <div style="margin-top:12px;display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--text-dim)">
      <span><span style="color:var(--cyan)">\u25CF</span> Base signal</span>
      <span><span style="color:var(--text-primary)">\u25CF</span> Likely cluster size</span>
      <span><span style="color:var(--text-secondary)">\u25CF</span> Possible cluster</span>
      <span><span style="color:var(--border)">\u2014</span> Exceeds max for this ore</span>
      <span title="Cluster factor: 0=solo, 0.9=large clusters">cf = cluster factor</span>
      <span style="margin-left:auto">
        <button class="chip" onclick="openSignalPopup()" style="font-size:10px;padding:3px 8px" title="Open signals in a small overlay window">
          \u{1F5D7} Pop Out
        </button>
      </span>
    </div>
  `;

  container.innerHTML = html;

  // Row click → open finder
  container.querySelectorAll('.signal-row').forEach(row => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      openFinderForOre(row.dataset.ore);
    });
  });

  // Row hover → show tooltip
  container.querySelectorAll('.signal-row').forEach(row => {
    row.addEventListener('mouseenter', (e) => {
      const rect = row.getBoundingClientRect();
      showSignalTooltip(
        {getBoundingClientRect: () => ({left: rect.right - 60, right: rect.right, top: rect.top, bottom: rect.bottom, width: 60, height: rect.height})},
        row.dataset.signal,
        row.dataset.ore
      );
    });
    row.addEventListener('mouseleave', hideSignalTooltip);
  });
}

// ============================================================
// GET ROCKS FOR ORE — which compositions contain this ore
// ============================================================
function getRocksForOre(oreCode, context) {
  const results = [];
  const comps = D.compositions || {};

  for (const [key, comp] of Object.entries(comps)) {
    // Match context (surface ≈ asteroid for ship mining)
    const ctx = comp.mining_context || '';
    if (context === 'surface' && ctx !== 'surface' && ctx !== 'asteroid') continue;
    if (context === 'asteroid' && ctx !== 'asteroid' && ctx !== 'surface') continue;
    if (context !== 'surface' && context !== 'asteroid' && ctx !== context) continue;

    const isPrimary = comp.primary_ore === oreCode;
    const secondaryPart = comp.parts?.find(p => p.ore === oreCode && p.ore !== comp.primary_ore);

    if (isPrimary) {
      results.push({
        name: oreName(comp.primary_ore),
        primary: true,
        pct: 100,
      });
    } else if (secondaryPart) {
      const avgPct = ((secondaryPart.min_pct || 0) + (secondaryPart.max_pct || 0)) / 2;
      results.push({
        name: oreName(comp.primary_ore) + ' rock',
        primary: false,
        pct: avgPct.toFixed(0),
      });
    }
  }

  // Deduplicate
  const seen = new Set();
  return results.filter(r => {
    const key = r.name + r.primary;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ============================================================
// POP-OUT WINDOW — small overlay for use alongside the game
// ============================================================
function openSignalPopup() {
  const signals = getSignalsForContext(signalState.context);
  const filtered = signalState.tier === 'all'
    ? signals
    : signals.filter(s => s.tier === signalState.tier);

  // Deduplicate
  const deduped = new Map();
  for (const sig of filtered) {
    const baseOre = sig.ore_hint.split('_')[0];
    if (!deduped.has(baseOre) || sig.signal_value < deduped.get(baseOre).signal_value) {
      deduped.set(baseOre, sig);
    }
  }
  const uniqueSignals = Array.from(deduped.values()).sort((a, b) => a.signal_value - b.signal_value);

  // Build minimal HTML for the popup
  let tableRows = '';
  for (const sig of uniqueSignals) {
    const base = sig.signal_value;
    const baseOre = sig.ore_hint.split('_')[0];
    const name = oreName(baseOre);
    const maxC = getClusterMax(baseOre);
    const diff = getOreDifficulty(baseOre);

    const tierColors = {legendary:'#F0C040', epic:'#9B7EDB', rare:'#4DC9F6', uncommon:'#3DD68C', common:'#7A8290'};
    const tc = tierColors[sig.tier] || '#7A8290';
    const dc = diff?.resistance >= 0.7 ? '#F85149' : diff?.resistance >= 0.4 ? '#E8751A' : diff?.resistance >= 0 ? '#F0C040' : '#3DD68C';
    const dl = diff?.resistance >= 0.7 ? 'EXT' : diff?.resistance >= 0.4 ? 'HRD' : diff?.resistance >= 0 ? 'MED' : 'EZ';

    let cells = `<td style="color:${tc};font-weight:600">${name}</td>`;
    cells += `<td style="color:#4DC9F6;font-weight:700">${base.toFixed(0)}</td>`;
    for (let i = 2; i <= 5; i++) {
      if (i <= maxC) {
        cells += `<td>${(base * i).toFixed(0)}</td>`;
      } else {
        cells += `<td style="color:#30363D">\u2014</td>`;
      }
    }
    cells += `<td style="color:${dc}">${dl}</td>`;

    tableRows += `<tr>${cells}</tr>`;
  }

  const popupHtml = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>SC Hub Signal Guide</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#0D1117; color:#E6EDF3; font-family:'Segoe UI',system-ui,sans-serif; font-size:11px; padding:4px; overflow-y:auto; }
  table { width:100%; border-collapse:collapse; }
  th { background:#161B22; color:#E8751A; font-size:9px; text-transform:uppercase; letter-spacing:1px; padding:3px 4px; text-align:center; border-bottom:1px solid #30363D; position:sticky; top:0; }
  th:first-child { text-align:left; }
  td { padding:3px 4px; text-align:center; border-bottom:1px solid #21262D; font-family:'Consolas','Courier New',monospace; font-size:11px; }
  td:first-child { text-align:left; font-family:'Segoe UI',system-ui,sans-serif; }
  tr:hover td { background:#21262D; }
  .hdr { display:flex; justify-content:space-between; align-items:center; padding:2px 4px 6px; border-bottom:1px solid #30363D; margin-bottom:4px; }
  .hdr span { color:#E8751A; font-size:10px; letter-spacing:2px; text-transform:uppercase; }
  .hdr small { color:#484F58; font-size:9px; }
</style>
</head><body>
<div class="hdr">
  <span>// Signal Guide</span>
  <small>${signalState.context.toUpperCase()} \u2022 ${signalState.tier.toUpperCase()}</small>
</div>
<table>
  <thead><tr><th style="text-align:left">Ore</th><th>1\u00d7</th><th>2\u00d7</th><th>3\u00d7</th><th>4\u00d7</th><th>5\u00d7</th><th>Diff</th></tr></thead>
  <tbody>${tableRows}</tbody>
</table>
</body></html>`;

  // Calculate window size — compact
  const rowCount = uniqueSignals.length;
  const height = Math.min(80 + rowCount * 22, 600);
  const width = 420;

  const popup = window.open('', 'sc_hub_signals', `width=${width},height=${height},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`);
  if (popup) {
    popup.document.write(popupHtml);
    popup.document.close();
  } else {
    alert('Popup blocked — please allow popups for this site to use the signal overlay.');
  }
}
