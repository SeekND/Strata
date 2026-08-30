// ============================================================
// SC Hub Mining v3 — cstone_shopping.js (Shopping list modal)
// Opens a modal listing the items needed for a loadout, each with a
// Cornerstone "where to buy" link.
// ============================================================

// ----- Public entry points -----

/** Build a kit and open the modal for a single Quick Mine loadout. */
function openShoppingForQuickMine(loadout, oreCode) {
  if (!loadout) return;
  const shipDef = QM_SHIPS[qmState.ship];
  const kit = {
    title: `Mining kit — ${oreName(oreCode)}`,
    subtitle: shipDef?.label || qmState.ship,
    ships: [_buildShipKit(loadout, qmState.ship, [oreCode])],
  };
  openShoppingModal(kit);
}

/** Single expedition stop — includes per-rock swaps. */
function openShoppingForStop(stop) {
  if (!stop.loadout || stop.allGround) return;
  const shipType = stop.ship?.type;
  if (!shipType) return;
  const oreCodes = (stop.oreDetails || []).filter(o => !o.isGround).map(o => o.ore);
  const ship = _buildShipKit(stop.loadout, shipType, oreCodes);
  ship.label = stop.shipLabel || shipType;
  openShoppingModal({
    title: `Mining kit — ${stop.name}`,
    subtitle: `${stop.system} · ${oreCodes.map(oreName).join(', ')}`,
    ships: [ship],
  });
}

/** All expedition stops — aggregates per ship type across the whole trip. */
function openShoppingForExpedition(assignments) {
  // Group by ship type
  const byShip = new Map();
  for (const a of assignments) {
    if (a.allGround || !a.ship?.type || !a.loadout) continue;
    const t = a.ship.type;
    if (!byShip.has(t)) byShip.set(t, { shipLabel: a.shipLabel || t, type: t, loadouts: [], oreCodes: [] });
    const entry = byShip.get(t);
    entry.loadouts.push(a.loadout);
    for (const od of (a.oreDetails || [])) {
      if (!od.isGround && od.ore) entry.oreCodes.push(od.ore);
    }
  }
  if (!byShip.size) {
    alert('No ship loadouts to shop for in this expedition.');
    return;
  }
  const ships = [];
  for (const [type, entry] of byShip) {
    const oreCodes = [...new Set(entry.oreCodes)];
    let ship;
    const turretLo = entry.loadouts.find(lo => Array.isArray(lo.turrets) && lo.turrets.length);
    if (turretLo) {
      // MOLE-type: turret loadouts don't vary by ore here, so one representative
      // loadout describes the whole kit. Don't concatenate turrets across stops —
      // it's one physical ship reused, not N ships (would inflate the counts).
      ship = _buildShipKit(turretLo, type, oreCodes);
    } else {
      // Single-laser ships: union all lasers/modules/gadgets across stops.
      const lasers = new Set();
      const modules = new Set();
      const gadgets = new Set();
      for (const lo of entry.loadouts) {
        if (lo.laser) lasers.add(lo.laser);
        for (const m of (lo.modules || [])) modules.add(m);
        for (const g of (lo.gadgets || [])) gadgets.add(g);
      }
      const merged = { laser: [...lasers][0], modules: [...modules], gadgets: [...gadgets] };
      ship = _buildShipKit(merged, type, oreCodes);
    }
    ship.label = entry.shipLabel;
    ships.push(ship);
  }
  openShoppingModal({
    title: `Expedition shopping list`,
    subtitle: `${assignments.filter(a => !a.allGround && a.ship).length} ship-stops · ${ships.length} ship type${ships.length > 1 ? 's' : ''}`,
    ships,
  });
}

// ----- Internal: build a per-ship kit from a loadout + ore list -----

