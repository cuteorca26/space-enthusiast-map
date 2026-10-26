const DAY = 86400000;
const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const iso = value => new Date(value).toISOString();

export function validIcaoDate(value) {
  if (!/^\d{10}$/.test(value || '')) return null;
  const y = Number(value.slice(0, 2)), year = y >= 70 ? 1900 + y : 2000 + y;
  const month = Number(value.slice(2, 4)), date = Number(value.slice(4, 6));
  const hour = Number(value.slice(6, 8)), minute = Number(value.slice(8, 10));
  const d = new Date(Date.UTC(year, month - 1, date, hour, minute));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== date || hour > 23 || minute > 59) return null;
  return d.toISOString();
}

function numericSet(text, max, min = 1) {
  const clean = text.replace(/\bAND\b/g, ' ').replace(/,/g, ' ').trim();
  if (!/^\d{1,2}(?:-\d{1,2})?(?:\s+\d{1,2}(?:-\d{1,2})?)*$/.test(clean)) return null;
  const values = new Set();
  for (const part of clean.split(/\s+/)) {
    const [a, b = a] = part.split('-').map(Number);
    if (a < min || b > max || b < a) return null;
    for (let i = a; i <= b; i++) values.add(i);
  }
  return values;
}

function selector(text, context, begin, end) {
  const clean = text.replace(/^[\s,;]+|[\s,;]+$/g, '').replace(/\bAND\b/g, ',');
  if (!clean) return context.last || (() => true);
  if (/^(?:DAILY|DLY|H24)$/.test(clean)) { context.month = null; return () => true; }
  if (days.some(d => clean.includes(d))) {
    const selected = new Set();
    const remaining = clean.replace(/\b(SUN|MON|TUE|WED|THU|FRI|SAT)(?:\s*-\s*(SUN|MON|TUE|WED|THU|FRI|SAT))?\b/g, (_, first, last) => {
      let n = days.indexOf(first), stop = days.indexOf(last || first);
      selected.add(n);
      for (let i = 0; n !== stop && i < 7; i++) { n = (n + 1) % 7; selected.add(n); }
      return '';
    });
    if (remaining.replace(/[\s,;]/g, '')) return null;
    context.month = null;
    return date => selected.has(date.getUTCDay());
  }
  let dayText = clean;
  const m = clean.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+/);
  if (m) { context.month = months.indexOf(m[1]); dayText = clean.slice(m[0].length); }
  // An unqualified date over several months is ambiguous; never repeat it
  // monthly just because the NOTAM validity extends for a long time.
  if (!m && context.month == null && new Date(begin).getUTCMonth() !== new Date(end).getUTCMonth()) return null;
  const selected = numericSet(dayText, 31);
  if (!selected) return null;
  const month = context.month ?? new Date(begin).getUTCMonth();
  const year = new Date(begin).getUTCFullYear() + (month < new Date(begin).getUTCMonth() ? 1 : 0);
  if ([...selected].some(day => new Date(Date.UTC(year, month, day)).getUTCMonth() !== month)) return null;
  return date => date.getUTCFullYear() === year && date.getUTCMonth() === month && selected.has(date.getUTCDate());
}

