import './style.css';
import { REVIEW_ADDRESS } from './config';
import type { PositionSnapshot } from './model';
import { amounts, calculate, decimal, dropBoundary, freshness, simulate } from './risk';
import { samplePosition } from './sample';

const icons: Record<string, string> = {
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  sliders: '<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  book: '<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v15c-4-1-6 0-9 2-3-2-5-3-9-2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
};
const icon = (name: string) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.shield}</svg>`;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const money = (value: bigint | string, decimals: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(decimal(value, decimals)));
const quantity = (value: bigint, decimals: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 7 }).format(Number(decimal(value, decimals)));
type Risk = ReturnType<typeof calculate>;
const hf = (risk: Risk, decimals: number) => risk.healthFactor === null ? '—' : Number(decimal(risk.healthFactor, decimals)).toFixed(3);
const tone = (risk: Risk) => risk.margin < 0n ? 'danger' : risk.status === 'At boundary' || risk.status === 'Low margin' ? 'caution' : 'good';
let snapshot = samplePosition();
let request: AbortController | undefined;
let dataUnavailable = false;

$('app').innerHTML = `
  <aside class="sidebar">
    <a class="brand" href="#overview">${icon('shield')}<span>guardian<span class="brand-dot">.</span></span></a>
    <div class="workspace-label">YOUR WORKSPACE</div>
    <nav aria-label="Main navigation">
      <a class="nav-link active" href="#overview">${icon('grid')} Overview <span class="nav-indicator"></span></a>
      <a class="nav-link" href="#simulator">${icon('sliders')} Risk simulator</a>
      <a class="nav-link" href="#data">${icon('data')} Data & sources</a>
      <a class="nav-link" href="/docs/">${icon('book')} Documentation <span class="external">↗</span></a>
    </nav>
    <div class="sidebar-bottom"><div class="network-orbit">✳</div><h3>A clearer view of risk.</h3><p>Position intelligence for the Stellar ecosystem.</p><div class="built-on">BUILT ON <strong>Stellar ↗</strong></div></div>
    <div class="sidebar-footer"><span class="status-dot"></span> Read-only prototype <span>v0.1</span></div>
  </aside>
  <div class="shell">
    <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div><div class="top-actions"><span class="network-pill"><span class="status-dot"></span> Stellar Testnet</span><button class="button small" id="open-position">${icon('globe')} View an address</button></div></header>
    <main id="overview">
      <div class="page-heading"><div><div class="eyebrow">KNOW YOUR POSITION</div><h1>A little foresight.<br class="mobile-break"> A lot more clarity.</h1><p>Understand your borrowing risk before the market moves.</p></div><span class="protocol-chip"><span class="blend-mark">b</span> Blend V2</span></div>
      <div class="mode-banner" id="mode-banner"><div><span class="sample-tag">SAMPLE MODE</span><span>Explore a sample position. No wallet or funds needed.</span></div><button class="text-button" id="load-sample">Reset demo ↺</button></div>
      <div id="data-alert" class="alert" role="alert" hidden></div>
      <section class="demo-guide" aria-label="Sample walkthrough">
        <div><strong>A 30-second walkthrough</strong><span>Each step loads synthetic sample data.</span></div>
        <div class="demo-steps"><button data-demo-step="baseline">1. Starting position</button><button data-demo-step="shock">2. Price drops 20%</button><button data-demo-step="repay">3. Repay 200 USDC</button></div>
        <p id="demo-step-description" aria-live="polite">Compare the sample, a price decline, and a hypothetical repayment below.</p>
      </section>
      <section class="overview-grid" aria-label="Position overview">
        <article class="health-card"><div class="card-top"><span>Position health</span>${icon('shield')}</div><div class="health-number" id="health-value">—</div><div class="health-status" id="health-status"></div><div class="health-scale"><i id="health-marker"></i></div><div class="scale-labels"><span>Liquidation boundary <b>1.000</b></span><span>More margin →</span></div><p>Effective collateral ÷ effective liabilities</p></article>
        <article class="card portfolio-card"><div class="card-top"><h2>Your position</h2><span class="muted" id="position-label">Sample portfolio</span></div><div class="portfolio-values"><div><span class="metric-label">Total collateral</span><strong id="collateral-value">—</strong><span class="metric-note">Before risk factors</span></div><div><span class="metric-label">Outstanding debt</span><strong id="debt-value">—</strong><span class="metric-note">Before risk factors</span></div></div><div class="composition"><span>Effective borrowing capacity used</span><strong id="capacity-value"></strong></div><div class="capacity-track"><div id="capacity-fill"></div></div><div class="margin-row"><span>Effective margin to boundary</span><strong id="margin-value"></strong></div></article>
      </section>
      <section class="card assets-card" aria-labelledby="assets-title"><div class="section-header"><div><h2 id="assets-title">Position breakdown <span class="count" id="asset-count"></span></h2><p>Collateral, debt, and savings in this pool.</p></div><span class="mini-label" id="snapshot-label">ILLUSTRATIVE BALANCES</span></div><div class="table-scroll"><table><thead><tr><th>Asset</th><th>Oracle price</th><th>Collateral</th><th>Debt</th><th>Savings</th><th>Borrow APR</th></tr></thead><tbody id="asset-rows"></tbody></table></div><div class="table-foot"><span class="status-dot"></span><span id="table-note">Savings are separate from collateral and do not increase borrowing capacity.</span></div></section>
      <section id="simulator" class="simulator-section" aria-labelledby="simulator-title"><div class="section-header outside"><div><div class="eyebrow">THE WHAT-IF LAB</div><h2 id="simulator-title">See the impact. Before it happens.</h2><p>Move the price. Explore a repayment. Compare the outcome.</p></div><span class="outline-tag">SIMULATION ONLY</span></div>
        <div id="walkthrough-controls" class="walkthrough-controls" aria-label="Walkthrough navigation" hidden><p id="walkthrough-status" aria-live="polite"></p><div><button id="previous-step" class="button small">← Previous step</button><button id="next-step" class="button small">Next step →</button></div></div>
        <div class="simulator-grid"><article class="card controls-card"><div class="number-label"><span>01</span><h3>Change the market</h3></div><div class="field-heading"><label for="price-asset">Price shock</label><select id="price-asset" aria-label="Price shock asset"></select></div><div class="shock-readout"><output id="shock-output" for="shock">−20%</output><span id="shocked-price"></span></div><input id="shock" type="range" min="-90" max="50" step="1" value="-20" aria-label="Price change percentage"><div class="range-labels"><span>−90%</span><span>0%</span><span>+50%</span></div><div class="presets" aria-label="Price shock presets"><button data-shock="-5">−5%</button><button data-shock="-10">−10%</button><button data-shock="-20" class="selected">−20%</button><button data-shock="-30">−30%</button></div><div class="control-divider"></div><div class="number-label"><span>02</span><h3>Explore a repayment</h3></div><label class="field-label" for="repayment">Repayment amount</label><div class="amount-field"><input id="repayment" type="text" inputmode="decimal" value="200" autocomplete="off" aria-describedby="repay-note"><select id="repay-asset" aria-label="Repayment asset"></select></div><p class="field-help" id="repay-note">Uses hypothetical external funds. No transaction is sent.</p><button class="text-button reset-simulation" id="reset-simulation">Reset scenario ↺</button><p id="simulation-error" class="error-text" role="alert" hidden></p></article>
        <article class="card outcome-card"><div class="card-top"><h3>Your scenario at a glance</h3><span class="mini-label">HEALTH FACTOR</span></div><div class="scenario-cards" id="scenario-cards" aria-live="polite"></div><div id="risk-chart" class="risk-chart" aria-label="Health factor comparison"></div><div class="outcome-message" id="outcome-message" aria-live="polite"></div><div class="boundary-note"><span>Estimated price boundary</span><strong id="boundary-value"></strong></div><p class="field-help">Only the selected price and repayment change. Rates, factors, and other prices stay fixed. Execution costs and future interest are excluded.</p></article></div>
      </section>
      <section class="card stress-card"><div class="section-header"><div><h2>Put your position under pressure</h2><p id="stress-description">One asset. Four market scenarios. No repayment applied.</p></div><span class="mini-label">STRESS TEST</span></div><div id="stress-results" class="stress-grid"></div></section>
      <section class="card source-card" id="data"><div class="section-header"><div><h2>Every number has a source.</h2><p id="source-description">This demo starts with a clearly labeled synthetic snapshot.</p></div><button class="button small" id="export">${icon('download')} Export snapshot</button></div><details><summary>Inspect snapshot & calculation inputs <span>+</span></summary><dl id="source-details"></dl><div id="source-assets"></div><pre id="raw-snapshot"></pre></details></section>
      <footer><span>guardian<span class="brand-dot">.</span> <span class="footer-caption">Clarity before action.</span></span><span>Read-only demo · No automatic protection <a href="/docs/">Methodology ↗</a> <a href="https://github.com/redsun/guardian" target="_blank" rel="noopener noreferrer">Source ↗</a></span></footer>
    </main>
  </div>
  <dialog id="address-dialog"><form id="address-form"><div class="dialog-heading"><span class="eyebrow">STELLAR TESTNET</span><button class="close-button" type="button" id="close-dialog" aria-label="Close">×</button></div><h2>Look up a position.</h2><p>Read a public address in the supported Blend V2 testnet pool. No wallet connection needed.</p><label class="field-label" for="address">Public account or contract address</label><input id="address" name="address" placeholder="G… or C…" required autocomplete="off" spellcheck="false"><button type="button" class="text-button" id="example-address">Use the reviewer address ↗</button><p id="address-error" class="error-text" role="alert" hidden></p><button type="submit" class="button primary" id="read-position">Read testnet position ${icon('arrow')}</button><p class="field-help">Testnet uses mock oracle prices. Availability depends on the public RPC and current pool deployment.</p></form></dialog>`;

function renderSnapshot() {
  clearWalkthrough();
  const risk = calculate(snapshot);
  const sample = snapshot.mode === 'sample';
  const d = snapshot.oracleDecimals;
  $('health-value').textContent = hf(risk, d);
  $('health-status').textContent = risk.status;
  $('health-status').className = `health-status ${tone(risk)}`;
  const health = risk.healthFactor === null ? 2 : Number(decimal(risk.healthFactor, d));
  $('health-marker').style.left = `${Math.min(98, Math.max(2, (health - 0.5) / 1.5 * 100))}%`;
  $('collateral-value').textContent = money(risk.rawCollateral, d);
  $('debt-value').textContent = money(risk.rawDebt, d);
  $('margin-value').textContent = money(risk.margin, d);
  const used = risk.collateral === 0n ? null : Number(risk.liabilities * 10000n / risk.collateral) / 100;
  $('capacity-value').textContent = used === null ? '—' : `${used.toFixed(1)}%`;
  $('capacity-fill').style.width = `${Math.min(100, used ?? 0)}%`;
  $('capacity-fill').className = tone(risk);
  $('position-label').textContent = sample ? 'Sample portfolio' : `${snapshot.address.slice(0, 5)}…${snapshot.address.slice(-5)}`;
  $('mode-banner').firstElementChild!.innerHTML = `<span class="sample-tag">${sample ? 'SAMPLE MODE' : 'TESTNET READ'}</span><span>${sample ? 'Explore a sample position. No wallet or funds needed.' : 'Public testnet data · mock oracle prices · read-only'}</span>`;
  $('load-sample').textContent = sample ? 'Reset demo ↺' : 'Switch to sample ↺';
  $('snapshot-label').textContent = sample ? 'ILLUSTRATIVE BALANCES' : `READ AT ${new Date(snapshot.fetchedAt * 1000).toLocaleTimeString()}`;
  $('asset-count').textContent = String(snapshot.assets.length);
  $('asset-rows').innerHTML = snapshot.assets.map(a => {
    const balance = amounts(a);
    return `<tr><td><div class="asset-name"><span class="coin ${a.symbol === 'USDC' ? 'usdc' : ''}">${escape(a.symbol === 'USDC' ? '$' : a.symbol === 'XLM' ? '✳' : a.symbol.slice(1, 2))}</span><span><strong>${escape(a.symbol)}</strong><small>${a.symbol === 'XLM' ? 'Stellar Lumens' : a.symbol === 'USDC' ? 'USD Coin' : 'Wrapped asset'}</small></span></div></td><td>${money(a.price, d)}</td><td>${quantity(balance.collateral, a.decimals)} <span class="table-unit">${escape(a.symbol)}</span></td><td>${quantity(balance.debt, a.decimals)} <span class="table-unit">${escape(a.symbol)}</span></td><td>${quantity(balance.savings, a.decimals)}</td><td>${Number.isFinite(a.borrowApr) ? (a.borrowApr * 100).toFixed(2) + '%' : 'Unavailable'}</td></tr>`;
  }).join('');
  const option = (a: PositionSnapshot['assets'][number]) => `<option value="${escape(a.id)}">${escape(a.symbol)}</option>`;
  $('price-asset').innerHTML = snapshot.assets.map(option).join('');
  const debtAssets = snapshot.assets.filter(a => BigInt(a.debtShares) > 0n);
  $('repay-asset').innerHTML = debtAssets.length ? debtAssets.map(option).join('') : '<option value="">No debt</option>';
  const collateralAsset = snapshot.assets.find(a => BigInt(a.collateralShares) > 0n);
  if (collateralAsset) $<HTMLSelectElement>('price-asset').value = collateralAsset.id;
  $<HTMLInputElement>('repayment').value = sample ? '200' : '0';
  $<HTMLInputElement>('repayment').disabled = !debtAssets.length;
  $<HTMLInputElement>('shock').value = '-20';
  $('source-description').textContent = sample ? 'Synthetic balances and prices for an offline, reproducible demonstration.' : `Pool: ${snapshot.poolName}. Separate reads span ledgers ${snapshot.ledgerStart}–${snapshot.ledgerEnd}.`;
  const entries = { Mode: sample ? 'Synthetic sample · not on-chain' : 'Live testnet read', Network: snapshot.network, Pool: snapshot.poolId, Address: snapshot.address, Oracle: snapshot.oracleId, 'Oracle precision': snapshot.oracleDecimals, 'Pool WASM': snapshot.wasmHash, 'Pool status': snapshot.poolStatus, 'Snapshot time': new Date(snapshot.fetchedAt * 1000).toISOString(), 'Ledger range': `${snapshot.ledgerStart}–${snapshot.ledgerEnd}` };
  $('source-details').innerHTML = Object.entries(entries).map(([key, value]) => `<div><dt>${key}</dt><dd>${escape(value)}</dd></div>`).join('');
  $('source-assets').innerHTML = snapshot.assets.map(a => `<p class="field-help"><strong>${escape(a.symbol)}</strong> · price timestamp ${escape(new Date(a.priceTimestamp * 1000).toISOString())} · collateral factor ${a.cFactor / 1e7} · liability factor ${a.lFactor / 1e7}</p>`).join('');
  $('raw-snapshot').textContent = JSON.stringify(snapshot, null, 2);
  updateFreshness();
  renderSimulation();
}

function updateFreshness() {
  const issues = freshness(snapshot);
  $('data-alert').hidden = !issues.length && !dataUnavailable;
  $('data-alert').textContent = [dataUnavailable ? 'The new position could not be loaded. The previous snapshot remains displayed; no live result was substituted.' : '', ...issues].filter(Boolean).join(' ');
  $('health-status').textContent = issues.length ? 'Stale data · estimate only' : calculate(snapshot).status;
  $('health-status').className = `health-status ${issues.length ? 'caution' : tone(calculate(snapshot))}`;
}

function renderSimulation() {
  try {
    const assetId = $<HTMLSelectElement>('price-asset').value;
    const repayId = $<HTMLSelectElement>('repay-asset').value;
    const shock = Number($<HTMLInputElement>('shock').value);
    const repayment = $<HTMLInputElement>('repayment').value;
    const asset = snapshot.assets.find(a => a.id === assetId)!;
    const d = snapshot.oracleDecimals;
    const current = calculate(snapshot);
    const market = simulate(snapshot, assetId, shock * 100, repayId, '0');
    const after = simulate(snapshot, assetId, shock * 100, repayId, repayment);
    $('simulation-error').hidden = true;
    $('shock-output').textContent = `${shock > 0 ? '+' : shock < 0 ? '−' : ''}${Math.abs(shock)}%`;
    $('shocked-price').textContent = `${money(asset.price, d)} → ${money(market.snapshot.assets.find(a => a.id === assetId)!.price, d)}`;
    document.querySelectorAll<HTMLButtonElement>('[data-shock]').forEach(button => button.classList.toggle('selected', Number(button.dataset.shock) === shock));
    const scenarios = [{ label: 'Current', risk: current }, { label: 'After price change', risk: market.risk }, { label: 'After repayment', risk: after.risk }];
    $('scenario-cards').innerHTML = scenarios.map(({ label, risk }) => `<div class="scenario ${tone(risk)}"><span>${label}</span><strong>${hf(risk, d)}</strong><small>${risk.status}</small></div>`).join('');
    const max = Math.max(1.5, ...scenarios.map(({ risk }) => risk.healthFactor === null ? 0 : Number(decimal(risk.healthFactor, d)))) * 1.12;
    const threshold = 1 / max * 100;
    $('risk-chart').innerHTML = `<div class="chart-label">Health factor <span>Boundary at 1.000</span></div><div class="chart-bars"><div class="threshold" style="left:${threshold}%"></div>${scenarios.map(({ label, risk }) => `<div class="chart-row"><span>${label}</span><div class="chart-track"><div class="chart-bar ${tone(risk)}" style="width:${risk.healthFactor === null ? 0 : Math.max(0, Number(decimal(risk.healthFactor, d)) / max * 100)}%"></div></div></div>`).join('')}</div>`;
    const repaymentAsset = snapshot.assets.find(a => a.id === repayId);
    const appliedText = repaymentAsset ? `${quantity(after.applied, repaymentAsset.decimals)} ${repaymentAsset.symbol}` : '0';
    $('outcome-message').className = `outcome-message ${tone(after.risk)}`;
    $('outcome-message').innerHTML = `${icon('shield')}<div><strong>${after.risk.liabilities === 0n ? 'This scenario has no remaining debt.' : after.risk.margin > 0n ? 'This scenario is above the liquidation boundary.' : after.risk.margin === 0n ? 'This scenario is at the liquidation boundary.' : 'This scenario falls below the liquidation boundary.'}</strong><p>Hypothetical repayment: ${escape(appliedText)}. Effective margin: ${money(after.risk.margin, d)}.${after.unused > 0n && repaymentAsset ? ` ${quantity(after.unused, repaymentAsset.decimals)} ${escape(repaymentAsset.symbol)} exceeds the debt and is unused.` : ''}</p></div>`;
    $('boundary-value').textContent = dropBoundary(snapshot, assetId);
    $('stress-description').textContent = `${asset.symbol} price changes only. Other prices fixed. No repayment applied.`;
    $('stress-results').innerHTML = [-5, -10, -20, -30].map(percent => {
      const risk = simulate(snapshot, assetId, percent * 100, repayId, '0').risk;
      return `<button class="stress-result ${tone(risk)}" data-stress="${percent}"><span>${escape(asset.symbol)} <b>${percent}%</b>${icon('arrow')}</span><strong>${hf(risk, d)} <small>HF</small></strong><span class="stress-status">${risk.status}</span></button>`;
    }).join('');
  } catch (error) {
    $('simulation-error').textContent = (error as Error).message;
    $('simulation-error').hidden = false;
    $('scenario-cards').innerHTML = '<p class="error-text">Enter a valid scenario to see the comparison.</p>';
    $('risk-chart').innerHTML = '';
    $('outcome-message').innerHTML = '';
    $('boundary-value').textContent = 'Scenario unavailable';
    $('stress-results').innerHTML = '';
  }
}

const walkthroughSteps = ['baseline', 'shock', 'repay'] as const;
type WalkthroughStep = typeof walkthroughSteps[number];
let activeStep: WalkthroughStep | undefined;
const walkthroughDescriptions: Record<WalkthroughStep, string> = {
  baseline: 'Starting point: $2,000 collateral and $1,200 debt. Displayed health factor: 1.200.',
  shock: 'A 20% XLM price decline puts the sample below the liquidation boundary. Displayed health factor: 0.960.',
  repay: 'A hypothetical 200 USDC repayment restores positive margin. Displayed health factor: 1.152. No transaction is sent.',
};
function clearWalkthrough() {
  activeStep = undefined;
  $('walkthrough-controls').hidden = true;
  $('demo-step-description').textContent = snapshot.mode === 'sample'
    ? 'Explore a custom scenario, or choose a walkthrough step to restart with synthetic sample data.'
    : 'A public testnet position is displayed. Walkthrough buttons switch back to synthetic sample data.';
  document.querySelectorAll<HTMLButtonElement>('[data-demo-step]').forEach(button => button.setAttribute('aria-pressed', 'false'));
}
function showWalkthroughStep(step: WalkthroughStep, scroll = true) {
  request?.abort(); dataUnavailable = false; snapshot = samplePosition(); renderSnapshot();
  activeStep = step;
  $<HTMLInputElement>('shock').value = step === 'baseline' ? '0' : '-20';
  $<HTMLInputElement>('repayment').value = step === 'repay' ? '200' : '0';
  $('demo-step-description').textContent = walkthroughDescriptions[step];
  $('walkthrough-status').textContent = `Step ${walkthroughSteps.indexOf(step) + 1} of 3 · ${walkthroughDescriptions[step]}`;
  $('walkthrough-controls').hidden = false;
  $<HTMLButtonElement>('previous-step').disabled = step === 'baseline';
  $('next-step').textContent = step === 'repay' ? 'Restart walkthrough ↺' : 'Next step →';
  document.querySelectorAll<HTMLButtonElement>('[data-demo-step]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.demoStep === step)));
  renderSimulation();
  if (scroll) $('simulator').scrollIntoView({ behavior: 'smooth' });
}
$('previous-step').addEventListener('click', () => {
  if (activeStep && activeStep !== 'baseline') showWalkthroughStep(walkthroughSteps[walkthroughSteps.indexOf(activeStep) - 1], false);
});
$('next-step').addEventListener('click', () => {
  if (activeStep) showWalkthroughStep(walkthroughSteps[(walkthroughSteps.indexOf(activeStep) + 1) % walkthroughSteps.length], false);
});
for (const id of ['shock', 'price-asset', 'repay-asset', 'repayment']) $(id).addEventListener('input', () => { clearWalkthrough(); renderSimulation(); });
document.querySelectorAll<HTMLButtonElement>('[data-demo-step]').forEach(button => button.addEventListener('click', () => showWalkthroughStep(button.dataset.demoStep as WalkthroughStep)));
document.querySelectorAll<HTMLButtonElement>('[data-shock]').forEach(button => button.addEventListener('click', () => { clearWalkthrough(); $<HTMLInputElement>('shock').value = button.dataset.shock!; renderSimulation(); }));
$('stress-results').addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-stress]');
  if (button) { clearWalkthrough(); $<HTMLInputElement>('shock').value = button.dataset.stress!; renderSimulation(); $('simulator').scrollIntoView({ behavior: 'smooth' }); }
});
$('reset-simulation').addEventListener('click', () => { clearWalkthrough(); $<HTMLInputElement>('shock').value = '0'; $<HTMLInputElement>('repayment').value = '0'; renderSimulation(); });
$('load-sample').addEventListener('click', () => { request?.abort(); dataUnavailable = false; snapshot = samplePosition(); renderSnapshot(); });
const dialog = $<HTMLDialogElement>('address-dialog');
$('open-position').addEventListener('click', () => dialog.showModal());
$('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => request?.abort());
$('example-address').addEventListener('click', () => { $<HTMLInputElement>('address').value = REVIEW_ADDRESS; });
$('address-form').addEventListener('submit', async event => {
  event.preventDefault();
  request?.abort();
  const controller = new AbortController(); request = controller;
  const timeout = setTimeout(() => controller.abort('timeout'), 90000);
  const button = $<HTMLButtonElement>('read-position');
  button.disabled = true; button.textContent = 'Reading testnet…'; $('address-error').hidden = true;
  try {
    const response = await fetch(`/api/position?address=${encodeURIComponent($<HTMLInputElement>('address').value.trim())}`, { signal: controller.signal });
    if (!response.headers.get('content-type')?.includes('application/json')) throw Error('The position service is unavailable. Please retry later; the sample demo remains available.');
    const data = await response.json();
    if (!response.ok) throw Error(data.error || 'Position could not be loaded.');
    if (data.mode !== 'live' || !Array.isArray(data.assets) || data.assets.length === 0) throw Error('Invalid testnet snapshot.');
    calculate(data);
    if (request !== controller) return;
    snapshot = data; dataUnavailable = false; renderSnapshot(); dialog.close();
  } catch (error) {
    if (request !== controller || (controller.signal.aborted && controller.signal.reason !== 'timeout')) return;
    $('address-error').textContent = controller.signal.reason === 'timeout' ? 'The read timed out. Please try again.' : (error as Error).message;
    $('address-error').hidden = false;
    dataUnavailable = true; updateFreshness();
  } finally {
    clearTimeout(timeout);
    if (request === controller) { button.disabled = false; button.innerHTML = `Read testnet position ${icon('arrow')}`; request = undefined; }
  }
});
$('export').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `guardian-${snapshot.mode}-snapshot.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
document.querySelectorAll<HTMLAnchorElement>('.nav-link[href^="#"]').forEach(link => link.addEventListener('click', () => {
  document.querySelector('.nav-link.active')?.classList.remove('active'); link.classList.add('active');
}));
renderSnapshot();
setInterval(updateFreshness, 15000);
