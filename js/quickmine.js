// ============================================================
// SC Hub Mining v3 — quickmine.js (Quick Mine)
// ============================================================
let qmState = { ship: 'prospector', ore: null, mode: 'medium', system: 'all' };

const QM_SHIPS = {
  prospector: { label: 'Prospector', method: 'ship', laserSize: 1, turrets: 1, hasModules: true },
  mole_solo: { label: 'MOLE (solo)', method: 'ship', laserSize: 2, turrets: 3, hasModules: true, isMole: true },
  mole_crew: { label: 'MOLE (crew)', method: 'ship', laserSize: 2, turrets: 3, hasModules: true, isMole: true, isCrew: true },
  golem: { label: 'Golem (bespoke)', method: 'ship', laserSize: 1, turrets: 1, hasModules: true, bespoke: true },
  roc: { label: 'ROC / GEO (vehicle)', method: 'vehicle', hasModules: false },
  fps: { label: 'Hand Mining (FPS)', method: 'fps', hasModules: false },
};

// PVP zone ores
const PVP_ORES = new Set(['CARINITE', 'CARINITEPURE', 'JACLIUM', 'SALDYNIUM']);

function initQuickMine() {
  const container = document.getElementById('quick-mine');
  if (!container) return;
  container.innerHTML = `
    <div class="section-header">// Quick Mine \u2014 I just want to go mine!</div>
    <div class="qm-controls" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">
      <div><label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">SHIP</label>
        <select id="qm-ship" class="dm-select">${Object.entries(QM_SHIPS).map(([k,v])=>`<option value="${k}"${k===qmState.ship?' selected':''}>${v.label}</option>`).join('')}</select></div>
      <div><label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">MATERIAL</label>
        <select id="qm-ore" class="dm-select"><option value="">\u2014 Select Ore \u2014</option>${buildQmOreOptions()}</select></div>
      <div><label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">SYSTEM</label>
        <select id="qm-system" class="dm-select"><option value="all">Any</option><option value="Stanton">Stanton</option><option value="Pyro">Pyro</option><option value="Nyx">Nyx</option></select></div>
      <div id="qm-mode-wrap"><label style="font-size:11px;color:var(--text-dim);display:block;margin-bottom:4px">MODE</label>
        <select id="qm-mode" class="dm-select"><option value="easy">Easy (community)</option><option value="medium" selected>Medium (community)</option><option value="hard">Hard (community)</option><option value="optimized">Optimized for Ore (computed)</option></select></div>
    </div>
    <div id="qm-results"></div>`;

  document.getElementById('qm-ship').addEventListener('change', e => { qmState.ship=e.target.value; syncQmUI(); updateQmOreOptions(); runQuickMine(); });
  document.getElementById('qm-ore').addEventListener('change', e => { qmState.ore=e.target.value; runQuickMine(); });
  document.getElementById('qm-system').addEventListener('change', e => { qmState.system=e.target.value; runQuickMine(); });
  document.getElementById('qm-mode').addEventListener('change', e => { qmState.mode=e.target.value; runQuickMine(); });
  syncQmUI();
}

function syncQmUI() {
  const modeWrap = document.getElementById('qm-mode-wrap');
  if (modeWrap) modeWrap.style.display = QM_SHIPS[qmState.ship]?.hasModules ? '' : 'none';
}

/** Check if an ore is mineable by a given method */
function oreMatchesMethod(code, method) {
  const elem = D.ore_elements?.[code];
  const ore = D.ores?.[code];
  if (!elem && !ore) return false;
  if (method === 'ship') return !elem?.is_fps && !elem?.is_vehicle && !elem?.special_type;
  if (method === 'fps') {
    // FPS can mine: is_fps=true OR mining_method includes 'fps'
    if (elem?.is_fps) return true;
    const mm = ore?.mining_method || '';
    return mm === 'fps' || mm === 'fps_vehicle';
  }
  if (method === 'vehicle') {
    // Vehicle can mine: is_vehicle=true OR mining_method includes 'vehicle'
    if (elem?.is_vehicle) return true;
    const mm = ore?.mining_method || '';
    return mm === 'vehicle' || mm === 'fps_vehicle';
  }
  return false;
}

