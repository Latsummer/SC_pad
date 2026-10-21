/* Offline DOM fixture: exercise capture/export without contacting SCMDB. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function node(innerText = "", selectors = {}, attrs = {}) {
  return {
    innerText, textContent: innerText, dataset: {}, style: {}, hidden: false,
    getClientRects: () => [1],
    querySelector: (selector) => (selectors[selector] || [])[0] || null,
    querySelectorAll: (selector) => selectors[selector] || [],
    getAttribute: (key) => attrs[key] || null,
    setAttribute() {}, addEventListener(type, callback) { this[type] = callback; },
    contains: () => false, remove() {}, click() {},
  };
}
// SCMDB has a real task whose debug name ends in a space; this affects its public hash.
const debug = "Mission_Test_01 ";
let hash = 5381;
for (const char of debug) hash = ((hash << 5) + hash + char.charCodeAt(0)) | 0;
const id = (hash >>> 0).toString(36);
const card = node("Test mission\n10,000 UEC", { ".card-title": [node("Test mission")] });
card.href = `https://scmdb.net/?m=${id}`;
const unrelated = node("Test mission", { ".card-title": [node("Test mission")] });
unrelated.href = "https://scmdb.net/?m=another";
const active = node("Overview");
const tabNodes = [active, node("Combat"), node("Requirements"), node("Calculator"), node("Community")];
let selectedTab = active;
let modalOpen = true;
let autoMode = false;
let cardClicks = 0;
let stopOnFirstTab = false;
const section = node("Blueprint Rewards\nReward A", { ".detail-section-title": [node("Blueprint Rewards")] });
const rewardGroup = node("", {
  ".calc-label": [node("UEC:"), node("Rep/mission:"), node("Faction:"), node("Scope:")],
  ".calc-value": [node("46,500 aUEC"), node("150 XP"), node("Vaughn"), node("Standing")],
});
const rankRow = node("", { td: [node("lv.2 承包商"), node("3,600"), node("DO_NOT_CAPTURE_MISSION_COUNT")] });
const rankTable = node("", { "tbody tr": [rankRow] });
const body = node("Blueprint Rewards\nReward A", {
  ".missions-calc-info": [rewardGroup], ".calc-table": [rankTable],
  '[class*="calc-note"], .calc-scope-divergence': [node("Rank requirement applies to owner only")],
});
const modal = node("", {
  ".detail-title": [node("Test mission", {}, { title: debug })],
  ".detail-tab.active": [active],
  ".detail-tab": tabNodes,
  ".detail-header": [node("Test mission\n10,000 UEC")],
  ".detail-body": [body], ".detail-body .detail-section": [section],
});
const originalModalQuery = modal.querySelector;
modal.querySelector = (selector) => selector === ".detail-tab.active" ? selectedTab : originalModalQuery(selector);
const close = node();
close.click = () => { modalOpen = false; };
modal.querySelector = ((original) => (selector) => selector === ".detail-close" ? close : original(selector))(modal.querySelector);
tabNodes.forEach((tab, index) => {
  tab.click = () => {
    visited.push(index);
    selectedTab = tab;
    body.innerText = `Public content ${index}`;
    if (index >= 4) throw Error("Private tab must not be clicked");
    if (stopOnFirstTab) panel.click({ target: { dataset: { action: "stop" } } });
  };
});
card.click = () => { cardClicks += 1; modalOpen = true; selectedTab = active; };
const status = node();
const pause = node();
const limit = node(); limit.value = "20";
const fileInput=node();
const panel = node("", { "[data-import-file]": [fileInput], "[data-import-same]": [node()], "[data-status]": [status], '[data-action="pause"]': [pause], "[data-limit]": [limit] });
let exported;
let observerCallback;
let scheduled;
let delayBudget = 0;
let cardReads = 0;
let popupVisible = false;
let regionOpen = false;
let enrichFixture = false;
const visited = [];
const tooltipRow = node('PLANET\nPyro I', { '.ph-tooltip-type': [node('PLANET')] });
const tooltip = node('Locations\nPLANET\nPyro I', { '.ph-tooltip-header': [node('Locations')], '.ph-tooltip-item': [tooltipRow] });
const token = node('[LOCATION]');
token.dispatchEvent = (event) => { popupVisible = event.type === 'mouseover'; };
const regionButton = node('Pyro Region A\n2\n▸', { '.chain-link-region-count': [node('2')] });
regionButton.classList = { contains: () => regionOpen };
regionButton.click = () => { regionOpen = true; };
const region = node('', {
  '.pyro-region-locations-header': [node('PYRO REGION A')],
  '.pyro-region-group': [node('', { '.pyro-region-group-label': [node('PLANETS')], '.pyro-region-location': [node('Pyro I'), node('Monox')] })],
});
const originalModalAll = modal.querySelectorAll;
modal.querySelectorAll = (selector) => {
  if (enrichFixture && selector === '.ph-has-tooltip') return [token];
  if (enrichFixture && selector === '.chain-link-region-toggle:not(.open)') return regionOpen ? [] : [regionButton];
  if (enrichFixture && selector === '.chain-link-region-toggle.open') return regionOpen ? [regionButton] : [];
  if (enrichFixture && selector === '.pyro-region-locations') return regionOpen ? [region] : [];
  return originalModalAll(selector);
};
const checkpointData = new Map();
const fakeIndexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.result = {
        close() {},
        transaction() {
          const transaction = {};
          transaction.objectStore = () => ({
            put(value, key) {
              checkpointData.set(key, structuredClone(value));
              const operation = {};
              queueMicrotask(() => { operation.onsuccess?.(); transaction.oncomplete?.(); });
              return operation;
            },
            get(key) {
              const operation = { result: structuredClone(checkpointData.get(key)) };
              queueMicrotask(() => { operation.onsuccess?.(); transaction.oncomplete?.(); });
              return operation;
            },
          });
          return transaction;
        },
      };
      request.onsuccess();
    });
    return request;
  },
};
const context = {
  indexedDB: fakeIndexedDB,
  MouseEvent: class { constructor(type) { this.type = type; } },
  URL: class extends URL { static createObjectURL(blob) { exported = blob; return "blob:test"; } static revokeObjectURL() {} },
  Blob, Date, Map, Set, JSON, String, RegExp,
  location: { hostname: "scmdb.net", href: "https://scmdb.net/" },
  window: { addEventListener() {}, removeEventListener() {} },
  document: {
    querySelector: selector => selector==='select:disabled' ? node('4.10.2-test') : null,
    documentElement: { lang: "en" }, body: { append() {} },
    createElement: (tag) => tag === "section" ? panel : node(),
    querySelectorAll: (selector) => {
      if (selector === "a.contract-card[href]") { cardReads += 1; return autoMode ? [card] : [card, unrelated]; }
      if (selector === ".ph-tooltip-fixed") return popupVisible ? [tooltip] : [];
      return selector === ".detail-modal" && modalOpen ? [modal] : [];
    },
    addEventListener() {}, removeEventListener() {},
  },
  getComputedStyle: () => ({ visibility: "visible" }),
  MutationObserver: class { constructor(callback) { observerCallback = callback; } observe() {} disconnect() {} },
  setTimeout: (callback, ms) => { if (ms === 350) scheduled = callback; else if (ms < 10000) { delayBudget += ms; queueMicrotask(callback); } return 1; }, clearTimeout() {},
  alert: (message) => { throw Error(message); },
};
vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_missions_capture.js`, "utf8"), context);
async function payload() {
  panel.click({ target: { dataset: { action: "export" } } });
  return JSON.parse(await exported.text());
}
(async () => {
  let data = await payload();
  assert.equal(data.counts.missions, 2, "same display titles must not merge");
  assert.equal(data.counts.with_details, 1);
  assert.equal(data.missions[0].mission_id, id);
  assert.equal(data.missions[0].detail_snapshots.length, 1, "unchanged repeated captures deduplicate");
  assert.equal(data.missions[0].detail_snapshots[0].sections[0].heading, "Blueprint Rewards");
  selectedTab = tabNodes[2];
  body.innerText = "Required Standing\nRank 2";
  observerCallback([{ target: body }]); scheduled();
  data = await payload();
  assert.equal(data.missions[0].detail_snapshots.length, 2, "tab content is retained independently");
  selectedTab = tabNodes[4];
  body.innerText = "PRIVATE ENTRY SHOULD NOT EXPORT";
  data = await payload();
  assert(!JSON.stringify(data).includes("PRIVATE ENTRY"));
  selectedTab = active;
  modal.querySelector(".detail-title").getAttribute = () => "Mission_Detail_Only";
  data = await payload();
  assert.equal(data.counts.missions, 3, "details absent from the current list still have a separate public ID");
  assert.equal(data.missions[2].debug_name, "Mission_Detail_Only");
  modal.querySelector(".detail-title").getAttribute = () => debug;
  // Chinese translated labels use stable keys; Community stays excluded.
  tabNodes.forEach((tab, index) => { tab.innerText = ["概览", "战斗", "要求", "计算器", "社区"][index]; });
  selectedTab = tabNodes[4];
  data = await payload();
  assert(!data.missions[0].detail_snapshots.some((snapshot) => snapshot.tab_key === "community"));
  autoMode = true;
  modalOpen = false;
  const initialDelay = delayBudget;
  const initialReads = cardReads;
  panel.click({ target: { dataset: { action: "auto" } } });
  await new Promise(setImmediate);
  const batchDelay = delayBudget - initialDelay;
  assert(batchDelay < 1500, `stable fixture batch uses ${batchDelay} ms of scheduled delay`);
  assert(cardReads - initialReads <= 3, "does not rescan all cards for each detail tab");
  data = await payload();
  assert.equal(data.automation_runs[0].done, 1, "batch opens task, switches all public tabs, and closes");
  assert.equal(data.automation_runs[0].failures.length, 0);
  const calculator = data.missions[0].detail_snapshots.find((snapshot) => snapshot.tab_key === "calculator");
  assert.equal(calculator.calculator_basis.reward_fields[0].values[1], "150 XP");
  assert.equal(calculator.calculator_basis.rank_tables[0].ranks[0].xp_to_fill_text, "3,600");
  assert(!JSON.stringify(calculator).includes("DO_NOT_CAPTURE_MISSION_COUNT"));
  assert(!calculator.raw_text.includes("Public content 3"), "calculator full DOM text and inputs not exported");
  assert.equal(data.helper_version, 8);
  assert.equal(modalOpen, false);
  assert.deepEqual(data.completed_mission_keys, [`live:${id}`]);
  assert(data.missions[0].detail_snapshots.some((snapshot) => snapshot.tab_key === "combat"));
  panel.click({ target: { dataset: { action: "auto" } } });
  await new Promise(setImmediate);
  assert.equal(cardClicks, 1, "completed tasks skipped in subsequent batch");
  // A second channel is independent; stop during a tab switch must not mark complete.
  card.href += "&channel=ptu";
  stopOnFirstTab = true;
  panel.click({ target: { dataset: { action: "auto" } } });
  await new Promise(setImmediate);
  data = await payload();
  assert(!data.completed_mission_keys.includes(`ptu:${id}`));
  assert.equal(data.automation_runs.at(-1).stopped, true);
  assert.equal(checkpointData.size, 1, "batch completion persists a checkpoint");
  // A new helper instance on the same page can restore completed tasks and snapshots.
  panel.click({ target: { dataset: { action: "close" } } });
  modalOpen = false;
  vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_missions_capture.js`, "utf8"), context);
  panel.click({ target: { dataset: { action: "restore" } } });
  await new Promise(setImmediate);
  data = await payload();
  assert(data.completed_mission_keys.includes(`live:${id}`));
  assert(data.missions.some((mission) => mission.detail_snapshots.some((snapshot) => snapshot.calculator_basis)), "restore retains calculator data");
  // Worker scheduling path: same public traversal, with no reliance on page timers.
  panel.click({ target: { dataset: { action: "close" } } });
  let workerMessages = 0;
  context.Worker = class {
    postMessage({ id }) { workerMessages += 1; queueMicrotask(() => this.onmessage?.({ data: id })); }
    terminate() {}
  };
  context.location.href = "https://scmdb.net/?channel=ptu";
  stopOnFirstTab = false;
  vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_missions_capture.js`, "utf8"), context);
  panel.click({ target: { dataset: { action: "auto" } } });
  await new Promise(setImmediate);
  data = await payload();
  assert(workerMessages > 0);
  assert.equal(data.automation_runs[0].done, 1);
  assert(data.completed_mission_keys.includes(`ptu:${id}`));
  panel.click({ target: { dataset: { action: "close" } } });
  for (const saved of checkpointData.values()) saved.location_completed = [];
  context.location.href = 'https://scmdb.net/';
  card.href = `https://scmdb.net/?m=${id}`;
  modalOpen = false;
  enrichFixture = true;
  vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_missions_capture.js`, 'utf8'), context);
  panel.click({ target: { dataset: { action: 'restore' } } });
  await new Promise(setImmediate);
  const beforeVisits = visited.length;
  panel.click({ target: { dataset: { action: 'auto' } } });
  await new Promise(setImmediate);
  data = await payload();
  assert.equal(data.automation_runs[0].done, 1);
  assert.equal(data.automation_runs[0].mode, 'full');
  assert.deepEqual(visited.slice(beforeVisits), [0,1,2,3], 'automatic capture revisits old completed tasks missing location details');
  const extras = data.missions.find(m => m.mission_id === id).detail_snapshots.find(s => s.location_details?.placeholder_tooltips.length);
  assert.equal(extras.location_details.placeholder_tooltips[0].items[0].raw_text, 'PLANET\nPyro I');
  assert.equal(extras.location_details.regions[0].groups[0].locations.length, 2);
  assert(data.completed_mission_keys.includes(`live:${id}`), 'supplement preserves previous completion');
  assert(data.location_completed_mission_keys.includes(`live:${id}`));
  const savedImport=structuredClone(data);
  const importer=context.window.__SCMDB_MISSIONS_CAPTURE__.importData;
  assert.throws(()=>importer({...data,source_version_text:'other'}),/版本/);
  assert.throws(()=>importer({...data,source_url:'https://other.example/'}),/来源/);
  assert.throws(()=>importer({...data,missions:[{...data.missions[0],mission_id:'wrong'}]}),/身份/);
  panel.click({ target: { dataset: { action: 'close' } } });
  vm.runInNewContext(fs.readFileSync(`${__dirname}/scmdb_missions_capture.js`, 'utf8'), context);
  const importAgain=context.window.__SCMDB_MISSIONS_CAPTURE__.importData;
  delete savedImport.source_version_text;
  importAgain(savedImport);
  data=await payload();assert.equal(data.completed_mission_keys.length,0,'unknown version imports content without completion');
  importAgain(savedImport,true);data=await payload();
  assert(data.completed_mission_keys.includes(`live:${id}`),'explicit same-version confirmation restores old-file progress');
  const importedCount=data.missions[0].detail_snapshots.length;
  importAgain(savedImport,true);data=await payload();
  assert.equal(data.missions[0].detail_snapshots.length,importedCount,'repeat import deduplicates snapshots');
  const clicksBeforeImportResume=cardClicks;
  panel.click({ target: { dataset: { action: 'auto' } } });await new Promise(setImmediate);
  assert.equal(cardClicks,clicksBeforeImportResume,'imported complete mission skipped');
  if(process.argv[2]) {
    const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
    const result=context.window.__SCMDB_MISSIONS_CAPTURE__.importData(actual,true);
    assert.equal(result.missions,actual.missions.length);
    console.log(`Imported real mission file: ${result.missions} missions`);
  }
  console.log(`SCMDB mission capture fixtures passed (stable four-tab batch scheduled waits: ${batchDelay} ms)`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
