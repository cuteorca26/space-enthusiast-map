import geographiclib from 'geographiclib-geodesic';
import clipping from 'polygon-clipping';
const geodesic = geographiclib.Geodesic.WGS84;
const unitPattern = '(NAUTICAL\\s+MILES?|STATUTE\\s+MILES?|NMR|NM|KM|KILOMET(?:ER|RE)S?|MET(?:ER|RE)S?|MILES?|FEET|FT|M)';
const distancePattern = '(\\d+(?:\\.\\d+)?)\\s*' + unitPattern + '\\b';
export function normalizeBoundaryLanguage(text) {
  const words = {ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5,SIX:6,SEVEN:7,EIGHT:8,NINE:9,TEN:10,TWENTY:20,HALF:0.5};
  return String(text).replace(/\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|TWENTY|HALF)(?=\s+(?:NAUTICAL\s+)?(?:MILES?|NM|KM|METERS?|METRES?)\b)/gi, m=>String(words[m.toUpperCase()]))
    .replace(/\bSEA\s+MILES?\b/gi,'NM')
    .replace(/\bC\s+OORD\b/gi,'COORD')
    .replace(/\bEXC\s+ON\s+(?=20\d{2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\b)/gi,'ACTIVITY DATE EXCEPTION ')
    .replace(/\b(AREA\b[^.\r\n]{0,80}?)\s+NOT\s+INCLUDED\b/gi,'EXCLUDING $1')
    // These clauses describe who may enter, not holes in the boundary. Keep
    // their contents so any later geometric exclusion still gets checked.
    .replace(/\b(?:EXC|EXCEPT|EXCLUDING)\s+(?:FOR\s*)?[:\-]?\s*(?:-\s*)?(?=(?:(?:IFR|FRENCH|STATE|UNMANN?ED|COMMERCIAL)\s+)*(?:ACFT|AIRCRAFT|FLIGHTS?|UA|UAS|MEDEVAC)\b|DEFENCE\s+AND\s+STATE\s+HEL\b|POLICE\s+AND\s+BOS\s+UAS\b)/gi,'OPERATIONAL EXEMPTION ')
    .replace(/\bEXC\s+(?=AS\s+SPECIFIED\s+BLW\b|THE\s+FLT\s+OPS\s+LISTED\s+BLW\b)/gi,'OPERATIONAL EXEMPTION ')
    .replace(/\bEXC\s*:\s*(?=1\)\s*FLIGHTS?\s+CONDUCTED\b)/gi,'OPERATIONAL EXEMPTION ')
    .replace(/\b(?:EXC|EXCEPT)\s+(?:FOR\s+)?(?=WHERE\s+OPR\s+UNDER\s+CAR\s+601\.17\b|PARTICIPANTS\s+SHALL\s+OPR\b|ONLY\s+FLT\s+OPR\s+AUTH\b|MEDICAL,\s+POLICE\s+AND\s+MILITARY\s+AGENCIES\b|SPECIAL\s+FIGHTS,\s+HUMANITARIAN,\s+SAR\b|STATE,\s+SPECIAL,\s+HUM,\s+SAR\b)/gi,'OPERATIONAL EXEMPTION ')
    .replace(/\b(?:EXC|EXCEPT)\s*(?:FOR\s*)?[:\-]?\s*(?:[.\-]\s*|1[.)]\s*)?(?=WITH\s+PPR\s+REQUEST\b|UNMANNED\s+ACFT\s+INVOLVED\b|ACFT\s+BELONGING\b|STATE\s+AVIATION\b|IFR,\s+SAR,\s+MEDEVAC\b|POLICE\s+OPS\b|ALL\s+TRAFFIC\s+TO\/FROM\b)/gi,'OPERATIONAL EXEMPTION ')
    .replace(/\bEXC\s+(?:OVERLAPPED|OVELAPPED)\s+AREA\s+WITH\s+(?=\d{6}[NS]\s+\d{7}[EW])/gi,'EXCLUDING AREA ')
    .replace(/\bAP\s+AIRSPACE\s+AFFECTED\s+MAY\s+INCLUDE\s+[A-Z0-9,\s]+\./gi,' ')
    .replace(/\bDIAMETER\s+OF\s+(?:THE\s+)?BALLOON\s*:\s*\d+(?:\.\d+)?\s*(?:CM|M|FT|IN)\b/gi,' ')
    .replace(/(\bBALLOON\s+CHARACTERISTICS?\s*:\s*CATEGORY\s+(?:LIGHT|MEDIUM|HEAVY)\s+\d+(?:\.\d+)?\s*(?:M|FT|FEET|CM)\s+)DIAMETER\b/gi,'$1BALLOON SIZE')
    .replace(/\b(\d+),(\d+)\s*(NM|KM|M)\b/gi,'$1.$2$3');
}
function meters(value, unit) {
  return Number(value) * (/^(?:KM|KILO)/i.test(unit) ? 1000 : /^(?:MET|M$)/i.test(unit) ? 1 : /^(?:FT|FEET)$/i.test(unit) ? 0.3048 : /^STATUTE/i.test(unit) ? 1609.344 : 1852);
}
function direct(point, bearing, distance) {
  const p = geodesic.Direct(point.lat, point.lon, bearing, distance);
  return [p.lon2, p.lat2];
}
function arcPoints(center, radius, start, sweep, error = 2) {
  const step = Math.min(5, 2 * Math.acos(1 - Math.min(error / radius, 1)) * 180 / Math.PI);
  const count = Math.ceil(Math.abs(sweep) / step);
  return Array.from({length: count + 1}, (_, i) => direct(center, start + sweep * i / count, radius));
}
function fail(reason) { return {recognized: true, geometry: null, reason}; }
function success(geometry, method) { return {recognized: true, geometry, method}; }
function wrap(lon) { return lon>=-180&&lon<180 ? lon : ((lon + 180) % 360 + 360) % 360 - 180; }