function buildQmOreOptions() {
  const method = QM_SHIPS[qmState.ship]?.method || 'ship';
  const ores = [];
  for (const [code, elem] of Object.entries(D.ore_elements || {})) {
    if (elem.special_type) continue;
    if (!oreMatchesMethod(code, method)) continue;
    ores.push({ code, name: elem.display_name || code });
  }
  ores.sort((a, b) => a.name.localeCompare(b.name));
  return ores.map(o => `<option value="${o.code}">${o.name}</option>`).join('');
}

function updateQmOreOptions() {
  const sel = document.getElementById('qm-ore');
  if (!sel) return;
  const prev = qmState.ore;
  sel.innerHTML = `<option value="">\u2014 Select Ore \u2014</option>${buildQmOreOptions()}`;
  if (prev && sel.querySelector(`option[value="${prev}"]`)) sel.value = prev;
  else qmState.ore = null;
}

// ============================================================
// MAIN RENDER
// ============================================================
function runQuickMine() {
  const container = document.getElementById('qm-results');
  if (!container) return;
  if (!qmState.ore) { container.innerHTML = '<div class="card" style="color:var(--text-secondary);text-align:center;padding:40px">Select a material above to get mining recommendations.</div>'; return; }

  const shipDef = QM_SHIPS[qmState.ship];
  const method = shipDef?.method || 'ship';
  const ore = qmState.ore;
  const system = qmState.system;
  const isGround = method === 'fps' || method === 'vehicle';

  const diff = getOreDifficulty(ore);
  const signal = getOreSignal(ore);
  const comp = getOreComposition(ore);
  const locations = rankLocationsForOre(ore, method, system);
  const bestLoc = locations[0];

  // Refineries — only for ship mining
  const bestRefinery = (!isGround && bestLoc) ? getBestRefinery(ore, system === 'all' ? 'all' : system) : null;
  const nearestRef = (!isGround && bestLoc) ? findRefineries(bestLoc.code, ore) : null;

  // Top row: Location + Refinery (or just location for ground)
  let html = '';
  if (isGround) {
    // Ground mining: single wide location card
    html += '<div class="card">';
    html += `<div class="map-info-title">GO ${method === 'fps' ? 'HAND' : 'SURFACE'} MINE HERE</div>`;
    if (bestLoc) {
      html += `<div style="font-size:18px;font-weight:700;margin-top:8px">${bestLoc.name}</div>
        <div style="margin-top:8px">${systemTag(bestLoc.system)} <span style="color:var(--text-dim)">${bestLoc.type}</span></div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Score: <span class="mono" style="color:var(--cyan)">${bestLoc.totalScore.toFixed(1)}</span></div>`;
    } else {
      html += '<div style="color:var(--text-dim);margin-top:8px">No locations found.</div>';
    }
    html += '</div>';

    // Ground mining info card
    if (method === 'vehicle') {
      html += `<div class="card" style="margin-top:16px;border-left:3px solid var(--accent)">
        <div class="map-info-title">ROC / GEO MINING</div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);line-height:1.7">
          The vehicle mining laser is sufficient for all surface ores. No modules or special equipment needed.
          ${diff ? `<br>${oreName(ore)} rock \u2014 resistance ${(diff.resistance * 100).toFixed(0)}%.` : ''}
        </div>
      </div>`;
    } else {
      html += `<div class="card" style="margin-top:16px;border-left:3px solid var(--purple)">
        <div class="map-info-title">FPS HAND MINING</div>
        <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);line-height:1.7">
          The Pyro Multi-Tool has no module slots. All FPS ores can be broken with the default tool.
          ${diff ? `<br>${oreName(ore)} rock \u2014 resistance ${(diff.resistance * 100).toFixed(0)}%.` : ''}
        </div>
      </div>`;
    }

    // No refinery for ground ores
    html += `<div style="margin-top:12px;font-size:12px;color:var(--text-dim);padding:8px 12px;border-left:2px solid var(--border)">
      FPS and vehicle-mined materials are sold directly \u2014 no refining required.
    </div>`;
  } else {
    // Ship mining: Location + Refinery side by side
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
    html += `<div class="card"><div class="map-info-title">GO MINE HERE</div>`;
    if (bestLoc) {
      html += `<div style="font-size:18px;font-weight:700;margin-top:8px">${bestLoc.name}</div>
        <div style="margin-top:8px">${systemTag(bestLoc.system)} <span style="color:var(--text-dim)">${bestLoc.type}</span></div>
        <div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Score: <span class="mono" style="color:var(--cyan)">${bestLoc.totalScore.toFixed(1)}</span></div>`;
    } else { html += '<div style="color:var(--text-dim);margin-top:8px">No locations found.</div>'; }
    html += '</div>';

    // Refinery card
    html += '<div class="card"><div class="map-info-title">REFINERY</div>';
    if (nearestRef?.nearest) {
      const nShort = nearestRef.nearest.name.split(' - ')[1] || nearestRef.nearest.name;
      html += `<div style="margin-top:8px"><span style="color:var(--text-dim);font-size:11px">NEAREST:</span> <strong>${nShort}</strong> ${nearestRef.nearest.yield != null ? fmtYield(nearestRef.nearest.yield) : ''}</div>`;
    }
    if (bestRefinery) {
      const isNear = nearestRef?.nearest?.name === bestRefinery.name;
      const bShort = bestRefinery.name.split(' - ')[1] || bestRefinery.name;
      if (isNear) {
        html += '<div style="margin-top:4px;color:var(--green);font-size:12px">\u2714 Nearest is also best!</div>';
      } else {
        html += `<div style="margin-top:8px"><span style="color:var(--green);font-size:11px">BEST:</span> <strong style="color:var(--green)">${bShort}</strong> ${fmtYield(bestRefinery.value)}`;
        if (nearestRef?.nearest?.yield != null) {
          const delta = bestRefinery.value - nearestRef.nearest.yield;
          if (delta > 0) html += ` <span class="delta-gain">(+${delta}% more)</span>`;
        }
        html += '</div>';
      }
    } else if (!nearestRef?.nearest) {
      html += '<div style="color:var(--text-dim);margin-top:8px">No refinery data.</div>';
    }
    html += '</div></div>';
  }

  // Ship loadout (only for ship mining)
  if (method === 'ship' && shipDef?.hasModules) {
    html += renderShipLoadout(shipDef, ore, diff);
  }

  // PVP warning
  if (PVP_ORES.has(ore)) {
    html += `<div class="card" style="margin-top:16px;border-left:3px solid var(--red)">
      <div class="map-info-title" style="color:var(--red)">\u26A0 PVP ZONE WARNING</div>
      <div style="margin-top:8px;font-size:13px;color:var(--text-secondary);line-height:1.7">
        <strong>${oreName(ore)}</strong> can only be obtained at Daymar or Aberdeen under the respective Outlaw Landing Pads (OLPs).
        These are <strong style="color:var(--red)">heavy PVP zones</strong> \u2014 expect hostile players. Go prepared or in a group.
      </div>
    </div>`;
  }

  // Material insight — tailored for ship vs ground
  html += renderMaterialInsight(ore, diff, signal, comp, locations, isGround);

  container.innerHTML = html;
}

