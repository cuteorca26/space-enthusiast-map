function finitePoint(point) {
  return point && [point[0], point[1], point[2]].every(Number.isFinite);
}

function pointSegmentDistanceKm(point, start, end) {
  if (![point, start, end].every(finitePoint)) return 0;
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

function heapPush(heap, item) {
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

function heapPop(heap) {
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

function createSegment(startNode, endNode, sampleAtTime) {
  const midpointTimeMs = (startNode.timeMs + endNode.timeMs) / 2;
  const midpoint = sampleAtTime(midpointTimeMs);
  return {
    startNode,
    endNode,
    midpointTimeMs,
    midpoint,
    errorKm: pointSegmentDistanceKm(midpoint, startNode.point, endNode.point),
    active: true,
  };
}

export function buildOrbitSamples({
  startMs,
  periodMs,
  maxSegments,
  sampleAtTime,
  adaptive = false,
  toleranceKm = 2,
}) {
  const segmentLimit = Math.max(32, Math.min(2048, Math.round(Number(maxSegments) || 256)));
  if (!adaptive) {
    const times = [];
    const points = [];
    for (let index = 0; index <= segmentLimit; index += 1) {
      const timeMs = startMs + periodMs * index / segmentLimit;
      times.push(timeMs);
      points.push(sampleAtTime(timeMs));
    }
    return { times, points, maxErrorKm: Number.NaN };
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
    heapPush(heap, createSegment(nodes[index], nodes[index + 1], sampleAtTime));
  }
  let segmentCount = baseSegments;
  const targetToleranceKm = Math.max(0.05, Number(toleranceKm) || 2);
  while (segmentCount < segmentLimit && heap.length) {
    const segment = heapPop(heap);
    if (!segment?.active) continue;
    if (!(segment.errorKm > targetToleranceKm) || !finitePoint(segment.midpoint)) break;
    const midpointNode = {
      timeMs: segment.midpointTimeMs,
      point: segment.midpoint,
      next: segment.endNode,
    };
    segment.startNode.next = midpointNode;
    segment.active = false;
    heapPush(heap, createSegment(segment.startNode, midpointNode, sampleAtTime));
    heapPush(heap, createSegment(midpointNode, segment.endNode, sampleAtTime));
    segmentCount += 1;
  }

  const times = [];
  const points = [];
  let maxErrorKm = 0;
  let node = firstNode;
  while (node) {
    times.push(node.timeMs);
    points.push(node.point);
    if (node.next) {
      const midpoint = sampleAtTime((node.timeMs + node.next.timeMs) / 2);
      maxErrorKm = Math.max(maxErrorKm, pointSegmentDistanceKm(midpoint, node.point, node.next.point));
    }
    node = node.next;
  }
  return { times, points, maxErrorKm };
}
