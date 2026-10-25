import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packPublicData } from '../public-data-persistence.mjs';
import { DAILY_SOURCES, dailyAssetName } from '../scheduled-refresh.mjs';
import { runDailySource } from '../daily-refresh-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
const source = process.argv[2], config = DAILY_SOURCES[source];
if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token) throw new Error('GitHub Actions repository/token is required');
if (!config) throw new Error('Exactly one scheduled source is required');
const temporary = await mkdtemp(join(tmpdir(), 'space-daily-'));
const reports = [];
let currentDirectory, record;

function runSource(directory) {
  return new Promise(resolveExit => {
    const child = spawn(process.execPath, ['--max-old-space-size=4096', 'scripts/refresh-source.mjs', source], {
      cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, HOST: '127.0.0.1', DATA_DIR: directory, PUBLIC_DATA_REPOSITORY: '', GITHUB_DATA_TOKEN: '',
        GITHUB_TOKEN: '', MEMORY_BUDGET_MODE: '0', NODE_OPTIONS: '', FAA_NOTAM_MAX_PER_FIR: '0', FAA_NOTAM_MAX_FAILED_FIRS: '0' },
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 45 * 60 * 1000);
    child.once('error', error => { clearTimeout(timer); console.error(error.message); resolveExit(false); });
    child.once('exit', code => { clearTimeout(timer); resolveExit(code === 0); });
  });
}
async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, { ...options,
    headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'space-map-daily', 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(60000) });
  if (response.status === 404) return null;
  if (!response.ok) { const error = new Error(`GitHub publication HTTP ${response.status}`); error.status = response.status; throw error; }
  return response.json();
}
try {
  // Common cycle identity/time prevents parallel results from overwriting one
  // another or a late previous cycle from replacing today's status.
  const run = await api(`/actions/runs/${process.env.GITHUB_RUN_ID}`);
  const cycleId = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || 1}`;
  const cycleStartedAt = run?.run_started_at;
  if (!/^\d+-\d+$/.test(cycleId) || !Number.isFinite(Date.parse(cycleStartedAt))) throw new Error('Invalid daily cycle');
  const manualRequestId=process.env.MANUAL_REFRESH_REQUEST_ID||undefined;
  if(manualRequestId&&(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(manualRequestId)||source!=='notam'))throw Error('Invalid manual request');
  const result = await runDailySource({ source,
    async collect(attempt) {
      console.log(`Full ${source} refresh, attempt ${attempt}/3`);
      currentDirectory = join(temporary, `attempt-${attempt}`); await mkdir(currentDirectory);
      record = null;
      const ok = await runSource(currentDirectory);
      let detail;
      try { detail = JSON.parse(await readFile(join(currentDirectory, `${source}-report.json`), 'utf8')); } catch {}
      if (!ok || detail?.status !== 'success') return detail?.status === 'failed' ? detail
        : { status: 'failed', message: '全量采集未完成或超过 45 分钟，未发布不完整数据。' };
      const index = JSON.parse(await readFile(join(currentDirectory, 'refresh_history_index.json'), 'utf8'));
      record = index.sources[source]?.sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0];
      if (!record) throw new Error(`${source} completed without a history snapshot`);
      return detail;
    },
    async publish(outcome) {
      reports.push(outcome);
      const bundle = join(temporary, `bundle-${outcome.attempt}`); await mkdir(bundle);
      const combined = { version: 3, updatedAt: outcome.finishedAt,
        sources: { notam: [], hydropac: [], navarea: [], msa: [], satellite: [] },
        dailyReport: { version: 2, cycleId, cycleStartedAt, ...(manualRequestId?{manualRequestId}:{}), results: [outcome] } };
      if (outcome.status === 'success') {
        combined.sources[source] = [record];
        await copyFile(join(currentDirectory, config.cache), join(bundle, config.cache));
        await mkdir(join(bundle, config.directory));
        await copyFile(join(currentDirectory, config.directory, record.id), join(bundle, config.directory, record.id));
      }
      await writeFile(join(bundle, 'refresh_history_index.json'), JSON.stringify(combined));
      const archive = join(temporary, `daily-${outcome.attempt}.pack.gz`);
      const packed = await packPublicData(bundle, archive), at = new Date();
      const name = dailyAssetName({ at, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT || 1, sha256: packed.sha256 });
      const tag = `scheduled-map-data-${at.getUTCFullYear()}`;
      let release = await api(`/releases/tags/${tag}`);
      if (!release) {
        try { release = await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: `${at.getUTCFullYear()} 每日公共数据`,
          body: 'NOTAM、NAVAREA、HYDROPAC、中国航警的自动采集结果及完整快照。网站左侧可回放，管理员可删除历史。',
          prerelease: true, make_latest: 'false', target_commitish: process.env.GITHUB_SHA }) }); }
        catch (error) {
          // Another source may have created the new year's release meanwhile.
          if (error.status !== 422) throw error;
          release = await api(`/releases/tags/${tag}`); if (!release) throw error;
        }
      }
      const response = await fetch(`https://uploads.github.com/repos/${repository}/releases/${release.id}/assets?name=${name}`, {
        method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'content-length': String(packed.bytes), 'user-agent': 'space-map-daily' },
        body: createReadStream(archive), duplex: 'half', signal: AbortSignal.timeout(600000),
      });
      if (!response.ok) throw new Error(`Daily archive upload HTTP ${response.status}`);
      const asset = await response.json();
      if (asset.size !== packed.bytes || (asset.digest && asset.digest !== `sha256:${packed.sha256}`)) throw new Error('Uploaded daily archive validation failed');
      console.log(`Published ${name} (${packed.bytes} bytes)`);
      if (outcome.nextRetryAt) console.log(`Next ${source} retry no earlier than ${outcome.nextRetryAt}`);
      // Waking the site imports immutable archives only; its cold start cannot
      // change a published success or restart the source's retry clock.
      if (process.env.APP_URL) {
        const url = new URL('/api/scheduled-refresh?sync=1', process.env.APP_URL);
        if (url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS');
        try {
          const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
          await response.body?.cancel();
          if (!response.ok) console.warn(`Site wake-up HTTP ${response.status}; saved archives will sync on its next check.`);
        } catch { console.warn('Site wake-up pending; the archive is saved and will sync on the next site check.'); }
      }
    },
  });
  if (result.status !== 'success') process.exitCode = 1;
} finally {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `## ${source} 自动全量采集\n\n| 尝试 | 结果 | 总条数 | 可绘制 | 完成时间（UTC） | 下次重试（UTC） |\n|---|---|---:|---:|---|---|\n${reports.map(row => `| ${row.attempt}/3 | ${row.status} | ${row.total ?? '—'} | ${row.drawable ?? '—'} | ${row.finishedAt} | ${row.nextRetryAt || '无'} |`).join('\n')}\n\n${reports.filter(row => row.status !== 'success').map(row => `- 第 ${row.attempt} 次：${(row.message || '未完成').replace(/[\r\n|]/g, ' ')}`).join('\n')}\n\n失败来源保留以前的完整数据；成功后停止本轮重试。\n`);
  await rm(temporary, { recursive: true, force: true });
}
