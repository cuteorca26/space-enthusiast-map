(function attachSatelliteOrbitPolicy(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatelliteOrbitPolicy = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSatelliteOrbitPolicy() {
  "use strict";

  const PATH_POINT_STRIDE = 6;

  function normalizePathIds(ids) {
    const result = [];
    const seen = new Set();
    for (const rawId of ids || []) {
      const id = String(rawId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
    return result;
  }

  function sampleCounts(selectedCount) {
    const count = Math.max(0, Number(selectedCount) || 0);
    if (count > 20000) return { LEO: 56, MEO: 96, GEO: 128, HEO: 384 };
    if (count > 10000) return { LEO: 128, MEO: 160, GEO: 192, HEO: 512 };
    if (count > 5000) return { LEO: 96, MEO: 160, GEO: 192, HEO: 640 };
    if (count > 2000) return { LEO: 112, MEO: 192, GEO: 240, HEO: 720 };
    if (count > 800) return { LEO: 144, MEO: 224, GEO: 288, HEO: 768 };
    if (count > 300) return { LEO: 176, MEO: 256, GEO: 320, HEO: 896 };
    return { LEO: 1024, MEO: 1280, GEO: 1440, HEO: 2048 };
  }

  function refreshWallMs(selectedCount) {
    const count = Math.max(0, Number(selectedCount) || 0);
    if (count > 10000) return 30000;
    if (count > 5000) return 20000;
    if (count > 1000) return 10000;
    return 2000;
  }

  function refreshSimulationMs(selectedCount) {
    const count = Math.max(0, Number(selectedCount) || 0);
    if (count > 10000) return 2 * 60 * 60 * 1000;
    if (count > 5000) return 60 * 60 * 1000;
    if (count > 1000) return 30 * 60 * 1000;
    return 5 * 60 * 1000;
  }

  function requestTimeoutMs(selectedCount, includePaths) {
    if (!includePaths) return 8000;
    const count = Math.max(0, Number(selectedCount) || 0);
    return Math.min(90000, 12000 + Math.ceil(count / 250) * 1000);
  }

  function labelCandidateLimit(selectedCount, zoom, interactive, hardwareLimit = 960) {
    const count = Math.max(0, Number(selectedCount) || 0);
    const baseLimit = Math.max(120, Number(hardwareLimit) || 960);
    if (count <= baseLimit) return count;
    if (interactive) return Math.min(count, baseLimit, 180);
    const zoomBoost = 1 + Math.min(3.5, Math.max(0, Number(zoom) - 1) * 0.55);
    return Math.min(count, Math.round(baseLimit * zoomBoost));
  }

  function labelLimit(selectedCount, zoom, width = 1280, height = 720) {
    const count = Math.max(0, Number(selectedCount) || 0);
    const base = count > 2000 ? 18 : count > 600 ? 32 : 54;
    const zoomBoost = Math.max(0, Number(zoom) - 1) * (count > 2000 ? 17 : 13);
    const viewportScale = Math.max(0.75, Math.min(1.5, Math.sqrt(Math.max(1, width * height) / (1280 * 720))));
    return Math.min(count, 180, Math.max(base, Math.round((base + zoomBoost) * viewportScale)));
  }

  function labelSearchRadiusDeg(zoom) {
    return Math.max(2, Math.min(140, 95 / (2 ** (Math.max(-1, Number(zoom) - 1) * 0.58))));
  }

  function labelPriorityMode(zoom) {
    return Number(zoom) <= 1.55 ? "rim" : "local";
  }

  function labelScreenPriority(screenDistancePx, globeRadiusPx, zoom) {
    const distance = Math.max(0, Number(screenDistancePx) || 0);
    const radius = Math.max(1, Number(globeRadiusPx) || 1);
    if (labelPriorityMode(zoom) === "rim") {
      return Math.abs(distance - radius * 0.96);
    }
    return distance;
  }

  function orbitPathClosure(points) {
    if (!Array.isArray(points) || points.length < 3 || points.some((point) => !finitePoint(point))) {
      return { close: false, continuous: false, closureDistance: Number.NaN, threshold: Number.NaN };
    }
    const adjacentDistances = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const distance = pointDistance(points[index], points[index + 1]);
      if (distance > 1e-10) adjacentDistances.push(distance);
    }
    if (!adjacentDistances.length) {
      return { close: false, continuous: false, closureDistance: Number.NaN, threshold: Number.NaN };
    }
    adjacentDistances.sort((a, b) => a - b);
    const middle = Math.floor(adjacentDistances.length / 2);
    const medianDistance = adjacentDistances.length % 2
      ? adjacentDistances[middle]
      : (adjacentDistances[middle - 1] + adjacentDistances[middle]) / 2;
    const first = points[0];
    const last = points[points.length - 1];
    const closureDistance = pointDistance(first, last);
    const minimumRadius = Math.min(pointMagnitude(first), pointMagnitude(last));
    const twoDegreeChord = 2 * minimumRadius * Math.sin(Math.PI / 180);
    const threshold = Math.max(medianDistance * 1.75, twoDegreeChord);
    const maximumAngularStep = points.slice(1).reduce((maximum, point, index) => {
      const previous = points[index];
      const denominator = pointMagnitude(previous) * pointMagnitude(point);
      if (!(denominator > 1e-12)) return Number.POSITIVE_INFINITY;
      const cosine = Math.max(-1, Math.min(1, (
        previous.x * point.x + previous.y * point.y + previous.z * point.z
      ) / denominator));
      return Math.max(maximum, Math.acos(cosine));
    }, 0);
    // A sampled revolution remains a valid open path when perturbations or
    // rapid decay keep its endpoints apart. Reject only an actual internal
    // jump; closing the last-to-first segment is an independent decision.
    const continuous = Number.isFinite(maximumAngularStep) && maximumAngularStep <= Math.PI * 0.45;
    const alreadyClosed = closureDistance <= 1e-9;
    const close = continuous && !alreadyClosed && closureDistance <= threshold;
    return {
      close,
      continuous,
      closureDistance,
      threshold,
      medianDistance,
      maximumAngularStep,
    };
  }

  function finitePoint(point) {
    return point && [point.x, point.y, point.z].every(Number.isFinite);
  }

  function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }

  function pointMagnitude(point) {
    return Math.hypot(point.x, point.y, point.z);
  }

  return Object.freeze({
    PATH_POINT_STRIDE,
    labelCandidateLimit,
    labelLimit,
    labelPriorityMode,
    labelScreenPriority,
    labelSearchRadiusDeg,
    normalizePathIds,
    orbitPathClosure,
    refreshSimulationMs,
    refreshWallMs,
    requestTimeoutMs,
    sampleCounts,
  });
});
