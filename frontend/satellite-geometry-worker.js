importScripts("/frontend/satellite-reference.js?v=satellite-reference-4", "/frontend/satellite-orbit-policy.js?v=satellite-orbit-policy-5", "/frontend/satellite-orbit-geometry.js?v=performance-20261016-1");
const paths = new Map();
onmessage = ({ data }) => {
  try {
    for (const id of data.removeIds) paths.delete(id);
    for (const { id, path } of data.updates) { if (path) paths.set(id, path); else paths.delete(id); }
    const result = NotamSatelliteOrbitGeometry.build(data, paths);
    const transfer = [result.starts, result.ends, result.colors, result.densePositions, result.denseColors].filter(Boolean).map(array => array.buffer);
    postMessage({ result }, transfer);
  } catch (error) { postMessage({ error: error.message }); }
};
