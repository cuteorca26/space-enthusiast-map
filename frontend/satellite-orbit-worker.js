import {
  degreesLat,
  degreesLong,
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
} from "/node_modules/satellite.js/dist/index.js";
import { positionWithinSatrecEnvelope } from "/frontend/satellite-orbit-validity.mjs";

const satrecs = new Map();
const metadata = new Map();
let catalogIds = [];
const inertialPathCache = new Map();
const PATH_CACHE_LIMIT = 12000;
const POSITION_STRIDE = 17;
const PATH_POINT_STRIDE = 6;

function finitePathPoint(point) {
  return point && [point[0], point[1], point[2]].every(Number.isFinite);
}

function pathPointSegmentDistanceKm(point, start, end) {
  if (![point, start, end].every(finitePathPoint)) return 0;
  const ab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const ap = [point[0] - start[0], point[1] - start[1], point[2] - start[2]];
  const denominator = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = denominator > 1e-12
    ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denominator))
    : 0;
  return Math.hypot(
    point[0] - (start[0] + ab[0] * t),
    point[1] - (start[1] + ab[1] * t),
    point[2] - (start[2] + ab[2] * t),
  );
}

function pathHeapPush(heap, item) {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].errorKm >= item.errorKm) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function pathHeapPop(heap) {
  if (!heap.length) return null;
  const root = heap[0];
  const tail = heap.pop();
  if (!heap.length) return root;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const child = right < heap.length && heap[right].errorKm > heap[left].errorKm ? right : left;
    if (heap[child].errorKm <= tail.errorKm) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = tail;
  return root;
}

function createAdaptivePathSegment(startNode, endNode, sampleAtTime) {
  const midpointTimeMs = (startNode.timeMs + endNode.timeMs) / 2;
  const midpoint = sampleAtTime(midpointTimeMs);
  return {
    startNode,
    endNode,
    midpointTimeMs,
    midpoint,
    errorKm: pathPointSegmentDistanceKm(midpoint, startNode.point, endNode.point),
    active: true,
  };
}

function buildOrbitSamples({ startMs, periodMs, maxSegments, sampleAtTime, adaptive = false, toleranceKm = 2 }) {
  const segmentLimit = Math.max(32, Math.min(1200, Math.round(Number(maxSegments) || 256)));
  if (!adaptive) {
    const times = [];
    const points = [];
    for (let index = 0; index <= segmentLimit; index += 1) {
      const timeMs = startMs + periodMs * index / segmentLimit;
      times.push(timeMs);
      points.push(sampleAtTime(timeMs));
    }
    return { times, points };
  }

  const baseSegments = Math.min(96, Math.max(32, Math.round(segmentLimit / 8)));
  const firstNode = { timeMs: startMs, point: sampleAtTime(startMs), next: null };
  const nodes = [firstNode];
  let previous = firstNode;
  for (let index = 1; index <= baseSegments; index += 1) {
    const timeMs = startMs + periodMs * index / baseSegments;
    const node = { timeMs, point: sampleAtTime(timeMs), next: null };
    previous.next = node;
    previous = node;
    nodes.push(node);
  }
  const heap = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    pathHeapPush(heap, createAdaptivePathSegment(nodes[index], nodes[index + 1], sampleAtTime));
  }
  let segmentCount = baseSegments;
  const targetToleranceKm = Math.max(0.05, Number(toleranceKm) || 2);
  while (segmentCount < segmentLimit && heap.length) {
    const segment = pathHeapPop(heap);
    if (!segment?.active) continue;
    if (!(segment.errorKm > targetToleranceKm) || !finitePathPoint(segment.midpoint)) break;
    const midpointNode = { timeMs: segment.midpointTimeMs, point: segment.midpoint, next: segment.endNode };
    segment.startNode.next = midpointNode;
    segment.active = false;
    pathHeapPush(heap, createAdaptivePathSegment(segment.startNode, midpointNode, sampleAtTime));
    pathHeapPush(heap, createAdaptivePathSegment(midpointNode, segment.endNode, sampleAtTime));
    segmentCount += 1;
  }
  const times = [];
  const points = [];
  let node = firstNode;
  while (node) {
    times.push(node.timeMs);
    points.push(node.point);
    node = node.next;
  }
  return { times, points };
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "catalog") {
    initializeCatalog(message);
    return;
  }
  if (message.type === "propagate") propagateSelection(message);
});

