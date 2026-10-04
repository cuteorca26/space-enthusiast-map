// Read only the navigation axes used by the existing cloud renderer.
// Reading full latitude/longitude grids duplicates about 120 MB per frame.
export function readCloudNavigation(file, width, height) {
  const latitude = file.get('lat');
  const longitude = file.get('lon');
  for (const node of [latitude, longitude]) {
    if (node?.shape?.length !== 2 || node.shape[0] !== height || node.shape[1] !== width) {
      throw new Error('latitude/longitude navigation dimensions do not match the image grid');
    }
  }
  const column = Math.floor(width / 2);
  const latRows = Float32Array.from(latitude.slice([[], [column, column + 1]]));
  const lonColumns = Float32Array.from(longitude.slice([[0, 1], []]));
  if (latRows.length !== height || lonColumns.length !== width) throw new Error('Incomplete cloud navigation axes');
  return { latRows, lonColumns };
}