// Subtract explicitly described exclusions even when they touch/cross an edge.
// A common unwrapped longitude frame avoids a false cut across the date line.
export function subtractExplicitAreas(outer, exclusions) {
  const lon0=outer.coordinates[0][0][0];
  const unwrap=polygon=>polygon.coordinates.map(r=>r.map(([lon,lat])=>[lon0+wrap(lon-lon0),lat]));
  const shapes=[outer,...exclusions].map(unwrap);
  const xs=shapes.flat(2).map(p=>p[0]);
  if(Math.max(...xs)-Math.min(...xs)>=180)return null;
  try{
    const parts=clipping.difference(shapes[0],...shapes.slice(1)).map(p=>p.map(r=>r.map(([lon,lat])=>[wrap(lon),lat])));
    return parts.length===1?{type:'Polygon',coordinates:parts[0]}:parts.length?{type:'MultiPolygon',coordinates:parts}:null;
  }catch{return null;}
}

// A cardinal limiting edge with both endpoint coordinates is fully specified.
// Use the same unwrapped straight-edge convention as GeoJSON polygons.
export function explicitClippedCircle(text,tokens){
  const limit=/\bLIMITED\s+TO\s+THE\s+(NORTH|SOUTH|EAST|WEST)\s+BY\s+(?:A\s+)?LINE\s+JOINING\s+(?:POINTS\s+)?/i.exec(text);
  if(!limit)return null;
  const centres=tokens.filter(t=>t.sourceEnd<=limit.index),edge=tokens.filter(t=>t.sourceIndex>=limit.index+limit[0].length);
  if(centres.length!==1||edge.length!==2)return fail('裁切圆形需要一个圆心和直线两端的完整坐标');
  if(/\b(?:FIR|BORDER|COASTLINE|EXC|EXCEPT|EXCLUDING)\b/i.test(text.slice(limit.index)))return fail('裁切圆形还包含未确定的额外边界');
  const circle=explicitRadialBoundary(text.slice(0,limit.index),centres);
  if(!circle||circle.boundaryError)return fail(circle?.boundaryError||'裁切圆形的圆心或半径无效');
  const lon0=centres[0].lon,xy=p=>[lon0+wrap(p.lon-lon0),p.lat],a=xy(edge[0]),b=xy(edge[1]);
  const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(length<1e-9||Math.abs(dx)>=170)return fail('裁切直线长度或经度跨度不明确');
  const keep={SOUTH:[0,1],NORTH:[0,-1],EAST:[-1,0],WEST:[1,0]}[limit[1].toUpperCase()];
  const side=dx*keep[1]-dy*keep[0];
  if(Math.abs(side)<1e-10)return fail('裁切方向与直线平行，无法确定保留哪侧');
  const along=[dx/length*1000,dy/length*1000],normal=[-dy/length*Math.sign(side)*1000,dx/length*Math.sign(side)*1000];
  const p=[a[0]-along[0],a[1]-along[1]],q=[a[0]+along[0],a[1]+along[1]],half=[[p,q,[q[0]+normal[0],q[1]+normal[1]],[p[0]+normal[0],p[1]+normal[1]],p]];
  try{
    const ring=circle.coordinates.map(r=>r.map(([lon,lat])=>[lon0+wrap(lon-lon0),lat]));
    const parts=clipping.intersection(ring,half).map(p=>p.map(r=>r.map(([lon,lat])=>[wrap(lon),lat])));
    if(!parts.length)return fail('原文直线限制与圆形没有可绘制的共同区域');
    return success(parts.length===1?{type:'Polygon',coordinates:parts[0]}:{type:'MultiPolygon',coordinates:parts},'WGS84 圆形按明确坐标直线及方位裁切');
  }catch{return fail('圆形和直线的边界裁切失败');}
}

// Precision of a printed coordinate, not an arbitrary percentage of the radius.
// A whole second is at most 22 m from its printed position (two axes combined).
function coordinateRoundingMeters(token) {
  const s = String(token.matchedText || '').replace(/\s+/g, '');
  const compact = s.match(/^(\d{4}(?:\d{2})?(?:\.\d+)?)[NS][,/-]*(\d{5}(?:\d{2})?(?:\.\d+)?)[EW]$/i)
    || s.match(/^[NS](\d{4}(?:\d{2})?(?:\.\d+)?)[EW](\d{5}(?:\d{2})?(?:\.\d+)?)/i);
  if (compact) {
    const steps = compact.slice(1).map((part, i) => 10 ** -(part.split('.')[1]?.length || 0) / (part.split('.')[0].length === (i ? 7 : 6) ? 3600 : 60));
    return 111700 * Math.hypot(...steps) / 2;
  }
  const dashed = [...s.matchAll(/\d{1,3}-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?[NSEW]/gi)];
  if (dashed.length === 2) return 111700 * Math.hypot(...dashed.map(m => 10 ** -((m[2] || m[1]).split('.')[1]?.length || 0) / (m[2] ? 3600 : 60))) / 2;
  return 1; // Unrecognized precision must not license moving an endpoint.
}

