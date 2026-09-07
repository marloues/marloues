import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '../..');
const require = createRequire(join(root, 'client/package.json'));
const { resolveConfig } = await import(pathToFileURL(join(dirname(require.resolve('electron-vite/package.json')), 'dist/index.mjs')));
const { build } = await import(pathToFileURL(join(dirname(require.resolve('vite/package.json')), 'dist/node/index.js')));
const output = mkdtempSync(join(tmpdir(), 'marloues-conversation-build-'));
const artifactDir = join(root, 'client/test-results/conversation-details');
mkdirSync(artifactDir, { recursive: true });
process.chdir(join(root, 'client'));
const { config } = await resolveConfig({ configFile: join(root, 'client/electron.vite.config.ts') }, 'build', 'production');
const passed = [];
for (const name of ['main', 'preload', 'renderer']) {
  await build({ ...config[name], logLevel: 'warn', build: { ...config[name].build, emptyOutDir: false, outDir: join(output, name) } });
  passed.push(name);
  console.log('PASS production build:', name);
}
writeFileSync(join(artifactDir, 'build.json'), JSON.stringify({ passed, output, emptyOutDir: false }, null, 2));
