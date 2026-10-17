import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPublicData } from '../public-data-persistence.mjs';
import { DAILY_SOURCES, dailyAssetName } from '../scheduled-refresh.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token) throw new Error('GitHub Actions repository/token is required');
const temporary = await mkdtemp(join(tmpdir(), 'space-daily-'));
const bundle = join(temporary, 'bundle'); await mkdir(bundle);
const report = [], combined = { version: 3, updatedAt: new Date().toISOString(), sources: { notam: [], hydropac: [], navarea: [], msa: [], satellite: [] } };

function runSource(source, directory) {
  return new Promise(resolveExit => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/refresh-source.mjs', source], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, HOST: '127.0.0.1', DATA_DIR: directory, PUBLIC_DATA_REPOSITORY: '', GITHUB_DATA_TOKEN: '',
        GITHUB_TOKEN: '', MEMORY_BUDGET_MODE: '0', NODE_OPTIONS: '', FAA_NOTAM_MAX_PER_FIR: '0', FAA_NOTAM_MAX_FAILED_FIRS: '0' },
    });
    const timer = setTimeout(() => child.kill(), 45 * 60 * 1000);
    child.once('error', error => { clearTimeout(timer); console.error(error.message); resolveExit(false); });
    child.once('exit', code => { clearTimeout(timer); resolveExit(code === 0); });
  });
}
async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { ...options,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'space-map-daily', 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(60000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub publication HTTP ${response.status}`);
  return response.json();
}
try {
  for (const [source, config] of Object.entries(DAILY_SOURCES)) {
    const directory = join(temporary, source); await mkdir(directory);
    let ok = false;
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      console.log(`Full ${source} refresh, attempt ${attempt}`);
      ok = await runSource(source, directory);
      if (!ok) {
        try { if (/403|拒绝访问/.test(JSON.parse(await readFile(join(directory, `${source}-report.json`), 'utf8')).message || '')) break; } catch {}
      }
      if (!ok && attempt === 1) await new Promise(done => setTimeout(done, 30000));
    }
    if (!ok) {
      let failure;
      try { failure = JSON.parse(await readFile(join(directory, `${source}-report.json`), 'utf8')); } catch {}
      report.push(failure?.status === 'failed' ? failure : { source, status: 'failed', message: '本次全量刷新未完成。' }); continue;
    }
    const detail = JSON.parse(await readFile(join(directory, `${source}-report.json`), 'utf8'));
    const index = JSON.parse(await readFile(join(directory, 'refresh_history_index.json'), 'utf8'));
    const record = index.sources[source]?.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
    if (!record) throw new Error(`${source} completed without a history snapshot`);
    combined.sources[source] = [record]; report.push(detail);
    await copyFile(join(directory, config.cache), join(bundle, config.cache));
    await mkdir(join(bundle, config.directory));
    await copyFile(join(directory, config.directory, record.id), join(bundle, config.directory, record.id));
  }
  // Publish the outcome even if every upstream is unavailable. The website must
  // show today's failure, not silently keep displaying an old successful run.
  {
    const { writeFile } = await import('node:fs/promises');
    combined.dailyReport = { version: 1, results: report };
    await writeFile(join(bundle, 'refresh_history_index.json'), JSON.stringify(combined));
    const archive = join(temporary, 'daily.pack.gz'), packed = await packPublicData(bundle, archive), at = new Date();
    const name = dailyAssetName({ at, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT || 1, sha256: packed.sha256 });
    const tag = `scheduled-map-data-${at.getUTCFullYear()}`;
    let release = await api(`/releases/tags/${tag}`);
    if (!release) release = await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: `${at.getUTCFullYear()} 每日公共数据`,
      body: '每日 NOTAM、NAVAREA、HYDROPAC 的完整快照。网站从这里读取自动刷新历史；管理员可在网站左侧删除历史记录。', prerelease: true, make_latest: 'false', target_commitish: process.env.GITHUB_SHA }) });
    const response = await fetch(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${name}`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'content-length': String(packed.bytes), 'user-agent': 'space-map-daily' },
      body: createReadStream(archive), duplex: 'half', signal: AbortSignal.timeout(600000),
    });
    if (!response.ok) throw new Error(`Daily archive upload HTTP ${response.status}`);
    const asset = await response.json();
    if (asset.size !== packed.bytes || (asset.digest && asset.digest !== `sha256:${packed.sha256}`)) throw new Error('Uploaded daily archive validation failed');
    console.log(`Published ${name} (${packed.bytes} bytes)`);
    // Wake the existing free web service. It only imports our validated Release;
    // this URL never authorizes upstream refreshes or deletions.
    const app = process.env.APP_URL;
    if (app) {
      const url = new URL('/api/scheduled-refresh?sync=1', app);
      if (url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS');
      let imported = false;
      for (let i = 0; i < 8 && !imported; i++) {
        try {
          const result = await fetch(url, { signal: AbortSignal.timeout(180000) });
          if (result.ok) { const status = await result.json(); imported = status.enabled && !status.error && status.lastRunAt >= at.toISOString().slice(0, 19) + 'Z'; }
        } catch (error) { console.warn(`Site import attempt ${i + 1}: ${error.message}`); }
        if (!imported) await new Promise(done => setTimeout(done, 65000));
      }
      if (!imported) { report.push({ source: '网站同步', status: 'failed' }); console.error('The archive is safely published, but website import could not be confirmed.'); }
    }
  }
} finally {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## 每日全量刷新\n\n| 数据源 | 结果 | 总条数 | 可绘制 |\n|---|---|---:|---:|\n${report.map(row => `| ${row.source} | ${row.status} | ${row.total ?? '—'} | ${row.drawable ?? '—'} |`).join('\n')}\n\n${report.filter(row => row.status !== 'success').map(row => `- ${row.source}: ${(row.message || '未完成').replace(/[\r\n]/g, ' ')}`).join('\n')}\n\n失败的数据源不会覆盖上一次成功的数据。\n`);
  await rm(temporary, { recursive: true, force: true });
}
if (report.some(item => item.status !== 'success')) process.exitCode = 1;
