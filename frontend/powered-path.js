(function initNotamPoweredPath(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NotamPoweredPath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createNotamPoweredPath() {
  "use strict";

  const EARTH_RADIUS_KM = 6371.0088;
  const WGS84_A_M = 6378137;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_B_M = WGS84_A_M * (1 - WGS84_F);
  const WGS84_E2 = WGS84_F * (2 - WGS84_F);
  const WGS84_EP2 = (WGS84_A_M ** 2 - WGS84_B_M ** 2) / WGS84_B_M ** 2;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeLon(value) {
    return ((Number(value) + 540) % 360) - 180;
  }

  function normalizeLonNear(value, reference) {
    let lon = normalizeLon(value);
    while (lon - reference > 180) lon -= 360;
    while (lon - reference < -180) lon += 360;
    return lon;
  }

  function toRad(value) {
    return Number(value) * Math.PI / 180;
  }

  function toDeg(value) {
    return Number(value) * 180 / Math.PI;
  }

  function greatCircleDistanceKm(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const deltaLat = lat2 - lat1;
    const deltaLon = toRad(normalizeLonNear(b.lon, a.lon) - a.lon);
    const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(clamp(h, 0, 1)));
  }

  function geodeticToEcef(point) {
    const lat = toRad(point.lat);
    const lon = toRad(point.lon);
    const altitudeM = Number(point.altitudeM) || 0;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const radius = WGS84_A_M / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    return {
      x: (radius + altitudeM) * cosLat * Math.cos(lon),
      y: (radius + altitudeM) * cosLat * Math.sin(lon),
      z: (radius * (1 - WGS84_E2) + altitudeM) * sinLat,
    };
  }

  function ecefToGeodetic(vector) {
    const p = Math.hypot(vector.x, vector.y);
    const lon = Math.atan2(vector.y, vector.x);
    if (p < 1e-8) {
      return {
        lon: toDeg(lon),
        lat: vector.z >= 0 ? 90 : -90,
        altitudeM: Math.abs(vector.z) - WGS84_B_M,
      };
    }
    const theta = Math.atan2(vector.z * WGS84_A_M, p * WGS84_B_M);
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    const lat = Math.atan2(
      vector.z + WGS84_EP2 * WGS84_B_M * sinTheta ** 3,
      p - WGS84_E2 * WGS84_A_M * cosTheta ** 3,
    );
    const sinLat = Math.sin(lat);
    const radius = WGS84_A_M / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    return {
      lon: toDeg(lon),
      lat: toDeg(lat),
      altitudeM: p / Math.max(1e-12, Math.cos(lat)) - radius,
    };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale(vector, factor) {
    return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
  }

  function magnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  function normalizeVector(vector, fallback = { x: 1, y: 0, z: 0 }) {
    const length = magnitude(vector);
    return length > 1e-12 ? scale(vector, 1 / length) : { ...fallback };
  }

  function limitMagnitude(vector, maximum) {
    const length = magnitude(vector);
    return length > maximum && maximum > 0 ? scale(vector, maximum / length) : vector;
  }

  function surfaceNormal(point) {
    const lat = toRad(point.lat);
    const lon = toRad(point.lon);
    return {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.cos(lat) * Math.sin(lon),
      z: Math.sin(lat),
    };
  }

  function interpolateGreatCircle(start, end, fraction) {
    const t = clamp(Number(fraction) || 0, 0, 1);
    const lat1 = toRad(start.lat);
    const lon1 = toRad(start.lon);
    const lat2 = toRad(end.lat);
    const lon2 = toRad(normalizeLonNear(end.lon, start.lon));
    const a = {
      x: Math.cos(lat1) * Math.cos(lon1),
      y: Math.cos(lat1) * Math.sin(lon1),
      z: Math.sin(lat1),
    };
    const b = {
      x: Math.cos(lat2) * Math.cos(lon2),
      y: Math.cos(lat2) * Math.sin(lon2),
      z: Math.sin(lat2),
    };
    const omega = Math.acos(clamp(dot(a, b), -1, 1));
    let vector;
    if (omega < 1e-8 || Math.abs(Math.sin(omega)) < 1e-8) {
      vector = add(scale(a, 1 - t), scale(b, t));
    } else {
      const denominator = Math.sin(omega);
      vector = add(
        scale(a, Math.sin((1 - t) * omega) / denominator),
        scale(b, Math.sin(t * omega) / denominator),
      );
    }
    const length = Math.max(1e-12, magnitude(vector));
    vector = scale(vector, 1 / length);
    return {
      lon: normalizeLonNear(toDeg(Math.atan2(vector.y, vector.x)), start.lon),
      lat: toDeg(Math.atan2(vector.z, Math.hypot(vector.x, vector.y))),
    };
  }

  function surfaceVector(point) {
    const lat = toRad(point.lat);
    const lon = toRad(point.lon);
    return {
      x: Math.cos(lat) * Math.cos(lon),
      y: Math.cos(lat) * Math.sin(lon),
      z: Math.sin(lat),
    };
  }

  function surfaceVectorToLonLat(vector, referenceLon) {
    const normalized = normalizeVector(vector);
    return {
      lon: normalizeLonNear(toDeg(Math.atan2(normalized.y, normalized.x)), referenceLon),
      lat: toDeg(Math.atan2(normalized.z, Math.hypot(normalized.x, normalized.y))),
    };
  }

  function greatCircleDirection(startVector, endVector, atEnd = false) {
    const normal = cross(startVector, endVector);
    if (magnitude(normal) < 1e-10) {
      const anchor = atEnd ? endVector : startVector;
      const delta = subtract(endVector, startVector);
      return normalizeVector(subtract(delta, scale(anchor, dot(delta, anchor))));
    }
    const anchor = atEnd ? endVector : startVector;
    return normalizeVector(cross(normalizeVector(normal), anchor));
  }

  function localHeadingDirection(point, headingDeg) {
    const lat = toRad(point.lat);
    const lon = toRad(point.lon);
    const heading = toRad(headingDeg);
    const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
    const north = {
      x: -Math.sin(lat) * Math.cos(lon),
      y: -Math.sin(lat) * Math.sin(lon),
      z: Math.cos(lat),
    };
    return normalizeVector(add(scale(east, Math.sin(heading)), scale(north, Math.cos(heading))));
  }

  function vectorAngleDeg(a, b) {
    return toDeg(Math.acos(clamp(dot(normalizeVector(a), normalizeVector(b)), -1, 1)));
  }

  function buildLaunchAwareControlPoints(controlPoints, verticalLaunch) {
    if (!verticalLaunch || controlPoints.length < 2) {
      return {
        points: controlPoints,
        verticalLaunch: false,
        verticalRiseIndex: -1,
        pitchShoulderIndex: -1,
      };
    }
    const start = controlPoints[0];
    const firstSeparation = controlPoints[1];
    const altitudeGainM = firstSeparation.altitudeM - start.altitudeM;
    if (altitudeGainM <= 1) {
      return {
        points: controlPoints,
        verticalLaunch: false,
        verticalRiseIndex: -1,
        pitchShoulderIndex: -1,
      };
    }

    // A launch vehicle clears the pad nearly vertically before pitch-over. Without
    // time/thrust inputs this is a geometric constraint, scaled conservatively to
    // the first known separation altitude and capped to a few kilometres.
    const verticalRiseGainM = Math.min(
      altitudeGainM * 0.22,
      clamp(altitudeGainM * 0.045, 250, 2500),
    );
    const verticalRise = {
      lon: start.lon,
      lat: start.lat,
      altitudeM: start.altitudeM + verticalRiseGainM,
    };
    const augmented = [start, verticalRise];
    let pitchShoulderIndex = -1;
    const horizontalM = greatCircleDistanceKm(start, firstSeparation) * 1000;
    const remainingGainM = altitudeGainM - verticalRiseGainM;
    if (horizontalM > 1500 && remainingGainM > 500) {
      const shoulderAltitudeM = verticalRise.altitudeM + remainingGainM * 0.18;
      // During early pitch-over the trajectory remains steep. Targeting roughly
      // 65 degrees above the local horizontal prevents a large, uniform bend.
      const desiredEarlyDownrangeM = Math.max(450, (shoulderAltitudeM - start.altitudeM) * 0.47);
      const shoulderFraction = clamp(desiredEarlyDownrangeM / horizontalM, 0.006, 0.14);
      const shoulderSurface = interpolateGreatCircle(start, firstSeparation, shoulderFraction);
      augmented.push({
        lon: shoulderSurface.lon,
        lat: shoulderSurface.lat,
        altitudeM: shoulderAltitudeM,
      });
      pitchShoulderIndex = 2;
    }
    augmented.push(firstSeparation, ...controlPoints.slice(2));
    return {
      points: augmented,
      verticalLaunch: true,
      verticalRiseIndex: 1,
      pitchShoulderIndex,
    };
  }

  function buildTerminalAwareControlPoints(controlPoints, options = {}) {
    const angleDeg = Number(options.terminalFlightPathAngleDeg);
    if (!Number.isFinite(angleDeg) || controlPoints.length < 2) return controlPoints;
    const points = controlPoints.map((point) => ({ ...point }));
    const end = points[points.length - 1];
    const start = points[points.length - 2];
    const distanceM = greatCircleDistanceKm(start, end) * 1000;
    if (distanceM < 250) return points;

    const slope = Math.tan(toRad(clamp(angleDeg, -89, 89)));
    const altitudeSpanM = Math.abs(end.altitudeM - start.altitudeM);
    const preferredDistanceM = clamp(distanceM * 0.16, 5000, 120000);
    const maximumExcursionM = clamp(altitudeSpanM * 0.4 + 12000, 12000, 80000);
    let transitionDistanceM = preferredDistanceM;
    if (Math.abs(slope) > 0.02) {
      transitionDistanceM = Math.min(transitionDistanceM, maximumExcursionM / Math.abs(slope));
    }
    if (slope > 0.02) {
      transitionDistanceM = Math.min(transitionDistanceM, Math.max(250, (end.altitudeM + 2500) / slope));
    }
    transitionDistanceM = clamp(transitionDistanceM, Math.min(500, distanceM * 0.02), distanceM * 0.35);
    const fraction = clamp(1 - transitionDistanceM / distanceM, 0.05, 0.98);
    const surface = interpolateGreatCircle(start, end, fraction);
    points.splice(points.length - 1, 0, {
      lon: surface.lon,
      lat: surface.lat,
      altitudeM: Math.max(0, end.altitudeM - slope * transitionDistanceM),
      terminalApproach: true,
    });
    return points;
  }

  function normalizeControlPoints(controlPoints) {
    const points = [];
    for (const point of controlPoints || []) {
      const previous = points[points.length - 1];
      const normalized = {
        lon: previous ? normalizeLonNear(point.lon, previous.lon) : normalizeLon(point.lon),
        lat: clamp(Number(point.lat), -90, 90),
        altitudeM: Math.max(0, Number(point.altitudeM) || 0),
      };
      if (!Number.isFinite(normalized.lon) || !Number.isFinite(normalized.lat)) continue;
      if (
        previous &&
        greatCircleDistanceKm(previous, normalized) < 0.001 &&
        Math.abs(previous.altitudeM - normalized.altitudeM) < 1
      ) continue;
      points.push(normalized);
    }
    return points;
  }

  function buildCentripetalKnots(vectors) {
    const knots = [0];
    for (let index = 1; index < vectors.length; index += 1) {
      const chordM = Math.max(1, magnitude(subtract(vectors[index], vectors[index - 1])));
      knots.push(knots[index - 1] + Math.sqrt(chordM));
    }
    return knots;
  }

  function localHorizontalVector(vector, point) {
    const lat = toRad(point.lat);
    const lon = toRad(point.lon);
    const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
    const north = {
      x: -Math.sin(lat) * Math.cos(lon),
      y: -Math.sin(lat) * Math.sin(lon),
      z: Math.cos(lat),
    };
    return { x: dot(vector, east), y: dot(vector, north) };
  }

  function doglegTangentScale(points, vectors, index) {
    if (index <= 0 || index >= points.length - 1) return 1;
    const incoming = localHorizontalVector(subtract(vectors[index], vectors[index - 1]), points[index]);
    const outgoing = localHorizontalVector(subtract(vectors[index + 1], vectors[index]), points[index]);
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    if (incomingLength < 1 || outgoingLength < 1) return 0.45;
    const cosine = clamp((incoming.x * outgoing.x + incoming.y * outgoing.y) / (incomingLength * outgoingLength), -1, 1);
    const turnDeg = Math.acos(cosine) * 180 / Math.PI;
    const angleScale = turnDeg <= 12
      ? 1
      : turnDeg <= 50
        ? 1 - ((turnDeg - 12) / 38) * 0.42
        : turnDeg <= 105
          ? 0.58 - ((turnDeg - 50) / 55) * 0.42
          : 0.12;
    const balance = 2 * Math.min(incomingLength, outgoingLength) / Math.max(1, incomingLength + outgoingLength);
    return clamp(angleScale * clamp(balance * 1.35, 0.38, 1), 0.1, 1);
  }

  function buildVectorTangents(points, vectors, knots) {
    return vectors.map((vector, index) => {
      if (index === 0) {
        return scale(subtract(vectors[1], vector), 1 / Math.max(1e-9, knots[1] - knots[0]));
      }
      if (index === vectors.length - 1) {
        return scale(subtract(vector, vectors[index - 1]), 1 / Math.max(1e-9, knots[index] - knots[index - 1]));
      }
      const previousStep = Math.max(1e-9, knots[index] - knots[index - 1]);
      const nextStep = Math.max(1e-9, knots[index + 1] - knots[index]);
      const incoming = scale(subtract(vector, vectors[index - 1]), 1 / previousStep);
      const outgoing = scale(subtract(vectors[index + 1], vector), 1 / nextStep);
      const weighted = scale(
        add(scale(incoming, nextStep), scale(outgoing, previousStep)),
        1 / (previousStep + nextStep),
      );
      return scale(weighted, doglegTangentScale(points, vectors, index));
    });
  }

  function buildMonotoneAltitudeSlopes(points, knots) {
    const count = points.length;
    if (count === 2) {
      const slope = (points[1].altitudeM - points[0].altitudeM) / Math.max(1e-9, knots[1] - knots[0]);
      return [slope, slope];
    }
    const intervals = [];
    const secants = [];
    for (let index = 0; index < count - 1; index += 1) {
      const interval = Math.max(1e-9, knots[index + 1] - knots[index]);
      intervals.push(interval);
      secants.push((points[index + 1].altitudeM - points[index].altitudeM) / interval);
    }
    const slopes = new Array(count).fill(0);
    slopes[0] = monotoneEndpointSlope(intervals[0], intervals[1], secants[0], secants[1]);
    slopes[count - 1] = monotoneEndpointSlope(
      intervals[count - 2], intervals[count - 3], secants[count - 2], secants[count - 3],
    );
    for (let index = 1; index < count - 1; index += 1) {
      const previous = secants[index - 1];
      const next = secants[index];
      if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) {
        slopes[index] = 0;
        continue;
      }
      const previousInterval = intervals[index - 1];
      const nextInterval = intervals[index];
      const weight1 = 2 * nextInterval + previousInterval;
      const weight2 = nextInterval + 2 * previousInterval;
      slopes[index] = (weight1 + weight2) / (weight1 / previous + weight2 / next);
    }
    return slopes;
  }

  function monotoneEndpointSlope(firstInterval, secondInterval, firstSecant, secondSecant) {
    let slope = ((2 * firstInterval + secondInterval) * firstSecant - firstInterval * secondSecant) /
      Math.max(1e-9, firstInterval + secondInterval);
    if (Math.sign(slope) !== Math.sign(firstSecant)) slope = 0;
    else if (Math.sign(firstSecant) !== Math.sign(secondSecant) && Math.abs(slope) > Math.abs(3 * firstSecant)) slope = 3 * firstSecant;
    return slope;
  }

  function hermiteScalar(a, b, tangentA, tangentB, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a +
      (t3 - 2 * t2 + t) * tangentA +
      (-2 * t3 + 3 * t2) * b +
      (t3 - t2) * tangentB;
  }

  function hermiteVector(a, b, tangentA, tangentB, t) {
    return {
      x: hermiteScalar(a.x, b.x, tangentA.x, tangentB.x, t),
      y: hermiteScalar(a.y, b.y, tangentA.y, tangentB.y, t),
      z: hermiteScalar(a.z, b.z, tangentA.z, tangentB.z, t),
    };
  }

  function cubicBezierVector(a, b, c, d, t) {
    const u = 1 - t;
    return add(
      add(scale(a, u ** 3), scale(b, 3 * u * u * t)),
      add(scale(c, 3 * u * t * t), scale(d, t ** 3)),
    );
  }

  function buildSurfaceRouteTangents(points, options = {}) {
    const vectors = points.map(surfaceVector);
    const ecefVectors = points.map(geodeticToEcef);
    const tangents = [];
    const scales = [];
    for (let index = 0; index < points.length; index += 1) {
      const previousDistanceM = index > 0 ? greatCircleDistanceKm(points[index - 1], points[index]) * 1000 : 0;
      const nextDistanceM = index < points.length - 1 ? greatCircleDistanceKm(points[index], points[index + 1]) * 1000 : 0;
      const incoming = previousDistanceM > 1
        ? greatCircleDirection(vectors[index - 1], vectors[index], true)
        : null;
      const outgoing = nextDistanceM > 1
        ? greatCircleDirection(vectors[index], vectors[index + 1], false)
        : null;
      let tangent;
      let tangentScale = doglegTangentScale(points, ecefVectors, index);
      if (index === points.length - 1 && Number.isFinite(Number(options.terminalHeadingDeg))) {
        const requestedHeading = localHeadingDirection(points[index], Number(options.terminalHeadingDeg));
        if (incoming) {
          const mismatchDeg = vectorAngleDeg(incoming, requestedHeading);
          const headingWeight = clamp((70 - mismatchDeg) / 55, 0, 1);
          tangent = normalizeVector(add(scale(incoming, 1 - headingWeight), scale(requestedHeading, headingWeight)));
          tangentScale *= clamp(1 - Math.max(0, mismatchDeg - 12) / 90, 0.18, 1);
        } else {
          tangent = requestedHeading;
        }
      } else if (incoming && outgoing) {
        const balanced = add(incoming, outgoing);
        tangent = magnitude(balanced) > 0.08 ? normalizeVector(balanced) : outgoing;
      } else {
        tangent = outgoing || incoming || localHeadingDirection(points[index], 90);
      }
      tangents.push(tangent);
      scales.push(clamp(tangentScale, 0.1, 1));
    }
    return { vectors, tangents, scales };
  }

  function buildAltitudeSlopes(points, segmentLengthsM, launchShape, options = {}) {
    const secants = segmentLengthsM.map((lengthM, index) =>
      lengthM > 1 ? (points[index + 1].altitudeM - points[index].altitudeM) / lengthM : null);
    const slopes = new Array(points.length).fill(0);
    for (let index = 0; index < points.length; index += 1) {
      const previous = index > 0 ? secants[index - 1] : null;
      const next = index < secants.length ? secants[index] : null;
      if (Number.isFinite(previous) && Number.isFinite(next) && previous !== 0 && next !== 0 && Math.sign(previous) === Math.sign(next)) {
        const previousLength = segmentLengthsM[index - 1];
        const nextLength = segmentLengthsM[index];
        const weight1 = 2 * nextLength + previousLength;
        const weight2 = nextLength + 2 * previousLength;
        slopes[index] = (weight1 + weight2) / (weight1 / previous + weight2 / next);
      } else if (Number.isFinite(previous) && !Number.isFinite(next)) {
        slopes[index] = previous;
      } else if (!Number.isFinite(previous) && Number.isFinite(next)) {
        slopes[index] = next;
      } else if (index === 0 && Number.isFinite(next)) {
        slopes[index] = next;
      } else if (index === points.length - 1 && Number.isFinite(previous)) {
        slopes[index] = previous;
      }
    }
    if (launchShape.verticalLaunch && launchShape.verticalRiseIndex >= 0) {
      const outgoing = secants[launchShape.verticalRiseIndex];
      if (Number.isFinite(outgoing) && outgoing > 0) {
        slopes[launchShape.verticalRiseIndex] = Math.min(
          Math.tan(toRad(78)),
          outgoing * 1.65,
        );
      }
    }
    const terminalAngleDeg = Number(options.terminalFlightPathAngleDeg);
    if (Number.isFinite(terminalAngleDeg)) {
      slopes[slopes.length - 1] = Math.tan(toRad(clamp(terminalAngleDeg, -89, 89)));
    }
    return slopes;
  }

  function terminalFlightPathAngleDeg(samples) {
    if (!Array.isArray(samples) || samples.length < 2) return NaN;
    const end = samples[samples.length - 1];
    let index = samples.length - 2;
    let horizontalM = 0;
    while (index >= 0) {
      horizontalM = greatCircleDistanceKm(samples[index], end) * 1000;
      if (horizontalM >= 1 || index === 0) break;
      index -= 1;
    }
    if (horizontalM < 1) return Math.sign(end.altitudeM - samples[index].altitudeM) * 90;
    return toDeg(Math.atan2(end.altitudeM - samples[index].altitudeM, horizontalM));
  }

  function poweredPathTangent(points, index) {
    const normalized = normalizeControlPoints(points);
    if (normalized.length < 2 || index < 0 || index >= normalized.length) return { lon: 0, lat: 0, altitudeM: 0 };
    const previous = normalized[Math.max(0, index - 1)];
    const next = normalized[Math.min(normalized.length - 1, index + 1)];
    const vectors = normalized.map(geodeticToEcef);
    const factor = doglegTangentScale(normalized, vectors, index);
    const endpointScale = index === 0 || index === normalized.length - 1 ? 0.72 : 0.5;
    return {
      lon: (next.lon - previous.lon) * endpointScale * factor,
      lat: (next.lat - previous.lat) * endpointScale * factor,
      altitudeM: (next.altitudeM - previous.altitudeM) * endpointScale * factor,
    };
  }

  function verticalLaunchTangent(start, next) {
    const altitudeDeltaM = Math.max(0, Number(next.altitudeM) - Number(start.altitudeM));
    return { lon: 0, lat: 0, altitudeM: Math.max(1, altitudeDeltaM * 0.92) };
  }

  function smooth(controlPoints, options = {}) {
    const normalized = normalizeControlPoints(controlPoints);
    if (normalized.length < 2) return normalized;
    const launchShape = buildLaunchAwareControlPoints(
      normalized,
      options.verticalLaunch !== false && normalized[1].altitudeM > normalized[0].altitudeM + 1,
    );
    const points = buildTerminalAwareControlPoints(launchShape.points, options);
    const segmentLengthsM = points.slice(0, -1).map((point, index) => greatCircleDistanceKm(point, points[index + 1]) * 1000);
    const route = buildSurfaceRouteTangents(points, options);
    const altitudeSlopes = buildAltitudeSlopes(points, segmentLengthsM, launchShape, options);
    const verticalLaunch = launchShape.verticalLaunch;
    const result = [];

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      const horizontalM = segmentLengthsM[index];
      const horizontalKm = horizontalM / 1000;
      const altitudeDeltaKm = Math.abs(end.altitudeM - start.altitudeM) / 1000;
      const launchPitchSegment = verticalLaunch && index === launchShape.verticalRiseIndex;
      const terminalShapingSegment = index === points.length - 2 && Number.isFinite(Number(options.terminalFlightPathAngleDeg));
      const minimumSteps = verticalLaunch && index === 0
        ? 18
        : launchPitchSegment
          ? 72
          : terminalShapingSegment
            ? 144
            : 24;
      const turnSampling = Math.ceil((1 - Math.min(
        route.scales[index],
        route.scales[index + 1],
      )) * 36);
      const steps = clamp(
        Math.ceil(Math.max(horizontalKm / 12, altitudeDeltaKm / 6)) + turnSampling,
        minimumSteps,
        240,
      );

      if (horizontalM <= 1) {
        for (let step = index ? 1 : 0; step <= steps; step += 1) {
          const t = step / steps;
          result.push({
            lon: start.lon,
            lat: start.lat,
            altitudeM: start.altitudeM + (end.altitudeM - start.altitudeM) * t,
          });
        }
        continue;
      }

      const startVector = route.vectors[index];
      const endVector = route.vectors[index + 1];
      const centralAngle = Math.acos(clamp(dot(startVector, endVector), -1, 1));
      const baseHandle = 4 / 3 * Math.tan(Math.min(Math.PI - 0.01, centralAngle) / 4);
      const controlA = normalizeVector(add(startVector, scale(route.tangents[index], baseHandle * route.scales[index])));
      const controlB = normalizeVector(subtract(endVector, scale(route.tangents[index + 1], baseHandle * route.scales[index + 1])));
      const surfaceSamples = [];
      let previousLon = start.lon;
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const lonLat = step === 0
          ? { lon: start.lon, lat: start.lat }
          : step === steps
            ? { lon: end.lon, lat: end.lat }
            : surfaceVectorToLonLat(cubicBezierVector(startVector, controlA, controlB, endVector, t), previousLon);
        previousLon = lonLat.lon;
        surfaceSamples.push(lonLat);
      }
      const cumulativeM = [0];
      for (let step = 1; step < surfaceSamples.length; step += 1) {
        cumulativeM.push(cumulativeM[step - 1] + greatCircleDistanceKm(surfaceSamples[step - 1], surfaceSamples[step]) * 1000);
      }
      const fittedLengthM = Math.max(1, cumulativeM[cumulativeM.length - 1]);

      for (let step = index ? 1 : 0; step <= steps; step += 1) {
        if (step === 0) {
          result.push({ ...start });
          continue;
        }
        if (step === steps) {
          result.push({ ...end });
          continue;
        }
        const arcFraction = cumulativeM[step] / fittedLengthM;
        const altitudeM = hermiteScalar(
          start.altitudeM,
          end.altitudeM,
          altitudeSlopes[index] * fittedLengthM,
          altitudeSlopes[index + 1] * fittedLengthM,
          arcFraction,
        );
        result.push({
          lon: surfaceSamples[step].lon,
          lat: clamp(surfaceSamples[step].lat, -90, 90),
          altitudeM: Math.max(0, altitudeM),
        });
      }
    }
    return result;
  }

  return {
    buildLaunchAwareControlPoints,
    buildTerminalAwareControlPoints,
    greatCircleDistanceKm,
    poweredPathTangent,
    smooth,
    terminalFlightPathAngleDeg,
    verticalLaunchTangent,
  };
});
