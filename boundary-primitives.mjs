import geographiclib from 'geographiclib-geodesic';
const geodesic = geographiclib.Geodesic.WGS84;

// Maritime unqualified miles are nautical miles. Never use Q-line radii here:
// this function receives only a coordinate-bearing body section.
export function explicitRadialBoundary(text, tokens) {
  const source = String(text);
  if (tokens.length !== 1 || /\b(?:ARC|EXC|EXCEPT|EXCLUDING|DIAMETER|EITHER\s+SIDE)\b/i.test(source)) return null;
  const point = tokens[0];
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) >= 90 || Math.abs(point.lon) > 180) return null;
  const unit = '(NAUTICAL\\s+MILES?|STATUTE\\s+MILES?|NMR|NM|KM|KILOMET(?:ER|RE)S?|MET(?:ER|RE)S?|MILES?|M)';
  const distance = '(\\d+(?:\\.\\d+)?)\\s*' + unit + '\\b';
  const match = source.match(new RegExp('\\b(?:WI(?:THIN)?\\s+(?:AN?\\s+)?(?:AREA\\s+)?)' + distance + '\\s+(?:OF|RADIUS)\\b', 'i'))
    || source.match(new RegExp('\\b(?:RADIUS|RDO)\\s*:?\\s*' + distance, 'i'))
    || source.match(new RegExp('\\b' + distance + '\\s*(?:RADIUS|RDO)\\b', 'i'));
  if (!match) return null;
  const units = match[2].toUpperCase();
  const scale = /^(?:KM|KILO)/.test(units) ? 1000 : /^(?:MET|M$)/.test(units) ? 1 : /^STATUTE/.test(units) ? 1609.344 : 1852;
  const radius = Number(match[1]) * scale;
  if (!(radius > 0 && radius <= 2000000)) return null;
  const sector = source.match(/\bBETWEEN\s+(\d{1,3}(?:\.\d+)?)\s*(?:DEG(?:REES)?|°)?\s*(?:AND|TO|-)\s*(\d{1,3}(?:\.\d+)?)\s*(?:DEG(?:REES)?|°)/i);
  if (/\b(?:SECTOR|BETWEEN|BEARINGS?)\b/i.test(source) && !sector) return null;
  let start = sector ? Number(sector[1]) : 0;
  let end = sector ? Number(sector[2]) : 360;
  if (start > 360 || end > 360 || start === end) return null;
  if (end < start) end += 360;
  // Keep radial chord error below 10 m (and angular steps <= 5 degrees).
  // Small activity circles need far fewer vertices than large oceanic areas;
  // a fixed 360 points per circle exhausts the free server on a global cache.
  const maxStep = Math.min(5, 2 * Math.acos(1 - Math.min(10 / radius, 1)) * 180 / Math.PI);
  const count = Math.ceil((end - start) / maxStep);
  const ring = sector ? [[point.lon, point.lat]] : [];
  for (let i = 0; i <= count; i++) {
    const p = geodesic.Direct(point.lat, point.lon, start + (end - start) * i / count, radius);
    ring.push([p.lon2, p.lat2]);
  }
  if (!sector) ring.pop();
  ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring], boundaryRadiusMeters: radius, boundaryCenter: { lat: point.lat, lon: point.lon } };
}

// VA bulletins put the volcano's reference position before the actual WI ring.
// Only isolate an explicit coordinate ring, never an arbitrary route list.
export function isolateAshCloudBoundary(text, extractTokens) {
  if (!/\bVA\s+CLD\b/i.test(text)) return text;
  const start = /\bWI\s+(?=[NS]\s*\d)/i.exec(text);
  if (!start) return text;
  const tail = text.slice(start.index + start[0].length);
  const tokens = extractTokens(tail);
  if (tokens.length < 3) return text;
  return 'AREA BOUNDED BY ' + tail.slice(0, tokens.at(-1).sourceEnd);
}