function _buildShipKit(loadout, shipType, oreCodes) {
  const lasers = D.equipment?.lasers || {};
  const modules = D.equipment?.modules || {};
  const gadgets = D.equipment?.gadgets || {};

  // Multi-turret loadouts (MOLE): every turret carries its own laser + modules,
  // so there's no single top-level laser/module list to shop from. Aggregate
  // across all turrets and count quantities — outfitting 3 turrets can need
  // several of the same module. Returns a `lasers` array (not a single `laser`).
  if (Array.isArray(loadout.turrets) && loadout.turrets.length) {
    return _buildTurretKit(loadout, lasers, modules, gadgets);
  }

  // Start with the loadout's modules/gadgets
  const modSet = new Set(loadout.modules || []);
  const gadSet = new Set(loadout.gadgets || []);

  // For each ore at this stop, compute the optimal per-rock loadout and union it
  // (this catches per-rock swaps the user would do mid-stop)
  const alternatives = new Set();
  if (typeof computeOptimizedLoadout === 'function') {
    for (const code of oreCodes) {
      const elem = D.ore_elements?.[code];
      if (!elem) continue;
      const oreLo = computeOptimizedLoadout(shipType, elem);
      if (!oreLo) continue;
      for (const m of (oreLo.modules || [])) if (!modSet.has(m)) alternatives.add(m);
      for (const g of (oreLo.gadgets || [])) if (!gadSet.has(g)) alternatives.add(g);
    }
  }

  const laserKey = loadout.laser;
  const laser = laserKey && lasers[laserKey] ? {
    key: laserKey,
    name: lasers[laserKey].name || laserKey,
    isBespoke: !!lasers[laserKey].bespoke,
  } : null;

  const moduleItems = [...modSet].map(k => ({
    key: k, name: modules[k]?.name || k,
    role: _moduleRole(k, modules[k]),
  }));
  const gadgetItems = [...gadSet].map(k => ({
    key: k, name: gadgets[k]?.name || k,
    role: _gadgetRole(k),
  }));
  const altItems = [...alternatives].map(k => {
    const m = modules[k], g = gadgets[k];
    return { key: k, name: (m || g)?.name || k, role: m ? _moduleRole(k, m) + ' (per-rock swap)' : _gadgetRole(k) + ' (per-rock swap)' };
  });

  return { laser, modules: moduleItems, gadgets: gadgetItems, alternatives: altItems };
}

// Build a shopping kit from a multi-turret (MOLE) loadout. Each turret has its
// own laser + module list; we tally unique items across all turrets with a
// quantity so the list shows e.g. "Rieger-C3 ×4". No per-rock alternatives —
// a MOLE swaps between turrets it already owns, so nothing extra to buy.
function _buildTurretKit(loadout, lasers, modules, gadgets) {
  const laserCount = new Map();
  const moduleCount = new Map();
  for (const t of loadout.turrets) {
    if (t.laser) laserCount.set(t.laser, (laserCount.get(t.laser) || 0) + 1);
    for (const m of (t.modules || [])) moduleCount.set(m, (moduleCount.get(m) || 0) + 1);
  }
  const laserItems = [...laserCount].map(([k, qty]) => ({
    key: k, name: lasers[k]?.name || k, qty,
    isBespoke: !!lasers[k]?.bespoke, role: 'Turret laser',
  }));
  const moduleItems = [...moduleCount].map(([k, qty]) => ({
    key: k, name: modules[k]?.name || k, qty, role: _moduleRole(k, modules[k]),
  }));
  const gadgetItems = [...new Set(loadout.gadgets || [])].map(k => ({
    key: k, name: gadgets[k]?.name || k, role: _gadgetRole(k),
  }));
  return { lasers: laserItems, modules: moduleItems, gadgets: gadgetItems, alternatives: [] };
}

function _moduleRole(key, m) {
  const k = key.toLowerCase();
  if (k.includes('rieger')) return 'Power boost — slot 1 baseline';
  if (k.includes('surge'))  return 'Reduces resistance';
  if (k.includes('rime'))   return 'Reduces resistance (more)';
  if (k.includes('optimum')) return 'Reduces catastrophic damage';
  if (k.includes('torpid')) return 'Widens window, reduces catastrophic';
  if (k.includes('focus'))  return 'Widens optimal window';
  if (k.includes('fltr'))   return 'Reduces inert material (more value)';
  if (m?.type === 'active') return 'Active module';
  return 'Passive module';
}

function _gadgetRole(key) {
  const k = key.toLowerCase();
  if (k.includes('sabir'))   return 'Throws at rock: −50% resistance';
  if (k.includes('boremax')) return 'Throws at rock: −70% instability';
  if (k.includes('waveshift')) return 'Throws at rock: +100% window, −35% instability';
  if (k.includes('optimax')) return 'Throws at rock: window/resistance';
  if (k.includes('okunis'))  return 'Throws at rock: cluster/effects';
  if (k.includes('stalwart')) return 'Throws at rock: stability';
  return 'Throws at rock';
}

// ----- Modal rendering -----

