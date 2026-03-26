// ============================================================
// SC Hub Mining v3 — methods.js (Refining Methods)
// Display refining method characteristics
// ============================================================

// ============================================================
// MAIN RENDER
// ============================================================
function renderMethods() {
  const panel = document.getElementById('panel-methods');
  if (!panel) return;

  const methods = D.refineries?.methods || {};

  panel.innerHTML = `
    <div class="section-header">// Refining Methods</div>
    <div style="color:var(--text-secondary);margin-bottom:16px">
      Each refinery offers different methods with varying speed, yield, and cost trade-offs.
    </div>
    
    <div class="methods-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
      ${Object.entries(methods).map(([key, method]) => renderMethodCard(key, method)).join('')}
    </div>
    
    <div class="card" style="margin-top:24px;border-left:3px solid var(--cyan)">
      <div class="map-info-title">CHOOSING A METHOD</div>
      <div style="margin-top:12px;font-size:13px;line-height:1.8;color:var(--text-secondary)">
        <strong>Speed</strong> — How fast the job completes. Higher = less waiting.<br>
        <strong>Yield</strong> — Percentage of refined ore you receive. Higher = more profit.<br>
        <strong>Cost</strong> — Base processing fee. Higher = more expensive.<br><br>
        <strong>Recommendation:</strong> For valuable ores (Quantanium, Bexalite), use high-yield methods even if slower.
        For bulk common ores, speed may be more important. Dinyx is often the best all-rounder.
      </div>
    </div>
  `;
}

// ============================================================
// RENDER METHOD CARD
// ============================================================
function renderMethodCard(key, method) {
  const speedPips = method.speed || 3;
  const yieldPips = method.yield || 3;
  const costPips = method.cost || 3;

  // Determine if this is a "good" method
  const score = yieldPips * 2 - costPips + speedPips;
  const borderColor = score >= 9 ? 'var(--green)' : score >= 6 ? 'var(--cyan)' : 'var(--border)';

  return `
    <div class="card" style="border-left:3px solid ${borderColor}">
      <div style="font-size:16px;font-weight:700;color:var(--text-primary)">${method.name || key}</div>
      
      <div style="margin-top:16px;display:grid;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text-dim)">Speed</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${renderPips(speedPips, 5)}
            <span class="mono" style="width:20px;text-align:right;font-size:11px;color:var(--text-secondary)">${speedPips}/5</span>
          </div>
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text-dim)">Yield</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${renderPips(yieldPips, 5)}
            <span class="mono" style="width:20px;text-align:right;font-size:11px;color:var(--text-secondary)">${yieldPips}/5</span>
          </div>
        </div>
        
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--text-dim)">Cost</span>
          <div style="display:flex;align-items:center;gap:8px">
            ${renderPips(costPips, 5)}
            <span class="mono" style="width:20px;text-align:right;font-size:11px;color:var(--text-secondary)">${costPips}/5</span>
          </div>
        </div>
      </div>
      
      ${getMethodDescription(key) ? `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);font-size:12px;color:var(--text-secondary)">
          ${getMethodDescription(key)}
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
// METHOD DESCRIPTIONS
// ============================================================
function getMethodDescription(key) {
  const descriptions = {
    'cormack': 'Budget option. Low yield but cheap. Good for low-value ores.',
    'dinyx': 'Balanced all-rounder. Good yield, moderate speed and cost.',
    'electrostarolysis': 'Premium yield at premium price. Best for valuable ores.',
    'ferron_exchange': 'Fast processing. Sacrifices some yield for speed.',
    'gaskin_process': 'Steady and reliable. Middle-ground on all metrics.',
    'kazen_winnowing': 'Specialized method. Check specific ore yields.',
    'pyrometric_chromalysis': 'High-tech process. Excellent yield, higher cost.',
    'thermonatic_deposition': 'Industrial standard. Decent across the board.',
    'xcr_reaction': 'Experimental. Variable results depending on ore type.',
  };
  
  return descriptions[key.toLowerCase()] || '';
}
