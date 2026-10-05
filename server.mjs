import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { downloadCloudFile, publicFilePath, runtimeSettings, sameOriginWrite } from "./deployment.mjs";
import { Agent as HttpsAgent, get as httpsGet } from "node:https";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { arch, availableParallelism, cpus, platform, release, totalmem } from "node:os";
import { basename, extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { Worker } from "node:worker_threads";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import nrlmsiseModule from "nrlmsise-00";
import { PNG } from "pngjs";
import { chromium } from "playwright-core";
import { SatelliteCatalogService } from "./satellite-catalog.mjs";
import { SatelliteHistoryService } from "./satellite-history.mjs";
import { readCloudDataset } from "./cloud-dataset.mjs";
import { MemoryBudgetQueue, dataResourceGroup } from "./memory-budget.mjs";
import { SavedRegionStore, handleSavedRegionsApi } from "./saved-regions.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
const BALLISTIC_ENGINE = require("./frontend/ballistics.js");
const { Geodesic } = require("geographiclib-geodesic");
const execFileAsync = promisify(execFile);
const { host, port, online: onlineDeployment, dataDirectory } = runtimeSettings(root);
const satelliteCatalogService = new SatelliteCatalogService(root, dataDirectory);
const satelliteHistoryService = new SatelliteHistoryService(root, dataDirectory);
const savedRegionStore = new SavedRegionStore(join(dataDirectory, "saved_regions.json"));

const TFR_LIST_URL = "https://tfr.faa.gov/tfrapi/getTfrList";
const TFR_SUMMARY_URL = "https://tfr.faa.gov/tfrapi/getSummary";
const TFR_NOSHAPE_URL = "https://tfr.faa.gov/tfrapi/noShapeTfrList";
const TFR_WEBTEXT_URL = "https://tfr.faa.gov/tfrapi/getWebText?notamId=";
const TFR_GEOJSON_URL =
  "https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=300&outputFormat=application/json&srsname=EPSG:4326";
const FAA_NOTAM_SEARCH_URL = "https://notams.aim.faa.gov/notamSearch/";
const FAA_NOTAM_SESSION_URL = `${FAA_NOTAM_SEARCH_URL}session`;
const FAA_NOTAM_SEARCH_ENDPOINT = `${FAA_NOTAM_SEARCH_URL}search`;
const FAA_NOTAM_LOCS_ENDPOINT = `${FAA_NOTAM_SEARCH_URL}locs`;
const NGA_MSI_NAV_WARNINGS_URL = "https://msi.nga.mil/NavWarnings";
const NGA_MSI_HYDROPAC_ACTIVE_URL =
  "https://msi.nga.mil/api/publications/broadcast-warn?navArea=P&status=active&output=json";
const HYDROPAC_CURRENT_TEXT_URL = "https://www.sealagom.com/coastal/21/messages/";
const HYDROPAC_ARCHIVE_TEXT_URL = "https://www.sealagom.com/coastal/21/messages/archive/";
const HYDROPAC_CURRENT_TEXT_BASE_URL = "https://www.sealagom.com";
const SEALAGOM_NAVAREA_BASE_URL = "https://www.sealagom.com";
const MSA_NAV_WARNING_URL = "https://www.msa.gov.cn/94df14ce1110415da44e67593e76619f/index.jhtml";
const MSA_BASE_URL = "https://www.msa.gov.cn";
const LAUNCH_LIBRARY_UPCOMING_URL = "https://ll.thespacedevs.com/2.2.0/launch/upcoming/";
const LAUNCH_LIBRARY_APP_URL = "https://thespacedevs.com/llapi";
const NOAA_GMGSI_BUCKET_URL = "https://noaa-gmgsi-pds.s3.amazonaws.com";
const NOAA_GMGSI_PRODUCT_PREFIX = "GMGSI_LW";
const NOAA_GMGSI_TILE_MAX_ZOOM = 7;
const NOAA_GMGSI_TIMELINE_HOURS = 48;
const NOAA_GMGSI_DISCOVERY_LOOKBACK_HOURS = 96;
const NOAA_GMGSI_MIN_SOURCE_WIDTH = 4000;
const NOAA_GMGSI_MIN_SOURCE_HEIGHT = 2000;
const NOAA_GMGSI_LAT_NORTH = 72.71540832519531;
const NOAA_GMGSI_LAT_SOUTH = -72.73677062988281;
const NOAA_GMGSI_HOLE_FILL_RADIUS = 12;
const CLOUD_TILE_SIZE = 256;
const CLOUD_GLOBE_TEXTURE_WIDTH = 2048;
const CLOUD_GLOBE_TEXTURE_HEIGHT = 1024;
const CLOUD_OVERLAY_DEFAULT_OPACITY = 0.4;
const CLOUD_GLOBE_POLAR_FADE_START_LAT = 70;
const CLOUD_GLOBE_POLAR_FADE_END_LAT = 72.5;
const CLOUD_RENDER_STYLE_VERSION = "gmgsi-geolocated-v11-artifact-mask";
const GMGSI_TIMELINE_DISK_MAX_AGE_MS = 10 * 60 * 1000;
const TRANSPARENT_CLOUD_TILE_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>');
const NOAA_GMGSI_DOWNLOAD_TIMEOUT_MS = clampIntegerEnv("NOAA_GMGSI_DOWNLOAD_TIMEOUT_MS", 90 * 1000, 15 * 1000, 5 * 60 * 1000);
const CLOUD_TILE_CACHE_MAX_ITEMS = clampIntegerEnv("CLOUD_TILE_CACHE_MAX_ITEMS", 768, 64, 4096);
const LAUNCH_LIBRARY_MAX_LAUNCHES = Number(process.env.LAUNCH_LIBRARY_MAX_LAUNCHES || 400);
const LAUNCH_LIBRARY_PAGE_SIZE = Math.min(100, Math.max(10, Number(process.env.LAUNCH_LIBRARY_PAGE_SIZE || 50)));
const MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU = clampIntegerEnv("MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU", 80, 1, 240);
const MSA_NAV_WARNING_LOOKBACK_DAYS = clampIntegerEnv("MSA_NAV_WARNING_LOOKBACK_DAYS", 180, 7, 3650);
const MSA_NAV_WARNING_DETAIL_CONCURRENCY = clampIntegerEnv("MSA_NAV_WARNING_DETAIL_CONCURRENCY", 12, 1, 48);
const NAVAREA_FETCH_CONCURRENCY = clampIntegerEnv("NAVAREA_FETCH_CONCURRENCY", 4, 1, 12);
const NAVAREA_MAX_PAGES_PER_REGION = clampIntegerEnv("NAVAREA_MAX_PAGES_PER_REGION", 8, 1, 24);
const HYDROPAC_ARCHIVE_MAX_PAGES = clampIntegerEnv("HYDROPAC_ARCHIVE_MAX_PAGES", 8, 1, 48);
const HYDROPAC_ARCHIVE_FETCH_CONCURRENCY = clampIntegerEnv("HYDROPAC_ARCHIVE_FETCH_CONCURRENCY", 4, 1, 12);
const FAA_NOTAM_PAGE_SIZE = 30;
const FAA_NOTAM_MAX_PER_FIR = Number(process.env.FAA_NOTAM_MAX_PER_FIR || 0);
const FAA_NOTAM_FIR_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_FIR_CONCURRENCY", 32, 1, 64);
const FAA_NOTAM_BATCH_SIZE = clampIntegerEnv("FAA_NOTAM_BATCH_SIZE", 12, 1, 32);
const FAA_NOTAM_ADAPTIVE_BATCH_SIZE = clampIntegerEnv("FAA_NOTAM_ADAPTIVE_BATCH_SIZE", 3, 1, 8);
const FAA_NOTAM_ADAPTIVE_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_ADAPTIVE_CONCURRENCY", 4, 1, 12);
const FAA_NOTAM_DISCOVERY_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_DISCOVERY_CONCURRENCY", 4, 1, 8);
const FAA_NOTAM_POWERSHELL_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_POWERSHELL_CONCURRENCY", 3, 1, 24);
const FAA_NOTAM_RETRY_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_RETRY_CONCURRENCY", 4, 1, 12);
const FAA_NOTAM_RETRY_DELAY_MS = clampIntegerEnv("FAA_NOTAM_RETRY_DELAY_MS", 8000, 0, 60000);
const FAA_NOTAM_POWERSHELL_STAGGER_MS = clampIntegerEnv("FAA_NOTAM_POWERSHELL_STAGGER_MS", 250, 0, 5000);
const FAA_NOTAM_REQUEST_INTERVAL_MS = clampIntegerEnv("FAA_NOTAM_REQUEST_INTERVAL_MS", 200, 0, 5000);
const FAA_NOTAM_REQUEST_RETRY_ATTEMPTS = clampIntegerEnv("FAA_NOTAM_REQUEST_RETRY_ATTEMPTS", 3, 1, 6);
const FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS = clampIntegerEnv("FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS", 5000, 250, 60000);
const FAA_NOTAM_MAX_FAILED_FIRS = clampIntegerEnv("FAA_NOTAM_MAX_FAILED_FIRS", 0, 0, 64);
const FAA_NOTAM_PAGE_DELAY_MS = clampIntegerEnv("FAA_NOTAM_PAGE_DELAY_MS", 0, 0, 5000);
const FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS = clampIntegerEnv("FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS", 200, 0, 5000);
const FAA_NOTAM_FETCH_TIMEOUT_MS = clampIntegerEnv("FAA_NOTAM_FETCH_TIMEOUT_MS", 30000, 5000, 60000);
const FAA_NOTAM_POWERSHELL_TIMEOUT_MS = clampIntegerEnv("FAA_NOTAM_POWERSHELL_TIMEOUT_MS", 20 * 60 * 1000, 60 * 1000, 45 * 60 * 1000);
const FAA_NOTAM_BROWSER_CONCURRENCY = clampIntegerEnv("FAA_NOTAM_BROWSER_CONCURRENCY", 8, 1, 16);
const FAA_NOTAM_BROWSER_TIMEOUT_MS = clampIntegerEnv("FAA_NOTAM_BROWSER_TIMEOUT_MS", 90 * 1000, 30 * 1000, 5 * 60 * 1000);
const FAA_NOTAM_TRANSPORT = normalizeFaaNotamTransport(process.env.FAA_NOTAM_TRANSPORT || "auto");
const FAA_NOTAM_DISCOVER_GLOBAL_FIRS = process.env.FAA_NOTAM_DISCOVER_GLOBAL_FIRS !== "0";
const FAA_NOTAM_DISCOVERY_TERMS = (process.env.FAA_NOTAM_DISCOVERY_TERMS || "FIR,ARTCC,ACC,CENTRE,CENTER,OCEANIC,OCA,CERAP")
  .split(",")
  .map((term) => term.trim())
  .filter(Boolean);
const FAA_GLOBAL_FIR_GROUP = {
  id: "faa-global-fir",
  label: "FAA 全球 FIR/ARTCC",
};

const MSA_TEMPORAL_PARSE_VERSION = "msa-time-20260830-v3";

const FAA_NOTAM_GROUPS = [
  {
    id: "china",
    label: "中国 FIR",
    codes: [
      "ZBPE",
      "ZYSH",
      "ZSHA",
      "ZGZU",
      "ZJSA",
      "ZHWH",
      "ZLHW",
      "ZPKM",
      "ZWUQ",
    ],
  },
  {
    id: "china-nearby",
    label: "中国周边国家/地区 FIR",
    codes: [
      "VHHK",
      "VMMC",
      "RCAA",
      "RKRR",
      "RJJJ",
      "ZKKP",
      "ZMUB",
      "UAAA",
      "UCFM",
      "UTSD",
      "UTAA",
      "UTDD",
      "VNSM",
      "VQPR",
      "VECF",
      "VIDF",
      "VABF",
      "VOMF",
      "VECC",
      "VGFR",
      "VCCF",
      "VRMF",
      "OPKR",
      "OAKX",
      "VYYF",
      "VLVT",
      "VTBB",
      "VVHM",
      "VVHN",
      "VDPP",
      "WSJC",
      "WMFC",
      "WIIF",
      "WAAF",
      "RPHI",
    ],
  },
  {
    id: "russia",
    label: "俄罗斯地区 FIR",
    country: "Russia Region",
    codes: [
      "UUWV",
      "ULLL",
      "URRV",
      "UWWW",
      "USDD",
      "UIII",
      "UEEE",
      "ULAA",
      "UMKK",
      "UERP",
      "UHHH",
      "UHMM",
      "UHPP",
      "UHSS",
      "UHMA",
      "UHBB",
      "UNKL",
      "UNNT",
      "USSS",
      "USCC",
      "USTR",
    ],
  },
  {
    id: "pacific",
    label: "太平洋地区 FIR",
    codes: [
      "CZVR",
      "CZEG",
      "KZAK",
      "PAZA",
      "PHZH",
      "PGZU",
      "RJJJ",
      "RPHI",
      "WSJC",
      "WIIF",
      "WAAF",
      "YBBB",
      "YMMM",
      "NFFF",
      "NZZC",
      "NZZO",
      "NTTT",
      "AGGG",
      "ANAU",
      "AYPM",
      "NWWW",
      "NSTU",
      "PTKK",
      "PTPN",
      "PTRO",
      "NVVV",
      "NSFA",
      "NFTF",
      "NGTA",
      "NCRG",
      "NIUE",
      "PLCH",
      "PKMJ",
      "PWAK",
      "MMFR",
      "MHCC",
      "MHTG",
      "MPZL",
      "SKED",
      "SKEC",
      "SEFG",
      "SPIM",
      "SCFZ",
      "SCTZ",
      "SCIZ",
      "SAEF",
      "SACF",
    ],
  },
  {
    id: "indian-ocean",
    label: "印度洋及周边 FIR",
    codes: [
      "YMMM",
      "WIIF",
      "WAAF",
      "VOMF",
      "VCCF",
      "VRMF",
      "FIMM",
      "FMMM",
      "FSSS",
      "HCSM",
      "HKNA",
      "HTDC",
      "OOMM",
      "OIIX",
      "OKAC",
      "OMAE",
      "OBBB",
      "OEJD",
      "OTDF",
      "ORBB",
      "OYSC",
      "HAAA",
      "HECC",
      "FQBE",
      "FAJA",
      "FACA",
    ],
  },
];

const FAA_NOTAM_REQUIRED_FIRS = [...new Set(FAA_NOTAM_GROUPS.flatMap((group) => group.codes))];

const NAVAREA_WARNING_REGIONS = [
  { id: "12", roman: "XII", label: "NAVAREA XII", coordinator: "United States / NGA", ngaNavArea: "12" },
  { id: "11", roman: "XI", label: "NAVAREA XI", coordinator: "Japan" },
  { id: "13", roman: "XIII", label: "NAVAREA XIII", coordinator: "Russian Federation" },
  { id: "4", roman: "IV", label: "NAVAREA IV", coordinator: "United States / NGA", ngaNavArea: "4" },
  { id: "8", roman: "VIII", label: "NAVAREA VIII", coordinator: "India" },
  { id: "1", roman: "I", label: "NAVAREA I", coordinator: "United Kingdom" },
  { id: "2", roman: "II", label: "NAVAREA II", coordinator: "France" },
];

const aggregateCache = new Map();
const aggregateInFlight = new Map();
const aggregateRefreshResults = new Map();
const aggregateRefreshStartedAt = new Map();
let satelliteRefreshJob = null;
let satelliteRefreshStartedAt = "";
let satelliteRefreshResult = null;
const hydropacCache = new Map();
const hydropacInFlight = new Map();
const hydropacHistoryCache = new Map();
const hydropacHistoryInFlight = new Map();
const msaWarningCache = new Map();
const msaWarningInFlight = new Map();
const navareaWarningCache = new Map();
const navareaWarningInFlight = new Map();
const launchCache = new Map();
const launchInFlight = new Map();
const cloudSatelliteCache = new Map();
const cloudTileCache = new Map();
const cloudDatasetCache = new Map();
const cloudDatasetInFlight = new Map();
const detailCache = new Map();
let jsonResponseCache = new WeakMap();
let refreshHistoryIndexCache = null;
let faaNotamNextRequestAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;
const CLOUD_SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOUD_TILE_CACHE_TTL_MS = 8 * 60 * 1000;
const DISK_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const HYDROPAC_DISK_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const HYDROPAC_ALL_DISK_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MSA_NAV_WARNING_DISK_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const NAVAREA_WARNING_DISK_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LAUNCH_DISK_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 30 * 60 * 1000;
const FAA_NOTAM_PARSE_MIGRATION_VERSION = "parse-20260908-source-order-boundaries-v30";
const AREA_PARSE_MIGRATION_VERSION = "area-20260908-source-order-boundaries-v33";
const MARINE_TEMPORAL_PARSE_VERSION = "marine-time-20260830-v7";
const REFRESH_HISTORY_LIST_LIMIT = 500;
const AGGREGATE_CACHE_FILE = join(dataDirectory, "faa_notam_cache.json");
const FAA_NOTAM_SNAPSHOT_DIR = join(dataDirectory, "faa_notam_snapshots");
const HYDROPAC_SNAPSHOT_DIR = join(dataDirectory, "hydropac_snapshots");
const MSA_NAV_WARNING_SNAPSHOT_DIR = join(dataDirectory, "msa_nav_warning_snapshots");
const NAVAREA_WARNING_SNAPSHOT_DIR = join(dataDirectory, "navarea_warning_snapshots");
const SATELLITE_SNAPSHOT_DIR = join(dataDirectory, "satellite_catalog_snapshots");
const FAA_NOTAM_FIR_CACHE_FILE = join(dataDirectory, "faa_fir_designators_cache.json");
const HYDROPAC_CACHE_FILE = join(dataDirectory, "nga_hydropac_cache.json");
const HYDROPAC_ALL_CACHE_FILE = join(dataDirectory, "nga_hydropac_all_cache.json");
const MSA_NAV_WARNING_CACHE_FILE = join(dataDirectory, "msa_nav_warning_cache.json");
const NAVAREA_WARNING_CACHE_FILE = join(dataDirectory, "navarea_warning_cache.json");
const SATELLITE_CACHE_FILE = join(dataDirectory, "satellite_catalog_cache.json");
const LAUNCH_CACHE_FILE = join(dataDirectory, "launch_forecast_cache.json");
const GMGSI_TIMELINE_CACHE_FILE = join(dataDirectory, "cloud_cache", "gmgsi_timeline_cache.json");
const REFRESH_HISTORY_INDEX_FILE = join(dataDirectory, "refresh_history_index.json");
let nrlmsiseRuntimePromise = null;
const msaHttpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: MSA_NAV_WARNING_DETAIL_CONCURRENCY });
const BALLISTIC_WORKER_COUNT = clampIntegerEnv(
  "BALLISTIC_WORKERS",
  Math.min(6, Math.max(1, availableParallelism())),
  1,
  8,
);
let ballisticWorkerPool = null;
const memoryBudget = new MemoryBudgetQueue({
  enabled: onlineDeployment && process.env.MEMORY_BUDGET_MODE !== "0",
  release: async () => {
    for (const cache of [aggregateCache, hydropacCache, hydropacHistoryCache, msaWarningCache,
      navareaWarningCache, launchCache, cloudSatelliteCache, cloudTileCache, cloudDatasetCache, detailCache]) cache.clear();
    satelliteCatalogService.memory = null;
    jsonResponseCache = new WeakMap();
    // Let the previous response and background result handlers finish first.
    await new Promise(resolve => setImmediate(resolve));
    globalThis.gc?.();
  },
});

class BallisticWorkerPool {
  constructor(size) {
    this.queue = [];
    this.slots = Array.from({ length: size }, (_, index) => ({ index, worker: null, task: null }));
    for (const slot of this.slots) this.spawn(slot);
  }

  spawn(slot) {
    const worker = new Worker(new URL("./ballistics-worker.mjs", import.meta.url), { type: "module" });
    slot.worker = worker;
    slot.task = null;
    worker.unref();
    worker.on("message", (message) => {
      if (slot.worker !== worker || !slot.task || message?.id !== slot.task.id) return;
      const task = slot.task;
      slot.task = null;
      worker.unref();
      if (message.ok) task.resolve(message.payload);
      else task.reject(new Error(message.error || "ballistic_worker_failed"));
      this.pump();
    });
    worker.on("error", (error) => this.failWorker(slot, worker, error));
    worker.on("exit", (code) => {
      if (slot.worker === worker && code !== 0) this.failWorker(slot, worker, new Error(`ballistic_worker_exit_${code}`));
    });
  }

  failWorker(slot, worker, error) {
    if (slot.worker !== worker) return;
    const task = slot.task;
    slot.worker = null;
    slot.task = null;
    if (task) task.reject(error);
    this.spawn(slot);
    this.pump();
  }

  run(input) {
    return new Promise((resolve, reject) => {
      this.queue.push({ id: randomUUID(), input, resolve, reject });
      this.pump();
    });
  }

  pump() {
    for (const slot of this.slots) {
      if (!this.queue.length) break;
      if (!slot.worker || slot.task) continue;
      const task = this.queue.shift();
      slot.task = task;
      slot.worker.ref();
      slot.worker.postMessage({ id: task.id, input: task.input, workerIndex: slot.index });
    }
  }
}

function getBallisticWorkerPool() {
  if (!ballisticWorkerPool) ballisticWorkerPool = new BallisticWorkerPool(BALLISTIC_WORKER_COUNT);
  return ballisticWorkerPool;
}

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
]);

function resolvePath(urlPath) {
  return publicFilePath(root, urlPath);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (req.method === "GET" && url.pathname === "/deployment-config.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      res.end(`window.APP_DEPLOYMENT=${JSON.stringify({ online: onlineDeployment })};`);
      return;
    }
    if (["POST", "DELETE", "PUT", "PATCH"].includes(req.method) && !sameOriginWrite(req)) {
      sendJson(res, 403, { error: "cross_origin_write" });
      return;
    }
    if (onlineDeployment && url.pathname.startsWith("/api/saved-regions")) {
      sendJson(res, 409, { error: "Online saved regions use this browser's storage" });
      return;
    }
    if (await handleSavedRegionsApi(req, res, url, savedRegionStore)) return;
    if (url.pathname.startsWith("/api/")) {
      await memoryBudget.run(dataResourceGroup(url.pathname), () => handleApi(req, res, url), {
        fresh: url.searchParams.get("refresh") === "1",
      });
      return;
    }

    if (!["GET", "HEAD"].includes(req.method)) {
      sendText(res, 405, "Method not allowed");
      return;
    }
    const filePath = resolvePath(req.url || "/");
    if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
      sendText(res, 404, "Not found");
      return;
    }

    const extension = extname(filePath).toLowerCase();
    const cacheControl = [".html", ".js", ".mjs", ".css"].includes(extension)
      ? "no-cache, must-revalidate"
      : "public, max-age=86400";
    res.writeHead(200, {
      "content-type": mime.get(extension) || "application/octet-stream",
      "cache-control": cacheControl,
    });
    if (req.method === "HEAD") res.end();
    else createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(`Request failed: ${req.method || "GET"} ${req.url || "/"}`, error instanceof Error ? error.stack || error.message : String(error));
    sendJson(res, Number(error?.status) || 500, {
      error: "server_error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/system-profile") {
    sendJson(res, 200, await getLocalSystemProfile());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/restrictions") {
    const includeDetails = url.searchParams.get("details") !== "0";
    const refresh = url.searchParams.get("refresh") === "1";
    const waitForRefresh = url.searchParams.get("wait") === "1";
    const statusOnly = url.searchParams.get("status") === "1";
    const includeGlobalNotams = url.searchParams.get("globalNotams") !== "0";
    const includeTfr = url.searchParams.get("tfr") === "1";
    if (statusOnly) {
      sendJson(res, 200, getRestrictionsStatus({ includeDetails, includeGlobalNotams, includeTfr }));
      return;
    }
    const payload = await getRestrictions({ includeDetails, refresh, waitForRefresh, includeGlobalNotams, includeTfr });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/hydropac") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getHydropacWarnings({ refresh });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/hydropac-history") {
    const date = url.searchParams.get("date");
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getHydropacHistoryForDate({ date, refresh });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/msa-warnings") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getMsaNavWarnings({ refresh });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/navarea-warnings") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getNavareaWarnings({ refresh });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/refresh-history") {
    sendJson(res, 200, buildRefreshHistoryList());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/refresh-history/item") {
    const source = url.searchParams.get("source");
    const id = url.searchParams.get("id");
    const snapshot = readRefreshHistoryItem(source, id);
    if (!snapshot) {
      sendJson(res, 404, { error: "history_item_not_found" });
      return;
    }
    sendJson(res, 200, snapshot);
    return;
  }

  if (req.method === "DELETE" && url.pathname === "/api/refresh-history/item") {
    const source = url.searchParams.get("source");
    const id = url.searchParams.get("id");
    const deleted = deleteRefreshHistoryItem(source, id);
    if (!deleted.ok) {
      sendJson(res, deleted.status || 400, { error: deleted.error || "history_delete_failed" });
      return;
    }
    sendJson(res, 200, { deleted: { source: deleted.source, id: deleted.id }, history: buildRefreshHistoryList() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/launches") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getLaunchForecasts({ refresh });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/satellites") {
    const refresh = url.searchParams.get("refresh") === "1";
    const waitForRefresh = url.searchParams.get("wait") === "1";
    const statusOnly = url.searchParams.get("status") === "1";
    if (statusOnly) {
      sendJson(res, 200, await getSatelliteRefreshStatus());
      return;
    }
    if (refresh && !waitForRefresh) {
      const payload = await satelliteCatalogService.getCatalog({ refresh: false });
      const started = startBackgroundSatelliteRefresh();
      sendJson(res, 200, withBackgroundSatelliteRefresh(payload, started ? "started" : "running"));
      return;
    }
    let payload = await refreshSatelliteCatalogAndPersist({ refresh });
    if (!refresh && satelliteRefreshJob) payload = withBackgroundSatelliteRefresh(payload, "running");
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/satellites/history-status") {
    sendJson(res, 200, satelliteHistoryService.status());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/satellites/history") {
    const body = await readRequestBody(req);
    if (Buffer.byteLength(body, "utf8") > 256 * 1024) {
      sendJson(res, 413, { error: "satellite_history_request_too_large", message: "历史轨道请求过大" });
      return;
    }
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_satellite_history_json", message: "历史轨道请求格式无效" });
      return;
    }
    try {
      const payload = await satelliteHistoryService.getElements({
        targetTimeMs: input.targetTimeMs,
        ids: input.ids,
        identity: input.identity,
        password: input.password,
      });
      sendJson(res, 200, payload);
    } catch (error) {
      sendJson(res, Number(error?.status) || 500, {
        error: String(error?.code || "satellite_history_failed"),
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cloud-satellite") {
    const refresh = url.searchParams.get("refresh") === "1";
    const payload = await getCloudSatelliteInfo({
      refresh,
      slot: url.searchParams.get("slot"),
      hour: url.searchParams.get("hour"),
    });
    sendJson(res, 200, payload);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/cloud-satellite/globe-texture") {
    await sendCloudSatelliteGlobeTexture(res, url.searchParams);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/cloud-satellite/tile/")) {
    await sendCloudSatelliteTile(res, url.pathname, url.searchParams);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/sources") {
    sendJson(res, 200, buildSourceDescription());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/notam/parse") {
    const body = await readRequestBody(req);
    const parsed = parseNotamText(body);
    sendJson(res, 200, {
      parsed,
      restriction: buildImportedNotamRestriction({ text: body }, 0),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ballistics/propagate") {
    const body = await readRequestBody(req);
    if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
      sendJson(res, 413, { error: "ballistic_request_too_large" });
      return;
    }
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_ballistic_json" });
      return;
    }
    const payload = await propagateNrlmsiseBallisticInWorker(input);
    sendJson(res, payload.result.valid ? 200 : 400, payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ballistics/propagate-batch") {
    const body = await readRequestBody(req);
    if (Buffer.byteLength(body, "utf8") > 768 * 1024) {
      sendJson(res, 413, { error: "ballistic_batch_request_too_large" });
      return;
    }
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_ballistic_json" });
      return;
    }
    const items = Array.isArray(input.items) ? input.items.slice(0, 10) : [];
    if (!items.length) {
      sendJson(res, 400, { error: "ballistic_batch_empty" });
      return;
    }
    const results = await Promise.all(items.map(async (item) => {
      try {
        const payload = await propagateNrlmsiseBallisticInWorker(item);
        return { ok: Boolean(payload.result?.valid), payload };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }));
    sendJson(res, 200, { results, workerCount: BALLISTIC_WORKER_COUNT });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ballistics/solve-target") {
    const body = await readRequestBody(req);
    if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
      sendJson(res, 413, { error: "ballistic_request_too_large" });
      return;
    }
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_ballistic_json" });
      return;
    }
    const payload = await solveBallisticImpactTarget(input);
    sendJson(res, payload.solution?.valid ? 200 : 422, payload);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ballistics/max-range") {
    const body = await readRequestBody(req);
    if (Buffer.byteLength(body, "utf8") > 64 * 1024) {
      sendJson(res, 413, { error: "ballistic_request_too_large" });
      return;
    }
    let input;
    try {
      input = JSON.parse(body || "{}");
    } catch {
      sendJson(res, 400, { error: "invalid_ballistic_json" });
      return;
    }
    const payload = await maximizeBallisticGroundRange(input);
    sendJson(res, payload.solution?.valid ? 200 : 422, payload);
    return;
  }

  sendJson(res, 404, { error: "api_not_found" });
}

let localGpuAdaptersPromise = null;

async function getLocalSystemProfile() {
  const processors = cpus();
  const model = String(processors.find((item) => item?.model)?.model || "").trim();
  if (!localGpuAdaptersPromise) localGpuAdaptersPromise = readLocalGpuAdapters();
  const gpuAdapters = await localGpuAdaptersPromise;
  return {
    cpu: {
      model,
      logicalCores: processors.length || availableParallelism(),
      availableParallelism: availableParallelism(),
    },
    memoryGB: Math.round(totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    platform: platform(),
    architecture: arch(),
    release: release(),
    gpuAdapters,
  };
}

async function readLocalGpuAdapters() {
  try {
    if (process.platform === "win32") {
      const script = [
        "$ErrorActionPreference='Stop'",
        "$items=Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion",
        "$items | ConvertTo-Json -Compress",
      ].join(";");
      const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
        timeout: 5000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      });
      const parsed = JSON.parse(stdout.trim() || "[]");
      return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
        name: String(item?.Name || "").trim(),
        memoryBytes: Number(item?.AdapterRAM) || 0,
        driverVersion: String(item?.DriverVersion || "").trim(),
      })).filter((item) => item.name);
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("system_profiler", ["SPDisplaysDataType", "-json"], { timeout: 5000, maxBuffer: 4 * 1024 * 1024 });
      const parsed = JSON.parse(stdout || "{}");
      return (parsed.SPDisplaysDataType || []).map((item) => ({
        name: String(item.sppci_model || item._name || "").trim(),
        memoryText: String(item.spdisplays_vram || item.spdisplays_vram_shared || "").trim(),
      })).filter((item) => item.name);
    }
    const { stdout } = await execFileAsync("lspci", ["-mm", "-nn"], { timeout: 4000, maxBuffer: 1024 * 1024 });
    return String(stdout || "").split(/\r?\n/)
      .filter((line) => /VGA compatible controller|3D controller|Display controller/i.test(line))
      .map((line) => ({ name: line.replace(/^\S+\s+/, "").replace(/\s+/g, " ").trim() }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

async function propagateNrlmsiseBallistic(input = {}) {
  const startedAt = performance.now();
  const environment = normalizeNrlmsiseEnvironment(input.environment);
  if (!nrlmsiseRuntimePromise) nrlmsiseRuntimePromise = nrlmsiseModule();
  const runtime = await nrlmsiseRuntimePromise;
  const model = new runtime.NrlmsiseModel();
  let evaluationCount = 0;
  try {
    const densityProvider = ({ altitudeM, latDeg, lonDeg, elapsedSec }) => {
      if (altitudeM >= 1000000) return { densityKgM3: 0, temperatureK: null, source: "nrlmsise00" };
      const instant = new Date(environment.epochMs + elapsedSec * 1000);
      const startOfYear = Date.UTC(instant.getUTCFullYear(), 0, 1);
      const dayOfYear = Math.floor((Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()) - startOfYear) / 86400000) + 1;
      const secondsUtc = instant.getUTCHours() * 3600 + instant.getUTCMinutes() * 60 + instant.getUTCSeconds() + instant.getUTCMilliseconds() / 1000;
      const localSolarTime = ((secondsUtc / 3600 + lonDeg / 15) % 24 + 24) % 24;
      model.run_model(
        dayOfYear,
        secondsUtc,
        Math.max(0, altitudeM) / 1000,
        latDeg,
        lonDeg,
        localSolarTime,
        environment.f107Average,
        environment.f107Daily,
        environment.ap,
      );
      evaluationCount += 1;
      return {
        densityKgM3: Math.max(0, Number(model.TotalMassDensity) || 0),
        temperatureK: Number.isFinite(Number(model.TemperatureAtAlt)) ? Number(model.TemperatureAtAlt) : null,
        source: "nrlmsise00",
      };
    };
    const result = BALLISTIC_ENGINE.propagateStage({
      ...sanitizeBallisticPropagationOptions(input.options),
      atmosphereModel: "nrlmsise00",
      densityProvider,
    });
    return {
      result,
      environment: {
        model: "NRLMSISE-00",
        epochUtc: new Date(environment.epochMs).toISOString(),
        f107Daily: environment.f107Daily,
        f107Average: environment.f107Average,
        ap: environment.ap,
        evaluationCount,
        computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
      },
    };
  } finally {
    model.delete();
  }
}

async function propagateNrlmsiseBallisticInWorker(input = {}) {
  return propagateBallisticInWorker(input, "nrlmsise00");
}

async function propagateBallisticInWorker(input = {}, requestedAtmosphereModel = null) {
  const atmosphereModel = requestedAtmosphereModel === "standard1976" || input.options?.atmosphereModel === "standard1976"
    ? "standard1976"
    : "nrlmsise00";
  const safeInput = {
    options: {
      ...sanitizeBallisticPropagationOptions(input.options),
      atmosphereModel,
    },
    environment: input.environment || {},
  };
  try {
    return await getBallisticWorkerPool().run(safeInput);
  } catch {
    if (atmosphereModel === "standard1976" || safeInput.options.dragEnabled === false) {
      const startedAt = performance.now();
      return {
        result: BALLISTIC_ENGINE.propagateStage(safeInput.options),
        environment: {
          model: safeInput.options.dragEnabled === false ? "disabled" : "1976 Standard Atmosphere",
          evaluationCount: 0,
          workerIndex: -1,
          computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
        },
      };
    }
    return propagateNrlmsiseBallistic(safeInput);
  }
}

async function solveBallisticImpactTarget(input = {}) {
  const startedAt = performance.now();
  const options = sanitizeBallisticPropagationOptions(input.options);
  const atmosphereModel = input.options?.atmosphereModel === "standard1976" ? "standard1976" : "nrlmsise00";
  const environment = normalizeNrlmsiseEnvironment(input.environment);
  const target = {
    latDeg: clampEnvironmentNumber(input.target?.latDeg, NaN, -90, 90),
    lonDeg: normalizeTargetLongitude(input.target?.lonDeg),
  };
  if (!Number.isFinite(target.latDeg) || !Number.isFinite(target.lonDeg)) {
    return { solution: { valid: false, message: "目标落点坐标无效" }, target };
  }

  const solution = await numericallySolveImpactTarget({
    options,
    target,
    solveMode: input.solveMode === "heading-angle" ? "heading-angle" : "heading-speed",
    toleranceM: clampEnvironmentNumber(input.toleranceM, 1000, 10, 500000),
    atmosphereModel,
    environment,
    maxEvaluations: clampEnvironmentNumber(input.maxEvaluations, 220, 64, 320),
  });
  const { result, atmosphereEvaluations, ...publicSolution } = solution;
  return {
    solution: publicSolution,
    target,
    result: result || null,
    environment: {
      model: atmosphereModel === "nrlmsise00" ? "NRLMSISE-00" : "1976 Standard Atmosphere",
      epochUtc: new Date(environment.epochMs).toISOString(),
      f107Daily: environment.f107Daily,
      f107Average: environment.f107Average,
      ap: environment.ap,
      workerCount: BALLISTIC_WORKER_COUNT,
      atmosphereEvaluations: atmosphereEvaluations || 0,
      computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
    },
  };
}

async function maximizeBallisticGroundRange(input = {}) {
  const startedAt = performance.now();
  const options = sanitizeBallisticPropagationOptions(input.options);
  const atmosphereModel = input.options?.atmosphereModel === "standard1976" ? "standard1976" : "nrlmsise00";
  const environment = normalizeNrlmsiseEnvironment(input.environment);
  let model = null;
  const atmosphereCounter = { count: 0 };
  try {
    let densityProvider = null;
    if (atmosphereModel === "nrlmsise00" && options.dragEnabled !== false) {
      if (!nrlmsiseRuntimePromise) nrlmsiseRuntimePromise = nrlmsiseModule();
      const runtime = await nrlmsiseRuntimePromise;
      model = new runtime.NrlmsiseModel();
      densityProvider = createNrlmsiseDensityProvider(model, environment, atmosphereCounter);
    }
    const optimized = BALLISTIC_ENGINE.maximizeGroundRange(
      {
        ...options,
        atmosphereModel,
        densityProvider,
      },
      {
        minimumAngleDeg: -89,
        maximumAngleDeg: 89,
        coarseStepDeg: clampEnvironmentNumber(input.coarseStepDeg, 5, 1, 20),
        angleToleranceDeg: clampEnvironmentNumber(input.angleToleranceDeg, 0.025, 0.005, 1),
        maxEvaluations: clampEnvironmentNumber(input.maxEvaluations, 64, 24, 120),
      },
    );
    const { result, ...solution } = optimized;
    return {
      solution,
      result: result || null,
      environment: {
        model: atmosphereModel === "nrlmsise00" ? "NRLMSISE-00" : "1976 Standard Atmosphere",
        epochUtc: new Date(environment.epochMs).toISOString(),
        f107Daily: environment.f107Daily,
        f107Average: environment.f107Average,
        ap: environment.ap,
        atmosphereEvaluations: atmosphereCounter.count,
        computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
      },
    };
  } finally {
    model?.delete();
  }
}

async function numericallySolveImpactTarget({ options, target, solveMode, toleranceM, atmosphereModel, environment, maxEvaluations }) {
  const startLatDeg = Number(options.startLatDeg);
  const startLonDeg = Number(options.startLonDeg);
  if (!Number.isFinite(startLatDeg) || !Number.isFinite(startLonDeg)) {
    return { valid: false, message: "分离点坐标无效", evaluations: 0 };
  }
  const targetGeodesic = Geodesic.WGS84.Inverse(startLatDeg, startLonDeg, target.latDeg, target.lonDeg);
  const targetBearingDeg = normalizeTargetHeading(targetGeodesic.azi1);
  const targetDistanceM = Math.max(0, Number(targetGeodesic.s12) || 0);
  const currentParameter = solveMode === "heading-angle"
    ? clampEnvironmentNumber(options.flightPathAngleDeg, 20, -89, 89)
    : clampEnvironmentNumber(options.initialSpeedMps, 2500, 50, 20000);
  const bounds = solveMode === "heading-angle" ? [-89, 89] : [50, 20000];
  let evaluations = 0;
  let batches = 0;
  let atmosphereEvaluations = 0;
  const evaluated = new Map();

  const normalizedPoint = (headingDeg, parameter, precision = "search") => {
    const heading = normalizeTargetHeading(headingDeg);
    const boundedParameter = Math.min(bounds[1], Math.max(bounds[0], Number(parameter)));
    return {
      headingDeg: heading,
      parameter: boundedParameter,
      precision,
      cacheKey: `${precision}:${heading.toFixed(7)}:${boundedParameter.toFixed(7)}`,
    };
  };
  const budgetCandidate = (point) => ({
    ...point,
    score: Number.POSITIVE_INFINITY,
    errorM: null,
    residualEastM: null,
    residualNorthM: null,
    result: null,
  });
  const evaluateBatch = async (rawPoints, precision = "search") => {
    const points = rawPoints.map(([headingDeg, parameter]) => normalizedPoint(headingDeg, parameter, precision));
    const uniquePending = [];
    const pendingKeys = new Set();
    for (const point of points) {
      if (evaluated.has(point.cacheKey) || pendingKeys.has(point.cacheKey)) continue;
      pendingKeys.add(point.cacheKey);
      uniquePending.push(point);
    }
    const permitted = uniquePending.slice(0, Math.max(0, maxEvaluations - evaluations));
    if (permitted.length) {
      evaluations += permitted.length;
      batches += 1;
      const values = await Promise.all(permitted.map(async (point) => {
        const highPrecision = precision === "final";
        const existingPositionTolerance = Number(options.positionToleranceM);
        const existingVelocityTolerance = Number(options.velocityToleranceMps);
        const existingRelativeTolerance = Number(options.relativeTolerance);
        const existingMinimumStep = Number(options.minimumStepSec);
        const existingMaximumStep = Number(options.maximumStepSec);
        const propagationOptions = {
          ...options,
          headingDeg: point.headingDeg,
          atmosphereModel,
          outputStepSec: highPrecision ? Math.max(0.25, Number(options.outputStepSec) || 4) : Math.max(12, Number(options.outputStepSec) || 4),
          positionToleranceM: Math.min(Number.isFinite(existingPositionTolerance) ? existingPositionTolerance : 0.05, highPrecision ? 0.005 : 0.05),
          velocityToleranceMps: Math.min(Number.isFinite(existingVelocityTolerance) ? existingVelocityTolerance : 0.00005, highPrecision ? 0.000005 : 0.00005),
          relativeTolerance: Math.min(Number.isFinite(existingRelativeTolerance) ? existingRelativeTolerance : 1e-10, highPrecision ? 1e-11 : 1e-10),
          minimumStepSec: Math.min(Number.isFinite(existingMinimumStep) ? existingMinimumStep : 0.1, highPrecision ? 0.02 : 0.05),
          maximumStepSec: Math.min(Number.isFinite(existingMaximumStep) ? existingMaximumStep : 8, highPrecision ? 4 : 8),
          maxIntegrationSteps: Math.max(500000, Number(options.maxIntegrationSteps) || 0),
          ...(solveMode === "heading-angle"
            ? { flightPathAngleDeg: point.parameter }
            : { initialSpeedMps: point.parameter }),
        };
        try {
          const payload = await propagateBallisticInWorker({ options: propagationOptions, environment }, atmosphereModel);
          atmosphereEvaluations += Math.max(0, Number(payload.environment?.evaluationCount) || 0);
          const result = payload.result;
          if (!result?.valid || !result.impact) return { ...budgetCandidate(point), score: 100000000, result };
          const residual = ballisticImpactTargetResidual(target, result.impact);
          return {
            ...point,
            score: residual.distanceM,
            errorM: residual.distanceM,
            residualEastM: residual.eastM,
            residualNorthM: residual.northM,
            result,
          };
        } catch {
          return { ...budgetCandidate(point), score: 100000000 };
        }
      }));
      values.forEach((value) => evaluated.set(value.cacheKey, value));
    }
    return points.map((point) => evaluated.get(point.cacheKey) || budgetCandidate(point));
  };

  const parameterSeeds = inverseTargetParameterSeeds(solveMode, currentParameter, targetDistanceM, Number(options.flightPathAngleDeg));
  const headingSeeds = [-24, -10, 0, 10, 24].map((offset) => targetBearingDeg + offset);
  let best = { score: Number.POSITIVE_INFINITY, result: null, headingDeg: targetBearingDeg, parameter: currentParameter };
  const seedCandidates = await evaluateBatch(
    headingSeeds.flatMap((heading) => parameterSeeds.map((parameter) => [heading, parameter])),
  );
  for (const candidate of seedCandidates) if (candidate.score < best.score) best = candidate;

  const solverToleranceM = Math.min(toleranceM, 25);
  let headingStep = Math.max(0.08, Math.min(3, best.score / Math.max(25000, targetDistanceM) * 57.2958));
  let parameterStep = solveMode === "heading-angle"
    ? Math.max(0.08, Math.min(3, headingStep))
    : Math.max(2, Math.min(240, best.parameter * 0.015));
  let damping = 0.002;
  let iterations = 0;
  while (best.result?.impact && evaluations < maxEvaluations - 6 && iterations < 18 && best.score > solverToleranceM) {
    iterations += 1;
    const derivatives = await evaluateBatch([
      [best.headingDeg + headingStep, best.parameter],
      [best.headingDeg - headingStep, best.parameter],
      [best.headingDeg, best.parameter + parameterStep],
      [best.headingDeg, best.parameter - parameterStep],
    ]);
    const [headingPlus, headingMinus, parameterPlus, parameterMinus] = derivatives;
    const derivativeValid = [headingPlus, headingMinus, parameterPlus, parameterMinus]
      .every((candidate) => Number.isFinite(candidate.residualEastM) && Number.isFinite(candidate.residualNorthM));
    let proposals = [];
    if (derivativeValid) {
      const j11 = (headingPlus.residualEastM - headingMinus.residualEastM) / 2;
      const j21 = (headingPlus.residualNorthM - headingMinus.residualNorthM) / 2;
      const j12 = (parameterPlus.residualEastM - parameterMinus.residualEastM) / 2;
      const j22 = (parameterPlus.residualNorthM - parameterMinus.residualNorthM) / 2;
      const a11 = j11 * j11 + j21 * j21;
      const a12 = j11 * j12 + j21 * j22;
      const a22 = j12 * j12 + j22 * j22;
      const scale = Math.max(1, a11 + a22);
      const dampedA11 = a11 + damping * scale;
      const dampedA22 = a22 + damping * scale;
      const b1 = -(j11 * best.residualEastM + j21 * best.residualNorthM);
      const b2 = -(j12 * best.residualEastM + j22 * best.residualNorthM);
      const determinant = dampedA11 * dampedA22 - a12 * a12;
      if (Math.abs(determinant) > 1e-12 * scale * scale) {
        const headingUnits = Math.min(4, Math.max(-4, (b1 * dampedA22 - b2 * a12) / determinant));
        const parameterUnits = Math.min(4, Math.max(-4, (dampedA11 * b2 - a12 * b1) / determinant));
        for (const fraction of [1, 0.5, 0.25]) {
          proposals.push([
            best.headingDeg + headingUnits * headingStep * fraction,
            best.parameter + parameterUnits * parameterStep * fraction,
          ]);
        }
      }
    }
    if (!proposals.length) {
      proposals = [
        [best.headingDeg + headingStep, best.parameter + parameterStep],
        [best.headingDeg + headingStep, best.parameter - parameterStep],
        [best.headingDeg - headingStep, best.parameter + parameterStep],
        [best.headingDeg - headingStep, best.parameter - parameterStep],
      ];
    }
    const corrected = await evaluateBatch(proposals);
    const next = corrected.reduce((currentBest, candidate) => candidate.score < currentBest.score ? candidate : currentBest, best);
    if (next.score + 0.001 < best.score) {
      best = next;
      damping = Math.max(1e-7, damping * 0.35);
      headingStep = Math.max(0.004, Math.min(3, headingStep * 1.12));
      parameterStep = Math.max(solveMode === "heading-angle" ? 0.004 : 0.25, parameterStep * 1.08);
    } else {
      damping = Math.min(1e7, damping * 8);
      headingStep *= 0.5;
      parameterStep *= 0.5;
      if (headingStep < 0.002 && parameterStep < (solveMode === "heading-angle" ? 0.002 : 0.25)) break;
    }
  }

  if (!best.result?.impact) {
    return {
      valid: false,
      converged: false,
      message: "在当前速度、倾角、传播时限和搜索范围内没有找到可落地解",
      solveMode,
      evaluations,
      batches,
      iterations,
      targetDistanceM,
      targetBearingDeg,
      atmosphereEvaluations,
    };
  }
  const [finalCandidate] = await evaluateBatch([[best.headingDeg, best.parameter]], "final");
  if (finalCandidate?.result?.impact) best = finalCandidate;
  return {
    valid: true,
    converged: best.score <= toleranceM,
    message: best.score <= toleranceM ? "反算已收敛" : "已找到最接近解，但尚未达到误差阈值",
    solveMode,
    headingDeg: best.headingDeg,
    initialSpeedMps: solveMode === "heading-speed" ? best.parameter : Number(options.initialSpeedMps),
    flightPathAngleDeg: solveMode === "heading-angle" ? best.parameter : Number(options.flightPathAngleDeg),
    errorM: best.errorM,
    toleranceM,
    evaluations,
    batches,
    iterations,
    parallelism: BALLISTIC_WORKER_COUNT,
    algorithm: "parallel-seeded-differential-correction",
    finalHighPrecisionPropagation: true,
    targetDistanceM,
    targetBearingDeg,
    impact: best.result.impact,
    result: best.result,
    atmosphereEvaluations,
  };
}

function ballisticImpactTargetResidual(target, impact) {
  const inverse = Geodesic.WGS84.Inverse(target.latDeg, target.lonDeg, impact.lat, impact.lon);
  const distanceM = Math.max(0, Number(inverse.s12) || 0);
  const azimuthRad = (Number(inverse.azi1) || 0) * Math.PI / 180;
  return {
    distanceM,
    eastM: Math.sin(azimuthRad) * distanceM,
    northM: Math.cos(azimuthRad) * distanceM,
  };
}

function inverseTargetParameterSeeds(solveMode, current, targetDistanceM, flightPathAngleDeg) {
  if (solveMode === "heading-angle") {
    return [...new Set([current, -20, -10, 0, 10, 20, 30, 42, 55, 68].map((value) => Math.min(89, Math.max(-89, value)).toFixed(4)))].map(Number);
  }
  const theta = Math.abs((Number(flightPathAngleDeg) || 20) * Math.PI / 180);
  const rangeFactor = Math.max(0.08, Math.abs(Math.sin(2 * theta)));
  const vacuumEstimate = Math.sqrt(Math.max(1, targetDistanceM) * 9.80665 / rangeFactor);
  return [...new Set([
    current,
    current * 0.7,
    current * 1.3,
    vacuumEstimate * 0.72,
    vacuumEstimate,
    vacuumEstimate * 1.28,
    7800,
    10500,
  ].map((value) => Math.min(20000, Math.max(50, value)).toFixed(3)))].map(Number);
}

function createNrlmsiseDensityProvider(model, environment, counter = { count: 0 }) {
  return ({ altitudeM, latDeg, lonDeg, elapsedSec }) => {
    if (altitudeM >= 1000000) return { densityKgM3: 0, temperatureK: null, source: "nrlmsise00" };
    const instant = new Date(environment.epochMs + elapsedSec * 1000);
    const startOfYear = Date.UTC(instant.getUTCFullYear(), 0, 1);
    const dayOfYear = Math.floor((Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate()) - startOfYear) / 86400000) + 1;
    const secondsUtc = instant.getUTCHours() * 3600 + instant.getUTCMinutes() * 60 + instant.getUTCSeconds() + instant.getUTCMilliseconds() / 1000;
    const localSolarTime = ((secondsUtc / 3600 + lonDeg / 15) % 24 + 24) % 24;
    model.run_model(
      dayOfYear,
      secondsUtc,
      Math.max(0, altitudeM) / 1000,
      latDeg,
      lonDeg,
      localSolarTime,
      environment.f107Average,
      environment.f107Daily,
      environment.ap,
    );
    counter.count += 1;
    return {
      densityKgM3: Math.max(0, Number(model.TotalMassDensity) || 0),
      temperatureK: Number.isFinite(Number(model.TemperatureAtAlt)) ? Number(model.TemperatureAtAlt) : null,
      source: "nrlmsise00",
    };
  };
}

function normalizeTargetLongitude(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number + 180) % 360 + 360) % 360 - 180 : NaN;
}

function normalizeTargetHeading(value) {
  const number = Number(value);
  return Number.isFinite(number) ? ((number % 360) + 360) % 360 : 0;
}

function normalizeNrlmsiseEnvironment(value = {}) {
  const parsedEpoch = Date.parse(value.epochUtc || "");
  return {
    epochMs: Number.isFinite(parsedEpoch) ? parsedEpoch : Date.now(),
    f107Daily: clampEnvironmentNumber(value.f107Daily, 150, 50, 400),
    f107Average: clampEnvironmentNumber(value.f107Average, 150, 50, 400),
    ap: clampEnvironmentNumber(value.ap, 4, 0, 400),
  };
}

function sanitizeBallisticPropagationOptions(value = {}) {
  const allowed = [
    "startLatDeg",
    "startLonDeg",
    "startAltitudeM",
    "headingDeg",
    "flightPathAngleDeg",
    "initialSpeedMps",
    "dragEnabled",
    "ballisticCoefficientKgM2",
    "noseRadiusM",
    "liftToDragRatio",
    "bankAngleDeg",
    "maxTimeSec",
    "outputStepSec",
    "minimumStepSec",
    "maximumStepSec",
    "positionToleranceM",
    "velocityToleranceMps",
    "relativeTolerance",
    "maxIntegrationSteps",
    "escapeRadiusM",
  ];
  return Object.fromEntries(allowed.filter((key) => Object.prototype.hasOwnProperty.call(value, key)).map((key) => [key, value[key]]));
}

function clampEnvironmentNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function restrictionsCacheKey({ includeDetails, includeGlobalNotams, includeTfr }) {
  const detailTier = includeTfr && includeDetails ? "full" : "fast";
  const discoveryKey = FAA_NOTAM_DISCOVER_GLOBAL_FIRS ? `discover:${FAA_NOTAM_DISCOVERY_TERMS.join("+")}` : "seeded";
  const limitKey = `max:${FAA_NOTAM_MAX_PER_FIR || "all"}`;
  return [
    "v20",
    detailTier,
    includeGlobalNotams ? "global" : "noglobal",
    includeTfr ? "tfr" : "notfr",
    discoveryKey,
    limitKey,
  ].join(":");
}

async function getRestrictions({ includeDetails, refresh, waitForRefresh, includeGlobalNotams, includeTfr }) {
  const cacheKey = restrictionsCacheKey({ includeDetails, includeGlobalNotams, includeTfr });
  if (refresh && !waitForRefresh) {
    const cachedForRefresh = readAggregateDiskCache(cacheKey, { allowExpired: true, allowStaleVersion: true });
    if (cachedForRefresh) {
      const started = startBackgroundRestrictionsRefresh(cacheKey, { includeDetails, includeGlobalNotams, includeTfr });
      return withBackgroundRefreshStatus(cachedForRefresh, started ? "started" : "running");
    }
  }
  const cached = aggregateCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) {
    return aggregateInFlight.has(cacheKey) ? withBackgroundRefreshStatus(cached.data, "running") : cached.data;
  }
  if (!refresh) {
    const diskCached = readAggregateDiskCache(cacheKey, { allowExpired: true, allowStaleVersion: true });
    if (diskCached) {
      aggregateCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: diskCached });
      return aggregateInFlight.has(cacheKey) ? withBackgroundRefreshStatus(diskCached, "running") : diskCached;
    }
    const sourceStatus = buildSourceDescription();
    return {
      generatedAt: new Date().toISOString(),
      faaNotamFetchedAt: null,
      dataVersion: cacheKey,
      faaNotamParseMigrationVersion: FAA_NOTAM_PARSE_MIGRATION_VERSION,
      restrictions: [],
      filters: buildFilters([]),
      sources: {
        tfr: {
          status: "disabled",
          message: "FAA TFR feed is disabled; this view shows NOTAM Search records only.",
          urls: sourceStatus.tfr.urls,
        },
        faaNotamSearch: {
          status: "empty",
          message: "No saved FAA NOTAM cache is available. Use the refresh button to start a manual full refresh.",
          urls: sourceStatus.faaNotamSearch.urls,
          cacheOnly: true,
          groups: FAA_NOTAM_GROUPS.map((group) => ({ id: group.id, label: group.label, codes: group.codes })),
        },
        importedNotams: {
          status: "disabled",
          message: "Imported NOTAM data was not loaded because no local FAA cache is available.",
        },
      },
    };
  }
  const inFlight = aggregateInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildRestrictionsPayload({ includeDetails, includeGlobalNotams, includeTfr }, cacheKey).finally(() => {
    aggregateInFlight.delete(cacheKey);
  });
  aggregateInFlight.set(cacheKey, request);
  return request;
}

function getRestrictionsStatus({ includeDetails, includeGlobalNotams, includeTfr }) {
  const cacheKey = restrictionsCacheKey({ includeDetails, includeGlobalNotams, includeTfr });
  const cached = aggregateCache.get(cacheKey)?.data || readAggregateDiskCache(cacheKey, { allowExpired: true, allowStaleVersion: true });
  const source = cached?.sources?.faaNotamSearch || {};
  const fetchedAt = source.fetchedAt || cached?.faaNotamFetchedAt || source.cacheSavedAt || cached?.cacheSavedAt || cached?.generatedAt || "";
  const refreshStartedAt = aggregateRefreshStartedAt.get(cacheKey) || "";

  return {
    dataVersion: cached?.dataVersion || cacheKey,
    restrictionsCount: cached?.restrictions?.length || 0,
    generatedAt: cached?.generatedAt || "",
    faaNotamFetchedAt: fetchedAt,
    cacheSavedAt: cached?.cacheSavedAt || "",
    sourceStatus: source.status || "unknown",
    sourceMessage: source.message || "",
    cacheFallback: Boolean(source.cacheFallback),
    backgroundRefresh: {
      active: aggregateInFlight.has(cacheKey),
      status: aggregateInFlight.has(cacheKey) ? "running" : "idle",
      startedAt: refreshStartedAt,
      elapsedMs: refreshStartedAt ? Math.max(0, Date.now() - Date.parse(refreshStartedAt)) : 0,
    },
    refreshConfig: {
      transport: FAA_NOTAM_TRANSPORT,
      directConcurrency: FAA_NOTAM_FIR_CONCURRENCY,
      browserConcurrency: FAA_NOTAM_BROWSER_CONCURRENCY,
      batchSize: FAA_NOTAM_BATCH_SIZE,
      adaptiveBatchSize: FAA_NOTAM_ADAPTIVE_BATCH_SIZE,
      adaptiveConcurrency: FAA_NOTAM_ADAPTIVE_CONCURRENCY,
      discoveryConcurrency: FAA_NOTAM_DISCOVERY_CONCURRENCY,
      requestIntervalMs: FAA_NOTAM_REQUEST_INTERVAL_MS,
      pageRetryAttempts: FAA_NOTAM_REQUEST_RETRY_ATTEMPTS,
      powershellRecoveryConcurrency: FAA_NOTAM_POWERSHELL_CONCURRENCY,
      powershellPageDelayMs: FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS,
      maxFailedFirs: FAA_NOTAM_MAX_FAILED_FIRS,
      publishOnlyWhenComplete: FAA_NOTAM_MAX_FAILED_FIRS === 0,
    },
    lastBackgroundRefresh: aggregateRefreshResults.get(cacheKey) || null,
  };
}

function startBackgroundRestrictionsRefresh(cacheKey, args) {
  if (aggregateInFlight.has(cacheKey)) return false;
  aggregateRefreshResults.delete(cacheKey);
  aggregateRefreshStartedAt.set(cacheKey, new Date().toISOString());
  const request = memoryBudget.run("notam", () => buildRestrictionsPayload(args, cacheKey), { fresh: true })
    .then((data) => {
      const source = data?.sources?.faaNotamSearch || {};
      const success = source.status === "ok" && !source.cacheFallback;
      aggregateRefreshResults.set(cacheKey, {
        status: success ? "success" : "error",
        finishedAt: new Date().toISOString(),
        fetchedAt: data?.faaNotamFetchedAt || source.fetchedAt || "",
        restrictionsCount: data?.restrictions?.length || 0,
        message: success
          ? "FAA NOTAM 后台刷新完成。"
          : source.message || "FAA NOTAM 后台刷新未能取得实时数据，当前继续显示最近一次完整缓存。",
      });
      return data;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      aggregateRefreshResults.set(cacheKey, {
        status: "error",
        finishedAt: new Date().toISOString(),
        fetchedAt: "",
        restrictionsCount: 0,
        message,
      });
      console.warn("FAA NOTAM background refresh failed:", message);
      return null;
    })
    .finally(() => {
      aggregateInFlight.delete(cacheKey);
      aggregateRefreshStartedAt.delete(cacheKey);
    });
  aggregateInFlight.set(cacheKey, request);
  return true;
}

function withBackgroundRefreshStatus(data, status) {
  const cacheKey = data?.dataVersion || "";
  const startedAt = aggregateRefreshStartedAt.get(cacheKey) || new Date().toISOString();
  const source = data.sources?.faaNotamSearch || {};
  return {
    ...data,
    sources: {
      ...data.sources,
      faaNotamSearch: {
        ...source,
        status: "warn",
        message:
          status === "started"
            ? `FAA NOTAM 后台刷新已启动，当前先显示本地完整缓存。${source.message || ""}`
            : `FAA NOTAM 后台刷新仍在进行，当前先显示本地完整缓存。${source.message || ""}`,
        backgroundRefresh: {
          active: true,
          status,
          startedAt,
        },
      },
    },
  };
}

async function buildRestrictionsPayload({ includeDetails, includeGlobalNotams, includeTfr }, cacheKey) {
  const generatedAt = new Date().toISOString();
  const sourceStatus = buildSourceDescription();
  let tfrPayload = {
    restrictions: [],
    source: {
      status: includeTfr ? "error" : "disabled",
      message: includeTfr ? "FAA TFR feed was not loaded." : "FAA TFR feed is disabled; this view shows NOTAM Search records only.",
      urls: sourceStatus.tfr.urls,
    },
  };

  if (includeTfr) {
    try {
      tfrPayload = await loadFaaTfrRestrictions(includeDetails);
    } catch (error) {
      tfrPayload.source.message = error instanceof Error ? error.message : String(error);
    }
  }

  let faaNotamPayload = {
    restrictions: [],
    source: includeGlobalNotams
      ? {
          status: "error",
          message: "FAA NOTAM Search live fetch was not loaded.",
          urls: sourceStatus.faaNotamSearch.urls,
          groups: FAA_NOTAM_GROUPS.map((group) => ({ id: group.id, label: group.label, codes: group.codes })),
        }
      : {
          status: "disabled",
          message: "FAA NOTAM Search live fetch is disabled for this request.",
          urls: sourceStatus.faaNotamSearch.urls,
        },
  };

  if (includeGlobalNotams) {
    try {
      faaNotamPayload = await fetchFaaNotamSearchPayload();
    } catch (error) {
      console.warn(`[FAA NOTAM refresh] ${error instanceof Error ? error.message : String(error)}`);
      faaNotamPayload = cachedFaaNotamPayload(cacheKey, error) || faaNotamPayload;
      if (!faaNotamPayload.source.cacheFallback) {
        faaNotamPayload.source.message = error instanceof Error ? error.message : String(error);
      }
    }
  }

  const importedPayload = loadImportedNotams();
  const restrictions = [
    ...tfrPayload.restrictions,
    ...faaNotamPayload.restrictions,
    ...importedPayload.restrictions,
  ].sort(compareRestrictions);
  const faaNotamFetchedAt = faaNotamPayload.source?.fetchedAt || faaNotamPayload.source?.cacheSavedAt || null;
  const data = {
    generatedAt,
    faaNotamFetchedAt,
    dataVersion: cacheKey,
    faaNotamParseMigrationVersion: FAA_NOTAM_PARSE_MIGRATION_VERSION,
    restrictions,
    filters: buildFilters(restrictions),
    sources: {
      tfr: tfrPayload.source,
      faaNotamSearch: faaNotamPayload.source,
      importedNotams: importedPayload.source,
    },
  };
  const displayData = filterPayloadToReferenceTime("notam", data, faaNotamFetchedAt || generatedAt, "live-refresh");

  const liveSource = displayData?.sources?.faaNotamSearch || {};
  if (liveSource.status === "ok" && !liveSource.cacheFallback) {
    const persistedData = writeAggregateDiskCache(cacheKey, displayData);
    if (!persistedData) {
      throw new Error("FAA NOTAM refresh completed, but the complete cache and history snapshot could not be saved; keeping the previous cache.");
    }
    aggregateCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: persistedData });
    return persistedData;
  }
  return displayData;
}

function readAggregateDiskCache(cacheKey, options = {}) {
  try {
    if (!existsSync(AGGREGATE_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(AGGREGATE_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (!savedAt) return null;
    const staleVersion = cached.cacheKey !== cacheKey;
    if (staleVersion && !options.allowStaleVersion) return null;
    if (!options.allowExpired && Date.now() - savedAt > DISK_CACHE_MAX_AGE_MS) return null;
    if (!cached.data?.restrictions?.length) return null;
    if (!cached.data.dataVersion) cached.data.dataVersion = cached.cacheKey || cacheKey;
    cached.data.cacheSavedAt = cached.savedAt;
    if (!cached.data.faaNotamFetchedAt) {
      cached.data.faaNotamFetchedAt = cached.data.sources?.faaNotamSearch?.fetchedAt || cached.savedAt || cached.data.generatedAt;
    }
    if (cached.data.sources?.faaNotamSearch && !cached.data.sources.faaNotamSearch.fetchedAt) {
      cached.data.sources.faaNotamSearch.fetchedAt = cached.data.faaNotamFetchedAt;
    }
    if (staleVersion) {
      cached.data = markAggregateCacheStaleVersion(cached.data, cached.cacheKey, cacheKey, cached.savedAt);
    }
    const migration = migrateCachedNotamParseResults(cached.data);
    if (migration.changed) {
      cached.data = migration.data;
      writeMigratedAggregateDiskCache(cached);
    }
    return filterPayloadToReferenceTime("notam", cached.data, cached.data.faaNotamFetchedAt || cached.savedAt || cached.data.generatedAt, "disk-cache");
  } catch {
    return null;
  }
}

function migrateCachedNotamParseResults(data) {
  if (!data?.restrictions?.length && !data?.skipped?.length) return { data, changed: false };
  if (data.faaNotamParseMigrationVersion === FAA_NOTAM_PARSE_MIGRATION_VERSION) return { data, changed: false };

  let reparsed = 0;
  let changedItems = 0;
  let promotedToDrawable = 0;
  let demotedFromDrawable = 0;
  const cachedItems = [...(data.restrictions || []), ...(data.skipped || [])];
  const beforeDrawable = cachedItems.filter((item) => item?.hasGeometry).length;
  const restrictions = cachedItems.map((item) => {
    if (!isCachedLiveFaaNotamRestriction(item) || !item?.rawText) return item;
    reparsed += 1;
    const parsed = parseNotamText(item.rawText);
    const parsedGeometry = parsed.geometry || null;
    const nextGeometry = parsedGeometry || null;
    const nextHasGeometry = Boolean(nextGeometry);
    const inferredCountry = countryFromFacility(parsed.facility || item.region || item.facility);
    const next = {
      ...item,
      beginsAt: parsed.beginAt || item.beginsAt || null,
      endsAt: parsed.endAt || item.endsAt || null,
      timeLabel: parsed.timeLabel || item.timeLabel || null,
      altitude: parsed.altitude || item.altitude || null,
      radiusNm: parsed.radiusNm || item.radiusNm || null,
      center: parsed.center || centroidFromGeometry(nextGeometry) || item.center || null,
      country: inferredCountry !== "Unknown" ? inferredCountry : item.country || inferredCountry,
      geometry: nextGeometry,
      hasGeometry: nextHasGeometry,
      geometrySource: parsedGeometry ? parsed.geometrySource || "NOTAM body coordinate boundary" : null,
      geometryReason: parsedGeometry
        ? parsed.geometryReason || parsed.geometrySource || "Boundary geometry parsed."
        : parsed.geometryReason || item.geometryReason || "No parsed boundary geometry.",
      coordinateCount: parsed.coordinateCount ?? 0,
      boundaryCoordinateCount: parsed.boundaryCoordinateCount ?? 0,
      sourceBoundaryCoordinateCount: parsed.sourceBoundaryCoordinateCount ?? 0,
      polygonGroupCount: parsed.polygonGroupCount ?? 0,
      rejectedPolygonGroupCount: parsed.rejectedPolygonGroupCount || 0,
      geometryComplete: parsed.geometryComplete,
      polygonGroupValidationReasons: parsed.polygonGroupValidationReasons || [],
    };
    const geometryChanged = JSON.stringify(item.geometry || null) !== JSON.stringify(next.geometry || null);
    const statusChanged = Boolean(item.hasGeometry) !== next.hasGeometry;
    const countryChanged = String(item.country || "") !== String(next.country || "");
    const reasonChanged = String(item.geometryReason || "") !== String(next.geometryReason || "");
    const coverageChanged =
      Number(item.boundaryCoordinateCount || 0) !== Number(next.boundaryCoordinateCount || 0) ||
      Number(item.sourceBoundaryCoordinateCount || 0) !== Number(next.sourceBoundaryCoordinateCount || 0) ||
      Number(item.polygonGroupCount || 0) !== Number(next.polygonGroupCount || 0) ||
      Number(item.rejectedPolygonGroupCount || 0) !== Number(next.rejectedPolygonGroupCount || 0) ||
      item.geometryComplete !== next.geometryComplete;
    if (geometryChanged || statusChanged || countryChanged || reasonChanged || coverageChanged) {
      changedItems += 1;
      if (!item.hasGeometry && next.hasGeometry) promotedToDrawable += 1;
      if (item.hasGeometry && !next.hasGeometry) demotedFromDrawable += 1;
      return next;
    }
    return item;
  });

  const afterDrawable = restrictions.filter((item) => item?.hasGeometry).length;
  const migratedSourceMessage = String(data.sources?.faaNotamSearch?.message || "").replace(
    /;\s*\d+\s+have parsed boundary geometry;/i,
    `; ${afterDrawable} have parsed boundary geometry;`,
  );
  const migrated = {
    ...data,
    restrictions,
    ...(data.skipped ? { skipped: [] } : {}),
    filters: buildFilters(restrictions),
    faaNotamParseMigrationVersion: FAA_NOTAM_PARSE_MIGRATION_VERSION,
    faaNotamParseMigration: {
      version: FAA_NOTAM_PARSE_MIGRATION_VERSION,
      appliedAt: new Date().toISOString(),
      reparsed,
      changedItems,
      promotedToDrawable,
      demotedFromDrawable,
      beforeDrawable,
      afterDrawable,
    },
    sources: {
      ...data.sources,
      faaNotamSearch: {
        ...data.sources?.faaNotamSearch,
        message: migratedSourceMessage || data.sources?.faaNotamSearch?.message,
        drawableCount: afterDrawable,
        localParseMigration: {
          version: FAA_NOTAM_PARSE_MIGRATION_VERSION,
          reparsed,
          changedItems,
          promotedToDrawable,
          demotedFromDrawable,
          beforeDrawable,
          afterDrawable,
        },
      },
    },
  };
  return { data: migrated, changed: true };
}

function migrateCachedAreaParseResults(source, data) {
  if (!data || typeof data !== "object") return { data, changed: false };
  if (data.areaParseMigrationVersion === AREA_PARSE_MIGRATION_VERSION) return { data, changed: false };
  const typeBySource = { hydropac: "HYDROPAC", msa: "中国航警", navarea: "NAVAREA" };
  const labelBySource = {
    hydropac: "NGA MSI HYDROPAC warning",
    msa: "中国海事局航行警告",
    navarea: "NAVAREA navigational warnings",
  };
  const sourceMeta = data.source || {};
  const items = [];
  const seen = new Set();
  const cachedItems = [...(data.restrictions || []), ...(data.skipped || [])];
  const marineScheduleRawByKey = new Map();
  if (source === "hydropac" || source === "navarea") {
    for (const item of cachedItems) {
      const key = marineScheduleGroupKey(item);
      const scheduleRawText = String(item?.scheduleRawText || item?.rawText || "");
      if (!key || !scheduleRawText) continue;
      const existing = marineScheduleRawByKey.get(key) || [];
      if (!existing.includes(scheduleRawText)) existing.push(scheduleRawText);
      marineScheduleRawByKey.set(key, existing);
    }
  }
  for (const item of cachedItems) {
    const id = String(item?.id || `${source}:${item?.warningId || item?.notamId || items.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const rawText = source === "navarea"
      ? truncateContaminatedMarineBulletin(String(item?.rawText || ""))
      : String(item?.rawText || "");
    const parsed = rawText
      ? source === "msa"
        ? parseMsaWarningGeometry(rawText)
        : parseNotamText(rawText)
      : null;
    const marineScheduleRawText =
      source === "hydropac" || source === "navarea"
        ? String(item?.scheduleRawText || (marineScheduleRawByKey.get(marineScheduleGroupKey(item)) || []).join("\n"))
        : "";
    const marineSchedule = marineScheduleRawText
      ? parseMarineSchedule(marineScheduleRawText, {
          msgYear: marineWarningYear(item),
          issueDate: null,
        })
      : null;
    const geometry = parsed?.geometry || null;
    const base = {
      id,
      type: item?.type || typeBySource[source],
      sourceKind: item?.sourceKind || source,
      source: item?.source || labelBySource[source],
      sourceUrl: item?.sourceUrl || item?.officialPageUrl || "",
      officialPageUrl: item?.officialPageUrl || item?.sourceUrl || "",
      notamId: item?.notamId || item?.warningId || null,
      notamKey: item?.notamKey || item?.warningId || null,
      title: item?.title || item?.warningId || typeBySource[source],
      category: item?.category || typeBySource[source],
      legal: item?.legal || null,
      country: item?.country || (source === "msa" ? "China" : source === "navarea" ? "NAVAREA" : "Oceanic"),
      state: item?.state || null,
      region: item?.region || item?.sourceBureau || sourceMeta.navArea || typeBySource[source],
      regionName: item?.regionName || item?.region || item?.sourceBureau || sourceMeta.navArea || typeBySource[source],
      sourceBureau: item?.sourceBureau || null,
      isNew: Boolean(item?.isNew),
      modifiedAt: item?.modifiedAt || item?.issuedAt || null,
      issuedAt: item?.issuedAt || null,
      beginsAt: item?.beginsAt || null,
      endsAt: item?.endsAt || null,
      timeLabel: item?.timeLabel || makeParsedTimeLabel(item?.beginsAt, item?.endsAt),
      beijingTimeLabel: item?.beijingTimeLabel || null,
      altitude: item?.altitude || null,
      radiusNm: item?.radiusNm || null,
      noShapeList: false,
      affectedArea: item?.affectedArea || item?.title || null,
      authority: item?.authority || null,
      contact: item?.contact || null,
      ...item,
      id,
      rawText,
      ...(marineSchedule
        ? {
            scheduleRawText: marineScheduleRawText,
            issuedAt: marineSchedule.issuedAt || item?.issuedAt || null,
            beginsAt: marineSchedule.beginsAt,
            endsAt: marineSchedule.endsAt,
            timeIntervals: marineSchedule.intervals,
            longTerm: marineSchedule.longTerm,
            temporalParseVersion: marineSchedule.temporalParseVersion,
            timeLabel: marineSchedule.timeLabel,
            beijingTimeLabel: marineSchedule.beijingTimeLabel,
          }
        : {}),
      rawTextPreview: rawText.slice(0, 1200),
      geometry,
      hasGeometry: Boolean(geometry),
      center: geometry ? centroidFromGeometry(geometry) : item?.center || null,
      geometrySource: geometry ? parsed?.geometrySource || "Coordinate boundary" : null,
      geometryReason: geometry
        ? parsed?.geometryReason || parsed?.geometrySource || "Coordinate boundary parsed."
        : parsed?.geometryReason || item?.geometryReason || item?.reason || "No parsed boundary geometry.",
      coordinateCount: parsed?.coordinateCount ?? item?.coordinateCount ?? 0,
      boundaryCoordinateCount: parsed?.boundaryCoordinateCount ?? item?.boundaryCoordinateCount ?? 0,
      polygonGroupCount: parsed?.polygonGroupCount ?? item?.polygonGroupCount ?? 0,
      rejectedPolygonGroupCount: parsed?.rejectedPolygonGroupCount || 0,
      geometryComplete: parsed?.geometryComplete ?? false,
      polygonGroupValidationReasons: parsed?.polygonGroupValidationReasons || [],
    };
    items.push(base);
  }
  const restrictions = items.filter((item) => item.hasGeometry && item.geometry);
  const skipped = items.filter((item) => !item.hasGeometry || !item.geometry);
  const beforeDrawable = Array.isArray(data.restrictions) ? data.restrictions.length : 0;
  const migrated = {
    ...data,
    restrictions,
    skipped,
    areaParseMigrationVersion: AREA_PARSE_MIGRATION_VERSION,
    areaParseMigration: {
      version: AREA_PARSE_MIGRATION_VERSION,
      appliedAt: new Date().toISOString(),
      reparsed: items.filter((item) => item.rawText).length,
      beforeDrawable,
      afterDrawable: restrictions.length,
      promotedToDrawable: Math.max(0, restrictions.length - beforeDrawable),
    },
    source: {
      ...sourceMeta,
      message: `${labelBySource[source]} saved snapshot was re-parsed locally; ${restrictions.length} warnings have polygon geometry and ${skipped.length} were not drawn.`,
      drawableWarnings: restrictions.length,
      skippedWarnings: skipped.length,
      totalWarnings: restrictions.length + skipped.length,
      localParseMigration: {
        version: AREA_PARSE_MIGRATION_VERSION,
        beforeDrawable,
        afterDrawable: restrictions.length,
      },
    },
  };
  return { data: migrated, changed: true };
}

function marineScheduleGroupKey(item) {
  return String(item?.notamId || item?.warningId || item?.notamKey || item?.id || "")
    .replace(/\s+AREA\s+[A-Z](?:\b.*)?$/i, "")
    .trim()
    .toUpperCase();
}

function marineWarningYear(item) {
  const token = String(item?.notamId || item?.warningId || item?.notamKey || "").match(/\/(\d{2,4})\b/)?.[1];
  return marineFullYear(token, new Date().getUTCFullYear());
}

function writeMigratedAreaDiskCache(filePath, cached, data) {
  try {
    writeJsonFileAtomic(filePath, { ...cached, data }, 2);
  } catch {
    // A later successful source refresh will regenerate the cache with the current parser.
  }
}

function writeMigratedAggregateDiskCache(cached) {
  try {
    if (!cached?.data?.restrictions?.length) return;
    mkdirSync(dataDirectory, { recursive: true });
    writeJsonFileAtomic(
      AGGREGATE_CACHE_FILE,
      {
        cacheKey: cached.cacheKey,
        savedAt: cached.savedAt,
        data: cached.data,
      },
    );
  } catch {
    // Migration improves startup display only; a failed write leaves the original cache usable.
  }
}

function cachedFaaNotamPayload(cacheKey, error) {
  const cached = readAggregateDiskCache(cacheKey, { allowExpired: true, allowStaleVersion: true });
  const restrictions = (cached?.restrictions || []).filter(isCachedLiveFaaNotamRestriction);
  if (!restrictions.length) return null;
  const source = cached.sources?.faaNotamSearch || {};
  const savedAt = source.fetchedAt || cached.faaNotamFetchedAt || cached.cacheSavedAt || cached.generatedAt || "";
  const ageText = savedAt ? ` from ${savedAt}` : "";
  return {
    restrictions,
    source: {
      ...source,
      status: "warn",
      message: `FAA NOTAM Search live fetch failed; showing cached FAA NOTAM records${ageText}. ${error instanceof Error ? error.message : String(error)}`,
      cacheFallback: true,
      cacheSavedAt: savedAt,
      fetchedAt: savedAt,
      refreshFailure: {
        failedFirCount: Array.isArray(error?.faaFailureDetails) ? error.faaFailureDetails.length : null,
        failedFirs: Array.isArray(error?.faaFailureDetails) ? error.faaFailureDetails.slice(0, 25) : [],
      },
      urls: buildSourceDescription().faaNotamSearch.urls,
      count: restrictions.length,
    },
  };
}

function markAggregateCacheStaleVersion(data, cachedKey, expectedKey, savedAt) {
  const source = data.sources?.faaNotamSearch || {};
  return {
    ...data,
    cacheVersionStale: true,
    cacheKey: cachedKey,
    expectedDataVersion: expectedKey,
    sources: {
      ...data.sources,
      faaNotamSearch: {
        ...source,
        status: source.status === "error" ? "error" : "warn",
        message:
          `当前显示上一版完整 FAA NOTAM 缓存（获取：${savedAt || data.faaNotamFetchedAt || "未知"}），` +
          `新版解析器正在后台刷新。${source.message ? ` ${source.message}` : ""}`,
        cacheFallback: true,
        cacheSavedAt: source.cacheSavedAt || savedAt || data.cacheSavedAt || data.faaNotamFetchedAt || "",
      },
    },
  };
}

function isCachedLiveFaaNotamRestriction(item) {
  return /FAA NOTAM Search live/i.test(String(item?.source || ""));
}

function writeAggregateDiskCache(cacheKey, data) {
  try {
    const source = data?.sources?.faaNotamSearch || {};
    if (source.status !== "ok" || source.cacheFallback || !data?.restrictions?.length) return null;
    const savedAt = new Date().toISOString();
    const fetchedAt = source.fetchedAt || data.faaNotamFetchedAt || data.generatedAt || savedAt;
    const dataToSave = {
      ...data,
      faaNotamFetchedAt: fetchedAt,
      cacheSavedAt: savedAt,
      refreshCompletedAt: savedAt,
      sources: {
        ...data.sources,
        faaNotamSearch: {
          ...source,
          fetchedAt,
          cacheSavedAt: savedAt,
        },
      },
    };
    mkdirSync(dataDirectory, { recursive: true });
    const wrapped = { cacheKey, savedAt, data: dataToSave };
    writeJsonFileAtomic(AGGREGATE_CACHE_FILE, wrapped);
    if (!writeFaaNotamSnapshot(cacheKey, dataToSave, savedAt)) return null;
    return dataToSave;
  } catch (error) {
    console.error("FAA NOTAM cache persistence failed:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

function writeFaaNotamSnapshot(cacheKey, data, savedAt) {
  try {
    mkdirSync(FAA_NOTAM_SNAPSHOT_DIR, { recursive: true });
    const baseStamp = String(savedAt || new Date().toISOString()).replace(/\D/g, "").slice(0, 17) || String(Date.now());
    let filePath = join(FAA_NOTAM_SNAPSHOT_DIR, `faa_notam_${baseStamp}.json`);
    let suffix = 1;
    while (existsSync(filePath)) {
      filePath = join(FAA_NOTAM_SNAPSHOT_DIR, `faa_notam_${baseStamp}_${suffix}.json`);
      suffix += 1;
    }
    writeJsonFileAtomic(filePath, { cacheKey, savedAt, data });
    if (!recordRefreshHistorySnapshot("notam", basename(filePath), cacheKey, savedAt, data)) {
      unlinkSync(filePath);
      return false;
    }
    return true;
  } catch (error) {
    console.error("FAA NOTAM history snapshot failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function writeSourceSnapshot(source, cacheKey, data, savedAt = new Date().toISOString()) {
  const dir =
    source === "hydropac"
      ? HYDROPAC_SNAPSHOT_DIR
      : source === "msa"
        ? MSA_NAV_WARNING_SNAPSHOT_DIR
        : source === "navarea"
          ? NAVAREA_WARNING_SNAPSHOT_DIR
          : null;
  if (!dir) return false;
  try {
    mkdirSync(dir, { recursive: true });
    const baseStamp = String(savedAt || new Date().toISOString()).replace(/\D/g, "").slice(0, 17) || String(Date.now());
    let filePath = join(dir, `${source}_${baseStamp}.json`);
    let suffix = 1;
    while (existsSync(filePath)) {
      filePath = join(dir, `${source}_${baseStamp}_${suffix}.json`);
      suffix += 1;
    }
    writeJsonFileAtomic(filePath, { cacheKey, savedAt, data });
    if (!recordRefreshHistorySnapshot(source, basename(filePath), cacheKey, savedAt, data)) {
      unlinkSync(filePath);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`${source} history snapshot failed:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

function satelliteSnapshotPath(savedAt) {
  const baseStamp = String(savedAt || new Date().toISOString()).replace(/\D/g, "").slice(0, 17) || String(Date.now());
  return join(SATELLITE_SNAPSHOT_DIR, `satellite_${baseStamp}.json`);
}

function writeSatelliteSnapshot(data, savedAt = new Date().toISOString()) {
  const normalizedSavedAt = firstValidIso([savedAt, data?.cacheSavedAt, data?.source?.fetchedAt, data?.generatedAt]) || new Date().toISOString();
  const filePath = satelliteSnapshotPath(normalizedSavedAt);
  let created = false;
  try {
    mkdirSync(SATELLITE_SNAPSHOT_DIR, { recursive: true });
    if (!existsSync(filePath)) {
      if (existsSync(SATELLITE_CACHE_FILE)) copyFileSync(SATELLITE_CACHE_FILE, filePath);
      else writeJsonFileAtomic(filePath, { savedAt: normalizedSavedAt, data });
      created = true;
    }
    if (!recordRefreshHistorySnapshot("satellite", basename(filePath), data?.dataVersion || "", normalizedSavedAt, data)) {
      if (created) unlinkSync(filePath);
      return false;
    }
    return true;
  } catch (error) {
    if (created) {
      try { unlinkSync(filePath); } catch {}
    }
    console.error("Satellite catalog history snapshot failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function refreshSatelliteCatalogAndPersist({ refresh }) {
  let payload = await satelliteCatalogService.getCatalog({ refresh });
  if (refresh && payload?.source?.refreshCompleted === true) {
    const historySnapshotSaved = writeSatelliteSnapshot(payload, payload.cacheSavedAt || payload.source?.fetchedAt);
    payload = {
      ...payload,
      source: {
        ...(payload.source || {}),
        historySnapshotSaved,
        message: historySnapshotSaved
          ? payload.source?.message
          : `${payload.source?.message || "卫星目录刷新完成"} 但本次卫星轨道历史快照保存失败。`,
      },
    };
  }
  return payload;
}

function startBackgroundSatelliteRefresh() {
  if (satelliteRefreshJob) return false;
  satelliteRefreshResult = null;
  satelliteRefreshStartedAt = new Date().toISOString();
  satelliteRefreshJob = memoryBudget.run("satellite", () => refreshSatelliteCatalogAndPersist({ refresh: true }), { fresh: true })
    .then((payload) => {
      const source = payload?.source || {};
      const success = source.refreshCompleted === true && source.historySnapshotSaved !== false;
      satelliteRefreshResult = {
        status: success ? "success" : "error",
        finishedAt: new Date().toISOString(),
        fetchedAt: payload?.cacheSavedAt || source.fetchedAt || "",
        objectCount: Array.isArray(payload?.satellites) ? payload.satellites.length : 0,
        dataVersion: payload?.dataVersion || "",
        message: success
          ? source.message || "卫星轨道全量目录后台刷新完成。"
          : source.message || "卫星轨道全量目录刷新失败，继续保留最近一次完整缓存。",
      };
      return payload;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      satelliteRefreshResult = {
        status: "error",
        finishedAt: new Date().toISOString(),
        fetchedAt: "",
        objectCount: 0,
        dataVersion: "",
        message,
      };
      console.warn("Satellite catalog background refresh failed:", message);
      return null;
    })
    .finally(() => {
      satelliteRefreshJob = null;
      satelliteRefreshStartedAt = "";
    });
  return true;
}

function withBackgroundSatelliteRefresh(payload, status) {
  const startedAt = satelliteRefreshStartedAt || new Date().toISOString();
  return {
    ...payload,
    source: {
      ...(payload?.source || {}),
      backgroundRefresh: {
        active: true,
        status,
        startedAt,
        elapsedMs: Math.max(0, Date.now() - Date.parse(startedAt)),
      },
      message: `卫星轨道全量目录正在后台刷新，当前显示最近一次完整缓存。${payload?.source?.message ? ` ${payload.source.message}` : ""}`,
    },
  };
}

async function getSatelliteRefreshStatus() {
  const cached = await satelliteCatalogService.getCatalog({ refresh: false });
  const startedAt = satelliteRefreshStartedAt;
  return {
    active: Boolean(satelliteRefreshJob),
    status: satelliteRefreshJob ? "running" : "idle",
    startedAt,
    elapsedMs: startedAt ? Math.max(0, Date.now() - Date.parse(startedAt)) : 0,
    cachedObjectCount: Array.isArray(cached?.satellites) ? cached.satellites.length : 0,
    cacheSavedAt: cached?.cacheSavedAt || cached?.source?.fetchedAt || "",
    dataVersion: cached?.dataVersion || "",
    lastRefresh: satelliteRefreshResult,
  };
}

function seedSatelliteSnapshotFromCurrentCache() {
  if (!existsSync(SATELLITE_CACHE_FILE)) return;
  try {
    const wrapped = JSON.parse(readFileSync(SATELLITE_CACHE_FILE, "utf8"));
    const data = wrapped?.data || wrapped;
    const savedAt = firstValidIso([wrapped?.savedAt, data?.cacheSavedAt, data?.source?.fetchedAt, data?.generatedAt]);
    if (!savedAt) return;
    mkdirSync(SATELLITE_SNAPSHOT_DIR, { recursive: true });
    const filePath = satelliteSnapshotPath(savedAt);
    if (!existsSync(filePath)) copyFileSync(SATELLITE_CACHE_FILE, filePath);
  } catch (error) {
    console.error("Satellite catalog history seed failed:", error instanceof Error ? error.message : String(error));
  }
}

function buildRefreshHistoryList() {
  const index = loadRefreshHistoryIndex();
  return {
    generatedAt: new Date().toISOString(),
    sources: {
      notam: historyRecords(index.sources.notam),
      hydropac: historyRecords(index.sources.hydropac),
      msa: historyRecords(index.sources.msa),
      navarea: historyRecords(index.sources.navarea),
      satellite: historyRecords(index.sources.satellite),
    },
  };
}

function historyRecords(records) {
  return (Array.isArray(records) ? records : [])
    .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
    .slice(0, REFRESH_HISTORY_LIST_LIMIT);
}

function loadRefreshHistoryIndex() {
  if (refreshHistoryIndexCache) return refreshHistoryIndexCache;
  try {
    if (existsSync(REFRESH_HISTORY_INDEX_FILE)) {
      const parsed = JSON.parse(readFileSync(REFRESH_HISTORY_INDEX_FILE, "utf8"));
      if ([2, 3].includes(parsed?.version) && parsed?.sources && ["notam", "hydropac", "msa", "navarea"].every((source) => Array.isArray(parsed.sources[source]))) {
        if (!Array.isArray(parsed.sources.satellite)) {
          seedSatelliteSnapshotFromCurrentCache();
          parsed.sources.satellite = listSnapshotDirectory("satellite", SATELLITE_SNAPSHOT_DIR);
        }
        const summarySources = [
          ["notam", FAA_NOTAM_SNAPSHOT_DIR, null],
          ["hydropac", HYDROPAC_SNAPSHOT_DIR, HYDROPAC_CACHE_FILE],
          ["msa", MSA_NAV_WARNING_SNAPSHOT_DIR, MSA_NAV_WARNING_CACHE_FILE],
          ["navarea", NAVAREA_WARNING_SNAPSHOT_DIR, NAVAREA_WARNING_CACHE_FILE],
        ];
        for (const [source, dir, latestCacheFile] of summarySources) {
          const expectedVersion = refreshHistorySummaryParseVersion(source);
          if (parsed.sources[source].some((record) => record.summaryParseVersion !== expectedVersion)) {
            parsed.sources[source] = listSnapshotDirectory(source, dir, latestCacheFile);
          }
        }
        parsed.version = 3;
        refreshHistoryIndexCache = parsed;
        writeRefreshHistoryIndex();
        return parsed;
      }
    }
  } catch {
    // Rebuild the compact index from legacy snapshot files below.
  }
  refreshHistoryIndexCache = {
    version: 3,
    updatedAt: new Date().toISOString(),
    sources: {
      notam: listSnapshotDirectory("notam", FAA_NOTAM_SNAPSHOT_DIR),
      hydropac: listSnapshotDirectory("hydropac", HYDROPAC_SNAPSHOT_DIR, HYDROPAC_CACHE_FILE),
      msa: listSnapshotDirectory("msa", MSA_NAV_WARNING_SNAPSHOT_DIR, MSA_NAV_WARNING_CACHE_FILE),
      navarea: listSnapshotDirectory("navarea", NAVAREA_WARNING_SNAPSHOT_DIR, NAVAREA_WARNING_CACHE_FILE),
      satellite: (seedSatelliteSnapshotFromCurrentCache(), listSnapshotDirectory("satellite", SATELLITE_SNAPSHOT_DIR)),
    },
  };
  writeRefreshHistoryIndex();
  return refreshHistoryIndexCache;
}

function recordRefreshHistorySnapshot(source, id, cacheKey, savedAt, data) {
  const index = loadRefreshHistoryIndex();
  const records = index.sources[source];
  if (!Array.isArray(records)) return false;
  const sourceMeta = refreshHistorySourceMeta(source, data);
  const satellites = Array.isArray(data?.satellites) ? data.satellites : [];
  const restrictions = Array.isArray(data?.restrictions) ? data.restrictions : [];
  const skipped = Array.isArray(data?.skipped) ? data.skipped : [];
  const record = {
    id,
    source,
    latest: false,
    savedAt,
    referenceTime: refreshHistoryReferenceTime(source, { savedAt }, data),
    historyDate: data?.historyDate || sourceMeta.historyDate || "",
    dataVersion: data?.dataVersion || cacheKey || "",
    total: source === "satellite" ? satellites.length : restrictions.length + skipped.length,
    drawable: source === "satellite" ? satellites.length : restrictions.filter((item) => item?.hasGeometry && item?.geometry).length,
    counts: source === "satellite" ? { ...(data?.counts || {}) } : undefined,
    summaryParseVersion: refreshHistorySummaryParseVersion(source) || undefined,
    message: sourceMeta.message || "",
  };
  const previousRecords = records;
  const previousUpdatedAt = index.updatedAt;
  index.sources[source] = [record, ...records.filter((item) => item.id !== id)];
  index.updatedAt = new Date().toISOString();
  if (writeRefreshHistoryIndex()) return true;
  index.sources[source] = previousRecords;
  index.updatedAt = previousUpdatedAt;
  return false;
}

function writeRefreshHistoryIndex() {
  try {
    if (!refreshHistoryIndexCache) return false;
    mkdirSync(dataDirectory, { recursive: true });
    writeJsonFileAtomic(REFRESH_HISTORY_INDEX_FILE, refreshHistoryIndexCache, 2);
    return true;
  } catch (error) {
    console.error("Refresh history index persistence failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function listSnapshotDirectory(source, dir, latestCacheFile = null) {
  const records = [];
  if (existsSync(dir)) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const filePath = join(dir, name);
      const record = readSnapshotSummary(source, filePath, name);
      if (record) records.push(record);
    }
  }
  if (latestCacheFile && existsSync(latestCacheFile)) {
    const latest = readSnapshotSummary(source, latestCacheFile, "latest-cache.json", true);
    if (latest && !records.some((item) => item.dataVersion === latest.dataVersion || item.savedAt === latest.savedAt)) records.push(latest);
  }
  return records.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, REFRESH_HISTORY_LIST_LIMIT);
}

function writeJsonFileAtomic(filePath, value, spacing = 0) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, JSON.stringify(value, null, spacing), "utf8");
  try {
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(filePath);
    } catch {
      // The destination did not exist.
    }
    try {
      renameSync(tempPath, filePath);
    } catch {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore temporary cleanup failure.
      }
      throw error;
    }
  }
}

function readSnapshotSummary(source, filePath, id, latest = false) {
  try {
    const wrapped = JSON.parse(readFileSync(filePath, "utf8"));
    let data = wrapped.data || wrapped;
    if (source === "notam") {
      data = migrateCachedNotamParseResults(data).data;
    } else if (["hydropac", "msa", "navarea"].includes(source)) {
      data = migrateCachedAreaParseResults(source, data).data;
    }
    const savedAt = wrapped.savedAt || refreshHistorySourceMeta(source, data).fetchedAt || data.faaNotamFetchedAt || data.generatedAt || "";
    const referenceTime = refreshHistoryReferenceTime(source, wrapped, data);
    const filteredData = filterPayloadToReferenceTime(source, data, referenceTime, latest ? "latest-cache-history" : "history");
    const sourceMeta = refreshHistorySourceMeta(source, filteredData);
    const satellites = Array.isArray(filteredData.satellites) ? filteredData.satellites : [];
    const restrictions = Array.isArray(filteredData.restrictions) ? filteredData.restrictions : [];
    const skipped = Array.isArray(filteredData.skipped) ? filteredData.skipped : [];
    return {
      id,
      source,
      latest,
      savedAt,
      referenceTime,
      historyDate: wrapped.historyDate || filteredData.historyDate || sourceMeta.historyDate || "",
      dataVersion: filteredData.dataVersion || wrapped.cacheKey || "",
      total: source === "satellite" ? satellites.length : restrictions.length + skipped.length,
      drawable: source === "satellite" ? satellites.length : restrictions.filter((item) => item.hasGeometry && item.geometry).length,
      counts: source === "satellite" ? { ...(filteredData.counts || {}) } : undefined,
      summaryParseVersion: refreshHistorySummaryParseVersion(source) || undefined,
      message: sourceMeta.message || "",
    };
  } catch {
    return null;
  }
}

function refreshHistorySummaryParseVersion(source) {
  if (source === "notam") return FAA_NOTAM_PARSE_MIGRATION_VERSION;
  if (["hydropac", "msa", "navarea"].includes(source)) {
    return `${AREA_PARSE_MIGRATION_VERSION}:${source === "msa" ? MSA_TEMPORAL_PARSE_VERSION : MARINE_TEMPORAL_PARSE_VERSION}`;
  }
  return "";
}

function refreshHistorySourceMeta(source, data) {
  return source === "notam" ? data?.sources?.faaNotamSearch || {} : data?.source || {};
}

function refreshHistoryReferenceTime(source, wrapped, data) {
  const sourceMeta = refreshHistorySourceMeta(source, data);
  const historicalDateReplay = Boolean(wrapped?.historyDate || data?.historyDate || sourceMeta?.historyDate);
  if (historicalDateReplay) {
    return firstValidIso([
      data?.historyDayStart,
      data?.temporalReferenceTime,
      wrapped?.savedAt,
      sourceMeta.fetchedAt,
      data?.generatedAt,
    ]);
  }
  return firstValidIso([
    wrapped?.savedAt,
    sourceMeta.fetchedAt,
    source === "notam" ? data?.faaNotamFetchedAt : null,
    sourceMeta.cacheSavedAt,
    data?.cacheSavedAt,
    data?.temporalReferenceTime,
    data?.generatedAt,
  ]);
}

function firstValidIso(values) {
  for (const value of values || []) {
    const ms = Date.parse(value || "");
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }
  return "";
}

function filterPayloadToReferenceTime(source, data, referenceTime, mode = "reference") {
  if (!data || typeof data !== "object") return data;
  if (source === "satellite") return data;
  const referenceIso = firstValidIso([referenceTime, data.faaNotamFetchedAt, data.generatedAt]);
  const referenceMs = Date.parse(referenceIso || "");
  if (!Number.isFinite(referenceMs)) return data;

  const msaInForceWarningKeys = source === "msa"
    ? extractMsaInForceWarningKeys([...(data.restrictions || []), ...(data.skipped || [])])
    : null;
  const originalRestrictions = Array.isArray(data.restrictions)
    ? source === "msa"
      ? data.restrictions.map((item) => normalizeMsaTemporalItem(item, msaInForceWarningKeys))
      : data.restrictions
    : [];
  const originalSkipped = Array.isArray(data.skipped)
    ? source === "msa"
      ? data.skipped.map((item) => normalizeMsaTemporalItem(item, msaInForceWarningKeys))
      : data.skipped
    : [];
  // FAA returns both currently effective and already-published future NOTAMs.
  // Keep both in snapshots; only notices that ended before the refresh time are removed.
  const includeFutureAtReference = true;
  const visibilityOptions = { includeFutureAtReference, requireKnownSchedule: source === "msa" };
  const restrictions = originalRestrictions.filter((item) => isRestrictionVisibleAtReference(item, referenceMs, visibilityOptions));
  const skipped = originalSkipped.filter((item) => isRestrictionVisibleAtReference(item, referenceMs, visibilityOptions));
  const drawable = restrictions.filter((item) => item?.hasGeometry && item?.geometry).length;
  const temporalFilter = {
    mode,
    referenceTime: referenceIso,
    originalRestrictions: originalRestrictions.length,
    displayedRestrictions: restrictions.length,
    originalSkipped: originalSkipped.length,
    displayedSkipped: skipped.length,
    includeFutureAtReference,
  };

  const output = {
    ...data,
    restrictions,
    temporalReferenceTime: referenceIso,
    temporalFilter,
  };
  if (Array.isArray(data.skipped)) output.skipped = skipped;

  if (source === "notam") {
    const sourceMeta = data.sources?.faaNotamSearch || {};
    output.faaNotamFetchedAt = output.faaNotamFetchedAt || sourceMeta.fetchedAt || referenceIso;
    output.filters = buildFilters(restrictions);
    output.sources = {
      ...(data.sources || {}),
      faaNotamSearch: {
        ...sourceMeta,
        fetchedAt: sourceMeta.fetchedAt || output.faaNotamFetchedAt || referenceIso,
        count: restrictions.length,
        drawableCount: drawable,
        temporalPolicy: "active-and-future-at-refresh",
        temporalFilter,
      },
    };
    return output;
  }

  const sourceMeta = data.source || {};
  output.source = {
    ...sourceMeta,
    message: source === "msa"
      ? `China MSA snapshot at ${referenceIso} contains ${restrictions.length + skipped.length} active/future navigational warnings; ${drawable} have parseable boundary geometry and ${skipped.length} were not drawn.`
      : sourceMeta.message,
    totalWarnings: restrictions.length + skipped.length,
    drawableWarnings: drawable,
    skippedWarnings: skipped.length,
    displayedWarnings: restrictions.length + skipped.length,
    temporalPolicy: source === "msa" ? "active-and-future-at-refresh" : sourceMeta.temporalPolicy,
    temporalFilter,
  };
  return output;
}

function isRestrictionVisibleAtReference(item, referenceMs, { includeFutureAtReference = false, requireKnownSchedule = false } = {}) {
  if (!item || typeof item !== "object") return true;
  const intervals = Array.isArray(item.timeIntervals) ? item.timeIntervals : [];
  if (intervals.length) {
    const intervalVisible = intervals.some((interval) => {
      const startMs = firstParsableTimeMs([interval?.start, interval?.beginsAt]);
      const endMs = firstParsableTimeMs([interval?.end, interval?.endsAt]);
      if (Number.isFinite(endMs) && endMs < referenceMs) return false;
      if (!includeFutureAtReference && Number.isFinite(startMs) && startMs > referenceMs) return false;
      return Number.isFinite(startMs) || Number.isFinite(endMs);
    });
    return intervalVisible || Boolean(item.longTerm);
  }
  const startMs = firstParsableTimeMs([item.beginsAt, item.startAt, item.startTime, item.startDate, item.beginDate, item.validFrom]);
  const endMs = firstParsableTimeMs([item.endsAt, item.endAt, item.endTime, item.endDate, item.expireDate, item.validTo]);
  if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) return requireKnownSchedule ? Boolean(item.longTerm) : true;
  if (Number.isFinite(endMs) && endMs < referenceMs) return false;
  if (!includeFutureAtReference && Number.isFinite(startMs) && startMs > referenceMs) return false;
  return true;
}

function firstParsableTimeMs(values) {
  for (const value of values || []) {
    const ms = Date.parse(value || "");
    if (Number.isFinite(ms)) return ms;
  }
  return NaN;
}

function readRefreshHistoryItem(source, id) {
  const normalized = String(source || "").toLowerCase();
  const safeId = String(id || "");
  if (!/^[\w.-]+\.json$/.test(safeId)) return null;
  const dir =
    normalized === "notam"
      ? FAA_NOTAM_SNAPSHOT_DIR
      : normalized === "hydropac"
        ? HYDROPAC_SNAPSHOT_DIR
        : normalized === "msa"
          ? MSA_NAV_WARNING_SNAPSHOT_DIR
          : normalized === "navarea"
            ? NAVAREA_WARNING_SNAPSHOT_DIR
            : normalized === "satellite"
              ? SATELLITE_SNAPSHOT_DIR
              : null;
  const latestFile =
    normalized === "hydropac"
      ? HYDROPAC_CACHE_FILE
      : normalized === "msa"
        ? MSA_NAV_WARNING_CACHE_FILE
        : normalized === "navarea"
          ? NAVAREA_WARNING_CACHE_FILE
          : null;
  const useLatest = safeId === "latest-cache.json" && latestFile;
  const filePath = useLatest ? latestFile : dir ? join(dir, safeId) : null;
  const allowedBase = useLatest ? dataDirectory : dir || dataDirectory;
  if (!filePath || !existsSync(filePath) || !normalize(filePath).startsWith(normalize(allowedBase))) return null;
  try {
    const wrapped = JSON.parse(readFileSync(filePath, "utf8"));
    let data = wrapped.data || wrapped;
    if (normalized === "satellite") {
      // Satellite catalog snapshots contain no restriction geometry migration.
    } else if (normalized === "notam") {
      data = migrateCachedNotamParseResults(data).data;
    } else {
      data = migrateCachedAreaParseResults(normalized, data).data;
    }
    const savedAt = wrapped.savedAt || refreshHistorySourceMeta(normalized, data).fetchedAt || data.faaNotamFetchedAt || data.generatedAt || "";
    const referenceTime = refreshHistoryReferenceTime(normalized, wrapped, data);
    const filteredData = filterPayloadToReferenceTime(normalized, data, referenceTime, useLatest ? "latest-cache-history" : "history");
    return {
      source: normalized,
      id: safeId,
      savedAt,
      referenceTime,
      data: filteredData,
    };
  } catch {
    return null;
  }
}

function deleteRefreshHistoryItem(source, id) {
  const normalized = String(source || "").toLowerCase();
  const safeId = String(id || "");
  if (!["notam", "hydropac", "msa", "navarea", "satellite"].includes(normalized) || !/^[\w.-]+\.json$/.test(safeId)) {
    return { ok: false, status: 400, error: "invalid_history_item" };
  }
  const dir = normalized === "notam"
    ? FAA_NOTAM_SNAPSHOT_DIR
    : normalized === "hydropac"
      ? HYDROPAC_SNAPSHOT_DIR
      : normalized === "msa"
        ? MSA_NAV_WARNING_SNAPSHOT_DIR
        : normalized === "navarea"
          ? NAVAREA_WARNING_SNAPSHOT_DIR
          : SATELLITE_SNAPSHOT_DIR;
  const latestFile = normalized === "hydropac"
    ? HYDROPAC_CACHE_FILE
    : normalized === "msa"
      ? MSA_NAV_WARNING_CACHE_FILE
      : normalized === "navarea"
        ? NAVAREA_WARNING_CACHE_FILE
        : null;
  const filePath = safeId === "latest-cache.json" && latestFile ? latestFile : join(dir, safeId);
  const normalizedPath = normalize(filePath);
  const allowedRoot = normalize(safeId === "latest-cache.json" && latestFile ? dataDirectory : dir);
  if (!normalizedPath.startsWith(allowedRoot) || !existsSync(filePath)) {
    return { ok: false, status: 404, error: "history_item_not_found" };
  }
  try {
    const fileContents = readFileSync(filePath);
    const index = loadRefreshHistoryIndex();
    const previousRecords = index.sources[normalized] || [];
    const previousUpdatedAt = index.updatedAt;
    unlinkSync(filePath);
    index.sources[normalized] = previousRecords.filter((item) => item.id !== safeId);
    index.updatedAt = new Date().toISOString();
    if (!writeRefreshHistoryIndex()) {
      writeFileSync(filePath, fileContents);
      index.sources[normalized] = previousRecords;
      index.updatedAt = previousUpdatedAt;
      return { ok: false, status: 500, error: "history_index_persistence_failed" };
    }
    return { ok: true, source: normalized, id: safeId };
  } catch (error) {
    return { ok: false, status: 500, error: error instanceof Error ? error.message : "history_delete_failed" };
  }
}

async function getLaunchForecasts({ refresh }) {
  const cacheKey = `v1:launch-library:upcoming:detailed:max:${LAUNCH_LIBRARY_MAX_LAUNCHES}`;
  const cached = launchCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!refresh) {
    const diskCached = readLaunchDiskCache(cacheKey, { allowExpired: true });
    if (diskCached) {
      launchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: diskCached });
      return diskCached;
    }
    return {
      generatedAt: new Date().toISOString(),
      dataVersion: cacheKey,
      launches: [],
      sites: [],
      source: {
        status: "empty",
        message: "No saved launch forecast cache is available. Use the refresh button to fetch it manually.",
        cacheOnly: true,
        activeLaunches: 0,
        launchSites: 0,
      },
    };
  }
  const inFlight = launchInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildLaunchPayload(cacheKey)
    .catch((error) => {
      const stale = readLaunchDiskCache(cacheKey, { allowExpired: true });
      if (!stale) throw error;
      return {
        ...stale,
        source: {
          ...(stale.source || {}),
          status: "warn",
          message: `Launch Library 2 live fetch failed; showing cached launch forecast. ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      };
    })
    .finally(() => {
      launchInFlight.delete(cacheKey);
    });
  launchInFlight.set(cacheKey, request);
  return request;
}

function readLaunchDiskCache(cacheKey, options = {}) {
  try {
    if (!existsSync(LAUNCH_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(LAUNCH_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (cached.cacheKey !== cacheKey || !savedAt) return null;
    if (!options.allowExpired && Date.now() - savedAt > LAUNCH_DISK_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(cached.data?.launches)) return null;
    cached.data.cacheSavedAt = cached.data.cacheSavedAt || cached.savedAt;
    cached.data.refreshCompletedAt = cached.data.refreshCompletedAt || cached.savedAt;
    cached.data.source = {
      ...(cached.data.source || {}),
      fetchedAt: cached.data.source?.fetchedAt || cached.savedAt,
      cacheSavedAt: cached.data.source?.cacheSavedAt || cached.savedAt,
    };
    return cached.data;
  } catch {
    return null;
  }
}

function writeLaunchDiskCache(cacheKey, data) {
  try {
    if (!Array.isArray(data?.launches)) return;
    mkdirSync(dataDirectory, { recursive: true });
    const savedAt = new Date().toISOString();
    data.cacheSavedAt = savedAt;
    data.refreshCompletedAt = savedAt;
    data.source = { ...(data.source || {}), fetchedAt: data.source?.fetchedAt || savedAt, cacheSavedAt: savedAt };
    writeFileSync(
      LAUNCH_CACHE_FILE,
      JSON.stringify(
        {
          cacheKey,
          savedAt,
          data,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // Cache writes are best effort; live Launch Library data remains the source of truth.
  }
}

async function buildLaunchPayload(cacheKey) {
  const generatedAt = new Date().toISOString();
  const rawLaunches = await fetchLaunchLibraryUpcoming(LAUNCH_LIBRARY_MAX_LAUNCHES);
  const normalized = rawLaunches.map((row, index) => normalizeLaunchForecast(row, index)).filter(Boolean);
  const launches = normalized.filter(isLaunchForecastActive).sort(compareLaunchForecasts);
  const skippedWithoutLocation = launches.filter((item) => !item.hasLocation).length;
  const latestUpdatedAt = latestIso(launches.map((item) => item.updatedAt).filter(Boolean));
  const nextLaunchAt = earliestIso(launches.map((item) => item.net).filter(Boolean));
  const sites = buildLaunchSiteSummary(launches);
  const dataVersion = `${cacheKey}:${latestUpdatedAt || nextLaunchAt || generatedAt}`;
  const data = {
    generatedAt,
    dataVersion,
    launches,
    sites,
    source: {
      status: "ok",
      message: `Launch Library 2 loaded ${launches.length} active upcoming launches at ${sites.length} launch sites.`,
      urls: {
        app: LAUNCH_LIBRARY_APP_URL,
        upcomingEndpoint: `${LAUNCH_LIBRARY_UPCOMING_URL}?format=json&mode=detailed&ordering=net`,
      },
      totalRawLaunches: rawLaunches.length,
      activeLaunches: launches.length,
      launchSites: sites.length,
      skippedWithoutLocation,
      latestUpdatedAt,
      nextLaunchAt,
    },
  };
  launchCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data });
  writeLaunchDiskCache(cacheKey, data);
  return data;
}

async function fetchLaunchLibraryUpcoming(maxLaunches) {
  const output = [];
  for (let offset = 0; output.length < maxLaunches; offset += LAUNCH_LIBRARY_PAGE_SIZE) {
    const limit = Math.min(LAUNCH_LIBRARY_PAGE_SIZE, maxLaunches - output.length);
    const url = new URL(LAUNCH_LIBRARY_UPCOMING_URL);
    url.searchParams.set("format", "json");
    url.searchParams.set("mode", "detailed");
    url.searchParams.set("ordering", "net");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const payload = await fetchJsonOfficial(url.toString(), 45000);
    const rows = Array.isArray(payload?.results) ? payload.results : [];
    output.push(...rows);
    if (!payload?.next || rows.length < limit) break;
  }
  return output.slice(0, maxLaunches);
}

function normalizeLaunchForecast(row, index) {
  if (!row || typeof row !== "object") return null;
  const pad = row.pad || {};
  const location = pad.location || {};
  const lat = Number(pad.latitude);
  const lon = Number(pad.longitude);
  const provider = row.launch_service_provider || {};
  const rocketConfig = row.rocket?.configuration || {};
  const rocketName = cleanLaunchText(rocketConfig.full_name || rocketConfig.name || String(row.name || "").split("|")[0]);
  const missionName = cleanLaunchText(row.mission?.name || String(row.name || "").split("|").slice(1).join("|"));
  const payloads = uniqueTextList([missionName]);
  const countryCode = cleanLaunchText(location.country_code || pad.country_code || provider.country_code);
  return {
    id: `launch:${row.id || index}`,
    launchId: row.id || null,
    name: cleanLaunchText(row.name || `${rocketName} | ${missionName}`),
    rocket: rocketName || "Unknown rocket",
    mission: missionName || "Unknown payload",
    payloads,
    missionType: cleanLaunchText(row.mission?.type),
    orbit: cleanLaunchText(row.mission?.orbit?.name || row.mission?.orbit?.abbrev),
    provider: cleanLaunchText(provider.name || provider.abbrev),
    providerCountryCode: cleanLaunchText(provider.country_code),
    countryCode,
    country: countryFromLaunchCode(countryCode),
    status: cleanLaunchText(row.status?.name || row.status?.abbrev),
    statusAbbrev: cleanLaunchText(row.status?.abbrev),
    net: row.net || null,
    netPrecision: cleanLaunchText(row.net_precision?.name || row.net_precision?.abbrev),
    windowStart: row.window_start || null,
    windowEnd: row.window_end || null,
    beijingTimeLabel: formatBeijingDateTime(row.net),
    updatedAt: row.last_updated || null,
    padId: pad.id == null ? null : String(pad.id),
    padName: cleanLaunchText(pad.name),
    locationId: location.id == null ? null : String(location.id),
    locationName: cleanLaunchText(location.name),
    siteKey: launchSiteKey(pad, location, lat, lon),
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    hasLocation: Number.isFinite(lat) && Number.isFinite(lon),
    infoUrl: firstLaunchInfoUrl(row),
    webcastUrl: firstLaunchVideoUrl(row),
    image: row.image || rocketConfig.image_url || null,
    missionDescription: cleanLaunchText(row.mission?.description),
  };
}

function isLaunchForecastActive(item) {
  const status = String(item.status || "").toLowerCase();
  if (/success|failure|failed|partial failure/.test(status)) return false;
  const timestamp = Date.parse(item.net);
  return !Number.isFinite(timestamp) || timestamp >= Date.now() - 60 * 60 * 1000;
}

function compareLaunchForecasts(a, b) {
  const at = Date.parse(a.net);
  const bt = Date.parse(b.net);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  if (Number.isFinite(at)) return -1;
  if (Number.isFinite(bt)) return 1;
  return String(a.name).localeCompare(String(b.name));
}

function buildLaunchSiteSummary(launches) {
  const groups = new Map();
  for (const launch of launches.filter((item) => item.hasLocation)) {
    const key = launch.siteKey || `launch-site:${launch.lat}:${launch.lon}`;
    const group =
      groups.get(key) ||
      {
        id: key,
        label: launch.locationName || launch.padName || "Unknown launch site",
        padName: launch.padName,
        locationName: launch.locationName,
        country: launch.country,
        countryCode: launch.countryCode,
        lat: launch.lat,
        lon: launch.lon,
        launchCount: 0,
        nextLaunchAt: null,
      };
    group.launchCount += 1;
    group.nextLaunchAt = earliestIso([group.nextLaunchAt, launch.net].filter(Boolean)) || group.nextLaunchAt || launch.net;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) =>
    compareLaunchForecasts({ net: a.nextLaunchAt, name: a.label }, { net: b.nextLaunchAt, name: b.label }),
  );
}

function launchSiteKey(pad, location, lat, lon) {
  if (location?.id != null) return `location:${location.id}`;
  if (pad?.id != null) return `pad:${pad.id}`;
  if (Number.isFinite(lat) && Number.isFinite(lon)) return `coord:${lat.toFixed(4)},${lon.toFixed(4)}`;
  return `site:${cleanLaunchText(location?.name || pad?.name || "unknown").toLowerCase()}`;
}

function firstLaunchInfoUrl(row) {
  const urls = Array.isArray(row.infoURLs) ? row.infoURLs : Array.isArray(row.info_urls) ? row.info_urls : [];
  return urls.find((item) => item?.url)?.url || row.url || null;
}

function firstLaunchVideoUrl(row) {
  const urls = Array.isArray(row.vidURLs) ? row.vidURLs : Array.isArray(row.vid_urls) ? row.vid_urls : [];
  return urls.find((item) => item?.url)?.url || null;
}

function cleanLaunchText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueTextList(values) {
  const seen = new Set();
  const output = [];
  for (const value of values.map(cleanLaunchText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function countryFromLaunchCode(code) {
  const upper = String(code || "").trim().toUpperCase();
  const names = {
    CHN: "China",
    FRA: "France",
    GUF: "French Guiana",
    IND: "India",
    IRN: "Iran",
    JPN: "Japan",
    KAZ: "Kazakhstan",
    KOR: "South Korea",
    NZL: "New Zealand",
    PRK: "North Korea",
    RUS: "Russia",
    USA: "United States",
  };
  return names[upper] || upper || "Unknown";
}

async function getHydropacWarnings({ refresh }) {
  const cacheKey = "v2:nga-msi:hydropac:active:parseable";
  const cached = hydropacCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!refresh) {
    const diskCached = readHydropacDiskCache(cacheKey, { allowExpired: true });
    if (diskCached) {
      hydropacCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: diskCached });
      return diskCached;
    }
    return emptyMarineCachePayload(cacheKey, "HYDROPAC", "No saved HYDROPAC cache is available. Use the refresh button to fetch it manually.");
  }
  const inFlight = hydropacInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildHydropacPayload(cacheKey)
    .catch((error) => {
      const stale = cached?.data || readHydropacDiskCache(cacheKey, { allowExpired: true });
      if (!stale) throw error;
      return withMarineRefreshFallback(stale, "HYDROPAC", error);
    })
    .finally(() => {
      hydropacInFlight.delete(cacheKey);
    });
  hydropacInFlight.set(cacheKey, request);
  return request;
}

function readHydropacDiskCache(cacheKey, options = {}) {
  try {
    if (!existsSync(HYDROPAC_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(HYDROPAC_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (cached.cacheKey !== cacheKey || !savedAt) return null;
    if (!options.allowExpired && Date.now() - savedAt > HYDROPAC_DISK_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(cached.data?.restrictions)) return null;
    const migration = migrateCachedAreaParseResults("hydropac", cached.data);
    if (migration.changed) writeMigratedAreaDiskCache(HYDROPAC_CACHE_FILE, cached, migration.data);
    return filterPayloadToReferenceTime("hydropac", migration.data, cached.savedAt || migration.data.generatedAt, "disk-cache");
  } catch {
    return null;
  }
}

function writeHydropacDiskCache(cacheKey, data) {
  try {
    if (data?.source?.status !== "ok") return false;
    mkdirSync(dataDirectory, { recursive: true });
    const savedAt = new Date().toISOString();
    data.cacheSavedAt = savedAt;
    data.refreshCompletedAt = savedAt;
    data.source = { ...data.source, fetchedAt: data.source.fetchedAt || savedAt, cacheSavedAt: savedAt };
    writeJsonFileAtomic(HYDROPAC_CACHE_FILE, { cacheKey, savedAt, data }, 2);
    if (!writeSourceSnapshot("hydropac", cacheKey, data, savedAt)) return false;
    return true;
  } catch (error) {
    console.error("HYDROPAC cache persistence failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function buildHydropacPayload(cacheKey) {
  const generatedAt = new Date().toISOString();
  const sourceErrors = [];
  let apiRecords = [];
  let textRecords = [];
  try {
    const payload = await fetchJsonOfficial(NGA_MSI_HYDROPAC_ACTIVE_URL, 45000);
    apiRecords = normalizeNgaBroadcastWarnings(payload).filter((item) => item.navArea === "P");
  } catch (error) {
    sourceErrors.push(`NGA JSON API: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    textRecords = await fetchHydropacCurrentTextWarnings();
  } catch (error) {
    sourceErrors.push(`HYDROPAC current text page: ${error instanceof Error ? error.message : String(error)}`);
  }
  const records = mergeHydropacRecords([...apiRecords, ...textRecords]);
  if (!records.length && sourceErrors.length) {
    throw new Error(sourceErrors.join("; "));
  }
  const built = records.map((warning, index) => buildHydropacRestriction(warning, index)).filter(Boolean);
  const restrictions = built.filter((item) => item?.hasGeometry);
  const skipped = built.filter((item) => item && !item.hasGeometry);
  const skippedReasons = countBy(skipped, (item) => item.geometryReason || "No parsed boundary geometry");
  const latestIssuedAt = latestIso(built.map((item) => item?.issuedAt || item?.beginsAt || item?.endsAt).filter(Boolean));
  const dataVersion = `${cacheKey}:${latestIssuedAt || generatedAt}`;
  const data = {
    generatedAt,
    dataVersion,
    areaParseMigrationVersion: AREA_PARSE_MIGRATION_VERSION,
    restrictions,
    skipped: skipped.map((item) => ({
      id: item.id,
      warningId: item.notamId,
      title: item.title,
      issuedAt: item.issuedAt,
      beginsAt: item.beginsAt,
      endsAt: item.endsAt,
      timeIntervals: item.timeIntervals,
      longTerm: item.longTerm,
      timeLabel: item.timeLabel,
      beijingTimeLabel: item.beijingTimeLabel,
      temporalParseVersion: item.temporalParseVersion,
      coordinateCount: item.coordinateCount,
      reason: item.geometryReason,
      rawTextPreview: item.rawTextPreview,
      rawText: item.rawText,
    })),
    source: {
      status: "ok",
      message: `NGA MSI HYDROPAC loaded ${records.length} active warnings; ${restrictions.length} have parseable boundary geometry and ${skipped.length} were not drawn.`,
      urls: {
        app: NGA_MSI_NAV_WARNINGS_URL,
        activeEndpoint: NGA_MSI_HYDROPAC_ACTIVE_URL,
        currentTextPage: HYDROPAC_CURRENT_TEXT_URL,
      },
      navArea: "HYDROPAC",
      totalWarnings: built.length,
      sourceWarningCount: records.length,
      unbuiltSourceWarnings: Math.max(0, records.length - built.length),
      officialApiWarnings: apiRecords.length,
      currentTextWarnings: textRecords.length,
      drawableWarnings: restrictions.length,
      skippedWarnings: skipped.length,
      skippedReasons,
      sourceErrors,
      latestIssuedAt,
    },
  };
  const displayData = filterPayloadToReferenceTime("hydropac", data, generatedAt, "live-refresh");
  if (!writeHydropacDiskCache(cacheKey, displayData)) {
    throw new Error("HYDROPAC refresh completed, but its cache and history snapshot could not be saved; keeping the previous cache.");
  }
  hydropacCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: displayData });
  return displayData;
}

async function getHydropacHistoryForDate({ date, refresh }) {
  const normalizedDate = normalizeHistoryDate(date);
  if (!normalizedDate) {
    return {
      generatedAt: new Date().toISOString(),
      dataVersion: "v1:nga-msi:hydropac:history:invalid-date",
      restrictions: [],
      skipped: [],
      source: {
        status: "error",
        message: "HYDROPAC 历史查询日期无效，请使用 YYYY-MM-DD。",
      },
    };
  }
  const cacheKey = `v1:nga-msi:hydropac:history:${normalizedDate}`;
  const inFlightKey = `${cacheKey}:${refresh ? "refresh" : "cache"}`;
  const cached = hydropacHistoryCache.get(inFlightKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  const inFlight = hydropacHistoryInFlight.get(inFlightKey);
  if (inFlight) return inFlight;
  const request = buildHydropacHistoryPayload(normalizedDate, { refresh }).finally(() => {
    hydropacHistoryInFlight.delete(inFlightKey);
  });
  hydropacHistoryInFlight.set(inFlightKey, request);
  return request;
}

async function buildHydropacHistoryPayload(historyDate, { refresh }) {
  const generatedAt = new Date().toISOString();
  const dayRange = beijingDateRangeUtc(historyDate);
  const allRecordsPayload = await getHydropacAllHistoryRecords({ refresh });
  const sourceErrors = [];
  let currentTextRecords = [];
  let archiveTextRecords = [];
  try {
    currentTextRecords = await fetchHydropacCurrentTextWarnings();
  } catch (error) {
    sourceErrors.push(`HYDROPAC current text supplement: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    archiveTextRecords = await fetchHydropacArchiveTextWarningsForDate(historyDate);
  } catch (error) {
    sourceErrors.push(`HYDROPAC archive text supplement: ${error instanceof Error ? error.message : String(error)}`);
  }
  const historyCoverage = hydropacHistoryCoverage(allRecordsPayload.records);
  const targetYear = Number(historyDate.slice(0, 4));
  const completeOfficialCoverage = Number.isFinite(historyCoverage.maxYear) && historyCoverage.maxYear >= targetYear;
  const records = mergeHydropacRecords(
    [...allRecordsPayload.records, ...currentTextRecords, ...archiveTextRecords].filter((record) => hydropacRecordIntersectsRange(record, dayRange.startMs, dayRange.endMs)),
  );
  const built = records.map((warning, index) => buildHydropacRestriction(warning, index));
  const restrictions = built.filter((item) => item?.hasGeometry);
  const skipped = built.filter((item) => item && !item.hasGeometry);
  const skippedReasons = countBy(skipped, (item) => item.geometryReason || "No parsed boundary geometry");
  const latestIssuedAt = latestIso(built.map((item) => item?.issuedAt || item?.beginsAt || item?.endsAt).filter(Boolean));
  const cacheKey = `v1:nga-msi:hydropac:history:${historyDate}`;
  const data = {
    generatedAt,
    dataVersion: `${cacheKey}:${latestIssuedAt || allRecordsPayload.savedAt || generatedAt}`,
    historyDate,
    historyDateZone: "Asia/Shanghai",
    historyDayStart: dayRange.startIso,
    historyDayEnd: dayRange.endIso,
    temporalReferenceTime: dayRange.startIso,
    restrictions,
    skipped: skipped.map((item) => ({
      id: item.id,
      warningId: item.notamId,
      title: item.title,
      issuedAt: item.issuedAt,
      beginsAt: item.beginsAt,
      endsAt: item.endsAt,
      timeIntervals: item.timeIntervals,
      longTerm: item.longTerm,
      temporalParseVersion: item.temporalParseVersion,
      timeLabel: item.timeLabel,
      beijingTimeLabel: item.beijingTimeLabel,
      coordinateCount: item.coordinateCount,
      reason: item.geometryReason,
      rawTextPreview: item.rawTextPreview,
      rawText: item.rawText,
    })),
    source: {
      status: completeOfficialCoverage ? "ok" : "warn",
      message:
        `HYDROPAC 历史查询：北京时间 ${historyDate} 当天已发布且未过期（含未来生效）${records.length} 条；${restrictions.length} 条可绘制，${skipped.length} 条未绘制。` +
        (completeOfficialCoverage
          ? ""
          : ` 注意：NGA 官方全量历史库当前仅覆盖到 ${historyCoverage.maxYear || "未知"} 年，已叠加当前 HYDROPAC 文本镜像，目标年结果可能不完整。`),
      urls: {
        app: NGA_MSI_NAV_WARNINGS_URL,
        allEndpoint: hydropacAllHistoryUrl(),
        currentTextPage: HYDROPAC_CURRENT_TEXT_URL,
        archiveTextPage: HYDROPAC_ARCHIVE_TEXT_URL,
      },
      navArea: "HYDROPAC",
      historyDate,
      historyDateZone: "Asia/Shanghai",
      historyDayStart: dayRange.startIso,
      historyDayEnd: dayRange.endIso,
      totalWarnings: records.length,
      allRecordsScanned: allRecordsPayload.records.length,
      allRecordsSavedAt: allRecordsPayload.savedAt,
      currentTextWarnings: currentTextRecords.length,
      archiveTextWarnings: archiveTextRecords.length,
      completeOfficialCoverage,
      officialHistoryCoverage: historyCoverage,
      drawableWarnings: restrictions.length,
      skippedWarnings: skipped.length,
      skippedReasons,
      sourceErrors,
      latestIssuedAt,
    },
  };
  const displayData = filterPayloadToReferenceTime("hydropac", data, dayRange.startIso, "history-date");
  if (!writeHydropacHistorySnapshot(historyDate, cacheKey, displayData, generatedAt)) {
    throw new Error(`HYDROPAC ${historyDate} history was reconstructed, but its replay snapshot could not be saved.`);
  }
  hydropacHistoryCache.set(`v1:nga-msi:hydropac:history:${historyDate}:cache`, { expiresAt: Date.now() + CACHE_TTL_MS, data: displayData });
  return displayData;
}

async function getHydropacAllHistoryRecords({ refresh }) {
  const cacheKey = "v1:nga-msi:hydropac:all";
  const cached = hydropacHistoryCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!refresh) {
    const diskCached = readHydropacAllHistoryDiskCache(cacheKey);
    if (diskCached) {
      hydropacHistoryCache.set(cacheKey, { expiresAt: Date.now() + HYDROPAC_ALL_DISK_CACHE_MAX_AGE_MS, data: diskCached });
      return diskCached;
    }
  }
  const payload = await fetchJsonOfficial(hydropacAllHistoryUrl(), 120000);
  const records = normalizeNgaBroadcastWarnings(payload).filter((item) => item.navArea === "P");
  const data = {
    cacheKey,
    savedAt: new Date().toISOString(),
    records,
    source: {
      status: "ok",
      url: hydropacAllHistoryUrl(),
      count: records.length,
    },
  };
  writeHydropacAllHistoryDiskCache(cacheKey, data);
  hydropacHistoryCache.set(cacheKey, { expiresAt: Date.now() + HYDROPAC_ALL_DISK_CACHE_MAX_AGE_MS, data });
  return data;
}

function hydropacAllHistoryUrl() {
  return "https://msi.nga.mil/api/publications/broadcast-warn?navArea=P&status=all&output=json";
}

function readHydropacAllHistoryDiskCache(cacheKey) {
  try {
    if (!existsSync(HYDROPAC_ALL_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(HYDROPAC_ALL_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (cached.cacheKey !== cacheKey || !savedAt || Date.now() - savedAt > HYDROPAC_ALL_DISK_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(cached.records)) return null;
    return cached;
  } catch {
    return null;
  }
}

function writeHydropacAllHistoryDiskCache(cacheKey, data) {
  try {
    mkdirSync(dataDirectory, { recursive: true });
    writeJsonFileAtomic(HYDROPAC_ALL_CACHE_FILE, { ...data, cacheKey });
  } catch {
    // The all-history cache only accelerates date reconstruction.
  }
}

function writeHydropacHistorySnapshot(historyDate, cacheKey, data, savedAt = new Date().toISOString()) {
  try {
    mkdirSync(HYDROPAC_SNAPSHOT_DIR, { recursive: true });
    const dateStamp = String(historyDate || "").replace(/\D/g, "") || "date";
    const baseStamp = String(savedAt || new Date().toISOString()).replace(/\D/g, "").slice(0, 17) || String(Date.now());
    let filePath = join(HYDROPAC_SNAPSHOT_DIR, `hydropac_history_${dateStamp}_${baseStamp}.json`);
    let suffix = 1;
    while (existsSync(filePath)) {
      filePath = join(HYDROPAC_SNAPSHOT_DIR, `hydropac_history_${dateStamp}_${baseStamp}_${suffix}.json`);
      suffix += 1;
    }
    writeJsonFileAtomic(filePath, { cacheKey, savedAt, historyDate, data });
    if (!recordRefreshHistorySnapshot("hydropac", basename(filePath), cacheKey, savedAt, data)) {
      unlinkSync(filePath);
      return false;
    }
    return true;
  } catch (error) {
    console.error("HYDROPAC history replay snapshot failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function hydropacHistoryCoverage(records) {
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const record of records || []) {
    const year = Number(record?.msgYear);
    if (!Number.isFinite(year)) continue;
    minYear = Math.min(minYear, year);
    maxYear = Math.max(maxYear, year);
  }
  return {
    minYear: Number.isFinite(minYear) ? minYear : null,
    maxYear: Number.isFinite(maxYear) ? maxYear : null,
  };
}

function normalizeHistoryDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function beijingDateRangeUtc(dateText) {
  const [year, month, day] = String(dateText).split("-").map(Number);
  const startMs = Date.UTC(year, month - 1, day, -8, 0, 0, 0);
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return {
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function hydropacRecordIntersectsRange(record, startMs, endMs) {
  const warningId = formatNgaWarningId(record);
  const rawText = composeNgaWarningText(record, warningId);
  const schedule = parseMarineSchedule(rawText, record);
  const issuedMs = Date.parse(schedule.issuedAt || parseMarineIssueDate(record.issueDate, record.msgYear) || "");
  const cancelMs = Date.parse(parseMarineIssueDate(record.cancelDate, record.msgYear) || "");
  const end = firstFiniteNumber([
    Date.parse(schedule.endsAt || ""),
    Number.isFinite(cancelMs) ? cancelMs : NaN,
  ]);
  if (Number.isFinite(end) && end < startMs) return false;
  if (Number.isFinite(issuedMs) && issuedMs > endMs) return false;
  if (!Number.isFinite(issuedMs)) {
    const start = Date.parse(schedule.beginsAt || "");
    if (Number.isFinite(start) && start > endMs) return false;
  }
  return true;
}

function firstFiniteNumber(values) {
  for (const value of values || []) {
    if (Number.isFinite(value)) return value;
  }
  return NaN;
}

async function getMsaNavWarnings({ refresh }) {
  const cacheKey = `v2:msa-nav-warning:pages:${MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU}:lookback:${MSA_NAV_WARNING_LOOKBACK_DAYS}`;
  const cached = msaWarningCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!refresh) {
    const diskCached = readMsaNavWarningDiskCache(cacheKey, { allowExpired: true });
    if (diskCached) {
      msaWarningCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: diskCached });
      return diskCached;
    }
    return emptyMarineCachePayload(cacheKey, "中国航警", "No saved China MSA navigational-warning cache is available. Use the refresh button to fetch it manually.");
  }
  const inFlight = msaWarningInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildMsaNavWarningPayload(cacheKey)
    .catch((error) => {
      const stale = cached?.data || readMsaNavWarningDiskCache(cacheKey, { allowExpired: true });
      if (!stale) throw error;
      return withMarineRefreshFallback(stale, "China MSA", error);
    })
    .finally(() => {
      msaWarningInFlight.delete(cacheKey);
    });
  msaWarningInFlight.set(cacheKey, request);
  return request;
}

function readMsaNavWarningDiskCache(cacheKey, options = {}) {
  try {
    if (!existsSync(MSA_NAV_WARNING_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(MSA_NAV_WARNING_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (cached.cacheKey !== cacheKey || !savedAt) return null;
    if (!options.allowExpired && Date.now() - savedAt > MSA_NAV_WARNING_DISK_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(cached.data?.restrictions)) return null;
    const migration = migrateCachedAreaParseResults("msa", cached.data);
    if (migration.changed) writeMigratedAreaDiskCache(MSA_NAV_WARNING_CACHE_FILE, cached, migration.data);
    const needsTemporalMigration = [...(migration.data.restrictions || []), ...(migration.data.skipped || [])]
      .some((item) => item?.temporalParseVersion !== MSA_TEMPORAL_PARSE_VERSION);
    const filtered = filterPayloadToReferenceTime("msa", migration.data, cached.savedAt || migration.data.generatedAt, "disk-cache");
    const temporalSelectionChanged =
      Number(filtered.restrictions?.length || 0) !== Number(migration.data.restrictions?.length || 0) ||
      Number(filtered.skipped?.length || 0) !== Number(migration.data.skipped?.length || 0);
    const temporalMetadataChanged = filtered.source?.message !== migration.data.source?.message;
    if (needsTemporalMigration || temporalSelectionChanged || temporalMetadataChanged) {
      writeJsonFileAtomic(MSA_NAV_WARNING_CACHE_FILE, { ...cached, data: filtered }, 2);
    }
    return filtered;
  } catch {
    return null;
  }
}

function writeMsaNavWarningDiskCache(cacheKey, data, savedAtOverride = null) {
  try {
    if (data?.source?.status !== "ok") return false;
    mkdirSync(dataDirectory, { recursive: true });
    const savedAt = savedAtOverride || new Date().toISOString();
    data.cacheSavedAt = savedAt;
    data.refreshCompletedAt = savedAt;
    data.source = { ...data.source, fetchedAt: data.source.fetchedAt || savedAt, cacheSavedAt: savedAt };
    writeJsonFileAtomic(MSA_NAV_WARNING_CACHE_FILE, { cacheKey, savedAt, data }, 2);
    if (!writeSourceSnapshot("msa", cacheKey, data, savedAt)) return false;
    return true;
  } catch (error) {
    console.error("China MSA cache persistence failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function buildMsaNavWarningPayload(cacheKey) {
  const generatedAt = new Date().toISOString();
  const sourceErrors = [];
  const refreshBaseline = readMsaRefreshBaseline(cacheKey);
  const baselineSavedAtMs = Date.parse(refreshBaseline?.savedAt || "");
  const incrementalCutoffMs = Number.isFinite(baselineSavedAtMs)
    ? baselineSavedAtMs - 3 * 24 * 60 * 60 * 1000
    : Date.now() - MSA_NAV_WARNING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  let columns = [];
  let listItems = [];
  let listCoverage = [];
  let detailRecords = [];
  let fetchedDetailPages = 0;

  try {
    const indexHtml = await fetchMsaText(MSA_NAV_WARNING_URL, 45000);
    columns = discoverMsaWarningColumns(indexHtml);
    const listFetch = await fetchMsaWarningListItems(columns, sourceErrors, { cutoffMs: incrementalCutoffMs });
    listItems = listFetch.items;
    listCoverage = listFetch.coverage;
    const uniqueItems = dedupeMsaListItems(listItems).filter(isMsaListItemWithinLookback);
    const fetchedDetails = (
      await mapLimit(uniqueItems, MSA_NAV_WARNING_DETAIL_CONCURRENCY, async (item) => {
        try {
          return await fetchMsaWarningDetail(item);
        } catch (error) {
          sourceErrors.push(`${item.bureau || "MSA"} ${item.title || item.url}: ${error instanceof Error ? error.message : String(error)}`);
          return null;
        }
      })
    ).filter(Boolean);
    fetchedDetailPages = fetchedDetails.length;
    detailRecords = mergeMsaDetailRecords(refreshBaseline?.records || [], fetchedDetails);
  } catch (error) {
    sourceErrors.push(error instanceof Error ? error.message : String(error));
  }

  if (sourceErrors.length) {
    throw new Error(`China MSA refresh was incomplete and was not published. ${sourceErrors.slice(0, 12).join("; ")}`);
  }
  if (!detailRecords.length) throw new Error("China MSA refresh returned no warning detail records; the previous cache was preserved.");

  const referenceMs = Date.parse(generatedAt);
  const inForceWarningKeys = extractMsaInForceWarningKeys(detailRecords);
  const activeRecords = detailRecords
    .map((record) => applyMsaInForceStatus(record, inForceWarningKeys))
    .filter((record) => isMsaWarningActiveOrFuture(record, referenceMs));
  const built = activeRecords.map((record, index) => buildMsaNavWarningRestriction(record, index));
  const restrictions = built.filter((item) => item?.hasGeometry);
  const skipped = built.filter((item) => item && !item.hasGeometry);
  const skippedReasons = countBy(skipped, (item) => item.geometryReason || "No parsed boundary geometry");
  const latestIssuedAt = latestIso(built.map((item) => item?.issuedAt || item?.beginsAt || item?.endsAt).filter(Boolean));
  const sourceCoverage = buildMsaSourceCoverage(listCoverage, detailRecords, activeRecords, restrictions, skipped);
  const dataVersion = `${cacheKey}:${latestIssuedAt || generatedAt}`;
  const data = {
    generatedAt,
    dataVersion,
    areaParseMigrationVersion: AREA_PARSE_MIGRATION_VERSION,
    restrictions,
    skipped: skipped.map((item) => ({
      id: item.id,
      warningId: item.notamId,
      title: item.title,
      beginsAt: item.beginsAt,
      endsAt: item.endsAt,
      coordinateCount: item.coordinateCount,
      reason: item.geometryReason,
      rawTextPreview: item.rawTextPreview,
      rawText: item.rawText,
      officialPageUrl: item.officialPageUrl,
      sourceBureau: item.sourceBureau,
    })),
    source: {
      status: "ok",
      message: `China MSA loaded ${activeRecords.length} active/future navigational warnings from ${columns.length} bureaus; ${restrictions.length} have parseable boundary geometry and ${skipped.length} were not drawn.`,
      urls: {
        app: MSA_NAV_WARNING_URL,
      },
      totalWarnings: activeRecords.length,
      scannedListItems: listItems.length,
      scannedDetailPages: fetchedDetailPages,
      reusedCachedDetails: refreshBaseline?.records?.length || 0,
      refreshMode: refreshBaseline ? "incremental-from-complete-cache" : "full-lookback",
      baselineSavedAt: refreshBaseline?.savedAt || null,
      bureauCount: columns.length,
      maxPagesPerBureau: MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU,
      lookbackDays: MSA_NAV_WARNING_LOOKBACK_DAYS,
      bureaus: sourceCoverage,
      coverageWarnings: sourceCoverage
        .filter((item) => item.truncatedWithinLookback || item.errors?.length)
        .map((item) => ({
          bureau: item.bureau,
          stopReason: item.stopReason,
          oldestPublishDate: item.oldestPublishDate,
          errors: item.errors || [],
        })),
      drawableWarnings: restrictions.length,
      skippedWarnings: skipped.length,
      skippedReasons,
      sourceErrors,
      latestIssuedAt,
      temporalPolicy: "active-and-future-at-refresh",
      temporalReferenceTime: generatedAt,
    },
  };
  const refreshReferenceTime = new Date().toISOString();
  const displayData = filterPayloadToReferenceTime("msa", data, refreshReferenceTime, "live-refresh");
  if (!writeMsaNavWarningDiskCache(cacheKey, displayData, refreshReferenceTime)) {
    throw new Error("China MSA refresh completed, but its cache and history snapshot could not be saved; keeping the previous cache.");
  }
  msaWarningCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: displayData });
  return displayData;
}

function buildMsaSourceCoverage(coverage, detailRecords, activeRecords, restrictions, skipped) {
  const detailByBureau = countBy(detailRecords, (item) => item.listBureau || item.bureau || "Unknown");
  const activeByBureau = countBy(activeRecords, (item) => item.listBureau || item.bureau || "Unknown");
  const drawableByBureau = countBy(restrictions, (item) => item.sourceBureau || item.region || item.regionName || "Unknown");
  const skippedByBureau = countBy(skipped, (item) => item.sourceBureau || item.region || item.regionName || "Unknown");
  const cutoffMs = Date.now() - MSA_NAV_WARNING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  return (coverage || []).map((entry) => {
    const oldestMs = Date.parse(entry.oldestPublishDate || "");
    const reachedDateCutoff = Number.isFinite(oldestMs) && oldestMs < cutoffMs;
    const reachedSourceEnd = ["date-cutoff", "page-end", "not-paged", "empty-page"].includes(entry.stopReason);
    const truncatedWithinLookback = entry.stopReason === "max-pages" && !reachedDateCutoff;
    return {
      bureau: entry.bureau || "Unknown",
      url: entry.url,
      paged: Boolean(entry.paged),
      availablePages: Number(entry.availablePages || 0),
      scannedPages: Number(entry.scannedPages || 0),
      scannedItems: Number(entry.scannedItems || 0),
      stopReason: entry.stopReason || "unknown",
      fetchedThroughLookback: Boolean(reachedDateCutoff || reachedSourceEnd),
      truncatedWithinLookback,
      latestPublishDate: entry.latestPublishDate || "",
      oldestPublishDate: entry.oldestPublishDate || "",
      detailPages: Number(detailByBureau[entry.bureau] || 0),
      activeWarnings: Number(activeByBureau[entry.bureau] || 0),
      drawableWarnings: Number(drawableByBureau[entry.bureau] || 0),
      skippedWarnings: Number(skippedByBureau[entry.bureau] || 0),
      pageItems: (entry.pageItems || []).slice(0, 12),
      errors: entry.errors || [],
    };
  });
}

function readMsaRefreshBaseline(cacheKey) {
  try {
    if (!existsSync(MSA_NAV_WARNING_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(MSA_NAV_WARNING_CACHE_FILE, "utf8"));
    if (cached.cacheKey !== cacheKey || !cached.savedAt) return null;
    const items = [...(cached.data?.restrictions || []), ...(cached.data?.skipped || [])];
    const records = items.map(msaCachedItemToDetailRecord).filter(Boolean);
    return records.length ? { savedAt: cached.savedAt, records } : null;
  } catch {
    return null;
  }
}

function msaCachedItemToDetailRecord(item) {
  const rawText = String(item?.rawText || "").trim();
  if (!rawText) return null;
  const publishDate = item?.issuedAt || item?.modifiedAt || null;
  return {
    bureau: item?.region || item?.regionName || item?.sourceBureau || "中国海事局",
    listBureau: item?.sourceBureau || item?.region || item?.regionName || "中国海事局",
    title: item?.title || item?.warningId || item?.notamId || "中国航警",
    warningId: item?.warningId || item?.notamId || extractMsaWarningId(rawText),
    publishDate,
    rawText,
    officialPageUrl: item?.officialPageUrl || item?.sourceUrl || "",
    schedule: parseMsaWarningSchedule(rawText, publishDate),
    fromSavedCache: true,
  };
}

function mergeMsaDetailRecords(cachedRecords, fetchedRecords) {
  const merged = new Map();
  for (const record of [...(cachedRecords || []), ...(fetchedRecords || [])]) {
    const key = record?.officialPageUrl || record?.warningId || `${record?.title || ""}:${record?.publishDate || ""}`;
    if (key) merged.set(key, record);
  }
  return [...merged.values()];
}

function discoverMsaWarningColumns(indexHtml) {
  const source = String(indexHtml || "");
  const navPattern =
    /<li\s+class="nav_lv2_list[^"]*">\s*<a\s+href="([^"]+)"[\s\S]*?<div\s+class="nav_lv2_text">\s*([\s\S]*?)\s*<\/div>/gi;
  const columns = [];
  const seenLabels = new Set();
  for (const match of source.matchAll(navPattern)) {
    const href = String(match[1] || "").trim();
    const label = stripHtml(match[2]).replace(/\s+/g, " ").trim();
    if (!label || !/海事局/.test(label)) continue;
    if (seenLabels.has(label)) break;
    if (!/\/index\.(?:jhtml|html)(?:\?|$)/i.test(href)) continue;
    seenLabels.add(label);
    columns.push({
      bureau: label,
      url: absoluteMsaUrl(href),
      paged: /\.jhtml(?:\?|$)/i.test(href),
    });
  }
  if (!columns.length) {
    columns.push({ bureau: "上海海事局", url: MSA_NAV_WARNING_URL, paged: true });
  }
  return columns;
}

async function fetchMsaWarningListItems(columns, sourceErrors = [], options = {}) {
  const configuredCutoffMs = Number(options.cutoffMs);
  const cutoffMs = Number.isFinite(configuredCutoffMs)
    ? configuredCutoffMs
    : Date.now() - MSA_NAV_WARNING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const output = [];
  const coverage = [];
  await mapLimit(columns, 4, async (column) => {
    const entry = {
      bureau: column.bureau,
      url: column.url,
      paged: Boolean(column.paged),
      availablePages: 1,
      scannedPages: 0,
      scannedItems: 0,
      stopReason: "",
      latestPublishDate: "",
      oldestPublishDate: "",
      pageItems: [],
      errors: [],
      cutoffTime: new Date(cutoffMs).toISOString(),
    };
    coverage.push(entry);
    let page = 1;
    let pageCount = 1;
    while (page <= pageCount && page <= MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU) {
      const pageUrl = msaColumnPageUrl(column, page);
      let html = "";
      try {
        html = await fetchMsaText(pageUrl, 45000);
      } catch (error) {
        const message = `${column.bureau || "MSA"} list page ${page}: ${error instanceof Error ? error.message : String(error)}`;
        entry.errors.push(message);
        sourceErrors.push(message);
        entry.stopReason = "fetch-error";
        break;
      }
      if (page === 1) pageCount = column.paged ? parseMsaListPageCount(html) : 1;
      entry.availablePages = pageCount;
      const items = parseMsaWarningListPage(html, column, pageUrl);
      const pageDates = mergeMsaCoverageDates(entry, items);
      entry.scannedPages += 1;
      entry.scannedItems += items.length;
      entry.pageItems.push({
        page,
        url: pageUrl,
        count: items.length,
        latestPublishDate: pageDates.latest || "",
        oldestPublishDate: pageDates.oldest || "",
      });
      output.push(...items);
      if (!items.length) {
        entry.stopReason = "empty-page";
        break;
      }
      if (!column.paged) {
        entry.stopReason = "not-paged";
        break;
      }
      const dates = items.map((item) => Date.parse(item.publishDate)).filter(Number.isFinite);
      if (dates.length && Math.max(...dates) < cutoffMs) {
        entry.stopReason = "date-cutoff";
        break;
      }
      if (page >= pageCount) {
        entry.stopReason = "page-end";
        break;
      }
      if (page >= MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU) {
        entry.stopReason = "max-pages";
        break;
      }
      page += 1;
    }
    if (!entry.stopReason) entry.stopReason = page > pageCount ? "page-end" : "max-pages";
  });
  coverage.sort((a, b) => String(a.bureau || "").localeCompare(String(b.bureau || ""), "zh-Hans-CN"));
  return { items: output, coverage };
}

function mergeMsaCoverageDates(entry, items) {
  const timestamps = items.map((item) => Date.parse(item.publishDate)).filter(Number.isFinite);
  if (!timestamps.length) return { latest: "", oldest: "" };
  const latest = new Date(Math.max(...timestamps)).toISOString();
  const oldest = new Date(Math.min(...timestamps)).toISOString();
  entry.latestPublishDate = latestIso([entry.latestPublishDate, latest].filter(Boolean)) || latest;
  const previousOldestMs = Date.parse(entry.oldestPublishDate || "");
  entry.oldestPublishDate =
    Number.isFinite(previousOldestMs) && previousOldestMs < Date.parse(oldest) ? entry.oldestPublishDate : oldest;
  return { latest, oldest };
}

function msaColumnPageUrl(column, page) {
  if (!column?.paged || page <= 1) return column.url;
  const url = new URL(column.url);
  url.pathname = url.pathname.replace(/\/index\.jhtml$/i, `/index_${page}.jhtml`);
  return url.href;
}

function parseMsaListPageCount(html) {
  const source = String(html || "");
  const count = Number(source.match(/pageParam\.count\s*=\s*(\d+)/i)?.[1] || 0);
  const limit = Number(source.match(/pageParam\.limit\s*=\s*(\d+)/i)?.[1] || 20) || 20;
  if (!Number.isFinite(count) || count <= 0) return 1;
  return Math.max(1, Math.ceil(count / limit));
}

function parseMsaWarningListPage(html, column, pageUrl) {
  const rows = [];
  const pattern =
    /<a[^>]+href="([^"]+)"[^>]*>\s*<span\s+class="name">\s*([\s\S]*?)\s*<\/span>\s*<span\s+class="time">\s*([\s\S]*?)\s*<\/span>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    const href = String(match[1] || "").trim();
    const title = stripHtml(match[2]).replace(/\s+/g, " ").trim();
    const publishDateText = stripHtml(match[3]).replace(/\s+/g, " ").trim();
    if (!href || !title) continue;
    rows.push({
      bureau: column.bureau,
      listUrl: pageUrl,
      url: absoluteMsaUrl(href),
      title,
      publishDateText,
      publishDate: parseMsaPublishDate(publishDateText),
    });
  }
  return rows;
}

function dedupeMsaListItems(items) {
  const seen = new Set();
  const output = [];
  for (const item of items || []) {
    const key = item.url || `${item.bureau}:${item.title}:${item.publishDateText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function isMsaListItemWithinLookback(item) {
  const timestamp = Date.parse(item?.publishDate);
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= Date.now() - MSA_NAV_WARNING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
}

async function fetchMsaWarningDetail(item) {
  const html = await fetchMsaText(item.url, 45000);
  return parseMsaWarningDetail(html, item);
}

function parseMsaWarningDetail(html, item) {
  const source = String(html || "");
  const title = getHtmlMeta(source, "ArticleTitle") || item.title;
  const pubDate = getHtmlMeta(source, "PubDate") || item.publishDateText;
  const bureau = getHtmlMeta(source, "ContentSource") || item.bureau;
  const warningId = extractMsaWarningId(`${title} ${source}`) || title;
  const paragraphs = [...source.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !/收藏|打印本页|关闭窗口|下载PDF|分享到/.test(line));
  const bodyText = paragraphs.join("\n") || stripHtml(source).replace(/\s+/g, " ").trim();
  const publishIso = parseMsaPublishDate(pubDate);
  const schedule = parseMsaWarningSchedule(bodyText, publishIso);
  return {
    ...item,
    listBureau: item.bureau,
    bureau,
    title,
    warningId,
    publishDate: publishIso || item.publishDate,
    rawText: bodyText,
    officialPageUrl: item.url,
    schedule,
  };
}

function getHtmlMeta(html, name) {
  const pattern = new RegExp(`<meta\\s+name=["']${escapeRegExp(name)}["']\\s+content=["']([^"']*)["']`, "i");
  return decodeEntities(String(html || "").match(pattern)?.[1] || "").trim() || null;
}

function extractMsaWarningId(text) {
  const international = String(text || "").match(/(?:^|[^A-Z0-9])([A-Z]{1,8}\s*\d{1,5}\s*\/\s*\d{2,4})(?![A-Z0-9])/i)?.[1];
  if (international) return international.replace(/\s+/g, "").toUpperCase();
  return String(text || "").match(/([\u4e00-\u9fa5A-Za-z]{0,12}航警\s*\d{1,5}\/\d{2,4})/)?.[1]?.replace(/\s+/g, "") || null;
}

function normalizeMsaWarningLookupKey(value, defaultYear = null) {
  const source = String(value || "").toUpperCase().replace(/[\s：:]/g, "");
  const match = source.match(/([A-Z]{1,8})(\d{1,5})(?:\/(\d{2,4}))?/);
  if (!match) return null;
  const year = match[3] || defaultYear;
  if (!year) return null;
  return `${match[1]}${Number(match[2])}/${String(year).slice(-2)}`;
}

function extractMsaInForceWarningKeys(records) {
  const latestByBulletin = new Map();
  for (const record of records || []) {
    const text = String(record?.rawText || "");
    if (!/WARNINGS?\s+IN\s+FORCE|IN[\s－-]*FORCE\s+BULLETIN|现行.*航警|航警.*有效/i.test(`${record?.title || ""} ${text}`)) continue;
    const bulletinId = extractMsaWarningId(`${text} ${record?.title || ""}`);
    const family = String(bulletinId || record?.title || "MSA").match(/([A-Z]{1,8})\s*\d/i)?.[1]?.toUpperCase() || "MSA";
    const timestamp = Date.parse(record?.publishDate || record?.issuedAt || "") || 0;
    const previous = latestByBulletin.get(family);
    if (!previous || timestamp > previous.timestamp) latestByBulletin.set(family, { record, timestamp });
  }

  const keys = new Set();
  for (const { record } of latestByBulletin.values()) {
    const text = String(record?.rawText || "").toUpperCase().replace(/：/g, ":");
    for (const series of text.matchAll(/(\d{4})\s+SERIES\s*:\s*([\s\S]*?)(?=(?:\d{4}\s+SERIES\s*:|\b2\s*\.\s*NOTES\b|$))/gi)) {
      const year = series[1];
      for (const group of series[2].matchAll(/\b([A-Z]{1,8})\s*:\s*([0-9,\s]+?)(?=;|\.|$)/gi)) {
        for (const number of group[2].match(/\d{1,5}/g) || []) {
          const key = normalizeMsaWarningLookupKey(`${group[1]}${number}`, year);
          if (key) keys.add(key);
        }
      }
    }
  }
  return keys;
}

function applyMsaInForceStatus(record, inForceWarningKeys) {
  if (!record || !inForceWarningKeys?.size) return record;
  const warningId = extractMsaWarningId(`${record.rawText || ""} ${record.warningId || ""} ${record.title || ""}`);
  const key = normalizeMsaWarningLookupKey(warningId);
  if (!key || !inForceWarningKeys.has(key)) return record;
  return {
    ...record,
    warningId: record.warningId || warningId,
    longTerm: true,
    inForceAtReference: true,
    timeLabel: record.timeLabel || record.schedule?.timeLabel || "现行航警公报确认有效",
    beijingTimeLabel: record.beijingTimeLabel || record.schedule?.beijingTimeLabel || "刷新时刻仍在现行航警公报中",
    schedule: {
      ...(record.schedule || {}),
      longTerm: true,
      inForceAtReference: true,
      timeLabel: record.schedule?.timeLabel || "现行航警公报确认有效",
      beijingTimeLabel: record.schedule?.beijingTimeLabel || "刷新时刻仍在现行航警公报中",
    },
  };
}

function parseMsaPublishDate(value) {
  const match = String(value || "").match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!match) return null;
  return chinaLocalDateToIso(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
}

function parseMsaWarningSchedule(rawText, publishIso) {
  const text = String(rawText || "");
  const publish = beijingDateTimeParts(publishIso);
  const fallbackYear = Number(publish?.year) || new Date().getFullYear();
  const intervals = [];
  const labels = [];
  const seenIntervals = new Set();
  const addInterval = (start, end, label) => {
    if (!start && !end) return;
    const key = `${start || ""}/${end || ""}`;
    if (seenIntervals.has(key)) return;
    seenIntervals.add(key);
    intervals.push({ start, end });
    if (label) labels.push(label.replace(/\s+/g, " ").trim());
  };

  for (const match of text.matchAll(/\bFROM\s+(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+TO\s+(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+([A-Z]{3})\.?(?:\s+(\d{2,4}))?\b/gi)) {
    const start = marineDateToIso(match[1], match[2], match[3], match[7], match[8], fallbackYear);
    let end = marineDateToIso(match[4], match[5], match[6], match[7], match[8], fallbackYear);
    if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 31 * 24 * 60 * 60 * 1000).toISOString();
    addInterval(start, end, match[0]);
  }

  for (const match of text.matchAll(/\bFROM\s+(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+((?!UTC\b)[A-Z]{3,9})\.?\s+TO\s+(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+((?!UTC\b)[A-Z]{3,9})\.?(?:\s+(\d{2,4}))?\b/gi)) {
    const start = marineDateToIso(match[1], match[2], match[3], match[4], match[9], fallbackYear);
    let end = marineDateToIso(match[5], match[6], match[7], match[8], match[9], fallbackYear);
    if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 365 * 24 * 60 * 60 * 1000).toISOString();
    addInterval(start, end, match[0]);
  }

  for (const match of text.matchAll(/\b(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+TO\s+(\d{2})(\d{2})(\d{2})\s*(?:UTC)?\s+([A-Z]{3,9})\.?(?:\s+(\d{2,4}))?\b/gi)) {
    const prefix = text.slice(Math.max(0, Number(match.index) - 12), Number(match.index));
    if (/\b(?:FROM|ROM)\s*$/i.test(prefix)) continue;
    const start = marineDateToIso(match[1], match[2], match[3], match[7], match[8], fallbackYear);
    let end = marineDateToIso(match[4], match[5], match[6], match[7], match[8], fallbackYear);
    if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 31 * 24 * 60 * 60 * 1000).toISOString();
    addInterval(start, end, match[0]);
  }

  for (const match of text.matchAll(/\b(?:FROM|ROM)\s+(\d{1,2})(?:\s*([A-Z]{3,9}))?\.?\s*(\d{2,4})?\s*TO\s*(\d{1,2})\s*([A-Z]{3,9})\.?\s*(\d{2,4})?(?![A-Z])/gi)) {
    const startMonth = match[2] || match[5];
    const startYear = match[3] || match[6] || null;
    const endYear = match[6] || match[3] || null;
    const start = marineDateToIso(String(match[1]).padStart(2, "0"), "00", "00", startMonth, startYear, fallbackYear);
    const end = marineDateToIso(String(match[4]).padStart(2, "0"), "23", "59", match[5], endYear, fallbackYear);
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/\bFROM\s+(\d{2})(\d{2})\s*(?:UTC)?\s+TO\s+(\d{2})(\d{2})\s*(?:UTC)?\s+(?:ON\s+)?(\d{1,2})\s*([A-Z]{3,9})\.?(?:\s+(\d{2,4}))?\b/gi)) {
    const start = marineDateToIso(match[5], match[1], match[2], match[6], match[7], fallbackYear);
    const end = marineDateToIso(match[5], match[3], match[4], match[6], match[7], fallbackYear);
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/(?:自)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{2})(\d{2})时?\s*(?:至|到|－|-|—)\s*(\d{2})(\d{2})时?/g)) {
    const year = Number(match[1] || fallbackYear);
    const start = chinaLocalDateToIso(year, Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]));
    const end = chinaLocalDateToIso(year, Number(match[2]), Number(match[3]), Number(match[6]), Number(match[7]));
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/(?:自)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{1,2})时(?:\s*(\d{1,2})分)?\s*(?:至|到|－|-|—)\s*(\d{1,2})时(?:\s*(\d{1,2})分)?/g)) {
    const year = Number(match[1] || fallbackYear);
    const start = chinaLocalDateToIso(year, Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5] || 0));
    const end = chinaLocalDateToIso(year, Number(match[2]), Number(match[3]), Number(match[6]), Number(match[7] || 0));
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/(?:自)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(\d{2})(\d{2})时?(?:起)?\s*(?:至|到|－|-|—)\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日\s*(\d{2})(\d{2})时?/g)) {
    const startYear = Number(match[1] || fallbackYear);
    const startMonth = Number(match[2]);
    const endYear = Number(match[6] || startYear);
    const endMonth = Number(match[7] || startMonth);
    const start = chinaLocalDateToIso(startYear, startMonth, Number(match[3]), Number(match[4]), Number(match[5]));
    const end = chinaLocalDateToIso(endYear, endMonth, Number(match[8]), Number(match[9]), Number(match[10]));
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(?:至|到|－|-|—)\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日[，,\s]*(?:每天|每日|日)?\s*(\d{2})(\d{2})时?\s*(?:至|到|－|-|—)\s*(\d{2})(\d{2})时?/g)) {
    const startYear = Number(match[1] || fallbackYear);
    const startMonth = Number(match[2]);
    const endYear = Number(match[4] || startYear);
    const endMonth = Number(match[5] || startMonth);
    const start = chinaLocalDateToIso(startYear, startMonth, Number(match[3]), Number(match[7]), Number(match[8]));
    const end = chinaLocalDateToIso(endYear, endMonth, Number(match[6]), Number(match[9]), Number(match[10]));
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  for (const match of text.matchAll(/(?:自)?(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日\s*(?:至|到|－|-|—)\s*(?:(\d{4})年)?(?:(\d{1,2})月)?(\d{1,2})日/g)) {
    const following = text.slice(Number(match.index) + match[0].length, Number(match.index) + match[0].length + 80);
    if (/(?:每天|每日|日)?\s*\d{4}时?\s*(?:至|到|－|-|—)\s*\d{4}时?/.test(following)) continue;
    const startYear = Number(match[1] || fallbackYear);
    const startMonth = Number(match[2]);
    const endYear = Number(match[4] || startYear);
    const endMonth = Number(match[5] || startMonth);
    const start = chinaLocalDateToIso(startYear, startMonth, Number(match[3]), 0, 0);
    const end = chinaLocalDateToIso(endYear, endMonth, Number(match[6]), 23, 59);
    addInterval(start, normalizeMsaEndIso(start, end), match[0]);
  }

  if (!intervals.length) {
    const single = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:\s*(\d{2})(\d{2})时?)?/);
    if (single) {
      const year = Number(single[1] || fallbackYear);
      const start = chinaLocalDateToIso(year, Number(single[2]), Number(single[3]), Number(single[4] || 0), Number(single[5] || 0));
      const end = single[4] ? null : chinaLocalDateToIso(year, Number(single[2]), Number(single[3]), 23, 59);
      addInterval(start, end, single[0]);
    }
  }

  const beginsAt = earliestIso(intervals.map((item) => item.start).filter(Boolean));
  const endsAt = latestIso(intervals.map((item) => item.end).filter(Boolean));
  const issuedAt = publishIso || beginsAt || null;
  const longTermCue = /长期|常年|另行通知|撤除前|修复后不另告|恢复后不另告|恢复另告|UNTIL\s+FURTHER\s+NOTICE/i.test(text) ||
    /即日起/i.test(text);
  // Explicit end times take precedence over generic ongoing-operation wording.
  const longTerm = longTermCue && !endsAt;
  const timeLabel = labels.join("; ") || (longTerm ? "长期/另行通知" : null);
  const beijingTimeLabel =
    intervals.length && (beginsAt || endsAt)
      ? intervals
          .map((item) => (item.end ? formatBeijingRangeCompact(item.start, item.end) : `${formatBeijingDateTimeCompact(item.start)} 起`))
          .join("；") + " 北京时间"
      : longTerm
        ? "长期/另行通知"
        : issuedAt
          ? `发布时间 ${formatBeijingDateTime(issuedAt)}`
          : null;
  return { issuedAt, beginsAt, endsAt, intervals, timeLabel, beijingTimeLabel, longTerm };
}

function normalizeMsaTemporalItem(item, inForceWarningKeys = null) {
  if (!item || typeof item !== "object") return item;
  if (item.temporalParseVersion === MSA_TEMPORAL_PARSE_VERSION) return applyMsaInForceStatus(item, inForceWarningKeys);
  const schedule = parseMsaWarningSchedule(item.rawText || item.rawTextPreview || item.title || "", item.issuedAt || item.modifiedAt);
  return applyMsaInForceStatus({
    ...item,
    warningId: item.warningId || item.notamId || extractMsaWarningId(`${item.rawText || ""} ${item.title || ""}`),
    issuedAt: schedule.issuedAt || item.issuedAt || item.modifiedAt || null,
    beginsAt: schedule.beginsAt || null,
    endsAt: schedule.endsAt || null,
    timeIntervals: schedule.intervals,
    longTerm: Boolean(schedule.longTerm),
    timeLabel: schedule.timeLabel || makeParsedTimeLabel(schedule.beginsAt, schedule.endsAt),
    beijingTimeLabel: schedule.beijingTimeLabel || formatBeijingDateTime(schedule.issuedAt || item.issuedAt || item.modifiedAt),
    temporalParseVersion: MSA_TEMPORAL_PARSE_VERSION,
  }, inForceWarningKeys);
}

function chinaLocalDateToIso(year, month, day, hour = 0, minute = 0) {
  let h = Number(hour);
  let d = Number(day);
  if (h === 24) {
    h = 0;
    d += 1;
  }
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, d, h - 8, Number(minute || 0), 0));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeMsaEndIso(start, end) {
  if (!start || !end) return end || null;
  return Date.parse(end) < Date.parse(start) ? new Date(Date.parse(end) + 365 * 24 * 60 * 60 * 1000).toISOString() : end;
}

function isMsaWarningActiveOrFuture(record, referenceMs = Date.now()) {
  const schedule = record?.schedule || {};
  const intervals = Array.isArray(schedule.intervals) ? schedule.intervals : [];
  if (intervals.length) {
    const intervalVisible = intervals.some((interval) => {
      const endMs = Date.parse(interval?.end || "");
      const startMs = Date.parse(interval?.start || "");
      return Number.isFinite(endMs)
        ? endMs >= referenceMs
        : Number.isFinite(startMs) && startMs >= referenceMs;
    });
    return intervalVisible || Boolean(schedule.longTerm);
  }
  const endMs = Date.parse(schedule.endsAt);
  if (Number.isFinite(endMs)) return endMs >= referenceMs;
  if (schedule.longTerm) return true;
  const startMs = Date.parse(schedule.beginsAt);
  return Number.isFinite(startMs) && startMs >= referenceMs;
}

function buildMsaNavWarningRestriction(record, index) {
  const geometryParse = parseMsaWarningGeometry(record.rawText || "");
  const schedule = record.schedule || {};
  const geometry = geometryParse.geometry;
  return {
    id: `msa:${safeIdFromText(record.warningId || record.title || index)}:${safeIdFromText(record.officialPageUrl || index)}`,
    type: "中国航警",
    sourceKind: "msa",
    source: "中国海事局航行警告",
    sourceUrl: MSA_NAV_WARNING_URL,
    officialPageUrl: record.officialPageUrl,
    notamId: record.warningId,
    notamKey: record.warningId,
    title: record.title,
    category: "中国航警",
    legal: null,
    country: "China",
    state: null,
    region: record.bureau || "中国海事局",
    regionName: record.bureau || "中国海事局",
    sourceBureau: record.listBureau || record.bureau || null,
    isNew: isRecentIso(schedule.issuedAt || record.publishDate, 72),
    modifiedAt: record.publishDate || schedule.issuedAt || null,
    issuedAt: schedule.issuedAt || record.publishDate || null,
    beginsAt: schedule.beginsAt || null,
    endsAt: schedule.endsAt || null,
    timeIntervals: Array.isArray(schedule.intervals) ? schedule.intervals : [],
    longTerm: Boolean(schedule.longTerm),
    temporalParseVersion: MSA_TEMPORAL_PARSE_VERSION,
    timeLabel: schedule.timeLabel || makeParsedTimeLabel(schedule.beginsAt, schedule.endsAt),
    beijingTimeLabel: schedule.beijingTimeLabel || formatBeijingDateTime(schedule.issuedAt || record.publishDate),
    altitude: null,
    radiusNm: null,
    center: centroidFromGeometry(geometry),
    geometry,
    hasGeometry: Boolean(geometry),
    geometrySource: geometry ? geometryParse.geometrySource : null,
    geometryReason: geometryParse.geometryReason || (geometry ? "MSA coordinate boundary parsed." : "No parsed boundary geometry."),
    coordinateCount: geometryParse.coordinateCount || 0,
    boundaryCoordinateCount: geometryParse.boundaryCoordinateCount || 0,
    polygonGroupCount: geometryParse.polygonGroupCount || 0,
    rejectedPolygonGroupCount: geometryParse.rejectedPolygonGroupCount || 0,
    geometryComplete: geometryParse.geometryComplete ?? false,
    polygonGroupValidationReasons: geometryParse.polygonGroupValidationReasons || [],
    noShapeList: false,
    affectedArea: summarizeMsaWarning(record.rawText),
    authority: record.bureau || null,
    contact: null,
    rawText: record.rawText,
    rawTextPreview: String(record.rawText || "").slice(0, 1200),
  };
}

function parseMsaWarningGeometry(rawText) {
  const source = removeMsaCenterCoordinates(normalizeMsaCoordinateText(rawText));
  const rejected = [];
  const groups = extractMsaCoordinateGroups(source, rejected);
  const coordinates = uniqueCoordinates(groups.flat());
  if (!groups.length && !rejected.length && extractCoordinates(source).length && isMsaLinearRouteWarning(source)) {
    return {
      geometry: null,
      coordinateCount: extractCoordinates(source).length,
      geometryReason: "MSA warning describes a linear route/track, not a closed polygon boundary.",
    };
  }
  const englishParsed = parseNotamText(source);
  const englishParts = englishParsed.geometry?.type === "MultiPolygon" ? englishParsed.geometry.coordinates.length : englishParsed.geometry ? 1 : 0;
  if (!rejected.length && englishParsed.geometry && groups.filter((group) => group.length >= 3).length <= englishParts) {
    return {
      geometry: englishParsed.geometry,
      coordinateCount: englishParsed.coordinateCount || extractCoordinates(source).length,
      boundaryCoordinateCount: englishParsed.boundaryCoordinateCount || 0,
      polygonGroupCount: englishParsed.polygonGroupCount || 0,
      rejectedPolygonGroupCount: englishParsed.rejectedPolygonGroupCount || 0,
      geometryComplete: englishParsed.geometryComplete,
      polygonGroupValidationReasons: englishParsed.polygonGroupValidationReasons,
      geometrySource: englishParsed.geometrySource || "China MSA English coordinate boundary",
      geometryReason: englishParsed.geometryReason || "China MSA English boundary parsed.",
    };
  }
  if (!coordinates.length) {
    return {
      geometry: null, coordinateCount: extractCoordinates(source).length,
      rejectedPolygonGroupCount: rejected.length, geometryComplete: false,
      polygonGroupCount: rejected.length,
      polygonGroupValidationReasons: rejected.map((item) => item.reason),
      geometryReason: rejected.length ? rejected.map((item) => item.reason).join("; ") : "MSA warning text has no parseable coordinates.",
    };
  }
  if (!hasMsaBoundaryGeometryIntent(source)) {
    return {
      geometry: null,
      coordinateCount: coordinates.length,
      geometryReason: /\b(?:WITHIN\s+)?\d+(?:\.\d+)?\s*(?:M|KM|NM)\s+RADIUS\s+OF\b|\bRADIUS\s+OF\b/i.test(source)
        ? "MSA warning is a list of center/radius locations, not one polygon boundary."
        : "MSA warning has coordinates but no Chinese boundary/closed-area wording.",
    };
  }
  const polygonGroups = groups.map(normalizePolygonGroupCoordinates).filter((group) => uniqueCoordinates(group).length >= 3);
  const polygons = [];
  for (const [index, group] of polygonGroups.entries()) {
    const polygon = polygonFromCoordinates(group);
    const reason = validateParsedGeometry(polygon);
    if (reason) rejected.push({ index, reason });
    else polygons.push(polygon);
  }
  const rejectedPolygonGroupCount = rejected.length;
  const geometry = polygons.length > 1 ? { type: "MultiPolygon", coordinates: polygons.map((polygon) => polygon.coordinates) } : polygons[0] || null;
  const geometrySource = geometry ? `China MSA coordinate ${polygons.length > 1 ? "sections" : "boundary"}` : null;
  const validationReason = geometry ? validateParsedGeometry(geometry) : null;
  if (validationReason) {
    return { geometry: null, coordinateCount: coordinates.length, geometryReason: validationReason };
  }
  return {
    geometry,
    coordinateCount: coordinates.length,
    boundaryCoordinateCount: geometry ? geometryUniqueCoordinateCount(geometry) : uniqueCoordinates(polygonGroups.flat()).length,
    polygonGroupCount: polygons.length + rejected.length,
    rejectedPolygonGroupCount,
    polygonGroupValidationReasons: rejected.map((item) => item.reason),
    geometryComplete: Boolean(geometry) && !rejectedPolygonGroupCount,
    geometrySource,
    geometryReason: geometry
      ? `${geometrySource}${rejectedPolygonGroupCount ? `; ${rejectedPolygonGroupCount} unresolved sections not drawn: ${rejected.map((item) => item.reason).join("; ")}` : ""}`
      : rejectedPolygonGroupCount
        ? rejected.map((item) => item.reason).join("; ")
        : "MSA warning coordinates do not form a closed polygon.",
  };
}

function removeMsaCenterCoordinates(text) {
  let result = String(text);
  for (const coordinate of extractCoordinateTokens(text).reverse()) {
    if (/^\s*为圆心/.test(text.slice(coordinate.sourceEnd))) {
      result = result.slice(0, coordinate.sourceIndex) + " ".repeat(coordinate.sourceEnd - coordinate.sourceIndex) + result.slice(coordinate.sourceEnd);
    }
  }
  return result;
}

function isMsaLinearRouteWarning(text) {
  const source = String(text || "");
  if (/(?:围成|所围|闭合|首尾相连)|\b(?:TO\s+POINT\s+OF\s+ORIGIN|CLOSES?\s+AT)\b/i.test(source)) return false;
  if (/(?:连线|线路|测线)\s*(?:两侧|每侧)\s*(?:各\s*)?\d+(?:\.\d+)?\s*(?:米|公里|海里|M|KM|NM)/i.test(source)) return true;
  if (/沿[\s\S]{0,1500}?(?:连线|线路|航线)/i.test(source)) return true;
  return /\b(?:LINEAR\s+STRETCH|ALONG\s+(?:THE\s+)?(?:LINE|TRACKLINE)|TRACKLINE\s+JOINING|PIPELINE\s+ROUTE)\b/i.test(source) ||
    /在[\s\S]{0,220}?(?:连线|线路|航线)(?:附近|一带)[\s\S]{0,160}?(?:电缆|管线|测量|敷设|作业|施工)/i.test(source);
}

function normalizeMsaCoordinateText(text) {
  return normalizeNotamCoordinateText(String(text || ""))
    .replace(/[，、]/g, " ")
    .replace(/[；;]/g, "\n")
    .replace(/和\s*(?=\d{1,2}-\d{1,2})/g, " ");
}

function extractMsaCoordinateGroups(text, rejected = []) {
  const source = String(text || "");
  const clauses = source.split(/[\n。]/);
  if (clauses.some((clause) => /航道段|(?:起始|终)点/.test(clause) && extractCoordinates(clause).length) &&
      clauses.some((clause) => hasMsaBoundaryGeometryIntent(clause) && extractCoordinates(clause).length >= 3)) {
    return clauses.flatMap((clause) => hasMsaBoundaryGeometryIntent(clause) && extractCoordinates(clause).length >= 3
      ? extractMsaCoordinateGroups(clause, rejected) : []);
  }
  const starts = [
    ...source.matchAll(/(?:^|[\n。；;,.，])\s*(?:区域|水域|作业区|施工区|禁航区|警戒区|AREA)\s*[一二三四五六七八九十\dA-Z]*\s*[：:]/gi),
    ...source.matchAll(/(?:^|[\n。,.，])\s*(?:IN\s+)?(?:WORKING\s+)?AREAS?\s+BOUNDED\s+BY(?:\s+THE\s+LINES?\s+JOINING)?\s*:?\s*/gi),
    ...source.matchAll(/\bAREA\s+[A-Z0-9]+\s+BOUNDED\s+BY(?:\s+THE\s+LINES?\s+JOINING)?\s*:?\s*/gi),
    ...source.matchAll(/(?:^|[\n。,.，])\s*A\d+\s*:\s*/gi),
    ...source.matchAll(/(?:^|[\n。])\s*\d+\s*[.、)]\s*[^\n。：:]{0,48}(?:水域|区域|作业区|施工区|禁航区|警戒区)\s*[：:]/gi),
  ].map((match) => match.index + match[0].search(/\S/));
  const numbered = [...source.matchAll(/(?<!\d)\d{1,2}\s*[)）]\s*/g)].map((match) => match.index);
  if (numbered.filter((start, index) => extractCoordinates(source.slice(start, numbered[index + 1] ?? source.length)).length >= 3).length >= 2) starts.push(...numbered);
  const uniqueStarts = [...new Set(starts)].sort((a, b) => a - b);
  if (uniqueStarts.length && extractCoordinates(source.slice(0, uniqueStarts[0])).length >= 3) {
    uniqueStarts.unshift(0);
  }
  const sections =
    uniqueStarts.length
      ? uniqueStarts.map((start, index) => source.slice(start, uniqueStarts[index + 1] || source.length))
      : [source];
  return sections.flatMap((section, index) => {
    if (isMsaLinearRouteWarning(section)) return [];
    if (hasInvalidBoundaryCoordinate(section)) {
      rejected.push({ index, reason: "Invalid coordinate field in MSA boundary; vertices were not skipped or guessed." });
      return [];
    }
    const groups = splitCoordinateGroupsAtCompletedBoundaries(section, extractCoordinates(section))
      .flatMap((group) => splitMsaConjoinedBoundaryGroups(section, group)).filter((group) => group.length);
    const declared = section.match(/([三四五六七八九十]|\d{1,3})\s*(?:个)?点\s*(?:依次)?连线/)?.[1];
    const count = /^\d+$/.test(declared || "") ? Number(declared) : ({ 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 })[declared];
    if (count && groups.length === 1 && normalizePolygonGroupCoordinates(groups[0]).length !== count) {
      rejected.push({ index, reason: `MSA text declares ${count} vertices but lists ${normalizePolygonGroupCoordinates(groups[0]).length}; boundary requires source clarification.` });
      return [];
    }
    return groups;
  });
}

function splitMsaConjoinedBoundaryGroups(section, group) {
  if (!Array.isArray(group) || group.length < 6) return [group];
  for (const conjunction of String(section || "").matchAll(/\bAND\b|及/gi)) {
    const splitAt = Number(conjunction.index);
    const left = group.filter((coordinate) => Number(coordinate.sourceIndex) < splitAt);
    const right = group.filter((coordinate) => Number(coordinate.sourceIndex) >= splitAt);
    if (left.length < 3 || right.length < 3) continue;
    const leftPolygon = polygonFromCoordinates(normalizePolygonGroupCoordinates(left));
    const rightPolygon = polygonFromCoordinates(normalizePolygonGroupCoordinates(right));
    if (!validateParsedGeometry(leftPolygon) && !validateParsedGeometry(rightPolygon)) return [left, right];
  }
  return [group];
}

function hasMsaBoundaryGeometryIntent(text) {
  const source = String(text || "");
  if (/(?:连线|线路|测线)\s*(?:两侧|每侧)\s*(?:各\s*)?\d+(?:\.\d+)?\s*(?:米|公里|海里|M|KM|NM)\b/i.test(source)) return false;
  return /(?:连线|所围|围成|范围内|区域内|水域范围|禁航区|警戒区|作业区|施工区|以下\s*[一二三四五六七八九十\d]*\s*点|[三四五六七八九十\d]+点连线|坐标范围)/.test(source) ||
    /\b(?:WORKING\s+)?AREAS?\s+BOUNDED\s+BY|BOUNDED\s+BY\s+POS|BOUNDED\s+BY\s+THE\s+LINES?\s+JOINING\b/i.test(source);
}

function summarizeMsaWarning(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function safeIdFromText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function absoluteMsaUrl(value) {
  const text = String(value || "").trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `${MSA_BASE_URL}${text.startsWith("/") ? "" : "/"}${text}`;
}

async function getNavareaWarnings({ refresh }) {
  const regionKey = NAVAREA_WARNING_REGIONS.map((item) => item.roman).join("+");
  const cacheKey = `v1:navarea:${regionKey}:active:parseable`;
  const cached = navareaWarningCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;
  if (!refresh) {
    const diskCached = readNavareaWarningDiskCache(cacheKey, { allowExpired: true });
    if (diskCached) {
      navareaWarningCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: diskCached });
      return diskCached;
    }
    return emptyMarineCachePayload(cacheKey, "NAVAREA", "No saved NAVAREA cache is available. Use the refresh button to fetch it manually.");
  }
  const inFlight = navareaWarningInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const request = buildNavareaWarningPayload(cacheKey)
    .catch((error) => {
      const stale = cached?.data || readNavareaWarningDiskCache(cacheKey, { allowExpired: true });
      if (!stale) throw error;
      return withMarineRefreshFallback(stale, "NAVAREA", error);
    })
    .finally(() => {
      navareaWarningInFlight.delete(cacheKey);
    });
  navareaWarningInFlight.set(cacheKey, request);
  return request;
}

function readNavareaWarningDiskCache(cacheKey, options = {}) {
  try {
    if (!existsSync(NAVAREA_WARNING_CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(NAVAREA_WARNING_CACHE_FILE, "utf8"));
    const savedAt = new Date(cached.savedAt || 0).getTime();
    if (cached.cacheKey !== cacheKey || !savedAt) return null;
    if (!options.allowExpired && Date.now() - savedAt > NAVAREA_WARNING_DISK_CACHE_MAX_AGE_MS) return null;
    if (!Array.isArray(cached.data?.restrictions)) return null;
    const migration = migrateCachedAreaParseResults("navarea", cached.data);
    if (migration.changed) writeMigratedAreaDiskCache(NAVAREA_WARNING_CACHE_FILE, cached, migration.data);
    return filterPayloadToReferenceTime("navarea", migration.data, cached.savedAt || migration.data.generatedAt, "disk-cache");
  } catch {
    return null;
  }
}

function writeNavareaWarningDiskCache(cacheKey, data) {
  try {
    if (data?.source?.status !== "ok") return false;
    mkdirSync(dataDirectory, { recursive: true });
    const savedAt = new Date().toISOString();
    data.cacheSavedAt = savedAt;
    data.refreshCompletedAt = savedAt;
    data.source = { ...data.source, fetchedAt: data.source.fetchedAt || savedAt, cacheSavedAt: savedAt };
    writeJsonFileAtomic(NAVAREA_WARNING_CACHE_FILE, { cacheKey, savedAt, data }, 2);
    if (!writeSourceSnapshot("navarea", cacheKey, data, savedAt)) return false;
    return true;
  } catch (error) {
    console.error("NAVAREA cache persistence failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function emptyMarineCachePayload(cacheKey, label, message) {
  return {
    generatedAt: new Date().toISOString(),
    dataVersion: cacheKey,
    areaParseMigrationVersion: AREA_PARSE_MIGRATION_VERSION,
    restrictions: [],
    skipped: [],
    source: {
      status: "empty",
      message,
      cacheOnly: true,
      totalWarnings: 0,
      drawableWarnings: 0,
      skippedWarnings: 0,
      label,
    },
  };
}

function withMarineRefreshFallback(data, label, error) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...data,
    source: {
      ...(data?.source || {}),
      status: "warn",
      cacheFallback: true,
      refreshFailedAt: new Date().toISOString(),
      message: `${label} live refresh failed; showing the latest saved cache. ${message}`,
    },
  };
}

async function buildNavareaWarningPayload(cacheKey) {
  const generatedAt = new Date().toISOString();
  const sourceErrors = [];
  const coverage = [];
  let sealagomRecords = [];
  let ngaRecords = [];

  const sealagomFetches = await mapLimit(NAVAREA_WARNING_REGIONS, NAVAREA_FETCH_CONCURRENCY, async (region) => {
    try {
      const result = await fetchSeaLagomNavareaRegion(region);
      coverage.push(result.coverage);
      return result.records;
    } catch (error) {
      const message = `${region.label} SeaLagom: ${error instanceof Error ? error.message : String(error)}`;
      sourceErrors.push(message);
      coverage.push({
        region: region.label,
        url: navareaMessagesUrl(region.id),
        scannedPages: 0,
        totalPages: 0,
        records: 0,
        errors: [message],
      });
      return [];
    }
  });
  sealagomRecords = sealagomFetches.flat();

  const ngaRegions = NAVAREA_WARNING_REGIONS.filter((region) => region.ngaNavArea);
  const ngaFetches = await mapLimit(ngaRegions, 2, async (region) => {
    try {
      const payload = await fetchJsonOfficial(ngaNavareaActiveUrl(region.ngaNavArea), 45000);
      return normalizeNgaBroadcastWarnings(payload)
        .filter((item) => String(item.navArea).toUpperCase() === String(region.ngaNavArea).toUpperCase())
        .map((item) => ({
          ...item,
          navAreaRoman: region.roman,
          navAreaLabel: region.label,
          sourcePriority: 1,
          sourcePageUrl: NGA_MSI_NAV_WARNINGS_URL,
        }));
    } catch (error) {
      sourceErrors.push(`${region.label} NGA JSON API: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  });
  ngaRecords = ngaFetches.flat();

  const records = mergeNavareaRecords([...ngaRecords, ...sealagomRecords]).filter(isNavareaWarningActiveOrFuture);
  if (!records.length && sourceErrors.length) throw new Error(sourceErrors.join("; "));

  const built = records.flatMap((warning, index) => buildNavareaWarningRestrictions(warning, index)).filter(Boolean);
  const restrictions = built.filter((item) => item?.hasGeometry);
  const skipped = built.filter((item) => item && !item.hasGeometry);
  const skippedReasons = countBy(skipped, (item) => item.geometryReason || "No parsed boundary geometry");
  const latestIssuedAt = latestIso(built.map((item) => item?.issuedAt || item?.beginsAt || item?.endsAt).filter(Boolean));
  const regionCoverage = buildNavareaSourceCoverage(coverage, records, restrictions, skipped);
  const dataVersion = `${cacheKey}:${latestIssuedAt || generatedAt}`;
  const data = {
    generatedAt,
    dataVersion,
    areaParseMigrationVersion: AREA_PARSE_MIGRATION_VERSION,
    restrictions,
    skipped: skipped.map((item) => ({
      id: item.id,
      warningId: item.notamId,
      title: item.title,
      beginsAt: item.beginsAt,
      endsAt: item.endsAt,
      coordinateCount: item.coordinateCount,
      reason: item.geometryReason,
      rawTextPreview: item.rawTextPreview,
      rawText: item.rawText,
      officialPageUrl: item.officialPageUrl,
      region: item.region,
    })),
    source: {
      status: "ok",
      message: `NAVAREA loaded ${records.length} active/future source warnings from ${NAVAREA_WARNING_REGIONS.length} requested regions; ${built.length} drawable/skip area records were derived, ${restrictions.length} have parseable boundary geometry and ${skipped.length} were not drawn.`,
      urls: {
        app: `${SEALAGOM_NAVAREA_BASE_URL}/navarea/`,
        ngaApp: NGA_MSI_NAV_WARNINGS_URL,
      },
      requestedRegions: NAVAREA_WARNING_REGIONS.map((item) => item.label),
      sourceWarningCount: records.length,
      totalWarnings: built.length,
      sealagomWarnings: sealagomRecords.length,
      ngaSupplementWarnings: ngaRecords.length,
      drawableWarnings: restrictions.length,
      skippedWarnings: skipped.length,
      skippedReasons,
      sourceErrors,
      regions: regionCoverage,
      coverageWarnings: regionCoverage
        .filter((item) => item.errors?.length || item.scannedPages < item.totalPages)
        .map((item) => ({
          region: item.region,
          scannedPages: item.scannedPages,
          totalPages: item.totalPages,
          errors: item.errors || [],
        })),
      latestIssuedAt,
    },
  };
  const displayData = filterPayloadToReferenceTime("navarea", data, generatedAt, "live-refresh");
  if (!writeNavareaWarningDiskCache(cacheKey, displayData)) {
    throw new Error("NAVAREA refresh completed, but its cache and history snapshot could not be saved; keeping the previous cache.");
  }
  navareaWarningCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: displayData });
  return displayData;
}

async function fetchSeaLagomNavareaRegion(region) {
  const firstUrl = navareaMessagesUrl(region.id);
  const firstHtml = await fetchTextOfficial(firstUrl, 60000);
  const totalPages = Math.min(NAVAREA_MAX_PAGES_PER_REGION, Math.max(1, parseSeaLagomTotalPages(firstHtml)));
  const pages = [{ page: 1, url: firstUrl, html: firstHtml }];
  for (let page = 2; page <= totalPages; page += 1) {
    const url = navareaMessagesUrl(region.id, page);
    try {
      pages.push({ page, url, html: await fetchTextOfficial(url, 60000) });
    } catch {
      // A later page failure should not discard earlier active warnings.
    }
  }
  const records = pages.flatMap(({ html, url }) => parseSeaLagomNavareaMessages(html, region, url));
  return {
    records,
    coverage: {
      region: region.label,
      url: firstUrl,
      scannedPages: pages.length,
      totalPages,
      records: records.length,
      errors: pages.length < totalPages ? [`Fetched ${pages.length}/${totalPages} active pages`] : [],
    },
  };
}

function navareaMessagesUrl(regionId, page = 1) {
  const suffix = page > 1 ? `?page=${page}` : "";
  return `${SEALAGOM_NAVAREA_BASE_URL}/navarea/${regionId}/messages/${suffix}`;
}

function ngaNavareaActiveUrl(navArea) {
  return `https://msi.nga.mil/api/publications/broadcast-warn?navArea=${encodeURIComponent(navArea)}&status=active&output=json`;
}

function parseSeaLagomTotalPages(html) {
  const source = String(html || "");
  const direct = Number(source.match(/\\"totalPages\\":(\d+)/)?.[1] || source.match(/"totalPages":(\d+)/)?.[1] || 0);
  return Number.isFinite(direct) && direct > 0 ? direct : 1;
}

function parseSeaLagomNavareaMessages(html, region, pageUrl) {
  const source = String(html || "");
  const htmlRecords = parseSeaLagomNavareaHtmlCards(source, region, pageUrl);
  if (htmlRecords.length) return htmlRecords;
  const records = [];
  const seen = new Set();
  const escapedTitle = escapeRegExp(region.label);
  const patterns = [
    new RegExp(
      `href\\\\":\\\\"(\\/navarea\\/${escapeRegExp(region.id)}\\/message\\/[^\\\\"]+)[\\s\\S]{0,700}?content\\\\":\\\\"([\\s\\S]*?)\\\\",\\\\"numberLabel\\\\":\\\\"([^\\\\"]+)\\\\",\\\\"title\\\\":\\\\"${escapedTitle}`,
      "gi",
    ),
    new RegExp(
      `"href":"(\\/navarea\\/${escapeRegExp(region.id)}\\/message\\/[^"]+)[\\s\\S]{0,700}?content":"([\\s\\S]*?)","numberLabel":"([^"]+)","title":"${escapedTitle}`,
      "gi",
    ),
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const label = decodeJsonishText(match[3]).trim();
      const parsedLabel = parseSeaLagomNumberLabel(label);
      let content = decodeJsonishText(match[2]).trim();
      const contentRef = content.match(/^\$([0-9a-z]+)$/i)?.[1];
      if (contentRef) content = resolveSeaLagomFlightTextReference(source, contentRef) || content;
      if (!isCleanSeaLagomWarningText(content) || !parsedLabel) continue;
      const key = `${region.roman}:${parsedLabel.year}:${parsedLabel.number}:${content}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const issueDate = seaLagomIssueDateBefore(source, match.index, parsedLabel.year);
      records.push({
        navArea: region.id,
        navAreaRoman: region.roman,
        navAreaLabel: region.label,
        msgNumber: parsedLabel.number,
        msgYear: parsedLabel.year,
        subregion: null,
        text: content,
        status: "A",
        issueDate,
        authority: `SeaLagom ${region.label}`,
        sourcePriority: 3,
        sourcePageUrl: pageUrl,
        officialPageUrl: absoluteSeaLagomUrl(match[1]),
      });
    }
    if (records.length) break;
  }
  return records.sort((a, b) => b.msgYear - a.msgYear || b.msgNumber - a.msgNumber);
}

function parseSeaLagomNavareaHtmlCards(source, region, pageUrl) {
  const records = [];
  const seen = new Set();
  const cardPattern = /<li\b[^>]*class="[^"]*\bgroup\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  const hrefPattern = new RegExp(`<a\\b[^>]*href="(\\/navarea\\/${escapeRegExp(region.id)}\\/message\\/[^"]+)"[^>]*>([\\s\\S]*?)<\\/a>`, "i");
  for (const match of String(source || "").matchAll(cardPattern)) {
    const card = match[1];
    const anchor = card.match(hrefPattern);
    const contentMatch = card.match(/<div\b[^>]*id="content-\d+"[^>]*>([\s\S]*?)<\/div>/i);
    if (!anchor || !contentMatch) continue;
    const parsedLabel = parseSeaLagomNumberLabel(stripHtml(anchor[2]));
    const content = stripHtml(contentMatch[1].replace(/<\/?span\b[^>]*>/gi, ""));
    if (!parsedLabel || !isCleanSeaLagomWarningText(content)) continue;
    const key = `${region.roman}:${parsedLabel.year}:${parsedLabel.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    records.push({
      navArea: region.id,
      navAreaRoman: region.roman,
      navAreaLabel: region.label,
      msgNumber: parsedLabel.number,
      msgYear: parsedLabel.year,
      subregion: null,
      text: content,
      status: "A",
      issueDate: seaLagomHtmlIssueDate(card, parsedLabel.year),
      authority: `SeaLagom ${region.label}`,
      sourcePriority: 3,
      sourcePageUrl: pageUrl,
      officialPageUrl: absoluteSeaLagomUrl(anchor[1]),
    });
  }
  return records.sort((a, b) => b.msgYear - a.msgYear || b.msgNumber - a.msgNumber);
}

function isCleanSeaLagomWarningText(value) {
  const text = String(value || "").trim();
  return text.length >= 8 && text.length <= 25000 &&
    !/self\.__next_f|\"className\"|\"children\"\s*:|^\d+:\[\"\$\"/i.test(text);
}

function seaLagomHtmlIssueDate(card, fallbackYear) {
  const text = stripHtml(String(card || "").match(/<time\b[^>]*>([\s\S]*?)<\/time>/i)?.[1] || "");
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4}),?\s*(\d{2}):(\d{2})/);
  if (!match) return null;
  const monthIndex = Number(match[2]) - 1;
  const month = [...MARINE_MONTHS.entries()].find(([, indexValue]) => indexValue === monthIndex)?.[0] || "JAN";
  return `${match[1]}${match[4]}${match[5]}Z ${month} ${Number(match[3]) || fallbackYear}`;
}

function decodeJsonishText(value) {
  const raw = String(value || "");
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

function parseSeaLagomNumberLabel(label) {
  const text = String(label || "").trim();
  let year = NaN;
  let number = NaN;
  const yearFirst = text.match(/\b(\d{2,4})-(\d{1,5})\b/);
  const numberFirst = text.match(/\b(\d{1,5})\/(\d{2,4})\b/);
  if (yearFirst) {
    year = marineFullYear(yearFirst[1], new Date().getUTCFullYear());
    number = Number(yearFirst[2]);
  } else if (numberFirst) {
    number = Number(numberFirst[1]);
    year = marineFullYear(numberFirst[2], new Date().getUTCFullYear());
  }
  if (!Number.isFinite(year) || !Number.isFinite(number)) return null;
  return { year, number };
}

function resolveSeaLagomFlightTextReference(source, refId) {
  const marker = `${refId}:T`;
  const markerIndex = String(source || "").indexOf(marker);
  if (markerIndex < 0) return "";
  const pushMarker = 'self.__next_f.push([1,"';
  const pushIndex = source.indexOf(pushMarker, markerIndex);
  if (pushIndex < 0) return "";
  const start = pushIndex + pushMarker.length;
  const end = source.indexOf('"])</script>', start);
  if (end < 0 || end <= start) return "";
  return decodeJsonishText(source.slice(start, end)).trim();
}

function seaLagomIssueDateBefore(source, index, fallbackYear) {
  const before = String(source || "").slice(Math.max(0, Number(index || 0) - 1800), Number(index || 0));
  const matches = [
    ...before.matchAll(/\\?"children\\?"\s*:\s*\\?"(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})\\?"/g),
  ];
  const match = matches[matches.length - 1];
  if (!match) return null;
  const day = match[1];
  const monthIndex = Number(match[2]) - 1;
  const year = Number(match[3]) || fallbackYear;
  const month = [...MARINE_MONTHS.entries()].find(([, indexValue]) => indexValue === monthIndex)?.[0] || "JAN";
  return `${day}${match[4]}${match[5]}Z ${month} ${year}`;
}

function absoluteSeaLagomUrl(value) {
  const text = String(value || "").trim();
  if (/^https?:\/\//i.test(text)) return text;
  return `${SEALAGOM_NAVAREA_BASE_URL}${text.startsWith("/") ? "" : "/"}${text}`;
}

function mergeNavareaRecords(records) {
  const byId = new Map();
  for (const record of records || []) {
    if (!record?.msgNumber || !record?.msgYear || !record?.navAreaRoman) continue;
    const key = `${record.navAreaRoman}:${record.msgYear}:${record.msgNumber}`;
    const existing = byId.get(key);
    if (!existing || (record.sourcePriority || 0) >= (existing.sourcePriority || 0)) byId.set(key, record);
  }
  return [...byId.values()].sort((a, b) => String(a.navAreaRoman).localeCompare(String(b.navAreaRoman)) || b.msgYear - a.msgYear || b.msgNumber - a.msgNumber);
}

function isNavareaWarningActiveOrFuture(record) {
  const schedule = parseMarineSchedule(composeNavareaWarningText(record, formatNavareaWarningId(record)), record);
  const endMs = Date.parse(schedule.endsAt || "");
  if (!Number.isFinite(endMs)) return true;
  return endMs >= Date.now() - 15 * 60 * 1000;
}

function buildNavareaSourceCoverage(coverage, records, restrictions, skipped) {
  const totalByRegion = countBy(records, (item) => item.navAreaLabel || navareaLabelFromCode(item.navArea));
  const drawableByRegion = countBy(restrictions, (item) => item.region || "NAVAREA");
  const skippedByRegion = countBy(skipped, (item) => item.region || "NAVAREA");
  return NAVAREA_WARNING_REGIONS.map((region) => {
    const entry = coverage.find((item) => item.region === region.label) || {};
    return {
      region: region.label,
      coordinator: region.coordinator,
      url: entry.url || navareaMessagesUrl(region.id),
      scannedPages: Number(entry.scannedPages || 0),
      totalPages: Number(entry.totalPages || 0),
      sourceRecords: Number(entry.records || 0),
      totalWarnings: Number(totalByRegion[region.label] || 0),
      drawableWarnings: Number(drawableByRegion[region.label] || 0),
      skippedWarnings: Number(skippedByRegion[region.label] || 0),
      errors: entry.errors || [],
    };
  });
}

function buildNavareaWarningRestrictions(warning, index) {
  const warningId = formatNavareaWarningId(warning);
  const cleanWarningText = truncateContaminatedMarineBulletin(composeNavareaWarningText(warning, warningId));
  const schedule = parseMarineSchedule(cleanWarningText, warning);
  const normalizedWarningText = cleanWarningText.replace(/^NAVAREA[^\r\n]*[\r\n]+/i, "");
  const rawText = cleanWarningText;
  const subsections = splitMarineBoundarySubsections(normalizedWarningText);
  if (subsections.length > 1) {
    const subsectionItems = subsections.map((section, sectionIndex) =>
      buildNavareaWarningRestrictionItem(warning, {
        warningId,
        rawText: composeNavareaWarningText({ ...warning, text: section.text }, warningId),
        scheduleRawText: cleanWarningText,
        schedule,
        index,
        sectionLabel: section.label,
        sectionIndex,
      }),
    );
    if (subsectionItems.some((item) => item?.hasGeometry)) return subsectionItems;
  }
  return [
    buildNavareaWarningRestrictionItem(warning, {
      warningId,
      rawText,
      scheduleRawText: cleanWarningText,
      schedule,
      index,
      sectionLabel: null,
      sectionIndex: null,
    }),
  ];
}

function splitMarineBoundarySubsections(text) {
  const source = normalizeNotamCoordinateText(normalizeMarineWarningText(text));
  if (!/\bAREAS?\s+BOUND(?:ED)?\s+BY\b/i.test(source)) return [];
  const markerPattern = /(?:^|[\s])(?:\(([A-Z])\)|([A-Z])\.)\s+(?=(?:\d{1,2}-\d{1,2}(?:\.\d+)?[NS]|\d{4,6}(?:\.\d+)?[NS]|IN\s+AREA\b))/gi;
  const markers = [...source.matchAll(markerPattern)].map((match) => ({
    label: String(match[1] || match[2] || "").toUpperCase(),
    start: Number(match.index) + match[0].search(/[A-Z]/i),
    bodyStart: Number(match.index) + match[0].length,
  }));
  // Splitting display records is optional. Retain the complete original text
  // when labels are vertices, a leading area is unlabelled, or any part is incomplete.
  if (markers.length < 2 || extractCoordinateTokens(source.slice(0, markers[0].start)).length) return [];
  const sections = [];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const end = markers[index + 1]?.start ?? source.length;
    const body = `${marker.label}. ${source.slice(marker.bodyStart, end).trim()}`.trim();
    const coordinates = extractCoordinates(body);
    if (coordinates.length < 3) return [];
    const text = `AREA BOUNDED BY ${body}`;
    if (!parseNotamText(text).geometryComplete) return [];
    sections.push({ label: marker.label, text });
  }
  return sections.length > 1 ? sections : [];
}

function truncateContaminatedMarineBulletin(value) {
  const source = normalizeMarineWarningText(value);
  const headerPattern = /(?:^|\n)\s*(NAVAREA\s+[IVXLCDM]+|HYDROPAC|HYDROLANT|HYDROARC)\s*[-\u2013\u2014]?\s*(\d{1,5})\s*\/\s*(\d{2,4})\b/gim;
  const headers = [...source.matchAll(headerPattern)];
  if (headers.length < 2) return source;
  const first = headers[0];
  const firstKey = `${String(first[1]).toUpperCase()}:${Number(first[2])}:${marineFullYear(first[3], new Date().getUTCFullYear())}`;
  const next = headers.slice(1).find((match) => {
    const key = `${String(match[1]).toUpperCase()}:${Number(match[2])}:${marineFullYear(match[3], new Date().getUTCFullYear())}`;
    return key !== firstKey;
  });
  return next ? source.slice(0, Number(next.index)).replace(/[\s-]+$/, "").trim() : source;
}

function buildNavareaWarningRestrictionItem(
  warning,
  { warningId, rawText, scheduleRawText = rawText, schedule = parseMarineSchedule(scheduleRawText, warning), index, sectionLabel, sectionIndex },
) {
  const parsed = parseNotamText(rawText);
  const geometry = parsed.geometry;
  const baseTitle = summarizeMarineWarning(normalizeMarineWarningText(warning.text)) || warningId;
  const title = sectionLabel ? `${baseTitle} Area ${sectionLabel}` : baseTitle;
  const sectionSuffix = sectionLabel ? `:${sectionLabel.toLowerCase()}:${sectionIndex}` : "";
  const displayId = sectionLabel ? `${warningId} Area ${sectionLabel}` : warningId;
  return {
    id: `navarea:${safeIdFromText(warning.navAreaRoman || warning.navArea)}:${warning.msgYear}:${warning.msgNumber}:${index}${sectionSuffix}`,
    type: "NAVAREA",
    sourceKind: "navarea",
    source: "NAVAREA navigational warnings",
    sourceUrl: warning.sourcePageUrl || navareaMessagesUrl(warning.navArea),
    officialPageUrl: warning.officialPageUrl || warning.sourcePageUrl || navareaMessagesUrl(warning.navArea),
    notamId: displayId,
    notamKey: `${warning.msgNumber}/${String(warning.msgYear).slice(-2).padStart(2, "0")}`,
    title,
    category: "NAVAREA",
    legal: null,
    country: "NAVAREA",
    state: null,
    region: warning.navAreaLabel || navareaLabelFromCode(warning.navArea),
    regionName: warning.navAreaLabel || navareaLabelFromCode(warning.navArea),
    isNew: isRecentIso(schedule.issuedAt, 72),
    modifiedAt: schedule.issuedAt,
    issuedAt: schedule.issuedAt,
    beginsAt: schedule.beginsAt,
    endsAt: schedule.endsAt,
    timeIntervals: schedule.intervals,
    longTerm: schedule.longTerm,
    temporalParseVersion: schedule.temporalParseVersion,
    timeLabel: schedule.timeLabel,
    beijingTimeLabel: schedule.beijingTimeLabel,
    altitude: null,
    radiusNm: parsed.radiusNm || null,
    center: parsed.center || centroidFromGeometry(geometry),
    geometry,
    hasGeometry: Boolean(geometry),
    geometrySource: geometry ? parsed.geometrySource || "NAVAREA coordinate boundary" : null,
    geometryReason: parsed.geometryReason || (geometry ? "Boundary geometry parsed." : "No parsed boundary geometry."),
    coordinateCount: parsed.coordinateCount || 0,
    boundaryCoordinateCount: parsed.boundaryCoordinateCount || 0,
    polygonGroupCount: parsed.polygonGroupCount || 0,
    rejectedPolygonGroupCount: parsed.rejectedPolygonGroupCount || 0,
    geometryComplete: parsed.geometryComplete,
    polygonGroupValidationReasons: parsed.polygonGroupValidationReasons || [],
    noShapeList: false,
    affectedArea: title,
    authority: warning.authority || null,
    contact: null,
    scheduleRawText,
    rawText,
    rawTextPreview: rawText.slice(0, 1200),
  };
}

function formatNavareaWarningId(warning) {
  const year = Number.isFinite(warning.msgYear) ? String(warning.msgYear).slice(-2).padStart(2, "0") : "";
  const label = warning.navAreaLabel || navareaLabelFromCode(warning.navArea) || "NAVAREA";
  return `${label} ${warning.msgNumber}/${year}`.trim();
}

function composeNavareaWarningText(warning, warningId) {
  return [
    warningId,
    normalizeMarineWarningText(warning.text),
    warning.issueDate ? `ISSUED ${warning.issueDate}` : null,
    warning.authority ? `AUTHORITY ${warning.authority}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeMarineWarningText(value) {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function navareaLabelFromCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  const region = NAVAREA_WARNING_REGIONS.find((item) => item.id === normalized || item.roman === normalized);
  return region?.label || (normalized ? `NAVAREA ${normalized}` : "NAVAREA");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeNgaBroadcastWarnings(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.["broadcast-warn"])
      ? payload["broadcast-warn"]
      : Array.isArray(payload?.broadcastWarn)
        ? payload.broadcastWarn
        : Array.isArray(payload?.warnings)
          ? payload.warnings
          : [];
  return rows
    .map((row) => normalizeNgaWarningRecord(row))
    .filter((item) => item && item.msgNumber && item.msgYear && item.navArea);
}

function normalizeNgaWarningRecord(row) {
  if (Array.isArray(row)) {
    return {
      navArea: String(row[0] || "").trim().toUpperCase(),
      msgNumber: Number(row[1]),
      msgYear: Number(row[2]),
      subregion: row[3] == null ? null : String(row[3]).trim(),
      text: String(row[4] || ""),
      status: "A",
      issueDate: row[5] == null ? null : String(row[5]).trim(),
      authority: null,
    };
  }
  if (!row || typeof row !== "object") return null;
  return {
    navArea: String(row.navArea || row.area || "").trim().toUpperCase(),
    msgNumber: Number(row.msgNumber || row.number),
    msgYear: Number(row.msgYear || row.year),
    subregion: row.subregion == null ? null : String(row.subregion).trim(),
    text: String(row.text || ""),
    status: String(row.status || "A").trim().toUpperCase(),
    issueDate: row.issueDate == null ? null : String(row.issueDate).trim(),
    authority: row.authority == null ? null : String(row.authority).trim(),
    cancelDate: row.cancelDate || null,
  };
}

async function fetchHydropacCurrentTextWarnings() {
  const firstPageHtml = await fetchTextOfficial(HYDROPAC_CURRENT_TEXT_URL, 60000);
  const pageUrls = discoverHydropacTextPageUrls(firstPageHtml);
  const pages = [{ url: HYDROPAC_CURRENT_TEXT_URL, html: firstPageHtml }];
  for (const url of pageUrls) {
    if (url === HYDROPAC_CURRENT_TEXT_URL) continue;
    try {
      pages.push({ url, html: await fetchTextOfficial(url, 60000) });
    } catch {
      // The official NGA API remains available; SeaLagom pages are a current-text supplement.
    }
  }
  return pages.flatMap(({ html, url }) => parseHydropacCurrentTextPage(html, url));
}

async function fetchHydropacArchiveTextWarningsForDate(historyDate) {
  const dayRange = beijingDateRangeUtc(historyDate);
  const firstPageHtml = await fetchTextOfficial(HYDROPAC_ARCHIVE_TEXT_URL, 60000);
  const pageUrls = discoverHydropacArchiveTextPageUrls(firstPageHtml);
  const pages = [{ url: HYDROPAC_ARCHIVE_TEXT_URL, html: firstPageHtml }];
  const archivePages = await mapLimit(
    pageUrls.filter((url) => url !== HYDROPAC_ARCHIVE_TEXT_URL),
    HYDROPAC_ARCHIVE_FETCH_CONCURRENCY,
    async (url) => {
      try {
        return { url, html: await fetchTextOfficial(url, 60000) };
      } catch {
        // SeaLagom archive is a supplement; one failed archive page should not block NGA history.
        return null;
      }
    },
  );
  pages.push(...archivePages.filter(Boolean));
  return pages
    .flatMap(({ html, url }) => parseHydropacArchiveTextPage(html, url))
    .filter((record) => hydropacRecordIntersectsRange(record, dayRange.startMs, dayRange.endMs));
}

function discoverHydropacTextPageUrls(html) {
  const urls = new Set([HYDROPAC_CURRENT_TEXT_URL]);
  const source = String(html || "");
  for (const match of source.matchAll(/href="([^"]*\/coastal\/21\/messages\/\?page=(\d+)[^"]*)"/gi)) {
    const page = Number(match[2]);
    if (!Number.isFinite(page) || page < 1 || page > 12) continue;
    urls.add(absoluteHydropacTextUrl(match[1]));
  }
  const pageCountMatch = stripHtml(source).match(/\bPage\s+\d+\s+of\s+(\d+)\b/i);
  const pageCount = pageCountMatch ? Math.min(12, Math.max(1, Number(pageCountMatch[1]))) : 1;
  for (let page = 2; page <= pageCount; page += 1) {
    urls.add(`${HYDROPAC_CURRENT_TEXT_URL}?page=${page}`);
  }
  return [...urls].sort((a, b) => hydropacPageNumber(a) - hydropacPageNumber(b));
}

function discoverHydropacArchiveTextPageUrls(html) {
  const urls = new Set([HYDROPAC_ARCHIVE_TEXT_URL]);
  const source = String(html || "");
  for (const match of source.matchAll(/href="([^"]*\/coastal\/21\/messages\/archive\/\?page=(\d+)[^"]*)"/gi)) {
    const page = Number(match[2]);
    if (!Number.isFinite(page) || page < 1 || page > HYDROPAC_ARCHIVE_MAX_PAGES) continue;
    urls.add(absoluteHydropacTextUrl(match[1]));
  }
  const pageCountMatch = stripHtml(source).match(/\bPage\s+\d+\s+of\s+(\d+)\b/i);
  const pageCount = pageCountMatch ? Math.min(HYDROPAC_ARCHIVE_MAX_PAGES, Math.max(1, Number(pageCountMatch[1]))) : 1;
  for (let page = 2; page <= pageCount; page += 1) {
    urls.add(`${HYDROPAC_ARCHIVE_TEXT_URL}?page=${page}`);
  }
  return [...urls].sort((a, b) => hydropacPageNumber(a) - hydropacPageNumber(b));
}

function absoluteHydropacTextUrl(value) {
  const text = String(value || "");
  if (/^https?:\/\//i.test(text)) return text;
  return `${HYDROPAC_CURRENT_TEXT_BASE_URL}${text.startsWith("/") ? "" : "/"}${text}`;
}

function hydropacPageNumber(url) {
  const match = String(url || "").match(/[?&]page=(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function parseHydropacCurrentTextPage(html, pageUrl = HYDROPAC_CURRENT_TEXT_URL) {
  const listRecords = parseHydropacCurrentListPage(html, pageUrl);
  if (listRecords.length) return listRecords;
  const records = [];
  const source = String(html || "");
  const pattern =
    /<h3\s+class="message-title">\s*(\d{1,4})\/(\d{2,4})\s*<\/h3>[\s\S]*?<div\s+class="message-date">([\s\S]*?)<\/div>[\s\S]*?<div\s+class="message-content"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of source.matchAll(pattern)) {
    const msgNumber = Number(match[1]);
    const msgYear = marineFullYear(match[2], new Date().getUTCFullYear());
    const text = decodeEntities(match[4].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
      .replace(/\r\n/g, "\n")
      .trim();
    if (!text || !Number.isFinite(msgNumber) || !Number.isFinite(msgYear)) continue;
    records.push({
      navArea: "P",
      msgNumber,
      msgYear,
      subregion: null,
      text,
      status: "A",
      issueDate: parseHydropacHtmlDateAsIssue(match[3]),
      authority: "HYDROPAC current text page",
      sourcePriority: 2,
    });
  }
  return records;
}

function parseHydropacArchiveTextPage(html, pageUrl = HYDROPAC_ARCHIVE_TEXT_URL) {
  return parseHydropacCurrentTextPage(html, pageUrl).map((record) => ({
    ...record,
    authority: String(record.authority || "SeaLagom HYDROPAC mirror").replace(/\bcurrent\b/i, "archived"),
    sourcePriority: Math.max(Number(record.sourcePriority || 0), 4),
    sourcePageUrl: pageUrl,
  }));
}

function parseHydropacCurrentListPage(html, pageUrl = HYDROPAC_CURRENT_TEXT_URL) {
  const records = [];
  const source = String(html || "");
  const itemPattern =
    /<li\b[\s\S]*?<a[^>]+href="([^"]*\/coastal\/21\/message\/[^"]+)"[^>]*>\s*(\d{1,4})\/(\d{2,4})(?:\(([^)<]+)\))?\s*<\/a>[\s\S]*?<time[^>]*>([^<]+)<\/time>[\s\S]*?<div\s+id="content-(\d+)"[^>]*>([\s\S]*?)<\/div>/gi;
  for (const match of source.matchAll(itemPattern)) {
    const msgNumber = Number(match[2]);
    const msgYear = marineFullYear(match[3], new Date().getUTCFullYear());
    const text = stripHtml(match[7]);
    if (!text || !Number.isFinite(msgNumber) || !Number.isFinite(msgYear)) continue;
    records.push({
      navArea: "P",
      msgNumber,
      msgYear,
      subregion: match[4] ? String(match[4]).trim() : null,
      text,
      status: "A",
      issueDate: parseSealagomListDateAsIssue(match[5], msgYear),
      authority: `SeaLagom current HYDROPAC mirror: ${absoluteHydropacTextUrl(match[1])}`,
      sourcePriority: 3,
      sourcePageUrl: pageUrl,
    });
  }
  return records;
}

function parseSealagomListDateAsIssue(value, fallbackYear) {
  const match = String(value || "").match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s*,\s*(\d{1,2}):(\d{2})\b/);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0));
  if (Number.isNaN(parsed.getTime())) return null;
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");
  const month = [...MARINE_MONTHS.entries()].find(([, index]) => index === parsed.getUTCMonth())?.[0] || "JAN";
  return `${day}${hour}${minute}Z ${month} ${marineFullYear(null, fallbackYear)}`;
}

function parseHydropacHtmlDateAsIssue(html) {
  const text = stripHtml(html);
  const match = text.match(/\((\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s+UTC\)/i);
  if (!match) return null;
  const parsed = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), 0));
  if (Number.isNaN(parsed.getTime())) return null;
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");
  const month = [...MARINE_MONTHS.entries()].find(([, index]) => index === parsed.getUTCMonth())?.[0] || "JAN";
  return `${day}${hour}${minute}Z ${month} ${parsed.getUTCFullYear()}`;
}

function mergeHydropacRecords(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record?.msgNumber || !record?.msgYear) continue;
    const key = `${record.msgNumber}/${record.msgYear}`;
    const existing = byId.get(key);
    if (!existing || (record.sourcePriority || 0) >= (existing.sourcePriority || 0)) {
      byId.set(key, record);
    }
  }
  return [...byId.values()].sort((a, b) => b.msgYear - a.msgYear || b.msgNumber - a.msgNumber);
}

function buildHydropacRestriction(warning, index) {
  const warningId = formatNgaWarningId(warning);
  const rawText = composeNgaWarningText(warning, warningId);
  const parsed = parseNotamText(rawText);
  const schedule = parseMarineSchedule(rawText, warning);
  const geometry = parsed.geometry;
  const title = summarizeMarineWarning(warning.text) || warningId;
  return {
    id: `hydropac:${warning.msgYear}:${warning.msgNumber}:${warning.subregion || index}`,
    type: "HYDROPAC",
    sourceKind: "hydropac",
    source: "NGA MSI HYDROPAC",
    sourceUrl: NGA_MSI_HYDROPAC_ACTIVE_URL,
    officialPageUrl: NGA_MSI_NAV_WARNINGS_URL,
    notamId: warningId,
    notamKey: `${warning.msgNumber}/${warning.msgYear}`,
    title,
    category: "HYDROPAC",
    legal: null,
    country: "NGA MSI / Pacific",
    state: null,
    region: "HYDROPAC",
    regionName: warning.subregion ? `HYDROPAC subregion ${warning.subregion}` : "HYDROPAC",
    isNew: isRecentIso(schedule.issuedAt, 72),
    modifiedAt: schedule.issuedAt,
    issuedAt: schedule.issuedAt,
    beginsAt: schedule.beginsAt,
    endsAt: schedule.endsAt,
    timeIntervals: schedule.intervals,
    longTerm: schedule.longTerm,
    temporalParseVersion: schedule.temporalParseVersion,
    timeLabel: schedule.timeLabel,
    beijingTimeLabel: schedule.beijingTimeLabel,
    altitude: null,
    radiusNm: parsed.radiusNm || null,
    center: parsed.center || centroidFromGeometry(geometry),
    geometry,
    hasGeometry: Boolean(geometry),
    geometrySource: geometry ? parsed.geometrySource || "NGA MSI HYDROPAC coordinate boundary" : null,
    geometryReason: parsed.geometryReason || (geometry ? "Boundary geometry parsed." : "No parsed boundary geometry."),
    coordinateCount: parsed.coordinateCount || 0,
    boundaryCoordinateCount: parsed.boundaryCoordinateCount || 0,
    polygonGroupCount: parsed.polygonGroupCount || 0,
    rejectedPolygonGroupCount: parsed.rejectedPolygonGroupCount || 0,
    geometryComplete: parsed.geometryComplete,
    polygonGroupValidationReasons: parsed.polygonGroupValidationReasons || [],
    noShapeList: false,
    affectedArea: title,
    authority: warning.authority || null,
    contact: null,
    rawText,
    rawTextPreview: rawText.slice(0, 1200),
  };
}

function formatNgaWarningId(warning) {
  const year = Number.isFinite(warning.msgYear) ? String(warning.msgYear).slice(-2).padStart(2, "0") : "";
  return `${navAreaName(warning.navArea)} ${warning.msgNumber}/${year}`.trim();
}

function navAreaName(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (normalized === "P") return "HYDROPAC";
  if (normalized === "A") return "HYDROLANT";
  if (normalized === "C") return "HYDROARC";
  if (normalized === "12") return "NAVAREA XII";
  if (normalized === "4") return "NAVAREA IV";
  if (normalized === "S") return "SPECIAL WARN";
  return normalized || "NGA MSI";
}

function composeNgaWarningText(warning, warningId) {
  return [
    `${warningId}${warning.subregion ? ` (${warning.subregion})` : ""}`,
    warning.text,
    warning.issueDate ? `ISSUED ${warning.issueDate}` : null,
    warning.authority ? `AUTHORITY ${warning.authority}` : null,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function summarizeMarineWarning(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^\d+\.\s*CANCEL\b/i.test(line))
    .slice(0, 4)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 180);
}

function parseMarineSchedule(rawText, warning) {
  const defaultYear = marineFullYear(warning?.msgYear, new Date().getUTCFullYear());
  const sourceText = normalizeMarineWarningText(rawText);
  const text = sourceText
    .toUpperCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\bTHROUGH\b/g, "THRU")
    .replace(/\s+/g, " ")
    .trim();
  const rawIssueDate = warning?.issueDate || sourceText.match(/\bISSUED\s+((?:\d{6})\s*(?:Z|UTC)\s+[A-Z]{3}(?:\s+\d{2,4})?)/i)?.[1] || null;
  const issuedAt = parseMarineIssueDate(rawIssueDate, defaultYear);
  const entries = [];
  const cancels = [];
  const seenIntervals = new Set();
  const activityText = maskMarineAdministrativeTimes(text);
  const explicitGroups = new Map();
  let previousExplicitGroup = null;
  let previousExplicitEnd = -1;

  const explicitPattern = /\b(\d{2})(\d{2})(\d{2})\s*(?:Z|UTC)?(?:\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?)?\s+(?:TO|THRU|-)\s+(\d{2})(\d{2})(\d{2})\s*(?:Z|UTC)?(?:\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?)?\b/gi;
  for (const match of activityText.matchAll(explicitPattern)) {
    const context = marineMonthContext(activityText, Number(match.index || 0) + match[0].length);
    const endMonthToken = match[9] || match[4] || context?.month;
    const startMonthToken = match[4] || endMonthToken;
    if (!startMonthToken || !endMonthToken) continue;
    const endYear = marineFullYear(match[10] || match[5] || context?.year, defaultYear);
    let startYear = marineFullYear(match[5] || match[10] || context?.year, endYear);
    let startMonth = MARINE_MONTHS.get(startMonthToken);
    const endMonth = MARINE_MONTHS.get(endMonthToken);
    if (startMonth == null || endMonth == null) continue;
    if (!match[4] && startMonth === endMonth && Number(match[1]) > Number(match[6])) {
      const shifted = shiftMarineMonth(endMonth, endYear, -1);
      startMonth = shifted.month;
      startYear = shifted.year;
    }
    const start = marineDatePartsToIso(match[1], match[2], match[3], startMonth, startYear);
    let end = marineDatePartsToIso(match[6], match[7], match[8], endMonth, endYear);
    if (start && end && Date.parse(end) < Date.parse(start) && match[4] && match[9] && !match[10]) {
      end = marineDatePartsToIso(match[6], match[7], match[8], endMonth, endYear + 1);
    }
    const occurrence = addUniqueMarineInterval(seenIntervals, start, end);
    if (!occurrence) continue;
    const gap = previousExplicitEnd >= 0 ? activityText.slice(previousExplicitEnd, match.index ?? previousExplicitEnd) : "";
    const continuesPreviousGroup = previousExplicitGroup && /^[\s,;]*(?:AND\s*)?$/i.test(gap);
    const label = continuesPreviousGroup
      ? previousExplicitGroup.label
      : marineContextLabel(sourceText, Math.min(Number(match.index || 0), sourceText.length), explicitGroups.size + 1);
    const groupKey = continuesPreviousGroup ? previousExplicitGroup.key : `${label}:${match.index ?? explicitGroups.size}`;
    const group = explicitGroups.get(groupKey) || { key: groupKey, sourceIndex: match.index ?? 0, label, occurrences: [] };
    group.occurrences.push(occurrence);
    group.sourceIndex = Math.min(group.sourceIndex, match.index ?? group.sourceIndex);
    explicitGroups.set(groupKey, group);
    previousExplicitGroup = group;
    previousExplicitEnd = Number(match.index || 0) + match[0].length;
  }
  for (const group of explicitGroups.values()) {
    group.occurrences.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    group.utcLabel = group.occurrences.map(formatMarineUtcOccurrence).join("、");
    entries.push(group);
  }

  for (const block of extractMarineDailyBlocks(activityText)) {
    const context = marineMonthContext(activityText, block.contextIndex);
    const monthToken = block.month || context?.month;
    const year = marineFullYear(block.year || context?.year, defaultYear);
    const dates = expandMarineDateList(block.dayExpression, monthToken, year);
    const excludedWeekdays = marineExcludedWeekdays(block.dayExpression);
    if (!dates.length || !block.windows.length) continue;
    const occurrences = [];
    for (const date of dates) {
      const dayProbe = new Date(Date.UTC(date.year, date.month, date.day));
      if (dayProbe.getUTCMonth() !== date.month || excludedWeekdays.has(dayProbe.getUTCDay())) continue;
      for (const window of block.windows) {
        const start = marineDatePartsToIso(date.day, window.startHour, window.startMinute, date.month, date.year);
        let end = marineDatePartsToIso(date.day, window.endHour, window.endMinute, date.month, date.year);
        if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 86400000).toISOString();
        const occurrence = addUniqueMarineInterval(seenIntervals, start, end);
        if (occurrence) occurrences.push(occurrence);
      }
    }
    if (!occurrences.length) continue;
    const label = marineContextLabel(sourceText, Math.min(block.sourceIndex, sourceText.length), entries.length + 1);
    const windowLabel = block.windows
      .map((window) => `${window.startHour}${window.startMinute}Z-${window.endHour}${window.endMinute}Z`)
      .join("、");
    const exclusionLabel = excludedWeekdays.size ? `，排除${formatMarineWeekdays(excludedWeekdays)}` : "";
    entries.push({
      sourceIndex: block.sourceIndex,
      label,
      utcLabel: `${windowLabel}；${formatMarineDateReferences(dates)}${exclusionLabel}`,
      occurrences: occurrences.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
    });
  }

  for (const block of extractMarineDatesBeforeTimeBlocks(activityText)) {
    const dates = expandMarineDateList(block.dayExpression, block.month, marineFullYear(block.year, defaultYear));
    if (!dates.length) continue;
    const groupOccurrences = [];
    for (const date of dates) {
      const start = marineDatePartsToIso(date.day, block.window.startHour, block.window.startMinute, date.month, date.year);
      let end = marineDatePartsToIso(date.day, block.window.endHour, block.window.endMinute, date.month, date.year);
      if (start && end && Date.parse(end) < Date.parse(start)) end = new Date(Date.parse(end) + 86400000).toISOString();
      const occurrence = addUniqueMarineInterval(seenIntervals, start, end);
      if (occurrence) groupOccurrences.push(occurrence);
    }
    if (!groupOccurrences.length) continue;
    const existing = entries.find((entry) => entry.scheduleContextKey === block.contextKey);
    const windowLabel = `${block.window.startHour}${block.window.startMinute}Z-${block.window.endHour}${block.window.endMinute}Z`;
    if (existing) {
      existing.occurrences.push(...groupOccurrences);
      existing.occurrences.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      existing.utcLabel = `${existing.utcLabel.split("；")[0]}、${windowLabel}；${formatMarineDateReferences(dates)}`;
    } else {
      entries.push({
        sourceIndex: block.sourceIndex,
        scheduleContextKey: block.contextKey,
        label: marineContextLabel(sourceText, Math.min(block.sourceIndex, sourceText.length), entries.length + 1),
        utcLabel: `${windowLabel}；${formatMarineDateReferences(dates)}`,
        occurrences: groupOccurrences.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
      });
    }
  }

  for (const block of extractMarineDurationDateBlocks(activityText, defaultYear)) {
    const occurrences = [];
    for (const date of block.dates) {
      const start = marineDatePartsToIso(date.day, block.startHour, block.startMinute, date.month, date.year);
      const end = start ? new Date(Date.parse(start) + block.durationHours * 3600000).toISOString() : null;
      const occurrence = addUniqueMarineInterval(seenIntervals, start, end);
      if (occurrence) occurrences.push(occurrence);
    }
    if (!occurrences.length) continue;
    entries.push({
      sourceIndex: block.sourceIndex,
      label: marineContextLabel(sourceText, Math.min(block.sourceIndex, sourceText.length), entries.length + 1),
      utcLabel: `${block.durationHours}小时，每日 ${block.startHour}${block.startMinute}Z 开始；${formatMarineDateReferences(block.dates)}`,
      occurrences,
    });
  }

  if (!entries.length) {
    const dateOnlyRange = parseMarineDateOnlyRange(activityText, defaultYear);
    if (dateOnlyRange) {
      const occurrence = addUniqueMarineInterval(seenIntervals, dateOnlyRange.start, dateOnlyRange.end);
      if (occurrence) {
        entries.push({
          sourceIndex: dateOnlyRange.sourceIndex,
          label: marineContextLabel(sourceText, Math.min(dateOnlyRange.sourceIndex, sourceText.length), 1),
          utcLabel: `${formatMarineUtcDateTime(dateOnlyRange.start)} 至 ${formatMarineUtcDateTime(dateOnlyRange.end)}`,
          occurrences: [occurrence],
        });
      }
    }
  }

  for (const match of text.matchAll(/\bTHIS\s+(?:MSG|MESSAGE)\s+(\d{2})(\d{2})(\d{2})\s*(?:Z|UTC)?\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/gi)) {
    const lookback = text.slice(Math.max(0, Number(match.index || 0) - 140), Number(match.index || 0));
    if (!/\bCANCEL\b/i.test(lookback)) continue;
    const cancelAt = marineDateToIso(match[1], match[2], match[3], match[4], match[5], defaultYear);
    if (!cancelAt) continue;
    cancels.push({
      sourceIndex: match.index ?? Number.MAX_SAFE_INTEGER,
      utcLabel: `${match[1]}${match[2]}${match[3]}Z ${match[4].toUpperCase()} ${marineDisplayYear(match[5], defaultYear)}`,
      at: cancelAt,
    });
  }

  const untilFurtherNotice = /\bUNTIL\s+FURTHER\s+NOTICE(?:\s*BY)?\b|\bUFN\b/i.test(text);
  const inProgress = /\bIN\s+PROGRESS\b/i.test(text);
  const untilDate = parseMarineUntilDate(text, defaultYear);
  const sortedEntries = entries.sort((a, b) => a.sourceIndex - b.sourceIndex);
  const sortedCancels = cancels.sort((a, b) => a.sourceIndex - b.sourceIndex);
  const intervals = sortedEntries.flatMap((item) => item.occurrences).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let inferredIssueToCancel = false;
  if (!intervals.length && issuedAt && untilDate) intervals.push({ start: issuedAt, end: untilDate });
  if (!intervals.length && issuedAt && sortedCancels.length) {
    intervals.push({ start: issuedAt, end: sortedCancels[sortedCancels.length - 1].at });
    inferredIssueToCancel = true;
  }
  const openEndedFromIssue = Boolean(!intervals.length && issuedAt && !sortedCancels.length && !untilDate);
  const longTerm = Boolean((untilFurtherNotice || (inProgress && !untilDate && !intervals.length) || openEndedFromIssue) && !sortedCancels.length);
  const beginsAt = earliestIso([...intervals.map((item) => item.start), inProgress || longTerm || openEndedFromIssue ? issuedAt : null]);
  const endsAt = longTerm
    ? null
    : latestIso([...intervals.map((item) => item.end), untilDate, ...sortedCancels.map((item) => item.at)]);
  const timeParts = sortedEntries.map(formatMarineUtcScheduleEntry);
  if (openEndedFromIssue && !untilFurtherNotice && !inProgress) timeParts.push("自发布时刻起有效，原文未给出结束时刻");
  else if (longTerm) timeParts.push("自发布时刻起持续有效，直至另行通知");
  else if (issuedAt && untilDate && !sortedEntries.length) timeParts.push(`自发布时刻起持续有效，至 ${formatMarineUtcDateTime(untilDate)}`);
  else if (!sortedEntries.length && issuedAt && sortedCancels.length) {
    timeParts.push(`有效期：${formatMarineUtcDateTime(issuedAt)} 至 ${formatMarineUtcDateTime(sortedCancels[sortedCancels.length - 1].at)}`);
  }
  if (sortedCancels.length && !inferredIssueToCancel) timeParts.push(...sortedCancels.map((item) => `取消：${item.utcLabel}`));
  if (!timeParts.length && rawIssueDate) timeParts.push(`ISSUED ${rawIssueDate}`);

  const beijingParts = sortedEntries.map(formatMarineBeijingScheduleEntry);
  if (openEndedFromIssue && !untilFurtherNotice && !inProgress && issuedAt) {
    beijingParts.push(`自 ${formatBeijingDateTimeCompact(issuedAt)} 起有效，原文未给出结束时刻（北京时间）`);
  } else if (longTerm && issuedAt) beijingParts.push(`自 ${formatBeijingDateTimeCompact(issuedAt)} 起持续有效，直至另行通知（北京时间）`);
  else if (issuedAt && untilDate && !sortedEntries.length) {
    beijingParts.push(`自 ${formatBeijingDateTimeCompact(issuedAt)} 至 ${formatBeijingDateTimeCompact(untilDate)} 北京时间`);
  } else if (!sortedEntries.length && issuedAt && sortedCancels.length) {
    beijingParts.push(`有效期：${formatBeijingRangeCompact(issuedAt, sortedCancels[sortedCancels.length - 1].at)} 北京时间`);
  }
  if (!inferredIssueToCancel) beijingParts.push(...sortedCancels.map((item) => `取消：${formatBeijingDateTime(item.at)}`));
  if (!beijingParts.length && issuedAt) beijingParts.push(`发布时间：${formatBeijingDateTime(issuedAt)}`);

  return {
    issuedAt,
    beginsAt,
    endsAt,
    intervals,
    longTerm,
    temporalParseVersion: MARINE_TEMPORAL_PARSE_VERSION,
    timeLabel: timeParts.join("; ") || null,
    beijingTimeLabel: beijingParts.join("; ") || null,
  };
}

function maskMarineAdministrativeTimes(text) {
  return String(text || "")
    .replace(/\bCANCEL[\s\S]{0,140}?\bTHIS\s+(?:MSG|MESSAGE)\s+\d{6}\s*(?:Z|UTC)?\s+[A-Z]{3}(?:\s+\d{2,4})?\b/gi, (value) => " ".repeat(value.length))
    .replace(/\bISSUED\s+\d{6}\s*(?:Z|UTC)\s+[A-Z]{3}(?:\s+\d{2,4})?\b/gi, (value) => " ".repeat(value.length));
}

function marineMonthContext(text, startIndex) {
  const tail = String(text || "").slice(Math.max(0, startIndex), Math.max(0, startIndex) + 900);
  const boundaryIndex = tail.search(/\b(?:IN\s+AREAS?|CANCEL\s+THIS\s+MSG|ISSUED|AUTHORITY)\b/i);
  const scope = boundaryIndex >= 0 ? tail.slice(0, boundaryIndex) : tail;
  const match = scope.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/i);
  return match ? { month: match[1].toUpperCase(), year: match[2] || null } : null;
}

function addUniqueMarineInterval(seen, start, end) {
  if (!start || !end || Date.parse(end) < Date.parse(start)) return null;
  const key = `${start}|${end}`;
  if (seen.has(key)) return null;
  seen.add(key);
  return { start, end };
}

function extractMarineDailyBlocks(text) {
  const source = String(text || "");
  const blocks = [];
  const seen = new Set();
  const windowsPattern = "(?:\\b\\d{4}\\s*(?:Z|UTC)?\\s+(?:TO|THRU|-)\\s+\\d{4}\\s*(?:Z|UTC)?(?:\\s*(?:,|AND)\\s*)?)+";
  const beforeDaily = new RegExp(`(${windowsPattern})\\s+(?:COMMENCING\\s+)?DAILY\\b`, "gi");
  for (const match of source.matchAll(beforeDaily)) {
    const expressionStart = Number(match.index || 0) + match[0].length;
    const tail = source.slice(expressionStart);
    const boundary = tail.search(/\b(?:\d{4}\s*(?:Z|UTC)?\s+(?:TO|THRU|-)|IN\s+AREAS?|AREAS?\s+BOUND(?:ED)?\s+BY|WITHIN|CANCEL\s+THIS\s+MSG|ISSUED|AUTHORITY)\b/i);
    const dayExpression = tail.slice(0, boundary >= 0 ? boundary : Math.min(240, tail.length)).trim().replace(/^AND\s+/i, "");
    const monthMatch = dayExpression.match(/\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/i);
    addMarineDailyBlock(blocks, seen, {
      sourceIndex: match.index ?? 0,
      contextIndex: expressionStart + Math.max(0, boundary),
      windows: parseMarineDailyWindows(match[1]),
      dayExpression,
      month: monthMatch?.[1]?.toUpperCase() || null,
      year: monthMatch?.[2] || null,
    });
  }

  const afterDate = new RegExp(`(${windowsPattern})\\s+([0-9][0-9,\\s-]*(?:(?:THRU|TO|AND)[0-9,\\s-]*)*)\\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\\s+(\\d{2,4}))?\\s+(?:COMMENCING\\s+)?DAILY\\b`, "gi");
  for (const match of source.matchAll(afterDate)) {
    const afterIndex = Number(match.index || 0) + match[0].length;
    const tail = source.slice(afterIndex);
    const boundary = tail.search(/\b(?:IN\s+AREAS?|AREAS?\s+BOUND(?:ED)?\s+BY|WITHIN|CANCEL\s+THIS\s+MSG|ISSUED|AUTHORITY)\b/i);
    const exclusions = tail.slice(0, boundary >= 0 ? boundary : Math.min(120, tail.length)).match(/\bEXCEPT\b[\s\S]*/i)?.[0] || "";
    addMarineDailyBlock(blocks, seen, {
      sourceIndex: match.index ?? 0,
      contextIndex: afterIndex,
      windows: parseMarineDailyWindows(match[1]),
      dayExpression: `${match[2]} ${match[3]} ${match[4] || ""} ${exclusions}`.trim(),
      month: match[3].toUpperCase(),
      year: match[4] || null,
    });
  }
  return blocks.sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function extractMarineDatesBeforeTimeBlocks(text) {
  const source = String(text || "");
  const blocks = [];
  const monthNames = "JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC";
  const trailingDatePattern = new RegExp(`((?:(?:\\d{1,2}|${monthNames}|AND|TO|THRU|,|-|\\s))+?)(?:\\s+FROM)?\\s*$`, "i");
  const timePattern = /\b(?:FROM\s+)?(\d{2})(\d{2})\s*(?:Z|UTC)?\s+TO\s+(\d{2})(\d{2})\s*(?:Z|UTC)?\b/gi;
  let previousContext = null;
  let previousEnd = -1;
  for (const match of source.matchAll(timePattern)) {
    if (Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3]) > 23 || Number(match[4]) > 59) continue;
    const before = source.slice(Math.max(0, Number(match.index || 0) - 300), Number(match.index || 0));
    const dateMatch = before.match(trailingDatePattern);
    let context = null;
    if (dateMatch && new RegExp(`\\b(?:${monthNames})\\b`, "i").test(dateMatch[1])) {
      const monthMatches = [...dateMatch[1].matchAll(new RegExp(`\\b(${monthNames})(?:\\s+(\\d{2,4}))?\\b`, "gi"))];
      const lastMonth = monthMatches[monthMatches.length - 1];
      const dayExpression = dateMatch[1].trim();
      context = {
        contextKey: `${Number(match.index || 0) - dayExpression.length}:${dayExpression}`,
        dayExpression,
        month: lastMonth?.[1]?.toUpperCase() || null,
        year: lastMonth?.[2] || null,
      };
    } else if (previousContext && previousEnd >= 0) {
      const gap = source.slice(previousEnd, Number(match.index || 0));
      if (/^[\s,;]*(?:Z|UTC)?[\s,;]*(?:AND\s*)?$/i.test(gap)) context = previousContext;
    }
    if (!context) {
      previousContext = null;
      previousEnd = Number(match.index || 0) + match[0].length;
      continue;
    }
    blocks.push({
      ...context,
      sourceIndex: match.index ?? 0,
      window: { startHour: match[1], startMinute: match[2], endHour: match[3], endMinute: match[4] },
    });
    previousContext = context;
    previousEnd = Number(match.index || 0) + match[0].length;
  }
  return blocks;
}

function extractMarineDurationDateBlocks(text, fallbackYear) {
  const source = String(text || "");
  const blocks = [];
  const pattern = /\bFOR\s+(\d{1,2}(?:\.\d+)?)\s+HOURS?\s+FROM\s+(\d{2})(\d{2})\s*(?:Z|UTC)?\s+(\d{1,2})\s+(?:TO|THRU|-)\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/gi;
  for (const match of source.matchAll(pattern)) {
    const durationHours = Number(match[1]);
    if (!(durationHours > 0 && durationHours <= 72) || Number(match[2]) > 23 || Number(match[3]) > 59) continue;
    const year = marineFullYear(match[7], fallbackYear);
    const dates = expandMarineDateList(`${match[4]} TO ${match[5]} ${match[6]}`, match[6], year);
    if (!dates.length) continue;
    blocks.push({
      sourceIndex: Number(match.index || 0),
      durationHours,
      startHour: match[2],
      startMinute: match[3],
      dates,
    });
  }
  return blocks;
}

function parseMarineDateOnlyRange(text, fallbackYear) {
  const source = String(text || "");
  const pattern = /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\s+(?:TO|THRU|-)\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/i;
  const match = source.match(pattern);
  if (!match) return null;
  const startMonth = MARINE_MONTHS.get(match[2]);
  const endMonth = MARINE_MONTHS.get(match[5]);
  let startYear = marineFullYear(match[3] || match[6], fallbackYear);
  let endYear = marineFullYear(match[6] || match[3], startYear);
  if (!match[6] && endMonth < startMonth) endYear += 1;
  const start = marineDatePartsToIso(match[1], "00", "00", startMonth, startYear);
  const end = marineDatePartsToIso(match[4], "23", "59", endMonth, endYear);
  if (!start || !end || Date.parse(end) < Date.parse(start) || Date.parse(end) - Date.parse(start) > 740 * 86400000) return null;
  return { sourceIndex: Number(match.index || 0), start, end };
}

function expandMarineDateList(value, fallbackMonthToken, fallbackYear) {
  const source = String(value || "")
    .toUpperCase()
    .replace(/\bEXCEPT\b[\s\S]*$/i, "")
    .replace(/\bCOMMENCING\s+DAILY\b/g, " ")
    .replace(/\bALTERNATE\b/g, " ");
  const dates = [];
  const seen = new Set();
  const addDate = (year, month, day) => {
    const probe = new Date(Date.UTC(year, month, day));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month || probe.getUTCDate() !== day) return;
    const key = `${year}-${month}-${day}`;
    if (seen.has(key)) return;
    seen.add(key);
    dates.push({ year, month, day });
  };
  let remaining = source;
  let explicitRangeFound = false;
  const fullRangePattern = /\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\s+(?:TO|THRU)\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/gi;
  for (const match of source.matchAll(fullRangePattern)) {
    explicitRangeFound = true;
    const startMonth = MARINE_MONTHS.get(match[2]);
    const endMonth = MARINE_MONTHS.get(match[5]);
    let startYear = marineFullYear(match[3] || match[6], fallbackYear);
    let endYear = marineFullYear(match[6] || match[3], startYear);
    if (!match[6] && endMonth < startMonth) endYear += 1;
    const startMs = Date.UTC(startYear, startMonth, Number(match[1]));
    const endMs = Date.UTC(endYear, endMonth, Number(match[4]));
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs && endMs - startMs <= 370 * 86400000) {
      for (let time = startMs; time <= endMs; time += 86400000) {
        const date = new Date(time);
        addDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
      }
    }
    remaining = remaining.replace(match[0], " ".repeat(match[0].length));
  }

  const monthPattern = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/gi;
  let previousEnd = 0;
  let inferredYear = marineFullYear(fallbackYear, new Date().getUTCFullYear());
  let previousMonth = null;
  let monthFound = false;
  for (const match of remaining.matchAll(monthPattern)) {
    monthFound = true;
    const month = MARINE_MONTHS.get(match[1]);
    if (match[2]) inferredYear = marineFullYear(match[2], inferredYear);
    else if (previousMonth != null && month < previousMonth && previousMonth - month >= 6) inferredYear += 1;
    const days = expandMarineDayList(remaining.slice(previousEnd, match.index));
    for (const day of days) addDate(inferredYear, month, day);
    previousMonth = month;
    previousEnd = Number(match.index || 0) + match[0].length;
  }
  if (!monthFound && !explicitRangeFound && fallbackMonthToken) {
    const month = MARINE_MONTHS.get(String(fallbackMonthToken).toUpperCase());
    const year = marineFullYear(fallbackYear, new Date().getUTCFullYear());
    for (const day of expandMarineDayList(remaining)) addDate(year, month, day);
  }
  return dates.sort((a, b) => Date.UTC(a.year, a.month, a.day) - Date.UTC(b.year, b.month, b.day));
}

function formatMarineDateReferences(dates) {
  const groups = new Map();
  for (const date of dates || []) {
    const month = [...MARINE_MONTHS.entries()].find(([, index]) => index === date.month)?.[0] || "";
    const key = `${month} ${date.year}`;
    const days = groups.get(key) || [];
    days.push(date.day);
    groups.set(key, days);
  }
  return [...groups.entries()].map(([label, days]) => `${formatMarineDayList([...new Set(days)].sort((a, b) => a - b))} ${label}`).join("；");
}

function addMarineDailyBlock(blocks, seen, block) {
  if (!block.windows.length || !block.dayExpression) return;
  const key = `${block.sourceIndex}|${block.windows.map((item) => Object.values(item).join(":"))}|${block.dayExpression}`;
  if (seen.has(key)) return;
  seen.add(key);
  blocks.push(block);
}

function parseMarineDailyWindows(value) {
  const windows = [];
  for (const match of String(value || "").matchAll(/\b(\d{2})(\d{2})\s*(?:Z|UTC)?\s+(?:TO|THRU|-)\s+(\d{2})(\d{2})\s*(?:Z|UTC)?\b/gi)) {
    if (Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3]) > 23 || Number(match[4]) > 59) continue;
    windows.push({ startHour: match[1], startMinute: match[2], endHour: match[3], endMinute: match[4] });
  }
  return windows;
}

function marineExcludedWeekdays(value) {
  const excluded = new Set();
  const except = String(value || "").match(/\bEXCEPT\b([\s\S]*)/i)?.[1] || "";
  const names = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  names.forEach((name, index) => {
    if (new RegExp(`\\b${name}S?\\b`, "i").test(except)) excluded.add(index);
  });
  return excluded;
}

function formatMarineWeekdays(days) {
  const labels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return [...days].sort((a, b) => a - b).map((day) => labels[day]).join("、");
}

function parseMarineUntilDate(text, fallbackYear) {
  if (/\bUNTIL\s+FURTHER\s+NOTICE\b|\bUFN\b/i.test(text)) return null;
  const match = String(text || "").match(/\b(?:UNTIL|TILL)\s+(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(?:\s+(\d{2,4}))?\b/i);
  return match ? marineDateToIso(match[1], "23", "59", match[2], match[3], fallbackYear) : null;
}

function formatMarineUtcOccurrence(interval) {
  const start = new Date(interval.start);
  const end = new Date(interval.end);
  const month = [...MARINE_MONTHS.entries()].find(([, index]) => index === end.getUTCMonth())?.[0] || "";
  const stamp = (date) => `${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}Z`;
  return `${stamp(start)}-${stamp(end)} ${month} ${end.getUTCFullYear()}`;
}

function formatMarineUtcDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "未解析";
  const month = [...MARINE_MONTHS.entries()].find(([, index]) => index === date.getUTCMonth())?.[0] || "";
  return `${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}Z ${month} ${date.getUTCFullYear()}`;
}

function marineExplicitMonthIntervalToOccurrence(match, fallbackYear) {
  const startYear = marineFullYear(match[5] || match[10], fallbackYear);
  const endYear = marineFullYear(match[10] || match[5], fallbackYear);
  const start = marineDateToIso(match[1], match[2], match[3], match[4], startYear, startYear);
  let end = marineDateToIso(match[6], match[7], match[8], match[9], endYear, endYear);
  if (start && end && Date.parse(end) < Date.parse(start) && !match[10]) {
    end = marineDateToIso(match[6], match[7], match[8], match[9], endYear + 1, endYear + 1);
  }
  return start && end ? { start, end } : null;
}

function marineSameMonthIntervalToOccurrence(match, fallbackYear) {
  const endMonth = MARINE_MONTHS.get(String(match[7] || "").toUpperCase().slice(0, 3));
  const endYear = marineFullYear(match[8], fallbackYear);
  if (endMonth == null || !Number.isFinite(endYear)) return null;
  const startDay = Number(match[1]);
  const endDay = Number(match[4]);
  const startMonthYear = startDay > endDay ? shiftMarineMonth(endMonth, endYear, -1) : { month: endMonth, year: endYear };
  const start = marineDatePartsToIso(match[1], match[2], match[3], startMonthYear.month, startMonthYear.year);
  let end = marineDatePartsToIso(match[4], match[5], match[6], endMonth, endYear);
  if (start && end && Date.parse(end) < Date.parse(start)) {
    end = new Date(Date.parse(end) + 24 * 60 * 60 * 1000).toISOString();
  }
  return start && end ? { start, end } : null;
}

function marineContextLabel(text, index, fallbackIndex) {
  const source = String(text || "");
  const lineStart = source.lastIndexOf("\n", index) + 1;
  let before = source.slice(lineStart, index).replace(/\s+/g, " ").trim();
  if (!before) {
    before = source
      .slice(0, lineStart)
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(-2)
      .join(" ");
  }
  const section = before.match(/(?:^|\s)([A-Z])\.\s*(?:[A-Z][A-Z\s/.-]*:?\s*)?$/i);
  if (section) return `${section[1].toUpperCase()}区`;
  if (/\bALTERNATE\b/i.test(before)) return "备选时段";
  if (/\b(HAZARDOUS|OPERATIONS|EXERCISE|MISSILE|ROCKET|LAUNCH)\b/i.test(before)) return "主要时段";
  return `时段 ${fallbackIndex}`;
}

function expandMarineDayList(value) {
  const normalized = String(value || "")
    .toUpperCase()
    .replace(/\bEXCEPT\b[\s\S]*$/i, "")
    .replace(/\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/g, " ")
    .replace(/\b\d{4}\b/g, " ")
    .replace(/\b(AND|及|、)\b/g, ",")
    .replace(/\b(THRU|THROUGH)\b/g, "TO")
    .replace(/\s+/g, " ");
  const days = new Set();
  for (const range of normalized.matchAll(/\b(\d{1,2})\s*(?:-|TO)\s*(\d{1,2})\b/g)) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start >= 1 && start <= 31 && end >= 1 && end <= 31) {
      const step = start <= end ? 1 : -1;
      for (let day = start; day !== end + step; day += step) days.add(day);
    }
  }
  for (const token of normalized.match(/\b\d{1,2}\b/g) || []) {
    const day = Number(token);
    if (day >= 1 && day <= 31) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

function formatMarineDayList(days) {
  return days.join("、");
}

function formatMarineUtcScheduleEntry(entry) {
  return `${entry.label}：${entry.utcLabel}`;
}

function formatMarineBeijingScheduleEntry(entry) {
  const occurrences = entry.occurrences || [];
  if (occurrences.length <= 6) {
    return `${entry.label}：${occurrences.map((item) => formatBeijingRangeCompact(item.start, item.end)).join("、")} 北京时间`;
  }
  const groups = new Map();
  for (const occurrence of occurrences) {
    const start = beijingDateTimeParts(occurrence.start);
    const end = beijingDateTimeParts(occurrence.end);
    if (!start || !end) continue;
    const startDate = `${start.year}-${start.month}-${start.day}`;
    const startOrdinal = Date.UTC(Number(start.year), Number(start.month) - 1, Number(start.day)) / 86400000;
    const endOrdinal = Date.UTC(Number(end.year), Number(end.month) - 1, Number(end.day)) / 86400000;
    const dayOffset = Math.round(endOrdinal - startOrdinal);
    const key = `${start.hour}:${start.minute}|${end.hour}:${end.minute}|${dayOffset}`;
    const group = groups.get(key) || {
      startTime: `${start.hour}:${start.minute}`,
      endTime: `${end.hour}:${end.minute}`,
      dayOffset,
      dates: [],
    };
    group.dates.push(startDate);
    groups.set(key, group);
  }
  const summaries = [...groups.values()].map((group) => {
    const endLabel = group.dayOffset === 1 ? `次日 ${group.endTime}` : group.dayOffset > 1 ? `${group.dayOffset} 日后 ${group.endTime}` : group.endTime;
    return `${compactMarineCalendarDates(group.dates)} ${group.startTime}-${endLabel}`;
  });
  return `${entry.label}：${summaries.join("；")} 北京时间`;
}

function compactMarineCalendarDates(values) {
  const dates = [...new Set(values)]
    .map((value) => ({ value, ordinal: Date.parse(`${value}T00:00:00Z`) / 86400000 }))
    .filter((item) => Number.isFinite(item.ordinal))
    .sort((a, b) => a.ordinal - b.ordinal);
  const ranges = [];
  for (let index = 0; index < dates.length; index += 1) {
    const start = dates[index];
    let end = start;
    while (index + 1 < dates.length && dates[index + 1].ordinal === end.ordinal + 1) {
      end = dates[++index];
    }
    const startText = start.value.replace(/-/g, "/");
    const endText = end.value.replace(/-/g, "/");
    ranges.push(start.value === end.value ? startText : `${startText}-${endText}`);
  }
  return ranges.join("、");
}

function parseMarineIssueDate(value, fallbackYear) {
  const match = String(value || "").match(/\b(\d{2})(\d{2})(\d{2})\s*(?:Z|UTC)\s+([A-Z]{3})(?:\s+(\d{2,4}))?\b/i);
  return match ? marineDateToIso(match[1], match[2], match[3], match[4], match[5], fallbackYear) : null;
}

const MARINE_MONTHS = new Map([
  ["JAN", 0],
  ["FEB", 1],
  ["MAR", 2],
  ["APR", 3],
  ["MAY", 4],
  ["JUN", 5],
  ["JUL", 6],
  ["AUG", 7],
  ["SEP", 8],
  ["OCT", 9],
  ["NOV", 10],
  ["DEC", 11],
]);

function marineDateToIso(day, hour, minute, monthToken, yearToken, fallbackYear) {
  const month = MARINE_MONTHS.get(String(monthToken || "").toUpperCase().slice(0, 3));
  const fullYear = marineFullYear(yearToken, fallbackYear);
  return marineDatePartsToIso(day, hour, minute, month, fullYear);
}

function marineDatePartsToIso(day, hour, minute, month, fullYear) {
  const d = Number(day);
  const h = Number(hour);
  const m = Number(minute);
  if (!Number.isFinite(fullYear) || month == null || d < 1 || d > 31 || h < 0 || h > 23 || m < 0 || m > 59) return null;
  const date = new Date(Date.UTC(fullYear, month, d, h, m, 0));
  if (date.getUTCFullYear() !== fullYear || date.getUTCMonth() !== month || date.getUTCDate() !== d) return null;
  return date.toISOString();
}

function shiftMarineMonth(month, fullYear, delta) {
  const date = new Date(Date.UTC(fullYear, month + delta, 1));
  return { month: date.getUTCMonth(), year: date.getUTCFullYear() };
}

function marineDisplayYear(yearToken, fallbackYear) {
  return marineFullYear(yearToken, fallbackYear);
}

function marineFullYear(yearToken, fallbackYear) {
  if (yearToken != null && String(yearToken).trim()) {
    const value = Number(String(yearToken).trim());
    if (String(yearToken).trim().length <= 2) return value >= 70 ? 1900 + value : 2000 + value;
    return value;
  }
  const fallback = Number(fallbackYear);
  if (Number.isFinite(fallback)) {
    if (fallback >= 0 && fallback < 100) return fallback >= 70 ? 1900 + fallback : 2000 + fallback;
    return fallback;
  }
  return new Date().getUTCFullYear();
}

function earliestIso(values) {
  const timestamps = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : null;
}

function latestIso(values) {
  const timestamps = values.map((value) => Date.parse(value)).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function formatBeijingDateTime(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "未解析";
  return `${formatBeijingDateTimeCompact(value)} 北京时间`;
}

function formatBeijingDateTimeCompact(value) {
  const parts = beijingDateTimeParts(value);
  return parts ? `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}` : "未解析";
}

function formatBeijingRangeCompact(start, end) {
  const startParts = beijingDateTimeParts(start);
  const endParts = beijingDateTimeParts(end);
  if (!startParts || !endParts) return `${formatBeijingDateTimeCompact(start)} 至 ${formatBeijingDateTimeCompact(end)}`;
  const startText = `${startParts.year}/${startParts.month}/${startParts.day} ${startParts.hour}:${startParts.minute}`;
  const endTime = `${endParts.hour}:${endParts.minute}`;
  if (startParts.year === endParts.year && startParts.month === endParts.month && startParts.day === endParts.day) {
    return `${startText}-${endTime}`;
  }
  return `${startText} 至 ${endParts.year}/${endParts.month}/${endParts.day} ${endTime}`;
}

function beijingDateTimeParts(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map((part) => [part.type, part.value]));
  return parts.year && parts.month && parts.day && parts.hour && parts.minute ? parts : null;
}

function compactWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function loadFaaTfrRestrictions(includeDetails) {
  const [list, summary, noShape, geojson] = await Promise.all([
    fetchJson(TFR_LIST_URL),
    fetchJson(TFR_SUMMARY_URL),
    fetchJson(TFR_NOSHAPE_URL),
    fetchJson(TFR_GEOJSON_URL),
  ]);

  const summaryMap = new Map((Array.isArray(summary) ? summary : []).map((item) => [item.center_id, item]));
  const geoByNotamId = new Map();
  for (const feature of geojson.features || []) {
    const id = getNotamIdFromGeoFeature(feature);
    if (id) geoByNotamId.set(id, feature);
  }

  const missingShapeIds = new Set((Array.isArray(noShape) ? noShape : []).map((item) => item.notam_id));
  const listItems = Array.isArray(list) ? list : [];
  const details = includeDetails
    ? await mapLimit(listItems, 8, async (item) => fetchTfrDetail(item.notam_id))
    : listItems.map(() => null);

  const restrictions = listItems.map((item, index) => {
    const geoFeature = geoByNotamId.get(item.notam_id);
    const detail = details[index];
    const geometry = geoFeature?.geometry || geometryFromDetail(detail);
    const region = item.facility || geoFeature?.properties?.CNS_LOCATION_ID || detail?.artccCode || "FAA";
    const centerInfo = summaryMap.get(region);
    const properties = geoFeature?.properties || {};
    return {
      id: `tfr:${item.notam_id}`,
      type: "TFR",
      source: "FAA Graphic TFR",
      sourceUrl: `${TFR_WEBTEXT_URL}${encodeURIComponent(item.notam_id)}`,
      officialPageUrl: `https://tfr.faa.gov/tfr3/?page=detail_${item.notam_id.replace("/", "_")}`,
      notamId: item.notam_id,
      notamKey: properties.NOTAM_KEY || detail?.notamKey || null,
      title: properties.TITLE || item.description || detail?.location || item.notam_id,
      category: normalizeTitleCase(item.type || properties.LEGAL || detail?.type || "TFR"),
      legal: properties.LEGAL || item.type || null,
      country: countryFromState(item.state),
      state: item.state || properties.STATE || null,
      region,
      regionName: centerInfo?.icao_name || detail?.artcc || region,
      isNew: item.is_new === "Y",
      modifiedAt: parseFaaCompactDate(item.mod_abs_time || properties.LAST_MODIFICATION_DATETIME),
      issuedAt: detail?.issueDate || null,
      beginsAt: detail?.beginDate || null,
      endsAt: detail?.endDate || null,
      timeLabel: makeTimeLabel(detail, item.description),
      altitude: detail?.altitude || null,
      radiusNm: detail?.radiusNm || null,
      center: detail?.center || centroidFromGeometry(geometry),
      geometry,
      hasGeometry: Boolean(geometry),
      geometrySource: geoFeature ? "FAA GeoServer WFS" : detail?.center && detail?.radiusNm ? "FAA NOTAM center/radius" : "none",
      noShapeList: missingShapeIds.has(item.notam_id),
      affectedArea: detail?.affectedArea || null,
      authority: detail?.authority || null,
      contact: detail?.contact || null,
      rawTextPreview: detail?.plain ? detail.plain.slice(0, 700) : null,
    };
  });

  for (const [notamId, feature] of geoByNotamId) {
    if (restrictions.some((item) => item.notamId === notamId)) continue;
    const props = feature.properties || {};
    restrictions.push({
      id: `tfr:${notamId}`,
      type: "TFR",
      source: "FAA Graphic TFR",
      sourceUrl: `${TFR_WEBTEXT_URL}${encodeURIComponent(notamId)}`,
      officialPageUrl: `https://tfr.faa.gov/tfr3/?page=detail_${notamId.replace("/", "_")}`,
      notamId,
      notamKey: props.NOTAM_KEY || null,
      title: props.TITLE || notamId,
      category: normalizeTitleCase(props.LEGAL || "TFR"),
      legal: props.LEGAL || null,
      country: countryFromState(props.STATE),
      state: props.STATE || null,
      region: props.CNS_LOCATION_ID || "FAA",
      regionName: summaryMap.get(props.CNS_LOCATION_ID)?.icao_name || props.CNS_LOCATION_ID || "FAA",
      isNew: false,
      modifiedAt: parseFaaCompactDate(props.LAST_MODIFICATION_DATETIME),
      issuedAt: null,
      beginsAt: null,
      endsAt: null,
      timeLabel: props.TITLE || null,
      altitude: null,
      radiusNm: null,
      center: centroidFromGeometry(feature.geometry),
      geometry: feature.geometry,
      hasGeometry: true,
      geometrySource: "FAA GeoServer WFS",
      noShapeList: false,
      affectedArea: null,
      authority: null,
      contact: null,
      rawTextPreview: null,
    });
  }

  return {
    restrictions,
    source: {
      status: "ok",
      message: `Loaded ${restrictions.length} active FAA TFR records.`,
      urls: buildSourceDescription().tfr.urls,
      totalListRecords: listItems.length,
      totalGeoFeatures: geojson.features?.length || 0,
      totalNoShapeRecords: Array.isArray(noShape) ? noShape.length : 0,
      detailMode: includeDetails ? "FAA getWebText detail enrichment enabled" : "detail enrichment disabled",
    },
  };
}

async function fetchFaaNotamSearchPayload() {
  const startedAt = Date.now();
  let gateway = null;
  try {
    gateway = await probeFaaNotamGateway({ code: FAA_NOTAM_GROUPS[0]?.codes?.[0] || "KZNY" });
    const firs = await expandFaaNotamFirs(gateway);
    const expectedFirCount = expectedFaaFirCountFromCaches();
    if (expectedFirCount && firs.length < expectedFirCount) {
      const error = new Error(
        `FAA FIR discovery returned only ${firs.length}/${expectedFirCount} known FIR/designators; refusing to publish partial global NOTAM data.`,
      );
      error.partialFaaFetch = true;
      throw error;
    }
    const { results: firResults, transport: transportUsed, diagnostics: transportDiagnostics } = await fetchFaaNotamFirs(
      firs,
      gateway,
    );
    const deduped = new Map();

    for (const firResult of firResults) {
      for (const notam of firResult.notams) {
        const text = notamText(notam);
        const key = `${notam.notamNumber || ""}|${text}`.slice(0, 4000);
        if (!deduped.has(key)) {
          const sourceFir = resolveFaaNotamSourceFir(notam, firResult.memberFirs || [firResult.fir]);
          deduped.set(key, {
            ...notam,
            sourceGroup: sourceFir?.group || firResult.fir.group,
            sourceFir: sourceFir || firResult.fir,
          });
        }
      }
    }

  const restrictions = [...deduped.values()]
    .map((item, index) => buildImportedNotamRestriction(item, index))
    .filter(Boolean);
  const drawableCount = restrictions.filter((item) => item.hasGeometry).length;
  const airspaceRestrictionCount = restrictions.filter((item) => isAirspaceRestrictionRestriction(item)).length;
  const nonDrawableReasons = countBy(
    restrictions.filter((item) => !item.hasGeometry),
    (item) => item.geometryReason || "No parsed boundary geometry",
  );
  const loadedCount = firResults.reduce((sum, fir) => sum + fir.loadedCount, 0);
  const totalAvailable = firResults.reduce((sum, fir) => sum + fir.totalAvailable, 0);
  const capped = FAA_NOTAM_MAX_PER_FIR > 0 && firResults.some((fir) => fir.loadedCount < fir.totalAvailable);
  const failedResults = firResults.filter(faaFirResultNeedsRecovery);
  const failedFirs = failedResults.flatMap((result) => result.memberFirs || result.fir?.memberFirs || [result.fir]);
  const failedFirDetails = failedResults.flatMap((result) =>
    (result.memberFirs || result.fir?.memberFirs || [result.fir]).map((fir) => ({
      code: fir?.code || "unknown",
      query: result.fir?.code || fir?.code || "unknown",
      error: result.error || "FAA pagination did not reach totalNotamCount.",
    })),
  );
  const fullyLoadedFirCodes = new Set(
    firResults
      .filter((result) => !faaFirResultNeedsRecovery(result))
      .flatMap((result) => result.memberFirs || result.fir?.memberFirs || [result.fir])
      .map((fir) => fir?.code)
      .filter(Boolean),
  );
  const highFailureRate = failedFirs.length >= Math.max(8, Math.ceil(firs.length * 0.2));
  if (failedFirs.length > FAA_NOTAM_MAX_FAILED_FIRS || highFailureRate) {
    const sample = failedFirDetails
      .slice(0, 8)
      .map((item) => `${item.code}: ${item.error}`)
      .join(" | ");
    const error = new Error(
      `FAA NOTAM Search returned an incomplete live result: ${failedFirs.length}/${firs.length} FIR queries failed after retry; maximum allowed failed FIRs is ${FAA_NOTAM_MAX_FAILED_FIRS}; keeping the previous complete cache.${sample ? ` Failed sample: ${sample}` : ""}`,
    );
    error.partialFaaFetch = true;
    error.faaFailureDetails = failedFirDetails;
    throw error;
  }
  const sourceGroups = [...new Map(firs.map((fir) => [fir.group.id, fir.group])).values()];
  const elapsedMs = Date.now() - startedAt;

    const workerDescription = transportUsed.includes("browser")
      ? `official browser workers ${FAA_NOTAM_BROWSER_CONCURRENCY}`
      : `direct workers ${FAA_NOTAM_FIR_CONCURRENCY}`;
    return {
      restrictions,
      source: {
        status: "ok",
        fetchedAt: new Date().toISOString(),
        message:
          `FAA NOTAM Search loaded ${restrictions.length} unique NOTAM records from ${firs.length} FIR/designators ` +
          `across FAA-discovered global FIR/ARTCC coverage; ${drawableCount} have parsed boundary geometry` +
          `; completed in ${formatDurationMs(elapsedMs)} with ${transportUsed} transport` +
          `; ${workerDescription}; batch size ${FAA_NOTAM_BATCH_SIZE}; adaptive batch size ${FAA_NOTAM_ADAPTIVE_BATCH_SIZE}; PowerShell workers ${FAA_NOTAM_POWERSHELL_CONCURRENCY}` +
        (transportDiagnostics?.primaryFailedFirs ? `; ${transportDiagnostics.primaryFailedFirs} primary FIR failures entered recovery` : "") +
        (transportDiagnostics?.adaptiveRecoveredFirs ? `; ${transportDiagnostics.adaptiveRecoveredFirs} FIRs recovered by smaller fetch batches` : "") +
        (transportDiagnostics?.powershellRequestedFirs ? `; ${transportDiagnostics.powershellRequestedFirs} FIRs sent to PowerShell recovery` : "") +
        (transportDiagnostics?.recoveredFirs ? `; ${transportDiagnostics.recoveredFirs} FIRs recovered` : "") +
        (capped ? `; capped at ${FAA_NOTAM_MAX_PER_FIR} records per FIR` : "") +
        (failedFirs.length ? `; ${failedFirs.length} FIR queries failed.` : "."),
      urls: buildSourceDescription().faaNotamSearch.urls,
      count: restrictions.length,
      drawableCount,
      loadedCount,
      totalAvailable,
      airspaceRestrictionCount,
      nonDrawableReasons,
      elapsedMs,
      transport: transportUsed,
      transportDiagnostics,
      requestedTransport: FAA_NOTAM_TRANSPORT,
        concurrency: transportUsed.includes("browser") ? FAA_NOTAM_BROWSER_CONCURRENCY : FAA_NOTAM_FIR_CONCURRENCY,
        browserConcurrency: FAA_NOTAM_BROWSER_CONCURRENCY,
      batchSize: FAA_NOTAM_BATCH_SIZE,
      adaptiveBatchSize: FAA_NOTAM_ADAPTIVE_BATCH_SIZE,
      adaptiveConcurrency: FAA_NOTAM_ADAPTIVE_CONCURRENCY,
      powershellConcurrency: FAA_NOTAM_POWERSHELL_CONCURRENCY,
      retryConcurrency: FAA_NOTAM_RETRY_CONCURRENCY,
      retryDelayMs: FAA_NOTAM_RETRY_DELAY_MS,
      powershellStaggerMs: FAA_NOTAM_POWERSHELL_STAGGER_MS,
      maxFailedFirs: FAA_NOTAM_MAX_FAILED_FIRS,
      fetchTimeoutMs: FAA_NOTAM_FETCH_TIMEOUT_MS,
      powershellTimeoutMs: FAA_NOTAM_POWERSHELL_TIMEOUT_MS,
      powershellPageDelayMs: FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS,
      maxPerFir: FAA_NOTAM_MAX_PER_FIR,
      pageDelayMs: FAA_NOTAM_PAGE_DELAY_MS,
      requestIntervalMs: FAA_NOTAM_REQUEST_INTERVAL_MS,
      requestRetryAttempts: FAA_NOTAM_REQUEST_RETRY_ATTEMPTS,
      requestRetryBaseDelayMs: FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS,
      firCount: firs.length,
      completeness: {
        expectedFirCount: expectedFirCount || firs.length,
        requestedFirCount: firs.length,
        fullyLoadedFirCount: fullyLoadedFirCodes.size,
        failedFirCount: failedFirs.length,
        allKnownFirsIncluded: !expectedFirCount || firs.length >= expectedFirCount,
        allFirPagesLoaded: failedFirs.length === 0 && fullyLoadedFirCodes.size === firs.length,
        loadedCount,
        totalAvailable,
      },
      firStats: firResults.flatMap((result) => (result.memberFirs || result.fir?.memberFirs || [result.fir]).map((fir) => ({
        code: fir?.code || "",
        query: result.fir?.code || "",
        loadedCount: Number(result.loadedCount || 0),
        totalAvailable: Number(result.totalAvailable || 0),
        pagesFetched: Number(result.pagesFetched || 0),
        error: result.error || "",
      }))),
      batchStats: firResults.map((result) => ({
        query: result.fir?.code || "",
        firCount: (result.memberFirs || result.fir?.memberFirs || [result.fir]).length,
        loadedCount: Number(result.loadedCount || 0),
        totalAvailable: Number(result.totalAvailable || 0),
        pagesFetched: Number(result.pagesFetched || 0),
        error: result.error || "",
      })),
      discovery: {
        enabled: FAA_NOTAM_DISCOVER_GLOBAL_FIRS,
        concurrency: FAA_NOTAM_DISCOVERY_CONCURRENCY,
        terms: FAA_NOTAM_DISCOVERY_TERMS,
        discoveredCount: firs.filter((fir) => fir.discovered).length,
        cachedCount: firs.filter((fir) => fir.cachedDiscovery).length,
      },
      failedFirs: failedResults.flatMap((result) => (result.memberFirs || result.fir?.memberFirs || [result.fir]).map((fir) => ({
        code: fir.code,
        group: fir.group.label,
        error: result.error,
      }))),
      groups: sourceGroups.map((group) => {
        const groupResults = firResults.filter((result) => result.fir.group.id === group.id);
        return {
          id: group.id,
          label: group.label,
          codes: group.codes || groupResults.map((result) => result.fir.code),
          loadedCount: groupResults.reduce((sum, result) => sum + result.loadedCount, 0),
          totalAvailable: groupResults.reduce((sum, result) => sum + result.totalAvailable, 0),
        };
      }),
      },
    };
  } finally {
    await gateway?.browserSession?.close();
  }
}

async function probeFaaNotamGateway(fir) {
  if (!fir?.code) throw new Error("FAA NOTAM refresh has no FIR/designator available for its gateway check.");
  const params = buildFaaNotamSearchParams(fir, 0);
  const errors = [];
  if (FAA_NOTAM_TRANSPORT === "auto" || FAA_NOTAM_TRANSPORT === "fetch") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(FAA_NOTAM_FETCH_TIMEOUT_MS, 15000));
    try {
      const response = await fetch(FAA_NOTAM_SEARCH_ENDPOINT, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
          accept: "application/json, text/plain, */*",
          cookie: "fnsDisclaimer=agreed",
          origin: "https://notams.aim.faa.gov",
          referer: "https://notams.aim.faa.gov/notamSearch/nsapp.html",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        },
        body: new URLSearchParams(params),
      });
      const body = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 120)}`);
      if (/^\s*</.test(body) || body.includes("redirectToDisclaimer")) throw new Error("FAA returned an HTML access gate.");
      JSON.parse(body || "{}");
      return { transport: "fetch", browserSession: null };
    } catch (error) {
      errors.push(`direct ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }
  if (FAA_NOTAM_TRANSPORT === "auto" || FAA_NOTAM_TRANSPORT === "browser") {
    let browserSession = null;
    try {
      browserSession = await createFaaNotamBrowserSession();
      await browserSession.fetchForm(params);
      return { transport: "browser", browserSession };
    } catch (error) {
      await browserSession?.close();
      errors.push(`browser ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if ((FAA_NOTAM_TRANSPORT === "auto" || FAA_NOTAM_TRANSPORT === "powershell") && process.platform === "win32") {
    try {
      await fetchFaaNotamFormViaPowerShell(FAA_NOTAM_SEARCH_ENDPOINT, params);
      return { transport: "powershell", browserSession: null };
    } catch (error) {
      errors.push(`Windows ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(
    `FAA NOTAM official gateway is currently refusing every configured transport; the full refresh was stopped before any partial data could be published. ${errors.join(" | ")}`,
  );
}

async function fetchFaaNotamFirs(firs, gateway = null) {
  const preferredTransport = gateway?.transport || FAA_NOTAM_TRANSPORT;
  if (preferredTransport === "browser") {
    return fetchFaaNotamFirsViaBrowser(firs, gateway.browserSession);
  }
  if (preferredTransport === "powershell") {
    return {
      results: await fetchFaaNotamFirsViaPowerShell(firs),
      transport: "powershell",
      diagnostics: { primary: "powershell", primaryFailedFirs: 0, recoveredFirs: 0, recoveryFailedFirs: 0 },
    };
  }

  try {
    let results = await fetchFaaNotamFirsViaFetch(firs);
    const failedPrimary = results.filter(faaFirResultNeedsRecovery);
    if (!failedPrimary.length || FAA_NOTAM_TRANSPORT === "fetch") {
      const primaryFailedFirs = failedPrimary.reduce(
        (sum, result) => sum + (result.memberFirs || result.fir?.memberFirs || [result.fir]).length,
        0,
      );
      return {
        results,
        transport: "fetch",
        diagnostics: {
          primary: "fetch",
          primaryFailedFirs,
          recoveredFirs: 0,
          recoveryFailedFirs: primaryFailedFirs,
        },
      };
    }

    const failedPrimaryFirs = uniqueFaaFirs(
      failedPrimary.flatMap((result) => result.memberFirs || result.fir?.memberFirs || [result.fir]),
    );
    let adaptiveError = "";
    try {
      const adaptiveResults = await fetchFaaNotamFirsViaFetch(failedPrimaryFirs, {
        batchSize: FAA_NOTAM_ADAPTIVE_BATCH_SIZE,
        concurrency: FAA_NOTAM_ADAPTIVE_CONCURRENCY,
        retryConcurrency: Math.min(FAA_NOTAM_RETRY_CONCURRENCY, FAA_NOTAM_ADAPTIVE_CONCURRENCY),
      });
      results = mergeFaaBatchRecoveryResults(results, adaptiveResults);
    } catch (error) {
      adaptiveError = error instanceof Error ? error.message : String(error);
    }

    const failedAfterAdaptiveFirs = uniqueFaaFirs(
      results
        .filter(faaFirResultNeedsRecovery)
        .flatMap((result) => result.memberFirs || result.fir?.memberFirs || [result.fir]),
    );
    const adaptiveRecoveredFirs = Math.max(0, failedPrimaryFirs.length - failedAfterAdaptiveFirs.length);
    if (!failedAfterAdaptiveFirs.length) {
      return {
        results,
        transport: "fetch+adaptive-recovery",
        diagnostics: {
          primary: "fetch",
          primaryFailedFirs: failedPrimaryFirs.length,
          adaptiveRecoveredFirs,
          powershellRequestedFirs: 0,
          recoveredFirs: failedPrimaryFirs.length,
          recoveryFailedFirs: 0,
          adaptiveError,
        },
      };
    }

    const recoveryResults = await recoverFaaNotamFirs(failedAfterAdaptiveFirs);
    results = mergeFaaBatchRecoveryResults(results, recoveryResults);
    const recoveryFailedFirs = countFaaResultFirs(results.filter(faaFirResultNeedsRecovery));
    return {
      results,
      transport: process.platform === "win32" ? "fetch+adaptive+powerShell-recovery" : "fetch+adaptive+single-recovery",
      diagnostics: {
        primary: "fetch",
        primaryFailedFirs: failedPrimaryFirs.length,
        adaptiveRecoveredFirs,
        powershellRequestedFirs: process.platform === "win32" ? failedAfterAdaptiveFirs.length : 0,
        singleRequestedFirs: process.platform === "win32" ? 0 : failedAfterAdaptiveFirs.length,
        recoveredFirs: Math.max(0, failedPrimaryFirs.length - recoveryFailedFirs),
        recoveryFailedFirs,
        adaptiveError,
      },
    };
  } catch (error) {
    if (FAA_NOTAM_TRANSPORT !== "auto") throw error;
    const results = await recoverFaaNotamFirs(firs);
    return {
      results,
      transport: process.platform === "win32" ? "powershell-fallback" : "fetch-single-fallback",
      diagnostics: {
        primary: "fetch",
        primaryFailedFirs: firs.length,
        recoveredFirs: Math.max(0, firs.length - results.filter(faaFirResultNeedsRecovery).length),
        recoveryFailedFirs: results.filter(faaFirResultNeedsRecovery).length,
        primaryError: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function faaFirResultNeedsRecovery(result) {
  if (result?.error) return true;
  if (FAA_NOTAM_MAX_PER_FIR > 0) return false;
  const loaded = Number(result?.loadedCount || 0);
  const available = Number(result?.totalAvailable || 0);
  return available > loaded;
}

async function fetchFaaNotamFirsViaFetch(firs, options = {}) {
  const batchSize = clampNumber(Number(options.batchSize || FAA_NOTAM_BATCH_SIZE), 1, FAA_NOTAM_BATCH_SIZE);
  const concurrency = clampNumber(Number(options.concurrency || FAA_NOTAM_FIR_CONCURRENCY), 1, FAA_NOTAM_FIR_CONCURRENCY);
  const retryConcurrency = clampNumber(Number(options.retryConcurrency || FAA_NOTAM_RETRY_CONCURRENCY), 1, FAA_NOTAM_RETRY_CONCURRENCY);
  const jar = new Map([["fnsDisclaimer", "agreed"]]);
  // The search endpoint accepts the disclaimer cookie directly. Treating the
  // optional /session bootstrap as mandatory made one transient bootstrap
  // failure downgrade all 329 FIRs to the slow PowerShell fallback.
  const queries = buildFaaNotamQueryBatches(firs, batchSize);
  let results = await mapLimit(queries, concurrency, async (fir) => {
    try {
      return await fetchFaaNotamFir(fir, jar);
    } catch (error) {
      return {
        fir,
        memberFirs: fir.memberFirs || [fir],
        notams: [],
        loadedCount: 0,
        totalAvailable: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
  const retryable = results.filter(isRetryableFaaFirFailure);
  if (retryable.length) {
    if (FAA_NOTAM_RETRY_DELAY_MS > 0) await sleep(FAA_NOTAM_RETRY_DELAY_MS);
    const retryResults = await mapLimit(
      retryable.map((result) => result.fir),
      retryConcurrency,
      async (fir) => {
        try {
          return await fetchFaaNotamFir(fir, jar);
        } catch (error) {
          return {
            fir,
            memberFirs: fir.memberFirs || [fir],
            notams: [],
            loadedCount: 0,
            totalAvailable: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
    results = mergeFaaFirRetryResults(results, retryResults);
  }
  return results;
}

function buildFaaNotamQueryBatches(firs, batchSize = FAA_NOTAM_BATCH_SIZE) {
  const batches = [];
  const size = Math.max(1, Math.min(FAA_NOTAM_BATCH_SIZE, Number(batchSize || FAA_NOTAM_BATCH_SIZE)));
  for (let index = 0; index < firs.length; index += size) {
    const memberFirs = firs.slice(index, index + size);
    batches.push({
      code: memberFirs.map((fir) => fir.code).join(","),
      group: FAA_GLOBAL_FIR_GROUP,
      memberFirs,
    });
  }
  return batches;
}

function uniqueFaaFirs(firs) {
  return [...new Map((firs || []).filter((fir) => fir?.code).map((fir) => [fir.code, fir])).values()];
}

function countFaaResultFirs(results) {
  return uniqueFaaFirs(
    (results || []).flatMap((result) => result.memberFirs || result.fir?.memberFirs || [result.fir]),
  ).length;
}

function mergeFaaBatchRecoveryResults(results, recoveryResults) {
  const successfulPrimary = results.filter((result) => !faaFirResultNeedsRecovery(result));
  return [...successfulPrimary, ...recoveryResults];
}

function resolveFaaNotamSourceFir(notam, memberFirs) {
  const firs = (memberFirs || []).filter((fir) => fir?.code);
  if (!firs.length) return null;
  if (firs.length === 1) return firs[0];
  const text = notamText(notam);
  const candidates = [
    notam?.facilityDesignator,
    notam?.icaoId,
    notam?.location,
    text.match(/\bA\)\s*([A-Z0-9]{2,4})\b/i)?.[1],
  ]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean);
  for (const candidate of candidates) {
    const exact = firs.find((fir) => fir.code === candidate);
    if (exact) return exact;
    const alias = firs.find((fir) => candidate.length === 4 && fir.code.length === 3 && candidate.slice(1) === fir.code);
    if (alias) return alias;
  }
  const facility = candidates[0] || firs[0].code;
  return {
    code: facility,
    group: FAA_GLOBAL_FIR_GROUP,
    name: facility,
    country: countryFromFacility(facility),
    batchedQuery: true,
  };
}

function isRetryableFaaFirFailure(result) {
  return /\b(403|429|503)\b|Access Denied|Too Many Requests|fetch failed|aborted|timeout|pagination incomplete|repeated a page|worker returned no result/i.test(
    String(result?.error || ""),
  );
}

function mergeFaaFirRetryResults(results, retryResults) {
  const byCode = new Map(retryResults.map((result) => [result.fir?.code, result]));
  return results.map((result) => {
    const retry = byCode.get(result.fir?.code);
    return retry && !faaFirResultNeedsRecovery(retry) ? retry : result;
  });
}

async function fetchFaaNotamFirsViaBrowser(firs, browserSession) {
  if (!browserSession) throw new Error("FAA browser transport was selected without an active browser session.");
  const primaryQueries = buildFaaNotamQueryBatches(firs, FAA_NOTAM_BATCH_SIZE);
  let results = await browserSession.fetchQueries(primaryQueries, FAA_NOTAM_BROWSER_CONCURRENCY);
  const failedPrimaryFirs = uniqueFaaFirs(
    results.filter(faaFirResultNeedsRecovery).flatMap((result) => result.memberFirs || [result.fir]),
  );
  let adaptiveRecoveredFirs = 0;
  let singleRecoveredFirs = 0;

  if (failedPrimaryFirs.length) {
    const adaptiveQueries = buildFaaNotamQueryBatches(failedPrimaryFirs, FAA_NOTAM_ADAPTIVE_BATCH_SIZE);
    const adaptiveResults = await browserSession.fetchQueries(
      adaptiveQueries,
      Math.min(FAA_NOTAM_BROWSER_CONCURRENCY, FAA_NOTAM_ADAPTIVE_CONCURRENCY),
    );
    results = mergeFaaBatchRecoveryResults(results, adaptiveResults);
    const failedAfterAdaptive = uniqueFaaFirs(
      results.filter(faaFirResultNeedsRecovery).flatMap((result) => result.memberFirs || [result.fir]),
    );
    adaptiveRecoveredFirs = Math.max(0, failedPrimaryFirs.length - failedAfterAdaptive.length);

    if (failedAfterAdaptive.length) {
      if (FAA_NOTAM_RETRY_DELAY_MS > 0) await sleep(FAA_NOTAM_RETRY_DELAY_MS);
      const singleResults = await browserSession.fetchQueries(
        buildFaaNotamQueryBatches(failedAfterAdaptive, 1),
        Math.min(FAA_NOTAM_BROWSER_CONCURRENCY, FAA_NOTAM_RETRY_CONCURRENCY),
      );
      results = mergeFaaBatchRecoveryResults(results, singleResults);
      const failedAfterSingle = countFaaResultFirs(results.filter(faaFirResultNeedsRecovery));
      singleRecoveredFirs = Math.max(0, failedAfterAdaptive.length - failedAfterSingle);
    }
  }

  const recoveryFailedFirs = countFaaResultFirs(results.filter(faaFirResultNeedsRecovery));
  return {
    results,
    transport: "official-browser-fallback",
    diagnostics: {
      primary: "official FAA browser session",
      primaryFailedFirs: failedPrimaryFirs.length,
      adaptiveRecoveredFirs,
      singleRecoveredFirs,
      recoveredFirs: Math.max(0, failedPrimaryFirs.length - recoveryFailedFirs),
      recoveryFailedFirs,
      browserConcurrency: FAA_NOTAM_BROWSER_CONCURRENCY,
    },
  };
}

async function createFaaNotamBrowserSession() {
  const executablePath = findFaaBrowserExecutable();
  if (!executablePath) {
    throw new Error("Google Chrome or Microsoft Edge is required for the FAA browser transport but neither executable was found.");
  }
  const browser = await chromium.launch({
    executablePath,
    headless: process.platform !== "win32",
    timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS,
    args: [
      ...(process.platform !== "win32" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []),
      "--window-position=-32000,-32000",
      "--window-size=1280,900",
      "--disable-blink-features=AutomationControlled",
      "--disable-background-networking",
      "--disable-extensions",
      "--disable-sync",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const context = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 900 } });
  let page = await context.newPage();
  async function acceptFaaDisclaimer(targetPage) {
    if (!/\/notamSearch\/disclaimer\.html(?:[#?].*)?$/i.test(targetPage.url())) return;
    const acceptButton = targetPage.getByRole("button", { name: /read and understood/i });
    await Promise.all([
      targetPage.waitForURL(/\/notamSearch\/nsapp\.html(?:[#?].*)?$/i, { timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS }),
      acceptButton.click({ timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS }),
    ]);
    await targetPage.waitForLoadState("domcontentloaded", { timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS }).catch(() => {});
  }
  async function navigateToFaaSearchApplication(targetPage) {
    try {
      await targetPage.goto(`${FAA_NOTAM_SEARCH_URL}nsapp.html`, {
        waitUntil: "domcontentloaded",
        timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // FAA intentionally aborts the first navigation and completes the same
      // nsapp load asynchronously. Treat it as success only after the final URL
      // and title prove that the search application is ready.
      if (!/net::ERR_ABORTED/i.test(message)) throw error;
      await targetPage.waitForTimeout(800);
    }
    await acceptFaaDisclaimer(targetPage);
    if (!/\/notamSearch\/nsapp\.html(?:[#?].*)?$/i.test(targetPage.url())) {
      await targetPage.waitForURL(/\/notamSearch\/nsapp\.html(?:[#?].*)?$/i, { timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS });
    }
    if (!/\/notamSearch\/nsapp\.html(?:[#?].*)?$/i.test(targetPage.url())) {
      throw new Error(`FAA search application did not reach nsapp.html (current URL: ${targetPage.url()}).`);
    }
    const title = await targetPage.title();
    if (/Access Denied/i.test(title)) throw new Error("FAA returned an Access Denied page to the browser transport.");
  }
  try {
    const response = await page.goto(`${FAA_NOTAM_SEARCH_URL}disclaimer.html`, {
      waitUntil: "domcontentloaded",
      timeout: FAA_NOTAM_BROWSER_TIMEOUT_MS,
    });
    if (!response?.ok()) {
      throw new Error(`FAA disclaimer returned HTTP ${response?.status() || "unknown"}.`);
    }
    const title = await page.title();
    if (/Access Denied/i.test(title)) throw new Error("FAA returned an Access Denied page to the browser transport.");
    await acceptFaaDisclaimer(page);
    await context.addCookies([
      {
        name: "fnsDisclaimer",
        value: "agreed",
        domain: "notams.aim.faa.gov",
        path: "/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
  } catch (error) {
    await browser.close();
    throw error;
  }

  let closed = false;
  let pageRecovery = null;
  async function recoverStablePage() {
    if (pageRecovery) return pageRecovery;
    pageRecovery = (async () => {
      await page?.close().catch(() => {});
      page = await context.newPage();
      await navigateToFaaSearchApplication(page);
    })().finally(() => {
      pageRecovery = null;
    });
    return pageRecovery;
  }

  async function evaluateOnStableFaaPage(task, args) {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await page.evaluate(task, args);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (!/Execution context was destroyed|navigation|Target page, context or browser has been closed/i.test(message) || attempt >= 3) throw error;
        await recoverStablePage();
      }
    }
    throw lastError || new Error("FAA browser worker could not obtain a stable page context.");
  }
  return {
    async fetchForm(params) {
      return evaluateOnStableFaaPage(
        async ({ endpoint, params, timeoutMs }) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const response = await fetch(endpoint, {
              method: "POST",
              signal: controller.signal,
              headers: {
                accept: "application/json, text/plain, */*",
                "content-type": "application/x-www-form-urlencoded; charset=utf-8",
              },
              body: new URLSearchParams(params),
            });
            const text = await response.text();
            if (!response.ok) throw new Error(`FAA NOTAM Search ${response.status}: ${text.slice(0, 180)}`);
            if (/^\s*</.test(text) || text.includes("redirectToDisclaimer")) {
              throw new Error("FAA NOTAM Search returned an HTML gate instead of NOTAM JSON.");
            }
            return text ? JSON.parse(text) : {};
          } finally {
            clearTimeout(timeout);
          }
        },
        { endpoint: FAA_NOTAM_SEARCH_ENDPOINT, params, timeoutMs: FAA_NOTAM_FETCH_TIMEOUT_MS },
      );
    },
    async fetchLocs(terms) {
      return evaluateOnStableFaaPage(
        async ({ endpoint, terms, concurrency, timeoutMs }) => {
          const results = [];
          let cursor = 0;
          const workers = Array.from({ length: Math.min(concurrency, terms.length) }, async () => {
            while (cursor < terms.length) {
              const index = cursor++;
              const term = terms[index];
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), timeoutMs);
              try {
                const response = await fetch(`${endpoint}?search=${encodeURIComponent(term)}`, {
                  signal: controller.signal,
                  headers: { accept: "application/json, text/plain, */*" },
                });
                if (!response.ok) continue;
                const payload = await response.json();
                if (Array.isArray(payload)) results.push(...payload.map((item) => ({ ...item, discoveryTerm: term })));
              } catch {
                // Cached FIR coverage remains available if one discovery term fails.
              } finally {
                clearTimeout(timeout);
              }
            }
          });
          await Promise.all(workers);
          return results;
        },
        {
          endpoint: FAA_NOTAM_LOCS_ENDPOINT,
          terms,
          concurrency: FAA_NOTAM_DISCOVERY_CONCURRENCY,
          timeoutMs: FAA_NOTAM_FETCH_TIMEOUT_MS,
        },
      );
    },
    async fetchQueries(queries, concurrency) {
      const plainQueries = queries.map((query) => ({ code: query.code }));
      const rawResults = await evaluateOnStableFaaPage(
        async ({ endpoint, queries, config }) => {
          const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const results = new Array(queries.length);
          let cursor = 0;
          let nextRequestAt = Date.now();

          async function pacedPost(params) {
            let lastError = null;
            for (let attempt = 1; attempt <= config.attempts; attempt += 1) {
              const now = Date.now();
              const scheduledAt = Math.max(now, nextRequestAt);
              nextRequestAt = scheduledAt + config.requestIntervalMs;
              if (scheduledAt > now) await delay(scheduledAt - now);
              const controller = new AbortController();
              const timeout = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
              try {
                const response = await fetch(endpoint, {
                  method: "POST",
                  signal: controller.signal,
                  headers: {
                    accept: "application/json, text/plain, */*",
                    "content-type": "application/x-www-form-urlencoded; charset=utf-8",
                  },
                  body: new URLSearchParams(params),
                });
                const text = await response.text();
                if (!response.ok) throw new Error(`FAA NOTAM Search ${response.status}: ${text.slice(0, 180)}`);
                if (/^\s*</.test(text) || text.includes("redirectToDisclaimer")) {
                  throw new Error("FAA NOTAM Search returned an HTML gate instead of NOTAM JSON.");
                }
                return text ? JSON.parse(text) : {};
              } catch (error) {
                lastError = error;
                if (attempt >= config.attempts) break;
                await delay(config.retryBaseDelayMs * attempt);
              } finally {
                clearTimeout(timeout);
              }
            }
            throw lastError || new Error("FAA NOTAM browser request failed.");
          }

          async function fetchQuery(query) {
            const notams = [];
            const pageSignatures = new Set();
            let totalAvailable = 0;
            let offset = 0;
            let pagesFetched = 0;
            while (!config.maxPerFir || offset < config.maxPerFir) {
              const params = {
                ...config.baseParams,
                designatorsForLocation: query.code,
                offset: String(offset),
                notamsOnly: offset > 0 ? "true" : "false",
              };
              const payload = await pacedPost(params);
              const page = Array.isArray(payload?.notamList) ? payload.notamList : Array.isArray(payload) ? payload : [];
              pagesFetched += 1;
              totalAvailable = Number(payload?.totalNotamCount || totalAvailable || page.length);
              if (!page.length) break;
              const signature = page
                .map((item) => item?.transactionID || item?.notamNumber || String(item?.icaoMessage || item?.text || "").slice(0, 80))
                .join("|");
              if (pageSignatures.has(signature)) {
                throw new Error(`FAA NOTAM pagination repeated a page for ${query.code} at offset ${offset}.`);
              }
              pageSignatures.add(signature);
              notams.push(...page);
              offset += page.length;
              if (notams.length >= totalAvailable || page.length < config.pageSize) break;
            }
            const max = config.maxPerFir || notams.length;
            if (!config.maxPerFir && totalAvailable > notams.length) {
              throw new Error(`FAA NOTAM pagination incomplete for ${query.code}: loaded ${notams.length}/${totalAvailable}.`);
            }
            return {
              code: query.code,
              notams: notams.slice(0, max),
              loadedCount: Math.min(notams.length, max),
              totalAvailable,
              pagesFetched,
              error: "",
            };
          }

          const workers = Array.from({ length: Math.min(config.concurrency, queries.length) }, async () => {
            while (cursor < queries.length) {
              const index = cursor++;
              try {
                results[index] = await fetchQuery(queries[index]);
              } catch (error) {
                results[index] = {
                  code: queries[index].code,
                  notams: [],
                  loadedCount: 0,
                  totalAvailable: 0,
                  pagesFetched: 0,
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            }
          });
          await Promise.all(workers);
          return results;
        },
        {
          endpoint: FAA_NOTAM_SEARCH_ENDPOINT,
          queries: plainQueries,
          config: {
            concurrency: Math.max(1, Math.min(FAA_NOTAM_BROWSER_CONCURRENCY, Number(concurrency) || 1)),
            pageSize: FAA_NOTAM_PAGE_SIZE,
            maxPerFir: FAA_NOTAM_MAX_PER_FIR,
            requestIntervalMs: FAA_NOTAM_REQUEST_INTERVAL_MS,
            attempts: FAA_NOTAM_REQUEST_RETRY_ATTEMPTS,
            retryBaseDelayMs: FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS,
            fetchTimeoutMs: FAA_NOTAM_FETCH_TIMEOUT_MS,
            baseParams: buildFaaNotamSearchParams({ code: "" }, 0),
          },
        },
      );
      const queryByCode = new Map(queries.map((query) => [query.code, query]));
      return rawResults.map((result) => {
        const query = queryByCode.get(result.code);
        return {
          ...result,
          fir: query,
          memberFirs: query?.memberFirs || [query],
          notams: Array.isArray(result.notams) ? result.notams : [],
        };
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      await browser.close().catch(() => {});
    },
  };
}

function findFaaBrowserExecutable() {
  const configured = String(process.env.FAA_NOTAM_BROWSER_EXECUTABLE || "").trim();
  const candidates = [
    configured,
    process.env.PROGRAMFILES ? join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env["PROGRAMFILES(X86)"]
      ? join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      : "",
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

async function recoverFaaNotamFirs(firs, osPlatform = process.platform) {
  if (osPlatform === "win32") return fetchFaaNotamFirsViaPowerShell(firs);
  return fetchFaaNotamFirsViaFetch(firs, { batchSize: 1, concurrency: 2, retryConcurrency: 1 });
}

async function fetchFaaNotamFirsViaPowerShell(firs) {
  if (process.platform !== "win32") throw new Error("FAA PowerShell transport is only available on Windows; use auto, fetch or browser.");
  if (!firs.length) return [];
  const workerCount = Math.min(FAA_NOTAM_POWERSHELL_CONCURRENCY, firs.length);
  const batches = splitRoundRobin(firs, workerCount);
  const batchResults = await mapLimit(batches, workerCount, async (batch, index) => {
    if (FAA_NOTAM_POWERSHELL_STAGGER_MS > 0) await sleep(index * FAA_NOTAM_POWERSHELL_STAGGER_MS);
    return runFaaNotamPowerShellBatch(batch);
  });
  let results = orderFaaFirResults(firs, batchResults.flat());
  const retryable = results.filter(isRetryableFaaFirFailure);
  if (retryable.length) {
    if (FAA_NOTAM_RETRY_DELAY_MS > 0) await sleep(FAA_NOTAM_RETRY_DELAY_MS);
    const retryFirs = retryable.map((result) => result.fir);
    const retryWorkerCount = Math.min(FAA_NOTAM_RETRY_CONCURRENCY, retryFirs.length);
    const retryBatches = splitRoundRobin(retryFirs, retryWorkerCount);
    const retryResults = await mapLimit(retryBatches, retryWorkerCount, async (batch, index) => {
      if (FAA_NOTAM_POWERSHELL_STAGGER_MS > 0) await sleep(index * FAA_NOTAM_POWERSHELL_STAGGER_MS);
      return runFaaNotamPowerShellBatch(batch);
    });
    results = orderFaaFirResults(firs, mergeFaaFirRetryResults(results, retryResults.flat()));
  }
  return results;
}

async function runFaaNotamPowerShellBatch(firs) {
  if (!firs.length) return [];
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$firsJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:FAA_NOTAM_FIRS_B64))
$firs = ConvertFrom-Json $firsJson
$maxPerFir = [int]$env:FAA_NOTAM_MAX_PER_FIR
$pageDelayMs = [int]$env:FAA_NOTAM_PAGE_DELAY_MS
$pageSize = 30
$maxAttempts = 3
$endpoint = '${FAA_NOTAM_SEARCH_ENDPOINT}'
$results = New-Object System.Collections.Generic.List[object]
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
$session.Cookies.Add((New-Object System.Net.Cookie('fnsDisclaimer','agreed','/','notams.aim.faa.gov')))
$headers = @{
  Accept = 'application/json, text/plain, */*'
  Origin = 'https://notams.aim.faa.gov'
  Referer = 'https://notams.aim.faa.gov/notamSearch/nsapp.html'
}

function Expand-JsonRows($value) {
  if ($null -eq $value) { return @() }
  if ($value -is [System.Array]) { return @($value) }
  $properties = @($value.PSObject.Properties)
  $arrayProperties = @($properties | Where-Object { $_.Value -is [System.Array] })
  if ($arrayProperties.Count -gt 0 -and $arrayProperties[0].Value.Count -gt 1) {
    $rows = New-Object System.Collections.Generic.List[object]
    $count = $arrayProperties[0].Value.Count
    for ($i = 0; $i -lt $count; $i++) {
      $row = [ordered]@{}
      foreach ($property in $properties) {
        $propertyValue = $property.Value
        if ($propertyValue -is [System.Array]) {
          $row[$property.Name] = $(if ($i -lt $propertyValue.Count) { $propertyValue[$i] } else { $null })
        } else {
          $row[$property.Name] = $propertyValue
        }
      }
      $rows.Add([pscustomobject]$row)
    }
    return @($rows.ToArray())
  }
  return @($value)
}

foreach ($fir in $firs) {
  $notams = New-Object System.Collections.Generic.List[object]
  $offset = 0
  $totalAvailable = 0
  $pagesFetched = 0
  $errorText = $null
  try {
    while (($maxPerFir -le 0) -or ($offset -lt $maxPerFir)) {
      $body = @{
        searchType = '0'
        designatorsForLocation = [string]$fir.code
        designatorForAccountable = ''
        latDegrees = ''
        latMinutes = '0'
        latSeconds = '0'
        longDegrees = ''
        longMinutes = '0'
        longSeconds = '0'
        radius = '10'
        sortColumns = '4 false'
        sortDirection = 'true'
        designatorForNotamNumberSearch = ''
        notamNumber = ''
        radiusSearchOnDesignator = 'false'
        radiusSearchDesignator = ''
        latitudeDirection = 'N'
        longitudeDirection = 'E'
        freeFormText = ''
        flightPathText = ''
        flightPathDivertAirfields = ''
        flightPathBuffer = '4'
        flightPathIncludeNavaids = 'true'
        flightPathIncludeArtcc = 'false'
        flightPathIncludeTfr = 'false'
        flightPathIncludeRegulatory = 'false'
        flightPathResultsType = 'All NOTAMs'
        archiveDate = ''
        archiveDesignator = ''
        offset = [string]$offset
        notamsOnly = $(if ($offset -gt 0) { 'true' } else { 'false' })
        filters = ''
        minRunwayLength = ''
        minRunwayWidth = ''
        runwaySurfaceTypes = ''
        predefinedAbraka = ''
        predefinedDabra = ''
        flightPathAddlBuffer = ''
        recaptchaToken = ''
      }
      $response = $null
      for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
          $response = Invoke-WebRequest -UseBasicParsing -WebSession $session -Method Post -Uri $endpoint -Headers $headers -Body $body -ContentType 'application/x-www-form-urlencoded; charset=utf-8' -TimeoutSec 45
          break
        } catch {
          if ($attempt -ge $maxAttempts) { throw }
          Start-Sleep -Milliseconds (2500 * $attempt)
        }
      }
      $payload = $response.Content | ConvertFrom-Json
      $pagesFetched += 1
      if ($payload -is [array]) {
        $page = @(Expand-JsonRows $payload)
      } else {
        $page = @(Expand-JsonRows $payload.notamList)
        if ($null -ne $payload.totalNotamCount) { $totalAvailable = [int]$payload.totalNotamCount }
      }
      if ($page.Count -eq 0) { break }
      foreach ($item in $page) { $notams.Add($item) }
      $offset += $page.Count
      if ($offset -ge $totalAvailable) { break }
      if ($page.Count -lt $pageSize) { break }
      if (($maxPerFir -gt 0) -and ($offset -ge $maxPerFir)) { break }
      if ($pageDelayMs -gt 0) { Start-Sleep -Milliseconds $pageDelayMs }
    }
  } catch {
    $errorText = $_.Exception.Message
  }
  $loaded = $notams.Count
  if (($maxPerFir -gt 0) -and ($loaded -gt $maxPerFir)) { $loaded = $maxPerFir }
  if (($maxPerFir -le 0) -and ($totalAvailable -gt $loaded) -and [string]::IsNullOrWhiteSpace($errorText)) {
    $errorText = "FAA NOTAM pagination incomplete for $($fir.code): loaded $loaded/$totalAvailable."
  }
  $results.Add([pscustomobject]@{
    fir = $fir
    notams = @($notams | Select-Object -First $(if ($maxPerFir -gt 0) { $maxPerFir } else { $notams.Count }))
    loadedCount = $loaded
    totalAvailable = $totalAvailable
    pagesFetched = $pagesFetched
    error = $errorText
  })
}

$results | ConvertTo-Json -Depth 50 -Compress
`;
  const encoded = Buffer.from(JSON.stringify(firs), "utf8").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: FAA_NOTAM_POWERSHELL_TIMEOUT_MS,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      FAA_NOTAM_FIRS_B64: encoded,
      FAA_NOTAM_MAX_PER_FIR: String(FAA_NOTAM_MAX_PER_FIR),
      FAA_NOTAM_PAGE_DELAY_MS: String(FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS),
    },
  });
  const parsed = stdout.trim() ? JSON.parse(stdout.trim()) : [];
  return (Array.isArray(parsed) ? parsed : [parsed]).map((result) => ({
    ...result,
    notams: Array.isArray(result.notams) ? result.notams : result.notams ? [result.notams] : [],
  }));
}

function splitRoundRobin(items, workerCount) {
  const count = Math.max(1, Math.min(workerCount, items.length || 1));
  const batches = Array.from({ length: count }, () => []);
  items.forEach((item, index) => {
    batches[index % count].push(item);
  });
  return batches.filter((batch) => batch.length);
}

function orderFaaFirResults(firs, results) {
  const byCode = new Map(results.map((result) => [result.fir?.code, result]));
  return firs.map((fir) => {
    const result = byCode.get(fir.code);
    return result
      ? {
          ...result,
          fir,
          notams: Array.isArray(result.notams) ? result.notams : result.notams ? [result.notams] : [],
        }
      : {
          fir,
          notams: [],
          loadedCount: 0,
          totalAvailable: 0,
          error: "FAA NOTAM worker returned no result for this FIR.",
        };
  });
}

async function expandFaaNotamFirs(gateway = null) {
  const seen = new Map();
  for (const group of FAA_NOTAM_GROUPS) {
    for (const code of group.codes) {
      const normalized = String(code).trim().toUpperCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.set(normalized, { code: normalized, group });
    }
  }
  const seededCount = seen.size;
  const cachedFirs = readFaaFirDesignatorCache();
  if (FAA_NOTAM_DISCOVER_GLOBAL_FIRS) {
    const discovered = await discoverFaaFirDesignators(gateway);
    for (const fir of discovered) {
      if (!fir.code || seen.has(fir.code)) continue;
      seen.set(fir.code, fir);
    }
  }
  if (cachedFirs.length && seen.size < cachedFirs.length) {
    for (const fir of cachedFirs) {
      if (!fir.code || seen.has(fir.code)) continue;
      seen.set(fir.code, {
        ...fir,
        cachedDiscovery: true,
        group: fir.group || FAA_GLOBAL_FIR_GROUP,
      });
    }
  }
  const output = [...seen.values()];
  const missingRequiredFirs = FAA_NOTAM_REQUIRED_FIRS.filter((code) => !seen.has(code));
  if (missingRequiredFirs.length) {
    throw new Error(`FAA NOTAM FIR coverage is missing required seeded FIRs: ${missingRequiredFirs.join(", ")}`);
  }
  if (!cachedFirs.length || output.length >= Math.max(cachedFirs.length, seededCount)) {
    writeFaaFirDesignatorCache(output);
  }
  return output;
}

function readFaaFirDesignatorCache() {
  try {
    if (!existsSync(FAA_NOTAM_FIR_CACHE_FILE)) return [];
    const cached = JSON.parse(readFileSync(FAA_NOTAM_FIR_CACHE_FILE, "utf8"));
    const firs = Array.isArray(cached?.firs) ? cached.firs : [];
    return firs
      .map((fir) => ({
        ...fir,
        code: String(fir?.code || "").trim().toUpperCase(),
        group: fir?.group || FAA_GLOBAL_FIR_GROUP,
      }))
      .filter((fir) => /^[A-Z0-9]{2,4}$/.test(fir.code));
  } catch {
    return [];
  }
}

function writeFaaFirDesignatorCache(firs) {
  try {
    const deduped = [];
    const seen = new Set();
    for (const fir of firs) {
      const code = String(fir?.code || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{2,4}$/.test(code) || seen.has(code)) continue;
      seen.add(code);
      deduped.push({
        code,
        group: fir.group
          ? {
              id: fir.group.id,
              label: fir.group.label,
              codes: Array.isArray(fir.group.codes) ? fir.group.codes : undefined,
            }
          : FAA_GLOBAL_FIR_GROUP,
        discovered: Boolean(fir.discovered),
        cachedDiscovery: Boolean(fir.cachedDiscovery),
        name: fir.name || null,
        country: fir.country || null,
      });
    }
    if (!deduped.length) return;
    mkdirSync(dataDirectory, { recursive: true });
    writeFileSync(
      FAA_NOTAM_FIR_CACHE_FILE,
      JSON.stringify(
        {
          savedAt: new Date().toISOString(),
          count: deduped.length,
          firs: deduped,
        },
        null,
        2,
      ),
      "utf8",
    );
  } catch {
    // FIR discovery cache is a resilience layer only.
  }
}

function expectedFaaFirCountFromCaches() {
  const firCacheCount = readFaaFirDesignatorCache().length;
  if (firCacheCount) return firCacheCount;
  try {
    if (!existsSync(AGGREGATE_CACHE_FILE)) return 0;
    const cached = JSON.parse(readFileSync(AGGREGATE_CACHE_FILE, "utf8"));
    return Number(cached?.data?.sources?.faaNotamSearch?.firCount || 0);
  } catch {
    return 0;
  }
}

async function discoverFaaFirDesignators(gateway = null) {
  try {
    const entries = await fetchFaaLocs(FAA_NOTAM_DISCOVERY_TERMS, gateway);
    const output = [];
    for (const entry of entries) {
      if (!isFaaFirLocEntry(entry)) continue;
      const code = normalizeFaaLocCode(entry);
      if (!code) continue;
      output.push({
        code,
        group: FAA_GLOBAL_FIR_GROUP,
        discovered: true,
        name: entry.airportName || entry.displayText || code,
        country: countryFromFaaCountryCode(entry.country),
      });
    }
    return output;
  } catch {
    return [];
  }
}

async function fetchFaaLocs(terms, gateway = null) {
  if (gateway?.transport === "browser" && gateway.browserSession) return gateway.browserSession.fetchLocs(terms);
  if (FAA_NOTAM_TRANSPORT === "powershell") return fetchFaaLocsViaPowerShell(terms);
  try {
    const entries = await fetchFaaLocsViaFetch(terms);
    if (FAA_NOTAM_TRANSPORT === "auto" && !entries.length && process.platform === "win32") return fetchFaaLocsViaPowerShell(terms);
    return entries;
  } catch (error) {
    if (FAA_NOTAM_TRANSPORT !== "auto" || process.platform !== "win32") throw error;
    return fetchFaaLocsViaPowerShell(terms);
  }
}

function isFaaFirLocEntry(entry) {
  const text = `${entry?.displayText || ""} ${entry?.airportName || ""}`;
  if (/\((?:AIRPORT|HELIPORT|TRACON)\)/i.test(text)) return false;
  const facilityType = String(entry?.facilityType || entry?.locationType || entry?.type || "");
  const hasFirLanguage = /\b(FIR|ARTCC|ACC|CENTRE|CENTER|OCEANIC|OCA\/FIR|CERAP)\b/i.test(`${text} ${facilityType}`);
  return hasFirLanguage && (/\(ARTCC\)/i.test(text) || /\b(FIR|ARTCC|ACC|OCEANIC|CERAP)\b/i.test(facilityType) || /\bFIR\b/i.test(text));
}

function normalizeFaaLocCode(entry) {
  const preferred = String(entry?.designatorIcao || entry?.designator || "").trim().toUpperCase();
  if (/^[A-Z0-9]{2,4}$/.test(preferred)) return preferred;
  const fallback = String(entry?.designator || "").trim().toUpperCase();
  return /^[A-Z0-9]{2,4}$/.test(fallback) ? fallback : null;
}

async function fetchFaaLocsViaFetch(terms) {
  const groups = await mapLimit(terms, FAA_NOTAM_DISCOVERY_CONCURRENCY, async (term) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FAA_NOTAM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${FAA_NOTAM_LOCS_ENDPOINT}?search=${encodeURIComponent(term)}`, {
        signal: controller.signal,
        headers: {
          accept: "application/json, text/plain, */*",
          "user-agent": "Mozilla/5.0 FAA-NOTAM-map/1.0",
          cookie: "fnsDisclaimer=agreed",
        },
      });
      if (!response.ok) throw new Error(`FAA FIR discovery ${term} returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error(`FAA FIR discovery ${term} returned an unexpected payload.`);
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  });
  return groups.flat();
}

async function fetchFaaLocsViaPowerShell(terms) {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$termsJson = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:FAA_NOTAM_DISCOVERY_TERMS_B64))
$terms = ConvertFrom-Json $termsJson
$locsEndpoint = '${FAA_NOTAM_LOCS_ENDPOINT}'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.Cookies.Add((New-Object System.Net.Cookie('fnsDisclaimer','agreed','/','notams.aim.faa.gov')))
$results = New-Object System.Collections.Generic.List[object]

function Expand-JsonRows($value) {
  if ($null -eq $value) { return @() }
  if ($value -is [System.Array]) { return @($value) }
  $properties = @($value.PSObject.Properties)
  $arrayProperties = @($properties | Where-Object { $_.Value -is [System.Array] })
  if ($arrayProperties.Count -gt 0 -and $arrayProperties[0].Value.Count -gt 1) {
    $rows = New-Object System.Collections.Generic.List[object]
    $count = $arrayProperties[0].Value.Count
    for ($i = 0; $i -lt $count; $i++) {
      $row = [ordered]@{}
      foreach ($property in $properties) {
        $propertyValue = $property.Value
        if ($propertyValue -is [System.Array]) {
          $row[$property.Name] = $(if ($i -lt $propertyValue.Count) { $propertyValue[$i] } else { $null })
        } else {
          $row[$property.Name] = $propertyValue
        }
      }
      $rows.Add([pscustomobject]$row)
    }
    return @($rows.ToArray())
  }
  return @($value)
}

foreach ($term in $terms) {
  try {
    $uri = $locsEndpoint + '?search=' + [System.Uri]::EscapeDataString([string]$term)
    $response = Invoke-WebRequest -UseBasicParsing -WebSession $session -Uri $uri -TimeoutSec 30
    $payload = $response.Content | ConvertFrom-Json
    foreach ($item in @(Expand-JsonRows $payload)) {
      $item | Add-Member -NotePropertyName discoveryTerm -NotePropertyValue ([string]$term) -Force
      $results.Add($item)
    }
  } catch {}
}
$results | ConvertTo-Json -Depth 20 -Compress
`;
  const encoded = Buffer.from(JSON.stringify(terms), "utf8").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: 90 * 1000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      FAA_NOTAM_DISCOVERY_TERMS_B64: encoded,
    },
  });
  const parsed = stdout.trim() ? JSON.parse(stdout.trim()) : [];
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function fetchFaaNotamFir(fir, jar) {
  const notams = [];
  const pageSignatures = new Set();
  let totalAvailable = 0;
  let offset = 0;
  let pagesFetched = 0;

  while (!FAA_NOTAM_MAX_PER_FIR || offset < FAA_NOTAM_MAX_PER_FIR) {
    const payload = await fetchFaaNotamForm(FAA_NOTAM_SEARCH_ENDPOINT, jar, buildFaaNotamSearchParams(fir, offset));
    const page = Array.isArray(payload?.notamList) ? payload.notamList : Array.isArray(payload) ? payload : [];
    pagesFetched += 1;
    totalAvailable = Number(payload?.totalNotamCount || totalAvailable || page.length);
    if (!page.length) break;

    const pageSignature = page
      .map((item) => item?.transactionID || item?.notamNumber || notamText(item).slice(0, 80))
      .join("|");
    if (pageSignatures.has(pageSignature)) {
      throw new Error(`FAA NOTAM pagination repeated a page for ${fir.code} at offset ${offset}.`);
    }
    pageSignatures.add(pageSignature);

    notams.push(...page);
    offset += page.length;
    if (notams.length >= totalAvailable || page.length < FAA_NOTAM_PAGE_SIZE) break;
    if (FAA_NOTAM_PAGE_DELAY_MS > 0) await sleep(FAA_NOTAM_PAGE_DELAY_MS);
  }

  const max = FAA_NOTAM_MAX_PER_FIR || notams.length;
  if (!FAA_NOTAM_MAX_PER_FIR && totalAvailable > notams.length) {
    throw new Error(`FAA NOTAM pagination incomplete for ${fir.code}: loaded ${notams.length}/${totalAvailable}.`);
  }
  return {
    fir,
    memberFirs: fir.memberFirs || [fir],
    notams: notams.slice(0, max),
    loadedCount: Math.min(notams.length, max),
    totalAvailable,
    pagesFetched,
  };
}

function buildFaaNotamSearchParams(fir, offset) {
  return {
    searchType: "0",
    designatorsForLocation: fir.code,
    designatorForAccountable: "",
    latDegrees: "",
    latMinutes: "0",
    latSeconds: "0",
    longDegrees: "",
    longMinutes: "0",
    longSeconds: "0",
    radius: "10",
    sortColumns: "4 false",
    sortDirection: "true",
    designatorForNotamNumberSearch: "",
    notamNumber: "",
    radiusSearchOnDesignator: "false",
    radiusSearchDesignator: "",
    latitudeDirection: "N",
    longitudeDirection: "E",
    freeFormText: "",
    flightPathText: "",
    flightPathDivertAirfields: "",
    flightPathBuffer: "4",
    flightPathIncludeNavaids: "true",
    flightPathIncludeArtcc: "false",
    flightPathIncludeTfr: "false",
    flightPathIncludeRegulatory: "false",
    flightPathResultsType: "All NOTAMs",
    archiveDate: "",
    archiveDesignator: "",
    offset: String(offset),
    notamsOnly: offset > 0 ? "true" : "false",
    filters: "",
    minRunwayLength: "",
    minRunwayWidth: "",
    runwaySurfaceTypes: "",
    predefinedAbraka: "",
    predefinedDabra: "",
    flightPathAddlBuffer: "",
    recaptchaToken: "",
  };
}

function isAirspaceRestrictionNotam(notam) {
  if (notam?.cancelledOrExpired || String(notam?.status || "").toUpperCase() === "EXPIRED") return false;
  const text = notamText(notam);
  if (!text.trim()) return false;
  if (isExpiredNotam(notam, text)) return false;

  const plain = stripHtml(text).toUpperCase();
  const qCode = qCodeFromText(plain);
  const hasAirspaceQCode = /^Q[RW]/.test(qCode);
  const hasRestrictionWords =
    /\b(AIRSPACE|FIR|AREA|CLSD|CLOSED|CLOSURE|RESTRICT|PROHIBIT|DANGER|TEMPORARY RESERVED|TRA|TSA|FIRING|MISSILE|ROCKET|UAS|UAV|DRONE|UNMANNED|EXER|EXERCISE|WEAPON|GUN|BLAST|AERIAL|PJE|PARACHUTE)\b/.test(
      plain,
    );
  if (!hasAirspaceQCode && !hasRestrictionWords) return false;

  const coordinates = extractCoordinates(plain);
  const hasPolygon = coordinates.length >= 3;
  const hasCorridor = coordinates.length >= 2 && Number.isFinite(parseCorridorWidthNm(plain));
  return hasPolygon || hasCorridor;
}

function isAirspaceRestrictionRestriction(item) {
  const text = [item?.title, item?.category, item?.rawTextPreview].filter(Boolean).join(" ").toUpperCase();
  return item?.hasGeometry && /\b(AIRSPACE|AREA|CLSD|CLOSED|RESTRICT|PROHIBIT|DANGER|TRA|TSA|FIRING|MISSILE|ROCKET|UAS|UAV|DRONE|UNMANNED|EXERCISE|GUN|PJE|PARACHUTE)\b/.test(text);
}

function notamText(notam) {
  return notam?.icaoMessage || notam?.traditionalMessage || notam?.plainLanguageMessage || notam?.text || "";
}

function qCodeFromText(text) {
  const qLine = String(text || "").match(/\bQ\)\s*([^\n]+)/i)?.[1] || "";
  return qLine.split("/")[1]?.trim().toUpperCase() || "";
}

function isExpiredNotam(notam, text) {
  const endFromIcao = parseIcaoDate(String(text || "").match(/\bC\)\s*([0-9]{10})(?:\s*EST)?\b/i)?.[1]);
  const end = endFromIcao || parseFaaSearchDate(notam?.endDate);
  if (!end || /^(PERM|EST)$/i.test(end)) return false;
  const timestamp = Date.parse(end);
  return Number.isFinite(timestamp) && timestamp < Date.now() - 60 * 60 * 1000;
}

async function fetchFaaNotamForm(url, jar, params) {
  if (FAA_NOTAM_TRANSPORT === "powershell") return fetchFaaNotamFormViaPowerShell(url, params);

  let lastError = null;
  for (let attempt = 1; attempt <= FAA_NOTAM_REQUEST_RETRY_ATTEMPTS; attempt += 1) {
    await paceFaaNotamRequest();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FAA_NOTAM_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
          accept: "application/json, text/plain, */*",
          cookie: cookieHeader(jar),
          origin: "https://notams.aim.faa.gov",
          referer: "https://notams.aim.faa.gov/notamSearch/nsapp.html",
          "user-agent": "Mozilla/5.0 FAA-NOTAM-map/1.0",
        },
        body: new URLSearchParams(params),
      });
      mergeSetCookies(jar, response.headers);
      const text = await response.text();
      if (!response.ok) throw new Error(`FAA NOTAM Search ${response.status}: ${text.slice(0, 180)}`);
      if (/^\s*</.test(text) || text.includes("redirectToDisclaimer")) {
        throw new Error("FAA NOTAM Search returned an HTML gate instead of NOTAM JSON.");
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      lastError = error;
      if (attempt >= FAA_NOTAM_REQUEST_RETRY_ATTEMPTS || !isRetryableFaaRequestError(error)) throw error;
      deferFaaNotamRequests(error, attempt);
      await sleep(FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("FAA NOTAM request failed.");
}

function paceFaaNotamRequest() {
  if (FAA_NOTAM_REQUEST_INTERVAL_MS <= 0) return Promise.resolve();
  const now = Date.now();
  const scheduledAt = Math.max(now, faaNotamNextRequestAt);
  faaNotamNextRequestAt = scheduledAt + FAA_NOTAM_REQUEST_INTERVAL_MS;
  return scheduledAt > now ? sleep(scheduledAt - now) : Promise.resolve();
}

function deferFaaNotamRequests(error, attempt) {
  const message = error instanceof Error ? error.message : String(error || "");
  const rateLimited = /\b(?:403|429)\b|Access Denied|Too Many Requests/i.test(message);
  const serviceBusy = /\b(?:500|502|503|504)\b|HTML gate/i.test(message);
  if (!rateLimited && !serviceBusy) return;
  const delayMs = rateLimited
    ? FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS * Math.max(1, attempt)
    : Math.max(1000, FAA_NOTAM_REQUEST_RETRY_BASE_DELAY_MS * Math.max(1, attempt) * 0.5);
  faaNotamNextRequestAt = Math.max(faaNotamNextRequestAt, Date.now() + delayMs);
}

function isRetryableFaaRequestError(error) {
  return /\b(403|429|500|502|503|504)\b|Access Denied|Too Many Requests|fetch failed|aborted|timeout|HTML gate/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

async function fetchFaaNotamFormViaPowerShell(url, params) {
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$uri = $env:FAA_NOTAM_URI
$json = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:FAA_NOTAM_BODY_B64))
$obj = ConvertFrom-Json $json
$body = @{}
foreach ($property in $obj.PSObject.Properties) {
  if ($property.Name) { $body[$property.Name] = [string]$property.Value }
}
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$session.UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
$session.Cookies.Add((New-Object System.Net.Cookie('fnsDisclaimer','agreed','/','notams.aim.faa.gov')))
$headers = @{
  Accept = 'application/json, text/plain, */*'
  Origin = 'https://notams.aim.faa.gov'
  Referer = 'https://notams.aim.faa.gov/notamSearch/nsapp.html'
}
$response = Invoke-WebRequest -UseBasicParsing -WebSession $session -Method Post -Uri $uri -Headers $headers -Body $body -ContentType 'application/x-www-form-urlencoded; charset=utf-8' -TimeoutSec 45
Write-Output $response.Content
`;
  const encoded = Buffer.from(JSON.stringify(params), "utf8").toString("base64");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      timeout: 45000,
      maxBuffer: 12 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        FAA_NOTAM_URI: url,
        FAA_NOTAM_BODY_B64: encoded,
      },
    },
  );
  const text = stdout.trim();
  if (/^\s*</.test(text) || text.includes("redirectToDisclaimer")) {
    throw new Error(`FAA NOTAM Search returned an HTML gate instead of NOTAM JSON: ${text.slice(0, 180)}`);
  }
  return text ? JSON.parse(text) : {};
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampIntegerEnv(name, fallback, min, max) {
  const raw = Number(process.env[name]);
  const value = Number.isFinite(raw) ? Math.round(raw) : fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeFaaNotamTransport(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["auto", "fetch", "powershell", "browser"].includes(normalized) ? normalized : "auto";
}

function formatDurationMs(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function mergeSetCookies(jar, headers) {
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  for (const header of setCookies) {
    for (const chunk of String(header).split(/,(?=[^;,]+=)/)) {
      const [pair] = chunk.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
}

async function fetchTfrDetail(notamId) {
  if (!notamId) return null;
  const cached = detailCache.get(notamId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const payload = await fetchJson(`${TFR_WEBTEXT_URL}${encodeURIComponent(notamId)}`, 12000);
    const html = Array.isArray(payload) ? payload[0]?.text : payload?.text;
    const data = html ? parseTfrDetailHtml(notamId, html) : null;
    detailCache.set(notamId, { expiresAt: Date.now() + DETAIL_CACHE_TTL_MS, data });
    return data;
  } catch {
    detailCache.set(notamId, { expiresAt: Date.now() + 90 * 1000, data: null });
    return null;
  }
}

function parseTfrDetailHtml(notamId, html) {
  const rows = extractHtmlRows(html);
  const plain = stripHtml(html);
  const parsedText = parseNotamText(plain);
  const issueDate = parseFaaHumanDate(firstRowValue(rows, "Issue Date"));
  const beginDate = parseFaaHumanDate(firstRowValue(rows, "Beginning Date and Time"));
  const endDate = parseFaaHumanDate(firstRowValue(rows, "Ending Date and Time"));
  const center = parsedText.coordinates[0] || parseCoordinatePair(plain);
  const radiusNm = parseRadiusNm(firstRowValue(rows, "Radius") || plain);
  const artcc = firstRowValue(rows, "ARTCC");
  return {
    notamId,
    notamKey: firstRowValue(rows, "NOTAM Number") || null,
    plain,
    issueDate,
    beginDate,
    endDate,
    location: firstRowValue(rows, "Location"),
    type: firstRowValue(rows, "Type"),
    affectedArea: firstRowValue(rows, "Airspace Definition"),
    altitude: firstRowValue(rows, "Altitude") || parsedText.altitude || null,
    radiusNm,
    center,
    artcc,
    artccCode: artcc ? artcc.split(/\s+-\s+/)[0].trim() : null,
    authority: firstRowValue(rows, "Authority"),
    contact: firstRowValue(rows, "Point of Contact") || firstRowValue(rows, "Pilots May Contact"),
    parsedText,
  };
}

function loadImportedNotams() {
  const filePath = join(dataDirectory, "imported_notams.json");
  if (!existsSync(filePath)) {
    return {
      restrictions: [],
      source: {
        status: "not_configured",
        message: "No data/imported_notams.json file was found. Drop FAA NOTAM Search exports or raw ICAO NOTAM text there to add global NOTAM overlays.",
        path: filePath,
        count: 0,
      },
    };
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const json = JSON.parse(raw);
    const records = Array.isArray(json) ? json : json.notams || json.records || [];
    const restrictions = records
      .map((item, index) => buildImportedNotamRestriction(item, index))
      .filter(Boolean);
    return {
      restrictions,
      source: {
        status: "ok",
        message: `Loaded ${restrictions.length} imported NOTAM records.`,
        path: filePath,
        count: restrictions.length,
      },
    };
  } catch (error) {
    return {
      restrictions: [],
      source: {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        path: filePath,
        count: 0,
      },
    };
  }
}

function buildImportedNotamRestriction(item, index) {
  const text =
    typeof item === "string"
      ? item
      : item?.text ||
        item?.rawText ||
        item?.icaoMessage ||
        item?.traditionalMessage ||
        item?.plainLanguageMessage ||
        item?.notamText ||
        "";
  if (!text.trim()) return null;
  const parsed = parseNotamText(text);
  const explicitGeometry = typeof item === "object" ? normalizeExplicitGeometry(item.geometry) : null;
  const geometry = explicitGeometry || parsed.geometry;
  const sourceGroup = typeof item === "object" ? item.sourceGroup : null;
  const sourceFir = typeof item === "object" ? item.sourceFir : null;
  const facility = typeof item === "object" ? item.facilityDesignator || item.icaoId || parsed.facility : parsed.facility;
  const notamId = typeof item === "object" ? item.notamNumber || parsed.notamId : parsed.notamId;
  const inferredCountry = countryFromFacility(sourceFir?.code || facility || parsed.facility);
  const country =
    typeof item === "object"
      ? item.country || (inferredCountry !== "Unknown" ? inferredCountry : sourceFir?.country || sourceGroup?.country || inferredCountry)
      : inferredCountry;
  const issuedAt = typeof item === "object" ? parseFaaSearchDate(item.issueDate) : null;
  const beginsAt = parsed.beginAt || (typeof item === "object" ? parseFaaSearchDate(item.startDate) : null);
  const endsAt = parsed.endAt || (typeof item === "object" ? parseFaaSearchDate(item.endDate) : null);
  return {
    id: `notam:${typeof item === "object" ? item.transactionID || "" : ""}:${notamId || index}`,
    type: "NOTAM",
    source:
      typeof item === "object"
        ? sourceGroup
          ? `FAA NOTAM Search live - ${sourceGroup.label}`
          : item.source || "FAA NOTAM Search import"
        : "FAA NOTAM Search import",
    sourceUrl: FAA_NOTAM_SEARCH_URL,
    officialPageUrl: FAA_NOTAM_SEARCH_URL,
    notamId: notamId || null,
    notamKey: notamId || null,
    title: typeof item === "object" ? item.title || item.traditionalMessageFrom4thWord || parsed.summary : parsed.summary,
    category:
      typeof item === "object" ? item.category || item.keyword || item.featureName || parsed.purpose || "NOTAM" : parsed.purpose || "NOTAM",
    legal: null,
    country,
    state: typeof item === "object" ? item.state || null : null,
    region: facility || parsed.facility || "FIR",
    regionName:
      typeof item === "object" ? item.regionName || item.airportName || sourceFir?.code || sourceGroup?.label || facility || "FIR" : parsed.facility || "FIR",
    isNew: isRecentIso(issuedAt, 72),
    modifiedAt: issuedAt,
    issuedAt,
    beginsAt,
    endsAt,
    timeLabel: parsed.timeLabel || makeParsedTimeLabel(beginsAt, endsAt),
    altitude: parsed.altitude || null,
    radiusNm: parsed.radiusNm || null,
    center: parsed.center || centroidFromGeometry(geometry),
    geometry,
    hasGeometry: Boolean(geometry),
    geometrySource: parsed.geometrySource || (explicitGeometry ? "imported GeoJSON" : "none"),
    geometryReason: parsed.geometryReason || (geometry ? "Boundary geometry parsed." : "No parsed boundary geometry."),
    coordinateCount: parsed.coordinateCount || 0,
    boundaryCoordinateCount: parsed.boundaryCoordinateCount || 0,
    polygonGroupCount: parsed.polygonGroupCount || 0,
    rejectedPolygonGroupCount: parsed.rejectedPolygonGroupCount || 0,
    geometryComplete: parsed.geometryComplete,
    polygonGroupValidationReasons: parsed.polygonGroupValidationReasons || [],
    noShapeList: false,
    affectedArea: parsed.summary || null,
    authority: null,
    contact: null,
    rawTextPreview: stripHtml(text).slice(0, 700),
    rawText: stripHtml(text),
  };
}

function parseNotamText(text) {
  const plain = stripHtml(text);
  const marineWarningId = plain
    .match(/\b((?:HYDROPAC|HYDROLANT|HYDROARC|NAVAREA\s+[IVXLCDM]+)\s+\d{1,4}\/\d{2,4}(?:\([A-Z0-9,]+\))?)\b/i)?.[1]
    ?.replace(/\s+/g, " ")
    .toUpperCase();
  const notamId = marineWarningId || plain.match(/\b(?:FDC\s*)?([A-Z]?\d{1,4}\/\d{2,4})\b/i)?.[1]?.toUpperCase() || null;
  const qLine = plain.match(/\bQ\)\s*([^\n]+)/i)?.[1] || "";
  const facility = plain.match(/\bA\)\s*([A-Z]{2,4})\b/i)?.[1] || qLine.split("/")[0] || null;
  const purpose = qLine.split("/")[1] || null;
  const beginAt = parseIcaoDate(plain.match(/\bB\)\s*([0-9]{10})(?:\s*EST)?\b/i)?.[1]);
  const endAt = parseIcaoDate(plain.match(/\bC\)\s*([0-9]{10})(?:\s*EST)?\b/i)?.[1]);
  const lower = plain.match(/\bF\)\s*([^\n]+?)(?=\s+[GQEA-]\)|$)/i)?.[1]?.trim();
  const upper = plain.match(/\bG\)\s*([^\n]+?)(?=\s+[QEA-]\)|$)/i)?.[1]?.trim();
  const altitude = [lower, upper].filter(Boolean).join(" - ") || parseQLineAltitude(qLine) || extractAltitudeFromText(plain);
  const isolatedPlain = marineWarningId ? truncateContaminatedMarineBulletin(plain) : plain;
  const geometryBody = marineWarningId ? isolatedPlain : extractNotamGeometryText(isolatedPlain);
  const normalizedGeometryBody = expandCoordinateRangeBoundaries(normalizeNotamCoordinateText(geometryBody));
  const geometryText = cleanNotamGeometryText(normalizedGeometryBody);
  const sourceCoordinates = uniqueCoordinates(extractCoordinates(geometryText));
  const geometryCoordinateText = removeCircleRadiusCoordinateClauses(geometryText);
  const coordinateGroups = extractCoordinateGroups(geometryCoordinateText);
  const coordinates = coordinateGroups.flat();
  const qCenter = parseQLineCenter(qLine);
  const allCoordinates = uniqueCoordinates(coordinates);
  const radiusNm = parseRadiusNm(geometryText || plain);
  const corridorWidthNm = parseCorridorWidthNm(geometryCoordinateText || geometryText || plain);
  const polygonGroups = coordinateGroups.map(normalizePolygonGroupCoordinates).filter((group) => uniqueCoordinates(group).length >= 3);
  const routeProcedureList = isRouteProcedureCoordinateList(geometryCoordinateText);
  const unsupportedBoundaryInstruction =
    hasUnsupportedBoundaryInstruction(geometryCoordinateText) ||
    hasUnsupportedNaturalBoundaryInstruction(normalizedGeometryBody);
  const centerRadiusList = isCenterRadiusList(geometryText, sourceCoordinates) && !polygonGroups.length;
  const unsupportedLineCorridor = isUnsupportedLineCorridor(geometryCoordinateText, allCoordinates, corridorWidthNm);
  const unsupportedLinePath = isUnsupportedLinePath(geometryCoordinateText, allCoordinates);
  const explicitNonAreaCoordinateList = isExplicitNonAreaCoordinateList(geometryCoordinateText);
  const unresolvedBoundaryWaypoint = hasUnresolvedBoundaryWaypoint(geometryCoordinateText);
  let geometry = null;
  let geometrySource = null;
  let rejectedPolygonGroupCount = 0;
  let polygonGroupValidationReasons = [];
  const sectionResult = hasUnresolvedAirspaceExclusion(normalizedGeometryBody)
    ? { geometry: null, polygons: [], rejected: [{ index: 0, reason: "Boundary excludes named airspace without its coordinates; the full outer area must not be filled." }] }
    : parseIndependentBoundarySections(geometryText, purpose, qCenter);
  geometry = sectionResult.geometry;
  geometrySource = geometry ? describeNotamGeometrySource(sectionResult.polygons, sectionResult.polygons.length > 1 ? "sections" : "sequence") : null;
  rejectedPolygonGroupCount = sectionResult.rejected.length;
  polygonGroupValidationReasons = sectionResult.rejected.map((section) => section.reason);
  let geometryReason = geometry
    ? geometrySource
    : explainMissingGeometry({
        geometryText,
        geometryCoordinateText,
        coordinates: allCoordinates,
        qCenter,
        radiusNm,
        corridorWidthNm,
        routeProcedureList,
        unsupportedBoundaryInstruction,
        centerRadiusList,
        unsupportedLineCorridor,
        unsupportedLinePath,
        explicitNonAreaCoordinateList,
        unresolvedBoundaryWaypoint,
      });
  if (!geometry && rejectedPolygonGroupCount) geometryReason = polygonGroupValidationReasons.join("; ");
  if (geometry && rejectedPolygonGroupCount) geometryReason += `; ${sectionResult.polygons.length} complete boundaries drawn; ${rejectedPolygonGroupCount} sections unresolved: ${polygonGroupValidationReasons.join("; ")}`;
  const validationReason = geometry ? validateParsedGeometry(geometry) : null;
  if (validationReason) {
    geometry = null;
    geometrySource = null;
    geometryReason = validationReason;
  }
  const qLineConsistencyReason = geometry ? validateGeometryAgainstQLine(geometry, qCenter) : null;
  if (qLineConsistencyReason) {
    geometry = null;
    geometrySource = null;
    geometryReason = qLineConsistencyReason;
  }
  const sourceBoundaryCoordinateCount = uniqueCoordinates(polygonGroups.flat()).length;
  const boundaryCoordinateCount = geometry ? geometryUniqueCoordinateCount(geometry) : sourceBoundaryCoordinateCount;

  return {
    notamId,
    facility,
    purpose,
    beginAt,
    endAt,
    timeLabel: makeParsedTimeLabel(beginAt, endAt),
    altitude,
    radiusNm,
    coordinates: sourceCoordinates,
    coordinateCount: sourceCoordinates.length,
    boundaryCoordinateCount,
    sourceBoundaryCoordinateCount,
    polygonGroupCount: sectionResult.polygons.length + rejectedPolygonGroupCount,
    rejectedPolygonGroupCount,
    polygonGroupValidationReasons,
    geometryComplete: Boolean(geometry) && !rejectedPolygonGroupCount,
    center: centroidFromGeometry(geometry) || qCenter?.center || allCoordinates[0] || null,
    geometry,
    geometrySource,
    geometryReason,
    summary: summarizeNotamPlainText(plain),
    plain,
  };
}

function hasUnresolvedAirspaceExclusion(text) {
  const pattern = /\b(?:EXC|EXCEPT(?:ING)?|EXCLUDING)\.?\s+(?:[A-Z][A-Z0-9.'/-]*\s+){0,9}(?:FIR|UIR|TMA|CTR|ATZ|CTA|AIRSPACE)\b/gi;
  return [...String(text).matchAll(pattern)].some((match) => {
    if (/\b(?:ACFT|AIRCRAFT|FLTS?|FLIGHTS?|PERMISSION)\b/i.test(match[0])) return false;
    // An exception to radio-contact instructions does not exclude the airspace.
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    return !/^[^.;]{0,80}\b(?:ARE\s+)?REQUESTED\s+TO\s+CONTACT\b/i.test(after);
  });
}

function parseIndependentBoundarySections(text, purpose = "", qCenter = null) {
  const exclusions = [...text.matchAll(/\b(?:EXCLUDING|EXCEPT(?:ING)?)\s+(?:(?:THE|INNER)\s+)*AREA\b/gi)];
  if (exclusions.length) {
    const parts = [text.slice(0, exclusions[0].index), ...exclusions.map((match, index) =>
      text.slice(match.index + match[0].search(/AREA$/i), exclusions[index + 1]?.index ?? text.length))];
    const results = parts.map((part) => parseIndependentBoundarySections(part, purpose, qCenter));
    if (results.every((result) => result.polygons.length === 1 && !result.rejected.length)) {
      const polygon = { type: "Polygon", coordinates: results.map((result) => result.polygons[0].coordinates[0]) };
      if (!validateParsedGeometry(polygon)) return { geometry: polygon, polygons: [polygon], rejected: [] };
    }
    return { geometry: null, polygons: [], rejected: [{ index: 0, reason: "Area exclusion is not a complete, contained boundary; the excluded area was not filled." }] };
  }
  const polygons = [];
  const rejected = [];
  const generalIntent = hasBoundaryGeometryIntent(text, purpose);
  for (const [index, original] of extractCoordinateSections(text).entries()) {
    const section = original;
    const tokens = extractCoordinateTokens(section);
    const coordinates = extractCoordinates(section);
    if (!tokens.length) continue;
    const corridorWidthNm = parseCorridorWidthNm(section);
    const flags = {
      geometryText: section, geometryCoordinateText: section, coordinates,
      corridorWidthNm,
      routeProcedureList: isRouteProcedureCoordinateList(section) && isRouteProcedureCoordinateList(text),
      unsupportedBoundaryInstruction: hasUnsupportedBoundaryInstruction(section) || hasUnsupportedNaturalBoundaryInstruction(section),
      centerRadiusList: isCenterRadiusList(section, coordinates) || isCircleRadiusCoordinateLine(section) || /\bCIRCLE\s+CENT(?:ER|RE)|\bRDO\s+[\d.]+[^\r\n]*\bCENT(?:ER|RE)/i.test(section) || /\bRADIUS\b/i.test(section) && (section.match(/\(AREA\s+\d+\)/gi) || []).length >= 2 ||
        /\bRADIUS\s+CENT(?:RED|ERED|RE|ER)\s+(?:ON|AT)\s+COORD(?:S|INATES)?\b/i.test(original),
      unsupportedLineCorridor: isUnsupportedLineCorridor(section, coordinates, corridorWidthNm),
      unsupportedLinePath: isUnsupportedLinePath(section, coordinates),
      explicitNonAreaCoordinateList: isExplicitNonAreaCoordinateList(section),
      unresolvedBoundaryWaypoint: hasUnresolvedBoundaryWaypoint(section),
    };
    const blocked = flags.routeProcedureList || flags.unsupportedBoundaryInstruction || flags.centerRadiusList || flags.unsupportedLineCorridor || flags.unsupportedLinePath || flags.explicitNonAreaCoordinateList || flags.unresolvedBoundaryWaypoint;
    if (blocked || !generalIntent && !hasBoundaryGeometryIntent(section, purpose)) {
      if (tokens.length >= 3 || flags.unresolvedBoundaryWaypoint || flags.centerRadiusList || flags.unsupportedBoundaryInstruction) rejected.push({ index, reason: explainMissingGeometry(flags) });
      continue;
    }
    if (hasInvalidBoundaryCoordinate(section)) {
      rejected.push({ index, reason: "Invalid coordinate field in boundary; vertices were not skipped or guessed." });
      continue;
    }
    for (const group of splitCoordinateGroupsAtCompletedBoundaries(section, coordinates)) {
      const boundary = normalizePolygonGroupCoordinates(group);
      if (uniqueCoordinates(boundary).length < 3) continue;
      const polygon = polygonFromCoordinates(boundary);
      const reason = validateParsedGeometry(polygon) || validateGeometryAgainstQLine(polygon, qCenter);
      if (reason) rejected.push({ index, reason });
      else polygons.push(polygon);
    }
  }
  return {
    geometry: polygons.length > 1 ? { type: "MultiPolygon", coordinates: polygons.map((polygon) => polygon.coordinates) } : polygons[0] || null,
    polygons,
    rejected,
  };
}

function hasInvalidBoundaryCoordinate(text) {
  const tokens = extractCoordinateTokens(text);
  if (tokens.some((point) => !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180)) return true;
  // A recognisable half-coordinate must not silently disappear from a ring.
  const halves = /(?<![\d.])\d{4,7}(?:\.\d+)?\s*[NSEW](?![A-Z])|\b(?:[NS]\s*\d{4,6}(?:\.\d+)?|[EW]\s*\d{5,7}(?:\.\d+)?)(?![\d.])|(?<![\d.])\d{1,3}-\d{1,2}(?:\.\d+)?(?:-\d{1,2}(?:\.\d+)?)?\s*[NSEW](?![A-Z])|(?<![\d.])\d{1,3}(?:\.\d+)?[°度][\s\d.′'分″"秒]*[NSEW北南东西](?![A-Z])|(?<![\d.])\d{1,3}\.\d+\s*[NSEW](?![A-Z])/gi;
  return [...String(text).matchAll(halves)]
    .some((match) => !tokens.some((token) => match.index >= token.sourceIndex && match.index + match[0].length <= token.sourceEnd));
}

function explainMissingGeometry({
  geometryText,
  geometryCoordinateText = geometryText,
  coordinates,
  qCenter,
  radiusNm,
  corridorWidthNm,
  routeProcedureList,
  unsupportedBoundaryInstruction,
  centerRadiusList,
  unsupportedLineCorridor,
  unsupportedLinePath,
  explicitNonAreaCoordinateList,
  unresolvedBoundaryWaypoint,
}) {
  const count = coordinates.length;
  if (explicitNonAreaCoordinateList) {
    return "正文明确说明坐标不构成线、多边形或圆，仅作为独立活动点位；未绘制";
  }
  if (unresolvedBoundaryWaypoint) {
    return "边界夹有未提供坐标的命名航路点，不能把剩余坐标误连成不完整多边形";
  }
  if (count === 2 && corridorWidthNm) {
    return "E) body describes a two-point line corridor; not drawn as an inferred polygon.";
  }
  if (count >= 3 && routeProcedureList) {
    return "\u6b63\u6587\u662f\u822a\u8def\u70b9\u3001\u98de\u884c\u8ba1\u5212\u6216 AIP/\u7a0b\u5e8f\u5750\u6807\u6e05\u5355\uff0c\u4e0d\u662f\u7981\u98de\u533a\u8fb9\u754c";
  }
  if (count >= 2 && unsupportedBoundaryInstruction) {
    return "\u8fb9\u754c\u5305\u542b\u5f27\u7ebf\u3001\u56fd\u754c/FIR \u8fb9\u754c\u6216\u6d77\u5cb8\u7ebf\u63cf\u8ff0\uff0c\u5f53\u524d\u4e0d\u7528\u76f4\u7ebf\u7c97\u7565\u95ed\u5408";
  }
  if (centerRadiusList) {
    return "\u6b63\u6587\u662f\u591a\u4e2a\u5706\u5fc3/\u534a\u5f84\u533a\u57df\u6e05\u5355\uff0c\u6309\u8981\u6c42\u4e0d\u63a8\u5bfc\u5706\u5f62\u8fb9\u754c";
  }
  if (count >= 3 && unsupportedLineCorridor) {
    return "\u6b63\u6587\u662f\u591a\u70b9\u7ebf\u72b6\u8d70\u5eca\uff0c\u9700\u8981\u7f13\u51b2\u7ebf\u8ba1\u7b97\uff0c\u4e0d\u4f5c\u666e\u901a\u591a\u8fb9\u5f62\u7ed8\u5236";
  }
  if (count >= 3 && unsupportedLinePath) {
    return "\u6b63\u6587\u662f\u6cbf\u7ebf/\u7ba1\u7ebf/\u822a\u8ff9\u5750\u6807\u6e05\u5355\uff0c\u4e0d\u662f\u5c01\u95ed\u533a\u57df\u8fb9\u754c";
  }
  if (count >= 3 && !hasBoundaryGeometryIntent(geometryCoordinateText)) {
    return "正文含多个坐标，但缺少 AREA/BOUNDED/SECTOR 等边界语义，按航路点/参考点列表处理";
  }
  if (count === 0) {
    if (qCenter?.center || radiusNm) return "仅有 Q-line/中心半径信息；按要求不把中心半径推导成圆形边界";
    return geometryText?.trim() ? "E) 正文未包含可解析的 DMS 边界坐标" : "NOTAM 正文缺少可解析的 E) 边界描述";
  }
  if (count === 1) return "E) 正文只有 1 个坐标，通常是参考点，不能构成区域";
  if (count === 2 && !corridorWidthNm) return "E) 正文只有 2 个坐标且没有走廊宽度，不能闭合成区域";
  return "E) 正文坐标格式暂未支持，无法形成有效边界";
}

function hasBoundaryGeometryIntent(text, purpose = "") {
  const source = String(text || "");
  const qAirspace = /^Q[RW]/i.test(String(purpose || ""));
  const boundaryWords =
    /\bHORIZONTAL\s+LIMITS?\b|\bYATAY\s+LIMITLER\b|\b(?:RESTRICTED|DANGER|RESERVED)\s+AREA\s+(?:ACT|ACTIVATED)\s*:|\bAREA\s+(?=\d{4,6}(?:\.\d+)?[NS])/i.test(source) ||
    /\bWI(?:THIN)?\s+(?:THE\s+)?(?:AREA\s+(?:WITH\s+)?)?(?:FLW\s+|FOLLOWING\s+)?COORD(?:S|INATES)?\b|\b(?:BACK\s+)?TO\s+(?:THE\s+)?POINT\s+OF\s+ORIGIN\b/i.test(source) ||
    /\b(?:ARAE|BOUND(?:ED)?|BUNDED|BOUNDARY|BDRY(?:\s+EDGE)?|HORIZONTAL\s+BOUNDAR(?:Y|IES)|DEFINED|DELINEATED|LATERAL\s+LIMITS|SECTOR|ZONE|POLYGON|AS\s+FLW|AS\s+FOLLOWS|FOLLOWING\s+POINTS?)\b/i.test(source) ||
    /\bAREA\s*(?:\d{1,2}|[A-Z])?\s*:/i.test(source) ||
    /\bAREA\s+(?:\d{1,2}|[A-Z])\b(?=\s*(?:[.:]|[\r\n]|$))/i.test(source) ||
    /\bWI(?:THIN)?\s+(?:THE\s+)?(?:FLW\s+)?AREA(?:\s+PSN)?\s*:/i.test(source) ||
    /\b(?:RESTRICTED|DANGER|TRAINING|RESERVED)\s+AREA\b[^\r\n]{0,80}\bCOORD(?:INATE)?S?\b/i.test(source) ||
    /\bAREA\b[^\r\n]{0,100}\bDELINEATED\s+BY\b/i.test(source) ||
    /\bWITHIN\s+(?:THE\s+)?(?:TRAINING|DANGER|RESTRICTED|RESERVED)\s+AREA\b/i.test(source) ||
    /\bIN\s+AREAS?\s+(?=(?:\(?[A-Z]\)?[.):-]?\s*)?\d{1,2}[\s-]+\d{1,2}(?:[\s-]+\d{1,2})?(?:\.\d+)?\s*[NS]\b)/i.test(source);
  const coordinateAirspace = qAirspace && hasAirspaceClosureCue(source) && /\b(COORD(?:INATE)?S?|POINTS?)\b/i.test(source);
  const implicitAirspaceBoundary =
    qAirspace &&
    (hasClosedCoordinateSequence(source) ||
      (hasAirspaceClosureCue(source) && (hasCoordinateOnlyLineSequence(source) || /\bWI(?:THIN)?\s*:/i.test(source))));
  const reservedCoordinateBoundary = qAirspace && (
    /\bAIRSPACE\s+(?:RESERVATION|RESTRICTION)\b|\bMOA\b[^\r\n]{0,80}\b(?:NXT|NEXT)\s+COORD\b|\bCOORD\s+GEO\b/i.test(source) ||
    /\bMIL\s+EXER\s+WILL\s+TAKE\s+PLACE\s*:/i.test(source)
  );
  const containedTrainingBoundary = qAirspace && /\bTRAINING\s+FLIGHTS?\b[\s\S]{0,120}\bWI\s+[^:\r\n]{0,60}\bTMA\s*:/i.test(source);
  const rocketBoundary = qAirspace && /\bROCKET\s+FIRING\b/i.test(source) && [...source.matchAll(/\([^)]*\)/g)].some((match) => extractCoordinates(match[0]).length >= 3);
  const controlZoneBoundary = /\bNEW\s+CTLZ\b[\s\S]{0,80}\b(?:ESTABLISHED|ACTIVATED)\b/i.test(source) && hasClosedCoordinateSequence(source);
  return boundaryWords || coordinateAirspace || implicitAirspaceBoundary || reservedCoordinateBoundary || containedTrainingBoundary || rocketBoundary || controlZoneBoundary || /\bAREAS?\s+BETWEEN\b/i.test(source);
}

function isExplicitNonAreaCoordinateList(text) {
  const source = String(text || "");
  if (/\bRIG\s*LIST\b|\bRIGLIST\b/i.test(source)) return true;
  if (/\bNOT\s+FORMING\s+(?:A\s+)?(?:LINE\s*[,]?\s*)?(?:POLYGON\s*(?:OR|\/)\s*)?(?:CIRCLE|POLYGON|LINE)\b/i.test(source)) return true;
  if (/\bAREA\s+(?:FLW|FOLLOWING)\s+POINTS?\s*:/i.test(source) && (source.match(/\bPROVINCE\b/gi) || []).length >= 2) return true;
  if (/\b(?:NEW\s+)?OBST\b|\bOBSTACLE\b|\bAEOLIC\s+PROPELLER\b|\bWIND\s+TURBINES?\b/i.test(source)) {
    return /\b(?:ELEV|HEIGHT|SITE)\b/i.test(source) && !hasStrongBoundaryLanguage(source);
  }
  if (/\b(?:LIGHTING\s+)?MASTS?\b/i.test(source)) {
    return /\b(?:ERECTED|HGT|HEIGHT|ELEV|APRON)\b/i.test(source) && !hasStrongBoundaryLanguage(source);
  }
  return /\b(?:RELEASING|RELEASE|LAUNCHING)\s+POINTS?\b/i.test(source) && !hasStrongBoundaryLanguage(source);
}

function hasClosedCoordinateSequence(text) {
  const coordinates = extractCoordinates(String(text || ""));
  for (let start = 0; start < coordinates.length - 3; start += 1) {
    for (let end = start + 3; end < coordinates.length; end += 1) {
      if (sameCoordinatePair(coordinates[start], coordinates[end])) return true;
    }
  }
  return false;
}

function hasCoordinateOnlyLineSequence(text) {
  const coordinateLines = String(text || "")
    .split(/\r?\n/)
    .filter((line) => {
      const coordinates = extractCoordinates(line);
      if (coordinates.length !== 1) return false;
      return /^\s*\d{4,6}(?:\.\d+)?\s*[NS][\s,/-]+\d{5,7}(?:\.\d+)?\s*[EW]\s*[,;.-]?\s*$/i.test(line);
    });
  return coordinateLines.length >= 3;
}

function isRouteProcedureCoordinateList(text) {
  const source = String(text || "");
  if (/\bTRIGGER\s+NOTAM\b/i.test(source) && /\bAIP\s+(?:SUP|SUPPLEMENT)\b/i.test(source)) return true;
  if (/\bAIR\s+CIRCUIT\b/i.test(source) && (extractCoordinates(source).length >= 3 || /\bAPRX\s+(?:FM|TO)\b/i.test(source))) return true;
  if (
      /\b(ADS-B\s+SERVICE|ATC\s+SURVEILLANCE\s+MINIMUM\s+ALTITUDE|ATS\s+NOT\s+AVBL|MANDATORY\s+ROUTE|FLIGHT\s+PLANNING\s+GUIDELINES|RNAV\s+ROUTES?|ROUTE\s+SEGMENTS?|ATS\s+RTE|STANDARD\s+(?:INSTRUMENT\s+)?(?:DEPARTURE|ARRIVAL)|INSTRUMENT\s+APPROACH)\b/i.test(source) &&
    !hasStrongBoundaryLanguage(source)
  ) return true;
  if (
    /\b(RNAV\s+ROUTES?|AWY|AIRWAY|ATS\s+RTE|ROUTE\s+SEGMENTS?|MANDATORY\s+ROUTE|FOLLOWING\s+(?:FIXES|WAYPOINTS)|AIP\s+(?:AMD|AMDT|SUP|SUPPLEMENT)|AIRAC|ADS-B\s+SERVICE|ATC\s+SURVEILLANCE\s+MINIMUM\s+ALTITUDE|ATS\s+NOT\s+AVBL)\b/i.test(
      source,
    ) &&
    !hasStrongBoundaryLanguage(source) &&
    !hasAirspaceClosureCue(source)
  ) {
    return true;
  }
  const routeListCue =
    /\b(FLIGHT\s+PLANNING\s+GUIDELINES|FLIGHT\s+PLAN(?:NING)?|FOLLOWING\s+(?:FIXES|WAYPOINTS)|IFR\s+WAYPOINTS?|ATS\s+RTE|RTE\s+SEGMENTS?|ROUTE\s+SEGMENTS?|AIP\s+(?:AMD|AMDT|SUP|SUPPLEMENT)|AIRAC|MANDATORY\s+REQUIREMENTS|COMMUNICATIONS|ALL\s+FLTS|ENTERING\s+THE\s+FIR|FIR\s+IS\s+SUBJECT|SID|STAR|STANDARD\s+(?:INSTRUMENT\s+)?(?:DEPARTURE|ARRIVAL)|INSTRUMENT\s+APPROACH|APPROACH\s+PROC(?:EDURE)?|RNAV|RNP|PACOTS|NOPAC|UPR|ENTRY\/EXIT|ENTERY\/EXIT)\b/i.test(
      source,
    );
  if (!routeListCue) return false;
  return !hasAirspaceClosureCue(source);
}

function hasStrongBoundaryLanguage(text) {
  if (/\bWI(?:THIN)?\s+(?:A\s+)?LINE\s+JOINING\s+(?:THE\s+)?(?:FOLLOWING\s+)?POINTS\b/i.test(text) && hasClosedCoordinateSequence(text)) return true;
  return /\b(AREA\s+(?:IS\s+)?(?:BOUND(?:ED)?|BUNDED)|(?:BOUND(?:ED)?|BUNDED)\s+BY|BOUNDARY|BDRY(?:\s+EDGE)?|HORIZONTAL\s+BOUNDAR(?:Y|IES)|LATERAL\s+LIMITS|POLYGON(?:AL)?|AREA\s+WI(?:THIN)?\b[^:\r\n]{0,80}\bCOORD|TEMP(?:ORARY|O)\s+(?:DANGER|RESTRICTED|RESERVED)\s+AREA|DANGER\s+AREA\s+(?:ACT|ACTIVE|ACTIVATED)|RESTRICTED\s+AREA\s+(?:ACT|ACTIVE|ACTIVATED)|AIRSPACE\s+(?:CLSD|CLOSED)\s+WI(?:THIN)?(?:\s+AREA)?|(?:DEFINED|DELINEATED)\s+BY\s+(?:THE\s+)?(?:FOLLOWING\s+)?(?:COORD|POINTS)|WI(?:THIN)?\s+(?:THE\s+)?(?:FLW\s+)?AREA(?:\s+PSN)?\s*:|(?:RESTRICTED|DANGER|TRAINING|RESERVED)\s+AREA\b[^\r\n]{0,80}\bCOORD)\b/i.test(
    String(text || ""),
  );
}

function describeNotamGeometrySource(polygons, kind) {
  const methods = new Set((polygons || []).map((polygon) => polygon?.repairMethod).filter(Boolean));
  const base = kind === "sections" ? "NOTAM body coordinate sections" : "NOTAM body coordinate sequence";
  if (!methods.size) return base;
  if (methods.has("maximum-outer-boundary")) return `${base}; maximum outer boundary retained`;
  if (methods.has("near-closed-excursion-removed")) return `${base}; tiny closed excursion removed while retaining source order`;
  if (methods.has("closed-interior-loops-removed")) return `${base}; closed interior excursion removed`;
  if (methods.has("quadrilateral-order-repaired")) return `${base}; quadrilateral vertex order repaired`;
  return `${base}; boundary order repaired`;
}

function hasAirspaceClosureCue(text) {
  return /\b(TEMP(?:ORARY|O)\s+(?:DANGER|RESTRICTED|RESERVED)\s+AREA|DANGER\s+AREA\s+(?:ACT|ACTIVE|ACTIVATED)|RESTRICTED\s+AREA\s+(?:ACT|ACTIVE|ACTIVATED)|AERIAL\s+ACT|AIR\s+ACT|UA\s+ACT|TRAINING\s+(?:FLIGHT|AREA)|MIL(?:ITARY)?\s+(?:EXERCISE|ACT)|AIRSPACE\s+(?:BLOCKED|CLSD|CLOSED|RESTRICTED|PROHIBITED|RESERVED)|FLT\s+OF\s+[^\r\n]{0,40}\bPROHIBITED|FRNG|FIRING|MISSILE|ROCKET|UAS|UAV|DRONE|UNMANNED|PJE|PARACHUTE|GUN|WEAPON)\b/i.test(
    String(text || ""),
  );
}

function hasUnsupportedBoundaryInstruction(text) {
  if (/\b(?:ANTI[ -]?CLOCKWISE|COUNTER[ -]?CLOCKWISE|CLOCKWISE)\s+ARC\b|\bARC\s+(?:WITH\s+)?(?:RADIUS|OF\b)/i.test(text)) return true;
  return /\b((?:CLOCKWISE|COUNTERCLOCKWISE|ANTI-CLOCKWISE)\s+ALONG\s+(?:AN?\s+)?ARC|ALONG\s+(?:AN?\s+)?(?:CLOCKWISE|COUNTERCLOCKWISE|ANTI-CLOCKWISE)\s+ARC|ARC\s+(?:CW|CCW)|(?:CW|CCW)\s+ARC|ARC\s+RADIUS\s+OF\s+\d+(?:\.\d+)?\s*(?:KM|NM|M)(?:\s*\/\s*\d+(?:\.\d+)?\s*(?:KM|NM|M))?\s+(?:CENTRED|CENTERED|CENTRE|CENTER)|ARC\s+OF\s+(?:(?:A\s+)?CIRCLE|\d+(?:\.\d+)?\s*(?:KM|NM|M)\s+RADIUS)|CIRCULAR\s+ARC\s+WITH\s+CENT(?:RE|ER)|FOLLOWING\s+ARC|(?:CLOCKWISE|COUNTERCLOCKWISE|ANTI-CLOCKWISE)\s+\d+(?:\.\d+)?\s*(?:KM|NM)?\s+ARC|SEMICIRCLE|EXC(?:EPT)?\s+(?:AN?\s+)?CIRCLE|(?:STATE|NATIONAL|FIR|UIR)\s+(?:BORDER|BOUNDARY)|ALONG\s+(?:THE\s+)?(?:COMMON\s+)?[A-Z\/\s-]{0,80}?(?:STATE|NATIONAL|FIR|UIR|CTA|TMA|BORDER|BDRY|BOUNDARY|COAST|COASTL\s*INE|SHORELINE|RIVER|ROAD|RAILWAY)|THEN\s+ALONG\s+(?:THE\s+)?(?:COMMON\s+)?[A-Z\/\s-]{0,80}?(?:STATE|NATIONAL|FIR|UIR|BORDER|BDRY|BOUNDARY|COAST|COASTL\s*INE)|RADIUS\s+\d+(?:\.\d+)?\s*(?:KM|NM|M)\s+(?:WITH\s+)?CENT(?:RE|ER))\b/i.test(
    String(text || ""),
  );
}

function hasUnsupportedNaturalBoundaryInstruction(text) {
  return /\b(?:(?:CLOCKWISE|COUNTERCLOCKWISE|ANTI-CLOCKWISE)\s+ALONG\s+(?:AN?\s+)?ARC|ALONG\s+(?:AN?\s+)?(?:CLOCKWISE|COUNTERCLOCKWISE|ANTI-CLOCKWISE)\s+ARC|ARC\s+(?:CW|CCW)|(?:CW|CCW)\s+ARC|FOLLOWING\s+ARC|SEMICIRCLE|(?:STATE|NATIONAL|FIR|UIR)\s+(?:BORDER|BOUNDARY)|ALONG\s+(?:THE\s+)?(?:COMMON\s+)?[A-Z\/\s-]{0,80}?(?:STATE|NATIONAL|FIR|UIR|CTA|TMA|BORDER|BDRY|BOUNDARY|COAST|COASTL\s*INE|SHORELINE|RIVER|ROAD|RAILWAY)|THEN\s+ALONG\s+(?:THE\s+)?(?:COMMON\s+)?[A-Z\/\s-]{0,80}?(?:STATE|NATIONAL|FIR|UIR|BORDER|BDRY|BOUNDARY|COAST|COASTL\s*INE)|COAST\s*LINE|SHORELINE|AND\s+BY\s+(?:THE\s+)?SHORE)\b/i.test(String(text || ""));
}

function isCenterRadiusList(text, coordinates) {
  const source = String(text || "");
  const count = Array.isArray(coordinates) ? coordinates.length : 0;
  const circleMentions = [...source.matchAll(/\b(?:WI\s+)?CIRCLE\s+RADIUS\b|\b\d+(?:\.\d+)?\s*(?:KM|NM|M)\s+RADIUS\s+(?:CENT(?:RE(?:D)?|ER(?:ED)?)\s+(?:ON|AT)?|OF)\b|\bRADIUS\s*:?\s*\d+(?:\.\d+)?\s*(?:KM|NM|M)?\b|\bRDO\s+\d+(?:\.\d+)?\s*(?:KM|NM|M)?\b/gi)]
    .length;
  return count >= 2 && circleMentions >= 2;
}

function isUnsupportedLinePath(text, coordinates) {
  const source = String(text || "");
  const count = Array.isArray(coordinates) ? coordinates.length : 0;
  if (count < 3) return false;
  if (/\b(?:NORTH|SOUTH|EAST|WEST)\s+OF\s+(?:A\s+)?LINE\b/i.test(source)) return true;
  return /\b(ALONG\s+(?:THE\s+)?(?:(?:FLW|FOLLOWING)\s+)?COORD(?:S|INATES)?|ALONG\s+(?:THE\s+)?(?:PETRONAS\s+)?(?:PIPELINE|TRACK|ROUTE)|(?:PIPELINE|TRACK)\s*:|SUPERSONIC\s+FLIGHT\s+IS\s+PROHIBITED\s+(?:NORTH|SOUTH|EAST|WEST)\s+OF\s+LINE)\b/i.test(
    source,
  );
}

function isUnsupportedLineCorridor(text, coordinates, corridorWidthNm) {
  const source = String(text || "");
  const count = Array.isArray(coordinates) ? coordinates.length : 0;
  if (count < 3) return false;
  if (hasClosedPolygonSequenceCue(source)) return false;
  return (
    Number.isFinite(corridorWidthNm) ||
    /\bAREA\s+BOUND(?:ED)?\s+BY\s+\d+(?:\.\d+)?\s*(?:KM|M|NM|NMR)\s+EITHER\s+SIDE\b/i.test(source) ||
    /\b(EITHER\s+SIDE\s+OF\s+(?:A\s+)?(?:STRAIGHT\s+)?LINE|STRAIGHT\s+LINE\s+CONNECTING|LINE\s+CONNECTING\s+(?:THE\s+)?(?:FLW|FOLLOWING)?\s*POINTS?|LINE\s+JOINING\s+POINTS|ALONG\s+(?:THE\s+)?LINE|CENT(?:RE|ER)\s*LINE|CORRIDOR)\b/i.test(source)
  );
}

function hasClosedPolygonSequenceCue(text) {
  const source = String(text || "");
  if (/\bWI(?:THIN)?\s+(?:A\s+)?LINE\s+JOINING\s+(?:THE\s+)?(?:FOLLOWING\s+)?POINTS\b/i.test(source) && hasClosedCoordinateSequence(source)) return true;
  return /\b(AREA\s+DEFINED\s+AS|LATERAL\s+LIMIT(?:S)?\s+AREA\s+FORMED|FORMED\s+BY\s+THE\s+UNION\s+OF\s+THE\s+(?:FLW|FOLLOWING)\s+POINTS|TO\s+POINT\s+OF\s+ORIGIN)\b/i.test(
    source,
  );
}

function extractNotamGeometryText(text) {
  // FAA concatenates multipart messages with a repeated header, sometimes in
  // the middle of a coordinate. Only join parts belonging to the same NOTAM.
  const original = String(text || "");
  const messageId = original.match(/\b([A-Z]\d{1,4}\/\d{2,4})\s+NOTAM[NR]/i)?.[1];
  const source = original.replace(
    /\bEND\s+PART\s+\d+\s+OF\s+\d+\s+([A-Z]\d{1,4}\/\d{2,4})\s+NOTAM[NR][\s\S]*?\bE\)\s*/gi,
    (match, id) => id === messageId ? " " : match,
  ).replace(/\bEND\s+PART\s+\d+\s+OF\s+\d+\b/gi, " ");
  const eMatch = /(?<!\()\bE\)\s*/i.exec(source);
  if (eMatch) {
    const tail = source.slice(eMatch.index + eMatch[0].length);
    const fieldMatches = [...tail.matchAll(/(?:^|[\r\n\s])([FG])\)\s*/gi)];
    const terminalField = fieldMatches.find((match) => {
      const remainder = tail.slice(Number(match.index) + match[0].length);
      return extractCoordinates(normalizeNotamCoordinateText(remainder)).length === 0;
    });
    const body = (terminalField ? tail.slice(0, terminalField.index) : tail).replace(
      /\bF\)\s*(?:SFC|GND|UNL|FL\s*\d+|\d+(?:\.\d+)?\s*(?:FT|M)(?:\s*(?:AMSL|AGL))?)\s*G\)\s*(?:SFC|GND|UNL|FL\s*\d+|\d+(?:\.\d+)?\s*(?:FT|M)(?:\s*(?:AMSL|AGL))?)[\t ]*(?=\d{1,2}[.)](?!\d))/gi,
      "\n",
    );
    if (body.trim()) return body;
  }
  return source.replace(/(?<!\()\b[QABCDFG]\)\s*[\s\S]*?(?=\s+\b[QABCDEFG]\)|$)/gi, " ");
}

function cleanNotamGeometryText(text) {
  return trimNonBoundaryCoordinateTail(focusBoundaryCoordinateText(text));
}

function focusBoundaryCoordinateText(text) {
  const source = String(text || "");
  const starts = [
    ...source.matchAll(
      /\b(?:IN\s+AREAS?\s+BOUND(?:ED)?\s+BY|AREAS?\s+BOUND(?:ED)?\s+BY|AREA\s+(?:WI|WITHIN|BOUND(?:ED)?|DEFINED|AS\s+FLW|AS\s+FOLLOWS)|FLW\s+AREA\s+WI|FOLLOWING\s+AREA\s+WI|WI\s+COORDS?:|WITHIN\s+COORDS?:|LATERAL\s+LIMITS)\b/gi,
    ),
  ]
    .map((match) => match.index)
    .filter((index) => Number.isFinite(index) && index > 0)
    .sort((a, b) => a - b);
  for (const index of starts) {
    const before = source.slice(0, index);
    const after = source.slice(index);
    if (extractCoordinates(before).length <= 2 && extractCoordinates(after).length >= 3) return after;
  }
  return source;
}

function trimNonBoundaryCoordinateTail(text) {
  const source = String(text || "");
  const cuts = [
    ...source.matchAll(
      /(?:^|[\r\n])\s*(?:DRG\s+THIS\s+PERIOD\s+)?(?:FLW\s+)?(?:ATS\s+RTE|ATS\s+ROUTE|ROUTE|RTE)\s+(?:SEGMENTS?\s+)?(?:AFFECTED|NOT\s+AVBL|AVBL|ARE\s+NOT|SEGMENTS?)\b|(?:^|[\r\n])\s*(?:ATS\s+ROUTES?|ATS\s+RTE|ROUTES?|RTE)\s+AFFECTED\b|(?:^|[\r\n])\s*ALTN\s+RTE\b|(?:^|[\r\n])\s*ALTERNATE\s+ROUTE\b|(?:^|[\r\n])\s*(?:RMK|REMARKS?|NOTE)\s*[:.]/gi,
    ),
  ]
    .map((match) => match.index + match[0].search(/\S/))
    .filter((index) => Number.isFinite(index) && index > 0)
    .sort((a, b) => a - b);
  cuts.push(
    ...[...source.matchAll(/(?:^|[\r\n])\s*(?:\d+\.\s*)?CANCEL\s+THIS\s+MSG\b|(?:^|[\r\n])\s*ISSUED\b|(?:^|[\r\n])\s*AUTHORITY\b/gi)]
      .map((match) => match.index + match[0].search(/\S/))
      .filter((index) => Number.isFinite(index) && index > 0),
  );
  cuts.sort((a, b) => a - b);
  for (const index of cuts) {
    const before = source.slice(0, index).trim();
    const after = source.slice(index);
    if (/\b(?:LATERAL\s+LIMITS\s*:|(?:AREA|AIRSPACE)\s+BOUND(?:ED)?\s+BY\b)/i.test(after) && extractCoordinates(after).length >= 3) continue;
    if (extractCoordinates(before).length >= 3 && hasBoundaryGeometryIntent(before)) return before;
  }
  return source;
}

function normalizeExplicitGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return null;
  if (!["Polygon", "MultiPolygon"].includes(geometry.type)) return null;
  return Array.isArray(geometry.coordinates) ? geometry : null;
}

function normalizeNotamCoordinateText(text) {
  return String(text || "")
    .replace(/(^|[\r\n])([\t ]*\d{1,3}\.)(?=\d{4,6}(?:\.\d+)?[NS][\s,/-]*\d{5,7}(?:\.\d+)?[EW])/gim, "$1$2 ")
    .replace(/(\d{1,3})\s*-[\t\r\n ]*(\d{1,2}(?:\.[\t\r\n ]*\d+)?)(?:[\t ]*-[\t\r\n ]*(\d{1,2}(?:\.[\t\r\n ]*\d+)?))?[\t\r\n ]*([NSEW])/gi,
      (match, degree, minute, second, hemisphere) => `${degree}-${minute.replace(/\s/g, "")}${second === undefined ? "" : `-${second.replace(/\s/g, "")}`}${hemisphere}`)
    .replace(/(\d[\t ]*)([NSEW])\2(?=[\s,;.()]|$)/gi, "$1$2")
    .replace(/(?<!\d)(\d{1,2})\s+-\s*(\d{1,2}(?:\.\d+)?)\s*([NS])\b/gi, "$1-$2$3")
    .replace(/(?<!\d)(\d{1,2})\s+(\d)\s*-\s*(\d{1,2}(?:\.\d+)?)\s*([EW])\b/gi, "$1$2-$3$4")
    .replace(/((?:^|[:,;(\/\-\s]))(\d{1,5})[ \t]*\r?\n[ \t]*(\d{1,5}(?:\.\d+)?[NS])(?=[\s,;\/\-]*\d{3})/gi, (match, prefix, first, second) => {
      const size = `${first}${second.replace(/[NS]$/i, "")}`.split(".")[0].length;
      return [4, 6].includes(size) ? `${prefix}${first}${second}` : match;
    })
    .replace(/([NS][\s,;\/\-]*)(\d{1,6})[ \t]*\r?\n[ \t]*(\d{1,6}(?:\.\d+)?[EW])/gi, (match, prefix, first, second) => {
      const size = `${first}${second.replace(/[EW]$/i, "")}`.split(".")[0].length;
      return [5, 7].includes(size) ? `${prefix}${first}${second}` : match;
    })
    .replace(/(^|[\r\n])\s*(\d{1,3})[\t ]*[\r\n]+[\t ]*(\d{4,6}(?:\.\d+)?\s*[NS]\b)/gim, "$1$2$3")
    .replace(/(^|[\r\n])\s*(\d{1,3})[\t ]*[\r\n]+[\t ]*(\d{5,7}(?:\.\d+)?\s*[EW]\b)/gim, "$1$2$3")
    .replace(/\b([NS])\s*((?:\d[\t\r\n ]*){4}(?:(?:\d[\t\r\n ]*){2})?(?:\.\d+)?)\s*([EW])\s*((?:\d[\t\r\n ]*){5}(?:(?:\d[\t\r\n ]*){2})?(?:\.\d+)?)/gi, (match, ns, latDigits, ew, lonDigits) => {
      const trailingWhitespace = match.match(/[\t\r\n ]+$/)?.[0] || "";
      const lat = latDigits.replace(/[\t\r\n ]+/g, "");
      const lon = lonDigits.replace(/[\t\r\n ]+/g, "");
      const latSize = lat.split(".")[0].length;
      const lonSize = lon.split(".")[0].length;
      if (![4, 6].includes(latSize) || ![5, 7].includes(lonSize)) return match;
      // The permissive wrapped-coordinate expression can consume the newline
      // after a complete coordinate. Keep that delimiter so a following word
      // (for example "BACK TO START") cannot become part of the coordinate.
      return `${ns}${lat}${ew}${lon}${trailingWhitespace}`;
    })
    .replace(/(^|[\r\n])\s*(\d{1,2})[\t ]*[\r\n]+[\t ]*(\d{4}(?:\.\d+)?[NS]\b)/gim, "$1$2$3")
    .replace(/(^|[\r\n])\s*(\d{1,3})[\t ]*[\r\n]+[\t ]*(\d{5}(?:\.\d+)?[EW]\b)/gim, "$1$2$3");
}

function expandCoordinateRangeBoundaries(text) {
  if (!/\b(?:AREA|AREAS|BOUND(?:ED)?|BETWEEN)\b/i.test(text)) return text;
  const atom = (hemisphere) => `(\\d{1,3})-(\\d{1,2}(?:\\.\\d+)?)\\s*([${hemisphere}])`;
  const expression = new RegExp(`${atom("NS")}\\s*(?:TO\\s*)?${atom("NS")}\\s+AND\\s+${atom("EW")}\\s*(?:TO\\s*)?${atom("EW")}`, "gi");
  return String(text).replace(expression, (match, d1, m1, h1, d2, m2, h2, d3, m3, h3, d4, m4, h4) => {
    const values = [[d1,m1,h1],[d2,m2,h2],[d3,m3,h3],[d4,m4,h4]].map(([d,m,h]) => signedDms(d,m,0,h));
    if (values.some((value, index) => !Number.isFinite(value) || Math.abs(value) > (index < 2 ? 90 : 180))) return match;
    const [a,b,c,d] = [[d1,m1,h1],[d2,m2,h2],[d3,m3,h3],[d4,m4,h4]].map(([deg,min,hemi]) => `${deg}-${min}${hemi}`);
    return `${a} ${c}, ${a} ${d}, ${b} ${d}, ${b} ${c}`;
  });
}

function removeCircleRadiusCoordinateClauses(text) {
  const lines = String(text || "").split(/\r?\n/);
  const kept = [];
  let skippingCircle = false;
  let skippingLineSection = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const nearby = lines.slice(index, index + 5).join(" ");
    const sectionHeader = lines.slice(index, index + 2).join(" ");
    const startsCenterRadiusSection =
      /^\s*-?\s*(?:HOLDING|HOLD|LOITER(?:ING)?)\s+AREA\b/i.test(line) &&
      /\bCOORD(?:INATES?)?\s+(?:CENTRED|CENTERED|CENTRE|CENTER)\s+ON\b[\s\S]*\bRADIUS\b/i.test(nearby);
    const startsLineSection =
      /^\s*(?:\(?\d{1,2}\)?\s*[.):-]|[A-Z]\.|\(?[A-Z]\))\s*/.test(line) &&
      /\b(?:EITHER\s+SIDE\s+OF\s+(?:A\s+)?(?:STRAIGHT\s+)?LINE|LINE\s+JOINING\s+POINTS?|TRACKLINE\s+JOINING|CORRIDOR)\b/i.test(sectionHeader);
    const coordinateFooter = /^\s*[FG]\)\b/i.test(line) && extractCoordinates(line).length > 0;
    const startsNewSection =
      /^\s*-?\s*(?:SEGMENT|AREA|ZONE|PART|SECTOR|BLOCK|POLYGON)\s*[A-Z0-9-]*\s*(?:\([^)]*\))?\s*[:.-]?/i.test(line) ||
      /^\s*(?:\(?\d{1,2}\)?\s*[.):-]|[A-Z]\.|\(?[A-Z]\))\s*/.test(line) ||
      /^\s*[FG]\)\b/i.test(line);
    const circleLine = isCircleRadiusCoordinateLine(line);
    if (skippingCircle && startsNewSection && !circleLine && !startsCenterRadiusSection) skippingCircle = false;
    if (skippingLineSection && startsNewSection && !startsLineSection && !coordinateFooter) skippingLineSection = false;
    if (startsCenterRadiusSection || circleLine) {
      skippingCircle = true;
      continue;
    }
    if (startsLineSection) {
      skippingLineSection = true;
      continue;
    }
    if (skippingCircle || skippingLineSection) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function isCircleRadiusCoordinateLine(line) {
  return /\b(?:WI(?:THIN)?\s+)?CIRCLE\s+RADIUS\b|\b\d+(?:\.\d+)?\s*(?:KM|NM|M|NMR)\s+RADIUS\s+(?:OF|(?:CENTRED|CENTERED|CENTRE|CENTER)(?:\s+(?:ON|AT))?)\b|\bRADIUS\s*:?\s*\d+(?:\.\d+)?\s*(?:KM|NM|M|NMR)?\s+(?:CENTRED|CENTERED|CENTRE|CENTER)\b|\b(?:CENTRED|CENTERED|CENTRE|CENTER)\s+(?:ON|AT)\s+\d{4,6}[NS]\s*\d{5,7}[EW]\s+WITH\s+RADIUS\b|\b(?:WI(?:THIN)?\s+)?SECT(?:OR)?\b(?=[^\r\n]{0,240}\bRADIUS\b)(?=[^\r\n]{0,240}\b(?:CENTRED|CENTERED|CENTRE|CENTER)\b)[^\r\n]*|\bPLACE:\s*RADIUS\s+\d+(?:\.\d+)?\s*(?:KM|NM|M|NMR)?\s+(?:CENTRE|CENTER)\b/i.test(
    String(line || ""),
  );
}

function extractCoordinateSections(text) {
  const source = String(text || "");
  const sectionStarts = [
    ...source.matchAll(
      /(?:^|[\r\n])\s*(?:\(?\d{1,2}\)?\s*[\).:-]?\s*AREAS?\b|AREAS?\s*\d{1,2}\b|AREA\s+[A-Z]\b|ZONE\s*\d{1,2}\b|PART\.\s*\d+\s*[-:])/gi,
    ),
  ].map(
    (match) => match.index + match[0].search(/\S/),
  );
  sectionStarts.push(
    ...[...source.matchAll(/(?:^|[\r\n])\s*(?:ROTA\s+\d+\s*:|\d+(?:ST|ND|RD|TH)\s+ROUTE\s*:|LATERAL\s+LIMITS\s*:)/gi)]
      .map((match) => match.index + match[0].search(/\S/)),
  );
  sectionStarts.push(
    ...[...source.matchAll(/(?:^|[\r\n])\s*\d{1,2}[.)](?!\d)\s*(?=[^\r\n]{0,100}\b(?:AREA|SECTOR|CIRCLE|EITHER\s+SIDE\s+OF\s+(?:A\s+)?LINE)\b)/gi)]
      .map((match) => match.index + match[0].search(/\S/)),
  );
  sectionStarts.push(
    ...[
      ...source.matchAll(
        /(?:^|[\r\n])\s*(?:\(?\d{1,2}\)?\s*[\).:-]|[A-Z]\.)\s+[^\r\n]{0,140}?\b(?:AREA|AIRSPACE)\s+BOUND(?:ED)?\s+BY\b/gi,
      ),
    ].map((match) => match.index + match[0].search(/\S/)),
  );
  sectionStarts.push(
    ...[...source.matchAll(/(?:^|[\r\n])\s*(?:ZONE\s*:\s*[^\r\n]+|\d+\.?\s*EXP\s+FLT\s+AREA\s*:|POLYGON\s*[,.:]|CIRCLE\s+CENT(?:ER|RE)\s*\d*)/gi)]
      .map((match) => match.index + match[0].search(/\S/)),
  );
  sectionStarts.push(
    ...[...source.matchAll(/\b(?:IN\s+)?AREAS?\s+BOUND(?:ED)?\s+BY\b/gi)].map((match) => match.index),
  );
  sectionStarts.push(
    ...[...source.matchAll(/\b(?:AREA|ZONE)\s+(?:\d{1,2}|[A-Z])\s*(?=[:.\r\n]|DEFINED\s+AS\b|BOUND(?:ED)?\s+BY\b)/gi)].map(
      (match) => match.index,
    ),
  );
  sectionStarts.push(
    ...[
      ...source.matchAll(
        /(?:^|[\r\n])\s*(?:SECT(?:OR)?\s+\d{1,2}\b|[A-Z][A-Z0-9 ()'\/-]{2,80}:\s*(?=\d{4,6}(?:\.\d+)?[NS]))/gi,
      ),
    ]
      .filter((match) => !/^\s*(?:POINT\s+[A-Z0-9]+|P\d+)\s*:/i.test(match[0]))
      .map((match) => match.index + match[0].search(/\S/)),
  );
  if (/\b(?:IN\s+)?AREAS?\s+(?:BOUND(?:ED)?\s+BY|BETWEEN)\b/i.test(source)) {
    const labelStarts = [
      ...[
        ...source.matchAll(
          /(?:^|[\r\n]|[ \t])\s*[A-Z]\.\s*(?=(?:\d{4,6}Z|\d{1,2}-\d{1,2}(?:\.\d+)?[NS]|\d{1,2}-\d{1,2}-\d{1,2}(?:\.\d+)?[NS]|IN\s+ARE?A|[A-Z ,/-]{0,50}\b(?:OPERATIONS?|EXERCISES?|LAUNCH|REENTRY|HAZARDOUS|DANGER)\b))/gi,
        ),
      ].map((match) => match.index + match[0].search(/\S/)),
      ...[...source.matchAll(/(?:^|[\s])\([A-Z]\)\s+(?=(?:\d{1,2}-\d{1,2}(?:\.\d+)?[NS]|\d{4,6}(?:\.\d+)?[NS]))/gi)]
        .map((match) => match.index + match[0].search(/\([A-Z]\)/i)),
    ].sort((a, b) => a - b);
    if (labelStarts.filter((start, index) => extractCoordinates(source.slice(start, labelStarts[index + 1] ?? source.length)).length >= 3).length >= 2) sectionStarts.push(...labelStarts);
  }
  sectionStarts.push(
    ...[
      ...source.matchAll(
        /(?:^|[\r\n])\s*(?:AT\s+\d{3,4}Z?\b[^\r\n]{0,120}?\bWI\s+COORDS?:|AT\s+\d{3,4}Z?\b[^\r\n]{0,120}?\bWITHIN\s+COORDS?:|\b(?:FORECAST(?:ED)?|LOCATED)\b[^\r\n]{0,120}?\bWI\s+COORDS?:)/gi,
      ),
    ].map((match) => match.index + match[0].search(/\S/)),
  );
  // Keep an unnamed first boundary too; labels only delimit, never discard.
  const uniqueStarts = [...new Set([0, ...sectionStarts])].sort((a, b) => a - b);
  const sections =
    uniqueStarts.length > 1
      ? uniqueStarts.map((start, index) => source.slice(start, uniqueStarts[index + 1] || source.length))
      : [source];
  // A coordinate heading cannot detach its meaning from the preceding text.
  // In particular, COORD: after ALONG / RADIUS is not a new polygon.
  const contextual = [];
  let prefix = "";
  for (const section of sections) {
    prefix += section;
    if (extractCoordinateTokens(section).length) {
      contextual.push(prefix);
      prefix = "";
    }
  }
  if (prefix) {
    if (contextual.length) contextual[contextual.length - 1] += prefix;
    else contextual.push(prefix);
  }
  return contextual;
}

function extractCoordinateGroups(text) {
  return extractCoordinateSections(text)
    .filter((section) => !hasUnresolvedBoundaryWaypoint(section))
    .flatMap((section) => splitCoordinateGroupsAtCompletedBoundaries(section, extractCoordinates(section)))
    .filter((coords) => coords.length);
}

function normalizePolygonGroupCoordinates(group) {
  const normalized = [];
  for (const coordinate of group || []) {
    if (!Number.isFinite(Number(coordinate?.lat)) || !Number.isFinite(Number(coordinate?.lon))) continue;
    const point = { lat: roundCoord(coordinate.lat), lon: roundCoord(coordinate.lon) };
    if (normalized.length && sameCoordinatePair(normalized[normalized.length - 1], point)) continue;
    normalized.push(point);
  }
  if (normalized.length >= 2 && sameCoordinatePair(normalized[0], normalized[normalized.length - 1])) normalized.pop();
  return normalized;
}

function hasUnresolvedBoundaryWaypoint(section) {
  const source = String(section || "").toUpperCase();
  if (!hasBoundaryGeometryIntent(source)) return false;
  const first = extractCoordinates(source)[0];
  if (!first) return false;
  const clause = /\b(?:AREA|AIRSPACE)\s+BOUND(?:ED)?\s+BY\b/.exec(source);
  const start = clause ? clause.index + clause[0].length : first.sourceIndex;
  const boundary = source.slice(start).split(/\b(?:BACK\s+TO\s+START|TO\s+(?:THE\s+)?POINT\s+OF\s+ORIGIN|VERTICAL\s+LIMITS?)\b/)[0] || "";
  const coordinates = extractCoordinates(boundary);
  const closingCoordinate = coordinates
    .slice(1)
    .reverse()
    .find((coordinate) => sameCoordinatePair(coordinates[0], coordinate));
  const lastCoordinate = coordinates[coordinates.length - 1];
  // Narrative after the last vertex is not a navigation fix (for example
  // "RECEIVE A FINE" or a place name in parentheses).
  const end = closingCoordinate?.sourceEnd ?? lastCoordinate?.sourceEnd ?? boundary.length;
  const trailingFixes = closingCoordinate ? "" : (boundary.slice(end).match(/^\s*\)?\s*[-;,]\s*[A-Z]{5}(?:\s*[-;,]\s*[A-Z]{5})*\s*(?=[.;\r\n]|$)/)?.[0] || "");
  const boundaryPath = boundary.slice(0, end) + trailingFixes;
  if (/\b[A-Z]{2,5}\s+(?:VOR(?:\/DME)?|NDB|DME)\s*(?=[;,/-]|$)/.test(boundaryPath)) return true;
  const syntaxWords = new Set(["COORD", "COORDS", "BOUND", "START", "POINT", "POINTS", "LINES", "JOINI", "AREAS"]);
  return [...boundaryPath.matchAll(/(?:^|[-\u2013\u2014>:;,\/])\s*([A-Z]{5})\s*(?=[-\u2013\u2014>:;,\/()]|$)/g)]
    .some((match) => !syntaxWords.has(match[1]));
}

function extractCoordinates(text) {
  return extractCoordinateTokens(text).filter((coord) => Number.isFinite(coord.lat) && Number.isFinite(coord.lon) && Math.abs(coord.lat) <= 90 && Math.abs(coord.lon) <= 180);
}

function extractCoordinateTokens(text) {
  const coords = [];
  const compact =
    /(?<!\d)(\d{2})(\d{2})(\d{2}(?:\.\d+)?)?\s*([NS])[\s,/-]*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)?\s*([EW])(?!\d)/gi;
  for (const match of text.matchAll(compact)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2], match[3] || 0, match[4]),
      lon: signedDms(match[5], match[6], match[7] || 0, match[8]),
    });
  }

  const compactDecimalMinutes =
    /(?<!\d)(\d{2})(\d{2}\.\d+)\s*([NS])[\s,;/-]*(\d{3})(\d{2}\.\d+)\s*([EW])(?!\d)/gi;
  for (const match of text.matchAll(compactDecimalMinutes)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2], 0, match[3]),
      lon: signedDms(match[4], match[5], 0, match[6]),
    });
  }

  const hemiFirst =
    /\b([NS])\s*(\d{2})(\d{2})(\d{2}(?:\.\d+)?)?\s*([EW])\s*(\d{3})(\d{2})(\d{2}(?:\.\d+)?)?\b/gi;
  for (const match of text.matchAll(hemiFirst)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[2], match[3], match[4] || 0, match[1]),
      lon: signedDms(match[6], match[7], match[8] || 0, match[5]),
    });
  }

  const labeled =
    /Latitude:\s*(\d{1,2})[º°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)["”]?\s*([NS]).{0,80}?Longitude:\s*(\d{1,3})[º°\s]+(\d{1,2})['’\s]+(\d{1,2}(?:\.\d+)?)["”]?\s*([EW])/gis;
  for (const match of text.matchAll(labeled)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2], match[3], match[4]),
      lon: signedDms(match[5], match[6], match[7], match[8]),
    });
  }

  const dashDelimited =
    /\b(\d{1,2})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*([NS])[\s,;/-]*(\d{1,3})-(\d{1,2}(?:\.\d+)?)(?:-(\d{1,2}(?:\.\d+)?))?\s*([EW])\b/gi;
  for (const match of text.matchAll(dashDelimited)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2], match[3] || 0, match[4]),
      lon: signedDms(match[5], match[6], match[7] || 0, match[8]),
    });
  }

  const spaced =
    /\b([NS])\s*(\d{1,2})[\s-]+(\d{1,2})(?:[\s-]+(\d{1,2}(?:\.\d+)?))?\s+([EW])\s*(\d{1,3})[\s-]+(\d{1,2})(?:[\s-]+(\d{1,2}(?:\.\d+)?))?\b/gi;
  for (const match of text.matchAll(spaced)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[2], match[3], match[4] || 0, match[1]),
      lon: signedDms(match[6], match[7], match[8] || 0, match[5]),
    });
  }

  const chineseLatLon =
    /(?:北纬|南纬|纬度|纬)\s*(\d{1,2})(?:\s*[°度]\s*(\d{1,2}(?:\.\d+)?)?)?(?:\s*[′'分]\s*(\d{1,2}(?:\.\d+)?)?)?(?:\s*[″"秒]?)?\s*([北南NS])?[\s,，、；;至到和-]{0,40}(?:东经|西经|经度|经)\s*(\d{1,3})(?:\s*[°度]\s*(\d{1,2}(?:\.\d+)?)?)?(?:\s*[′'分]\s*(\d{1,2}(?:\.\d+)?)?)?(?:\s*[″"秒]?)?\s*([东西EW])?/gi;
  for (const match of text.matchAll(chineseLatLon)) {
    const latHemi = match[4] || (match[0].includes("南纬") ? "S" : "N");
    const lonHemi = match[8] || (match[0].includes("西经") ? "W" : "E");
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2] || 0, match[3] || 0, latHemi),
      lon: signedDms(match[5], match[6] || 0, match[7] || 0, lonHemi),
    });
  }

  const degreeSymbolLatLon =
    /(?<![\d.])(\d{1,2})[°度]\s*(\d{1,2}(?:\.\d+)?)?[′'分]?\s*(\d{1,2}(?:\.\d+)?)?[″"秒]?\s*([NS北南])[\s,，、；;/-]*(\d{1,3})[°度]\s*(\d{1,2}(?:\.\d+)?)?[′'分]?\s*(\d{1,2}(?:\.\d+)?)?[″"秒]?\s*([EW东西])(?![A-Z])/gi;
  for (const match of text.matchAll(degreeSymbolLatLon)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], match[2] || 0, match[3] || 0, match[4]),
      lon: signedDms(match[5], match[6] || 0, match[7] || 0, match[8]),
    });
  }

  const decimalDegrees = /(?<![\d.])(\d{1,2}\.\d+)\s*[°度]?\s*([NS北南])[\s,，、；;/-]*(\d{1,3}\.\d+)\s*[°度]?\s*([EW东西])(?![A-Z\d])/gi;
  for (const match of text.matchAll(decimalDegrees)) {
    pushExtractedCoordinate(coords, match.index, {
      matchedText: match[0],
      lat: signedDms(match[1], 0, 0, match[2]),
      lon: signedDms(match[3], 0, 0, match[4]),
    });
  }

  let consumedEnd = -1;
  return coords
    .sort((a, b) => a.sourceIndex - b.sourceIndex || b.sourceEnd - a.sourceEnd || a.sequence - b.sequence)
    .filter((coordinate) => {
      if (coordinate.sourceIndex < consumedEnd) return false;
      consumedEnd = coordinate.sourceEnd;
      return true;
    })
    .map(({ lat, lon, sourceIndex, sourceEnd }) => ({ lat, lon, sourceIndex, sourceEnd }));
}

function pushExtractedCoordinate(target, sourceIndex, coordinate) {
  target.push({
    ...coordinate,
    sourceIndex: Number.isFinite(sourceIndex) ? sourceIndex : Number.MAX_SAFE_INTEGER,
    sourceEnd: Number.isFinite(sourceIndex) ? sourceIndex + String(coordinate?.matchedText || "").length : Number.MAX_SAFE_INTEGER,
    sequence: target.length,
  });
}

function splitCoordinateGroupsAtCompletedBoundaries(text, coordinates) {
  const source = String(text || "");
  const cueGroups = [];
  let current = [];
  for (const coordinate of coordinates || []) {
    if (current.length >= 3) {
      const previous = current[current.length - 1];
      const between = source.slice(Math.max(0, Number(previous.sourceIndex || 0)), Math.max(0, Number(coordinate.sourceIndex || 0)));
      if (
        /(?:诸?点|[三四五六七八九十\d]+点)?(?:依次)?连线(?:所围)?(?:水域|海域|区域)?(?:范围)?(?:内)?|(?:水域|海域|区域)范围(?:内)?|所围(?:成)?(?:的)?(?:水域|海域|区域)?/i.test(
          between,
        )
      ) {
        cueGroups.push(current);
        current = [];
      }
    }
    current.push(coordinate);
  }
  if (current.length) cueGroups.push(current);
  return cueGroups.flatMap((group) => splitClosedCoordinateLoops(group));
}

function splitClosedCoordinateLoops(coords) {
  if (!Array.isArray(coords) || !coords.length) return [];
  const groups = [];
  let current = [];
  for (const coord of coords) {
    current.push(coord);
    if (current.length >= 4 && sameCoordinatePair(coord, current[0])) {
      groups.push(removeClosingCoordinate(current));
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function removeClosingCoordinate(coords) {
  if (coords.length >= 2 && sameCoordinatePair(coords[0], coords[coords.length - 1])) return coords.slice(0, -1);
  return coords;
}

function sameCoordinatePair(a, b) {
  return Math.abs(Number(a?.lat) - Number(b?.lat)) < 1e-7 && Math.abs(Number(a?.lon) - Number(b?.lon)) < 1e-7;
}

function parseQLineCenter(qLine) {
  if (!qLine) return null;
  const match = qLine.match(/\/(\d{4}[NS]\d{5}[EW])(\d{3})\b/i);
  if (!match) return null;
  const token = match[1];
  const lat = signedDms(token.slice(0, 2), token.slice(2, 4), 0, token.slice(4, 5));
  const lon = signedDms(token.slice(5, 8), token.slice(8, 10), 0, token.slice(10, 11));
  return { center: { lat, lon }, radiusNm: Number(match[2]) };
}

function parseQLineAltitude(qLine) {
  if (!qLine) return null;
  const parts = qLine.split("/");
  const lower = formatQAltitude(parts[5]);
  const upper = formatQAltitude(parts[6]);
  return [lower, upper].filter(Boolean).join(" - ") || null;
}

function formatQAltitude(value) {
  const text = String(value || "").trim().toUpperCase();
  if (!/^\d{3}$/.test(text)) return null;
  if (text === "000") return "SFC";
  if (text === "999") return "UNL";
  return `FL${text}`;
}

function parseCoordinatePair(text) {
  return extractCoordinates(text)[0] || null;
}

function signedDms(deg, min, sec, hemi) {
  if (!Number.isFinite(Number(deg)) || Number(min) < 0 || Number(min) >= 60 || Number(sec) < 0 || Number(sec) > 60) return NaN;
  const sign = /[SW南西]/i.test(String(hemi)) ? -1 : 1;
  return sign * (Number(deg) + Number(min || 0) / 60 + Number(sec || 0) / 3600);
}

function parseRadiusNm(text) {
  const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*(?:NM|NMR|nautical miles?)/i);
  return match ? Number(match[1]) : null;
}

function parseCorridorWidthNm(text) {
  const source = String(text || "");
  const match =
    source.match(/\bWI(?:THIN)?\s+(\d+(?:\.\d+)?)\s*(KM|M|NM|NMR)\s+EITHER\s+SIDE\s+OF\s+(?:A\s+)?(?:STRAIGHT\s+)?LINE\b/i) ||
    source.match(/\b(\d+(?:\.\d+)?)\s*(KM|M|NM|NMR)\s+EITHER\s+SIDE\s+OF\s+(?:A\s+)?(?:STRAIGHT\s+)?LINE\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toUpperCase();
  if (!Number.isFinite(value)) return null;
  if (unit === "KM") return value / 1.852;
  if (unit === "M") return value / 1852;
  return value;
}

function extractAltitudeFromText(text) {
  const match = text.match(/\b(?:SFC|SURFACE|FL\d{2,3}|\d{3,5}\s*FT)[^.\n]{0,80}?(?:AGL|MSL|AMSL|UNL|FL\d{2,3}|\d{3,5}\s*FT)\b/i);
  return match ? match[0].trim() : null;
}

function polygonFromCoordinates(points) {
  const ring = points.map((point) => [roundCoord(point.lon), roundCoord(point.lat)]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([...first]);
  return { type: "Polygon", coordinates: [ring] };
}

function repairPolygonIfNeeded(polygon, { allowMaximumOuterBoundary = false } = {}) {
  if (!polygon) return null;
  const reason = validateParsedGeometry(polygon);
  if (!reason) return polygon;
  const ring = polygon.coordinates?.[0] || [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  const openRing =
    ring.length >= 2 &&
    Math.abs(Number(first?.[0]) - Number(last?.[0])) < 1e-9 &&
    Math.abs(Number(first?.[1]) - Number(last?.[1])) < 1e-9
      ? ring.slice(0, -1)
      : ring;
  const clean = [];
  for (const coordinate of openRing) {
    const point = { lon: Number(coordinate?.[0]), lat: Number(coordinate?.[1]) };
    if (!Number.isFinite(point.lon) || !Number.isFinite(point.lat)) continue;
    const previous = clean[clean.length - 1];
    if (previous && Math.abs(previous.lon - point.lon) < 1e-9 && Math.abs(previous.lat - point.lat) < 1e-9) continue;
    clean.push(point);
  }
  if (clean.length < 3) return polygon;
  const repaired = polygonFromCoordinates(clean);
  if (!validateParsedGeometry(repaired)) return repaired;
  const outerLoop = maximumBoundaryAfterRemovingClosedExcursions(clean);
  if (outerLoop?.length >= 3) {
    const outerLoopPolygon = polygonFromCoordinates(outerLoop);
    if (!validateParsedGeometry(outerLoopPolygon)) {
      outerLoopPolygon.repairMethod = "closed-interior-loops-removed";
      return outerLoopPolygon;
    }
  }
  // Some authorities repeat the first point exactly after an almost-identical
  // penultimate closing point. Drop only that tiny tail when it is the cause of
  // a self-crossing closure; all other source-order vertices remain untouched.
  if (clean.length >= 5) {
    const firstPoint = clean[0];
    const tailPoint = clean[clean.length - 1];
    const closureGapKm = distanceKm(
      [firstPoint.lon, firstPoint.lat],
      [tailPoint.lon, tailPoint.lat],
    );
    if (closureGapKm <= 0.25) {
      const snappedClosure = polygonFromCoordinates(clean.slice(0, -1));
      if (!validateParsedGeometry(snappedClosure)) return snappedClosure;
    }
  }
  if (clean.length === 4) {
    const angleOrdered = angleOrderedRepairPoints(unwrapRepairPoints(clean));
    const quadrilateral = polygonFromCoordinates(angleOrdered.map((point) => ({ lon: normalizeLon(point.lon), lat: point.lat })));
    if (!validateParsedGeometry(quadrilateral)) {
      quadrilateral.repairMethod = "quadrilateral-order-repaired";
      return quadrilateral;
    }
  }
  if (allowMaximumOuterBoundary) {
    const nearLoopBoundary = boundaryAfterRemovingNearClosedExcursions(clean);
    if (nearLoopBoundary?.length >= 3) {
      const nearLoopPolygon = polygonFromCoordinates(nearLoopBoundary);
      if (!validateParsedGeometry(nearLoopPolygon)) {
        nearLoopPolygon.repairMethod = "near-closed-excursion-removed";
        return nearLoopPolygon;
      }
    }
    const hull = convexHullRepairPoints(unwrapRepairPoints(uniqueRepairPoints(clean)));
    if (hull.length >= 3) {
      const maximumOuterBoundary = polygonFromCoordinates(hull.map((point) => ({ lon: normalizeLon(point.lon), lat: point.lat })));
      if (!validateParsedGeometry(maximumOuterBoundary)) {
        maximumOuterBoundary.repairMethod = "maximum-outer-boundary";
        return maximumOuterBoundary;
      }
    }
  }
  return polygon;
}

function boundaryAfterRemovingNearClosedExcursions(points, maxGapKm = 0.25) {
  let current = (points || []).map((point) => ({ lon: Number(point.lon), lat: Number(point.lat) }));
  for (let pass = 0; pass < 16; pass += 1) {
    let best = null;
    for (let start = 0; start < current.length - 2; start += 1) {
      for (let end = start + 2; end < current.length; end += 1) {
        const gapKm = distanceKm(
          [current[start].lon, current[start].lat],
          [current[end].lon, current[end].lat],
        );
        if (gapKm > maxGapKm) continue;
        const candidate = current.slice(0, start + 1).concat(current.slice(end + 1));
        if (uniqueRepairPoints(candidate).length < 3) continue;
        const removed = end - start;
        if (!best || removed < best.removed || (removed === best.removed && gapKm < best.gapKm)) {
          best = { candidate, removed, gapKm };
        }
      }
    }
    if (!best) return null;
    current = best.candidate;
    if (!validateParsedGeometry(polygonFromCoordinates(current))) return current;
  }
  return null;
}

function maximumBoundaryAfterRemovingClosedExcursions(points) {
  let current = (points || []).map((point) => ({ lon: Number(point.lon), lat: Number(point.lat) }));
  let changed = false;
  for (let pass = 0; pass < 24; pass += 1) {
    let best = null;
    for (let start = 0; start < current.length - 2; start += 1) {
      for (let end = start + 2; end < current.length; end += 1) {
        if (!sameCoordinatePair(current[start], current[end])) continue;
        const loop = current.slice(start, end);
        const remainder = current.slice(0, start + 1).concat(current.slice(end + 1));
        if (uniqueRepairPoints(loop).length < 3 || uniqueRepairPoints(remainder).length < 3) continue;
        const loopArea = Math.abs(planarRingArea(unwrapRepairPoints(uniqueRepairPoints(loop))));
        const remainderArea = Math.abs(planarRingArea(unwrapRepairPoints(uniqueRepairPoints(remainder))));
        const keep = loopArea > remainderArea ? loop : remainder;
        const discardArea = Math.min(loopArea, remainderArea);
        if (!best || discardArea < best.discardArea) best = { keep, discardArea };
      }
    }
    if (!best) break;
    current = best.keep;
    changed = true;
  }
  return changed ? current : null;
}

function uniqueRepairPoints(points) {
  const seen = new Set();
  const result = [];
  for (const point of points || []) {
    const lon = Number(point?.lon);
    const lat = Number(point?.lat);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    const key = `${Math.round(lon * 1e7)}:${Math.round(lat * 1e7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ lon, lat });
  }
  return result;
}

function unwrapRepairPoints(points) {
  if (!points.length) return [];
  const unwrapped = [];
  let previousLon = normalizeLon(points[0].lon);
  for (let index = 0; index < points.length; index += 1) {
    const lon = index === 0 ? previousLon : normalizeLonNearServer(points[index].lon, previousLon);
    previousLon = lon;
    unwrapped.push({ lon, lat: points[index].lat });
  }
  return unwrapped;
}

function repairPointSpan(points) {
  if (!points.length) return null;
  const lons = points.map((point) => point.lon);
  const lats = points.map((point) => point.lat);
  return {
    lonSpan: Math.max(...lons) - Math.min(...lons),
    latSpan: Math.max(...lats) - Math.min(...lats),
  };
}

function angleOrderedRepairPoints(points) {
  const center = points.reduce(
    (acc, point) => {
      acc.lon += point.lon;
      acc.lat += point.lat;
      return acc;
    },
    { lon: 0, lat: 0 },
  );
  center.lon /= points.length;
  center.lat /= points.length;
  return [...points].sort((a, b) => Math.atan2(a.lat - center.lat, a.lon - center.lon) - Math.atan2(b.lat - center.lat, b.lon - center.lon));
}

function convexHullRepairPoints(points) {
  const sorted = [...points].sort((a, b) => a.lon - b.lon || a.lat - b.lat);
  if (sorted.length < 3) return [];
  const lower = [];
  for (const point of sorted) {
    while (lower.length >= 2 && repairCross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && repairCross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function repairCross(a, b, c) {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function planarRingArea(points) {
  if (!points?.length) return 0;
  const origin = points[0];
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const ax = a.lon - origin.lon;
    const ay = a.lat - origin.lat;
    const bx = b.lon - origin.lon;
    const by = b.lat - origin.lat;
    area += ax * by - bx * ay;
  }
  return area / 2;
}

function corridorPolygon(points, halfWidthNm) {
  if (points.length < 2 || !Number.isFinite(halfWidthNm) || halfWidthNm <= 0) return null;
  const start = points[0];
  const end = points[1];
  const latRef = toRad((start.lat + end.lat) / 2);
  const cosLat = Math.max(Math.cos(latRef), 0.000001);
  const a = { x: start.lon * 60 * cosLat, y: start.lat * 60 };
  const b = { x: end.lon * 60 * cosLat, y: end.lat * 60 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!length) return null;
  const ox = (-dy / length) * halfWidthNm;
  const oy = (dx / length) * halfWidthNm;
  const ring = [
    xyToLonLat(a.x + ox, a.y + oy, cosLat),
    xyToLonLat(b.x + ox, b.y + oy, cosLat),
    xyToLonLat(b.x - ox, b.y - oy, cosLat),
    xyToLonLat(a.x - ox, a.y - oy, cosLat),
  ];
  ring.push([...ring[0]]);
  return { type: "Polygon", coordinates: [ring] };
}

function xyToLonLat(x, y, cosLat) {
  return [roundCoord(x / (60 * cosLat)), roundCoord(y / 60)];
}

function circlePolygon(lonDeg, latDeg, radiusNm, steps = 72) {
  const radiusM = radiusNm * 1852;
  const earthM = 6371008.8;
  const lat1 = toRad(latDeg);
  const lon1 = toRad(lonDeg);
  const d = radiusM / earthM;
  const ring = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * Math.PI * 2;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([roundCoord(normalizeLon(toDeg(lon2))), roundCoord(toDeg(lat2))]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

function geometryFromDetail(detail) {
  if (!detail) return null;
  if (detail.parsedText?.geometry) return detail.parsedText.geometry;
  if (detail.center && detail.radiusNm) return circlePolygon(detail.center.lon, detail.center.lat, detail.radiusNm);
  return null;
}

function centroidFromGeometry(geometry) {
  if (!geometry) return null;
  const coords = flattenGeometryCoordinates(geometry);
  if (!coords.length) return null;
  const sum = coords.reduce(
    (acc, coord) => {
      acc.lon += Number(coord[0]);
      acc.lat += Number(coord[1]);
      return acc;
    },
    { lon: 0, lat: 0 },
  );
  return { lon: roundCoord(sum.lon / coords.length), lat: roundCoord(sum.lat / coords.length) };
}

function flattenGeometryCoordinates(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function geometryUniqueCoordinateCount(geometry) {
  const keys = new Set();
  for (const coordinate of flattenGeometryCoordinates(geometry)) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    keys.add(`${Math.round(normalizeLon(lon) * 1e7)}:${Math.round(lat * 1e7)}`);
  }
  return keys.size;
}

function validateParsedGeometry(geometry) {
  const rings = geometryRings(geometry);
  if (!rings.length) return null;
  for (const ring of rings) {
    const metrics = ringMetrics(ring);
    if (!metrics) return "\u51e0\u4f55\u5750\u6807\u65e0\u6548\uff0c\u672a\u7ed8\u5236";
    if (metrics.lonSpan > 180 || metrics.latSpan > 180) {
      return "\u51e0\u4f55\u8de8\u5ea6\u8fc7\u5927\uff0c\u7591\u4f3c\u591a\u4e2a\u533a\u57df\u6216\u822a\u8def\u70b9\u88ab\u9519\u8fde";
    }
    if (metrics.selfIntersects) {
      return "\u5750\u6807\u987a\u5e8f\u5f62\u6210\u81ea\u4ea4\u591a\u8fb9\u5f62\uff0c\u672a\u7ed8\u5236";
    }
    if (metrics.area <= 1e-16) return "Polygon has no area; not drawn.";
  }
  const polygons = geometry?.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
  for (const polygon of polygons) {
    if (polygon?.length > 1 && !validPolygonHoles(polygon)) return "Polygon exclusions overlap or are not contained inside the outer boundary.";
  }
  return null;
}

function validPolygonHoles(rings) {
  const reference = Number(rings[0][0][0]);
  const normalized = rings.map((ring) => ring.map(([lon, lat]) => [normalizeLonNearServer(lon, reference), lat]));
  const contains = (ring, point) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  for (let i = 1; i < normalized.length; i += 1) {
    const hole = normalized[i];
    if (!hole.every((point) => contains(normalized[0], point))) return false;
    for (let j = 0; j < i; j += 1) {
      const other = normalized[j];
      if (j && (contains(other, hole[0]) || contains(hole, other[0]))) return false;
      for (let a = 1; a < hole.length; a += 1) {
        for (let b = 1; b < other.length; b += 1) {
          if (segmentsIntersect(hole[a - 1], hole[a], other[b - 1], other[b])) return false;
        }
      }
    }
  }
  return true;
}

function validateGeometryAgainstQLine(geometry, qCenter) {
  const radiusNm = Number(qCenter?.radiusNm);
  const center = qCenter?.center;
  if (!center || !Number.isFinite(radiusNm) || radiusNm <= 0 || radiusNm >= 500) return null;
  const vertices = flattenGeometryCoordinates(geometry);
  if (!vertices.length) return null;
  const distances = vertices.map((coordinate) => distanceKm([center.lon, center.lat], [Number(coordinate?.[0]), Number(coordinate?.[1])]) / 1.852);
  // Q is a search envelope, not the boundary. Some relayed notices use the
  // issuing FIR's default centre. Reject only isolated, extreme contradictions.
  if (!geometry.repairMethod && distances.filter((distance) => distance <= radiusNm * 1.25 + 5).length < Math.ceil(distances.length * 0.7)) return null;
  const maxDistanceNm = Math.max(...distances);
  const conservativeLimitNm = Math.max(radiusNm * 3, radiusNm + 25);
  if (maxDistanceNm <= conservativeLimitNm) return null;
  return `正文边界距离 Q-line 中心最远约 ${Math.round(maxDistanceNm)}NM，明显超过 ${radiusNm}NM 公告范围；疑似多个区域被错连，未绘制`;
}

function geometryRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates || [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
}

function ringMetrics(ring) {
  const clean = (Array.isArray(ring) ? ring : [])
    .map((coord) => [Number(coord?.[0]), Number(coord?.[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 4 || clean.length !== ring.length || clean.some(([lon, lat]) => Math.abs(lon) > 180 || Math.abs(lat) > 90)) return null;

  const unwrapped = [];
  let previousLon = normalizeLon(clean[0][0]);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, lat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNearServer(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, lat]);
  }

  const lons = unwrapped.map(([lon]) => lon);
  const lats = unwrapped.map(([, lat]) => lat);
  const segmentLengths = [];
  for (let index = 1; index < unwrapped.length; index += 1) {
    segmentLengths.push(distanceKm(unwrapped[index - 1], unwrapped[index]));
  }
  const sortedSegments = [...segmentLengths].sort((a, b) => a - b);
  const medianSegment = sortedSegments[Math.floor(sortedSegments.length / 2)] || 0;
  const maxSegmentKm = Math.max(0, ...segmentLengths);

  return {
    pointCount: Math.max(0, clean.length - 1),
    lonSpan: Math.max(...lons) - Math.min(...lons),
    latSpan: Math.max(...lats) - Math.min(...lats),
    maxSegmentKm,
    maxSegmentRatio: medianSegment > 0 ? maxSegmentKm / medianSegment : 0,
    minAngleDeg: minTurnAngleDeg(unwrapped),
    selfIntersects: ringSelfIntersects(unwrapped),
    area: Math.abs(planarRingArea(unwrapped.map(([lon, lat]) => ({ lon, lat })))),
  };
}

function distanceKm(a, b) {
  const earthKm = 6371.0088;
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = lat2 - lat1;
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function minTurnAngleDeg(points) {
  const open = points.length > 2 && samePoint(points[0], points[points.length - 1])
    ? points.slice(0, -1)
    : points;
  if (open.length < 3) return 180;
  let minAngle = 180;
  for (let index = 0; index < open.length; index += 1) {
    const a = open[(index - 1 + open.length) % open.length];
    const b = open[index];
    const c = open[(index + 1) % open.length];
    if (samePoint(a, b) || samePoint(b, c)) continue;
    const latRef = toRad(b[1]);
    const v1 = [(a[0] - b[0]) * Math.cos(latRef), a[1] - b[1]];
    const v2 = [(c[0] - b[0]) * Math.cos(latRef), c[1] - b[1]];
    const n1 = Math.hypot(v1[0], v1[1]);
    const n2 = Math.hypot(v2[0], v2[1]);
    if (!n1 || !n2) continue;
    const cos = Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)));
    minAngle = Math.min(minAngle, (Math.acos(cos) * 180) / Math.PI);
  }
  return minAngle;
}

function ringSelfIntersects(points) {
  const lastIndex = points.length - 1;
  for (let a = 0; a < lastIndex; a += 1) {
    for (let b = a + 1; b < lastIndex; b += 1) {
      if (Math.abs(a - b) <= 1) continue;
      if (a === 0 && b === lastIndex - 1) continue;
      if (segmentsIntersect(points[a], points[a + 1], points[b], points[b + 1])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const s1 = orientationSign(o1);
  const s2 = orientationSign(o2);
  const s3 = orientationSign(o3);
  const s4 = orientationSign(o4);
  if (s1 && s2 && s3 && s4 && s1 !== s2 && s3 !== s4) return true;
  if (!s1 && pointOnSegment(a, b, c)) return true;
  if (!s2 && pointOnSegment(a, b, d)) return true;
  if (!s3 && pointOnSegment(c, d, a)) return true;
  if (!s4 && pointOnSegment(c, d, b)) return true;
  return false;
}

function orientationSign(value) {
  const epsilon = 1e-14;
  return value > epsilon ? 1 : value < -epsilon ? -1 : 0;
}

function pointOnSegment(a, b, point) {
  const epsilon = 1e-10;
  return (
    point[0] >= Math.min(a[0], b[0]) - epsilon &&
    point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon &&
    point[1] <= Math.max(a[1], b[1]) + epsilon
  );
}

function orientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function normalizeLonNearServer(value, reference) {
  let lon = normalizeLon(value);
  while (lon - reference > 180) lon -= 360;
  while (lon - reference < -180) lon += 360;
  return lon;
}

function extractHtmlRows(html) {
  const rows = [];
  for (const rowMatch of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [];
    for (const cellMatch of rowMatch[0].matchAll(/<td\b[\s\S]*?<\/td>/gi)) {
      const value = stripHtml(cellMatch[0]).replace(/\s+/g, " ").trim();
      if (value) cells.push(value);
    }
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function firstRowValue(rows, label) {
  const wanted = normalizeLabel(label);
  for (const cells of rows) {
    const index = cells.findIndex((cell) => normalizeLabel(cell).includes(wanted));
    if (index < 0) continue;
    const value = cells.slice(index + 1).find((cell) => normalizeLabel(cell) !== wanted);
    if (value) return cleanValue(value);
  }
  return null;
}

function normalizeLabel(value) {
  return String(value || "")
    .replace(/\s*:\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+:/g, ":")
    .trim();
}

function stripHtml(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(tr|table|p|dl|dt|div|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function summarizeNotamPlainText(plain) {
  const eField = plain.match(/\bE\)\s*([\s\S]{20,500}?)(?=\s+[FG]\)|$)/i)?.[1];
  const source = eField || plain;
  return source.replace(/\s+/g, " ").trim().slice(0, 180) || "FAA NOTAM";
}

function makeTimeLabel(detail, fallback) {
  if (detail?.beginDate || detail?.endDate) return makeParsedTimeLabel(detail.beginDate, detail.endDate);
  return fallback || null;
}

function makeParsedTimeLabel(beginAt, endAt) {
  if (beginAt && endAt) return `${beginAt} to ${endAt}`;
  if (beginAt) return `From ${beginAt}`;
  if (endAt) return `Until ${endAt}`;
  return null;
}

function parseFaaHumanDate(value) {
  if (!value) return null;
  const match = String(value).match(/([A-Za-z]+ \d{1,2}, \d{4}) at (\d{4}) UTC/i);
  if (!match) return value;
  const parsed = new Date(`${match[1]} ${match[2].slice(0, 2)}:${match[2].slice(2)} UTC`);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function parseFaaSearchDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^(PERM|EST)$/i.test(text)) return text.toUpperCase();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2})(\d{2})(?:\s*([A-Z]{2,4}))?$/i);
  if (!match) return text;
  const parsed = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), Number(match[4]), Number(match[5])));
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function parseFaaCompactDate(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`;
}

function parseIcaoDate(value) {
  if (!value) return null;
  const year = Number(value.slice(0, 2));
  const fullYear = year >= 70 ? 1900 + year : 2000 + year;
  return `${fullYear}-${value.slice(2, 4)}-${value.slice(4, 6)}T${value.slice(6, 8)}:${value.slice(8, 10)}:00Z`;
}

function getNotamIdFromGeoFeature(feature) {
  const raw = feature?.properties?.NOTAM_KEY || feature?.id || "";
  return String(raw).match(/\d\/\d{4}/)?.[0] || null;
}

function buildFilters(restrictions) {
  const countries = new Map();
  const regions = new Map();
  const states = new Map();
  const categories = new Map();
  for (const item of restrictions) {
    addCount(countries, item.country || "Unknown");
    addCount(regions, item.region || "Unknown", item.regionName || item.region || "Unknown");
    if (item.state) addCount(states, item.state);
    addCount(categories, item.category || item.type || "Unknown");
  }
  return {
    countries: mapToFilterList(countries),
    regions: mapToFilterList(regions),
    states: mapToFilterList(states),
    categories: mapToFilterList(categories),
  };
}

function addCount(map, key, label = key) {
  if (!key) return;
  const current = map.get(key) || { id: key, label, count: 0 };
  current.count += 1;
  map.set(key, current);
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function mapToFilterList(map) {
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function compareRestrictions(a, b) {
  const aNew = a.isNew ? 1 : 0;
  const bNew = b.isNew ? 1 : 0;
  if (aNew !== bNew) return bNew - aNew;
  return String(b.modifiedAt || b.beginsAt || "").localeCompare(String(a.modifiedAt || a.beginsAt || ""));
}

function isRecentIso(value, hours) {
  if (!value || !String(value).includes("T")) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && Date.now() - timestamp <= hours * 60 * 60 * 1000;
}

function buildSourceDescription() {
  return {
    tfr: {
      status: "official_live",
      message: "FAA Graphic TFR data is read from FAA tfrapi and GeoServer WFS.",
      urls: {
        list: TFR_LIST_URL,
        summary: TFR_SUMMARY_URL,
        noShape: TFR_NOSHAPE_URL,
        geojson: TFR_GEOJSON_URL,
        detail: `${TFR_WEBTEXT_URL}{NOTAM_ID}`,
      },
    },
    faaNotamSearch: {
      status: "official_live",
      message:
        `FAA NOTAM Search live JSON uses the official nsapp.html multi-designator query and paginates every returned record. Transport=${FAA_NOTAM_TRANSPORT}, discoveryConcurrency=${FAA_NOTAM_DISCOVERY_CONCURRENCY}, fetchConcurrency=${FAA_NOTAM_FIR_CONCURRENCY}, batchSize=${FAA_NOTAM_BATCH_SIZE}, adaptiveBatchSize=${FAA_NOTAM_ADAPTIVE_BATCH_SIZE}, adaptiveConcurrency=${FAA_NOTAM_ADAPTIVE_CONCURRENCY}, requestInterval=${FAA_NOTAM_REQUEST_INTERVAL_MS}ms, requestRetries=${FAA_NOTAM_REQUEST_RETRY_ATTEMPTS}, powershellRecoveryWorkers=${FAA_NOTAM_POWERSHELL_CONCURRENCY}, powershellPageDelay=${FAA_NOTAM_POWERSHELL_PAGE_DELAY_MS}ms, retryConcurrency=${FAA_NOTAM_RETRY_CONCURRENCY}, workerStagger=${FAA_NOTAM_POWERSHELL_STAGGER_MS}ms, maxFailedFirs=${FAA_NOTAM_MAX_FAILED_FIRS}, pageDelay=${FAA_NOTAM_PAGE_DELAY_MS}ms.`,
      urls: {
        app: FAA_NOTAM_SEARCH_URL,
        searchEndpoint: FAA_NOTAM_SEARCH_ENDPOINT,
        locationEndpoint: FAA_NOTAM_LOCS_ENDPOINT,
      },
    },
    ngaHydropac: {
      status: "official_live",
      message: "NGA MSI HYDROPAC navigational warnings are queried independently from the official Broadcast Warnings API.",
      urls: {
        app: NGA_MSI_NAV_WARNINGS_URL,
        activeEndpoint: NGA_MSI_HYDROPAC_ACTIVE_URL,
        currentTextPage: HYDROPAC_CURRENT_TEXT_URL,
      },
    },
    chinaMsaNavWarnings: {
      status: "official_live",
      message: "China MSA navigational warnings are queried from the official MSA warning columns and parsed only when a closed coordinate boundary is present.",
      urls: {
        app: MSA_NAV_WARNING_URL,
      },
      maxPagesPerBureau: MSA_NAV_WARNING_MAX_PAGES_PER_BUREAU,
      lookbackDays: MSA_NAV_WARNING_LOOKBACK_DAYS,
    },
    navareaWarnings: {
      status: "official_live",
      message: "NAVAREA I, II, IV, VIII, XI, XII and XIII active navigational warnings are queried from SeaLagom NAVAREA active pages, with NGA Broadcast Warnings API supplement for NAVAREA IV and XII.",
      urls: {
        app: `${SEALAGOM_NAVAREA_BASE_URL}/navarea/`,
        ngaApp: NGA_MSI_NAV_WARNINGS_URL,
      },
      regions: NAVAREA_WARNING_REGIONS.map((item) => item.label),
      maxPagesPerRegion: NAVAREA_MAX_PAGES_PER_REGION,
    },
    cloudSatellite: {
      status: "official_live",
      message:
        "NOAA NESDIS GMGSI hourly global geostationary satellite mosaic is decoded locally into Web Mercator cloud tiles with adjustable opacity.",
      urls: {
        bucket: NOAA_GMGSI_BUCKET_URL,
        productPrefix: `${NOAA_GMGSI_BUCKET_URL}/${NOAA_GMGSI_PRODUCT_PREFIX}/`,
        localTileTemplate: "/api/cloud-satellite/tile/{z}/{y}/{x}?hour={hour}",
      },
      layer: NOAA_GMGSI_PRODUCT_PREFIX,
      opacity: CLOUD_OVERLAY_DEFAULT_OPACITY,
      maxZoom: NOAA_GMGSI_TILE_MAX_ZOOM,
    },
    launchLibrary: {
      status: "official_live",
      message: "Worldwide rocket launch forecasts are queried from The Space Devs Launch Library 2 upcoming launches API.",
      urls: {
        app: LAUNCH_LIBRARY_APP_URL,
        upcomingEndpoint: `${LAUNCH_LIBRARY_UPCOMING_URL}?format=json&mode=detailed&ordering=net`,
      },
    },
  };
}

function countryFromState(state) {
  if (!state) return "United States";
  const upper = String(state).toUpperCase();
  if (upper === "PR") return "Puerto Rico";
  if (upper === "GU") return "Guam";
  if (upper === "USA") return "United States";
  return "United States";
}

function countryFromFaaCountryCode(country) {
  const code = String(country || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function countryFromFacility(facility) {
  if (!facility) return "Unknown";
  const code = String(facility).toUpperCase();
  if (/^(ZBPE|ZYSH|ZSHA|ZGZU|ZJSA|ZHWH|ZLHW|ZPKM|ZWUQ)$/.test(code)) return "China";
  if (/^VHHK/.test(code)) return "Hong Kong";
  if (/^VMMC/.test(code)) return "Macau";
  if (/^PG/.test(code)) return "Guam";
  if (/^KZ/.test(code)) return "United States / Pacific Oceanic";
  if (/^PA/.test(code)) return "Alaska / Arctic Oceanic";
  if (/^PH/.test(code)) return "Hawaii / Pacific Oceanic";
  if (/^RCAA/.test(code)) return "Taiwan";
  if (/^RK/.test(code)) return "South Korea";
  if (/^RJ/.test(code)) return "Japan";
  if (/^RP/.test(code)) return "Philippines";
  if (/^ZK/.test(code)) return "North Korea";
  if (/^ZM/.test(code)) return "Mongolia";
  if (/^UAAA/.test(code)) return "Kazakhstan";
  if (/^UCF/.test(code)) return "Kyrgyzstan";
  if (/^UTSD/.test(code)) return "Uzbekistan";
  if (/^UTAA/.test(code)) return "Turkmenistan";
  if (/^UTDD/.test(code)) return "Tajikistan";
  if (/^U/.test(code)) return "Russia";
  if (/^VN/.test(code)) return "Nepal";
  if (/^VQ/.test(code)) return "Bhutan";
  if (/^(VA|VE|VI|VO)/.test(code)) return "India";
  if (/^VG/.test(code)) return "Bangladesh";
  if (/^VC/.test(code)) return "Sri Lanka";
  if (/^VR/.test(code)) return "Maldives";
  if (/^OP/.test(code)) return "Pakistan";
  if (/^OA/.test(code)) return "Afghanistan";
  if (/^VY/.test(code)) return "Myanmar";
  if (/^VL/.test(code)) return "Laos";
  if (/^VT/.test(code)) return "Thailand";
  if (/^VV/.test(code)) return "Vietnam";
  if (/^VD/.test(code)) return "Cambodia";
  if (/^WS/.test(code)) return "Singapore";
  if (/^(WM|WB)/.test(code)) return "Malaysia";
  if (/^W/.test(code)) return "Indonesia";
  if (/^Y/.test(code)) return "Australia";
  if (/^CZ/.test(code)) return "Canada / Pacific";
  if (/^MM/.test(code)) return "Mexico / Pacific";
  if (/^MH/.test(code)) return "Central America";
  if (/^MP/.test(code)) return "Panama";
  if (/^SK/.test(code)) return "Colombia";
  if (/^SE/.test(code)) return "Ecuador";
  if (/^SP/.test(code)) return "Peru";
  if (/^SC/.test(code)) return "Chile";
  if (/^SA/.test(code)) return "Argentina";
  if (/^NFFF/.test(code)) return "Fiji";
  if (/^NZ/.test(code)) return "New Zealand / Oceanic";
  if (/^NWWW/.test(code)) return "New Caledonia";
  if (/^NT/.test(code)) return "French Polynesia";
  if (/^NV/.test(code)) return "Vanuatu";
  if (/^NS/.test(code)) return "Samoa / American Samoa";
  if (/^NFTF/.test(code)) return "Tonga";
  if (/^NG/.test(code) || /^PLCH/.test(code)) return "Kiribati";
  if (/^NCRG/.test(code)) return "Cook Islands";
  if (/^NIUE/.test(code)) return "Niue";
  if (/^PK/.test(code)) return "Marshall Islands";
  if (/^PW/.test(code)) return "Wake Island";
  if (/^AG/.test(code)) return "Solomon Islands";
  if (/^AN/.test(code)) return "Nauru";
  if (/^AY/.test(code)) return "Papua New Guinea";
  if (/^FI/.test(code)) return "Mauritius";
  if (/^FM/.test(code)) return "Madagascar";
  if (/^FS/.test(code)) return "Seychelles";
  if (/^HC/.test(code)) return "Somalia";
  if (/^HK/.test(code)) return "Kenya";
  if (/^HT/.test(code)) return "Tanzania";
  if (/^OO/.test(code)) return "Oman";
  if (/^OI/.test(code)) return "Iran";
  if (/^LT/.test(code)) return "Türkiye";
  if (/^OK/.test(code)) return "Kuwait";
  if (/^OM/.test(code)) return "United Arab Emirates";
  if (/^OB/.test(code)) return "Bahrain";
  if (/^OE/.test(code)) return "Saudi Arabia";
  if (/^OT/.test(code)) return "Qatar";
  if (/^OR/.test(code)) return "Iraq";
  if (/^OY/.test(code)) return "Yemen";
  if (/^HA/.test(code)) return "Ethiopia";
  if (/^HE/.test(code)) return "Egypt";
  if (/^FQ/.test(code)) return "Mozambique";
  if (/^FA/.test(code)) return "South Africa";
  const prefix = code.slice(0, 1);
  if (prefix === "K") return "United States";
  if (prefix === "C") return "Canada";
  if (prefix === "E") return "Europe";
  if (prefix === "V") return "South / Southeast Asia";
  if (prefix === "N" || prefix === "A") return "Pacific";
  if (prefix === "R") return "East Asia";
  if (prefix === "O") return "Middle East";
  if (prefix === "F" || prefix === "H" || prefix === "D" || prefix === "G") return "Africa";
  if (prefix === "S") return "South America";
  return "Unknown";
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function getCloudSatelliteInfoLegacy({ refresh = false, date = "", time = "" } = {}) {
  const selection = normalizeCloudSelection(date, time);
  const cacheKey = `v2:nasa-gibs:${NASA_GIBS_CLOUD_LAYER}:${selection.tileDate}:${selection.requestedLocalTime}`;
  const cached = cloudSatelliteCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;

  const generatedAt = new Date().toISOString();
  let sourceError = "";
  let sampleTile = null;
  try {
    sampleTile = await fetchCloudSatelliteTile(2, 1, 1, {
      date: selection.tileDate,
      preferCache: false,
      timeoutMs: 20000,
    });
    if (sampleTile?.empty) sourceError = `no global imagery tile is available for ${selection.tileDate}`;
  } catch (error) {
    sourceError = [sourceError, `sample tile: ${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join("; ");
  }

  const sourceServerDate = sampleTile?.sourceDate ? new Date(sampleTile.sourceDate).toISOString() : null;
  const currentRefreshAt = `${selection.tileDate}T00:00:00Z`;
  const data = {
    generatedAt,
    dataVersion: `${cacheKey}:${currentRefreshAt}`,
    tileTemplate: `/api/cloud-satellite/tile/{z}/{y}/{x}?date=${selection.tileDate}`,
    opacity: CLOUD_OVERLAY_DEFAULT_OPACITY,
    maxZoom: NASA_GIBS_CLOUD_TILE_MAX_ZOOM,
    layer: NASA_GIBS_CLOUD_LAYER,
    tileDate: selection.tileDate,
    requestedLocalTime: selection.requestedLocalTime,
    requestedTimeZone: selection.timeZone,
    source: {
      status: sourceError && (!sampleTile || sampleTile.empty) ? "error" : "ok",
      message: sourceError && (!sampleTile || sampleTile.empty)
        ? `卫星云图源暂时不可用：${sourceError}`
        : "NASA GIBS global Web Mercator imagery loaded. The selected clock time is retained in the UI; this global layer is served by available imagery date.",
      provider: "NASA Global Imagery Browse Services (GIBS)",
      serviceUrl: NASA_GIBS_CLOUD_TILE_BASE_URL,
      capabilitiesUrl: NASA_GIBS_CLOUD_CAPABILITIES_URL,
      layer: NASA_GIBS_CLOUD_LAYER,
      tileMatrixSet: NASA_GIBS_CLOUD_TILE_MATRIX_SET,
      serviceDescription: "VIIRS Suomi NPP Corrected Reflectance True Color global satellite imagery",
      coverage: "Global Web Mercator coverage between 85.051129°S and 85.051129°N",
      updateCadence: "daily global product; selected time is mapped to the requested date",
      opacity: CLOUD_OVERLAY_DEFAULT_OPACITY,
      maxZoom: NASA_GIBS_CLOUD_TILE_MAX_ZOOM,
      fetchedAt: generatedAt,
      currentRefreshAt,
      sourceServerDate,
      tileDate: selection.tileDate,
      requestedLocalTime: selection.requestedLocalTime,
      requestedTimeZone: selection.timeZone,
      sourceError,
    },
  };
  cloudSatelliteCache.set(cacheKey, { expiresAt: Date.now() + CLOUD_SOURCE_CACHE_TTL_MS, data });
  return data;
}

function normalizeCloudSelection(date, time) {
  const now = new Date();
  const fallbackDate = now.toISOString().slice(0, 10);
  const cleanDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? String(date) : fallbackDate;
  const cleanTime = /^\d{2}:\d{2}$/.test(String(time || "")) ? String(time) : "00:00";
  return {
    tileDate: cleanDate,
    requestedLocalTime: `${cleanDate} ${cleanTime}`,
    timeZone: "Asia/Shanghai",
  };
}

async function sendCloudSatelliteTileLegacy(res, pathname, searchParams = new URLSearchParams()) {
  const match = String(pathname || "").match(/^\/api\/cloud-satellite\/tile\/(\d{1,2})\/(\d+)\/(\d+)$/);
  if (!match) {
    sendJson(res, 404, { error: "cloud_tile_not_found" });
    return;
  }
  const z = Number(match[1]);
  const y = Number(match[2]);
  const x = Number(match[3]);
  const n = 2 ** z;
  const selection = normalizeCloudSelection(searchParams.get("date"), searchParams.get("time"));
  if (!Number.isInteger(z) || z < 0 || z > NASA_GIBS_CLOUD_TILE_MAX_ZOOM || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    sendJson(res, 400, { error: "invalid_cloud_tile" });
    return;
  }

  try {
    const tile = await fetchCloudSatelliteTile(z, y, x, { date: selection.tileDate });
    res.writeHead(200, {
      "content-type": tile.contentType || "image/jpeg",
      "cache-control": "public, max-age=300",
      "x-cloud-tile-date": selection.tileDate,
      "x-cloud-source-date": tile.sourceDate || "",
      "x-cloud-fetched-at": tile.fetchedAt,
      "x-cloud-render-version": CLOUD_RENDER_STYLE_VERSION,
      "access-control-allow-origin": "*",
    });
    res.end(tile.buffer);
  } catch (error) {
    sendJson(res, 502, {
      error: "cloud_tile_fetch_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fetchCloudSatelliteTileLegacy(z, y, x, options = {}) {
  const selection = normalizeCloudSelection(options.date, options.time);
  const key = `${selection.tileDate}/${z}/${y}/${x}`;
  const cached = cloudTileCache.get(key);
  if (options.preferCache !== false && cached && cached.expiresAt > Date.now()) return cached.tile;

  const url = `${NASA_GIBS_CLOUD_TILE_BASE_URL}/${NASA_GIBS_CLOUD_LAYER}/default/${selection.tileDate}/${NASA_GIBS_CLOUD_TILE_MATRIX_SET}/${z}/${y}/${x}.${NASA_GIBS_CLOUD_TILE_EXTENSION}`;
  const fetchedAt = new Date().toISOString();
  let response = null;
  try {
    response = await fetchBinaryAllowExpiredCertificate(url, options.timeoutMs || 20000);
  } catch (error) {
    if (error instanceof Error && /^HTTP 404\b/.test(error.message)) {
      const tile = transparentCloudTile(fetchedAt);
      cloudTileCache.set(key, { expiresAt: Date.now() + CLOUD_TILE_CACHE_TTL_MS, tile });
      return tile;
    }
    throw error;
  }
  if (!/^image\//i.test(response.contentType || "")) throw new Error(`cloud tile returned ${response.statusCode} ${response.contentType || "unknown content type"}`);
  const tile = {
    buffer: response.buffer,
    contentType: response.contentType,
    sourceDate: response.headers.date || null,
    fetchedAt,
    etag: response.headers.etag || null,
  };
  cloudTileCache.set(key, { expiresAt: Date.now() + CLOUD_TILE_CACHE_TTL_MS, tile });
  return tile;
}

function transparentCloudTile(fetchedAt) {
  return {
    buffer: TRANSPARENT_CLOUD_TILE_BUFFER,
    contentType: "image/svg+xml",
    sourceDate: null,
    fetchedAt,
    etag: null,
    empty: true,
  };
}

async function getCloudSatelliteInfo({ refresh = false, slot = "", hour = "" } = {}) {
  const timeline = await getCloudTimeline({ refresh });
  const selected = selectCloudTimelineItem(timeline, { slot, hour });
  const cacheKey = `${CLOUD_RENDER_STYLE_VERSION}:${selected?.hourId || "none"}`;
  const cached = cloudSatelliteCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now()) return cached.data;

  const generatedAt = new Date().toISOString();
  const sourceError = selected ? "" : "No recent GMGSI imagery hour was found.";
  const selectedAgeHours = selected ? Math.max(0, (Date.now() - Date.parse(selected.timeUtc || "")) / (60 * 60 * 1000)) : Infinity;
  const stale = Number.isFinite(selectedAgeHours) && selectedAgeHours > 6;
  const data = {
    generatedAt,
    dataVersion: `${cacheKey}:${generatedAt}`,
    tileTemplate: selected ? `/api/cloud-satellite/tile/{z}/{y}/{x}?hour=${selected.hourId}` : "/api/cloud-satellite/tile/{z}/{y}/{x}",
    globeTexture: selected ? `/api/cloud-satellite/globe-texture?hour=${selected.hourId}` : "/api/cloud-satellite/globe-texture",
    opacity: CLOUD_OVERLAY_DEFAULT_OPACITY,
    maxZoom: NOAA_GMGSI_TILE_MAX_ZOOM,
    layer: NOAA_GMGSI_PRODUCT_PREFIX,
    renderVersion: CLOUD_RENDER_STYLE_VERSION,
    timeline,
    selectedSlot: selected?.index ?? 0,
    selectedHour: selected?.hourId || "",
    selectedTimeUtc: selected?.timeUtc || null,
    selectedTimeBeijing: selected?.timeBeijing || "",
    source: {
      status: selected ? (stale ? "warn" : "ok") : "error",
      message: selected
        ? stale
          ? `NOAA GMGSI latest discoverable imagery is ${Math.floor(selectedAgeHours)} hours old; the most recent ${NOAA_GMGSI_TIMELINE_HOURS} available hourly nodes are shown.`
          : `NOAA GMGSI hourly global geostationary satellite mosaic loaded. The time slider uses the latest available hour and the previous ${NOAA_GMGSI_TIMELINE_HOURS - 1} hourly nodes.`
        : `Cloud satellite imagery source is temporarily unavailable: ${sourceError}`,
      provider: "NOAA NESDIS Global Mosaic of Geostationary Satellite Imagery (GMGSI)",
      serviceUrl: NOAA_GMGSI_BUCKET_URL,
      layer: NOAA_GMGSI_PRODUCT_PREFIX,
      serviceDescription: "Global longwave infrared geostationary satellite mosaic",
      coverage: `Global mosaic; valid geostationary coverage approximately ${Math.abs(NOAA_GMGSI_LAT_SOUTH).toFixed(1)}S to ${NOAA_GMGSI_LAT_NORTH.toFixed(1)}N, transparent outside source coverage`,
      updateCadence: "hourly",
      opacity: CLOUD_OVERLAY_DEFAULT_OPACITY,
      maxZoom: NOAA_GMGSI_TILE_MAX_ZOOM,
      fetchedAt: generatedAt,
      currentRefreshAt: selected?.timeUtc || generatedAt,
      tileDate: selected?.hourId || "",
      selectedHour: selected?.hourId || "",
      selectedTimeUtc: selected?.timeUtc || null,
      selectedTimeBeijing: selected?.timeBeijing || "",
      sourceError,
      renderVersion: CLOUD_RENDER_STYLE_VERSION,
    },
  };
  cloudSatelliteCache.set(cacheKey, { expiresAt: Date.now() + CLOUD_SOURCE_CACHE_TTL_MS, data });
  return data;
}

async function getCloudTimeline({ refresh = false } = {}) {
  const cacheKey = `${CLOUD_RENDER_STYLE_VERSION}:timeline`;
  const cached = cloudSatelliteCache.get(cacheKey);
  if (!refresh && cached && cached.expiresAt > Date.now() && isCurrentGmgsiTimeline(cached.data)) return cached.data;

  const localCache = readGmgsiTimelineDiskCache();
  const localTimeline = localCache?.timeline?.length ? localCache.timeline : buildGmgsiTimelineFromCachedFiles();
  const localCacheAgeMs = Date.now() - Date.parse(localCache?.savedAt || "");
  if (!refresh && Number.isFinite(localCacheAgeMs) && localCacheAgeMs <= GMGSI_TIMELINE_DISK_MAX_AGE_MS && isCurrentGmgsiTimeline(localTimeline)) {
    const timeline = normalizeGmgsiTimeline(localTimeline);
    cloudSatelliteCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: timeline });
    return timeline;
  }

  let found = [];
  try {
    found = await discoverGmgsiTimelineFast();
  } catch {
    found = [];
  }
  const timeline = found.length ? found : localTimeline.length ? localTimeline : [];
  if (found.length) writeGmgsiTimelineDiskCache(timeline);
  cloudSatelliteCache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, data: timeline });
  return timeline;
}

async function discoverGmgsiTimelineFast() {
  const candidates = buildCandidateUtcHours(NOAA_GMGSI_DISCOVERY_LOOKBACK_HOURS);
  const found = [];
  const batchSize = 12;
  for (let offset = 0; offset < candidates.length && found.length < NOAA_GMGSI_TIMELINE_HOURS; offset += batchSize) {
    const batch = candidates.slice(offset, offset + batchSize);
    const results = await mapLimit(batch, batchSize, (hourDate) => findGmgsiHour(hourDate, 6000));
    found.push(...results.filter(Boolean));
  }
  return found
    .filter(Boolean)
    .sort((a, b) => String(b.hourId).localeCompare(String(a.hourId)))
    .slice(0, NOAA_GMGSI_TIMELINE_HOURS)
    .map((item, index) => ({ ...item, index, ageHours: index }));
}

function isCurrentGmgsiTimeline(timeline) {
  const normalized = normalizeGmgsiTimeline(timeline);
  if (!normalized.length) return false;
  const newestMs = Date.parse(normalized[0].timeUtc || "");
  if (!Number.isFinite(newestMs)) return false;
  return Date.now() - newestMs <= 6 * 60 * 60 * 1000 && normalized.length >= Math.min(24, NOAA_GMGSI_TIMELINE_HOURS);
}

function readGmgsiTimelineDiskCache() {
  try {
    if (!existsSync(GMGSI_TIMELINE_CACHE_FILE)) return null;
    const wrapped = JSON.parse(readFileSync(GMGSI_TIMELINE_CACHE_FILE, "utf8"));
    const timeline = normalizeGmgsiTimeline(wrapped.timeline || wrapped.data || []);
    return timeline.length ? { savedAt: wrapped.savedAt || null, timeline } : null;
  } catch {
    return null;
  }
}

function writeGmgsiTimelineDiskCache(timeline) {
  try {
    const normalized = normalizeGmgsiTimeline(timeline);
    if (!normalized.length) return;
    mkdirSync(join(dataDirectory, "cloud_cache"), { recursive: true });
    writeFileSync(GMGSI_TIMELINE_CACHE_FILE, JSON.stringify({ savedAt: new Date().toISOString(), timeline: normalized }), "utf8");
  } catch {
    // Cloud timeline cache is only a startup accelerator.
  }
}

function normalizeGmgsiTimeline(timeline) {
  return (Array.isArray(timeline) ? timeline : [])
    .filter((item) => /^\d{10}$/.test(String(item?.hourId || "")))
    .sort((a, b) => String(b.hourId).localeCompare(String(a.hourId)))
    .slice(0, NOAA_GMGSI_TIMELINE_HOURS)
    .map((item, index) => ({
      ...gmgsiTimelineItemFromHourId(item.hourId),
      ...item,
      index,
      ageHours: index,
      cached: Boolean(item.cached || hasUsableGmgsiFile(item)),
    }));
}

function buildGmgsiTimelineFromCachedFiles() {
  try {
    const cacheDir = join(dataDirectory, "cloud_cache", "gmgsi");
    if (!existsSync(cacheDir)) return [];
    const hourIds = readdirSync(cacheDir)
      .map((name) => String(name).match(/^(\d{10})\.nc$/)?.[1])
      .filter(Boolean)
      .filter((hourId) => hasUsableGmgsiFile({ hourId }))
      .sort((a, b) => String(b).localeCompare(String(a)));
    if (!hourIds.length) return [];
    return hourIds.slice(0, NOAA_GMGSI_TIMELINE_HOURS).map((hourId, index) => ({
      ...gmgsiTimelineItemFromHourId(hourId, index),
      cached: true,
    }));
  } catch {
    return [];
  }
}

function buildSyntheticGmgsiTimeline() {
  return buildCandidateUtcHours(NOAA_GMGSI_TIMELINE_HOURS).map((date, index) => gmgsiTimelineItemFromDate(date, index));
}

function buildGmgsiTimelineFromAnchor(hourId) {
  const anchor = parseGmgsiHourId(hourId) || new Date();
  return buildCandidateUtcHours(NOAA_GMGSI_TIMELINE_HOURS, anchor).map((date, index) => gmgsiTimelineItemFromDate(date, index));
}

function buildCandidateUtcHours(count, anchor = new Date()) {
  const now = new Date(anchor);
  now.setUTCMinutes(0, 0, 0);
  return Array.from({ length: count }, (_, index) => new Date(now.getTime() - index * 60 * 60 * 1000));
}

function parseGmgsiHourId(hourId) {
  const text = String(hourId || "");
  const match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), 0, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function gmgsiTimelineItemFromDate(hourDate, index = 0) {
  const yyyy = String(hourDate.getUTCFullYear());
  const mm = String(hourDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(hourDate.getUTCDate()).padStart(2, "0");
  const hh = String(hourDate.getUTCHours()).padStart(2, "0");
  return gmgsiTimelineItemFromHourId(`${yyyy}${mm}${dd}${hh}`, index);
}

function gmgsiTimelineItemFromHourId(hourId, index = 0) {
  const text = String(hourId || "").replace(/\D/g, "").slice(0, 10);
  const yyyy = text.slice(0, 4);
  const mm = text.slice(4, 6);
  const dd = text.slice(6, 8);
  const hh = text.slice(8, 10);
  const prefix = `${NOAA_GMGSI_PRODUCT_PREFIX}/${yyyy}/${mm}/${dd}/${hh}/`;
  const key = `${prefix}GLOBCOMPLIR_nc.${text}`;
  const timeUtc = `${yyyy}-${mm}-${dd}T${hh}:00:00Z`;
  return {
    index,
    ageHours: index,
    hourId: text,
    key,
    url: `${NOAA_GMGSI_BUCKET_URL}/${key}`,
    timeUtc,
    timeBeijing: formatBeijingHour(timeUtc),
    label: `${formatBeijingHour(timeUtc)} / UTC ${yyyy}-${mm}-${dd} ${hh}:00`,
    cached: false,
  };
}

async function findGmgsiHour(hourDate, timeoutMs = 15000) {
  const yyyy = String(hourDate.getUTCFullYear());
  const mm = String(hourDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(hourDate.getUTCDate()).padStart(2, "0");
  const hh = String(hourDate.getUTCHours()).padStart(2, "0");
  const prefix = `${NOAA_GMGSI_PRODUCT_PREFIX}/${yyyy}/${mm}/${dd}/${hh}/`;
  const url = `${NOAA_GMGSI_BUCKET_URL}/?list-type=2&max-keys=10&prefix=${encodeURIComponent(prefix)}`;
  try {
    const xml = await fetchText(url, timeoutMs);
    const keys = Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g)).map((match) => decodeXmlEntity(match[1]));
    const key = keys.find((item) => /GLOBCOMPLIR.*\.nc$/i.test(item) || /GLOBCOMPLIR_nc\.\d{10}$/i.test(item));
    if (!key) return null;
    const hourId = `${yyyy}${mm}${dd}${hh}`;
    const timeUtc = `${yyyy}-${mm}-${dd}T${hh}:00:00Z`;
    return {
      index: 0,
      hourId,
      key,
      url: `${NOAA_GMGSI_BUCKET_URL}/${key}`,
      timeUtc,
      timeBeijing: formatBeijingHour(timeUtc),
      label: `${formatBeijingHour(timeUtc)} / UTC ${yyyy}-${mm}-${dd} ${hh}:00`,
    };
  } catch {
    return null;
  }
}

function selectCloudTimelineItem(timeline, { slot = "", hour = "" } = {}) {
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const cleanHour = String(hour || "").replace(/\D/g, "").slice(0, 10);
  if (cleanHour) {
    const found = timeline.find((item) => item.hourId === cleanHour);
    if (found) return found;
    return null;
  }
  const index = clampNumber(Number.parseInt(String(slot || "0"), 10), 0, timeline.length - 1);
  return timeline[index] || timeline[0];
}

function formatBeijingHour(iso) {
  const date = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:00 北京时间`;
}

function decodeXmlEntity(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function sendCloudSatelliteTile(res, pathname, searchParams = new URLSearchParams()) {
  const match = String(pathname || "").match(/^\/api\/cloud-satellite\/tile\/(\d{1,2})\/(\d+)\/(\d+)$/);
  if (!match) {
    sendJson(res, 404, { error: "cloud_tile_not_found" });
    return;
  }
  const z = Number(match[1]);
  const y = Number(match[2]);
  const x = Number(match[3]);
  const n = 2 ** z;
  if (!Number.isInteger(z) || z < 0 || z > NOAA_GMGSI_TILE_MAX_ZOOM || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= n || y >= n) {
    sendJson(res, 400, { error: "invalid_cloud_tile" });
    return;
  }

  try {
    const tile = await fetchCloudSatelliteTile(z, y, x, {
      slot: searchParams.get("slot"),
      hour: searchParams.get("hour"),
    });
    res.writeHead(200, {
      "content-type": tile.contentType || "image/png",
      "cache-control": "public, max-age=300",
      "x-cloud-hour": tile.hourId || "",
      "x-cloud-source-date": tile.sourceDate || "",
      "x-cloud-fetched-at": tile.fetchedAt,
      "access-control-allow-origin": "*",
    });
    res.end(tile.buffer);
  } catch (error) {
    sendJson(res, 502, {
      error: "cloud_tile_fetch_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendCloudSatelliteGlobeTexture(res, searchParams = new URLSearchParams()) {
  try {
    const texture = await fetchCloudSatelliteGlobeTexture({
      slot: searchParams.get("slot"),
      hour: searchParams.get("hour"),
    });
    res.writeHead(200, {
      "content-type": texture.contentType || "image/png",
      "cache-control": "public, max-age=300",
      "x-cloud-hour": texture.hourId || "",
      "x-cloud-source-date": texture.sourceDate || "",
      "x-cloud-fetched-at": texture.fetchedAt,
      "x-cloud-render-version": CLOUD_RENDER_STYLE_VERSION,
      "access-control-allow-origin": "*",
    });
    res.end(texture.buffer);
  } catch (error) {
    sendJson(res, 502, {
      error: "cloud_globe_texture_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function fetchCloudSatelliteTile(z, y, x, options = {}) {
  const timeline = await getCloudTimeline();
  const selected = selectCloudTimelineItem(timeline, options);
  if (!selected) return transparentCloudTile(new Date().toISOString());
  const key = `${CLOUD_RENDER_STYLE_VERSION}/${selected.hourId}/${z}/${y}/${x}`;
  const cached = cloudTileCache.get(key);
  if (options.preferCache !== false && cached && cached.expiresAt > Date.now()) return cached.tile;

  const dataset = await loadGmgsiDataset(selected);
  const tile = renderGmgsiTile(dataset, z, y, x);
  cloudTileCache.set(key, { expiresAt: Date.now() + CLOUD_TILE_CACHE_TTL_MS, tile });
  trimMapToSize(cloudTileCache, CLOUD_TILE_CACHE_MAX_ITEMS);
  return tile;
}

async function fetchCloudSatelliteGlobeTexture(options = {}) {
  const timeline = await getCloudTimeline();
  const selected = selectCloudTimelineItem(timeline, options);
  if (!selected) return transparentCloudTile(new Date().toISOString());
  const key = `${CLOUD_RENDER_STYLE_VERSION}/globe/${selected.hourId}/${CLOUD_GLOBE_TEXTURE_WIDTH}x${CLOUD_GLOBE_TEXTURE_HEIGHT}`;
  const cached = cloudTileCache.get(key);
  if (options.preferCache !== false && cached && cached.expiresAt > Date.now()) return cached.tile;

  const dataset = await loadGmgsiDataset(selected);
  const texture = renderGmgsiGlobeTexture(dataset);
  cloudTileCache.set(key, { expiresAt: Date.now() + CLOUD_TILE_CACHE_TTL_MS, tile: texture });
  trimMapToSize(cloudTileCache, CLOUD_TILE_CACHE_MAX_ITEMS);
  return texture;
}

async function loadGmgsiDataset(item) {
  const cached = cloudDatasetCache.get(item.hourId);
  if (cached) return cached;
  const pending = cloudDatasetInFlight.get(item.hourId);
  if (pending) return pending;

  const promise = loadGmgsiDatasetUncached(item).finally(() => {
    cloudDatasetInFlight.delete(item.hourId);
  });
  cloudDatasetInFlight.set(item.hourId, promise);
  return promise;
}

async function loadGmgsiDatasetUncached(item) {
  const cacheDir = join(dataDirectory, "cloud_cache", "gmgsi");
  mkdirSync(cacheDir, { recursive: true });
  const filePath = gmgsiCacheFilePath(item);
  await ensureGmgsiFile(item, filePath);

  // Evict older frames before allocating the next decoder on small instances.
  trimMapToSize(cloudDatasetCache, clampIntegerEnv("CLOUD_DATASET_CACHE_MAX_ITEMS", 3, 1, 3) - 1);

  let dataset = null;
  try {
    dataset = await readGmgsiDatasetFile(item, filePath);
  } catch (firstError) {
    try {
      unlinkSync(filePath);
    } catch {
      // The file may already have been removed after a failed validation.
    }
    await ensureGmgsiFile(item, filePath);
    try {
      dataset = await readGmgsiDatasetFile(item, filePath);
    } catch (secondError) {
      throw new Error(
        `GMGSI source validation failed for ${item.hourId}: ${secondError instanceof Error ? secondError.message : String(secondError)}`,
        { cause: firstError },
      );
    }
  }

  cloudDatasetCache.set(item.hourId, dataset);
  while (cloudDatasetCache.size > clampIntegerEnv("CLOUD_DATASET_CACHE_MAX_ITEMS", 3, 1, 3)) {
    const firstKey = cloudDatasetCache.keys().next().value;
    cloudDatasetCache.delete(firstKey);
  }
  return dataset;
}

async function readGmgsiDatasetFile(item, filePath) {
  return readCloudDataset(item, filePath, {
    minimumWidth: NOAA_GMGSI_MIN_SOURCE_WIDTH,
    minimumHeight: NOAA_GMGSI_MIN_SOURCE_HEIGHT,
  });
}

function gmgsiCacheFilePath(item) {
  return join(dataDirectory, "cloud_cache", "gmgsi", `${item.hourId}.nc`);
}

function hasUsableGmgsiFile(item) {
  if (!item?.hourId) return false;
  try {
    return statSync(gmgsiCacheFilePath(item)).size > 1024 * 1024;
  } catch {
    return false;
  }
}

async function ensureGmgsiFile(item, filePath) {
  if (hasUsableGmgsiFile(item)) return;
  if (process.platform === "win32") await downloadGmgsiFileWithPowerShell(item, filePath);
  else await downloadCloudFile(item.url, filePath, { timeoutMs: NOAA_GMGSI_DOWNLOAD_TIMEOUT_MS });
  if (!hasUsableGmgsiFile(item)) throw new Error(`GMGSI cache file is missing or incomplete for ${item.hourId}`);
}

async function downloadGmgsiFileWithPowerShell(item, filePath) {
  const cacheDir = join(dataDirectory, "cloud_cache", "gmgsi");
  mkdirSync(cacheDir, { recursive: true });
  const scriptPath = join(cacheDir, "download-gmgsi.ps1");
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(
    scriptPath,
    [
      "param([string]$Uri, [string]$OutFile, [int]$TimeoutSec)",
      "$ErrorActionPreference = 'Stop'",
      "$ProgressPreference = 'SilentlyContinue'",
      "Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $OutFile -TimeoutSec $TimeoutSec",
      "",
    ].join("\n"),
    "utf8",
  );
  try {
    try {
      unlinkSync(tempPath);
    } catch {
      // No stale partial file.
    }
    await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        item.url,
        tempPath,
        String(Math.ceil(NOAA_GMGSI_DOWNLOAD_TIMEOUT_MS / 1000)),
      ],
      { timeout: NOAA_GMGSI_DOWNLOAD_TIMEOUT_MS + 5000, maxBuffer: 1024 * 1024 },
    );
    if (!existsSync(tempPath) || statSync(tempPath).size <= 1024 * 1024) {
      throw new Error(`GMGSI download produced an incomplete file for ${item.hourId}`);
    }
    try {
      unlinkSync(filePath);
    } catch {
      // No previous file.
    }
    renameSync(tempPath, filePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup failures.
    }
    throw new Error(`GMGSI download failed for ${item.hourId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function trimMapToSize(map, maxItems) {
  while (map.size > maxItems) {
    const firstKey = map.keys().next().value;
    if (firstKey === undefined) break;
    map.delete(firstKey);
  }
}

function renderGmgsiTile(dataset, z, y, x) {
  const png = new PNG({ width: CLOUD_TILE_SIZE, height: CLOUD_TILE_SIZE });
  const n = 2 ** z;
  for (let py = 0; py < CLOUD_TILE_SIZE; py += 1) {
    const mercY = (y * CLOUD_TILE_SIZE + py + 0.5) / (CLOUD_TILE_SIZE * n);
    const lat = webMercatorNormYToLat(mercY);
    for (let px = 0; px < CLOUD_TILE_SIZE; px += 1) {
      const out = (py * CLOUD_TILE_SIZE + px) * 4;
      const lon = ((x * CLOUD_TILE_SIZE + px + 0.5) / (CLOUD_TILE_SIZE * n)) * 360 - 180;
      if (lat > dataset.north || lat < dataset.south) {
        png.data[out + 3] = 0;
        continue;
      }
      const value = sampleGmgsiValue(dataset, lon, lat);
      if (!Number.isFinite(value) || value <= 0) {
        png.data[out + 3] = 0;
        continue;
      }
      const color = colorizeGmgsiCloud(value);
      png.data[out] = color.r;
      png.data[out + 1] = color.g;
      png.data[out + 2] = color.b;
      png.data[out + 3] = color.a;
    }
  }
  return {
    buffer: PNG.sync.write(png),
    contentType: "image/png",
    sourceDate: dataset.sourceDate,
    fetchedAt: dataset.fetchedAt,
    hourId: dataset.hourId,
  };
}

function renderGmgsiGlobeTexture(dataset) {
  const png = new PNG({ width: CLOUD_GLOBE_TEXTURE_WIDTH, height: CLOUD_GLOBE_TEXTURE_HEIGHT });
  for (let py = 0; py < CLOUD_GLOBE_TEXTURE_HEIGHT; py += 1) {
    const lat = 90 - ((py + 0.5) / CLOUD_GLOBE_TEXTURE_HEIGHT) * 180;
    for (let px = 0; px < CLOUD_GLOBE_TEXTURE_WIDTH; px += 1) {
      const out = (py * CLOUD_GLOBE_TEXTURE_WIDTH + px) * 4;
      if (lat > dataset.north || lat < dataset.south) {
        png.data[out] = 0;
        png.data[out + 1] = 0;
        png.data[out + 2] = 0;
        png.data[out + 3] = 0;
        continue;
      }
      const lon = ((px + 0.5) / CLOUD_GLOBE_TEXTURE_WIDTH) * 360 - 180;
      const value = sampleGmgsiValue(dataset, lon, lat);
      if (!Number.isFinite(value) || value <= 0) {
        png.data[out] = 0;
        png.data[out + 1] = 0;
        png.data[out + 2] = 0;
        png.data[out + 3] = 0;
        continue;
      }
      const color = colorizeGmgsiCloud(value);
      const polarOpacity = cloudGlobePolarOpacity(lat);
      png.data[out] = color.r;
      png.data[out + 1] = color.g;
      png.data[out + 2] = color.b;
      png.data[out + 3] = Math.round(color.a * polarOpacity);
    }
  }
  return {
    buffer: PNG.sync.write(png),
    contentType: "image/png",
    sourceDate: dataset.sourceDate,
    fetchedAt: dataset.fetchedAt,
    hourId: dataset.hourId,
  };
}

function fillEnclosedCloudMaskVoids(png, maxPixels) {
  const width = png.width;
  const height = png.height;
  const size = width * height;
  const visited = new Uint8Array(size);
  const queue = new Int32Array(size);
  const neighbors = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],             [1, 0],
    [-1, 1],  [0, 1],   [1, 1],
  ];

  for (let start = 0; start < size; start += 1) {
    if (visited[start] || png.data[start * 4 + 3] > 0) continue;
    let head = 0;
    let tail = 1;
    let touchesEdge = false;
    queue[0] = start;
    visited[start] = 1;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      for (const [dx, dy] of neighbors) {
        const sampleX = x + dx;
        const sampleY = y + dy;
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
        const sampleIndex = sampleY * width + sampleX;
        if (visited[sampleIndex] || png.data[sampleIndex * 4 + 3] > 0) continue;
        visited[sampleIndex] = 1;
        queue[tail++] = sampleIndex;
      }
    }

    if (touchesEdge || tail > maxPixels) continue;
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    let boundarySamples = 0;
    for (let position = 0; position < tail; position += 1) {
      const index = queue[position];
      const x = index % width;
      const y = Math.floor(index / width);
      for (const [dx, dy] of neighbors) {
        const sampleX = x + dx;
        const sampleY = y + dy;
        if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
        const sampleIndex = sampleY * width + sampleX;
        const dataOffset = sampleIndex * 4;
        if (png.data[dataOffset + 3] === 0) continue;
        red += png.data[dataOffset];
        green += png.data[dataOffset + 1];
        blue += png.data[dataOffset + 2];
        alpha += png.data[dataOffset + 3];
        boundarySamples += 1;
      }
    }
    if (!boundarySamples) continue;
    const fillRed = Math.round(red / boundarySamples);
    const fillGreen = Math.round(green / boundarySamples);
    const fillBlue = Math.round(blue / boundarySamples);
    const fillAlpha = Math.round(alpha / boundarySamples);
    for (let position = 0; position < tail; position += 1) {
      const dataOffset = queue[position] * 4;
      png.data[dataOffset] = fillRed;
      png.data[dataOffset + 1] = fillGreen;
      png.data[dataOffset + 2] = fillBlue;
      png.data[dataOffset + 3] = fillAlpha;
    }
  }
}

function closeSmallCloudAlphaHoles(png, radius) {
  const width = png.width;
  const height = png.height;
  const size = width * height;
  const source = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) {
    source[index] = png.data[index * 4 + 3] > 0 ? 1 : 0;
  }
  const horizontalDilated = new Uint8Array(size);
  const dilated = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX >= 0 && sampleX < width && source[rowOffset + sampleX]) {
          value = 1;
          break;
        }
      }
      horizontalDilated[rowOffset + x] = value;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY >= 0 && sampleY < height && horizontalDilated[sampleY * width + x]) {
          value = 1;
          break;
        }
      }
      dilated[y * width + x] = value;
    }
  }
  const horizontalClosed = new Uint8Array(size);
  const closed = new Uint8Array(size);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      let value = 1;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX < 0 || sampleX >= width || !dilated[rowOffset + sampleX]) {
          value = 0;
          break;
        }
      }
      horizontalClosed[rowOffset + x] = value;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 1;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY < 0 || sampleY >= height || !horizontalClosed[sampleY * width + x]) {
          value = 0;
          break;
        }
      }
      closed[y * width + x] = value;
    }
  }

  const searchRadius = radius * 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (source[index] || !closed[index]) continue;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;
      for (let distance = 1; distance <= searchRadius && count < 2; distance += 1) {
        for (let offset = -distance; offset <= distance; offset += 1) {
          for (const [sampleX, sampleY] of [
            [x + offset, y - distance],
            [x + offset, y + distance],
            [x - distance, y + offset],
            [x + distance, y + offset],
          ]) {
            if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
            const sampleIndex = sampleY * width + sampleX;
            if (!source[sampleIndex]) continue;
            const dataOffset = sampleIndex * 4;
            red += png.data[dataOffset];
            green += png.data[dataOffset + 1];
            blue += png.data[dataOffset + 2];
            alpha += png.data[dataOffset + 3];
            count += 1;
          }
        }
      }
      if (!count) continue;
      const dataOffset = index * 4;
      png.data[dataOffset] = Math.round(red / count);
      png.data[dataOffset + 1] = Math.round(green / count);
      png.data[dataOffset + 2] = Math.round(blue / count);
      png.data[dataOffset + 3] = Math.round(alpha / count);
    }
  }
}

function cloudGlobePolarOpacity(latitude) {
  const absoluteLatitude = Math.abs(Number(latitude) || 0);
  const progress = clampNumber(
    (absoluteLatitude - CLOUD_GLOBE_POLAR_FADE_START_LAT) /
      (CLOUD_GLOBE_POLAR_FADE_END_LAT - CLOUD_GLOBE_POLAR_FADE_START_LAT),
    0,
    1,
  );
  const smooth = progress * progress * (3 - 2 * progress);
  return 1 - smooth;
}

function sampleGmgsiValue(dataset, lon, lat) {
  if (lat > dataset.north || lat < dataset.south) return NaN;
  const rows = rowsForGmgsiLatitude(dataset.latRows, lat);
  const columns = columnsForGmgsiLongitude(dataset.lonColumns, lon);
  const northWest = gmgsiDataValue(dataset, rows.row0, columns.col0);
  const northEast = gmgsiDataValue(dataset, rows.row0, columns.col1);
  const southWest = gmgsiDataValue(dataset, rows.row1, columns.col0);
  const southEast = gmgsiDataValue(dataset, rows.row1, columns.col1);
  const top = interpolateFinite(northWest, northEast, columns.t);
  const bottom = interpolateFinite(southWest, southEast, columns.t);
  const interpolated = interpolateFinite(top, bottom, rows.t);
  // Zero is a valid clear-sky observation. Only repair genuine NetCDF gaps;
  // treating clear sky as missing borrows nearby cloud and creates false spots.
  if (Number.isFinite(interpolated)) return interpolated;
  return nearestValidGmgsiValue(dataset, rows, columns);
}

function nearestValidGmgsiValue(dataset, rows, columns) {
  const centerRow = rows.t < 0.5 ? rows.row0 : rows.row1;
  const centerColumn = columns.t < 0.5 ? columns.col0 : columns.col1;
  const cacheKey = centerRow * dataset.width + centerColumn;
  if (!dataset.holeFillCache) dataset.holeFillCache = new Map();
  if (dataset.holeFillCache.has(cacheKey)) return dataset.holeFillCache.get(cacheKey);

  const sampleAt = (row, column) => {
    if (row < 0 || row >= dataset.height) return NaN;
    const wrappedColumn = ((column % dataset.width) + dataset.width) % dataset.width;
    const value = gmgsiDataValue(dataset, row, wrappedColumn);
    return Number.isFinite(value) && value > 0 ? value : NaN;
  };
  let fallback = NaN;
  for (let radius = 1; radius <= NOAA_GMGSI_HOLE_FILL_RADIUS; radius += 1) {
    let sum = 0;
    let count = 0;
    const add = (value) => {
      if (!Number.isFinite(value)) return;
      sum += value;
      count += 1;
    };
    for (let offset = -radius; offset <= radius; offset += 1) {
      add(sampleAt(centerRow - radius, centerColumn + offset));
      add(sampleAt(centerRow + radius, centerColumn + offset));
    }
    for (let offset = -radius + 1; offset < radius; offset += 1) {
      add(sampleAt(centerRow + offset, centerColumn - radius));
      add(sampleAt(centerRow + offset, centerColumn + radius));
    }
    if (count >= 2) {
      fallback = sum / count;
      break;
    }
  }
  if (dataset.holeFillCache.size < 250000) dataset.holeFillCache.set(cacheKey, fallback);
  return fallback;
}

function columnsForGmgsiLongitude(lonColumns, lon) {
  if (!lonColumns?.length || lonColumns.length === 1) return { col0: 0, col1: 0, t: 0 };
  const lastIndex = lonColumns.length - 1;
  const first = Number(lonColumns[0]);
  const last = Number(lonColumns[lastIndex]);
  let target = normalizeLon(lon);
  if (target < first) target += 360;

  if (target > last) {
    const seamEnd = first + 360;
    if (target <= seamEnd) {
      const span = seamEnd - last;
      return { col0: lastIndex, col1: 0, t: span > 1e-9 ? clampNumber((target - last) / span, 0, 1) : 0 };
    }
    const next = Number(lonColumns[1]) + 360;
    const span = next - seamEnd;
    return { col0: 0, col1: 1, t: span > 1e-9 ? clampNumber((target - seamEnd) / span, 0, 1) : 0 };
  }

  if (target <= first) return { col0: 0, col1: 1, t: 0 };
  let lo = 0;
  let hi = lastIndex;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lonColumns[mid] <= target) lo = mid;
    else hi = mid;
  }
  const span = Number(lonColumns[hi]) - Number(lonColumns[lo]);
  const t = span > 1e-9 ? clampNumber((target - Number(lonColumns[lo])) / span, 0, 1) : 0;
  return { col0: lo, col1: hi, t };
}

function gmgsiDataValue(dataset, row, column) {
  const index = row * dataset.width + column;
  if (dataset.invalidMask?.[index]) return NaN;
  const value = Number(dataset.data[index]);
  if (!Number.isFinite(value)) return NaN;
  if (Number.isFinite(dataset.dataFillValue) && value === dataset.dataFillValue) return NaN;
  return value;
}

function rowsForGmgsiLatitude(latRows, lat) {
  if (!latRows?.length) return { row0: 0, row1: 0, t: 0 };
  if (lat >= latRows[0]) return { row0: 0, row1: 0, t: 0 };
  const lastIndex = latRows.length - 1;
  if (lat <= latRows[lastIndex]) return { row0: lastIndex, row1: lastIndex, t: 0 };
  let lo = 0;
  let hi = lastIndex;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (latRows[mid] >= lat) lo = mid;
    else hi = mid;
  }
  const span = latRows[lo] - latRows[hi];
  const t = span > 1e-9 ? clampNumber((latRows[lo] - lat) / span, 0, 1) : 0;
  return { row0: lo, row1: hi, t };
}

function interpolateFinite(a, b, t) {
  if (!Number.isFinite(a)) return Number.isFinite(b) ? b : NaN;
  if (!Number.isFinite(b)) return a;
  return a * (1 - t) + b * t;
}

function colorizeGmgsiCloud(value) {
  const v = clampNumber(Number(value), 0, 255);
  const alphaT = smoothstep(92, 205, v);
  if (alphaT <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const whiteT = smoothstep(135, 225, v);
  return {
    r: Math.round(88 + 167 * whiteT),
    g: Math.round(170 + 85 * whiteT),
    b: 255,
    a: Math.round(38 + 217 * alphaT),
  };
}

function smoothstep(edge0, edge1, value) {
  const t = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function webMercatorNormYToLat(normY) {
  return (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * normY)));
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function fetchBinaryAllowExpiredCertificate(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      {
        rejectUnauthorized: false,
        headers: {
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "user-agent": "NOTAM MAP local cloud overlay tile proxy",
        },
      },
      (response) => {
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > 4 * 1024 * 1024) {
            req.destroy(new Error("cloud tile response exceeded 4 MB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode} for ${url}`));
            return;
          }
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            contentType: String(response.headers["content-type"] || ""),
            buffer,
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms for ${url}`)));
    req.on("error", reject);
  });
}

function arcgisTimestampToIso(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function fetchJson(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json, text/plain, */*",
        "user-agent": "FAA restriction map local tool (educational; contact: local)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonOfficial(url, timeoutMs = 15000) {
  try {
    return await fetchJson(url, timeoutMs);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    return fetchJsonViaPowerShell(url, timeoutMs);
  }
}

async function fetchTextOfficial(url, timeoutMs = 15000) {
  try {
    return await fetchText(url, timeoutMs);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    return fetchTextViaPowerShell(url, timeoutMs);
  }
}

async function fetchMsaText(url, timeoutMs = 15000) {
  try {
    return await fetchMsaTextViaHttps(url, timeoutMs);
  } catch (error) {
    if (process.platform !== "win32") throw error;
    return fetchMsaTextViaPowerShell(url, timeoutMs);
  }
}

function fetchMsaTextViaHttps(url, timeoutMs = 15000, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = httpsGet(
      url,
      {
        agent: msaHttpsAgent,
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "zh-CN,zh;q=0.9",
          referer: `${MSA_BASE_URL}/`,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        },
      },
      (response) => {
        const status = Number(response.statusCode || 0);
        if (status >= 300 && status < 400 && response.headers.location && redirectCount < 5) {
          response.resume();
          const nextUrl = new URL(response.headers.location, url).href;
          fetchMsaTextViaHttps(nextUrl, timeoutMs, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > 32 * 1024 * 1024) {
            request.destroy(new Error(`China MSA response exceeded 32 MB for ${url}`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        response.on("error", reject);
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`China MSA request timed out for ${url}`)));
    request.on("error", reject);
  });
}

async function fetchMsaTextViaPowerShell(url, timeoutMs = 15000) {
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000));
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$uri = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:MSA_TEXT_URL_B64))
$client = [System.Net.WebClient]::new()
$client.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36')
$client.Headers.Add('Accept-Language', 'zh-CN,zh;q=0.9')
$client.Headers.Add('Referer', '${MSA_BASE_URL}/')
$bytes = $client.DownloadData($uri)
[System.Text.Encoding]::UTF8.GetString($bytes)
`;
  const encoded = Buffer.from(String(url), "utf8").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: timeoutMs + 10 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      MSA_TEXT_URL_B64: encoded,
    },
  });
  return stdout;
}

async function fetchJsonViaPowerShell(url, timeoutMs = 15000) {
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000));
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$uri = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:OFFICIAL_JSON_URL_B64))
$response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec ${timeoutSec}
$response.Content
`;
  const encoded = Buffer.from(String(url), "utf8").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: timeoutMs + 10 * 1000,
      maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      OFFICIAL_JSON_URL_B64: encoded,
    },
  });
  return JSON.parse(stdout.trim());
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html, text/plain, */*",
        "user-agent": "NOTAM MAP local HYDROPAC checker (educational; contact: local)",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextViaPowerShell(url, timeoutMs = 15000) {
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000));
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
$uri = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:OFFICIAL_TEXT_URL_B64))
$response = Invoke-WebRequest -UseBasicParsing -Uri $uri -TimeoutSec ${timeoutSec}
$response.Content
`;
  const encoded = Buffer.from(String(url), "utf8").toString("base64");
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    timeout: timeoutMs + 10 * 1000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      OFFICIAL_TEXT_URL_B64: encoded,
    },
  });
  return stdout;
}

async function readRequestBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Request body exceeds 1 MB");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, data) {
  const body = serializedJson(data);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function sendText(res, status, data) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(data);
}

function serializedJson(data) {
  if (!data || typeof data !== "object") return JSON.stringify(data);
  const cached = jsonResponseCache.get(data);
  if (cached) return cached;
  const body = JSON.stringify(data);
  jsonResponseCache.set(data, body);
  return body;
}

function normalizeTitleCase(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function uniqueCoordinates(coords) {
  const seen = new Set();
  const out = [];
  for (const coord of coords) {
    if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lon)) continue;
    const key = `${roundCoord(coord.lat)},${roundCoord(coord.lon)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ lat: roundCoord(coord.lat), lon: roundCoord(coord.lon) });
  }
  return out;
}

function roundCoord(value) {
  return Math.round(Number(value) * 1e7) / 1e7;
}

function normalizeLon(value) {
  return ((value + 540) % 360) - 180;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

export {
  recoverFaaNotamFirs,
  extractCoordinateSections,
  hasUnsupportedBoundaryInstruction,
  hasUnsupportedNaturalBoundaryInstruction,
  validateParsedGeometry,
  migrateCachedNotamParseResults,
  migrateCachedAreaParseResults,
  cleanNotamGeometryText,
  extractCoordinateGroups,
  extractCoordinates,
  extractNotamGeometryText,
  hasStrongBoundaryLanguage,
  extractMsaInForceWarningKeys,
  filterPayloadToReferenceTime,
  normalizeNotamCoordinateText,
  normalizeMsaTemporalItem,
  parseMsaWarningGeometry,
  parseMsaWarningSchedule,
  parseMarineSchedule,
  parseNotamText,
  polygonFromCoordinates,
  repairPolygonIfNeeded,
  parseSeaLagomNavareaMessages,
  splitMarineBoundarySubsections,
  truncateContaminatedMarineBulletin,
  removeCircleRadiusCoordinateClauses,
};

const isMainModule = Boolean(
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)),
);
if (isMainModule) {
  server.listen(port, host, () => {
    console.log(`Serving Space Enthusiast Map at http://${host}:${port}`);
    console.log("Press Ctrl+C to stop.");
  });
}