// ============================================================
// SHIP LOADOUT
// ============================================================
function renderShipLoadout(shipDef, ore, diff) {
  const loadout = getLoadoutForOre(qmState.ship, qmState.mode, ore, diff);
  if (!loadout) return '';
  if (loadout.turrets && Array.isArray(loadout.turrets)) return renderMoleTurrets(loadout, ore, shipDef, diff);
  return renderSingleLaserLoadout(loadout, ore, diff);
}

function renderMoleTurrets(loadout, ore, shipDef, diff) {
  const modules = D.equipment?.modules || {};
  const lasers = D.equipment?.lasers || {};
  const modeLabel = qmState.mode === 'optimized' ? `OPTIMIZED FOR ${oreName(ore).toUpperCase()}` : qmState.mode.toUpperCase();
  const shipLabel = shipDef.isCrew ? 'MOLE (crew)' : 'MOLE (solo)';
  const sourceLabel = qmState.mode === 'optimized' ? 'COMPUTED FROM ORE DIFFICULTY' : 'COMMUNITY LOADOUT';

  let html = `<div class="card" style="margin-top:16px;border-left:3px solid var(--accent)">
    <div class="map-info-title">${modeLabel} \u2014 ${shipLabel}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:12px">${sourceLabel}</div>`;

  const colors = ['var(--cyan)', 'var(--accent)', 'var(--green)'];
  loadout.turrets.forEach((turret, i) => {
    const laserName = lasers[turret.laser]?.name || turret.laser;
    const modNames = (turret.modules||[]).map(m => {
      const mod = modules[m];
      return mod ? (mod.type==='active' ? '<span style="color:var(--accent)">\u26A1</span>' : '') + mod.name : m;
    });
    html += `<div style="padding:10px;margin-bottom:8px;background:rgba(255,255,255,0.02);border-left:2px solid ${colors[i]||'var(--border)'}">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong>Turret ${i+1}</strong> \u2014 <span style="color:var(--text-secondary)">${laserName}</span>
          ${modNames.length ? `<div style="font-size:12px;margin-top:4px">Modules: ${modNames.join(' + ')}</div>` : ''}</div>
        <div style="text-align:right;font-size:11px;color:var(--text-dim)">
          ${turret.max_mass ? `mass ~${turret.max_mass.toLocaleString()}` : ''}
          ${turret.effective_power ? `<br>${turret.effective_power.toLocaleString()} power` : ''}</div>
      </div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px">${turret.role||''}</div>
    </div>`;
  });
  if (loadout.notes) html += `<div style="font-size:11px;color:var(--text-dim);margin-top:4px">${loadout.notes}</div>`;
  html += '</div>';

  if (diff) html += renderGearRecommendations(diff);
  return html;
}

