import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { validateFaaSearchPayload, isFaaAccessDenied, isFaaRateLimited } from './faa-notam-access.mjs';
const require = createRequire(import.meta.url);
const XLSX = require('./vendor/sheetjs-0.20.3/xlsx.js');

export function firstNotamText(item) {
  if (typeof item === 'string') return item.trim();
  return [item?.text, item?.rawText, item?.icaoMessage, item?.traditionalMessage, item?.plainLanguageMessage, item?.notamText]
    .find(value => typeof value === 'string' && value.trim())?.trim() || '';
}
export function canonicalNotamText(text) {
  return String(text || '').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}
export function buildFaaExportUrl(params) {
  // Same quoting and GET endpoint used by the official "Download to Excel" UI.
  const values = { ...params, offset: '0', notamsOnly: 'true' };
  delete values.recaptchaToken; delete values.predefinedDabra;
  const query = new URLSearchParams(Object.fromEntries(Object.entries(values).map(([key,value]) => [key,key === 'searchType' ? String(value) : `'${value}'`])));
  return `https://notams.aim.faa.gov/notamSearch/excel?${query}`;
}

export function parseFaaExport(bytes, expectedQuery) {
  const buffer = Buffer.from(bytes);
  if (buffer.length > 24 * 1024 * 1024) throw new Error('FAA Excel export exceeds the permitted size.');
  if (buffer.subarray(0,8).toString('hex') !== 'd0cf11e0a1b11ae1' && buffer.subarray(0,2).toString() !== 'PK') throw new Error('FAA export is not an Excel workbook.');
  const book = XLSX.read(buffer, { type:'buffer', cellFormula:false, cellHTML:false, cellStyles:false, sheetRows:100000 });
  const sheet = book.Sheets['All NOTAMs'];
  if (!sheet) throw new Error('FAA export has no All NOTAMs worksheet.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
  const caption = String(rows[0]?.[0] || '');
  const query = caption.match(/Location search on location\(s\)\s+(.+?)\s+Query ran at UTC:/i)?.[1];
  const codes = value => String(value || '').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean).sort().join(',');
  const abbreviated = /\.\.\.\s*$/.test(query || '');
  const prefix = String(query || '').replace(/\s*\.\.\.\s*$/, '').replace(/\s/g,'').toUpperCase();
  const expectedPrefix = String(expectedQuery || '').replace(/\s/g,'').toUpperCase();
  // FAA shortens captions of long multi-location queries. Verify their visible
  // prefix here, then require exact counts and JSON body samples below.
  if (!query || (abbreviated ? !prefix || !expectedPrefix.startsWith(prefix) : codes(query) !== codes(expectedQuery))) throw new Error('FAA export belongs to a different location query.');
  if (!/^Filter\(s\) used:\s*None\s*$/i.test(String(rows[1]?.[0] || ''))) throw new Error('FAA export unexpectedly contains an active filter.');
  const headerIndex = rows.findIndex(row => row[0] === 'Location' && row[1] === 'NOTAM #/LTA #');
  const expected = ['Location','NOTAM #/LTA #','Class','Issue Date (UTC)','Effective Date (UTC)','Expiration Date (UTC)','NOTAM Condition/LTA subject/Construction graphic title'];
  if (headerIndex < 0 || expected.some((name,i)=>rows[headerIndex][i]!==name)) throw new Error('FAA export columns have changed; refusing incomplete interpretation.');
  const records = [], seen = new Set();
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every(cell=>!String(cell).trim())) continue;
    const [facility,number,category,issueDate,startDate,endDate,body] = row.map(cell=>String(cell).trim());
    if (!facility || !number || !body) throw new Error('FAA export contains a record without location, identifier or full text.');
    if (body.length >= 32767) throw new Error('FAA Excel cell may be truncated; this query must use the original JSON pages.');
    const key = JSON.stringify([facility,number,issueDate,canonicalNotamText(body)]);
    if (seen.has(key)) throw new Error('FAA export repeats a record; snapshot rejected.');
    seen.add(key);
    const international = /\bQ\)\s*[A-Z]{4}\//.test(body) || /\bA\)\s*[A-Z]{4}\b/.test(body);
    records.push({ facilityDesignator:facility, notamNumber:number, featureName:category, keyword:category,
      issueDate,startDate,endDate,icaoMessage:international?body:'',traditionalMessage:international?'':body,
      transactionID:`export-${createHash('sha256').update(key).digest('hex').slice(0,24)}`,
      source:'FAA official Excel export',status:'Active',cancelledOrExpired:false });
  }
  return records;
}

export function verifyFaaExport(records, metadata) {
  validateFaaSearchPayload(metadata);
  const total = Number(metadata.totalNotamCount);
  if (!Number.isInteger(total) || total < 0 || records.length !== total) throw new Error(`FAA export incomplete or changed: ${records.length}/${total}.`);
  const byKey = new Map(records.map(item=>[`${item.facilityDesignator}|${item.notamNumber}|${canonicalNotamText(firstNotamText(item))}`,item]));
  for (const sample of metadata.notamList || []) {
    const key = `${sample.facilityDesignator}|${sample.notamNumber}|${canonicalNotamText(firstNotamText(sample))}`;
    const match = byKey.get(key);
    if (!match) throw new Error(`FAA export differs from its live JSON sample: ${sample.facilityDesignator} ${sample.notamNumber}.`);
    // Preserve original FAA IDs and supplemental metadata wherever available.
    Object.assign(match, sample);
  }
  return records;
}

export async function collectFaaExportBatch({ query, getMetadata, download, retryDelay=async()=>{}, attempts=2 }) {
  for (let attempt=1; attempt<=attempts; attempt++) {
    try {
      const before = validateFaaSearchPayload(await getMetadata(query));
      const records = Number(before.totalNotamCount) === 0 ? [] : parseFaaExport(await download(query), query.code);
      verifyFaaExport(records, before);
      const after = validateFaaSearchPayload(await getMetadata(query));
      if (Number(before.totalNotamCount) !== Number(after.totalNotamCount)) throw new Error('FAA total changed during export.');
      verifyFaaExport(records, after);
      return { fir:query, memberFirs:query.memberFirs || [query], notams:records, loadedCount:records.length,
        totalAvailable:Number(after.totalNotamCount), pagesFetched:0, exportCount:records.length?1:0,
        verification:'official-export-count-and-JSON-sample-before-and-after',error:'' };
    } catch (error) {
      if (isFaaAccessDenied(error) || isFaaRateLimited(error) || attempt===attempts) throw error;
      await retryDelay();
    }
  }
}