// Recognize explicit arcs before the straight polygon parser sees their centres.
// Named coastlines, bearings without endpoints and uncertain directions stay unplotted.
export function explicitArcBoundary(text, tokens) {
  const mentions = [...String(text).matchAll(/\b(?:CIRCULAR\s+)?ARC\b/gi)].filter(m =>
    !/(?:^|[\r\n])\s*(?:REF|CHARTS?)\s*:[^\r\n]*$/i.test(text.slice(0, m.index)));
  if (!mentions.length) return null;
  // A closed exclusion AREA whose entire boundary is one arc, with only a
  // centre/radius and no endpoints or angular limits, specifies a full circle.
  if(mentions.length===1&&tokens.length===1&&/\bAREA\s+BOUNDED\s+BY\s+ARC\s+OF\s+RADIUS\b/i.test(text)&&!/\b(?:CLOCKWISE|COUNTERCLOCKWISE|SECTOR|AZIMUTH|BEARING|BETWEEN|LIMITED)\b/i.test(text)){
    const circle=explicitRadialBoundary(text.replace(/\bARC\s+OF\s+/i,''),tokens);
    if(circle&&!circle.boundaryError)return success(circle,'圆弧围成的封闭区域，按明确圆心与半径绘制完整圆');
  }
  if (/\b(?:EXC|EXCEPT|EXCLUDING|COASTLINE|SHORELINE|(?:FIR|STATE|NATIONAL)\s+(?:BOUNDARY|BORDER))\b/i.test(text)) return fail('圆弧包含尚未确定的边界或排除区域，未绘制。');
  if (tokens.length === 1 && /\bSECTOR\s+CENT(?:RED|ERED)\s+ON\b/i.test(text)
    && /\b(?:BTN|BETWEEN)\s+BRG\s+\d+(?:\.\d+)?\s+AND\s+\d+(?:\.\d+)?\s*DEG\b/i.test(text)
    && /\bCLOCKWISE\b/i.test(text) && !/\b(?:COUNTER|ANTI)[ -]?CLOCKWISE\b/i.test(text)) {
    const sector=explicitRadialBoundary(text.replace(/\bARC\b/gi,'').replace(/\bBRG\b/gi,'BEARINGS'),tokens);
    if (sector && !sector.boundaryError) return success(sector,'明确圆心、半径与顺时针方位角的扇形');
  }
  // Some Japanese NOTAMs list the vertices first, then redefine one edge as
  // the minor arc. The repeated reference endpoints are not extra vertices.
  const post = /\bTHE\s+LINE\s+CONNECTING\b/i.exec(text);
  if (post && mentions.length === 1 && /\b(?:MINOR|MAJOR)\s+ARC\b/i.test(text.slice(post.index))) {
    const outline = tokens.filter(p => p.sourceIndex < post.index);
    const references = tokens.filter(p => p.sourceIndex >= post.index && p.sourceIndex < mentions[0].index);
    const centers = tokens.filter(p => p.sourceIndex > mentions[0].index);
    const radius = text.slice(mentions[0].index).match(new RegExp('\\bRADIUS\\s+(?:OF\\s+)?' + distancePattern + '\\s+(?:FM|FROM|CENT(?:ER|RE)(?:ED|D)?\\s+(?:AT|ON))\\b', 'i'));
    if (outline.length < 3 || references.length !== 2 || centers.length !== 1 || !radius) return fail('后置圆弧说明缺少完整端点、圆心或半径，未绘制。');
    const same = (a,b) => Math.abs(a.lat-b.lat)<1e-9 && Math.abs(a.lon-b.lon)<1e-9;
    if (!same(outline[0],outline.at(-1))) outline.push(outline[0]);
    const edge = outline.findIndex((p,i) => i < outline.length-1 && (same(p,references[0]) && same(outline[i+1],references[1]) || same(p,references[1]) && same(outline[i+1],references[0])));
    if (edge < 0) return fail('后置圆弧端点不是同一条多边形边的相邻顶点，未绘制。');
    const center=centers[0], a=outline[edge], b=outline[edge+1];
    const azA=geodesic.Inverse(center.lat,center.lon,a.lat,a.lon).azi1, azB=geodesic.Inverse(center.lat,center.lon,b.lat,b.lon).azi1;
    const clockwise=(azB-azA+360)%360;
    if (Math.abs(clockwise-180)<1e-7) return fail('半圆的长短弧方向不明确，未绘制。');
    const cw = /\bMINOR\s+ARC\b/i.test(text.slice(post.index)) ? clockwise<180 : clockwise>180;
    let rewritten='AREA BOUNDED BY ', rewrittenTokens=[];
    const append = point => { const sourceIndex=rewritten.length; rewritten+=point.matchedText; rewrittenTokens.push({...point,sourceIndex,sourceEnd:rewritten.length}); };
    outline.forEach((p,i) => {
      if(i)rewritten+=' - ';
      append(p);
      if(i===edge) { rewritten+=` - ${cw?'CLOCKWISE':'COUNTERCLOCKWISE'} ARC WITH CENTER AT `; append(center); rewritten+=` RADIUS ${radius[1]} ${radius[2]} TO `; }
    });
    return explicitArcBoundary(rewritten,rewrittenTokens);
  }
  const segments = new Map();
  for (const [n, mention] of mentions.entries()) {
    const endLimit = mentions[n + 1]?.index ?? text.length;
    const centerMarker = /\bCENT(?:ER|RE)(?:ED|D)?\s+(?:AT|ON)?\s*/i.exec(text.slice(mention.index, endLimit));
    if (!centerMarker) return fail('圆弧缺少明确圆心，未将圆心或端点误连成直线。');
    const centerPos = mention.index + centerMarker.index + centerMarker[0].length;
    const ci = tokens.findIndex(p => p.sourceIndex >= centerPos);
    if (ci < 1 || ci + 1 >= tokens.length || tokens[ci].sourceIndex >= endLimit) return fail('圆弧缺少起点、圆心或终点，未绘制。');
    const start = tokens[ci - 1], center = tokens[ci], end = tokens[ci + 1];
    if (start.sourceIndex >= mention.index || end.sourceIndex >= endLimit) return fail('圆弧坐标顺序不明确，未绘制。');
    const clause = text.slice(start.sourceEnd, end.sourceEnd);
    const radiusMatch = clause.match(new RegExp('\\bRADIUS\\s+(?:OF\\s+)?' + distancePattern, 'i'))
      || clause.match(new RegExp('\\b' + distancePattern + '\\s+RADIUS\\b', 'i'));
    if (!radiusMatch) return fail('圆弧缺少明确半径或单位，未绘制。');
    const radius = meters(radiusMatch[1], radiusMatch[2]);
    if (!(radius > 0 && radius <= 2000000)) return fail('圆弧半径超出支持范围，未绘制。');
    if (radius >= geodesic.Inverse(center.lat, center.lon, center.lat < 0 ? -90 : 90, center.lon).s12) return fail('圆弧所在圆跨越极点，当前绘图投影尚不能可靠处理，未绘制。');
    const ccw = /\b(?:ANTI[ -]?CLOCKWISE|COUNTER[ -]?CLOCKWISE|CCW)\b/i.test(clause);
    // Portuguese geometry uses sentido retrógrado for clockwise. Restrict this
    // convention to an explicit direction phrase, never orbital "retrograde".
    const cw = /\b(?:CLOCKWISE|CW|RETROGRADE\s+DIRECTION)\b/i.test(clause.replace(/\b(?:ANTI[ -]?CLOCKWISE|COUNTER[ -]?CLOCKWISE)\b/gi, ''));
    if (cw === ccw) return fail('圆弧方向缺失或相互冲突，未绘制。');
    const a = geodesic.Inverse(center.lat, center.lon, start.lat, start.lon);
    const b = geodesic.Inverse(center.lat, center.lon, end.lat, end.lon);
    for (const [p, inv] of [[start, a], [end, b]]) {
      const tolerance = coordinateRoundingMeters(center) + coordinateRoundingMeters(p) + 1;
      if (Math.abs(inv.s12 - radius) > tolerance) return fail(`圆弧原文冲突：半径 ${radius} 米，端点距圆心 ${inv.s12.toFixed(1)} 米，超过坐标取整容差 ${tolerance.toFixed(1)} 米；未猜测边界。`);
    }
    const sweep = ccw ? -((a.azi1 - b.azi1 + 360) % 360) : (b.azi1 - a.azi1 + 360) % 360;
    if (Math.abs(sweep) < 0.000001 || segments.has(ci - 1)) return fail('圆弧范围或连接关系不明确，未绘制。');
    const points = arcPoints(center, radius, a.azi1, sweep);
    // Preserve printed endpoints; the small join deviation stays within their
    // measured rounding bounds. Never change the authoritative coordinates.
    points[0] = [start.lon, start.lat]; points[points.length - 1] = [end.lon, end.lat];
    segments.set(ci - 1, {endIndex: ci + 1, points});
  }
  const ring = [];
  for (let i = 0; i < tokens.length; i++) {
    ring.push([tokens[i].lon, tokens[i].lat]);
    const segment = segments.get(i);
    if (segment) { ring.push(...segment.points.slice(1, -1)); i = segment.endIndex - 1; }
  }
  if (JSON.stringify(ring[0]) !== JSON.stringify(ring.at(-1))) ring.push([...ring[0]]);
  return success({type: 'Polygon', coordinates: [ring]}, 'WGS84 有向圆弧，端点与半径一致性检查');
}