function initializeCatalog(message) {
  satrecs.clear();
  metadata.clear();
  catalogIds = [];
  inertialPathCache.clear();
  let rejected = 0;
  const satellites = message.satellites || [];
  catalogIds = new Array(satellites.length).fill("");
  for (let catalogIndex = 0; catalogIndex < satellites.length; catalogIndex += 1) {
    const item = satellites[catalogIndex];
    if (!item?.id || !item?.omm) {
      rejected += 1;
      continue;
    }
    try {
      const satrecSeries = createSatrecSeries(item);
      if (!satrecSeries.length) throw new Error("invalid_satrec");
      const id = String(item.id);
      metadata.set(id, item);
      satrecs.set(id, satrecSeries);
      catalogIds[catalogIndex] = id;
    } catch {
      rejected += 1;
    }
  }
  self.postMessage({ type: "catalog-ready", requestId: message.requestId, generation: message.generation, accepted: metadata.size, rejected });
}

function propagateSelection(message) {
  const computeStartedAt = performance.now();
  const requestedAt = Number(message.timeMs);
  if (!Number.isFinite(requestedAt)) return;
  const date = new Date(requestedAt);
  const interpolationDurationSec = normalizeInterpolationDuration(message.interpolationDurationSec);
  const interpolationDate = new Date(requestedAt + interpolationDurationSec * 1000);
  const currentGmst = gstime(date);
  const positionData = new Float32Array(catalogIds.length * POSITION_STRIDE);
  positionData.fill(Number.NaN);
  const paths = [];
  const errors = [];
  const pathIds = new Set((message.pathIds || []).map(String));
  for (let catalogIndex = 0; catalogIndex < catalogIds.length; catalogIndex += 1) {
    const id = catalogIds[catalogIndex];
    const item = metadata.get(id);
    if (!item) continue;
    try {
      let satrecSeries = satrecs.get(id);
      if (!satrecSeries) {
        satrecSeries = createSatrecSeries(item);
        if (!satrecSeries.length) throw new Error("invalid_satrec");
        satrecs.set(id, satrecSeries);
      }
      const activeElement = selectSatrec(satrecSeries, requestedAt);
      if (!activeElement) throw new Error("invalid_satrec");
      const propagatedState = propagate(activeElement.satrec, date);
      const current = geodeticPoint(propagatedState?.position, currentGmst);
      const inertialPosition = propagatedState?.position;
      const inertialVelocity = propagatedState?.velocity;
      const interpolationElement = selectSatrec(satrecSeries, interpolationDate.getTime()) || activeElement;
      const interpolationState = propagate(interpolationElement.satrec, interpolationDate);
      const nextInertialPosition = interpolationState?.position;
      const nextInertialVelocity = interpolationState?.velocity;
      if (!current || !finiteVector(inertialPosition) || !finiteVector(inertialVelocity)
        || !finiteVector(nextInertialPosition) || !finiteVector(nextInertialVelocity)
        || !positionWithinSatrecEnvelope(inertialPosition, activeElement.satrec)
        || !positionWithinSatrecEnvelope(nextInertialPosition, interpolationElement.satrec)) {
        errors.push(id);
        continue;
      }
      let motion = { headingDeg: 0, groundSpeedKmS: 0 };
      if (item.needsHeading) {
        const nextDate = new Date(requestedAt + 2000);
        const nextElement = selectSatrec(satrecSeries, nextDate.getTime()) || activeElement;
        const nextState = propagate(nextElement.satrec, nextDate);
        const next = geodeticPoint(nextState?.position, gstime(nextDate));
        motion = groundMotion(current, next, 2);
      }
      const offset = catalogIndex * POSITION_STRIDE;
      positionData[offset] = current.lon;
      positionData[offset + 1] = current.lat;
      positionData[offset + 2] = current.altitudeKm;
      positionData[offset + 3] = motion.headingDeg;
      positionData[offset + 4] = motion.groundSpeedKmS;
      positionData[offset + 5] = inertialPosition.x;
      positionData[offset + 6] = inertialPosition.y;
      positionData[offset + 7] = inertialPosition.z;
      positionData[offset + 8] = inertialVelocity.x;
      positionData[offset + 9] = inertialVelocity.y;
      positionData[offset + 10] = inertialVelocity.z;
      positionData[offset + 11] = nextInertialPosition.x;
      positionData[offset + 12] = nextInertialPosition.y;
      positionData[offset + 13] = nextInertialPosition.z;
      positionData[offset + 14] = nextInertialVelocity.x;
      positionData[offset + 15] = nextInertialVelocity.y;
      positionData[offset + 16] = nextInertialVelocity.z;
      if (message.includePaths && pathIds.has(id)) {
        paths.push({
          id,
          points: orbitPathAtDisplayTime(
            id,
            satrecSeries,
            item,
            requestedAt,
            currentGmst,
            message.pathSampleCounts,
            inertialPosition,
          ),
        });
      }
    } catch {
      errors.push(id);
    }
  }
  const packedPaths = packOrbitPaths(paths);
  const transfer = [positionData.buffer];
  if (packedPaths.buffer.byteLength) transfer.push(packedPaths.buffer);
  self.postMessage({
    type: "frame",
    requestId: message.requestId,
    timeMs: requestedAt,
    positionBuffer: positionData.buffer,
    positionCount: catalogIds.length,
    positionStride: POSITION_STRIDE,
    interpolationDurationSec,
    pathBuffer: packedPaths.buffer,
    pathDescriptors: packedPaths.descriptors,
    pathStride: PATH_POINT_STRIDE,
    errors,
    includedPaths: Boolean(message.includePaths),
    computeMs: performance.now() - computeStartedAt,
  }, transfer);
}

