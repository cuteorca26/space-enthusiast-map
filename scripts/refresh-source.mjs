import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getRestrictions, getHydropacWarnings, getNavareaWarnings, getMsaNavWarnings, closePerformanceWorkers, readStreamedNotamResponse, restrictionsCacheKey } from '../server.mjs';
import { prepareNotamPublication } from '../prepared-notam.mjs';
import { assertCompleteScheduledSource } from '../daily-refresh-policy.mjs';
import { faaFailureDetails } from '../faa-access.mjs';

const source = process.argv[2];
let sourceMeta;
try {
  const data = source === 'notam' ? await getRestrictions({ refresh: true, waitForRefresh: true, includeDetails: true, includeGlobalNotams: true, includeTfr: false })
    : source === 'hydropac' ? await getHydropacWarnings({ refresh: true })
    : source === 'navarea' ? await getNavareaWarnings({ refresh: true })
    : source === 'msa' ? await getMsaNavWarnings({ refresh: true, waitForRefresh: true, fullScan: true }) : null;
  if (!data) throw new Error('Unknown scheduled source');
  const meta = source === 'notam' ? data.sources?.faaNotamSearch : data.source;
  sourceMeta = meta;
  // Do not turn a fallback or a partial global scan into a successful new day.
  assertCompleteScheduledSource(meta);
  if(source==='notam'){
    await prepareNotamPublication(process.env.DATA_DIR,readStreamedNotamResponse,
      restrictionsCacheKey({includeDetails:false,includeGlobalNotams:true,includeTfr:false}));
    console.log('Prepared current NOTAM display and history replay on the collector.');
  }
  const report = { source, status: 'success', fetchedAt: meta.fetchedAt || data.generatedAt,
    total: (data.restrictions?.length || 0) + (data.skipped?.length || 0),
    drawable: data.restrictions?.filter(item => item.hasGeometry && item.geometry).length || 0,
    message: meta.message, coverage: source === 'notam' ? { ...meta.completeness,
      transport: meta.transport, diagnostics: meta.transportDiagnostics } : source === 'msa' ? { bureaus: meta.bureauCount,
      scannedDetailPages: meta.scannedDetailPages, refreshMode: meta.refreshMode, lookbackDays: meta.lookbackDays } : undefined };
  writeFileSync(join(process.env.DATA_DIR, `${source}-report.json`), JSON.stringify(report));
  console.log(`${source}: ${report.total} records, ${report.drawable} drawable`);
  await closePerformanceWorkers(); process.exit(0);
} catch (error) {
  writeFileSync(join(process.env.DATA_DIR, `${source}-report.json`), JSON.stringify({ source, status: 'failed',
    message: error.message,
    ...(source === 'notam' ? (sourceMeta?.failureDetails || faaFailureDetails(error)) : {}),
    coverageWarnings: sourceMeta?.coverageWarnings || [], failedFirs: sourceMeta?.failedFirs || [],
  }));
  if (sourceMeta?.coverageWarnings?.length) console.error(JSON.stringify(sourceMeta.coverageWarnings));
  console.error(`${source}: ${error.message}`); await closePerformanceWorkers(); process.exit(1);
}