function renderSingleLaserLoadout(loadout, ore, diff) {
  const laser = D.equipment?.lasers?.[loadout.laser];
  const modules = D.equipment?.modules || {};
  const laserName = laser?.name || loadout.laser;
  const modeLabel = qmState.mode === 'optimized' ? `OPTIMIZED FOR ${oreName(ore).toUpperCase()}` : qmState.mode.toUpperCase();
  const sourceLabel = qmState.mode === 'optimized' ? 'COMPUTED FROM ORE DIFFICULTY' : 'COMMUNITY LOADOUT';

  let moduleHtml = '';
  if (loadout.modules?.length) {
    const names = loadout.modules.map(m => { const mod=modules[m]; return mod ? (mod.type==='active'?'<span style="color:var(--accent)">\u26A1</span>':'') + mod.name : m; });
    moduleHtml = `<div style="margin-top:8px">Modules: ${names.join(' + ')}</div>`;
  }
  let gadgetHtml = '';
  if (loadout.gadgets?.length) {
    const names = loadout.gadgets.map(g => D.equipment?.gadgets?.[g]?.name || g);
    gadgetHtml = `<div style="margin-top:8px">Gadget: <span class="tag" style="background:var(--purple-dim);color:var(--purple);border:1px solid var(--purple)">${names.join(', ')}</span></div>`;
  }
  let effectsHtml = '';
  if (laser && loadout.modules?.length) {
    let tR=laser.resistance||0, tI=laser.instability||0, tP=0;
    for (const m of loadout.modules) { const mod=modules[m]; if(mod){if(mod.resistance)tR+=mod.resistance;if(mod.instability)tI+=mod.instability;if(mod.power_mod)tP+=mod.power_mod;} }
    const fx=[];
    if(tR){const c=tR>0?'var(--green)':'var(--red)'; fx.push(`<span style="color:${c}">${tR>0?'+':''}${tR.toFixed(1)}% resist</span>`);}
    if(tI){const c=tI<0?'var(--green)':'var(--accent)'; fx.push(`<span style="color:${c}">${tI>0?'+':''}${tI.toFixed(1)}% instab</span>`);}
    if(tP) fx.push(`<span style="color:var(--cyan)">${tP>0?'+':''}${tP}% power</span>`);
    if(fx.length) effectsHtml=`<div style="font-size:12px;margin-top:4px">${fx.join(', ')}</div>`;
  }

  let html = `<div class="card" style="margin-top:16px;border-left:3px solid var(--accent)">
    <div class="map-info-title">${modeLabel} \u2014 ${QM_SHIPS[qmState.ship]?.label}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:4px">${sourceLabel}</div>
    <div style="margin-top:8px;font-size:14px;font-weight:600">${laserName}</div>
    ${effectsHtml}${moduleHtml}${gadgetHtml}
    ${loadout.max_mass?`<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Max rock mass: ~${loadout.max_mass.toLocaleString()}</div>`:''}
    ${loadout.effective_power?`<div style="font-size:12px;color:var(--text-dim)">Effective power: ${loadout.effective_power.toLocaleString()}</div>`:''}
    ${loadout.notes?`<div style="margin-top:8px;font-size:12px;color:var(--text-dim)">${loadout.notes}</div>`:''}
  </div>`;
  if (diff) html += renderGearRecommendations(diff);
  return html;
}

