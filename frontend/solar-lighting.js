(function attachSolarLighting(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NotamSolarLighting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSolarLightingApi() {
  "use strict";

  const DEG = Math.PI / 180;
  const JULIAN_UNIX_EPOCH = 2440587.5;
  const JULIAN_J2000 = 2451545.0;
  const MS_PER_DAY = 86400000;

  function solarState(timeMs) {
    const utcMs = Number(timeMs);
    if (!Number.isFinite(utcMs)) return null;
    const jdUt1 = utcMs / MS_PER_DAY + JULIAN_UNIX_EPOCH;
    const decimalYear = utcDecimalYear(utcMs);
    const deltaTSeconds = estimateDeltaTSeconds(decimalYear);
    const jdTt = jdUt1 + deltaTSeconds / 86400;
    const t = (jdTt - JULIAN_J2000) / 36525;

    const meanLongitudeDeg = normalizeDegrees360(280.4664567 + 36000.76983 * t + 0.0003032 * t * t);
    const meanAnomalyDeg = normalizeDegrees360(
      357.5291092 + 35999.0502909 * t - 0.0001536 * t * t + t * t * t / 24490000,
    );
    const eccentricity = 0.016708634 - 0.000042037 * t - 0.0000001267 * t * t;
    const meanAnomalyRad = meanAnomalyDeg * DEG;
    const equationOfCenterDeg =
      (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(meanAnomalyRad)
      + (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomalyRad)
      + 0.000289 * Math.sin(3 * meanAnomalyRad);
    const trueLongitudeDeg = meanLongitudeDeg + equationOfCenterDeg;
    const trueAnomalyRad = (meanAnomalyDeg + equationOfCenterDeg) * DEG;
    const distanceAu = 1.000001018 * (1 - eccentricity * eccentricity)
      / (1 + eccentricity * Math.cos(trueAnomalyRad));

    const nutation = nutationAndObliquity(t, meanLongitudeDeg);
    const apparentLongitudeDeg = trueLongitudeDeg
      + nutation.longitudeDeg
      - 20.4898 / (3600 * distanceAu);
    const apparentLongitudeRad = apparentLongitudeDeg * DEG;
    const trueObliquityRad = nutation.trueObliquityDeg * DEG;
    const rightAscensionDeg = normalizeDegrees360(Math.atan2(
      Math.cos(trueObliquityRad) * Math.sin(apparentLongitudeRad),
      Math.cos(apparentLongitudeRad),
    ) / DEG);
    const declinationDeg = Math.asin(
      Math.sin(trueObliquityRad) * Math.sin(apparentLongitudeRad),
    ) / DEG;

    const centuriesUt1 = (jdUt1 - JULIAN_J2000) / 36525;
    const gmstDeg = normalizeDegrees360(
      280.46061837
      + 360.98564736629 * (jdUt1 - JULIAN_J2000)
      + 0.000387933 * centuriesUt1 * centuriesUt1
      - centuriesUt1 * centuriesUt1 * centuriesUt1 / 38710000,
    );
    const gastDeg = normalizeDegrees360(
      gmstDeg + nutation.longitudeDeg * Math.cos(trueObliquityRad),
    );
    const subsolarLongitudeDeg = normalizeDegreesSigned(rightAscensionDeg - gastDeg);
    const subsolarLatitudeDeg = declinationDeg;
    const direction = lonLatToSceneUnitVector(subsolarLongitudeDeg, subsolarLatitudeDeg);

    return Object.freeze({
      timeMs: utcMs,
      julianDayUt1: jdUt1,
      julianDayTt: jdTt,
      deltaTSeconds,
      distanceAu,
      rightAscensionDeg,
      declinationDeg,
      greenwichMeanSiderealTimeDeg: gmstDeg,
      greenwichApparentSiderealTimeDeg: gastDeg,
      subsolarLongitudeDeg,
      subsolarLatitudeDeg,
      direction,
    });
  }

  function nutationAndObliquity(t, meanSolarLongitudeDeg) {
    const moonMeanLongitudeDeg = normalizeDegrees360(218.3165 + 481267.8813 * t);
    const ascendingNodeDeg = normalizeDegrees360(
      125.04452 - 1934.136261 * t + 0.0020708 * t * t + t * t * t / 450000,
    );
    const solarLongitudeRad = meanSolarLongitudeDeg * DEG;
    const moonLongitudeRad = moonMeanLongitudeDeg * DEG;
    const nodeRad = ascendingNodeDeg * DEG;
    const longitudeArcsec =
      -17.20 * Math.sin(nodeRad)
      - 1.32 * Math.sin(2 * solarLongitudeRad)
      - 0.23 * Math.sin(2 * moonLongitudeRad)
      + 0.21 * Math.sin(2 * nodeRad);
    const obliquityArcsec =
      9.20 * Math.cos(nodeRad)
      + 0.57 * Math.cos(2 * solarLongitudeRad)
      + 0.10 * Math.cos(2 * moonLongitudeRad)
      - 0.09 * Math.cos(2 * nodeRad);
    const meanObliquityArcsec = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
    const meanObliquityDeg = 23 + 26 / 60 + meanObliquityArcsec / 3600;
    return {
      longitudeDeg: longitudeArcsec / 3600,
      trueObliquityDeg: meanObliquityDeg + obliquityArcsec / 3600,
    };
  }

  function estimateDeltaTSeconds(decimalYear) {
    const year = Number(decimalYear);
    if (!Number.isFinite(year)) return 69;
    if (year >= 2005 && year < 2050) {
      const t = year - 2000;
      return 62.92 + 0.32217 * t + 0.005589 * t * t;
    }
    if (year >= 2050 && year <= 2150) {
      return -20 + 32 * ((year - 1820) / 100) ** 2 - 0.5628 * (2150 - year);
    }
    if (year >= 1986 && year < 2005) {
      const t = year - 2000;
      return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
        + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
    }
    if (year >= 1900 && year < 1986) {
      const t = year - 1900;
      return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
    }
    if (year >= 1800 && year < 1900) {
      const t = year - 1800;
      return 13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3
        - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5 - 0.0000001699 * t ** 6
        + 0.000000000875 * t ** 7;
    }
    const centuries = (year - 1820) / 100;
    return -20 + 32 * centuries * centuries;
  }

  function utcDecimalYear(timeMs) {
    const date = new Date(timeMs);
    const year = date.getUTCFullYear();
    const start = Date.UTC(year, 0, 1);
    const end = Date.UTC(year + 1, 0, 1);
    return year + (timeMs - start) / (end - start);
  }

  function lonLatToSceneUnitVector(longitudeDeg, latitudeDeg) {
    const longitude = Number(longitudeDeg) * DEG;
    const latitude = Number(latitudeDeg) * DEG;
    const cosLatitude = Math.cos(latitude);
    return Object.freeze({
      x: cosLatitude * Math.sin(longitude),
      y: Math.sin(latitude),
      z: cosLatitude * Math.cos(longitude),
    });
  }

  function normalizeDegrees360(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function normalizeDegreesSigned(value) {
    return ((Number(value) + 540) % 360) - 180;
  }

  return Object.freeze({
    solarState,
    estimateDeltaTSeconds,
    lonLatToSceneUnitVector,
    normalizeDegrees360,
    normalizeDegreesSigned,
  });
});
