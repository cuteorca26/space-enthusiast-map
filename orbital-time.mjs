const EXPLICIT_TIME_ZONE = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const UTC_EPOCH_WITHOUT_ZONE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?$/;

export function parseGpEpochUtc(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  if (EXPLICIT_TIME_ZONE.test(text)) return Date.parse(text);

  const match = text.match(UTC_EPOCH_WITHOUT_ZONE);
  if (!match) return NaN;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = ""] = match;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  const millisecond = Number(fractionText.slice(0, 3).padEnd(3, "0"));
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const check = new Date(timestamp);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
    || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) {
    return NaN;
  }
  return timestamp;
}

export function normalizeGpEpochUtc(value) {
  const timestamp = parseGpEpochUtc(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}