// ============================================================
// MATERIAL INSIGHT
// ============================================================
function renderMaterialInsight(ore, diff, signal, comp, locations, isGround) {
  let html = `<div class="card" style="margin-top:16px"><div class="map-info-title">MATERIAL INSIGHT \u2014 ${oreName(ore).toUpperCase()}</div><div style="margin-top:12px;display:grid;gap:8px;font-size:13px">`;

  if (diff) {
    if (isGround) {
      // Simple resistance display for ground ores
      html += `<div>${oreName(ore)} rock \u2014 resistance ${(diff.resistance * 100).toFixed(0)}%.</div>`;
    } else {
      const dl = diff.resistance>=0.7?'Extreme':diff.resistance>=0.4?'Hard':diff.resistance>=0?'Medium':'Easy';
      html += `<div><strong>${dl} rock</strong> \u2014 resistance ${(diff.resistance*100).toFixed(0)}%. ${diff.resistance>=0.4?'Needs strong modifiers.':'Standard power should work.'}</div>`;
      if (diff.instability>=500) html += `<div><span style="color:var(--red)">Extreme instability (${diff.instability.toFixed(0)})</span> \u2014 BoreMax gadget and stability modules essential.</div>`;
      else if (diff.instability>=200) html += `<div><span style="color:var(--accent)">High instability (${diff.instability.toFixed(0)})</span> \u2014 Use stability modules (Torpid, Optimum).</div>`;
      if (diff.explosion_multiplier>=100) html += `<div><span style="color:var(--red)">High explosion risk (${diff.explosion_multiplier.toFixed(0)}\u00d7)</span></div>`;
    }
  }

  if (signal && !isGround) {
    html += `<div>Scanner signal: <span class="mono" style="color:var(--cyan)">${signal.signal_value.toFixed(0)}</span>. Clusters: 2\u00d7=${(signal.signal_value*2).toFixed(0)}, 3\u00d7=${(signal.signal_value*3).toFixed(0)}.</div>`;
  }

  if (comp?.parts?.length > 1 && !isGround) {
    const secs = comp.parts.filter(p=>p.ore!==comp.primary_ore);
    html += `<div>Rock contains: ${secs.map(s=>`<span style="color:var(--yellow)">${oreName(s.ore)}</span> ${s.min_pct.toFixed(0)}\u2013${s.max_pct.toFixed(0)}%`).join(', ')}</div>`;
  }

  if (locations.length > 1) {
    html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)"><span style="color:var(--text-dim)">Also at:</span> ${locations.slice(1,5).map(l=>`<span class="chip" style="margin:2px;font-size:11px" onclick="openLocationExplorer('${l.code}')">${l.name}</span>`).join('')}${locations.length>5?` <span style="color:var(--text-dim)">+${locations.length-5} more</span>`:''}</div>`;
  }

  html += '</div></div>';
  return html;
}

// ============================================================
// GEAR RECOMMENDATIONS (ship only)
// ============================================================
function renderGearRecommendations(diff) {
  const tips=[];
  if(diff.resistance>=0.4) tips.push(`High resistance \u2014 use <strong>Surge</strong> (-15.5% res) or <strong>Rime</strong> (-24.8% res)`);
  if(diff.instability>=300) tips.push(`Unstable \u2014 equip <strong>Optimum</strong> (-80% catastrophic) or <strong>Torpid</strong> (+60% window, -60% catastrophic)`);
  if(diff.instability>=700) tips.push(`<span style="color:var(--red)">Extreme instability</span> \u2014 throw <strong>BoreMax</strong> gadget (-70% instability, reusable)`);
  if(QM_SHIPS[qmState.ship]?.bespoke) tips.push(`Golem bespoke laser has <strong>+25% resistance</strong> \u2014 always throw <strong>Sabir</strong> before cracking`);
  tips.push(`<strong>FLTR</strong> module (up to 24% less inert) improves cargo value \u2014 worth a slot if not struggling to crack`);
  return `<div class="card" style="margin-top:16px"><div class="map-info-title">GEAR RECOMMENDATIONS</div><div style="margin-top:12px;font-size:13px;line-height:1.8;color:var(--text-secondary)">${tips.map(t=>'\u2022 '+t).join('<br>')}</div></div>`;
}

