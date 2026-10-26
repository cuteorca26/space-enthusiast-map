import JSZip from 'jszip';

export const RUSSIA_NAVAREA_INDEX = 'https://rosatomport.ru/page149739436.html';
const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

export function discoverRussianNavareaArchive(html, regionId) {
  if (![20, 21].includes(Number(regionId))) throw new Error('Unsupported Russian NAVAREA');
  const candidates = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try { url = new URL(match[1].replace(/&amp;/g, '&'), RUSSIA_NAVAREA_INDEX); } catch { continue; }
    const file = decodeURIComponent(url.pathname).match(/NAVAREA_(20|21)_(\d{2})(\d{2})(\d{4})\.zip$/i);
    if (url.protocol !== 'https:' || url.hostname !== 'files.rosatomport.ru' || !file || Number(file[1]) !== Number(regionId)) continue;
    const date = `${file[4]}-${file[3]}-${file[2]}`;
    const parsedDate = new Date(date);
    if (!Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) continue;
    candidates.push({ url: url.href, publishedAt: date, label: match[2].replace(/<[^>]*>/g, ' ').trim() });
  }
  candidates.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (!candidates.length) throw new Error(`NAVAREA ${regionId}: official current archive link missing`);
  return candidates[0];
}

export async function parseRussianNavareaArchive(bytes, region, archive) {
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Official archive exceeds size limit');
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.values(zip.files).filter(file => !file.dir && /\.txt$/i.test(file.name));
  if (!files.length || files.length > 2000) throw new Error('Official archive has no valid text warning list');
  let total = 0;
  const records = [], seen = new Set();
  for (const file of files) {
    total += file._data?.uncompressedSize || 0;
    if (total > MAX_TEXT_BYTES) throw new Error('Official archive expanded text exceeds size limit');
    const data = await file.async('uint8array');
    if (data.length > MAX_TEXT_BYTES) throw new Error('Official warning exceeds size limit');
    let originalText = new TextDecoder('utf-8').decode(data).replace(/^\uFEFF/, '');
    if (originalText.includes('\uFFFD')) originalText = new TextDecoder('windows-1251').decode(data);
    // The coordinator supplies Russian and English versions in the same file.
    // Use its English original, never a machine translation or combined polygons.
    const header = /(?:^|\n)[ \t]*NAVAREA\s+(XXI|XX)\s+(\d{1,5})\/(\d{2,4})\b/i.exec(originalText);
    if (!header || header[1].toUpperCase() !== region.roman) throw new Error(`Official warning ${file.name}: missing or mismatched English NAVAREA header`);
    const msgNumber = Number(header[2]), year = Number(header[3]);
    const msgYear = year < 100 ? 2000 + year : year;
    const key = `${msgYear}:${msgNumber}`;
    if (seen.has(key)) throw new Error(`Duplicate official warning ${region.label} ${key}`);
    seen.add(key);
    const text = originalText.slice(header.index).replace(/\s*NNNN\s*$/i, '').trim();
    records.push({ navArea: String(region.id), navAreaRoman: region.roman, navAreaLabel: region.label,
      msgNumber, msgYear, text, originalText, status: 'A', issueDate: null,
      authority: 'FSUE Hydrographic Enterprise (Rosatom)', sourcePriority: 0,
      sourcePageUrl: RUSSIA_NAVAREA_INDEX, officialPageUrl: archive.url,
      sourceArchiveDate: archive.publishedAt, sourceFileName: file.name });
  }
  return { records, coverage: { region: region.label, url: archive.url,
    provider: 'FSUE Hydrographic Enterprise', publishedAt: archive.publishedAt,
    scannedPages: 1, totalPages: 1, records: records.length, errors: [] } };
}

async function fetchArchive(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for official NAVAREA archive`);
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > MAX_ARCHIVE_BYTES) throw new Error('Official archive exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function fetchRussianNavareaRegion(region, fetchPage, fetchBytes = fetchArchive) {
  const html = await fetchPage(RUSSIA_NAVAREA_INDEX, 45000);
  const archive = discoverRussianNavareaArchive(html, region.id);
  return parseRussianNavareaArchive(await fetchBytes(archive.url), region, archive);
}
