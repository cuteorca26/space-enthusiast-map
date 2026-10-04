(function initKmlIo(root, factory) {
  const api = factory();
  if (root) root.NotamKmlIo = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createKmlIoApi() {
  "use strict";

  const KML_NAMESPACE = "http://www.opengis.net/kml/2.2";
  const GEOMETRY_NAMES = new Set(["point", "linestring", "polygon", "multigeometry", "track", "multitrack", "model"]);

  function decodeKmlArrayBuffer(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
    if (!bytes.length) return "";
    let encoding = detectTextEncoding(bytes);
    let offset = encoding.offset;
    let body = bytes.subarray(offset);
    if (encoding.name === "utf-16be" && !supportsEncoding("utf-16be")) {
      const swapped = new Uint8Array(body.length - (body.length % 2));
      for (let index = 0; index < swapped.length; index += 2) {
        swapped[index] = body[index + 1];
        swapped[index + 1] = body[index];
      }
      body = swapped;
      encoding = { name: "utf-16le", offset: 0 };
    }
    return new TextDecoder(encoding.name, { fatal: false }).decode(body).replace(/^\uFEFF/, "");
  }

  function detectTextEncoding(bytes) {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { name: "utf-8", offset: 3 };
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return { name: "utf-16le", offset: 2 };
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return { name: "utf-16be", offset: 2 };
    const probe = bytes.subarray(0, Math.min(bytes.length, 512));
    let evenZeros = 0;
    let oddZeros = 0;
    for (let index = 0; index < probe.length; index += 1) {
      if (probe[index] !== 0) continue;
      if (index % 2) oddZeros += 1;
      else evenZeros += 1;
    }
    if (oddZeros > probe.length * 0.2 && evenZeros < probe.length * 0.05) return { name: "utf-16le", offset: 0 };
    if (evenZeros > probe.length * 0.2 && oddZeros < probe.length * 0.05) return { name: "utf-16be", offset: 0 };
    const ascii = new TextDecoder("latin1").decode(probe);
    const declared = ascii.match(/<\?xml[^>]+encoding\s*=\s*["']\s*([^"']+)/i)?.[1]?.trim().toLowerCase();
    if (declared && supportsEncoding(declared)) return { name: declared, offset: 0 };
    return { name: "utf-8", offset: 0 };
  }

  function supportsEncoding(name) {
    try {
      new TextDecoder(name);
      return true;
    } catch {
      return false;
    }
  }

  function parseKml(kmlText, options = {}) {
    const ParserCtor = options.DOMParser || globalThis.DOMParser;
    if (!ParserCtor) throw new Error("当前环境没有可用的 XML 解析器");
    const parseErrors = [];
    let parser;
    try {
      parser = new ParserCtor({
        errorHandler: {
          warning: () => {},
          error: (message) => parseErrors.push(String(message)),
          fatalError: (message) => parseErrors.push(String(message)),
        },
      });
    } catch {
      parser = new ParserCtor();
    }
    const doc = parser.parseFromString(String(kmlText || ""), "application/xml");
    const browserErrors = descendants(doc, "parsererror").map((node) => node.textContent || "XML 解析失败");
    if (!doc?.documentElement || parseErrors.length || browserErrors.length) {
      throw new Error((parseErrors[0] || browserErrors[0] || "KML XML 格式无效").replace(/\s+/g, " ").trim());
    }

    const features = [];
    const placemarks = descendants(doc, "Placemark");
    for (const placemark of placemarks) {
      const name = firstDirectOrDescendantText(placemark, "name") || `KML 对象 ${features.length + 1}`;
      const description = firstDirectOrDescendantText(placemark, "description");
      const geometries = geometryChildren(placemark);
      geometries.forEach((geometry, index) => {
        if (!geometry) return;
        features.push({
          name: geometries.length > 1 ? `${name} ${index + 1}` : name,
          description,
          geometry,
        });
      });
    }

    if (!placemarks.length) {
      geometryChildren(doc.documentElement).forEach((geometry, index) => {
        if (geometry) features.push({ name: `KML 对象 ${index + 1}`, description: "", geometry });
      });
    }
    return { features, warnings: [] };
  }

  function geometryChildren(root) {
    const output = [];
    const visit = (node) => {
      for (const child of elementChildren(node)) {
        const name = localName(child);
        if (name === "placemark" && child !== root) continue;
        if (GEOMETRY_NAMES.has(name)) {
          const parsed = parseGeometryNode(child);
          if (Array.isArray(parsed)) output.push(...parsed.filter(Boolean));
          else if (parsed) output.push(parsed);
          continue;
        }
        visit(child);
      }
    };
    visit(root);
    return output;
  }

  function parseGeometryNode(node) {
    const name = localName(node);
    if (name === "multigeometry" || name === "multitrack") {
      return elementChildren(node).flatMap((child) => {
        const parsed = GEOMETRY_NAMES.has(localName(child)) ? parseGeometryNode(child) : null;
        return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      });
    }
    if (name === "point") {
      const coords = parseCoordinateTuples(firstDescendantText(node, "coordinates"));
      return coords.length ? { type: "Point", coordinates: coords[0] } : null;
    }
    if (name === "linestring") {
      const coords = parseCoordinateTuples(firstDescendantText(node, "coordinates"));
      return coords.length >= 2 ? { type: "LineString", coordinates: coords } : null;
    }
    if (name === "track") {
      const coords = descendants(node, "coord").map((coord) => parseGxCoordinate(coord.textContent)).filter(Boolean);
      if (coords.length >= 2) return { type: "LineString", coordinates: coords };
      return coords.length ? { type: "Point", coordinates: coords[0] } : null;
    }
    if (name === "polygon") {
      const outerNodes = descendants(node, "outerBoundaryIs");
      const innerNodes = descendants(node, "innerBoundaryIs");
      const outer = parseCoordinateTuples(firstDescendantText(outerNodes[0] || node, "coordinates"));
      if (outer.length < 3) return null;
      const rings = [closeRing(outer)];
      for (const innerNode of innerNodes) {
        const ring = parseCoordinateTuples(firstDescendantText(innerNode, "coordinates"));
        if (ring.length >= 3) rings.push(closeRing(ring));
      }
      return { type: "Polygon", coordinates: rings };
    }
    if (name === "model") {
      const location = descendants(node, "Location")[0] || node;
      const lon = Number(firstDescendantText(location, "longitude"));
      const lat = Number(firstDescendantText(location, "latitude"));
      const altitude = Number(firstDescendantText(location, "altitude"));
      if (!validCoordinate(lon, lat)) return null;
      return { type: "Point", coordinates: Number.isFinite(altitude) ? [lon, lat, altitude] : [lon, lat] };
    }
    return null;
  }

  function parseCoordinateTuples(text) {
    const source = String(text || "").trim();
    if (!source) return [];
    const tuples = source.includes(",") ? source.split(/\s+/) : [];
    return tuples
      .map((tuple) => {
        const values = tuple.split(",").map((value) => Number(value.trim()));
        if (!validCoordinate(values[0], values[1])) return null;
        return Number.isFinite(values[2]) ? [values[0], values[1], values[2]] : [values[0], values[1]];
      })
      .filter(Boolean);
  }

  function parseGxCoordinate(text) {
    const values = String(text || "").trim().split(/\s+/).map(Number);
    if (!validCoordinate(values[0], values[1])) return null;
    return Number.isFinite(values[2]) ? [values[0], values[1], values[2]] : [values[0], values[1]];
  }

  function validCoordinate(lon, lat) {
    return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90;
  }

  function closeRing(ring) {
    const output = ring.map((coord) => [...coord]);
    const first = output[0];
    const last = output[output.length - 1];
    if (!first || !last) return output;
    if (Math.abs(first[0] - last[0]) > 1e-10 || Math.abs(first[1] - last[1]) > 1e-10) output.push([...first]);
    return output;
  }

  function buildKml(items, options = {}) {
    const documentName = options.documentName || "NOTAM MAP 自定义坐标";
    const placemarks = (items || []).map(itemToPlacemark).filter(Boolean).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="${KML_NAMESPACE}">
  <Document>
    <name>${escapeXml(documentName)}</name>
    <Style id="notamMapCustom"><IconStyle><color>ff5ce4ff</color><scale>1.0</scale><Icon><href>http://maps.google.com/mapfiles/kml/pushpin/ylw-pushpin.png</href></Icon></IconStyle><LineStyle><color>ff5ce4ff</color><width>3</width></LineStyle><PolyStyle><color>555ce4ff</color></PolyStyle></Style>
${placemarks}
  </Document>
</kml>`;
  }

  function itemToPlacemark(item) {
    const geometry = geometryToKml(item?.geometry);
    if (!geometry) return "";
    return `    <Placemark>
      <name>${escapeXml(item?.name || "未命名坐标")}</name>
      ${item?.description ? `<description>${escapeXml(item.description)}</description>` : ""}
      <styleUrl>#notamMapCustom</styleUrl>
      ${geometry}
    </Placemark>`;
  }

  function geometryToKml(geometry) {
    if (geometry?.type === "Point") return `<Point><coordinates>${coordinateToKml(geometry.coordinates)}</coordinates></Point>`;
    if (geometry?.type === "LineString") {
      const coords = (geometry.coordinates || []).map(coordinateToKml).filter(Boolean);
      return coords.length >= 2 ? `<LineString><tessellate>1</tessellate><coordinates>${coords.join(" ")}</coordinates></LineString>` : "";
    }
    if (geometry?.type === "Polygon") {
      const rings = (geometry.coordinates || []).map((ring) => closeRing(ring || [])).filter((ring) => ring.length >= 4);
      if (!rings.length) return "";
      const outer = `<outerBoundaryIs><LinearRing><coordinates>${rings[0].map(coordinateToKml).join(" ")}</coordinates></LinearRing></outerBoundaryIs>`;
      const inners = rings.slice(1).map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${ring.map(coordinateToKml).join(" ")}</coordinates></LinearRing></innerBoundaryIs>`).join("");
      return `<Polygon><tessellate>1</tessellate>${outer}${inners}</Polygon>`;
    }
    return "";
  }

  function coordinateToKml(coord) {
    const lon = Number(coord?.[0]);
    const lat = Number(coord?.[1]);
    if (!validCoordinate(lon, lat)) return "";
    const altitude = Number(coord?.[2]);
    return `${lon.toFixed(8)},${lat.toFixed(8)},${Number.isFinite(altitude) ? altitude.toFixed(3) : "0"}`;
  }

  function descendants(root, wantedName) {
    if (!root?.getElementsByTagName) return [];
    const wanted = String(wantedName || "").toLowerCase();
    return Array.from(root.getElementsByTagName("*") || []).filter((node) => localName(node) === wanted);
  }

  function elementChildren(node) {
    return Array.from(node?.childNodes || []).filter((child) => child.nodeType === 1);
  }

  function localName(node) {
    return String(node?.localName || node?.nodeName || "").split(":").pop().toLowerCase();
  }

  function firstDescendantText(root, name) {
    return descendants(root, name)[0]?.textContent?.trim() || "";
  }

  function firstDirectOrDescendantText(root, name) {
    const wanted = String(name).toLowerCase();
    const direct = elementChildren(root).find((child) => localName(child) === wanted);
    return direct?.textContent?.trim() || firstDescendantText(root, name);
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  return {
    buildKml,
    closeRing,
    decodeKmlArrayBuffer,
    geometryToKml,
    parseCoordinateTuples,
    parseKml,
  };
});
