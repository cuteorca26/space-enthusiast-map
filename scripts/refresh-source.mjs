import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRestrictions, getHydropacWarnings, getNavareaWarnings, closePerformanceWorkers } from '../server.mjs';

const source = process.argv[2];
try {
  const data = source === 'notam' ? await getRestrictions({ refresh: true, waitForRefresh: true, includeDetails: true, includeGlobalNotams: true, includeTfr: false })
    : source === 'hydropac' ? await getHydropacWarnings({ refresh: true })
    : source === 'navarea' ? await getNavareaWarnings({ refresh: true }) : null;
  if (!data) throw new Error('Unknown scheduled source');
  const meta = source === 'notam' ? data.sources?.faaNotamSearch : data.source;
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
  console.error(`${source}: ${error.message}`); await closePerformanceWorkers(); process.exit(1);
}
