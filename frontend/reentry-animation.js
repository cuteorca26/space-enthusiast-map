(function initReentryAnimation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NotamReentryAnimation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createReentryAnimationApi() {
  "use strict";

  const MAX_OBJECTS = 10;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeLongitude(value) {
    return ((Number(value) + 540) % 360) - 180;
  }

  function referenceRotationDeg(elapsedSec, earthRotationRadS = 7.292115e-5) {
    const elapsed = Number(elapsedSec) || 0;
    const rotationRate = Number(earthRotationRadS) || 0;
    return normalizeLongitude(elapsed * rotationRate * 180 / Math.PI);
  }

  function sampleReferenceLongitude(sample, offsetSec, referenceFrame, earthRotationRadS = 7.292115e-5) {
    const longitude = Number(sample?.lon) || 0;
    if (referenceFrame !== "trajectory-fixed" && referenceFrame !== "inertial") return normalizeLongitude(longitude);
    const elapsedSec = Math.max(0, Number(offsetSec) || 0) + Math.max(0, Number(sample?.elapsedSec) || 0);
    return normalizeLongitude(longitude + referenceRotationDeg(elapsedSec, earthRotationRadS));
  }

  function objectKey(trackId, stageId) {
    return `${String(trackId || "")}::${String(stageId || "")}`;
  }

  function normalizeSelection(keys, availableKeys, maximum = MAX_OBJECTS) {
    const available = new Set(availableKeys || []);
    const result = [];
    for (const key of keys || []) {
      if (!available.has(key) || result.includes(key)) continue;
      result.push(key);
      if (result.length >= maximum) break;
    }
    return result;
  }

  function objectTimelineState(globalElapsedSec, offsetSec, durationSec) {
    const offset = Math.max(0, Number(offsetSec) || 0);
    const duration = Math.max(0, Number(durationSec) || 0);
    const globalTime = Math.max(0, Number(globalElapsedSec) || 0);
    const rawLocal = globalTime - offset;
    if (rawLocal < 0) return { phase: "waiting", elapsedSec: 0, progress: 0 };
    if (rawLocal >= duration) return { phase: "complete", elapsedSec: duration, progress: duration > 0 ? 1 : 0 };
    return {
      phase: "active",
      elapsedSec: rawLocal,
      progress: duration > 0 ? clamp(rawLocal / duration, 0, 1) : 0,
    };
  }

  function timelineDuration(objects) {
    return Math.max(0, ...(objects || []).map((object) =>
      Math.max(0, Number(object.offsetSec) || 0) + Math.max(0, Number(object.durationSec) || 0)));
  }

  function alignedOffsets(objects, mode) {
    const entries = objects || [];
    if (mode === "separation") return Object.fromEntries(entries.map((entry) => [entry.key, 0]));
    const anchorFor = (entry) => {
      if (mode === "interface70") return Number(entry.interface70Sec);
      if (mode === "impact") return Number(entry.durationSec);
      return NaN;
    };
    const anchors = entries.map(anchorFor);
    const finiteAnchors = anchors.filter(Number.isFinite);
    if (!finiteAnchors.length) return Object.fromEntries(entries.map((entry) => [entry.key, Math.max(0, Number(entry.offsetSec) || 0)]));
    const target = Math.max(...finiteAnchors);
    return Object.fromEntries(entries.map((entry, index) => [
      entry.key,
      Number.isFinite(anchors[index]) ? Math.max(0, target - anchors[index]) : Math.max(0, Number(entry.offsetSec) || 0),
    ]));
  }

  function sampleBracket(times, elapsedSec) {
    const length = times?.length || 0;
    if (!length) return { lowerIndex: -1, upperIndex: -1, fraction: 0 };
    const elapsed = Number(elapsedSec) || 0;
    if (elapsed <= times[0]) return { lowerIndex: 0, upperIndex: 0, fraction: 0 };
    const lastIndex = length - 1;
    if (elapsed >= times[lastIndex]) return { lowerIndex: lastIndex, upperIndex: lastIndex, fraction: 0 };
    let low = 0;
    let high = lastIndex;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (times[middle] <= elapsed) low = middle;
      else high = middle;
    }
    const span = Math.max(1e-9, times[high] - times[low]);
    return { lowerIndex: low, upperIndex: high, fraction: clamp((elapsed - times[low]) / span, 0, 1) };
  }

  function plumeProjectionScale(apparentEarthRadiusPx, viewportMinimumPx, globeMode = true, zoom = 3) {
    if (!globeMode) return clamp(2 ** ((Number(zoom) - 3) * 0.42), 0.4, 8);
    const viewport = Math.max(1, Number(viewportMinimumPx) || 1);
    const radius = Math.max(1, Number(apparentEarthRadiusPx) || viewport * 0.5);
    return clamp(radius / (viewport * 0.5), 0.4, 8);
  }

  function plumeRibbonGeometry(points, halfWidths) {
    const centers = (points || [])
      .map((point) => ({ x: Number(point?.x), y: Number(point?.y) }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (centers.length < 2) return null;
    const widths = centers.map((_, index) => Math.max(0, Number(halfWidths?.[index]) || 0));
    const tangents = centers.map((point, index) => {
      const previous = centers[Math.max(0, index - 1)];
      const next = centers[Math.min(centers.length - 1, index + 1)];
      let dx = next.x - previous.x;
      let dy = next.y - previous.y;
      let length = Math.hypot(dx, dy);
      if (length < 1e-6 && index > 0) {
        dx = point.x - centers[index - 1].x;
        dy = point.y - centers[index - 1].y;
        length = Math.hypot(dx, dy);
      }
      return length > 1e-6 ? { x: dx / length, y: dy / length } : { x: 1, y: 0 };
    });
    const normals = tangents.map((tangent) => ({ x: -tangent.y, y: tangent.x }));
    const left = centers.map((point, index) => ({
      x: point.x + normals[index].x * widths[index],
      y: point.y + normals[index].y * widths[index],
    }));
    const right = centers.map((point, index) => ({
      x: point.x - normals[index].x * widths[index],
      y: point.y - normals[index].y * widths[index],
    }));
    const lastIndex = centers.length - 1;
    const headWidth = widths[lastIndex];
    const headTangent = tangents[lastIndex];
    const headNormal = normals[lastIndex];
    const front = {
      x: centers[lastIndex].x + headTangent.x * headWidth * 0.78,
      y: centers[lastIndex].y + headTangent.y * headWidth * 0.78,
    };
    return { centers, widths, tangents, normals, left, right, front, headTangent, headNormal };
  }

  function impactFlashState(startedAtMs, timestampMs, durationMs, animationFinished = false) {
    const startedAt = Number(startedAtMs);
    const timestamp = Number(timestampMs);
    const duration = Math.max(1, Number(durationMs) || 1);
    const ageMs = Number.isFinite(startedAt) && startedAt > 0 && Number.isFinite(timestamp)
      ? timestamp - startedAt
      : Number.POSITIVE_INFINITY;
    if (ageMs >= 0 && ageMs < duration) return { mode: "transient", ageMs };
    if (animationFinished) return { mode: "held", ageMs };
    return { mode: "idle", ageMs };
  }

  function sphereOccludesPoint(camera, point, sphereRadius = 1, endpointTolerance = 1e-4) {
    const origin = {
      x: Number(camera?.x),
      y: Number(camera?.y),
      z: Number(camera?.z),
    };
    const target = {
      x: Number(point?.x),
      y: Number(point?.y),
      z: Number(point?.z),
    };
    if (![origin.x, origin.y, origin.z, target.x, target.y, target.z].every(Number.isFinite)) return false;
    const radius = Math.max(0, Number(sphereRadius) || 0);
    if (!radius) return false;
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dz = target.z - origin.z;
    const a = dx * dx + dy * dy + dz * dz;
    if (a <= 1e-14) return false;
    const b = 2 * (origin.x * dx + origin.y * dy + origin.z * dz);
    const c = origin.x * origin.x + origin.y * origin.y + origin.z * origin.z - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant <= 0) return false;
    const firstHit = (-b - Math.sqrt(discriminant)) / (2 * a);
    const tolerance = clamp(Number(endpointTolerance) || 0, 0, 0.1);
    return firstHit > tolerance && firstHit < 1 - tolerance;
  }

  function layoutLabels(labels, viewportWidth, viewportHeight, options = {}) {
    const width = Math.max(1, Number(viewportWidth) || 1);
    const height = Math.max(1, Number(viewportHeight) || 1);
    const requested = labels || [];
    if (!requested.length) return [];
    const rawBounds = options.bounds || {};
    const left = clamp(Number(rawBounds.left) || 4, 4, Math.max(4, width - 4));
    const top = clamp(Number(rawBounds.top) || 4, 4, Math.max(4, height - 4));
    const right = clamp(Number(rawBounds.right) || width - 4, left + 1, Math.max(left + 1, width - 4));
    const bottom = clamp(Number(rawBounds.bottom) || height - 4, top + 1, Math.max(top + 1, height - 4));
    const availableWidth = Math.max(1, right - left);
    const availableHeight = Math.max(1, bottom - top);
    const previous = new Map((options.previous || []).map((placement) => [placement.id, placement]));
    const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
    const prepared = requested.map((label, index) => ({
      ...label,
      index,
      anchorX: Number(label.anchorX) || 0,
      anchorY: Number(label.anchorY) || 0,
      width: Math.min(availableWidth, Math.max(80, Number(label.width) || 190)),
      height: Math.min(availableHeight, Math.max(42, Number(label.height) || 76)),
      priority: Number(label.priority) || 0,
    }));
    const anchors = prepared.map((label) => ({ x: label.anchorX, y: label.anchorY, id: label.id }));
    const placed = [];

    for (const label of [...prepared].sort((a, b) => b.priority - a.priority || a.index - b.index)) {
      const candidates = [];
      const seen = new Set();
      const addCandidate = (x, y, kind = "near") => {
        const candidate = {
          x: clamp(x, left, Math.max(left, right - label.width)),
          y: clamp(y, top, Math.max(top, bottom - label.height)),
          kind,
        };
        const key = `${Math.round(candidate.x)},${Math.round(candidate.y)}`;
        if (seen.has(key)) return;
        seen.add(key);
        candidates.push(candidate);
      };
      const old = previous.get(label.id);
      if (old) {
        addCandidate(
          old.x + label.anchorX - (Number(old.anchorX) || label.anchorX),
          old.y + label.anchorY - (Number(old.anchorY) || label.anchorY),
          "previous",
        );
      }
      const directions = [
        [1, -1], [-1, -1], [1, 1], [-1, 1],
        [1, 0], [-1, 0], [0, -1], [0, 1],
      ];
      for (const radius of [18, 52, 96, 148, 212, 286]) {
        for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
          const [dx, dy] = directions[(directionIndex + label.index * 3) % directions.length];
          addCandidate(
            label.anchorX + dx * radius - (dx < 0 ? label.width : dx === 0 ? label.width / 2 : 0),
            label.anchorY + dy * radius - (dy < 0 ? label.height : dy === 0 ? label.height / 2 : 0),
          );
        }
      }
      const gridStepX = Math.max(88, label.width + 8);
      const gridStepY = Math.max(50, label.height + 8);
      for (let y = top; y <= Math.max(top, bottom - label.height) + 0.5; y += gridStepY) {
        for (let x = left; x <= Math.max(left, right - label.width) + 0.5; x += gridStepX) addCandidate(x, y, "grid");
        addCandidate(right - label.width, y, "grid");
      }
      addCandidate(right - label.width, bottom - label.height, "grid");

      let best = candidates[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        const centerX = candidate.x + label.width / 2;
        const centerY = candidate.y + label.height / 2;
        let score = Math.hypot(centerX - label.anchorX, centerY - label.anchorY);
        if (candidate.kind === "grid") score += 22;
        if (candidate.kind === "previous") score -= 18;
        if (
          label.anchorX >= candidate.x - 8 && label.anchorX <= candidate.x + label.width + 8 &&
          label.anchorY >= candidate.y - 8 && label.anchorY <= candidate.y + label.height + 8
        ) score += 1e8;
        for (const other of placed) {
          const overlapWidth = Math.max(0, Math.min(candidate.x + label.width, other.x + other.width) - Math.max(candidate.x, other.x));
          const overlapHeight = Math.max(0, Math.min(candidate.y + label.height, other.y + other.height) - Math.max(candidate.y, other.y));
          score += overlapWidth * overlapHeight * 1e6;
        }
        for (const anchor of anchors) {
          if (anchor.id === label.id) continue;
          if (
            anchor.x >= candidate.x - 10 && anchor.x <= candidate.x + label.width + 10 &&
            anchor.y >= candidate.y - 10 && anchor.y <= candidate.y + label.height + 10
          ) score += 2e6;
        }
        for (const point of obstacles) {
          if (
            point?.visible !== false &&
            Number(point?.x) >= candidate.x - 6 && Number(point?.x) <= candidate.x + label.width + 6 &&
            Number(point?.y) >= candidate.y - 6 && Number(point?.y) <= candidate.y + label.height + 6
          ) score += 180000;
        }
        if (old) {
          const expectedX = old.x + label.anchorX - (Number(old.anchorX) || label.anchorX);
          const expectedY = old.y + label.anchorY - (Number(old.anchorY) || label.anchorY);
          score += Math.hypot(candidate.x - expectedX, candidate.y - expectedY) * 0.42;
        }
        if (score < bestScore) {
          best = candidate;
          bestScore = score;
        }
      }
      placed.push({
        id: label.id,
        x: best.x,
        y: best.y,
        width: label.width,
        height: label.height,
        anchorX: label.anchorX,
        anchorY: label.anchorY,
        slot: label.index,
      });
    }
    return placed.sort((a, b) => a.slot - b.slot);
  }

  return {
    MAX_OBJECTS,
    alignedOffsets,
    impactFlashState,
    layoutLabels,
    normalizeSelection,
    objectKey,
    objectTimelineState,
    plumeProjectionScale,
    plumeRibbonGeometry,
    referenceRotationDeg,
    sampleBracket,
    sampleReferenceLongitude,
    sphereOccludesPoint,
    timelineDuration,
  };
});
