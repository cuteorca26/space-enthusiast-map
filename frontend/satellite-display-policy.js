(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NotamSatelliteDisplay = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const ranges = Object.freeze({ orbitLineWidth: [0.1, 20, 1.5], pointSize: [0.5, 64, 7], labelSize: [4, 72, 12], imagingOpacity: [0, 3, 0.45], communicationOpacity: [0, 3, 0.45], communicationAngle: [0, 90, 25] });
  const components = Object.freeze(['orbits', 'labels', 'points', 'communications', 'imaging']);
  function normalize(key, value, fallback = ranges[key][2]) {
    const [min, max] = ranges[key];
    const number = value === null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }
  function angleMode(value) { return ['elevation', 'offNadir'].includes(value) ? value : 'profile'; }
  function allowed(id, component, picked, only) { return !only[component] || picked.has(String(id)); }
  function filter(ids, component, picked, only) { return only[component] ? ids.filter(id => picked.has(String(id))) : ids; }
  // Preserve the former 5–100% appearance; extend smoothly to invisible and to 300%.
  function extendAlpha(strength, legacyAlpha, ceiling = 0.98) {
    const amount = normalize('imagingOpacity', strength);
    const alpha = Math.max(0, Math.min(1, legacyAlpha));
    if (amount < 0.05) return alpha * amount / 0.05;
    if (amount <= 1) return alpha;
    return alpha + (Math.max(alpha, ceiling) - alpha) * (amount - 1) / 2;
  }
  function envelope(payloads, profile, altitudeKm, mode, angle) {
    mode = angleMode(mode);
    if (mode === 'profile') return payloads.communicationEnvelope(profile, altitudeKm);
    if (profile?.kind !== 'communications' || !(Number(altitudeKm) > 0)) return null;
    const value = normalize('communicationAngle', angle);
    const offNadir = mode === 'offNadir';
    const radiusKm = offNadir ? payloads.communicationRadiusFromOffNadirKm(altitudeKm, value)
      : value === 90 ? 0 : payloads.communicationRadiusKm(altitudeKm, value);
    const elevation = offNadir ? payloads.groundElevationFromOffNadirDeg(altitudeKm, value) : value;
    return { custom: true, model: mode, radiusKm, radiusMinKm: radiusKm, radiusMaxKm: radiusKm,
      minElevationDeg: elevation, minElevationMinDeg: elevation, minElevationMaxDeg: elevation,
      offNadirDeg: offNadir ? value : null, offNadirMinDeg: offNadir ? value : null, offNadirMaxDeg: offNadir ? value : null };
  }
  return Object.freeze({ ranges, components, normalize, angleMode, allowed, filter, extendAlpha, envelope });
});