// A corridor is a union of geodesic segment buffers, not a polygon through its
// centreline. Union preserves holes and handles sharp turns and self-crossings.
export function explicitCorridorBoundary(text, tokens) {
  const width = text.match(new RegExp('\\b' + distancePattern + '\\s+(?:ON\\s+)?(?:EITHER|EACH)\\s+SIDE\\s+(?:OF\\s+)?(?:A\\s+|THE\\s+)?(?:STRAIGHT\\s+)?(?:LINE|ROUTE|TRACK|CENT(?:ER|RE)\\s*LINE)\\b', 'i'))
    || text.match(new RegExp('\\bWITHIN\\s+' + distancePattern + '\\s+OF\\s+(?:THE\\s+)?TRACKLINES?\\s+JOINING\\b', 'i'))
    || text.match(new RegExp('\\b' + distancePattern + '\\s+WIDE\\s+(?:SEA\\s+)?(?:STRIP|ZONE|CORRIDOR)\\s+ALONG\\s+(?:THE\\s+)?CENT(?:RE|ER)LINE\\b', 'i'));
  if (!width) return null;
  const labels=[...text.matchAll(/(?:^|[\r\n])\s*[A-Z][.)]\s*(?=\d)/g)];
  if(labels.length>1&&tokens.every(t=>t.sourceIndex>=labels[0].index)){
    const groups=labels.map((m,i)=>tokens.filter(t=>t.sourceIndex>=m.index&&t.sourceIndex<(labels[i+1]?.index??text.length)));
    if(groups.every(g=>g.length>=2)){
      const parts=[];
      for(const [i,group] of groups.entries()){
        const a=labels[i].index,b=labels[i+1]?.index??text.length,prefix=text.slice(0,labels[0].index);
        const g=explicitCorridorBoundary(prefix+text.slice(a,b),group.map(t=>({...t,sourceIndex:t.sourceIndex-a+prefix.length,sourceEnd:t.sourceEnd-a+prefix.length})));
        if(!g?.geometry)return fail(g?.reason||'分段走廊不完整');
        parts.push(...(g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates));
      }
      return success({type:'MultiPolygon',coordinates:parts},'多条明确宽度的 WGS84 走廊，分别绘制');
    }
  }
  if (/\b(?:EXC|EXCEPT|EXCLUDING|VARIABLE|VARYING|LEFT|RIGHT|COASTLINE|SHORELINE)\b/i.test(text)) return fail('走廊存在额外边界条件，未用等宽走廊代替。');
  const halfWidth = meters(width[1], width[2]) / (/\bWIDE\b/i.test(width[0]) ? 2 : 1);
  if (!(halfWidth > 0 && halfWidth <= 100000)) return fail('走廊宽度超出支持范围，未绘制。');
  const before = tokens.filter(p => p.sourceEnd <= width.index);
  const path = before.length === tokens.length ? before : tokens.filter(p => p.sourceIndex >= width.index + width[0].length);
  if (path.length !== tokens.length || path.length < 2 || path.length > 200) return fail('走廊中心线坐标不完整或混有其他坐标，未绘制。');
  if (path.some(p => Math.abs(p.lat) >= 85)) return fail('走廊接近极点，当前投影不足以可靠绘制。');
  const lon0 = path[0].lon;
  const unwrapped = p => [lon0 + wrap(p[0] - lon0), p[1]];
  const parts = [];
  let totalLength = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const inv = geodesic.Inverse(a.lat, a.lon, b.lat, b.lon);
    if (inv.s12 < 0.01) continue;
    totalLength += inv.s12;
    if (totalLength > 3000000) return fail('走廊中心线过长，未进行不可靠的平面合并。');
    // Subdivide geodesic offsets to limit chord error. Round caps and joints
    // have <= min(1 m, width/100) radial error; normal offsets are ellipsoidal.
    const steps = Math.ceil(inv.s12 / 2000), left = [], right = [];
    for (let j = 0; j <= steps; j++) {
      const p = geodesic.Direct(a.lat, a.lon, inv.azi1, inv.s12 * j / steps);
      const center = {lat: p.lat2, lon: p.lon2};
      left.push(direct(center, p.azi2 - 90, halfWidth));
      right.push(direct(center, p.azi2 + 90, halfWidth));
    }
    const error = Math.min(1, halfWidth / 100);
    const endCap = arcPoints(b, halfWidth, inv.azi2 - 90, 180, error);
    const startCap = arcPoints(a, halfWidth, inv.azi1 + 90, 180, error);
    const ring = [...left, ...endCap.slice(1), ...right.reverse().slice(1), ...startCap.slice(1)].map(unwrapped);
    ring[ring.length - 1] = [...ring[0]];
    if (ring.some(p => Math.abs(p[0] - lon0) >= 170)) return fail('走廊跨度过大，未绘制。');
    parts.push([ring]);
  }
  if (!parts.length) return fail('走廊中心线没有有效长度，未绘制。');
  try {
    // Incremental union avoids the argument/spread limit for long centre lines.
    let result = [parts[0]];
    for (const part of parts.slice(1)) result = clipping.union(result, part);
    result = result.map(polygon => polygon.map(ring => ring.map(([lon, lat]) => [wrap(lon), lat])));
    const geometry = result.length === 1 ? {type: 'Polygon', coordinates: result[0]} : {type: 'MultiPolygon', coordinates: result};
    return success(geometry, `WGS84 测地线两侧各 ${halfWidth} 米走廊，交叠合并`);
  } catch { return fail('走廊边界合并失败，未绘制。'); }
}