function openShoppingModal(kit) {
  closeShoppingModal();

  const allUrls = [];
  const textLines = [`**${kit.title}**`];
  if (kit.subtitle) textLines.push(`_${kit.subtitle}_`);

  const renderItem = (it) => {
    const url = cstoneUrl(it.key);
    if (url && !it.isBespoke) allUrls.push(url);
    const qtyTxt = it.qty > 1 ? ` ×${it.qty}` : '';
    const qtyHtml = it.qty > 1 ? ` <span style="color:var(--text-dim);font-weight:400;font-size:12px">×${it.qty}</span>` : '';
    textLines.push(`• ${it.name}${qtyTxt}${url ? ` — ${url}` : ''}${it.isBespoke ? ' (already on ship)' : ''}`);
    const badge = it.isBespoke
      ? '<span style="color:var(--text-dim);font-size:11px">already on ship</span>'
      : url ? '<span style="font-size:14px">🛒</span>'
            : '<span style="color:var(--text-dim);font-size:11px">not on cstone</span>';
    const wrapOpen  = url ? `<a href="${url}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit">` : '<div>';
    const wrapClose = url ? '</a>' : '</div>';
    return `${wrapOpen}<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;margin-top:4px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:4px"><div><strong>${it.name}${qtyHtml}</strong>${it.role ? `<div style="font-size:11px;color:var(--text-dim);margin-top:2px">${it.role}</div>` : ''}</div><div>${badge}</div></div>${wrapClose}`;
  };

  const renderSection = (label, items) => {
    if (!items?.length) return '';
    let h = `<div style="margin-top:14px;font-size:11px;color:var(--accent);font-weight:600;letter-spacing:1px">${label}</div>`;
    for (const it of items) h += renderItem(it);
    return h;
  };

  let body = '';
  for (const ship of kit.ships) {
    if (kit.ships.length > 1 && ship.label) {
      body += `<div style="margin-top:18px;padding:6px 10px;background:rgba(232,117,26,0.08);border-left:3px solid var(--accent);border-radius:3px;font-weight:600;color:var(--text-primary)">${ship.label}</div>`;
      textLines.push('', `__${ship.label}__`);
    } else if (ship.label) {
      body += `<div style="margin-top:8px;color:var(--text-secondary);font-size:12px">${ship.label}</div>`;
    }
    const laserItems = ship.lasers || (ship.laser ? [ship.laser] : []);
    body += renderSection(laserItems.length > 1 ? 'LASERS' : 'LASER', laserItems);
    body += renderSection('MODULES',      ship.modules);
    body += renderSection('GADGETS',      ship.gadgets);
    body += renderSection('PER-ROCK SWAPS', ship.alternatives);
  }

  const overlay = document.createElement('div');
  overlay.id = 'cstone-shop-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;overflow:auto';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeShoppingModal(); });

  const modal = document.createElement('div');
  modal.style.cssText = 'background:var(--bg-card,#1a1d26);border:1px solid var(--border);border-radius:8px;max-width:620px;width:100%;padding:20px;box-shadow:0 8px 32px rgba(0,0,0,0.5)';
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
      <div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">🛒 ${kit.title}</div>
        ${kit.subtitle ? `<div style="font-size:12px;color:var(--text-dim);margin-top:4px">${kit.subtitle}</div>` : ''}
      </div>
      <button onclick="closeShoppingModal()" style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);width:30px;height:30px;cursor:pointer;border-radius:4px;font-size:16px;line-height:1">×</button>
    </div>
    <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">Click any item to open its Cornerstone (cstone.space) page.</div>
    ${body}
    <div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
      <button id="cstone-shop-open-all" style="background:var(--accent);color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px">Open all in new tabs (${allUrls.length})</button>
      <button id="cstone-shop-copy" style="background:transparent;border:1px solid var(--border);color:var(--text-primary);padding:8px 14px;border-radius:4px;cursor:pointer;font-size:13px">Copy as text</button>
    </div>
  `;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  modal.querySelector('#cstone-shop-open-all').addEventListener('click', () => openShoppingTabs(allUrls));
  modal.querySelector('#cstone-shop-copy').addEventListener('click', () => copyShoppingList(textLines.join('\n')));

  // ESC to close
  const escHandler = e => { if (e.key === 'Escape') { closeShoppingModal(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

function closeShoppingModal() {
  document.getElementById('cstone-shop-overlay')?.remove();
}

function openShoppingTabs(urls) {
  // Open EVERY tab synchronously inside the click gesture. Browsers attribute all
  // synchronous window.open() calls to the originating user gesture and allow them;
  // deferring any with setTimeout (the old code) detaches it from the gesture and
  // the pop-up blocker kills it — that was the "open all (4) only opens 2" bug.
  // Clickable rows remain as a manual fallback for anyone with a strict blocker.
  if (!urls.length) return;
  for (const url of urls) window.open(url, '_blank', 'noopener');
}

function copyShoppingList(text) {
  navigator.clipboard.writeText(text).then(() => _shopToast('✓ Copied to clipboard'))
    .catch(() => prompt('Copy shopping list:', text));
}

function _shopToast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--green,#3dd68c);color:#000;padding:10px 16px;border-radius:4px;z-index:10000;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.4)';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2000);
}
