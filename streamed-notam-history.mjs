import { createReadStream, createWriteStream, existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { pipeline } from 'node:stream/promises';
import chain from 'stream-chain';
import { parser } from 'stream-json';
import { replace } from 'stream-json/filters/replace.js';
import { pick } from 'stream-json/filters/pick.js';
import { streamValues } from 'stream-json/streamers/stream-values.js';
import { fileRevision } from './history-derived-cache.mjs';
import { preparedNotamFiles } from './prepared-notam.mjs';

// Only our own saved snapshots enter this parser. Keep one notice in memory,
// using exactly the same geometry and time rules as the ordinary history path.
export async function readNotamMetadata(path) {
  const input = chain([createReadStream(path), parser({ streamKeys: false, streamStrings: false, streamNumbers: false }), replace({
    filter: /^(data\.)?(restrictions|skipped)$/, replacement: [{ name: 'startArray' }, { name: 'endArray' }],
  }), streamValues()]);
  for await (const { value } of input) return value;
  throw new Error('Empty NOTAM snapshot');
}

async function* rows(path, prefix, field) {
  const input = chain([createReadStream(path), parser({ streamKeys: false, streamStrings: false, streamNumbers: false }), pick({
    filter: new RegExp(`^${prefix}${field}\\.\\d+$`),
  }), streamValues()]);
  for await (const { value } of input) yield value;
}

function rowWriter(path) {
  const output = createWriteStream(path); let text = '', count = 0;
  // Keep the stream error handled even while the parser is awaiting input.
  let failure; output.on('error', error => { failure = error; });
  async function flush() {
    if (failure) throw failure;
    if (text && !output.write(text)) await once(output, 'drain');
    text = '';
  }
  return {
    async add(row) { text += `${count++ ? ',' : ''}${JSON.stringify(row)}`; if (text.length > 262144) await flush(); },
    async close() { await flush(); output.end(); await once(output, 'finish'); },
    destroy() { output.destroy(); },
  };
}

export async function streamNotamResponse({ path, directory, version, id, current = false, cacheKey, rules }) {
  mkdirSync(directory, { recursive: true });
  const revision = fileRevision(path);
  // A content identity also lets deployment builds prepare the same exact
  // response on a larger CPU. File paths/inodes differ between build and server.
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (fileRevision(path) !== revision) throw new Error('NOTAM snapshot changed during reading; please retry');
  const key = createHash('sha256').update(`${version}:${hash.digest('hex')}:${id}:${current}:${cacheKey || ''}`).digest('hex');
  const filePath = join(directory, `${key}.json`), metaPath = join(directory, `${key}.meta.json`);
  if (existsSync(filePath) && existsSync(metaPath)) return { filePath, ...JSON.parse(readFileSync(metaPath, 'utf8')) };
  const prepared = rules.preparedDirectory && join(rules.preparedDirectory, `${key}.json`);
  if (prepared && existsSync(prepared) && existsSync(prepared.replace(/\.json$/, '.meta.json')))
    return { filePath: prepared, ...JSON.parse(readFileSync(prepared.replace(/\.json$/, '.meta.json'), 'utf8')) };
  const wrapped = await readNotamMetadata(path);
  let data = wrapped.data || wrapped;
  if (current) {
    data = rules.prepareCache(wrapped, cacheKey);
    if (!data) return null;
  }
  const savedAt = wrapped.savedAt || data.sources?.faaNotamSearch?.fetchedAt || data.faaNotamFetchedAt || data.generatedAt || '';
  const referenceTime = current ? data.faaNotamFetchedAt || savedAt || data.generatedAt : rules.reference(wrapped, data);
  const mode = current ? 'disk-cache' : 'history';
  const hasReference = Number.isFinite(Date.parse(referenceTime || data.faaNotamFetchedAt || data.generatedAt || ''));
  const sample = rules.migrate({ restrictions: [{}] });
  const shouldMigrate = data.faaNotamParseMigrationVersion !== sample.data.faaNotamParseMigrationVersion;
  const counters = { reparsed: 0, changedItems: 0, promotedToDrawable: 0, demotedFromDrawable: 0, beforeDrawable: 0, afterDrawable: 0 };
  const totals = { originalRestrictions: 0, displayedRestrictions: 0, originalSkipped: 0, displayedSkipped: 0 };
  const fields = [], prefix = wrapped.data ? 'data\\.' : '';
  let drawable = 0, migrated = false;
  const temporary = join(directory, `${key}.${randomUUID()}`);
  const restrictionPath = `${temporary}.restrictions`, skippedPath = `${temporary}.skipped`, outputPath = `${temporary}.json`;
  const restrictions = rowWriter(restrictionPath), skipped = rowWriter(skippedPath);
  try {
    for (const field of ['restrictions', 'skipped']) {
      for await (const original of rows(path, prefix, field)) {
        let row = original;
        if (shouldMigrate) {
          const result = rules.migrate({ restrictions: [row] });
          row = result.data.restrictions[0]; migrated = true;
          for (const key of Object.keys(counters)) counters[key] += result.data.faaNotamParseMigration[key];
        }
        const target = shouldMigrate ? 'restrictions' : field;
        totals[target === 'restrictions' ? 'originalRestrictions' : 'originalSkipped']++;
        const visible = rules.filter({ restrictions: target === 'restrictions' ? [row] : [], skipped: target === 'skipped' ? [row] : [] }, referenceTime, mode)[target];
        if (!visible.length) continue;
        totals[target === 'restrictions' ? 'displayedRestrictions' : 'displayedSkipped']++;
        if (target === 'restrictions') {
          await restrictions.add(row);
          fields.push({ country: row.country, region: row.region, regionName: row.regionName, state: row.state, category: row.category, type: row.type });
          if (row.hasGeometry && row.geometry) drawable++;
        } else await skipped.add(row);
      }
    }
    await restrictions.close(); await skipped.close();
    if (current && !totals.originalRestrictions) return null;
    if (migrated) {
      data = { ...data, faaNotamParseMigrationVersion: sample.data.faaNotamParseMigrationVersion,
        faaNotamParseMigration: { version: sample.data.faaNotamParseMigrationVersion, appliedAt: new Date().toISOString(), ...counters },
        sources: { ...data.sources, faaNotamSearch: { ...data.sources?.faaNotamSearch,
          message: String(data.sources?.faaNotamSearch?.message || '').replace(/;\s*\d+\s+have parsed boundary geometry;/i, `; ${counters.afterDrawable} have parsed boundary geometry;`) || data.sources?.faaNotamSearch?.message,
          drawableCount: counters.afterDrawable, localParseMigration: { version: sample.data.faaNotamParseMigrationVersion, ...counters },
        } },
      };
    }
    data = rules.filter(data, referenceTime, mode);
    if (hasReference) {
      data.temporalFilter = { ...data.temporalFilter, ...totals };
      data.sources.faaNotamSearch = { ...data.sources.faaNotamSearch, count: totals.displayedRestrictions, drawableCount: drawable, temporalFilter: data.temporalFilter };
    }
    if (hasReference || migrated) data.filters = rules.filters(fields);
    const includeSkipped = Array.isArray(data.skipped);
    delete data.restrictions; delete data.skipped;
    const summary = { total: totals.displayedRestrictions + totals.displayedSkipped, drawable, referenceTime, summaryParseVersion: rules.summaryVersion };
    const metadata = { summary, dataMetadata: data };
    async function* content() {
      if (!current) yield `${JSON.stringify({ source: 'notam', id, savedAt, referenceTime }).slice(0, -1)},"data":`;
      const head = JSON.stringify(data);
      yield `${head.slice(0, -1)}${head.length > 2 ? ',' : ''}"restrictions":[`;
      yield* createReadStream(restrictionPath);
      yield ']';
      if (includeSkipped) { yield ',"skipped":['; yield* createReadStream(skippedPath); yield ']'; }
      yield current ? '}' : '}}';
    }
    await pipeline(content(), createWriteStream(outputPath));
    if (fileRevision(path) !== revision) throw new Error('NOTAM snapshot changed during reading; please retry');
    renameSync(outputPath, filePath);
    writeFileSync(metaPath, JSON.stringify(metadata));
    trimStreamedCache(directory, filePath);
    return { filePath, ...metadata };
  } finally {
    restrictions.destroy(); skipped.destroy();
    for (const file of [restrictionPath, skippedPath, outputPath]) { try { unlinkSync(file); } catch {} }
  }
}

function trimStreamedCache(directory, keep) {
  const published=new Set(preparedNotamFiles(dirname(directory)).map(name=>join(directory,name)));
  const files = readdirSync(directory).filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(name => {
    const path = join(directory, name), stat = statSync(path); return { path, size: stat.size, time: stat.mtimeMs };
  }).sort((a, b) => b.time - a.time);
  let size = 0;
  for (const file of files) {
    size += file.size;
    if (size > 512 * 1024 * 1024 && file.path !== keep && !published.has(file.path)) {
      try { unlinkSync(file.path); unlinkSync(file.path.replace(/\.json$/, '.meta.json')); } catch {}
    }
  }
}