// Maritime unqualified miles are nautical miles. Never use Q-line radii here:
// this function receives only a coordinate-bearing body section.
export function explicitRadialBoundary(text, tokens) {
  // A repeated correction confirming the identical centre adds no new boundary.
  // A different corrected position remains ambiguous and is never substituted.
  if (tokens.length === 2 && tokens[0].lat === tokens[1].lat && tokens[0].lon === tokens[1].lon
    && /\bLOCATION\s+CORRECTED\s+TO\s*$/i.test(String(text).slice(tokens[0].sourceEnd,tokens[1].sourceIndex))
    && (String(text).match(/\b(?:RADIUS|RDO)\b/gi)||[]).length === 1) tokens = [tokens[0]];
  const source = String(text).replace(/\b(?:EXC|EXCEPT|EXCLUDING)\s+(?:(?:ACFT|AIRCRAFT|SKED|CIV|MIL|MILITARY|SAR|HOSP|STATE|HEL|EMERG)\b)[^.\n]*/gi,' ')
    .replace(/\bEXCEPT\s+(?:PARTICIPATING\s+ACFT|WHEN\s+(?:AUTHORISED|AUTHORIZED|AUTORISED)\s+BY\s+ATC)[^.\n]*/gi,' ')
    .replace(/\bEXCEPT\s+(?:REAL\s+)?AIR\s+POLICING\b(?:[\s,]+(?:HUMANITARIAN|SAR|AND|EMERG|FLTS?|FLIGHTS?)\b)*/gi,' ')
    .replace(/\bSIZE\s*:[^\r\n]*\bDIAMETER\b/gi,' ')
    .replace(/\bDIAMETER\s*:?\s*\d+(?:\.\d+)?\s*(?:FT|FEET|IN|M)\b/gi,' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:FT|FEET|IN|INCHES?)\s+DIAMETER(?=\s+(?:ALUMINUM\s+)?(?:SPHERE|BALLOON))/gi,' ');
  if (tokens.length !== 1 || /\b(?:ARC|EXC|EXCEPT|EXCLUDING|DIAMETER|EITHER\s+SIDE|LIMITED\s+(?:(?:TO\s+(?:THE\s+)?(?:NORTH|SOUTH|EAST|WEST))|BY)|CLIPPED|INTERSECTION)\b/i.test(source)) return null;
  const point = tokens[0];
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) >= 90 || Math.abs(point.lon) > 180) return null;
  const unit = unitPattern;
  const distance = '(\\d+(?:\\.\\d+)?)\\s*' + unit + '\\b';
  const annulus = source.match(new RegExp('\\b(?:RADIUS|RADII)\\s*:?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:-|TO)\\s*(\\d+(?:\\.\\d+)?)\\s*' + unit + '\\b', 'i'));
  const match = source.match(new RegExp('\\b(?:WI(?:THIN)?\\s+(?:AN?\\s+)?(?:AREA\\s+)?)' + distance + '\\s+(?:OF|RADIUS)\\b', 'i'))
    || source.match(new RegExp('\\b(?:RADIUS|RDO)\\s*:?\\s*(?:OF\\s+)?' + distance, 'i'))
    || source.match(new RegExp('\\b' + distance + '\\s*(?:OF\\s+)?(?:RADIUS|RDO)\\b', 'i'));
  if (!match && !annulus) return null;
  const units = (annulus?.[3] || match[2]).toUpperCase();
  const scale = meters(1,units);
  const radius = Number(annulus?.[2] || match[1]) * scale;
  const inner = annulus ? Number(annulus[1]) * scale : 0;
  if (!(radius > 0 && radius <= 2000000)) return null;
  if (radius >= geodesic.Inverse(point.lat, point.lon, point.lat < 0 ? -90 : 90, point.lon).s12) return {boundaryError: '圆形范围跨越极点，当前绘图投影尚不能可靠处理，未绘制。'};
  if (inner < 0 || inner >= radius) return null;
  const sector = source.match(/\b(?:(?:BETWEEN|BTN)\s+(?:(?:AZM|AZIMUTHS?|BEARINGS?)\s+)?|(?:AZM|AZIMUTHS?|BEARINGS?)\s+)(\d{1,3}(?:\.\d+)?)\s*(?:DEG(?:REES)?|°)?\s*(?:AND|TO|-)\s*(\d{1,3}(?:\.\d+)?)\s*(?:DEG(?:REES)?|°)/i)
    || source.match(/\b(?:BETWEEN|BTN)\s+HEADINGS?\s+(\d{1,3}(?:\.\d+)?)\s*(?:DEG|°)?\s*(?:AND|TO|-)\s*(\d{1,3}(?:\.\d+)?)(?![\d.])/i);
  if (/\b(?:(?:DANGER|FIRING|CIRCULAR)\s+SECTOR|SECTOR\s+(?:FROM|BETWEEN|BTN)|AZM|AZIMUTHS?|BEARINGS?)\b/i.test(source) && !sector) return null;
  let start = sector ? Number(sector[1]) : 0;
  let end = sector ? Number(sector[2]) : 360;
  if (start > 360 || end > 360 || start === end) return null;
  if (end < start) end += 360;
  // Keep radial chord error below 10 m (and angular steps <= 5 degrees).
  // Small activity circles need far fewer vertices than large oceanic areas;
  // a fixed 360 points per circle exhausts the free server on a global cache.
  const maxStep = Math.min(5, 2 * Math.acos(1 - Math.min(10 / radius, 1)) * 180 / Math.PI);
  const count = Math.ceil((end - start) / maxStep);
  const ring = sector && !inner ? [[point.lon, point.lat]] : [];
  for (let i = 0; i <= count; i++) {
    const p = geodesic.Direct(point.lat, point.lon, start + (end - start) * i / count, radius);
    ring.push([p.lon2, p.lat2]);
  }
  if (!sector) ring.pop();
  if (sector && inner) ring.push(...arcPoints(point, inner, end, start - end, 10));
  ring.push([...ring[0]]);
  const hole = inner && !sector ? arcPoints(point, inner, 360, -360, 10) : null;
  if (hole) hole[hole.length - 1] = [...hole[0]];
  return { type: 'Polygon', coordinates: hole ? [ring, hole] : [ring], boundaryRadiusMeters: radius, boundaryCenter: { lat: point.lat, lon: point.lon } };
}

