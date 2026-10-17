// Build-time work only: prepare exact responses for the existing public NOTAM
// cache/history. Raw snapshots and the shared index remain untouched on Render.
import { mkdir, mkdtemp, rm, readdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { unpackPublicData } from '../public-data-persistence.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = process.env.BUILD_PUBLIC_DATA_REPOSITORY || 'cuteorca26/space-enthusiast-map';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid build data repository');
const directory = await mkdtemp(join(tmpdir(), 'space-build-history-'));
try {
  const release = await fetch(`https://api.github.com/repos/${repository}/releases/tags/public-map-data`, { headers: { 'user-agent': 'space-map-build' }, signal: AbortSignal.timeout(60000) });
  if (release.status !== 404) {
    if (!release.ok) throw new Error(`Public build cache index HTTP ${release.status}`);
    const manifest = JSON.parse((await release.json()).body);
    if (manifest.format !== 1 || !/^[a-f0-9]{64}$/.test(manifest.sha256) || manifest.name !== `public-data-${manifest.sha256}.pack.gz`) throw new Error('Invalid build cache manifest');
    const response = await fetch(`https://github.com/${repository}/releases/download/public-map-data/${manifest.name}`, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`Public build cache download HTTP ${response.status}`);
    await unpackPublicData(Readable.fromWeb(response.body), directory, manifest.sha256);
    Object.assign(process.env, { DATA_DIR: directory, HOST: '127.0.0.1', MEMORY_BUDGET_MODE: '0', PUBLIC_DATA_REPOSITORY: '', GITHUB_DATA_TOKEN: '' });
    const { readStreamedNotamResponse, restrictionsCacheKey } = await import('../server.mjs');
    const output = join(root, 'prepared_history_v1'); await mkdir(output, { recursive: true });
    let count = 0;
    async function prepare(options) {
      const result = await readStreamedNotamResponse(options);
      if (!result) return;
      const name = result.filePath.split(/[\\/]/).at(-1);
      if (result.filePath !== join(output, name)) {
        await copyFile(result.filePath, join(output, name));
        await copyFile(result.filePath.replace(/\.json$/, '.meta.json'), join(output, name.replace(/\.json$/, '.meta.json')));
      }
      console.log(`Prepared NOTAM ${options.id || 'current cache'}: ${result.summary.total} notices, ${result.summary.drawable} drawable`);
      count++;
    }
    if ((await readdir(directory)).includes('faa_notam_cache.json'))
      await prepare({ current: true, cacheKey: restrictionsCacheKey({ includeDetails: false, includeGlobalNotams: true, includeTfr: false }) });
    let snapshots = [];
    try { snapshots = await readdir(join(directory, 'faa_notam_snapshots')); } catch {}
    for (const id of snapshots.filter(id => /^[\w.-]+\.json$/.test(id))) await prepare({ path: join(directory, 'faa_notam_snapshots', id), id });
    console.log(`Prepared ${count} complete NOTAM responses for the free web service.`);
  }
} finally { await rm(directory, { recursive: true, force: true }); }
