(function(root, factory) { const api = factory(root); if (typeof module === "object" && module.exports) module.exports = api; root.NotamSatelliteOrbitGeometry = api; })(globalThis, function(root) {
  "use strict";
  const sceneCache = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function build(payload, pathById) {
    const expectedOrbitIds = payload.ids;
    const itemById = new Map(payload.entries.map(item => [item.id, item]));
    const state = { satelliteOrbitPaths: pathById, satelliteById: itemById };
    const satelliteCategoryEnabled = () => true;
    const satelliteOrbitPathPointCount = path => ArrayBuffer.isView(path) ? Math.floor(path.length / 6) : 0;
    const referenceTimeMs = payload.referenceTimeMs;
    const SATELLITE_DENSE_ORBIT_LINE_THRESHOLD = payload.denseThreshold;
    const SATELLITE_ORBIT_POLICY = root.NotamSatelliteOrbitPolicy;

  const denseOrbitMode = expectedOrbitIds.length >= SATELLITE_DENSE_ORBIT_LINE_THRESHOLD;
  const denseColorScale = expectedOrbitIds.length > 8000
    ? 0.74
    : expectedOrbitIds.length > 4000
      ? 0.78
      : expectedOrbitIds.length > 1200 ? 0.82 : 0.88;
  let segmentCapacity = 0;
  for (const id of expectedOrbitIds) {
    const path = state.satelliteOrbitPaths.get(id);
    const item = state.satelliteById.get(id);
    const pointCount = satelliteOrbitPathPointCount(path);
    if (item && satelliteCategoryEnabled(item) && pointCount >= 2) {
      // Reserve one extra segment for a continuity-checked last-to-first closure.
      segmentCapacity += pointCount;
    }
  }
  const starts = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const ends = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const colors = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const densePositions = denseOrbitMode ? new Float32Array(segmentCapacity * 6) : null;
  const denseColors = denseOrbitMode ? new Float32Array(segmentCapacity * 6) : null;
  const colorCache = new Map();
  let orbitCount = 0;
  let closedOrbitCount = 0;
  let continuousOrbitCount = 0;
  let rejectedClosureCount = 0;
  const rejectedClosureIds = [];
  let segmentCount = 0;
  let anchorMaxErrorScene = 0;

  for (const id of expectedOrbitIds) {
    const path = state.satelliteOrbitPaths.get(id);
    const pointCount = satelliteOrbitPathPointCount(path);
    if (pointCount < 2) continue;
    const item = state.satelliteById.get(id);
    if (!item || !satelliteCategoryEnabled(item)) continue;
    const anchorPoint = item.anchor;
    let anchorMinErrorScene = Number.POSITIVE_INFINITY;
    const color = item.color;
    let memo = sceneCache.get(path);
    const transformKey = `${payload.referenceFrame}:${payload.referenceEpochMs}:${referenceTimeMs}`;
    if (!memo || memo.key !== transformKey) {
      const points = new Array(pointCount);
      for (let index = 0; index < pointCount; index += 1) {
        const offset = index * 6, x = path[offset + 3], y = path[offset + 4], z = path[offset + 5];
        points[index] = [x, y, z].every(Number.isFinite) ? root.NotamSatelliteReference.eciStateToScene({ x, y, z }, null, {
          sampleTimeMs: referenceTimeMs, referenceFrame: payload.referenceFrame, referenceEpochMs: payload.referenceEpochMs, scale: 1 / 6371.0088,
        })?.position || null : null;
      }
      memo = { key: transformKey, points }; sceneCache.set(path, memo);
    }
    const scenePoints = memo.points;
    const closure = SATELLITE_ORBIT_POLICY?.orbitPathClosure?.(scenePoints);
    if (closure?.continuous) {
      continuousOrbitCount += 1;
    } else {
      rejectedClosureCount += 1;
      rejectedClosureIds.push(String(id));
    }
    const orbitSegmentStart = segmentCount;
    const appendSegment = (pointA, pointB) => {
      if (!pointA || !pointB) return;
      if (anchorPoint) {
        anchorMinErrorScene = Math.min(anchorMinErrorScene, satelliteScenePointSegmentDistance(anchorPoint, pointA, pointB));
      }
      if (denseOrbitMode) {
        const offset = segmentCount * 6;
        densePositions[offset] = pointA.x;
        densePositions[offset + 1] = pointA.y;
        densePositions[offset + 2] = pointA.z;
        densePositions[offset + 3] = pointB.x;
        densePositions[offset + 4] = pointB.y;
        densePositions[offset + 5] = pointB.z;
        denseColors[offset] = color.r * denseColorScale;
        denseColors[offset + 1] = color.g * denseColorScale;
        denseColors[offset + 2] = color.b * denseColorScale;
        denseColors[offset + 3] = color.r * denseColorScale;
        denseColors[offset + 4] = color.g * denseColorScale;
        denseColors[offset + 5] = color.b * denseColorScale;
      } else {
        const offset = segmentCount * 3;
        starts[offset] = pointA.x;
        starts[offset + 1] = pointA.y;
        starts[offset + 2] = pointA.z;
        ends[offset] = pointB.x;
        ends[offset + 1] = pointB.y;
        ends[offset + 2] = pointB.z;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      }
      segmentCount += 1;
    };
    for (let index = 0; index < pointCount - 1; index += 1) {
      const pointA = scenePoints[index];
      const pointB = scenePoints[index + 1];
      if (satelliteOrbitSceneSegmentContinuous(pointA, pointB)) appendSegment(pointA, pointB);
    }
    if (closure?.close) {
      appendSegment(scenePoints[pointCount - 1], scenePoints[0]);
      closedOrbitCount += 1;
    }
    if (Number.isFinite(anchorMinErrorScene)) anchorMaxErrorScene = Math.max(anchorMaxErrorScene, anchorMinErrorScene);
    if (segmentCount > orbitSegmentStart) orbitCount += 1;
  }
  let boundingSphere = null;
  if (denseOrbitMode && segmentCount) {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < segmentCount * 6; i += 3) { const x = densePositions[i], y = densePositions[i + 1], z = densePositions[i + 2]; minX = Math.min(minX,x); minY = Math.min(minY,y); minZ = Math.min(minZ,z); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); maxZ = Math.max(maxZ,z); }
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 }; let radiusSquared = 0;
    for (let i = 0; i < segmentCount * 6; i += 3) { const x = densePositions[i] - center.x, y = densePositions[i+1] - center.y, z = densePositions[i+2] - center.z; radiusSquared = Math.max(radiusSquared, x*x+y*y+z*z); }
    boundingSphere = { center, radius: Math.sqrt(radiusSquared) };
  }
  return { starts, ends, colors, densePositions, denseColors, denseOrbitMode, segmentCount, orbitCount, closedOrbitCount, continuousOrbitCount, rejectedClosureCount, rejectedClosureIds, anchorMaxErrorScene, referenceTimeMs, expectedCount: expectedOrbitIds.length, boundingSphere };
}
function satelliteOrbitSceneSegmentContinuous(start, end) {
  if (!start || !end || ![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)) return false;
  const denominator = Math.hypot(start.x, start.y, start.z) * Math.hypot(end.x, end.y, end.z);
  if (!(denominator > 1e-12)) return false;
  const cosine = clamp((start.x * end.x + start.y * end.y + start.z * end.z) / denominator, -1, 1);
  return Math.acos(cosine) <= Math.PI * 0.45;
}
function satelliteScenePointSegmentDistance(point, start, end) {
  const ab = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const ap = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
  const lengthSquared = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = lengthSquared > 1e-16
    ? clamp((ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared, 0, 1)
    : 0;
  return Math.hypot(
    point.x - (start.x + ab.x * t),
    point.y - (start.y + ab.y * t),
    point.z - (start.z + ab.z * t),
  );
}
return { build };
});
