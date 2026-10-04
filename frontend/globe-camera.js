(function initGlobeCamera(root, factory) {
  const api = factory();
  if (root) root.NotamGlobeCamera = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGlobeCameraApi() {
  "use strict";

  const DEG = Math.PI / 180;
  const EARTH_RADIUS_KM = 6378.137;
  const DEFAULT_FOV_DEG = 42;
  const MIN_GLOBE_ZOOM = -5;
  const MAX_GLOBE_ZOOM = 15;

  function createParams(view, width, height) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const lon = normalizeLon(Number(view?.lon) || 0);
    const lat = clamp(Number(view?.lat) || 0, -89.5, 89.5);
    const requestedZoom = Number(view?.zoom);
    const zoom = clamp(Number.isFinite(requestedZoom) ? requestedZoom : 2, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
    const tilt = clamp(Number(view?.globeTilt) || 0, 0, 80);
    const bearing = normalizeBearing(Number(view?.globeBearing) || 0);
    const fovDeg = clamp(Number(view?.globeFovDeg) || DEFAULT_FOV_DEG, 30, 60);
    const fovRad = fovDeg * DEG;
    const tanHalfFov = Math.tan(fovRad / 2);
    const aspect = safeWidth / safeHeight;
    const range = rangeFromZoom(zoom);
    const target = spherePoint(lon, lat, 1);
    const basis = localBasis(lon, lat);
    const bearingRad = bearing * DEG;
    const tiltRad = tilt * DEG;
    const viewNorth = normalize(add(scale(basis.north, Math.cos(bearingRad)), scale(basis.east, Math.sin(bearingRad))));
    const screenRight = normalize(add(scale(basis.east, Math.cos(bearingRad)), scale(basis.north, -Math.sin(bearingRad))));
    const cameraOffset = add(scale(basis.up, range * Math.cos(tiltRad)), scale(viewNorth, -range * Math.sin(tiltRad)));
    const camera = add(target, cameraOffset);
    const forward = normalize(subtract(target, camera));
    const screenUp = normalize(cross(screenRight, forward));
    const cameraRadius = magnitude(camera);
    const focalPx = safeHeight / (2 * tanHalfFov);
    const raw = {
      width: safeWidth,
      height: safeHeight,
      lon,
      lat,
      zoom,
      tilt,
      bearing,
      fovDeg,
      fovRad,
      tanHalfFov,
      aspect,
      range,
      target,
      camera,
      forward,
      screenRight,
      screenUp,
      viewNorth,
      localEast: basis.east,
      localNorth: basis.north,
      cameraRadius,
      focalPx,
    };
    const earthCenter = projectCartesian({ x: 0, y: 0, z: 0 }, raw, false);
    return {
      ...raw,
      cx: earthCenter.x,
      cy: earthCenter.y,
      radius: cameraRadius > 1 ? focalPx / Math.sqrt(cameraRadius * cameraRadius - 1) : Math.max(safeWidth, safeHeight),
      targetX: safeWidth / 2,
      targetY: safeHeight / 2,
    };
  }

  function rangeFromZoom(zoom) {
    return clamp(2.45 * 2 ** (-(clamp(zoom, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM) - 2) * 0.72), 0.0025, 96);
  }

  function zoomFromRange(range) {
    const normalizedRange = clamp(Number(range) || 0.0025, 0.0025, 96);
    return clamp(2 - Math.log2(normalizedRange / 2.45) / 0.72, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM);
  }

  function fitZoomForSceneRadius(sceneRadius, width, height, options = {}) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    const radius = Math.max(1, Number(sceneRadius) || 1);
    const fovDeg = clamp(Number(options.fovDeg) || DEFAULT_FOV_DEG, 30, 60);
    const frameFraction = clamp(Number(options.frameFraction) || 0.4, 0.2, 0.48);
    const focalPx = safeHeight / (2 * Math.tan((fovDeg * DEG) / 2));
    const targetRadiusPx = Math.min(safeWidth, safeHeight) * frameFraction;
    const cameraRadius = radius * Math.sqrt(1 + (focalPx / targetRadiusPx) ** 2);
    return zoomFromRange(Math.max(0.0025, cameraRadius - 1));
  }

  function project(lon, lat, altitudeKm, params) {
    const radius = 1 + Math.max(0, Number(altitudeKm) || 0) / EARTH_RADIUS_KM;
    return projectCartesian(spherePoint(lon, lat, radius), params, true);
  }

  function projectCartesian(world, params, testOcclusion = true) {
    const relative = subtract(world, params.camera);
    const depth = dot(relative, params.forward);
    if (!(depth > 1e-9)) return { x: -1e9, y: -1e9, visible: false, depth, globeZ: depth };
    const ndcX = dot(relative, params.screenRight) / (depth * params.tanHalfFov * params.aspect);
    const ndcY = dot(relative, params.screenUp) / (depth * params.tanHalfFov);
    const visible = !testOcclusion || !segmentOccludedByEarth(params.camera, world);
    return {
      x: params.width * (0.5 + ndcX * 0.5),
      y: params.height * (0.5 - ndcY * 0.5),
      visible,
      depth,
      globeZ: depth,
    };
  }

  function unproject(x, y, params) {
    const ndcX = (Number(x) / params.width) * 2 - 1;
    const ndcY = 1 - (Number(y) / params.height) * 2;
    const direction = normalize(
      add(
        params.forward,
        add(
          scale(params.screenRight, ndcX * params.tanHalfFov * params.aspect),
          scale(params.screenUp, ndcY * params.tanHalfFov),
        ),
      ),
    );
    const hit = raySphereIntersection(params.camera, direction, 1);
    if (!hit) return null;
    return vectorToLonLat(hit);
  }

  function panView(view, dx, dy, width, height) {
    const params = createParams(view, width, height);
    const bearingRad = params.bearing * DEG;
    const verticalFactor = 1 / Math.max(0.28, Math.cos(params.tilt * DEG));
    const panRange = params.zoom < 1
      ? rangeFromZoom(1) * 2 ** ((params.zoom - 1) * 0.1)
      : params.range;
    const worldUnitsPerPixel = (2 * panRange * params.tanHalfFov) / params.height;
    const screenEast = -dx * Math.cos(bearingRad) + dy * verticalFactor * Math.sin(bearingRad);
    const screenNorth = dx * Math.sin(bearingRad) + dy * verticalFactor * Math.cos(bearingRad);
    const angularDistance = Math.hypot(screenEast, screenNorth) * worldUnitsPerPixel;
    if (!(angularDistance > 0)) return { ...view };
    const heading = Math.atan2(screenEast, screenNorth);
    const destination = sphericalDestination(params.lon, params.lat, heading, angularDistance);
    return { ...view, lon: destination.lon, lat: destination.lat };
  }

  function zoomViewAt(view, nextZoom, x, y, width, height) {
    const beforeParams = createParams(view, width, height);
    const beforeAnchor = unproject(x, y, beforeParams);
    let next = { ...view, zoom: clamp(Number(nextZoom), MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM) };
    if (!beforeAnchor) return next;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const afterParams = createParams(next, width, height);
      const afterAnchor = unproject(x, y, afterParams);
      if (!afterAnchor) break;
      const targetVector = spherePoint(next.lon, next.lat, 1);
      const corrected = rotateVectorFromTo(targetVector, spherePoint(afterAnchor.lon, afterAnchor.lat, 1), spherePoint(beforeAnchor.lon, beforeAnchor.lat, 1));
      const target = vectorToLonLat(corrected);
      next = { ...next, lon: target.lon, lat: target.lat };
    }
    return next;
  }

  function segmentOccludedByEarth(camera, point) {
    const direction = subtract(point, camera);
    const a = dot(direction, direction);
    const b = 2 * dot(camera, direction);
    const c = dot(camera, camera) - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant <= 0) return false;
    const root = Math.sqrt(discriminant);
    const first = (-b - root) / (2 * a);
    const second = (-b + root) / (2 * a);
    return (first > 1e-7 && first < 0.9999) || (second > 1e-7 && second < 0.9999);
  }

  function raySphereIntersection(origin, direction, radius) {
    const b = 2 * dot(origin, direction);
    const c = dot(origin, origin) - radius * radius;
    const discriminant = b * b - 4 * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    const near = (-b - root) / 2;
    const far = (-b + root) / 2;
    const distance = near > 1e-8 ? near : far > 1e-8 ? far : NaN;
    return Number.isFinite(distance) ? add(origin, scale(direction, distance)) : null;
  }

  function rotateVectorFromTo(vector, from, to) {
    const a = normalize(from);
    const b = normalize(to);
    const cosine = clamp(dot(a, b), -1, 1);
    if (cosine > 1 - 1e-12) return vector;
    let axis = cross(a, b);
    if (magnitude(axis) < 1e-10) axis = Math.abs(a.y) < 0.9 ? cross(a, { x: 0, y: 1, z: 0 }) : cross(a, { x: 1, y: 0, z: 0 });
    return rotateAroundAxis(vector, normalize(axis), Math.acos(cosine));
  }

  function rotateAroundAxis(vector, axis, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return add(
      add(scale(vector, cosine), scale(cross(axis, vector), sine)),
      scale(axis, dot(axis, vector) * (1 - cosine)),
    );
  }

  function sphericalDestination(lonDeg, latDeg, headingRad, angularDistance) {
    const lat1 = latDeg * DEG;
    const lon1 = lonDeg * DEG;
    const sinLat1 = Math.sin(lat1);
    const cosLat1 = Math.cos(lat1);
    const sinDistance = Math.sin(angularDistance);
    const cosDistance = Math.cos(angularDistance);
    const lat2 = Math.asin(clamp(sinLat1 * cosDistance + cosLat1 * sinDistance * Math.cos(headingRad), -1, 1));
    const lon2 = lon1 + Math.atan2(Math.sin(headingRad) * sinDistance * cosLat1, cosDistance - sinLat1 * Math.sin(lat2));
    return { lon: normalizeLon(lon2 / DEG), lat: clamp(lat2 / DEG, -89.5, 89.5) };
  }

  function localBasis(lonDeg, latDeg) {
    const lon = lonDeg * DEG;
    const lat = latDeg * DEG;
    return {
      east: { x: Math.cos(lon), y: 0, z: -Math.sin(lon) },
      north: { x: -Math.sin(lat) * Math.sin(lon), y: Math.cos(lat), z: -Math.sin(lat) * Math.cos(lon) },
      up: spherePoint(lonDeg, latDeg, 1),
    };
  }

  function spherePoint(lonDeg, latDeg, radius = 1) {
    const lon = normalizeLon(Number(lonDeg) || 0) * DEG;
    const lat = clamp(Number(latDeg) || 0, -90, 90) * DEG;
    const cosLat = Math.cos(lat);
    return { x: radius * cosLat * Math.sin(lon), y: radius * Math.sin(lat), z: radius * cosLat * Math.cos(lon) };
  }

  function vectorToLonLat(vector) {
    const length = magnitude(vector) || 1;
    return {
      lon: normalizeLon(Math.atan2(vector.x, vector.z) / DEG),
      lat: clamp(Math.asin(clamp(vector.y / length, -1, 1)) / DEG, -90, 90),
    };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale(vector, scalar) {
    return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }

  function magnitude(vector) {
    return Math.hypot(vector.x, vector.y, vector.z);
  }

  function normalize(vector) {
    const length = magnitude(vector) || 1;
    return scale(vector, 1 / length);
  }

  function normalizeLon(value) {
    return ((value + 180) % 360 + 360) % 360 - 180;
  }

  function normalizeBearing(value) {
    return ((value % 360) + 360) % 360;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    EARTH_RADIUS_KM,
    MIN_GLOBE_ZOOM,
    MAX_GLOBE_ZOOM,
    createParams,
    rangeFromZoom,
    zoomFromRange,
    fitZoomForSceneRadius,
    project,
    projectCartesian,
    unproject,
    panView,
    zoomViewAt,
    spherePoint,
    vectorToLonLat,
  };
});
