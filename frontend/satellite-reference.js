(function attachSatelliteReference(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatelliteReference = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createSatelliteReference() {
  "use strict";

  const J2000_UTC_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
  const EARTH_ROTATION_RAD_S = 7.29211514670698e-5;
  const WGS84_A_KM = 6378.137;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
  const WGS84_E2 = WGS84_F * (2 - WGS84_F);
  const WGS84_EP2 = (WGS84_A_KM ** 2 - WGS84_B_KM ** 2) / WGS84_B_KM ** 2;
  const EARTH_MEAN_RADIUS_KM = 6371.0088;

  function gmstDeg(timeMs) {
    const daysSinceJ2000 = (Number(timeMs) - J2000_UTC_MS) / 86400000;
    return normalizeDegrees360(280.46061837 + 360.98564736629 * daysSinceJ2000);
  }

  function earthFixedSceneRotationRad(fromTimeMs, toTimeMs) {
    if (![fromTimeMs, toTimeMs].every((value) => Number.isFinite(Number(value)))) return 0;
    const deltaDeg = normalizeDegreesSigned(gmstDeg(toTimeMs) - gmstDeg(fromTimeMs));
    return deltaDeg * Math.PI / 180;
  }

  function satelliteLayerRotationRad(referenceFrame, earthRotationRad, referenceDeltaRad) {
    const earthRotation = Number(earthRotationRad) || 0;
    const referenceDelta = Number(referenceDeltaRad) || 0;
    return earthRotation - (referenceFrame === "inertial" ? referenceDelta : 0);
  }

  function beijingDateTimeToUtcMs(value) {
    const match = String(value || "").trim().match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/,
    );
    if (!match) return NaN;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0", millisecondText = "0"] = match;
    const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
    const [year, month, day, hour, minute, second] = parts;
    const millisecond = Number(millisecondText.padEnd(3, "0"));
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return NaN;
    const localUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const check = new Date(localUtcMs);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day
      || check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second) return NaN;
    return localUtcMs - 8 * 60 * 60 * 1000;
  }

  function eciStateToScene(position, velocity = null, options = {}) {
    const sampleTimeMs = Number(options.sampleTimeMs);
    const referenceEpochMs = Number(options.referenceEpochMs);
    const referenceFrame = options.referenceFrame === "inertial" ? "inertial" : "earth-fixed";
    const rotationTimeMs = referenceFrame === "inertial" && Number.isFinite(referenceEpochMs)
      ? referenceEpochMs
      : sampleTimeMs;
    const scale = Number.isFinite(Number(options.scale)) ? Number(options.scale) : 1;
    if (!finiteVector(position) || !Number.isFinite(rotationTimeMs)) return null;
    const current = eciPositionToScene(position, rotationTimeMs, scale);
    let sceneVelocity = null;
    if (finiteVector(velocity)) {
      const derivativeStepSec = 0.25;
      const advancedPosition = {
        x: position.x + velocity.x * derivativeStepSec,
        y: position.y + velocity.y * derivativeStepSec,
        z: position.z + velocity.z * derivativeStepSec,
      };
      const advancedRotationTimeMs = referenceFrame === "earth-fixed"
        ? rotationTimeMs + derivativeStepSec * 1000
        : rotationTimeMs;
      const advanced = eciPositionToScene(advancedPosition, advancedRotationTimeMs, scale);
      sceneVelocity = {
        x: (advanced.position.x - current.position.x) / derivativeStepSec,
        y: (advanced.position.y - current.position.y) / derivativeStepSec,
        z: (advanced.position.z - current.position.z) / derivativeStepSec,
      };
    }
    return {
      position: current.position,
      velocity: sceneVelocity,
      geodetic: current.geodetic,
      rotationTimeMs,
      gmstDeg: gmstDeg(rotationTimeMs),
    };
  }

  function eciToGeodetic(position, timeMs) {
    if (!finiteVector(position) || !Number.isFinite(Number(timeMs))) return null;
    return ecefToGeodetic(rotateEciToEcef(position, Number(timeMs)));
  }

  function eciPositionToScene(position, rotationTimeMs, scale) {
    const geodetic = ecefToGeodetic(rotateEciToEcef(position, rotationTimeMs));
    const latitude = geodetic.latDeg * Math.PI / 180;
    const longitude = geodetic.lonDeg * Math.PI / 180;
    const radius = (EARTH_MEAN_RADIUS_KM + geodetic.altitudeKm) * scale;
    const cosLatitude = Math.cos(latitude);
    return {
      geodetic,
      position: {
        x: radius * cosLatitude * Math.sin(longitude),
        y: radius * Math.sin(latitude),
        z: radius * cosLatitude * Math.cos(longitude),
      },
    };
  }

  function rotateEciToEcef(position, timeMs) {
    const theta = gmstDeg(timeMs) * Math.PI / 180;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    return {
      x: position.x * cosine + position.y * sine,
      y: -position.x * sine + position.y * cosine,
      z: position.z,
    };
  }

  function ecefToGeodetic(position) {
    const longitude = Math.atan2(position.y, position.x);
    const horizontal = Math.hypot(position.x, position.y);
    if (horizontal < 1e-10) {
      return {
        lonDeg: 0,
        latDeg: position.z >= 0 ? 90 : -90,
        altitudeKm: Math.abs(position.z) - WGS84_B_KM,
      };
    }
    const theta = Math.atan2(position.z * WGS84_A_KM, horizontal * WGS84_B_KM);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const latitude = Math.atan2(
      position.z + WGS84_EP2 * WGS84_B_KM * sinTheta ** 3,
      horizontal - WGS84_E2 * WGS84_A_KM * cosTheta ** 3,
    );
    const sinLatitude = Math.sin(latitude);
    const primeVerticalRadius = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLatitude ** 2);
    const altitudeKm = horizontal / Math.cos(latitude) - primeVerticalRadius;
    return {
      lonDeg: longitude * 180 / Math.PI,
      latDeg: latitude * 180 / Math.PI,
      altitudeKm,
    };
  }

  function normalizeDegrees360(value) {
    return ((Number(value) % 360) + 360) % 360;
  }

  function normalizeDegreesSigned(value) {
    return ((Number(value) + 540) % 360) - 180;
  }

  function finiteVector(value) {
    return value && [value.x, value.y, value.z].every(Number.isFinite);
  }

  return Object.freeze({
    EARTH_ROTATION_RAD_S,
    beijingDateTimeToUtcMs,
    earthFixedSceneRotationRad,
    eciToGeodetic,
    eciStateToScene,
    gmstDeg,
    satelliteLayerRotationRad,
  });
});
