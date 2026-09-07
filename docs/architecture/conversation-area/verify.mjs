// Read-only verification. Built-in Node modules only; no app execution/network.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../../..');
const json = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const manifest = json('evidence.json');
const fd = fs.openSync(manifest.archive, 'r');
const sources = new Map();
const read = (size, position) => {
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = fs.readSync(fd, buffer, offset, size - offset, position + offset);
    if (!count) throw Error('Unexpected end of archive');
    offset += count;
  }
  return buffer;
};
try {
  const prefix = read(16, 0);
  const length = prefix.readUInt32LE(12);
  assert(length < 64 * 1024 * 1024, 'Invalid ASAR header');
  const tree = JSON.parse(read(length, 16).toString('utf8'));
  const dataOffset = 8 + prefix.readUInt32LE(4);
  const asset = name => {
    let entry = tree;
    for (const segment of name.split('/')) entry = entry?.files?.[segment];
    assert(entry && !entry.unpacked && !entry.link && entry.offset != null, name);
    return read(entry.size, dataOffset + Number(entry.offset));
  };
  const pkg = JSON.parse(asset('package.json'));
  assert.equal(pkg.name, manifest.packageName, 'Package changed');
  assert.equal(pkg.version, manifest.version, 'Installed app changed; re-audit needed');
  for (const entry of manifest.assets) {
    const buffer = asset(entry.path);
    assert.equal(buffer.length, entry.bytes, entry.path);
    assert.equal(sha(buffer), entry.sha256, entry.path);
    sources.set(entry.path, buffer.toString('utf8'));
  }
} finally {
  fs.closeSync(fd);
}

let locations = 0;
for (const group of manifest.evidence) for (const location of group.locations) {
  const source = sources.get(location.asset)?.slice(location.startUtf16, location.endUtf16);
  assert(source, `${group.id}/${location.symbol}`);
  assert.equal(sha(source), location.sha256, `${group.id}/${location.symbol}`);
  locations++;
}

const catalog = json('components.json');
assert.equal(catalog.components.length, locations, 'Catalog/evidence count');
for (const component of catalog.components) {
  const [groupId, symbol] = component.id.split('/');
  const group = manifest.evidence.find(item => item.id === groupId);
  const location = group?.locations.find(item => item.symbol === symbol);
  assert(location, component.id);
  assert.equal(component.asset, location.asset, component.id);
  assert.equal(component.sourceRange.startUtf16, location.startUtf16, component.id);
  assert.equal(component.sourceRange.endUtf16, location.endUtf16, component.id);
  for (const call of component.jsxIncludingNestedCallbacks) {
    assert(call.callStartUtf16 >= location.startUtf16, component.id);
    assert(call.callEndUtf16 <= location.endUtf16, component.id);
  }
}

const routes = json('routes.json');
assert.equal(routes.dispatchers.length, manifest.dispatchers.length);
let branches = 0;
for (const dispatcher of manifest.dispatchers) {
  const mapped = routes.dispatchers.find(item => item.id === dispatcher.id);
  assert(mapped, dispatcher.id);
  const expected = dispatcher.branches.map(item => item.label).sort();
  const actual = mapped.branches.map(item => item.label).sort();
  assert.equal(new Set(actual).size, actual.length, 'Duplicate route');
  assert.deepEqual(actual, expected, dispatcher.id);
  for (const branch of dispatcher.branches) {
    assert.equal(sha(sources.get(dispatcher.asset).slice(branch.startUtf16, branch.endUtf16)), branch.sha256);
    const mapping = mapped.branches.find(item => item.label === branch.label);
    assert(mapping.owner && mapping.status && mapping.handling, branch.label);
    branches++;
  }
}

const main = fs.readFileSync(path.join(dir, '../marloues-conversation-area.md'), 'utf8');
const detail = fs.readFileSync(path.join(dir, 'rules.md'), 'utf8');
const ids = [...(main + '\n' + detail).matchAll(/^\| (MR\d+) \|/gm)].map(match => match[1]);
assert.deepEqual(ids, Array.from({length: 90}, (_, i) => `MR${String(i + 1).padStart(2, '0')}`));
const cases = json('acceptance.json');
assert.equal(new Set(cases.scenarios.map(item => item.id)).size, cases.scenarios.length);
for (const scenario of cases.scenarios) {
  assert.equal(scenario.executionStatus, 'not-run');
  assert(scenario.steps.length && scenario.expected.length);
  for (const id of scenario.ruleIds) assert(ids.includes(id), id);
}
const coveredRuleIds = new Set(cases.scenarios.flatMap(item => item.ruleIds));
assert(ids.every(id => coveredRuleIds.has(id)), 'Rule without a planned acceptance scenario');

const local = json('marloues-source.json');
assert.equal(local.worktree, root, 'Run in the audited worktree');
const referenceOnly = process.argv.includes('--reference-only');
const changedLocalFiles = [];
for (const entry of local.files) {
  const currentHash = sha(fs.readFileSync(path.join(root, entry.path)));
  if (currentHash !== entry.sha256) changedLocalFiles.push(entry.path);
  if (!referenceOnly) assert.equal(currentHash, entry.sha256,
    `${entry.path} changed; review affected conclusions`);
}

// Verify links in the human-facing handoff; external links are intentionally not fetched.
let links = 0;
for (const name of ['README.md', 'components.md', 'routes.md', 'rules.md', 'evidence.md', 'marloues-source.md']) {
  const file = path.join(dir, name), content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    const [pathname, anchor] = target.split('#');
    const destination = pathname ? path.resolve(path.dirname(file), pathname) : file;
    assert(fs.existsSync(destination), `${name}: ${target}`);
    if (anchor) assert(fs.readFileSync(destination, 'utf8').includes(`id="${anchor}"`), target);
    links++;
  }
}
const report = {
  scope: referenceOnly ? 'reference bundle and historical specification only' : 'historical reference and local source fingerprints',
  bundle: manifest.version,
  assets: manifest.assets.length,
  functions: locations,
  mappedBranches: branches,
  rules: ids.length,
  localSourceFiles: local.files.length,
  documentLinks: links,
  plannedScenarios: cases.scenarios.length,
  uiScenariosExecuted: 0,
  currentUiResults: 'implementation-verification.json',
  changedLocalFiles,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv[2] === 'show') {
  const group = manifest.evidence.find(item => item.id === process.argv[3]);
  assert(group, 'Unknown evidence group');
  const selected = process.argv[4]
    ? group.locations.filter(item => item.symbol === process.argv[4]) : group.locations;
  assert(selected.length, 'Unknown symbol');
  for (const item of selected) {
    console.log(`\n${group.id} ${item.asset} :: ${item.symbol}`);
    console.log(sources.get(item.asset).slice(item.startUtf16, item.endUtf16));
  }
}
