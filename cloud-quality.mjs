const DEFAULT_SATURATED_VALUE = 255;
const DEFAULT_MIN_COMPONENT_PIXELS = 8000;
const DEFAULT_MIN_RECTANGULAR_DENSITY = 0.55;
const DEFAULT_DOMINANT_COMPONENT_RATIO = 0.01;
const DEFAULT_DENSE_COMPONENT_RATIO = 0.9;

export function buildGmgsiInvalidMask(data, width, height, options = {}) {
  const pixelCount = Number(width) * Number(height);
  if (!data || !Number.isInteger(width) || !Number.isInteger(height) || pixelCount <= 0 || data.length !== pixelCount) {
    return { mask: null, invalidPixels: 0, regions: [] };
  }

  const saturatedValue = Number.isFinite(Number(options.saturatedValue))
    ? Number(options.saturatedValue)
    : DEFAULT_SATURATED_VALUE;
  const minimumPixels = Math.max(
    Number(options.minimumPixels) || DEFAULT_MIN_COMPONENT_PIXELS,
    Math.floor(pixelCount * 0.0005),
  );
  const minimumDensity = Number(options.minimumDensity) || DEFAULT_MIN_RECTANGULAR_DENSITY;
  const dominantPixels = Math.max(
    minimumPixels,
    Math.floor(pixelCount * (Number(options.dominantRatio) || DEFAULT_DOMINANT_COMPONENT_RATIO)),
  );
  const denseComponentRatio = Number(options.denseComponentRatio) || DEFAULT_DENSE_COMPONENT_RATIO;
  const visited = new Uint8Array(pixelCount);
  const invalid = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  const regions = [];
  let invalidPixels = 0;

  const enqueue = (index, tail) => {
    if (visited[index] || Number(data[index]) !== saturatedValue) return tail;
    visited[index] = 1;
    queue[tail] = index;
    return tail + 1;
  };

  for (let start = 0; start < pixelCount; start += 1) {
    if (visited[start] || Number(data[start]) !== saturatedValue) continue;
    let head = 0;
    let tail = 1;
    let minX = start % width;
    let maxX = minX;
    let minY = Math.floor(start / width);
    let maxY = minY;
    visited[start] = 1;
    queue[0] = start;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0) tail = enqueue(index - 1, tail);
      if (x + 1 < width) tail = enqueue(index + 1, tail);
      if (y > 0) tail = enqueue(index - width, tail);
      if (y + 1 < height) tail = enqueue(index + width, tail);
    }

    if (tail < minimumPixels) continue;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const density = tail / Math.max(1, boxWidth * boxHeight);
    const touchesEdge = minX === 0 || minY === 0 || maxX === width - 1 || maxY === height - 1;
    if (density < minimumDensity || (!touchesEdge && tail < dominantPixels)) continue;

    const fillBoundingBox = density >= denseComponentRatio;
    if (fillBoundingBox) {
      for (let y = minY; y <= maxY; y += 1) {
        const rowOffset = y * width;
        for (let x = minX; x <= maxX; x += 1) {
          const index = rowOffset + x;
          if (!invalid[index]) {
            invalid[index] = 1;
            invalidPixels += 1;
          }
        }
      }
    } else {
      for (let position = 0; position < tail; position += 1) {
        const index = queue[position];
        if (!invalid[index]) {
          invalid[index] = 1;
          invalidPixels += 1;
        }
      }
    }
    regions.push({
      pixels: tail,
      minX,
      maxX,
      minY,
      maxY,
      density,
      touchesEdge,
      fillBoundingBox,
    });
  }

  return {
    mask: invalidPixels ? invalid : null,
    invalidPixels,
    regions,
  };
}