function orbitPathAtDisplayTime(id, satrecSeries, item, timeMs, currentGmst, requestedSampleCounts, exactPosition = null) {
  const periodMinutes = Math.max(20, Number(item.periodMinutes) || 90);
  const bucketMs = item.orbitClass === "LEO" ? 10 * 60 * 1000 : item.orbitClass === "MEO" ? 30 * 60 * 1000 : 60 * 60 * 1000;
  const centerMs = Math.round(timeMs / bucketMs) * bucketMs;
  const fallback = item.orbitClass === "LEO" ? 256 : item.orbitClass === "MEO" ? 384 : item.orbitClass === "GEO" ? 448 : 1024;
  const sampleCount = Math.max(32, Math.min(1200, Math.round(Number(requestedSampleCounts?.[item.orbitClass]) || fallback)));
  const activeElement = selectSatrec(satrecSeries, timeMs);
  const cacheKey = `${id}:${activeElement?.epochMs || 0}:${centerMs}:${sampleCount}`;
  let cachedPath = inertialPathCache.get(cacheKey);
  const periodMs = periodMinutes * 60 * 1000;
  const startMs = centerMs - periodMs / 2;
  if (!cachedPath) {
    const sampleAtTime = (sampleTime) => {
      // Keep one revolution on one element set. Switching TLE/GP epochs inside
      // a displayed curve creates a real geometric jump at the switch point.
      const position = activeElement ? propagate(activeElement.satrec, new Date(sampleTime))?.position : null;
      return position && finiteVector(position) && positionWithinSatrecEnvelope(position, activeElement.satrec)
        ? [position.x, position.y, position.z]
        : null;
    };
    cachedPath = buildOrbitSamples({
      startMs,
      periodMs,
      maxSegments: sampleCount,
      sampleAtTime,
      adaptive: item.orbitClass === "HEO",
      toleranceKm: heoPathToleranceKm(sampleCount),
    });
    if (cachedPath.points.some((point) => !finitePathPoint(point))) throw new Error("orbit_envelope_diverged");
    inertialPathCache.set(cacheKey, cachedPath);
    trimCache(inertialPathCache, PATH_CACHE_LIMIT);
  }
  const pathPoints = [...cachedPath.points];
  if (finiteVector(exactPosition)) {
    let insertionIndex = cachedPath.times.findIndex((sampleTime) => sampleTime >= timeMs);
    if (insertionIndex < 0) insertionIndex = pathPoints.length - 1;
    insertionIndex = Math.max(1, Math.min(pathPoints.length - 1, insertionIndex));
    pathPoints.splice(insertionIndex, 0, [exactPosition.x, exactPosition.y, exactPosition.z]);
  }
  const packed = new Float32Array(pathPoints.length * PATH_POINT_STRIDE);
  packed.fill(Number.NaN);
  pathPoints.forEach((point, index) => {
    if (!point) return;
    const geodetic = geodeticPoint({ x: point[0], y: point[1], z: point[2] }, currentGmst);
    if (!geodetic) return;
    const offset = index * PATH_POINT_STRIDE;
    packed[offset] = geodetic.lon;
    packed[offset + 1] = geodetic.lat;
    packed[offset + 2] = geodetic.altitudeKm;
    packed[offset + 3] = point[0];
    packed[offset + 4] = point[1];
    packed[offset + 5] = point[2];
  });
  return packed;
}