// Multiple explicit centres sharing one radius. The intervening text must be
// only list punctuation/labels; a route or a polygon must never become circles.
export function explicitCircleList(text, tokens) {
  if (tokens.length < 2 || /\b(?:ARC|SECTOR|EXC|EXCEPT|EXCLUDING|EITHER|TRACK|LINE|BOUNDED|LIMITED|DIAMETER)\b/i.test(text)) return null;
  // Chilean notices enumerate named sites, each with its own radius and centre.
  // Require an exact one-to-one relationship; unrelated coordinates are not circles.
  const sites=[...text.matchAll(new RegExp("(?:^|[\\r\\n])\\s*SECT[ \\t]+[A-Z][A-Z0-9 '/\\-]{0,65}[ \\t]+RDO[ \\t]+"+distancePattern+'[ \\t]+CENT(?:RED|ERED)[ \\t]+ON[ \\t]*','gi'))];
  if (sites.length === tokens.length && sites.every((m,i)=>m.index+m[0].length<=tokens[i].sourceIndex
      && !text.slice(m.index+m[0].length,tokens[i].sourceIndex).trim()
      && (!sites[i+1]||tokens[i].sourceEnd<=sites[i+1].index))) {
    const circles=tokens.map((p,i)=>explicitRadialBoundary(`RADIUS ${sites[i][1]} ${sites[i][2]}`,[p]));
    if(circles.every(p=>p&&!p.boundaryError))return success({type:'MultiPolygon',coordinates:circles.map(p=>p.coordinates)},'具名地点逐项提供半径和圆心，按 WGS84 分别绘制');
  }
  const prefix=text.slice(0,tokens[0].sourceIndex);
  const safety=prefix.match(new RegExp('\\bSAFETY\\s+ZONES\\s+OF\\s+'+distancePattern+'\\s+ESTABLISHED\\s+AROUND\\s+SPMS\\s+IN\\s+FOLLOWING\\s+POSITIONS\\s*:\\s*SPM\\d+\\s*$','i'));
  if(safety && tokens.every((p,i)=>!i || /^\s*SPM\d+\s*$/i.test(text.slice(tokens[i-1].sourceEnd,p.sourceIndex)))) {
    const circles=tokens.map(p=>explicitRadialBoundary(`RADIUS ${safety[1]} ${safety[2]}`,[p]));
    if(circles.every(p=>p&&!p.boundaryError))return success({type:'MultiPolygon',coordinates:circles.map(p=>p.coordinates)},'以通告明确的 SPM 位置和安全距离分别绘制安全区');
  }
  const shared=prefix.match(new RegExp('\\b(?:WI(?:THIN)?\\s+(?:AN?\\s+)?(?:AREAS?\\s+)?)'+distancePattern+'\\s+(?:RADIUS\\s+)?OF\\s*:?\\s*(?:[A-Z][.)]\\s*)?$', 'i'))
    || prefix.match(new RegExp('\\bRADIUS\\s+(?:OF\\s+)?'+distancePattern+'\\s+(?:FM|FROM)\\s+(?:FLW|FOLLOWING)\\s+COORD(?:S|INATES)?\\s*:\\s*(?:1[.)]\\s*)?$','i'))
    || prefix.match(new RegExp('\\b'+distancePattern+'\\s+RADIUS\\s+CENT(?:RED|ERED)\\s+ON\\s+(?:COORD(?:S|INATES)?\\s+)?AS\\s+FLW\\s*:\\s*(?:1[.)]\\s*|-\\s*)?$', 'i'))
    || prefix.match(new RegExp('\\b'+distancePattern+'\\s+RADIUS\\s+WI\\s+COORD(?:S|INATES)?\\s+AS\\s+FLW\\s*:\\s*-\\s*$', 'i'))
    || text.slice(tokens.at(-1).sourceEnd).match(new RegExp('^\\s*\\)?\\s*WI(?:THIN)?\\s+'+distancePattern+'\\s+RADIUS\\b','i'));
  if(!shared) return null;
  for(let i=1;i<tokens.length;i++)if(!/^[\s,，、;；.()\/-]*(?:(?:AND|[A-Z][.)]|\d+[.)])\s*)?$/i.test(text.slice(tokens[i-1].sourceEnd,tokens[i].sourceIndex).replace(/\([A-Z][A-Z0-9 '\/-]{0,80}\)/gi,'')))return null;
  const polygons=tokens.map(p=>explicitRadialBoundary(`RADIUS ${shared[1]} ${shared[2]}`,[p]));
  const bad=polygons.find(p=>!p||p.boundaryError);
  return bad ? fail(bad?.boundaryError||'圆心或半径不完整') : success({type:'MultiPolygon',coordinates:polygons.map(p=>p.coordinates)},'正文多个圆心共用明确半径，逐一按 WGS84 绘制');
}

export function explicitLabeledCircles(text,tokens){
  if(!/\bAREAS?\s+WITHIN\s*:/i.test(text))return null;
  const labels=[...text.matchAll(/(?:^|[\r\n])\s*[A-Z][.)]\s*(?=\d+(?:\.\d+)?\s*(?:MILES?|NM|KM|METERS?|METRES?)\b)/gi)];
  if(labels.length<1)return null;
  const parts=[];
  for(const [i,label] of labels.entries()){
    const end=labels[i+1]?.index??text.length,group=tokens.filter(p=>p.sourceIndex>=label.index&&p.sourceIndex<end);
    if(group.length!==1)return fail('各圆形条目未提供唯一圆心');
    const clause=text.slice(label.index,end).replace(/^\s*[A-Z][.)]\s*/i,'WITHIN ');
    const g=explicitRadialBoundary(clause,group);if(!g||g.boundaryError)return fail(g?.boundaryError||'各圆形条目的半径无法确定');parts.push(g.coordinates);
  }
  if(tokens.length!==parts.length)return fail('圆形清单混有未归属坐标');
  return success({type:'MultiPolygon',coordinates:parts},'逐项明确半径的圆形清单，按 WGS84 分别绘制');
}

export function explicitSharedSectors(text,tokens){
  // One centre with separate, explicitly altitude-labelled radii. Preserve
  // each boundary; choosing only the first would hide the lower-altitude rings.
  if(tokens.length===1 && /\bCENT(?:RED|ERED)\s+ON\s+PSN\s*:/i.test(text)
    && !/\b(?:ARC|EXC|EXCEPT|EXCLUDING|LIMITED|DIAMETER)\b/i.test(text)) {
    const radii=[...text.matchAll(new RegExp('(?:^|[\\r\\n])\\s*-\\s*'+distancePattern+'\\s+RADIUS\\s+AT\\s+(?:FL\\s*\\d+|\\d+\\s*FT)\\b','gi'))];
    if(radii.length>1 && (text.match(/\bRADIUS\b/gi)||[]).length===radii.length) {
      const circles=radii.map(m=>explicitRadialBoundary(`RADIUS ${m[1]} ${m[2]}`,tokens));
      if(circles.every(p=>p&&!p.boundaryError))return success({type:'MultiPolygon',coordinates:circles.map(p=>p.coordinates)},'同一圆心按原文各高度对应的半径分别绘制；高度对应关系见原文');
    }
  }
  if(tokens.length===1&&/\bAREA\s+CENTERED\s+(?:OF|ON)\b/i.test(text)){
    const m=text.match(new RegExp('RADIUS\\s*'+distancePattern+'\\s+AND\\s+COVERING\\s+BEARINGS\\s+FROM\\s*(\\d+(?:\\.\\d+)?)\\s*DEG(?:REE)?S?\\s+TO\\s*(\\d+(?:\\.\\d+)?)\\s*DEG(?:REE)?S?\\s+RADIUS\\s*'+distancePattern,'i'));
    if(m){
      const parts=[explicitRadialBoundary(`RADIUS ${m[1]} ${m[2]}`,tokens),explicitRadialBoundary(`RADIUS ${m[5]} ${m[6]} AZM ${m[3]}-${m[4]} DEG`,tokens)];
      if(parts.every(p=>p&&!p.boundaryError))return success({type:'MultiPolygon',coordinates:parts.map(p=>p.coordinates)},'明确共用圆心的圆形与扇形，分别按 WGS84 绘制');
      return fail('共用圆心的圆形或扇形参数无效');
    }
  }
  if(tokens.length!==1||!/\bSECTOR\s+FROM\s+(?:THE\s+)?LAUNCHER\b/i.test(text))return null;
  const markers=[...text.matchAll(/\([A-Z]\)\s*(?=RADIUS|BETWEEN\s+RADII)/gi)];
  if(!markers.length)return null;
  const parts=[];
  for(const [i,m]of markers.entries()){
    let s=text.slice(m.index,markers[i+1]?.index??text.length);
    s=s.replace(/BETWEEN\s+RADII\s+OF\s+(\d+(?:\.\d+)?)\s*(NM|KM|M)\s+AND\s+(\d+(?:\.\d+)?)\s*\2\b/i,'RADIUS $1-$3$2')
      .replace(/\bAZIMUTH\s+(\d{1,3}(?:\.\d+)?)\s+AND\s+(\d{1,3}(?:\.\d+)?)(?![\d.])/i,'AZM $1-$2 DEG');
    const g=explicitRadialBoundary(s,tokens);if(!g||g.boundaryError)return fail(g?.boundaryError||'共用圆心的扇形半径或方位不完整');parts.push(g.coordinates);
  }
  return success({type:'MultiPolygon',coordinates:parts},'共用发射点的扇形与环形扇区，分别按 WGS84 绘制');
}

// Isolate Chinese fixed-centre circles and explicit-width corridors. Consumed
// coordinates are blanked before the polygon parser, preserving source offsets.
export function extractChinesePrimitives(text, extractTokens) {
  const polygons=[],rejected=[],spans=[];
  const unitMap={'米':'M','公尺':'M','公里':'KM','千米':'KM','海里':'NM'};
  const quantity='(\\d+(?:\\.\\d+)?)\\s*(海里|公里|千米|公尺|米|NM|KM|M)';
  const radiusRe=new RegExp('^\\s*[，,、]?\\s*(?:半径\\s*(?:为|是)?\\s*'+quantity+'|(?:以\\s*)?'+quantity+'\\s*为半径|'+quantity+'(?=\\s*(?:范围|水域)))','i');
  const tokens=extractTokens(text);
  const number=v=>/^\d+$/.test(v)?Number(v):({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10})[v];
  const add=(group,r,bearing=null)=>{
    const value=r[1]||r[3]||r[5],unit=r[2]||r[4]||r[6];
    for(const token of group){
      const g=explicitRadialBoundary(`RADIUS ${value} ${unitMap[unit]||unit}${bearing?` AZM ${bearing[1]}-${bearing[2]} DEG`:''}`,[token]);
      if(!g||g.boundaryError)rejected.push(g?.boundaryError||'圆形坐标或半径无效');else{g.boundaryMethod='中文明确圆心、半径及方位，按 WGS84 绘制';polygons.push(g);}
    }
  };
  for(const marker of text.matchAll(/为\s*(?:圆心|中心)/g)) {
    const prefix=text.slice(0,marker.index);
    const reference=prefix.match(/上述\s*([一二三四五六七八九十]|\d+)\s*(?:个)?(?:坐标)?点\s*$/);
    const last=tokens.findLastIndex(t=>t.sourceEnd<=marker.index&&(reference||/^\s*(?:(?:[一二三四五六七八九十\d]+\s*(?:个)?(?:坐标)?)?点)?\s*(?:[（(][^()（）]{0,40}(?:坐标系|CGCS2000)[^()（）]{0,40}[）)])?\s*$/.test(text.slice(t.sourceEnd,marker.index))));
    if(last<0)continue; // Moving vessel centres have no fixed coordinate.
    const tail=text.slice(marker.index+marker[0].length);
    const bearing=tail.match(/^\s*[,，]?\s*方位\s*(\d+(?:\.\d+)?)\s*[°度]\s*[-至~～]\s*(\d+(?:\.\d+)?)\s*[°度]\s*[,，]?/);
    const r=tail.slice(bearing?.[0].length||0).match(radiusRe);
    let first=last;
    if(reference)first=last-number(reference[1])+1;
    else while(first>0&&/^[\s,，、;；及和]+$/.test(text.slice(tokens[first-1].sourceEnd,tokens[first].sourceIndex)))first--;
    const end=marker.index+marker[0].length+(bearing?.[0].length||0)+(r?.[0].length||0);
    if(first<0){rejected.push('引用的圆心数量超过原文坐标数');continue;}
    spans.push([tokens[first].sourceIndex,end]);
    const declared=text.slice(tokens[last].sourceEnd,marker.index).match(/([一二三四五六七八九十]|\d+)\s*(?:个)?(?:坐标)?点\s*$/)?.[1];
    if(declared&&number(declared)!==last-first+1){rejected.push('原文声明的圆心数量与坐标数量不一致，未猜测缺失圆心');continue;}
    if(!r){rejected.push('圆形区域缺少可识别的半径和单位');continue;}
    add(tokens.slice(first,last+1),r,bearing);
  }
  // A radius can precede an explicitly introduced list of centre coordinates.
  const beforeList=new RegExp('(?:以下列|下列|以下)各点为圆心\\s*[,，]?\\s*'+quantity+'\\s*为半径[\\s\\S]{0,90}?各点坐标如下\\s*[:：]?','gi');
  for(const m of text.matchAll(beforeList)){
    const start=m.index+m[0].length,tail=text.slice(start),stop=tail.search(/希各|注意事项|备注|区域\s*[一二三\d]/);
    const end=stop<0?text.length:start+stop,group=tokens.filter(t=>t.sourceIndex>=start&&t.sourceEnd<=end&&!spans.some(([a,b])=>t.sourceIndex>=a&&t.sourceEnd<=b));
    if(!group.length)continue;
    add(group,[m[0],m[1],m[2]]);spans.push([m.index,group.at(-1).sourceEnd]);
  }
  const corridor=new RegExp('(?:连线|线路|测线)\\s*(?:两侧|每侧)\\s*(?:各\\s*)?'+quantity,'gi');
  for(const marker of text.matchAll(corridor)){
    const last=tokens.findLastIndex(t=>t.sourceEnd<=marker.index&&/^\s*$/.test(text.slice(t.sourceEnd,marker.index)));
    if(last<1)continue;
    let first=last;while(first>0&&/^[\s,，、;；及和-]+$/.test(text.slice(tokens[first-1].sourceEnd,tokens[first].sourceIndex)))first--;
    const path=tokens.slice(first,last+1), start=path[0].sourceIndex,end=marker.index+marker[0].length;
    const normalized=`${marker[1]} ${unitMap[marker[2]]||marker[2]} EITHER SIDE OF A LINE `+path.map(t=>t.matchedText).join(' ');
    const g=explicitCorridorBoundary(normalized,extractTokens(normalized));
    spans.push([start,end]);
    if(!g?.geometry)rejected.push(g?.reason||'走廊中心线不完整');else for(const p of g.geometry.type==='Polygon'?[g.geometry.coordinates]:g.geometry.coordinates)polygons.push({type:'Polygon',coordinates:p,boundaryMethod:g.method});
  }
  let remaining=text;for(const [a,b] of spans.sort((a,b)=>b[0]-a[0]))remaining=remaining.slice(0,a)+' '.repeat(b-a)+remaining.slice(b);
  return {remaining,polygons,rejected};
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
