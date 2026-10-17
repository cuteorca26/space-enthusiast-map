import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRestrictions, getHydropacWarnings, getNavareaWarnings, closePerformanceWorkers } from '../server.mjs';

const source = process.argv[2];
let sourceMeta;
try {
  const data = source === 'notam' ? await getRestrictions({ refresh: true, waitForRefresh: true, includeDetails: true, includeGlobalNotams: true, includeTfr: false })
    : source === 'hydropac' ? await getHydropacWarnings({ refresh: true })
    : source === 'navarea' ? await getNavareaWarnings({ refresh: true }) : null;
  if (!data) throw new Error('Unknown scheduled source');
  const meta = source === 'notam' ? data.sources?.faaNotamSearch : data.source;
  sourceMeta = meta;
  // Do not turn a fallback or a partial global scan into a successful new day.
  if (!meta || meta.status !== 'ok' || meta.cacheFallback || meta.partialRefresh || meta.failedFirs?.length || meta.capped)
    throw new Error(meta?.message || 'The full source refresh did not succeed');
  const report = { source, status: 'success', fetchedAt: meta.fetchedAt || data.generatedAt,
    total: (data.restrictions?.length || 0) + (data.skipped?.length || 0),
    drawable: data.restrictions?.filter(item => item.hasGeometry && item.geometry).length || 0,
    message: meta.message };
  writeFileSync(join(process.env.DATA_DIR, `${source}-report.json`), JSON.stringify(report));
  console.log(`${source}: ${report.total} records, ${report.drawable} drawable`);
  await closePerformanceWorkers(); process.exit(0);
} catch (error) {
  writeFileSync(join(process.env.DATA_DIR, `${source}-report.json`), JSON.stringify({ source, status: 'failed',
    message: /403|Access Denied/i.test(error.message) ? '来源拒绝访问（403），未取得本次完整数据。' : error.message,
    coverageWarnings: sourceMeta?.coverageWarnings || [], failedFirs: sourceMeta?.failedFirs || [],
  }));
  if (sourceMeta?.coverageWarnings?.length) console.error(JSON.stringify(sourceMeta.coverageWarnings));
  console.error(`${source}: ${error.message}`); await closePerformanceWorkers(); process.exit(1);
}