function createSatrecSeries(item) {
  const sourceSets = Array.isArray(item?.elementSets) && item.elementSets.length
    ? item.elementSets
    : [{ epoch: item?.epoch || item?.omm?.EPOCH, omm: item?.omm }];
  const series = [];
  for (const element of sourceSets) {
    if (!element?.omm) continue;
    try {
      const satrec = json2satrec(element.omm);
      if (!satrec || satrec.error) continue;
      const epochMs = Date.parse(element.epoch || element.omm.EPOCH || "");
      if (!Number.isFinite(epochMs)) continue;
      series.push({ epochMs, satrec });
    } catch {
      // Reject only the invalid epoch; later valid sets remain usable.
    }
  }
  series.sort((a, b) => a.epochMs - b.epochMs);
  return series;
}

function selectSatrec(series, timeMs) {
  if (!Array.isArray(series) || !series.length) return null;
  const target = Number(timeMs);
  let low = 0;
  let high = series.length - 1;
  let selectedIndex = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (series[middle].epochMs > target) high = middle - 1;
    else { selectedIndex = middle; low = middle + 1; }
  }
  return series[selectedIndex];
}

function heoPathToleranceKm(sampleCount) {
  if (sampleCount >= 900) return 0.5;
  if (sampleCount >= 700) return 1;
  if (sampleCount >= 500) return 2;
  return 4;
}

function packOrbitPaths(paths) {
  const descriptors = [];
  let totalValues = 0;
  for (const path of paths) totalValues += path.points?.length || 0;
  const combined = new Float32Array(totalValues);
  let offset = 0;
  for (const path of paths) {
    const values = path.points instanceof Float32Array ? path.points : new Float32Array(0);
    combined.set(values, offset);
    descriptors.push({ id: String(path.id), offset, pointCount: values.length / PATH_POINT_STRIDE });
    offset += values.length;
  }
  return { buffer: combined.buffer, descriptors };
}

function groundMotion(current, next, deltaSeconds) {
  if (!current || !next) return { headingDeg: 0, groundSpeedKmS: 0 };
  const lat1 = current.lat * Math.PI / 180;
  const lat2 = next.lat * Math.PI / 180;
  const deltaLon = normalizeLongitudeDelta(next.lon - current.lon) * Math.PI / 180;
  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  const headingDeg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  const deltaLat = lat2 - lat1;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  const distanceKm = 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return { headingDeg, groundSpeedKmS: distanceKm / Math.max(0.001, deltaSeconds) };
}

function normalizeLongitudeDelta(value) {
  return ((value + 540) % 360) - 180;
}

function geodeticPoint(position, gmst) {
  if (!position || !finiteVector(position)) return null;
  const geodetic = eciToGeodetic(position, gmst);
  const lon = degreesLong(geodetic.longitude);
  const lat = degreesLat(geodetic.latitude);
  const altitudeKm = Number(geodetic.height);
  if (![lon, lat, altitudeKm].every(Number.isFinite)) return null;
  return { lon, lat, altitudeKm: Math.max(-20, altitudeKm) };
}

function finiteVector(value) {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function normalizeInterpolationDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration) || Math.abs(duration) < 0.001) return 1;
  return Math.sign(duration) * Math.min(1800, Math.max(0.25, Math.abs(duration)));
}

function trimCache(cache, limit) {
  while (cache.size > limit) cache.delete(cache.keys().next().value);
}