// ============================================================
// GET LOADOUT
// ============================================================
function getLoadoutForOre(shipKey, mode, oreCode, oreDiff) {
  const loadouts = D.equipment?.loadouts || {};
  let loadoutKey = shipKey;
  if (shipKey==='mole_crew') loadoutKey='mole_3crew';
  if (shipKey==='mole_solo') loadoutKey='mole_solo';
  if (mode==='optimized') return computeOptimizedLoadout(shipKey, oreDiff);
  const sl = loadouts[loadoutKey];
  if (sl && typeof sl==='object') { if(sl[mode]) return sl[mode]; return sl.medium||sl.easy||Object.values(sl)[0]; }
  return null;
}

function computeOptimizedLoadout(shipKey, oreDiff) {
  if (!oreDiff) return null;
  const shipDef = QM_SHIPS[shipKey];
  if (shipDef?.isMole) {
    const loadouts = D.equipment?.loadouts||{};
    const key = shipDef.isCrew ? 'mole_3crew' : 'mole_solo';
    const ml = loadouts[key];
    return ml?.hard || ml?.medium || null;
  }
  const laserSize=shipDef?.laserSize||1; const isBespoke=shipDef?.bespoke||false;
  const lasers=D.equipment?.lasers||{}; const modules=D.equipment?.modules||{}; const gadgets=D.equipment?.gadgets||{};
  let laser=null, laserKey=null;
  if (isBespoke) { laserKey='drak_golem_s1'; laser=lasers[laserKey]; }
  else {
    const cands=Object.entries(lasers).filter(([,l])=>l.size===laserSize&&!l.bespoke);
    let pick;
    if(oreDiff.resistance>=0.5) pick=cands.find(([k])=>k.includes('helix'))||cands.find(([k])=>k.includes('lancet'))||cands[0];
    else if(oreDiff.instability>=500) pick=cands.find(([k])=>k.includes('arbor'))||cands.find(([k])=>k.includes('hofstede'))||cands[0];
    else pick=cands.find(([k])=>k.includes('helix'))||cands[0];
    if(pick) [laserKey,laser]=pick;
  }
  if (!laser) return null;
  const slots=laser.module_slots||0; const selMods=[];
  if(slots>0){
    const riegers=Object.entries(modules).filter(([k])=>k.includes('rieger'));
    const br=riegers.find(([k])=>k.includes('mk3'))||riegers[0];
    if(br) selMods.push(br[0]);
    if(slots>1){
      if(oreDiff.instability>=500){const p=Object.entries(modules).find(([k])=>k.includes('optimum'))||Object.entries(modules).find(([k])=>k.includes('torpid'));if(p)selMods.push(p[0]);}
      else if(oreDiff.resistance>=0.5){const p=Object.entries(modules).find(([k])=>k.includes('surge'));if(p)selMods.push(p[0]);}
      else{const f=Object.entries(modules).filter(([k])=>k.includes('focus'));const p=f.find(([k])=>k.includes('mk3'))||f[0];if(p)selMods.push(p[0]);}
    }
    if(slots>2&&selMods.length<slots){const f=Object.entries(modules).filter(([k])=>k.includes('focus'));const p=f.find(([k])=>k.includes('mk3'))||f[0];if(p&&!selMods.includes(p[0]))selMods.push(p[0]);}
  }
  const selGadgets=[];
  if(oreDiff.instability>=700||oreDiff.resistance>=0.7||isBespoke){const s=Object.entries(gadgets).find(([k])=>k.includes('sabir'));if(s)selGadgets.push(s[0]);}
  const bp=laser.max_power||2000; let pm=0;
  for(const m of selMods){if(modules[m]?.power_mod)pm+=modules[m].power_mod;}
  const ep=bp*(1+pm/100);
  return {laser:laserKey,modules:selMods,gadgets:selGadgets,max_mass:Math.round(ep*2.5),effective_power:Math.round(ep),notes:'Computed from ore difficulty data'};
}