// Deliberately all-or-nothing: a partly understood D field must not claim
// precise times. Solar times, holidays and unrecognized syntax retain the raw
// text and broad B/C validity with an explicit uncertainty label.
export function parseNotamSchedule(raw, beginsAt, endsAt, activityText = '') {
  const unknown = reason => ({timeIntervals: [], scheduleParsed: false, scheduleStatus: 'unresolved', scheduleRawText: raw,
    scheduleReason: reason, scheduleLabel: `活动时段尚未完整解析（UTC 原文）：${raw}；${reason}`});
  // D) may only give an outer daily window. A conditional activation notice in
  // E) must not be silently presented as a confirmed daily active interval.
  const conditional = String(activityText || '').replace(/\s+/g, ' ').match(/\b(?:CAN|MAY)\s+BE\s+ACT(?:IVATED)?\s+WITH\s+\d+\s*(?:MIN(?:UTES)?|HR|HOURS?)\s+NOTICE[^.\n]*/i);
  if (conditional) {
    const result = unknown(`正文包含有条件启用要求，需核对原通告：${conditional[0].slice(0, 240)}`);
    result.scheduleRawText = [raw, conditional[0]].filter(Boolean).join('；');
    return result;
  }
  const bodyException = String(activityText || '').match(/\bEXC\s+ON\s+20\d{2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\b/i);
  if (bodyException) return unknown(`正文另有排除日期，不能仅按 D 栏认定活动时段：${bodyException[0].replace(/\s+/g, ' ')}`);
  if (!raw) return {timeIntervals: [], scheduleParsed: false, scheduleStatus: 'none'};
  const begin = Date.parse(beginsAt), end = Date.parse(endsAt);
  if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin || end - begin > 2 * 366 * DAY) return unknown('起止日期不完整或跨度超过支持范围');
  let text = raw.toUpperCase().replace(/[\u2013\u2014]/g, '-').replace(/\b(\d{4})\/(\d{4})\b/g,'$1-$2').replace(/\b(?:TO|THRU)\b/g, '-').replace(/\s*-\s*/g, '-').replace(/\bUTC\b/g, '').replace(/\s+/g, ' ').trim();
  if (text === 'H24') text = 'DAILY 0000-2400';
  let exclude = null;
  const exception = text.match(/\b(?:EXC|EXCEPT|EXCLUDING)\s+(.+)$/);
  if (exception) {
    exclude = selector(exception[1], {}, begin, end);
    if (!exclude) return unknown('无法确定排除日期或节假日');
    text = text.slice(0, exception.index).trim();
  }
  const windows = [...text.matchAll(/\b(\d{4})-(\d{4})\b/g)];
  if (!windows.length) return unknown('缺少可确定的每日开始和结束时间');
  const context = {}, rules = [];
  let previous = 0;
  for (const window of windows) {
    const filter = selector(text.slice(previous, window.index), context, begin, end);
    if (!filter) return unknown('日期或星期表达式尚不支持');
    const minutes = value => {
      const h = Number(value.slice(0, 2)), m = Number(value.slice(2));
      return m < 60 && h <= 24 && (h !== 24 || m === 0) ? h * 60 + m : NaN;
    };
    const start = minutes(window[1]), stop = minutes(window[2]);
    if (!Number.isFinite(start) || !Number.isFinite(stop) || start === 1440 || start === stop) return unknown('每日时间值无效或含糊');
    rules.push({filter, start, stop: stop < start ? stop + 1440 : stop});
    context.last = filter; previous = window.index + window[0].length;
  }
  if (text.slice(previous).replace(/[\s,;.]/g, '')) return unknown('时间表含有尚未解析的附加条件');
  const intervals = [];
  // Include the preceding UTC day for a night window that crosses B)'s start.
  for (let day = Math.floor(begin / DAY) * DAY - DAY; day <= end; day += DAY) {
    const date = new Date(day);
    if (exclude?.(date)) continue;
    for (const rule of rules) if (rule.filter(date)) {
      const start = Math.max(begin, day + rule.start * 60000), stop = Math.min(end, day + rule.stop * 60000);
      if (stop > start) intervals.push({start: iso(start), end: iso(stop)});
    }
  }
  intervals.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const merged = [];
  for (const next of intervals) {
    const prior = merged.at(-1);
    if (prior && next.start <= prior.end) prior.end = prior.end > next.end ? prior.end : next.end;
    else merged.push({...next});
  }
  const beijing = value => iso(Date.parse(value) + 8 * 3600000).slice(0, 16).replace('T', ' ');
  const shown = merged.length > 4 ? [...merged.slice(0, 3), merged.at(-1)] : merged;
  const label = shown.map((r, i) => `${merged.length > 4 && i === 3 ? '…最后：' : ''}${beijing(r.start)} 至 ${beijing(r.end)}`).join('；');
  return {timeIntervals: merged, scheduleParsed: true, scheduleStatus: 'parsed', scheduleRawText: raw,
    scheduleLabel: `活动时段（UTC）：${raw}；已解析 ${merged.length} 个实际时段`,
    beijingTimeLabel: `北京时间，共 ${merged.length} 个活动时段：${label || '起止日期内没有符合条件的时段'}`};
}
