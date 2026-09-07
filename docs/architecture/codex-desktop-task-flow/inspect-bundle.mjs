import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'evidence.json'), 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

// Read the installed ASAR in place. No extraction or application changes.
function openArchive(archivePath) {
  const fd = fs.openSync(archivePath, 'r');
  const read = (size, position) => {
    const result = Buffer.alloc(size);
    let offset = 0;
    while (offset < size) {
      const count = fs.readSync(fd, result, offset, size - offset, position + offset);
      if (!count) throw new Error('Unexpected end of ASAR');
      offset += count;
    }
    return result;
  };
  try {
    const prefix = read(16, 0);
    const headerLength = prefix.readUInt32LE(12);
    if (headerLength > 64 * 1024 * 1024) throw new Error('Unsupported ASAR header size');
    const tree = JSON.parse(read(headerLength, 16).toString('utf8'));
    const dataStart = 8 + prefix.readUInt32LE(4);
    return {
      close: () => fs.closeSync(fd),
      read(entryPath) {
        let entry = tree;
        for (const segment of entryPath.split('/')) entry = entry?.files?.[segment];
        if (!entry || entry.unpacked || entry.link || entry.offset == null) {
          throw new Error(`Missing or unsupported packed entry: ${entryPath}`);
        }
        return read(entry.size, dataStart + Number(entry.offset));
      },
    };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

export function loadVerifiedBundle(archivePath = evidence.archive, manifest = evidence) {
  const archive = openArchive(archivePath);
  const sources = new Map();
  try {
    const metadata = JSON.parse(archive.read('package.json').toString('utf8'));
    if (metadata.name !== manifest.packageName || metadata.version !== manifest.version) {
      throw new Error(`Bundle version mismatch: ${metadata.name} ${metadata.version}; re-audit required`);
    }
    for (const asset of manifest.assets) {
      const content = archive.read(asset.path);
      if (content.length !== asset.bytes || sha256(content) !== asset.sha256) {
        throw new Error(`Asset mismatch; re-audit required: ${asset.path}`);
      }
      sources.set(asset.path, content.toString('utf8'));
    }
    for (const group of manifest.evidence) {
      for (const location of group.locations) {
        const source = sources.get(location.asset)?.slice(location.startUtf16, location.endUtf16);
        if (source == null || sha256(source) !== location.sha256) {
          throw new Error(`Evidence mismatch: ${group.id} ${location.symbol}`);
        }
      }
    }
    return {
      archivePath,
      metadata,
      getSource(id, symbol) {
        const group = manifest.evidence.find(group => group.id === id);
        const location = group?.locations.find(location => location.symbol === symbol);
        if (!location) throw new Error(`Unknown evidence: ${id}/${symbol}`);
        return sources.get(location.asset).slice(location.startUtf16, location.endUtf16);
      },
    };
  } finally {
    archive.close();
  }
}

function main() {
  const args = process.argv.slice(2);
  let manifest = evidence;
  const indexPosition = args.indexOf('--index');
  if (indexPosition >= 0) {
    if (!args[indexPosition + 1]) throw new Error('--index requires a JSON path');
    manifest = JSON.parse(fs.readFileSync(args.splice(indexPosition, 2)[1], 'utf8'));
  }
  let archivePath = manifest.archive;
  const archiveIndex = args.indexOf('--archive');
  if (archiveIndex >= 0) {
    if (!args[archiveIndex + 1]) throw new Error('--archive requires a path');
    archivePath = args.splice(archiveIndex, 2)[1];
  }
  const command = args[0] ?? 'verify';
  if (!['verify', 'show'].includes(command)) throw new Error('Use verify or show E34 [--full]');
  const bundle = loadVerifiedBundle(archivePath, manifest);
  console.log(`Verified ${manifest.packageName} ${manifest.version}: ${manifest.assets.length} assets, ${manifest.evidence.length} groups, ${manifest.evidence.reduce((n, group) => n + group.locations.length, 0)} locations.`);
  if (command === 'show') {
    const group = manifest.evidence.find(group => group.id === args[1]);
    if (!group) throw new Error('Unknown evidence ID');
    for (const location of group.locations) {
      const source = bundle.getSource(group.id, location.symbol);
      const full = args.includes('--full');
      console.log(`\n${group.id} ${location.asset} :: ${location.symbol} [${location.startUtf16}, ${location.endUtf16})\n`);
      console.log(full ? source : source.slice(0, 2400));
      if (!full && source.length > 2400) console.log('… Use --full for the rest of this location.');
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
