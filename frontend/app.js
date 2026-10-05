const TILE_SIZE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 15;
const GLOBE_MIN_ZOOM = -5;
const GLOBE_ZOOM_RADIUS_REFERENCE = -0.5;
const SATELLITE_GEO_FIT_ZOOM = -3.1;
const SATELLITE_MEO_FIT_ZOOM = -1.5;
const ZOOM_STEP = 0.5;
const LIST_RENDER_LIMIT = 500;
const NOTAM_AREA_COLOR = "#ff7b86";
const HYDROPAC_AREA_COLOR = "#1677ff";
const MSA_WARNING_AREA_COLOR = "#22c55e";
const NAVAREA_WARNING_AREA_COLOR = "#a855f7";
const LAUNCH_SITE_COLOR = "#ffd166";
const CUSTOM_COORDINATE_COLOR = "#ffe45c";
const DEFAULT_CLOUD_OVERLAY_OPACITY = 0.4;
const CLOUD_TILE_MAX_ZOOM = 7;
const NOAA_GMGSI_TIMELINE_FALLBACK_COUNT = 48;
const PERFORMANCE_PROFILE_API = window.NotamPerformanceProfile || null;
const SATELLITE_REFERENCE = window.NotamSatelliteReference || null;
const SATELLITE_ORBIT_POLICY = window.NotamSatelliteOrbitPolicy || null;
const SOLAR_LIGHTING = window.NotamSolarLighting || null;
let activePerformanceProfile = PERFORMANCE_PROFILE_API?.detectSync() || {
  tier: "balanced",
  tierRank: 1,
  tierLabel: "均衡",
  targetFrameMs: 29,
  cpu: { threads: Math.max(1, Number(navigator.hardwareConcurrency) || 4), memoryGB: Math.max(0, Number(navigator.deviceMemory) || 0), model: "" },
  gpu: { vendor: "unknown", vendorLabel: "通用 GPU", renderer: "GPU information unavailable", webgl2: false },
  budgets: {
    dprMax: 1.5, interactionDpr: 1, bulkDpr: 1.15,
    tileCacheMax: 920, cloudTileCacheMax: 430, globeTextureCacheMax: 880,
    textureUploadsPerFrame: 12, visibleTileBudget: 540,
    tileLoadConcurrency: 12, tileLoadQueueLimit: 720,
    coverageSegments: 24, satelliteHitLimit: 600, satelliteWorkers: 4,
    interactionFrameIntervalMs: 8, antialias: true, minimumQualityScale: 0.7,
  },
};
let adaptivePerformanceState = PERFORMANCE_PROFILE_API?.createAdaptiveState(activePerformanceProfile) || {
  qualityScale: 1,
  minimumQualityScale: 0.7,
  targetFrameMs: 29,
  emaMs: 0,
  lastSource: "",
};
const HARDWARE_THREAD_COUNT = Math.max(1, Number(activePerformanceProfile.cpu.threads) || 4);
const DEVICE_MEMORY_GB = Math.max(0, Number(activePerformanceProfile.cpu.memoryGB) || 0);
let HIGH_PERFORMANCE_MODE = activePerformanceProfile.tierRank >= 2;
const SATELLITE_MAX_SELECTED = 50000;
const SATELLITE_FAST_FRAME_INTERVAL_MS = 1000 / 30;
const SATELLITE_MEDIUM_FRAME_INTERVAL_MS = 80;
const SATELLITE_DENSE_FRAME_INTERVAL_MS = 180;
const SATELLITE_MASS_FRAME_INTERVAL_MS = 500;
const GLOBE_SURFACE_FRAME_INTERVAL_MS = 1000 / 30;
const SATELLITE_PATH_INTERVAL_MS = 2000;
const SATELLITE_COVERAGE_INTERVAL_MS = 100;
let SATELLITE_WORKER_COUNT = activePerformanceProfile.budgets.satelliteWorkers;
const SATELLITE_GPU_BULK_THRESHOLD = 360;
let SATELLITE_GPU_HIT_LIMIT = activePerformanceProfile.budgets.satelliteHitLimit;
const SATELLITE_PATH_POINT_STRIDE = SATELLITE_ORBIT_POLICY?.PATH_POINT_STRIDE || 6;
const SATELLITE_DENSE_ORBIT_LINE_THRESHOLD = 240;
const SATELLITE_POINT_SIZE_MIN = 3;
const SATELLITE_POINT_SIZE_MAX = 28;
const SATELLITE_LABEL_SIZE_MIN = 9;
const SATELLITE_LABEL_SIZE_MAX = 32;
let SATELLITE_COVERAGE_SEGMENTS = activePerformanceProfile.budgets.coverageSegments;
const SATELLITE_POSITION_STRIDE = 17;
const SATELLITE_SELECTION_STORAGE_KEY = "notam-map-satellite-selection-v1";
const SATELLITE_STYLE_STORAGE_KEY = "notam-map-satellite-style-v1";
const SATELLITE_ELEMENT_STORAGE_KEY = "notam-map-satellite-elements-v1";
const SATELLITE_ELEMENT_STORAGE_MAX_SETS = 2500;
const SATELLITE_CLASS_COLORS = { LEO: "#62e2ff", MEO: "#ffc85c", GEO: "#db8cff", HEO: "#ff8fd8" };
const SATELLITE_OBJECT_COLORS = {
  ACTIVE_PAYLOAD: "",
  RETIRED_PAYLOAD: "#ff6675",
  ROCKET_BODY: "#c8d2dc",
  DEBRIS: "#ff9c55",
  UNKNOWN: "#aab6c2",
};
const SATELLITE_PAYLOADS = window.NotamSatellitePayloads || null;
const SATELLITE_SERIES = window.NotamSatelliteSeries || null;
const SATELLITE_IDENTITIES = window.NotamSatelliteIdentities || null;
const SATELLITE_ELEMENT_INPUT = window.NotamSatelliteElementInput || null;
const SATELLITE_RETIRED_SERIES_KEYS = new Set(["DSCS", "FLTSATCOM", "UFO", "MILSTAR", "JILIN", "PLANET"]);
const CLOUD_TILE_STYLE_VERSION = "gmgsi-geolocated-v11-artifact-mask";
const CLOUD_TIMELINE_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const SUNLIGHT_CLOCK_INTERVAL_MS = 30 * 1000;
let TILE_CACHE_MAX_ITEMS = activePerformanceProfile.budgets.tileCacheMax;
let CLOUD_TILE_CACHE_MAX_ITEMS = activePerformanceProfile.budgets.cloudTileCacheMax;
const LAUNCH_LANDMARK_MATCH_KM = 35;
const MAX_NOTAM_DRAW_LON_SPAN = 180;
const MAX_NOTAM_DRAW_LAT_SPAN = 180;
const TRAJECTORY_COLORS = ["#ffe08a", "#7bdcff", "#ff8ad6", "#9cff8a", "#ff9b6a", "#b99cff"];
const DEFAULT_TRAJECTORY_LINE_WIDTH = 4;
const DEFAULT_TRAJECTORY_DASH_DENSITY = 45;
const TRAJECTORY_SAMPLE_TARGET_KM = 25;
const TRAJECTORY_SAMPLE_MIN_STEPS = 16;
const TRAJECTORY_SAMPLE_MAX_STEPS = 360;
const BALLISTIC_COLORS = ["#ff5b61", "#ffb454", "#7bdcff", "#c084fc", "#68f29b"];
const BALLISTIC_DEFAULT_ALTITUDE_KM = 75;
const BALLISTIC_DEFAULT_ANGLE_DEG = 32;
const BALLISTIC_DEFAULT_SPEED_MPS = 2500;
const BALLISTIC_DEFAULT_COEFFICIENT_KG_M2 = 900;
const BALLISTIC_DEFAULT_MAX_TIME_SEC = 7200;
const BALLISTIC_STAGE_LINE_WIDTH_MIN = 1;
const BALLISTIC_STAGE_LINE_WIDTH_MAX = 12;
const BALLISTIC_STAGE_LINE_WIDTH_DEFAULT = 4;
// Detail tiles are rendered 1.5 km above the unit sphere to avoid z-fighting.
// Keep near-surface ballistic geometry just above that visual shell; otherwise
// the GPU depth buffer can hide an otherwise valid trajectory at low altitude.
const BALLISTIC_RENDER_OFFSET_KM = 2;
const BALLISTIC_PHYSICS = window.NotamBallistics || null;
const REENTRY_ANIMATION = window.NotamReentryAnimation || null;
const TRAJECTORY_HISTORY = window.NotamTrajectoryHistory || null;
const POWERED_PATH = window.NotamPoweredPath || null;
const BALLISTIC_ANIMATION_MAX_OBJECTS = REENTRY_ANIMATION?.MAX_OBJECTS || 10;
const TOOLTIP_HIDE_DELAY_MS = 420;
const FAA_REFRESH_POLL_INTERVAL_MS = 15000;
const FAA_REFRESH_POLL_RETRY_LIMIT = 20;
const WGS84_A = 6378137;
const WGS84_F = 1 / 298.257223563;
const WGS84_B = WGS84_A * (1 - WGS84_F);
const TIME_WINDOW_TOLERANCE_MS = 60 * 1000;
const GLOBE_LAYER = "earth";
const GLOBE_TEXTURE_MIN_ZOOM = 2;
const GLOBE_BASE_ATLAS_MAX_ZOOM = 3;
const GLOBE_TEXTURE_MAX_ZOOM = 15;
// The 8192px geographic atlas is sharper than the screen while the whole globe
// is visible. Mixing it with low-level Web Mercator tiles creates large,
// differently exposed rectangles, so detail tiles start only in close views.
const GLOBE_DETAIL_TILES_MIN_VIEW_ZOOM = 4.25;
const GLOBE_DETAIL_TILES_MIN_TILE_ZOOM = 4;
const GLOBE_TILE_SEGMENTS = 10;
let GLOBE_TEXTURE_CACHE_MAX_ITEMS = activePerformanceProfile.budgets.globeTextureCacheMax;
let GLOBE_TEXTURE_UPLOADS_PER_FRAME = activePerformanceProfile.budgets.textureUploadsPerFrame;
let GLOBE_VISIBLE_TILE_BUDGET = activePerformanceProfile.budgets.visibleTileBudget;
const GLOBE_MERCATOR_MAX_LAT = 85.05112878;
const GLOBE_POLAR_BLEND_START_LAT = 83.25;
const GLOBE_GLOBAL_ATLAS_URL = "/frontend/assets/esri-globe-atlas-8192.jpg?v=full-pole-v1";
const GLOBE_POLAR_ATLAS_ONLY_LAT = 74;
const GLOBE_POLAR_HORIZON_ATLAS_LAT = 68;
const GLOBE_POLAR_DETAIL_INNER_LAT = 78;
const GLOBE_POLAR_DETAIL_OUTER_LAT = 72;
const GLOBE_POLAR_DETAIL_RADIUS = 1.000075;
const GLOBE_POLAR_DETAIL_SEGMENTS = 360;
const GLOBE_POLAR_DETAIL_RINGS = 72;
const GLOBE_POLAR_TEXTURE_SPECS = [
  {
    id: "arctic",
    hemisphere: 1,
    projection: "EPSG:5936",
    definition: "+proj=stere +lat_0=90 +lon_0=-150 +k=0.994 +x_0=2000000 +y_0=2000000 +datum=WGS84 +units=m +no_defs +type=crs",
    url: "/frontend/assets/esri-arctic-polar-4096.jpg?v=polar-real-v5",
    bounds: [-2623286, -2623287, 6623286, 6623285],
  },
  {
    id: "antarctic",
    hemisphere: -1,
    projection: "EPSG:3031",
    definition: "+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs +type=crs",
    url: "/frontend/assets/esri-antarctic-polar-4096.jpg?v=polar-real-v4",
    bounds: [-4524540, -4524540, 4524540, 4524540],
  },
];
let TILE_LOAD_CONCURRENCY = activePerformanceProfile.budgets.tileLoadConcurrency;
let TILE_LOAD_QUEUE_LIMIT = activePerformanceProfile.budgets.tileLoadQueueLimit;
let RENDER_DPR_MAX = activePerformanceProfile.budgets.dprMax;
let INTERACTION_DPR_MAX = activePerformanceProfile.budgets.interactionDpr;
let INTERACTION_FRAME_INTERVAL_MS = activePerformanceProfile.budgets.interactionFrameIntervalMs;
const EARTH_MEAN_RADIUS_KM = 6371.0088;
const ATMOSPHERE_VISIBLE_TOP_KM = 120;
const AIRGLOW_CENTER_KM = 100;
const AIRGLOW_THICKNESS_KM = 30;
const EARTH_BASE_RADIUS = 1;
const RESTRICTION_SURFACE_ALTITUDE_KM = 0;
const RESTRICTION_SURFACE_RADIUS = EARTH_BASE_RADIUS + RESTRICTION_SURFACE_ALTITUDE_KM / EARTH_MEAN_RADIUS_KM;
const RESTRICTION_OCCLUSION_INSET_KM = 0.005;
const EARTH_TILE_SURFACE_OFFSET_KM = 1.5;
const EARTH_TILE_RADIUS = 1 + EARTH_TILE_SURFACE_OFFSET_KM / EARTH_MEAN_RADIUS_KM;
const CLOUD_SHELL_ALTITUDE_KM = 12;
const REENTRY_GLOW_REFERENCE_W_M2 = 1_500_000;
const REENTRY_GLOW_COLOR_STOPS = [
  [0, [66, 0, 0]],
  [0.18, [142, 8, 5]],
  [0.38, [232, 35, 10]],
  [0.56, [255, 92, 18]],
  [0.72, [255, 211, 61]],
  [0.88, [255, 249, 221]],
  [1, [232, 247, 255]],
];
const BALLISTIC_ANIMATION_DOM_INTERVAL_MS = 100;
const BALLISTIC_ANIMATION_LABEL_INTERVAL_MS = 100;
const BALLISTIC_ANIMATION_STATS_INTERVAL_MS = 250;
const BALLISTIC_ANIMATION_PREPARED_STEP_SEC = 1;
const BALLISTIC_ANIMATION_PREPARED_MAX_SAMPLES = 8000;
const BALLISTIC_ANIMATION_MIN_FPS = 20;
const BALLISTIC_ANIMATION_FRAME_BUDGET_MS = 1000 / BALLISTIC_ANIMATION_MIN_FPS;
const BALLISTIC_MULTI_OBJECT_FRAME_INTERVAL_MS = 1000 / 60;
const BALLISTIC_GLOW_LEVELS = 48;
const BALLISTIC_PLUME_VISUAL_SCALE = 0.25;
const BALLISTIC_IMPACT_FLASH_DURATION_MS = 2000;
const BALLISTIC_GLOW_OCCLUSION_INSET_KM = 0.25;
const BALLISTIC_IMPACT_FLASH_FRAMES = 24;
const BALLISTIC_IMPACT_FLASH_HOLD_FRAME = 4;
const GLOBE_PIXEL_DEBUG = new URLSearchParams(window.location.search).has("debugGlobe");
const GLOBE_THREE_URL = "/node_modules/three/build/three.module.js";
const GLOBE_CAMERA = window.NotamGlobeCamera || null;
const POLAR_PROJECTION = window.proj4 || null;
const KML_IO = window.NotamKmlIo || null;
const JSZIP_URL = "/node_modules/jszip/dist/jszip.min.js";
const LANDMARK_VISIBILITY_STORAGE_KEY = "notam-map-hidden-landmarks";
const LANDMARK_ETLAQ_MIGRATION_KEY = "notam-map-hidden-landmarks-etlaq-migrated";
const tileCache = new Map();
const cloudTileCache = new Map();
const cloudGlobeTextureCache = new Map();
const mercatorYUnitCache = new Map();
const globeRingUnitVectorCache = new WeakMap();
const ballisticGlobeVectorCache = new WeakMap();
const ballisticSimulationCache = new Map();
const ballisticEmpiricalSimulationCache = new Map();
const ballisticEmpiricalRequestQueue = [];
let ballisticEmpiricalRequestFlushTimer = null;
const trajectoryGeometryCache = new WeakMap();
const trajectoryProjectionCache = new WeakMap();
const ballisticStageSegmentCache = new WeakMap();
const ballisticProjectionCache = new WeakMap();
const ballisticGroundProjectionCache = new WeakMap();
const ballisticDisplaySampleCache = new WeakMap();
const ballisticSampleSummaryCache = new WeakMap();
const poweredPathGeometryCache = new WeakMap();
const normalizedBallisticModels = new WeakSet();
const ballisticPerformanceStats = {
  propagationRuns: 0,
  propagationHits: 0,
  empiricalRequests: 0,
  segmentBuilds: 0,
  segmentHits: 0,
  projectionBuilds: 0,
  projectionHits: 0,
};
const ballisticAnimationPerformanceStats = {
  trailBuilds: 0,
  trailHits: 0,
  trailSegmentsRendered: 0,
  profileBuilds: 0,
  profileHits: 0,
  framesRendered: 0,
  glowSpriteBuilds: 0,
  glowSpriteHits: 0,
  labelBuilds: 0,
  labelHits: 0,
  lastFrameTimestamp: 0,
  frameIntervalEmaMs: 0,
  lastDatasetUpdateAt: 0,
};
let ballisticPhysicsRevision = 0;
let trajectoryRenderRevision = 0;
let flatProjectionFrame = null;
let globeParamsMemo = null;
let drawnItemsCache = null;
let restrictionSurfaceCache = null;
let flatRestrictionGpuRenderer = null;
let flatBallisticGpuRenderer = null;
let restrictionHitSpatialIndex = null;
const restrictionSurfaceGeometryCache = new WeakMap();
const restrictionSurfaceBoundsCache = new WeakMap();
let nextRestrictionArrayIdentity = 1;
const restrictionArrayIdentities = new WeakMap();
let flatBaseFramePending = false;
let drawFramePending = false;
let lastInteractiveDrawAt = 0;
let globeBaseFramePending = false;
let hoverFramePending = false;
let pendingHoverPoint = null;
let globeModulePromise = null;
let jsZipPromise = null;
let globeRendererState = null;
let globeModeActive = null;
let globeInitFailed = false;
let globeInertiaFrame = 0;
let satelliteWorkers = [];
let satelliteWorkerReady = false;
let satelliteWorkerReadyCount = 0;
let satelliteWorkerAcceptedCount = 0;
let satelliteWorkerRejectedCount = 0;
let satelliteWorkerGeneration = 0;
let satelliteWorkerAssignments = [];
let satelliteWorkerIndexById = new Map();
let satellitePendingFrame = null;
let satelliteWorkerRequestId = 0;
let satelliteFramePending = false;
let satelliteAnimationFrame = 0;
let satelliteLastFrameAt = 0;
let satelliteLastPathAt = 0;
let satelliteLastPathSimulationMs = NaN;
let satelliteLastPropagatedTimeMs = NaN;
let satelliteLastVisualFrameAt = 0;
let satelliteVisualFrameEmaMs = 0;
let satelliteLastPresentationAt = 0;
let satellitePresentationFrameEmaMs = 0;
let satelliteLastOverlayAt = 0;
let satelliteInteractionFrameCount = 0;
let satelliteLastCoverageAt = 0;
let satelliteLastUiAt = 0;
let satelliteForcePathQueued = false;
let satellitePathRevision = 0;
let satelliteOrbitRenderSignature = "";
let satelliteCoverageRenderSignature = "";
let satelliteCoverageViewSignature = "";
let satelliteSearchRenderTimer = 0;
let satelliteClockLastSecond = NaN;
let satelliteSelectionRevision = 0;
let satelliteGpuPositionRevision = 0;
let satelliteGpuCoverageRevision = 0;
let satelliteGpuOrbitRevision = 0;
let satelliteDrawableOrbitCount = 0;
let satelliteOrbitPathRetryCount = 0;
let satelliteOrbitPathRetrySelectionRevision = -1;
let satelliteOrbitMissingIds = new Set();
let satelliteLastOrbitFit = null;
let satelliteCanvasCandidateCache = { key: "", ids: [] };
let satelliteThreeFramePending = false;
let globeSurfaceFramePending = false;
let globeSurfaceLastDrawAt = 0;
let satelliteAnimationTickCount = 0;
let satelliteRequestSkipPendingCount = 0;
const satellitePerformanceStats = {
  requests: 0,
  completions: 0,
  latencyEmaMs: 0,
  workerComputeEmaMs: 0,
};
let globeKeyboardBound = false;
let globeStableTextureZoom = 0;
let globePendingTextureZoom = 0;
let globeLodTimer = 0;
let tileLoadSequence = 0;
let activeTileLoads = 0;
let tileLoadQueue = [];
let flatSatelliteViewKey = "";
let flatBaseRenderSignature = "";
let flatSatelliteRefineAt = 0;
let flatSatelliteRefineTimer = 0;
let activeLoadController = null;
let faaRefreshPollTimer = null;
let msaRefreshPollTimer = null;
let msaRefreshPollFailures = 0;
let cloudAutoRefreshTimer = null;
let sunlightClockTimer = null;
let pendingFaaRefresh = false;
let faaRefreshPollFailureCount = 0;
let faaRefreshRequestedAt = 0;
let satelliteRefreshPollTimer = null;
let satelliteRefreshPollFailureCount = 0;
let satelliteRefreshRequestedAt = 0;
let ballisticAnimationFrame = 0;
let ballisticAnimationDrawFrame = 0;
let ballisticAnimationLastDomUpdateAt = 0;
let ballisticAnimationLastVisualDrawAt = 0;
let ballisticAnimationSession = null;
const ballisticAnimationObjectCaches = new Map();
const ballisticAnimationTrailCaches = new Map();
let ballisticAnimationCompositeTrailCache = null;
let ballisticAnimationLabelLayoutCache = null;
let ballisticProfileSurfaceCache = null;
const ballisticAnimationLabelCaches = new Map();
const ballisticGlowSpriteCache = new Map();
const ballisticImpactFlashSpriteCache = new Map();
const PLACE_LABELS = Array.isArray(window.NOTAM_PLACE_LABELS) ? window.NOTAM_PLACE_LABELS : [];
const placeLabelSpriteCache = new Map();
const launchDisplayPointCache = new WeakMap();
const launchSiteGroupCache = new WeakMap();
let launchWindowCache = null;
let ballisticInputDrawTimer = 0;
let trajectoryMetricFrame = 0;
let ballisticProfileFrame = 0;
const LANDMARK_RED = "#e0182d";
const LANDMARK_BLUE = "#1677ff";
const TILE_SOURCES = {
  osm: {
    label: "OpenStreetMap",
    get attribution() {
      return window.AppI18n?.isEnglish
        ? "Map © Esri, HERE, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors"
        : "© OpenStreetMap contributors";
    },
    background: "#d7e3e8",
    loading: "#dce6eb",
    failed: "#c8d2d8",
    url: (z, x, y) => window.AppI18n?.isEnglish
      ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`
      : `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  },
  satellite: {
    label: "卫星图",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    background: "#101614",
    loading: "#1b2420",
    failed: "#27322d",
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
  earth: {
    label: "地球",
    attribution: "Globe imagery © Esri, Maxar, Earthstar Geographics, British Antarctic Survey, and the GIS User Community",
    background: "#02070b",
    loading: "#172221",
    failed: "#24302c",
    url: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  },
};

const LANDMARKS = [
  {
    id: "jiuquan-space-launch-center",
    label: "酒泉卫星发射中心",
    lon: 100 + 15 / 60 + 47 / 3600,
    lat: 40 + 56 / 60 + 28.94 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "minqin-rocket-landing-site",
    label: "民勤回收火箭着陆场",
    lon: 102 + 0 / 60 + 26.76 / 3600,
    lat: 39 + 0 / 60 + 51.75 / 3600,
    color: LANDMARK_BLUE,
  },
  {
    id: "landspace-rocket-landing-site",
    label: "蓝箭航天火箭着陆场",
    lon: 103.480678,
    lat: 38.445094,
    color: LANDMARK_BLUE,
  },
  {
    id: "taiyuan-space-launch-center",
    label: "太原卫星发射中心",
    lon: 111 + 35 / 60 + 41.75 / 3600,
    lat: 38 + 52 / 60 + 21.18 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "xichang-space-launch-center",
    label: "西昌卫星发射中心",
    lon: 102 + 1 / 60 + 37.94 / 3600,
    lat: 28 + 14 / 60 + 47.08 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "oriental-spaceport",
    label: "东方航天港",
    lon: 121 + 14 / 60 + 24.22 / 3600,
    lat: 36 + 40 / 60 + 7.72 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "wenchang-space-launch-site",
    label: "文昌航天发射场",
    lon: 110 + 57 / 60 + 3.38 / 3600,
    lat: 19 + 36 / 60 + 48 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "hainan-commercial-space-launch-site",
    label: "海南商业航天发射场",
    lon: 110 + 55 / 60 + 56.09 / 3600,
    lat: 19 + 35 / 60 + 50.4 / 3600,
    color: LANDMARK_RED,
    callout: { dx: -148, dy: 34 },
  },
  {
    id: "vostochny-space-launch-site",
    label: "东方航天发射场",
    lon: 128 + 21 / 60 + 10.68 / 3600,
    lat: 51 + 50 / 60 + 41.39 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "dombarovsky-strategic-rocket-base",
    label: "栋巴罗夫斯基战略火箭军基地",
    lon: 59 + 37 / 60 + 59.87 / 3600,
    lat: 51 + 6 / 60 + 53.07 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "sary-shagan-abm-test-range",
    label: "萨雷·沙甘反导试验场",
    lon: 72 + 52 / 60 + 2.15 / 3600,
    lat: 46 + 23 / 60 + 1.47 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "baikonur-cosmodrome",
    label: "拜科努尔航天发射场",
    lon: 63 + 18 / 60 + 9.29 / 3600,
    lat: 46 + 0 / 60 + 26.61 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "kapustin-yar-test-range",
    label: "卡普斯京亚尔试验场",
    lon: 45 + 52 / 60 + 14.2 / 3600,
    lat: 48 + 40 / 60 + 35.11 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "plesetsk-cosmodrome",
    label: "普列谢茨克航天发射场",
    lon: 40 + 51 / 60 + 38.8 / 3600,
    lat: 62 + 53 / 60 + 51.12 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "kura-missile-test-range",
    label: "库拉导弹试验靶场",
    lon: 161 + 50 / 60 + 0.83 / 3600,
    lat: 57 + 20 / 60 + 0.14 / 3600,
    color: LANDMARK_BLUE,
  },
  {
    id: "tanegashima-space-center",
    label: "\u79cd\u5b50\u5c9b\u5b87\u5b99\u4e2d\u5fc3",
    lon: 130 + 58 / 60 + 31.27 / 3600,
    lat: 30 + 24 / 60 + 3.5 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "uchinoura-space-center",
    label: "\u5185\u4e4b\u6d66\u5b87\u5b99\u7a7a\u95f4\u89c2\u6d4b\u6240",
    lon: 131 + 4 / 60 + 34.01 / 3600,
    lat: 31 + 15 / 60 + 4.06 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "kii-launch-site",
    label: "\u7eaa\u4f0a\u53d1\u5c04\u573a",
    lon: 135 + 52 / 60 + 47 / 3600,
    lat: 33 + 33 / 60 + 2.99 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "naro-space-center",
    label: "\u7f57\u8001\u5b87\u5b99\u4e2d\u5fc3",
    lon: 127 + 32 / 60 + 6.05 / 3600,
    lat: 34 + 25 / 60 + 57.06 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "sohae-satellite-launching-station",
    label: "\u897f\u6d77\u536b\u661f\u53d1\u5c04\u573a",
    lon: 124 + 42 / 60 + 37.6 / 3600,
    lat: 39 + 39 / 60 + 26.97 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "satish-dhawan-space-centre",
    label: "\u8428\u8fea\u4ec0\u00b7\u8fbe\u4e07\u822a\u5929\u4e2d\u5fc3",
    lon: 80 + 13 / 60 + 54.67 / 3600,
    lat: 13 + 43 / 60 + 18.66 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "abdul-kalam-island",
    label: "\u963f\u535c\u675c\u52d2\u00b7\u5361\u62c9\u59c6\u535a\u58eb\u5c9b",
    lon: 87 + 5 / 60 + 1.99 / 3600,
    lat: 20 + 45 / 60 + 27.19 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "integrated-test-range",
    label: "\u7efc\u5408\u8bd5\u9a8c\u9776\u573a",
    lon: 87 + 0 / 60 + 57.59 / 3600,
    lat: 21 + 26 / 60 + 13.33 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "kennedy-space-center",
    label: "\u80af\u5c3c\u8fea\u822a\u5929\u4e2d\u5fc3",
    lon: -(80 + 33 / 60 + 10.66 / 3600),
    lat: 28 + 30 / 60 + 10.13 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "spacex-starbase",
    label: "SpaceX\u661f\u6e2f",
    lon: -(97 + 9 / 60 + 15.99 / 3600),
    lat: 25 + 59 / 60 + 45.97 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "vandenberg-space-force-base",
    label: "\u8303\u767b\u5821\u592a\u7a7a\u519b\u57fa\u5730",
    lon: -(120 + 32 / 60 + 41.9 / 3600),
    lat: 34 + 43 / 60 + 30.61 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "guiana-space-centre",
    label: "\u572d\u4e9a\u90a3\u822a\u5929\u4e2d\u5fc3",
    lon: -(52 + 46 / 60 + 7.13 / 3600),
    lat: 5 + 14 / 60 + 30.7 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "rocket-lab-launch-complex-1",
    label: "\u706b\u7bad\u5b9e\u9a8c\u5ba41\u53f7\u53d1\u5c04\u590d\u5408\u4f53",
    lon: 177 + 51 / 60 + 54.81 / 3600,
    lat: -(39 + 15 / 60 + 41.56 / 3600),
    color: LANDMARK_RED,
  },
  {
    id: "ronald-reagan-space-and-missile-test-site",
    label: "\u7f57\u7eb3\u5fb7\u00b7\u91cc\u6839\u592a\u7a7a\u548c\u5bfc\u5f39\u6d4b\u8bd5\u573a",
    lon: 167 + 32 / 60 + 12.9 / 3600,
    lat: 9 + 17 / 60 + 13.78 / 3600,
    color: LANDMARK_BLUE,
  },
  {
    id: "dga-missile-test-range",
    label: "DGA\u5bfc\u5f39\u8bd5\u9a8c\u573a",
    lon: -(1 + 14 / 60 + 52.84 / 3600),
    lat: 44 + 21 / 60 + 35.5 / 3600,
    color: LANDMARK_RED,
  },
  {
    id: "sea-launch-platform",
    label: "海上发射平台",
    lon: 126.366667,
    lat: 33.216667,
    color: LANDMARK_RED,
  },
  {
    id: "kwajalein-air-launch-site",
    label: "夸贾林环礁空射发射点",
    lon: 167.733333,
    lat: 8.716667,
    color: LANDMARK_RED,
    callout: { dx: 22, dy: 42 },
  },
  {
    id: "andoya-spaceport",
    label: "安岛航天港",
    lon: 15.5895,
    lat: 69.1084,
    color: LANDMARK_RED,
  },
  {
    id: "saxavord-spaceport",
    label: "萨克萨沃德航天港",
    lon: -0.7626391593025057,
    lat: 60.81736038715111,
    color: LANDMARK_RED,
  },
  {
    id: "esrange-space-center",
    label: "埃斯兰格航天中心",
    lon: 21.165001,
    lat: 67.877368,
    color: LANDMARK_RED,
  },
  {
    id: "alcantara-space-center",
    label: "阿尔坎塔拉航天中心",
    lon: -44.36873,
    lat: -2.31698,
    color: LANDMARK_RED,
  },
  {
    id: "wallops-flight-facility",
    label: "瓦勒普斯飞行基地",
    lon: -75.4881,
    lat: 37.8337,
    color: LANDMARK_RED,
  },
  {
    id: "bowen-orbital-spaceport",
    label: "鲍恩轨道航天港",
    lon: 148.1129553,
    lat: -19.958151,
    color: LANDMARK_RED,
  },
  {
    id: "etlaq-spaceport",
    label: "\u57c3\u7279\u62c9\u683c\u592a\u7a7a\u6e2f",
    lon: 56.822,
    lat: 18.7862,
    color: LANDMARK_RED,
  },
  {
    id: "white-sands-air-launch-site",
    label: "白沙空射发射点",
    lon: -106.9719162,
    lat: 32.9902778,
    color: LANDMARK_RED,
  },
  {
    id: "hokkaido-spaceport",
    label: "北海道航天港",
    lon: 143.441389,
    lat: 42.5,
    color: LANDMARK_RED,
  },
  {
    id: "chizha-missile-test-range",
    label: "奇扎导弹试验靶场",
    lon: 43.2735,
    lat: 68.6569,
    color: LANDMARK_BLUE,
  },
];

const LANDMARK_LAUNCH_ALIASES = {
  "jiuquan-space-launch-center": ["jiuquan"],
  "taiyuan-space-launch-center": ["taiyuan"],
  "xichang-space-launch-center": ["xichang"],
  "oriental-spaceport": ["haiyang", "oriental spaceport"],
  "wenchang-space-launch-site": ["wenchang"],
  "vostochny-space-launch-site": ["vostochny"],
  "baikonur-cosmodrome": ["baikonur"],
  "plesetsk-cosmodrome": ["plesetsk"],
  "tanegashima-space-center": ["tanegashima"],
  "uchinoura-space-center": ["uchinoura"],
  "kii-launch-site": ["kii"],
  "naro-space-center": ["naro"],
  "sohae-satellite-launching-station": ["sohae"],
  "satish-dhawan-space-centre": ["satish dhawan", "sriharikota"],
  "kennedy-space-center": ["kennedy", "ksc", "cape canaveral", "canaveral"],
  "spacex-starbase": ["starbase", "boca chica"],
  "vandenberg-space-force-base": ["vandenberg"],
  "guiana-space-centre": ["guiana", "kourou"],
  "rocket-lab-launch-complex-1": ["rocket lab launch complex 1", "mahia"],
  "sea-launch-platform": ["sea launch"],
  "kwajalein-air-launch-site": ["kwajalein", "air launch to orbit"],
  "andoya-spaceport": ["andøya", "andoya"],
  "saxavord-spaceport": ["saxavord"],
  "esrange-space-center": ["esrange"],
  "alcantara-space-center": ["alcântara", "alcantara"],
  "wallops-flight-facility": ["wallops"],
  "bowen-orbital-spaceport": ["bowen"],
  "etlaq-spaceport": ["etlaq", "etlaq spaceport", "launch complex 3"],
  "white-sands-air-launch-site": ["air launch to suborbital", "white sands"],
  "hokkaido-spaceport": ["hokkaido"],
};

const WATCH_REGIONS = [
  {
    id: "russia",
    label: "俄罗斯 FIR",
    note: "Moscow / St. Petersburg / Siberia / Far East FIR watch area",
    color: "#ff8a4c",
    bounds: { minLon: 19, minLat: 41, maxLon: 179.9, maxLat: 82 },
    geometry: boxGeometry(19, 41, 179.9, 82),
  },
  {
    id: "china",
    label: "中国 FIR",
    note: "Beijing / Shanghai / Guangzhou / Wuhan / Lanzhou / Urumqi / Sanya FIR watch area",
    color: "#ff5a70",
    bounds: { minLon: 73, minLat: 17, maxLon: 135, maxLat: 54 },
    geometry: boxGeometry(73, 17, 135, 54),
  },
  {
    id: "southeast-asia",
    label: "东南亚 FIR",
    note: "Bangkok / Ho Chi Minh / Singapore / Kuala Lumpur / Jakarta / Manila watch area",
    color: "#28c58f",
    bounds: { minLon: 92, minLat: -12, maxLon: 132, maxLat: 24 },
    geometry: boxGeometry(92, -12, 132, 24),
  },
  {
    id: "south-china-sea",
    label: "南海 FIR / 海域",
    note: "Sanya, Ho Chi Minh, Manila, Singapore and adjacent South China Sea watch area",
    color: "#34b7ff",
    bounds: { minLon: 104, minLat: 1, maxLon: 123, maxLat: 24 },
    geometry: boxGeometry(104, 1, 123, 24),
  },
  {
    id: "western-pacific",
    label: "西太平洋 FIR",
    note: "Fukuoka / Incheon / Taipei / Manila / Guam / adjacent oceanic watch area",
    color: "#8b7cf6",
    bounds: { minLon: 118, minLat: -2, maxLon: 170, maxLat: 52 },
    geometry: boxGeometry(118, -2, 170, 52),
  },
  {
    id: "eastern-pacific",
    label: "东太平洋 / 美洲 FIR",
    note: "Oakland, Canada, Mexico, Central America and South America Pacific FIR watch area",
    color: "#d372ff",
    bounds: { minLon: -170, minLat: -60, maxLon: -65, maxLat: 70 },
    geometry: boxGeometry(-170, -60, -65, 70),
  },
  {
    id: "indian-ocean",
    label: "印度洋 FIR",
    note: "Bay of Bengal, Arabian Sea, East Africa, Australia and southern Indian Ocean watch area",
    color: "#f0b442",
    bounds: { minLon: 20, minLat: -45, maxLon: 115, maxLat: 32 },
    geometry: boxGeometry(20, -45, 115, 32),
  },
];

const state = {
  payload: null,
  hydropacPayload: null,
  msaPayload: null,
  navareaPayload: null,
  launchPayload: null,
  cloudPayload: null,
  satellitePayload: null,
  satelliteCatalogItems: [],
  satelliteCatalogCounts: null,
  satelliteCustomElementsById: new Map(),
  satelliteElementNotice: null,
  refreshHistory: null,
  refreshHistorySource: "notam",
  selectedHistoryKey: "",
  faaRestrictions: [],
  hydropacWarnings: [],
  msaWarnings: [],
  navareaWarnings: [],
  launchForecasts: [],
  satellites: [],
  satelliteById: new Map(),
  satellitePayloadById: new Map(),
  satellitePayloadSearchById: new Map(),
  satelliteSeriesById: new Map(),
  satelliteRefreshBaselineIds: null,
  satelliteRefreshClassificationSummary: "",
  selectedSatelliteIds: new Set(),
  satelliteOrbitClasses: new Set(["LEO", "MEO", "GEO", "HEO"]),
  satelliteObjectClasses: new Set(["ACTIVE_PAYLOAD"]),
  satelliteVisibleIds: [],
  satelliteImagingIds: [],
  satelliteCommunicationIds: [],
  satelliteCoverageGeometryById: new Map(),
  satellitePositions: new Map(),
  satellitePropagationErrorIds: new Set(),
  satelliteOrbitPaths: new Map(),
  satelliteScreenPoints: [],
  satelliteLayerEnabled: true,
  satelliteOrbitLinesEnabled: true,
  satelliteLabelsEnabled: true,
  satelliteAllLabelsEnabled: false,
  satelliteCoverageEnabled: true,
  satelliteImagingEnabled: true,
  satelliteCommunicationEnabled: true,
  satelliteImagingOpacity: 0.45,
  satelliteCommunicationOpacity: 0.45,
  satelliteSwathEditEnabled: false,
  satelliteSwathMode: "ground-fixed",
  satelliteSwathTargets: new Map(),
  satelliteSwathDrag: null,
  satelliteSwathHandle: null,
  satelliteOrbitLineWidth: 1.5,
  satellitePointSize: 7,
  satelliteLabelSize: 12,
  satellitePayloadSummary: null,
  satelliteLoading: false,
  satelliteFocusedId: "",
  satelliteHoverId: "",
  satellitePendingFitId: "",
  satelliteTimeMs: Date.now(),
  satelliteTimeExplicit: false,
  satellitePlaybackRate: 0,
  satellitePlaybackMagnitude: 60,
  satellitePlaybackAnchorRealMs: 0,
  satellitePlaybackAnchorSimMs: 0,
  satelliteReferenceFrame: "earth-fixed",
  satelliteDualClockEnabled: false,
  satelliteReferenceEpochMs: Date.now(),
  satelliteInterpolationDurationSec: 1,
  satelliteElementMode: "current",
  satelliteHistoricalElementsById: new Map(),
  satelliteHistorySource: null,
  satelliteConstellationCounts: new Map(),
  satelliteConstellationIdsByKey: new Map(),
  satelliteSelectedConstellationCounts: new Map(),
  satelliteSelectedEpochMinMs: NaN,
  satelliteSelectedEpochMaxMs: NaN,
  customItems: [],
  savedRegionOverlays: [],
  restrictions: [],
  restrictionById: new Map(),
  drawableRestrictions: [],
  drawableRestrictionById: new Map(),
  restrictionPathsById: new Map(),
  filtered: [],
  displayMode: "all",
  selectedCountries: new Set(),
  selectedRegions: new Set(),
  selectedWatchRegions: new Set(),
  hiddenLandmarkIds: new Set(),
  search: "",
  notamIdSearch: "",
  newOnly: false,
  withGeometryOnly: false,
  highlightOnly: false,
  notamEnabled: false,
  hydropacEnabled: false,
  msaEnabled: false,
  navareaEnabled: false,
  cloudOverlayEnabled: false,
  sunlightEnabled: false,
  cloudOpacity: DEFAULT_CLOUD_OVERLAY_OPACITY,
  cloudTimeline: [],
  cloudSelectedSlot: 0,
  cloudSelectedHour: "",
  customCoordinatesEnabled: true,
  customMapAddMode: false,
  hydropacLoading: false,
  msaLoading: false,
  navareaLoading: false,
  launchLoading: false,
  cloudLoading: false,
  launchNext7Only: false,
  selectedLaunchSiteId: "",
  selectedLaunchId: "",
  hoverLaunchSiteId: "",
  detailMode: "notam",
  baseLayer: initialBaseLayer(),
  placeLabelsEnabled: true,
  landmarkLabelsEnabled: true,
  launchRingsEnabled: true,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  trajectoryEnabled: false,
  trajectoryAreaPickEnabled: false,
  trajectoryAreaHighlightEnabled: false,
  highlightedRestrictionIds: new Set(),
  trajectoryLengthLabels: false,
  trajectoryInclinationLabels: false,
  trajectoryPointIds: [],
  timeWindowRestrictionIds: new Set(),
  timeWindowAnchorId: "",
  timeWindowSummary: null,
  activeTrajectoryId: "trajectory-1",
  nextTrajectoryNumber: 2,
  nextTrajectoryPointNumber: 1,
  nextBallisticStageNumber: 1,
  nextCustomCoordinateNumber: 1,
  trajectoryTracks: [
    {
      id: "trajectory-1",
      name: "轨迹 1",
      color: "#ffe08a",
      lineWidth: DEFAULT_TRAJECTORY_LINE_WIDTH,
      dashDensity: DEFAULT_TRAJECTORY_DASH_DENSITY,
      groundTrackGlow: 10,
      geodesic: false,
      showGroundTrack: true,
      groundTrackMode: "manual",
      groundTrackSources: ["manual"],
      manualLocked: false,
      pointIds: [],
      points: [],
      curveControls: {},
      ballistic: {
        enabled: false,
        showPoweredPath: true,
        poweredPathColor: "#ffd166",
        poweredPathWidth: 4,
        poweredVerticalLaunch: true,
        poweredStartLon: null,
        poweredStartLat: null,
        showLabels: true,
        showAnimationLabels: true,
        showGroundRange: true,
        activeStageId: "",
        stages: [],
      },
    },
  ],
  selectedId: null,
  searchRevealRestrictionId: "",
  hoverId: null,
  hoverRestrictionIds: new Set(),
  tooltipHovering: false,
  tooltipHideTimer: null,
  tooltipSignature: "",
  tooltipPinned: false,
  pinnedRestrictionIds: [],
  restrictionTooltipLeft: null,
  trajectoryDrag: null,
  ballisticPickStageId: "",
  ballisticTargetPickStageId: "",
  ballisticPoweredStartPickTrackId: "",
  ballisticPickMessage: "",
  ballisticTargetPickMessage: "",
  ballisticPoweredStartPickMessage: "",
  ballisticAnimation: {
    trackId: "",
    stageId: "",
    objectKeys: [],
    objectSettings: {},
    focusKey: "",
    elapsedSec: 0,
    speed: 10,
    referenceFrame: "earth-fixed",
    playing: false,
    playbackStartedAt: 0,
    playbackStartElapsedSec: 0,
    impactFlashStartedAtByKey: {},
    cacheStatus: "idle",
    cacheMessage: "尚未预计算动画缓存",
  },
  selectedCustomId: "",
  paths: [],
  launchSitePaths: [],
  customPaths: [],
  view: {
    lon: 112,
    lat: 25,
    zoom: 3,
    globeTilt: 0,
    globeBearing: 0,
    drag: null,
    suppressClick: false,
    suppressClickUntil: 0,
  },
};

applyDebugGlobeInitialView();

function applyDebugGlobeInitialView() {
  if (!GLOBE_PIXEL_DEBUG) return;
  const params = new URLSearchParams(window.location.search);
  const lon = Number(params.get("debugGlobeLon"));
  const lat = Number(params.get("debugGlobeLat"));
  const zoom = Number(params.get("debugGlobeZoom"));
  const tilt = Number(params.get("debugGlobeTilt"));
  const bearing = Number(params.get("debugGlobeBearing"));
  if (Number.isFinite(lon)) state.view.lon = normalizeLon(lon);
  if (Number.isFinite(lat)) state.view.lat = clamp(lat, -90, 90);
  if (Number.isFinite(zoom)) state.view.zoom = clamp(zoom, GLOBE_MIN_ZOOM, MAX_ZOOM);
  if (Number.isFinite(tilt)) state.view.globeTilt = clamp(tilt, 0, 80);
  if (Number.isFinite(bearing)) state.view.globeBearing = normalizeBearing(bearing);
}

const els = {
  workspace: document.querySelector(".workspace"),
  canvas: document.getElementById("mapCanvas"),
  baseCanvas: document.getElementById("baseMapCanvas"),
  globeCanvas: document.getElementById("globeCanvas"),
  restrictionGpuCanvas: document.getElementById("restrictionGpuCanvas"),
  globeSurfaceCanvas: document.getElementById("globeSurfaceCanvas"),
  ballisticGpuCanvas: document.getElementById("ballisticGpuCanvas"),
  animationCanvas: document.getElementById("animationCanvas"),
  satelliteCoverageCanvas: document.getElementById("satelliteCoverageCanvas"),
  satelliteOrbitCanvas: document.getElementById("satelliteOrbitCanvas"),
  satelliteCanvas: document.getElementById("satelliteCanvas"),
  earthNavigation: document.getElementById("earthNavigation"),
  tooltip: document.getElementById("tooltip"),
  mapStatus: document.getElementById("mapStatus"),
  mapAttribution: document.getElementById("mapAttribution"),
  resetNorthButton: document.getElementById("resetNorthButton"),
  earthZoomInButton: document.getElementById("earthZoomInButton"),
  earthZoomOutButton: document.getElementById("earthZoomOutButton"),
  earthResetTiltButton: document.getElementById("earthResetTiltButton"),
  sourceLine: document.getElementById("sourceLine"),
  sourceStatus: document.getElementById("sourceStatus"),
  performanceProfile: document.getElementById("performanceProfile"),
  refreshHistoryCount: document.getElementById("refreshHistoryCount"),
  refreshHistoryList: document.getElementById("refreshHistoryList"),
  updatedAt: document.getElementById("updatedAt"),
  visibleCount: document.getElementById("visibleCount"),
  resultSummary: document.getElementById("resultSummary"),
  restrictionList: document.getElementById("restrictionList"),
  detailSectionTitle: document.getElementById("detailSectionTitle"),
  detailSearchLabel: document.getElementById("detailSearchLabel"),
  notamIdSearchInput: document.getElementById("notamIdSearchInput"),
  notamIdSearchResults: document.getElementById("notamIdSearchResults"),
  launchSiteFilterBox: document.getElementById("launchSiteFilterBox"),
  launchSiteFilterSelect: document.getElementById("launchSiteFilterSelect"),
  countryFilters: document.getElementById("countryFilters"),
  regionFilters: document.getElementById("regionFilters"),
  watchRegionFilters: document.getElementById("watchRegionFilters"),
  landmarkFilters: document.getElementById("landmarkFilters"),
  landmarkCount: document.getElementById("landmarkCount"),
  landmarkLabelsToggle: document.getElementById("landmarkLabelsToggle"),
  launchRingsToggle: document.getElementById("launchRingsToggle"),
  legend: document.getElementById("legend"),
  searchInput: document.getElementById("searchInput"),
  newOnlyToggle: document.getElementById("newOnlyToggle"),
  withGeometryToggle: document.getElementById("withGeometryToggle"),
  highlightOnlyToggle: document.getElementById("highlightOnlyToggle"),
  notamToggle: document.getElementById("notamToggle"),
  hydropacToggle: document.getElementById("hydropacToggle"),
  msaToggle: document.getElementById("msaToggle"),
  navareaToggle: document.getElementById("navareaToggle"),
  trajectoryToggle: document.getElementById("trajectoryToggle"),
  trajectoryGroundTrackToggle: document.getElementById("trajectoryGroundTrackToggle"),
  trajectoryGroundTrackSourceList: document.getElementById("trajectoryGroundTrackSourceList"),
  trajectoryGroundTrackSourceCount: document.getElementById("trajectoryGroundTrackSourceCount"),
  trajectoryLockButton: document.getElementById("trajectoryLockButton"),
  trajectoryLockStatus: document.getElementById("trajectoryLockStatus"),
  trajectoryAreaPickToggle: document.getElementById("trajectoryAreaPickToggle"),
  trajectoryAreaHighlightToggle: document.getElementById("trajectoryAreaHighlightToggle"),
  trajectoryTrackSelect: document.getElementById("trajectoryTrackSelect"),
  trajectoryColorInput: document.getElementById("trajectoryColorInput"),
  trajectoryWidthInput: document.getElementById("trajectoryWidthInput"),
  trajectoryWidthValue: document.getElementById("trajectoryWidthValue"),
  trajectoryGlowInput: document.getElementById("trajectoryGlowInput"),
  trajectoryGlowValue: document.getElementById("trajectoryGlowValue"),
  trajectoryDashInput: document.getElementById("trajectoryDashInput"),
  trajectoryDashValue: document.getElementById("trajectoryDashValue"),
  trajectoryLengthToggle: document.getElementById("trajectoryLengthToggle"),
  trajectoryInclinationToggle: document.getElementById("trajectoryInclinationToggle"),
  trajectoryGeodesicToggle: document.getElementById("trajectoryGeodesicToggle"),
  trajectoryCount: document.getElementById("trajectoryCount"),
  trajectoryPlanList: document.getElementById("trajectoryPlanList"),
  newTrajectoryButton: document.getElementById("newTrajectoryButton"),
  deleteTrajectoryButton: document.getElementById("deleteTrajectoryButton"),
  undoTrajectoryPointButton: document.getElementById("undoTrajectoryPointButton"),
  redoTrajectoryPointButton: document.getElementById("redoTrajectoryPointButton"),
  clearTrajectoryButton: document.getElementById("clearTrajectoryButton"),
  customCoordinateCount: document.getElementById("customCoordinateCount"),
  customCoordinateToggle: document.getElementById("customCoordinateToggle"),
  customMapAddToggle: document.getElementById("customMapAddToggle"),
  customCoordinateName: document.getElementById("customCoordinateName"),
  customCoordinateValue: document.getElementById("customCoordinateValue"),
  customCoordinateList: document.getElementById("customCoordinateList"),
  addCustomCoordinateButton: document.getElementById("addCustomCoordinateButton"),
  fitCustomCoordinatesButton: document.getElementById("fitCustomCoordinatesButton"),
  customCoordinateBatch: document.getElementById("customCoordinateBatch"),
  importBatchCoordinatesButton: document.getElementById("importBatchCoordinatesButton"),
  clearCustomCoordinatesButton: document.getElementById("clearCustomCoordinatesButton"),
  customKmlFileInput: document.getElementById("customKmlFileInput"),
  exportCustomKmlButton: document.getElementById("exportCustomKmlButton"),
  exportCustomKmzButton: document.getElementById("exportCustomKmzButton"),
  selectedCustomCoordinateBox: document.getElementById("selectedCustomCoordinateBox"),
  selectedCustomCoordinateName: document.getElementById("selectedCustomCoordinateName"),
  selectedCustomCoordinateValueBox: document.getElementById("selectedCustomCoordinateValueBox"),
  selectedCustomCoordinateValue: document.getElementById("selectedCustomCoordinateValue"),
  selectedCustomCoordinateDescription: document.getElementById("selectedCustomCoordinateDescription"),
  updateCustomCoordinateButton: document.getElementById("updateCustomCoordinateButton"),
  deleteCustomCoordinateButton: document.getElementById("deleteCustomCoordinateButton"),
  customCoordinateStatus: document.getElementById("customCoordinateStatus"),
  refreshProgress: document.getElementById("refreshProgress"),
  notamSourceRefreshButton: document.getElementById("notamSourceRefreshButton"),
  hydropacFetchButton: document.getElementById("hydropacFetchButton"),
  hydropacProgress: document.getElementById("hydropacProgress"),
  msaFetchButton: document.getElementById("msaFetchButton"),
  msaProgress: document.getElementById("msaProgress"),
  navareaFetchButton: document.getElementById("navareaFetchButton"),
  navareaProgress: document.getElementById("navareaProgress"),
  cloudOverlayToggle: document.getElementById("cloudOverlayToggle"),
  cloudOverlayLabel: document.getElementById("cloudOverlayLabel"),
  sunlightToggle: document.getElementById("sunlightToggle"),
  cloudProgress: document.getElementById("cloudProgress"),
  cloudOpacityInput: document.getElementById("cloudOpacityInput"),
  cloudOpacityValue: document.getElementById("cloudOpacityValue"),
  placeLabelsToggle: document.getElementById("placeLabelsToggle"),
  cloudTimeSlider: document.getElementById("cloudTimeSlider"),
  cloudTimeValue: document.getElementById("cloudTimeValue"),
  cloudTimeTicks: document.getElementById("cloudTimeTicks"),
  cloudTimelineLabels: document.getElementById("cloudTimelineLabels"),
  cloudYearSelect: document.getElementById("cloudYearSelect"),
  cloudMonthSelect: document.getElementById("cloudMonthSelect"),
  cloudDaySelect: document.getElementById("cloudDaySelect"),
  cloudHourSelect: document.getElementById("cloudHourSelect"),
  cloudTimeApplyButton: document.getElementById("cloudTimeApplyButton"),
  cloudLatestRefreshButton: document.getElementById("cloudLatestRefreshButton"),
  launchFetchButton: document.getElementById("launchFetchButton"),
  launchProgress: document.getElementById("launchProgress"),
  satelliteFetchButton: document.getElementById("satelliteFetchButton"),
  satelliteProgress: document.getElementById("satelliteProgress"),
  satelliteControls: document.getElementById("satelliteControls"),
  satelliteLayerToggle: document.getElementById("satelliteLayerToggle"),
  satelliteOrbitLinesToggle: document.getElementById("satelliteOrbitLinesToggle"),
  satelliteLabelsToggle: document.getElementById("satelliteLabelsToggle"),
  satelliteAllLabelsToggle: document.getElementById("satelliteAllLabelsToggle"),
  satelliteDualClockToggle: document.getElementById("satelliteDualClockToggle"),
  satelliteDualClock: document.getElementById("satelliteDualClock"),
  satelliteBeijingClock: document.getElementById("satelliteBeijingClock"),
  satelliteUtcClock: document.getElementById("satelliteUtcClock"),
  satelliteCoverageToggle: document.getElementById("satelliteCoverageToggle"),
  satelliteImagingToggle: document.getElementById("satelliteImagingToggle"),
  satelliteCommunicationToggle: document.getElementById("satelliteCommunicationToggle"),
  satelliteImagingOpacityInput: document.getElementById("satelliteImagingOpacityInput"),
  satelliteImagingOpacityValue: document.getElementById("satelliteImagingOpacityValue"),
  satelliteCommunicationOpacityInput: document.getElementById("satelliteCommunicationOpacityInput"),
  satelliteCommunicationOpacityValue: document.getElementById("satelliteCommunicationOpacityValue"),
  satelliteSwathEditToggle: document.getElementById("satelliteSwathEditToggle"),
  satelliteSwathResetButton: document.getElementById("satelliteSwathResetButton"),
  satelliteSwathRollInput: document.getElementById("satelliteSwathRollInput"),
  satelliteSwathRollNumber: document.getElementById("satelliteSwathRollNumber"),
  satelliteSwathStatus: document.getElementById("satelliteSwathStatus"),
  satelliteOrbitWidthInput: document.getElementById("satelliteOrbitWidthInput"),
  satelliteOrbitWidthValue: document.getElementById("satelliteOrbitWidthValue"),
  satellitePointSizeInput: document.getElementById("satellitePointSizeInput"),
  satellitePointSizeValue: document.getElementById("satellitePointSizeValue"),
  satelliteLabelSizeInput: document.getElementById("satelliteLabelSizeInput"),
  satelliteLabelSizeValue: document.getElementById("satelliteLabelSizeValue"),
  satellitePayloadStatus: document.getElementById("satellitePayloadStatus"),
  satelliteConstellationStatus: document.getElementById("satelliteConstellationStatus"),
  satelliteReferenceStatus: document.getElementById("satelliteReferenceStatus"),
  satelliteLeoCount: document.getElementById("satelliteLeoCount"),
  satelliteMeoCount: document.getElementById("satelliteMeoCount"),
  satelliteGeoCount: document.getElementById("satelliteGeoCount"),
  satelliteHeoCount: document.getElementById("satelliteHeoCount"),
  satelliteActiveCount: document.getElementById("satelliteActiveCount"),
  satelliteInactiveCount: document.getElementById("satelliteInactiveCount"),
  satelliteRocketBodyCount: document.getElementById("satelliteRocketBodyCount"),
  satelliteDebrisCount: document.getElementById("satelliteDebrisCount"),
  satelliteUnknownCount: document.getElementById("satelliteUnknownCount"),
  satelliteSelectFilteredButton: document.getElementById("satelliteSelectFilteredButton"),
  satelliteBulkSelectionSelect: document.getElementById("satelliteBulkSelectionSelect"),
  satelliteBulkSelectionApplyButton: document.getElementById("satelliteBulkSelectionApplyButton"),
  satelliteFitSelectedButton: document.getElementById("satelliteFitSelectedButton"),
  satelliteClearSelectionButton: document.getElementById("satelliteClearSelectionButton"),
  satelliteElementFormatSelect: document.getElementById("satelliteElementFormatSelect"),
  satelliteElementInput: document.getElementById("satelliteElementInput"),
  satelliteElementApplyButton: document.getElementById("satelliteElementApplyButton"),
  satelliteElementFileButton: document.getElementById("satelliteElementFileButton"),
  satelliteElementFileInput: document.getElementById("satelliteElementFileInput"),
  satelliteElementClearButton: document.getElementById("satelliteElementClearButton"),
  satelliteElementStatus: document.getElementById("satelliteElementStatus"),
  satelliteElementList: document.getElementById("satelliteElementList"),
  satelliteTimeInput: document.getElementById("satelliteTimeInput"),
  satelliteDateApplyButton: document.getElementById("satelliteDateApplyButton"),
  satelliteHistoryIdentityInput: document.getElementById("satelliteHistoryIdentityInput"),
  satelliteHistoryPasswordInput: document.getElementById("satelliteHistoryPasswordInput"),
  satelliteHistoryStatus: document.getElementById("satelliteHistoryStatus"),
  satelliteNowButton: document.getElementById("satelliteNowButton"),
  satelliteReverseButton: document.getElementById("satelliteReverseButton"),
  satellitePauseButton: document.getElementById("satellitePauseButton"),
  satelliteForwardButton: document.getElementById("satelliteForwardButton"),
  satelliteSpeedSelect: document.getElementById("satelliteSpeedSelect"),
  satelliteSelectionStatus: document.getElementById("satelliteSelectionStatus"),
  satelliteEpochStatus: document.getElementById("satelliteEpochStatus"),
  launchFilterControls: document.getElementById("launchFilterControls"),
  launchNext7Button: document.getElementById("launchNext7Button"),
  refreshButton: document.getElementById("refreshButton"),
  fitWorldButton: document.getElementById("fitWorldButton"),
  fitSelectionButton: document.getElementById("fitSelectionButton"),
  leftPanelToggle: document.getElementById("leftPanelToggle"),
  rightPanelToggle: document.getElementById("rightPanelToggle"),
  clearCountriesButton: document.getElementById("clearCountriesButton"),
  clearRegionsButton: document.getElementById("clearRegionsButton"),
  clearWatchButton: document.getElementById("clearWatchButton"),
  showAllLandmarksButton: document.getElementById("showAllLandmarksButton"),
  hideAllLandmarksButton: document.getElementById("hideAllLandmarksButton"),
};

const CATEGORY_COLORS = new Map([
  ["AD", "#d84f5f"],
  ["IAP", "#7b61ff"],
  ["INTERNATIONAL", "#ff7b86"],
  ["MILITARY", "#c65dd8"],
  ["NAV", "#2f9cff"],
  ["ROUTE", "#f0a33a"],
  ["RWY", "#27a66d"],
  ["HYDROPAC", HYDROPAC_AREA_COLOR],
  ["中国航警", MSA_WARNING_AREA_COLOR],
  ["NAVAREA", NAVAREA_WARNING_AREA_COLOR],
  ["Security", "#ef5555"],
  ["Hazards", "#f29e3d"],
  ["Vip", "#8b7cf6"],
  ["Space Operations", "#34b7ff"],
  ["Air Shows/Sports", "#28c58f"],
  ["Uas Public Gathering", "#e35fb8"],
  ["Special", "#f3d35a"],
  ["Notam", NOTAM_AREA_COLOR],
]);

const COUNTRY_FILTER_GROUP_ORDER = [
  "east-asia",
  "southeast-asia",
  "south-asia",
  "central-west-asia",
  "europe-russia",
  "africa",
  "north-america",
  "latin-america",
  "oceania",
  "oceanic-fir",
  "maritime-pacific",
  "maritime-indian",
  "maritime-atlantic",
  "other",
];
const COUNTRY_FILTER_GROUP_LABELS = new Map([
  ["east-asia", "东亚"],
  ["southeast-asia", "东南亚"],
  ["south-asia", "南亚"],
  ["central-west-asia", "中亚与西亚"],
  ["europe-russia", "欧洲、俄罗斯与北亚"],
  ["africa", "非洲"],
  ["north-america", "北美"],
  ["latin-america", "拉丁美洲与加勒比"],
  ["oceania", "大洋洲与太平洋岛屿"],
  ["oceanic-fir", "远洋与极区飞行情报区"],
  ["maritime-pacific", "海域 · 太平洋"],
  ["maritime-indian", "海域 · 印度洋与邻近海湾"],
  ["maritime-atlantic", "海域 · 大西洋与邻近海域"],
  ["other", "其他与未归类"],
]);
const COUNTRY_FILTER_LABELS = new Map([
  ["China", "中国"], ["Taiwan", "中国台湾"], ["Hong Kong", "中国香港"], ["Macau", "中国澳门"],
  ["Japan", "日本"], ["South Korea", "韩国"], ["North Korea", "朝鲜"], ["Mongolia", "蒙古"],
  ["Malaysia", "马来西亚"], ["Indonesia", "印度尼西亚"], ["Singapore", "新加坡"], ["Philippines", "菲律宾"],
  ["Thailand", "泰国"], ["Vietnam", "越南"], ["Cambodia", "柬埔寨"], ["Laos", "老挝"],
  ["India", "印度"], ["Pakistan", "巴基斯坦"], ["Bangladesh", "孟加拉国"], ["Sri Lanka", "斯里兰卡"],
  ["Maldives", "马尔代夫"], ["Afghanistan", "阿富汗"], ["Iran", "伊朗"], ["Iraq", "伊拉克"],
  ["Saudi Arabia", "沙特阿拉伯"], ["United Arab Emirates", "阿联酋"], ["Oman", "阿曼"], ["Qatar", "卡塔尔"],
  ["Bahrain", "巴林"], ["Kuwait", "科威特"], ["Yemen", "也门"], ["Türkiye", "土耳其"],
  ["Kazakhstan", "哈萨克斯坦"], ["Turkmenistan", "土库曼斯坦"], ["Tajikistan", "塔吉克斯坦"],
  ["Europe", "欧洲（综合）"], ["Russia", "俄罗斯"], ["Africa", "非洲（综合）"], ["South Africa", "南非"],
  ["Egypt", "埃及"], ["Ethiopia", "埃塞俄比亚"], ["Kenya", "肯尼亚"], ["Tanzania", "坦桑尼亚"],
  ["Somalia", "索马里"], ["Mauritius", "毛里求斯"], ["United States", "美国"], ["Canada", "加拿大"],
  ["Mexico", "墨西哥"], ["Argentina", "阿根廷"], ["Chile", "智利"], ["Colombia", "哥伦比亚"],
  ["Ecuador", "厄瓜多尔"], ["Peru", "秘鲁"], ["Panama", "巴拿马"], ["South America", "南美洲（综合）"],
  ["Central America", "中美洲（综合）"], ["Australia", "澳大利亚"], ["Papua New Guinea", "巴布亚新几内亚"],
  ["New Caledonia", "新喀里多尼亚"], ["Fiji", "斐济"], ["Vanuatu", "瓦努阿图"], ["Tonga", "汤加"],
  ["Marshall Islands", "马绍尔群岛"], ["Solomon Islands", "所罗门群岛"], ["French Polynesia", "法属波利尼西亚"],
  ["Samoa / American Samoa", "萨摩亚 / 美属萨摩亚"], ["Cook Islands", "库克群岛"], ["Niue", "纽埃"],
  ["Kiribati", "基里巴斯"], ["Guam", "关岛"], ["Wake Island", "威克岛"],
  ["Middle East", "中东（综合）"], ["Unknown", "未归类（保留原始 FIR）"],
]);
const OCEANIC_FIR_FILTERS = new Map([
  ["Alaska / Arctic Oceanic", "美国 · 阿拉斯加 / 北极洋 FIR"],
  ["Canada / Pacific", "加拿大 · 太平洋 FIR"],
  ["Hawaii / Pacific Oceanic", "美国 · 夏威夷 / 太平洋 FIR"],
  ["Mexico / Pacific", "墨西哥 · 太平洋 FIR"],
  ["New Zealand / Oceanic", "新西兰 · 大洋洲 FIR"],
  ["United States / Pacific Oceanic", "美国 · 太平洋远洋 FIR"],
]);
const NAVAREA_FILTER_LABELS = new Map([
  ["NAVAREA I", ["NAVAREA I · 北大西洋东部 / 北海", "maritime-atlantic"]],
  ["NAVAREA II", ["NAVAREA II · 东北大西洋 / 西非", "maritime-atlantic"]],
  ["NAVAREA IV", ["NAVAREA IV · 西北大西洋 / 加勒比海", "maritime-atlantic"]],
  ["NAVAREA VIII", ["NAVAREA VIII · 北印度洋", "maritime-indian"]],
  ["NAVAREA XI", ["NAVAREA XI · 西北太平洋 / 东南亚", "maritime-pacific"]],
  ["NAVAREA XII", ["NAVAREA XII · 东北及东南太平洋", "maritime-pacific"]],
  ["NAVAREA XIII", ["NAVAREA XIII · 日本海 / 鄂霍次克海", "maritime-pacific"]],
]);
const COUNTRY_FILTER_SECTION_BY_COUNTRY = new Map([
  ...["China", "Taiwan", "Hong Kong", "Macau", "Japan", "South Korea", "North Korea", "Mongolia"].map((country) => [country, "east-asia"]),
  ...["Malaysia", "Indonesia", "Singapore", "Philippines", "Thailand", "Vietnam", "Cambodia", "Laos"].map((country) => [country, "southeast-asia"]),
  ...["India", "Pakistan", "Bangladesh", "Sri Lanka", "Maldives", "Afghanistan"].map((country) => [country, "south-asia"]),
  ...["Middle East", "Iran", "Iraq", "Saudi Arabia", "United Arab Emirates", "Oman", "Qatar", "Bahrain", "Kuwait", "Yemen", "Türkiye", "Kazakhstan", "Turkmenistan", "Tajikistan"].map((country) => [country, "central-west-asia"]),
  ...["Europe", "Russia"].map((country) => [country, "europe-russia"]),
  ...["Africa", "South Africa", "Egypt", "Ethiopia", "Kenya", "Tanzania", "Somalia", "Mauritius"].map((country) => [country, "africa"]),
  ...["United States", "Canada"].map((country) => [country, "north-america"]),
  ...["Mexico", "Argentina", "Chile", "Colombia", "Ecuador", "Peru", "Panama", "South America", "Central America"].map((country) => [country, "latin-america"]),
  ...["Australia", "Papua New Guinea", "New Caledonia", "Fiji", "Vanuatu", "Tonga", "Marshall Islands", "Solomon Islands", "French Polynesia", "Samoa / American Samoa", "Cook Islands", "Niue", "Kiribati", "Guam", "Wake Island"].map((country) => [country, "oceania"]),
]);

let savedRegionsController = null;

function savedRegionProvenance(item) {
  const source = window.SavedRegions.sourceOf(item);
  const payload = source === "hydropac" ? state.hydropacPayload : source === "msa" ? state.msaPayload : source === "navarea" ? state.navareaPayload : state.payload;
  return window.SavedRegions.provenance(item, payload || {});
}

function initializeSavedRegions() {
  savedRegionsController = window.SavedRegions.createController({
    escapeHtml,
    enrich: enrichRestriction,
    getHighlighted: () => [...state.highlightedRestrictionIds].map((id) => state.restrictionById.get(id)).filter(Boolean),
    onRestore: (items, focus) => {
      const previousIds = new Set(state.savedRegionOverlays.map((item) => item.id));
      state.highlightedRestrictionIds = new Set([...state.highlightedRestrictionIds].filter((id) => !previousIds.has(id)));
      items.forEach((item) => state.highlightedRestrictionIds.add(item.id));
      state.savedRegionOverlays = items;
      syncCombinedRestrictions();
      syncHighlightedRestrictionSelection();
      if (previousIds.has(state.selectedId) && !state.restrictionById.has(state.selectedId)) state.selectedId = null;
      if (state.pinnedRestrictionIds.some((id) => !state.restrictionById.has(id))) clearPinnedRestrictionTooltip();
      applyFilters();
      const bounds = focus ? combinedBounds(items.map((item) => item.bounds).filter(Boolean)) : null;
      if (bounds) fitBounds(bounds);
    },
  });
  savedRegionsController.load();
}

init().catch((error) => {
  console.error("NOTAM MAP initialization failed", error);
  if (document.body) document.body.dataset.initError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
});

window.addEventListener("app-language-change", () => {
  placeLabelSpriteCache.clear();
  ballisticAnimationLabelCaches.clear();
  ballisticAnimationLabelLayoutCache = null;
  ballisticProfileSurfaceCache = null;
  tileCache.clear();
  flatSatelliteViewKey = "";
  flatBaseRenderSignature = "";
  if (globeRendererState) globeRendererState.lastRenderSignature = "";
  renderLandmarkFilters();
  renderCustomCoordinateControls();
  renderTrajectoryControls();
  renderDetailModeUi();
  syncLayerButtons();
  scheduleDraw();
});

async function init() {
  initializeAdaptivePerformanceProfile();
  loadLandmarkVisibilityFromStorage();
  loadCustomCoordinatesFromStorage();
  initializeCloudControls();
  initializeSatelliteControls();
  initializePanelNavigation();
  bindEvents();
  startSunlightClock();
  syncLayerButtons();
  syncPanelCollapse();
  renderTrajectoryControls();
  renderCustomCoordinateControls();
  renderDetailModeUi();
  renderLandmarkFilters();
  renderWatchFilters();
  draw();
  loadRefreshHistory();
  initializeSavedRegions();
  await loadRestrictions(false);
  loadHydropac(false);
  loadMsaWarnings(false);
  loadNavareaWarnings(false);
  loadLaunches(false);
}

function initializeAdaptivePerformanceProfile() {
  applyPerformanceProfile(activePerformanceProfile);
  renderPerformanceProfile();
  if (!PERFORMANCE_PROFILE_API) return;
  Promise.all([
    fetch("/api/system-profile", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).catch(() => null),
    PERFORMANCE_PROFILE_API.readWebGpuInfo().catch(() => null),
  ]).then(([systemProfile, webGpuInfo]) => {
    const enriched = PERFORMANCE_PROFILE_API.enrichProfile(activePerformanceProfile, systemProfile, webGpuInfo);
    applyPerformanceProfile(enriched);
    renderPerformanceProfile();
    scheduleDraw();
  }).catch(() => renderPerformanceProfile());
}

function applyPerformanceProfile(profile) {
  if (!profile?.budgets) return;
  activePerformanceProfile = profile;
  adaptivePerformanceState = PERFORMANCE_PROFILE_API?.createAdaptiveState(profile) || adaptivePerformanceState;
  const budgets = profile.budgets;
  HIGH_PERFORMANCE_MODE = profile.tierRank >= 2;
  SATELLITE_WORKER_COUNT = Math.max(1, Math.round(Number(budgets.satelliteWorkers) || SATELLITE_WORKER_COUNT));
  SATELLITE_GPU_HIT_LIMIT = Math.max(240, Math.round(Number(budgets.satelliteHitLimit) || SATELLITE_GPU_HIT_LIMIT));
  SATELLITE_COVERAGE_SEGMENTS = Math.max(12, Math.round(Number(budgets.coverageSegments) || SATELLITE_COVERAGE_SEGMENTS));
  TILE_CACHE_MAX_ITEMS = Math.max(256, Math.round(Number(budgets.tileCacheMax) || TILE_CACHE_MAX_ITEMS));
  CLOUD_TILE_CACHE_MAX_ITEMS = Math.max(128, Math.round(Number(budgets.cloudTileCacheMax) || CLOUD_TILE_CACHE_MAX_ITEMS));
  GLOBE_TEXTURE_CACHE_MAX_ITEMS = Math.max(256, Math.round(Number(budgets.globeTextureCacheMax) || GLOBE_TEXTURE_CACHE_MAX_ITEMS));
  GLOBE_TEXTURE_UPLOADS_PER_FRAME = Math.max(4, Math.round(Number(budgets.textureUploadsPerFrame) || GLOBE_TEXTURE_UPLOADS_PER_FRAME));
  GLOBE_VISIBLE_TILE_BUDGET = Math.max(240, Math.round(Number(budgets.visibleTileBudget) || GLOBE_VISIBLE_TILE_BUDGET));
  TILE_LOAD_CONCURRENCY = Math.max(4, Math.round(Number(budgets.tileLoadConcurrency) || TILE_LOAD_CONCURRENCY));
  TILE_LOAD_QUEUE_LIMIT = Math.max(320, Math.round(Number(budgets.tileLoadQueueLimit) || TILE_LOAD_QUEUE_LIMIT));
  RENDER_DPR_MAX = clamp(Number(budgets.dprMax) || RENDER_DPR_MAX, 0.75, 2);
  INTERACTION_DPR_MAX = clamp(Number(budgets.interactionDpr) || INTERACTION_DPR_MAX, 0.65, RENDER_DPR_MAX);
  INTERACTION_FRAME_INTERVAL_MS = clamp(Number(budgets.interactionFrameIntervalMs) || 0, 0, 24);
  trimImageCache(tileCache, TILE_CACHE_MAX_ITEMS);
  trimImageCache(cloudTileCache, CLOUD_TILE_CACHE_MAX_ITEMS);
  if (globeRendererState) globeRendererState.lastRenderSignature = "";
  document.body.dataset.performanceTier = profile.tier;
  document.body.dataset.gpuVendor = profile.gpu.vendor;
}

function renderPerformanceProfile() {
  if (!els.performanceProfile) return;
  const profile = activePerformanceProfile;
  const cpuName = profile.cpu.model || `${profile.cpu.threads} 线程 CPU`;
  const gpuName = profile.gpu.renderer || profile.gpu.systemAdapters?.[0]?.name || profile.gpu.vendorLabel;
  const qualityPercent = Math.round((adaptivePerformanceState.qualityScale || 1) * 100);
  const measured = adaptivePerformanceState.emaMs > 0 ? ` · ${adaptivePerformanceState.emaMs.toFixed(1)} ms` : "";
  els.performanceProfile.dataset.vendor = profile.gpu.vendor;
  els.performanceProfile.dataset.tier = profile.tier;
  els.performanceProfile.dataset.qualityScale = String(adaptivePerformanceState.qualityScale || 1);
  els.performanceProfile.dataset.workerCount = String(SATELLITE_WORKER_COUNT);
  els.performanceProfile.title = `${cpuName}\n${gpuName}\nWebGL2: ${profile.gpu.webgl2 ? "yes" : "no"}; max texture: ${profile.gpu.maxTextureSize || "unknown"}`;
  els.performanceProfile.innerHTML = `
    <div><strong>硬件自适应</strong><span>${escapeHtml(profile.gpu.vendorLabel)} · ${escapeHtml(profile.tierLabel)}</span></div>
    <p>${escapeHtml(cpuName)} · ${escapeHtml(gpuName)}</p>
    <small>${SATELLITE_WORKER_COUNT} 个卫星计算线程 · 动态画质 ${qualityPercent}%${escapeHtml(measured)}</small>
  `;
}

function recordAdaptivePerformanceSample(sampleMs, source) {
  if (!PERFORMANCE_PROFILE_API || document.hidden || !Number.isFinite(Number(sampleMs)) || Number(sampleMs) <= 0) return;
  const next = PERFORMANCE_PROFILE_API.adaptQuality(adaptivePerformanceState, sampleMs, performance.now(), source);
  adaptivePerformanceState = next;
  if (!next.changed) return;
  if (globeRendererState) globeRendererState.lastRenderSignature = "";
  flatBaseRenderSignature = "";
  renderPerformanceProfile();
  scheduleDraw();
}

function initializeCloudControls() {
  state.cloudOverlayEnabled = false;
  if (els.cloudOverlayToggle) els.cloudOverlayToggle.checked = false;
  if (els.cloudOpacityInput) els.cloudOpacityInput.value = String(Math.round(state.cloudOpacity * 100));
  if (els.cloudTimeSlider) {
    els.cloudTimeSlider.min = "0";
    els.cloudTimeSlider.max = String(NOAA_GMGSI_TIMELINE_FALLBACK_COUNT - 1);
    els.cloudTimeSlider.step = "1";
    els.cloudTimeSlider.value = "0";
  }
  syncCloudOpacityUi();
  renderCloudTimelineControls();
}

function cloudLocalDateTimeParts(value) {
  const date = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function syncCloudOpacityUi() {
  const label = `${Math.round(state.cloudOpacity * 100)}%`;
  if (els.cloudOpacityValue) els.cloudOpacityValue.textContent = label;
  if (els.cloudOverlayLabel) els.cloudOverlayLabel.textContent = `卫星云图 ${label}`;
}

function cloudRequestQuery(refresh = false) {
  const params = new URLSearchParams();
  if (refresh) params.set("refresh", "1");
  params.set("slot", String(state.cloudSelectedSlot || 0));
  if (state.cloudSelectedHour) params.set("hour", state.cloudSelectedHour);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function applyCloudSlotSelection() {
  const maxSlot = Math.max(0, (state.cloudTimeline.length || NOAA_GMGSI_TIMELINE_FALLBACK_COUNT) - 1);
  const slot = clamp(Math.round(Number(els.cloudTimeSlider?.value || 0)), 0, maxSlot);
  applyCloudTimelineSelection(slot);
}

function applyCloudTimelineSelection(slot) {
  state.cloudSelectedSlot = slot;
  const selected = state.cloudTimeline[slot] || null;
  state.cloudSelectedHour = selected?.hourId || "";
  cloudTileCache.clear();
  clearCloudGlobeCaches();
  renderCloudTimelineControls();
  updateCloudProgress("loading", "正在切换卫星云图小时", selected?.label || `${slot} 小时前`);
  loadCloudSatellite(false);
  scheduleDraw();
}

function cloudTimelineBeijingParts(item) {
  const timestamp = Date.parse(item?.timeUtc || "");
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp + 8 * 60 * 60 * 1000);
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
    day: String(date.getUTCDate()).padStart(2, "0"),
    hour: String(date.getUTCHours()).padStart(2, "0"),
  };
}

function renderCloudDateTimeSelectors(preferCurrentTimeline = true) {
  const selects = [els.cloudYearSelect, els.cloudMonthSelect, els.cloudDaySelect, els.cloudHourSelect];
  if (selects.some((select) => !select)) return;
  const entries = state.cloudTimeline
    .map((item, index) => ({ item, index, parts: cloudTimelineBeijingParts(item) }))
    .filter((entry) => entry.parts);
  if (!entries.length) {
    for (const select of selects) select.innerHTML = `<option value="">--</option>`;
    if (els.cloudTimeApplyButton) els.cloudTimeApplyButton.disabled = true;
    return;
  }
  const selectedEntry = entries.find((entry) => entry.index === state.cloudSelectedSlot) || entries[0];
  const requested = preferCurrentTimeline
    ? { ...selectedEntry.parts }
    : {
        year: els.cloudYearSelect.value,
        month: els.cloudMonthSelect.value,
        day: els.cloudDaySelect.value,
        hour: els.cloudHourSelect.value,
      };
  const unique = (values) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  const setOptions = (select, values, preferred, suffix) => {
    const normalized = values.includes(preferred) ? preferred : values[0];
    select.innerHTML = values.map((value) => `<option value="${value}" ${value === normalized ? "selected" : ""}>${value}${suffix}</option>`).join("");
    return normalized;
  };
  const year = setOptions(els.cloudYearSelect, unique(entries.map((entry) => entry.parts.year)), requested.year, "年");
  const inYear = entries.filter((entry) => entry.parts.year === year);
  const month = setOptions(els.cloudMonthSelect, unique(inYear.map((entry) => entry.parts.month)), requested.month, "月");
  const inMonth = inYear.filter((entry) => entry.parts.month === month);
  const day = setOptions(els.cloudDaySelect, unique(inMonth.map((entry) => entry.parts.day)), requested.day, "日");
  const inDay = inMonth.filter((entry) => entry.parts.day === day);
  setOptions(els.cloudHourSelect, unique(inDay.map((entry) => entry.parts.hour)), requested.hour, "时");
  if (els.cloudTimeApplyButton) els.cloudTimeApplyButton.disabled = false;
}

function applyCloudDateTimeSelection() {
  const requested = {
    year: els.cloudYearSelect?.value,
    month: els.cloudMonthSelect?.value,
    day: els.cloudDaySelect?.value,
    hour: els.cloudHourSelect?.value,
  };
  const index = state.cloudTimeline.findIndex((item) => {
    const parts = cloudTimelineBeijingParts(item);
    return parts && Object.keys(requested).every((key) => parts[key] === requested[key]);
  });
  if (index < 0) {
    updateCloudProgress("error", "所选云图小时不可用", "请重新选择下拉菜单中的可用北京时间");
    return;
  }
  applyCloudTimelineSelection(index);
}

function refreshLatestCloudSatellite() {
  if (state.cloudLoading) return;
  state.cloudSelectedSlot = 0;
  state.cloudSelectedHour = "";
  cloudTileCache.clear();
  clearCloudGlobeCaches();
  loadCloudSatellite(true);
}

function startCloudAutoRefresh() {
  if (cloudAutoRefreshTimer) window.clearInterval(cloudAutoRefreshTimer);
  cloudAutoRefreshTimer = window.setInterval(() => {
    if (!state.cloudOverlayEnabled || state.cloudLoading || state.cloudSelectedSlot !== 0) return;
    refreshLatestCloudSatellite();
  }, CLOUD_TIMELINE_REFRESH_INTERVAL_MS);
}

function startSunlightClock() {
  if (sunlightClockTimer) window.clearInterval(sunlightClockTimer);
  sunlightClockTimer = window.setInterval(() => {
    if (!state.sunlightEnabled || !isGlobeLayer()) return;
    if (state.satellitePlaybackRate || ensureBallisticAnimationConfig().playing) return;
    scheduleDraw();
  }, SUNLIGHT_CLOCK_INTERVAL_MS);
}

function earthSunlightTimeMs() {
  const now = Date.now();
  if (state.satellitePlaybackRate || state.satelliteTimeExplicit) {
    return Number(state.satelliteTimeMs) || now;
  }
  const animation = ensureBallisticAnimationConfig();
  const entries = ballisticAnimationSession?.entries || [];
  const focus = entries.find((entry) => entry.key === animation.focusKey) || entries[0];
  const epochMs = Date.parse(focus?.stage?.atmosphereEpochUtc || "");
  if (focus && Number.isFinite(epochMs) && (animation.playing || animation.elapsedSec > 0)) {
    const localElapsedSec = Math.max(0, Number(animation.elapsedSec) - Math.max(0, Number(focus.offsetSec) || 0));
    return epochMs + localElapsedSec * 1000;
  }
  return now;
}

function renderCloudTimelineControls() {
  const count = Math.max(1, state.cloudTimeline.length || NOAA_GMGSI_TIMELINE_FALLBACK_COUNT);
  const slot = clamp(state.cloudSelectedSlot || 0, 0, count - 1);
  const selected = state.cloudTimeline[slot] || null;
  if (els.cloudTimeSlider) {
    els.cloudTimeSlider.max = String(count - 1);
    els.cloudTimeSlider.value = String(slot);
  }
  if (els.cloudTimeTicks) {
    els.cloudTimeTicks.innerHTML = Array.from({ length: count }, (_, index) => `<option value="${index}"></option>`).join("");
  }
  if (els.cloudTimeValue) {
    els.cloudTimeValue.textContent = selected ? selected.timeBeijing : `${slot} 小时前`;
  }
  if (els.cloudTimelineLabels) {
    const latest = state.cloudTimeline[0]?.timeBeijing || "等待时间线";
    const oldest = state.cloudTimeline[count - 1]?.timeBeijing || `${NOAA_GMGSI_TIMELINE_FALLBACK_COUNT} 小时前`;
    els.cloudTimelineLabels.innerHTML = `
      <span>最新：${escapeHtml(latest)}</span>
      <span>当前：${escapeHtml(selected?.timeBeijing || "--")}</span>
      <span>最早：${escapeHtml(oldest)}</span>
    `;
  }
  renderCloudDateTimeSelectors(true);
}

function cloudMaxZoom() {
  const maxZoom = Number(state.cloudPayload?.maxZoom || state.cloudPayload?.source?.maxZoom || CLOUD_TILE_MAX_ZOOM);
  return clamp(Number.isFinite(maxZoom) ? maxZoom : CLOUD_TILE_MAX_ZOOM, MIN_ZOOM, CLOUD_TILE_MAX_ZOOM);
}

function currentCloudHour() {
  return state.cloudPayload?.selectedHour || state.cloudPayload?.source?.selectedHour || state.cloudSelectedHour || state.cloudTimeline[state.cloudSelectedSlot]?.hourId || "latest";
}

function bindEvents() {
  els.refreshButton?.addEventListener("click", () => loadRestrictions(true));
  els.notamSourceRefreshButton?.addEventListener("click", () => loadRestrictions(true));
  els.hydropacFetchButton?.addEventListener("click", () => loadHydropac(true));
  els.msaFetchButton?.addEventListener("click", () => loadMsaWarnings(true));
  els.navareaFetchButton?.addEventListener("click", () => loadNavareaWarnings(true));
  els.launchFetchButton?.addEventListener("click", () => loadLaunches(true));
  els.satelliteFetchButton?.addEventListener("click", () => loadSatellites(true));
  document.querySelectorAll("[data-history-source]").forEach((button) => {
    button.addEventListener("click", () => {
      state.refreshHistorySource = button.dataset.historySource || "notam";
      renderRefreshHistory();
    });
  });
  els.resetNorthButton?.addEventListener("click", resetGlobeNorth);
  els.earthResetTiltButton?.addEventListener("click", resetGlobeTilt);
  els.earthZoomInButton?.addEventListener("click", () => zoomGlobeByButton(1));
  els.earthZoomOutButton?.addEventListener("click", () => zoomGlobeByButton(-1));
  els.fitWorldButton?.addEventListener("click", () => {
    state.view = { ...state.view, lon: 20, lat: 12, zoom: 2, drag: null };
    draw();
  });
  els.fitSelectionButton?.addEventListener("click", fitFilteredBounds);
  els.leftPanelToggle?.addEventListener("click", () => {
    state.leftPanelCollapsed = !state.leftPanelCollapsed;
    syncPanelCollapse();
    draw();
    window.setTimeout(() => {
      draw();
      if (!els.tooltip.hidden && els.tooltip.classList.contains("restriction-tooltip")) {
        state.restrictionTooltipLeft = null;
        positionRestrictionTooltip();
      }
    }, 210);
  });
  els.rightPanelToggle?.addEventListener("click", () => {
    state.rightPanelCollapsed = !state.rightPanelCollapsed;
    syncPanelCollapse();
    draw();
    window.setTimeout(() => {
      draw();
      if (!els.tooltip.hidden && els.tooltip.classList.contains("restriction-tooltip")) {
        state.restrictionTooltipLeft = null;
        positionRestrictionTooltip();
      }
    }, 210);
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-mode]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.displayMode = button.dataset.mode;
      applyFilters();
    });
  });
  document.querySelectorAll("[data-detail-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.detailMode = ["hydropac", "msa", "navarea", "launch", "satellite"].includes(button.dataset.detailMode) ? button.dataset.detailMode : "notam";
      state.notamIdSearch = "";
      if (els.notamIdSearchInput) els.notamIdSearchInput.value = "";
      if (isSatelliteMode()) {
        activateSatelliteGlobeMode();
        if (!state.satellitePayload && !state.satelliteLoading) loadSatellites(false);
      }
      renderDetailModeUi();
      renderList();
      renderNotamIdSearchResults();
    });
  });
  document.querySelectorAll("[data-layer]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextLayer = button.dataset.layer;
      if (!TILE_SOURCES[nextLayer] || state.baseLayer === nextLayer) return;
      state.baseLayer = nextLayer;
      if (nextLayer !== GLOBE_LAYER && state.view.zoom < MIN_ZOOM) state.view.zoom = MIN_ZOOM;
      syncLayerButtons();
      flatSatelliteViewKey = "";
      draw();
    });
  });
  els.cloudOverlayToggle?.addEventListener("change", () => {
    state.cloudOverlayEnabled = Boolean(els.cloudOverlayToggle.checked);
    if (state.cloudOverlayEnabled && !state.cloudLoading) loadCloudSatellite(true);
    renderSourceStatus();
    draw();
  });
  els.sunlightToggle?.addEventListener("change", () => {
    state.sunlightEnabled = Boolean(els.sunlightToggle.checked);
    if (globeRendererState) globeRendererState.lastRenderSignature = "";
    scheduleDraw();
  });
  els.placeLabelsToggle?.addEventListener("change", () => {
    state.placeLabelsEnabled = Boolean(els.placeLabelsToggle.checked);
    draw();
  });
  els.cloudOpacityInput?.addEventListener("input", () => {
    const value = Number(els.cloudOpacityInput.value);
    state.cloudOpacity = clamp(Number.isFinite(value) ? value / 100 : DEFAULT_CLOUD_OVERLAY_OPACITY, 0, 1);
    syncCloudOpacityUi();
    renderSourceStatus();
    scheduleDraw();
  });
  els.cloudTimeSlider?.addEventListener("input", () => {
    state.cloudSelectedSlot = clamp(Math.round(Number(els.cloudTimeSlider.value || 0)), 0, Math.max(0, (state.cloudTimeline.length || NOAA_GMGSI_TIMELINE_FALLBACK_COUNT) - 1));
    renderCloudTimelineControls();
  });
  els.cloudTimeSlider?.addEventListener("change", applyCloudSlotSelection);
  [els.cloudYearSelect, els.cloudMonthSelect, els.cloudDaySelect, els.cloudHourSelect].forEach((select) => {
    select?.addEventListener("change", () => renderCloudDateTimeSelectors(false));
  });
  els.cloudTimeApplyButton?.addEventListener("click", applyCloudDateTimeSelection);
  els.cloudLatestRefreshButton?.addEventListener("click", refreshLatestCloudSatellite);

  els.searchInput.addEventListener("input", () => {
    state.search = els.searchInput.value.trim().toLowerCase();
    applyFilters();
  });
  els.notamIdSearchInput.addEventListener("input", () => {
    state.notamIdSearch = els.notamIdSearchInput.value.trim().toUpperCase();
    if (!state.notamIdSearch) state.searchRevealRestrictionId = "";
    if (state.detailMode === "satellite") {
      scheduleSatelliteSearchRender();
      return;
    }
    if (state.detailMode === "launch") renderList();
    renderNotamIdSearchResults();
    draw();
  });
  els.satelliteLayerToggle?.addEventListener("click", () => {
    state.satelliteLayerEnabled = !state.satelliteLayerEnabled;
    if (state.satelliteLayerEnabled) activateSatelliteGlobeMode();
    syncSatelliteControls();
    requestSatellitePropagation(true);
    drawSatelliteOverlay();
  });
  els.satelliteOrbitLinesToggle?.addEventListener("click", () => {
    state.satelliteOrbitLinesEnabled = !state.satelliteOrbitLinesEnabled;
    invalidateSatelliteStaticLayers({ orbit: true });
    syncSatelliteControls();
    requestSatellitePropagation(true);
    drawSatelliteOverlay();
  });
  els.satelliteLabelsToggle?.addEventListener("click", () => {
    state.satelliteLabelsEnabled = !state.satelliteLabelsEnabled;
    if (!state.satelliteLabelsEnabled) state.satelliteAllLabelsEnabled = false;
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteAllLabelsToggle?.addEventListener("click", () => {
    state.satelliteAllLabelsEnabled = !state.satelliteAllLabelsEnabled;
    if (state.satelliteAllLabelsEnabled) state.satelliteLabelsEnabled = true;
    satelliteCanvasCandidateCache = { key: "", ids: [] };
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteDualClockToggle?.addEventListener("click", () => {
    state.satelliteDualClockEnabled = !state.satelliteDualClockEnabled;
    satelliteClockLastSecond = NaN;
    syncSatelliteControls();
    updateSatelliteDualClock(true);
  });
  els.satelliteCoverageToggle?.addEventListener("click", () => {
    state.satelliteCoverageEnabled = !state.satelliteCoverageEnabled;
    invalidateSatelliteStaticLayers({ coverage: true });
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteImagingToggle?.addEventListener("click", () => {
    state.satelliteImagingEnabled = !state.satelliteImagingEnabled;
    invalidateSatelliteStaticLayers({ coverage: true });
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteCommunicationToggle?.addEventListener("click", () => {
    state.satelliteCommunicationEnabled = !state.satelliteCommunicationEnabled;
    invalidateSatelliteStaticLayers({ coverage: true });
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteSwathEditToggle?.addEventListener("click", () => {
    state.satelliteSwathEditEnabled = !state.satelliteSwathEditEnabled;
    if (state.satelliteSwathEditEnabled) {
      state.satelliteCoverageEnabled = true;
      state.satelliteImagingEnabled = true;
      activateSatelliteGlobeMode();
    }
    syncSatelliteControls();
    invalidateSatelliteStaticLayers({ coverage: true });
    drawSatelliteOverlay();
  });
  document.querySelectorAll("[data-satellite-swath-mode]").forEach((button) => {
    button.addEventListener("click", () => setSatelliteSwathMode(button.dataset.satelliteSwathMode));
  });
  els.satelliteSwathRollInput?.addEventListener("input", () => {
    setSatelliteSwathRollAngle(els.satelliteSwathRollInput.value);
  });
  els.satelliteSwathRollNumber?.addEventListener("input", () => {
    if (els.satelliteSwathRollNumber.value === "" || !Number.isFinite(Number(els.satelliteSwathRollNumber.value))) return;
    setSatelliteSwathRollAngle(els.satelliteSwathRollNumber.value);
  });
  els.satelliteSwathRollNumber?.addEventListener("change", () => {
    setSatelliteSwathRollAngle(els.satelliteSwathRollNumber.value);
    els.satelliteSwathRollNumber.value = normalizeSatelliteSwathAngle(els.satelliteSwathRollNumber.value).toFixed(1);
  });
  els.satelliteSwathResetButton?.addEventListener("click", () => {
    const id = String(state.satelliteFocusedId || "");
    if (!id) return;
    state.satelliteSwathTargets.delete(id);
    state.satelliteCoverageGeometryById.delete(id);
    invalidateSatelliteStaticLayers({ coverage: true });
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteImagingOpacityInput?.addEventListener("input", () => {
    state.satelliteImagingOpacity = clamp((Number(els.satelliteImagingOpacityInput.value) || 45) / 100, 0.05, 1);
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteCommunicationOpacityInput?.addEventListener("input", () => {
    state.satelliteCommunicationOpacity = clamp((Number(els.satelliteCommunicationOpacityInput.value) || 45) / 100, 0.05, 1);
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteOrbitWidthInput?.addEventListener("input", () => {
    state.satelliteOrbitLineWidth = clamp(Number(els.satelliteOrbitWidthInput.value) || 1.5, 0.5, 5);
    saveSatelliteStyleSettings();
    invalidateSatelliteStaticLayers({ orbit: true });
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satellitePointSizeInput?.addEventListener("input", () => {
    state.satellitePointSize = clamp(
      Number(els.satellitePointSizeInput.value) || 7,
      SATELLITE_POINT_SIZE_MIN,
      SATELLITE_POINT_SIZE_MAX,
    );
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  els.satelliteLabelSizeInput?.addEventListener("input", () => {
    state.satelliteLabelSize = clamp(
      Number(els.satelliteLabelSizeInput.value) || 12,
      SATELLITE_LABEL_SIZE_MIN,
      SATELLITE_LABEL_SIZE_MAX,
    );
    saveSatelliteStyleSettings();
    syncSatelliteControls();
    drawSatelliteOverlay();
  });
  document.querySelectorAll("[data-satellite-constellation]").forEach((button) => {
    button.addEventListener("click", (event) => {
      toggleSatelliteConstellation(button.dataset.satelliteConstellation, {
        append: Boolean(event.ctrlKey || event.shiftKey || event.metaKey),
        label: button.querySelector("strong")?.textContent || button.dataset.satelliteConstellation,
      });
    });
  });
  document.querySelectorAll("[data-satellite-reference]").forEach((button) => {
    button.addEventListener("click", () => setSatelliteReferenceFrame(button.dataset.satelliteReference));
  });
  document.querySelectorAll("[data-satellite-orbit]").forEach((button) => {
    button.addEventListener("click", () => {
      const orbitClass = button.dataset.satelliteOrbit;
      if (state.satelliteOrbitClasses.has(orbitClass)) state.satelliteOrbitClasses.delete(orbitClass);
      else state.satelliteOrbitClasses.add(orbitClass);
      rebuildSatelliteSelectionCaches();
      syncSatelliteControls();
      renderList();
      renderNotamIdSearchResults();
      invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
      if (satelliteWorkers.length) syncSatelliteWorkerCatalogs();
      else requestSatellitePropagation(true);
      drawSatelliteOverlay();
    });
  });
  document.querySelectorAll("[data-satellite-object]").forEach((button) => {
    button.addEventListener("click", () => {
      const objectClass = button.dataset.satelliteObject;
      if (state.satelliteObjectClasses.has(objectClass)) state.satelliteObjectClasses.delete(objectClass);
      else state.satelliteObjectClasses.add(objectClass);
      rebuildSatelliteSelectionCaches();
      invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
      syncSatelliteControls();
      renderList();
      renderNotamIdSearchResults();
      if (satelliteWorkers.length) syncSatelliteWorkerCatalogs();
      drawSatelliteOverlay();
    });
  });
  els.satelliteSelectFilteredButton?.addEventListener("click", selectFilteredSatellites);
  els.satelliteBulkSelectionApplyButton?.addEventListener("click", applySatelliteBulkSelection);
  els.satelliteFitSelectedButton?.addEventListener("click", fitSelectedSatelliteOrbits);
  els.satelliteClearSelectionButton?.addEventListener("click", () => {
    state.selectedSatelliteIds.clear();
    state.satelliteFocusedId = "";
    satelliteSelectionChanged();
  });
  els.satelliteElementApplyButton?.addEventListener("click", importSatelliteElementText);
  els.satelliteElementFileButton?.addEventListener("click", () => els.satelliteElementFileInput?.click());
  els.satelliteElementFileInput?.addEventListener("change", importSatelliteElementFile);
  els.satelliteElementClearButton?.addEventListener("click", clearCustomSatelliteElements);
  els.satelliteTimeInput?.addEventListener("change", applySatelliteTimeInput);
  els.satelliteDateApplyButton?.addEventListener("click", applySatelliteTimeInput);
  els.satelliteNowButton?.addEventListener("click", restoreCurrentSatelliteElements);
  document.querySelectorAll("[data-satellite-step]").forEach((button) => {
    button.addEventListener("click", () => stepSatelliteSimulation(Number(button.dataset.satelliteStep) || 0));
  });
  els.satelliteReverseButton?.addEventListener("click", () => setSatellitePlayback(-Math.abs(state.satellitePlaybackMagnitude || 60)));
  els.satellitePauseButton?.addEventListener("click", () => setSatellitePlayback(0));
  els.satelliteForwardButton?.addEventListener("click", () => setSatellitePlayback(Math.abs(state.satellitePlaybackMagnitude || 60)));
  els.satelliteSpeedSelect?.addEventListener("change", () => {
    const magnitude = Math.max(1, Number(els.satelliteSpeedSelect.value) || 60);
    state.satellitePlaybackMagnitude = magnitude;
    if (state.satellitePlaybackRate) setSatellitePlayback(Math.sign(state.satellitePlaybackRate) * magnitude);
    syncSatelliteControls();
  });
  els.launchSiteFilterSelect?.addEventListener("change", () => {
    state.selectedLaunchSiteId = els.launchSiteFilterSelect.value;
    state.detailMode = "launch";
    renderDetailModeUi();
    renderList();
    renderNotamIdSearchResults();
    draw();
  });
  els.launchNext7Button?.addEventListener("click", () => {
    state.launchNext7Only = !state.launchNext7Only;
    state.detailMode = "launch";
    syncLaunchNext7Button();
    renderLaunchSiteFilter();
    renderList();
    renderNotamIdSearchResults();
    renderLegend();
    updateCounts();
    draw();
  });
  els.newOnlyToggle.addEventListener("change", () => {
    state.newOnly = els.newOnlyToggle.checked;
    applyFilters();
  });
  els.withGeometryToggle.addEventListener("change", () => {
    state.withGeometryOnly = els.withGeometryToggle.checked;
    applyFilters();
  });
  els.highlightOnlyToggle?.addEventListener("change", () => {
    state.highlightOnly = Boolean(els.highlightOnlyToggle.checked);
    renderList();
    updateCounts();
    draw();
  });
  els.notamToggle?.addEventListener("click", () => {
    state.notamEnabled = !state.notamEnabled;
    syncSourceToggleButton(els.notamToggle, state.notamEnabled);
    renderLegend();
    updateCounts();
    renderList();
    draw();
  });
  els.hydropacToggle?.addEventListener("click", () => {
    state.hydropacEnabled = !state.hydropacEnabled;
    syncSourceToggleButton(els.hydropacToggle, state.hydropacEnabled);
    renderLegend();
    updateCounts();
    renderList();
    draw();
  });
  els.msaToggle?.addEventListener("click", () => {
    state.msaEnabled = !state.msaEnabled;
    syncSourceToggleButton(els.msaToggle, state.msaEnabled);
    renderLegend();
    updateCounts();
    renderList();
    draw();
  });
  els.navareaToggle?.addEventListener("click", () => {
    state.navareaEnabled = !state.navareaEnabled;
    syncSourceToggleButton(els.navareaToggle, state.navareaEnabled);
    renderLegend();
    updateCounts();
    renderList();
    draw();
  });
  els.trajectoryToggle.addEventListener("change", () => {
    state.trajectoryEnabled = els.trajectoryToggle.checked;
    updateTrajectoryCount();
    renderLegend();
    draw();
  });
  els.trajectoryGroundTrackToggle?.addEventListener("change", () => {
    const track = activeTrajectory();
    ensureTrajectoryPoints(track);
    track.showGroundTrack = Boolean(els.trajectoryGroundTrackToggle.checked);
    trajectoryRenderRevision += 1;
    renderTrajectoryControls();
    renderLegend();
    draw();
  });
  els.trajectoryLockButton?.addEventListener("click", toggleTrajectoryLock);
  els.trajectoryAreaPickToggle?.addEventListener("change", () => {
    state.trajectoryAreaPickEnabled = Boolean(els.trajectoryAreaPickToggle.checked);
    draw();
  });
  els.trajectoryAreaHighlightToggle?.addEventListener("change", () => {
    state.trajectoryAreaHighlightEnabled = Boolean(els.trajectoryAreaHighlightToggle.checked);
    renderList();
    draw();
  });
  els.trajectoryTrackSelect.addEventListener("change", () => {
    state.activeTrajectoryId = els.trajectoryTrackSelect.value;
    syncActiveTrajectoryState();
    renderTrajectoryControls();
    renderList();
    draw();
  });
  els.trajectoryColorInput.addEventListener("input", () => {
    activeTrajectory().color = els.trajectoryColorInput.value;
    trajectoryRenderRevision += 1;
    renderTrajectoryControls();
    renderLegend();
    draw();
  });
  els.trajectoryWidthInput?.addEventListener("input", () => {
    activeTrajectory().lineWidth = clamp(Number(els.trajectoryWidthInput.value) || DEFAULT_TRAJECTORY_LINE_WIDTH, 2, 12);
    trajectoryRenderRevision += 1;
    renderTrajectoryControls();
    draw();
  });
  els.trajectoryGlowInput?.addEventListener("input", () => {
    activeTrajectory().groundTrackGlow = clamp(Number(els.trajectoryGlowInput.value) || 0, 0, 30);
    trajectoryRenderRevision += 1;
    renderTrajectoryControls();
    draw();
  });
  els.trajectoryDashInput?.addEventListener("input", () => {
    activeTrajectory().dashDensity = clamp(Number(els.trajectoryDashInput.value), 0, 100);
    trajectoryRenderRevision += 1;
    renderTrajectoryControls();
    renderLegend();
    draw();
  });
  els.trajectoryLengthToggle?.addEventListener("change", () => {
    state.trajectoryLengthLabels = els.trajectoryLengthToggle.checked;
    updateTrajectoryCount();
    draw();
  });
  els.trajectoryInclinationToggle?.addEventListener("change", () => {
    state.trajectoryInclinationLabels = els.trajectoryInclinationToggle.checked;
    updateTrajectoryCount();
    draw();
  });
  els.trajectoryGeodesicToggle?.addEventListener("change", () => {
    const track = activeTrajectory();
    ensureTrajectoryPoints(track);
    track.geodesic = Boolean(els.trajectoryGeodesicToggle.checked);
    if (track.geodesic) track.curveControls = {};
    pruneTrajectoryCurveControls(track);
    invalidateTrajectoryDerivedState(track);
    renderTrajectoryControls();
    renderLegend();
    updateTrajectoryCount();
    draw();
  });
  els.newTrajectoryButton.addEventListener("click", createTrajectoryTrack);
  els.deleteTrajectoryButton.addEventListener("click", deleteActiveTrajectoryTrack);
  els.undoTrajectoryPointButton.addEventListener("click", undoTrajectoryPoint);
  els.redoTrajectoryPointButton?.addEventListener("click", redoTrajectoryPoint);
  els.clearTrajectoryButton.addEventListener("click", clearTrajectoryPoints);
  els.customCoordinateToggle?.addEventListener("change", () => {
    state.customCoordinatesEnabled = Boolean(els.customCoordinateToggle.checked);
    renderCustomCoordinateControls();
    renderLegend();
    draw();
  });
  els.customMapAddToggle?.addEventListener("change", () => {
    state.customMapAddMode = Boolean(els.customMapAddToggle.checked);
    if (state.customMapAddMode) state.customCoordinatesEnabled = true;
    renderCustomCoordinateControls();
    renderLegend();
    draw();
  });
  els.addCustomCoordinateButton?.addEventListener("click", addCustomCoordinateFromInputs);
  els.customCoordinateList?.addEventListener("click", handleCustomCoordinateListClick);
  els.updateCustomCoordinateButton?.addEventListener("click", updateSelectedCustomCoordinate);
  els.deleteCustomCoordinateButton?.addEventListener("click", deleteSelectedCustomCoordinate);
  els.importBatchCoordinatesButton?.addEventListener("click", importBatchCustomCoordinates);
  els.clearCustomCoordinatesButton?.addEventListener("click", clearCustomCoordinates);
  els.fitCustomCoordinatesButton?.addEventListener("click", fitCustomCoordinates);
  els.customKmlFileInput?.addEventListener("change", importCustomKmlFile);
  els.exportCustomKmlButton?.addEventListener("click", () => exportCustomCoordinates("kml"));
  els.exportCustomKmzButton?.addEventListener("click", () => exportCustomCoordinates("kmz"));
  els.clearCountriesButton.addEventListener("click", () => {
    state.selectedCountries.clear();
    renderFilters();
    applyFilters();
  });
  els.clearRegionsButton.addEventListener("click", () => {
    state.selectedRegions.clear();
    renderFilters();
    applyFilters();
  });
  els.clearWatchButton?.addEventListener("click", () => {
    state.selectedWatchRegions.clear();
    renderWatchFilters();
    applyFilters();
  });
  els.showAllLandmarksButton?.addEventListener("click", () => {
    state.hiddenLandmarkIds.clear();
    saveLandmarkVisibilityToStorage();
    renderLandmarkFilters();
    draw();
  });
  els.hideAllLandmarksButton?.addEventListener("click", () => {
    state.hiddenLandmarkIds = new Set(LANDMARKS.map((landmark) => landmark.id));
    saveLandmarkVisibilityToStorage();
    renderLandmarkFilters();
    draw();
  });
  els.landmarkLabelsToggle?.addEventListener("change", () => {
    state.landmarkLabelsEnabled = Boolean(els.landmarkLabelsToggle.checked);
    draw();
  });
  els.launchRingsToggle?.addEventListener("change", () => {
    state.launchRingsEnabled = Boolean(els.launchRingsToggle.checked);
    draw();
    renderLegend();
  });

  els.canvas.addEventListener("pointerdown", startDrag);
  els.canvas.addEventListener("pointermove", movePointer);
  els.canvas.addEventListener("pointerup", endDrag);
  els.canvas.addEventListener("pointercancel", endDrag);
  els.canvas.addEventListener("mouseleave", () => {
    state.hoverId = null;
    state.hoverRestrictionIds = new Set();
    state.hoverLaunchSiteId = "";
    scheduleTooltipHide();
    scheduleDraw();
  });
  els.tooltip?.addEventListener("mouseenter", () => {
    state.tooltipHovering = true;
    clearTooltipHideTimer();
  });
  els.tooltip?.addEventListener("mouseleave", () => {
    state.tooltipHovering = false;
    if (!state.tooltipPinned) hideTooltip();
  });
  els.canvas.addEventListener("click", handleCanvasClick);
  els.canvas.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  els.canvas.addEventListener("contextmenu", (event) => {
    if (isGlobeLayer()) event.preventDefault();
  });
  els.canvas.addEventListener("wheel", zoomMap, { passive: false });
  window.addEventListener("resize", () => {
    draw();
    if (!els.tooltip.hidden && els.tooltip.classList.contains("restriction-tooltip")) {
      state.restrictionTooltipLeft = null;
      positionRestrictionTooltip();
    }
  });
  if (!globeKeyboardBound) {
    globeKeyboardBound = true;
    window.addEventListener("keydown", handleGlobeKeyboard);
  }
}

function initializePanelNavigation() {
  const defaults = { left: "layers", right: "browse" };
  document.querySelectorAll("[data-panel-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      activatePanelView(button.dataset.panelNav, button.dataset.panelViewTarget);
    });
  });
  Object.entries(defaults).forEach(([panelName, target]) => activatePanelView(panelName, target, false));
}

function activatePanelView(panelName, target, resetScroll = true) {
  const panel = panelName === "left"
    ? document.querySelector(".filters-panel")
    : panelName === "right"
      ? document.querySelector(".details-panel")
      : null;
  if (!panel || !target) return;
  panel.querySelectorAll("[data-panel-view]").forEach((section) => {
    const active = section.dataset.panelView === target;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  panel.querySelectorAll(`[data-panel-nav="${panelName}"]`).forEach((button) => {
    const active = button.dataset.panelViewTarget === target;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (resetScroll) panel.scrollTop = 0;
}

function syncPanelCollapse() {
  if (!els.workspace) return;
  els.workspace.classList.toggle("left-collapsed", state.leftPanelCollapsed);
  els.workspace.classList.toggle("right-collapsed", state.rightPanelCollapsed);
  if (els.leftPanelToggle) {
    els.leftPanelToggle.textContent = state.leftPanelCollapsed ? "›" : "‹";
    els.leftPanelToggle.setAttribute("aria-expanded", String(!state.leftPanelCollapsed));
    els.leftPanelToggle.setAttribute("aria-label", state.leftPanelCollapsed ? "展开左侧菜单" : "收起左侧菜单");
  }
  if (els.rightPanelToggle) {
    els.rightPanelToggle.textContent = state.rightPanelCollapsed ? "‹" : "›";
    els.rightPanelToggle.setAttribute("aria-expanded", String(!state.rightPanelCollapsed));
    els.rightPanelToggle.setAttribute("aria-label", state.rightPanelCollapsed ? "展开右侧菜单" : "收起右侧菜单");
  }
}

async function loadRestrictions(refresh, options = {}) {
  const silent = Boolean(options.silent);
  const refreshResult = options.refreshResult || null;
  if (refresh) {
    clearFaaRefreshPoll();
    faaRefreshPollFailureCount = 0;
    faaRefreshRequestedAt = Date.now();
  }
  if (activeLoadController) {
    if (refresh) {
      pendingFaaRefresh = true;
      if (!silent) setLoading(true, "FAA NOTAM 刷新已排队，将在当前载入完成后自动开始", "busy");
    } else if (!silent) {
      setLoading(true, "已有加载任务正在进行", "busy");
    }
    return;
  }
  const controller = new AbortController();
  activeLoadController = controller;
  if (!silent) setLoading(true, refresh ? "正在刷新 FAA NOTAM 数据" : "正在载入 FAA NOTAM 数据", refresh ? "refreshing" : "loading");
  try {
    const response = await fetch(`/api/restrictions?details=0&tfr=0${refresh ? "&refresh=1" : ""}`, {
      cache: "no-cache",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.payload = await response.json();
    state.faaRestrictions = (state.payload.restrictions || []).map(enrichRestriction);
    syncCombinedRestrictions();
    renderSourceStatus();
    renderFilters();
    renderWatchFilters();
    renderLegend();
    renderNotamIdSearchResults();
    applyFilters();
    const notamSource = state.payload?.sources?.faaNotamSearch || {};
    const backgroundRefresh = notamSource.backgroundRefresh?.active;
    const cacheFallback = Boolean(notamSource.cacheFallback);
    if (backgroundRefresh) {
      const message = faaRefreshProgressMessage(notamSource.backgroundRefresh);
      if (!silent) setLoading(false, message, "busy");
      else updateRefreshProgress("busy", message);
      scheduleFaaRefreshPoll();
    } else if (refreshResult?.status === "error") {
      const detail = refreshResult.message ? `：${refreshResult.message}` : "";
      setLoading(false, `FAA NOTAM 后台刷新失败，当前显示最近一次完整缓存${detail}`, "error");
    } else if (cacheFallback) {
      const message = "FAA NOTAM 实时刷新失败，继续显示最近一次完整缓存";
      if (!silent || refresh) setLoading(false, message, "error");
      else updateRefreshProgress("error", message);
    } else {
      const message = silent ? "FAA NOTAM 后台刷新完成，已载入最新数据" : refresh ? "FAA NOTAM 刷新完成" : "FAA NOTAM 数据已载入";
      setLoading(false, message, "success");
    }
    await loadRefreshHistory({ source: "notam" });
  } catch (error) {
    if (silent) {
      updateRefreshProgress("error", `后台刷新状态检查失败：${error.message}`);
    } else {
      els.sourceLine.textContent = "FAA 数据连接失败";
      els.sourceStatus.innerHTML = `<div class="source-row error"><strong>错误</strong><span>${escapeHtml(error.message)}</span></div>`;
      setLoading(false, `刷新失败：${error.message}`, "error");
    }
  } finally {
    if (activeLoadController === controller) {
      activeLoadController = null;
    }
    if (!activeLoadController && pendingFaaRefresh) {
      pendingFaaRefresh = false;
      window.setTimeout(() => loadRestrictions(true), 0);
    }
  }
}

function clearFaaRefreshPoll() {
  if (!faaRefreshPollTimer) return;
  window.clearTimeout(faaRefreshPollTimer);
  faaRefreshPollTimer = null;
}

function scheduleFaaRefreshPoll(delayMs = FAA_REFRESH_POLL_INTERVAL_MS) {
  if (faaRefreshPollTimer) return;
  faaRefreshPollTimer = window.setTimeout(pollFaaRefreshStatus, delayMs);
}

function faaRefreshProgressMessage(refreshState = {}) {
  const explicitElapsed = Number(refreshState.elapsedMs || 0);
  const startedAtMs = Date.parse(refreshState.startedAt || "");
  const elapsedMs = explicitElapsed > 0
    ? explicitElapsed
    : Number.isFinite(startedAtMs)
      ? Date.now() - startedAtMs
      : faaRefreshRequestedAt
        ? Date.now() - faaRefreshRequestedAt
        : 0;
  const elapsed = elapsedMs > 0 ? `，已运行 ${formatDurationSeconds(elapsedMs / 1000)}` : "";
  return `FAA NOTAM 后台全量刷新中${elapsed}，当前显示最近一次完整缓存`;
}

async function pollFaaRefreshStatus() {
  faaRefreshPollTimer = null;
  try {
    const response = await fetch("/api/restrictions?details=0&tfr=0&status=1", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    faaRefreshPollFailureCount = 0;
    if (status.backgroundRefresh?.active) {
      updateRefreshProgress("busy", faaRefreshProgressMessage(status.backgroundRefresh));
      scheduleFaaRefreshPoll();
      return;
    }
    const refreshResult = status.lastBackgroundRefresh || null;
    if (!refreshResult) {
      updateRefreshProgress("error", "FAA NOTAM 后台任务状态已丢失，当前仍显示最近一次完整缓存");
      return;
    }
    faaRefreshRequestedAt = 0;
    await loadRestrictions(false, { silent: true, refreshResult });
  } catch (error) {
    faaRefreshPollFailureCount += 1;
    if (faaRefreshPollFailureCount < FAA_REFRESH_POLL_RETRY_LIMIT) {
      updateRefreshProgress(
        "busy",
        `FAA NOTAM 刷新仍在后台运行，状态连接暂时中断，正在自动重试（${faaRefreshPollFailureCount}/${FAA_REFRESH_POLL_RETRY_LIMIT}）`,
      );
      scheduleFaaRefreshPoll(Math.min(30000, 5000 + faaRefreshPollFailureCount * 2500));
      return;
    }
    updateRefreshProgress("error", `无法连接本地刷新服务：${error.message}。当前继续显示最近一次完整缓存`);
  }
}

async function loadHydropac(refresh) {
  if (state.hydropacLoading) {
    updateHydropacProgress("busy", "HYDROPAC 正在获取", "请等待当前 NGA MSI 请求完成");
    return;
  }
  state.hydropacLoading = true;
  updateHydropacProgress(
    "loading",
    refresh ? "正在刷新 HYDROPAC" : "正在载入 HYDROPAC 本地缓存",
    refresh ? "连接 NGA MSI 官方数据源" : "启动时不会联网刷新",
  );
  if (els.hydropacFetchButton) els.hydropacFetchButton.disabled = true;
  try {
    const response = await fetch(`/api/hydropac${refresh ? "?refresh=1" : ""}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.hydropacPayload = await response.json();
    state.hydropacWarnings = (state.hydropacPayload.restrictions || []).map(enrichRestriction);
    syncCombinedRestrictions();
    renderSourceStatus();
    renderFilters();
    renderWatchFilters();
    renderLegend();
    renderNotamIdSearchResults();
    applyFilters();
    const source = state.hydropacPayload.source || {};
    const progressState = source.status === "warn" ? "warn" : source.status === "empty" ? "muted" : "success";
    updateHydropacProgress(
      progressState,
      source.status === "warn"
        ? `HYDROPAC 刷新失败，保留缓存：${source.drawableWarnings ?? state.hydropacWarnings.length} 条可绘制`
        : `HYDROPAC 已载入：${source.drawableWarnings ?? state.hydropacWarnings.length} 条可绘制`,
      source.status === "warn" ? source.message : `版本：${state.hydropacPayload.dataVersion || "--"}`,
    );
    await loadRefreshHistory({ source: "hydropac" });
  } catch (error) {
    state.hydropacPayload = {
      source: {
        status: "error",
        message: `HYDROPAC 获取失败：${error.message}`,
      },
    };
    renderSourceStatus();
    updateHydropacProgress("error", "HYDROPAC 获取失败", error.message);
  } finally {
    state.hydropacLoading = false;
    if (els.hydropacFetchButton) els.hydropacFetchButton.disabled = false;
  }
}

async function loadMsaWarnings(refresh) {
  if (state.msaLoading) {
    updateMsaProgress("busy", "中国航警正在获取", "请等待当前中国海事局请求完成");
    return;
  }
  state.msaLoading = true;
  updateMsaProgress(
    "loading",
    refresh ? "正在刷新中国航警" : "正在载入中国航警本地缓存",
    refresh ? "连接中国海事局官方航行警告" : "启动时不会联网刷新",
  );
  if (els.msaFetchButton) els.msaFetchButton.disabled = true;
  try {
    const response = await fetch(`/api/msa-warnings${refresh ? "?refresh=1" : ""}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.msaPayload = await response.json();
    state.msaWarnings = (state.msaPayload.restrictions || []).map(enrichRestriction);
    syncCombinedRestrictions();
    renderSourceStatus();
    renderFilters();
    renderWatchFilters();
    renderLegend();
    renderNotamIdSearchResults();
    applyFilters();
    const source = state.msaPayload.source || {};
    if (source.backgroundRefresh?.active) {
      updateMsaProgress("busy", "中国航警后台全量扫描中", "首次扫描可能需要较长时间，完成后自动载入结果。");
      scheduleMsaRefreshPoll();
      return;
    }
    const progressState = source.status === "warn" ? "warn" : source.status === "empty" ? "muted" : "success";
    updateMsaProgress(
      progressState,
      source.status === "warn"
        ? `中国航警刷新失败，保留缓存：${source.drawableWarnings ?? state.msaWarnings.length} 条可绘制`
        : `中国航警已载入：${source.drawableWarnings ?? state.msaWarnings.length} 条可绘制`,
      source.status === "warn" ? source.message : `版本：${state.msaPayload.dataVersion || "--"}`,
    );
    loadRefreshHistory();
  } catch (error) {
    state.msaPayload = {
      source: {
        status: "error",
        message: `中国航警获取失败：${error.message}`,
      },
    };
    renderSourceStatus();
    updateMsaProgress("error", "中国航警获取失败", error.message);
  } finally {
    state.msaLoading = false;
    if (els.msaFetchButton) els.msaFetchButton.disabled = Boolean(state.msaPayload?.source?.backgroundRefresh?.active);
  }
}

function scheduleMsaRefreshPoll() {
  if (msaRefreshPollTimer) return;
  msaRefreshPollTimer = window.setTimeout(pollMsaRefreshStatus, 10000);
}

async function pollMsaRefreshStatus() {
  msaRefreshPollTimer = null;
  try {
    const response = await fetch("/api/msa-warnings?status=1", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    msaRefreshPollFailures = 0;
    if (status.active) {
      updateMsaProgress("busy", status.status === "queued" ? "中国航警刷新已排队" : "中国航警后台全量扫描中",
        `已等待 ${formatDurationSeconds(status.elapsedMs / 1000)}，完成后自动载入结果。`);
      scheduleMsaRefreshPoll();
      return;
    }
    if (state.msaPayload?.source) state.msaPayload.source.backgroundRefresh = { active: false };
    if (els.msaFetchButton) els.msaFetchButton.disabled = false;
    if (status.lastRefresh?.status === "success") await loadMsaWarnings(false);
    else updateMsaProgress("error", "中国航警后台刷新未完成", status.lastRefresh?.message || "任务状态已丢失，请重试刷新。");
  } catch (error) {
    if (++msaRefreshPollFailures < 12) {
      updateMsaProgress("busy", "中国航警刷新状态暂时无法连接", "正在重新连接，已载入区域继续保留。");
      scheduleMsaRefreshPoll();
    } else {
      if (state.msaPayload?.source) state.msaPayload.source.backgroundRefresh = { active: false };
      if (els.msaFetchButton) els.msaFetchButton.disabled = false;
      updateMsaProgress("error", "无法连接中国航警刷新服务", error.message);
    }
  }
}

async function loadNavareaWarnings(refresh) {
  if (state.navareaLoading) {
    updateNavareaProgress("busy", "NAVAREA 正在获取", "请等待当前 NAVAREA 请求完成");
    return;
  }
  state.navareaLoading = true;
  updateNavareaProgress(
    "loading",
    refresh ? "正在刷新 NAVAREA" : "正在载入 NAVAREA 本地缓存",
    refresh ? "连接 NAVAREA I/II/IV/VIII/XI/XII/XIII 航行警告源" : "启动时不会联网刷新",
  );
  if (els.navareaFetchButton) els.navareaFetchButton.disabled = true;
  try {
    const response = await fetch(`/api/navarea-warnings${refresh ? "?refresh=1" : ""}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.navareaPayload = await response.json();
    state.navareaWarnings = (state.navareaPayload.restrictions || []).map(enrichRestriction);
    syncCombinedRestrictions();
    renderSourceStatus();
    renderFilters();
    renderWatchFilters();
    renderLegend();
    renderNotamIdSearchResults();
    applyFilters();
    const source = state.navareaPayload.source || {};
    const progressState = source.status === "warn" ? "warn" : source.status === "empty" ? "muted" : "success";
    updateNavareaProgress(
      progressState,
      source.status === "warn"
        ? `NAVAREA 刷新失败，保留缓存：${source.drawableWarnings ?? state.navareaWarnings.length} 条可绘制`
        : `NAVAREA 已载入：${source.drawableWarnings ?? state.navareaWarnings.length} 条可绘制`,
      source.status === "warn" ? source.message : `版本：${state.navareaPayload.dataVersion || "--"}`,
    );
    loadRefreshHistory();
  } catch (error) {
    state.navareaPayload = {
      source: {
        status: "error",
        message: `NAVAREA 获取失败：${error.message}`,
      },
    };
    renderSourceStatus();
    updateNavareaProgress("error", "NAVAREA 获取失败", error.message);
  } finally {
    state.navareaLoading = false;
    if (els.navareaFetchButton) els.navareaFetchButton.disabled = false;
  }
}

async function loadCloudSatellite(refresh) {
  if (state.cloudLoading) {
    updateCloudProgress("busy", "卫星云图正在获取", "等待当前云图元数据请求完成");
    return;
  }
  state.cloudLoading = true;
  updateCloudProgress(
    "loading",
    refresh ? "正在刷新卫星云图" : "正在载入卫星云图",
    `NOAA GMGSI；${state.cloudSelectedSlot || 0} 小时前`,
  );
  try {
    const response = await fetch(`/api/cloud-satellite${cloudRequestQuery(refresh)}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.cloudPayload = await response.json();
    const source = state.cloudPayload.source || {};
    if (source.status === "error") throw new Error(source.message || "卫星云图源不可用");
    const previousHour = state.cloudSelectedHour;
    state.cloudTimeline = Array.isArray(state.cloudPayload.timeline) ? state.cloudPayload.timeline : [];
    state.cloudSelectedSlot = Number(state.cloudPayload.selectedSlot || 0);
    state.cloudSelectedHour = state.cloudPayload.selectedHour || source.selectedHour || state.cloudTimeline[state.cloudSelectedSlot]?.hourId || "";
    if (previousHour && previousHour !== state.cloudSelectedHour) {
      cloudTileCache.clear();
      clearCloudGlobeCaches();
    }
    renderCloudTimelineControls();
    const refreshLabel = state.cloudPayload.selectedTimeBeijing || source.selectedTimeBeijing || state.cloudSelectedHour || "--";
    updateCloudProgress(
      "success",
      `卫星云图已载入：${refreshLabel}`,
      `最近 ${state.cloudTimeline.length || 0} 个小时节点；透明度 ${Math.round(state.cloudOpacity * 100)}%`,
    );
    renderSourceStatus();
    draw();
  } catch (error) {
    state.cloudPayload = {
      source: {
        status: "error",
        message: `卫星云图获取失败：${error.message}`,
      },
    };
    renderSourceStatus();
    updateCloudProgress("error", "卫星云图获取失败", error.message);
  } finally {
    state.cloudLoading = false;
  }
}

async function loadRefreshHistory(options = {}) {
  if (!els.refreshHistoryList) return;
  try {
    const response = await fetch("/api/refresh-history", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.refreshHistory = await response.json();
    if (options.source) state.refreshHistorySource = options.source;
    if (options.selectIdIncludes) {
      const items = state.refreshHistory?.sources?.[state.refreshHistorySource] || [];
      const matched = latestMatchingHistoryItem(items, options.selectIdIncludes);
      if (matched) state.selectedHistoryKey = `${matched.source}:${matched.id}`;
    }
    renderRefreshHistory();
  } catch (error) {
    els.refreshHistoryList.innerHTML = `<p class="empty-text">刷新历史读取失败：${escapeHtml(error.message)}</p>`;
  }
}

function latestMatchingHistoryItem(items, idNeedle) {
  const matches = (items || []).filter((item) => String(item.id || "").includes(idNeedle));
  if (!matches.length) return null;
  return matches.sort((a, b) => Date.parse(b.savedAt || "") - Date.parse(a.savedAt || ""))[0];
}

function renderRefreshHistory() {
  if (!els.refreshHistoryList) return;
  document.querySelectorAll("[data-history-source]").forEach((button) => {
    button.classList.toggle("active", button.dataset.historySource === state.refreshHistorySource);
  });
  const items = state.refreshHistory?.sources?.[state.refreshHistorySource] || [];
  if (els.refreshHistoryCount) els.refreshHistoryCount.textContent = `${items.length}`;
  if (!items.length) {
    els.refreshHistoryList.innerHTML = `<p class="empty-text">暂无${escapeHtml(historySourceLabel(state.refreshHistorySource))}历史记录。</p>`;
    return;
  }
  els.refreshHistoryList.innerHTML = items
    .map((item) => {
      const key = `${item.source}:${item.id}`;
      const active = key === state.selectedHistoryKey ? "active" : "";
      const saved = item.savedAt ? formatDateTime(item.savedAt) : "--";
      const reference = item.referenceTime ? formatDateTime(item.referenceTime) : saved;
      const isHistoryDate = Boolean(item.historyDate);
      const title = isHistoryDate
        ? `${historySourceLabel(item.source)}历史 ${item.historyDate} 当天回放`
        : `${saved}${item.latest ? " · 当前缓存" : ""}`;
      const meta = isHistoryDate
        ? `${historySourceLabel(item.source)} / 可绘制 ${item.drawable ?? 0} / 总计 ${item.total ?? 0} / 保存 ${saved}`
        : `${historySourceLabel(item.source)} / 可绘制 ${item.drawable ?? 0} / 总计 ${item.total ?? 0} / 回放 ${reference}`;
      const detail = isHistoryDate ? item.message || item.dataVersion || "--" : item.dataVersion || item.message || "--";
      const satelliteCounts = item.counts || {};
      const satelliteMeta = item.source === "satellite"
        ? `总对象 ${(item.total ?? 0).toLocaleString("zh-CN")} · 在役载荷 ${(satelliteCounts.ACTIVE_PAYLOAD ?? 0).toLocaleString("zh-CN")} · 退役载荷 ${(satelliteCounts.RETIRED_PAYLOAD ?? 0).toLocaleString("zh-CN")} · 火箭体 ${(satelliteCounts.ROCKET_BODY ?? 0).toLocaleString("zh-CN")} · 残骸 ${(satelliteCounts.DEBRIS ?? 0).toLocaleString("zh-CN")}`
        : "";
      const satelliteDetail = item.source === "satellite"
        ? `LEO ${(satelliteCounts.LEO ?? 0).toLocaleString("zh-CN")} · MEO ${(satelliteCounts.MEO ?? 0).toLocaleString("zh-CN")} · GEO ${(satelliteCounts.GEO ?? 0).toLocaleString("zh-CN")} · HEO ${(satelliteCounts.HEO ?? 0).toLocaleString("zh-CN")}`
        : "";
      return `
        <div class="history-entry">
          <button class="history-item ${item.source === "satellite" ? "satellite-history-item" : ""} ${active}" type="button" data-history-id="${escapeHtml(item.id)}" data-history-source="${escapeHtml(item.source)}">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(satelliteMeta || meta)}</span>
            <em>${escapeHtml(satelliteDetail || detail)}</em>
          </button>
          <button class="history-delete" type="button" data-delete-history-id="${escapeHtml(item.id)}" data-delete-history-source="${escapeHtml(item.source)}" title="删除这条本地缓存" aria-label="删除 ${escapeHtml(title)}">删除</button>
        </div>
      `;
    })
    .join("");
  els.refreshHistoryList.querySelectorAll(".history-item[data-history-id]").forEach((button) => {
    button.addEventListener("click", () => loadRefreshHistoryItem(button.dataset.historySource, button.dataset.historyId));
  });
  els.refreshHistoryList.querySelectorAll("[data-delete-history-id]").forEach((button) => {
    button.addEventListener("click", () => deleteRefreshHistoryItem(button));
  });
  const activeItem = els.refreshHistoryList.querySelector(".history-item.active");
  activeItem?.scrollIntoView({ block: "nearest" });
}

async function deleteRefreshHistoryItem(button) {
  if (!button?.dataset.deleteHistoryId || !button.dataset.deleteHistorySource) return;
  if (button.dataset.confirmDelete !== "1") {
    button.dataset.confirmDelete = "1";
    button.classList.add("armed");
    button.textContent = "确认";
    window.setTimeout(() => {
      if (!button.isConnected || button.dataset.confirmDelete !== "1") return;
      button.dataset.confirmDelete = "";
      button.classList.remove("armed");
      button.textContent = "删除";
    }, 3500);
    return;
  }
  const source = button.dataset.deleteHistorySource;
  const id = button.dataset.deleteHistoryId;
  button.disabled = true;
  button.textContent = "删除中";
  try {
    const response = await fetch(`/api/refresh-history/item?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    state.refreshHistory = payload.history;
    if (state.selectedHistoryKey === `${source}:${id}`) state.selectedHistoryKey = "";
    renderRefreshHistory();
  } catch (error) {
    button.disabled = false;
    button.dataset.confirmDelete = "";
    button.classList.remove("armed");
    button.textContent = "重试";
    els.refreshHistoryList?.insertAdjacentHTML("afterbegin", `<p class="empty-text">缓存删除失败：${escapeHtml(error instanceof Error ? error.message : String(error))}</p>`);
  }
}

async function loadRefreshHistoryItem(source, id) {
  if (!source || !id) return;
  try {
    const response = await fetch(`/api/refresh-history/item?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const snapshot = await response.json();
    applyRefreshHistorySnapshot(snapshot);
    state.selectedHistoryKey = `${source}:${id}`;
    renderRefreshHistory();
  } catch (error) {
    els.refreshHistoryList?.insertAdjacentHTML("afterbegin", `<p class="empty-text">历史记录载入失败：${escapeHtml(error.message)}</p>`);
  }
}

function applyRefreshHistorySnapshot(snapshot) {
  const source = snapshot?.source;
  const data = snapshot?.data || {};
  if (source === "notam") {
    state.payload = data;
    state.faaRestrictions = (data.restrictions || []).map(enrichRestriction);
    state.detailMode = "notam";
  } else if (source === "hydropac") {
    state.hydropacPayload = data;
    state.hydropacWarnings = (data.restrictions || []).map(enrichRestriction);
    state.detailMode = "hydropac";
    state.hydropacEnabled = true;
    syncSourceToggleButton(els.hydropacToggle, state.hydropacEnabled);
    const hydropacSource = data.source || {};
    updateHydropacProgress(
      hydropacSource.status === "warn" ? "warn" : "success",
      data.historyDate
        ? `HYDROPAC 历史 ${data.historyDate}：${hydropacSource.drawableWarnings ?? state.hydropacWarnings.length} 条可绘制`
        : `HYDROPAC 回放加载完成：${hydropacSource.drawableWarnings ?? state.hydropacWarnings.length} 条可绘制`,
      data.dataVersion || hydropacSource.message || "--",
    );
  } else if (source === "msa") {
    state.msaPayload = data;
    state.msaWarnings = (data.restrictions || []).map(enrichRestriction);
    state.detailMode = "msa";
  } else if (source === "navarea") {
    state.navareaPayload = data;
    state.navareaWarnings = (data.restrictions || []).map(enrichRestriction);
    state.detailMode = "navarea";
  } else if (source === "satellite") {
    state.satellitePayload = data;
    state.satelliteCatalogItems = Array.isArray(data.satellites) ? data.satellites : [];
    rebuildSatelliteCatalogWithCustomElements();
    state.satelliteElementMode = "current";
    state.satelliteHistoricalElementsById = new Map();
    state.satelliteHistorySource = null;
    state.satelliteCoverageGeometryById.clear();
    pruneSatelliteSelection();
    rebuildSatelliteSelectionCaches();
    initializeSatelliteWorker();
    state.detailMode = "satellite";
    const counts = data.counts || {};
    updateSatelliteProgress(
      "success",
      `卫星轨道历史已载入：${state.satelliteCatalogItems.length.toLocaleString("zh-CN")} 个对象`,
      `缓存时间 ${formatDateTime(snapshot.savedAt || data.cacheSavedAt)} · LEO ${counts.LEO || 0} · MEO ${counts.MEO || 0} · GEO ${counts.GEO || 0} · HEO ${counts.HEO || 0}`,
    );
    syncSatelliteControls();
    renderList();
  } else {
    return;
  }
  syncCombinedRestrictions();
  renderSourceStatus();
  renderFilters();
  renderWatchFilters();
  renderLegend();
  renderDetailModeUi();
  renderNotamIdSearchResults();
  applyFilters();
}

function historySourceLabel(source) {
  if (source === "hydropac") return "HYDROPAC";
  if (source === "msa") return "中国航警";
  if (source === "navarea") return "NAVAREA";
  if (source === "satellite") return "卫星轨道";
  return "NOTAM";
}

async function loadLaunches(refresh) {
  if (state.launchLoading) {
    updateLaunchProgress("busy", "发射预告正在获取", "请等待当前 Launch Library 请求完成");
    return;
  }
  state.launchLoading = true;
  updateLaunchProgress(
    "loading",
    refresh ? "正在刷新发射预告" : "正在载入发射预告本地缓存",
    refresh ? "连接 Launch Library 2" : "启动时不会联网刷新",
  );
  if (els.launchFetchButton) els.launchFetchButton.disabled = true;
  try {
    const response = await fetch(`/api/launches${refresh ? "?refresh=1" : ""}`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.launchPayload = await response.json();
    state.launchForecasts = (state.launchPayload.launches || []).map(enrichLaunchForecast);
    renderSourceStatus();
    renderLaunchSiteFilter();
    renderLegend();
    renderNotamIdSearchResults();
    renderList();
    updateCounts();
    draw();
    const source = state.launchPayload.source || {};
    updateLaunchProgress(
      source.status === "warn" ? "warn" : source.status === "empty" ? "muted" : "success",
      source.status === "warn"
        ? `发射预告刷新失败，保留缓存：${source.activeLaunches ?? state.launchForecasts.length} 条`
        : `发射预告已载入：${source.activeLaunches ?? state.launchForecasts.length} 条`,
      source.status === "warn" ? source.message : `发射场：${source.launchSites ?? launchSiteGroups().length} 个`,
    );
  } catch (error) {
    state.launchPayload = {
      source: {
        status: "error",
        message: `发射预告获取失败：${error.message}`,
      },
    };
    renderSourceStatus();
    updateLaunchProgress("error", "发射预告获取失败", error.message);
  } finally {
    state.launchLoading = false;
    if (els.launchFetchButton) els.launchFetchButton.disabled = false;
  }
}

function syncCombinedRestrictions() {
  state.restrictions = [
    ...state.faaRestrictions,
    ...state.hydropacWarnings,
    ...state.msaWarnings,
    ...state.navareaWarnings,
    ...state.savedRegionOverlays,
  ];
  state.restrictionById = new Map(state.restrictions.map((item) => [item.id, item]));
}

function allLoadedRestrictions() {
  const seen = new Set();
  const output = [];
  for (const item of [...state.faaRestrictions, ...state.hydropacWarnings, ...state.msaWarnings, ...state.navareaWarnings]) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function isHydropacItem(item) {
  return item?.sourceKind === "hydropac" || item?.category === "HYDROPAC" || item?.type === "HYDROPAC";
}

function isMsaWarningItem(item) {
  return item?.sourceKind === "msa" || item?.category === "中国航警" || item?.type === "中国航警";
}

function isNavareaItem(item) {
  return item?.sourceKind === "navarea" || item?.category === "NAVAREA" || item?.type === "NAVAREA";
}

function isLaunchMode() {
  return state.detailMode === "launch";
}

function isSatelliteMode() {
  return state.detailMode === "satellite";
}

function isSourceDrawEnabled(item) {
  if (item?.savedRegion) return true;
  if (isHydropacItem(item)) return state.hydropacEnabled;
  if (isMsaWarningItem(item)) return state.msaEnabled;
  if (isNavareaItem(item)) return state.navareaEnabled;
  return state.notamEnabled;
}

function drawnFilteredItems() {
  const cached = drawnItemsCache;
  const highlightedSize = state.highlightedRestrictionIds.size;
  const highlightedKey = state.highlightOnly ? [...state.highlightedRestrictionIds].sort().join("|") : "";
  const timeWindowKey = [...state.timeWindowRestrictionIds].sort().join("|");
  if (
    cached?.filtered === state.filtered &&
    cached.restrictions === state.restrictions &&
    cached.highlightOnly === state.highlightOnly &&
    cached.notamEnabled === state.notamEnabled &&
    cached.hydropacEnabled === state.hydropacEnabled &&
    cached.msaEnabled === state.msaEnabled &&
    cached.navareaEnabled === state.navareaEnabled &&
    cached.timeWindowRestrictionIds === state.timeWindowRestrictionIds &&
    cached.highlightedRestrictionIds === state.highlightedRestrictionIds &&
    cached.highlightedSize === highlightedSize &&
    cached.highlightedKey === highlightedKey &&
    cached.timeWindowKey === timeWindowKey &&
    cached.searchRevealRestrictionId === state.searchRevealRestrictionId
  ) {
    return cached.items;
  }
  const items = state.highlightOnly ? state.filtered : filteredItemsWithTimeWindowHints();
  const result = items.filter((item) => isSourceDrawEnabled(item) && (item.savedRegion || !state.highlightOnly || state.highlightedRestrictionIds.has(item.id)));
  const searchReveal = state.searchRevealRestrictionId ? state.restrictionById.get(state.searchRevealRestrictionId) : null;
  if (searchReveal && isSourceDrawEnabled(searchReveal) && !result.some((item) => item.id === searchReveal.id)) result.push(searchReveal);
  drawnItemsCache = {
    filtered: state.filtered,
    restrictions: state.restrictions,
    highlightOnly: state.highlightOnly,
    notamEnabled: state.notamEnabled,
    hydropacEnabled: state.hydropacEnabled,
    msaEnabled: state.msaEnabled,
    navareaEnabled: state.navareaEnabled,
    timeWindowRestrictionIds: state.timeWindowRestrictionIds,
    highlightedRestrictionIds: state.highlightedRestrictionIds,
    highlightedSize,
    highlightedKey,
    timeWindowKey,
    searchRevealRestrictionId: state.searchRevealRestrictionId,
    items: result,
  };
  return result;
}

function filteredItemsWithTimeWindowHints() {
  if (!state.timeWindowRestrictionIds.size) return state.filtered;
  const seen = new Set();
  const output = [];
  for (const item of state.filtered) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  for (const item of state.restrictions) {
    if (!state.timeWindowRestrictionIds.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function detailModeItems(items = state.filtered) {
  if (isSatelliteMode()) return satelliteListItems();
  if (isLaunchMode()) return filteredLaunchForecasts();
  return items.filter((item) => {
    if (state.detailMode === "hydropac") return isHydropacItem(item);
    if (state.detailMode === "msa") return isMsaWarningItem(item);
    if (state.detailMode === "navarea") return isNavareaItem(item);
    return !isHydropacItem(item) && !isMsaWarningItem(item) && !isNavareaItem(item);
  });
}

function detailModeLabel() {
  if (isSatelliteMode()) return "卫星轨道";
  if (isLaunchMode()) return "发射预告";
  if (state.detailMode === "msa") return "中国航警";
  if (state.detailMode === "navarea") return "NAVAREA";
  return state.detailMode === "hydropac" ? "HYDROPAC" : "NOTAM";
}

function renderDetailModeUiLegacy() {
  document.querySelectorAll("[data-detail-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailMode === state.detailMode);
  });
  const label = detailModeLabel();
  if (els.detailSectionTitle) els.detailSectionTitle.textContent = `${label} 列表`;
  if (els.detailSearchLabel) els.detailSearchLabel.textContent = `按 ${label} 编号搜索全部数据`;
  if (els.notamIdSearchInput) {
    els.notamIdSearchInput.placeholder =
      state.detailMode === "hydropac" ? "例如 HYDROPAC 1438/26、1438/26" : "例如 A1234/26、M2523/26";
  }
}

function renderDetailModeUi() {
  document.querySelectorAll("[data-detail-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.detailMode === state.detailMode);
  });
  const label = detailModeLabel();
  if (els.detailSectionTitle) els.detailSectionTitle.textContent = `${label} 列表`;
  if (els.detailSearchLabel) {
    els.detailSearchLabel.textContent = isSatelliteMode()
      ? "搜索全部空间对象：名称、NORAD、国际编号、国家或类型"
      : isLaunchMode()
      ? "搜索火箭型号、国家、载荷、发射场"
      : `按 ${label} 编号搜索全部数据`;
  }
  if (els.notamIdSearchInput) {
    els.notamIdSearchInput.placeholder = isSatelliteMode()
      ? "例如 49258、试验十号、HEO、DEBRIS、PRC"
      : isLaunchMode()
      ? "例如 Starship、Long March、GPS、Kennedy"
      : state.detailMode === "hydropac"
        ? "例如 HYDROPAC 1438/26、1438/26"
        : "例如 A1234/26、M2523/26";
  }
  if (els.notamIdSearchInput && state.detailMode === "msa") {
    els.notamIdSearchInput.placeholder = "例如 沪航警204/26、津航警203/26";
  }
  if (els.notamIdSearchInput && state.detailMode === "navarea") {
    els.notamIdSearchInput.placeholder = "例如 NAVAREA XI 304/26、XII 93/23";
  }
  if (els.launchSiteFilterBox) els.launchSiteFilterBox.hidden = !isLaunchMode();
  if (els.launchFilterControls) els.launchFilterControls.hidden = !isLaunchMode();
  if (els.satelliteControls) els.satelliteControls.hidden = !isSatelliteMode();
  syncLaunchNext7Button();
  if (isLaunchMode()) renderLaunchSiteFilter();
  if (isSatelliteMode()) syncSatelliteControls();
}

function syncSourceToggleButton(button, enabled) {
  if (!button) return;
  button.classList.toggle("active", enabled);
  button.setAttribute("aria-pressed", enabled ? "true" : "false");
}

function enrichRestriction(item) {
  const category = normalizeNotamCategory(item.category || item.type || "NOTAM");
  const color = CATEGORY_COLORS.get(category) || CATEGORY_COLORS.get(item.type) || NOTAM_AREA_COLOR;
  const parsedGeometry = isRenderableGeometry(item.geometry) ? item.geometry : null;
  const areaGeometry = isAreaGeometry(parsedGeometry) ? parsedGeometry : null;
  const geometryAuditReason = areaGeometry ? auditClientGeometry(areaGeometry) : parsedGeometry ? "Point/LineString source geometry is not drawn as a restriction area." : null;
  const geometry = geometryAuditReason ? null : areaGeometry;
  const bounds = geometryBounds(geometry);
  const source = isHydropacItem(item) ? "hydropac" : isMsaWarningItem(item) ? "msa" : isNavareaItem(item) ? "navarea" : "notam";
  const countryFacet = restrictionCountryFacet(item, source);
  const renderKey = geometry ? `${source}:${geometryRenderKey(geometry)}` : "";
  const hitArea = geometry ? geometryHitArea(geometry) : Number.POSITIVE_INFINITY;
  const timeWindow = buildRestrictionTimeWindow(item);
  return {
    ...item,
    rawCategory: item.category,
    archiveProvenance: item.archiveProvenance || savedRegionProvenance(item),
    category,
    geometry,
    hasGeometry: Boolean(item.hasGeometry && geometry),
    color,
    bounds,
    renderKey,
    hitArea,
    timeWindow,
    timeWindowKey: timeWindow?.key || "",
    timeTextKey: timeWindow?.textKey || "",
    countryFilterKey: countryFacet.id,
    countryFilterLabel: countryFacet.label,
    countryFilterSection: countryFacet.section,
    geometryReason: geometryAuditReason || item.geometryReason,
    searchText: [
      item.notamId,
      item.notamKey,
      item.title,
      category,
      item.category,
      item.legal,
      item.country,
      countryFacet.label,
      item.state,
      item.region,
      item.regionName,
      item.source,
      item.sourceKind,
      item.altitude,
      item.timeLabel,
      item.beijingTimeLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function buildRestrictionTimeWindow(item) {
  const startMs = parseTimeWindowMs(item?.beginsAt);
  const endMs = parseTimeWindowMs(item?.endsAt);
  const hasIsoWindow = Number.isFinite(startMs) || Number.isFinite(endMs);
  const beijingLabel = item?.beijingTimeLabel || (hasIsoWindow ? formatBeijingRange(item?.beginsAt, item?.endsAt) : "");
  const textKey = normalizeTimeWindowText(item?.timeLabel || item?.beijingTimeLabel || "");
  const beijingTextKey = normalizeTimeWindowText(beijingLabel || item?.timeLabel || "");
  if (Number.isFinite(startMs) || Number.isFinite(endMs)) {
    const start = Number.isFinite(startMs) ? startMs : endMs;
    const end = Number.isFinite(endMs) ? endMs : startMs;
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    const beijingKey = beijingTimeWindowKey(min, max);
    return {
      startMs: min,
      endMs: max,
      durationMs: Math.max(0, max - min),
      key: `${Math.round(min / TIME_WINDOW_TOLERANCE_MS)}:${Math.round(max / TIME_WINDOW_TOLERANCE_MS)}`,
      beijingKey,
      beijingTextKey,
      beijingLabel,
      textKey,
    };
  }
  return textKey || beijingTextKey
    ? { startMs: null, endMs: null, durationMs: null, key: "", beijingKey: "", beijingTextKey, beijingLabel, textKey }
    : null;
}

function beijingTimeWindowKey(startMs, endMs) {
  return `${formatBeijingKeyFromMs(startMs)}:${formatBeijingKeyFromMs(endMs)}`;
}

function formatBeijingKeyFromMs(ms) {
  if (!Number.isFinite(ms)) return "";
  const date = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

function parseTimeWindowMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function normalizeTimeWindowText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[，。；;,.]+$/g, "")
    .trim()
    .toUpperCase();
}

function enrichLaunchForecast(item) {
  const displayPoint = launchDisplayPoint(item);
  const launchSiteId = displayPoint?.landmarkId
    ? `landmark:${displayPoint.landmarkId}`
    : item.siteKey || (displayPoint ? `coord:${displayPoint.lat.toFixed(4)},${displayPoint.lon.toFixed(4)}` : "");
  const bounds = displayPoint ? boundsFromPoint(displayPoint.lon, displayPoint.lat, 0.55) : null;
  return {
    ...item,
    displayPoint,
    launchSiteId,
    bounds,
    searchText: [
      item.name,
      item.rocket,
      item.mission,
      item.payloads?.join(" "),
      item.provider,
      item.country,
      item.countryCode,
      item.padName,
      item.locationName,
      item.status,
      item.orbit,
      item.missionType,
      item.net,
      item.beijingTimeLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function normalizeNotamCategory(value) {
  const text = String(value || "").trim();
  const upper = text.toUpperCase();
  if (["AD", "IAP", "INTERNATIONAL", "MILITARY", "NAV", "ROUTE", "RWY"].includes(upper)) return upper;
  if (text === "中国航警") return "中国航警";
  if (upper === "NOTAM") return "Notam";
  return text || "Notam";
}

function isRenderableGeometry(geometry) {
  return Boolean(geometry && typeof geometry === "object" && ["Point", "LineString", "Polygon", "MultiPolygon"].includes(geometry.type) && Array.isArray(geometry.coordinates));
}

function isAreaGeometry(geometry) {
  return Boolean(geometry && ["Polygon", "MultiPolygon"].includes(geometry.type) && Array.isArray(geometry.coordinates));
}

function applyFilters() {
  const useSelection = state.displayMode === "selected";
  state.filtered = state.restrictions.filter((item) => {
    if (item.savedRegion) return true;
    if (state.withGeometryOnly && !item.hasGeometry) return false;
    if (state.newOnly && !item.isNew) return false;
    if (state.search && !item.searchText.includes(state.search)) return false;
    if (useSelection && state.selectedCountries.size && !state.selectedCountries.has(item.countryFilterKey || item.country || "Unknown")) return false;
    if (useSelection && state.selectedRegions.size && !state.selectedRegions.has(item.region || "Unknown")) return false;
    if (useSelection && state.selectedWatchRegions.size && !restrictionInSelectedWatchRegion(item)) return false;
    if (
      useSelection &&
      !state.selectedCountries.size &&
      !state.selectedRegions.size &&
      !state.selectedWatchRegions.size
    ) {
      return false;
    }
    return true;
  });

  renderList();
  updateCounts();
  draw();
}

function restrictionInSelectedWatchRegion(item) {
  const bounds = item.bounds || (item.center ? boundsFromPoint(item.center.lon, item.center.lat) : null);
  if (!bounds) return false;
  return WATCH_REGIONS.some((region) => state.selectedWatchRegions.has(region.id) && boundsIntersect(bounds, region.bounds));
}

function renderFilters() {
  const filters = buildClientFilters(state.restrictions);
  els.countryFilters.innerHTML = renderGroupedCheckboxes(filters.countries || [], state.selectedCountries, "country");
  els.regionFilters.innerHTML = renderCheckboxes(filters.regions || [], state.selectedRegions, "region");
  els.countryFilters.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => updateFilterSet(input, state.selectedCountries));
  });
  els.regionFilters.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => updateFilterSet(input, state.selectedRegions));
  });
}

function loadLandmarkVisibilityFromStorage() {
  try {
    const raw = localStorage.getItem(LANDMARK_VISIBILITY_STORAGE_KEY);
    const hidden = JSON.parse(raw || "[]");
    const validIds = new Set(LANDMARKS.map((landmark) => landmark.id));
    const hiddenIds = new Set((Array.isArray(hidden) ? hidden : []).filter((id) => validIds.has(id)));
    const needsEtlaqMigration =
      !localStorage.getItem(LANDMARK_ETLAQ_MIGRATION_KEY) &&
      hiddenIds.size === Math.max(0, validIds.size - 1) &&
      !hiddenIds.has("etlaq-spaceport");
    if (needsEtlaqMigration) {
      validIds.forEach((id) => hiddenIds.add(id));
      localStorage.setItem(LANDMARK_VISIBILITY_STORAGE_KEY, JSON.stringify([...hiddenIds]));
      localStorage.setItem(LANDMARK_ETLAQ_MIGRATION_KEY, "1");
    }
    state.hiddenLandmarkIds = hiddenIds;
  } catch {
    state.hiddenLandmarkIds = new Set();
  }
}

function saveLandmarkVisibilityToStorage() {
  try {
    localStorage.setItem(LANDMARK_VISIBILITY_STORAGE_KEY, JSON.stringify([...state.hiddenLandmarkIds]));
  } catch {
    // Landmark visibility remains usable in memory when storage is disabled.
  }
}

function renderLandmarkFilters() {
  if (!els.landmarkFilters) return;
  els.landmarkFilters.innerHTML = LANDMARKS.map((landmark) => {
    const checked = isLandmarkVisible(landmark.id) ? "checked" : "";
    const kind = landmarkKind(landmark);
    return `
      <label class="check-row landmark-row">
        <input type="checkbox" data-landmark-id="${escapeHtml(landmark.id)}" ${checked} />
        <span title="${escapeHtml(landmark.label)}">${escapeHtml(landmark.label)}</span>
        <em>${escapeHtml(kind)}</em>
      </label>
    `;
  }).join("");
  els.landmarkFilters.querySelectorAll("input[data-landmark-id]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) state.hiddenLandmarkIds.delete(input.dataset.landmarkId);
      else state.hiddenLandmarkIds.add(input.dataset.landmarkId);
      saveLandmarkVisibilityToStorage();
      renderLandmarkCount();
      draw();
    });
  });
  renderLandmarkCount();
}

function renderLandmarkCount() {
  if (!els.landmarkCount) return;
  const visible = LANDMARKS.length - state.hiddenLandmarkIds.size;
  els.landmarkCount.textContent = `${visible}/${LANDMARKS.length}`;
}

function isLandmarkVisible(id) {
  return !state.hiddenLandmarkIds.has(id);
}

function allLandmarksHidden() {
  return LANDMARKS.length > 0 && state.hiddenLandmarkIds.size >= LANDMARKS.length;
}

function landmarkKind(landmark) {
  const label = String(landmark?.label || "");
  if (/着陆|回收/.test(label)) return "着陆";
  if (/靶|试验|导弹|反导|训练|火箭军|战略/.test(label)) return "靶场";
  if (/基地/.test(label)) return "基地";
  return "发射";
}

function buildClientFilters(items) {
  const countries = new Map();
  const regions = new Map();
  for (const item of items || []) {
    const facet = restrictionCountryFacet(item);
    addClientFilter(countries, facet.id, facet.label, facet.section);
    addClientFilter(regions, item.region || "Unknown", item.regionName || item.region || "Unknown");
  }
  return {
    countries: [...countries.values()].sort((a, b) =>
      countryFilterGroupIndex(a.section) - countryFilterGroupIndex(b.section) ||
      a.label.localeCompare(b.label, "zh-CN")),
    regions: [...regions.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

function addClientFilter(map, key, label = key, section = "") {
  if (!key) return;
  const current = map.get(key) || { id: key, label, section, count: 0 };
  current.count += 1;
  map.set(key, current);
}

function restrictionCountryFacet(item, knownSource = "") {
  if (item?.countryFilterKey && item?.countryFilterLabel) {
    return {
      id: item.countryFilterKey,
      label: item.countryFilterLabel,
      section: item.countryFilterSection || "other",
    };
  }
  const source = knownSource || (isHydropacItem(item) ? "hydropac" : isMsaWarningItem(item) ? "msa" : isNavareaItem(item) ? "navarea" : "notam");
  if (source === "hydropac") return hydropacCountryFacet(item);
  if (source === "navarea") {
    const region = String(item?.region || "NAVAREA").trim().toUpperCase();
    const configured = NAVAREA_FILTER_LABELS.get(region);
    return configured
      ? { id: `sea:${region.toLowerCase().replace(/\s+/g, "-")}`, label: configured[0], section: configured[1] }
      : { id: "sea:navarea-other", label: "NAVAREA · 其他海域", section: "other" };
  }
  const country = String(item?.country || "Unknown").trim() || "Unknown";
  if (OCEANIC_FIR_FILTERS.has(country)) {
    return { id: country, label: OCEANIC_FIR_FILTERS.get(country), section: "oceanic-fir" };
  }
  return {
    id: country,
    label: COUNTRY_FILTER_LABELS.get(country) || country,
    section: countryFilterSection(country),
  };
}

function hydropacCountryFacet(item) {
  const text = `${item?.title || ""} ${item?.rawTextPreview || ""} ${item?.rawText || ""}`.toUpperCase();
  if (/PERSIAN GULF|ARABIAN SEA|GULF OF OMAN|STRAIT OF HORMUZ/.test(text)) {
    return { id: "sea:hydropac-arabian-gulf", label: "HYDROPAC · 阿拉伯海 / 波斯湾", section: "maritime-indian" };
  }
  if (/BAY OF BENGAL|ANDAMAN SEA|INDIAN OCEAN/.test(text)) {
    return { id: "sea:hydropac-indian", label: "HYDROPAC · 印度洋 / 孟加拉湾", section: "maritime-indian" };
  }
  if (/SOUTH PACIFIC|CORAL SEA|TASMAN SEA|EASTERN SOUTH PACIFIC|BASS STRAIT|TIMOR SEA/.test(text)) {
    return { id: "sea:hydropac-south-pacific", label: "HYDROPAC · 南太平洋 / 澳新海域", section: "maritime-pacific" };
  }
  if (/SOUTH CHINA SEA|GULF OF THAILAND|MAKASSAR STRAIT|SELAT MAKASAR/.test(text)) {
    return { id: "sea:hydropac-west-pacific", label: "HYDROPAC · 南海 / 东南亚海域", section: "maritime-pacific" };
  }
  if (/NORTH PACIFIC|PHILIPPINE SEA|SEA OF JAPAN|JAPAN SEA|SEA OF OKHOTSK|BERING SEA/.test(text)) {
    return { id: "sea:hydropac-north-pacific", label: "HYDROPAC · 北太平洋 / 西北太平洋", section: "maritime-pacific" };
  }
  return { id: "sea:hydropac-other", label: "HYDROPAC · 其他海域", section: "other" };
}

function countryFilterSection(country) {
  return COUNTRY_FILTER_SECTION_BY_COUNTRY.get(country) || "other";
}

function countryFilterGroupIndex(section) {
  const index = COUNTRY_FILTER_GROUP_ORDER.indexOf(section);
  return index < 0 ? COUNTRY_FILTER_GROUP_ORDER.length : index;
}

function filteredLaunchForecasts() {
  const query = state.notamIdSearch.trim().toLowerCase();
  return launchForecastsForCurrentWindow().filter((launch) => {
    if (state.selectedLaunchSiteId && launch.launchSiteId !== state.selectedLaunchSiteId) return false;
    if (query && !launch.searchText.includes(query)) return false;
    return true;
  });
}

function launchForecastsForCurrentWindow() {
  if (!state.launchNext7Only) return state.launchForecasts;
  const minute = Math.floor(Date.now() / 60000);
  if (launchWindowCache?.source === state.launchForecasts && launchWindowCache.minute === minute) return launchWindowCache.items;
  const items = state.launchForecasts.filter((launch) => isLaunchWithinNextDays(launch, 7));
  launchWindowCache = { source: state.launchForecasts, minute, items };
  return items;
}

function isLaunchWithinNextDays(launch, days) {
  const timestamp = Date.parse(launch?.net);
  if (!Number.isFinite(timestamp)) return false;
  const now = Date.now();
  return timestamp >= now - 60 * 60 * 1000 && timestamp <= now + days * 24 * 60 * 60 * 1000;
}

function launchSiteGroups(launches = launchForecastsForCurrentWindow(), options = {}) {
  const respectLandmarkVisibility = Boolean(options.respectLandmarkVisibility);
  if (respectLandmarkVisibility && allLandmarksHidden()) return [];
  let grouped = launchSiteGroupCache.get(launches);
  if (!grouped) {
  const groups = new Map();
  for (const launch of launches) {
    const site = launchDisplayPoint(launch);
    if (!site) continue;
    if (respectLandmarkVisibility && site.landmarkId && !isLandmarkVisible(site.landmarkId)) continue;
    const id = site.landmarkId ? `landmark:${site.landmarkId}` : launch.siteKey || `coord:${site.lat.toFixed(4)},${site.lon.toFixed(4)}`;
    const existing =
      groups.get(id) ||
      {
        id,
        label: site.label || launch.locationName || launch.padName || "Unknown launch site",
        lon: site.lon,
        lat: site.lat,
        landmarkId: site.landmarkId || "",
        matchedLandmark: site.landmarkLabel || "",
        country: launch.country,
        count: 0,
        nextLaunchAt: null,
        launches: [],
      };
    existing.count += 1;
    existing.launches.push(launch);
    const launchAt = Date.parse(launch.net);
    const currentAt = Date.parse(existing.nextLaunchAt);
    if (Number.isFinite(launchAt) && (!Number.isFinite(currentAt) || launchAt < currentAt)) {
      existing.nextLaunchAt = new Date(launchAt).toISOString();
    }
    groups.set(id, existing);
  }
    grouped = [...groups.values()].sort((a, b) => compareLaunchTime(a.nextLaunchAt, b.nextLaunchAt) || a.label.localeCompare(b.label));
    launchSiteGroupCache.set(launches, grouped);
  }
  return respectLandmarkVisibility
    ? grouped.filter((site) => !site.landmarkId || isLandmarkVisible(site.landmarkId))
    : grouped;
}

function syncLaunchNext7Button() {
  if (!els.launchNext7Button) return;
  els.launchNext7Button.classList.toggle("active", state.launchNext7Only);
  els.launchNext7Button.setAttribute("aria-pressed", state.launchNext7Only ? "true" : "false");
}

function launchDisplayPoint(launch) {
  const cached = launchDisplayPointCache.get(launch);
  if (cached) return cached;
  if (!Number.isFinite(Number(launch?.lon)) || !Number.isFinite(Number(launch?.lat))) return null;
  const point = { lon: Number(launch.lon), lat: Number(launch.lat) };
  const landmark = nearestLaunchLandmark(point, launch);
  if (landmark) {
    const result = {
      lon: landmark.lon,
      lat: landmark.lat,
      label: landmark.label,
      landmarkId: landmark.id,
      landmarkLabel: landmark.label,
    };
    launchDisplayPointCache.set(launch, result);
    return result;
  }
  const result = {
    ...point,
    label: launch.locationName || launch.padName || "Unknown launch site",
  };
  launchDisplayPointCache.set(launch, result);
  return result;
}

function nearestLaunchLandmark(point, launch) {
  let best = null;
  for (const landmark of LANDMARKS) {
    if (landmark.color !== LANDMARK_RED) continue;
    const distance = greatCircleDistanceKm(point, landmark);
    const explicitMatch = launchMatchesLandmark(launch, landmark);
    const closeFallback = distance <= 2;
    if ((explicitMatch || closeFallback) && distance <= LAUNCH_LANDMARK_MATCH_KM && (!best || distance < best.distance)) {
      best = { ...landmark, distance };
    }
  }
  return best;
}

function launchMatchesLandmark(launch, landmark) {
  const aliases = LANDMARK_LAUNCH_ALIASES[landmark.id] || [];
  if (!aliases.length) return false;
  const text = [launch.locationName, launch.padName, launch.name, launch.provider]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return aliases.some((alias) => text.includes(alias));
}

function renderLaunchSiteFilter() {
  if (!els.launchSiteFilterSelect) return;
  const sites = launchSiteGroups();
  if (state.selectedLaunchSiteId && !sites.some((site) => site.id === state.selectedLaunchSiteId)) {
    state.selectedLaunchSiteId = "";
  }
  els.launchSiteFilterSelect.innerHTML =
    `<option value="">全部发射场（${sites.length}）</option>` +
    sites
      .map(
        (site) =>
          `<option value="${escapeHtml(site.id)}">${escapeHtml(site.label)}（${site.count}）</option>`,
      )
      .join("");
  els.launchSiteFilterSelect.value = state.selectedLaunchSiteId;
}

function earliestLaunchIso(launches) {
  const timestamps = launches.map((launch) => Date.parse(launch.net)).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.min(...timestamps)).toISOString() : "";
}

function compareLaunchTime(a, b) {
  const at = Date.parse(a);
  const bt = Date.parse(b);
  if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt;
  if (Number.isFinite(at)) return -1;
  if (Number.isFinite(bt)) return 1;
  return 0;
}

function renderWatchFilters() {
  if (!els.watchRegionFilters) return;
  const items = WATCH_REGIONS.map((region) => ({ id: region.id, label: region.label, count: watchRegionCount(region) }));
  els.watchRegionFilters.innerHTML = renderCheckboxes(items, state.selectedWatchRegions, "watch");
  els.watchRegionFilters.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      updateFilterSet(input, state.selectedWatchRegions);
      draw();
    });
  });
}

function renderTrajectoryControls() {
  const track = activeTrajectory();
  syncActiveTrajectoryState();
  els.trajectoryTrackSelect.innerHTML = state.trajectoryTracks
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join("");
  els.trajectoryTrackSelect.value = track.id;
  els.trajectoryColorInput.value = track.color;
  const lineWidth = track.lineWidth || DEFAULT_TRAJECTORY_LINE_WIDTH;
  if (els.trajectoryWidthInput) els.trajectoryWidthInput.value = lineWidth;
  if (els.trajectoryWidthValue) els.trajectoryWidthValue.textContent = `${formatPixelValue(lineWidth)} px`;
  const dashDensity = Number.isFinite(track.dashDensity) ? track.dashDensity : DEFAULT_TRAJECTORY_DASH_DENSITY;
  if (els.trajectoryDashInput) els.trajectoryDashInput.value = dashDensity;
  if (els.trajectoryDashValue) els.trajectoryDashValue.textContent = trajectoryDashDensityLabel(dashDensity);
  const groundTrackGlow = finiteOrClamp(track.groundTrackGlow, 10, 0, 30);
  if (els.trajectoryGlowInput) els.trajectoryGlowInput.value = groundTrackGlow;
  if (els.trajectoryGlowValue) els.trajectoryGlowValue.textContent = `${Math.round(groundTrackGlow)} px`;
  if (els.trajectoryAreaPickToggle) els.trajectoryAreaPickToggle.checked = state.trajectoryAreaPickEnabled;
  if (els.trajectoryAreaHighlightToggle) els.trajectoryAreaHighlightToggle.checked = state.trajectoryAreaHighlightEnabled;
  if (els.trajectoryLengthToggle) els.trajectoryLengthToggle.checked = state.trajectoryLengthLabels;
  if (els.trajectoryInclinationToggle) els.trajectoryInclinationToggle.checked = state.trajectoryInclinationLabels;
  if (els.trajectoryGeodesicToggle) els.trajectoryGeodesicToggle.checked = Boolean(track.geodesic);
  if (els.trajectoryGroundTrackToggle) els.trajectoryGroundTrackToggle.checked = track.showGroundTrack !== false;
  syncTrajectoryEditButtons(track);
  els.trajectoryToggle.checked = state.trajectoryEnabled;
  renderTrajectoryPlan();
  updateTrajectoryCount();
}

function ballisticGroundTrackSourceKey(stageId) {
  return `stage:${stageId}`;
}

function renderGroundTrackSourceControls(track) {
  if (!els.trajectoryGroundTrackSourceList) return;
  ensureTrajectoryPoints(track);
  const selectedSources = new Set(track.groundTrackSources || []);
  const choices = [
    { key: "manual", label: "上升段", detail: "手工星下点" },
    ...track.ballistic.stages.map((stage) => ({
      key: ballisticGroundTrackSourceKey(stage.id),
      label: stage.name,
      detail: "无动力投影",
    })),
  ];
  els.trajectoryGroundTrackSourceList.innerHTML = choices.map((choice) => {
    const checked = selectedSources.has(choice.key);
    return `<label class="ground-track-source-option ${checked ? "selected" : ""}">
      <input type="checkbox" data-ground-track-source="${escapeHtml(choice.key)}" ${checked ? "checked" : ""} />
      <span><strong>${escapeHtml(choice.label)}</strong><small>${escapeHtml(choice.detail)}</small></span>
    </label>`;
  }).join("");
  if (els.trajectoryGroundTrackSourceCount) {
    els.trajectoryGroundTrackSourceCount.textContent = `${selectedSources.size}/${choices.length}`;
  }
  els.trajectoryGroundTrackSourceList.querySelectorAll("[data-ground-track-source]").forEach((input) => {
    input.addEventListener("change", () => {
      const next = new Set(track.groundTrackSources || []);
      const key = input.dataset.groundTrackSource;
      if (input.checked) next.add(key);
      else next.delete(key);
      track.groundTrackSources = choices.map((choice) => choice.key).filter((choiceKey) => next.has(choiceKey));
      trajectoryRenderRevision += 1;
      renderGroundTrackSourceControls(track);
      renderLegend();
      draw();
    });
  });
}

function renderTrajectoryPlanLegacy() {
  const track = activeTrajectory();
  const selected = selectedTrajectoryItems();
  if (!selected.length) {
    els.trajectoryPlanList.innerHTML = `<p class="empty-text">尚未选择轨迹点。打开轨迹总开关后点击地图任意位置；打开区域点选后可直接点击 NOTAM/HYDROPAC 区域加入或移除。</p>`;
    return;
  }
  const modeNote = track.geodesic && selected.length >= 2
    ? `<p class="empty-text">椭球最短测地线模式：当前轨迹只使用第 1 点和最后 1 点，按 WGS-84 椭球面最短路径绘制。</p>`
    : "";
  els.trajectoryPlanList.innerHTML = modeNote + selected
    .map(
      ({ item, point, target }, index) => `
        <button class="trajectory-chip" type="button" data-remove-trajectory-point="${escapeHtml(point.id)}" ${track.manualLocked ? "disabled" : ""}>
          <span>${index + 1}. ${escapeHtml(trajectoryPointLabel(point, item))}</span>
          <small>${escapeHtml(formatDmsPair(target.lat, target.lon))}</small>
          <em>移除</em>
        </button>
      `,
    )
    .join("");
  els.trajectoryPlanList.querySelectorAll("[data-remove-trajectory-point]").forEach((button) => {
    button.addEventListener("click", () => removeTrajectoryPoint(button.dataset.removeTrajectoryPoint));
  });
}

function renderTrajectoryPlan() {
  trajectoryRenderRevision += 1;
  const track = activeTrajectory();
  ensureTrajectoryBallistic(track);
  syncTrajectoryEditButtons(track);
  renderGroundTrackSourceControls(track);
  if (state.ballisticPickStageId && !track.ballistic.stages.some((stage) => stage.id === state.ballisticPickStageId)) {
    state.ballisticPickStageId = "";
  }
  if (state.ballisticTargetPickStageId && !track.ballistic.stages.some((stage) => stage.id === state.ballisticTargetPickStageId)) {
    state.ballisticTargetPickStageId = "";
  }
  if (state.ballisticPoweredStartPickTrackId && state.ballisticPoweredStartPickTrackId !== track.id) {
    state.ballisticPoweredStartPickTrackId = "";
    state.ballisticPoweredStartPickMessage = "";
  }
  els.canvas?.classList.toggle("ballistic-pick-mode", Boolean(state.ballisticPickStageId || state.ballisticTargetPickStageId || state.ballisticPoweredStartPickTrackId));
  const selected = selectedTrajectoryItems();
  let pointsHtml = "";
  if (!selected.length) {
    pointsHtml = `<p class="empty-text">尚未选择轨迹点。打开轨迹总开关后点击地图任意位置；打开区域点选后可直接点击 NOTAM/HYDROPAC/中国航警/NAVAREA 区域加入或移除。</p>`;
  } else {
    const modeNote = track.geodesic && selected.length >= 2
      ? `<p class="empty-text">椭球最短测地线模式：当前轨迹只使用第 1 点和最后 1 点，按 WGS-84 椭球面最短路径绘制。</p>`
      : "";
    pointsHtml = modeNote + selected
      .map(
        ({ item, point, target }, index) => `
          <button class="trajectory-chip" type="button" data-remove-trajectory-point="${escapeHtml(point.id)}" ${track.manualLocked ? "disabled" : ""}>
            <span>${index + 1}. ${escapeHtml(trajectoryPointLabel(point, item))}</span>
            <small>${escapeHtml(formatDmsPair(target.lat, target.lon))}</small>
            <em>移除</em>
          </button>
        `,
      )
      .join("");
  }
  els.trajectoryPlanList.innerHTML = pointsHtml + renderBallisticControls(track, selected);
  els.trajectoryPlanList.querySelectorAll("[data-remove-trajectory-point]").forEach((button) => {
    button.addEventListener("click", () => removeTrajectoryPoint(button.dataset.removeTrajectoryPoint));
  });
  bindBallisticControlEvents();
  if (ballisticProfileFrame) cancelAnimationFrame(ballisticProfileFrame);
  ballisticProfileFrame = requestAnimationFrame(() => {
    ballisticProfileFrame = 0;
    drawBallisticProfile(activeBallisticSegment());
  });
}

function formatBallisticEpochInput(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 16) : defaultBallisticEpochUtc().slice(0, 16);
}

function renderBallisticControls(track, selected) {
  const config = track.ballistic;
  const activeStage = activeBallisticStage(track);
  const activeStageIndex = Math.max(0, config.stages.findIndex((stage) => stage.id === activeStage?.id));
  const activeBurnout = activeStage ? resolveBallisticBurnout(activeStage, selected) : null;
  const previewGeometry = selected.length >= 2 ? cachedTrajectoryGeometry(track, selected) : null;
  const previewPath = previewGeometry?.path || null;
  const activePathLocation = activeBurnout && previewPath ? nearestTrajectoryPathLocation(previewPath, activeBurnout) : null;
  const stageOptions = config.stages.length
    ? config.stages
        .map((stage, index) => {
          const ready = Boolean(resolveBallisticBurnout(stage, selected));
          return `<option value="${escapeHtml(stage.id)}" ${stage.id === config.activeStageId ? "selected" : ""}>${index + 1}. ${escapeHtml(stage.name)}${ready ? " · 已设分离点" : " · 未设分离点"}</option>`;
        })
        .join("")
    : `<option value="">尚未添加级</option>`;
  const stageTimeline = config.stages.length
    ? `<div class="ballistic-stage-timeline">${config.stages.map((stage, index) => {
        const burnout = resolveBallisticBurnout(stage, selected);
        const location = burnout && previewPath ? nearestTrajectoryPathLocation(previewPath, burnout) : null;
        const status = burnout ? (location ? `${formatKm(location.distanceKm)} 处分离` : "自由分离点") : "待设置";
        return `<button type="button" data-ballistic-stage-card="${escapeHtml(stage.id)}" class="${stage.id === config.activeStageId ? "active" : ""}">
          <i style="--stage-color:${escapeHtml(stage.color)}"></i><span>${index + 1}. ${escapeHtml(stage.name)}</span><em>${escapeHtml(status)}</em>
        </button>`;
      }).join("")}</div>`
    : "";
  const preview = activeStage && previewPath
    ? buildBallisticStageSegment(activeStage, selected, previewPath, activeStageIndex, previewGeometry?.signature)
    : null;
  const headingControl = !activeStage
    ? ""
    : activeStage.headingMode === "manual"
      ? `<label class="field-box"><span>分离瞬时方位角 (°)</span><input data-ballistic-stage-field="manualHeadingDeg" type="number" min="0" max="360" step="0.1" value="${activeStage.manualHeadingDeg}" /></label>`
      : `<label class="field-box"><span>相对主动段航向修正 (°)</span><input data-ballistic-stage-field="headingOffsetDeg" type="number" min="-180" max="180" step="0.1" value="${activeStage.headingOffsetDeg}" /></label>`;
  const pickMessage = state.ballisticPickMessage
    ? `<p class="control-note ballistic-pick-message">${escapeHtml(state.ballisticPickMessage)}</p>`
    : "";
  const activeStageControls = activeStage
    ? `
      <div class="ballistic-section-heading"><b>1</b><span><strong>主动段结束状态</strong><small>分离点不是发射点，必须单独设置</small></span></div>
      <div class="ballistic-identity-grid">
        <label class="field-box"><span>级名称</span><input data-ballistic-stage-field="name" type="text" value="${escapeHtml(window.AppI18n?.t(activeStage.name) || activeStage.name)}" /></label>
      </div>
      <div class="ballistic-powered-path-style ballistic-stage-path-style">
        <label><span>弹道颜色</span><input data-ballistic-stage-color type="color" value="${escapeHtml(activeStage.color)}" /></label>
        <label><span>弹道线宽</span><input data-ballistic-stage-line-width type="range" min="${BALLISTIC_STAGE_LINE_WIDTH_MIN}" max="${BALLISTIC_STAGE_LINE_WIDTH_MAX}" step="0.5" value="${activeStage.lineWidth}" /><output>${Number(activeStage.lineWidth).toFixed(1)} px</output></label>
      </div>
      <div class="segmented ballistic-position-mode" role="group" aria-label="分离点设置方式">
        <button data-ballistic-position-mode="track" type="button" class="${activeStage.positionMode !== "free" ? "active" : ""}">吸附主动段</button>
        <button data-ballistic-position-mode="free" type="button" class="${activeStage.positionMode === "free" ? "active" : ""}">自由坐标</button>
      </div>
      <div class="trajectory-actions compact ballistic-pick-actions">
        <button data-ballistic-pick-point type="button" class="${state.ballisticPickStageId === activeStage.id ? "active" : ""}">${state.ballisticPickStageId === activeStage.id ? "正在拾取，点击地图" : activeStage.positionMode === "free" ? "从地图拾取自由分离点" : "在主动段线上拾取分离点"}</button>
        <button data-ballistic-clear-point type="button" ${activeBurnout ? "" : "disabled"}>清除分离点</button>
      </div>
      ${pickMessage}
      <p class="control-note ballistic-point-note">${activeBurnout
        ? `${escapeHtml(activeBurnout.label || "独立分离点")} · ${escapeHtml(formatDmsPair(activeBurnout.lat, activeBurnout.lon))}${activePathLocation ? ` · 主动段 ${escapeHtml(formatKm(activePathLocation.distanceKm))} / ${Math.round(activePathLocation.fraction * 100)}%` : ""}`
        : "尚未设置分离点。新增级不会默认使用发射点，也不会开始无动力传播。"}</p>
      <details class="ballistic-coordinate-details" ${activeStage.positionMode === "free" ? "open" : ""}>
        <summary>精确坐标输入</summary>
        <div class="ballistic-parameter-grid">
          <label class="field-box"><span>分离点纬度</span><input data-ballistic-stage-field="burnoutLat" type="number" min="-90" max="90" step="0.000001" placeholder="纬度" value="${activeBurnout ? activeBurnout.lat.toFixed(6) : ""}" /></label>
          <label class="field-box"><span>分离点经度</span><input data-ballistic-stage-field="burnoutLon" type="number" min="-180" max="180" step="0.000001" placeholder="经度" value="${activeBurnout ? activeBurnout.lon.toFixed(6) : ""}" /></label>
        </div>
      </details>
      <div class="ballistic-section-heading"><b>2</b><span><strong>分离瞬时速度矢量</strong><small>残骸继承分离瞬间的位置与速度，再进入无动力段</small></span></div>
      <div class="ballistic-parameter-grid">
        <label class="field-box">
          <span>分离瞬时地速 (m/s)</span>
          <input data-ballistic-stage-field="initialSpeedMps" type="number" min="1" max="20000" step="10" value="${activeStage.initialSpeedMps}" />
        </label>
        <label class="field-box">
          <span>飞行路径角 (°)</span>
          <input data-ballistic-stage-field="flightPathAngleDeg" type="number" min="-89" max="89" step="0.1" value="${activeStage.flightPathAngleDeg}" />
        </label>
        <label class="field-box">
          <span>分离高度 (km)</span>
          <input data-ballistic-stage-field="burnoutAltitudeKm" type="number" min="0" max="5000" step="0.1" value="${activeStage.burnoutAltitudeKm}" />
        </label>
        <label class="field-box"><span>航向来源</span><select data-ballistic-stage-field="headingMode"><option value="track" ${activeStage.headingMode !== "manual" ? "selected" : ""}>继承主动段切向</option><option value="manual" ${activeStage.headingMode === "manual" ? "selected" : ""}>手工方位角</option></select></label>
        ${headingControl}
      </div>
      ${renderBallisticMaxRangeControls(preview, activeStage)}
      <div class="ballistic-section-heading"><b>3</b><span><strong>无动力传播与再入环境</strong><small>密度参与每一个积分子步，不是事后修正</small></span></div>
      <div class="ballistic-parameter-grid">
        <label class="field-box"><span>大气模型</span><select data-ballistic-stage-field="atmosphereModel"><option value="nrlmsise00" ${activeStage.atmosphereModel !== "standard1976" ? "selected" : ""}>NRLMSISE-00 时空大气</option><option value="standard1976" ${activeStage.atmosphereModel === "standard1976" ? "selected" : ""}>1976 标准大气</option></select></label>
        <label class="field-box"><span>环境时刻 (UTC)</span><input data-ballistic-stage-field="atmosphereEpochUtc" type="datetime-local" step="60" value="${formatBallisticEpochInput(activeStage.atmosphereEpochUtc)}" /></label>
        <label class="field-box">
          <span>弹道系数 β (kg/m²)</span>
          <input data-ballistic-stage-field="ballisticCoefficientKgM2" type="number" min="1" max="100000" step="10" value="${activeStage.ballisticCoefficientKgM2}" ${activeStage.dragEnabled ? "" : "disabled"} />
        </label>
        <label class="field-box"><span>头部半径 (m)</span><input data-ballistic-stage-field="noseRadiusM" type="number" min="0.01" max="100" step="0.05" value="${activeStage.noseRadiusM}" /></label>
        <label class="field-box"><span>有效升阻比 L/D</span><input data-ballistic-stage-field="liftToDragRatio" type="number" min="0" max="3" step="0.01" value="${activeStage.liftToDragRatio}" ${activeStage.dragEnabled ? "" : "disabled"} /></label>
        <label class="field-box"><span>倾侧角 (deg)</span><input data-ballistic-stage-field="bankAngleDeg" type="number" min="-180" max="180" step="1" value="${activeStage.bankAngleDeg}" ${activeStage.dragEnabled && activeStage.liftToDragRatio > 0 ? "" : "disabled"} /></label>
        <label class="field-box">
          <span>最长传播 (s)</span>
          <input data-ballistic-stage-field="maxTimeSec" type="number" min="10" max="604800" step="10" value="${activeStage.maxTimeSec}" />
        </label>
        <label class="field-box"><span>前一日 F10.7</span><input data-ballistic-stage-field="f107Daily" type="number" min="50" max="400" step="1" value="${activeStage.f107Daily}" /></label>
        <label class="field-box"><span>81 日均值 F10.7</span><input data-ballistic-stage-field="f107Average" type="number" min="50" max="400" step="1" value="${activeStage.f107Average}" /></label>
        <label class="field-box"><span>日 Ap 地磁指数</span><input data-ballistic-stage-field="ap" type="number" min="0" max="400" step="1" value="${activeStage.ap}" /></label>
      </div>
      <label class="toggle-line">
        <input data-ballistic-stage-field="dragEnabled" type="checkbox" ${activeStage.dragEnabled ? "checked" : ""} />
        <span>让大气密度参与阻力与热环境计算</span>
      </label>
      <label class="toggle-line">
        <input data-ballistic-impact-flash-toggle type="checkbox" ${activeStage.impactFlashEnabled !== false ? "checked" : ""} />
        <span>该级落地时显示瞬时高亮闪光</span>
      </label>
      ${renderBallisticTargetControls(preview, activeStage)}
      ${renderBallisticPreview(preview, activeStage)}
      ${renderReentryAnimationControls(track, preview, activeStage)}
    `
    : `<p class="empty-text">添加一级后，选择精确分离点并输入分离瞬间速度、倾角和高度。落点由积分结果决定。</p>`;

  return `
    <div class="ballistic-controls">
      <div class="ballistic-title">
        <strong>级段弹道传播</strong>
        <span>WGS-84 三维质点模型</span>
      </div>
      <label class="toggle-line">
        <input data-ballistic-toggle type="checkbox" ${config.enabled ? "checked" : ""} />
        <span>绘制分离后的无动力弹道</span>
      </label>
      <label class="toggle-line">
        <input data-ballistic-powered-path-toggle type="checkbox" ${config.showPoweredPath ? "checked" : ""} />
        <span>绘制地表起点至各分离点的三维主动段</span>
      </label>
      <label class="toggle-line">
        <input data-ballistic-powered-vertical-launch-toggle type="checkbox" ${config.poweredVerticalLaunch !== false ? "checked" : ""} ${config.showPoweredPath ? "" : "disabled"} />
        <span>垂直爬升后进入俯仰与重力转弯</span>
      </label>
      <p class="control-note">打开后，轨迹先沿发射点的 WGS-84 当地法线完成有限垂直爬升，再逐渐俯仰并建立地速；后续曲线精确穿过全部分离点，明显狗腿只在相邻级段内收紧。空射或非垂直离架任务可关闭。</p>
      <div class="ballistic-powered-path-style ${config.showPoweredPath ? "" : "disabled"}">
        <label><span>主动段颜色</span><input data-ballistic-powered-path-color type="color" value="${escapeHtml(config.poweredPathColor)}" ${config.showPoweredPath ? "" : "disabled"} /></label>
        <label><span>线宽</span><input data-ballistic-powered-path-width type="range" min="1" max="12" step="0.5" value="${config.poweredPathWidth}" ${config.showPoweredPath ? "" : "disabled"} /><output>${Number(config.poweredPathWidth).toFixed(1)} px</output></label>
      </div>
      <div class="ballistic-powered-start ${config.showPoweredPath ? "" : "disabled"}">
        <div><strong>主动段地表起点</strong><span>${Number.isFinite(config.poweredStartLat) && Number.isFinite(config.poweredStartLon) ? escapeHtml(formatDmsPair(config.poweredStartLat, config.poweredStartLon)) : "尚未设置"}</span></div>
        <div class="ballistic-powered-start-actions">
          <button data-ballistic-powered-start-pick type="button" class="${state.ballisticPoweredStartPickTrackId === track.id ? "active" : ""}" ${config.showPoweredPath ? "" : "disabled"}>${state.ballisticPoweredStartPickTrackId === track.id ? "正在拾取起点" : "从地图选择起点"}</button>
          <button data-ballistic-powered-start-clear type="button" ${config.showPoweredPath && Number.isFinite(config.poweredStartLat) && Number.isFinite(config.poweredStartLon) ? "" : "disabled"}>清除</button>
        </div>
        <div class="ballistic-powered-start-coordinates">
          <label><span>纬度</span><input data-ballistic-powered-start-lat type="number" min="-90" max="90" step="0.000001" value="${Number.isFinite(config.poweredStartLat) ? config.poweredStartLat.toFixed(6) : ""}" placeholder="纬度" ${config.showPoweredPath ? "" : "disabled"} /></label>
          <label><span>经度</span><input data-ballistic-powered-start-lon type="number" min="-180" max="180" step="0.000001" value="${Number.isFinite(config.poweredStartLon) ? config.poweredStartLon.toFixed(6) : ""}" placeholder="经度" ${config.showPoweredPath ? "" : "disabled"} /></label>
        </div>
        ${state.ballisticPoweredStartPickMessage ? `<p>${escapeHtml(state.ballisticPoweredStartPickMessage)}</p>` : ""}
      </div>
      <label class="toggle-line">
        <input data-ballistic-labels-toggle type="checkbox" ${config.showLabels ? "checked" : ""} />
        <span>显示弹道总标签</span>
      </label>
      <label class="toggle-line">
        <input data-ballistic-animation-labels-toggle type="checkbox" ${config.showAnimationLabels ? "checked" : ""} />
        <span>显示动画实时标签</span>
      </label>
      <label class="toggle-line">
        <input data-ballistic-range-toggle type="checkbox" ${config.showGroundRange ? "checked" : ""} />
        <span>标签显示地面射程</span>
      </label>
      <label class="field-box">
        <span>当前级</span>
        <select data-ballistic-stage-select>${stageOptions}</select>
      </label>
      ${stageTimeline}
      <div class="trajectory-actions compact">
        <button data-ballistic-add-stage type="button" ${config.stages.length >= BALLISTIC_ANIMATION_MAX_OBJECTS ? "disabled" : ""} title="最多 ${BALLISTIC_ANIMATION_MAX_OBJECTS} 个分离物体">添加分离级</button>
        <button data-ballistic-delete-stage type="button">删除当前级</button>
      </div>
      ${activeStageControls}
      ${renderBallisticModelGuide()}
    </div>
  `;
}

function renderBallisticModelGuide() {
  return `
    <details class="ballistic-model-guide">
      <summary><span>计算模型与方法</span><small>从初始条件到落点反算的完整说明</small></summary>
      <div class="ballistic-model-guide-body">
        <section>
          <h4>1. 两类曲线与输入边界</h4>
          <p>主动段曲线是空间几何重建：它从用户选择的 WGS-84 海拔 0 米地表点出发，依次穿过每一级按经纬度和真实分离高度定义的分离点。默认先沿当地椭球法线建立有限的垂直离架段，再通过早期俯仰肩点连续进入重力转弯并逐步建立水平速度；狗腿转向会被限制在相邻级段内。关闭垂直约束后可表示空射或非垂直离架。该曲线没有反推推力、质量流量或制导律。分离后的每一级才进入动力学传播，初始条件由本级分离位置、地速、航向、飞行路径角、弹道系数、头部半径和环境时刻共同确定。</p>
        </section>
        <section>
          <h4>2. 坐标系与初始状态</h4>
          <p>经纬度和椭球高先转换为 WGS-84 地固直角坐标。用户输入的是相对地面的局部东北天速度，程序将其旋转到地固系，并加入当地自转速度 <code>ω×r</code> 得到地心惯性系初速度。状态量为位置 <code>r</code> 与速度 <code>v</code>，在 ECI 中积分；每个显示时刻再按地球转角旋回 ECEF 并解算 WGS-84 经纬度和椭球高。科里奥利与离心现象由这组坐标变换自然产生，不会再额外叠加一份伪力。</p>
        </section>
        <section>
          <h4>3. 受力方程</h4>
          <p>传播方程为 <code>dr/dt = v</code>、<code>dv/dt = agrav + aaero</code>。重力使用地球引力常数和 J2/J3/J4 带谐项，描述扁率及主要轴对称高阶摄动。阻力方向与物体相对共转大气的速度相反，大小按 <code>|D/m| = ρ·Vrel²/(2β)</code> 计算，其中 <code>β = m/(Cd·A)</code> 由用户作为等效常数输入。可选的有效升阻比以 <code>|L| = (L/D)|D|</code> 施加，倾侧角绕相对气流方向旋转升力矢量；默认 <code>L/D = 0</code>，因此不会改变普通无升力撞地弹道。关闭阻力后只保留当前重力模型。</p>
        </section>
        <section>
          <h4>4. 大气与热环境</h4>
          <p>标准模式使用 1976 标准大气，并先把 WGS-84 几何高度转换为位势高度；高空段连续接入密度和温度近似。经验模式使用 NRLMSISE-00，在每个积分子步按 UTC、纬度、经度、地方太阳时、F10.7 与 Ap 求密度和温度。动压、相对空速、马赫数、阻力过载、Reynolds 数、Knudsen 数和流态均由同一子步状态计算；驻点对流热流采用 Sutton-Graves 工程关系。120 km 只是再入界面参考，不是阻力或加热的硬开关。</p>
        </section>
        <section>
          <h4>5. 数值积分、撞地与轨道判定</h4>
          <p>积分器采用四阶 Runge-Kutta 步长加倍，以位置、速度和相对误差共同接受或拒绝子步，并根据局部误差自动调整下一步长。首次跨越 WGS-84 椭球海拔 0 米时，在最后一个已接受步内继续高阶传播并二分求交，不用两个显示采样点做直线插值。地表航程按每个接受步的实际星下点沿椭球累加；分离点到终点的最短测地距离单独计算。程序检测全部下降与上升穿越 120 km 的事件，把每次入界、最低点、峰值热流/动压/过载和出界组成独立大气通道。束缚轨道同时给出固定参考历元的瞬时根数与传播终点瞬时根数，避免把 J2/J3/J4 摄动下随历元振荡的密切根数误当作入轨参数漂移。</p>
        </section>
        <section>
          <h4>6. 指定落点反算</h4>
          <p>反算把目标到预测落点的 WGS-84 椭球测地误差分解为东、北两个残差。服务端先并行传播覆盖航向和第二变量范围的全局种子，再用中心有限差分建立二维敏感度 Jacobian，以带阻尼的差分修正和信赖步长同时更新航向与速度或路径角；失败方向会退回有界邻域搜索。全部候选由多核工作线程并行传播，最终解再以更紧的位置、速度和相对容差完整复算。反算求得的是当前三自由度模型下的一组数值解，不代表从危险区唯一恢复了真实任务参数。</p>
        </section>
        <section class="limits">
          <h4>7. 当前模型不包含</h4>
          <p>主动段推力和质量流量、六自由度姿态与气动力矩、升力和攻角制导、风场、随马赫数变化的气动数据库、质量与外形变化、烧蚀和解体、辐射加热、日月第三体引力、太阳光压、级间碰撞、地球非轴对称高阶重力、实时地球定向参数以及地形高程撞击面。任务设计、靶场安全和飞行许可仍需具备真实飞行器数据的 6-DOF、CFD 和官方工具。</p>
        </section>
      </div>
    </details>
  `;
}

function renderBallisticMaxRangeControls(segment, stage) {
  const status = stage.maxRangeState;
  const optimizing = status?.status === "loading";
  const statusClass = status?.status === "error" ? "error" : status?.status === "success" ? "success" : "";
  const headingText = segment ? formatDegrees(segment.headingDeg) : "--";
  const statusText = optimizing
    ? "正在用当前完整传播模型搜索全部可落地路径角，请稍候..."
    : status?.message || `固定当前分离点、地速、高度和 ${headingText} 航向，只优化飞行路径角。`;
  return `
    <div class="ballistic-range-optimizer">
      <button class="ballistic-solve-button ${optimizing ? "loading" : ""}" data-ballistic-max-range type="button" ${segment && !optimizing ? "" : "disabled"}>${optimizing ? "最大射程计算中" : "一键求最大地面射程"}</button>
      <div class="ballistic-target-status ${statusClass}">
        <strong>路径角自动寻优</strong>
        <span>${escapeHtml(statusText)}</span>
      </div>
    </div>
  `;
}

function resolveBallisticTarget(stage) {
  if (!stage) return null;
  if (stage.targetLat === null || stage.targetLat === "" || stage.targetLon === null || stage.targetLon === "") return null;
  const lat = Number(stage.targetLat);
  const lon = Number(stage.targetLon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? { lat: clamp(lat, -90, 90), lon: normalizeLon(lon) }
    : null;
}

function syncBallisticTargetControlsDom(control, track, stage) {
  const panel = control?.closest?.(".ballistic-target-panel");
  if (!panel || !track || !stage) return;
  const target = resolveBallisticTarget(stage);
  const solving = stage.inverseState?.status === "loading";
  const segment = target ? activeBallisticSegment(track, stage) : null;
  const clearButton = panel.querySelector("[data-ballistic-clear-target]");
  const solveButton = panel.querySelector("[data-ballistic-solve-target]");
  const statusBox = panel.querySelector(".ballistic-target-status");
  const statusTitle = statusBox?.querySelector("strong");
  const statusText = statusBox?.querySelector("span");
  panel.classList.toggle("has-target", Boolean(target));
  if (clearButton) clearButton.disabled = !target;
  if (solveButton) solveButton.disabled = !(target && segment && !solving);
  if (statusTitle) statusTitle.textContent = target ? formatDmsPair(target.lat, target.lon) : "尚未指定落点";
  if (statusText) {
    if (!target) {
      statusText.textContent = "设置目标后，可反算航向与一个速度参数。";
    } else if (segment?.physics?.impact) {
      const inverse = vincentyInverse(segment.physics.impact, target);
      statusText.textContent = Number.isFinite(inverse?.distanceM)
        ? `当前预测落点误差 ${formatKm(inverse.distanceM / 1000)}`
        : "目标已设置，可以开始反算。";
    } else {
      statusText.textContent = segment ? "目标已设置，可以开始反算。" : "请先设置有效分离点和星下点线。";
    }
  }
}

function renderBallisticTargetControls(segment, stage) {
  const target = resolveBallisticTarget(stage);
  const picking = state.ballisticTargetPickStageId === stage.id;
  const solving = stage.inverseState?.status === "loading";
  const targetInverse = target && segment?.physics?.impact ? vincentyInverse(segment.physics.impact, target) : null;
  const targetError = Number.isFinite(targetInverse?.distanceM) ? targetInverse.distanceM / 1000 : null;
  const status = stage.inverseState;
  const statusClass = status?.status === "error" ? "error" : status?.status === "success" ? "success" : "";
  const statusText = solving
    ? "正在反复传播并收敛落点，请稍候..."
    : status?.message
      ? status.message
      : targetError !== null
        ? `当前预测落点误差 ${formatKm(targetError)}`
        : "设置目标后，可反算航向与一个速度参数。";
  return `
    <div class="ballistic-section-heading"><b>4</b><span><strong>指定落点反算</strong><small>多核全局种子 + WGS-84 二维差分修正</small></span></div>
    <div class="ballistic-target-panel ${target ? "has-target" : ""}">
      <div class="ballistic-target-actions">
        <button data-ballistic-pick-target type="button" class="${picking ? "active" : ""}">${picking ? "正在地图上拾取" : "从地图指定落点"}</button>
        <button data-ballistic-clear-target type="button" ${target ? "" : "disabled"}>清除落点</button>
      </div>
      ${state.ballisticTargetPickMessage ? `<p class="control-note ballistic-pick-message">${escapeHtml(state.ballisticTargetPickMessage)}</p>` : ""}
      <div class="ballistic-parameter-grid">
        <label class="field-box"><span>目标纬度</span><input data-ballistic-stage-field="targetLat" type="number" min="-90" max="90" step="0.000001" placeholder="纬度" value="${target ? target.lat.toFixed(6) : ""}" /></label>
        <label class="field-box"><span>目标经度</span><input data-ballistic-stage-field="targetLon" type="number" min="-180" max="180" step="0.000001" placeholder="经度" value="${target ? target.lon.toFixed(6) : ""}" /></label>
        <label class="field-box"><span>反算变量</span><select data-ballistic-stage-field="inverseMode"><option value="heading-speed" ${stage.inverseMode !== "heading-angle" ? "selected" : ""}>航向 + 初始速度</option><option value="heading-angle" ${stage.inverseMode === "heading-angle" ? "selected" : ""}>航向 + 路径角</option></select></label>
        <label class="field-box"><span>允许误差 (km)</span><input data-ballistic-stage-field="targetToleranceKm" type="number" min="0.01" max="500" step="0.1" value="${stage.targetToleranceKm}" /></label>
      </div>
      <button class="ballistic-solve-button ${solving ? "loading" : ""}" data-ballistic-solve-target type="button" ${target && segment && !solving ? "" : "disabled"}>${solving ? "反算中" : "开始反算并应用"}</button>
      <div class="ballistic-target-status ${statusClass}"><strong>${target ? escapeHtml(formatDmsPair(target.lat, target.lon)) : "尚未指定落点"}</strong><span>${escapeHtml(statusText)}</span></div>
    </div>
  `;
}

function renderBallisticPreview(segment, stage) {
  if (!BALLISTIC_PHYSICS) return `<p class="ballistic-result error">弹道物理模块未载入，请刷新页面。</p>`;
  if (!segment) return `<p class="ballistic-result muted">请先设置独立分离点，并保证星下点线至少有两个点以确定飞行切向。</p>`;
  if (!segment.physics.valid) return `<p class="ballistic-result error">${escapeHtml(segment.physics.message || "输入参数无效")}</p>`;
  const physics = segment.physics;
  const statusText = physics.status === "impact"
    ? "已计算落点"
    : physics.status === "orbit"
      ? "已进入束缚地球轨道"
      : physics.status === "timeout"
        ? "传播时限内未落地"
        : physics.message;
  const impactText = physics.impact ? formatDmsPair(physics.impact.lat, physics.impact.lon) : physics.status === "orbit" ? "未触地 · 已入轨" : "无落点";
  const atmosphereStatus = physics.empiricalStatus === "pending"
    ? "NRLMSISE-00 计算中；当前显示标准大气即时预览"
    : physics.empiricalStatus === "error"
      ? `NRLMSISE-00 失败；已回退标准大气：${physics.empiricalError || "服务不可用"}`
      : physics.model?.atmosphere === "NRLMSISE-00 empirical atmosphere"
        ? `NRLMSISE-00 · ${physics.environment?.computeMs ?? "--"} ms`
        : "1976 标准大气";
  const reentry = physics.reentry;
  const aerodynamicOnset = reentry?.aerodynamicOnset;
  const interface70Km = reentry?.interface70Km;
  const skipPasses = (reentry?.passes || []).filter((pass) => pass.outcome === "exit");
  const orbitReference = physics.orbitAnalysis?.reference || physics.orbit?.reference || physics.orbit;
  const orbitFinal = physics.orbitAnalysis?.final || physics.orbit?.final;
  const orbitReferenceLabel = physics.orbitAnalysis?.referenceKind === "post-aerocapture-osculating"
    ? "初轨根数（首次完整大气掠入后参考历元）"
    : "初轨根数（分离历元）";
  const skipPassSummary = skipPasses.length
    ? `<span>完整大气掠入 ${skipPasses.length} 次 · 120 km 入界/出界均已预计算 · 最低 ${formatKm(Math.min(...skipPasses.map((pass) => pass.minimumAltitude.altitudeM)) / 1000)}</span>${skipPasses.slice(0, 6).map((pass) => `<span>第 ${pass.index + 1} 次：T+${formatDurationSeconds(pass.entry.elapsedSec)} 入界 · 最低 ${formatKm(pass.minimumAltitude.altitudeM / 1000)} · T+${formatDurationSeconds(pass.exit.elapsedSec)} 出界 · 峰值热流 ${formatHeatFlux(pass.peakHeating.convectiveHeatFluxWm2)}</span>`).join("")}`
    : "";
  const aerothermalAdvisory = reentry?.radiativeHeatingAdvisory
    ? `<span class="ballistic-physics-warning">速度达到或超过 10 km/s：当前数值为 Sutton-Graves 冷壁驻点对流热流；辐射加热、烧蚀与热化学非平衡未纳入，真实总热流可能更高。</span>`
    : `<span>气动热诊断 ${escapeHtml(String(reentry?.diagnosticSampleCount || physics.integrationSteps || 0))} 个积分步 · 阻力按 q/β · 热流按 Sutton-Graves 冷壁驻点关系</span>`;
  return `
    <div class="ballistic-result">
      <strong>${escapeHtml(statusText)}</strong>
      <span>${escapeHtml(atmosphereStatus)}</span>
      <span>${stage.headingMode === "manual" ? `手工方位角 ${formatDegrees(segment.headingDeg)}` : `主动段切向 ${formatDegrees(segment.baseHeadingDeg)} + 修正 ${formatDegrees(stage.headingOffsetDeg)} = ${formatDegrees(segment.headingDeg)}`}</span>
      <span>最高点 ${formatKm(physics.apogee.altitudeM / 1000)} · 地表航程 ${formatKm(physics.groundRangeM / 1000)}${ballisticTrackDistanceSuffix(physics)}</span>
      <span>飞行 ${formatDurationSeconds(physics.flightTimeSec)} · ${escapeHtml(impactText)}</span>
      ${physics.status === "orbit" && orbitReference ? `<span>${orbitReferenceLabel} · ${escapeHtml(formatOrbitSummary(orbitReference))}</span>` : ""}
      ${physics.status === "orbit" && orbitFinal && orbitReference && Math.abs(Number(orbitFinal.epochSec) - Number(orbitReference.epochSec)) > 1e-6 ? `<span>传播终点瞬时轨道 (T+${formatDurationSeconds(orbitFinal.epochSec)}) · ${escapeHtml(formatOrbitSummary(orbitFinal))}</span>` : ""}
      ${skipPassSummary}
      ${interface70Km ? `<span>下降穿越 70 km · 空速 ${formatMps(interface70Km.airRelativeSpeedMps ?? interface70Km.groundRelativeSpeedMps)} · 再入角 ${formatDegrees(interface70Km.flightPathAngleDeg)} · ${formatMach(interface70Km.localMach)}</span>` : ""}
      ${aerodynamicOnset ? `<span>本次气动起始 ${formatKm(aerodynamicOnset.altitudeM / 1000)} · 峰值热流 ${formatHeatFlux(reentry.peakHeating?.convectiveHeatFluxWm2)} · 峰值动压 ${formatPressure(reentry.peakDynamicPressure?.dynamicPressurePa)}</span>` : ""}
      ${aerothermalAdvisory}
    </div>
  `;
}

function ballisticAnimationObjectKey(trackId, stageId) {
  return REENTRY_ANIMATION?.objectKey(trackId, stageId) || `${trackId}::${stageId}`;
}

function ensureBallisticAnimationConfig() {
  const animation = state.ballisticAnimation;
  if (!Array.isArray(animation.objectKeys)) animation.objectKeys = [];
  if (!animation.objectSettings || typeof animation.objectSettings !== "object") animation.objectSettings = {};
  if (!animation.impactFlashStartedAtByKey || typeof animation.impactFlashStartedAtByKey !== "object") animation.impactFlashStartedAtByKey = {};
  if (typeof animation.focusKey !== "string") animation.focusKey = "";
  if (typeof animation.cacheStatus !== "string") animation.cacheStatus = "idle";
  if (typeof animation.cacheMessage !== "string") animation.cacheMessage = "尚未预计算动画缓存";
  animation.referenceFrame = animation.referenceFrame === "trajectory-fixed" ? "trajectory-fixed" : "earth-fixed";
  if (!animation.objectKeys.length && animation.trackId && animation.stageId) {
    animation.objectKeys = [ballisticAnimationObjectKey(animation.trackId, animation.stageId)];
  }
  return animation;
}

function setBallisticAnimationReferenceFrame(referenceFrame) {
  const animation = ensureBallisticAnimationConfig();
  const next = referenceFrame === "trajectory-fixed" ? "trajectory-fixed" : "earth-fixed";
  if (animation.referenceFrame === next) return;
  animation.referenceFrame = next;
  ballisticAnimationLabelLayoutCache = null;
  ballisticAnimationLabelCaches.clear();
  globeParamsMemo = null;
  if (globeRendererState?.ballisticAnimationGpuLayer) globeRendererState.ballisticAnimationGpuLayer.signature = "";
  if (globeRendererState) globeRendererState.lastRenderSignature = "";
  renderTrajectoryPlan();
  scheduleDraw();
  requestBallisticAnimationDraw();
}

function ballisticAnimationCatalog() {
  const catalog = [];
  for (const candidateTrack of state.trajectoryTracks) {
    ensureTrajectoryBallistic(candidateTrack);
    const selected = selectedTrajectoryItems(candidateTrack);
    if (selected.length < 2) continue;
    const geometry = cachedTrajectoryGeometry(candidateTrack, selected);
    const path = geometry?.path;
    if (!path?.totalKm) continue;
    candidateTrack.ballistic.stages.forEach((candidateStage, stageIndex) => {
      const segment = buildBallisticStageSegment(candidateStage, selected, path, stageIndex, geometry.signature);
      const physics = segment?.physics;
      catalog.push({
        key: ballisticAnimationObjectKey(candidateTrack.id, candidateStage.id),
        track: candidateTrack,
        stage: candidateStage,
        segment,
        physics,
        pending: physics?.empiricalStatus === "pending",
        ready: Boolean(physics?.valid && physics.samples?.length > 1 && physics.empiricalStatus !== "pending"),
      });
    });
  }
  return catalog;
}

function normalizeBallisticAnimationSelection(catalog, preferredKey = "") {
  const animation = ensureBallisticAnimationConfig();
  const availableKeys = catalog.map((entry) => entry.key);
  animation.objectKeys = REENTRY_ANIMATION
    ? REENTRY_ANIMATION.normalizeSelection(animation.objectKeys, availableKeys, BALLISTIC_ANIMATION_MAX_OBJECTS)
    : animation.objectKeys.filter((key, index) => availableKeys.includes(key) && animation.objectKeys.indexOf(key) === index).slice(0, BALLISTIC_ANIMATION_MAX_OBJECTS);
  if (!animation.objectKeys.length && preferredKey && availableKeys.includes(preferredKey)) animation.objectKeys = [preferredKey];
  for (const key of animation.objectKeys) {
    const setting = animation.objectSettings[key] || {};
    animation.objectSettings[key] = {
      offsetSec: Math.max(0, Number(setting.offsetSec) || 0),
      labelEnabled: setting.labelEnabled !== false,
    };
  }
  if (!animation.objectKeys.includes(animation.focusKey)) animation.focusKey = animation.objectKeys[0] || "";
  const focused = catalog.find((entry) => entry.key === animation.focusKey);
  if (focused) {
    animation.trackId = focused.track.id;
    animation.stageId = focused.stage.id;
  }
  return animation.objectKeys.map((key) => catalog.find((entry) => entry.key === key)).filter(Boolean);
}

function invalidateBallisticAnimationSession(message = "参数发生变化，请重新预计算") {
  const animation = ensureBallisticAnimationConfig();
  animation.playing = false;
  animation.playbackStartedAt = 0;
  animation.playbackStartElapsedSec = animation.elapsedSec;
  animation.impactFlashStartedAtByKey = {};
  animation.cacheStatus = "dirty";
  animation.cacheMessage = message;
  ballisticAnimationSession = null;
  ballisticAnimationTrailCaches.clear();
  ballisticAnimationCompositeTrailCache = null;
  ballisticAnimationLabelLayoutCache = null;
  ballisticAnimationLabelCaches.clear();
  ballisticProfileSurfaceCache = null;
}

function prepareBallisticAnimationObject(candidate) {
  const existing = ballisticAnimationObjectCaches.get(candidate.key);
  if (existing?.physics === candidate.physics && existing.stageColor === candidate.stage.color && existing.stageName === candidate.stage.name) return existing;
  const samples = ballisticAnimationPreparedSamples(candidate.physics.samples, BALLISTIC_ANIMATION_PREPARED_MAX_SAMPLES, candidate.physics.reentry);
  const prepared = {
    key: candidate.key,
    physics: candidate.physics,
    segment: candidate.segment,
    stageColor: candidate.stage.color || "#ff5b61",
    stageName: candidate.stage.name,
    sampleTimes: Float64Array.from(samples, (sample) => Number(sample.elapsedSec) || 0),
    visuals: samples.map((sample) => ballisticAnimationVisual(sample, candidate.stage.color || "#ff5b61")),
    sampleCount: samples.length,
    samples,
  };
  ballisticAnimationObjectCaches.set(candidate.key, prepared);
  return prepared;
}

function ballisticAnimationPreparedSamples(samples, maximum = BALLISTIC_ANIMATION_PREPARED_MAX_SAMPLES, reentry = null) {
  if (!Array.isArray(samples) || !samples.length) return [];
  if (samples.length === 1) return samples;
  const firstTime = Number(samples[0].elapsedSec) || 0;
  const lastTime = Number(samples[samples.length - 1].elapsedSec) || firstTime;
  const durationSec = Math.max(0, lastTime - firstTime);
  const preservedTimes = new Set([firstTime, lastTime]);
  const preserveEvent = (event) => {
    const elapsedSec = Number(event?.elapsedSec);
    if (Number.isFinite(elapsedSec)) preservedTimes.add(clamp(elapsedSec, firstTime, lastTime));
  };
  for (const event of reentry?.interface120KmEvents || []) preserveEvent(event);
  for (const event of reentry?.interface70KmEvents || []) preserveEvent(event);
  for (const pass of reentry?.passes || []) {
    for (const event of [pass.entry, pass.minimumAltitude, pass.peakHeating, pass.peakDynamicPressure, pass.peakAerodynamicLoad, pass.exit]) {
      preserveEvent(event);
    }
  }
  for (const metric of ["altitudeM", "convectiveHeatFluxWm2", "dynamicPressurePa", "aerodynamicLoadG", "dragLoadG"]) {
    let best = 0;
    for (let index = 1; index < samples.length; index += 1) {
      if (Number(samples[index]?.[metric]) > Number(samples[best]?.[metric])) best = index;
    }
    for (const index of [best - 1, best, best + 1]) {
      if (index >= 0 && index < samples.length) preservedTimes.add(Number(samples[index].elapsedSec) || firstTime);
    }
  }
  const effectiveMaximum = Math.max(Math.trunc(maximum) || BALLISTIC_ANIMATION_PREPARED_MAX_SAMPLES, preservedTimes.size + 2);
  const uniformBudget = Math.max(2, effectiveMaximum - preservedTimes.size);
  const desiredUniformCount = Math.max(
    2,
    Math.ceil(durationSec / BALLISTIC_ANIMATION_PREPARED_STEP_SEC) + 1,
    Math.min(samples.length, uniformBudget),
  );
  const uniformCount = Math.min(uniformBudget, desiredUniformCount);
  for (let index = 0; index < uniformCount; index += 1) {
    preservedTimes.add(firstTime + durationSec * (index / Math.max(1, uniformCount - 1)));
  }
  return [...preservedTimes]
    .sort((a, b) => a - b)
    .map((elapsedSec) => ballisticSampleAtTime(samples, elapsedSec));
}

function ballisticAnimationSessionSignature(selected) {
  const animation = ensureBallisticAnimationConfig();
  return JSON.stringify([
    ballisticPhysicsRevision,
    ...selected.map((entry) => [
      entry.key,
      animation.objectSettings[entry.key]?.offsetSec || 0,
      animation.objectSettings[entry.key]?.labelEnabled !== false,
      entry.stage.name,
      entry.stage.color,
      entry.physics?.samples?.length || 0,
      entry.physics?.flightTimeSec || 0,
    ]),
  ]);
}

function prepareBallisticAnimationSession() {
  const animation = ensureBallisticAnimationConfig();
  const catalog = ballisticAnimationCatalog();
  const catalogKeys = new Set(catalog.map((entry) => entry.key));
  for (const key of ballisticAnimationObjectCaches.keys()) {
    if (!catalogKeys.has(key)) ballisticAnimationObjectCaches.delete(key);
  }
  const selected = normalizeBallisticAnimationSelection(catalog);
  if (!selected.length) {
    animation.cacheStatus = "error";
    animation.cacheMessage = "请至少选择 1 个可传播物体";
    ballisticAnimationSession = null;
    return null;
  }
  const pending = selected.filter((entry) => entry.pending);
  const invalid = selected.filter((entry) => !entry.pending && !entry.ready);
  if (pending.length || invalid.length) {
    animation.cacheStatus = pending.length ? "pending" : "error";
    animation.cacheMessage = pending.length
      ? `等待 ${pending.length} 个物体完成 NRLMSISE-00 传播计算`
      : `${invalid.length} 个物体尚未形成有效传播结果`;
    ballisticAnimationSession = null;
    return null;
  }
  const signature = ballisticAnimationSessionSignature(selected);
  if (ballisticAnimationSession?.signature === signature) return ballisticAnimationSession;
  const entries = selected.map((candidate, index) => {
    const setting = animation.objectSettings[candidate.key];
    return {
      ...candidate,
      index,
      offsetSec: Math.max(0, Number(setting?.offsetSec) || 0),
      labelEnabled: setting?.labelEnabled !== false,
      prepared: prepareBallisticAnimationObject(candidate),
      durationSec: Math.max(0, Number(candidate.physics.flightTimeSec) || 0),
      interface70Sec: Number(candidate.physics.reentry?.interface70Km?.elapsedSec),
    };
  });
  const durationSec = REENTRY_ANIMATION
    ? REENTRY_ANIMATION.timelineDuration(entries)
    : Math.max(...entries.map((entry) => entry.offsetSec + entry.durationSec));
  ballisticAnimationSession = {
    signature,
    entries,
    durationSec,
    preparedAt: Date.now(),
    sampleCount: entries.reduce((sum, entry) => sum + entry.prepared.sampleCount, 0),
    propagationRunsAtPrepare: ballisticPerformanceStats.propagationRuns,
    empiricalRequestsAtPrepare: ballisticPerformanceStats.empiricalRequests,
  };
  animation.cacheStatus = "ready";
  animation.cacheMessage = `缓存就绪 · ${entries.length} 个物体 · ${ballisticAnimationSession.sampleCount} 个传播样本`;
  return ballisticAnimationSession;
}

function renderReentryAnimationControls(track, segment, stage) {
  const animation = ensureBallisticAnimationConfig();
  const catalog = ballisticAnimationCatalog();
  const currentKey = ballisticAnimationObjectKey(track.id, stage.id);
  const selected = normalizeBallisticAnimationSelection(catalog, segment?.physics?.valid ? currentKey : "");
  const selectedKeys = new Set(selected.map((entry) => entry.key));
  const atLimit = selected.length >= BALLISTIC_ANIMATION_MAX_OBJECTS;
  const focus = selected.find((entry) => entry.key === animation.focusKey) || selected[0] || null;
  const focusSetting = focus ? animation.objectSettings[focus.key] : null;
  const focusState = focus && REENTRY_ANIMATION
    ? REENTRY_ANIMATION.objectTimelineState(animation.elapsedSec, focusSetting?.offsetSec, focus.physics?.flightTimeSec)
    : { phase: "waiting", elapsedSec: 0 };
  const focusSample = focus?.ready ? ballisticSampleAtTime(focus.physics.samples, focusState.elapsedSec) : null;
  const focusReentry = focus?.physics?.reentry;
  const durationSec = ballisticAnimationSession?.signature === ballisticAnimationSessionSignature(selected)
    ? ballisticAnimationSession.durationSec
    : Math.max(0, ...selected.map((entry) => (animation.objectSettings[entry.key]?.offsetSec || 0) + (entry.physics?.flightTimeSec || 0)));
  const readyCount = selected.filter((entry) => entry.ready).length;
  const canPrepare = selected.length > 0 && readyCount === selected.length;
  const canAnimate = canPrepare && durationSec > 0;
  const objectOptions = catalog.length
    ? catalog.map((entry) => {
        const checked = selectedKeys.has(entry.key);
        const status = entry.pending ? "计算中" : entry.ready ? `${Math.round(entry.physics.flightTimeSec)} s` : "未就绪";
        return `<label class="ballistic-animation-object-option ${checked ? "selected" : ""} ${entry.ready ? "" : "unavailable"}">
          <input data-ballistic-animation-object="${escapeHtml(entry.key)}" type="checkbox" ${checked ? "checked" : ""} ${(!checked && atLimit) || (!entry.ready && !entry.pending) ? "disabled" : ""} />
          <i style="--stage-color:${escapeHtml(entry.stage.color)}"></i>
          <span><strong>${escapeHtml(entry.stage.name)}</strong><small>${escapeHtml(entry.track.name)} · ${escapeHtml(status)}</small></span>
        </label>`;
      }).join("")
    : `<p class="control-note">请先建立具有独立分离点的级段弹道。</p>`;
  const selectedRows = selected.map((entry, index) => {
    const setting = animation.objectSettings[entry.key];
    const focused = entry.key === animation.focusKey;
    const initialState = REENTRY_ANIMATION
      ? REENTRY_ANIMATION.objectTimelineState(animation.elapsedSec, setting.offsetSec, entry.physics?.flightTimeSec || 0)
      : { phase: "waiting", elapsedSec: 0 };
    const sample = entry.ready ? ballisticSampleAtTime(entry.physics.samples, initialState.elapsedSec) : null;
    return `<div class="ballistic-animation-object-row ${focused ? "focused" : ""}" data-ballistic-animation-object-row="${index}">
      <button class="ballistic-object-focus" data-ballistic-animation-focus="${escapeHtml(entry.key)}" type="button" title="设为主观察对象" aria-label="设为主观察对象 ${escapeHtml(entry.stage.name)}"><i style="--stage-color:${escapeHtml(entry.stage.color)}"></i><b>${index + 1}</b></button>
      <div class="ballistic-object-name"><strong>${escapeHtml(entry.stage.name)}</strong><small data-ballistic-object-state>${escapeHtml(ballisticAnimationPhaseLabel(initialState.phase, sample))}</small></div>
      <label class="ballistic-object-delay"><span>分离 T+</span><input data-ballistic-animation-offset="${escapeHtml(entry.key)}" type="number" min="0" max="86400" step="0.1" value="${Number(setting.offsetSec).toFixed(1)}" aria-label="${escapeHtml(entry.stage.name)} 分离开始时间差（秒）" /><em>s</em></label>
      <div class="ballistic-object-toggles">
        <label class="ballistic-object-label-toggle"><input data-ballistic-animation-object-label="${escapeHtml(entry.key)}" type="checkbox" ${setting.labelEnabled !== false ? "checked" : ""} /><span>标签</span></label>
        <label class="ballistic-object-label-toggle"><input data-ballistic-animation-object-flash="${escapeHtml(entry.key)}" type="checkbox" ${entry.stage.impactFlashEnabled !== false ? "checked" : ""} /><span>闪光</span></label>
      </div>
      <div class="ballistic-object-metrics"><span><small>本地时间</small><strong data-ballistic-object-time>${formatDurationSeconds(initialState.elapsedSec)}</strong></span><span><small>高度</small><strong data-ballistic-object-altitude>${formatKm((sample?.altitudeM || 0) / 1000)}</strong></span><span><small>空速</small><strong data-ballistic-object-speed>${formatMps(sample?.airRelativeSpeedMps ?? sample?.groundRelativeSpeedMps)}</strong></span><span><small>热流</small><strong data-ballistic-object-heat>${formatHeatFlux(sample?.convectiveHeatFluxWm2)}</strong></span></div>
    </div>`;
  }).join("");
  const cacheClass = animation.cacheStatus === "ready" ? "ready" : animation.cacheStatus === "pending" ? "pending" : animation.cacheStatus === "error" ? "error" : "";
  return `
    <div class="ballistic-reentry-panel multi ${animation.playing ? "active" : ""}">
      <div class="ballistic-title secondary">
        <strong>多物体大气再入动画</strong>
        <span>${selected.length}/${BALLISTIC_ANIMATION_MAX_OBJECTS}</span>
      </div>
      <div class="ballistic-animation-object-picker">${objectOptions}</div>
      <div class="ballistic-animation-selected">${selectedRows || `<p class="control-note">选择 1 至 ${BALLISTIC_ANIMATION_MAX_OBJECTS} 个物体加入时间轴。</p>`}</div>
      <div class="ballistic-animation-reference">
        <span>动画参考系</span>
        <div class="ballistic-reference-row" role="group" aria-label="弹道动画参考系">
          <button class="${animation.referenceFrame === "earth-fixed" ? "active" : ""}" data-ballistic-reference="earth-fixed" type="button" aria-pressed="${animation.referenceFrame === "earth-fixed"}">地球不动</button>
          <button class="${animation.referenceFrame === "trajectory-fixed" ? "active" : ""}" data-ballistic-reference="trajectory-fixed" type="button" aria-pressed="${animation.referenceFrame === "trajectory-fixed"}">弹道不动</button>
        </div>
        <small>${animation.referenceFrame === "trajectory-fixed" ? "弹道保持惯性空间方向，地球在其下方自转。" : "地球保持固定，弹道按地固坐标运动。"}</small>
      </div>
      <div class="ballistic-animation-align" role="group" aria-label="动画事件对齐">
        <button data-ballistic-animation-align="separation" type="button">分离对齐</button>
        <button data-ballistic-animation-align="interface70" type="button">70 km 对齐</button>
        <button data-ballistic-animation-align="impact" type="button">落地对齐</button>
      </div>
      <div class="ballistic-animation-cache ${cacheClass}"><span data-ballistic-animation-cache-status>${escapeHtml(animation.cacheMessage)}</span><button data-ballistic-animation-prepare type="button" ${canPrepare ? "" : "disabled"}>预计算缓存</button></div>
      <div class="ballistic-animation-toolbar">
        <button data-ballistic-animation-play type="button" title="${animation.playing ? "暂停动画" : "播放动画"}" aria-label="${animation.playing ? "暂停动画" : "播放动画"}" ${canAnimate ? "" : "disabled"}>${animation.playing ? "Ⅱ" : "▶"}</button>
        <button data-ballistic-animation-reset type="button" title="回到编队时间轴起点" aria-label="回到编队时间轴起点" ${selected.length ? "" : "disabled"}>↺</button>
        <label><span>速度</span><select data-ballistic-animation-speed><option value="1" ${animation.speed === 1 ? "selected" : ""}>1×</option><option value="5" ${animation.speed === 5 ? "selected" : ""}>5×</option><option value="10" ${animation.speed === 10 ? "selected" : ""}>10×</option><option value="25" ${animation.speed === 25 ? "selected" : ""}>25×</option><option value="50" ${animation.speed === 50 ? "selected" : ""}>50×</option><option value="100" ${animation.speed === 100 ? "selected" : ""}>100×</option><option value="200" ${animation.speed === 200 ? "selected" : ""}>200×</option></select></label>
      </div>
      <input class="ballistic-animation-timeline" data-ballistic-animation-time type="range" min="0" max="${Math.max(1, durationSec)}" step="0.1" value="${clamp(animation.elapsedSec, 0, Math.max(1, durationSec))}" ${selected.length ? "" : "disabled"} aria-label="多物体再入动画时间轴" />
      <div class="ballistic-animation-clock"><span data-ballistic-animation-clock>${formatDurationSeconds(animation.elapsedSec)}</span><span data-ballistic-animation-duration>${formatDurationSeconds(durationSec)}</span></div>
      <div class="ballistic-profile-wrap"><canvas class="ballistic-profile-canvas" data-ballistic-profile aria-label="主观察对象弹道高度剖面"></canvas><span>${escapeHtml(focus?.stage?.name || "主观察对象")}高度剖面</span><em>地表里程</em></div>
      ${focusReentry?.aerodynamicOnset ? `<div class="ballistic-event-strip"><span>主观察：${escapeHtml(focus.stage.name)}</span><span>70 km ${formatDurationSeconds(focusReentry.interface70Km?.elapsedSec)}</span><span>峰值热流 ${formatHeatFlux(focusReentry.peakHeating?.convectiveHeatFluxWm2)}</span><span>峰值动压 ${formatPressure(focusReentry.peakDynamicPressure?.dynamicPressurePa)}</span></div>` : ""}
    </div>
  `;
}

function ballisticAnimationPhaseLabel(phase, sample) {
  if (phase === "waiting") return "等待进入时间轴";
  if (phase === "complete") return sample?.altitudeM <= 1 ? "已落地" : "传播结束";
  return reentryPhaseLabel(sample?.reentryPhase);
}

function bindBallisticControlEvents() {
  const root = els.trajectoryPlanList;
  root.querySelector("[data-ballistic-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.enabled = Boolean(event.target.checked);
    if (track.ballistic.enabled && !track.ballistic.stages.length) addBallisticStage(track);
    renderTrajectoryPlan();
    renderLegend();
    updateTrajectoryCount();
    draw();
  });
  root.querySelector("[data-ballistic-labels-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.showLabels = Boolean(event.target.checked);
    draw();
  });
  root.querySelector("[data-ballistic-powered-path-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.showPoweredPath = Boolean(event.target.checked);
    if (!track.ballistic.showPoweredPath) {
      state.ballisticPoweredStartPickTrackId = "";
      state.ballisticPoweredStartPickMessage = "";
      els.canvas?.classList.remove("ballistic-pick-mode");
    }
    renderTrajectoryPlan();
    draw();
  });
  root.querySelector("[data-ballistic-powered-vertical-launch-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.poweredVerticalLaunch = Boolean(event.target.checked);
    draw();
  });
  root.querySelector("[data-ballistic-powered-path-color]")?.addEventListener("input", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.poweredPathColor = /^#[0-9a-f]{6}$/i.test(event.target.value) ? event.target.value : track.ballistic.poweredPathColor;
    draw();
  });
  root.querySelector("[data-ballistic-powered-path-width]")?.addEventListener("input", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.poweredPathWidth = finiteOrClamp(event.target.value, 4, 1, 12);
    const output = event.target.parentElement?.querySelector("output");
    if (output) output.textContent = `${track.ballistic.poweredPathWidth.toFixed(1)} px`;
    draw();
  });
  root.querySelector("[data-ballistic-stage-color]")?.addEventListener("input", (event) => {
    const stage = activeBallisticStage();
    if (!stage) return;
    stage.color = /^#[0-9a-f]{6}$/i.test(event.target.value) ? event.target.value : stage.color;
    draw();
  });
  root.querySelector("[data-ballistic-stage-color]")?.addEventListener("change", () => renderTrajectoryPlan());
  root.querySelector("[data-ballistic-stage-line-width]")?.addEventListener("input", (event) => {
    const stage = activeBallisticStage();
    if (!stage) return;
    stage.lineWidth = finiteOrClamp(
      event.target.value,
      BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
      BALLISTIC_STAGE_LINE_WIDTH_MIN,
      BALLISTIC_STAGE_LINE_WIDTH_MAX,
    );
    const output = event.target.parentElement?.querySelector("output");
    if (output) output.textContent = `${stage.lineWidth.toFixed(1)} px`;
    draw();
  });
  root.querySelector("[data-ballistic-powered-start-pick]")?.addEventListener("click", () => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    state.ballisticPoweredStartPickTrackId = state.ballisticPoweredStartPickTrackId === track.id ? "" : track.id;
    state.ballisticPickStageId = "";
    state.ballisticTargetPickStageId = "";
    state.ballisticPickMessage = "";
    state.ballisticTargetPickMessage = "";
    state.ballisticPoweredStartPickMessage = state.ballisticPoweredStartPickTrackId
      ? "起点拾取已开启：点击地图或地球表面确定海拔 0 米的主动段起点。"
      : "";
    els.canvas?.classList.toggle("ballistic-pick-mode", Boolean(state.ballisticPoweredStartPickTrackId));
    renderTrajectoryPlan();
  });
  root.querySelector("[data-ballistic-powered-start-clear]")?.addEventListener("click", () => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.poweredStartLon = null;
    track.ballistic.poweredStartLat = null;
    state.ballisticPoweredStartPickTrackId = "";
    state.ballisticPoweredStartPickMessage = "";
    els.canvas?.classList.remove("ballistic-pick-mode");
    renderTrajectoryPlan();
    draw();
  });
  const updatePoweredStartCoordinate = () => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    const latControl = root.querySelector("[data-ballistic-powered-start-lat]");
    const lonControl = root.querySelector("[data-ballistic-powered-start-lon]");
    const latText = String(latControl?.value ?? "").trim();
    const lonText = String(lonControl?.value ?? "").trim();
    const lat = latText ? Number(latText) : Number.NaN;
    const lon = lonText ? Number(lonText) : Number.NaN;
    track.ballistic.poweredStartLat = Number.isFinite(lat) ? clamp(lat, -90, 90) : null;
    track.ballistic.poweredStartLon = Number.isFinite(lon) ? normalizeLon(lon) : null;
    state.ballisticPoweredStartPickMessage = Number.isFinite(track.ballistic.poweredStartLat) && Number.isFinite(track.ballistic.poweredStartLon)
      ? "主动段地表起点已更新。"
      : "请输入完整的纬度和经度。";
    draw();
  };
  root.querySelector("[data-ballistic-powered-start-lat]")?.addEventListener("input", updatePoweredStartCoordinate);
  root.querySelector("[data-ballistic-powered-start-lon]")?.addEventListener("input", updatePoweredStartCoordinate);
  root.querySelector("[data-ballistic-powered-start-lat]")?.addEventListener("change", () => {
    updatePoweredStartCoordinate();
    renderTrajectoryPlan();
  });
  root.querySelector("[data-ballistic-powered-start-lon]")?.addEventListener("change", () => {
    updatePoweredStartCoordinate();
    renderTrajectoryPlan();
  });
  root.querySelector("[data-ballistic-animation-labels-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.showAnimationLabels = Boolean(event.target.checked);
    requestBallisticAnimationDraw();
  });
  root.querySelector("[data-ballistic-range-toggle]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.showGroundRange = Boolean(event.target.checked);
    draw();
  });
  root.querySelector("[data-ballistic-impact-flash-toggle]")?.addEventListener("change", (event) => {
    const stage = activeBallisticStage();
    if (!stage) return;
    stage.impactFlashEnabled = Boolean(event.target.checked);
    if (!stage.impactFlashEnabled) {
      const key = ballisticAnimationObjectKey(activeTrajectory().id, stage.id);
      delete ensureBallisticAnimationConfig().impactFlashStartedAtByKey[key];
    }
    requestBallisticAnimationDraw();
  });
  root.querySelector("[data-ballistic-stage-select]")?.addEventListener("change", (event) => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    track.ballistic.activeStageId = event.target.value || "";
    pauseBallisticAnimation();
    state.ballisticPickMessage = "";
    state.ballisticTargetPickStageId = "";
    state.ballisticTargetPickMessage = "";
    renderTrajectoryPlan();
    draw();
  });
  root.querySelectorAll("[data-ballistic-stage-card]").forEach((button) => {
    button.addEventListener("click", () => {
      const track = activeTrajectory();
      ensureTrajectoryBallistic(track);
      track.ballistic.activeStageId = button.dataset.ballisticStageCard || "";
      pauseBallisticAnimation();
      state.ballisticPickMessage = "";
      state.ballisticTargetPickStageId = "";
      state.ballisticTargetPickMessage = "";
      renderTrajectoryPlan();
      draw();
    });
  });
  root.querySelector("[data-ballistic-add-stage]")?.addEventListener("click", () => {
    const track = activeTrajectory();
    const stage = addBallisticStage(track);
    if (!stage) {
      state.ballisticPickMessage = `最多添加 ${BALLISTIC_ANIMATION_MAX_OBJECTS} 个分离物体。`;
      renderTrajectoryPlan();
      return;
    }
    track.ballistic.enabled = true;
    state.ballisticPickMessage = "请先选择“吸附主动段”或“自由坐标”，再设置该级真实分离点。";
    renderTrajectoryPlan();
    renderLegend();
    updateTrajectoryCount();
    draw();
  });
  root.querySelector("[data-ballistic-delete-stage]")?.addEventListener("click", () => {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    const activeId = track.ballistic.activeStageId;
    if (state.ballisticPickStageId === activeId) state.ballisticPickStageId = "";
    if (state.ballisticTargetPickStageId === activeId) state.ballisticTargetPickStageId = "";
    const deletedAnimationKey = ballisticAnimationObjectKey(track.id, activeId);
    const animation = ensureBallisticAnimationConfig();
    if (animation.objectKeys.includes(deletedAnimationKey)) {
      animation.objectKeys = animation.objectKeys.filter((key) => key !== deletedAnimationKey);
      delete animation.objectSettings[deletedAnimationKey];
      if (animation.focusKey === deletedAnimationKey) animation.focusKey = animation.objectKeys[0] || "";
      invalidateBallisticAnimationSession("动画物体已删除，需要重新预计算");
    }
    track.ballistic.stages = track.ballistic.stages.filter((stage) => stage.id !== activeId);
    track.ballistic.activeStageId = track.ballistic.stages[0]?.id || "";
    state.ballisticPickMessage = "";
    renderTrajectoryPlan();
    renderLegend();
    updateTrajectoryCount();
    draw();
  });
  root.querySelectorAll("[data-ballistic-position-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = activeBallisticStage();
      if (!stage) return;
      stage.positionMode = button.dataset.ballisticPositionMode === "free" ? "free" : "track";
      state.ballisticPickMessage = stage.positionMode === "track"
        ? "点击主动段星下点线，分离点会吸附到线上的最近位置。"
        : "点击地图任意位置设置独立分离坐标。";
      renderTrajectoryPlan();
    });
  });
  root.querySelector("[data-ballistic-pick-point]")?.addEventListener("click", () => {
    const stage = activeBallisticStage();
    if (!stage) return;
    state.ballisticPickStageId = state.ballisticPickStageId === stage.id ? "" : stage.id;
    state.ballisticTargetPickStageId = "";
    state.ballisticPoweredStartPickTrackId = "";
    state.ballisticPoweredStartPickMessage = "";
    state.ballisticTargetPickMessage = "";
    state.ballisticPickMessage = state.ballisticPickStageId
      ? stage.positionMode === "free"
        ? "自由拾取已开启：点击地图设置分离点。"
        : "主动段吸附已开启：请点击星下点线附近。"
      : "";
    els.canvas?.classList.toggle("ballistic-pick-mode", Boolean(state.ballisticPickStageId));
    renderTrajectoryPlan();
  });
  root.querySelector("[data-ballistic-pick-target]")?.addEventListener("click", () => {
    const stage = activeBallisticStage();
    if (!stage) return;
    state.ballisticTargetPickStageId = state.ballisticTargetPickStageId === stage.id ? "" : stage.id;
    state.ballisticPickStageId = "";
    state.ballisticPoweredStartPickTrackId = "";
    state.ballisticPoweredStartPickMessage = "";
    state.ballisticPickMessage = "";
    state.ballisticTargetPickMessage = state.ballisticTargetPickStageId
      ? "落点拾取已开启：点击地图或地球表面确定目标。"
      : "";
    els.canvas?.classList.toggle("ballistic-pick-mode", Boolean(state.ballisticTargetPickStageId));
    renderTrajectoryPlan();
  });
  root.querySelector("[data-ballistic-clear-target]")?.addEventListener("click", () => {
    const stage = activeBallisticStage();
    if (!stage) return;
    stage.targetLat = null;
    stage.targetLon = null;
    stage.targetLabel = "";
    stage.inverseState = null;
    if (state.ballisticTargetPickStageId === stage.id) state.ballisticTargetPickStageId = "";
    state.ballisticTargetPickMessage = "";
    renderTrajectoryPlan();
    draw();
  });
  root.querySelector("[data-ballistic-solve-target]")?.addEventListener("click", solveActiveBallisticTarget);
  root.querySelector("[data-ballistic-max-range]")?.addEventListener("click", optimizeActiveBallisticRange);
  root.querySelector("[data-ballistic-clear-point]")?.addEventListener("click", () => {
    const stage = activeBallisticStage();
    if (!stage) return;
    stage.burnoutLat = null;
    stage.burnoutLon = null;
    stage.burnoutLabel = "";
    stage.burnoutPathKm = null;
    stage.burnoutPathFraction = null;
    stage.burnoutPointId = "";
    stage.legacyBurnoutPct = null;
    stage.maxRangeState = null;
    if (state.ballisticPickStageId === stage.id) state.ballisticPickStageId = "";
    state.ballisticPickMessage = "";
    els.canvas?.classList.remove("ballistic-pick-mode");
    renderTrajectoryPlan();
    draw();
  });
  root.querySelectorAll("[data-ballistic-stage-field]").forEach((control) => {
    if (control.type === "number") {
      control.addEventListener("input", () => updateActiveBallisticStageField(control, false));
      control.addEventListener("change", () => updateActiveBallisticStageField(control, true));
    } else {
      control.addEventListener("change", () => updateActiveBallisticStageField(control, true));
    }
  });
  root.querySelectorAll("[data-ballistic-animation-object]").forEach((control) => {
    control.addEventListener("change", () => {
      const animation = ensureBallisticAnimationConfig();
      const key = control.dataset.ballisticAnimationObject;
      if (control.checked) {
        if (!animation.objectKeys.includes(key) && animation.objectKeys.length < BALLISTIC_ANIMATION_MAX_OBJECTS) animation.objectKeys.push(key);
        if (!animation.objectSettings[key]) animation.objectSettings[key] = { offsetSec: 0, labelEnabled: true };
        if (!animation.focusKey) animation.focusKey = key;
      } else {
        animation.objectKeys = animation.objectKeys.filter((candidate) => candidate !== key);
        if (animation.focusKey === key) animation.focusKey = animation.objectKeys[0] || "";
      }
      animation.elapsedSec = 0;
      invalidateBallisticAnimationSession("对象选择发生变化，请重新预计算");
      renderTrajectoryPlan();
      requestBallisticAnimationDraw();
    });
  });
  const commitAnimationOffset = (control) => {
    const animation = ensureBallisticAnimationConfig();
    const key = control.dataset.ballisticAnimationOffset;
    if (!key) return false;
    const setting = animation.objectSettings[key] || { labelEnabled: true };
    const previousOffset = Math.max(0, Number(setting.offsetSec) || 0);
    const nextOffset = control.value.trim() === ""
      ? previousOffset
      : finiteOrClamp(control.value, previousOffset, 0, 86400);
    setting.offsetSec = nextOffset;
    animation.objectSettings[key] = setting;
    return true;
  };
  root.querySelectorAll("[data-ballistic-animation-offset]").forEach((control) => {
    const updateOffset = () => {
      const animation = ensureBallisticAnimationConfig();
      commitAnimationOffset(control);
      animation.elapsedSec = 0;
      invalidateBallisticAnimationSession("分离开始时间差发生变化，请重新预计算");
      const status = root.querySelector("[data-ballistic-animation-cache-status]");
      if (status) status.textContent = animation.cacheMessage;
      requestBallisticAnimationDraw();
    };
    control.addEventListener("input", updateOffset);
    control.addEventListener("change", () => {
      updateOffset();
      renderTrajectoryPlan();
    });
  });
  root.querySelectorAll("[data-ballistic-animation-object-label]").forEach((control) => {
    control.addEventListener("change", () => {
      const animation = ensureBallisticAnimationConfig();
      const key = control.dataset.ballisticAnimationObjectLabel;
      const setting = animation.objectSettings[key] || { offsetSec: 0 };
      setting.labelEnabled = Boolean(control.checked);
      animation.objectSettings[key] = setting;
      invalidateBallisticAnimationSession("标签显示发生变化，请重新预计算");
      prepareBallisticAnimationSession();
      renderTrajectoryPlan();
      requestBallisticAnimationDraw();
    });
  });
  root.querySelectorAll("[data-ballistic-animation-object-flash]").forEach((control) => {
    control.addEventListener("change", () => {
      const key = control.dataset.ballisticAnimationObjectFlash;
      const entry = ballisticAnimationCatalog().find((candidate) => candidate.key === key);
      if (!entry) return;
      entry.stage.impactFlashEnabled = Boolean(control.checked);
      if (!entry.stage.impactFlashEnabled) delete ensureBallisticAnimationConfig().impactFlashStartedAtByKey[key];
      renderTrajectoryPlan();
      requestBallisticAnimationDraw();
    });
  });
  root.querySelectorAll("[data-ballistic-animation-focus]").forEach((button) => {
    button.addEventListener("click", () => {
      const animation = ensureBallisticAnimationConfig();
      animation.focusKey = button.dataset.ballisticAnimationFocus || animation.objectKeys[0] || "";
      const catalog = ballisticAnimationCatalog();
      const focused = catalog.find((entry) => entry.key === animation.focusKey);
      if (focused) {
        animation.trackId = focused.track.id;
        animation.stageId = focused.stage.id;
      }
      ballisticProfileSurfaceCache = null;
      renderTrajectoryPlan();
      requestBallisticAnimationDraw();
    });
  });
  root.querySelectorAll("[data-ballistic-animation-align]").forEach((button) => {
    button.addEventListener("click", () => {
      const animation = ensureBallisticAnimationConfig();
      const catalog = ballisticAnimationCatalog();
      const selected = normalizeBallisticAnimationSelection(catalog);
      const offsets = REENTRY_ANIMATION?.alignedOffsets(selected.map((entry) => ({
        key: entry.key,
        offsetSec: animation.objectSettings[entry.key]?.offsetSec || 0,
        durationSec: entry.physics?.flightTimeSec || 0,
        interface70Sec: entry.physics?.reentry?.interface70Km?.elapsedSec,
      })), button.dataset.ballisticAnimationAlign) || {};
      for (const [key, offsetSec] of Object.entries(offsets)) {
        const setting = animation.objectSettings[key] || { labelEnabled: true };
        setting.offsetSec = offsetSec;
        animation.objectSettings[key] = setting;
      }
      animation.elapsedSec = 0;
      invalidateBallisticAnimationSession("事件对齐发生变化，请重新预计算");
      renderTrajectoryPlan();
      requestBallisticAnimationDraw();
    });
  });
  root.querySelectorAll("[data-ballistic-reference]").forEach((button) => {
    button.addEventListener("click", () => setBallisticAnimationReferenceFrame(button.dataset.ballisticReference));
  });
  root.querySelector("[data-ballistic-animation-prepare]")?.addEventListener("click", () => {
    root.querySelectorAll("[data-ballistic-animation-offset]").forEach((control) => commitAnimationOffset(control));
    pauseBallisticAnimation();
    const session = prepareBallisticAnimationSession();
    if (session) prepareBallisticAnimationViewCaches(session);
    renderTrajectoryPlan();
    requestBallisticAnimationDraw();
  });
  root.querySelector("[data-ballistic-animation-play]")?.addEventListener("click", () => {
    const animation = ensureBallisticAnimationConfig();
    if (animation.playing) {
      pauseBallisticAnimation();
      renderTrajectoryPlan();
      return;
    }
    const session = prepareBallisticAnimationSession();
    if (!session) {
      renderTrajectoryPlan();
      return;
    }
    prepareBallisticAnimationViewCaches(session);
    if (animation.elapsedSec >= session.durationSec - 0.05) animation.elapsedSec = 0;
    animation.playing = true;
    animation.playbackStartedAt = 0;
    animation.playbackStartElapsedSec = animation.elapsedSec;
    animation.impactFlashStartedAtByKey = {};
    ballisticAnimationLastDomUpdateAt = 0;
    resetBallisticAnimationPerformanceClock();
    renderTrajectoryPlan();
    requestBallisticAnimationDraw();
    if (animation.playing) startBallisticAnimationLoop();
  });
  root.querySelector("[data-ballistic-animation-reset]")?.addEventListener("click", () => {
    const animation = ensureBallisticAnimationConfig();
    animation.elapsedSec = 0;
    animation.playing = false;
    animation.playbackStartedAt = 0;
    animation.playbackStartElapsedSec = 0;
    animation.impactFlashStartedAtByKey = {};
    ballisticAnimationLastDomUpdateAt = 0;
    resetBallisticAnimationPerformanceClock();
    ballisticAnimationTrailCaches.clear();
    ballisticAnimationCompositeTrailCache = null;
    ballisticAnimationLabelLayoutCache = null;
    renderTrajectoryPlan();
    requestBallisticAnimationDraw();
  });
  root.querySelector("[data-ballistic-animation-speed]")?.addEventListener("change", (event) => {
    const animation = state.ballisticAnimation;
    animation.playbackStartedAt = 0;
    animation.playbackStartElapsedSec = animation.elapsedSec;
    animation.speed = finiteOrClamp(event.target.value, 10, 1, 50);
  });
  root.querySelector("[data-ballistic-animation-time]")?.addEventListener("input", (event) => {
    const animation = ensureBallisticAnimationConfig();
    animation.elapsedSec = Math.max(0, Number(event.target.value) || 0);
    animation.playing = false;
    animation.playbackStartedAt = 0;
    animation.playbackStartElapsedSec = animation.elapsedSec;
    animation.impactFlashStartedAtByKey = {};
    ballisticAnimationLastDomUpdateAt = 0;
    updateBallisticAnimationDom();
    requestBallisticAnimationDraw();
  });
}

function activeBallisticStage(track = activeTrajectory()) {
  ensureTrajectoryBallistic(track);
  return track.ballistic.stages.find((stage) => stage.id === track.ballistic.activeStageId) || track.ballistic.stages[0] || null;
}

function addBallisticStage(track) {
  ensureTrajectoryBallistic(track);
  if (track.ballistic.stages.length >= BALLISTIC_ANIMATION_MAX_OBJECTS) return null;
  const stage = createBallisticStageModel();
  track.ballistic.stages.push(stage);
  track.ballistic.activeStageId = stage.id;
  return stage;
}

function resolveBallisticBurnout(stage, selected = []) {
  if (!stage) return null;
  if (
    stage.burnoutLon !== null &&
    stage.burnoutLon !== "" &&
    stage.burnoutLat !== null &&
    stage.burnoutLat !== "" &&
    Number.isFinite(Number(stage.burnoutLon)) &&
    Number.isFinite(Number(stage.burnoutLat))
  ) {
    return {
      lon: normalizeLon(Number(stage.burnoutLon)),
      lat: clamp(Number(stage.burnoutLat), -90, 90),
      label: stage.burnoutLabel || "独立分离点",
    };
  }
  const legacySelection = stage.burnoutPointId ? selected.find(({ point }) => point.id === stage.burnoutPointId) : null;
  if (legacySelection?.target) {
    stage.burnoutLon = normalizeLon(legacySelection.target.lon);
    stage.burnoutLat = clamp(legacySelection.target.lat, -90, 90);
    stage.burnoutLabel = `${trajectoryPointLabel(legacySelection.point, legacySelection.item)}（旧数据迁移）`;
    return { lon: stage.burnoutLon, lat: stage.burnoutLat, label: stage.burnoutLabel };
  }
  if (Number.isFinite(stage.legacyBurnoutPct)) {
    const index = Math.round((clamp(stage.legacyBurnoutPct, 0, 100) / 100) * (selected.length - 1));
    const legacy = selected[index];
    if (legacy?.target) {
      stage.burnoutLon = normalizeLon(legacy.target.lon);
      stage.burnoutLat = clamp(legacy.target.lat, -90, 90);
      stage.burnoutLabel = `${trajectoryPointLabel(legacy.point, legacy.item)}（旧比例迁移）`;
      return { lon: stage.burnoutLon, lat: stage.burnoutLat, label: stage.burnoutLabel };
    }
  }
  return null;
}

function updateActiveBallisticStageField(control, rerender = true) {
  const track = activeTrajectory();
  const stage = activeBallisticStage(track);
  if (!stage) return;
  const field = control.dataset.ballisticStageField;
  if (field === "name") stage.name = control.value.trim() || stage.name;
  else if (field === "color") stage.color = control.value || stage.color;
  else if (field === "burnoutLat") {
    stage.burnoutLat = control.value.trim() === "" ? null : finiteOrClamp(control.value, stage.burnoutLat, -90, 90);
    stage.burnoutLabel = "手工输入分离点";
    stage.positionMode = "free";
    stage.burnoutPathKm = null;
    stage.burnoutPathFraction = null;
    stage.burnoutPointId = "";
  } else if (field === "burnoutLon") {
    stage.burnoutLon = control.value.trim() === "" ? null : finiteOrClamp(control.value, stage.burnoutLon, -180, 180);
    stage.burnoutLabel = "手工输入分离点";
    stage.positionMode = "free";
    stage.burnoutPathKm = null;
    stage.burnoutPathFraction = null;
    stage.burnoutPointId = "";
  }
  else if (field === "initialSpeedMps") stage.initialSpeedMps = finiteOrClamp(control.value, stage.initialSpeedMps, 1, 20000);
  else if (field === "flightPathAngleDeg") stage.flightPathAngleDeg = finiteOrClamp(control.value, stage.flightPathAngleDeg, -89, 89);
  else if (field === "burnoutAltitudeKm") stage.burnoutAltitudeKm = finiteOrClamp(control.value, stage.burnoutAltitudeKm, 0, 5000);
  else if (field === "headingMode") stage.headingMode = control.value === "manual" ? "manual" : "track";
  else if (field === "manualHeadingDeg") stage.manualHeadingDeg = normalizeBearing(finiteOrClamp(control.value, stage.manualHeadingDeg, 0, 360));
  else if (field === "headingOffsetDeg") stage.headingOffsetDeg = finiteOrClamp(control.value, stage.headingOffsetDeg, -180, 180);
  else if (field === "dragEnabled") stage.dragEnabled = Boolean(control.checked);
  else if (field === "atmosphereModel") stage.atmosphereModel = control.value === "standard1976" ? "standard1976" : "nrlmsise00";
  else if (field === "atmosphereEpochUtc") {
    const parsed = Date.parse(`${control.value}:00Z`);
    if (Number.isFinite(parsed)) stage.atmosphereEpochUtc = new Date(parsed).toISOString();
  }
  else if (field === "f107Daily") stage.f107Daily = finiteOrClamp(control.value, stage.f107Daily, 50, 400);
  else if (field === "f107Average") stage.f107Average = finiteOrClamp(control.value, stage.f107Average, 50, 400);
  else if (field === "ap") stage.ap = finiteOrClamp(control.value, stage.ap, 0, 400);
  else if (field === "targetLat") {
    stage.targetLat = control.value.trim() === "" ? null : finiteOrClamp(control.value, stage.targetLat, -90, 90);
    stage.targetLabel = "手工输入目标落点";
    stage.inverseState = null;
  }
  else if (field === "targetLon") {
    stage.targetLon = control.value.trim() === "" ? null : finiteOrClamp(control.value, stage.targetLon, -180, 180);
    stage.targetLabel = "手工输入目标落点";
    stage.inverseState = null;
  }
  else if (field === "inverseMode") {
    stage.inverseMode = control.value === "heading-angle" ? "heading-angle" : "heading-speed";
    stage.inverseState = null;
  }
  else if (field === "targetToleranceKm") stage.targetToleranceKm = finiteOrClamp(control.value, stage.targetToleranceKm, 0.01, 500);
  else if (field === "noseRadiusM") stage.noseRadiusM = finiteOrClamp(control.value, stage.noseRadiusM, 0.01, 100);
  else if (field === "liftToDragRatio") stage.liftToDragRatio = finiteOrClamp(control.value, stage.liftToDragRatio, 0, 3);
  else if (field === "bankAngleDeg") stage.bankAngleDeg = finiteOrClamp(control.value, stage.bankAngleDeg, -180, 180);
  else if (field === "ballisticCoefficientKgM2") {
    stage.ballisticCoefficientKgM2 = finiteOrClamp(control.value, stage.ballisticCoefficientKgM2, 1, 100000);
  } else if (field === "maxTimeSec") stage.maxTimeSec = finiteOrClamp(control.value, stage.maxTimeSec, 10, 604800);
  if ([
    "burnoutLat",
    "burnoutLon",
    "initialSpeedMps",
    "flightPathAngleDeg",
    "burnoutAltitudeKm",
    "headingMode",
    "manualHeadingDeg",
    "headingOffsetDeg",
    "dragEnabled",
    "atmosphereModel",
    "atmosphereEpochUtc",
    "f107Daily",
    "f107Average",
    "ap",
    "noseRadiusM",
    "liftToDragRatio",
    "bankAngleDeg",
    "ballisticCoefficientKgM2",
    "maxTimeSec",
  ].includes(field)) {
    stage.maxRangeState = null;
  }
  const animationKey = ballisticAnimationObjectKey(track.id, stage.id);
  if (ensureBallisticAnimationConfig().objectKeys.includes(animationKey)) {
    state.ballisticAnimation.elapsedSec = 0;
    invalidateBallisticAnimationSession("物体参数发生变化，请重新预计算");
  }
  if (!rerender) {
    if (field === "targetLat" || field === "targetLon") syncBallisticTargetControlsDom(control, track, stage);
    if (ballisticInputDrawTimer) window.clearTimeout(ballisticInputDrawTimer);
    ballisticInputDrawTimer = window.setTimeout(() => {
      ballisticInputDrawTimer = 0;
      requestTrajectoryCountUpdate();
      draw();
    }, 140);
    return;
  }
  if (ballisticInputDrawTimer) {
    window.clearTimeout(ballisticInputDrawTimer);
    ballisticInputDrawTimer = 0;
  }
  if (rerender) {
    renderTrajectoryPlan();
    updateTrajectoryCount();
  }
  draw();
}

async function solveActiveBallisticTarget() {
  const track = activeTrajectory();
  const stage = activeBallisticStage(track);
  const target = resolveBallisticTarget(stage);
  const segment = activeBallisticSegment(track, stage);
  if (!stage || !target || !segment?.options) return;
  const stageId = stage.id;
  stage.inverseState = { status: "loading", message: "正在反算目标落点" };
  pauseBallisticAnimation();
  renderTrajectoryPlan();
  try {
    const response = await fetch("/api/ballistics/solve-target", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        options: segment.options,
        target: { latDeg: target.lat, lonDeg: target.lon },
        solveMode: stage.inverseMode,
        toleranceM: stage.targetToleranceKm * 1000,
        maxEvaluations: 220,
        environment: {
          epochUtc: stage.atmosphereEpochUtc,
          f107Daily: stage.f107Daily,
          f107Average: stage.f107Average,
          ap: stage.ap,
        },
      }),
    });
    const payload = await response.json();
    const currentStage = track.ballistic.stages.find((candidate) => candidate.id === stageId);
    if (!currentStage) return;
    const solution = payload?.solution;
    if (!response.ok || !solution?.valid) throw new Error(solution?.message || payload?.error || `HTTP ${response.status}`);
    currentStage.headingMode = "manual";
    currentStage.manualHeadingDeg = normalizeBearing(solution.headingDeg);
    if (solution.solveMode === "heading-angle") currentStage.flightPathAngleDeg = finiteOrClamp(solution.flightPathAngleDeg, currentStage.flightPathAngleDeg, -89, 89);
    else currentStage.initialSpeedMps = finiteOrClamp(solution.initialSpeedMps, currentStage.initialSpeedMps, 1, 20000);
    currentStage.maxRangeState = null;
    currentStage.inverseState = {
      status: "success",
      message: `${solution.converged ? "反算已收敛" : "已应用最接近解"} · 误差 ${formatKm(solution.errorM / 1000)} · ${solution.evaluations} 次传播/${solution.batches || 0} 批 · ${solution.parallelism || payload.environment?.workerCount || 1} 核并行 · ${formatMilliseconds(payload.environment?.computeMs)}`,
      solution,
    };
  } catch (error) {
    const currentStage = track.ballistic.stages.find((candidate) => candidate.id === stageId);
    if (currentStage) currentStage.inverseState = { status: "error", message: `反算失败：${error instanceof Error ? error.message : String(error)}` };
  }
  renderTrajectoryPlan();
  updateTrajectoryCount();
  draw();
}

async function optimizeActiveBallisticRange() {
  const track = activeTrajectory();
  const stage = activeBallisticStage(track);
  const segment = activeBallisticSegment(track, stage);
  if (!stage || !segment?.options) return;
  const stageId = stage.id;
  const requestId = `max-range-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  stage.maxRangeState = { status: "loading", message: "正在搜索最大地面射程", requestId };
  pauseBallisticAnimation();
  renderTrajectoryPlan();
  try {
    const response = await fetch("/api/ballistics/max-range", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        options: segment.options,
        maxEvaluations: 64,
        coarseStepDeg: 5,
        angleToleranceDeg: 0.025,
        environment: {
          epochUtc: stage.atmosphereEpochUtc,
          f107Daily: stage.f107Daily,
          f107Average: stage.f107Average,
          ap: stage.ap,
        },
      }),
    });
    const payload = await response.json();
    const currentStage = track.ballistic.stages.find((candidate) => candidate.id === stageId);
    if (!currentStage || currentStage.maxRangeState?.requestId !== requestId) return;
    const solution = payload?.solution;
    if (!response.ok || !solution?.valid || !payload?.result?.valid) {
      throw new Error(solution?.message || payload?.error || `HTTP ${response.status}`);
    }
    currentStage.flightPathAngleDeg = finiteOrClamp(solution.flightPathAngleDeg, currentStage.flightPathAngleDeg, -89, 89);
    currentStage.inverseState = null;
    const optimizedOptions = { ...segment.options, flightPathAngleDeg: currentStage.flightPathAngleDeg };
    const cacheKey = ballisticPropagationCacheKey(optimizedOptions);
    if (optimizedOptions.atmosphereModel === "nrlmsise00" && optimizedOptions.dragEnabled) {
      const result = { ...payload.result, empiricalStatus: "ready", environment: payload.environment };
      ballisticEmpiricalSimulationCache.set(cacheKey, { status: "ready", result, displayResult: result, fallback: result, error: "" });
      trimMapCache(ballisticEmpiricalSimulationCache, 64);
    } else {
      ballisticSimulationCache.set(cacheKey, payload.result);
      trimMapCache(ballisticSimulationCache, 64);
    }
    currentStage.maxRangeState = {
      status: "success",
      requestId,
      solution,
      message: `最大地面射程 ${formatKm(solution.groundRangeM / 1000)} · 最优路径角 ${formatDegrees(solution.flightPathAngleDeg)} · ${solution.evaluations} 次传播 · ${formatMilliseconds(payload.environment?.computeMs)}`,
    };
  } catch (error) {
    const currentStage = track.ballistic.stages.find((candidate) => candidate.id === stageId);
    if (currentStage?.maxRangeState?.requestId === requestId) {
      currentStage.maxRangeState = { status: "error", requestId, message: `最大射程计算失败：${error instanceof Error ? error.message : String(error)}` };
    }
  }
  renderTrajectoryPlan();
  updateTrajectoryCount();
  draw();
}

function formatMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return number >= 1000 ? `${(number / 1000).toFixed(number >= 10000 ? 1 : 2)} s` : `${Math.round(number)} ms`;
}

function renderCheckboxes(items, selectedSet, group) {
  if (!items.length) return `<p class="empty-text">无可用项</p>`;
  return items.map((item) => renderCheckboxRow(item, selectedSet, group)).join("");
}

function renderGroupedCheckboxes(items, selectedSet, group) {
  if (!items.length) return `<p class="empty-text">无可用项</p>`;
  const grouped = new Map();
  for (const item of items) {
    const section = item.section || "other";
    if (!grouped.has(section)) grouped.set(section, []);
    grouped.get(section).push(item);
  }
  return [...grouped.entries()].map(([section, sectionItems]) => `
    <section class="filter-group" data-filter-section="${escapeHtml(section)}">
      <div class="filter-group-title">
        <strong>${escapeHtml(COUNTRY_FILTER_GROUP_LABELS.get(section) || "其他")}</strong>
        <span>${sectionItems.length} 项</span>
      </div>
      ${sectionItems.map((item) => renderCheckboxRow(item, selectedSet, group)).join("")}
    </section>
  `).join("");
}

function renderCheckboxRow(item, selectedSet, group) {
  const checked = selectedSet.has(item.id) ? "checked" : "";
  const label = formatFilterLabel(item);
  return `
    <label class="check-row">
      <input type="checkbox" data-group="${group}" value="${escapeHtml(item.id)}" ${checked} />
      <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
      <em>${item.count}</em>
    </label>
  `;
}

function formatFilterLabel(item) {
  const id = String(item?.id || "").trim();
  const label = String(item?.label || "").trim();
  if (!label || label === "undefined" || label === "null") return id || "Unknown";
  if (item?.section) return label;
  if (!id || label.toUpperCase() === id.toUpperCase() || label.toUpperCase().startsWith(`${id.toUpperCase()} `)) {
    return label;
  }
  return `${id} · ${label}`;
}

function formatZoom(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPixelValue(value) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
}

function trajectoryDashDensityLabel(value) {
  const density = clamp(Number(value), 0, 100);
  if (density >= 100) return "实线";
  if (density <= 15) return "稀疏";
  if (density <= 55) return "中等";
  if (density <= 85) return "密集";
  return "近实线";
}

function trajectoryDashPattern(track, lineWidth) {
  const density = clamp(Number.isFinite(track?.dashDensity) ? track.dashDensity : DEFAULT_TRAJECTORY_DASH_DENSITY, 0, 100);
  if (density >= 100) return [];
  const t = density / 100;
  const dash = Math.max(lineWidth * 1.8, lineWidth * (1.6 + t * 4.2));
  const gap = Math.max(lineWidth * 0.9, lineWidth * (10 - t * 8.8));
  return [dash, gap];
}

function formatKm(value) {
  if (!Number.isFinite(value)) return "0 km";
  return `${value.toLocaleString("zh-CN", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })} km`;
}

function ballisticTrackDistanceSuffix(physics) {
  const rangeM = Number(physics?.groundRangeM);
  const endpointM = Number(physics?.endpointGeodesicDistanceM);
  if (![rangeM, endpointM].every(Number.isFinite)) return "";
  if (Math.abs(endpointM - rangeM) < Math.max(10000, rangeM * 0.01)) return "";
  return ` · 落点最短间距 ${formatKm(endpointM / 1000)}`;
}

function formatMps(value) {
  if (!Number.isFinite(value)) return "-- m/s";
  return `${Math.round(value).toLocaleString("zh-CN")} m/s`;
}

function formatDurationSeconds(value) {
  if (!Number.isFinite(value)) return "-- s";
  return `${Math.round(value).toLocaleString("zh-CN")} s`;
}

function formatDensity(value) {
  if (!Number.isFinite(value)) return "-- g/m³";
  if (value === 0) return "0 g/m³";
  return `${(value * 1000).toExponential(3)} g/m³`;
}

function formatPressure(value) {
  if (!Number.isFinite(value)) return "-- kPa";
  const kilopascals = value / 1000;
  const digits = kilopascals >= 100 ? 1 : kilopascals >= 1 ? 2 : 3;
  return `${kilopascals.toFixed(digits)} kPa`;
}

function formatMach(value) {
  if (!Number.isFinite(value)) return "-- Ma";
  return `${value.toFixed(value >= 10 ? 1 : 2)} Ma`;
}

function formatHeatFlux(value) {
  if (!Number.isFinite(value)) return "-- W/m²";
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)} MW/m²`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} kW/m²`;
  return `${Math.round(value)} W/m²`;
}

function formatHeatLoad(value) {
  if (!Number.isFinite(value)) return "-- J/m²";
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)} MJ/m²`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)} kJ/m²`;
  return `${Math.round(value)} J/m²`;
}

function formatGLoad(value) {
  return Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)} G` : "-- G";
}

function formatDimensionless(value) {
  if (!Number.isFinite(value)) return "--";
  if (value === 0) return "0";
  if (Math.abs(value) >= 100000 || Math.abs(value) < 0.001) return value.toExponential(3);
  return value.toLocaleString("zh-CN", { maximumSignificantDigits: 4 });
}

function formatFlowRegime(value) {
  return ({
    continuum: "连续流",
    slip: "滑移流",
    transitional: "过渡流",
    "free-molecular": "自由分子流",
  })[value] || "未知";
}

function formatOrbitSummary(orbit) {
  if (!orbit?.bound) return "";
  return `近地点 ${formatKm(orbit.perigeeAltitudeM / 1000)} · 远地点 ${formatKm(orbit.apogeeAltitudeM / 1000)} · 轨道倾角 ${formatDegrees(orbit.inclinationDeg)} · 轨道周期 ${formatDurationSeconds(orbit.periodSec)}`;
}

function reentryPhaseLabel(value) {
  return ({
    coast: "上升/滑行",
    exoatmospheric: "大气层外下降",
    "entry-interface": "再入界面",
    "rarefied-entry": "稀薄大气再入",
    "peak-heating": "高热流段",
    "peak-pressure": "高动压段",
    "dense-entry": "稠密大气段",
    "lower-atmosphere": "低层大气",
    "skip-exit-interface": "掠入后出界",
    "skip-exit-heating": "掠入上升热流段",
    "skip-exit": "掠入上升段",
  })[value] || "等待传播";
}

function updateFilterSet(input, set) {
  if (input.checked) set.add(input.value);
  else set.delete(input.value);
  if (set.size) {
    state.displayMode = "selected";
    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === "selected");
    });
  }
  applyFilters();
  fitFilteredBounds();
}

function watchRegionCount(region) {
  return state.restrictions.filter((item) => item.bounds && boundsIntersect(item.bounds, region.bounds)).length;
}

function renderLegendLegacyFirOnly() {
  const legendItems = state.restrictions.filter(isSourceDrawEnabled);
  const categories = [...new Set(legendItems.map((item) => item.category || normalizeNotamCategory(item.type)))].sort();
  const restrictionLegend = categories
    .map((category) => {
      const color = CATEGORY_COLORS.get(category) || NOTAM_AREA_COLOR;
      return `<span><i style="background:${color}"></i>${escapeHtml(category)}</span>`;
    })
    .join("");
  const trajectoryLegend = state.trajectoryTracks.some(trajectoryTrackHasDrawableContent)
    ? state.trajectoryTracks
        .filter(trajectoryTrackHasDrawableContent)
        .map(
          (track) =>
            `<span><i style="border:2px dashed ${escapeHtml(track.color)};background:transparent"></i>${escapeHtml(track.name)}${track.geodesic ? " · WGS-84" : ""}</span>`,
        )
        .join("")
    : "";
  els.legend.innerHTML =
    restrictionLegend +
    `<span><i style="border:2px dashed #34b7ff;background:transparent"></i>全球 FIR 监控区</span>` +
    trajectoryLegend;
}

function renderLegendLegacyLaunch() {
  const legendItems = state.restrictions.filter(isSourceDrawEnabled);
  const categories = [...new Set(legendItems.map((item) => item.category || normalizeNotamCategory(item.type)))].sort();
  const restrictionLegend = categories
    .map((category) => {
      const color = CATEGORY_COLORS.get(category) || NOTAM_AREA_COLOR;
      return `<span><i style="background:${color}"></i>${escapeHtml(category)}</span>`;
    })
    .join("");
  const launchLegend = launchForecastLegendVisible()
    ? `<span><i style="border:2px solid ${LAUNCH_SITE_COLOR};background:rgba(255,209,102,0.18)"></i>火箭发射预告</span>`
    : "";
  const trajectoryLegend = state.trajectoryTracks.some(trajectoryTrackHasDrawableContent)
    ? state.trajectoryTracks
        .filter(trajectoryTrackHasDrawableContent)
        .map(
          (track) =>
            `<span><i style="border:2px dashed ${escapeHtml(track.color)};background:transparent"></i>${escapeHtml(track.name)}</span>`,
        )
        .join("")
    : "";
  els.legend.innerHTML =
    restrictionLegend +
    `<span><i style="border:2px dashed #34b7ff;background:transparent"></i>全球 FIR 监控区</span>` +
    launchLegend +
    trajectoryLegend;
}

function renderSourceStatusLegacyHydropac() {
  const payload = state.payload || {};
  const sources = payload.sources || {};
  const notam = sources.faaNotamSearch || {};
  const imported = sources.importedNotams || {};
  const hydropac = state.hydropacPayload?.source || null;
  const msa = state.msaPayload?.source || null;
  els.updatedAt.textContent = payload.generatedAt ? formatDateTime(payload.generatedAt) : "--";
  els.sourceLine.textContent =
    notam.status === "ok"
      ? `FAA NOTAM Search 已加载；HYDROPAC ${state.hydropacWarnings.length ? "已加载" : "未获取"}`
      : "FAA NOTAM 数据状态异常";
  if (!activeLoadController) updateRefreshProgress("idle", "数据就绪");
  els.sourceStatus.innerHTML = `
    <div class="source-row ${notam.status === "ok" || notam.status === "official_live" ? "ok" : "warn"}">
      <strong>全球 NOTAM</strong>
      <span>${escapeHtml(notam.message || "正在通过 FAA NOTAM Search 官方搜索端点读取全球 FIR 组。")}</span>
    </div>
    <div class="source-row ${hydropac?.status === "ok" ? "ok" : hydropac?.status === "error" ? "error" : "muted"}">
      <strong>NGA MSI HYDROPAC</strong>
      <span>${escapeHtml(hydropac?.message || "点击“刷新 HYDROPAC”独立读取 NGA MSI 航海/水文警告，只绘制可解析边界的区域。")}</span>
    </div>
    <div class="source-row ${imported.status === "ok" ? "ok" : "muted"}">
      <strong>导入 NOTAM</strong>
      <span>${escapeHtml(imported.message || "未配置")}</span>
    </div>
  `;
}

function renderSourceStatusLegacyLaunch() {
  const payload = state.payload || {};
  const sources = payload.sources || {};
  const notam = sources.faaNotamSearch || {};
  const imported = sources.importedNotams || {};
  const hydropac = state.hydropacPayload?.source || null;
  const launchSource = state.launchPayload?.source || null;
  els.updatedAt.textContent = payload.generatedAt ? formatDateTime(payload.generatedAt) : "--";
  els.sourceLine.textContent =
    notam.status === "ok"
      ? `FAA NOTAM Search 已加载；HYDROPAC ${state.hydropacWarnings.length ? "已加载" : "未获取"}；发射预告 ${
          state.launchForecasts.length ? "已加载" : "未获取"
        }`
      : "FAA NOTAM 数据状态异常";
  if (!activeLoadController) updateRefreshProgress("idle", "数据就绪");
  els.sourceStatus.innerHTML = `
    <div class="source-row ${notam.status === "ok" || notam.status === "official_live" ? "ok" : "warn"}">
      <strong>全球 NOTAM</strong>
      <span>${escapeHtml(notam.message || "通过 FAA NOTAM Search 官方搜索端点读取全球 FIR 数据。")}</span>
    </div>
    <div class="source-row ${hydropac?.status === "ok" ? "ok" : hydropac?.status === "error" ? "error" : "muted"}">
      <strong>NGA MSI HYDROPAC</strong>
      <span>${escapeHtml(hydropac?.message || "点击“刷新 HYDROPAC”独立读取 NGA MSI 航海/水文警告。")}</span>
    </div>
    <div class="source-row ${launchSource?.status === "ok" ? "ok" : launchSource?.status === "error" ? "error" : launchSource?.status === "warn" ? "warn" : "muted"}">
      <strong>火箭发射预告</strong>
      <span>${escapeHtml(launchSource?.message || "点击“刷新发射预告”读取 Launch Library 2 全球发射预告，并在发射场位置画圈。")}</span>
    </div>
    <div class="source-row ${imported.status === "ok" ? "ok" : "muted"}">
      <strong>导入 NOTAM</strong>
      <span>${escapeHtml(imported.message || "未配置")}</span>
    </div>
  `;
}

function renderLegend() {
  const drawable = drawnFilteredItems().filter((item) => item.hasGeometry && item.geometry);
  const categories = [...new Set(drawable.map((item) => item.category || normalizeNotamCategory(item.type)))].sort();
  const restrictionLegend = categories
    .map((category) => {
      const color = CATEGORY_COLORS.get(category) || NOTAM_AREA_COLOR;
      return `<span><i style="background:${color}"></i>${escapeHtml(category)}</span>`;
    })
    .join("");
  const launchLegend = launchForecastLegendVisible()
    ? `<span><i style="border:2px solid ${LAUNCH_SITE_COLOR};background:rgba(255,209,102,0.18)"></i>火箭发射预告</span>`
    : "";
  const trajectoryLegend = state.trajectoryTracks.some(trajectoryTrackHasDrawableContent)
    ? state.trajectoryTracks
        .filter(trajectoryTrackHasDrawableContent)
        .map(
          (track) =>
            `<span><i style="border:2px dashed ${escapeHtml(track.color)};background:transparent"></i>${escapeHtml(track.name)}</span>`,
        )
        .join("")
    : "";
  const customLegend = state.customCoordinatesEnabled && state.customItems.length
    ? `<span><i style="border:2px solid ${CUSTOM_COORDINATE_COLOR};background:${hexToRgba(CUSTOM_COORDINATE_COLOR, 0.3)}"></i>自定义坐标</span>`
    : "";
  els.legend.innerHTML = restrictionLegend + launchLegend + trajectoryLegend + customLegend;
  els.legend.hidden = !els.legend.innerHTML.trim();
}

function launchForecastLegendVisible() {
  if (!state.launchRingsEnabled || (isGlobeLayer() && state.view.zoom < 1)) return false;
  return launchSiteGroups(launchForecastsForCurrentWindow(), { respectLandmarkVisibility: true }).length > 0;
}

function trajectoryTrackHasDrawableContent(track) {
  if (!track) return false;
  ensureTrajectoryBallistic(track);
  const selected = selectedTrajectoryItems(track);
  const groundTrackSources = new Set(track.groundTrackSources || []);
  if (track.showGroundTrack !== false && groundTrackSources.has("manual") && selected.length >= 2) return true;
  const stages = track.ballistic?.stages || [];
  if (
    track.ballistic?.showPoweredPath === true &&
    Number.isFinite(track.ballistic.poweredStartLat) &&
    Number.isFinite(track.ballistic.poweredStartLon) &&
    stages.some((stage) => resolveBallisticBurnout(stage, selected))
  ) return true;
  return stages.some((stage) => {
    const enabled = track.ballistic?.enabled || (track.showGroundTrack !== false && groundTrackSources.has(ballisticGroundTrackSourceKey(stage.id)));
    return enabled && Boolean(resolveBallisticBurnout(stage, selected));
  });
}

function renderSourceStatus() {
  const payload = state.payload || {};
  const sources = payload.sources || {};
  const notam = sources.faaNotamSearch || {};
  const hydropac = state.hydropacPayload?.source || null;
  const msa = state.msaPayload?.source || null;
  const navarea = state.navareaPayload?.source || null;
  const cloudSource = state.cloudPayload?.source || null;
  const launchSource = state.launchPayload?.source || null;
  const notamFetchedAt = notam.fetchedAt || payload.faaNotamFetchedAt || notam.cacheSavedAt || payload.cacheSavedAt || payload.generatedAt;
  const notamFetchedLabel = notamFetchedAt ? formatDateTime(notamFetchedAt) : "--";
  els.updatedAt.textContent = notamFetchedAt ? `NOTAM ${notamFetchedLabel}` : "--";
  const notamUsable =
    notam.status === "ok" ||
    notam.status === "official_live" ||
    Boolean(notam.cacheFallback) ||
    Boolean(notam.backgroundRefresh?.active) ||
    state.faaRestrictions.length > 0;
  els.sourceLine.textContent = notamUsable
    ? `${notam.backgroundRefresh?.active ? "FAA NOTAM 刷新中" : "FAA NOTAM 已加载"}（获取：${notamFetchedLabel}）；HYDROPAC ${state.hydropacWarnings.length ? "已加载" : "未获取"}；发射预告 ${
        state.launchForecasts.length ? "已加载" : "未获取"
      }`
    : "FAA NOTAM 数据状态异常";
  if (notamUsable) {
    els.sourceLine.textContent += `；中国航警 ${msa?.backgroundRefresh?.active ? "刷新中" : state.msaWarnings.length ? "已加载" : "未获取"}`;
    els.sourceLine.textContent += `；NAVAREA ${state.navareaWarnings.length ? "已加载" : "未获取"}`;
  }
  if (notamUsable) els.sourceLine.textContent += `；卫星云图 ${cloudSource?.status === "ok" ? "已加载" : "未获取"}`;
  if (!activeLoadController && !notam.backgroundRefresh?.active) updateRefreshProgress("idle", "数据就绪");
  const notamRowClass = notam.status === "ok" || notam.status === "official_live" ? "ok" : "warn";
  els.sourceStatus.innerHTML = `
    <div class="source-row ${notamRowClass}">
      <strong>全球 NOTAM</strong>
      <span>FAA NOTAM 获取日期：${escapeHtml(notamFetchedLabel)}</span>
      <span>${escapeHtml(notam.message || "FAA NOTAM Search 官方搜索端点。")}</span>
    </div>
    <div class="source-row ${hydropac?.status === "ok" ? "ok" : hydropac?.status === "error" ? "error" : "muted"}">
      <strong>NGA MSI HYDROPAC</strong>
      <span>${escapeHtml(hydropac?.message || "独立读取 NGA MSI 航海/水文警告。")}</span>
    </div>
    <div class="source-row ${navarea?.status === "ok" ? "ok" : navarea?.status === "error" ? "error" : "muted"}">
      <strong>NAVAREA 航行警告</strong>
      <span>${escapeHtml(navarea?.message || "独立读取 NAVAREA I / II / IV / VIII / XI / XII / XIII 活动航行警告。")}</span>
    </div>
    <div class="source-row ${launchSource?.status === "ok" ? "ok" : launchSource?.status === "error" ? "error" : launchSource?.status === "warn" ? "warn" : "muted"}">
      <strong>火箭发射预告</strong>
      <span>${escapeHtml(launchSource?.message || "Launch Library 2 全球发射预告。")}</span>
    </div>
  `;
  if (cloudSource && !els.sourceStatus.innerHTML.includes("卫星云图")) {
    els.sourceStatus.insertAdjacentHTML(
      "beforeend",
      `<div class="source-row ${cloudSource.status === "ok" ? "ok" : cloudSource.status === "error" ? "error" : "muted"}">
        <strong>卫星云图</strong>
        <span>${escapeHtml(cloudSource.selectedHour ? `影像小时：${cloudSource.selectedTimeBeijing || cloudSource.selectedHour}；透明度 ${Math.round(state.cloudOpacity * 100)}%` : "NOAA GMGSI 全球小时云图叠加层")}</span>
        <span>${escapeHtml(cloudSource.message || "仅叠加在卫星地图和地球模式上，NOTAM/NAVAREA/HYDROPAC 位于最上层。")}</span>
      </div>`,
    );
  }
  if (msa && !els.sourceStatus.innerHTML.includes("中国海事局航警")) {
    els.sourceStatus.insertAdjacentHTML(
      "beforeend",
      `<div class="source-row ${msa.status === "ok" ? "ok" : msa.status === "error" ? "error" : "muted"}">
        <strong>中国海事局航警</strong>
        <span>${escapeHtml(msa.message || "独立读取中国海事局各地航行警告，只绘制可解析闭合坐标边界的区域。")}</span>
      </div>`,
    );
  }
}

function initializeSatelliteControls() {
  restoreCustomSatelliteElements();
  rebuildSatelliteCatalogWithCustomElements();
  restoreSatelliteStyleSettings();
  if (els.satelliteSpeedSelect) els.satelliteSpeedSelect.value = String(state.satellitePlaybackMagnitude);
  syncSatelliteControls();
  renderCustomSatelliteElements();
}

function restoreSatelliteStyleSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(SATELLITE_STYLE_STORAGE_KEY) || "{}");
    state.satelliteOrbitLineWidth = clamp(Number(stored.orbitLineWidth) || state.satelliteOrbitLineWidth, 0.5, 5);
    state.satellitePointSize = clamp(
      Number(stored.pointSize) || state.satellitePointSize,
      SATELLITE_POINT_SIZE_MIN,
      SATELLITE_POINT_SIZE_MAX,
    );
    state.satelliteLabelSize = clamp(
      Number(stored.labelSize) || state.satelliteLabelSize,
      SATELLITE_LABEL_SIZE_MIN,
      SATELLITE_LABEL_SIZE_MAX,
    );
    state.satelliteImagingOpacity = clamp(Number(stored.imagingOpacity) || state.satelliteImagingOpacity, 0.05, 1);
    state.satelliteCommunicationOpacity = clamp(Number(stored.communicationOpacity) || state.satelliteCommunicationOpacity, 0.05, 1);
    state.satelliteAllLabelsEnabled = stored.allLabels === true;
  } catch {
    // Keep the documented defaults when local settings are unavailable.
  }
}

function saveSatelliteStyleSettings() {
  try {
    localStorage.setItem(SATELLITE_STYLE_STORAGE_KEY, JSON.stringify({
      orbitLineWidth: state.satelliteOrbitLineWidth,
      pointSize: state.satellitePointSize,
      labelSize: state.satelliteLabelSize,
      imagingOpacity: state.satelliteImagingOpacity,
      communicationOpacity: state.satelliteCommunicationOpacity,
      allLabels: state.satelliteAllLabelsEnabled,
    }));
  } catch {
    // The current-session settings still remain active.
  }
}

function setSatelliteReferenceFrame(referenceFrame) {
  const next = referenceFrame === "inertial" ? "inertial" : "earth-fixed";
  if (state.satelliteReferenceFrame === next) return;
  state.satelliteReferenceFrame = next;
  state.satelliteReferenceEpochMs = state.satelliteTimeMs;
  globeParamsMemo = null;
  satelliteGpuPositionRevision += 1;
  satelliteGpuCoverageRevision += 1;
  satelliteGpuOrbitRevision += 1;
  invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
  syncSatelliteControls();
  scheduleDraw();
}

function satelliteGmstDeg(timeMs) {
  if (SATELLITE_REFERENCE?.gmstDeg) return SATELLITE_REFERENCE.gmstDeg(timeMs);
  const daysSinceJ2000 = (Number(timeMs) - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  return normalizeBearingDeg(280.46061837 + 360.98564736629 * daysSinceJ2000);
}

function satelliteReferenceRotationDeg(timeMs = state.satelliteTimeMs) {
  if (state.satelliteReferenceFrame !== "inertial") return 0;
  return satelliteReferenceDeltaDeg(timeMs);
}

function satelliteReferenceDeltaDeg(timeMs = state.satelliteTimeMs) {
  return normalizeLongitudeDeltaDeg(satelliteGmstDeg(timeMs) - satelliteGmstDeg(state.satelliteReferenceEpochMs));
}

function ballisticAnimationEarthRotationDeg() {
  const animation = ensureBallisticAnimationConfig();
  if (animation.referenceFrame !== "trajectory-fixed") return 0;
  const rotationRate = Number(BALLISTIC_PHYSICS?.constants?.EARTH_ROTATION_RAD_S) || 7.292115e-5;
  if (REENTRY_ANIMATION?.referenceRotationDeg) return REENTRY_ANIMATION.referenceRotationDeg(animation.elapsedSec, rotationRate);
  return normalizeLongitudeDeltaDeg(toDeg(rotationRate * Math.max(0, Number(animation.elapsedSec) || 0)));
}

function ballisticAnimationReferenceActive() {
  return Boolean(isGlobeLayer() && ballisticAnimationSession?.entries?.length);
}

function globeEarthRotationDeg() {
  return ballisticAnimationReferenceActive()
    ? ballisticAnimationEarthRotationDeg()
    : satelliteReferenceRotationDeg();
}

function globeDisplayLongitude(lon) {
  return normalizeLon(Number(lon) + globeEarthRotationDeg());
}

function ballisticAnimationSampleLongitude(entry, sample) {
  const animation = ensureBallisticAnimationConfig();
  const rotationRate = Number(BALLISTIC_PHYSICS?.constants?.EARTH_ROTATION_RAD_S) || 7.292115e-5;
  if (REENTRY_ANIMATION?.sampleReferenceLongitude) {
    return REENTRY_ANIMATION.sampleReferenceLongitude(sample, entry?.offsetSec, animation.referenceFrame, rotationRate);
  }
  if (animation.referenceFrame !== "trajectory-fixed") return normalizeLon(Number(sample?.lon) || 0);
  const elapsedSec = Math.max(0, Number(entry?.offsetSec) || 0) + Math.max(0, Number(sample?.elapsedSec) || 0);
  return normalizeLon(Number(sample?.lon) + toDeg(rotationRate * elapsedSec));
}

function satelliteDisplayLongitude(lon, timeMs = state.satelliteTimeMs) {
  const rotationDeg = state.satelliteReferenceFrame === "inertial"
    ? satelliteReferenceDeltaDeg(timeMs)
    : globeEarthRotationDeg();
  return normalizeLon(Number(lon) + rotationDeg);
}

function eciVectorToReferenceScene(xKm, yKm, zKm, scale = 1 / EARTH_MEAN_RADIUS_KM, sampleTimeMs = state.satelliteTimeMs) {
  const rotationTimeMs = state.satelliteReferenceFrame === "inertial"
    ? state.satelliteReferenceEpochMs
    : sampleTimeMs;
  if (SATELLITE_REFERENCE?.eciStateToScene) {
    const transformed = SATELLITE_REFERENCE.eciStateToScene(
      { x: Number(xKm), y: Number(yKm), z: Number(zKm) },
      null,
      {
        sampleTimeMs,
        referenceFrame: state.satelliteReferenceFrame,
        referenceEpochMs: state.satelliteReferenceEpochMs,
        scale,
      },
    );
    if (transformed?.position) return transformed.position;
  }
  const theta = toRad(satelliteGmstDeg(rotationTimeMs));
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const ecefX = Number(xKm) * cosTheta + Number(yKm) * sinTheta;
  const ecefY = -Number(xKm) * sinTheta + Number(yKm) * cosTheta;
  return {
    x: ecefY * scale,
    y: Number(zKm) * scale,
    z: ecefX * scale,
  };
}

function satelliteReferenceSceneStates(position) {
  const frameTimeMs = Number(position?.frameTimeMs) || satelliteLastPropagatedTimeMs || state.satelliteTimeMs;
  const durationSec = Number(position?.interpolationDurationSec) || state.satelliteInterpolationDurationSec || 1;
  const nextFrameTimeMs = frameTimeMs + durationSec * 1000;
  const cache = position?.referenceSceneCache;
  if (cache && cache.frameTimeMs === frameTimeMs && cache.durationSec === durationSec
    && cache.referenceFrame === state.satelliteReferenceFrame
    && cache.referenceEpochMs === state.satelliteReferenceEpochMs
    && cache.eciXKm === position.eciXKm && cache.nextEciXKm === position.nextEciXKm) return cache;
  const scale = 1 / EARTH_MEAN_RADIUS_KM;
  const transform = (point, velocity, sampleTimeMs) => {
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
    if (SATELLITE_REFERENCE?.eciStateToScene) {
      return SATELLITE_REFERENCE.eciStateToScene(point, velocity, {
        sampleTimeMs,
        referenceFrame: state.satelliteReferenceFrame,
        referenceEpochMs: state.satelliteReferenceEpochMs,
        scale,
      });
    }
    return {
      position: eciVectorToReferenceScene(point.x, point.y, point.z, scale, sampleTimeMs),
      velocity: velocity && [velocity.x, velocity.y, velocity.z].every(Number.isFinite)
        ? eciVectorToReferenceScene(velocity.x, velocity.y, velocity.z, scale, sampleTimeMs)
        : { x: 0, y: 0, z: 0 },
    };
  };
  const current = transform(
    { x: position?.eciXKm, y: position?.eciYKm, z: position?.eciZKm },
    { x: position?.eciVxKmS, y: position?.eciVyKmS, z: position?.eciVzKmS },
    frameTimeMs,
  );
  const next = transform(
    { x: position?.nextEciXKm, y: position?.nextEciYKm, z: position?.nextEciZKm },
    { x: position?.nextEciVxKmS, y: position?.nextEciVyKmS, z: position?.nextEciVzKmS },
    nextFrameTimeMs,
  );
  const result = {
    frameTimeMs,
    durationSec,
    referenceFrame: state.satelliteReferenceFrame,
    referenceEpochMs: state.satelliteReferenceEpochMs,
    eciXKm: position?.eciXKm,
    nextEciXKm: position?.nextEciXKm,
    current,
    next,
  };
  if (position) position.referenceSceneCache = result;
  return result;
}

function satelliteReferenceScenePosition(position) {
  const transformed = satelliteReferenceSceneStates(position)?.current?.position;
  if (transformed) return transformed;
  const frameTimeMs = Number(position?.frameTimeMs) || state.satelliteTimeMs;
  return spherePoint(
    satelliteDisplayLongitude(position?.lon, frameTimeMs),
    Number(position?.lat),
    1 + Math.max(0, Number(position?.altitudeKm) || 0) / EARTH_MEAN_RADIUS_KM,
  );
}

function satelliteReferenceSceneVelocity(position) {
  return satelliteReferenceSceneStates(position)?.current?.velocity || { x: 0, y: 0, z: 0 };
}

function satelliteReferenceSceneNextPosition(position) {
  return satelliteReferenceSceneStates(position)?.next?.position || satelliteReferenceScenePosition(position);
}

function satelliteReferenceSceneNextVelocity(position) {
  return satelliteReferenceSceneStates(position)?.next?.velocity || satelliteReferenceSceneVelocity(position);
}

function satelliteOrbitPointToReferenceScene(point, referenceTimeMs = satelliteLastPropagatedTimeMs || state.satelliteTimeMs) {
  if ([point?.eciXKm, point?.eciYKm, point?.eciZKm].every(Number.isFinite)) {
    return eciVectorToReferenceScene(
      point.eciXKm,
      point.eciYKm,
      point.eciZKm,
      1 / EARTH_MEAN_RADIUS_KM,
      referenceTimeMs,
    );
  }
  return spherePoint(
    satelliteDisplayLongitude(point?.lon, referenceTimeMs),
    Number(point?.lat),
    1 + Math.max(0, Number(point?.altitudeKm) || 0) / EARTH_MEAN_RADIUS_KM,
  );
}

function satelliteOrbitRotationRad(referenceTimeMs, displayTimeMs = state.satelliteTimeMs) {
  if (state.satelliteReferenceFrame !== "earth-fixed" || !Number.isFinite(Number(referenceTimeMs))) return 0;
  if (SATELLITE_REFERENCE?.earthFixedSceneRotationRad) {
    return SATELLITE_REFERENCE.earthFixedSceneRotationRad(referenceTimeMs, displayTimeMs);
  }
  return toRad(normalizeLongitudeDeltaDeg(satelliteGmstDeg(displayTimeMs) - satelliteGmstDeg(referenceTimeMs)));
}

function satelliteInterpolatedDisplayTimeMs() {
  const frameTimeMs = Number(satelliteLastPropagatedTimeMs);
  const durationSec = Number(state.satelliteInterpolationDurationSec) || 0;
  if (!Number.isFinite(frameTimeMs) || Math.abs(durationSec) < 0.0001) return state.satelliteTimeMs;
  const elapsedSec = (state.satelliteTimeMs - frameTimeMs) / 1000;
  return frameTimeMs + durationSec * clamp(elapsedSec / durationSec, 0, 1) * 1000;
}

function advanceSatelliteVector(position, timeMs = state.satelliteTimeMs) {
  const values = [position?.eciXKm, position?.eciYKm, position?.eciZKm, position?.eciVxKmS, position?.eciVyKmS, position?.eciVzKmS];
  if (!values.every(Number.isFinite)) return null;
  const start = { x: values[0], y: values[1], z: values[2] };
  const velocity = { x: values[3], y: values[4], z: values[5] };
  const elapsedSec = (Number(timeMs) - Number(position.frameTimeMs || timeMs)) / 1000;
  const durationSec = Number(position.interpolationDurationSec) || 0;
  const nextValues = [
    position?.nextEciXKm, position?.nextEciYKm, position?.nextEciZKm,
    position?.nextEciVxKmS, position?.nextEciVyKmS, position?.nextEciVzKmS,
  ];
  if (Math.abs(durationSec) > 0.001 && nextValues.every(Number.isFinite)) {
    const t = clamp(elapsedSec / durationSec, 0, 1);
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return {
      x: h00 * start.x + h10 * durationSec * velocity.x + h01 * nextValues[0] + h11 * durationSec * nextValues[3],
      y: h00 * start.y + h10 * durationSec * velocity.y + h01 * nextValues[1] + h11 * durationSec * nextValues[4],
      z: h00 * start.z + h10 * durationSec * velocity.z + h01 * nextValues[2] + h11 * durationSec * nextValues[5],
    };
  }
  const radius = Math.max(0.00001, Math.hypot(start.x, start.y, start.z));
  const momentum = {
    x: start.y * velocity.z - start.z * velocity.y,
    y: start.z * velocity.x - start.x * velocity.z,
    z: start.x * velocity.y - start.y * velocity.x,
  };
  const momentumLength = Math.hypot(momentum.x, momentum.y, momentum.z);
  if (!(momentumLength > 1e-9) || Math.abs(elapsedSec) < 1e-6) return start;
  const axis = { x: momentum.x / momentumLength, y: momentum.y / momentumLength, z: momentum.z / momentumLength };
  const angularRate = momentumLength / (radius * radius);
  const angle = normalizeLongitudeDeltaDeg(toDeg(angularRate * elapsedSec));
  const cosine = Math.cos(toRad(angle));
  const sine = Math.sin(toRad(angle));
  const direction = { x: start.x / radius, y: start.y / radius, z: start.z / radius };
  const axisCrossDirection = {
    x: axis.y * direction.z - axis.z * direction.y,
    y: axis.z * direction.x - axis.x * direction.z,
    z: axis.x * direction.y - axis.y * direction.x,
  };
  const axisDotDirection = axis.x * direction.x + axis.y * direction.y + axis.z * direction.z;
  const radialSpeed = (start.x * velocity.x + start.y * velocity.y + start.z * velocity.z) / radius;
  const nextRadius = clamp(radius + radialSpeed * elapsedSec, radius * 0.72, radius * 1.28);
  return {
    x: (direction.x * cosine + axisCrossDirection.x * sine + axis.x * axisDotDirection * (1 - cosine)) * nextRadius,
    y: (direction.y * cosine + axisCrossDirection.y * sine + axis.y * axisDotDirection * (1 - cosine)) * nextRadius,
    z: (direction.z * cosine + axisCrossDirection.z * sine + axis.z * axisDotDirection * (1 - cosine)) * nextRadius,
  };
}

function satellitePredictedPosition(position, timeMs = state.satelliteTimeMs) {
  const inertial = advanceSatelliteVector(position, timeMs);
  if (!inertial) return position;
  const geodetic = SATELLITE_REFERENCE?.eciToGeodetic?.(inertial, timeMs);
  if (geodetic) {
    return {
      ...position,
      lon: normalizeLon(geodetic.lonDeg),
      lat: clamp(geodetic.latDeg, -90, 90),
      altitudeKm: Math.max(0, geodetic.altitudeKm),
    };
  }
  const theta = toRad(satelliteGmstDeg(timeMs));
  const cosTheta = Math.cos(theta);
  const sinTheta = Math.sin(theta);
  const ecefX = inertial.x * cosTheta + inertial.y * sinTheta;
  const ecefY = -inertial.x * sinTheta + inertial.y * cosTheta;
  const horizontal = Math.hypot(ecefX, ecefY);
  const radius = Math.hypot(horizontal, inertial.z);
  return {
    ...position,
    lon: normalizeLon(toDeg(Math.atan2(ecefY, ecefX))),
    lat: clamp(toDeg(Math.atan2(inertial.z, horizontal)), -90, 90),
    altitudeKm: Math.max(0, radius - EARTH_MEAN_RADIUS_KM),
  };
}

async function loadSatellites(refresh = false) {
  if (state.satelliteLoading) return;
  if (refresh) {
    state.satelliteRefreshBaselineIds = new Set(
      (state.satelliteCatalogItems || []).map((item) => String(item?.id || item?.noradId || "")).filter(Boolean),
    );
    state.satelliteRefreshClassificationSummary = "";
  }
  state.satelliteLoading = true;
  updateSatelliteProgress("loading", refresh ? "正在刷新全在轨目录" : "正在载入卫星轨道缓存", "五路限时并行 · CelesTrak OMM / ACTIVE SATCAT / 全量根数");
  try {
    const response = await fetch(`/api/satellites${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.satellitePayload = payload;
    state.satelliteCatalogItems = Array.isArray(payload.satellites) ? payload.satellites : [];
    rebuildSatelliteCatalogWithCustomElements();
    state.satelliteElementMode = "current";
    state.satelliteHistoricalElementsById = new Map();
    state.satelliteHistorySource = null;
    state.satelliteCoverageGeometryById.clear();
    pruneSatelliteSelection();
    rebuildSatelliteSelectionCaches();
    initializeSatelliteWorker();
    const source = payload.source || {};
    const counts = payload.counts || {};
    if (source.backgroundRefresh?.active) {
      satelliteRefreshPollFailureCount = 0;
      satelliteRefreshRequestedAt = Date.now();
      updateSatelliteProgress(
        "busy",
        `卫星轨道后台刷新中，当前显示完整缓存 ${state.satellites.length.toLocaleString("zh-CN")} 个对象`,
        satelliteRefreshProgressMessage(source.backgroundRefresh),
      );
      scheduleSatelliteRefreshPoll();
    } else {
      const baselineIds = state.satelliteRefreshBaselineIds;
      if (baselineIds && !source.cacheFallback && !source.refreshSkipped) {
        const newCatalogItems = state.satelliteCatalogItems.filter((item) => !baselineIds.has(String(item?.id || item?.noradId || "")));
        const newlyClassified = newCatalogItems.filter((item) => {
          const classification = state.satelliteSeriesById.get(String(item?.id || item?.noradId || ""));
          return classification?.key && classification.key !== "UNCLASSIFIED";
        }).length;
        const newlyUnclassified = Math.max(0, newCatalogItems.length - newlyClassified);
        state.satelliteRefreshClassificationSummary = `本次新增 ${newCatalogItems.length.toLocaleString("zh-CN")} 个对象：归入现有系列 ${newlyClassified.toLocaleString("zh-CN")}，待核实 ${newlyUnclassified.toLocaleString("zh-CN")}`;
        state.satelliteRefreshBaselineIds = null;
      }
      const progressState = source.cacheFallback || source.inactiveCacheFallback || source.refreshSkipped || source.historySnapshotSaved === false ? "warn" : "success";
      updateSatelliteProgress(
        progressState,
        state.satellites.length ? `全在轨目录 ${state.satellites.length.toLocaleString("zh-CN")} 个对象` : "没有可用的卫星轨道缓存",
        [source.message || `LEO ${counts.LEO || 0} · MEO ${counts.MEO || 0} · GEO ${counts.GEO || 0} · HEO ${counts.HEO || 0}`, state.satelliteRefreshClassificationSummary].filter(Boolean).join("；"),
      );
      if (refresh) await loadRefreshHistory({ source: "satellite" });
    }
  } catch (error) {
    updateSatelliteProgress("error", "卫星轨道目录获取失败", error instanceof Error ? error.message : String(error));
  } finally {
    state.satelliteLoading = false;
    syncSatelliteControls();
    renderDetailModeUi();
    if (isSatelliteMode()) {
      renderList();
      renderNotamIdSearchResults();
    }
  }
}

function updateSatelliteProgress(kind, title, detail) {
  if (!els.satelliteProgress) return;
  els.satelliteProgress.className = `refresh-progress satellite-progress ${kind}`;
  const strong = els.satelliteProgress.querySelector("strong");
  const em = els.satelliteProgress.querySelector("em");
  if (strong) strong.textContent = title;
  if (em) em.textContent = detail;
  if (els.satelliteFetchButton) els.satelliteFetchButton.disabled = kind === "loading" || kind === "busy";
}

function scheduleSatelliteRefreshPoll(delayMs = 3000) {
  if (satelliteRefreshPollTimer) return;
  satelliteRefreshPollTimer = window.setTimeout(pollSatelliteRefreshStatus, delayMs);
}

function satelliteRefreshProgressMessage(refreshState = {}) {
  const startedMs = Date.parse(refreshState.startedAt || "");
  const elapsedMs = Number.isFinite(startedMs)
    ? Date.now() - startedMs
    : satelliteRefreshRequestedAt
      ? Date.now() - satelliteRefreshRequestedAt
      : Number(refreshState.elapsedMs || 0);
  const elapsedSeconds = Math.max(0, Math.round(elapsedMs / 1000));
  return `全量公开轨道、ACTIVE SATCAT 与分类轨道正在并行处理 · 已运行 ${elapsedSeconds} 秒`;
}

async function pollSatelliteRefreshStatus() {
  satelliteRefreshPollTimer = null;
  try {
    const response = await fetch("/api/satellites?status=1", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    satelliteRefreshPollFailureCount = 0;
    if (status.active) {
      updateSatelliteProgress(
        "busy",
        `卫星轨道后台刷新中，当前显示完整缓存 ${(status.cachedObjectCount || state.satellites.length).toLocaleString("zh-CN")} 个对象`,
        satelliteRefreshProgressMessage(status),
      );
      scheduleSatelliteRefreshPoll();
      return;
    }
    satelliteRefreshRequestedAt = 0;
    const result = status.lastRefresh || {};
    if (result.status === "success") {
      await loadSatellites(false);
      await loadRefreshHistory({ source: "satellite" });
      updateSatelliteProgress(
        "success",
        `卫星轨道刷新完成：${(result.objectCount || state.satellites.length).toLocaleString("zh-CN")} 个对象`,
        [result.message || `缓存时间 ${formatDateTime(result.fetchedAt)}`, state.satelliteRefreshClassificationSummary].filter(Boolean).join("；"),
      );
    } else {
      updateSatelliteProgress(
        "error",
        `卫星轨道刷新失败，继续显示完整缓存 ${state.satellites.length.toLocaleString("zh-CN")} 个对象`,
        result.message || "后台刷新未完成，请查看本地运行日志。",
      );
    }
  } catch (error) {
    satelliteRefreshPollFailureCount += 1;
    if (satelliteRefreshPollFailureCount <= 12) {
      updateSatelliteProgress(
        "busy",
        `卫星轨道后台刷新仍在运行，状态连接正在重试（${satelliteRefreshPollFailureCount}/12）`,
        error instanceof Error ? error.message : String(error),
      );
      scheduleSatelliteRefreshPoll(Math.min(15000, 3000 + satelliteRefreshPollFailureCount * 1000));
      return;
    }
    updateSatelliteProgress("error", "无法连接卫星轨道后台刷新服务", error instanceof Error ? error.message : String(error));
  }
}

function rebuildSatelliteCatalogWithCustomElements() {
  const merged = new Map((state.satelliteCatalogItems || []).map((item) => {
    const enriched = SATELLITE_IDENTITIES?.enrich?.(item) || item;
    return [String(enriched.id), enriched];
  }));
  for (const [id, custom] of state.satelliteCustomElementsById.entries()) {
    const catalogItem = merged.get(String(id)) || null;
    const customName = String(custom?.name || "").trim();
    const fallbackName = `NORAD ${id}`;
    merged.set(String(id), {
      ...catalogItem,
      ...custom,
      id: String(id),
      noradId: String(id),
      name: customName && customName !== fallbackName ? customName : (catalogItem?.name || fallbackName),
      internationalDesignator: custom.internationalDesignator || catalogItem?.internationalDesignator || "",
      objectType: catalogItem?.objectType || custom.objectType,
      objectTypeLabel: catalogItem?.objectTypeLabel || custom.objectTypeLabel || "用户轨道对象",
      objectClass: catalogItem?.objectClass || custom.objectClass || "ACTIVE_PAYLOAD",
      catalogClass: catalogItem?.catalogClass || custom.catalogClass || "ACTIVE_PAYLOAD",
      operationalState: catalogItem?.operationalState || custom.operationalState || "active",
      operationalStatusCode: catalogItem?.operationalStatusCode || custom.operationalStatusCode || "+",
      operationalStatusLabel: catalogItem?.operationalStatusLabel || "用户输入根数",
      owner: catalogItem?.owner || custom.owner || "USER",
      launchDate: catalogItem?.launchDate || custom.launchDate || "",
      elementSource: custom.elementSource || "用户输入 TLE / GP OMM",
      customOrbit: true,
      elementSets: Array.isArray(custom.elementSets) ? custom.elementSets : [],
    });
  }
  state.satellites = [...merged.values()];
  state.satelliteById = new Map(state.satellites.map((item) => [String(item.id), item]));
  state.satellitePayloadById = new Map();
  state.satellitePayloadSearchById = new Map();
  for (const item of state.satellites) {
    if (!isActiveSatellitePayloadItem(item)) continue;
    const profile = SATELLITE_PAYLOADS?.resolve(item) || null;
    if (profile) state.satellitePayloadById.set(String(item.id), profile);
  }
  state.satelliteSeriesById = SATELLITE_SERIES?.classifyCatalog?.(
    state.satellites.filter(isActiveSatellitePayloadItem),
    (item) => state.satellitePayloadById.get(String(item?.id || item?.noradId || "")) || null,
  ) || new Map();
  for (const item of state.satellites) {
    if (!isActiveSatellitePayloadItem(item)) continue;
    const profile = state.satellitePayloadById.get(String(item.id)) || null;
    const classification = state.satelliteSeriesById.get(String(item.id)) || null;
    const seriesKey = classification?.key || SATELLITE_SERIES?.classify(item, profile) || "UNCLASSIFIED";
    const seriesInfo = SATELLITE_SERIES?.describe?.(seriesKey) || null;
    const searchText = [
      profile?.constellation,
      profile?.sensor,
      profile?.service,
      ...(profile?.aliases || []),
      seriesKey,
      seriesInfo?.label,
      seriesInfo?.country,
      seriesInfo?.purpose,
      classification?.method,
      ...(seriesInfo?.aliases || []),
      item.customOrbit ? "USER CUSTOM TLE GP OMM 用户输入 自定义轨道" : "",
    ].filter(Boolean).join(" ").toUpperCase();
    if (searchText) state.satellitePayloadSearchById.set(String(item.id), searchText);
  }
  state.satellitePayloadSummary = SATELLITE_PAYLOADS?.summarize(state.satellites.filter(isActiveSatellitePayloadItem)) || null;
  state.satelliteCatalogCounts = countSatelliteCatalogItems(state.satellites);
  rebuildSatelliteConstellationCounts();
  renderCustomSatelliteElements();
}

function countSatelliteCatalogItems(items) {
  const counts = { included: items.length, active: 0, INACTIVE: 0, LEO: 0, MEO: 0, GEO: 0, HEO: 0, ACTIVE_PAYLOAD: 0, RETIRED_PAYLOAD: 0, ROCKET_BODY: 0, DEBRIS: 0, UNKNOWN: 0 };
  for (const item of items) {
    const orbitClass = String(item?.orbitClass || "");
    const objectClass = satelliteObjectClass(item);
    if (Object.hasOwn(counts, orbitClass)) counts[orbitClass] += 1;
    counts[objectClass] = (counts[objectClass] || 0) + 1;
    if (objectClass === "ACTIVE_PAYLOAD") counts.active += 1;
    if (objectClass === "RETIRED_PAYLOAD") counts.INACTIVE += 1;
  }
  return counts;
}

function importSatelliteElementText() {
  const text = String(els.satelliteElementInput?.value || "").trim();
  if (!SATELLITE_ELEMENT_INPUT) {
    setSatelliteElementNotice("error", "轨道输入模块未加载", "请重新启动软件后再试。");
    return;
  }
  const result = SATELLITE_ELEMENT_INPUT.parse(text, { format: els.satelliteElementFormatSelect?.value || "auto" });
  if (!result.satellites.length) {
    setSatelliteElementNotice("error", "没有识别到有效轨道", satelliteElementIssueText(result));
    return;
  }
  const incomingSets = result.satellites.reduce((sum, item) => sum + (item.elementSets?.length || 0), 0);
  const retainedSets = [...state.satelliteCustomElementsById.entries()]
    .filter(([id]) => !result.satellites.some((item) => String(item.id) === id))
    .reduce((sum, [, item]) => sum + (item.elementSets?.length || 0), 0);
  if (incomingSets + retainedSets > SATELLITE_ELEMENT_STORAGE_MAX_SETS) {
    setSatelliteElementNotice("error", "自定义历元数量过多", `最多保存 ${SATELLITE_ELEMENT_STORAGE_MAX_SETS.toLocaleString("zh-CN")} 组；本次导入后将达到 ${(incomingSets + retainedSets).toLocaleString("zh-CN")} 组。`);
    return;
  }
  const importedIds = [];
  for (const item of result.satellites) {
    const id = String(item.id);
    state.satelliteCustomElementsById.set(id, item);
    importedIds.push(id);
  }
  saveCustomSatelliteElements();
  state.satelliteElementMode = "current";
  state.satelliteHistoricalElementsById = new Map();
  state.satelliteHistorySource = null;
  rebuildSatelliteCatalogWithCustomElements();
  for (const id of importedIds) {
    const item = state.satelliteById.get(id);
    if (!item || state.selectedSatelliteIds.size >= SATELLITE_MAX_SELECTED) continue;
    state.selectedSatelliteIds.add(id);
    state.satelliteOrbitClasses.add(item.orbitClass);
    state.satelliteObjectClasses.add(satelliteObjectClass(item));
  }
  state.satelliteFocusedId = importedIds[0] || "";
  state.satellitePendingFitId = state.satelliteFocusedId;
  setSatelliteElementNotice(
    result.warnings.length ? "warn" : "ok",
    `已加入 ${result.satellites.length.toLocaleString("zh-CN")} 颗自定义卫星`,
    `${incomingSets.toLocaleString("zh-CN")} 组历元 · ${result.formats.join(" / ")}${result.warnings.length ? ` · ${result.warnings.length} 条校验警告` : " · 校验通过"}`,
  );
  satelliteSelectionChanged();
  if (isSatelliteMode()) activateSatelliteGlobeMode();
}

async function importSatelliteElementFile() {
  const file = els.satelliteElementFileInput?.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    if (els.satelliteElementInput) els.satelliteElementInput.value = text;
    if (els.satelliteElementFormatSelect) els.satelliteElementFormatSelect.value = satelliteElementFormatFromFile(file.name);
    importSatelliteElementText();
  } catch (error) {
    setSatelliteElementNotice("error", "轨道文件读取失败", error instanceof Error ? error.message : String(error));
  } finally {
    if (els.satelliteElementFileInput) els.satelliteElementFileInput.value = "";
  }
}

function satelliteElementFormatFromFile(name) {
  const extension = String(name || "").split(".").pop()?.toLowerCase();
  if (["tle", "2le", "3le"].includes(extension)) return "tle";
  if (["json", "csv", "kvn", "xml"].includes(extension)) return extension;
  return "auto";
}

function satelliteElementIssueText(result) {
  const issues = [...(result.errors || []), ...(result.warnings || [])];
  if (!issues.length) return "请检查 TLE 行号、NORAD 编号和 OMM 必填字段。";
  return issues.slice(0, 4).map((issue) => ({
    empty_input: "输入为空",
    unrecognized_format: "无法识别输入格式",
    no_valid_orbit_records: "没有可传播的轨道记录",
    invalid_tle_pair: "TLE 两行编号不匹配或字段不完整",
  })[issue] || issue).join("；");
}

function setSatelliteElementNotice(kind, title, detail) {
  state.satelliteElementNotice = { kind, title, detail };
  renderCustomSatelliteElements();
}

function renderCustomSatelliteElements() {
  const custom = [...state.satelliteCustomElementsById.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const setCount = custom.reduce((sum, item) => sum + (item.elementSets?.length || 0), 0);
  if (els.satelliteElementClearButton) els.satelliteElementClearButton.disabled = !custom.length;
  if (els.satelliteElementStatus) {
    const notice = state.satelliteElementNotice;
    els.satelliteElementStatus.dataset.state = notice?.kind || (custom.length ? "ok" : "idle");
    els.satelliteElementStatus.innerHTML = notice
      ? `<strong>${escapeHtml(notice.title)}</strong><span>${escapeHtml(notice.detail)}</span>`
      : `<strong>${custom.length ? `已保存 ${custom.length.toLocaleString("zh-CN")} 颗自定义卫星` : "尚未添加自定义轨道"}</strong><span>${custom.length.toLocaleString("zh-CN")} 颗卫星 · ${setCount.toLocaleString("zh-CN")} 组历元</span>`;
  }
  if (!els.satelliteElementList) return;
  els.satelliteElementList.innerHTML = custom.map((item) => {
    const sets = item.elementSets || [];
    const formats = [...new Set(sets.map((element) => element.sourceFormat).filter(Boolean))].join(" / ");
    const firstEpoch = sets[0]?.epoch || item.epoch;
    const lastEpoch = sets[sets.length - 1]?.epoch || item.epoch;
    const range = sets.length > 1
      ? `${formatTimeZoneDate(firstEpoch, "Asia/Shanghai")} → ${formatTimeZoneDate(lastEpoch, "Asia/Shanghai")}`
      : formatTimeZoneDate(lastEpoch, "Asia/Shanghai");
    return `<div class="satellite-element-item">
      <button type="button" data-custom-satellite-select="${escapeHtml(item.id)}" title="加入轨道层并定位">
        <strong>${escapeHtml(item.name)}</strong>
        <span>NORAD ${escapeHtml(item.noradId)} · ${escapeHtml(item.orbitClass)} · ${sets.length} 组历元 · ${escapeHtml(formats)}</span>
        <span>${escapeHtml(range)}</span>
      </button>
      <button class="satellite-element-delete" type="button" data-custom-satellite-delete="${escapeHtml(item.id)}" title="删除自定义根数" aria-label="删除 ${escapeHtml(item.name)}">×</button>
    </div>`;
  }).join("");
  els.satelliteElementList.querySelectorAll("[data-custom-satellite-select]").forEach((button) => {
    button.addEventListener("click", () => selectCustomSatelliteElement(button.dataset.customSatelliteSelect));
  });
  els.satelliteElementList.querySelectorAll("[data-custom-satellite-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteCustomSatelliteElement(button.dataset.customSatelliteDelete));
  });
}

function selectCustomSatelliteElement(id) {
  const item = state.satelliteById.get(String(id));
  if (!item) return;
  state.selectedSatelliteIds.add(String(id));
  state.satelliteOrbitClasses.add(item.orbitClass);
  state.satelliteObjectClasses.add(satelliteObjectClass(item));
  state.satelliteFocusedId = String(id);
  state.satellitePendingFitId = String(id);
  satelliteSelectionChanged();
  activateSatelliteGlobeMode();
}

function deleteCustomSatelliteElement(id) {
  const key = String(id);
  const removed = state.satelliteCustomElementsById.get(key);
  if (!removed) return;
  state.satelliteCustomElementsById.delete(key);
  saveCustomSatelliteElements();
  rebuildSatelliteCatalogWithCustomElements();
  pruneSatelliteSelection();
  setSatelliteElementNotice("ok", `已删除 ${removed.name}`, state.satelliteById.has(key) ? "已恢复目录自带轨道根数。" : "该自定义对象已从轨道层移除。");
  satelliteSelectionChanged();
}

function clearCustomSatelliteElements() {
  if (!state.satelliteCustomElementsById.size) return;
  state.satelliteCustomElementsById.clear();
  saveCustomSatelliteElements();
  rebuildSatelliteCatalogWithCustomElements();
  pruneSatelliteSelection();
  setSatelliteElementNotice("ok", "自定义轨道列表为空", "当前使用目录内提供的原始轨道根数；可继续粘贴 TLE 或 GP/OMM 数据。");
  satelliteSelectionChanged();
}

function restoreCustomSatelliteElements() {
  if (!SATELLITE_ELEMENT_INPUT) return;
  try {
    const stored = JSON.parse(localStorage.getItem(SATELLITE_ELEMENT_STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return;
    const restored = new Map();
    let totalSets = 0;
    for (const item of stored) {
      const ommRecords = (item?.elementSets || []).map((element) => element?.omm).filter(Boolean);
      if (!ommRecords.length || totalSets + ommRecords.length > SATELLITE_ELEMENT_STORAGE_MAX_SETS) continue;
      const parsed = SATELLITE_ELEMENT_INPUT.parse(JSON.stringify(ommRecords), { format: "json" });
      const normalized = parsed.satellites[0];
      if (!normalized) continue;
      const sourceByEpoch = new Map((item.elementSets || []).map((element) => [element.epoch || element.omm?.EPOCH, element]));
      normalized.elementSets = normalized.elementSets.map((element) => ({ ...element, ...(sourceByEpoch.get(element.epoch) || {}) }));
      normalized.elementSource = item.elementSource || normalized.elementSource;
      restored.set(String(normalized.id), normalized);
      totalSets += normalized.elementSets.length;
    }
    state.satelliteCustomElementsById = restored;
  } catch {
    state.satelliteCustomElementsById = new Map();
  }
}

function saveCustomSatelliteElements() {
  try {
    const records = [...state.satelliteCustomElementsById.values()].map((item) => ({
      id: item.id,
      name: item.name,
      elementSource: item.elementSource,
      elementSets: (item.elementSets || []).map((element) => ({
        epoch: element.epoch,
        sourceFormat: element.sourceFormat,
        checksumValid: element.checksumValid,
        omm: element.omm,
      })),
    }));
    localStorage.setItem(SATELLITE_ELEMENT_STORAGE_KEY, JSON.stringify(records));
  } catch {
    setSatelliteElementNotice("warn", "轨道已加入当前会话", "浏览器本地存储空间不足，重新打开软件后可能需要再次导入。");
  }
}

function initializeSatelliteWorker() {
  if (!state.satellites.length) return;
  while (satelliteWorkers.length < SATELLITE_WORKER_COUNT) {
    const workerIndex = satelliteWorkers.length;
    const worker = new Worker("/frontend/satellite-orbit-worker.js?v=orbit-worker-14", { type: "module" });
    worker.addEventListener("message", (event) => handleSatelliteWorkerMessage(event, workerIndex));
    worker.addEventListener("error", (event) => {
      const detail = [event.message, event.filename, event.lineno ? `line ${event.lineno}` : ""].filter(Boolean).join(" · ");
      console.error(`Satellite orbit worker ${workerIndex + 1} failed`, detail || event.error || event);
      satelliteWorkerReady = false;
      satelliteFramePending = false;
      satellitePendingFrame = null;
      updateSatelliteProgress("error", `SGP4 传播线程 ${workerIndex + 1} 异常`, detail || "轨道传播线程无法启动");
    });
    satelliteWorkers.push(worker);
  }
  syncSatelliteWorkerCatalogs();
  startSatelliteAnimationLoop();
}

function syncSatelliteWorkerCatalogs() {
  if (!satelliteWorkers.length) return;
  satelliteWorkerReady = false;
  satelliteWorkerReadyCount = 0;
  satelliteWorkerAcceptedCount = 0;
  satelliteWorkerRejectedCount = 0;
  satelliteFramePending = false;
  satellitePendingFrame = null;
  satelliteLastPropagatedTimeMs = NaN;
  state.satellitePropagationErrorIds = new Set();
  state.satelliteOrbitPaths.clear();
  satelliteOrbitMissingIds = new Set();
  satelliteOrbitPathRetryCount = 0;
  satelliteLastPathAt = 0;
  satelliteLastPathSimulationMs = NaN;
  satellitePathRevision += 1;
  satelliteGpuOrbitRevision += 1;
  satelliteWorkerGeneration += 1;
  satelliteWorkerAssignments = Array.from({ length: satelliteWorkers.length }, () => []);
  satelliteWorkerIndexById = new Map();
  const selectedItems = state.satelliteVisibleIds
    .map((id) => {
      const item = state.satelliteById.get(String(id));
      if (!item) return null;
      const historical = state.satelliteHistoricalElementsById.get(String(id));
      if (state.satelliteElementMode === "historical" && !historical && !item.customOrbit) return null;
      return {
        ...item,
        ...(historical || {}),
        omm: historical?.omm || item.omm,
        needsHeading: state.satellitePayloadById.get(String(id))?.kind === "imaging",
      };
    })
    .filter(Boolean);
  state.satellitePositions = new Map(
    selectedItems
      .map((item) => [String(item.id), state.satellitePositions.get(String(item.id))])
      .filter(([, position]) => Boolean(position)),
  );
  selectedItems.forEach((item, index) => {
    const workerIndex = index % satelliteWorkers.length;
    satelliteWorkerAssignments[workerIndex].push(item);
    satelliteWorkerIndexById.set(String(item.id), workerIndex);
  });
  satelliteWorkers.forEach((worker, workerIndex) => {
    worker.postMessage({
      type: "catalog",
      requestId: ++satelliteWorkerRequestId,
      generation: satelliteWorkerGeneration,
      satellites: satelliteWorkerAssignments[workerIndex],
    });
  });
}

function handleSatelliteWorkerMessage(event, workerIndex) {
  const message = event.data || {};
  if (message.type === "catalog-ready") {
    if (message.generation !== satelliteWorkerGeneration) return;
    satelliteWorkerAcceptedCount += Math.max(0, Number(message.accepted) || 0);
    satelliteWorkerRejectedCount += Math.max(0, Number(message.rejected) || 0);
    satelliteWorkerReadyCount += 1;
    if (satelliteWorkerReadyCount < satelliteWorkers.length) return;
    satelliteWorkerReady = true;
    const accepted = satelliteWorkerAcceptedCount;
    if (els.satelliteControls) {
      els.satelliteControls.dataset.workerReady = "true";
      els.satelliteControls.dataset.workerAccepted = String(accepted);
      els.satelliteControls.dataset.workerRejected = String(satelliteWorkerRejectedCount);
    }
    updateSatelliteSelectionStatus();
    requestSatellitePropagation(true);
    return;
  }
  if (message.type !== "frame") return;
  if (!satellitePendingFrame || message.requestId !== satellitePendingFrame.requestId) return;
  satellitePendingFrame.receivedWorkers.add(workerIndex);
  if (message.positionBuffer instanceof ArrayBuffer) {
    satellitePendingFrame.positionChunks.push({
      workerIndex,
      data: new Float32Array(message.positionBuffer),
      count: Math.max(0, Number(message.positionCount) || 0),
      stride: Math.max(5, Number(message.positionStride) || 5),
    });
  } else if (Array.isArray(message.positions)) {
    satellitePendingFrame.legacyPositions.push(...message.positions);
  }
  satellitePendingFrame.workerComputeMs.push(Math.max(0, Number(message.computeMs) || 0));
  if (Array.isArray(message.errors)) satellitePendingFrame.errors.push(...message.errors.map(String));
  if (message.includedPaths) {
    if (message.pathBuffer instanceof ArrayBuffer && Array.isArray(message.pathDescriptors)) {
      satellitePendingFrame.pathChunks.push({
        data: new Float32Array(message.pathBuffer),
        descriptors: message.pathDescriptors,
        stride: Math.max(6, Number(message.pathStride) || SATELLITE_PATH_POINT_STRIDE),
      });
    }
    satellitePendingFrame.paths.push(...(message.paths || []));
  }
  if (satellitePendingFrame.receivedWorkers.size < satellitePendingFrame.expectedWorkers.size) return;
  satelliteFramePending = false;
  const requestLatencyMs = performance.now() - satellitePendingFrame.startedAt;
  const workerComputeMs = Math.max(0, ...satellitePendingFrame.workerComputeMs);
  satellitePerformanceStats.completions += 1;
  satellitePerformanceStats.latencyEmaMs = satellitePerformanceStats.latencyEmaMs
    ? satellitePerformanceStats.latencyEmaMs * 0.82 + requestLatencyMs * 0.18
    : requestLatencyMs;
  satellitePerformanceStats.workerComputeEmaMs = satellitePerformanceStats.workerComputeEmaMs
    ? satellitePerformanceStats.workerComputeEmaMs * 0.82 + workerComputeMs * 0.18
    : workerComputeMs;
  satelliteLastPropagatedTimeMs = satellitePendingFrame.timeMs;
  state.satelliteInterpolationDurationSec = satellitePendingFrame.interpolationDurationSec || 1;
  state.satellitePositions = updateSatellitePositionMap(satellitePendingFrame);
  state.satellitePropagationErrorIds = new Set(satellitePendingFrame.errors);
  updateSatelliteSelectionStatus();
  syncSatelliteTimeUi();
  satelliteGpuPositionRevision += 1;
  satelliteGpuCoverageRevision += 1;
  satelliteCoverageRenderSignature = "";
  if (satellitePendingFrame.includePaths) {
    const requestedPathIds = satellitePendingFrame.pathIds || new Set();
    const receivedPaths = new Map();
    for (const id of [...state.satelliteOrbitPaths.keys()]) {
      if (!requestedPathIds.has(id)) state.satelliteOrbitPaths.delete(id);
    }
    for (const chunk of satellitePendingFrame.pathChunks || []) {
      for (const descriptor of chunk.descriptors) {
        const id = String(descriptor?.id || "");
        const offset = Math.max(0, Number(descriptor?.offset) || 0);
        const pointCount = Math.max(0, Number(descriptor?.pointCount) || 0);
        const end = offset + pointCount * chunk.stride;
        if (!requestedPathIds.has(id) || end > chunk.data.length) continue;
        const path = chunk.data.subarray(offset, end);
        if (satelliteOrbitPathHasRenderableSegment(path)) receivedPaths.set(id, path);
      }
    }
    for (const path of satellitePendingFrame.paths) {
      const id = String(path.id || "");
      if (requestedPathIds.has(id) && satelliteOrbitPathHasRenderableSegment(path.points)) receivedPaths.set(id, path.points);
    }
    const missingIds = new Set();
    for (const id of requestedPathIds) {
      const nextPath = receivedPaths.get(id);
      if (nextPath) {
        state.satelliteOrbitPaths.set(id, nextPath);
        continue;
      }
      const previousPath = state.satelliteOrbitPaths.get(id);
      if (!satelliteOrbitPathHasRenderableSegment(previousPath)) {
        state.satelliteOrbitPaths.set(id, new Float32Array(0));
        missingIds.add(id);
      }
    }
    satelliteOrbitMissingIds = missingIds;
    if (satelliteOrbitPathRetrySelectionRevision !== satelliteSelectionRevision) {
      satelliteOrbitPathRetrySelectionRevision = satelliteSelectionRevision;
      satelliteOrbitPathRetryCount = 0;
    }
    if (missingIds.size && satelliteOrbitPathRetryCount < 2) {
      satelliteOrbitPathRetryCount += 1;
      satelliteForcePathQueued = true;
    } else if (!missingIds.size) {
      satelliteOrbitPathRetryCount = 0;
    }
    satellitePathRevision += 1;
    satelliteGpuOrbitRevision += 1;
    invalidateSatelliteStaticLayers({ orbit: true });
  }
  satellitePendingFrame = null;
  if (state.satellitePendingFitId) {
    const point = state.satellitePositions.get(state.satellitePendingFitId);
    if (point) {
      fitSatellitePosition(point);
      state.satellitePendingFitId = "";
    }
  }
  if (isInteractiveRender()) scheduleDraw();
  else {
    drawSatelliteOverlay();
    if (!state.satellitePlaybackRate) requestSatelliteThreeDraw();
  }
  if (satelliteForcePathQueued) {
    satelliteForcePathQueued = false;
    requestSatellitePropagation(true);
  }
}

function startSatelliteAnimationLoop() {
  if (satelliteAnimationFrame) return;
  const tick = (now) => {
    satelliteAnimationFrame = requestAnimationFrame(tick);
    satelliteAnimationTickCount += 1;
    if (state.satellitePlaybackRate) {
      state.satelliteTimeMs = state.satellitePlaybackAnchorSimMs + (performance.now() - state.satellitePlaybackAnchorRealMs) * state.satellitePlaybackRate;
    }
    updateSatelliteDualClock(false);
    if (state.satellitePlaybackRate && state.satelliteLayerEnabled && isGlobeLayer() && globeRendererState && els.canvas) {
      const rect = els.canvas.getBoundingClientRect();
      if (!drawFramePending) renderThreeGlobe(rect.width, rect.height, true, { satelliteOnly: true });
      if (satelliteLastPresentationAt) {
        const elapsed = now - satelliteLastPresentationAt;
        satellitePresentationFrameEmaMs = satellitePresentationFrameEmaMs
          ? satellitePresentationFrameEmaMs * 0.88 + elapsed * 0.12
          : elapsed;
      }
      satelliteLastPresentationAt = now;
      if (els.satelliteCanvas) {
        els.satelliteCanvas.dataset.presentationFps = satellitePresentationFrameEmaMs > 0
          ? (1000 / satellitePresentationFrameEmaMs).toFixed(1)
          : "0.0";
      }
      if (now - globeSurfaceLastDrawAt >= GLOBE_SURFACE_FRAME_INTERVAL_MS) {
        globeSurfaceLastDrawAt = now;
        drawGlobeSurfaceAnnotations(rect.width, rect.height);
      }
      const overlayInterval = state.satelliteVisibleIds.length > 4000 ? 50 : 1000 / 30;
      if (now - satelliteLastOverlayAt >= overlayInterval) {
        satelliteLastOverlayAt = now;
        drawSatelliteOverlay();
      }
    }
    if (!state.satellitePlaybackRate && satelliteLastPresentationAt) {
      satelliteLastPresentationAt = 0;
      satellitePresentationFrameEmaMs = 0;
    }
    if (satelliteFramePending && now - Number(satellitePendingFrame?.startedAt || now) > Number(satellitePendingFrame?.timeoutMs || 8000)) {
      satelliteFramePending = false;
      satellitePendingFrame = null;
      satelliteForcePathQueued = true;
    }
    const simulationTimeChanged = !Number.isFinite(satelliteLastPropagatedTimeMs)
      || Math.abs(state.satelliteTimeMs - satelliteLastPropagatedTimeMs) >= 0.5;
    const frameInterval = satelliteFrameIntervalMs();
    const frameLag = now - satelliteLastFrameAt;
    if (state.satelliteLayerEnabled && isGlobeLayer() && state.satelliteVisibleIds.length && simulationTimeChanged && frameLag >= frameInterval) {
      satelliteLastFrameAt = !satelliteLastFrameAt || frameLag > frameInterval * 2.5
        ? now
        : satelliteLastFrameAt + frameInterval;
      requestSatellitePropagation(false);
    }
    if (state.satellitePlaybackRate && now - satelliteLastUiAt >= 250) {
      satelliteLastUiAt = now;
      syncSatelliteTimeUi();
    }
  };
  satelliteAnimationFrame = requestAnimationFrame(tick);
}

function requestSatellitePropagation(forcePaths = false) {
  if (!satelliteWorkerReady || !satelliteWorkers.length || !state.satelliteLayerEnabled || !isGlobeLayer()) return;
  const ids = visibleSelectedSatelliteIds();
  if (!ids.length) {
    state.satellitePositions.clear();
    state.satelliteOrbitPaths.clear();
    satelliteOrbitMissingIds = new Set();
    satelliteOrbitPathRetryCount = 0;
    invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
    drawSatelliteOverlay();
    return;
  }
  if (satelliteFramePending) {
    satelliteRequestSkipPendingCount += 1;
    if (forcePaths) satelliteForcePathQueued = true;
    return;
  }
  const requestNow = performance.now();
  const requestedPathIds = state.satelliteOrbitLinesEnabled ? satelliteOrbitPathIds(ids) : [];
  const simulatedPathAgeMs = Number.isFinite(satelliteLastPathSimulationMs)
    ? Math.abs(state.satelliteTimeMs - satelliteLastPathSimulationMs)
    : Number.POSITIVE_INFINITY;
  const pathRefreshDue = state.satelliteOrbitLinesEnabled && requestedPathIds.length > 0
    && requestNow - satelliteLastPathAt >= satellitePathRefreshIntervalMs(ids.length)
    && simulatedPathAgeMs >= satellitePathRefreshSimulationMs(ids.length);
  const includePaths = Boolean(state.satelliteOrbitLinesEnabled && (forcePaths
    || pathRefreshDue
    || requestedPathIds.some((id) => !state.satelliteOrbitPaths.has(String(id)))));
  if (includePaths) {
    satelliteLastPathAt = requestNow;
    satelliteLastPathSimulationMs = state.satelliteTimeMs;
  }
  const expectedWorkers = new Set(satelliteWorkerAssignments.map((workerItems, index) => workerItems.length ? index : -1).filter((index) => index >= 0));
  if (!expectedWorkers.size) return;
  const pathIdSet = includePaths ? new Set(requestedPathIds) : new Set();
  satelliteFramePending = true;
  satellitePerformanceStats.requests += 1;
  satelliteWorkerRequestId += 1;
  const requestId = satelliteWorkerRequestId;
  satellitePendingFrame = {
    requestId,
    includePaths,
    timeMs: state.satelliteTimeMs,
    startedAt: requestNow,
    expectedWorkers,
    receivedWorkers: new Set(),
    positionChunks: [],
    legacyPositions: [],
    errors: [],
    paths: [],
    pathChunks: [],
    pathIds: new Set(requestedPathIds.map(String)),
    workerComputeMs: [],
    interpolationDurationSec: satelliteInterpolationWindowSec(),
    timeoutMs: satellitePathRequestTimeoutMs(ids.length, includePaths),
  };
  const pathSampleCounts = satellitePathSampleCounts(ids.length);
  for (const workerIndex of expectedWorkers) {
    const pathIds = satelliteWorkerAssignments[workerIndex]
      .map((item) => String(item.id))
      .filter((id) => pathIdSet.has(id));
    satelliteWorkers[workerIndex].postMessage({
      type: "propagate",
      requestId,
      timeMs: state.satelliteTimeMs,
      includePaths,
      pathIds,
      pathSampleCounts,
      interpolationDurationSec: satellitePendingFrame.interpolationDurationSec,
    });
  }
}

function updateSatellitePositionMap(frame) {
  const previous = state.satellitePositions;
  const next = new Map();
  for (const chunk of frame.positionChunks || []) {
    const workerItems = satelliteWorkerAssignments[chunk.workerIndex] || [];
    const stride = Math.max(5, Number(chunk.stride) || 5);
    const count = Math.min(chunk.count, workerItems.length, Math.floor(chunk.data.length / stride));
    for (let index = 0; index < count; index += 1) {
      const offset = index * stride;
      const lon = chunk.data[offset];
      const lat = chunk.data[offset + 1];
      const altitudeKm = chunk.data[offset + 2];
      if (![lon, lat, altitudeKm].every(Number.isFinite)) continue;
      const id = String(workerItems[index].id);
      const position = previous.get(id) || { id };
      position.lon = lon;
      position.lat = lat;
      position.altitudeKm = altitudeKm;
      position.headingDeg = Number.isFinite(chunk.data[offset + 3]) ? chunk.data[offset + 3] : 0;
      position.groundSpeedKmS = Number.isFinite(chunk.data[offset + 4]) ? chunk.data[offset + 4] : 0;
      if (stride >= SATELLITE_POSITION_STRIDE) {
        position.eciXKm = chunk.data[offset + 5];
        position.eciYKm = chunk.data[offset + 6];
        position.eciZKm = chunk.data[offset + 7];
        position.eciVxKmS = chunk.data[offset + 8];
        position.eciVyKmS = chunk.data[offset + 9];
        position.eciVzKmS = chunk.data[offset + 10];
        position.nextEciXKm = chunk.data[offset + 11];
        position.nextEciYKm = chunk.data[offset + 12];
        position.nextEciZKm = chunk.data[offset + 13];
        position.nextEciVxKmS = chunk.data[offset + 14];
        position.nextEciVyKmS = chunk.data[offset + 15];
        position.nextEciVzKmS = chunk.data[offset + 16];
      }
      position.frameTimeMs = frame.timeMs;
      position.interpolationDurationSec = frame.interpolationDurationSec;
      next.set(id, position);
    }
  }
  for (const position of frame.legacyPositions || []) next.set(String(position.id), position);
  return next;
}

function satelliteOrbitPathIds(ids) {
  return SATELLITE_ORBIT_POLICY?.normalizePathIds
    ? SATELLITE_ORBIT_POLICY.normalizePathIds(ids)
    : [...new Set((ids || []).map(String).filter(Boolean))];
}

function satellitePathRefreshIntervalMs(count = state.satelliteVisibleIds.length) {
  return SATELLITE_ORBIT_POLICY?.refreshWallMs?.(count) || SATELLITE_PATH_INTERVAL_MS;
}

function satellitePathRefreshSimulationMs(count = state.satelliteVisibleIds.length) {
  return SATELLITE_ORBIT_POLICY?.refreshSimulationMs?.(count) || 5 * 60 * 1000;
}

function satellitePathRequestTimeoutMs(count, includePaths) {
  return SATELLITE_ORBIT_POLICY?.requestTimeoutMs?.(count, includePaths) || (includePaths ? 30000 : 8000);
}

function satelliteFrameIntervalMs() {
  const count = state.satelliteVisibleIds.length;
  const rate = Math.abs(Number(state.satellitePlaybackRate) || 0);
  let interval = count > 15000
    ? 650
    : count > 8000
      ? SATELLITE_MASS_FRAME_INTERVAL_MS
      : count > 4000
        ? 350
        : count > 1000
          ? SATELLITE_DENSE_FRAME_INTERVAL_MS
          : count > 180
            ? SATELLITE_MEDIUM_FRAME_INTERVAL_MS
            : SATELLITE_FAST_FRAME_INTERVAL_MS;
  if (rate >= 3600) interval = Math.min(interval, count > 8000 ? 250 : 100);
  else if (rate >= 600) interval = Math.min(interval, count > 8000 ? 350 : 160);
  return interval;
}

function satelliteInterpolationWindowSec() {
  const rate = Number(state.satellitePlaybackRate) || 0;
  if (!rate) return 1;
  const simulatedSeconds = satelliteFrameIntervalMs() / 1000 * rate;
  const direction = Math.sign(simulatedSeconds) || 1;
  return direction * clamp(Math.abs(simulatedSeconds) * 1.45, 2, 1800);
}

function satellitePathSampleCounts(count) {
  return SATELLITE_ORBIT_POLICY?.sampleCounts?.(count)
    || { LEO: 256, MEO: 384, GEO: 448, HEO: 1024 };
}

function activateSatelliteGlobeMode() {
  if (state.baseLayer === GLOBE_LAYER) return;
  state.baseLayer = GLOBE_LAYER;
  state.view.zoom = clamp(Math.min(state.view.zoom, 0.5), GLOBE_MIN_ZOOM, MAX_ZOOM);
  syncLayerButtons();
  flatSatelliteViewKey = "";
  draw();
}

function setSatelliteSimulationTime(timeMs, pause = true, explicit = true) {
  if (!Number.isFinite(timeMs)) return;
  state.satelliteTimeMs = timeMs;
  state.satelliteTimeExplicit = Boolean(explicit);
  if (pause) state.satellitePlaybackRate = 0;
  state.satellitePlaybackAnchorRealMs = performance.now();
  state.satellitePlaybackAnchorSimMs = timeMs;
  state.satelliteOrbitPaths.clear();
  satelliteOrbitMissingIds = new Set();
  satelliteOrbitPathRetryCount = 0;
  invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
  syncSatelliteControls();
  requestSatellitePropagation(true);
}

function stepSatelliteSimulation(seconds) {
  setSatelliteSimulationTime(state.satelliteTimeMs + seconds * 1000, true);
}

function setSatellitePlayback(rate) {
  const previousRate = state.satellitePlaybackRate;
  const current = state.satellitePlaybackRate
    ? state.satellitePlaybackAnchorSimMs + (performance.now() - state.satellitePlaybackAnchorRealMs) * state.satellitePlaybackRate
    : state.satelliteTimeMs;
  state.satelliteTimeMs = current;
  state.satellitePlaybackRate = Number(rate) || 0;
  state.satellitePlaybackAnchorRealMs = performance.now();
  state.satellitePlaybackAnchorSimMs = current;
  syncSatelliteControls();
  requestSatellitePropagation(Boolean(previousRate && !state.satellitePlaybackRate));
}

async function applySatelliteTimeInput() {
  const raw = String(els.satelliteTimeInput?.value || "").trim();
  const parsed = SATELLITE_REFERENCE?.beijingDateTimeToUtcMs
    ? SATELLITE_REFERENCE.beijingDateTimeToUtcMs(raw)
    : Date.parse(`${raw}+08:00`);
  if (!Number.isFinite(parsed)) return;
  if (parsed > Date.now() + 5 * 60 * 1000) {
    restoreCurrentSatelliteElements({ timeMs: parsed, futureProjection: true });
    updateSatelliteHistoryStatus("warn", "未来日期没有已发布的准确历史根数；当前显示明确标注为最新根数外推。 ");
    return;
  }
  const ids = state.satelliteVisibleIds.slice();
  if (!ids.length) {
    updateSatelliteHistoryStatus("error", "请先选择至少一颗卫星，再加载该日轨道。 ");
    return;
  }
  if (els.satelliteDateApplyButton) els.satelliteDateApplyButton.disabled = true;
  updateSatelliteHistoryStatus("", `正在从 Space-Track 下载 ${ids.length.toLocaleString("zh-CN")} 颗卫星最接近所选时刻的历史根数…`);
  try {
    const response = await fetch("/api/satellites/history", {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetTimeMs: parsed,
        ids,
        identity: String(els.satelliteHistoryIdentityInput?.value || "").trim(),
        password: String(els.satelliteHistoryPasswordInput?.value || ""),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    state.satelliteHistoricalElementsById = new Map((payload.elements || []).map((item) => [String(item.id), item]));
    state.satelliteElementMode = "historical";
    state.satelliteHistorySource = payload.source || null;
    setSatelliteSimulationTime(parsed, true);
    syncSatelliteWorkerCatalogs();
    if (isSatelliteMode()) {
      renderList();
      renderNotamIdSearchResults();
    }
    const missingCount = Array.isArray(payload.missingIds) ? payload.missingIds.length : 0;
    updateSatelliteHistoryStatus(
      missingCount ? "warn" : "",
      `${payload.source?.message || "历史根数已加载"}${missingCount ? ` 未找到 ${missingCount.toLocaleString("zh-CN")} 颗。` : ""}`,
    );
  } catch (error) {
    updateSatelliteHistoryStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    if (els.satelliteDateApplyButton) els.satelliteDateApplyButton.disabled = false;
    syncSatelliteControls();
  }
}

function restoreCurrentSatelliteElements(options = {}) {
  state.satelliteElementMode = "current";
  state.satelliteHistoricalElementsById = new Map();
  state.satelliteHistorySource = options.futureProjection
    ? { name: "当前根数外推", targetTime: new Date(options.timeMs).toISOString(), futureProjection: true }
    : null;
  const timeMs = Number.isFinite(Number(options.timeMs)) ? Number(options.timeMs) : Date.now();
  setSatelliteSimulationTime(
    timeMs,
    true,
    Boolean(options.futureProjection || Number.isFinite(Number(options.timeMs))),
  );
  if (satelliteWorkers.length) syncSatelliteWorkerCatalogs();
  if (!options.futureProjection) updateSatelliteHistoryStatus("", "已恢复最近一次本地缓存中的当前轨道根数。 ");
}

function updateSatelliteHistoryStatus(kind, message) {
  if (!els.satelliteHistoryStatus) return;
  els.satelliteHistoryStatus.classList.toggle("warn", kind === "warn");
  els.satelliteHistoryStatus.classList.toggle("error", kind === "error");
  els.satelliteHistoryStatus.textContent = message;
}

function updateSatelliteDualClock(force = false) {
  if (!els.satelliteDualClock) return;
  const visible = state.satelliteDualClockEnabled && state.satelliteLayerEnabled && state.baseLayer === GLOBE_LAYER;
  els.satelliteDualClock.hidden = !visible;
  if (!visible) return;
  const second = Math.floor(state.satelliteTimeMs / 1000);
  if (!force && second === satelliteClockLastSecond) return;
  satelliteClockLastSecond = second;
  if (els.satelliteBeijingClock) els.satelliteBeijingClock.textContent = formatFixedZoneClock(state.satelliteTimeMs, 8);
  if (els.satelliteUtcClock) els.satelliteUtcClock.textContent = formatFixedZoneClock(state.satelliteTimeMs, 0);
}

function formatFixedZoneClock(timeMs, offsetHours) {
  const date = new Date(Number(timeMs) + offsetHours * 3600000);
  if (!Number.isFinite(date.getTime())) return "----/--/-- --:--:--";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function syncSatelliteControls() {
  syncSourceToggleButton(els.satelliteLayerToggle, state.satelliteLayerEnabled);
  syncSourceToggleButton(els.satelliteOrbitLinesToggle, state.satelliteOrbitLinesEnabled);
  syncSourceToggleButton(els.satelliteLabelsToggle, state.satelliteLabelsEnabled);
  syncSourceToggleButton(els.satelliteAllLabelsToggle, state.satelliteAllLabelsEnabled);
  syncSourceToggleButton(els.satelliteDualClockToggle, state.satelliteDualClockEnabled);
  syncSourceToggleButton(els.satelliteCoverageToggle, state.satelliteCoverageEnabled);
  syncSourceToggleButton(els.satelliteImagingToggle, state.satelliteImagingEnabled);
  syncSourceToggleButton(els.satelliteCommunicationToggle, state.satelliteCommunicationEnabled);
  syncSourceToggleButton(els.satelliteSwathEditToggle, state.satelliteSwathEditEnabled);
  document.querySelectorAll("[data-satellite-swath-mode]").forEach((button) => {
    const active = button.dataset.satelliteSwathMode === state.satelliteSwathMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const swathContext = focusedSatelliteImagingContext();
  syncSatelliteSwathAngleInputs(swathContext);
  if (els.satelliteImagingOpacityInput && document.activeElement !== els.satelliteImagingOpacityInput) {
    els.satelliteImagingOpacityInput.value = String(Math.round(state.satelliteImagingOpacity * 100));
  }
  if (els.satelliteImagingOpacityValue) els.satelliteImagingOpacityValue.textContent = `${Math.round(state.satelliteImagingOpacity * 100)}%`;
  if (els.satelliteCommunicationOpacityInput && document.activeElement !== els.satelliteCommunicationOpacityInput) {
    els.satelliteCommunicationOpacityInput.value = String(Math.round(state.satelliteCommunicationOpacity * 100));
  }
  if (els.satelliteCommunicationOpacityValue) els.satelliteCommunicationOpacityValue.textContent = `${Math.round(state.satelliteCommunicationOpacity * 100)}%`;
  if (els.satelliteOrbitWidthInput && document.activeElement !== els.satelliteOrbitWidthInput) {
    els.satelliteOrbitWidthInput.value = String(state.satelliteOrbitLineWidth);
  }
  if (els.satelliteOrbitWidthValue) els.satelliteOrbitWidthValue.textContent = `${formatSatelliteStyleValue(state.satelliteOrbitLineWidth)} px`;
  if (els.satellitePointSizeInput && document.activeElement !== els.satellitePointSizeInput) {
    els.satellitePointSizeInput.value = String(state.satellitePointSize);
  }
  if (els.satellitePointSizeValue) els.satellitePointSizeValue.textContent = `${formatSatelliteStyleValue(state.satellitePointSize)} px`;
  if (els.satelliteLabelSizeInput && document.activeElement !== els.satelliteLabelSizeInput) {
    els.satelliteLabelSizeInput.value = String(state.satelliteLabelSize);
  }
  if (els.satelliteLabelSizeValue) els.satelliteLabelSizeValue.textContent = `${Math.round(state.satelliteLabelSize)} px`;
  document.querySelectorAll("[data-satellite-orbit]").forEach((button) => {
    const active = state.satelliteOrbitClasses.has(button.dataset.satelliteOrbit);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-satellite-object]").forEach((button) => {
    const active = state.satelliteObjectClasses.has(button.dataset.satelliteObject);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  document.querySelectorAll("[data-satellite-reference]").forEach((button) => {
    const active = button.dataset.satelliteReference === state.satelliteReferenceFrame;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (els.satelliteReferenceStatus) {
    els.satelliteReferenceStatus.textContent = state.satelliteReferenceFrame === "inertial"
      ? "轨道面保持惯性方向，地球按模拟时刻自转"
      : "地球不动，轨道与卫星相对地表运行";
  }
  syncSatelliteConstellationControls();
  const counts = state.satelliteCatalogCounts || state.satellitePayload?.counts || {};
  if (els.satelliteLeoCount) els.satelliteLeoCount.textContent = String(counts.LEO || 0);
  if (els.satelliteMeoCount) els.satelliteMeoCount.textContent = String(counts.MEO || 0);
  if (els.satelliteGeoCount) els.satelliteGeoCount.textContent = String(counts.GEO || 0);
  if (els.satelliteHeoCount) els.satelliteHeoCount.textContent = Number(counts.HEO || 0).toLocaleString("zh-CN");
  if (els.satelliteActiveCount) els.satelliteActiveCount.textContent = Number(counts.ACTIVE_PAYLOAD ?? counts.active ?? 0).toLocaleString("zh-CN");
  if (els.satelliteInactiveCount) els.satelliteInactiveCount.textContent = Number(counts.INACTIVE || 0).toLocaleString("zh-CN");
  if (els.satelliteBulkSelectionApplyButton) els.satelliteBulkSelectionApplyButton.disabled = !state.satellites.length;
  if (els.satelliteRocketBodyCount) els.satelliteRocketBodyCount.textContent = Number(counts.ROCKET_BODY || 0).toLocaleString("zh-CN");
  if (els.satelliteDebrisCount) els.satelliteDebrisCount.textContent = Number(counts.DEBRIS || 0).toLocaleString("zh-CN");
  if (els.satelliteUnknownCount) els.satelliteUnknownCount.textContent = Number(counts.UNKNOWN || 0).toLocaleString("zh-CN");
  if (els.satelliteSpeedSelect && document.activeElement !== els.satelliteSpeedSelect) {
    els.satelliteSpeedSelect.value = String(state.satellitePlaybackMagnitude);
  }
  els.satelliteReverseButton?.classList.toggle("active", state.satellitePlaybackRate < 0);
  els.satellitePauseButton?.classList.toggle("active", state.satellitePlaybackRate === 0);
  els.satelliteForwardButton?.classList.toggle("active", state.satellitePlaybackRate > 0);
  updateSatelliteSelectionStatus();
  renderSatelliteSwathPlannerStatus(swathContext);
  if (els.satellitePayloadStatus) {
    const summary = state.satellitePayloadSummary;
    const selectedImaging = state.satelliteImagingIds.length;
    const selectedCommunication = state.satelliteCommunicationIds.length;
    els.satellitePayloadStatus.textContent = summary
      ? `逐星审计 ${Number(summary.audited || 0).toLocaleString("zh-CN")} 颗（公开/监管 ${Number(summary.published || 0).toLocaleString("zh-CN")} · 工程估算 ${Number(summary.estimated || 0).toLocaleString("zh-CN")}）· 成像 ${summary.imaging.toLocaleString("zh-CN")} · 通信 ${summary.communications.toLocaleString("zh-CN")} · 当前绘制 ${selectedImaging.toLocaleString("zh-CN")} / ${selectedCommunication.toLocaleString("zh-CN")} · 审计版 ${SATELLITE_PAYLOADS?.AUDIT_VERSION || "--"}`
      : "等待载荷参数库";
  }
  syncSatelliteTimeUi();
  updateSatelliteDualClock(true);
}

function setSatelliteSwathMode(mode) {
  const nextMode = mode === "angle-fixed" ? "angle-fixed" : "ground-fixed";
  const context = focusedSatelliteImagingContext();
  if (state.satelliteSwathMode === nextMode && (nextMode !== "angle-fixed" || context?.override?.mode === "angle-fixed")) return;
  if (context) {
    if (nextMode === "angle-fixed") {
      state.satelliteSwathTargets.set(context.id, {
        mode: "angle-fixed",
        rollDeg: normalizeSatelliteSwathAngle(context.solution?.rollDeg),
        pitchDeg: normalizeSatelliteSwathAngle(context.solution?.pitchDeg),
      });
    } else if (nextMode === "ground-fixed") {
      state.satelliteSwathTargets.set(context.id, {
        mode: "ground-fixed",
        lon: context.target.lon,
        lat: context.target.lat,
        headingDeg: Number(context.position.headingDeg) || 0,
      });
    }
    state.satelliteCoverageGeometryById.delete(context.id);
  }
  state.satelliteSwathMode = nextMode;
  satelliteGpuCoverageRevision += 1;
  invalidateSatelliteStaticLayers({ coverage: true });
  syncSatelliteControls();
  drawSatelliteOverlay();
}

function normalizeSatelliteSwathAngle(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(clamp(numeric, -45, 45) * 10) / 10;
}

function formatSignedSatelliteAngle(value) {
  const normalized = normalizeSatelliteSwathAngle(value);
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(1)}`;
}

function satelliteDisplayedSwathRoll(context = focusedSatelliteImagingContext()) {
  if (!context) return 0;
  if (context.override?.mode === "angle-fixed") return normalizeSatelliteSwathAngle(context.override.rollDeg);
  return normalizeSatelliteSwathAngle(context.solution?.rollDeg);
}

function syncSatelliteSwathAngleInputs(context = focusedSatelliteImagingContext()) {
  const rollDeg = satelliteDisplayedSwathRoll(context);
  if (els.satelliteSwathRollInput) {
    els.satelliteSwathRollInput.disabled = !context;
    if (document.activeElement !== els.satelliteSwathRollInput) els.satelliteSwathRollInput.value = rollDeg.toFixed(1);
    els.satelliteSwathRollInput.setAttribute("aria-valuetext", `${formatSignedSatelliteAngle(rollDeg)}°`);
  }
  if (els.satelliteSwathRollNumber) {
    els.satelliteSwathRollNumber.disabled = !context;
    if (document.activeElement !== els.satelliteSwathRollNumber) els.satelliteSwathRollNumber.value = rollDeg.toFixed(1);
  }
}

function setSatelliteSwathRollAngle(value) {
  const context = focusedSatelliteImagingContext();
  if (!context) {
    syncSatelliteControls();
    return;
  }
  const rollDeg = normalizeSatelliteSwathAngle(value);
  const pitchDeg = context.override?.mode === "angle-fixed"
    ? normalizeSatelliteSwathAngle(context.override.pitchDeg)
    : 0;
  state.satelliteSwathMode = "angle-fixed";
  state.satelliteSwathTargets.set(context.id, { mode: "angle-fixed", rollDeg, pitchDeg });
  state.satelliteCoverageGeometryById.delete(context.id);
  satelliteGpuCoverageRevision += 1;
  satelliteCoverageRenderSignature = "";
  invalidateSatelliteStaticLayers({ coverage: true });
  syncSatelliteControls();
  drawSatelliteOverlay();
}

function satelliteImagingTarget(id, position) {
  const override = state.satelliteSwathTargets.get(String(id));
  if (!override) return null;
  if (override.mode === "angle-fixed") {
    return satelliteTargetFromPointing(position, override);
  }
  return Number.isFinite(Number(override.lon)) && Number.isFinite(Number(override.lat))
    ? {
      lon: normalizeLon(Number(override.lon)),
      lat: clamp(Number(override.lat), -90, 90),
      headingDeg: Number.isFinite(Number(override.headingDeg)) ? Number(override.headingDeg) : undefined,
    }
    : null;
}

function satelliteTargetFromPointing(position, pointing) {
  const latDeg = Number(position?.lat);
  const lonDeg = Number(position?.lon);
  const altitudeKm = Math.max(0, Number(position?.altitudeKm) || 0);
  const rollDeg = Number(pointing?.rollDeg);
  const pitchDeg = Number(pointing?.pitchDeg);
  if (![latDeg, lonDeg, altitudeKm, rollDeg, pitchDeg].every(Number.isFinite) || altitudeKm <= 0) return null;
  const lat = toRad(latDeg);
  const lon = toRad(lonDeg);
  const heading = toRad(Number(position?.headingDeg) || 0);
  const aKm = WGS84_A / 1000;
  const bKm = WGS84_B / 1000;
  const eccentricitySq = WGS84_F * (2 - WGS84_F);
  const sinLat = Math.sin(lat);
  const primeVerticalKm = aKm / Math.sqrt(1 - eccentricitySq * sinLat * sinLat);
  const origin = {
    x: (primeVerticalKm + altitudeKm) * Math.cos(lat) * Math.cos(lon),
    y: (primeVerticalKm + altitudeKm) * Math.cos(lat) * Math.sin(lon),
    z: (primeVerticalKm * (1 - eccentricitySq) + altitudeKm) * sinLat,
  };
  const up = { x: Math.cos(lat) * Math.cos(lon), y: Math.cos(lat) * Math.sin(lon), z: Math.sin(lat) };
  const east = { x: -Math.sin(lon), y: Math.cos(lon), z: 0 };
  const north = { x: -Math.sin(lat) * Math.cos(lon), y: -Math.sin(lat) * Math.sin(lon), z: Math.cos(lat) };
  const along = {
    x: north.x * Math.cos(heading) + east.x * Math.sin(heading),
    y: north.y * Math.cos(heading) + east.y * Math.sin(heading),
    z: north.z * Math.cos(heading) + east.z * Math.sin(heading),
  };
  const right = {
    x: east.x * Math.cos(heading) - north.x * Math.sin(heading),
    y: east.y * Math.cos(heading) - north.y * Math.sin(heading),
    z: east.z * Math.cos(heading) - north.z * Math.sin(heading),
  };
  const rollTangent = Math.tan(toRad(clamp(rollDeg, -89, 89)));
  const pitchTangent = Math.tan(toRad(clamp(pitchDeg, -89, 89)));
  const rawDirection = {
    x: -up.x + along.x * pitchTangent + right.x * rollTangent,
    y: -up.y + along.y * pitchTangent + right.y * rollTangent,
    z: -up.z + along.z * pitchTangent + right.z * rollTangent,
  };
  const directionLength = Math.hypot(rawDirection.x, rawDirection.y, rawDirection.z);
  if (!(directionLength > 0)) return null;
  const direction = {
    x: rawDirection.x / directionLength,
    y: rawDirection.y / directionLength,
    z: rawDirection.z / directionLength,
  };
  const quadraticA = (direction.x ** 2 + direction.y ** 2) / aKm ** 2 + direction.z ** 2 / bKm ** 2;
  const quadraticB = 2 * ((origin.x * direction.x + origin.y * direction.y) / aKm ** 2 + origin.z * direction.z / bKm ** 2);
  const quadraticC = (origin.x ** 2 + origin.y ** 2) / aKm ** 2 + origin.z ** 2 / bKm ** 2 - 1;
  const discriminant = quadraticB ** 2 - 4 * quadraticA * quadraticC;
  if (!(discriminant >= 0)) return null;
  const root = Math.sqrt(discriminant);
  const distances = [(-quadraticB - root) / (2 * quadraticA), (-quadraticB + root) / (2 * quadraticA)]
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  if (!distances.length) return null;
  const distance = distances[0];
  const hit = {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
  const horizontal = Math.hypot(hit.x, hit.y);
  const secondEccentricitySq = (aKm ** 2 - bKm ** 2) / bKm ** 2;
  const theta = Math.atan2(hit.z * aKm, horizontal * bKm);
  const targetLat = Math.atan2(
    hit.z + secondEccentricitySq * bKm * Math.sin(theta) ** 3,
    horizontal - eccentricitySq * aKm * Math.cos(theta) ** 3,
  );
  return {
    lon: normalizeLon(toDeg(Math.atan2(hit.y, hit.x))),
    lat: clamp(toDeg(targetLat), -90, 90),
  };
}

function focusedSatelliteImagingContext() {
  const id = String(state.satelliteFocusedId || "");
  const item = state.satelliteById.get(id);
  const profile = state.satellitePayloadById.get(id);
  const storedPosition = state.satellitePositions.get(id);
  if (!id || !item || profile?.kind !== "imaging" || !storedPosition) return null;
  const position = satellitePredictedPosition(storedPosition);
  const dimensions = SATELLITE_PAYLOADS?.imagingDimensions(profile, position);
  if (!dimensions) return null;
  const override = state.satelliteSwathTargets.get(id) || null;
  const target = satelliteImagingTarget(id, position) || {
    lon: normalizeLon(Number(position.lon)),
    lat: clamp(Number(position.lat), -90, 90),
  };
  const solution = SATELLITE_PAYLOADS?.imagingPointingSolution(position, target) || null;
  return { id, item, profile, position, dimensions, target, solution, override };
}

function renderSatelliteSwathPlannerStatus(context = focusedSatelliteImagingContext()) {
  syncSatelliteSwathAngleInputs(context);
  if (els.satelliteSwathResetButton) els.satelliteSwathResetButton.disabled = !context?.override;
  if (els.satelliteSwathEditToggle) {
    els.satelliteSwathEditToggle.disabled = !context;
    els.satelliteSwathEditToggle.title = context ? "在地球表面拖动当前卫星的成像区" : "先在地图或列表中选择一颗有公开幅宽的遥感卫星";
  }
  if (!els.satelliteSwathStatus) return;
  if (!context) {
    els.satelliteSwathStatus.dataset.state = "idle";
    els.satelliteSwathStatus.innerHTML = "<strong>未选择成像卫星</strong><span>幅宽 -- · 长度 --</span><span>侧摆 -- · 离轴 --</span><span>地表偏移 --</span>";
    return;
  }
  const solution = context.solution;
  const displayRollDeg = context.override?.mode === "angle-fixed"
    ? normalizeSatelliteSwathAngle(context.override.rollDeg)
    : Number(solution?.rollDeg) || 0;
  const displayPitchDeg = context.override?.mode === "angle-fixed"
    ? normalizeSatelliteSwathAngle(context.override.pitchDeg)
    : Number(solution?.pitchDeg) || 0;
  const sideLabel = Math.abs(displayRollDeg) < 0.005 ? "天底" : displayRollDeg > 0 ? "右侧" : "左侧";
  const stateLabel = solution?.reachable ? "可达" : "超出几何地平线";
  const modeLabel = context.override?.mode === "angle-fixed" ? "固定角度" : context.override ? "固定地面" : "天底";
  const nextHtml = `
    <strong>${escapeHtml(context.item.name)} · ${escapeHtml(modeLabel)} · ${escapeHtml(stateLabel)}</strong>
    <span>幅宽 ${formatKm(context.dimensions.widthKm)} · 长度 ${formatKm(context.dimensions.lengthKm)}</span>
    <span>侧摆 ${escapeHtml(sideLabel)} ${formatSignedSatelliteAngle(displayRollDeg)}° · 离轴 ${(solution?.offNadirDeg || 0).toFixed(2)}°</span>
    <span>沿轨指向 ${formatSignedSatelliteAngle(displayPitchDeg)}° · 地表偏移 ${formatKm(solution?.groundOffsetKm || 0)}</span>
  `;
  els.satelliteSwathStatus.dataset.state = solution?.reachable ? "ok" : "warn";
  if (els.satelliteSwathStatus.innerHTML !== nextHtml) els.satelliteSwathStatus.innerHTML = nextHtml;
}

function formatSatelliteStyleValue(value) {
  const rounded = Math.round(Number(value) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, "");
}

function syncSatelliteObjectSelectionButton(button, objectClass) {
  if (!button) return;
  const ids = satelliteObjectIds(objectClass);
  const allSelected = ids.length > 0 && ids.every((id) => state.selectedSatelliteIds.has(id));
  button.disabled = !ids.length;
  button.classList.toggle("active", allSelected);
  button.setAttribute("aria-pressed", allSelected ? "true" : "false");
}

function updateSatelliteSelectionStatus() {
  if (!els.satelliteSelectionStatus) return;
  const requested = visibleSelectedSatelliteIds().length;
  const drawable = state.satellitePositions.size;
  const unavailable = Math.max(
    state.satellitePropagationErrorIds.size + satelliteWorkerRejectedCount,
    requested - drawable,
  );
  const bulk = requested >= SATELLITE_GPU_BULK_THRESHOLD ? " · GPU 批量模式" : "";
  const orbitText = state.satelliteOrbitLinesEnabled && requested
    ? ` · 轨道 ${satelliteDrawableOrbitCount.toLocaleString("zh-CN")}/${requested.toLocaleString("zh-CN")}`
    : "";
  const unavailableText = satelliteWorkerReady && unavailable
    ? ` · 当前历元不可传播 ${unavailable.toLocaleString("zh-CN")} 颗`
    : "";
  const text = `已选 ${state.selectedSatelliteIds.size.toLocaleString("zh-CN")} 颗 · 当前绘制 ${drawable.toLocaleString("zh-CN")} 颗${orbitText}${unavailableText}${bulk}`;
  if (els.satelliteSelectionStatus.textContent !== text) els.satelliteSelectionStatus.textContent = text;
}

function isInactiveSatelliteItem(item) {
  return satelliteObjectClass(item) === "RETIRED_PAYLOAD";
}

function satelliteObjectClass(item) {
  if (item?.objectClass) return String(item.objectClass);
  if (item?.catalogClass === "INACTIVE" || item?.operationalState === "inactive" || item?.operationalStatusCode === "-") return "RETIRED_PAYLOAD";
  return "ACTIVE_PAYLOAD";
}

function isActiveSatellitePayloadItem(item) {
  return satelliteObjectClass(item) === "ACTIVE_PAYLOAD";
}

function satelliteCategoryEnabled(item) {
  if (!item) return false;
  return state.satelliteOrbitClasses.has(item.orbitClass) && state.satelliteObjectClasses.has(satelliteObjectClass(item));
}

function satelliteDisplayColor(item) {
  return SATELLITE_OBJECT_COLORS[satelliteObjectClass(item)] || SATELLITE_CLASS_COLORS[item?.orbitClass] || "#dff7ff";
}

function satelliteInactiveIds() {
  return state.satellites.filter(isInactiveSatelliteItem).map((item) => String(item.id));
}

function satelliteObjectIds(objectClass) {
  return state.satellites.filter((item) => satelliteObjectClass(item) === objectClass).map((item) => String(item.id));
}

function satelliteConstellationKey(item) {
  if (!isActiveSatellitePayloadItem(item)) return "";
  const catalogClassification = state.satelliteSeriesById.get(String(item?.id || item?.noradId || ""));
  if (catalogClassification?.key) return catalogClassification.key;
  const name = String(item?.name || "").toUpperCase();
  const profile = state.satellitePayloadById.get(String(item?.id));
  const constellation = String(profile?.constellation || "").toUpperCase();
  const resolvedSeries = SATELLITE_SERIES?.classify(item, profile) || "";
  if (resolvedSeries) return resolvedSeries;
  if (name.includes("STARLINK") || constellation === "STARLINK") return "STARLINK";
  if (name.includes("ONEWEB") || constellation.includes("ONEWEB")) return "ONEWEB";
  if (/(?:KUIPER|AMAZON LEO)/.test(name) || constellation.includes("AMAZON LEO")) return "AMAZON_LEO";
  if (/(?:GUOWANG|HULIANWANG|HULIANWAN|GAOGUI|DIGUI)/.test(name) || constellation.includes("GUOWANG") || constellation.includes("星网")) return "GUOWANG";
  if (name.includes("QIANFAN") || constellation.includes("QIANFAN")) return "QIANFAN";
  if (/^NAVSTAR /.test(name) || /^GPS (?:BIIR|BIIF|III)/.test(name)) return "GPS";
  if (/\[GLONASS-(?:M|K|K1|K2)\]/.test(name) || /^GLONASS/.test(name)) return "GLONASS";
  if (/^BEIDOU-/.test(name)) return "BEIDOU";
  if (/GALILEO/.test(name) || /^GSAT\d+/.test(name)) return "GALILEO";
  if (/\b(?:TJS|TONGXIN JISHU SHIYAN)(?:-|\s|$)/.test(name)) return "TJS";
  if (/\b(?:CHINASAT|ZHONGXING)(?:-|\s)/.test(name)) return "CHINASAT";
  if (/\bYAOGAN(?:-|\s)/.test(name)) return "YAOGAN";
  if (/\bGAOFEN(?:-|\s)/.test(name)) return "GAOFEN";
  if (/\b(?:ZIYUAN|CBERS)(?:-|\s)/.test(name)) return "ZIYUAN";
  if (/\bFENGYUN(?:-|\s)/.test(name)) return "FENGYUN";
  if (/\bRESURS(?:-|\s)/.test(name)) return "RESURS";
  if (/\bKANOPUS(?:-|\s)/.test(name)) return "KANOPUS";
  if (/\bKONDOR(?:-|\s)/.test(name)) return "KONDOR";
  if (/\bMETEOR(?:-|\s)/.test(name)) return "METEOR";
  if (/\bGONETS(?:-|\s)/.test(name)) return "GONETS";
  if (/\bLUCH(?:-|\s)/.test(name)) return "LUCH";
  if (/\bEXPRESS(?:-|\s)/.test(name)) return "EXPRESS";
  if (/\bYAMAL(?:-|\s)/.test(name)) return "YAMAL";
  if (/\bLANDSAT(?:-|\s)/.test(name)) return "LANDSAT";
  if (/\b(?:COSMO-SKYMED|CSG-)/.test(name)) return "COSMO_SKYMED";
  if (/\b(?:RADARSAT|RCM-)/.test(name)) return "RADARSAT";
  if (/\bPLEIADES(?:-|\s)/.test(name)) return "PLEIADES";
  if (/\bKOMPSAT(?:-|\s)/.test(name)) return "KOMPSAT";
  if (/^(?:FLOCK |SKYSAT-|PELICAN-|TANAGER-|DOVE[- ]3$)/.test(name)) return "PLANET";
  if (/^(?:WORLDVIEW-|GEOEYE |LEGION )/.test(name)) return "VANTOR";
  if (/^GLOBAL-/.test(name)) return "BLACKSKY";
  if (/^ICEYE-X/.test(name)) return "ICEYE";
  if (/^CAPELLA-/.test(name)) return "CAPELLA";
  if (/^UMBRA-/.test(name)) return "UMBRA";
  if (/^NUSAT-/.test(name)) return "SATELLOGIC";
  if (/^STRIX-/.test(name)) return "SYNSPECTIVE";
  if (/^QPS-SAR-/.test(name)) return "IQPS";
  if (/^FIREFLY-/.test(name)) return "PIXXEL";
  if (/^GRUS-/.test(name)) return "AXELSPACE";
  if (name.includes("JILIN") || constellation.includes("吉林一号")) return "JILIN";
  if (name.includes("SENTINEL") || constellation.startsWith("SENTINEL")) return "SENTINEL";
  return "";
}

function satelliteRetiredConstellationKey(item) {
  if (isActiveSatellitePayloadItem(item)) return "";
  const resolvedSeries = SATELLITE_SERIES?.classify(item, null) || "";
  return SATELLITE_RETIRED_SERIES_KEYS.has(resolvedSeries) ? resolvedSeries : "";
}

function rebuildSatelliteConstellationCounts() {
  const counts = new Map();
  const idsByKey = new Map();
  for (const item of state.satellites) {
    const key = satelliteConstellationKey(item) || satelliteRetiredConstellationKey(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
    if (!idsByKey.has(key)) idsByKey.set(key, []);
    idsByKey.get(key).push(String(item.id));
  }
  state.satelliteConstellationCounts = counts;
  state.satelliteConstellationIdsByKey = idsByKey;
}

function satelliteConstellationIds(key) {
  return state.satelliteConstellationIdsByKey.get(String(key || "")) || [];
}

function syncSatelliteConstellationControls() {
  document.querySelectorAll("[data-satellite-constellation]").forEach((button) => {
    const key = String(button.dataset.satelliteConstellation || "");
    const total = state.satelliteConstellationCounts.get(key) || 0;
    const selected = state.satelliteSelectedConstellationCounts.get(key) || 0;
    const active = total > 0 && selected === total;
    const partial = selected > 0 && selected < total;
    button.classList.toggle("active", active);
    button.classList.toggle("partial", partial);
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("data-selected-count", String(selected));
    const info = SATELLITE_SERIES?.describe?.(key) || null;
    const selectionHint = partial
      ? `已选择 ${selected.toLocaleString("zh-CN")}/${total.toLocaleString("zh-CN")}；按住 Shift 点击补全，再次 Shift 点击取消`
      : "按住 Shift 点击可与其他星座多选；再次 Shift 点击可取消";
    button.title = info ? `${info.country} · ${info.purpose}\n${selectionHint}` : selectionHint;
    button.disabled = !total;
    const count = button.querySelector("[data-satellite-constellation-count]");
    if (count) {
      const identitySummary = SATELLITE_IDENTITIES?.summary?.(key) || null;
      count.textContent = identitySummary?.physicalInOrbit > total
        ? `${total.toLocaleString("zh-CN")}/${identitySummary.physicalInOrbit.toLocaleString("zh-CN")}`
        : total.toLocaleString("zh-CN");
    }
  });
}

function toggleSatelliteConstellation(key, options = {}) {
  const ids = satelliteConstellationIds(String(key || ""));
  if (!ids.length) return;
  const append = Boolean(options.append);
  const exactSelection = state.selectedSatelliteIds.size === ids.length && ids.every((id) => state.selectedSatelliteIds.has(id));
  const remove = append ? ids.every((id) => state.selectedSatelliteIds.has(id)) : exactSelection;
  const next = append ? new Set(state.selectedSatelliteIds) : new Set();
  if (remove && append) {
    for (const id of ids) next.delete(id);
  } else if (!remove) {
    for (const id of ids.slice(0, SATELLITE_MAX_SELECTED)) next.add(id);
  }
  if (state.satelliteElementMode === "historical") {
    state.satelliteElementMode = "current";
    state.satelliteHistoricalElementsById = new Map();
    state.satelliteHistorySource = null;
    updateSatelliteHistoryStatus("warn", "卫星选择已改变，已恢复当前根数；如需历史回放请重新加载该日轨道。 ");
  }
  if (remove && !append) {
    next.clear();
  } else {
    for (const id of ids) {
      const item = state.satelliteById.get(String(id));
      if (item) state.satelliteObjectClasses.add(satelliteObjectClass(item));
    }
  }
  state.selectedSatelliteIds = next;
  state.satelliteFocusedId = "";
  if (els.satelliteConstellationStatus) {
    els.satelliteConstellationStatus.textContent = remove
      ? `当前未显示该系列。按住 Ctrl 或 Shift 可继续调整系列组合。`
      : `当前系列：${options.label || key} · ${ids.length.toLocaleString("zh-CN")} 颗。按住 Ctrl 或 Shift 可组合多个系列，重复选择可取消。`;
  }
  satelliteSelectionChanged();
  if (!remove) requestAnimationFrame(() => fitSelectedSatelliteOrbits());
}

function toggleAllInactiveSatellites() {
  toggleAllSatelliteObjects("RETIRED_PAYLOAD");
}

function toggleAllSatelliteObjects(objectClass) {
  const ids = satelliteObjectIds(objectClass);
  if (!ids.length) return;
  const remove = ids.every((id) => state.selectedSatelliteIds.has(id));
  const next = new Set(state.selectedSatelliteIds);
  if (remove) {
    for (const id of ids) next.delete(id);
  } else {
    state.satelliteObjectClasses.add(objectClass);
    for (const id of ids) {
      if (next.size >= SATELLITE_MAX_SELECTED) break;
      next.add(id);
    }
  }
  state.selectedSatelliteIds = next;
  state.satelliteFocusedId = "";
  if (els.satelliteConstellationStatus) {
    const label = ({ RETIRED_PAYLOAD: "退役卫星", ROCKET_BODY: "火箭体", DEBRIS: "在轨残骸", UNKNOWN: "未知对象" })[objectClass] || "空间对象";
    els.satelliteConstellationStatus.textContent = remove
      ? `已移除 ${ids.length.toLocaleString("zh-CN")} 个${label}`
      : `已加入 ${ids.length.toLocaleString("zh-CN")} 个${label}；不计入在役星座按钮`;
  }
  satelliteSelectionChanged();
}

function applySatelliteBulkSelection() {
  if (!state.satellites.length) {
    if (!state.satelliteLoading) loadSatellites(false);
    return;
  }
  const mode = String(els.satelliteBulkSelectionSelect?.value || "DEFAULTS");
  if (mode === "DEFAULTS") {
    selectDefaultSatellites();
    return;
  }
  const items = mode === "ALL"
    ? state.satellites
    : mode === "FILTERS"
      ? state.satellites.filter((item) => satelliteCategoryEnabled(item))
      : state.satellites.filter((item) => satelliteObjectClass(item) === mode);
  const selected = items.slice(0, SATELLITE_MAX_SELECTED);
  state.selectedSatelliteIds = new Set(selected.map((item) => String(item.id)));
  if (mode !== "FILTERS") {
    state.satelliteOrbitClasses = new Set(selected.map((item) => item.orbitClass).filter(Boolean));
    state.satelliteObjectClasses = new Set(selected.map((item) => satelliteObjectClass(item)));
  }
  state.satelliteFocusedId = "";
  const labels = {
    ACTIVE_PAYLOAD: "全部在役卫星",
    RETIRED_PAYLOAD: "全部退役卫星",
    ROCKET_BODY: "全部火箭体",
    DEBRIS: "全部在轨残骸",
    FILTERS: "当前轨道范围与对象类型筛选结果",
    ALL: "完整空间对象目录",
  };
  if (els.satelliteConstellationStatus) {
    els.satelliteConstellationStatus.textContent = `当前批量视图：${labels[mode] || "批量目录"} · ${selected.length.toLocaleString("zh-CN")} 个对象。可继续筛选、加入搜索结果或清空选择。`;
  }
  satelliteSelectionChanged();
}

function syncSatelliteTimeUi() {
  if (els.satelliteTimeInput && document.activeElement !== els.satelliteTimeInput) {
    els.satelliteTimeInput.value = formatBeijingDateTimeInput(state.satelliteTimeMs);
  }
  if (!els.satelliteEpochStatus) return;
  const selectedCount = state.satelliteVisibleIds.length;
  const activeEpochs = state.satelliteVisibleIds
    .map((id) => Date.parse(satelliteActiveElement(state.satelliteById.get(String(id)))?.epoch || ""))
    .filter(Number.isFinite);
  const maxEpoch = activeEpochs.length ? Math.max(...activeEpochs) : NaN;
  const maxDays = activeEpochs.length
    ? Math.max(...activeEpochs.map((epochMs) => Math.abs(state.satelliteTimeMs - epochMs))) / 86400000
    : 0;
  const newestEpoch = Number.isFinite(maxEpoch) ? new Date(maxEpoch).toISOString() : "";
  const onlyPosition = selectedCount === 1 ? state.satellitePositions.get(state.satelliteVisibleIds[0]) : null;
  const predictedPosition = onlyPosition ? satellitePredictedPosition(onlyPosition) : null;
  const subpointText = predictedPosition
    ? ` · 星下点 ${Number(predictedPosition.lat).toFixed(4)}°, ${Number(predictedPosition.lon).toFixed(4)}°`
    : "";
  const warning = maxDays > 7 || Boolean(state.satelliteHistorySource?.futureProjection);
  els.satelliteEpochStatus.classList.toggle("warn", warning);
  const customCount = state.satelliteVisibleIds.filter((id) => state.satelliteById.get(String(id))?.customOrbit).length;
  const sourceLabel = customCount === selectedCount && selectedCount
    ? "用户输入多历元"
    : customCount ? "目录与用户输入混合根数"
      : state.satelliteElementMode === "historical" ? "Space-Track 历史根数"
        : state.satelliteHistorySource?.futureProjection ? "当前根数未来外推" : "最近缓存根数";
  els.satelliteEpochStatus.textContent = selectedCount
    ? `模拟：北京时间 ${formatFixedZoneClock(state.satelliteTimeMs, 8)} · UTC ${formatFixedZoneClock(state.satelliteTimeMs, 0)} · ${sourceLabel}历元：${formatTimeZoneDate(newestEpoch, "Asia/Shanghai")} · 最大外推 ${formatSatelliteOffset(maxDays)}${subpointText}${warning ? "（远离历元，位置不确定性明显增大）" : ""}`
    : "请选择卫星；历史与未来位置按当前 OMM 根数双向外推。";
}

function formatBeijingDateTimeInput(timeMs) {
  if (!Number.isFinite(timeMs)) return "";
  return new Date(timeMs + 8 * 60 * 60 * 1000).toISOString().slice(0, 19);
}

function formatSatelliteOffset(days) {
  if (days < 1 / 24) return `${Math.round(days * 1440)} 分钟`;
  if (days < 1) return `${(days * 24).toFixed(1)} 小时`;
  return `${days.toFixed(days < 10 ? 1 : 0)} 天`;
}

function pruneSatelliteSelection() {
  state.selectedSatelliteIds = new Set([...state.selectedSatelliteIds].filter((id) => state.satelliteById.has(String(id))).slice(0, SATELLITE_MAX_SELECTED));
}

function restoreSatelliteSelection() {
  if (state.selectedSatelliteIds.size) return;
  try {
    const stored = JSON.parse(localStorage.getItem(SATELLITE_SELECTION_STORAGE_KEY) || "[]");
    state.selectedSatelliteIds = new Set((Array.isArray(stored) ? stored : []).map(String).filter((id) => state.satelliteById.has(id)).slice(0, SATELLITE_MAX_SELECTED));
  } catch {
    state.selectedSatelliteIds.clear();
  }
}

function saveSatelliteSelection() {
  try {
    localStorage.setItem(SATELLITE_SELECTION_STORAGE_KEY, JSON.stringify([...state.selectedSatelliteIds]));
  } catch {
    // The selected set still remains available for the current session.
  }
}

function selectDefaultSatellites(options = {}) {
  if (!state.satellites.length) {
    if (!state.satelliteLoading) loadSatellites(false);
    return;
  }
  const patterns = [
    /^ISS \(ZARYA\)$/i, /TIANHE|CSS \(TIANHE\)/i, /HST/i, /^TERRA$/i, /^AQUA$/i, /LANDSAT 9/i,
    /SENTINEL-2A/i, /NOAA 20/i, /SUOMI NPP/i, /FENGYUN 3/i, /GPS BIIR-2|NAVSTAR/i,
    /GALILEO.*GSAT/i, /BEIDOU|COMPASS/i, /GLONASS/i, /QZS-6|QZS-5/i, /GOES 18/i,
    /HIMAWARI-9/i, /METEOSAT-12/i, /FENGYUN 4/i, /TDRS/i,
  ];
  const selected = new Set();
  for (const pattern of patterns) {
    const match = state.satellites.find((item) => isActiveSatellitePayloadItem(item) && satelliteCategoryEnabled(item) && pattern.test(item.name));
    if (match) selected.add(match.id);
  }
  for (const orbitClass of ["LEO", "MEO", "GEO"]) {
    if (!state.satelliteOrbitClasses.has(orbitClass)) continue;
    const fallback = state.satellites
      .filter((candidate) => isActiveSatellitePayloadItem(candidate) && candidate.orbitClass === orbitClass && !/^\d{4}-\d{3}[A-Z0-9]+$/i.test(candidate.name))
      .slice(0, 8);
    for (const item of fallback) selected.add(item.id);
  }
  state.selectedSatelliteIds = new Set([...selected].slice(0, SATELLITE_MAX_SELECTED));
  state.satelliteFocusedId = [...state.selectedSatelliteIds][0] || "";
  if (!options.silent) satelliteSelectionChanged();
  else saveSatelliteSelection();
}

function selectFilteredSatellites() {
  const query = state.notamIdSearch.trim().toUpperCase();
  if (!query) {
    if (els.satelliteSelectionStatus) els.satelliteSelectionStatus.textContent = "请先输入卫星名称、NORAD 编号或国际编号。";
    return;
  }
  const next = new Set(state.selectedSatelliteIds);
  for (const item of satelliteSearchMatches(query)) {
    if (next.size >= SATELLITE_MAX_SELECTED) break;
    next.add(item.id);
    state.satelliteOrbitClasses.add(item.orbitClass);
    state.satelliteObjectClasses.add(satelliteObjectClass(item));
  }
  state.selectedSatelliteIds = next;
  satelliteSelectionChanged();
}

function toggleSatelliteSelection(id, options = {}) {
  const key = String(id);
  if (!state.satelliteById.has(key)) return;
  if (state.selectedSatelliteIds.has(key)) state.selectedSatelliteIds.delete(key);
  else if (state.selectedSatelliteIds.size < SATELLITE_MAX_SELECTED) {
    const item = state.satelliteById.get(key);
    state.satelliteOrbitClasses.add(item?.orbitClass);
    state.satelliteObjectClasses.add(satelliteObjectClass(item));
    state.selectedSatelliteIds.add(key);
  }
  state.satelliteFocusedId = state.selectedSatelliteIds.has(key) ? key : "";
  if (options.fit && state.satelliteFocusedId) {
    const point = state.satellitePositions.get(key);
    if (point) fitSatellitePosition(point);
    else state.satellitePendingFitId = key;
  }
  satelliteSelectionChanged();
}

function satelliteSelectionChanged() {
  saveSatelliteSelection();
  for (const id of [...state.satelliteOrbitPaths.keys()]) {
    if (!state.selectedSatelliteIds.has(id)) state.satelliteOrbitPaths.delete(id);
  }
  satelliteDrawableOrbitCount = 0;
  rebuildSatelliteSelectionCaches();
  invalidateSatelliteStaticLayers({ orbit: true, coverage: true });
  syncSatelliteControls();
  renderList();
  renderNotamIdSearchResults();
  if (satelliteWorkers.length) syncSatelliteWorkerCatalogs();
  else initializeSatelliteWorker();
  drawSatelliteOverlay();
}

function visibleSelectedSatelliteIds() {
  return state.satelliteVisibleIds;
}

function rebuildSatelliteSelectionCaches() {
  const visible = [];
  const imaging = [];
  const communication = [];
  const selectedConstellationCounts = new Map();
  for (const id of state.selectedSatelliteIds) {
    const key = String(id);
    const item = state.satelliteById.get(key);
    const constellationKey = satelliteConstellationKey(item) || satelliteRetiredConstellationKey(item);
    if (constellationKey) selectedConstellationCounts.set(constellationKey, (selectedConstellationCounts.get(constellationKey) || 0) + 1);
    if (!satelliteCategoryEnabled(item)) continue;
    visible.push(key);
    const profile = state.satellitePayloadById.get(key);
    if (profile?.kind === "imaging") imaging.push(key);
    else if (profile?.kind === "communications") communication.push(key);
  }
  state.satelliteVisibleIds = visible;
  state.satelliteImagingIds = imaging;
  state.satelliteCommunicationIds = communication;
  state.satelliteSelectedConstellationCounts = selectedConstellationCounts;
  let epochMin = Infinity;
  let epochMax = -Infinity;
  for (const id of visible) {
    const epochMs = Date.parse(state.satelliteById.get(id)?.epoch);
    if (!Number.isFinite(epochMs)) continue;
    epochMin = Math.min(epochMin, epochMs);
    epochMax = Math.max(epochMax, epochMs);
  }
  state.satelliteSelectedEpochMinMs = Number.isFinite(epochMin) ? epochMin : NaN;
  state.satelliteSelectedEpochMaxMs = Number.isFinite(epochMax) ? epochMax : NaN;
  for (const id of [...state.satelliteCoverageGeometryById.keys()]) {
    if (!state.selectedSatelliteIds.has(id)) state.satelliteCoverageGeometryById.delete(id);
  }
  satelliteSelectionRevision += 1;
  satelliteOrbitPathRetrySelectionRevision = satelliteSelectionRevision;
  satelliteOrbitPathRetryCount = 0;
  satelliteOrbitMissingIds = new Set();
  satelliteCanvasCandidateCache = { key: "", ids: [] };
}

function satelliteSearchMatches(query = state.notamIdSearch.trim().toUpperCase()) {
  const normalized = String(query || "").trim().toUpperCase();
  return state.satellites.filter((item) => {
    if (!normalized && !satelliteCategoryEnabled(item)) return false;
    if (!normalized) return state.selectedSatelliteIds.has(item.id);
    const payloadText = state.satellitePayloadSearchById.get(String(item.id)) || "";
    return `${item.name} ${item.noradId} ${item.internationalDesignator} ${item.owner || ""} ${item.orbitClass} ${item.operationalStatusLabel || ""} ${satelliteObjectClass(item)} ${satelliteObjectClassLabel(item)} ${item.objectTypeLabel || ""} ${payloadText}`.toUpperCase().includes(normalized);
  });
}

function scheduleSatelliteSearchRender() {
  clearTimeout(satelliteSearchRenderTimer);
  satelliteSearchRenderTimer = setTimeout(() => {
    satelliteSearchRenderTimer = 0;
    if (!isSatelliteMode()) return;
    renderList();
    renderNotamIdSearchResults();
  }, 120);
}

function satelliteListItems() {
  const matches = satelliteSearchMatches();
  if (state.notamIdSearch.trim()) return matches;
  return matches.sort((a, b) => satelliteObjectClass(a).localeCompare(satelliteObjectClass(b)) || (a.orbitClass.localeCompare(b.orbitClass)) || a.name.localeCompare(b.name, "zh-CN"));
}

function renderSatelliteList() {
  const items = satelliteListItems();
  els.resultSummary.textContent = `${items.length}/${state.satellites.length} 个对象`;
  if (!state.satellites.length) {
    els.restrictionList.innerHTML = `<p class="empty-text">${state.satelliteLoading ? "正在载入 CelesTrak 卫星轨道目录。" : "尚无本地卫星目录缓存，请使用上方刷新按钮获取。"}</p>`;
    return;
  }
  if (!items.length) {
    els.restrictionList.innerHTML = `<p class="empty-text">没有匹配的空间对象。可按名称、NORAD 编号、国际编号、国家、轨道或对象类型搜索完整目录。</p>`;
    return;
  }
  const visible = items.slice(0, 180);
  const overflow = items.length > visible.length ? `<p class="empty-text">完整目录匹配 ${items.length} 个对象；列表显示前 ${visible.length} 个，可继续缩小搜索范围。</p>` : "";
  els.restrictionList.innerHTML = overflow + visible.map(satelliteCardHtml).join("");
  els.restrictionList.querySelectorAll("[data-satellite-id]").forEach((button) => {
    button.addEventListener("click", () => toggleSatelliteSelection(button.dataset.satelliteId, { fit: true }));
  });
}

function satelliteCardHtml(item) {
  const selected = state.selectedSatelliteIds.has(item.id);
  const activeElement = satelliteActiveElement(item);
  const color = satelliteDisplayColor(item);
  const profile = state.satellitePayloadById.get(String(item?.id)) || null;
  const payloadLine = satellitePayloadCardLine(item);
  const launchDateLine = satelliteLaunchDateLine(item, profile);
  const resolutionLine = satelliteImagingResolutionLine(profile);
  const category = `${satelliteObjectClassLabel(item)} · ${item.orbitClass}`;
  const elementLabel = item.customOrbit
    ? `用户输入 ${item.elementSets?.length || 1} 组`
    : state.satelliteElementMode === "historical" ? "Space-Track 历史" : "当前";
  return `
    <button class="satellite-card ${selected ? "selected" : ""}" style="--satellite-accent:${color}" type="button" data-satellite-id="${escapeHtml(item.id)}">
      <strong>${escapeHtml(item.name)}</strong>
      <span>${escapeHtml(category)} · NORAD ${escapeHtml(item.noradId)}${item.internationalDesignator ? ` · ${escapeHtml(item.internationalDesignator)}` : ""}</span>
      <small>近地点 ${Math.round(activeElement.perigeeKm ?? item.perigeeKm)} km · 远地点 ${Math.round(activeElement.apogeeKm ?? item.apogeeKm)} km · 倾角 ${Number(activeElement.inclinationDeg ?? item.inclinationDeg).toFixed(2)}°</small>
      <small>周期 ${formatSatellitePeriod(activeElement.periodMinutes || item.periodMinutes)} · ${escapeHtml(elementLabel)}根数历元 ${escapeHtml(formatTimeZoneDate(activeElement.epoch, "Asia/Shanghai"))}</small>
      <small>对象分类：${escapeHtml(item.objectTypeLabel || satelliteObjectClassLabel(item))} · 运行状态：${escapeHtml(item.operationalStatusLabel || "不适用")}${item.owner ? ` · 所属 ${escapeHtml(item.owner)}` : ""}</small>
      <small>${escapeHtml(launchDateLine)}</small>
      ${resolutionLine ? `<small class="satellite-resolution-line">${escapeHtml(resolutionLine)}</small>` : ""}
      ${payloadLine ? `<small class="satellite-payload-line">${escapeHtml(payloadLine)}</small>` : ""}
      <small>${selected ? "已加入地球轨道层" : "点击加入轨道层"}</small>
    </button>`;
}

function satelliteLaunchDateLine(item, profile = null) {
  const raw = String(item?.launchDate || profile?.launchDate || "").trim();
  if (!raw) return "入轨日期：公开目录未提供";
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `入轨日期：${isoDate[1]}-${isoDate[2]}-${isoDate[3]}（SATCAT 发射日）`;
  return `入轨日期：${raw}（公开任务资料）`;
}

function satelliteImagingResolutionLine(profile) {
  if (profile?.kind !== "imaging") return "";
  const resolution = String(profile.resolution || "").trim();
  return `遥感分辨率：${resolution || "未公开统一可核验数值"}`;
}

function satelliteActiveElement(item) {
  if (item?.customOrbit && Array.isArray(item.elementSets) && item.elementSets.length) {
    return SATELLITE_ELEMENT_INPUT?.selectElementSet(item, state.satelliteTimeMs) || item.elementSets[item.elementSets.length - 1] || item;
  }
  if (state.satelliteElementMode !== "historical") return item;
  return state.satelliteHistoricalElementsById.get(String(item?.id)) || item;
}

function satelliteObjectClassLabel(item) {
  return ({
    ACTIVE_PAYLOAD: "在役卫星",
    RETIRED_PAYLOAD: "退役卫星",
    ROCKET_BODY: "火箭体",
    DEBRIS: "在轨残骸",
    UNKNOWN: "未知对象",
  })[satelliteObjectClass(item)] || "空间对象";
}

function satellitePayloadCardLine(item) {
  const profile = state.satellitePayloadById.get(String(item?.id));
  if (!profile) return "";
  if (profile.kind === "imaging") {
    const qualifier = `（${profile.evidenceLabel || (profile.estimated ? "工程估算" : "公开参数")}）`;
    if (Number(profile.sceneLengthKm) > 0) {
      const range = Array.isArray(profile.sceneLengthRangeKm)
        ? ` · 公开长度范围 ${formatCoverageKm(profile.sceneLengthRangeKm[0])}-${formatCoverageKm(profile.sceneLengthRangeKm[1])}`
        : "";
      return `${profile.constellation} ${profile.sensor} · ${formatCoverageKm(profile.swathWidthKm)} × ${formatCoverageKm(profile.sceneLengthKm)}${range}${qualifier}`;
    }
    return `${profile.constellation} ${profile.sensor} · 幅宽 ${formatCoverageKm(profile.swathWidthKm)} · 沿轨显示窗动态计算${qualifier}`;
  }
  if (profile.kind === "navigation") return `${profile.constellation} · ${profile.service || "卫星导航定位授时"} · 逐星轨道显示`;
  const altitudeKm = (Number(item.perigeeKm) + Number(item.apogeeKm)) / 2;
  const envelope = SATELLITE_PAYLOADS.communicationEnvelope(profile, altitudeKm);
  if (!envelope) return profile.constellation;
  const angle = envelope.offNadirDeg
    ? `离轴扫描 ${envelope.offNadirDeg.toFixed(0)}°（折算地面仰角 ${envelope.minElevationDeg.toFixed(0)}°）`
    : `最低仰角 ${envelope.minElevationDeg.toFixed(0)}°`;
  const range = profile.estimated
    ? ` · 合理半径 ${formatCoverageKm(envelope.radiusMinKm)}-${formatCoverageKm(envelope.radiusMaxKm)}`
    : "";
  return `${profile.constellation} · ${angle} · 几何包络半径 ${formatCoverageKm(envelope.radiusKm)}${range}（${profile.evidenceLabel || "监管模型"}）`;
}

function formatCoverageKm(value) {
  const km = Math.max(0, Number(value) || 0);
  const hasPublishedDecimal = Math.abs(km - Math.round(km)) >= 0.045;
  const formatted = km >= 100
    ? Math.round(km).toLocaleString("zh-CN")
    : km.toFixed(km < 10 || hasPublishedDecimal ? 1 : 0);
  return `${formatted} km`;
}

function renderSatelliteSearchResults(query) {
  const matches = satelliteSearchMatches(query);
  const visible = matches.slice(0, 120);
  els.notamIdSearchResults.innerHTML =
    `<p class="search-result-count">完整目录匹配 ${matches.length} 个对象${matches.length > visible.length ? `，显示前 ${visible.length} 个` : ""}</p>` +
    visible.map((item) => `
      <button class="notam-search-result" type="button" data-satellite-search-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(`${satelliteObjectClassLabel(item)} · ${item.orbitClass}`)} · NORAD ${escapeHtml(item.noradId)} · ${escapeHtml(item.internationalDesignator || "国际编号未列出")}</span>
      </button>`).join("");
  els.notamIdSearchResults.querySelectorAll("[data-satellite-search-id]").forEach((button) => {
    button.addEventListener("click", () => toggleSatelliteSelection(button.dataset.satelliteSearchId, { fit: true }));
  });
}

function formatSatellitePeriod(minutes) {
  if (!(minutes > 0)) return "--";
  if (minutes >= 1440) return `${(minutes / 1440).toFixed(2)} 天`;
  if (minutes >= 120) return `${(minutes / 60).toFixed(2)} 小时`;
  return `${minutes.toFixed(1)} 分钟`;
}

function fitSelectedSatelliteOrbits() {
  activateSatelliteGlobeMode();
  const ids = visibleSelectedSatelliteIds();
  const rect = els.canvas?.getBoundingClientRect?.() || { width: window.innerWidth, height: window.innerHeight };
  let maximumSceneRadius = 1;
  for (const id of ids) {
    const item = state.satelliteById.get(id);
    const apogeeKm = Math.max(0, Number(item?.apogeeKm) || 0);
    maximumSceneRadius = Math.max(maximumSceneRadius, 1 + apogeeKm / EARTH_MEAN_RADIUS_KM);
  }
  const fittedZoom = GLOBE_CAMERA?.fitZoomForSceneRadius
    ? GLOBE_CAMERA.fitZoomForSceneRadius(maximumSceneRadius * 1.035, rect.width, rect.height, {
      fovDeg: state.view.globeFovDeg || 42,
      frameFraction: 0.4,
    })
    : 1.3;
  state.view.zoom = clamp(Math.min(1.3, fittedZoom), GLOBE_MIN_ZOOM, MAX_ZOOM);
  satelliteLastOrbitFit = {
    mode: "apogee-envelope",
    zoom: state.view.zoom,
    maximumSceneRadius,
    selectedCount: ids.length,
  };
  state.view.globeTilt = 0;
  updateCounts();
  draw();
  requestSatellitePropagation(true);
}

function fitSatellitePosition(point) {
  activateSatelliteGlobeMode();
  state.view.lon = normalizeLon(point.lon);
  state.view.lat = clamp(point.lat, -85, 85);
  state.view.zoom = Math.min(state.view.zoom, 2.5);
  updateCounts();
  draw();
}

function drawSatelliteOverlay() {
  if (!els.satelliteCanvas || !els.satelliteOrbitCanvas || !els.satelliteCoverageCanvas) return;
  const ctx = setupCanvas(els.satelliteCanvas);
  const rect = els.satelliteCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);
  state.satelliteScreenPoints = [];
  if (!state.satelliteLayerEnabled || !isGlobeLayer() || !state.selectedSatelliteIds.size) {
    state.satelliteSwathHandle = null;
    els.canvas?.classList.remove("satellite-swath-edit-mode");
    clearSatelliteStaticCanvases();
    requestSatelliteThreeDrawIfOutdated();
    return;
  }
  const ids = visibleSelectedSatelliteIds();
  const projectionParams = globeParams(width, height);
  const gpuActive = Boolean(globeRendererState?.satelliteGpuLayer);
  if (isInteractiveRender()) satelliteInteractionFrameCount += 1;
  drawSatelliteOrbitLayer(ids, width, height, projectionParams);
  drawSatelliteCoverageLayer(ids, width, height, projectionParams);

  const labelCandidates = [];
  const dense = ids.length > 180;
  const candidateIds = satelliteCanvasCandidateIds(ids, projectionParams, width, height);
  const visualScale = satelliteVisualScaleForZoom();
  ctx.save();
  for (const id of candidateIds) {
    const item = state.satelliteById.get(id);
    const position = state.satellitePositions.get(id);
    if (!item || !position) continue;
    const displayPosition = satellitePredictedPosition(position);
    const point = projectSatellitePoint(displayPosition.lon, displayPosition.lat, displayPosition.altitudeKm, projectionParams);
    if (!point.visible || point.x < -20 || point.x > width + 20 || point.y < -20 || point.y > height + 20) continue;
    const color = satelliteDisplayColor(item);
    const focused = id === state.satelliteFocusedId || id === state.satelliteHoverId;
    if (!gpuActive || focused) {
      ctx.beginPath();
      const baseRadius = state.satellitePointSize * visualScale * 0.5;
      ctx.arc(point.x, point.y, focused ? baseRadius + 2 : dense ? baseRadius * 0.72 : baseRadius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.96)";
      ctx.lineWidth = focused ? 2.6 : 1.8;
      ctx.shadowBlur = focused ? 14 : dense ? 0 : 7;
      ctx.shadowColor = color;
      ctx.fill();
      ctx.stroke();
    }
    state.satelliteScreenPoints.push({ id, x: point.x, y: point.y, altitudeKm: displayPosition.altitudeKm });
    labelCandidates.push({ id, item, point, color, focused });
  }
  ctx.restore();
  const labelStats = state.satelliteLabelsEnabled
    ? drawSatelliteLabels(ctx, labelCandidates, width, height, projectionParams)
    : { drawn: 0, limit: 0 };
  drawSatelliteSwathPlannerOverlay(ctx, width, height, projectionParams);
  renderSatelliteSwathPlannerStatus();
  const viewSignature = satelliteViewSignature(width, height);
  const frameNow = performance.now();
  if (state.satellitePlaybackRate && satelliteLastVisualFrameAt) {
    const elapsed = frameNow - satelliteLastVisualFrameAt;
    satelliteVisualFrameEmaMs = satelliteVisualFrameEmaMs
      ? satelliteVisualFrameEmaMs * 0.82 + elapsed * 0.18
      : elapsed;
  }
  if (state.satellitePlaybackRate) satelliteLastVisualFrameAt = frameNow;
  else {
    satelliteLastVisualFrameAt = 0;
    satelliteVisualFrameEmaMs = 0;
  }
  els.satelliteCanvas.dataset.viewSignature = viewSignature;
  els.satelliteCanvas.dataset.targetFps = "60";
  els.satelliteCanvas.dataset.propagationHz = (1000 / satelliteFrameIntervalMs()).toFixed(1);
  els.satelliteCanvas.dataset.playbackFps = satelliteVisualFrameEmaMs > 0 ? (1000 / satelliteVisualFrameEmaMs).toFixed(1) : "0.0";
  els.satelliteCanvas.dataset.workerCount = String(SATELLITE_WORKER_COUNT);
  els.satelliteCanvas.dataset.performanceMode = HIGH_PERFORMANCE_MODE ? "high" : "balanced";
  els.satelliteCanvas.dataset.propagationRequests = String(satellitePerformanceStats.requests);
  els.satelliteCanvas.dataset.propagationCompletions = String(satellitePerformanceStats.completions);
  els.satelliteCanvas.dataset.propagationLatencyMs = satellitePerformanceStats.latencyEmaMs.toFixed(1);
  els.satelliteCanvas.dataset.workerComputeMs = satellitePerformanceStats.workerComputeEmaMs.toFixed(1);
  els.satelliteCanvas.dataset.interactionSyncFrames = String(satelliteInteractionFrameCount);
  els.satelliteCanvas.dataset.satelliteCount = String(ids.length);
  els.satelliteCanvas.dataset.hitCandidateCount = String(state.satelliteScreenPoints.length);
  els.satelliteCanvas.dataset.labelCandidateCount = String(labelCandidates.length);
  els.satelliteCanvas.dataset.labelLimit = String(labelStats.limit);
  els.satelliteCanvas.dataset.labelDrawn = String(labelStats.drawn);
  els.satelliteCanvas.dataset.renderer = gpuActive ? "webgl-batched" : "canvas";
  els.satelliteCanvas.dataset.simulationTime = new Date(state.satelliteTimeMs).toISOString();
  els.satelliteCanvas.dataset.animationTicks = String(satelliteAnimationTickCount);
  els.satelliteCanvas.dataset.requestSkipsPending = String(satelliteRequestSkipPendingCount);
  if (state.satellitePlaybackRate && satelliteVisualFrameEmaMs > 0) {
    recordAdaptivePerformanceSample(satelliteVisualFrameEmaMs, "satellite-animation");
  }
  if (gpuActive) requestSatelliteThreeDrawIfOutdated();
}

function drawSatelliteSwathPlannerOverlay(ctx, width, height, projectionParams) {
  state.satelliteSwathHandle = null;
  if (els.satelliteCanvas) {
    els.satelliteCanvas.dataset.swathPlanner = "off";
    delete els.satelliteCanvas.dataset.swathHandleX;
    delete els.satelliteCanvas.dataset.swathHandleY;
    delete els.satelliteCanvas.dataset.swathRollDeg;
  }
  els.canvas?.classList.toggle("satellite-swath-edit-mode", Boolean(state.satelliteSwathEditEnabled && focusedSatelliteImagingContext()));
  if (!state.satelliteSwathEditEnabled) return;
  const context = focusedSatelliteImagingContext();
  if (!context) return;
  const centerPoint = projectSatellitePoint(context.target.lon, context.target.lat, 0, projectionParams);
  const satellitePoint = projectSatellitePoint(context.position.lon, context.position.lat, context.position.altitudeKm, projectionParams);
  const ring = satelliteImagingRing(context.profile, context.position, context.target) || [];
  const polygon = ring
    .map((point) => projectSatellitePoint(point.lon, point.lat, 0, projectionParams))
    .filter((point) => point.visible && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!centerPoint.visible) return;
  state.satelliteSwathHandle = { x: centerPoint.x, y: centerPoint.y, polygon };
  if (els.satelliteCanvas) {
    els.satelliteCanvas.dataset.swathPlanner = "ready";
    els.satelliteCanvas.dataset.swathHandleX = centerPoint.x.toFixed(2);
    els.satelliteCanvas.dataset.swathHandleY = centerPoint.y.toFixed(2);
    els.satelliteCanvas.dataset.swathRollDeg = Number.isFinite(context.solution?.rollDeg)
      ? context.solution.rollDeg.toFixed(4)
      : "";
  }
  const color = context.profile.color || "#4ce0b3";
  ctx.save();
  if (polygon.length >= 3) {
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let index = 1; index < polygon.length; index += 1) ctx.lineTo(polygon[index].x, polygon[index].y);
    ctx.closePath();
    ctx.fillStyle = hexToRgba(color, state.satelliteSwathDrag ? 0.3 : 0.2);
    ctx.strokeStyle = hexToRgba(color, 0.98);
    ctx.lineWidth = state.satelliteSwathDrag ? 2.1 : 1.55;
    ctx.setLineDash([]);
    ctx.fill();
    ctx.stroke();
  }
  if (satellitePoint.visible) {
    ctx.beginPath();
    ctx.moveTo(satellitePoint.x, satellitePoint.y);
    ctx.lineTo(centerPoint.x, centerPoint.y);
    ctx.strokeStyle = hexToRgba(color, 0.82);
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(centerPoint.x, centerPoint.y, state.satelliteSwathDrag ? 9 : 7, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(4, 13, 18, 0.86)";
  ctx.strokeStyle = context.solution?.reachable ? color : "#ffb347";
  ctx.lineWidth = 2;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 9;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerPoint.x - 4, centerPoint.y);
  ctx.lineTo(centerPoint.x + 4, centerPoint.y);
  ctx.moveTo(centerPoint.x, centerPoint.y - 4);
  ctx.lineTo(centerPoint.x, centerPoint.y + 4);
  ctx.lineWidth = 1.25;
  ctx.stroke();
  ctx.restore();
}

function hitTestSatelliteSwathPlanner(x, y) {
  if (!state.satelliteSwathEditEnabled || !state.satelliteSwathHandle) return false;
  const handle = state.satelliteSwathHandle;
  if (Math.hypot(handle.x - x, handle.y - y) <= 22) return true;
  const points = handle.polygon || [];
  if (points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    if (((a.y > y) !== (b.y > y)) && x < (b.x - a.x) * (y - a.y) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

function requestSatelliteThreeDrawIfOutdated() {
  if (state.satellitePlaybackRate) return;
  if (!globeRendererState || !els.canvas) return;
  const rect = els.canvas.getBoundingClientRect();
  if (globeRendererState.lastRenderSignature !== threeGlobeRenderSignature(rect.width, rect.height)) requestSatelliteThreeDraw();
}

function satelliteCanvasCandidateIds(ids, projectionParams, width, height) {
  if (state.satelliteAllLabelsEnabled) return ids;
  const interactive = isInteractiveRender();
  const candidateLimit = SATELLITE_ORBIT_POLICY?.labelCandidateLimit
    ? SATELLITE_ORBIT_POLICY.labelCandidateLimit(ids.length, state.view.zoom, interactive, SATELLITE_GPU_HIT_LIMIT)
    : interactive ? Math.min(SATELLITE_GPU_HIT_LIMIT, 180) : SATELLITE_GPU_HIT_LIMIT;
  if (ids.length <= candidateLimit) return ids;
  const candidates = [];
  const candidateSet = new Set();
  const idSet = new Set(ids);
  const priority = [state.satelliteFocusedId, state.satelliteHoverId].map(String).filter(Boolean);
  for (const id of priority) {
    if (idSet.has(id) && !candidateSet.has(id)) {
      candidates.push(id);
      candidateSet.add(id);
    }
  }
  if (interactive && satelliteCanvasCandidateCache.ids.length) {
    for (const id of satelliteCanvasCandidateCache.ids) {
      if (candidates.length >= candidateLimit) break;
      if (idSet.has(id) && !candidateSet.has(id)) {
        candidates.push(id);
        candidateSet.add(id);
      }
    }
    return candidates;
  }
  const cacheKey = [
    satelliteSelectionRevision,
    Number(state.view.lon).toFixed(2),
    Number(state.view.lat).toFixed(2),
    Number(state.view.zoom).toFixed(2),
    Math.round(Number(width) || 0),
    Math.round(Number(height) || 0),
    Math.floor(performance.now() / (state.satellitePlaybackRate ? 750 : 60000)),
    candidateLimit,
  ].join(":");
  if (satelliteCanvasCandidateCache.key === cacheKey) {
    for (const id of satelliteCanvasCandidateCache.ids) {
      if (candidates.length >= candidateLimit) break;
      if (idSet.has(id) && !candidateSet.has(id)) {
        candidates.push(id);
        candidateSet.add(id);
      }
    }
    return candidates;
  }
  const searchRadiusDeg = SATELLITE_ORBIT_POLICY?.labelSearchRadiusDeg?.(state.view.zoom) || 95;
  const priorityMode = SATELLITE_ORBIT_POLICY?.labelPriorityMode?.(state.view.zoom) || "local";
  const globeRadiusPx = Math.max(1, Number(projectionParams?.radius) || Math.min(width, height) * 0.42);
  const ranked = [];
  for (const id of ids) {
    if (candidateSet.has(id)) continue;
    const position = state.satellitePositions.get(id);
    if (!position) continue;
    const display = satellitePredictedPosition(position);
    const lon = satelliteDisplayLongitude(display.lon);
    const distanceDeg = satelliteAngularDistanceDeg(state.view.lon, state.view.lat, lon, display.lat);
    const point = projectSatellitePoint(display.lon, display.lat, display.altitudeKm, projectionParams);
    const onScreen = Boolean(point?.visible
      && point.x >= -24 && point.x <= width + 24
      && point.y >= -24 && point.y <= height + 24);
    const screenDistancePx = onScreen ? Math.hypot(point.x - width / 2, point.y - height / 2) : Number.POSITIVE_INFINITY;
    const screenPriority = onScreen
      ? SATELLITE_ORBIT_POLICY?.labelScreenPriority?.(screenDistancePx, globeRadiusPx, state.view.zoom) ?? screenDistancePx
      : Number.POSITIVE_INFINITY;
    ranked.push({
      id,
      distanceDeg,
      local: distanceDeg <= searchRadiusDeg ? 0 : 1,
      visible: onScreen ? 0 : 1,
      screenPriority,
    });
  }
  ranked.sort((a, b) => a.visible - b.visible
    || (priorityMode === "rim" ? a.screenPriority - b.screenPriority : a.local - b.local)
    || (priorityMode === "rim" ? a.distanceDeg - b.distanceDeg : a.screenPriority - b.screenPriority)
    || a.id.localeCompare(b.id));
  for (const item of ranked) {
    if (candidates.length >= candidateLimit) break;
    candidates.push(item.id);
    candidateSet.add(item.id);
  }
  if (candidates.length < candidateLimit) {
    const stride = ids.length / Math.max(1, candidateLimit - candidates.length);
    for (let cursor = 0; candidates.length < candidateLimit && Math.floor(cursor) < ids.length; cursor += stride) {
      const id = ids[Math.floor(cursor)];
      if (id && !candidateSet.has(id)) {
        candidates.push(id);
        candidateSet.add(id);
      }
    }
  }
  satelliteCanvasCandidateCache = { key: cacheKey, ids: candidates.slice() };
  return candidates;
}

function satelliteAngularDistanceDeg(lonA, latA, lonB, latB) {
  const phiA = toRad(clamp(Number(latA) || 0, -90, 90));
  const phiB = toRad(clamp(Number(latB) || 0, -90, 90));
  const deltaLon = toRad(normalizeLongitudeDeltaDeg((Number(lonB) || 0) - (Number(lonA) || 0)));
  const cosine = clamp(Math.sin(phiA) * Math.sin(phiB) + Math.cos(phiA) * Math.cos(phiB) * Math.cos(deltaLon), -1, 1);
  return toDeg(Math.acos(cosine));
}

function clearSatelliteStaticCanvases() {
  for (const canvas of [els.satelliteCoverageCanvas, els.satelliteOrbitCanvas]) {
    if (!canvas) continue;
    const ctx = setupCanvas(canvas);
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
  }
  satelliteOrbitRenderSignature = "";
  satelliteCoverageRenderSignature = "";
  satelliteCoverageViewSignature = "";
}

function invalidateSatelliteStaticLayers(options = {}) {
  if (options.orbit) {
    satelliteOrbitRenderSignature = "";
    satelliteGpuOrbitRevision += 1;
  }
  if (options.coverage) {
    satelliteCoverageRenderSignature = "";
    satelliteCoverageViewSignature = "";
    satelliteLastCoverageAt = 0;
  }
}

function satelliteViewSignature(width, height) {
  const view = state.view;
  return [
    width.toFixed(1), height.toFixed(1), currentRenderDprCap(),
    Number(view.lon).toFixed(4), Number(view.lat).toFixed(4), Number(view.zoom).toFixed(3),
    Number(view.globeTilt || 0).toFixed(2), Number(view.globeBearing || 0).toFixed(2),
  ].join(":");
}

function satelliteVisualScaleForZoom(zoom = state.view.zoom) {
  const normalizedZoom = Number.isFinite(Number(zoom)) ? Number(zoom) : 1;
  // Zoom 1 is the UI size baseline. Each zoom step applies the same ratio so
  // orbit ribbons, satellite points and labels remain visually synchronized.
  return clamp(2 ** ((normalizedZoom - 1) * 0.28), 0.4, 4);
}

function satelliteDenseOrbitOpacity(selectedCount, zoom = state.view.zoom) {
  const count = Math.max(0, Number(selectedCount) || 0);
  const base = count > 8000
    ? 0.24
    : count > 4000
      ? 0.27
      : count > 1200
        ? 0.32
        : count > 600 ? 0.4 : 0.48;
  const distanceScale = clamp(0.58 + (Number(zoom) + 5) * 0.105, 0.58, 1);
  return clamp(base * distanceScale, 0.14, 0.52);
}

function drawSatelliteOrbitLayer(ids, width, height, projectionParams) {
  const canvas = els.satelliteOrbitCanvas;
  if (!canvas) return;
  if (globeRendererState?.satelliteGpuLayer) {
    const signature = `gpu:${satelliteSelectionRevision}`;
    if (satelliteOrbitRenderSignature !== signature) {
      setupCanvas(canvas).clearRect(0, 0, width, height);
      satelliteOrbitRenderSignature = signature;
    }
    canvas.dataset.renderer = "webgl-batched";
    canvas.dataset.viewSignature = satelliteViewSignature(width, height);
    canvas.dataset.interactionSynchronized = isInteractiveRender() ? "true" : "false";
    return;
  }
  const signature = `${satelliteViewSignature(width, height)}:${state.satelliteOrbitLinesEnabled}:${satellitePathRevision}:${satelliteSelectionRevision}`;
  if (signature === satelliteOrbitRenderSignature) return;
  satelliteOrbitRenderSignature = signature;
  const ctx = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  if (!state.satelliteOrbitLinesEnabled) return;
  const dense = ids.length > 120;
  const visualScale = satelliteVisualScaleForZoom();
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const id of ids) {
    const item = state.satelliteById.get(id);
    const points = state.satelliteOrbitPaths.get(id) || [];
    const pointCount = satelliteOrbitPathPointCount(points);
    if (!item || pointCount < 2) continue;
    const color = satelliteDisplayColor(item);
    ctx.beginPath();
    let penDown = false;
    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      const sample = satelliteOrbitPathPoint(points, pointIndex);
      if (!sample) {
        penDown = false;
        continue;
      }
      const projected = projectSatellitePoint(sample.lon, sample.lat, sample.altitudeKm, projectionParams);
      if (!projected.visible || projected.x < -100 || projected.x > width + 100 || projected.y < -100 || projected.y > height + 100) {
        penDown = false;
        continue;
      }
      if (!penDown) ctx.moveTo(projected.x, projected.y);
      else ctx.lineTo(projected.x, projected.y);
      penDown = true;
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = id === state.satelliteFocusedId
      ? 0.92
      : ids.length > 4000 ? 0.06 : ids.length > 1200 ? 0.1 : dense ? 0.2 : 0.44;
    ctx.lineWidth = state.satelliteOrbitLineWidth * visualScale * (id === state.satelliteFocusedId ? 1.55 : dense ? 0.72 : 1);
    ctx.shadowBlur = 0;
    ctx.stroke();
  }
  ctx.restore();
  canvas.dataset.viewSignature = satelliteViewSignature(width, height);
  canvas.dataset.interactionSynchronized = isInteractiveRender() ? "true" : "false";
  canvas.dataset.interactionSyncFrames = String(satelliteInteractionFrameCount);
}

function satelliteOrbitPathPointCount(path) {
  if (ArrayBuffer.isView(path)) return Math.floor(path.length / SATELLITE_PATH_POINT_STRIDE);
  return Array.isArray(path) ? path.length : 0;
}

function satelliteOrbitPathHasRenderableSegment(path) {
  let previousValid = false;
  const pointCount = satelliteOrbitPathPointCount(path);
  for (let index = 0; index < pointCount; index += 1) {
    const valid = Boolean(satelliteOrbitPathPoint(path, index));
    if (valid && previousValid) return true;
    previousValid = valid;
  }
  return false;
}

function satelliteOrbitPathPoint(path, index) {
  if (!ArrayBuffer.isView(path)) return Array.isArray(path) ? path[index] || null : null;
  const offset = index * SATELLITE_PATH_POINT_STRIDE;
  if (offset < 0 || offset + 5 >= path.length) return null;
  const values = [path[offset], path[offset + 1], path[offset + 2], path[offset + 3], path[offset + 4], path[offset + 5]];
  if (!values.every(Number.isFinite)) return null;
  return {
    lon: values[0],
    lat: values[1],
    altitudeKm: values[2],
    eciXKm: values[3],
    eciYKm: values[4],
    eciZKm: values[5],
  };
}

function drawSatelliteCoverageLayer(ids, width, height, projectionParams) {
  const canvas = els.satelliteCoverageCanvas;
  if (!canvas) return;
  const gpuActive = Boolean(globeRendererState?.satelliteGpuLayer);
  if (gpuActive) {
    const layer = globeRendererState.satelliteGpuLayer;
    const signature = [
      "gpu",
      Math.round(width),
      Math.round(height),
      state.satelliteCoverageEnabled ? 1 : 0,
      state.satelliteImagingEnabled ? 1 : 0,
      state.satelliteCommunicationEnabled ? 1 : 0,
      satelliteSelectionRevision,
    ].join(":");
    if (signature !== satelliteCoverageRenderSignature) {
      const ctx = setupCanvas(canvas);
      ctx.clearRect(0, 0, width, height);
      satelliteCoverageRenderSignature = signature;
    }
    canvas.dataset.viewSignature = `${Math.round(width)}:${Math.round(height)}:gpu`;
    canvas.dataset.coverageCount = String(layer.coverageCount || 0);
    canvas.dataset.coverageUnavailable = String(Math.max(0, state.satelliteCommunicationIds.length - (layer.coverageCount || 0)));
    canvas.dataset.renderer = "webgl-instanced";
    return;
  }
  const coverageIds = [
    ...(state.satelliteImagingEnabled ? state.satelliteImagingIds : []),
    ...(state.satelliteCommunicationEnabled ? state.satelliteCommunicationIds : []),
  ];
  const viewSignature = satelliteViewSignature(width, height);
  const signature = `${viewSignature}:${state.satelliteCoverageEnabled}:${state.satelliteImagingEnabled}:${state.satelliteCommunicationEnabled}:${state.satelliteImagingOpacity}:${state.satelliteCommunicationOpacity}:${satelliteSelectionRevision}:${Math.round(state.satelliteTimeMs / 250)}`;
  if (signature === satelliteCoverageRenderSignature) return;
  const now = performance.now();
  const interval = coverageIds.length > 240 ? 200 : SATELLITE_COVERAGE_INTERVAL_MS;
  const viewChanged = viewSignature !== satelliteCoverageViewSignature;
  if (!viewChanged && !isInteractiveRender() && satelliteLastCoverageAt && now - satelliteLastCoverageAt < interval) return;
  satelliteLastCoverageAt = now;
  satelliteCoverageRenderSignature = signature;
  satelliteCoverageViewSignature = viewSignature;
  const ctx = setupCanvas(canvas);
  ctx.clearRect(0, 0, width, height);
  canvas.dataset.viewSignature = viewSignature;
  canvas.dataset.interactionSynchronized = isInteractiveRender() ? "true" : "false";
  canvas.dataset.interactionSyncFrames = String(satelliteInteractionFrameCount);
  canvas.dataset.coverageCount = String(coverageIds.length);
  canvas.dataset.renderer = gpuActive ? "webgl-instanced" : "canvas";
  if (!state.satelliteCoverageEnabled || !coverageIds.length) return;
  const communicationCount = gpuActive ? 0 : state.satelliteCommunicationEnabled ? state.satelliteCommunicationIds.length : 0;
  const circleSegments = coverageIds.length > 300 ? 24 : coverageIds.length > 120 ? 32 : 48;
  for (const id of coverageIds) {
    const item = state.satelliteById.get(id);
    const position = state.satellitePositions.get(id);
    const profile = state.satellitePayloadById.get(String(id));
    if (!item || !position || !profile) continue;
    const displayPosition = satellitePredictedPosition(position);
    const ring = cachedSatelliteCoverageRing(id, profile, displayPosition, circleSegments);
    if (!ring?.length) continue;
    const imagingTarget = profile.kind === "imaging" ? satelliteImagingTarget(id, displayPosition) : null;
    const footprintCenter = imagingTarget
      ? { lon: Number(imagingTarget.lon), lat: Number(imagingTarget.lat), altitudeKm: 0 }
      : displayPosition;
    const fillAlpha = profile.kind === "communications"
      ? satelliteCommunicationSingleCoverageAlpha(communicationCount, state.satelliteCommunicationOpacity)
      : state.satelliteImagingOpacity * 0.58;
    drawSatelliteSurfaceRing(
      ctx,
      ring,
      footprintCenter,
      width,
      height,
      profile.color || satelliteDisplayColor(item),
      fillAlpha,
      projectionParams,
      profile.kind === "imaging",
      displayPosition,
    );
  }
}

function cachedSatelliteCoverageRing(id, profile, position, circleSegments) {
  const imagingTarget = profile.kind === "imaging" ? satelliteImagingTarget(id, position) : null;
  const imagingOverride = profile.kind === "imaging" ? state.satelliteSwathTargets.get(String(id)) : null;
  const key = [
    profile.kind,
    Number(position.lon).toFixed(6),
    Number(position.lat).toFixed(6),
    Number(position.altitudeKm).toFixed(3),
    Number(position.headingDeg || 0).toFixed(3),
    imagingTarget ? Number(imagingTarget.lon).toFixed(6) : "nadir",
    imagingTarget ? Number(imagingTarget.lat).toFixed(6) : "nadir",
    imagingOverride?.mode || "nadir",
    circleSegments,
  ].join(":");
  const cached = state.satelliteCoverageGeometryById.get(String(id));
  if (cached?.key === key) return cached.ring;
  const ring = profile.kind === "imaging"
    ? satelliteImagingRing(profile, position, imagingTarget)
    : satelliteCommunicationRing(profile, position, circleSegments);
  state.satelliteCoverageGeometryById.set(String(id), { key, ring });
  return ring;
}

function satelliteImagingRing(profile, position, target = null) {
  const dimensions = SATELLITE_PAYLOADS?.imagingDimensions(profile, position);
  if (!dimensions) return null;
  const heading = normalizeBearingDeg(Number.isFinite(Number(target?.headingDeg)) ? Number(target.headingDeg) : Number(position.headingDeg) || 0);
  const center = target
    ? { lon: normalizeLon(Number(target.lon)), lat: clamp(Number(target.lat), -90, 90) }
    : { lon: position.lon, lat: position.lat };
  const front = vincentyDirect(center, heading, dimensions.lengthKm * 500);
  const back = vincentyDirect(center, heading + 180, dimensions.lengthKm * 500);
  if (!front || !back) return null;
  const corners = [
    vincentyDirect(front, heading - 90, dimensions.widthKm * 500),
    vincentyDirect(front, heading + 90, dimensions.widthKm * 500),
    vincentyDirect(back, heading + 90, dimensions.widthKm * 500),
    vincentyDirect(back, heading - 90, dimensions.widthKm * 500),
  ];
  if (corners.some((point) => !point)) return null;
  return densifySatelliteRing(corners, dimensions.widthKm > 1000 ? 6 : 3);
}

function satelliteCommunicationRing(profile, position, segments) {
  const radiusKm = SATELLITE_PAYLOADS?.communicationCoverageRadiusKm(profile, position.altitudeKm) || 0;
  if (!(radiusKm > 0)) return null;
  const ring = [];
  for (let index = 0; index < segments; index += 1) {
    const point = sphericalDestination(position.lon, position.lat, index * 360 / segments, radiusKm);
    if (point) ring.push(point);
  }
  if (ring.length) ring.push({ ...ring[0] });
  return ring;
}

function sphericalDestination(lonDeg, latDeg, bearingDeg, distanceKm) {
  const angularDistance = distanceKm / (SATELLITE_PAYLOADS?.EARTH_MEAN_RADIUS_KM || 6371.0088);
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(latDeg);
  const lon1 = toRad(lonDeg);
  const sinLat2 = Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing);
  const lat2 = Math.asin(clamp(sinLat2, -1, 1));
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lon: normalizeLon(toDeg(lon2)), lat: clamp(toDeg(lat2), -90, 90) };
}

function densifySatelliteRing(corners, samplesPerEdge) {
  const ring = [];
  for (let edge = 0; edge < corners.length; edge += 1) {
    const start = corners[edge];
    const end = corners[(edge + 1) % corners.length];
    for (let sample = 0; sample < samplesPerEdge; sample += 1) ring.push(interpolateGreatCircle(start, end, sample / samplesPerEdge));
  }
  if (ring.length) ring.push({ ...ring[0] });
  return ring;
}

function drawSatelliteSurfaceRing(ctx, ring, center, width, height, color, fillAlpha, projectionParams, scanLines = false, satellitePosition = center) {
  const projected = ring.map((point) => projectSatellitePoint(point.lon, point.lat, 0, projectionParams));
  const centerPoint = projectSatellitePoint(center.lon, center.lat, 0, projectionParams);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (scanLines) drawSatelliteImagingScanLines(ctx, projected, satellitePosition, color, projectionParams);
  ctx.fillStyle = hexToRgba(color, clamp(fillAlpha, 0.008, 0.32));
  const allVisible = projected.every((point) => point.visible);
  if (allVisible) {
    ctx.beginPath();
    projected.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.closePath();
    ctx.fill();
  } else if (centerPoint.visible) {
    for (let index = 0; index < projected.length - 1; index += 1) {
      const a = projected[index];
      const b = projected[index + 1];
      if (!a.visible || !b.visible) continue;
      ctx.beginPath();
      ctx.moveTo(centerPoint.x, centerPoint.y);
      ctx.lineTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.beginPath();
  let penDown = false;
  for (const point of projected) {
    if (!point.visible) {
      penDown = false;
      continue;
    }
    if (!penDown) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
    penDown = true;
  }
  ctx.strokeStyle = color;
  const coverageStrength = scanLines ? state.satelliteImagingOpacity : state.satelliteCommunicationOpacity;
  ctx.globalAlpha = clamp(0.2 + coverageStrength * 0.78, 0.24, 0.96);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawSatelliteImagingScanLines(ctx, projectedRing, satellitePosition, color, projectionParams) {
  const satellitePoint = projectSatellitePoint(
    satellitePosition.lon,
    satellitePosition.lat,
    satellitePosition.altitudeKm,
    projectionParams,
  );
  const edgeCount = Math.max(0, projectedRing.length - 1);
  if (!satellitePoint.visible || edgeCount < 4) return;
  ctx.save();
  ctx.beginPath();
  for (let corner = 0; corner < 4; corner += 1) {
    const point = projectedRing[Math.round(corner * edgeCount / 4) % edgeCount];
    if (!point?.visible) continue;
    ctx.moveTo(satellitePoint.x, satellitePoint.y);
    ctx.lineTo(point.x, point.y);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = clamp(0.28 + state.satelliteImagingOpacity * 0.62, 0.32, 0.92);
  ctx.lineWidth = 0.55 + state.satelliteImagingOpacity * 0.55;
  ctx.setLineDash([1.5, 1.35]);
  ctx.lineDashOffset = -0.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 2;
  ctx.stroke();
  ctx.restore();
}

function projectSatellitePoint(lon, lat, altitudeKm, projectionParams) {
  const displayLon = satelliteDisplayLongitude(lon);
  if (GLOBE_CAMERA) return GLOBE_CAMERA.project(displayLon, lat, altitudeKm, projectionParams);
  return globeProjectWithParams(displayLon, lat, projectionParams, true);
}

function drawSatelliteLabels(ctx, candidates, width, height, projectionParams) {
  const placed = [];
  const forceAll = state.satelliteAllLabelsEnabled;
  const globeRadiusPx = Math.max(1, Number(projectionParams?.radius) || Math.min(width, height) * 0.42);
  const labelPriority = (candidate) => SATELLITE_ORBIT_POLICY?.labelScreenPriority?.(
    Math.hypot(candidate.point.x - width / 2, candidate.point.y - height / 2),
    globeRadiusPx,
    state.view.zoom,
  ) ?? Math.hypot(candidate.point.x - width / 2, candidate.point.y - height / 2);
  const ordered = [...candidates].sort((a, b) => Number(b.focused) - Number(a.focused)
    || labelPriority(a) - labelPriority(b)
    || b.point.depth - a.point.depth);
  ctx.save();
  const visualScale = satelliteVisualScaleForZoom();
  const fontSize = Math.max(4, Math.round(state.satelliteLabelSize * visualScale));
  ctx.font = `600 ${fontSize}px Segoe UI, Arial`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  let drawn = 0;
  const labelLimit = forceAll
    ? candidates.length
    : SATELLITE_ORBIT_POLICY?.labelLimit
    ? SATELLITE_ORBIT_POLICY.labelLimit(state.satelliteVisibleIds.length, state.view.zoom, width, height)
    : state.satelliteVisibleIds.length > 2000 ? 18 : state.satelliteVisibleIds.length > 600 ? 32 : 54;
  for (const candidate of ordered) {
    if (drawn >= labelLimit && !candidate.focused) break;
    const text = candidate.item.name;
    const textWidth = Math.ceil(ctx.measureText(text).width);
    const labelHeight = fontSize + 7;
    const pointOffset = state.satellitePointSize * visualScale * 0.5 + Math.max(3, 7 * visualScale);
    const offsets = candidate.focused
      ? [[pointOffset + 5, -labelHeight], [pointOffset + 5, labelHeight * 0.6], [-textWidth - pointOffset - 9, -labelHeight]]
      : [[pointOffset, -labelHeight * 0.65], [pointOffset, labelHeight * 0.5], [-textWidth - pointOffset - 8, -labelHeight * 0.65]];
    let box = null;
    let anchor = null;
    for (const [dx, dy] of offsets) {
      const left = candidate.point.x + dx;
      const top = candidate.point.y + dy - labelHeight * 0.5;
      const next = { left, right: left + textWidth + 8, top, bottom: top + labelHeight };
      if (next.left < 2 || next.right > width - 2 || next.top < 2 || next.bottom > height - 2) continue;
      if (!forceAll && !candidate.focused && placed.some((other) => placeLabelBoxesOverlap(next, other))) continue;
      box = next;
      anchor = { x: left + 4, y: top + labelHeight * 0.5 };
      break;
    }
    if (!box || !anchor) continue;
    placed.push(box);
    if (candidate.focused) {
      ctx.beginPath();
      ctx.moveTo(candidate.point.x, candidate.point.y);
      ctx.lineTo(anchor.x - 3, anchor.y);
      ctx.strokeStyle = candidate.color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = candidate.focused ? 1 : 0.82;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(2, 7, 10, 0.92)";
    ctx.fillStyle = candidate.focused ? "#ffffff" : candidate.color;
    ctx.strokeText(text, anchor.x, anchor.y);
    ctx.fillText(text, anchor.x, anchor.y);
    drawn += 1;
  }
  ctx.restore();
  if (els.satelliteCanvas) {
    els.satelliteCanvas.dataset.labelPriorityMode = forceAll
      ? "all-visible"
      : SATELLITE_ORBIT_POLICY?.labelPriorityMode?.(state.view.zoom) || "local";
  }
  return { drawn, limit: labelLimit };
}

function hitTestSatellite(x, y) {
  if (!state.satelliteLayerEnabled || !isGlobeLayer()) return null;
  let best = null;
  const visualScale = satelliteVisualScaleForZoom();
  for (const point of state.satelliteScreenPoints || []) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance > Math.max(8, state.satellitePointSize * visualScale * 0.5 + 6) || (best && distance >= best.distance)) continue;
    best = { ...point, distance };
  }
  return best;
}

function showSatelliteTooltip(id, clientX, clientY) {
  const item = state.satelliteById.get(String(id));
  const position = state.satellitePositions.get(String(id));
  if (!item || !position) return;
  const activeElement = satelliteActiveElement(item);
  const offsetDays = Math.abs(state.satelliteTimeMs - Date.parse(activeElement.epoch)) / 86400000;
  const elementSource = item.customOrbit
    ? `${item.elementSource || "用户输入 TLE / GP OMM"}（${item.elementSets?.length || 1} 组历元）`
    : state.satelliteElementMode === "historical" ? "Space-Track GP_HISTORY" : (item.elementSource || "CelesTrak OMM");
  const payloadHtml = satellitePayloadTooltipHtml(item, position);
  els.tooltip.classList.remove("restriction-tooltip");
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = `
    <b>空间轨道 · ${escapeHtml(`${satelliteObjectClassLabel(item)} / ${item.orbitClass}`)}</b>
    <strong>${escapeHtml(item.name)}</strong>
    <span>NORAD：${escapeHtml(item.noradId)}${item.internationalDesignator ? ` · 国际编号：${escapeHtml(item.internationalDesignator)}` : ""}</span>
    <span>运行状态：${escapeHtml(item.operationalStatusLabel || "运行中")}${item.operationalStatusCode ? ` · SATCAT ${escapeHtml(item.operationalStatusCode)}` : ""}${item.owner ? ` · 所属 ${escapeHtml(item.owner)}` : ""}</span>
    ${item.publicAttribution ? "<span>身份说明：公开天文观测归属，不代表 NRO 已公开载荷型号。</span>" : ""}
    <span>模拟时刻：北京时间 ${escapeHtml(formatFixedZoneClock(state.satelliteTimeMs, 8))} · UTC ${escapeHtml(formatFixedZoneClock(state.satelliteTimeMs, 0))}</span>
    <span>位置：${escapeHtml(formatDmsPair(position.lat, position.lon))} · 高度 ${Math.round(position.altitudeKm).toLocaleString("zh-CN")} km</span>
    <span>近地点 ${Math.round(activeElement.perigeeKm ?? item.perigeeKm).toLocaleString("zh-CN")} km · 远地点 ${Math.round(activeElement.apogeeKm ?? item.apogeeKm).toLocaleString("zh-CN")} km</span>
    <span>倾角 ${Number(activeElement.inclinationDeg ?? item.inclinationDeg).toFixed(3)}° · 周期 ${escapeHtml(formatSatellitePeriod(activeElement.periodMinutes || item.periodMinutes))}</span>
    ${payloadHtml}
    <span>轨道根数：${escapeHtml(elementSource)} · 历元 ${escapeHtml(formatFixedZoneClock(Date.parse(activeElement.epoch), 0))} UTC · 外推 ${escapeHtml(formatSatelliteOffset(offsetDays))}</span>
    ${offsetDays > 7 ? "<span>提示：当前时刻远离轨道根数历元，尤其低轨卫星的位置误差可能明显增大。</span>" : ""}
  `;
  positionTooltip(clientX, clientY);
}

function satellitePayloadTooltipHtml(item, position) {
  const profile = state.satellitePayloadById.get(String(item?.id));
  if (!profile) return "";
  if (profile.kind === "imaging") {
    const dimensions = SATELLITE_PAYLOADS.imagingDimensions(profile, position);
    const target = satelliteImagingTarget(item?.id, satellitePredictedPosition(position));
    const pointing = target ? SATELLITE_PAYLOADS.imagingPointingSolution(satellitePredictedPosition(position), target) : null;
    const publicLengthRange = Array.isArray(profile.sceneLengthRangeKm)
      ? `<span>公开任务长度范围：${escapeHtml(formatCoverageKm(profile.sceneLengthRangeKm[0]))}-${escapeHtml(formatCoverageKm(profile.sceneLengthRangeKm[1]))}；当前采用区间内参考长度。</span>`
      : "";
    return `
      <span>载荷：${escapeHtml(profile.constellation)} · ${escapeHtml(profile.sensor)} · ${escapeHtml(profile.mode || "对地成像")}</span>
      <span>地表条带：宽 ${escapeHtml(formatCoverageKm(dimensions.widthKm))} × 长 ${escapeHtml(formatCoverageKm(dimensions.lengthKm))}（${escapeHtml(dimensions.lengthBasis)}）</span>
      ${publicLengthRange}
      <span>参数证据：${escapeHtml(profile.evidenceLabel || "来源待核")} · ${escapeHtml(profile.parameterScope || "平台系列")}</span>
      ${pointing ? `<span>自定义指向：${pointing.rollDeg >= 0 ? "右" : "左"}侧摆 ${Math.abs(pointing.rollDeg).toFixed(2)}° · 离轴 ${pointing.offNadirDeg.toFixed(2)}° · 沿轨 ${pointing.pitchDeg.toFixed(2)}° · ${pointing.reachable ? "几何可达" : "超出地平线"}</span>` : ""}
      <span>${escapeHtml(profile.note || "按标称天底指向绘制，不代表实时成像任务。")}</span>
      ${profile.source?.label ? `<span>参数依据：${escapeHtml(profile.source.label)}</span>` : ""}`;
  }
  if (profile.kind === "navigation") {
    return `
      <span>导航星座：${escapeHtml(profile.constellation)} · ${escapeHtml(profile.service || "定位、导航与授时")}</span>
      <span>${escapeHtml(profile.note || "按逐星轨道根数传播，不绘制未经证实的实时服务波束。")}</span>
      ${profile.source?.label ? `<span>参数依据：${escapeHtml(profile.source.label)}</span>` : ""}`;
  }
  const envelope = SATELLITE_PAYLOADS.communicationEnvelope(profile, position.altitudeKm);
  if (!envelope) return "";
  const angleLine = envelope.offNadirDeg
    ? `中心模型：星载离轴扫描 ${envelope.offNadirDeg.toFixed(0)}°，在当前高度折算最低地面仰角 ${envelope.minElevationDeg.toFixed(1)}°`
    : `中心模型：最低用户仰角 ${envelope.minElevationDeg.toFixed(0)}°`;
  const rangeLine = profile.estimated
    ? envelope.offNadirDeg
      ? `合理区间：离轴 ${envelope.offNadirMinDeg.toFixed(0)}°-${envelope.offNadirMaxDeg.toFixed(0)}°；地面仰角 ${envelope.minElevationMinDeg.toFixed(1)}°-${envelope.minElevationMaxDeg.toFixed(1)}°；半径 ${formatCoverageKm(envelope.radiusMinKm)}-${formatCoverageKm(envelope.radiusMaxKm)}`
      : `合理区间：最低仰角 ${envelope.minElevationMinDeg.toFixed(0)}°-${envelope.minElevationMaxDeg.toFixed(0)}°；半径 ${formatCoverageKm(envelope.radiusMinKm)}-${formatCoverageKm(envelope.radiusMaxKm)}`
    : "";
  return `
    <span>通信星座：${escapeHtml(profile.constellation)} · ${escapeHtml(angleLine)}</span>
    <span>中心几何包络：半径 ${escapeHtml(formatCoverageKm(envelope.radiusKm))} · 直径 ${escapeHtml(formatCoverageKm(envelope.radiusKm * 2))}</span>
    ${rangeLine ? `<span>${escapeHtml(rangeLine)}</span>` : ""}
    <span>参数证据：${escapeHtml(profile.evidenceLabel || "来源待核")}；该圆不是实时点波束、容量边界或服务承诺。</span>
    <span>${escapeHtml(profile.note || "按 WGS-84 邻近球面视线几何计算，不代表单个实时点波束。")}</span>
    ${profile.source?.label ? `<span>参数依据：${escapeHtml(profile.source.label)}</span>` : ""}`;
}

function renderList() {
  savedRegionsController?.updateSaveButton();
  renderDetailModeUi();
  if (isSatelliteMode()) {
    renderSatelliteList();
    return;
  }
  if (isLaunchMode()) {
    renderLaunchList();
    return;
  }
  const sourceItems = detailModeItems();
  const label = detailModeLabel();
  els.resultSummary.textContent = `${sourceItems.length} 条`;
  if (!sourceItems.length) {
    els.restrictionList.innerHTML = `<p class="empty-text">当前筛选没有匹配的 ${escapeHtml(label)}。地图只绘制正文中能可靠解析出的边界。</p>`;
    return;
  }
  const listItems = sourceItems.slice(0, LIST_RENDER_LIMIT);
  const membershipIndex = trajectoryMembershipIndex();
  const overflow =
    sourceItems.length > LIST_RENDER_LIMIT
      ? `<p class="empty-text">已载入当前筛选的 ${sourceItems.length} 条 ${escapeHtml(label)}；为保持界面流畅，列表先显示前 ${LIST_RENDER_LIMIT} 条，可用搜索或筛选缩小范围。</p>`
      : "";
  els.restrictionList.innerHTML =
    overflow +
    listItems
    .map((item) => {
      const active = item.id === state.selectedId ? "active" : "";
      const membership = trajectoryMembership(item.id, membershipIndex);
      const inTrajectory = Boolean(membership);
      const inTimeWindow = state.timeWindowRestrictionIds.has(item.id);
      const shape = item.hasGeometry ? "有图形" : "无图形";
      const geometryNote = item.hasGeometry ? item.geometrySource : item.geometryReason;
      const altitudeNote = formatAltitudeWithMeters(item.altitude);
      return `
        <div class="restriction-card-wrap ${inTrajectory ? "trajectory-picked" : ""} ${inTimeWindow ? "time-window-picked" : ""}">
          <button class="restriction-card ${active} ${inTrajectory ? "trajectory-selected" : ""} ${inTimeWindow ? "time-window-selected" : ""}" type="button" data-id="${escapeHtml(item.id)}">
            <span class="card-top">
              <b><i style="background:${item.color}"></i>${escapeHtml(item.notamId || item.type)}</b>
              <em>${escapeHtml(shape)}</em>
            </span>
            <strong data-i18n-static>${escapeHtml(item.title || "Untitled restriction")}</strong>
            <span class="card-meta">${escapeHtml([item.region, item.state, item.category].filter(Boolean).join(" · "))}</span>
            <span class="card-meta" ${item.timeLabel ? "data-i18n-static" : ""}>${escapeHtml(item.timeLabel || "时间未解析")}</span>
            <span class="card-meta">${escapeHtml(altitudeNote)}</span>
            <span class="card-meta">${escapeHtml(geometryNote || "图形状态未解析")}</span>
          </button>
          ${inTimeWindow ? `<span class="time-window-membership">同时间窗口</span>` : ""}
          ${inTrajectory ? `<span class="trajectory-membership" style="border-color:${membership.color};color:${membership.color}">${escapeHtml(membership.label)}</span>` : ""}
        </div>
      `;
    })
    .join("");
  els.restrictionList.querySelectorAll("[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      fitRestriction(sourceItems.find((item) => item.id === state.selectedId));
      renderList();
      draw();
    });
  });
}

function renderLaunchList() {
  const launches = filteredLaunchForecasts();
  els.resultSummary.textContent = `${launches.length} 条`;
  if (!launches.length) {
    els.restrictionList.innerHTML = `<p class="empty-text">当前没有匹配的发射预告。可以清空搜索词，或在发射场下拉框选择“全部发射场”。</p>`;
    return;
  }
  const site = state.selectedLaunchSiteId ? launchSiteGroups().find((item) => item.id === state.selectedLaunchSiteId) : null;
  const siteNotice = site
    ? `<div class="launch-site-notice"><strong>${escapeHtml(site.label)}</strong><span>${escapeHtml(site.count)} 条预告</span><button type="button" data-clear-launch-site>显示全部</button></div>`
    : "";
  const listItems = launches.slice(0, LIST_RENDER_LIMIT);
  const overflow =
    launches.length > LIST_RENDER_LIMIT
      ? `<p class="empty-text">已载入 ${launches.length} 条发射预告；列表先显示前 ${LIST_RENDER_LIMIT} 条，可用搜索或发射场筛选缩小范围。</p>`
      : "";
  els.restrictionList.innerHTML =
    siteNotice +
    overflow +
    listItems
      .map((launch) => {
        const active = launch.id === state.selectedLaunchId ? "active" : "";
        return `
          <button class="restriction-card launch-card ${active}" type="button" data-launch-id="${escapeHtml(launch.id)}">
            <span class="card-top">
              <b><i style="background:${LAUNCH_SITE_COLOR}"></i>${escapeHtml(launch.rocket || "Unknown rocket")}</b>
              <em>${escapeHtml(launch.status || "TBD")}</em>
            </span>
            <strong>${escapeHtml(launch.mission || launch.name || "Untitled launch")}</strong>
            <span class="card-meta">北京时间：${escapeHtml(launch.beijingTimeLabel || formatBeijingRange(launch.net, launch.net))}</span>
            <span class="card-meta">载荷：${escapeHtml((launch.payloads || []).join("、") || launch.mission || "未列出")}</span>
            <span class="card-meta">发射场：${escapeHtml([launch.locationName, launch.padName].filter(Boolean).join(" / "))}</span>
            <span class="card-meta">国家/机构：${escapeHtml([launch.country, launch.provider].filter(Boolean).join(" / "))}</span>
          </button>
        `;
      })
      .join("");
  els.restrictionList.querySelector("[data-clear-launch-site]")?.addEventListener("click", () => {
    state.selectedLaunchSiteId = "";
    renderLaunchSiteFilter();
    renderList();
    draw();
  });
  els.restrictionList.querySelectorAll("[data-launch-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const launch = state.launchForecasts.find((item) => item.id === button.dataset.launchId);
      if (!launch) return;
      state.selectedLaunchId = launch.id;
      if (launch.launchSiteId) state.selectedLaunchSiteId = launch.launchSiteId;
      fitLaunch(launch);
      renderDetailModeUi();
      renderList();
      draw();
    });
  });
}

function renderNotamIdSearchResults() {
  if (!els.notamIdSearchResults) return;
  const query = state.notamIdSearch.trim().toUpperCase();
  if (!query) {
    els.notamIdSearchResults.innerHTML = "";
    return;
  }
  if (isSatelliteMode()) {
    renderSatelliteSearchResults(query);
    return;
  }
  if (isLaunchMode()) {
    const matches = launchForecastsForCurrentWindow().filter((launch) => launch.searchText.includes(query.toLowerCase()));
    const visible = matches.slice(0, 80);
    els.notamIdSearchResults.innerHTML =
      `<p class="search-result-count">全部发射预告中匹配 ${matches.length} 条${
        matches.length > visible.length ? `，显示前 ${visible.length} 条` : ""
      }</p>` +
      visible
        .map(
          (launch) => `
            <button class="notam-search-result" type="button" data-launch-search-id="${escapeHtml(launch.id)}">
              <strong>${escapeHtml(launch.rocket || launch.name)}</strong>
              <span>${escapeHtml([launch.mission, launch.country, launch.locationName].filter(Boolean).join(" / "))}</span>
            </button>
          `,
        )
        .join("");
    els.notamIdSearchResults.querySelectorAll("[data-launch-search-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const launch = state.launchForecasts.find((candidate) => candidate.id === button.dataset.launchSearchId);
        if (!launch) return;
        state.selectedLaunchId = launch.id;
        if (launch.launchSiteId) state.selectedLaunchSiteId = launch.launchSiteId;
        fitLaunch(launch);
        renderDetailModeUi();
        renderList();
        draw();
      });
    });
    return;
  }
  const universe = detailModeItems(allLoadedRestrictions());
  const matches = universe.filter((item) =>
    [item.notamId, item.notamKey, item.title, item.regionName, item.region]
      .filter(Boolean)
      .join(" ")
      .toUpperCase()
      .includes(query),
  );
  const visible = matches.slice(0, 120);
  const label = detailModeLabel();
  els.notamIdSearchResults.innerHTML =
    `<p class="search-result-count">全部 ${escapeHtml(label)} 中匹配 ${matches.length} 条${matches.length > visible.length ? `，显示前 ${visible.length} 条` : ""}</p>` +
    visible
      .map(
        (item) => `
          <button class="notam-search-result" type="button" data-search-id="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.notamId || item.notamKey || item.type)}</strong>
            <span>${escapeHtml([item.region, item.country, item.category].filter(Boolean).join(" · "))}</span>
          </button>
        `,
      )
      .join("");
  els.notamIdSearchResults.querySelectorAll("[data-search-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = universe.find((candidate) => candidate.id === button.dataset.searchId);
      if (!item) return;
      state.selectedId = item.id;
      state.searchRevealRestrictionId = item.id;
      enableRestrictionSourceForSearch(item);
      fitRestriction(item);
      renderList();
      draw();
    });
  });
}

function enableRestrictionSourceForSearch(item) {
  if (isHydropacItem(item)) state.hydropacEnabled = true;
  else if (isMsaWarningItem(item)) state.msaEnabled = true;
  else if (isNavareaItem(item)) state.navareaEnabled = true;
  else state.notamEnabled = true;
  syncSourceToggleButton(els.notamToggle, state.notamEnabled);
  syncSourceToggleButton(els.hydropacToggle, state.hydropacEnabled);
  syncSourceToggleButton(els.msaToggle, state.msaEnabled);
  syncSourceToggleButton(els.navareaToggle, state.navareaEnabled);
}

function updateCountsLegacyBasic() {
  const total = state.restrictions.length;
  const visible = state.filtered.length;
  els.visibleCount.textContent = `${visible}/${total}`;
  setMapStatus(`缩放 ${formatZoom(state.view.zoom)}`);
  updateTrajectoryCount();
}

function updateCountsLegacyLaunch() {
  const total = state.restrictions.length;
  const visible = state.filtered.length;
  els.visibleCount.textContent = `${visible}/${total}`;
  setMapStatus(`缩放 ${formatZoom(state.view.zoom)}`);
  updateTrajectoryCount();
}

function updateCounts() {
  const total = state.restrictions.length;
  const visible = state.filtered.length;
  els.visibleCount.textContent = `${visible}/${total}`;
  setMapStatus(`缩放 ${formatZoom(state.view.zoom)}`);
  updateTrajectoryCount();
}

function draw() {
  const drawStartedAt = performance.now();
  const canvas = els.canvas;
  const ctx = setupCanvas(canvas);
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  flatProjectionFrame = isGlobeLayer() ? null : buildFlatProjectionFrame(width, height);
  state.paths = [];
  state.launchSitePaths = [];
  state.customPaths = [];

  ctx.clearRect(0, 0, width, height);
  syncGlobeMode(isGlobeLayer());
  if (isGlobeLayer()) {
    if (!renderThreeGlobe(width, height)) drawGlobeLayer(ctx, width, height);
  } else {
    drawFlatBase(width, height);
  }
  const baseFinishedAt = performance.now();
  if (!isGlobeLayer()) drawPlaceLabels(ctx, width, height);
  drawRestrictions(ctx, width, height);
  const restrictionsFinishedAt = performance.now();
  drawCustomCoordinates(ctx, width, height);
  const trajectoryStartedAt = performance.now();
  drawTrajectories(ctx, width, height);
  const trajectoryFinishedAt = performance.now();
  if (isGlobeLayer()) drawGlobeSurfaceAnnotations(width, height);
  else {
    clearGlobeSurfaceAnnotations();
    drawLandmarks(ctx, width, height);
    drawLaunchSites(ctx, width, height);
  }
  drawSatelliteOverlay();
  requestBallisticAnimationDraw();
  canvas.dataset.baseDrawMs = (baseFinishedAt - drawStartedAt).toFixed(1);
  canvas.dataset.restrictionDrawMs = (restrictionsFinishedAt - baseFinishedAt).toFixed(1);
  canvas.dataset.trajectoryDrawMs = (trajectoryFinishedAt - trajectoryStartedAt).toFixed(1);
  const totalDrawMs = performance.now() - drawStartedAt;
  canvas.dataset.totalDrawMs = totalDrawMs.toFixed(1);
  canvas.dataset.drawableCount = String(state.drawableRestrictions.length);
  if (isInteractiveRender()) recordAdaptivePerformanceSample(totalDrawMs, "map-interaction");
}

function clearGlobeSurfaceAnnotations() {
  if (!els.globeSurfaceCanvas) return;
  const ctx = setupCanvas(els.globeSurfaceCanvas);
  const rect = els.globeSurfaceCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
}

function drawGlobeSurfaceAnnotations(width, height) {
  if (!els.globeSurfaceCanvas) return;
  const ctx = setupCanvas(els.globeSurfaceCanvas);
  ctx.clearRect(0, 0, width, height);
  state.launchSitePaths = [];
  if (!isGlobeLayer()) return;
  drawPlaceLabels(ctx, width, height);
  drawLandmarks(ctx, width, height);
  drawLaunchSites(ctx, width, height);
  els.globeSurfaceCanvas.dataset.referenceRotationDeg = globeEarthRotationDeg().toFixed(6);
  els.globeSurfaceCanvas.dataset.simulationTime = new Date(state.satelliteTimeMs).toISOString();
}

function drawPlaceLabels(ctx, width, height) {
  const supportedLayer = state.baseLayer === "satellite" || state.baseLayer === GLOBE_LAYER;
  if (!state.placeLabelsEnabled || !supportedLayer || !PLACE_LABELS.length) {
    if (els.canvas) {
      els.canvas.dataset.placeLabelCount = "0";
      els.canvas.dataset.placeLabelDrawMs = "0.0";
    }
    return;
  }
  const startedAt = performance.now();
  const zoom = state.view.zoom;
  const interacting = Boolean(state.view.drag || state.trajectoryDrag || globeInertiaFrame);
  const maxLabels = interacting ? 72 : 220;
  const kindPriority = zoom >= 4
    ? { city: 0, country: 1, region: 2 }
    : { region: 0, country: 1, city: 2 };
  const candidates = PLACE_LABELS
    .filter((item) => zoom >= placeLabelMinZoom(item) && zoom <= placeLabelMaxZoom(item))
    .map((item) => ({ item, point: project(item.lon, item.lat, width, height) }))
    .filter(({ point }) => point.visible !== false && point.x >= -80 && point.x <= width + 80 && point.y >= -30 && point.y <= height + 30)
    .sort((a, b) =>
      (kindPriority[a.item.kind] ?? 3) - (kindPriority[b.item.kind] ?? 3) ||
      (a.item.rank || 9) - (b.item.rank || 9));
  const placed = [];
  let drawn = 0;
  ctx.save();
  for (const candidate of candidates) {
    if (drawn >= maxLabels) break;
    const { item, point } = candidate;
    const style = placeLabelStyle(item, zoom);
    const sprite = placeLabelSprite(item, style);
    const left = point.x - sprite.anchorX;
    const top = point.y - sprite.height / 2;
    const box = {
      left,
      right: left + sprite.width,
      top,
      bottom: top + sprite.height,
    };
    if (placed.some((other) => placeLabelBoxesOverlap(box, other))) continue;
    placed.push(box);
    ctx.globalAlpha = style.alpha;
    ctx.drawImage(sprite.canvas, left, top, sprite.width, sprite.height);
    drawn += 1;
  }
  ctx.restore();
  if (placeLabelSpriteCache.size > 600) placeLabelSpriteCache.clear();
  if (els.canvas) {
    els.canvas.dataset.placeLabelCount = String(drawn);
    els.canvas.dataset.placeLabelDrawMs = (performance.now() - startedAt).toFixed(1);
  }
}

function placeLabelSprite(item, style) {
  const dpr = Math.min(window.devicePixelRatio || 1, RENDER_DPR_MAX);
  const key = `${item.kind}|${item.name}|${style.font}|${style.haloWidth}|${style.dotRadius}|${dpr.toFixed(2)}`;
  const cached = placeLabelSpriteCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  measure.font = style.font;
  const textWidth = Math.ceil(measure.measureText(item.name).width);
  const isCity = item.kind === "city";
  const leftPad = isCity ? 11 : 5;
  const width = Math.max(12, textWidth + leftPad + 6);
  const height = Math.max(16, style.height + 8);
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  const spriteCtx = canvas.getContext("2d");
  spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  spriteCtx.font = style.font;
  spriteCtx.textAlign = isCity ? "left" : "center";
  spriteCtx.textBaseline = "middle";
  spriteCtx.lineJoin = "round";
  spriteCtx.lineWidth = style.haloWidth;
  spriteCtx.strokeStyle = "rgba(3, 7, 10, 0.9)";
  spriteCtx.fillStyle = style.color;
  const textX = isCity ? leftPad : width / 2;
  spriteCtx.strokeText(item.name, textX, height / 2);
  spriteCtx.fillText(item.name, textX, height / 2);
  if (isCity) {
    spriteCtx.beginPath();
    spriteCtx.fillStyle = "rgba(255, 226, 137, 0.98)";
    spriteCtx.strokeStyle = "rgba(3, 7, 10, 0.92)";
    spriteCtx.lineWidth = 1.4;
    spriteCtx.arc(5, height / 2, style.dotRadius, 0, Math.PI * 2);
    spriteCtx.fill();
    spriteCtx.stroke();
  }
  const sprite = {
    canvas,
    width,
    height,
    anchorX: isCity ? 5 : width / 2,
  };
  placeLabelSpriteCache.set(key, sprite);
  return sprite;
}

function placeLabelMinZoom(item) {
  if (item.kind === "region") return -0.5 + Math.max(0, (item.rank || 1) - 1) * 0.7;
  if (item.kind === "country") return 1 + Math.max(0, (item.rank || 1) - 1) * 0.75;
  return 2.7 + Math.max(0, (item.rank || 1) - 1) * 1.45;
}

function placeLabelMaxZoom(item) {
  if (item.kind === "region") return 3.15;
  if (item.kind === "country") return 8.5;
  return MAX_ZOOM;
}

function placeLabelStyle(item, zoom) {
  if (item.kind === "region") {
    return { font: "600 13px Segoe UI, Arial", height: 15, haloWidth: 3.8, color: "#e8f0f3", alpha: 0.72, dotRadius: 0 };
  }
  if (item.kind === "country") {
    return { font: `${zoom >= 5 ? 600 : 700} ${zoom >= 6 ? 11 : 12}px Segoe UI, Arial`, height: 14, haloWidth: 3.6, color: "#f4f7f8", alpha: 0.9, dotRadius: 0 };
  }
  return { font: "600 10px Segoe UI, Arial", height: 12, haloWidth: 3.2, color: "#ffffff", alpha: 0.96, dotRadius: zoom >= 6 ? 2.6 : 2.2 };
}

function placeLabelBoxesOverlap(a, b) {
  return a.left < b.right + 5 && a.right + 5 > b.left && a.top < b.bottom + 3 && a.bottom + 3 > b.top;
}

function flatBaseSignature(width, height) {
  return JSON.stringify([
    state.baseLayer,
    Math.round(width),
    Math.round(height),
    Math.min(window.devicePixelRatio || 1, currentRenderDprCap()).toFixed(2),
    Number(state.view.lon).toFixed(7),
    Number(state.view.lat).toFixed(7),
    Number(state.view.zoom).toFixed(6),
    cloudOverlayApplies() ? 1 : 0,
    Number(state.cloudOpacity || 0).toFixed(3),
    currentCloudHour(),
    Number(state.cloudSelectedSlot || 0),
  ]);
}

function drawFlatBase(width, height, force = false) {
  if (!els.baseCanvas) return;
  const signature = flatBaseSignature(width, height);
  if (!force && flatBaseRenderSignature === signature) {
    els.baseCanvas.dataset.renderCache = "hit";
    return;
  }
  const startedAt = performance.now();
  const ctx = setupCanvas(els.baseCanvas);
  ctx.clearRect(0, 0, width, height);
  drawTileLayer(ctx, width, height);
  drawCloudOverlay(ctx, width, height);
  flatBaseRenderSignature = signature;
  els.baseCanvas.dataset.renderCache = force ? "forced" : "built";
  els.baseCanvas.dataset.totalDrawMs = (performance.now() - startedAt).toFixed(1);
}

function drawTileLayer(ctx, width, height) {
  const source = TILE_SOURCES[state.baseLayer] || TILE_SOURCES.osm;
  if (els.mapAttribution) els.mapAttribution.textContent = source.attribution;
  ctx.fillStyle = source.background;
  ctx.fillRect(0, 0, width, height);

  const z = state.view.zoom;
  const tileZoom = clamp(Math.floor(z), MIN_ZOOM, MAX_ZOOM);
  const baseTiles = flatTileCandidates(tileZoom, z, width, height);
  const tileEntries = baseTiles.map((candidate) => {
    const priority = 8000 - candidate.distance;
    const tile = getTile(state.baseLayer, tileZoom, candidate.wrappedX, candidate.y, priority);
    return {
      candidate,
      tile,
      ancestor: findLoadedTileAncestor(state.baseLayer, tileZoom, candidate, MIN_ZOOM),
    };
  });
  const readyTiles = tileEntries.filter(({ tile }) => tile.loaded).length;
  const holdSatelliteLod = state.baseLayer === "satellite"
    && readyTiles < tileEntries.length
    && tileEntries.every(({ ancestor }) => Boolean(ancestor));
  for (const { candidate, tile, ancestor } of tileEntries) {
    if (tile.loaded && !holdSatelliteLod) {
      ctx.drawImage(tile.image, candidate.dx, candidate.dy, candidate.drawSize, candidate.drawSize);
    } else if (ancestor) {
      drawLoadedTileAncestor(ctx, candidate, ancestor);
    } else if (tile.loaded) {
      ctx.drawImage(tile.image, candidate.dx, candidate.dy, candidate.drawSize, candidate.drawSize);
    } else {
      ctx.fillStyle = tile.failed ? source.failed : source.loading;
      ctx.fillRect(candidate.dx, candidate.dy, candidate.drawSize, candidate.drawSize);
    }
  }

  const viewKey = `${state.baseLayer}/${tileZoom}/${state.view.zoom.toFixed(3)}/${state.view.lon.toFixed(4)}/${state.view.lat.toFixed(4)}/${Math.round(width)}x${Math.round(height)}`;
  if (viewKey !== flatSatelliteViewKey) {
    flatSatelliteViewKey = viewKey;
    flatSatelliteRefineAt = performance.now() + 320;
    if (flatSatelliteRefineTimer) clearTimeout(flatSatelliteRefineTimer);
    flatSatelliteRefineTimer = window.setTimeout(() => {
      flatSatelliteRefineTimer = 0;
      if (!isGlobeLayer()) requestFlatBaseDraw();
    }, 340);
  }
  const canRefine = state.baseLayer === "satellite"
    && tileZoom < MAX_ZOOM
    && (window.devicePixelRatio || 1) > 1.25
    && readyTiles === baseTiles.length
    && performance.now() >= flatSatelliteRefineAt;
  let refinedReady = 0;
  let refinedTotal = 0;
  if (canRefine) {
    const refinedZoom = tileZoom + 1;
    const refinedTiles = flatTileCandidates(refinedZoom, z, width, height);
    refinedTotal = refinedTiles.length;
    const refinedEntries = refinedTiles.map((candidate) => ({
      candidate,
      tile: getTile("satellite", refinedZoom, candidate.wrappedX, candidate.y, 3500 - candidate.distance),
    }));
    refinedReady = refinedEntries.filter(({ tile }) => tile.loaded).length;
    if (refinedReady === refinedTotal) {
      for (const { candidate, tile } of refinedEntries) {
        ctx.drawImage(tile.image, candidate.dx, candidate.dy, candidate.drawSize, candidate.drawSize);
      }
    }
  }
  const targetCanvas = els.baseCanvas || els.canvas;
  targetCanvas.dataset.baseTileZoom = String(tileZoom);
  targetCanvas.dataset.baseTileCoverage = baseTiles.length ? `${Math.round((readyTiles / baseTiles.length) * 100)}%` : "0%";
  targetCanvas.dataset.baseTileLodMode = holdSatelliteLod
    ? "ancestor-hold"
    : readyTiles === baseTiles.length ? "target-complete" : "progressive-initial-load";
  targetCanvas.dataset.refinedTileZoom = canRefine ? String(tileZoom + 1) : "";
  targetCanvas.dataset.refinedTileCoverage = refinedTotal ? `${Math.round((refinedReady / refinedTotal) * 100)}%` : "0%";
  targetCanvas.dataset.refinedTileVisible = String(Boolean(canRefine && refinedTotal > 0 && refinedReady === refinedTotal));
}

function flatTileCandidates(tileZoom, viewZoom, width, height) {
  const scale = 2 ** (viewZoom - tileZoom);
  const n = 2 ** tileZoom;
  const center = lonLatToWorld(state.view.lon, state.view.lat, tileZoom);
  const topLeft = { x: center.x - width / (2 * scale), y: center.y - height / (2 * scale) };
  const minTileX = Math.floor(topLeft.x / TILE_SIZE);
  const maxTileX = Math.floor((topLeft.x + width / scale) / TILE_SIZE);
  const minTileY = clamp(Math.floor(topLeft.y / TILE_SIZE), 0, n - 1);
  const maxTileY = clamp(Math.floor((topLeft.y + height / scale) / TILE_SIZE), 0, n - 1);
  const drawSize = TILE_SIZE * scale;
  const candidates = [];
  for (let x = minTileX; x <= maxTileX; x += 1) {
    const wrappedX = positiveModulo(x, n);
    for (let y = minTileY; y <= maxTileY; y += 1) {
      const dx = Math.round((x * TILE_SIZE - topLeft.x) * scale);
      const dy = Math.round((y * TILE_SIZE - topLeft.y) * scale);
      candidates.push({
        x,
        wrappedX,
        y,
        dx,
        dy,
        drawSize,
        distance: Math.hypot(dx + drawSize / 2 - width / 2, dy + drawSize / 2 - height / 2),
      });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates;
}

function findLoadedTileAncestor(layer, z, candidate, minZoom = MIN_ZOOM) {
  for (let ancestorZoom = z - 1; ancestorZoom >= minZoom; ancestorZoom -= 1) {
    const factor = 2 ** (z - ancestorZoom);
    const ancestorX = Math.floor(candidate.wrappedX / factor);
    const ancestorY = Math.floor(candidate.y / factor);
    const ancestor = peekTile(layer, ancestorZoom, ancestorX, ancestorY);
    if (!ancestor?.loaded) continue;
    const sourceSize = TILE_SIZE / factor;
    return {
      image: ancestor.image,
      sourceSize,
      sourceX: (candidate.wrappedX % factor) * sourceSize,
      sourceY: (candidate.y % factor) * sourceSize,
    };
  }
  return null;
}

function drawLoadedTileAncestor(ctx, candidate, ancestor) {
  if (!ancestor) return false;
  ctx.drawImage(
    ancestor.image,
    ancestor.sourceX,
    ancestor.sourceY,
    ancestor.sourceSize,
    ancestor.sourceSize,
    candidate.dx,
    candidate.dy,
    candidate.drawSize,
    candidate.drawSize,
  );
  return true;
}

function drawCloudOverlay(ctx, width, height) {
  if (!cloudOverlayApplies()) return;
  if (els.mapAttribution) {
    const baseText = els.mapAttribution.textContent || "";
    if (!baseText.includes("NOAA GMGSI")) els.mapAttribution.textContent = `${baseText} | Clouds: NOAA GMGSI`;
  }
  if (!isGlobeLayer()) drawFlatCloudTiles(ctx, width, height);
}

function cloudOverlayApplies() {
  return Boolean(state.cloudOverlayEnabled && (state.baseLayer === "satellite" || state.baseLayer === "earth"));
}

function drawFlatCloudTiles(ctx, width, height) {
  const z = state.view.zoom;
  const tileZoom = clamp(Math.floor(z), MIN_ZOOM, cloudMaxZoom());
  const candidates = flatTileCandidates(tileZoom, z, width, height);
  const entries = candidates.map((candidate) => ({
    candidate,
    tile: getCloudTile(tileZoom, candidate.wrappedX, candidate.y),
    ancestor: findLoadedCloudTileAncestor(tileZoom, candidate),
  }));
  const targetReady = entries.every(({ tile }) => tile.loaded);
  const ancestorCoverage = entries.filter(({ ancestor }) => Boolean(ancestor)).length;

  ctx.save();
  ctx.globalAlpha = state.cloudOpacity;
  for (const { candidate, tile, ancestor } of entries) {
    if (targetReady || (tile.loaded && !ancestor)) {
      if (tile.loaded) ctx.drawImage(tile.image, candidate.dx, candidate.dy, candidate.drawSize, candidate.drawSize);
    } else if (ancestor) {
      drawLoadedTileAncestor(ctx, candidate, ancestor);
    }
  }
  ctx.restore();
  const targetCanvas = els.baseCanvas || els.canvas;
  targetCanvas.dataset.cloudTileCoverage = entries.length
    ? `${Math.round((entries.filter(({ tile }) => tile.loaded).length / entries.length) * 100)}%`
    : "0%";
  targetCanvas.dataset.cloudTileLodMode = targetReady
    ? "target-complete"
    : ancestorCoverage === entries.length ? "ancestor-hold" : "progressive-initial-load";
}

function findLoadedCloudTileAncestor(z, candidate) {
  for (let ancestorZoom = z - 1; ancestorZoom >= MIN_ZOOM; ancestorZoom -= 1) {
    const factor = 2 ** (z - ancestorZoom);
    const ancestorX = Math.floor(candidate.wrappedX / factor);
    const ancestorY = Math.floor(candidate.y / factor);
    const ancestor = peekCloudTile(ancestorZoom, ancestorX, ancestorY);
    if (!ancestor?.loaded) continue;
    const sourceSize = TILE_SIZE / factor;
    return {
      image: ancestor.image,
      sourceSize,
      sourceX: (candidate.wrappedX % factor) * sourceSize,
      sourceY: (candidate.y % factor) * sourceSize,
    };
  }
  return null;
}

function getCloudGlobeTexture() {
  const hour = currentCloudHour();
  const key = `cloud-globe/${CLOUD_TILE_STYLE_VERSION}/${hour}`;
  const cached = cloudGlobeTextureCache.get(key);
  if (cached) return cached;
  const image = new Image();
  image.crossOrigin = "anonymous";
  const texture = { key, image, loaded: false, failed: false, imageData: null, width: 0, height: 0 };
  image.onload = () => {
    texture.width = image.naturalWidth || image.width;
    texture.height = image.naturalHeight || image.height;
    texture.loaded = true;
    requestGlobeBaseDraw();
  };
  image.onerror = () => {
    texture.failed = true;
  };
  image.src = `/api/cloud-satellite/globe-texture?hour=${encodeURIComponent(hour)}&slot=${encodeURIComponent(String(state.cloudSelectedSlot || 0))}&style=${encodeURIComponent(CLOUD_TILE_STYLE_VERSION)}`;
  cloudGlobeTextureCache.set(key, texture);
  trimImageCache(cloudGlobeTextureCache, 6);
  return texture;
}

function updateThreeGlobeCloud(globe) {
  if (!globe?.cloudSphere || !globe.cloudMaterial) return;
  if (!cloudOverlayApplies()) {
    globe.cloudSphere.visible = false;
    return;
  }
  const source = getCloudGlobeTexture();
  if (!source.loaded || source.failed) {
    globe.cloudSphere.visible = false;
    return;
  }
  if (globe.cloudTextureKey !== source.key) {
    globe.cloudTexture?.dispose();
    const texture = new globe.THREE.Texture(source.image);
    texture.colorSpace = globe.THREE.SRGBColorSpace;
    texture.wrapS = globe.THREE.RepeatWrapping;
    texture.wrapT = globe.THREE.ClampToEdgeWrapping;
    texture.minFilter = globe.THREE.LinearMipmapLinearFilter;
    texture.magFilter = globe.THREE.LinearFilter;
    texture.anisotropy = Math.min(12, globe.renderer.capabilities.getMaxAnisotropy());
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    globe.cloudTexture = texture;
    globe.cloudTextureKey = source.key;
    globe.cloudMaterial.map = texture;
    globe.cloudMaterial.needsUpdate = true;
  }
  globe.cloudMaterial.opacity = clamp(state.cloudOpacity, 0, 1);
  globe.cloudSphere.visible = state.cloudOpacity > 0.001;
}

function positiveModulo(value, modulo) {
  return ((value % modulo) + modulo) % modulo;
}

function getCloudTile(z, x, y) {
  const hour = currentCloudHour();
  const key = `cloud/${CLOUD_TILE_STYLE_VERSION}/${hour}/${z}/${x}/${y}`;
  const cached = cloudTileCache.get(key);
  if (cached) {
    cloudTileCache.delete(key);
    cloudTileCache.set(key, cached);
    return cached;
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  const tile = { image, loaded: false, failed: false };
  image.onload = () => {
    tile.loaded = true;
    if (isGlobeLayer()) requestGlobeBaseDraw();
    else requestFlatBaseDraw();
  };
  image.onerror = () => {
    tile.failed = true;
    if (isGlobeLayer()) requestGlobeBaseDraw();
    else requestFlatBaseDraw();
  };
  image.src = `/api/cloud-satellite/tile/${z}/${y}/${x}?hour=${encodeURIComponent(hour)}&slot=${encodeURIComponent(String(state.cloudSelectedSlot || 0))}&style=${encodeURIComponent(CLOUD_TILE_STYLE_VERSION)}`;
  cloudTileCache.set(key, tile);
  trimImageCache(cloudTileCache, CLOUD_TILE_CACHE_MAX_ITEMS);
  return tile;
}

function peekCloudTile(z, x, y) {
  const hour = currentCloudHour();
  return cloudTileCache.get(`cloud/${CLOUD_TILE_STYLE_VERSION}/${hour}/${z}/${x}/${y}`) || null;
}

function getTile(layer, z, x, y, priority = 0) {
  const source = TILE_SOURCES[layer] || TILE_SOURCES.osm;
  const key = `${layer}/${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) {
    tileCache.delete(key);
    tileCache.set(key, cached);
    if (cached.failed && performance.now() - Number(cached.failedAt || 0) > 15000) {
      cached.failed = false;
      cached.loading = false;
      cached.queued = false;
      cached.image = createTileImage();
    }
    queueTileLoad(cached, priority);
    return cached;
  }
  const tile = {
    key,
    layer,
    z,
    x,
    y,
    url: source.url(z, x, y),
    image: createTileImage(),
    loaded: false,
    failed: false,
    queued: false,
    loading: false,
    priority: Number(priority) || 0,
    sequence: 0,
  };
  tileCache.set(key, tile);
  queueTileLoad(tile, priority);
  trimImageCache(tileCache, TILE_CACHE_MAX_ITEMS);
  return tile;
}

function createTileImage() {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  return image;
}

function peekTile(layer, z, x, y) {
  return tileCache.get(`${layer}/${z}/${x}/${y}`) || null;
}

function queueTileLoad(tile, priority = 0) {
  if (!tile || tile.loaded || tile.loading || tile.failed) return;
  tile.priority = Math.max(Number(tile.priority) || 0, Number(priority) || 0);
  tile.sequence = ++tileLoadSequence;
  if (!tile.queued) {
    tile.queued = true;
    tileLoadQueue.push(tile);
  }
  if (tileLoadQueue.length > TILE_LOAD_QUEUE_LIMIT) {
    tileLoadQueue.sort(compareQueuedTiles);
    const discarded = tileLoadQueue.splice(TILE_LOAD_QUEUE_LIMIT);
    for (const item of discarded) item.queued = false;
  }
  drainTileLoadQueue();
}

function compareQueuedTiles(a, b) {
  return (Number(b.priority) || 0) - (Number(a.priority) || 0) || (Number(b.sequence) || 0) - (Number(a.sequence) || 0);
}

function drainTileLoadQueue() {
  if (activeTileLoads >= TILE_LOAD_CONCURRENCY || !tileLoadQueue.length) return;
  tileLoadQueue.sort(compareQueuedTiles);
  while (activeTileLoads < TILE_LOAD_CONCURRENCY && tileLoadQueue.length) {
    const tile = tileLoadQueue.shift();
    if (!tile || tile.loaded || tile.loading || tile.failed) continue;
    tile.queued = false;
    tile.loading = true;
    activeTileLoads += 1;
    const finish = (loaded) => {
      tile.loading = false;
      tile.loaded = loaded;
      tile.failed = !loaded;
      tile.failedAt = loaded ? 0 : performance.now();
      activeTileLoads = Math.max(0, activeTileLoads - 1);
      requestTileConsumerDraw(tile.layer);
      drainTileLoadQueue();
    };
    tile.image.onload = () => finish(true);
    tile.image.onerror = () => finish(false);
    tile.image.src = tile.url;
  }
}

function requestTileConsumerDraw(layer) {
  if (isGlobeLayer() && layer === "satellite") {
    requestGlobeBaseDraw();
  } else if (!isGlobeLayer() && state.baseLayer === layer) {
    requestFlatBaseDraw();
  }
}

function requestFlatBaseDraw() {
  if (flatBaseFramePending) return;
  flatBaseFramePending = true;
  window.requestAnimationFrame(() => {
    flatBaseFramePending = false;
    if (isGlobeLayer() || !els.baseCanvas || !els.canvas) return;
    const rect = els.canvas.getBoundingClientRect();
    drawFlatBase(rect.width, rect.height, true);
  });
}

function requestGlobeBaseDraw() {
  if (state.view.drag || globeInertiaFrame) {
    if (globeRendererState) globeRendererState.needsTileReconcile = true;
    return;
  }
  if (drawFramePending) return;
  if (globeBaseFramePending) return;
  globeBaseFramePending = true;
  window.requestAnimationFrame(() => {
    globeBaseFramePending = false;
    if (!isGlobeLayer() || !globeRendererState || !els.canvas) return;
    const rect = els.canvas.getBoundingClientRect();
    renderThreeGlobe(rect.width, rect.height, true);
  });
}

function requestSatelliteThreeDraw() {
  if (satelliteThreeFramePending || !isGlobeLayer() || !globeRendererState || !els.canvas) return;
  satelliteThreeFramePending = true;
  window.requestAnimationFrame(() => {
    satelliteThreeFramePending = false;
    if (!isGlobeLayer() || !globeRendererState || !els.canvas) return;
    const rect = els.canvas.getBoundingClientRect();
    renderThreeGlobe(rect.width, rect.height, true, { satelliteOnly: true });
  });
}

function scheduleDraw() {
  if (drawFramePending) return;
  drawFramePending = true;
  const renderWhenReady = (now) => {
    if (isInteractiveRender() && now - lastInteractiveDrawAt < INTERACTION_FRAME_INTERVAL_MS) {
      window.requestAnimationFrame(renderWhenReady);
      return;
    }
    drawFramePending = false;
    lastInteractiveDrawAt = now;
    draw();
  };
  window.requestAnimationFrame(renderWhenReady);
}

function isInteractiveRender() {
  return Boolean(state.view.drag || state.trajectoryDrag || globeInertiaFrame);
}

function trimImageCache(cache, maxItems) {
  while (cache.size > maxItems) {
    const firstKey = cache.keys().next().value;
    if (firstKey === undefined) break;
    cache.delete(firstKey);
  }
}

function trimMapCache(cache, maxItems) {
  while (cache.size > maxItems) cache.delete(cache.keys().next().value);
}

function clearCloudGlobeCaches() {
  cloudGlobeTextureCache.clear();
  if (globeRendererState) {
    globeRendererState.cloudTexture?.dispose();
    globeRendererState.cloudTexture = null;
    globeRendererState.cloudTextureKey = "";
    if (globeRendererState.cloudMaterial) globeRendererState.cloudMaterial.map = null;
    if (globeRendererState.cloudSphere) globeRendererState.cloudSphere.visible = false;
  }
}

function initialBaseLayer() {
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const requested = new URLSearchParams(window.location.search).get("layer") || hashParams.get("layer");
  return requested && TILE_SOURCES[requested] ? requested : "osm";
}

function syncLayerButtons() {
  document.querySelectorAll("[data-layer]").forEach((button) => {
    const active = button.dataset.layer === state.baseLayer;
    button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
  });
  if (els.placeLabelsToggle) {
    const supported = state.baseLayer === "satellite" || state.baseLayer === GLOBE_LAYER;
    els.placeLabelsToggle.disabled = !supported;
    els.placeLabelsToggle.closest("label")?.classList.toggle("disabled", !supported);
  }
  if (els.sunlightToggle) {
    const supported = state.baseLayer === GLOBE_LAYER && Boolean(SOLAR_LIGHTING);
    els.sunlightToggle.disabled = !supported;
    els.sunlightToggle.checked = state.sunlightEnabled;
    els.sunlightToggle.closest("label")?.classList.toggle("disabled", !supported);
  }
  updateSatelliteDualClock(true);
}

function isGlobeLayer() {
  return state.baseLayer === GLOBE_LAYER;
}

function syncGlobeMode(enabled) {
  if (globeModeActive === enabled) return;
  globeModeActive = enabled;
  els.canvas.parentElement?.classList.toggle("earth-mode", enabled);
  if (els.baseCanvas) els.baseCanvas.hidden = enabled;
  if (els.globeCanvas) els.globeCanvas.hidden = !enabled;
  if (els.earthNavigation) els.earthNavigation.hidden = !enabled;
  if (!enabled && globeRendererState?.renderer) {
    globeRendererState.renderer.clear();
  }
}

function resetGlobeNorth() {
  state.view.globeBearing = 0;
  hideTooltip();
  draw();
}

function resetGlobeTilt() {
  state.view.globeTilt = 0;
  hideTooltip();
  draw();
}

function resetGlobeView() {
  state.view.globeTilt = 0;
  state.view.globeBearing = 0;
  hideTooltip();
  draw();
}

function zoomGlobeByButton(direction) {
  if (!isGlobeLayer()) return;
  stopGlobeInertia();
  const rect = els.canvas.getBoundingClientRect();
  const nextZoom = clamp(state.view.zoom + Number(direction || 0), GLOBE_MIN_ZOOM, MAX_ZOOM);
  state.view = GLOBE_CAMERA
    ? { ...state.view, ...GLOBE_CAMERA.zoomViewAt(state.view, nextZoom, rect.width / 2, rect.height / 2, rect.width, rect.height), drag: null }
    : { ...state.view, zoom: nextZoom, drag: null };
  updateCounts();
  scheduleDraw();
}

function handleGlobeKeyboard(event) {
  if (!isGlobeLayer() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const tag = event.target?.tagName?.toLowerCase();
  if (["input", "textarea", "select", "button"].includes(tag) || event.target?.isContentEditable) return;
  const key = String(event.key || "").toLowerCase();
  if (key === "n") {
    event.preventDefault();
    resetGlobeNorth();
    return;
  }
  if (key === "u") {
    event.preventDefault();
    resetGlobeTilt();
    return;
  }
  if (key === "r") {
    event.preventDefault();
    resetGlobeView();
    return;
  }
  if (key === "+" || key === "=") {
    event.preventDefault();
    zoomGlobeByButton(0.6);
    return;
  }
  if (key === "-" || key === "_") {
    event.preventDefault();
    zoomGlobeByButton(-0.6);
    return;
  }
  if (!["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) return;
  event.preventDefault();
  stopGlobeInertia();
  if (event.shiftKey) {
    if (key === "arrowleft") state.view.globeBearing = normalizeBearing(state.view.globeBearing - 4);
    if (key === "arrowright") state.view.globeBearing = normalizeBearing(state.view.globeBearing + 4);
    if (key === "arrowup") state.view.globeTilt = clamp(state.view.globeTilt - 3, 0, 80);
    if (key === "arrowdown") state.view.globeTilt = clamp(state.view.globeTilt + 3, 0, 80);
  } else if (GLOBE_CAMERA) {
    const rect = els.canvas.getBoundingClientRect();
    const dx = key === "arrowleft" ? -28 : key === "arrowright" ? 28 : 0;
    const dy = key === "arrowup" ? -28 : key === "arrowdown" ? 28 : 0;
    state.view = { ...state.view, ...GLOBE_CAMERA.panView(state.view, -dx, -dy, rect.width, rect.height) };
  }
  scheduleDraw();
}

function threeGlobeRenderSignature(width, height) {
  const restrictionItems = drawnFilteredItems();
  return JSON.stringify([
    Math.round(width),
    Math.round(height),
    threeGlobeRenderDprCap().toFixed(2),
    Number(state.view.lon).toFixed(7),
    Number(state.view.lat).toFixed(7),
    Number(state.view.zoom).toFixed(6),
    Number(state.view.globeTilt || 0).toFixed(5),
    Number(state.view.globeBearing || 0).toFixed(5),
    state.view.drag || globeInertiaFrame ? 1 : 0,
    cloudOverlayApplies() ? 1 : 0,
    Number(state.cloudOpacity || 0).toFixed(3),
    currentCloudHour(),
    Number(state.cloudSelectedSlot || 0),
    state.sunlightEnabled ? 1 : 0,
    state.sunlightEnabled ? Math.floor(earthSunlightTimeMs() / SUNLIGHT_CLOCK_INTERVAL_MS) : 0,
    restrictionItemsIdentity(restrictionItems),
    state.notamEnabled ? 1 : 0,
    state.hydropacEnabled ? 1 : 0,
    state.msaEnabled ? 1 : 0,
    state.navareaEnabled ? 1 : 0,
    trajectoryRenderRevision,
    ballisticPhysicsRevision,
    state.satelliteLayerEnabled ? satelliteGpuPositionRevision : -1,
    state.satelliteOrbitLinesEnabled ? satelliteGpuOrbitRevision : -1,
    state.satelliteCoverageEnabled ? satelliteGpuCoverageRevision : -1,
    state.satelliteLayerEnabled ? 1 : 0,
    state.satelliteOrbitLinesEnabled ? 1 : 0,
    state.satelliteCoverageEnabled ? 1 : 0,
    state.satelliteImagingEnabled ? 1 : 0,
    state.satelliteCommunicationEnabled ? 1 : 0,
    Number(state.satelliteOrbitLineWidth).toFixed(2),
    Number(state.satellitePointSize).toFixed(2),
    Number(state.satelliteImagingOpacity).toFixed(2),
    Number(state.satelliteCommunicationOpacity).toFixed(2),
    satelliteReferenceDeltaDeg().toFixed(5),
    ensureBallisticAnimationConfig().referenceFrame,
    globeEarthRotationDeg().toFixed(5),
  ]);
}

function renderThreeGlobe(width, height, force = false, options = {}) {
  if (!els.globeCanvas || !GLOBE_CAMERA || globeInitFailed) return false;
  if (!globeRendererState) {
    ensureThreeGlobe()
      .then(() => draw())
      .catch((error) => {
        console.warn("Three.js globe unavailable, falling back to 2D globe.", error);
        globeInitFailed = true;
        draw();
      });
    return false;
  }

  const globe = globeRendererState;
  const renderSignature = threeGlobeRenderSignature(width, height);
  if (!force && !options.satelliteOnly && globe.lastRenderSignature === renderSignature) {
    els.globeCanvas.dataset.renderCache = "hit";
    return true;
  }
  const params = globeParams(width, height);
  const interacting = Boolean(state.view.drag || globeInertiaFrame);
  const frameStartedAt = performance.now();
  els.globeCanvas.dataset.tilt = String(Math.round(params.tilt * 10) / 10);
  els.globeCanvas.dataset.bearing = String(Math.round(params.bearing * 10) / 10);
  if (els.resetNorthButton) els.resetNorthButton.style.setProperty("--earth-bearing", `${-params.bearing}deg`);
  resizeThreeGlobe(globe, width, height);
  updateThreeGlobeCamera(globe, params);
  updateThreeAtmosphereGlow(globe);
  const polarAtlasOnly = Math.abs(Number(state.view.lat) || 0) >= GLOBE_POLAR_ATLAS_ONLY_LAT
    || (params.tilt >= 55 && Math.abs(Number(state.view.lat) || 0) >= GLOBE_POLAR_HORIZON_ATLAS_LAT);
  const globalAtlasOnly = Number(state.view.zoom) < GLOBE_DETAIL_TILES_MIN_VIEW_ZOOM;
  globe.tileGroup.visible = !interacting && !polarAtlasOnly && !globalAtlasOnly;
  const cameraFinishedAt = performance.now();
  if (!interacting && !options.satelliteOnly) {
    if (!polarAtlasOnly && !globalAtlasOnly) updateThreeGlobeTiles(globe, width, height, params);
    else updateThreeGlobeBaseAtlas(globe);
    updateThreeGlobeCloud(globe);
    globe.needsTileReconcile = false;
  } else {
    if (!options.satelliteOnly) globe.needsTileReconcile = true;
  }
  const tileFinishedAt = performance.now();
  updateThreeGlobeSunlight(globe);
  if (!options.satelliteOnly) {
    updateThreeRestrictionGpu(globe);
    updateThreeTrajectoryGpu(globe);
  }
  updateThreeBallisticAnimationGpu(globe, performance.now());
  updateThreeSatelliteGpu(globe);
  globe.renderer.render(globe.scene, globe.camera);
  // Satellite animation renders partial frames at high frequency. A partial
  // frame must not claim that restrictions, trajectories, tiles and clouds
  // were rebuilt, or the following full draw can incorrectly become a cache hit.
  if (options.satelliteOnly) globe.lastSatelliteRenderSignature = renderSignature;
  else globe.lastRenderSignature = renderSignature;
  els.globeCanvas.dataset.renderCache = force ? "forced" : "built";
  const renderFinishedAt = performance.now();
  sampleThreeGlobePixels(globe, width, height);
  els.globeCanvas.dataset.cameraUpdateMs = (cameraFinishedAt - frameStartedAt).toFixed(1);
  els.globeCanvas.dataset.tileUpdateMs = (tileFinishedAt - cameraFinishedAt).toFixed(1);
  els.globeCanvas.dataset.renderMs = (renderFinishedAt - tileFinishedAt).toFixed(1);
  els.globeCanvas.dataset.frameMs = (renderFinishedAt - frameStartedAt).toFixed(1);
  if (interacting || state.satellitePlaybackRate || ensureBallisticAnimationConfig().playing) {
    recordAdaptivePerformanceSample(renderFinishedAt - frameStartedAt, "globe-webgl");
  }
  els.globeCanvas.dataset.tileUpdateSkipped = interacting || globalAtlasOnly ? "true" : "false";
  els.globeCanvas.dataset.interactionBaseAtlas = interacting ? "true" : "false";
  els.globeCanvas.dataset.surfaceTextureMode = polarAtlasOnly ? "polar-atlas" : globalAtlasOnly ? "global-atlas" : "tiled";
  els.globeCanvas.dataset.detailTilesMinViewZoom = String(GLOBE_DETAIL_TILES_MIN_VIEW_ZOOM);
  els.globeCanvas.dataset.polarImagery = GLOBE_POLAR_TEXTURE_SPECS
    .map((spec) => `${spec.id}:${globe.polarImageryReady.has(spec.id) ? "ready" : globe.polarImageryFailed.has(spec.id) ? "failed" : "loading"}`)
    .join(",");
  els.globeCanvas.dataset.meshCount = String(globe.tileMeshes.size);
  if (els.mapAttribution) els.mapAttribution.textContent = TILE_SOURCES.earth.attribution;
  return true;
}

async function ensureThreeGlobe() {
  if (globeRendererState) return globeRendererState;
  if (!globeModulePromise) globeModulePromise = import(GLOBE_THREE_URL);
  const THREE = await globeModulePromise;
  const renderer = new THREE.WebGLRenderer({
    canvas: els.globeCanvas,
    antialias: activePerformanceProfile.budgets.antialias !== false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(RENDER_DPR_MAX, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02070b);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.0004, 120);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);

  const globeGroup = new THREE.Group();
  scene.add(globeGroup);
  const restrictionGpuLayer = createThreeRestrictionGpuLayer(THREE);
  globeGroup.add(restrictionGpuLayer.group);
  const trajectoryGpuLayer = createThreeTrajectoryGpuLayer(THREE);
  globeGroup.add(trajectoryGpuLayer.group);
  const ballisticAnimationGpuLayer = createThreeBallisticAnimationGpuLayer(THREE);
  scene.add(ballisticAnimationGpuLayer.group);
  const satelliteGpuLayer = createThreeSatelliteGpuLayer(THREE);
  scene.add(satelliteGpuLayer.group);

  const baseTexture = createFallbackEarthTexture(THREE);
  const baseMaterial = new THREE.MeshBasicMaterial({
    map: baseTexture,
    color: 0xffffff,
    toneMapped: false,
    side: THREE.FrontSide,
  });
  const baseSphere = new THREE.Mesh(createEarthSphereGeometry(THREE, EARTH_BASE_RADIUS, 192, 96), baseMaterial);
  globeGroup.add(baseSphere);

  const tileGroup = new THREE.Group();
  globeGroup.add(tileGroup);

  const polarImageryGroup = new THREE.Group();
  globeGroup.add(polarImageryGroup);

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: state.cloudOpacity,
    depthWrite: false,
    alphaTest: 0.005,
    toneMapped: false,
  });
  const cloudRadius = 1 + CLOUD_SHELL_ALTITUDE_KM / EARTH_MEAN_RADIUS_KM;
  const cloudSphere = new THREE.Mesh(createEarthSphereGeometry(THREE, cloudRadius, 256, 128), cloudMaterial);
  cloudSphere.renderOrder = 20;
  cloudSphere.visible = false;
  globeGroup.add(cloudSphere);

  const sunlightLayer = createThreeSunlightLayer(THREE, cloudRadius + 0.00012);
  globeGroup.add(sunlightLayer.mesh);

  scene.add(new THREE.AmbientLight(0x6c8998, 1.95));
  const sun = new THREE.DirectionalLight(0xffffff, 2.45);
  sun.position.set(-3.2, 2.4, 4.6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x80c9ff, 0.58);
  rim.position.set(3.2, -0.7, -2.2);
  scene.add(rim);

  const atmosphere = createThreeAtmosphereGlow(THREE);
  globeGroup.add(atmosphere);

  const stars = createStarField(THREE);
  scene.add(stars);

  globeRendererState = {
    THREE,
    renderer,
    scene,
    camera,
    globeGroup,
    restrictionGpuLayer,
    trajectoryGpuLayer,
    ballisticAnimationGpuLayer,
    satelliteGpuLayer,
    baseSphere,
    baseMaterial,
    baseTexture,
    baseAtlasTexture: null,
    baseAtlasReady: false,
    baseAtlasZoom: 0,
    globalAtlasImage: null,
    globalAtlasReady: false,
    globalAtlasLoading: false,
    globalAtlasFailed: false,
    tileGroup,
    polarImageryGroup,
    polarImageryMeshes: new Map(),
    polarImageryReady: new Set(),
    polarImageryFailed: new Set(),
    cloudSphere,
    cloudMaterial,
    sunlightMesh: sunlightLayer.mesh,
    sunlightMaterial: sunlightLayer.material,
    sunlightState: null,
    sunlightTimeMs: NaN,
    sunLight: sun,
    atmosphere,
    cloudTextureKey: "",
    cloudTexture: null,
    tileMeshes: new Map(),
    tileTextures: new Map(),
    placeholderMaterial: new THREE.MeshBasicMaterial({
      color: 0x18313a,
      transparent: true,
      opacity: 0.04,
      depthWrite: false,
      toneMapped: false,
    }),
    lastTileZoom: 0,
    tileFrame: 0,
    pixelRatio: Math.min(RENDER_DPR_MAX, window.devicePixelRatio || 1),
    renderWidth: 0,
    renderHeight: 0,
    cameraProjection: null,
    needsTileReconcile: true,
    lastSatelliteRenderSignature: "",
  };
  loadThreeGlobeGlobalAtlas(globeRendererState);
  loadThreeGlobePolarImagery(globeRendererState);
  return globeRendererState;
}

function createThreeSunlightLayer(THREE, radius) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      sunDirectionLocal: { value: new THREE.Vector3(0, 0, 1) },
      nightColor: { value: new THREE.Color(0.055, 0.082, 0.14) },
      twilightColor: { value: new THREE.Color(0.48, 0.31, 0.22) },
    },
    vertexShader: `
      varying vec3 vLocalNormal;
      void main() {
        vLocalNormal = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirectionLocal;
      uniform vec3 nightColor;
      uniform vec3 twilightColor;
      varying vec3 vLocalNormal;
      void main() {
        float solarCosine = dot(normalize(vLocalNormal), normalize(sunDirectionLocal));
        float twilight = smoothstep(-0.309017, -0.014538, solarCosine);
        float directLight = smoothstep(-0.014538, 0.139173, solarCosine);
        vec3 multiplier = mix(nightColor, twilightColor, twilight * twilight * (3.0 - 2.0 * twilight));
        multiplier = mix(multiplier, vec3(1.0), directLight);
        gl_FragColor = vec4(multiplier, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(createEarthSphereGeometry(THREE, radius, 192, 96), material);
  mesh.name = "solar-day-night-layer";
  mesh.renderOrder = 30;
  mesh.visible = false;
  return { mesh, material };
}

function updateThreeGlobeSunlight(globe) {
  const enabled = Boolean(state.sunlightEnabled && SOLAR_LIGHTING && globe?.sunlightMesh && globe?.sunlightMaterial);
  if (globe?.sunlightMesh) globe.sunlightMesh.visible = enabled;
  const atmosphereMaterial = globe?.atmosphere?.userData?.material;
  if (atmosphereMaterial?.uniforms?.sunlightEnabled) {
    atmosphereMaterial.uniforms.sunlightEnabled.value = enabled ? 1 : 0;
  }
  if (!enabled) {
    if (els.globeCanvas) els.globeCanvas.dataset.sunlightEnabled = "false";
    return;
  }
  const timeMs = earthSunlightTimeMs();
  const solarState = SOLAR_LIGHTING.solarState(timeMs);
  if (!solarState) return;
  const { x, y, z } = solarState.direction;
  globe.sunlightMaterial.uniforms.sunDirectionLocal.value.set(x, y, z);
  if (atmosphereMaterial?.uniforms?.sunDirectionLocal) {
    atmosphereMaterial.uniforms.sunDirectionLocal.value.set(x, y, z);
  }
  const earthRotation = Number(globe.globeGroup?.rotation?.y) || 0;
  const cosine = Math.cos(earthRotation);
  const sine = Math.sin(earthRotation);
  globe.sunLight?.position.set(
    (x * cosine + z * sine) * 5,
    y * 5,
    (-x * sine + z * cosine) * 5,
  );
  globe.sunlightState = solarState;
  globe.sunlightTimeMs = timeMs;
  if (els.globeCanvas) {
    els.globeCanvas.dataset.sunlightEnabled = "true";
    els.globeCanvas.dataset.sunlightTime = new Date(timeMs).toISOString();
    els.globeCanvas.dataset.subsolarLongitude = solarState.subsolarLongitudeDeg.toFixed(6);
    els.globeCanvas.dataset.subsolarLatitude = solarState.subsolarLatitudeDeg.toFixed(6);
  }
}

function createThreeRestrictionMaterial(THREE, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      layerOpacity: { value: opacity },
      restrictionSurfaceRadius: { value: RESTRICTION_SURFACE_RADIUS },
      earthOcclusionRadius: {
        value: RESTRICTION_SURFACE_RADIUS - RESTRICTION_OCCLUSION_INSET_KM / EARTH_MEAN_RADIUS_KM,
      },
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      varying vec3 vWorldPosition;
      void main() {
        vColor = color;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float layerOpacity;
      uniform float restrictionSurfaceRadius;
      uniform float earthOcclusionRadius;
      varying vec3 vColor;
      varying vec3 vWorldPosition;
      bool earthBlocksFragment() {
        vec3 surfacePosition = normalize(vWorldPosition) * restrictionSurfaceRadius;
        vec3 ray = surfacePosition - cameraPosition;
        float a = dot(ray, ray);
        float b = 2.0 * dot(cameraPosition, ray);
        float c = dot(cameraPosition, cameraPosition) - earthOcclusionRadius * earthOcclusionRadius;
        float discriminant = b * b - 4.0 * a * c;
        if (discriminant <= 0.0 || a <= 0.0000001) return false;
        float hit = (-b - sqrt(discriminant)) / (2.0 * a);
        return hit > 0.0001 && hit < 0.9999;
      }
      void main() {
        if (earthBlocksFragment()) discard;
        gl_FragColor = vec4(vColor, layerOpacity);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createThreeRestrictionGpuLayer(THREE) {
  const group = new THREE.Group();
  group.name = "restriction-gpu-layer";
  const createSurface = (name, material, renderOrder) => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    group.add(mesh);
    return mesh;
  };
  const createOutline = (name, material, renderOrder) => {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    lines.name = name;
    lines.frustumCulled = false;
    lines.renderOrder = renderOrder;
    group.add(lines);
    return lines;
  };
  const fillMaterial = createThreeRestrictionMaterial(THREE, 0.28);
  const outlineMaterial = createThreeRestrictionMaterial(THREE, 0.78);
  const emphasisFillMaterial = fillMaterial.clone();
  emphasisFillMaterial.uniforms.layerOpacity.value = 0.68;
  const emphasisOutlineMaterial = outlineMaterial.clone();
  emphasisOutlineMaterial.uniforms.layerOpacity.value = 1;
  const fill = createSurface("restriction-fill", fillMaterial, 31);
  const outline = createOutline("restriction-outline", outlineMaterial, 31.2);
  const emphasisFill = createSurface("restriction-emphasis-fill", emphasisFillMaterial, 31.4);
  const emphasisOutline = createOutline("restriction-emphasis-outline", emphasisOutlineMaterial, 31.6);
  return {
    group,
    fill,
    outline,
    emphasisFill,
    emphasisOutline,
    baseSignature: "",
    emphasisSignature: "",
    polygonCount: 0,
    triangleCount: 0,
    lineSegmentCount: 0,
    surfaceRadius: RESTRICTION_SURFACE_RADIUS,
    surfaceMaxError: 0,
  };
}

function updateThreeRestrictionGpu(globe) {
  const layer = globe?.restrictionGpuLayer;
  if (!layer) return;
  const source = drawnFilteredItems();
  const baseSignature = [
    restrictionItemsIdentity(source),
    state.notamEnabled ? 1 : 0,
    state.hydropacEnabled ? 1 : 0,
    state.msaEnabled ? 1 : 0,
    state.navareaEnabled ? 1 : 0,
  ].join(":");
  const startedAt = performance.now();
  const baseChanged = layer.baseSignature !== baseSignature;
  if (baseChanged) {
    const data = buildThreeRestrictionGeometry(globe.THREE, source);
    replaceThreeColoredGeometry(globe.THREE, layer.fill, data.fillPositions, data.fillColors);
    replaceThreeColoredGeometry(globe.THREE, layer.outline, data.linePositions, data.lineColors);
    layer.baseSignature = baseSignature;
    layer.polygonCount = data.polygonCount;
    layer.triangleCount = data.fillPositions.length / 9;
    layer.lineSegmentCount = data.linePositions.length / 6;
    layer.surfaceRadius = data.surfaceRadius;
    layer.surfaceMaxError = data.surfaceMaxError;
  }
  const emphasisIds = new Set([
    state.selectedId,
    ...state.highlightedRestrictionIds,
    ...state.timeWindowRestrictionIds,
    ...state.hoverRestrictionIds,
  ].filter(Boolean));
  if (state.hoverId) emphasisIds.add(state.hoverId);
  if (state.trajectoryAreaHighlightEnabled) {
    const membership = trajectoryMembershipIndex();
    for (const id of membership.keys()) emphasisIds.add(id);
  }
  const emphasisSignature = [...emphasisIds].sort().join("|");
  if (layer.emphasisSignature !== emphasisSignature || baseChanged) {
    const emphasized = source
      .filter((item) => emphasisIds.has(item.id))
      .map((item) => state.timeWindowRestrictionIds.has(item.id) && !state.highlightedRestrictionIds.has(item.id)
        ? { ...item, color: "#ffe85a" }
        : item);
    const data = buildThreeRestrictionGeometry(globe.THREE, emphasized, { maxTriangleAngleDeg: 4.5 });
    replaceThreeColoredGeometry(globe.THREE, layer.emphasisFill, data.fillPositions, data.fillColors);
    replaceThreeColoredGeometry(globe.THREE, layer.emphasisOutline, data.linePositions, data.lineColors);
    layer.emphasisSignature = emphasisSignature;
  }
  layer.group.visible = isGlobeLayer();
  if (els.globeCanvas) {
    els.globeCanvas.dataset.restrictionRenderer = "webgl-resident-geometry";
    els.globeCanvas.dataset.restrictionGpuPolygons = String(layer.polygonCount);
    els.globeCanvas.dataset.restrictionGpuTriangles = String(layer.triangleCount);
    els.globeCanvas.dataset.restrictionGpuSegments = String(layer.lineSegmentCount);
    els.globeCanvas.dataset.restrictionGpuOcclusion = "analytic-radial-zero-altitude-surface";
    els.globeCanvas.dataset.restrictionGpuFragmentSurfaceProjection = "radial-normalization";
    els.globeCanvas.dataset.restrictionGpuSurfaceAltitudeKm = String(RESTRICTION_SURFACE_ALTITUDE_KM);
    els.globeCanvas.dataset.restrictionGpuSurfaceRadius = Number(layer.surfaceRadius).toFixed(9);
    els.globeCanvas.dataset.restrictionGpuSurfaceMaxError = Number(layer.surfaceMaxError).toExponential(3);
    els.globeCanvas.dataset.restrictionGpuDepthPolicy = "surface-locked-analytic-occlusion";
    els.globeCanvas.dataset.restrictionGpuRenderOrderMax = String(layer.emphasisOutline.renderOrder);
    els.globeCanvas.dataset.restrictionGpuSpaceLayerIsolation = "below-satellite-orbit-and-ballistic";
    els.globeCanvas.dataset.restrictionGpuUpdateMs = (performance.now() - startedAt).toFixed(1);
  }
}

function buildThreeRestrictionGeometry(THREE, items, options = {}) {
  const fillPositions = [];
  const fillColors = [];
  const linePositions = [];
  const lineColors = [];
  const painted = new Set();
  let polygonCount = 0;
  const fillRadius = RESTRICTION_SURFACE_RADIUS;
  const lineRadius = RESTRICTION_SURFACE_RADIUS;
  const maxTriangleAngleRad = toRad(options.maxTriangleAngleDeg || 5.5);
  for (const item of items || []) {
    const geometry = restrictionGeometryForDrawing(item);
    if (!isAreaGeometry(geometry)) continue;
    const renderKey = restrictionRenderKey(item);
    if (renderKey && painted.has(renderKey)) continue;
    if (renderKey) painted.add(renderKey);
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    const color = new THREE.Color(item.color || NOTAM_AREA_COLOR);
    for (const polygon of polygons || []) {
      const { rings, vectors, faces } = restrictionSurfacePolygon(THREE, polygon);
      if (!rings.length) continue;
      for (const face of faces) {
        const vertices = face.map((index) => vectors[index]);
        if (vertices.some((vertex) => !vertex)) continue;
        appendSubdividedSphereTriangle(fillPositions, fillColors, vertices[0], vertices[1], vertices[2], color, fillRadius, maxTriangleAngleRad);
      }
      for (const ring of rings) appendThreeRestrictionOutline(linePositions, lineColors, ring, color, lineRadius);
      polygonCount += 1;
    }
  }
  let surfaceMaxError = 0;
  for (const positions of [fillPositions, linePositions]) {
    for (let index = 0; index < positions.length; index += 3) {
      const radius = Math.hypot(positions[index], positions[index + 1], positions[index + 2]);
      surfaceMaxError = Math.max(surfaceMaxError, Math.abs(radius - RESTRICTION_SURFACE_RADIUS));
    }
  }
  return {
    fillPositions,
    fillColors,
    linePositions,
    lineColors,
    polygonCount,
    surfaceRadius: RESTRICTION_SURFACE_RADIUS,
    surfaceMaxError,
  };
}

function restrictionSurfacePolygon(THREE, polygon) {
  const cached = restrictionSurfaceGeometryCache.get(polygon);
  if (cached) return cached;
  const outer = unwrapThreeRestrictionRing(polygon?.[0] || []);
  const reference = outer.length ? averageRingLongitude(outer) : null;
  const rings = outer.length >= 3 ? [outer, ...(polygon || []).slice(1).map((ring) => unwrapThreeRestrictionRing(ring, reference)).filter((ring) => ring.length >= 3)] : [];
  const vectors = rings.flat().map(([lon, lat]) => spherePoint(lon, lat, RESTRICTION_SURFACE_RADIUS));
  let faces = [];
  if (rings.length) {
    try {
      faces = THREE.ShapeUtils.triangulateShape(rings[0].map(([x, y]) => new THREE.Vector2(x, y)), rings.slice(1).map((ring) => ring.map(([x, y]) => new THREE.Vector2(x, y))));
    } catch { /* Invalid input remains absent instead of inventing a boundary. */ }
  }
  const result = { rings, vectors, faces };
  restrictionSurfaceGeometryCache.set(polygon, result);
  return result;
}

function unwrapThreeRestrictionRing(rawRing, referenceLon = null) {
  const clean = removeClosingVertex(rawRing || [])
    .map((coordinate) => [Number(coordinate?.[0]), Number(coordinate?.[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 3) return [];
  const result = [];
  let previousLon = referenceLon !== null && Number.isFinite(Number(referenceLon))
    ? normalizeLonNear(clean[0][0], Number(referenceLon))
    : normalizeLon(clean[0][0]);
  for (let index = 0; index < clean.length; index += 1) {
    const lon = index ? normalizeLonNear(clean[index][0], previousLon) : previousLon;
    previousLon = lon;
    result.push([lon, clamp(clean[index][1], -90, 90)]);
  }
  return result;
}

function appendSubdividedSphereTriangle(positions, colors, a, b, c, color, radius, maxAngleRad, depth = 0) {
  const angle = (u, v) => Math.acos(clamp((u.x * v.x + u.y * v.y + u.z * v.z) / Math.max(1e-12, Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z)), -1, 1));
  const ab = angle(a, b);
  const bc = angle(b, c);
  const ca = angle(c, a);
  if (depth >= 6 || Math.max(ab, bc, ca) <= maxAngleRad) {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let index = 0; index < 3; index += 1) colors.push(color.r, color.g, color.b);
    return;
  }
  const midpoint = (u, v) => {
    const length = Math.max(1e-12, Math.hypot(u.x + v.x, u.y + v.y, u.z + v.z));
    return { x: (u.x + v.x) / length * radius, y: (u.y + v.y) / length * radius, z: (u.z + v.z) / length * radius };
  };
  const abMid = midpoint(a, b);
  const bcMid = midpoint(b, c);
  const caMid = midpoint(c, a);
  appendSubdividedSphereTriangle(positions, colors, a, abMid, caMid, color, radius, maxAngleRad, depth + 1);
  appendSubdividedSphereTriangle(positions, colors, abMid, b, bcMid, color, radius, maxAngleRad, depth + 1);
  appendSubdividedSphereTriangle(positions, colors, caMid, bcMid, c, color, radius, maxAngleRad, depth + 1);
  appendSubdividedSphereTriangle(positions, colors, abMid, bcMid, caMid, color, radius, maxAngleRad, depth + 1);
}

function appendThreeRestrictionOutline(positions, colors, ring, color, radius) {
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const distanceKm = greatCircleDistanceKm({ lon: start[0], lat: start[1] }, { lon: end[0], lat: end[1] });
    const steps = clamp(Math.ceil(distanceKm / 240), 1, 96);
    let previous = spherePoint(start[0], start[1], radius);
    for (let step = 1; step <= steps; step += 1) {
      const sample = interpolateGreatCircle({ lon: start[0], lat: start[1] }, { lon: end[0], lat: end[1] }, step / steps, 90);
      const next = spherePoint(sample.lon, sample.lat, radius);
      positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      previous = next;
    }
  }
}

function replaceThreeColoredGeometry(THREE, object, positions, colors) {
  const previous = object.geometry;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  if (positions.length) geometry.computeBoundingSphere();
  object.geometry = geometry;
  previous?.dispose();
  object.visible = positions.length > 0;
}

function createThreeTrajectoryGpuLayer(THREE) {
  const group = new THREE.Group();
  group.name = "trajectory-gpu-layer";
  const geometry = createSatelliteOrbitRibbonGeometry(THREE);
  geometry.setAttribute("instanceWidth", new THREE.InstancedBufferAttribute(new Float32Array(0), 1));
  const glowMaterial = createThreeTrajectoryRibbonMaterial(THREE, 0.24, 2.35, THREE.AdditiveBlending);
  const lineMaterial = createThreeTrajectoryRibbonMaterial(THREE, 0.98, 1, THREE.NormalBlending);
  const glow = new THREE.Mesh(geometry, glowMaterial);
  const lines = new THREE.Mesh(geometry, lineMaterial);
  glow.frustumCulled = false;
  lines.frustumCulled = false;
  glow.renderOrder = 54;
  lines.renderOrder = 55;
  group.add(glow, lines);
  return { group, glow, lines, signature: "", segmentCount: 0, buildCount: 0 };
}

function createThreeTrajectoryRibbonMaterial(THREE, opacity, widthMultiplier, blending) {
  return new THREE.ShaderMaterial({
    uniforms: {
      viewportSize: { value: new THREE.Vector2(1, 1) },
      opacity: { value: opacity },
      widthMultiplier: { value: widthMultiplier },
      cameraNear: { value: 0.02 },
    },
    vertexShader: `
      uniform vec2 viewportSize;
      uniform float widthMultiplier;
      uniform float cameraNear;
      attribute vec3 instanceStart;
      attribute vec3 instanceEnd;
      attribute vec3 instanceColor;
      attribute float instanceWidth;
      varying vec3 vColor;
      varying float vAcross;
      void main() {
        vec4 startView = modelViewMatrix * vec4(instanceStart, 1.0);
        vec4 endView = modelViewMatrix * vec4(instanceEnd, 1.0);
        float nearZ = -max(cameraNear, 0.000001);
        bool startBehindNear = startView.z > nearZ;
        bool endBehindNear = endView.z > nearZ;
        if (startBehindNear && endBehindNear) {
          vColor = instanceColor;
          vAcross = position.y;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        if (startBehindNear) {
          float fraction = clamp((nearZ - startView.z) / (endView.z - startView.z), 0.0, 1.0);
          startView = mix(startView, endView, fraction);
        } else if (endBehindNear) {
          float fraction = clamp((nearZ - startView.z) / (endView.z - startView.z), 0.0, 1.0);
          endView = mix(startView, endView, fraction);
        }
        vec4 startClip = projectionMatrix * startView;
        vec4 endClip = projectionMatrix * endView;
        vec2 startNdc = startClip.xy / startClip.w;
        vec2 endNdc = endClip.xy / endClip.w;
        vec2 delta = (endNdc - startNdc) * viewportSize;
        vec2 tangent = length(delta) > 0.0001 ? normalize(delta) : vec2(1.0, 0.0);
        vec2 normal = vec2(-tangent.y, tangent.x);
        vec4 clipPosition = mix(startClip, endClip, position.x);
        float renderedWidth = max(0.5, instanceWidth * widthMultiplier * 0.5);
        float endpointDirection = position.x < 0.5 ? -1.0 : 1.0;
        float capPx = max(0.7, renderedWidth * 0.52);
        vec2 pixelOffset = normal * position.y * renderedWidth
          + tangent * endpointDirection * capPx;
        clipPosition.xy += pixelOffset * clipPosition.w / max(viewportSize, vec2(1.0));
        vColor = instanceColor;
        vAcross = position.y;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      varying float vAcross;
      void main() {
        float edgeCoverage = 1.0 - smoothstep(0.76, 1.0, abs(vAcross));
        float alpha = opacity * edgeCoverage;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    blending,
    alphaToCoverage: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createThreeBallisticAnimationGpuLayer(THREE) {
  const group = new THREE.Group();
  group.name = "ballistic-animation-gpu-layer";
  return {
    group,
    entries: new Map(),
    signature: "",
    glowTexture: createThreeRadialGlowTexture(THREE),
    occlusionPoint: new THREE.Vector3(),
    segmentCount: 0,
  };
}

function createThreeRadialGlowTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d", { alpha: true });
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,255,255,0.96)");
  gradient.addColorStop(0.34, "rgba(255,255,255,0.42)");
  gradient.addColorStop(0.68, "rgba(255,255,255,0.1)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function updateThreeBallisticAnimationGpu(globe, timestamp = performance.now()) {
  const layer = globe?.ballisticAnimationGpuLayer;
  if (!layer) return;
  const session = ballisticAnimationSession;
  const enabled = Boolean(isGlobeLayer() && session?.entries?.length);
  layer.group.visible = enabled;
  if (!enabled) return;
  const animation = ensureBallisticAnimationConfig();
  const gpuSignature = `${session.signature}:${animation.referenceFrame}`;
  if (layer.signature !== gpuSignature) rebuildThreeBallisticAnimationGpu(globe, layer, session, gpuSignature);
  layer.group.updateWorldMatrix(true, false);
  const animationFinished = !animation.playing && animation.elapsedSec >= session.durationSec - 0.05;
  let activeCount = 0;
  for (const entry of session.entries) {
    const object = layer.entries.get(entry.key);
    if (!object) continue;
    const frame = ballisticAnimationObjectFrame(entry, animation.elapsedSec);
    const sample = frame?.sample;
    const bracket = frame?.bracket;
    if (!sample || !bracket) {
      object.group.visible = false;
      continue;
    }
    object.group.visible = true;
    activeCount += 1;
    const renderedSegments = clamp(bracket.lowerIndex + (bracket.fraction > 1e-6 ? 1 : 0), 0, object.segmentCount);
    object.line.geometry.setDrawRange(0, renderedSegments * 2);
    object.glowLine.geometry.setDrawRange(0, renderedSegments * 2);
    const position = spherePoint(
      ballisticAnimationSampleLongitude(entry, sample),
      sample.lat,
      1 + ballisticRenderAltitudeKm((Number(sample.altitudeM) || 0) / 1000) / EARTH_MEAN_RADIUS_KM,
    );
    layer.occlusionPoint.set(position.x, position.y, position.z).applyMatrix4(layer.group.matrixWorld);
    const glowOccluded = REENTRY_ANIMATION?.sphereOccludesPoint
      ? REENTRY_ANIMATION.sphereOccludesPoint(
        globe.camera?.position,
        layer.occlusionPoint,
        EARTH_BASE_RADIUS - BALLISTIC_GLOW_OCCLUSION_INSET_KM / EARTH_MEAN_RADIUS_KM,
      )
      : false;
    object.head.position.set(position.x, position.y, position.z);
    const visual = ballisticAnimationVisual(sample, entry.prepared.stageColor);
    const heatRgb = reentryGlowRgb(visual.heat.intensity);
    const heatActive = visual.glowOpacity > 0.001;
    object.head.material.color.setRGB(heatRgb[0] / 255, heatRgb[1] / 255, heatRgb[2] / 255);
    object.head.material.opacity = heatActive ? clamp(0.28 + visual.glowOpacity * 0.72, 0.28, 1) : 0.5;
    const headRadiusKm = heatActive ? 10 + visual.heat.areaScale * 40 : 7;
    const headScale = headRadiusKm * 2 / EARTH_MEAN_RADIUS_KM;
    object.head.scale.set(headScale, headScale, 1);
    object.head.visible = !glowOccluded;

    const flashState = REENTRY_ANIMATION?.impactFlashState
      ? REENTRY_ANIMATION.impactFlashState(
        animation.impactFlashStartedAtByKey[entry.key],
        timestamp,
        BALLISTIC_IMPACT_FLASH_DURATION_MS,
        animationFinished,
      )
      : { mode: animationFinished ? "held" : "idle", ageMs: Number.POSITIVE_INFINITY };
    const flashEnabled = entry.stage.impactFlashEnabled !== false && entry.physics.status === "impact";
    object.flash.visible = !glowOccluded && flashEnabled && (flashState.mode === "transient" || flashState.mode === "held");
    if (object.flash.visible) {
      const phase = flashState.mode === "held" ? 0.16 : clamp(flashState.ageMs / BALLISTIC_IMPACT_FLASH_DURATION_MS, 0, 1);
      const envelope = flashState.mode === "held" ? 1 : smoothstep(0, 0.05, phase) * (1 - smoothstep(0.18, 1, phase));
      object.flash.position.copy(object.head.position);
      object.flash.material.opacity = clamp(envelope * 1.35, 0, 1);
      const flashRadiusKm = 180 + Math.sqrt(Math.max(0, phase)) * 420;
      const flashScale = flashRadiusKm * 2 / EARTH_MEAN_RADIUS_KM;
      object.flash.scale.set(flashScale, flashScale, 1);
    }
  }
  if (els.globeCanvas) {
    els.globeCanvas.dataset.ballisticAnimationRenderer = "webgl-precomputed";
    els.globeCanvas.dataset.ballisticAnimationGpuObjects = String(activeCount);
    els.globeCanvas.dataset.ballisticAnimationGpuSegments = String(layer.segmentCount);
    els.globeCanvas.dataset.ballisticReferenceFrame = animation.referenceFrame;
    els.globeCanvas.dataset.ballisticEarthRotationDeg = globeEarthRotationDeg().toFixed(6);
    els.globeCanvas.dataset.ballisticGlowDepthMode = "surface-overlay-with-analytic-earth-occlusion";
  }
}

function rebuildThreeBallisticAnimationGpu(globe, layer, session, gpuSignature = `${session.signature}:${ensureBallisticAnimationConfig().referenceFrame}`) {
  for (const object of layer.entries.values()) {
    object.line.geometry.dispose();
    object.line.material.dispose();
    object.glowLine.material.dispose();
    object.head.material.dispose();
    object.flash.material.dispose();
    layer.group.remove(object.group);
  }
  layer.entries.clear();
  layer.segmentCount = 0;
  for (const entry of session.entries) {
    const samples = entry.prepared.samples || [];
    if (samples.length < 2) continue;
    const positions = [];
    const colors = [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const sample = samples[index];
      const start = spherePoint(ballisticAnimationSampleLongitude(entry, previous), previous.lat, 1 + ballisticRenderAltitudeKm((Number(previous.altitudeM) || 0) / 1000) / EARTH_MEAN_RADIUS_KM);
      const end = spherePoint(ballisticAnimationSampleLongitude(entry, sample), sample.lat, 1 + ballisticRenderAltitudeKm((Number(sample.altitudeM) || 0) / 1000) / EARTH_MEAN_RADIUS_KM);
      positions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      for (const candidate of [previous, sample]) {
        const visual = ballisticAnimationVisual(candidate, entry.prepared.stageColor);
        const rgb = visual.glowOpacity > 0.001
          ? reentryGlowRgb(visual.heat.intensity).map((channel) => channel / 255)
          : (() => {
            const color = new globe.THREE.Color(entry.prepared.stageColor || "#6bd7ff");
            return [color.r, color.g, color.b];
          })();
        colors.push(rgb[0], rgb[1], rgb[2]);
      }
    }
    const geometry = new globe.THREE.BufferGeometry();
    geometry.setAttribute("position", new globe.THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new globe.THREE.Float32BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    geometry.computeBoundingSphere();
    const lineMaterial = new globe.THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const glowMaterial = lineMaterial.clone();
    glowMaterial.opacity = 0.34;
    glowMaterial.blending = globe.THREE.AdditiveBlending;
    const line = new globe.THREE.LineSegments(geometry, lineMaterial);
    const glowLine = new globe.THREE.LineSegments(geometry, glowMaterial);
    line.renderOrder = 58;
    glowLine.renderOrder = 57;
    line.frustumCulled = false;
    glowLine.frustumCulled = false;
    const headMaterial = new globe.THREE.SpriteMaterial({
      map: layer.glowTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      blending: globe.THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const flashMaterial = headMaterial.clone();
    flashMaterial.depthTest = false;
    flashMaterial.depthWrite = false;
    const head = new globe.THREE.Sprite(headMaterial);
    const flash = new globe.THREE.Sprite(flashMaterial);
    head.frustumCulled = false;
    flash.frustumCulled = false;
    head.renderOrder = 61;
    flash.renderOrder = 62;
    const group = new globe.THREE.Group();
    group.add(glowLine, line, head, flash);
    layer.group.add(group);
    const segmentCount = samples.length - 1;
    layer.entries.set(entry.key, { group, line, glowLine, head, flash, segmentCount });
    layer.segmentCount += segmentCount;
  }
  layer.signature = gpuSignature;
}

function createThreeSatelliteGpuLayer(THREE) {
  const group = new THREE.Group();
  group.name = "satellite-gpu-layer";

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  pointGeometry.setAttribute("velocity", new THREE.Float32BufferAttribute([], 3));
  pointGeometry.setAttribute("nextPosition", new THREE.Float32BufferAttribute([], 3));
  pointGeometry.setAttribute("nextVelocity", new THREE.Float32BufferAttribute([], 3));
  pointGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: {
      frameDeltaSec: { value: 0 },
      interpolationDurationSec: { value: 1 },
      pointSize: { value: 7 },
      pointOutlinePx: { value: 1.35 },
    },
    vertexShader: `
      uniform float frameDeltaSec;
      uniform float interpolationDurationSec;
      uniform float pointSize;
      uniform float pointOutlinePx;
      attribute vec3 velocity;
      attribute vec3 nextPosition;
      attribute vec3 nextVelocity;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vInnerRadius;
      ${satelliteGpuAdvanceShaderSource()}
      void main() {
        vColor = color;
        vec3 displayPosition = interpolateSatellite(position, velocity, nextPosition, nextVelocity, frameDeltaSec, interpolationDurationSec);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displayPosition, 1.0);
        float renderedSize = pointSize + pointOutlinePx * 2.0;
        vInnerRadius = 0.5 * pointSize / max(renderedSize, 1.0);
        gl_PointSize = renderedSize;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vInnerRadius;
      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float radius = length(centered);
        if (radius > 0.5) discard;
        float edgeAlpha = 1.0 - smoothstep(0.47, 0.5, radius);
        vec3 pointColor = radius > vInnerRadius ? vec3(0.003, 0.006, 0.008) : vColor;
        gl_FragColor = vec4(pointColor, 0.98 * edgeAlpha);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new THREE.Points(pointGeometry, pointMaterial);
  points.frustumCulled = false;
  points.renderOrder = 44;
  group.add(points);

  const orbitGeometry = createSatelliteOrbitRibbonGeometry(THREE);
  const orbitMaterial = new THREE.ShaderMaterial({
    uniforms: {
      lineWidthPx: { value: 1.5 },
      viewportSize: { value: new THREE.Vector2(1, 1) },
      orbitOpacity: { value: 0.72 },
      earthRotationRad: { value: 0 },
      cameraNear: { value: 0.02 },
    },
    vertexShader: `
      uniform float lineWidthPx;
      uniform vec2 viewportSize;
      uniform float earthRotationRad;
      uniform float cameraNear;
      attribute vec3 instanceStart;
      attribute vec3 instanceEnd;
      attribute vec3 instanceColor;
      varying vec3 vColor;
      varying float vAcross;
      vec3 rotateEarthAxis(vec3 point) {
        float cosine = cos(earthRotationRad);
        float sine = sin(earthRotationRad);
        return vec3(
          cosine * point.x - sine * point.z,
          point.y,
          sine * point.x + cosine * point.z
        );
      }
      void main() {
        vec3 rotatedStart = rotateEarthAxis(instanceStart);
        vec3 rotatedEnd = rotateEarthAxis(instanceEnd);
        vec3 clippedStart = rotatedStart;
        vec3 clippedEnd = rotatedEnd;
        vec4 startView = modelViewMatrix * vec4(rotatedStart, 1.0);
        vec4 endView = modelViewMatrix * vec4(rotatedEnd, 1.0);
        float nearZ = -max(cameraNear, 0.000001);
        bool startBehindNear = startView.z > nearZ;
        bool endBehindNear = endView.z > nearZ;
        if (startBehindNear && endBehindNear) {
          vColor = instanceColor;
          vAcross = position.y;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        if (startBehindNear) {
          float clipFraction = clamp((nearZ - startView.z) / (endView.z - startView.z), 0.0, 1.0);
          startView = mix(startView, endView, clipFraction);
          clippedStart = mix(rotatedStart, rotatedEnd, clipFraction);
        } else if (endBehindNear) {
          float clipFraction = clamp((nearZ - startView.z) / (endView.z - startView.z), 0.0, 1.0);
          endView = mix(startView, endView, clipFraction);
          clippedEnd = mix(rotatedStart, rotatedEnd, clipFraction);
        }
        vec4 startClip = projectionMatrix * startView;
        vec4 endClip = projectionMatrix * endView;
        vec2 startNdc = startClip.xy / startClip.w;
        vec2 endNdc = endClip.xy / endClip.w;
        vec2 screenDelta = (endNdc - startNdc) * viewportSize;
        vec2 tangent = length(screenDelta) > 0.0001
          ? normalize(screenDelta)
          : vec2(1.0, 0.0);
        vec2 normal = vec2(-tangent.y, tangent.x);
        vec4 clipPosition = mix(startClip, endClip, position.x);
        float endpointDirection = position.x < 0.5 ? -1.0 : 1.0;
        float capPx = max(0.85, lineWidthPx * 0.58);
        vec2 pixelOffset = normal * position.y * lineWidthPx
          + tangent * endpointDirection * capPx;
        clipPosition.xy += pixelOffset * clipPosition.w / max(viewportSize, vec2(1.0));
        vColor = instanceColor;
        vAcross = position.y;
        gl_Position = clipPosition;
      }
    `,
    fragmentShader: `
      uniform float orbitOpacity;
      varying vec3 vColor;
      varying float vAcross;
      void main() {
        float edgeCoverage = 1.0 - smoothstep(0.78, 1.0, abs(vAcross));
        float alpha = orbitOpacity * edgeCoverage;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: false,
    alphaToCoverage: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const orbits = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbits.frustumCulled = false;
  orbits.renderOrder = 36;
  group.add(orbits);

  // Dense constellations use native GPU line segments. This avoids the broad,
  // translucent quad overlap that produces moire when thousands of nearby
  // orbital planes are zoomed or viewed edge-on.
  const denseOrbitGeometry = new THREE.BufferGeometry();
  denseOrbitGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  denseOrbitGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
  denseOrbitGeometry.setDrawRange(0, 0);
  const denseOrbitMaterial = new THREE.ShaderMaterial({
    uniforms: {
      orbitOpacity: { value: 0.9 },
    },
    vertexShader: `
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float orbitOpacity;
      varying vec3 vColor;
      void main() {
        if (orbitOpacity < 0.01) discard;
        gl_FragColor = vec4(vColor, orbitOpacity);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const denseOrbits = new THREE.LineSegments(denseOrbitGeometry, denseOrbitMaterial);
  denseOrbits.frustumCulled = false;
  denseOrbits.renderOrder = 36;
  denseOrbits.visible = false;
  group.add(denseOrbits);

  const coverageFillGeometry = createSatelliteCoverageInstanceGeometry(THREE, true, SATELLITE_COVERAGE_SEGMENTS);
  const coverageOutlineGeometry = createSatelliteCoverageInstanceGeometry(THREE, false, SATELLITE_COVERAGE_SEGMENTS);
  const coverageFillMaterial = createSatelliteCoverageShaderMaterial(THREE, 0.08);
  const coverageOutlineMaterial = createSatelliteCoverageShaderMaterial(THREE, 0.24);
  const coverageFill = new THREE.Mesh(coverageFillGeometry, coverageFillMaterial);
  const coverageOutline = new THREE.LineSegments(coverageOutlineGeometry, coverageOutlineMaterial);
  for (const object of [coverageFill, coverageOutline]) {
    object.frustumCulled = false;
    object.renderOrder = object === coverageFill ? 30 : 32;
    group.add(object);
  }

  const imagingFillGeometry = createSatelliteImagingInstanceGeometry(THREE, "fill");
  const imagingOutlineGeometry = createSatelliteImagingInstanceGeometry(THREE, "outline");
  const imagingScanGeometry = createSatelliteImagingInstanceGeometry(THREE, "scan");
  const imagingFillMaterial = createSatelliteImagingShaderMaterial(THREE, 0.08, false);
  const imagingOutlineMaterial = createSatelliteImagingShaderMaterial(THREE, 0.7, false);
  const imagingScanMaterial = createSatelliteImagingShaderMaterial(THREE, 0.58, true);
  const imagingFill = new THREE.Mesh(imagingFillGeometry, imagingFillMaterial);
  const imagingOutline = new THREE.LineSegments(imagingOutlineGeometry, imagingOutlineMaterial);
  const imagingScan = new THREE.LineSegments(imagingScanGeometry, imagingScanMaterial);
  for (const object of [imagingFill, imagingOutline, imagingScan]) {
    object.frustumCulled = false;
    object.renderOrder = object === imagingFill ? 33 : object === imagingOutline ? 34 : 42;
    group.add(object);
  }

  return {
    group,
    points,
    pointGeometry,
    pointMaterial,
    orbits,
    orbitGeometry,
    orbitMaterial,
    denseOrbits,
    denseOrbitGeometry,
    denseOrbitMaterial,
    coverageFill,
    coverageOutline,
    coverageFillGeometry,
    coverageOutlineGeometry,
    coverageFillMaterial,
    coverageOutlineMaterial,
    imagingFill,
    imagingOutline,
    imagingScan,
    imagingFillGeometry,
    imagingOutlineGeometry,
    imagingScanGeometry,
    imagingFillMaterial,
    imagingOutlineMaterial,
    imagingScanMaterial,
    positionRevision: -1,
    orbitRevision: -1,
    coverageRevision: -1,
    coverageSegments: SATELLITE_COVERAGE_SEGMENTS,
    selectionRevision: -1,
    pointCount: 0,
    coverageCount: 0,
    imagingCount: 0,
    orbitCount: 0,
    orbitSegmentCount: 0,
    orbitSubmittedSegmentCount: 0,
    denseOrbitMode: false,
    orbitReferenceTimeMs: NaN,
    orbitAnchorMaxErrorKm: NaN,
    orbitClosedCount: 0,
    orbitContinuousCount: 0,
    orbitRejectedClosureCount: 0,
  };
}

function createSatelliteOrbitRibbonGeometry(THREE) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    0, -1, 0, 1, -1, 0, 1, 1, 0,
    0, -1, 0, 1, 1, 0, 0, 1, 0,
  ], 3));
  geometry.setAttribute("instanceStart", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceEnd", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.instanceCount = 0;
  geometry._maxInstanceCount = 0;
  return geometry;
}

function setSatelliteInstancedGeometryCount(geometry, count) {
  if (!geometry) return;
  const normalized = Math.max(0, Math.floor(Number(count) || 0));
  geometry.instanceCount = normalized;
  // Three.js caches this value on the first render. Dynamic constellation,
  // coverage and swath buffers must replace that cache when they grow.
  geometry._maxInstanceCount = normalized;
}

function createSatelliteImagingInstanceGeometry(THREE, mode) {
  const corners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  const positions = [];
  if (mode === "fill") {
    for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...corners[index], 0);
  } else if (mode === "scan") {
    for (const corner of corners) positions.push(...corner, 1, ...corner, 0);
  } else {
    for (let index = 0; index < corners.length; index += 1) {
      positions.push(...corners[index], 0, ...corners[(index + 1) % corners.length], 0);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("instanceCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceFootprintCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceFootprintVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextFootprintCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextFootprintVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceFootprintAlong", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextFootprintAlong", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instancePointing", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceHalfAngular", new THREE.InstancedBufferAttribute(new Float32Array(0), 2));
  geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.instanceCount = 0;
  return geometry;
}

function createSatelliteImagingShaderMaterial(THREE, opacity, scanMode) {
  return new THREE.ShaderMaterial({
    uniforms: {
      coverageOpacity: { value: opacity },
      footprintRadius: { value: 1.00036 },
      frameDeltaSec: { value: 0 },
      interpolationDurationSec: { value: 1 },
      scanMode: { value: scanMode ? 1 : 0 },
    },
    vertexShader: `
      uniform float footprintRadius;
      uniform float frameDeltaSec;
      uniform float interpolationDurationSec;
      uniform float scanMode;
      attribute vec3 instanceCenter;
      attribute vec3 instanceVelocity;
      attribute vec3 instanceNextCenter;
      attribute vec3 instanceNextVelocity;
      attribute vec3 instanceFootprintCenter;
      attribute vec3 instanceFootprintVelocity;
      attribute vec3 instanceNextFootprintCenter;
      attribute vec3 instanceNextFootprintVelocity;
      attribute vec3 instanceFootprintAlong;
      attribute vec3 instanceNextFootprintAlong;
      attribute vec3 instancePointing;
      attribute vec2 instanceHalfAngular;
      attribute vec3 instanceColor;
      varying vec3 vColor;
      varying float vFacing;
      varying float vScanMode;
      varying float vBeamProgress;
      ${satelliteGpuAdvanceShaderSource()}
      void main() {
        vec3 satellitePosition = interpolateSatellite(
          instanceCenter, instanceVelocity, instanceNextCenter, instanceNextVelocity,
          frameDeltaSec, interpolationDurationSec
        );
        vec3 footprintPosition = interpolateSatellite(
          instanceFootprintCenter, instanceFootprintVelocity,
          instanceNextFootprintCenter, instanceNextFootprintVelocity,
          frameDeltaSec, interpolationDurationSec
        );
        float interpolationT = clamp(frameDeltaSec / max(interpolationDurationSec, 0.0001), 0.0, 1.0);
        vec3 satelliteVelocity = mix(instanceVelocity, instanceNextVelocity, interpolationT);
        vec3 fixedAngleAlong = vec3(0.0);
        if (instancePointing.z > 0.5) {
          vec3 satelliteUp = normalize(satellitePosition);
          vec3 orbitNormal = cross(satellitePosition, satelliteVelocity);
          if (length(orbitNormal) > 0.0000001) {
            fixedAngleAlong = normalize(cross(normalize(orbitNormal), satelliteUp));
            vec3 fixedAngleRight = normalize(cross(fixedAngleAlong, satelliteUp));
            vec3 sight = normalize(
              -satelliteUp
              + fixedAngleAlong * instancePointing.y
              + fixedAngleRight * instancePointing.x
            );
            float rayProjection = dot(satellitePosition, sight);
            float rayDiscriminant = rayProjection * rayProjection - (dot(satellitePosition, satellitePosition) - 1.0);
            if (rayDiscriminant >= 0.0) {
              float rayDistance = -rayProjection - sqrt(rayDiscriminant);
              if (rayDistance > 0.0) footprintPosition = satellitePosition + sight * rayDistance;
            }
          }
        }
        vec3 up = normalize(footprintPosition);
        vec3 interpolatedAlong = mix(
          instanceFootprintAlong,
          instanceNextFootprintAlong,
          interpolationT
        );
        if (instancePointing.z > 0.5 && length(fixedAngleAlong) > 0.0000001) interpolatedAlong = fixedAngleAlong;
        vec3 tangentAlong = interpolatedAlong - up * dot(interpolatedAlong, up);
        vec3 orbitNormal = cross(satellitePosition, satelliteVelocity);
        vec3 along = length(tangentAlong) > 0.0000001
          ? normalize(tangentAlong)
          : length(orbitNormal) > 0.0000001
            ? normalize(cross(normalize(orbitNormal), up))
          : normalize(cross(abs(up.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), up));
        vec3 across = normalize(cross(up, along));
        vec3 tangentOffset = across * (position.x * instanceHalfAngular.x)
          + along * (position.y * instanceHalfAngular.y);
        float surfaceAngle = length(tangentOffset);
        vec3 surfaceDirection = surfaceAngle > 0.0000001
          ? normalize(up * cos(surfaceAngle) + normalize(tangentOffset) * sin(surfaceAngle))
          : up;
        vec3 surfacePoint = surfaceDirection * footprintRadius;
        vec3 displayPosition = position.z > 0.5 ? satellitePosition : surfacePoint;
        vColor = instanceColor;
        vFacing = (modelViewMatrix * vec4(surfaceDirection, 0.0)).z;
        vScanMode = scanMode;
        vBeamProgress = position.z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(displayPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform float coverageOpacity;
      varying vec3 vColor;
      varying float vFacing;
      varying float vScanMode;
      varying float vBeamProgress;
      void main() {
        if (vScanMode < 0.5 && vFacing <= -0.012) discard;
        if (vScanMode > 0.5 && fract(vBeamProgress * 28.0) > 0.62) discard;
        float horizonFade = vScanMode > 0.5 ? 1.0 : smoothstep(-0.012, 0.035, vFacing);
        gl_FragColor = vec4(vColor, coverageOpacity * horizonFade);
      }
    `,
    transparent: true,
    depthTest: scanMode,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function createSatelliteCoverageInstanceGeometry(THREE, filled, requestedSegments = SATELLITE_COVERAGE_SEGMENTS) {
  const positions = [];
  const segments = Math.max(8, Math.round(Number(requestedSegments) || SATELLITE_COVERAGE_SEGMENTS));
  for (let segment = 0; segment < segments; segment += 1) {
    const angleA = segment * Math.PI * 2 / segments;
    const angleB = (segment + 1) * Math.PI * 2 / segments;
    if (filled) {
      positions.push(0, 0, 0, Math.cos(angleA), Math.sin(angleA), 1, Math.cos(angleB), Math.sin(angleB), 1);
    } else {
      positions.push(Math.cos(angleA), Math.sin(angleA), 1, Math.cos(angleB), Math.sin(angleB), 1);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("instanceCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextCenter", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceNextVelocity", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.setAttribute("instanceAngular", new THREE.InstancedBufferAttribute(new Float32Array(0), 2));
  geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(new Float32Array(0), 3));
  geometry.instanceCount = 0;
  return geometry;
}

function createSatelliteCoverageShaderMaterial(THREE, opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      coverageOpacity: { value: opacity },
      coverageRadius: { value: 1.00032 },
      frameDeltaSec: { value: 0 },
      interpolationDurationSec: { value: 1 },
    },
    vertexShader: `
      uniform float coverageRadius;
      uniform float frameDeltaSec;
      uniform float interpolationDurationSec;
      attribute vec3 instanceCenter;
      attribute vec3 instanceVelocity;
      attribute vec3 instanceNextCenter;
      attribute vec3 instanceNextVelocity;
      attribute vec2 instanceAngular;
      attribute vec3 instanceColor;
      varying vec3 vColor;
      varying float vFacing;
      ${satelliteGpuAdvanceShaderSource()}
      void main() {
        vec3 up = normalize(interpolateSatellite(
          instanceCenter, instanceVelocity, instanceNextCenter, instanceNextVelocity,
          frameDeltaSec, interpolationDurationSec
        ));
        vec3 referenceAxis = abs(up.y) > 0.985 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
        vec3 east = normalize(cross(referenceAxis, up));
        vec3 north = normalize(cross(up, east));
        vec3 tangent = east * position.x + north * position.y;
        vec3 ringPoint = normalize(up * instanceAngular.x + tangent * instanceAngular.y);
        vec3 surfacePoint = normalize(mix(up, ringPoint, position.z)) * coverageRadius;
        vColor = instanceColor;
        vFacing = (normalMatrix * normalize(surfacePoint)).z;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(surfacePoint, 1.0);
      }
    `,
    fragmentShader: `
      uniform float coverageOpacity;
      varying vec3 vColor;
      varying float vFacing;
      void main() {
        if (vFacing <= -0.012) discard;
        float horizonFade = smoothstep(-0.012, 0.035, vFacing);
        gl_FragColor = vec4(vColor, coverageOpacity * horizonFade);
      }
    `,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function satelliteGpuAdvanceShaderSource() {
  return `
    vec3 interpolateSatellite(
      vec3 startPosition,
      vec3 startVelocity,
      vec3 endPosition,
      vec3 endVelocity,
      float elapsedSec,
      float durationSec
    ) {
      if (abs(durationSec) < 0.0001) return startPosition;
      float t = clamp(elapsedSec / durationSec, 0.0, 1.0);
      float t2 = t * t;
      float t3 = t2 * t;
      float h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
      float h10 = t3 - 2.0 * t2 + t;
      float h01 = -2.0 * t3 + 3.0 * t2;
      float h11 = t3 - t2;
      return h00 * startPosition
        + h10 * durationSec * startVelocity
        + h01 * endPosition
        + h11 * durationSec * endVelocity;
    }
  `;
}

function updateThreeTrajectoryGpu(globe) {
  const layer = globe?.trajectoryGpuLayer;
  if (!layer) return;
  layer.group.visible = isGlobeLayer();
  if (!layer.group.visible) return;
  const viewportWidth = Math.max(1, Number(globe.renderWidth) || 1);
  const viewportHeight = Math.max(1, Number(globe.renderHeight) || 1);
  const cameraNear = Math.max(0.000001, Number(globe.camera?.near) || 0.02);
  for (const material of [layer.lines.material, layer.glow.material]) {
    material.uniforms.viewportSize.value.set(viewportWidth, viewportHeight);
    material.uniforms.cameraNear.value = cameraNear;
  }
  const signature = JSON.stringify([
    ballisticPhysicsRevision,
    state.trajectoryTracks.map((track) => ({
      id: track.id,
      color: track.color,
      showGroundTrack: track.showGroundTrack,
      groundTrackSources: track.groundTrackSources,
      points: track.points,
      curveControls: track.curveControls,
      geodesic: track.geodesic,
      ballistic: track.ballistic,
    })),
  ]);
  if (layer.signature === signature) return;
  const startedAt = performance.now();
  const positions = [];
  const colors = [];
  const widths = [];
  for (const track of state.trajectoryTracks) appendThreeTrajectoryTrack(globe.THREE, positions, colors, widths, track);
  replaceThreeTrajectoryGeometry(globe.THREE, layer, positions, colors, widths);
  layer.signature = signature;
  layer.segmentCount = positions.length / 6;
  layer.buildCount = (Number(layer.buildCount) || 0) + 1;
  if (els.globeCanvas) {
    els.globeCanvas.dataset.trajectoryRenderer = "webgl-resident-geometry";
    els.globeCanvas.dataset.trajectoryGroundTrackRenderer = "canvas-overlay-only";
    els.globeCanvas.dataset.trajectoryGpuSegments = String(layer.segmentCount);
    els.globeCanvas.dataset.trajectoryGpuBuildCount = String(layer.buildCount);
    els.globeCanvas.dataset.trajectoryGpuBuildMs = (performance.now() - startedAt).toFixed(1);
  }
}

function appendThreeTrajectoryTrack(THREE, positions, colors, widths, track) {
  ensureTrajectoryBallistic(track);
  const selected = selectedTrajectoryItems(track);
  let geometry = null;
  if (selected.length) geometry = cachedTrajectoryGeometry(track, selected);
  const canDrawPoweredPath = track.ballistic?.showPoweredPath === true &&
    Number.isFinite(track.ballistic.poweredStartLat) &&
    Number.isFinite(track.ballistic.poweredStartLon);
  if (canDrawPoweredPath) {
    const powered = cachedBallisticPoweredGeometry(track, selected);
    appendThreeTrajectoryPolyline(THREE, positions, colors, widths, powered.samples, track.ballistic.poweredPathColor || "#ffd166", {
      altitudeAccessor: (sample) => ballisticRenderAltitudeKm((Number(sample.altitudeM) || 0) / 1000),
      lineWidthPx: finiteOrClamp(track.ballistic.poweredPathWidth, 4, 1, 12),
    });
  }
  if (!track.ballistic?.enabled) return;
  const path = geometry?.path;
  for (const [stageIndex, stage] of (track.ballistic?.stages || []).entries()) {
    const segment = path?.totalKm >= 1 ? buildBallisticStageSegment(stage, selected, path, stageIndex, geometry?.signature) : null;
    if (!segment?.physics?.valid || segment.physics.samples.length < 2) continue;
    const samples = ballisticDisplaySamples(segment.physics.samples);
    appendThreeTrajectoryPolyline(THREE, positions, colors, widths, samples, stage.color || "#ff5b61", {
      altitudeAccessor: (sample) => ballisticRenderAltitudeKm((Number(sample.altitudeM) || 0) / 1000),
      lineWidthPx: finiteOrClamp(
        stage.lineWidth,
        BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
        BALLISTIC_STAGE_LINE_WIDTH_MIN,
        BALLISTIC_STAGE_LINE_WIDTH_MAX,
      ),
      colorAccessor: (sample) => {
        const heat = reentryHeatVisual(sample?.convectiveHeatFluxWm2);
        const atmospheric = smoothstep(0.2, 8, Number(sample?.dynamicPressurePa) || 0);
        return atmospheric > 0.001 && heat.intensity > 0.001
          ? reentryGlowRgb(heat.intensity).map((channel) => channel / 255)
          : null;
      },
    });
  }
}

function appendThreeTrajectoryPolyline(THREE, positions, colors, widths, samples, fallbackColor, options = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return;
  const defaultColor = new THREE.Color(fallbackColor || "#ffe08a");
  const pointAt = (sample) => {
    const altitudeKm = options.altitudeAccessor
      ? Number(options.altitudeAccessor(sample)) || 0
      : Number(options.altitudeOffsetKm) || 0;
    const lon = Array.isArray(sample) ? Number(sample[0]) : Number(sample?.lon);
    const lat = Array.isArray(sample) ? Number(sample[1]) : Number(sample?.lat);
    return spherePoint(lon, lat, 1 + Math.max(0, altitudeKm) / EARTH_MEAN_RADIUS_KM);
  };
  let previous = pointAt(samples[0]);
  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index];
    const next = pointAt(sample);
    if (![previous.x, previous.y, previous.z, next.x, next.y, next.z].every(Number.isFinite)) {
      previous = next;
      continue;
    }
    const dynamicColor = options.colorAccessor?.(sample);
    const color = dynamicColor || [defaultColor.r, defaultColor.g, defaultColor.b];
    positions.push(previous.x, previous.y, previous.z, next.x, next.y, next.z);
    colors.push(color[0], color[1], color[2], color[0], color[1], color[2]);
    widths.push(finiteOrClamp(
      options.lineWidthPx,
      BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
      BALLISTIC_STAGE_LINE_WIDTH_MIN,
      BALLISTIC_STAGE_LINE_WIDTH_MAX,
    ));
    previous = next;
  }
}

function replaceThreeTrajectoryGeometry(THREE, layer, positions, colors, widths) {
  const previousLineGeometry = layer.lines.geometry;
  const previousGlowGeometry = layer.glow.geometry;
  const segmentCount = Math.min(
    widths.length,
    Math.floor(positions.length / 6),
    Math.floor(colors.length / 6),
  );
  const starts = new Float32Array(segmentCount * 3);
  const ends = new Float32Array(segmentCount * 3);
  const instanceColors = new Float32Array(segmentCount * 3);
  const instanceWidths = new Float32Array(segmentCount);
  for (let index = 0; index < segmentCount; index += 1) {
    const source = index * 6;
    const target = index * 3;
    starts[target] = positions[source];
    starts[target + 1] = positions[source + 1];
    starts[target + 2] = positions[source + 2];
    ends[target] = positions[source + 3];
    ends[target + 1] = positions[source + 4];
    ends[target + 2] = positions[source + 5];
    instanceColors[target] = colors[source];
    instanceColors[target + 1] = colors[source + 1];
    instanceColors[target + 2] = colors[source + 2];
    instanceWidths[index] = widths[index];
  }
  const geometry = createSatelliteOrbitRibbonGeometry(THREE);
  geometry.setAttribute("instanceStart", new THREE.InstancedBufferAttribute(starts, 3));
  geometry.setAttribute("instanceEnd", new THREE.InstancedBufferAttribute(ends, 3));
  geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(instanceColors, 3));
  geometry.setAttribute("instanceWidth", new THREE.InstancedBufferAttribute(instanceWidths, 1));
  // createSatelliteOrbitRibbonGeometry initializes Three.js' private cached
  // instance ceiling to zero. Updating instanceCount alone therefore reports
  // segments in diagnostics while submitting no vertices to the GPU.
  setSatelliteInstancedGeometryCount(geometry, segmentCount);
  layer.lines.geometry = geometry;
  layer.glow.geometry = geometry;
  previousLineGeometry?.dispose();
  if (previousGlowGeometry && previousGlowGeometry !== previousLineGeometry) previousGlowGeometry.dispose();
  layer.lines.visible = segmentCount > 0;
  layer.glow.visible = segmentCount > 0;
  if (els.globeCanvas) {
    els.globeCanvas.dataset.trajectoryGpuSubmittedSegments = String(geometry._maxInstanceCount || 0);
    els.globeCanvas.dataset.trajectoryGpuVisible = segmentCount > 0 ? "true" : "false";
  }
}

function updateThreeSatelliteGpu(globe) {
  const layer = globe?.satelliteGpuLayer;
  if (!layer) return;
  const enabled = Boolean(state.satelliteLayerEnabled && isGlobeLayer() && state.satelliteVisibleIds.length);
  layer.group.visible = enabled;
  if (!enabled) return;

  const interacting = isInteractiveRender();
  const communicationCount = state.satelliteCommunicationIds.length;
  const bulkAnimating = Boolean(state.satellitePlaybackRate && communicationCount > 1500);
  const coverageSegments = communicationCount > 8000
    ? interacting || bulkAnimating ? 12 : 16
    : communicationCount > 4000
      ? interacting || bulkAnimating ? 14 : 18
      : communicationCount > 1500
        ? interacting || bulkAnimating ? 16 : 22
        : interacting ? Math.max(12, Math.min(18, SATELLITE_COVERAGE_SEGMENTS)) : SATELLITE_COVERAGE_SEGMENTS;
  if (coverageSegments !== layer.coverageSegments) replaceThreeSatelliteCoverageGeometry(globe, layer, coverageSegments);

  if (layer.positionRevision !== satelliteGpuPositionRevision || layer.selectionRevision !== satelliteSelectionRevision) {
    updateThreeSatellitePoints(globe, layer);
    layer.positionRevision = satelliteGpuPositionRevision;
  }
  if (layer.coverageRevision !== satelliteGpuCoverageRevision || layer.selectionRevision !== satelliteSelectionRevision) {
    updateThreeSatelliteCommunicationCoverage(globe, layer);
    updateThreeSatelliteImagingCoverage(globe, layer);
    layer.coverageRevision = satelliteGpuCoverageRevision;
  }
  if (layer.orbitRevision !== satelliteGpuOrbitRevision || layer.selectionRevision !== satelliteSelectionRevision) {
    updateThreeSatelliteOrbits(globe, layer);
    layer.orbitRevision = satelliteGpuOrbitRevision;
  }
  layer.selectionRevision = satelliteSelectionRevision;
  const frameDeltaSec = Number.isFinite(satelliteLastPropagatedTimeMs)
    ? (state.satelliteTimeMs - satelliteLastPropagatedTimeMs) / 1000
    : 0;
  const visualScale = satelliteVisualScaleForZoom();
  const renderedOrbitWidth = state.satelliteOrbitLineWidth * visualScale;
  layer.pointMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  layer.pointMaterial.uniforms.interpolationDurationSec.value = state.satelliteInterpolationDurationSec || 1;
  layer.pointMaterial.uniforms.pointSize.value = state.satellitePointSize
    * visualScale
    * Math.min(1.5, Math.max(1, globe.pixelRatio || 1));
  layer.pointMaterial.uniforms.pointOutlinePx.value = 1.35
    * Math.min(1.5, Math.max(1, globe.pixelRatio || 1));
  const renderedPointSize = layer.pointMaterial.uniforms.pointSize.value;
  layer.orbitMaterial.uniforms.lineWidthPx.value = renderedOrbitWidth;
  layer.orbitMaterial.uniforms.viewportSize.value.set(Math.max(1, Number(globe.renderWidth) || 1), Math.max(1, Number(globe.renderHeight) || 1));
  layer.orbitMaterial.uniforms.cameraNear.value = Math.max(0.000001, Number(globe.camera?.near) || 0.02);
  const satelliteDisplayTimeMs = satelliteInterpolatedDisplayTimeMs();
  const orbitRotationRad = satelliteOrbitRotationRad(layer.orbitReferenceTimeMs, satelliteDisplayTimeMs);
  const orbitOpacity = state.satelliteVisibleIds.length > 8000
    ? 0.2
    : state.satelliteVisibleIds.length > 4000
      ? 0.22
      : state.satelliteVisibleIds.length > 1200
        ? 0.25
        : state.satelliteVisibleIds.length > 240 ? 0.3 : 0.76;
  layer.orbitMaterial.uniforms.earthRotationRad.value = orbitRotationRad;
  layer.orbitMaterial.uniforms.orbitOpacity.value = orbitOpacity;
  const denseOrbitOpacity = satelliteDenseOrbitOpacity(state.satelliteVisibleIds.length);
  layer.denseOrbitMaterial.uniforms.orbitOpacity.value = denseOrbitOpacity;
  layer.denseOrbits.quaternion.identity();
  layer.denseOrbits.rotation.y = -orbitRotationRad;
  layer.coverageOutlineMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  layer.coverageFillMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  layer.imagingFillMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  layer.imagingOutlineMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  layer.imagingScanMaterial.uniforms.frameDeltaSec.value = frameDeltaSec;
  for (const material of [
    layer.coverageOutlineMaterial,
    layer.coverageFillMaterial,
    layer.imagingFillMaterial,
    layer.imagingOutlineMaterial,
    layer.imagingScanMaterial,
  ]) {
    material.uniforms.interpolationDurationSec.value = state.satelliteInterpolationDurationSec || 1;
  }
  layer.points.visible = state.satelliteLayerEnabled;
  layer.orbits.visible = state.satelliteOrbitLinesEnabled && !layer.denseOrbitMode && layer.orbitCount > 0;
  layer.denseOrbits.visible = state.satelliteOrbitLinesEnabled && layer.denseOrbitMode && layer.orbitCount > 0;
  layer.coverageOutline.visible = state.satelliteCoverageEnabled && state.satelliteCommunicationEnabled && layer.coverageCount > 0;
  layer.coverageFill.visible = layer.coverageOutline.visible;
  layer.imagingFill.visible = state.satelliteCoverageEnabled && state.satelliteImagingEnabled && layer.imagingCount > 0;
  layer.imagingOutline.visible = layer.imagingFill.visible;
  layer.imagingScan.visible = layer.imagingFill.visible;
  layer.coverageOutlineMaterial.uniforms.coverageOpacity.value = layer.coverageCount > 2200
    ? clamp(0.12 + state.satelliteCommunicationOpacity * 0.48, 0.14, 0.72)
    : clamp(0.18 + state.satelliteCommunicationOpacity * 0.68, 0.22, 0.92);
  layer.coverageFillMaterial.uniforms.coverageOpacity.value = satelliteCommunicationSingleCoverageAlpha(
    layer.coverageCount,
    state.satelliteCommunicationOpacity,
  );
  layer.imagingFillMaterial.uniforms.coverageOpacity.value = clamp(0.1 + state.satelliteImagingOpacity * 0.42, 0.14, 0.54);
  layer.imagingOutlineMaterial.uniforms.coverageOpacity.value = clamp(0.48 + state.satelliteImagingOpacity * 0.5, 0.54, 0.98);
  layer.imagingScanMaterial.uniforms.coverageOpacity.value = clamp(0.42 + state.satelliteImagingOpacity * 0.52, 0.48, 0.96);
  if (els.globeCanvas) {
    const unavailableCoverage = Math.max(0, state.satelliteCommunicationIds.length - layer.coverageCount);
    els.globeCanvas.dataset.satelliteGpu = "true";
    els.globeCanvas.dataset.satelliteGpuPoints = String(layer.pointCount);
    els.globeCanvas.dataset.satelliteGpuZoomScale = visualScale.toFixed(4);
    els.globeCanvas.dataset.satelliteGpuPointSize = renderedPointSize.toFixed(2);
    els.globeCanvas.dataset.satelliteGpuPointOutlinePx = layer.pointMaterial.uniforms.pointOutlinePx.value.toFixed(2);
    els.globeCanvas.dataset.satelliteGpuCoverage = String(layer.coverageCount);
    els.globeCanvas.dataset.satelliteGpuCoverageExpected = String(state.satelliteCommunicationIds.length);
    els.globeCanvas.dataset.satelliteGpuCoverageUnavailable = String(unavailableCoverage);
    els.globeCanvas.dataset.satelliteGpuCoverageSegments = String(layer.coverageSegments);
    els.globeCanvas.dataset.satelliteGpuCoverageFill = layer.coverageFill.visible ? "visible" : "hidden";
    els.globeCanvas.dataset.satelliteGpuCoverageFillOpacity = layer.coverageFillMaterial.uniforms.coverageOpacity.value.toFixed(4);
    els.globeCanvas.dataset.satelliteGpuCoverageBlend = "alpha-density";
    els.globeCanvas.dataset.satelliteGpuCoverageColor = "instance-outline-color";
    els.globeCanvas.dataset.satelliteGpuCoverageOverlap = "cumulative";
    els.globeCanvas.dataset.satelliteGpuCoverageOutlineMode = "front-facing-solid";
    els.globeCanvas.dataset.satelliteGpuImaging = String(layer.imagingCount);
    els.globeCanvas.dataset.satelliteGpuImagingExpected = String(state.satelliteImagingIds.length);
    els.globeCanvas.dataset.satelliteGpuImagingUnavailable = String(Math.max(0, state.satelliteImagingIds.length - layer.imagingCount));
    els.globeCanvas.dataset.satelliteGpuImagingComplete = layer.imagingCount === state.satelliteImagingIds.length ? "true" : "false";
    els.globeCanvas.dataset.satelliteGpuImagingRenderer = "instanced-interpolated";
    els.globeCanvas.dataset.satelliteGpuImagingScanLines = String(layer.imagingCount * 4);
    els.globeCanvas.dataset.satelliteGpuImagingFill = layer.imagingFill.visible ? "visible" : "hidden";
    els.globeCanvas.dataset.satelliteGpuImagingFillOpacity = layer.imagingFillMaterial.uniforms.coverageOpacity.value.toFixed(4);
    els.globeCanvas.dataset.satelliteGpuImagingBeamMode = "high-density-dashed";
    const expectedOrbitIds = satelliteOrbitPathIds(visibleSelectedSatelliteIds());
    const propagationUnavailableIds = expectedOrbitIds.filter((id) => state.satellitePropagationErrorIds.has(String(id)));
    const transportMissingCount = [...satelliteOrbitMissingIds]
      .filter((id) => !state.satellitePropagationErrorIds.has(String(id))).length;
    const propagationUnavailableCount = propagationUnavailableIds.length;
    const expectedOrbitCount = layer.orbitExpectedCount || 0;
    const orbitBuildComplete = layer.orbitCount + propagationUnavailableCount === expectedOrbitCount
      && transportMissingCount === 0;
    els.globeCanvas.dataset.satelliteGpuOrbits = String(layer.orbitCount);
    els.globeCanvas.dataset.satelliteGpuOrbitExpected = String(expectedOrbitCount);
    els.globeCanvas.dataset.satelliteGpuOrbitUnavailable = String(propagationUnavailableCount);
    els.globeCanvas.dataset.satelliteGpuOrbitTransportMissing = String(transportMissingCount);
    els.globeCanvas.dataset.satelliteGpuOrbitSegments = String(layer.orbitSegmentCount || 0);
    els.globeCanvas.dataset.satelliteGpuOrbitSubmittedSegments = String(layer.orbitSubmittedSegmentCount || 0);
    els.globeCanvas.dataset.satelliteGpuOrbitClosed = String(layer.orbitClosedCount || 0);
    els.globeCanvas.dataset.satelliteGpuOrbitContinuous = String(layer.orbitContinuousCount || 0);
    els.globeCanvas.dataset.satelliteGpuOrbitRejectedClosure = String(layer.orbitRejectedClosureCount || 0);
    els.globeCanvas.dataset.satelliteGpuOrbitRejectedClosureIds = (layer.orbitRejectedClosureIds || []).join(",");
    els.globeCanvas.dataset.satelliteGpuOrbitComplete = orbitBuildComplete ? "true" : "false";
    els.globeCanvas.dataset.satelliteGpuOrbitOcclusion = "native-depth-buffer";
    els.globeCanvas.dataset.satelliteGpuOrbitNearClip = "view-space-segment-clipped";
    els.globeCanvas.dataset.satelliteGpuOrbitPolarContinuity = "single-epoch-eci-closed-double-sided-depth-tested";
    els.globeCanvas.dataset.satelliteGpuOrbitStyle = layer.denseOrbitMode
      ? "native-alpha-density-no-moire"
      : "solid-antialiased-no-glow";
    els.globeCanvas.dataset.satelliteGpuOrbitDenseMode = layer.denseOrbitMode ? "true" : "false";
    els.globeCanvas.dataset.satelliteGpuOrbitDenseOpacity = denseOrbitOpacity.toFixed(4);
    els.globeCanvas.dataset.satelliteOrbitFitMode = satelliteLastOrbitFit?.mode || "manual";
    els.globeCanvas.dataset.satelliteOrbitFitZoom = Number(satelliteLastOrbitFit?.zoom ?? state.view.zoom).toFixed(4);
    els.globeCanvas.dataset.satelliteOrbitFitSceneRadius = Number(satelliteLastOrbitFit?.maximumSceneRadius || 1).toFixed(4);
    els.globeCanvas.dataset.satelliteGpuOrbitRotationRad = layer.orbitMaterial.uniforms.earthRotationRad.value.toFixed(8);
    els.globeCanvas.dataset.satelliteGpuOrbitAnchorMaxErrorKm = Number.isFinite(layer.orbitAnchorMaxErrorKm)
      ? layer.orbitAnchorMaxErrorKm.toFixed(6) : "--";
    els.globeCanvas.dataset.satelliteGpuOrbitWidth = renderedOrbitWidth.toFixed(2);
    els.globeCanvas.dataset.satelliteGpuLabelSize = (state.satelliteLabelSize * visualScale).toFixed(2);
    els.globeCanvas.dataset.satelliteLabelPriorityMode = SATELLITE_ORBIT_POLICY?.labelPriorityMode?.(state.view.zoom) || "local";
    els.globeCanvas.dataset.satelliteReferenceFrame = state.satelliteReferenceFrame;
    els.globeCanvas.dataset.satelliteReferenceRotationDeg = satelliteReferenceDeltaDeg().toFixed(6);
    els.globeCanvas.dataset.satelliteViewSignature = satelliteViewSignature(globe.renderWidth, globe.renderHeight);
    if (els.satelliteCoverageCanvas) {
      els.satelliteCoverageCanvas.dataset.coverageCount = String(layer.coverageCount);
      els.satelliteCoverageCanvas.dataset.coverageUnavailable = String(unavailableCoverage);
      els.satelliteCoverageCanvas.dataset.renderer = "webgl-instanced";
    }
  }
}

function satelliteCommunicationSingleCoverageAlpha(count, strength) {
  const amount = clamp(Number(strength) || 0.45, 0.05, 1);
  // Alpha blending is intentionally count-independent: each footprint contributes
  // the same visible density, so 2x/3x overlaps genuinely accumulate on the globe.
  return clamp(0.03 + amount * 0.14, 0.035, 0.18);
}

function replaceThreeSatelliteCoverageGeometry(globe, layer, segments) {
  const nextFill = createSatelliteCoverageInstanceGeometry(globe.THREE, true, segments);
  const nextOutline = createSatelliteCoverageInstanceGeometry(globe.THREE, false, segments);
  layer.coverageFillGeometry?.dispose();
  layer.coverageOutlineGeometry?.dispose();
  layer.coverageFillGeometry = nextFill;
  layer.coverageOutlineGeometry = nextOutline;
  layer.coverageFill.geometry = nextFill;
  layer.coverageOutline.geometry = nextOutline;
  layer.coverageSegments = segments;
  layer.coverageRevision = -1;
}

function updateThreeSatellitePoints(globe, layer) {
  const positions = new Float32Array(state.satelliteVisibleIds.length * 3);
  const velocities = new Float32Array(state.satelliteVisibleIds.length * 3);
  const nextPositions = new Float32Array(state.satelliteVisibleIds.length * 3);
  const nextVelocities = new Float32Array(state.satelliteVisibleIds.length * 3);
  const colors = new Float32Array(state.satelliteVisibleIds.length * 3);
  const colorCache = new Map();
  let count = 0;
  for (const id of state.satelliteVisibleIds) {
    const position = state.satellitePositions.get(id);
    const item = state.satelliteById.get(id);
    if (!position || !item) continue;
    const point = satelliteReferenceScenePosition(position);
    const velocity = satelliteReferenceSceneVelocity(position);
    const nextPoint = satelliteReferenceSceneNextPosition(position);
    const nextVelocity = satelliteReferenceSceneNextVelocity(position);
    const offset = count * 3;
    positions[offset] = point.x;
    positions[offset + 1] = point.y;
    positions[offset + 2] = point.z;
    velocities[offset] = velocity.x;
    velocities[offset + 1] = velocity.y;
    velocities[offset + 2] = velocity.z;
    nextPositions[offset] = nextPoint.x;
    nextPositions[offset + 1] = nextPoint.y;
    nextPositions[offset + 2] = nextPoint.z;
    nextVelocities[offset] = nextVelocity.x;
    nextVelocities[offset + 1] = nextVelocity.y;
    nextVelocities[offset + 2] = nextVelocity.z;
    const colorHex = satelliteDisplayColor(item);
    let color = colorCache.get(colorHex);
    if (!color) {
      color = new globe.THREE.Color(colorHex);
      colorCache.set(colorHex, color);
    }
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
    count += 1;
  }
  layer.pointGeometry.setAttribute("position", new globe.THREE.BufferAttribute(positions.subarray(0, count * 3), 3));
  layer.pointGeometry.setAttribute("velocity", new globe.THREE.BufferAttribute(velocities.subarray(0, count * 3), 3));
  layer.pointGeometry.setAttribute("nextPosition", new globe.THREE.BufferAttribute(nextPositions.subarray(0, count * 3), 3));
  layer.pointGeometry.setAttribute("nextVelocity", new globe.THREE.BufferAttribute(nextVelocities.subarray(0, count * 3), 3));
  layer.pointGeometry.setAttribute("color", new globe.THREE.BufferAttribute(colors.subarray(0, count * 3), 3));
  layer.pointGeometry.computeBoundingSphere();
  layer.pointCount = count;
}

function updateThreeSatelliteCommunicationCoverage(globe, layer) {
  const maxCount = state.satelliteCommunicationIds.length;
  const centers = new Float32Array(maxCount * 3);
  const velocities = new Float32Array(maxCount * 3);
  const nextCenters = new Float32Array(maxCount * 3);
  const nextVelocities = new Float32Array(maxCount * 3);
  const angular = new Float32Array(maxCount * 2);
  const colors = new Float32Array(maxCount * 3);
  const colorCache = new Map();
  let count = 0;
  for (const id of state.satelliteCommunicationIds) {
    const position = state.satellitePositions.get(id);
    const profile = state.satellitePayloadById.get(id);
    if (!position || !profile) continue;
    const radiusKm = SATELLITE_PAYLOADS?.communicationCoverageRadiusKm(profile, position.altitudeKm) || 0;
    if (!(radiusKm > 0)) continue;
    const satellitePoint = satelliteReferenceScenePosition(position);
    const satelliteVelocity = satelliteReferenceSceneVelocity(position);
    const nextSatellitePoint = satelliteReferenceSceneNextPosition(position);
    const nextSatelliteVelocity = satelliteReferenceSceneNextVelocity(position);
    const satelliteRadius = Math.max(0.00001, Math.hypot(satellitePoint.x, satellitePoint.y, satellitePoint.z));
    const center = {
      x: satellitePoint.x / satelliteRadius,
      y: satellitePoint.y / satelliteRadius,
      z: satellitePoint.z / satelliteRadius,
    };
    const radialDot = center.x * satelliteVelocity.x + center.y * satelliteVelocity.y + center.z * satelliteVelocity.z;
    const surfaceVelocity = {
      x: (satelliteVelocity.x - center.x * radialDot) / satelliteRadius,
      y: (satelliteVelocity.y - center.y * radialDot) / satelliteRadius,
      z: (satelliteVelocity.z - center.z * radialDot) / satelliteRadius,
    };
    const nextSatelliteRadius = Math.max(0.00001, Math.hypot(nextSatellitePoint.x, nextSatellitePoint.y, nextSatellitePoint.z));
    const nextCenter = {
      x: nextSatellitePoint.x / nextSatelliteRadius,
      y: nextSatellitePoint.y / nextSatelliteRadius,
      z: nextSatellitePoint.z / nextSatelliteRadius,
    };
    const nextRadialDot = nextCenter.x * nextSatelliteVelocity.x
      + nextCenter.y * nextSatelliteVelocity.y
      + nextCenter.z * nextSatelliteVelocity.z;
    const nextSurfaceVelocity = {
      x: (nextSatelliteVelocity.x - nextCenter.x * nextRadialDot) / nextSatelliteRadius,
      y: (nextSatelliteVelocity.y - nextCenter.y * nextRadialDot) / nextSatelliteRadius,
      z: (nextSatelliteVelocity.z - nextCenter.z * nextRadialDot) / nextSatelliteRadius,
    };
    const centerOffset = count * 3;
    centers[centerOffset] = center.x;
    centers[centerOffset + 1] = center.y;
    centers[centerOffset + 2] = center.z;
    velocities[centerOffset] = surfaceVelocity.x;
    velocities[centerOffset + 1] = surfaceVelocity.y;
    velocities[centerOffset + 2] = surfaceVelocity.z;
    nextCenters[centerOffset] = nextCenter.x;
    nextCenters[centerOffset + 1] = nextCenter.y;
    nextCenters[centerOffset + 2] = nextCenter.z;
    nextVelocities[centerOffset] = nextSurfaceVelocity.x;
    nextVelocities[centerOffset + 1] = nextSurfaceVelocity.y;
    nextVelocities[centerOffset + 2] = nextSurfaceVelocity.z;
    const angle = radiusKm / EARTH_MEAN_RADIUS_KM;
    angular[count * 2] = Math.cos(angle);
    angular[count * 2 + 1] = Math.sin(angle);
    const colorHex = profile.color || "#58bfff";
    let color = colorCache.get(colorHex);
    if (!color) {
      color = new globe.THREE.Color(colorHex);
      colorCache.set(colorHex, color);
    }
    colors[centerOffset] = color.r;
    colors[centerOffset + 1] = color.g;
    colors[centerOffset + 2] = color.b;
    count += 1;
  }
  for (const geometry of [layer.coverageFillGeometry, layer.coverageOutlineGeometry]) {
    geometry.setAttribute("instanceCenter", new globe.THREE.InstancedBufferAttribute(centers.subarray(0, count * 3), 3));
    geometry.setAttribute("instanceVelocity", new globe.THREE.InstancedBufferAttribute(velocities.subarray(0, count * 3), 3));
    geometry.setAttribute("instanceNextCenter", new globe.THREE.InstancedBufferAttribute(nextCenters.subarray(0, count * 3), 3));
    geometry.setAttribute("instanceNextVelocity", new globe.THREE.InstancedBufferAttribute(nextVelocities.subarray(0, count * 3), 3));
    geometry.setAttribute("instanceAngular", new globe.THREE.InstancedBufferAttribute(angular.subarray(0, count * 2), 2));
    geometry.setAttribute("instanceColor", new globe.THREE.InstancedBufferAttribute(colors.subarray(0, count * 3), 3));
    setSatelliteInstancedGeometryCount(geometry, count);
  }
  layer.coverageCount = count;
}

function updateThreeSatelliteImagingCoverage(globe, layer) {
  const maxCount = state.satelliteImagingIds.length;
  const centers = new Float32Array(maxCount * 3);
  const velocities = new Float32Array(maxCount * 3);
  const nextCenters = new Float32Array(maxCount * 3);
  const nextVelocities = new Float32Array(maxCount * 3);
  const footprintCenters = new Float32Array(maxCount * 3);
  const footprintVelocities = new Float32Array(maxCount * 3);
  const nextFootprintCenters = new Float32Array(maxCount * 3);
  const nextFootprintVelocities = new Float32Array(maxCount * 3);
  const footprintAlongs = new Float32Array(maxCount * 3);
  const nextFootprintAlongs = new Float32Array(maxCount * 3);
  const pointings = new Float32Array(maxCount * 3);
  const halfAngular = new Float32Array(maxCount * 2);
  const colors = new Float32Array(maxCount * 3);
  const colorCache = new Map();
  let count = 0;
  for (const id of state.satelliteImagingIds) {
    const position = state.satellitePositions.get(id);
    const profile = state.satellitePayloadById.get(id);
    if (!position || !profile) continue;
    const dimensions = SATELLITE_PAYLOADS?.imagingDimensions(profile, position);
    if (!(dimensions?.widthKm > 0) || !(dimensions?.lengthKm > 0)) continue;
    const center = satelliteReferenceScenePosition(position);
    const velocity = satelliteReferenceSceneVelocity(position);
    const nextCenter = satelliteReferenceSceneNextPosition(position);
    const nextVelocity = satelliteReferenceSceneNextVelocity(position);
    const override = state.satelliteSwathTargets.get(String(id));
    const fixedAngle = override?.mode === "angle-fixed";
    const footprintMotion = override
      ? fixedAngle
        ? satelliteSurfaceReferenceMotion(center, velocity, nextCenter, nextVelocity)
        : satelliteFixedTargetReferenceMotion(override, position)
      : satelliteSurfaceReferenceMotion(center, velocity, nextCenter, nextVelocity);
    const frameTimeMs = Number(position?.frameTimeMs) || satelliteLastPropagatedTimeMs || state.satelliteTimeMs;
    const durationSec = Math.max(0.1, Number(position?.interpolationDurationSec) || state.satelliteInterpolationDurationSec || 1);
    const lockedGroundHeading = override?.mode !== "angle-fixed" && Number.isFinite(Number(override?.headingDeg));
    const footprintAlong = lockedGroundHeading
      ? satelliteSurfaceHeadingVector(override, Number(override.headingDeg), frameTimeMs)
      : satelliteSurfaceAlongVector(footprintMotion.center, center, velocity);
    const nextFootprintAlong = lockedGroundHeading
      ? satelliteSurfaceHeadingVector(override, Number(override.headingDeg), frameTimeMs + durationSec * 1000)
      : satelliteSurfaceAlongVector(footprintMotion.nextCenter, nextCenter, nextVelocity);
    const centerOffset = count * 3;
    centers[centerOffset] = center.x;
    centers[centerOffset + 1] = center.y;
    centers[centerOffset + 2] = center.z;
    velocities[centerOffset] = velocity.x;
    velocities[centerOffset + 1] = velocity.y;
    velocities[centerOffset + 2] = velocity.z;
    nextCenters[centerOffset] = nextCenter.x;
    nextCenters[centerOffset + 1] = nextCenter.y;
    nextCenters[centerOffset + 2] = nextCenter.z;
    nextVelocities[centerOffset] = nextVelocity.x;
    nextVelocities[centerOffset + 1] = nextVelocity.y;
    nextVelocities[centerOffset + 2] = nextVelocity.z;
    footprintCenters[centerOffset] = footprintMotion.center.x;
    footprintCenters[centerOffset + 1] = footprintMotion.center.y;
    footprintCenters[centerOffset + 2] = footprintMotion.center.z;
    footprintVelocities[centerOffset] = footprintMotion.velocity.x;
    footprintVelocities[centerOffset + 1] = footprintMotion.velocity.y;
    footprintVelocities[centerOffset + 2] = footprintMotion.velocity.z;
    nextFootprintCenters[centerOffset] = footprintMotion.nextCenter.x;
    nextFootprintCenters[centerOffset + 1] = footprintMotion.nextCenter.y;
    nextFootprintCenters[centerOffset + 2] = footprintMotion.nextCenter.z;
    nextFootprintVelocities[centerOffset] = footprintMotion.nextVelocity.x;
    nextFootprintVelocities[centerOffset + 1] = footprintMotion.nextVelocity.y;
    nextFootprintVelocities[centerOffset + 2] = footprintMotion.nextVelocity.z;
    footprintAlongs[centerOffset] = footprintAlong.x;
    footprintAlongs[centerOffset + 1] = footprintAlong.y;
    footprintAlongs[centerOffset + 2] = footprintAlong.z;
    nextFootprintAlongs[centerOffset] = nextFootprintAlong.x;
    nextFootprintAlongs[centerOffset + 1] = nextFootprintAlong.y;
    nextFootprintAlongs[centerOffset + 2] = nextFootprintAlong.z;
    pointings[centerOffset] = Math.tan(toRad(fixedAngle ? normalizeSatelliteSwathAngle(override.rollDeg) : 0));
    pointings[centerOffset + 1] = Math.tan(toRad(fixedAngle ? normalizeSatelliteSwathAngle(override.pitchDeg) : 0));
    pointings[centerOffset + 2] = fixedAngle ? 1 : 0;
    halfAngular[count * 2] = Math.min(Math.PI * 0.48, dimensions.widthKm * 0.5 / EARTH_MEAN_RADIUS_KM);
    halfAngular[count * 2 + 1] = Math.min(Math.PI * 0.48, dimensions.lengthKm * 0.5 / EARTH_MEAN_RADIUS_KM);
    const colorHex = profile.color || "#4ce0b3";
    let color = colorCache.get(colorHex);
    if (!color) {
      color = new globe.THREE.Color(colorHex);
      colorCache.set(colorHex, color);
    }
    colors[centerOffset] = color.r;
    colors[centerOffset + 1] = color.g;
    colors[centerOffset + 2] = color.b;
    count += 1;
  }
  const centerAttribute = new globe.THREE.InstancedBufferAttribute(centers.subarray(0, count * 3), 3);
  const velocityAttribute = new globe.THREE.InstancedBufferAttribute(velocities.subarray(0, count * 3), 3);
  const nextCenterAttribute = new globe.THREE.InstancedBufferAttribute(nextCenters.subarray(0, count * 3), 3);
  const nextVelocityAttribute = new globe.THREE.InstancedBufferAttribute(nextVelocities.subarray(0, count * 3), 3);
  const footprintCenterAttribute = new globe.THREE.InstancedBufferAttribute(footprintCenters.subarray(0, count * 3), 3);
  const footprintVelocityAttribute = new globe.THREE.InstancedBufferAttribute(footprintVelocities.subarray(0, count * 3), 3);
  const nextFootprintCenterAttribute = new globe.THREE.InstancedBufferAttribute(nextFootprintCenters.subarray(0, count * 3), 3);
  const nextFootprintVelocityAttribute = new globe.THREE.InstancedBufferAttribute(nextFootprintVelocities.subarray(0, count * 3), 3);
  const footprintAlongAttribute = new globe.THREE.InstancedBufferAttribute(footprintAlongs.subarray(0, count * 3), 3);
  const nextFootprintAlongAttribute = new globe.THREE.InstancedBufferAttribute(nextFootprintAlongs.subarray(0, count * 3), 3);
  const pointingAttribute = new globe.THREE.InstancedBufferAttribute(pointings.subarray(0, count * 3), 3);
  const angularAttribute = new globe.THREE.InstancedBufferAttribute(halfAngular.subarray(0, count * 2), 2);
  const colorAttribute = new globe.THREE.InstancedBufferAttribute(colors.subarray(0, count * 3), 3);
  for (const geometry of [layer.imagingFillGeometry, layer.imagingOutlineGeometry, layer.imagingScanGeometry]) {
    geometry.setAttribute("instanceCenter", centerAttribute);
    geometry.setAttribute("instanceVelocity", velocityAttribute);
    geometry.setAttribute("instanceNextCenter", nextCenterAttribute);
    geometry.setAttribute("instanceNextVelocity", nextVelocityAttribute);
    geometry.setAttribute("instanceFootprintCenter", footprintCenterAttribute);
    geometry.setAttribute("instanceFootprintVelocity", footprintVelocityAttribute);
    geometry.setAttribute("instanceNextFootprintCenter", nextFootprintCenterAttribute);
    geometry.setAttribute("instanceNextFootprintVelocity", nextFootprintVelocityAttribute);
    geometry.setAttribute("instanceFootprintAlong", footprintAlongAttribute);
    geometry.setAttribute("instanceNextFootprintAlong", nextFootprintAlongAttribute);
    geometry.setAttribute("instancePointing", pointingAttribute);
    geometry.setAttribute("instanceHalfAngular", angularAttribute);
    geometry.setAttribute("instanceColor", colorAttribute);
    setSatelliteInstancedGeometryCount(geometry, count);
  }
  layer.imagingCount = count;
}

function satelliteSurfaceReferenceMotion(center, velocity, nextCenter, nextVelocity) {
  const project = (point, motion) => {
    const radius = Math.max(0.00001, Math.hypot(point.x, point.y, point.z));
    const unit = { x: point.x / radius, y: point.y / radius, z: point.z / radius };
    const radialDot = unit.x * motion.x + unit.y * motion.y + unit.z * motion.z;
    return {
      point: unit,
      velocity: {
        x: (motion.x - unit.x * radialDot) / radius,
        y: (motion.y - unit.y * radialDot) / radius,
        z: (motion.z - unit.z * radialDot) / radius,
      },
    };
  };
  const current = project(center, velocity);
  const next = project(nextCenter, nextVelocity);
  return { center: current.point, velocity: current.velocity, nextCenter: next.point, nextVelocity: next.velocity };
}

function satelliteSurfaceAlongVector(surfaceCenter, satelliteCenter, satelliteVelocity) {
  const normal = {
    x: satelliteCenter.y * satelliteVelocity.z - satelliteCenter.z * satelliteVelocity.y,
    y: satelliteCenter.z * satelliteVelocity.x - satelliteCenter.x * satelliteVelocity.z,
    z: satelliteCenter.x * satelliteVelocity.y - satelliteCenter.y * satelliteVelocity.x,
  };
  const along = {
    x: normal.y * surfaceCenter.z - normal.z * surfaceCenter.y,
    y: normal.z * surfaceCenter.x - normal.x * surfaceCenter.z,
    z: normal.x * surfaceCenter.y - normal.y * surfaceCenter.x,
  };
  const length = Math.hypot(along.x, along.y, along.z);
  if (length > 1e-10) return { x: along.x / length, y: along.y / length, z: along.z / length };
  return satelliteSurfaceHeadingVector({ lon: 0, lat: 0 }, 0, state.satelliteTimeMs);
}

function satelliteSurfaceHeadingVector(target, headingDeg, timeMs) {
  const lon = toRad(satelliteDisplayLongitude(Number(target?.lon) || 0, timeMs));
  const lat = toRad(clamp(Number(target?.lat) || 0, -90, 90));
  const heading = toRad(normalizeBearingDeg(Number(headingDeg) || 0));
  const east = { x: Math.cos(lon), y: 0, z: -Math.sin(lon) };
  const north = {
    x: -Math.sin(lat) * Math.sin(lon),
    y: Math.cos(lat),
    z: -Math.sin(lat) * Math.cos(lon),
  };
  return {
    x: north.x * Math.cos(heading) + east.x * Math.sin(heading),
    y: north.y * Math.cos(heading) + east.y * Math.sin(heading),
    z: north.z * Math.cos(heading) + east.z * Math.sin(heading),
  };
}

function satelliteFixedTargetReferenceMotion(target, position) {
  const frameTimeMs = Number(position?.frameTimeMs) || satelliteLastPropagatedTimeMs || state.satelliteTimeMs;
  const durationSec = Math.max(0.1, Number(position?.interpolationDurationSec) || state.satelliteInterpolationDurationSec || 1);
  const nextFrameTimeMs = frameTimeMs + durationSec * 1000;
  const pointAt = (timeMs) => spherePoint(satelliteDisplayLongitude(target.lon, timeMs), Number(target.lat), 1);
  const center = pointAt(frameTimeMs);
  const nextCenter = pointAt(nextFrameTimeMs);
  const afterNext = pointAt(nextFrameTimeMs + durationSec * 1000);
  const velocity = {
    x: (nextCenter.x - center.x) / durationSec,
    y: (nextCenter.y - center.y) / durationSec,
    z: (nextCenter.z - center.z) / durationSec,
  };
  const nextVelocity = {
    x: (afterNext.x - nextCenter.x) / durationSec,
    y: (afterNext.y - nextCenter.y) / durationSec,
    z: (afterNext.z - nextCenter.z) / durationSec,
  };
  return { center, velocity, nextCenter, nextVelocity };
}

function updateThreeSatelliteOrbits(globe, layer) {
  const expectedOrbitIds = satelliteOrbitPathIds(visibleSelectedSatelliteIds());
  const denseOrbitMode = expectedOrbitIds.length >= SATELLITE_DENSE_ORBIT_LINE_THRESHOLD;
  const denseColorScale = expectedOrbitIds.length > 8000
    ? 0.74
    : expectedOrbitIds.length > 4000
      ? 0.78
      : expectedOrbitIds.length > 1200 ? 0.82 : 0.88;
  let segmentCapacity = 0;
  for (const id of expectedOrbitIds) {
    const path = state.satelliteOrbitPaths.get(id);
    const item = state.satelliteById.get(id);
    const pointCount = satelliteOrbitPathPointCount(path);
    if (item && satelliteCategoryEnabled(item) && pointCount >= 2) {
      // Reserve one extra segment for a continuity-checked last-to-first closure.
      segmentCapacity += pointCount;
    }
  }
  const starts = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const ends = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const colors = denseOrbitMode ? null : new Float32Array(segmentCapacity * 3);
  const densePositions = denseOrbitMode ? new Float32Array(segmentCapacity * 6) : null;
  const denseColors = denseOrbitMode ? new Float32Array(segmentCapacity * 6) : null;
  const colorCache = new Map();
  let orbitCount = 0;
  let closedOrbitCount = 0;
  let continuousOrbitCount = 0;
  let rejectedClosureCount = 0;
  const rejectedClosureIds = [];
  let segmentCount = 0;
  let anchorMaxErrorScene = 0;
  const referenceTimeMs = satelliteLastPropagatedTimeMs || state.satelliteTimeMs;
  for (const id of expectedOrbitIds) {
    const path = state.satelliteOrbitPaths.get(id);
    const pointCount = satelliteOrbitPathPointCount(path);
    if (pointCount < 2) continue;
    const item = state.satelliteById.get(id);
    if (!item || !satelliteCategoryEnabled(item)) continue;
    const anchorPosition = state.satellitePositions.get(id);
    const anchorPoint = anchorPosition ? satelliteReferenceScenePosition(anchorPosition) : null;
    let anchorMinErrorScene = Number.POSITIVE_INFINITY;
    const colorHex = satelliteDisplayColor(item);
    let color = colorCache.get(colorHex);
    if (!color) {
      color = new globe.THREE.Color(colorHex);
      colorCache.set(colorHex, color);
    }
    const scenePoints = new Array(pointCount);
    for (let index = 0; index < pointCount; index += 1) {
      scenePoints[index] = satelliteOrbitPathScenePoint(path, index, referenceTimeMs);
    }
    const closure = SATELLITE_ORBIT_POLICY?.orbitPathClosure?.(scenePoints);
    if (closure?.continuous) {
      continuousOrbitCount += 1;
    } else {
      rejectedClosureCount += 1;
      rejectedClosureIds.push(String(id));
    }
    const orbitSegmentStart = segmentCount;
    const appendSegment = (pointA, pointB) => {
      if (!pointA || !pointB) return;
      if (anchorPoint) {
        anchorMinErrorScene = Math.min(anchorMinErrorScene, satelliteScenePointSegmentDistance(anchorPoint, pointA, pointB));
      }
      if (denseOrbitMode) {
        const offset = segmentCount * 6;
        densePositions[offset] = pointA.x;
        densePositions[offset + 1] = pointA.y;
        densePositions[offset + 2] = pointA.z;
        densePositions[offset + 3] = pointB.x;
        densePositions[offset + 4] = pointB.y;
        densePositions[offset + 5] = pointB.z;
        denseColors[offset] = color.r * denseColorScale;
        denseColors[offset + 1] = color.g * denseColorScale;
        denseColors[offset + 2] = color.b * denseColorScale;
        denseColors[offset + 3] = color.r * denseColorScale;
        denseColors[offset + 4] = color.g * denseColorScale;
        denseColors[offset + 5] = color.b * denseColorScale;
      } else {
        const offset = segmentCount * 3;
        starts[offset] = pointA.x;
        starts[offset + 1] = pointA.y;
        starts[offset + 2] = pointA.z;
        ends[offset] = pointB.x;
        ends[offset + 1] = pointB.y;
        ends[offset + 2] = pointB.z;
        colors[offset] = color.r;
        colors[offset + 1] = color.g;
        colors[offset + 2] = color.b;
      }
      segmentCount += 1;
    };
    for (let index = 0; index < pointCount - 1; index += 1) {
      const pointA = scenePoints[index];
      const pointB = scenePoints[index + 1];
      if (satelliteOrbitSceneSegmentContinuous(pointA, pointB)) appendSegment(pointA, pointB);
    }
    if (closure?.close) {
      appendSegment(scenePoints[pointCount - 1], scenePoints[0]);
      closedOrbitCount += 1;
    }
    if (Number.isFinite(anchorMinErrorScene)) anchorMaxErrorScene = Math.max(anchorMaxErrorScene, anchorMinErrorScene);
    if (segmentCount > orbitSegmentStart) orbitCount += 1;
  }
  if (denseOrbitMode) {
    setSatelliteInstancedGeometryCount(layer.orbitGeometry, 0);
    layer.denseOrbitGeometry.setAttribute(
      "position",
      new globe.THREE.BufferAttribute(densePositions.subarray(0, segmentCount * 6), 3),
    );
    layer.denseOrbitGeometry.setAttribute(
      "color",
      new globe.THREE.BufferAttribute(denseColors.subarray(0, segmentCount * 6), 3),
    );
    layer.denseOrbitGeometry.setDrawRange(0, segmentCount * 2);
    layer.denseOrbitGeometry.computeBoundingSphere();
  } else {
    layer.denseOrbitGeometry.setDrawRange(0, 0);
    layer.orbitGeometry.setAttribute("instanceStart", new globe.THREE.InstancedBufferAttribute(starts.subarray(0, segmentCount * 3), 3));
    layer.orbitGeometry.setAttribute("instanceEnd", new globe.THREE.InstancedBufferAttribute(ends.subarray(0, segmentCount * 3), 3));
    layer.orbitGeometry.setAttribute("instanceColor", new globe.THREE.InstancedBufferAttribute(colors.subarray(0, segmentCount * 3), 3));
    setSatelliteInstancedGeometryCount(layer.orbitGeometry, segmentCount);
  }
  layer.orbitCount = orbitCount;
  layer.orbitClosedCount = closedOrbitCount;
  layer.orbitContinuousCount = continuousOrbitCount;
  layer.orbitRejectedClosureCount = rejectedClosureCount;
  layer.orbitRejectedClosureIds = rejectedClosureIds;
  layer.orbitSegmentCount = segmentCount;
  layer.orbitSubmittedSegmentCount = denseOrbitMode
    ? segmentCount
    : Math.min(
      Math.max(0, Number(layer.orbitGeometry.instanceCount) || 0),
      Math.max(0, Number(layer.orbitGeometry._maxInstanceCount) || 0),
    );
  layer.denseOrbitMode = denseOrbitMode;
  layer.orbitReferenceTimeMs = referenceTimeMs;
  layer.orbitAnchorMaxErrorKm = anchorMaxErrorScene * EARTH_MEAN_RADIUS_KM;
  layer.orbitExpectedCount = expectedOrbitIds.length;
  satelliteDrawableOrbitCount = orbitCount;
  updateSatelliteSelectionStatus();
}

function satelliteOrbitSceneSegmentContinuous(start, end) {
  if (!start || !end || ![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)) return false;
  const denominator = Math.hypot(start.x, start.y, start.z) * Math.hypot(end.x, end.y, end.z);
  if (!(denominator > 1e-12)) return false;
  const cosine = clamp((start.x * end.x + start.y * end.y + start.z * end.z) / denominator, -1, 1);
  return Math.acos(cosine) <= Math.PI * 0.45;
}

function satelliteOrbitPathScenePoint(path, index, referenceTimeMs) {
  if (!ArrayBuffer.isView(path)) {
    const point = Array.isArray(path) ? path[index] : null;
    return point ? satelliteOrbitPointToReferenceScene(point, referenceTimeMs) : null;
  }
  const offset = index * SATELLITE_PATH_POINT_STRIDE;
  if (offset < 0 || offset + 5 >= path.length) return null;
  const x = path[offset + 3];
  const y = path[offset + 4];
  const z = path[offset + 5];
  if (![x, y, z].every(Number.isFinite)) return null;
  return eciVectorToReferenceScene(x, y, z, 1 / EARTH_MEAN_RADIUS_KM, referenceTimeMs);
}

function satelliteScenePointSegmentDistance(point, start, end) {
  const ab = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
  const ap = { x: point.x - start.x, y: point.y - start.y, z: point.z - start.z };
  const lengthSquared = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;
  const t = lengthSquared > 1e-16
    ? clamp((ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / lengthSquared, 0, 1)
    : 0;
  return Math.hypot(
    point.x - (start.x + ab.x * t),
    point.y - (start.y + ab.y * t),
    point.z - (start.z + ab.z * t),
  );
}

function loadThreeGlobeGlobalAtlas(globe) {
  if (!globe || globe.globalAtlasReady || globe.globalAtlasLoading) return;
  globe.globalAtlasLoading = true;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const texture = new globe.THREE.Texture(image);
    texture.colorSpace = globe.THREE.SRGBColorSpace;
    texture.wrapS = globe.THREE.RepeatWrapping;
    texture.wrapT = globe.THREE.ClampToEdgeWrapping;
    texture.minFilter = globe.THREE.LinearMipmapLinearFilter;
    texture.magFilter = globe.THREE.LinearFilter;
    texture.anisotropy = Math.min(12, globe.renderer.capabilities.getMaxAnisotropy());
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    globe.baseAtlasTexture?.dispose();
    globe.baseAtlasTexture = texture;
    globe.baseMaterial.map = texture;
    globe.baseMaterial.needsUpdate = true;
    globe.baseAtlasReady = true;
    globe.baseAtlasZoom = 0;
    globe.globalAtlasImage = image;
    globe.globalAtlasReady = true;
    globe.globalAtlasLoading = false;
    globe.baseTexture?.dispose();
    globe.baseTexture = null;
    clearThreeGlobeTiles(globe);
    globe.lastRenderSignature = "";
    requestGlobeBaseDraw();
  };
  image.onerror = () => {
    globe.globalAtlasLoading = false;
    globe.globalAtlasFailed = true;
    requestGlobeBaseDraw();
  };
  image.src = GLOBE_GLOBAL_ATLAS_URL;
}

function loadThreeGlobePolarImagery(globe) {
  if (!globe || !POLAR_PROJECTION) {
    for (const spec of GLOBE_POLAR_TEXTURE_SPECS) globe?.polarImageryFailed?.add(spec.id);
    return;
  }
  for (const spec of GLOBE_POLAR_TEXTURE_SPECS) {
    if (globe.polarImageryReady.has(spec.id) || globe.polarImageryMeshes.has(spec.id)) continue;
    POLAR_PROJECTION.defs(spec.projection, spec.definition);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        const mesh = createThreePolarImageryMesh(globe, spec, image);
        globe.polarImageryMeshes.set(spec.id, mesh);
        globe.polarImageryReady.add(spec.id);
        globe.polarImageryFailed.delete(spec.id);
        globe.polarImageryGroup.add(mesh);
        globe.lastRenderSignature = "";
        requestGlobeBaseDraw();
      } catch (error) {
        console.warn(`Unable to build ${spec.id} polar imagery mesh.`, error);
        globe.polarImageryFailed.add(spec.id);
      }
    };
    image.onerror = () => {
      globe.polarImageryFailed.add(spec.id);
      requestGlobeBaseDraw();
    };
    image.src = spec.url;
  }
}

function createThreePolarImageryMesh(globe, spec, image) {
  const THREE = globe.THREE;
  const geometry = createThreePolarImageryGeometry(THREE, spec);
  const texture = new THREE.Texture(image);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = Math.min(12, globe.renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const alphaMap = createThreePolarImageryAlphaMap(THREE, spec);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    alphaMap,
    transparent: true,
    alphaTest: 0.006,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${spec.id}-polar-imagery`;
  mesh.renderOrder = 12;
  mesh.userData.projection = spec.projection;
  mesh.userData.innerLatitude = GLOBE_POLAR_DETAIL_INNER_LAT;
  mesh.userData.outerLatitude = GLOBE_POLAR_DETAIL_OUTER_LAT;
  return mesh;
}

function createThreePolarImageryGeometry(THREE, spec) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = GLOBE_POLAR_DETAIL_SEGMENTS;
  const rings = GLOBE_POLAR_DETAIL_RINGS;
  for (let row = 0; row <= rings; row += 1) {
    const progress = row / rings;
    const latitude = spec.hemisphere > 0
      ? 90 - progress * (90 - GLOBE_POLAR_DETAIL_OUTER_LAT)
      : -GLOBE_POLAR_DETAIL_OUTER_LAT - progress * (90 - GLOBE_POLAR_DETAIL_OUTER_LAT);
    for (let column = 0; column <= segments; column += 1) {
      const longitude = -180 + (column / segments) * 360;
      const point = spherePoint(longitude, latitude, GLOBE_POLAR_DETAIL_RADIUS);
      const uv = polarImageryUv(spec, longitude, latitude);
      positions.push(point.x, point.y, point.z);
      uvs.push(uv.u, uv.v);
    }
  }
  const rowSize = segments + 1;
  for (let row = 0; row < rings; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const a = row * rowSize + column;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function polarImageryUv(spec, longitude, latitude) {
  const [x, y] = POLAR_PROJECTION("EPSG:4326", spec.projection, [longitude, latitude]);
  const [xmin, ymin, xmax, ymax] = spec.bounds;
  return {
    u: (x - xmin) / (xmax - xmin),
    v: (y - ymin) / (ymax - ymin),
  };
}

function createThreePolarImageryAlphaMap(THREE, spec) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { alpha: false });
  const poleLatitude = spec.hemisphere > 0 ? 90 : -90;
  const blendInnerLatitude = spec.hemisphere * GLOBE_POLAR_DETAIL_INNER_LAT;
  const blendOuterLatitude = spec.hemisphere * GLOBE_POLAR_DETAIL_OUTER_LAT;
  const poleUv = polarImageryUv(spec, 0, poleLatitude);
  const innerUv = polarImageryUv(spec, 0, blendInnerLatitude);
  const outerUv = polarImageryUv(spec, 0, blendOuterLatitude);
  const radius = (uv) => Math.hypot(uv.u - poleUv.u, uv.v - poleUv.v) * size;
  const centerX = poleUv.u * size;
  const centerY = (1 - poleUv.v) * size;
  const innerRadius = radius(innerUv);
  const outerRadius = radius(outerUv);
  const blendWidth = Math.max(1, outerRadius - innerRadius);
  const imageData = context.createImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      const transition = Math.max(0, Math.min(1, (distance - innerRadius) / blendWidth));
      const smoothTransition = transition * transition * (3 - 2 * transition);
      const value = Math.round(255 * (1 - smoothTransition));
      const offset = (y * size + x) * 4;
      imageData.data[offset] = value;
      imageData.data[offset + 1] = value;
      imageData.data[offset + 2] = value;
      imageData.data[offset + 3] = 255;
    }
  }
  context.putImageData(imageData, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createStarField(THREE) {
  const group = new THREE.Group();
  let seed = 0x4e4f5441;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const addLayer = (count, size, opacity, color) => {
    const geometry = new THREE.BufferGeometry();
    const positions = [];
    for (let index = 0; index < count; index += 1) {
      const longitude = random() * Math.PI * 2;
      const cosineLatitude = random() * 2 - 1;
      const radial = Math.sqrt(Math.max(0, 1 - cosineLatitude * cosineLatitude));
      const radius = 34 + random() * 20;
      positions.push(radius * radial * Math.cos(longitude), radius * cosineLatitude, radius * radial * Math.sin(longitude));
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      sizeAttenuation: false,
      depthWrite: false,
      toneMapped: false,
    }));
    points.renderOrder = -100;
    group.add(points);
  };
  addLayer(920, 1.05, 0.42, 0xcfe8f2);
  addLayer(110, 1.55, 0.68, 0xf4fbff);
  return group;
}

function createThreeAtmosphereGlow(THREE) {
  const group = new THREE.Group();
  const outerRadius = 1 + ATMOSPHERE_VISIBLE_TOP_KM / EARTH_MEAN_RADIUS_KM;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      deepColor: { value: new THREE.Color(0x176bd6) },
      cyanColor: { value: new THREE.Color(0x23d9ff) },
      airglowColor: { value: new THREE.Color(0xa3fff2) },
      sunDirectionLocal: { value: new THREE.Vector3(0, 0, 1) },
      sunlightEnabled: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalNormal;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vLocalNormal = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 deepColor;
      uniform vec3 cyanColor;
      uniform vec3 airglowColor;
      uniform vec3 sunDirectionLocal;
      uniform float sunlightEnabled;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      varying vec3 vLocalNormal;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float fresnel = 1.0 - clamp(abs(dot(normalize(vWorldNormal), viewDirection)), 0.0, 1.0);
        float outerHaze = pow(fresnel, 1.45);
        float cyanBand = pow(fresnel, 3.6);
        float brightRim = pow(fresnel, 8.5);
        vec3 color = mix(deepColor, cyanColor, smoothstep(0.12, 0.86, cyanBand));
        color = mix(color, airglowColor, brightRim * 0.44);
        float alpha = outerHaze * 0.14 + cyanBand * 0.29 + brightRim * 0.18;
        float solarCosine = dot(normalize(vLocalNormal), normalize(sunDirectionLocal));
        float daySide = smoothstep(-0.25, 0.08, solarCosine);
        alpha *= mix(1.0, mix(0.28, 1.0, daySide), sunlightEnabled);
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    toneMapped: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(outerRadius, 128, 72), material);
  shell.renderOrder = 40;
  group.add(shell);
  group.userData.visibleTopKm = ATMOSPHERE_VISIBLE_TOP_KM;
  group.userData.airglowCenterKm = AIRGLOW_CENTER_KM;
  group.userData.airglowThicknessKm = AIRGLOW_THICKNESS_KM;
  group.userData.outerRadius = outerRadius;
  group.userData.renderMode = "camera-aware-fresnel-gradient";
  group.userData.material = material;
  return group;
}

function updateThreeAtmosphereGlow(globe) {
  const atmosphere = globe?.atmosphere;
  const material = atmosphere?.userData?.material;
  if (!atmosphere || !material || !globe?.camera || !globe?.THREE) return;
  const outerRadius = Number(atmosphere.userData.outerRadius)
    || 1 + ATMOSPHERE_VISIBLE_TOP_KM / EARTH_MEAN_RADIUS_KM;
  const cameraInside = globe.camera.position.length() < outerRadius;
  const nextSide = cameraInside ? globe.THREE.BackSide : globe.THREE.FrontSide;
  if (material.side !== nextSide) {
    material.side = nextSide;
    material.needsUpdate = true;
  }
  atmosphere.visible = true;
  if (els.globeCanvas) {
    els.globeCanvas.dataset.atmosphereVisible = "true";
    els.globeCanvas.dataset.atmosphereCameraInside = String(cameraInside);
    els.globeCanvas.dataset.atmosphereRenderSide = cameraInside ? "inside-back-face" : "outside-front-face";
    els.globeCanvas.dataset.atmosphereVisibleTopKm = String(ATMOSPHERE_VISIBLE_TOP_KM);
    els.globeCanvas.dataset.atmosphereRenderMode = atmosphere.userData.renderMode;
  }
}

function createFallbackEarthTexture(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const ocean = ctx.createLinearGradient(0, 0, 0, canvas.height);
  ocean.addColorStop(0, "#163949");
  ocean.addColorStop(0.48, "#0e2b39");
  ocean.addColorStop(1, "#092031");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.42;
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * canvas.height;
    ctx.fillStyle = "rgba(255,255,255,0.035)";
    ctx.fillRect(0, y, canvas.width, 1);
  }
  ctx.globalAlpha = 1;

  const polygons = Array.isArray(window.WORLD_LAND_POLYGONS) ? window.WORLD_LAND_POLYGONS : [];
  for (const polygon of polygons) {
    drawFallbackLandPolygon(ctx, polygon.points || [], canvas.width, canvas.height);
  }

  const glow = ctx.createRadialGradient(canvas.width * 0.52, canvas.height * 0.38, 20, canvas.width * 0.52, canvas.height * 0.38, canvas.width * 0.62);
  glow.addColorStop(0, "rgba(255,255,255,0.10)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  paintLongitudeInvariantPolarCaps(ctx, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function createEarthSphereGeometry(THREE, radius = 1, lonSegments = 128, latSegments = 64) {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= latSegments; row += 1) {
    const ty = row / latSegments;
    const lat = 90 - ty * 180;
    for (let col = 0; col <= lonSegments; col += 1) {
      const tx = col / lonSegments;
      const lon = -180 + tx * 360;
      const p = spherePoint(lon, lat, radius);
      positions.push(p.x, p.y, p.z);
      uvs.push(tx, 1 - ty);
    }
  }
  const rowSize = lonSegments + 1;
  for (let row = 0; row < latSegments; row += 1) {
    for (let col = 0; col < lonSegments; col += 1) {
      const a = row * rowSize + col;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function drawFallbackLandPolygon(ctx, rawPoints, width, height) {
  const points = rawPoints
    .map((point) => ({ lat: Number(point[0]), lon: Number(point[1]) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (points.length < 3) return;
  const drawShift = (shift) => {
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = ((normalizeLon(point.lon) + 180) / 360) * width + shift;
      const y = ((90 - clamp(point.lat, -85, 85)) / 180) * height;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#34464b";
    ctx.fill();
    ctx.strokeStyle = "rgba(216, 222, 172, 0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  drawShift(0);
  drawShift(-width);
  drawShift(width);
}

function createThreeLandGroup(THREE) {
  const group = new THREE.Group();
  const polygons = Array.isArray(window.WORLD_LAND_POLYGONS) ? window.WORLD_LAND_POLYGONS : [];
  const material = new THREE.MeshPhongMaterial({
    color: 0x4d6943,
    emissive: 0x061006,
    shininess: 5,
    specular: 0x1c2a1f,
    transparent: true,
    opacity: 0.88,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  for (const polygon of polygons) {
    const points = (polygon.points || [])
      .map((point) => ({ lat: Number(point[0]), lon: Number(point[1]) }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon));
    if (points.length < 3) continue;
    const center = sphericalPolygonCenter(points);
    const positions = [];
    for (let index = 0; index < points.length; index += 1) {
      const next = points[(index + 1) % points.length];
      for (const item of [center, points[index], next]) {
        const p = spherePoint(item.lon, item.lat, 0.9997);
        positions.push(p.x, p.y, p.z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function sphericalPolygonCenter(points) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    const p = spherePoint(point.lon, point.lat, 1);
    x += p.x;
    y += p.y;
    z += p.z;
  }
  const length = Math.hypot(x, y, z) || 1;
  const lat = toDeg(Math.asin(y / length));
  const lon = toDeg(Math.atan2(x, z));
  return { lon, lat };
}

function resizeThreeGlobe(globe, width, height) {
  const nextPixelRatio = threeGlobeRenderDprCap();
  const pixelRatioChanged = Math.abs((globe.pixelRatio || 1) - nextPixelRatio) > 0.01;
  const sizeChanged = Math.abs((globe.renderWidth || 0) - width) > 0.25 || Math.abs((globe.renderHeight || 0) - height) > 0.25;
  if (pixelRatioChanged) {
    globe.pixelRatio = nextPixelRatio;
    globe.renderer.setPixelRatio(nextPixelRatio);
  }
  if (sizeChanged) {
    globe.renderWidth = width;
    globe.renderHeight = height;
    globe.camera.aspect = width / Math.max(1, height);
    globe.renderer.setSize(width, height, false);
  }
}

function threeGlobeRenderDprCap() {
  const interacting = Boolean(state.view.drag || globeInertiaFrame);
  const bulkAnimating = state.satellitePlaybackRate && state.satelliteVisibleIds.length >= SATELLITE_GPU_BULK_THRESHOLD;
  const renderCap = bulkAnimating
    ? Math.min(RENDER_DPR_MAX, Number(activePerformanceProfile.budgets.bulkDpr) || RENDER_DPR_MAX)
    : RENDER_DPR_MAX;
  const bulkInteractionCap = state.satelliteVisibleIds.length > 8000
    ? Math.min(INTERACTION_DPR_MAX, 0.9)
    : state.satelliteVisibleIds.length > 4000
      ? Math.min(INTERACTION_DPR_MAX, 1)
      : INTERACTION_DPR_MAX;
  const qualityCap = interacting ? Math.min(renderCap, bulkInteractionCap) : renderCap;
  return Math.min(qualityCap * (adaptivePerformanceState.qualityScale || 1), window.devicePixelRatio || 1);
}

function updateThreeGlobeCamera(globe, params) {
  const near = Math.max(0.00008, Math.min(0.02, params.range * 0.025));
  const far = Math.max(180, params.cameraRadius + 24);
  const projectionKey = `${globe.camera.aspect.toFixed(6)}:${params.fovDeg.toFixed(6)}:${near.toFixed(8)}:${far.toFixed(3)}`;
  if (projectionKey !== globe.cameraProjection) {
    globe.cameraProjection = projectionKey;
    globe.camera.fov = params.fovDeg;
    globe.camera.near = near;
    globe.camera.far = far;
    globe.camera.updateProjectionMatrix();
  }
  globe.camera.position.set(params.camera.x, params.camera.y, params.camera.z);
  globe.camera.up.set(params.screenUp.x, params.screenUp.y, params.screenUp.z);
  globe.camera.lookAt(params.target.x, params.target.y, params.target.z);
  const referenceDelta = toRad(satelliteReferenceDeltaDeg());
  const earthRotation = toRad(globeEarthRotationDeg());
  const satelliteRotation = SATELLITE_REFERENCE?.satelliteLayerRotationRad
    ? SATELLITE_REFERENCE.satelliteLayerRotationRad(state.satelliteReferenceFrame, earthRotation, referenceDelta)
    : earthRotation - (state.satelliteReferenceFrame === "inertial" ? referenceDelta : 0);
  const ballisticRotation = ensureBallisticAnimationConfig().referenceFrame === "earth-fixed" ? earthRotation : 0;
  globe.globeGroup.quaternion.identity();
  globe.globeGroup.rotation.y = earthRotation;
  if (globe.ballisticAnimationGpuLayer?.group) {
    globe.ballisticAnimationGpuLayer.group.quaternion.identity();
    globe.ballisticAnimationGpuLayer.group.rotation.y = ballisticRotation;
  }
  if (globe.satelliteGpuLayer?.group) {
    globe.satelliteGpuLayer.group.quaternion.identity();
    globe.satelliteGpuLayer.group.rotation.y = satelliteRotation;
  }
  if (els.globeCanvas) els.globeCanvas.dataset.satelliteLayerRotationRad = satelliteRotation.toFixed(8);
}

function updateThreeGlobeTiles(globe, width, height, params) {
  const targetZoom = globeTextureZoom();
  globe.lastTileZoom = targetZoom;
  globe.tileFrame = (globe.tileFrame || 0) + 1;
  globe.textureUploadBudget = GLOBE_TEXTURE_UPLOADS_PER_FRAME;
  const visibleKeys = new Set();
  let texturedTiles = 0;
  let exactTiles = 0;
  let ancestorTiles = 0;
  let atlasFallbackTiles = 0;
  let targetTiles = 0;
  updateThreeGlobeBaseAtlas(globe);

  const targetCandidates = threeGlobeTileCandidates(targetZoom, width, height, params);
  targetTiles = targetCandidates.length;
  for (const candidate of targetCandidates) {
    const result = showThreeGlobeCandidate(globe, candidate, visibleKeys);
    if (result.visible) {
      texturedTiles += 1;
      if (result.exact) exactTiles += 1;
      else if (result.baseAtlas) atlasFallbackTiles += 1;
      else ancestorTiles += 1;
    }
  }

  for (const [key, mesh] of [...globe.tileMeshes]) {
    if (visibleKeys.has(key)) continue;
    mesh.visible = false;
    if (globe.tileFrame - Number(mesh.userData.lastUsedFrame || 0) > 12) {
      globe.tileGroup.remove(mesh);
      mesh.geometry.dispose();
      globe.tileMeshes.delete(key);
    }
  }
  trimThreeGlobeTextureCache(globe);
  els.globeCanvas.dataset.tileZoom = String(targetZoom);
  els.globeCanvas.dataset.visibleTiles = String(targetTiles);
  els.globeCanvas.dataset.texturedTiles = String(texturedTiles);
  els.globeCanvas.dataset.textureCoverage = targetTiles ? `${Math.round((texturedTiles / targetTiles) * 100)}%` : "0%";
  els.globeCanvas.dataset.exactTiles = String(exactTiles);
  els.globeCanvas.dataset.ancestorTiles = String(ancestorTiles);
  els.globeCanvas.dataset.atlasFallbackTiles = String(atlasFallbackTiles);
  els.globeCanvas.dataset.fallbackTiles = String(Math.max(0, targetTiles - exactTiles));
  els.globeCanvas.dataset.tileQueue = String(tileLoadQueue.length);
  els.globeCanvas.dataset.tileLoads = String(activeTileLoads);
  els.globeCanvas.dataset.baseAtlas = globe.globalAtlasReady
    ? "esri-global-geographic-8192"
    : globe.baseAtlasReady
      ? `satellite-z${globe.baseAtlasZoom || GLOBE_TEXTURE_MIN_ZOOM}`
      : "neutral";
}

function updateThreeGlobeBaseAtlas(globe) {
  if (globe.globalAtlasReady) return;
  if (globe.baseAtlasBuilding) return;
  const currentZoom = Number(globe.baseAtlasZoom || 0);
  const z = currentZoom < GLOBE_TEXTURE_MIN_ZOOM
    ? GLOBE_TEXTURE_MIN_ZOOM
    : currentZoom < GLOBE_BASE_ATLAS_MAX_ZOOM
      ? GLOBE_BASE_ATLAS_MAX_ZOOM
      : 0;
  if (!z) return;
  const count = 2 ** z;
  const tiles = [];
  let ready = true;
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      const tile = getTile("satellite", z, x, y, 16000);
      tiles.push(tile);
      if (!tile.loaded) ready = false;
    }
  }
  if (!ready) return;
  globe.baseAtlasBuilding = true;
  try {
    const texture = createThreeGlobeBaseAtlasTexture(globe, tiles, z);
    if (!texture) return;
    globe.baseAtlasTexture?.dispose();
    globe.baseAtlasTexture = texture;
    globe.baseMaterial.map = texture;
    globe.baseMaterial.needsUpdate = true;
    globe.baseAtlasReady = true;
    globe.baseAtlasZoom = z;
    globe.baseTexture?.dispose();
    globe.baseTexture = null;
  } finally {
    globe.baseAtlasBuilding = false;
  }
}

function createThreeGlobeBaseAtlasTexture(globe, tiles, z) {
  const count = 2 ** z;
  if (tiles.length !== count * count || tiles.some((tile) => !tile?.loaded)) return null;
  const mosaicSize = count * TILE_SIZE;
  const mosaic = document.createElement("canvas");
  mosaic.width = mosaicSize;
  mosaic.height = mosaicSize;
  const mosaicContext = mosaic.getContext("2d", { alpha: false });
  for (let y = 0; y < count; y += 1) {
    for (let x = 0; x < count; x += 1) {
      mosaicContext.drawImage(tiles[y * count + x].image, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  const atlas = document.createElement("canvas");
  atlas.width = 2048;
  atlas.height = 1024;
  const context = atlas.getContext("2d", { alpha: false });
  const polarBandRows = Math.max(2, Math.round(mosaicSize * 0.004));
  const northPolarColor = averageCanvasBandColor(mosaicContext, 0, polarBandRows - 1, mosaicSize);
  const southPolarColor = averageCanvasBandColor(mosaicContext, mosaicSize - polarBandRows, mosaicSize - 1, mosaicSize);
  for (let row = 0; row < atlas.height; row += 1) {
    const geographicLat = 90 - ((row + 0.5) / atlas.height) * 180;
    const mercatorLat = clamp(geographicLat, -GLOBE_MERCATOR_MAX_LAT, GLOBE_MERCATOR_MAX_LAT);
    const sinLat = Math.sin(toRad(mercatorLat));
    const mercatorY = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
    const sourceY = clamp(mercatorY * mosaicSize, 0, mosaicSize - 1);
    context.drawImage(mosaic, 0, sourceY, mosaicSize, 1, 0, row, atlas.width, 1);
    const blend = polarCapBlend(geographicLat);
    if (blend > 0) {
      const color = geographicLat >= 0 ? northPolarColor : southPolarColor;
      context.globalAlpha = blend;
      context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
      context.fillRect(0, row, atlas.width, 1);
      context.globalAlpha = 1;
    }
  }
  const texture = new globe.THREE.CanvasTexture(atlas);
  texture.colorSpace = globe.THREE.SRGBColorSpace;
  texture.wrapS = globe.THREE.RepeatWrapping;
  texture.wrapT = globe.THREE.ClampToEdgeWrapping;
  texture.minFilter = globe.THREE.LinearMipmapLinearFilter;
  texture.magFilter = globe.THREE.LinearFilter;
  texture.anisotropy = Math.min(12, globe.renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.userData.polarCapMode = "longitude-invariant";
  return texture;
}

function polarCapBlend(latitude) {
  return smoothstep(GLOBE_POLAR_BLEND_START_LAT, GLOBE_MERCATOR_MAX_LAT, Math.abs(Number(latitude) || 0));
}

function paintLongitudeInvariantPolarCaps(context, width, height) {
  const northEdgeY = ((90 - GLOBE_MERCATOR_MAX_LAT) / 180) * height;
  const southEdgeY = ((90 + GLOBE_MERCATOR_MAX_LAT) / 180) * height;
  const band = Math.max(2, Math.round(height * 0.006));
  const northColor = averageCanvasBandColor(context, northEdgeY - band, northEdgeY + band, width);
  const southColor = averageCanvasBandColor(context, southEdgeY - band, southEdgeY + band, width);
  for (let row = 0; row < height; row += 1) {
    const latitude = 90 - ((row + 0.5) / height) * 180;
    const blend = polarCapBlend(latitude);
    if (blend <= 0) continue;
    const color = latitude >= 0 ? northColor : southColor;
    context.globalAlpha = blend;
    context.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    context.fillRect(0, row, width, 1);
  }
  context.globalAlpha = 1;
}

function averageCanvasBandColor(context, fromY, toY, width) {
  try {
    const startY = clamp(Math.round(Math.min(fromY, toY)), 0, context.canvas.height - 1);
    const endY = clamp(Math.round(Math.max(fromY, toY)), startY, context.canvas.height - 1);
    const data = context.getImageData(0, startY, width, endY - startY + 1).data;
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 128) {
      red += data[index];
      green += data[index + 1];
      blue += data[index + 2];
      count += 1;
    }
    if (count) return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
  } catch {
    // Cross-origin restrictions can prevent pixel reads; the fallback remains seamless.
  }
  return (Number(fromY) + Number(toY)) / 2 < context.canvas.height / 2 ? [42, 83, 99] : [205, 218, 220];
}

function showThreeGlobeReadyTile(globe, z, candidate, tile, visibleKeys) {
  const key = `${z}/${candidate.x}/${candidate.y}`;
  let mesh = globe.tileMeshes.get(key);
  if (!mesh) {
    mesh = createThreeGlobeTile(
      globe,
      z,
      candidate.x,
      candidate.y,
      tileXToLon(candidate.x, z),
      tileXToLon(candidate.x + 1, z),
      tileYToLat(candidate.y, z),
      tileYToLat(candidate.y + 1, z),
    );
    globe.tileMeshes.set(key, mesh);
    globe.tileGroup.add(mesh);
  }
  const ready = updateThreeGlobeTileTexture(globe, mesh, z, candidate.x, candidate.y, key, tile);
  mesh.visible = ready;
  if (!ready) return false;
  mesh.userData.lastUsedFrame = globe.tileFrame;
  visibleKeys.add(key);
  return true;
}

function showThreeGlobeCandidate(globe, candidate, visibleKeys) {
  const targetZoom = candidate.z;
  const targetTile = getTile("satellite", targetZoom, candidate.x, candidate.y, 9000 - candidate.distance);
  if (targetTile.loaded && showThreeGlobeReadyTile(globe, targetZoom, candidate, targetTile, visibleKeys)) {
    return { visible: true, exact: true, z: targetZoom, baseAtlas: false };
  }
  // The full-globe atlas already comes from the same Esri imagery source. Keep
  // it visible while an exact tile loads instead of placing an ancestor mesh
  // over several child meshes; the latter creates large polar LOD rectangles.
  return {
    visible: Boolean(globe.baseAtlasReady),
    exact: false,
    z: globe.baseAtlasReady ? globe.baseAtlasZoom : null,
    baseAtlas: Boolean(globe.baseAtlasReady),
  };
}

function threeGlobeTileCandidates(targetZoom, width, height, params) {
  const minimumZoom = Math.min(targetZoom, GLOBE_DETAIL_TILES_MIN_TILE_ZOOM);
  const rootCount = 2 ** minimumZoom;
  const screenProbes = threeGlobeScreenProbeMap(targetZoom, width, height, params, minimumZoom);
  const leaves = [];
  for (let y = 0; y < rootCount; y += 1) {
    for (let x = 0; x < rootCount; x += 1) {
      const candidate = threeGlobeCandidate(minimumZoom, x, y, width, height, params, screenProbes);
      if (candidate) leaves.push(candidate);
    }
  }

  while (leaves.length < GLOBE_VISIBLE_TILE_BUDGET) {
    let bestIndex = -1;
    let bestScore = 1;
    for (let index = 0; index < leaves.length; index += 1) {
      const candidate = leaves[index];
      if (candidate.terminal || candidate.z >= targetZoom) continue;
      if (candidate.refinementScore > bestScore) {
        bestIndex = index;
        bestScore = candidate.refinementScore;
      }
    }
    if (bestIndex < 0) break;
    const parent = leaves[bestIndex];
    const children = [];
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const child = threeGlobeCandidate(parent.z + 1, parent.x * 2 + dx, parent.y * 2 + dy, width, height, params, screenProbes);
        if (child) children.push(child);
      }
    }
    if (!children.length || leaves.length - 1 + children.length > GLOBE_VISIBLE_TILE_BUDGET) {
      parent.terminal = true;
      continue;
    }
    leaves.splice(bestIndex, 1, ...children);
  }
  return leaves.sort((a, b) => a.distance - b.distance || a.z - b.z);
}

function threeGlobeScreenProbeMap(targetZoom, width, height, params, minimumZoom = GLOBE_TEXTURE_MIN_ZOOM) {
  const probes = new Map();
  const spacing = 64;
  const screenXs = new Set([0, width / 2, width]);
  const screenYs = new Set([0, height / 2, height]);
  for (let x = 0; x <= width; x += spacing) screenXs.add(Math.min(width, x));
  for (let y = 0; y <= height; y += spacing) screenYs.add(Math.min(height, y));
  for (const screenY of screenYs) {
    for (const screenX of screenXs) {
      const point = globeUnprojectWithParams(screenX, screenY, params);
      if (!point) continue;
      for (let z = minimumZoom; z <= targetZoom; z += 1) {
        const n = 2 ** z;
        const tileX = positiveModulo(Math.floor(((normalizeLon(point.lon) + 180) / 360) * n), n);
        const sinLat = Math.sin(toRad(clamp(point.lat, -GLOBE_MERCATOR_MAX_LAT, GLOBE_MERCATOR_MAX_LAT)));
        const tileY = clamp(Math.floor((0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * n), 0, n - 1);
        const key = `${z}/${tileX}/${tileY}`;
        if (!probes.has(key)) probes.set(key, []);
        probes.get(key).push({ x: screenX, y: screenY, visible: true });
      }
    }
  }
  return probes;
}

function threeGlobeCandidate(z, x, y, width, height, params, screenProbes) {
  const west = tileXToLon(x, z);
  const east = tileXToLon(x + 1, z);
  const north = tileYToLat(y, z);
  const south = tileYToLat(y + 1, z);
  const midLon = normalizeLon((west + east) / 2);
  const midLat = (north + south) / 2;
  const samples = [];
  for (const lon of [west, midLon, east]) {
    for (const lat of [north, midLat, south]) {
      const point = globeProjectWithParams(lon, lat, params);
      if (point.visible) samples.push(point);
    }
  }
  const probePoints = screenProbes.get(`${z}/${x}/${y}`) || [];
  if (!samples.length && !probePoints.length) return null;
  const margin = Math.max(80, Math.min(width, height) * 0.18);
  const onScreen = [
    ...samples.filter((point) => point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin),
    ...probePoints,
  ];
  if (!onScreen.length) return null;
  const xs = onScreen.map((point) => point.x);
  const ys = onScreen.map((point) => point.y);
  const screenSpan = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
  const centerX = onScreen.reduce((sum, point) => sum + point.x, 0) / onScreen.length;
  const centerY = onScreen.reduce((sum, point) => sum + point.y, 0) / onScreen.length;
  const distance = Math.hypot(centerX - width / 2, centerY - height / 2);
  const diagonal = Math.max(1, Math.hypot(width / 2, height / 2));
  const centerBias = 1 + 0.16 * (1 - clamp(distance / diagonal, 0, 1));
  const targetPixelSpan = params.tilt >= 55 ? 150 : 178;
  return {
    z,
    x,
    y,
    key: `${z}/${x}/${y}`,
    distance,
    refinementScore: (screenSpan / targetPixelSpan) * centerBias,
    screenSpan,
  };
}

function sampleThreeGlobePixels(globe, width, height) {
  if (!GLOBE_PIXEL_DEBUG) return;
  const now = performance.now();
  if (globe.lastPixelSampleAt && now - globe.lastPixelSampleAt < 700) return;
  globe.lastPixelSampleAt = now;
  try {
    const gl = globe.renderer.getContext();
    const dpr = globe.pixelRatio || Math.min(RENDER_DPR_MAX, window.devicePixelRatio || 1);
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.max(0, Math.floor((width * dpr) / 2)), Math.max(0, Math.floor((height * dpr) / 2)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    els.globeCanvas.dataset.pixelSample = `${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`;
  } catch {
    els.globeCanvas.dataset.pixelSample = "unavailable";
  }
}

function clearThreeGlobeTiles(globe) {
  for (const mesh of globe.tileMeshes.values()) {
    globe.tileGroup.remove(mesh);
    mesh.geometry.dispose();
  }
  globe.tileMeshes.clear();
  for (const entry of globe.tileTextures.values()) {
    entry.texture?.dispose();
    entry.material?.dispose();
  }
  globe.tileTextures.clear();
}

function trimThreeGlobeTextureCache(globe) {
  if (globe.tileTextures.size <= GLOBE_TEXTURE_CACHE_MAX_ITEMS) return;
  const activeKeys = new Set([...globe.tileMeshes.entries()].filter(([, mesh]) => mesh.visible).map(([key]) => key));
  const removable = [...globe.tileTextures.entries()]
    .filter(([key]) => !activeKeys.has(key))
    .sort((a, b) => Number(a[1].lastUsedFrame || 0) - Number(b[1].lastUsedFrame || 0));
  for (const [key, entry] of removable) {
    if (globe.tileTextures.size <= GLOBE_TEXTURE_CACHE_MAX_ITEMS) break;
    entry.texture?.dispose();
    entry.material?.dispose();
    globe.tileTextures.delete(key);
  }
}

function createThreeGlobeTile(globe, z, x, y, lonWest, lonEast, latNorth, latSouth) {
  const geometry = new globe.THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = GLOBE_TILE_SEGMENTS;
  const tileRadius = EARTH_TILE_RADIUS;
  const gutterUv = 1 / (TILE_SIZE + 2);
  for (let row = 0; row <= segments; row += 1) {
    const ty = row / segments;
    const lat = tileYToLat(y + ty, z);
    for (let col = 0; col <= segments; col += 1) {
      const tx = col / segments;
      const lon = lonWest + (lonEast - lonWest) * tx;
      const p = spherePoint(lon, lat, tileRadius);
      positions.push(p.x, p.y, p.z);
      uvs.push(gutterUv + tx * (1 - 2 * gutterUv), gutterUv + (1 - ty) * (1 - 2 * gutterUv));
    }
  }
  const rowSize = segments + 1;
  for (let row = 0; row < segments; row += 1) {
    for (let col = 0; col < segments; col += 1) {
      const a = row * rowSize + col;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setAttribute("position", new globe.THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new globe.THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new globe.THREE.Mesh(geometry, globe.placeholderMaterial);
  mesh.renderOrder = 5 + z * 0.01;
  mesh.userData.tileZoom = z;
  return mesh;
}

function updateThreeGlobeTileTexture(globe, mesh, z, x, y, key, tile) {
  if (globe.tileTextures.has(key)) {
    const entry = globe.tileTextures.get(key);
    entry.lastUsedFrame = globe.tileFrame;
    mesh.material = entry.material;
    return true;
  }
  if (!tile?.loaded) return false;
  if (globe.textureUploadBudget <= 0) {
    requestGlobeBaseDraw();
    return false;
  }
  globe.textureUploadBudget -= 1;
  const padded = createPaddedGlobeTileCanvas(tile.image, globe, z, x, y);
  const texture = new globe.THREE.CanvasTexture(padded);
  texture.colorSpace = globe.THREE.SRGBColorSpace;
  texture.wrapS = globe.THREE.ClampToEdgeWrapping;
  texture.wrapT = globe.THREE.ClampToEdgeWrapping;
  texture.minFilter = globe.THREE.LinearMipmapLinearFilter;
  texture.magFilter = globe.THREE.LinearFilter;
  texture.anisotropy = Math.min(12, globe.renderer.capabilities.getMaxAnisotropy());
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  const material = new globe.THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    toneMapped: false,
    side: globe.THREE.FrontSide,
    depthTest: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  globe.tileTextures.set(key, { texture, material, lastUsedFrame: globe.tileFrame });
  mesh.material = material;
  return true;
}

function createPaddedGlobeTileCanvas(image, globe = null, z = 0, x = 0, y = 0) {
  const size = TILE_SIZE;
  const core = document.createElement("canvas");
  core.width = size;
  core.height = size;
  const coreContext = core.getContext("2d");
  coreContext.drawImage(image, 0, 0, size, size);

  const canvas = document.createElement("canvas");
  canvas.width = size + 2;
  canvas.height = size + 2;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(core, 1, 1, size, size);
  ctx.drawImage(core, 0, 0, 1, size, 0, 1, 1, size);
  ctx.drawImage(core, size - 1, 0, 1, size, size + 1, 1, 1, size);
  ctx.drawImage(core, 0, 0, size, 1, 1, 0, size, 1);
  ctx.drawImage(core, 0, size - 1, size, 1, 1, size + 1, size, 1);
  ctx.drawImage(core, 0, 0, 1, 1, 0, 0, 1, 1);
  ctx.drawImage(core, size - 1, 0, 1, 1, size + 1, 0, 1, 1);
  ctx.drawImage(core, 0, size - 1, 1, 1, 0, size + 1, 1, 1);
  ctx.drawImage(core, size - 1, size - 1, 1, 1, size + 1, size + 1, 1, 1);
  return canvas;
}

function threeGlobeTileVisible(west, east, north, south, width, height, params) {
  const midLon = normalizeLon((west + east) / 2);
  const midLat = (north + south) / 2;
  const samples = [
    [midLon, midLat],
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ].map(([lon, lat]) => globeProjectWithParams(lon, lat, params));
  if (!samples.some((point) => point.visible)) return false;
  const xs = samples.map((point) => point.x);
  const ys = samples.map((point) => point.y);
  const margin = Math.max(32, Math.min(width, height) * 0.12);
  return Math.max(...xs) >= -margin && Math.min(...xs) <= width + margin && Math.max(...ys) >= -margin && Math.min(...ys) <= height + margin;
}

function spherePoint(lon, lat, radius = 1) {
  const latRad = toRad(clamp(lat, -90, 90));
  const lonRad = toRad(normalizeLon(lon));
  const cosLat = Math.cos(latRad);
  return {
    x: radius * cosLat * Math.sin(lonRad),
    y: radius * Math.sin(latRad),
    z: radius * cosLat * Math.cos(lonRad),
  };
}

function drawGlobeLayer(ctx, width, height) {
  const source = TILE_SOURCES.earth;
  if (els.mapAttribution) els.mapAttribution.textContent = source.attribution;
  const params = globeParams(width, height);
  const backdrop = ctx.createRadialGradient(params.cx, params.cy, Math.max(10, params.radius * 0.18), params.cx, params.cy, params.radius * 1.45);
  backdrop.addColorStop(0, "#07141d");
  backdrop.addColorStop(0.55, "#02080d");
  backdrop.addColorStop(1, "#000307");
  ctx.fillStyle = backdrop;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.beginPath();
  ctx.arc(params.cx, params.cy, params.radius, 0, Math.PI * 2);
  ctx.clip();
  const ocean = ctx.createRadialGradient(params.cx - params.radius * 0.22, params.cy - params.radius * 0.24, params.radius * 0.1, params.cx, params.cy, params.radius);
  ocean.addColorStop(0, "#234a5b");
  ocean.addColorStop(0.58, "#102c39");
  ocean.addColorStop(1, "#07161d");
  ctx.fillStyle = ocean;
  ctx.fillRect(params.cx - params.radius, params.cy - params.radius, params.radius * 2, params.radius * 2);
  drawGlobeSatelliteTiles(ctx, width, height, params);
  drawGlobeGraticule(ctx, width, height, params);
  const shade = ctx.createRadialGradient(params.cx - params.radius * 0.34, params.cy - params.radius * 0.34, params.radius * 0.2, params.cx + params.radius * 0.28, params.cy + params.radius * 0.28, params.radius * 1.05);
  shade.addColorStop(0, "rgba(255,255,255,0.16)");
  shade.addColorStop(0.55, "rgba(255,255,255,0.02)");
  shade.addColorStop(0.82, "rgba(0,0,0,0.18)");
  shade.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = shade;
  ctx.fillRect(params.cx - params.radius, params.cy - params.radius, params.radius * 2, params.radius * 2);
  ctx.restore();

  ctx.save();
  ctx.lineWidth = Math.max(1.2, params.radius * 0.004);
  ctx.strokeStyle = "rgba(177, 224, 255, 0.62)";
  ctx.shadowColor = "rgba(70, 170, 255, 0.34)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(params.cx, params.cy, params.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawGlobeSatelliteTiles(ctx, width, height, params) {
  const tileZoom = globeTextureZoom();
  const n = 2 ** tileZoom;
  const subdivisions = tileZoom <= 2 ? 5 : tileZoom === 3 ? 4 : 3;
  ctx.save();
  ctx.globalAlpha = 0.94;
  for (let x = 0; x < n; x += 1) {
    const lonWest = tileXToLon(x, tileZoom);
    const lonEast = tileXToLon(x + 1, tileZoom);
    for (let y = 0; y < n; y += 1) {
      const latNorth = tileYToLat(y, tileZoom);
      const latSouth = tileYToLat(y + 1, tileZoom);
      if (!globeTileMayBeVisible(lonWest, lonEast, latNorth, latSouth, params)) continue;
      const tile = getTile("satellite", tileZoom, x, y);
      if (!tile.loaded) {
        drawGlobeTilePlaceholder(ctx, lonWest, lonEast, latNorth, latSouth, width, height, tile.failed, params);
        continue;
      }
      for (let subX = 0; subX < subdivisions; subX += 1) {
        const aX = subX / subdivisions;
        const bX = (subX + 1) / subdivisions;
        const west = lonWest + (lonEast - lonWest) * aX;
        const east = lonWest + (lonEast - lonWest) * bX;
        for (let subY = 0; subY < subdivisions; subY += 1) {
          const north = tileYToLat(y + subY / subdivisions, tileZoom);
          const south = tileYToLat(y + (subY + 1) / subdivisions, tileZoom);
          drawGlobeTilePatch(ctx, tile.image, west, east, north, south, subX, subY, subdivisions, width, height, params);
        }
      }
    }
  }
  ctx.restore();
}

function drawGlobeTilePatch(ctx, image, west, east, north, south, subX, subY, subdivisions, width, height, params) {
  const points = [
    globeProjectWithParams(west, north, params),
    globeProjectWithParams(east, north, params),
    globeProjectWithParams(east, south, params),
    globeProjectWithParams(west, south, params),
  ];
  if (!points.every((point) => point.visible)) return;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 0.7;
  const maxX = Math.max(...xs) + 0.7;
  const minY = Math.min(...ys) - 0.7;
  const maxY = Math.max(...ys) + 0.7;
  if (maxX < 0 || minX > width || maxY < 0 || minY > height) return;
  const srcSize = TILE_SIZE / subdivisions;
  ctx.drawImage(image, subX * srcSize, subY * srcSize, srcSize, srcSize, minX, minY, maxX - minX, maxY - minY);
}

function drawGlobeTilePlaceholder(ctx, west, east, north, south, width, height, failed, params) {
  const points = [
    globeProjectWithParams(west, north, params),
    globeProjectWithParams(east, north, params),
    globeProjectWithParams(east, south, params),
    globeProjectWithParams(west, south, params),
  ];
  if (!points.every((point) => point.visible)) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = failed ? "rgba(39, 50, 45, 0.45)" : "rgba(30, 46, 48, 0.35)";
  ctx.fill();
}

function drawGlobeGraticule(ctx, width, height, params) {
  ctx.save();
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = "rgba(210, 234, 241, 0.16)";
  for (let lat = -60; lat <= 60; lat += 30) {
    drawGlobeLine(ctx, Array.from({ length: 121 }, (_, index) => [-180 + index * 3, lat]), params);
  }
  for (let lon = -180; lon < 180; lon += 30) {
    drawGlobeLine(ctx, Array.from({ length: 61 }, (_, index) => [lon, -80 + index * (160 / 60)]), params);
  }
  ctx.restore();
}

function drawGlobeLine(ctx, coords, params) {
  let drawing = false;
  ctx.beginPath();
  for (const [lon, lat] of coords) {
    const point = globeProjectWithParams(lon, lat, params);
    if (!point.visible) {
      drawing = false;
      continue;
    }
    if (!drawing) {
      ctx.moveTo(point.x, point.y);
      drawing = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
}

function globeTileMayBeVisible(west, east, north, south, params) {
  const midLon = normalizeLon((west + east) / 2);
  const midLat = (north + south) / 2;
  return [
    [midLon, midLat],
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ].some(([lon, lat]) => globeProjectWithParams(lon, lat, params).visible);
}

function globeTextureZoom() {
  const desired = desiredGlobeTextureZoom();
  if (!globeStableTextureZoom) {
    globeStableTextureZoom = desired;
    globePendingTextureZoom = desired;
    return desired;
  }
  if (desired !== globePendingTextureZoom) {
    globePendingTextureZoom = desired;
    if (globeLodTimer) clearTimeout(globeLodTimer);
    globeLodTimer = window.setTimeout(() => {
      globeLodTimer = 0;
      globeStableTextureZoom = globePendingTextureZoom;
      scheduleDraw();
    }, 180);
  }
  return globeStableTextureZoom;
}

function desiredGlobeTextureZoom() {
  const retinaBias = (window.devicePixelRatio || 1) > 1.4 ? 0.45 : 0;
  return clamp(Math.floor(state.view.zoom + 1.05 + retinaBias), Math.max(3, GLOBE_TEXTURE_MIN_ZOOM), GLOBE_TEXTURE_MAX_ZOOM);
}

function tileXToLon(x, z) {
  return (x / 2 ** z) * 360 - 180;
}

function tileYToLat(y, z) {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return toDeg(Math.atan(Math.sinh(n)));
}

function drawWatchRegions(ctx, width, height) {
  const selected = WATCH_REGIONS.filter((region) => state.selectedWatchRegions.has(region.id));
  for (const region of selected) {
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = hexToRgba(region.color, 0.95);
    ctx.fillStyle = hexToRgba(region.color, 0.08);
    drawGeometry(ctx, region.geometry, width, height);
    ctx.restore();

    const label = project((region.bounds.minLon + region.bounds.maxLon) / 2, (region.bounds.minLat + region.bounds.maxLat) / 2, width, height);
    ctx.fillStyle = "rgba(14, 21, 27, 0.82)";
    ctx.strokeStyle = hexToRgba(region.color, 0.95);
    ctx.lineWidth = 1;
    const text = region.label;
    ctx.font = "12px Segoe UI, Arial";
    const metrics = ctx.measureText(text);
    ctx.beginPath();
    ctx.roundRect(label.x - metrics.width / 2 - 8, label.y - 12, metrics.width + 16, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f2f5f7";
    ctx.fillText(text, label.x - metrics.width / 2, label.y + 3);
  }
}

function drawRestrictions(ctx, width, height) {
  if (isGlobeLayer() && globeRendererState?.restrictionGpuLayer) {
    const allDrawable = drawnFilteredItems().filter(restrictionHasDrawableAreaGeometry);
    state.drawableRestrictions = allDrawable;
    state.drawableRestrictionById = new Map(allDrawable.map((item) => [item.id, item]));
    state.restrictionPathsById = new Map();
    state.paths = [];
    els.canvas.dataset.restrictionCache = "webgl-resident-geometry";
    return;
  }
  const drawable = drawableRestrictionItems(width, height);
  if (drawTranslatedRestrictionSurfaceDuringFlatPan(ctx, drawable, width, height)) {
    drawRestrictionEmphasis(ctx, drawable, width, height);
    return;
  }
  const signature = restrictionSurfaceSignature(width, height);
  const cacheHit = Boolean(restrictionSurfaceCache?.signature === signature);
  if (!cacheHit) restrictionSurfaceCache = buildRestrictionSurfaceCache(drawable, width, height, signature, restrictionSurfaceCache);
  const cache = restrictionSurfaceCache;
  state.drawableRestrictions = cache?.drawable || drawable;
  state.drawableRestrictionById = cache?.drawableById || new Map(drawable.map((item) => [item.id, item]));
  state.restrictionPathsById = cache?.pathsById || new Map();
  state.paths = cache?.paths ? [...cache.paths] : [];
  if (cache?.canvas && !presentFlatRestrictionGpu(cache.canvas, cache.signature, width, height, { x: 0, y: 0, width, height })) {
    ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, 0, 0, width, height);
  }
  drawRestrictionEmphasis(ctx, state.drawableRestrictions, width, height);
  els.canvas.dataset.restrictionCache = cacheHit ? "hit" : "miss";
}

function drawTranslatedRestrictionSurfaceDuringFlatPan(ctx, drawable, width, height) {
  if (!state.view.drag || isGlobeLayer() || !restrictionSurfaceCache?.canvas) return false;
  const cache = restrictionSurfaceCache;
  if (
    cache.identity !== restrictionItemsIdentity(drawnFilteredItems()) ||
    Math.abs(Number(cache.width) - width) > 1 ||
    Math.abs(Number(cache.height) - height) > 1 ||
    !cache.view ||
    Math.abs(Number(state.view.zoom) - Number(cache.view.zoom)) > 1e-9
  ) return false;
  const cachedCenter = project(cache.view.lon, cache.view.lat, width, height);
  if (!cachedCenter) return false;
  const offsetX = cachedCenter.x - width / 2;
  const offsetY = cachedCenter.y - height / 2;
  if (
    !Number.isFinite(offsetX) || !Number.isFinite(offsetY) ||
    Math.abs(offsetX) > width * 0.65 ||
    Math.abs(offsetY) > height * 0.65
  ) return false;
  if (!presentFlatRestrictionGpu(cache.canvas, cache.signature, width, height, {
    x: offsetX,
    y: offsetY,
    width,
    height,
  })) {
    ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, offsetX, offsetY, width, height);
  }
  state.drawableRestrictions = drawable;
  state.drawableRestrictionById = new Map(drawable.map((item) => [item.id, item]));
  state.restrictionPathsById = new Map();
  state.paths = [];
  els.canvas.dataset.restrictionCache = "interaction-pan-translate";
  return true;
}

function ensureFlatRestrictionGpuRenderer() {
  if (flatRestrictionGpuRenderer) return flatRestrictionGpuRenderer;
  const canvas = els.restrictionGpuCanvas;
  if (!canvas) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
  });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "restriction shader compile failed");
    return shader;
  };
  try {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, `#version 300 es
      in vec2 position;
      uniform vec4 destinationClip;
      out vec2 textureCoordinate;
      void main() {
        gl_Position = vec4(
          mix(destinationClip.x, destinationClip.z, position.x),
          mix(destinationClip.y, destinationClip.w, position.y),
          0.0,
          1.0
        );
        textureCoordinate = position;
      }
    `));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, `#version 300 es
      precision mediump float;
      uniform sampler2D restrictionTexture;
      in vec2 textureCoordinate;
      out vec4 outputColor;
      void main() {
        outputColor = texture(restrictionTexture, textureCoordinate);
      }
    `));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "restriction shader link failed");
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    flatRestrictionGpuRenderer = {
      gl,
      program,
      buffer,
      texture,
      destinationLocation: gl.getUniformLocation(program, "destinationClip"),
      textureSignature: "",
      width: 0,
      height: 0,
    };
    return flatRestrictionGpuRenderer;
  } catch (error) {
    console.warn("Flat restriction WebGL compositor unavailable.", error);
    return null;
  }
}

function presentFlatRestrictionGpu(source, signature, width, height, destination) {
  if (isGlobeLayer()) return false;
  const renderer = ensureFlatRestrictionGpuRenderer();
  if (!renderer) return false;
  const { gl } = renderer;
  const dpr = Math.min(window.devicePixelRatio || 1, currentRenderDprCap());
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (renderer.width !== targetWidth || renderer.height !== targetHeight) {
    els.restrictionGpuCanvas.width = targetWidth;
    els.restrictionGpuCanvas.height = targetHeight;
    renderer.width = targetWidth;
    renderer.height = targetHeight;
  }
  gl.viewport(0, 0, targetWidth, targetHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(renderer.program);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.buffer);
  const position = gl.getAttribLocation(renderer.program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.texture);
  if (renderer.textureSignature !== signature) {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    renderer.textureSignature = signature;
  }
  const x0 = destination.x / width * 2 - 1;
  const x1 = (destination.x + destination.width) / width * 2 - 1;
  const y0 = 1 - (destination.y + destination.height) / height * 2;
  const y1 = 1 - destination.y / height * 2;
  gl.uniform4f(renderer.destinationLocation, x0, y0, x1, y1);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  if (els.canvas) els.canvas.dataset.restrictionRenderer = "webgl-texture-compositor";
  return true;
}

function ensureFlatBallisticGpuRenderer() {
  if (flatBallisticGpuRenderer) return flatBallisticGpuRenderer;
  const canvas = els.ballisticGpuCanvas;
  if (!canvas) return null;
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    stencil: false,
    desynchronized: true,
    powerPreference: "high-performance",
    premultipliedAlpha: true,
  });
  if (!gl) return null;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "ballistic shader compile failed");
    }
    return shader;
  };
  const link = (vertexSource, fragmentSource) => {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || "ballistic shader link failed");
    }
    return program;
  };
  const projectionSource = `
    uniform vec2 centerWorld;
    uniform vec2 viewportCss;
    uniform float worldScale;
    uniform float worldShiftX;
    vec4 projectWorld(vec2 worldPosition) {
      vec2 pixel = (worldPosition + vec2(worldShiftX, 0.0) - centerWorld) * worldScale + viewportCss * 0.5;
      return vec4(pixel.x / viewportCss.x * 2.0 - 1.0, 1.0 - pixel.y / viewportCss.y * 2.0, 0.0, 1.0);
    }
  `;
  try {
    const lineProgram = link(`#version 300 es
      in vec2 worldPosition;
      in vec4 vertexColor;
      out vec4 color;
      ${projectionSource}
      void main() {
        color = vertexColor;
        gl_Position = projectWorld(worldPosition);
      }
    `, `#version 300 es
      precision mediump float;
      in vec4 color;
      out vec4 outputColor;
      void main() { outputColor = color; }
    `);
    const pointProgram = link(`#version 300 es
      in vec2 worldPosition;
      in vec4 vertexColor;
      in float pointSize;
      out vec4 color;
      ${projectionSource}
      void main() {
        color = vertexColor;
        gl_Position = projectWorld(worldPosition);
        gl_PointSize = pointSize;
      }
    `, `#version 300 es
      precision mediump float;
      in vec4 color;
      out vec4 outputColor;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5));
        if (radius > 0.5) discard;
        float halo = 1.0 - smoothstep(0.08, 0.5, radius);
        float core = 1.0 - smoothstep(0.0, 0.13, radius);
        outputColor = vec4(color.rgb, color.a * clamp(halo + core * 0.72, 0.0, 1.0));
      }
    `);
    const lineBuffer = gl.createBuffer();
    const pointBuffer = gl.createBuffer();
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    flatBallisticGpuRenderer = {
      gl,
      lineProgram,
      pointProgram,
      lineBuffer,
      pointBuffer,
      lineLocations: flatBallisticProgramLocations(gl, lineProgram, false),
      pointLocations: flatBallisticProgramLocations(gl, pointProgram, true),
      entries: new Map(),
      signature: "",
      vertexCount: 0,
      width: 0,
      height: 0,
    };
    return flatBallisticGpuRenderer;
  } catch (error) {
    console.warn("Flat ballistic WebGL renderer unavailable.", error);
    return null;
  }
}

function flatBallisticProgramLocations(gl, program, points) {
  return {
    worldPosition: gl.getAttribLocation(program, "worldPosition"),
    vertexColor: gl.getAttribLocation(program, "vertexColor"),
    pointSize: points ? gl.getAttribLocation(program, "pointSize") : -1,
    centerWorld: gl.getUniformLocation(program, "centerWorld"),
    viewportCss: gl.getUniformLocation(program, "viewportCss"),
    worldScale: gl.getUniformLocation(program, "worldScale"),
    worldShiftX: gl.getUniformLocation(program, "worldShiftX"),
  };
}

function rebuildFlatBallisticGpuGeometry(renderer, session) {
  const vertices = [];
  renderer.entries.clear();
  for (const entry of session.entries) {
    const samples = entry.prepared.samples || [];
    if (samples.length < 2) continue;
    const firstVertex = vertices.length / 6;
    let previousLon = normalizeLon(Number(samples[0].lon) || 0);
    let referenceXTotal = 0;
    let referenceCount = 0;
    const points = samples.map((sample, index) => {
      const lon = index ? normalizeLonNear(Number(sample.lon) || 0, previousLon) : previousLon;
      previousLon = lon;
      const world = lonLatToWorldRaw(lon, sample.lat, 0);
      referenceXTotal += world.x;
      referenceCount += 1;
      return world;
    });
    for (let index = 1; index < samples.length; index += 1) {
      for (const candidateIndex of [index - 1, index]) {
        const candidate = samples[candidateIndex];
        const visual = ballisticAnimationVisual(candidate, entry.prepared.stageColor);
        const rgb = visual.glowOpacity > 0.001
          ? reentryGlowRgb(visual.heat.intensity)
          : hexRgb(entry.prepared.stageColor || "#6bd7ff");
        vertices.push(points[candidateIndex].x, points[candidateIndex].y, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, 0.94);
      }
    }
    renderer.entries.set(entry.key, {
      firstVertex,
      segmentCount: samples.length - 1,
      referenceWorldX: referenceCount ? referenceXTotal / referenceCount : TILE_SIZE / 2,
    });
  }
  const { gl } = renderer;
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  renderer.vertexCount = vertices.length / 6;
  renderer.signature = session.signature;
}

function flatBallisticWorldShift(referenceWorldX, centerWorldX) {
  return Math.round((centerWorldX - referenceWorldX) / TILE_SIZE) * TILE_SIZE;
}

function applyFlatBallisticProjectionUniforms(gl, locations, frame, width, height, worldShiftX) {
  gl.uniform2f(locations.centerWorld, frame.centerX / (2 ** frame.zoom), frame.centerY / (2 ** frame.zoom));
  gl.uniform2f(locations.viewportCss, Math.max(1, width), Math.max(1, height));
  gl.uniform1f(locations.worldScale, 2 ** frame.zoom);
  gl.uniform1f(locations.worldShiftX, worldShiftX);
}

function clearFlatBallisticGpu() {
  const renderer = flatBallisticGpuRenderer;
  if (!renderer) return;
  const { gl } = renderer;
  gl.viewport(0, 0, renderer.width, renderer.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function updateFlatBallisticAnimationGpu(session, frameItems, timestamp, width, height, animationFinished) {
  if (isGlobeLayer() || !session?.entries?.length) {
    clearFlatBallisticGpu();
    return null;
  }
  const renderer = ensureFlatBallisticGpuRenderer();
  if (!renderer) return null;
  if (renderer.signature !== session.signature) rebuildFlatBallisticGpuGeometry(renderer, session);
  const { gl } = renderer;
  const dpr = Math.min(currentRenderDprCap(), window.devicePixelRatio || 1);
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (renderer.width !== targetWidth || renderer.height !== targetHeight) {
    els.ballisticGpuCanvas.width = targetWidth;
    els.ballisticGpuCanvas.height = targetHeight;
    renderer.width = targetWidth;
    renderer.height = targetHeight;
  }
  gl.viewport(0, 0, targetWidth, targetHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const frame = flatProjectionFrameFor(width, height);
  const centerWorldX = frame.centerX / (2 ** frame.zoom);
  let renderedSegments = 0;

  gl.useProgram(renderer.lineProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.lineBuffer);
  gl.enableVertexAttribArray(renderer.lineLocations.worldPosition);
  gl.vertexAttribPointer(renderer.lineLocations.worldPosition, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(renderer.lineLocations.vertexColor);
  gl.vertexAttribPointer(renderer.lineLocations.vertexColor, 4, gl.FLOAT, false, 24, 8);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const { entry, bracket } of frameItems) {
    const object = renderer.entries.get(entry.key);
    if (!object || !bracket) continue;
    const count = clamp(bracket.lowerIndex + (bracket.fraction > 1e-6 ? 1 : 0), 0, object.segmentCount);
    if (!count) continue;
    applyFlatBallisticProjectionUniforms(
      gl,
      renderer.lineLocations,
      frame,
      width,
      height,
      flatBallisticWorldShift(object.referenceWorldX, centerWorldX),
    );
    gl.drawArrays(gl.LINES, object.firstVertex, count * 2);
    renderedSegments += count;
  }

  const pointGroups = new Map();
  let impactFlashActive = false;
  for (const { entry, current } of frameItems) {
    const object = renderer.entries.get(entry.key);
    if (!object || !current) continue;
    const pointLon = normalizeLonNear(current.lon, (object.referenceWorldX / TILE_SIZE) * 360 - 180);
    const world = lonLatToWorldRaw(pointLon, current.lat, 0);
    const worldShiftX = flatBallisticWorldShift(object.referenceWorldX, centerWorldX);
    if (!pointGroups.has(worldShiftX)) pointGroups.set(worldShiftX, []);
    const visual = ballisticAnimationVisual(current, entry.prepared.stageColor);
    const heatRgb = visual.glowOpacity > 0.001
      ? reentryGlowRgb(visual.heat.intensity)
      : hexRgb(entry.prepared.stageColor || "#6bd7ff");
    const heatRadiusKm = 8 + visual.heat.areaScale * 40;
    const heatWorldPixels = heatRadiusKm * 2 / 40075 * frame.worldSize;
    const headSize = clamp(Math.max(13, heatWorldPixels), 13, 88) * dpr;
    pointGroups.get(worldShiftX).push(world.x, world.y, heatRgb[0] / 255, heatRgb[1] / 255, heatRgb[2] / 255, clamp(0.52 + visual.glowOpacity * 0.48, 0.52, 1), headSize);

    const flashState = REENTRY_ANIMATION?.impactFlashState
      ? REENTRY_ANIMATION.impactFlashState(
        ensureBallisticAnimationConfig().impactFlashStartedAtByKey[entry.key],
        timestamp,
        BALLISTIC_IMPACT_FLASH_DURATION_MS,
        animationFinished,
      )
      : { mode: animationFinished ? "held" : "idle", ageMs: Number.POSITIVE_INFINITY };
    const flashEnabled = entry.stage.impactFlashEnabled !== false && entry.physics.status === "impact";
    if (flashEnabled && (flashState.mode === "transient" || flashState.mode === "held")) {
      impactFlashActive = true;
      const phase = flashState.mode === "held" ? 0.16 : clamp(flashState.ageMs / BALLISTIC_IMPACT_FLASH_DURATION_MS, 0, 1);
      const envelope = flashState.mode === "held" ? 1 : smoothstep(0, 0.05, phase) * (1 - smoothstep(0.18, 1, phase));
      const flashRadiusKm = 180 + Math.sqrt(Math.max(0, phase)) * 420;
      const flashWorldPixels = flashRadiusKm * 2 / 40075 * frame.worldSize;
      pointGroups.get(worldShiftX).push(world.x, world.y, 1, 0.96, 0.76, clamp(envelope * 1.25, 0, 1), clamp(Math.max(84, flashWorldPixels), 84, 520) * dpr);
    }
  }

  gl.useProgram(renderer.pointProgram);
  gl.bindBuffer(gl.ARRAY_BUFFER, renderer.pointBuffer);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  let pointCount = 0;
  for (const [worldShiftX, values] of pointGroups) {
    const points = new Float32Array(values);
    gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(renderer.pointLocations.worldPosition);
    gl.vertexAttribPointer(renderer.pointLocations.worldPosition, 2, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(renderer.pointLocations.vertexColor);
    gl.vertexAttribPointer(renderer.pointLocations.vertexColor, 4, gl.FLOAT, false, 28, 8);
    gl.enableVertexAttribArray(renderer.pointLocations.pointSize);
    gl.vertexAttribPointer(renderer.pointLocations.pointSize, 1, gl.FLOAT, false, 28, 24);
    applyFlatBallisticProjectionUniforms(gl, renderer.pointLocations, frame, width, height, Number(worldShiftX));
    gl.drawArrays(gl.POINTS, 0, points.length / 7);
    pointCount += points.length / 7;
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  els.ballisticGpuCanvas.dataset.renderer = "webgl2-precomputed";
  els.ballisticGpuCanvas.dataset.segmentCount = String(renderedSegments);
  els.ballisticGpuCanvas.dataset.pointCount = String(pointCount);
  return { renderedSegments, pointCount, impactFlashActive };
}

function buildRestrictionSurfaceCache(drawable, width, height, signature, reusableCache = null) {
  const dpr = Math.min(window.devicePixelRatio || 1, currentRenderDprCap());
  const canvas = reusableCache?.canvas || document.createElement("canvas");
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paintedGeometryKeys = new Set();
  const cachePaths = [];
  const retainHitPaths = !isInteractiveRender();
  for (let drawIndex = 0; drawIndex < drawable.length; drawIndex += 1) {
    const item = drawable[drawIndex];
    const renderKey = restrictionRenderKey(item);
    const alreadyPainted = renderKey && paintedGeometryKeys.has(renderKey);
    const shouldPaint = !alreadyPainted;
    ctx.save();
    ctx.fillStyle = hexToRgba(item.color, 0.28);
    ctx.strokeStyle = hexToRgba(item.color, 0.72);
    ctx.lineWidth = 1.4;
    ctx.setLineDash([]);
    const displayGeometry = restrictionGeometryForDrawing(item);
    if (!isAreaGeometry(displayGeometry)) {
      ctx.restore();
      continue;
    }
    const geometryPaths = drawGeometry(ctx, displayGeometry, width, height, { paint: shouldPaint });
    ctx.restore();
    if (retainHitPaths) {
      const hitArea = item.hitArea ?? geometryHitArea(displayGeometry);
      geometryPaths.forEach((path) => pathsForCachePush(cachePaths, path, item, hitArea, drawIndex));
    }
    if (shouldPaint && renderKey) paintedGeometryKeys.add(renderKey);
  }
  const pathsById = new Map();
  for (const path of cachePaths) {
    if (!pathsById.has(path.id)) pathsById.set(path.id, []);
    pathsById.get(path.id).push(path);
  }
  return {
    signature,
    identity: restrictionItemsIdentity(drawnFilteredItems()),
    width,
    height,
    view: { lon: state.view.lon, lat: state.view.lat, zoom: state.view.zoom },
    canvas,
    paths: cachePaths,
    pathsById,
    drawable,
    drawableById: new Map(drawable.map((item) => [item.id, item])),
  };
}

function pathsForCachePush(cachePaths, path, item, hitArea, drawIndex) {
  cachePaths.push({ id: item.id, item, path, hitArea, hitOrder: drawIndex, fillRule: "evenodd" });
}

function drawRestrictionEmphasis(ctx, drawable, width, height) {
  const membershipIndex = trajectoryMembershipIndex();
  for (const item of drawable) {
    const membership = trajectoryMembership(item.id, membershipIndex);
    const manuallyHighlighted = state.highlightedRestrictionIds.has(item.id);
    const timeWindowHighlighted = state.timeWindowRestrictionIds.has(item.id);
    const pickedForTrajectory = Boolean(membership);
    const trajectoryHighlighted = Boolean(state.trajectoryAreaHighlightEnabled && pickedForTrajectory);
    const highlighted = manuallyHighlighted || trajectoryHighlighted;
    const selected = item.id === state.selectedId || highlighted || timeWindowHighlighted;
    const hovered = item.id === state.hoverId || state.hoverRestrictionIds.has(item.id);
    const preselected = Boolean(state.trajectoryEnabled && state.trajectoryAreaPickEnabled && hovered && !highlighted && !timeWindowHighlighted && !pickedForTrajectory);
    if (!selected && !hovered && !preselected) continue;
    const alpha = highlighted ? 0.74 : timeWindowHighlighted ? 0.2 : selected ? 0.5 : 0.42;
    const strokeAlpha = highlighted || timeWindowHighlighted ? 1 : 0.96;
    ctx.save();
    if (highlighted) {
      ctx.shadowColor = hexToRgba(item.color, 0.95);
      ctx.shadowBlur = 22;
    } else if (timeWindowHighlighted) {
      ctx.shadowColor = "rgba(255, 231, 95, 0.68)";
      ctx.shadowBlur = 14;
    }
    ctx.fillStyle = hexToRgba(item.color, alpha);
    ctx.strokeStyle = timeWindowHighlighted && !highlighted ? "rgba(255, 232, 90, 0.98)" : hexToRgba(item.color, strokeAlpha);
    ctx.lineWidth = highlighted ? 5 : timeWindowHighlighted ? 3.4 : selected ? 3 : 2.45;
    ctx.setLineDash(timeWindowHighlighted && !highlighted ? [12, 7] : preselected ? [8, 5] : []);
    const geometry = restrictionGeometryForDrawing(item);
    if (isAreaGeometry(geometry)) drawGeometry(ctx, geometry, width, height, { paint: true });
    ctx.restore();
  }
}

function restrictionSurfaceSignature(width, height) {
  const items = drawnFilteredItems();
  const identity = restrictionItemsIdentity(items);
  const dpr = Math.min(window.devicePixelRatio || 1, currentRenderDprCap());
  return [
    identity,
    Math.round(width),
    Math.round(height),
    dpr.toFixed(2),
    state.view.lon.toFixed(6),
    state.view.lat.toFixed(6),
    state.view.zoom.toFixed(4),
    Number(state.view.globeTilt || 0).toFixed(3),
    Number(state.view.globeBearing || 0).toFixed(3),
    state.notamEnabled ? 1 : 0,
    state.hydropacEnabled ? 1 : 0,
    state.msaEnabled ? 1 : 0,
    state.navareaEnabled ? 1 : 0,
  ].join(":");
}

function restrictionItemsIdentity(items) {
  let identity = restrictionArrayIdentities.get(items);
  if (!identity) {
    identity = nextRestrictionArrayIdentity;
    nextRestrictionArrayIdentity += 1;
    restrictionArrayIdentities.set(items, identity);
  }
  return identity;
}

function drawableRestrictionItems(width, height) {
  const viewBounds = currentViewportBounds(width, height);
  return drawnFilteredItems().filter((item) => restrictionHasDrawableAreaGeometry(item) && restrictionCouldIntersectViewport(item, viewBounds));
}

function restrictionHasDrawableAreaGeometry(item) {
  return Boolean(item?.hasGeometry && isAreaGeometry(item.geometry));
}

function currentViewportBounds(width, height) {
  if (isGlobeLayer()) {
    return GLOBE_CAMERA ? { kind: "globe", width, height, params: globeParams(width, height) } : null;
  }
  const z = state.view.zoom;
  const worldSize = TILE_SIZE * 2 ** z;
  const center = lonLatToWorld(state.view.lon, state.view.lat, z);
  const topLeft = worldToLonLat(center.x - width / 2, center.y - height / 2, z);
  const bottomRight = worldToLonLat(center.x + width / 2, center.y + height / 2, z);
  const lonSpan = (width / worldSize) * 360;
  return {
    centerLon: normalizeLon(state.view.lon),
    halfLon: lonSpan / 2 + 8,
    allLon: lonSpan >= 340,
    minLat: Math.min(topLeft.lat, bottomRight.lat) - 8,
    maxLat: Math.max(topLeft.lat, bottomRight.lat) + 8,
  };
}

function restrictionCouldIntersectViewport(item, viewBounds) {
  const bounds = item.bounds;
  if (!viewBounds || !bounds) return true;
  if (viewBounds.kind === "globe") return restrictionCouldIntersectGlobe(bounds, viewBounds);
  if (bounds.maxLat < viewBounds.minLat || bounds.minLat > viewBounds.maxLat) return false;
  if (viewBounds.allLon) return true;
  const span = bounds.maxLon - bounds.minLon;
  if (span < 0 || span > 180) return true;
  const viewMin = viewBounds.centerLon - viewBounds.halfLon;
  const viewMax = viewBounds.centerLon + viewBounds.halfLon;
  for (const shift of [-360, 0, 360]) {
    if (bounds.minLon + shift <= viewMax && bounds.maxLon + shift >= viewMin) return true;
  }
  return false;
}

function restrictionCouldIntersectGlobe(bounds, viewBounds) {
  const lonSpan = Number(bounds.maxLon) - Number(bounds.minLon);
  const latSpan = Number(bounds.maxLat) - Number(bounds.minLat);
  if (!Number.isFinite(lonSpan) || !Number.isFinite(latSpan) || lonSpan < 0 || lonSpan > 90 || latSpan > 65) return true;
  const centerLon = normalizeLon((Number(bounds.minLon) + Number(bounds.maxLon)) / 2);
  const centerLat = (Number(bounds.minLat) + Number(bounds.maxLat)) / 2;
  const samples = [
    [centerLon, centerLat],
    [bounds.minLon, bounds.minLat],
    [bounds.minLon, bounds.maxLat],
    [bounds.maxLon, bounds.minLat],
    [bounds.maxLon, bounds.maxLat],
  ];
  const margin = Math.max(80, Math.min(viewBounds.width, viewBounds.height) * 0.18);
  if (
    samples.some(([lon, lat]) => {
      const point = globeProjectWithParams(lon, lat, viewBounds.params);
      return point.visible && point.x >= -margin && point.x <= viewBounds.width + margin && point.y >= -margin && point.y <= viewBounds.height + margin;
    })
  ) {
    return true;
  }
  const targetLon = normalizeLon(viewBounds.params.lon);
  const targetLat = Number(viewBounds.params.lat);
  return targetLat >= bounds.minLat && targetLat <= bounds.maxLat && longitudeInsideBounds(targetLon, bounds.minLon, bounds.maxLon);
}

function longitudeInsideBounds(lon, minLon, maxLon) {
  for (const shift of [-360, 0, 360]) {
    const shifted = lon + shift;
    if (shifted >= minLon && shifted <= maxLon) return true;
  }
  return false;
}

function drawCustomCoordinates(ctx, width, height) {
  if (!state.customCoordinatesEnabled || !state.customItems.length) return;
  for (const item of state.customItems) {
    const hovered = item.id === state.hoverId;
    const selected = item.id === state.selectedId || item.id === state.selectedCustomId;
    ctx.save();
    const isPoint = item.geometry?.type === "Point";
    ctx.setLineDash(!isPoint && item.geometry?.type === "LineString" ? [9, 6] : []);
    ctx.fillStyle = hexToRgba(item.color || CUSTOM_COORDINATE_COLOR, item.geometry?.type === "Polygon" ? (selected ? 0.38 : hovered ? 0.32 : 0.2) : 0.92);
    ctx.strokeStyle = hexToRgba(item.color || CUSTOM_COORDINATE_COLOR, selected || hovered ? 1 : 0.86);
    ctx.lineWidth = selected ? 3 : hovered ? 2.6 : 2;
    const paths = isPoint
      ? drawCustomPin(ctx, item, width, height, selected, hovered)
      : drawGeometry(ctx, item.geometry, width, height, { paint: true });
    for (const path of paths) {
      state.customPaths.push({
        id: item.id,
        path,
        geometryType: item.geometry?.type || "",
        lineWidth: ctx.lineWidth,
      });
    }
    drawCustomCoordinateLabel(ctx, item, width, height, selected || hovered);
    ctx.restore();
  }
}

function drawCustomPin(ctx, item, width, height, selected = false, hovered = false) {
  const [lon, lat] = item.geometry?.coordinates || [];
  const point = project(lon, lat, width, height);
  if (point.visible === false || point.x < -40 || point.x > width + 40 || point.y < -40 || point.y > height + 40) return [];

  const color = item.color || CUSTOM_COORDINATE_COLOR;
  const size = selected ? 15 : hovered ? 13.5 : 12;
  const tipX = point.x;
  const tipY = point.y;
  const topY = tipY - size * 1.85;
  const shoulderY = tipY - size * 0.78;
  const waistY = tipY - size * 0.34;
  const halfTop = size * 0.34;
  const halfShoulder = size * 0.62;
  const halfWaist = size * 0.16;
  const hitPath = new Path2D();
  hitPath.moveTo(tipX, tipY + 5);
  hitPath.lineTo(tipX + halfShoulder + 8, shoulderY - 3);
  hitPath.lineTo(tipX + halfTop + 6, topY - 5);
  hitPath.lineTo(tipX - halfTop - 6, topY - 5);
  hitPath.lineTo(tipX - halfShoulder - 8, shoulderY - 3);
  hitPath.closePath();

  ctx.save();
  ctx.setLineDash([]);
  if (selected || hovered) {
    ctx.beginPath();
    ctx.arc(tipX, tipY, size * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(color, selected ? 0.28 : 0.18);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(color, selected ? 0.88 : 0.58);
    ctx.lineWidth = selected ? 2 : 1.4;
    ctx.stroke();
  }

  const spikePath = new Path2D();
  spikePath.moveTo(tipX, tipY);
  spikePath.lineTo(tipX + halfWaist, waistY);
  spikePath.lineTo(tipX + halfShoulder, shoulderY);
  spikePath.lineTo(tipX + halfTop, topY);
  spikePath.lineTo(tipX, topY - size * 0.38);
  spikePath.lineTo(tipX - halfTop, topY);
  spikePath.lineTo(tipX - halfShoulder, shoulderY);
  spikePath.lineTo(tipX - halfWaist, waistY);
  spikePath.closePath();

  ctx.fillStyle = hexToRgba(color, selected ? 1 : 0.95);
  ctx.strokeStyle = "rgba(13, 15, 12, 0.88)";
  ctx.lineWidth = selected ? 2.2 : 1.55;
  ctx.fill(spikePath);
  ctx.stroke(spikePath);

  const shinePath = new Path2D();
  shinePath.moveTo(tipX - size * 0.16, shoulderY);
  shinePath.lineTo(tipX - size * 0.08, topY - size * 0.02);
  shinePath.lineTo(tipX + size * 0.05, topY - size * 0.16);
  ctx.strokeStyle = "rgba(255, 255, 245, 0.72)";
  ctx.lineWidth = 1.1;
  ctx.stroke(shinePath);

  ctx.beginPath();
  ctx.arc(tipX, tipY, selected ? 2.5 : 2.1, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(9, 13, 14, 0.96)";
  ctx.fill();
  ctx.restore();

  return [hitPath];
}

function drawCustomCoordinateLabel(ctx, item, width, height, force = false) {
  if (!force && state.view.zoom < 4.5) return;
  const point = customItemLabelPoint(item);
  if (!point) return;
  const p = project(point.lon, point.lat, width, height);
  if (p.visible === false || p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) return;
  const text = item.name || "自定义坐标";
  ctx.save();
  ctx.setLineDash([]);
  ctx.font = "12px Segoe UI, Arial";
  const metrics = ctx.measureText(text);
  const x = p.x + 10;
  const y = p.y - 10;
  ctx.fillStyle = "rgba(9, 15, 16, 0.82)";
  ctx.strokeStyle = hexToRgba(item.color || CUSTOM_COORDINATE_COLOR, 0.9);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x - 6, y - 15, metrics.width + 12, 20, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fff7c7";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function restrictionRenderKey(item) {
  if (item?.renderKey) return item.renderKey;
  if (!item?.geometry) return "";
  const source = isHydropacItem(item) ? "hydropac" : "notam";
  return `${source}:${geometryRenderKey(item.geometry)}`;
}

function geometryRenderKey(geometry) {
  if (!geometry?.type || !geometry.coordinates) return "";
  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const canonicalRing = (ring) => {
      const points = removeClosingVertex(ring).map(([lon, lat]) => JSON.stringify(compactGeometryCoordinates([normalizeLon(lon), lat])));
      if (!points.length) return "";
      const rotations = (values) => {
        const smallest = values.reduce((a, b) => a < b ? a : b);
        return values.flatMap((value, index) => value === smallest ? [values.slice(index).concat(values.slice(0, index)).join(";")] : []).sort()[0];
      };
      return [rotations(points), rotations([...points].reverse())].sort()[0];
    };
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return `area:${polygons.map((rings) => [canonicalRing(rings[0] || []), ...rings.slice(1).map(canonicalRing).sort()].join("/")).sort().join("|")}`;
  }
  return `${geometry.type}:${JSON.stringify(compactGeometryCoordinates(geometry.coordinates))}`;
}

function compactGeometryCoordinates(value) {
  if (Array.isArray(value)) return value.map(compactGeometryCoordinates);
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 1e6) / 1e6 : value;
}

function geometryHitArea(geometry) {
  const rings = geometryVertexRings(geometry);
  let total = 0;
  for (const ring of rings) {
    const clean = removeClosingVertex(ring);
    if (clean.length < 3) continue;
    const unwrapped = [];
    let previousLon = normalizeLon(clean[0][0]);
    for (let index = 0; index < clean.length; index += 1) {
      const [rawLon, lat] = clean[index];
      const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
      previousLon = lon;
      unwrapped.push([lon, lat]);
    }
    total += Math.abs(planarRingArea(unwrapped));
  }
  if (total > 0) return total;
  const bounds = geometryBounds(geometry);
  if (!bounds) return Number.POSITIVE_INFINITY;
  return Math.max(1e-9, Math.abs(bounds.maxLon - bounds.minLon) * Math.abs(bounds.maxLat - bounds.minLat));
}

function planarRingArea(points) {
  if (!points?.length) return 0;
  const meanLat = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  const lonScale = Math.max(0.05, Math.cos(toRad(meanLat)));
  const originLon = points[0][0];
  const originLat = points[0][1];
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    const ax = (points[index][0] - originLon) * lonScale;
    const ay = points[index][1] - originLat;
    const bx = (points[next][0] - originLon) * lonScale;
    const by = points[next][1] - originLat;
    area += ax * by - bx * ay;
  }
  return area / 2;
}

function drawTrajectories(ctx, width, height) {
  const startedAt = performance.now();
  const ballisticLabels = [];
  const ballisticObstaclePaths = [];
  if (els.canvas) {
    delete els.canvas.dataset.ballisticPoweredPathMode;
    delete els.canvas.dataset.ballisticPoweredControlPoints;
    delete els.canvas.dataset.ballisticPoweredMaxAltitudeKm;
    delete els.canvas.dataset.ballisticPoweredPathModel;
    els.canvas.dataset.groundTrackSelectedSources = "";
    els.canvas.dataset.groundTrackManualDrawn = "0";
    els.canvas.dataset.groundTrackStageDrawn = "0";
    els.canvas.dataset.groundTrackStageSourceIds = "";
  }
  for (const track of state.trajectoryTracks) {
    drawTrajectoryTrack(ctx, track, width, height, ballisticLabels, ballisticObstaclePaths);
  }
  if (ballisticLabels.length) drawBallisticInfoLabels(ctx, ballisticLabels, ballisticObstaclePaths, width, height);
  if (els.canvas) {
    els.canvas.dataset.trajectoryDrawMs = (performance.now() - startedAt).toFixed(1);
    els.canvas.dataset.trajectoryLabelCount = String(ballisticLabels.length);
  }
}

function drawTrajectoryTrack(ctx, track, width, height, ballisticLabels = [], ballisticObstaclePaths = []) {
  ensureTrajectoryBallistic(track);
  const selected = selectedTrajectoryItems(track);
  const canDrawIndependentPoweredPath = track.ballistic.showPoweredPath === true &&
    Number.isFinite(track.ballistic.poweredStartLat) &&
    Number.isFinite(track.ballistic.poweredStartLon) &&
    track.ballistic.stages.some((stage) => Boolean(resolveBallisticBurnout(stage, selected)));
  if (!selected.length && !canDrawIndependentPoweredPath) return;
  const geometry = selected.length
    ? cachedTrajectoryGeometry(track, selected)
    : { samples: [], normalized: [], path: null };
  const { samples, normalized } = geometry;
  const projected = selected.length ? cachedTrajectoryProjection(track, geometry, width, height) : [];
  const lineWidth = track.lineWidth || DEFAULT_TRAJECTORY_LINE_WIDTH;
  const groundTrackSources = new Set(track.groundTrackSources || []);
  const groundTrackGlow = finiteOrClamp(track.groundTrackGlow, 10, 0, 30);
  if (els.canvas && track.id === state.activeTrajectoryId) {
    els.canvas.dataset.groundTrackSelectedSources = [...groundTrackSources].join(",");
    els.canvas.dataset.groundTrackColor = track.color;
    els.canvas.dataset.groundTrackWidth = String(lineWidth);
    els.canvas.dataset.groundTrackGlow = String(groundTrackGlow);
  }

  ctx.save();
  if (selected.length && track.showGroundTrack !== false && groundTrackSources.has("manual")) {
    ctx.setLineDash(trajectoryDashPattern(track, lineWidth));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = hexToRgba(track.color, 0.86);
    ctx.shadowBlur = groundTrackGlow;
    ctx.lineWidth = track.id === state.activeTrajectoryId ? lineWidth : Math.max(1.5, lineWidth * 0.78);
    ctx.strokeStyle = hexToRgba(track.color, track.id === state.activeTrajectoryId ? 0.98 : 0.82);

    if (projected.length >= 2 && projectedIntersectsViewport(projected, width, height)) {
      if (els.canvas && track.id === state.activeTrajectoryId) els.canvas.dataset.groundTrackManualDrawn = "1";
      ballisticObstaclePaths.push(projected);
      strokeProjectedPolyline(ctx, projected);
      const metricParts = [];
      if (state.trajectoryLengthLabels) metricParts.push(formatKm(trajectoryDisplayLengthKm(track, selected, normalized)));
      if (state.trajectoryInclinationLabels) metricParts.push(formatTrajectoryInclination(trajectoryInclinationDeg(normalized)));
      if (metricParts.length) {
        const labelPoint = trajectoryLabelPoint(projected, width, height);
        drawTrajectoryLengthLabel(ctx, labelPoint, metricParts.join(" · "), track.color, width, height);
      }
    }
  }
  drawBallisticOverlays(ctx, track, selected, samples, width, height, lineWidth, ballisticLabels, ballisticObstaclePaths);
  ctx.restore();
}

function drawBallisticOverlays(ctx, track, selected, samples, width, height, lineWidth, ballisticLabels = [], ballisticObstaclePaths = []) {
  ensureTrajectoryBallistic(track);
  const groundTrackSources = new Set(track.groundTrackSources || []);
  const stageGroundTracksRequested = track.showGroundTrack !== false && track.ballistic.stages.some((stage) =>
    groundTrackSources.has(ballisticGroundTrackSourceKey(stage.id)));
  const showPoweredPath = track.ballistic.showPoweredPath === true;
  if (!track.ballistic.enabled && !showPoweredPath && !stageGroundTracksRequested) return;
  const geometry = selected.length >= 2 && samples.length >= 2 ? cachedTrajectoryGeometry(track, selected, samples) : null;
  const path = geometry?.path || null;
  if (showPoweredPath) {
    drawBallisticPoweredPath(ctx, track, selected, width, height, ballisticObstaclePaths);
  }
  if (!track.ballistic.enabled && !stageGroundTracksRequested) {
    syncBallisticPerformanceDataset();
    return;
  }

  for (const [stageIndex, stage] of track.ballistic.stages.entries()) {
    const segment = path?.totalKm >= 1 ? buildBallisticStageSegment(stage, selected, path, stageIndex, geometry?.signature) : null;
    if (segment) {
      if (track.showGroundTrack !== false && groundTrackSources.has(ballisticGroundTrackSourceKey(stage.id))) {
        drawBallisticSubpointTrack(ctx, track, segment, width, height, lineWidth, ballisticObstaclePaths);
      }
      if (track.ballistic.enabled) {
        drawBallisticStageSegment(
          ctx,
          segment,
          width,
          height,
          lineWidth,
          track.ballistic.showLabels,
          track.ballistic.showGroundRange,
          ballisticLabels,
          ballisticObstaclePaths,
        );
      }
    } else if (track.ballistic.enabled) {
      drawStandaloneBallisticBurnout(ctx, stage, selected, width, height);
    }
  }
  syncBallisticPerformanceDataset();
}

function drawBallisticPoweredPath(ctx, track, selected, width, height, obstaclePaths = []) {
  if (!Number.isFinite(track.ballistic.poweredStartLat) || !Number.isFinite(track.ballistic.poweredStartLon)) return;
  const poweredGeometry = cachedBallisticPoweredGeometry(track, selected);
  const {
    controlPoints,
    samples,
    verticalLaunch,
    terminalStageId,
    terminalFlightPathAngleDeg,
    terminalHeadingDeg,
    measuredTerminalFlightPathAngleDeg,
    terminalSampleStepGroundM,
    terminalSampleStepAltitudeM,
  } = poweredGeometry;
  if (controlPoints.length < 2) return;
  const globeMode = isGlobeLayer();
  const projected = globeMode
    ? samples.map((sample) => globeProjectAltitude(sample.lon, sample.lat, ballisticRenderAltitudeKm(sample.altitudeM / 1000), width, height))
    : projectUnwrappedPolyline(samples, width, height);
  if (els.canvas) {
    els.canvas.dataset.ballisticPoweredPathMode = globeMode ? "spatial-3d" : "ground-projection";
    els.canvas.dataset.ballisticPoweredControlPoints = String(controlPoints.length);
    els.canvas.dataset.ballisticPoweredMaxAltitudeKm = String(Math.max(...controlPoints.map((point) => point.altitudeM)) / 1000);
    els.canvas.dataset.ballisticPoweredVerticalLaunch = String(verticalLaunch);
    els.canvas.dataset.ballisticPoweredPathModel = verticalLaunch
      ? "vertical-rise-pitch-over-spherical-minimum-curvature-terminal-constrained"
      : "spherical-minimum-curvature-terminal-constrained";
    els.canvas.dataset.ballisticPoweredTerminalStageId = terminalStageId || "";
    els.canvas.dataset.ballisticPoweredTerminalFlightPathAngleDeg = Number.isFinite(terminalFlightPathAngleDeg)
      ? Number(terminalFlightPathAngleDeg).toFixed(4)
      : "";
    els.canvas.dataset.ballisticPoweredTerminalMeasuredAngleDeg = Number.isFinite(measuredTerminalFlightPathAngleDeg)
      ? Number(measuredTerminalFlightPathAngleDeg).toFixed(4)
      : "";
    els.canvas.dataset.ballisticPoweredTerminalAngleErrorDeg = Number.isFinite(terminalFlightPathAngleDeg) && Number.isFinite(measuredTerminalFlightPathAngleDeg)
      ? Math.abs(Number(measuredTerminalFlightPathAngleDeg) - Number(terminalFlightPathAngleDeg)).toFixed(4)
      : "";
    els.canvas.dataset.ballisticPoweredTerminalHeadingDeg = Number.isFinite(terminalHeadingDeg)
      ? Number(terminalHeadingDeg).toFixed(4)
      : "";
    els.canvas.dataset.ballisticPoweredTerminalStepGroundM = Number.isFinite(terminalSampleStepGroundM)
      ? Number(terminalSampleStepGroundM).toFixed(3)
      : "";
    els.canvas.dataset.ballisticPoweredTerminalStepAltitudeM = Number.isFinite(terminalSampleStepAltitudeM)
      ? Number(terminalSampleStepAltitudeM).toFixed(3)
      : "";
    const first = samples[0];
    const second = samples[1];
    els.canvas.dataset.ballisticPoweredInitialHorizontalM = first && second
      ? String(Math.round(greatCircleDistanceKm(first, second) * 1000))
      : "0";
    els.canvas.dataset.ballisticPoweredInitialVerticalM = first && second
      ? String(Math.round(Math.max(0, second.altitudeM - first.altitudeM)))
      : "0";
  }
  if (projected.length < 2 || !projectedIntersectsViewport(projected, width, height)) return;
  const projectedControls = globeMode
    ? controlPoints.map((point) => globeProjectAltitude(point.lon, point.lat, ballisticRenderAltitudeKm(point.altitudeM / 1000), width, height))
    : projectUnwrappedPolyline(controlPoints, width, height);
  obstaclePaths.push(projected);
  const color = track.ballistic.poweredPathColor || "#ffd166";
  const poweredWidth = finiteOrClamp(track.ballistic.poweredPathWidth, 4, 1, 12);
  ctx.save();
  ctx.setLineDash([]);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = hexToRgba(color, 0.78);
  ctx.shadowBlur = 9 + poweredWidth;
  ctx.strokeStyle = "rgba(2, 6, 9, 0.72)";
  ctx.lineWidth = poweredWidth + 3;
  if (!globeMode) strokeProjectedPolyline(ctx, projected);
  ctx.shadowBlur = 5 + poweredWidth * 0.8;
  ctx.strokeStyle = hexToRgba(color, 0.98);
  ctx.lineWidth = poweredWidth;
  if (!globeMode) strokeProjectedPolyline(ctx, projected);
  for (let index = 1; index < projectedControls.length; index += 1) {
    const control = controlPoints[index];
    const separationPoint = projectedControls[index];
    const groundPoint = globeMode
      ? globeProjectAltitude(control.lon, control.lat, 0, width, height)
      : separationPoint;
    drawBallisticSeparationEvent(ctx, groundPoint, separationPoint, color);
  }
  const startPoint = projected[0];
  if (startPoint?.visible !== false) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(4, 9, 12, 0.96)";
    ctx.strokeStyle = hexToRgba(color, 1);
    ctx.lineWidth = Math.max(1, poweredWidth * 0.3);
    ctx.beginPath();
    ctx.arc(startPoint.x, startPoint.y, clamp(poweredWidth * 0.55, 2, 3.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function cachedBallisticPoweredGeometry(track, selected) {
  const stageControls = track.ballistic.stages
    .map((stage) => {
      const burnout = resolveBallisticBurnout(stage, selected);
      return burnout
        ? {
            stage,
            point: {
              lon: burnout.lon,
              lat: burnout.lat,
              altitudeM: Math.max(0, Number(stage.burnoutAltitudeKm) || 0) * 1000,
            },
          }
        : null;
    })
    .filter(Boolean);
  const terminalStage = stageControls[stageControls.length - 1]?.stage || null;
  const terminalFlightPathAngleDeg = terminalStage && Number.isFinite(Number(terminalStage.flightPathAngleDeg))
    ? Number(terminalStage.flightPathAngleDeg)
    : null;
  const terminalHeadingDeg = terminalStage && Number.isFinite(Number(terminalStage.headingDeg))
    ? Number(terminalStage.headingDeg)
    : null;
  const controlPoints = [{
    lon: track.ballistic.poweredStartLon,
    lat: track.ballistic.poweredStartLat,
    altitudeM: 0,
  }, ...stageControls.map((entry) => entry.point)];
  const verticalLaunch = track.ballistic.poweredVerticalLaunch !== false;
  const poweredOptions = {
    verticalLaunch,
    terminalFlightPathAngleDeg,
    terminalHeadingDeg,
  };
  const signature = JSON.stringify([
    verticalLaunch,
    terminalFlightPathAngleDeg,
    terminalHeadingDeg,
    controlPoints.map((point) => [
      Number(point.lon).toFixed(8),
      Number(point.lat).toFixed(8),
      Math.round(Number(point.altitudeM) || 0),
    ]),
  ]);
  const cached = poweredPathGeometryCache.get(track.ballistic);
  if (cached?.signature === signature) return cached;
  const geometry = {
    signature,
    controlPoints,
    verticalLaunch,
    terminalStageId: terminalStage?.id || "",
    terminalFlightPathAngleDeg,
    terminalHeadingDeg,
    samples: controlPoints.length >= 2 ? smoothBallisticPoweredPath(controlPoints, poweredOptions) : controlPoints,
  };
  geometry.measuredTerminalFlightPathAngleDeg = POWERED_PATH?.terminalFlightPathAngleDeg
    ? POWERED_PATH.terminalFlightPathAngleDeg(geometry.samples)
    : null;
  const terminalSample = geometry.samples[geometry.samples.length - 1];
  const previousTerminalSample = geometry.samples[geometry.samples.length - 2];
  geometry.terminalSampleStepGroundM = terminalSample && previousTerminalSample
    ? greatCircleDistanceKm(previousTerminalSample, terminalSample) * 1000
    : null;
  geometry.terminalSampleStepAltitudeM = terminalSample && previousTerminalSample
    ? terminalSample.altitudeM - previousTerminalSample.altitudeM
    : null;
  poweredPathGeometryCache.set(track.ballistic, geometry);
  return geometry;
}

function smoothBallisticPoweredPath(controlPoints, options = {}) {
  if (POWERED_PATH?.smooth) return POWERED_PATH.smooth(controlPoints, options);
  const points = [];
  for (const point of controlPoints) {
    const previous = points[points.length - 1];
    const normalized = {
      ...point,
      lon: previous ? normalizeLonNear(point.lon, previous.lon) : normalizeLon(point.lon),
      lat: clamp(point.lat, -90, 90),
      altitudeM: Math.max(0, Number(point.altitudeM) || 0),
    };
    if (
      previous &&
      greatCircleDistanceKm(previous, normalized) < 0.001 &&
      Math.abs(previous.altitudeM - normalized.altitudeM) < 1
    ) continue;
    points.push(normalized);
  }
  if (points.length < 2) return points;
  const tangents = points.map((point, index) => poweredPathTangent(points, index));
  const verticalLaunch = options.verticalLaunch !== false && points[1].altitudeM > points[0].altitudeM + 1;
  if (verticalLaunch) {
    tangents[0] = {
      lon: 0,
      lat: 0,
      altitudeM: Math.max(1, (points[1].altitudeM - points[0].altitudeM) * 0.92),
    };
  }
  const result = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index];
    const p2 = points[index + 1];
    const m1 = tangents[index];
    const m2 = tangents[index + 1];
    const distanceKm = Math.max(1, greatCircleDistanceKm(p1, p2));
    const steps = clamp(Math.ceil(distanceKm / 45), verticalLaunch && index === 0 ? 48 : 12, verticalLaunch && index === 0 ? 96 : 40);
    for (let step = index ? 1 : 0; step <= steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const interpolate = (a, b, tangentA, tangentB) =>
        (2 * t3 - 3 * t2 + 1) * a +
        (t3 - 2 * t2 + t) * tangentA +
        (-2 * t3 + 3 * t2) * b +
        (t3 - t2) * tangentB;
      const clampWithMargin = (value, a, b, ratio = 0.12) => {
        const span = Math.abs(b - a);
        return clamp(value, Math.min(a, b) - span * ratio, Math.max(a, b) + span * ratio);
      };
      result.push({
        lon: clampWithMargin(interpolate(p1.lon, p2.lon, m1.lon, m2.lon), p1.lon, p2.lon),
        lat: clamp(clampWithMargin(interpolate(p1.lat, p2.lat, m1.lat, m2.lat), p1.lat, p2.lat), -90, 90),
        altitudeM: Math.max(0, clamp(
          interpolate(p1.altitudeM, p2.altitudeM, m1.altitudeM, m2.altitudeM),
          Math.min(p1.altitudeM, p2.altitudeM) - Math.abs(p2.altitudeM - p1.altitudeM) * 0.08,
          Math.max(p1.altitudeM, p2.altitudeM) + Math.abs(p2.altitudeM - p1.altitudeM) * 0.08,
        )),
      });
    }
  }
  return result;
}

function poweredPathTangent(points, index) {
  const point = points[index];
  const previous = points[Math.max(0, index - 1)];
  const next = points[Math.min(points.length - 1, index + 1)];
  const endpointScale = index === 0 || index === points.length - 1 ? 0.72 : 0.5;
  let doglegScale = 1;
  if (index > 0 && index < points.length - 1) {
    const latScale = Math.max(0.08, Math.cos(toRad(point.lat)));
    const incoming = {
      x: (point.lon - previous.lon) * latScale,
      y: point.lat - previous.lat,
    };
    const outgoing = {
      x: (next.lon - point.lon) * latScale,
      y: next.lat - point.lat,
    };
    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    if (incomingLength > 1e-9 && outgoingLength > 1e-9) {
      const dot = clamp((incoming.x * outgoing.x + incoming.y * outgoing.y) / (incomingLength * outgoingLength), -1, 1);
      const turnDeg = Math.acos(dot) * 180 / Math.PI;
      doglegScale = turnDeg <= 18 ? 1 : clamp(1 - (turnDeg - 18) / 125, 0.14, 1);
    }
  }
  const scale = endpointScale * doglegScale;
  return {
    lon: (next.lon - previous.lon) * scale,
    lat: (next.lat - previous.lat) * scale,
    altitudeM: (next.altitudeM - previous.altitudeM) * scale,
  };
}

function drawBallisticSubpointTrack(ctx, track, segment, width, height, lineWidth, obstaclePaths = []) {
  const physics = segment?.physics;
  if (!physics?.valid || physics.samples.length < 2) return;
  const samples = ballisticDisplaySamples(physics.samples);
  const projected = cachedBallisticGroundProjection(physics, samples, width, height);
  if (projected.length < 2 || !projectedIntersectsViewport(projected, width, height)) return;
  obstaclePaths.push(projected);
  const color = track.color || "#ffe08a";
  const glow = finiteOrClamp(track.groundTrackGlow, 10, 0, 30);
  ctx.save();
  ctx.setLineDash(trajectoryDashPattern(track, lineWidth));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = hexToRgba(color, 0.86);
  ctx.shadowBlur = glow;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = hexToRgba(color, 0.98);
  strokeProjectedPolyline(ctx, projected);
  if (els.canvas && track.id === state.activeTrajectoryId) {
    els.canvas.dataset.groundTrackStageDrawn = String((Number(els.canvas.dataset.groundTrackStageDrawn) || 0) + 1);
    const drawnSources = new Set(String(els.canvas.dataset.groundTrackStageSourceIds || "").split(",").filter(Boolean));
    drawnSources.add(String(segment.stage.id));
    els.canvas.dataset.groundTrackStageSourceIds = [...drawnSources].join(",");
  }
  if (state.trajectoryLengthLabels) {
    const labelPoint = trajectoryLabelPoint(projected.filter((point) => point.visible !== false), width, height);
    drawTrajectoryLengthLabel(ctx, labelPoint, `${segment.stage.name} ${formatKm(physics.groundRangeM / 1000)}`, color, width, height);
  }
  ctx.restore();
}

function drawPoweredStagePhases(ctx, track, selected, path, width, height, lineWidth) {
  const staged = track.ballistic.stages
    .map((stage) => {
      const burnout = resolveBallisticBurnout(stage, selected);
      const location = burnout ? nearestTrajectoryPathLocation(path, burnout) : null;
      return burnout && location && location.crossTrackKm <= Math.max(20, path.totalKm * 0.015)
        ? { stage, burnout, location }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.location.distanceKm - b.location.distanceKm);
  let phaseStartKm = 0;
  let previousColor = track.color || staged[0]?.stage?.color || "#ff5b61";
  for (const item of staged) {
    const phaseEndKm = clamp(item.location.distanceKm, phaseStartKm, path.totalKm);
    const phasePoints = trajectoryPathSlice(path, phaseStartKm, phaseEndKm);
    const normalized = normalizeTrajectoryForDrawing(phasePoints);
    const projected = projectUnwrappedPolyline(normalized, width, height);
    if (projected.length >= 2 && projectedIntersectsViewport(projected, width, height)) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = hexToRgba(item.stage.color, 0.74);
      ctx.shadowBlur = 8;
      ctx.lineWidth = Math.max(2.5, lineWidth * 1.18);
      const visiblePoints = projected.filter((point) => point.visible !== false);
      ctx.strokeStyle = segmentColorGradient(
        ctx,
        visiblePoints[0],
        visiblePoints[visiblePoints.length - 1],
        hexToRgba(previousColor, 0.9),
        hexToRgba(item.stage.color, 0.9),
      );
      strokeProjectedPolyline(ctx, projected);
      ctx.restore();
    }
    phaseStartKm = phaseEndKm;
    previousColor = item.stage.color;
  }
}

function trajectoryPathSlice(path, startKm, endKm) {
  if (!path?.points?.length) return [];
  const start = clamp(startKm, 0, path.totalKm);
  const end = clamp(endKm, start, path.totalKm);
  const startPoint = trajectoryPathPointAtDistance(path, start);
  if (!startPoint) return [];
  const result = [startPoint];
  for (let index = 1; index < path.points.length - 1; index += 1) {
    if (path.cumulative[index] > start && path.cumulative[index] < end) result.push(path.points[index]);
  }
  const endPoint = trajectoryPathPointAtDistance(path, end);
  if (endPoint && (!result.length || greatCircleDistanceKm(result[result.length - 1], endPoint) > 0.001)) result.push(endPoint);
  return result.filter(Boolean);
}

function trajectoryPathPointAtDistance(path, distanceKm) {
  if (!path?.points?.length) return null;
  const distance = clamp(distanceKm, 0, path.totalKm);
  let index = 0;
  while (index < path.cumulative.length - 2 && path.cumulative[index + 1] < distance) index += 1;
  const segmentKm = path.cumulative[index + 1] - path.cumulative[index];
  const fraction = segmentKm > 1e-9 ? (distance - path.cumulative[index]) / segmentKm : 0;
  return interpolateGreatCircle(path.points[index], path.points[index + 1], clamp(fraction, 0, 1));
}

function drawStandaloneBallisticBurnout(ctx, stage, selected, width, height) {
  const burnout = resolveBallisticBurnout(stage, selected);
  if (!burnout) return;
  const point = isGlobeLayer()
    ? globeProjectAltitude(burnout.lon, burnout.lat, ballisticRenderAltitudeKm(stage.burnoutAltitudeKm), width, height)
    : project(burnout.lon, burnout.lat, width, height);
  const groundPoint = isGlobeLayer()
    ? globeProjectAltitude(burnout.lon, burnout.lat, 0, width, height)
    : point;
  drawBallisticSeparationEvent(ctx, groundPoint, point, stage.color || "#ff5b61");
}

function buildTrajectoryPath(samples) {
  const points = (samples || [])
    .map((point) => ({ lon: normalizeLon(point.lon), lat: clamp(point.lat, -85, 85) }))
    .filter((point) => Number.isFinite(point.lon) && Number.isFinite(point.lat));
  if (points.length < 2) return null;
  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + greatCircleDistanceKm(points[index - 1], points[index]));
  }
  return { points, cumulative, totalKm: cumulative[cumulative.length - 1] || 0 };
}

function trajectoryGeometrySignature(track, selected) {
  const controls = Object.entries(track.curveControls || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, Number(value?.lon).toFixed(7), Number(value?.lat).toFixed(7)]);
  return JSON.stringify([
    Boolean(track.geodesic),
    selected.map(({ point, target }) => [point.id, Number(target.lon).toFixed(7), Number(target.lat).toFixed(7)]),
    controls,
  ]);
}

function cachedTrajectoryGeometry(track, selected, suppliedSamples = null) {
  const signature = trajectoryGeometrySignature(track, selected);
  const cached = trajectoryGeometryCache.get(track);
  if (cached?.signature === signature) return cached;
  const samples = suppliedSamples || buildTrajectorySamples(selected, track);
  const geometry = {
    signature,
    samples,
    normalized: normalizeTrajectoryForDrawing(samples),
    path: buildTrajectoryPath(samples),
  };
  trajectoryGeometryCache.set(track, geometry);
  return geometry;
}

function projectionViewSignature(width, height, quality = "full") {
  return JSON.stringify([
    isGlobeLayer() ? "earth" : "flat",
    Math.round(width),
    Math.round(height),
    Number(state.view.lon).toFixed(7),
    Number(state.view.lat).toFixed(7),
    Number(state.view.zoom).toFixed(6),
    Number(state.view.globeTilt || 0).toFixed(5),
    Number(state.view.globeBearing || 0).toFixed(5),
    quality,
  ]);
}

function cachedTrajectoryProjection(track, geometry, width, height) {
  const viewKey = projectionViewSignature(width, height);
  const cached = trajectoryProjectionCache.get(track);
  if (cached?.geometrySignature === geometry.signature && cached.viewKey === viewKey) return cached.projected;
  const projected = projectUnwrappedPolyline(geometry.normalized, width, height);
  trajectoryProjectionCache.set(track, { geometrySignature: geometry.signature, viewKey, projected });
  return projected;
}

function nearestTrajectoryPathLocation(path, target) {
  if (!path?.points?.length || path.points.length < 2 || !target) return null;
  let best = null;
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const start = path.points[index];
    const end = path.points[index + 1];
    const meanLat = toRad((start.lat + end.lat + target.lat) / 3);
    const lonScale = Math.max(0.02, Math.cos(meanLat));
    const endLon = normalizeLonNear(end.lon, start.lon);
    const targetLon = normalizeLonNear(target.lon, start.lon);
    const vx = (endLon - start.lon) * lonScale;
    const vy = end.lat - start.lat;
    const wx = (targetLon - start.lon) * lonScale;
    const wy = target.lat - start.lat;
    const denominator = vx * vx + vy * vy;
    const t = denominator > 1e-12 ? clamp((wx * vx + wy * vy) / denominator, 0, 1) : 0;
    const point = interpolateGreatCircle(start, end, t);
    const crossTrackKm = greatCircleDistanceKm(point, target);
    if (!best || crossTrackKm < best.crossTrackKm) {
      const segmentKm = path.cumulative[index + 1] - path.cumulative[index];
      const distanceKm = path.cumulative[index] + segmentKm * t;
      best = {
        lon: point.lon,
        lat: point.lat,
        distanceKm,
        fraction: path.totalKm > 0 ? clamp(distanceKm / path.totalKm, 0, 1) : 0,
        crossTrackKm,
        segmentIndex: index,
        segmentFraction: t,
      };
    }
  }
  return best;
}

function snapBallisticSeparationToScreen(track, x, y, width, height) {
  const selected = selectedTrajectoryItems(track);
  if (selected.length < 2) return null;
  const geometry = cachedTrajectoryGeometry(track, selected);
  const path = geometry.path;
  if (!path) return null;
  const normalized = geometry.normalized;
  const projected = cachedTrajectoryProjection(track, geometry, width, height);
  let best = null;
  for (let index = 0; index < projected.length - 1; index += 1) {
    const start = projected[index];
    const end = projected[index + 1];
    if (start.visible === false || end.visible === false) continue;
    const vx = end.x - start.x;
    const vy = end.y - start.y;
    const denominator = vx * vx + vy * vy;
    const t = denominator > 1e-9 ? clamp(((x - start.x) * vx + (y - start.y) * vy) / denominator, 0, 1) : 0;
    const px = start.x + vx * t;
    const py = start.y + vy * t;
    const pixelDistance = Math.hypot(x - px, y - py);
    if (!best || pixelDistance < best.pixelDistance) {
      const point = interpolateGreatCircle(path.points[index], path.points[index + 1], t);
      const segmentKm = path.cumulative[index + 1] - path.cumulative[index];
      const distanceKm = path.cumulative[index] + segmentKm * t;
      best = {
        lon: point.lon,
        lat: point.lat,
        distanceKm,
        fraction: path.totalKm > 0 ? clamp(distanceKm / path.totalKm, 0, 1) : 0,
        pixelDistance,
      };
    }
  }
  return best;
}

function buildBallisticStageSegment(stage, selected, path, stageIndex = 0, pathSignature = "") {
  if (!BALLISTIC_PHYSICS || !stage || !path || selected.length < 2) return null;
  const existing = ballisticStageSegmentCache.get(stage);
  if (state.trajectoryDrag && existing?.segment) {
    ballisticPerformanceStats.segmentHits += 1;
    if (els.canvas) els.canvas.dataset.ballisticInteractiveReuse = "true";
    return existing.segment;
  }
  if (els.canvas) els.canvas.dataset.ballisticInteractiveReuse = "false";
  const resolvedBurnout = resolveBallisticBurnout(stage, selected);
  if (!resolvedBurnout) return null;
  const signature = JSON.stringify([
    pathSignature || path.points.map((point) => [Number(point.lon).toFixed(6), Number(point.lat).toFixed(6)]),
    stageIndex,
    Number(resolvedBurnout.lon).toFixed(7),
    Number(resolvedBurnout.lat).toFixed(7),
    stage.positionMode,
    stage.headingMode,
    Number(stage.manualHeadingDeg).toFixed(4),
    Number(stage.headingOffsetDeg).toFixed(4),
    Number(stage.burnoutAltitudeKm).toFixed(4),
    Number(stage.flightPathAngleDeg).toFixed(4),
    Number(stage.initialSpeedMps).toFixed(3),
    Boolean(stage.dragEnabled),
    Number(stage.ballisticCoefficientKgM2).toFixed(3),
    Number(stage.noseRadiusM).toFixed(4),
    Number(stage.liftToDragRatio).toFixed(4),
    Number(stage.bankAngleDeg).toFixed(3),
    stage.atmosphereModel,
    stage.atmosphereEpochUtc,
    Number(stage.f107Daily),
    Number(stage.f107Average),
    Number(stage.ap),
    Number(stage.maxTimeSec),
  ]);
  const cached = existing;
  if (cached?.signature === signature && cached.physicsRevision === ballisticPhysicsRevision) {
    ballisticPerformanceStats.segmentHits += 1;
    return cached.segment;
  }
  const burnout = { lon: resolvedBurnout.lon, lat: clamp(resolvedBurnout.lat, -89.999999, 89.999999) };
  const pathLocation = nearestTrajectoryPathLocation(path, burnout);
  const baseHeadingDeg = trajectoryHeadingAtPoint(path, burnout);
  const headingDeg = stage.headingMode === "manual"
    ? normalizeBearingDeg(stage.manualHeadingDeg)
    : normalizeBearingDeg(baseHeadingDeg + stage.headingOffsetDeg);
  if (!Number.isFinite(headingDeg) || (stage.headingMode !== "manual" && !Number.isFinite(baseHeadingDeg))) return null;
  const options = {
    startLatDeg: burnout.lat,
    startLonDeg: burnout.lon,
    startAltitudeM: stage.burnoutAltitudeKm * 1000,
    headingDeg,
    flightPathAngleDeg: stage.flightPathAngleDeg,
    initialSpeedMps: stage.initialSpeedMps,
    dragEnabled: stage.dragEnabled,
    ballisticCoefficientKgM2: stage.ballisticCoefficientKgM2,
    noseRadiusM: stage.noseRadiusM,
    liftToDragRatio: stage.liftToDragRatio,
    bankAngleDeg: stage.bankAngleDeg,
    atmosphereModel: stage.atmosphereModel,
    atmosphereEpochUtc: stage.atmosphereEpochUtc,
    f107Daily: stage.f107Daily,
    f107Average: stage.f107Average,
    ap: stage.ap,
    maxTimeSec: stage.maxTimeSec,
    outputStepSec: Math.min(60, Math.max(4, stage.maxTimeSec / 20000)),
  };
  const physics = cachedBallisticPropagation(options);
  const segment = {
    type: "stage",
    stage,
    burnout,
    burnoutLabel: resolvedBurnout.label || "独立分离点",
    pathLocation,
    stageIndex,
    baseHeadingDeg,
    headingDeg,
    options,
    physics,
  };
  ballisticPerformanceStats.segmentBuilds += 1;
  ballisticStageSegmentCache.set(stage, { signature, physicsRevision: ballisticPhysicsRevision, segment });
  return segment;
}

function trajectoryHeadingAtPoint(path, target) {
  if (!path?.points?.length || path.points.length < 2) return NaN;
  let nearestIndex = 0;
  let nearestDistance = Infinity;
  for (let index = 0; index < path.points.length; index += 1) {
    const distance = greatCircleDistanceKm(path.points[index], target);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  let previousIndex = Math.max(0, nearestIndex - 2);
  let nextIndex = Math.min(path.points.length - 1, nearestIndex + 2);
  if (previousIndex === nextIndex) return NaN;
  if (greatCircleDistanceKm(path.points[previousIndex], path.points[nextIndex]) < 0.01) {
    previousIndex = Math.max(0, nearestIndex - 8);
    nextIndex = Math.min(path.points.length - 1, nearestIndex + 8);
  }
  const inverse = vincentyInverse(path.points[previousIndex], path.points[nextIndex]);
  return inverse?.initialBearingDeg ?? NaN;
}

function ballisticPropagationCacheKey(options) {
  return JSON.stringify([
    options.startLatDeg.toFixed(7),
    options.startLonDeg.toFixed(7),
    options.startAltitudeM.toFixed(1),
    options.headingDeg.toFixed(4),
    options.flightPathAngleDeg.toFixed(4),
    options.initialSpeedMps.toFixed(2),
    options.dragEnabled,
    options.ballisticCoefficientKgM2.toFixed(2),
    options.noseRadiusM.toFixed(3),
    options.liftToDragRatio.toFixed(4),
    options.bankAngleDeg.toFixed(3),
    options.maxTimeSec.toFixed(1),
    options.atmosphereModel,
    options.atmosphereEpochUtc,
    options.f107Daily,
    options.f107Average,
    options.ap,
    options.outputStepSec,
  ]);
}

function cachedBallisticPropagation(options) {
  const key = ballisticPropagationCacheKey(options);
  if (options.atmosphereModel !== "nrlmsise00" || !options.dragEnabled) {
    if (ballisticSimulationCache.has(key)) {
      ballisticPerformanceStats.propagationHits += 1;
      return ballisticSimulationCache.get(key);
    }
    ballisticPerformanceStats.propagationRuns += 1;
    const result = BALLISTIC_PHYSICS.propagateStage({ ...options, atmosphereModel: "standard1976" });
    ballisticSimulationCache.set(key, result);
    if (ballisticSimulationCache.size > 64) ballisticSimulationCache.delete(ballisticSimulationCache.keys().next().value);
    return result;
  }
  const cached = ballisticEmpiricalSimulationCache.get(key);
  if (cached?.status === "ready") {
    ballisticPerformanceStats.propagationHits += 1;
    return cached.result;
  }
  if (cached?.status === "pending") {
    ballisticPerformanceStats.propagationHits += 1;
    return cached.displayResult;
  }
  if (cached?.status === "error") {
    ballisticPerformanceStats.propagationHits += 1;
    return cached.displayResult;
  }
  ballisticPerformanceStats.propagationRuns += 1;
  const fallback = BALLISTIC_PHYSICS.propagateStage({ ...options, atmosphereModel: "standard1976" });
  const entry = {
    status: "pending",
    fallback,
    displayResult: { ...fallback, empiricalStatus: "pending" },
    result: null,
    error: "",
  };
  ballisticEmpiricalSimulationCache.set(key, entry);
  if (ballisticEmpiricalSimulationCache.size > 64) ballisticEmpiricalSimulationCache.delete(ballisticEmpiricalSimulationCache.keys().next().value);
  requestNrlmsisePropagation(options, key, entry);
  return { ...fallback, empiricalStatus: "pending" };
}

function requestNrlmsisePropagation(options, key, entry) {
  ballisticPerformanceStats.empiricalRequests += 1;
  ballisticEmpiricalRequestQueue.push({ options, key, entry });
  if (ballisticEmpiricalRequestFlushTimer === null) {
    ballisticEmpiricalRequestFlushTimer = window.setTimeout(flushNrlmsisePropagationQueue, 0);
  }
}

function ballisticPropagationRequestPayload(options) {
  return {
    options: {
      startLatDeg: options.startLatDeg,
      startLonDeg: options.startLonDeg,
      startAltitudeM: options.startAltitudeM,
      headingDeg: options.headingDeg,
      flightPathAngleDeg: options.flightPathAngleDeg,
      initialSpeedMps: options.initialSpeedMps,
      dragEnabled: options.dragEnabled,
      ballisticCoefficientKgM2: options.ballisticCoefficientKgM2,
      noseRadiusM: options.noseRadiusM,
      liftToDragRatio: options.liftToDragRatio,
      bankAngleDeg: options.bankAngleDeg,
      maxTimeSec: options.maxTimeSec,
      outputStepSec: options.outputStepSec,
      minimumStepSec: options.minimumStepSec,
      maximumStepSec: options.maximumStepSec,
      positionToleranceM: options.positionToleranceM,
      velocityToleranceMps: options.velocityToleranceMps,
      relativeTolerance: options.relativeTolerance,
    },
    environment: {
      epochUtc: options.atmosphereEpochUtc,
      f107Daily: options.f107Daily,
      f107Average: options.f107Average,
      ap: options.ap,
    },
  };
}

async function flushNrlmsisePropagationQueue() {
  ballisticEmpiricalRequestFlushTimer = null;
  const batch = ballisticEmpiricalRequestQueue.splice(0, 10);
  if (!batch.length) return;
  try {
    const response = await fetch("/api/ballistics/propagate-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: batch.map(({ options }) => ballisticPropagationRequestPayload(options)) }),
    });
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload?.results)) throw new Error(payload?.error || `HTTP ${response.status}`);
    for (let index = 0; index < batch.length; index += 1) {
      const { entry } = batch[index];
      const item = payload.results[index];
      if (!item?.ok || !item.payload?.result?.valid) {
        throwBallisticRequestEntryError(entry, item?.payload?.result?.message || item?.error || "NRLMSISE-00 传播失败");
        continue;
      }
      entry.status = "ready";
      entry.result = { ...item.payload.result, empiricalStatus: "ready", environment: item.payload.environment };
      entry.displayResult = entry.result;
      entry.error = "";
    }
  } catch (error) {
    for (const { entry } of batch) throwBallisticRequestEntryError(entry, error instanceof Error ? error.message : String(error));
  }
  if (batch.some(({ key, entry }) => ballisticEmpiricalSimulationCache.get(key) === entry)) {
    ballisticPhysicsRevision += 1;
    scheduleDraw();
    requestBallisticAnimationDraw();
    if (!els.trajectoryPlanList.contains(document.activeElement)) renderTrajectoryPlan();
  }
  if (ballisticEmpiricalRequestQueue.length && ballisticEmpiricalRequestFlushTimer === null) {
    ballisticEmpiricalRequestFlushTimer = window.setTimeout(flushNrlmsisePropagationQueue, 0);
  }
}

function throwBallisticRequestEntryError(entry, message) {
  entry.status = "error";
  entry.error = String(message || "NRLMSISE-00 传播失败");
  entry.displayResult = { ...entry.fallback, empiricalStatus: "error", empiricalError: entry.error };
}

function drawBallisticStageSegment(
  ctx,
  segment,
  width,
  height,
  lineWidth,
  showLabels,
  showGroundRange = true,
  labelRequests = [],
  obstaclePaths = [],
) {
  const physics = segment.physics;
  if (!physics?.valid || physics.samples.length < 2) return;
  const displaySamples = ballisticDisplaySamples(physics.samples);
  const projected = cachedBallisticProjection(physics, displaySamples, width, height);
  if (projected.length < 2 || !projectedIntersectsViewport(projected, width, height)) return;
  const color = segment.stage.color || "#ff5b61";
  const stageLineWidth = finiteOrClamp(
    segment.stage.lineWidth,
    BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
    BALLISTIC_STAGE_LINE_WIDTH_MIN,
    BALLISTIC_STAGE_LINE_WIDTH_MAX,
  );
  const interactive = isInteractiveRender();
  const gpuGlobe = isGlobeLayer() && Boolean(globeRendererState?.trajectoryGpuLayer);
  obstaclePaths.push(projected);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (interactive) {
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, stageLineWidth * 0.82);
    ctx.strokeStyle = hexToRgba(color, 0.92);
    ctx.setLineDash([Math.max(7, stageLineWidth * 1.8), Math.max(4, stageLineWidth)]);
    if (!gpuGlobe) strokeProjectedPolyline(ctx, projected);
  } else {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 6;
    ctx.lineWidth = Math.max(1, stageLineWidth * 0.72);
    ctx.strokeStyle = hexToRgba(color, 0.42);
    ctx.setLineDash([Math.max(8, stageLineWidth * 2.2), Math.max(5, stageLineWidth * 1.3)]);
    if (!gpuGlobe) {
      strokeProjectedPolyline(ctx, projected);
      drawBallisticPhasePolyline(ctx, projected, displaySamples, color, stageLineWidth);
    }
  }

  const groundPoint = isGlobeLayer()
    ? globeProjectAltitude(segment.burnout.lon, segment.burnout.lat, 0, width, height)
    : project(segment.burnout.lon, segment.burnout.lat, width, height);
  drawBallisticSeparationEvent(ctx, groundPoint, projected[0], color);
  drawBallisticPoint(ctx, projected[projected.length - 1], color, physics.status === "impact" ? "impact" : "end");
  if (!interactive) drawBallisticEventMarkers(ctx, projected, displaySamples, physics.reentry, color);
  drawBallisticTarget(ctx, segment, projected[projected.length - 1], width, height, color);
  if (showLabels) {
    const apexIndex = ballisticSampleSummary(displaySamples).apexIndex;
    const impactLine = physics.impact
      ? `落点 ${formatDmsPair(physics.impact.lat, physics.impact.lon)} · 撞击空速 ${formatMps(physics.impact.airRelativeSpeedMps ?? physics.impact.groundRelativeSpeedMps)} · ${formatMach(physics.impact.localMach)}`
      : physics.status === "orbit" && physics.orbit
        ? `初轨根数 · ${formatOrbitSummary(physics.orbit.initialElements || physics.orbit.reference || physics.orbit)}`
        : physics.message;
    const label = [
      `${segment.stage.name} · ${physics.status === "impact" ? "无动力落地" : physics.status === "orbit" ? "已进入束缚轨道" : "传播未落地"}`,
      `分离点 ${segment.burnoutLabel}${segment.pathLocation ? ` · 主动段 ${formatKm(segment.pathLocation.distanceKm)}` : ""}`,
      `${segment.stage.headingMode === "manual" ? "手工方位角" : "继承主动段航向"} ${formatDegrees(segment.headingDeg)}`,
      `初始地速 ${formatMps(segment.stage.initialSpeedMps)} · 倾角 ${formatDegrees(segment.stage.flightPathAngleDeg)} · 分离高 ${formatKm(segment.stage.burnoutAltitudeKm)}`,
      [
        showGroundRange ? `地表航程 ${formatKm(physics.groundRangeM / 1000)}${ballisticTrackDistanceSuffix(physics)}` : "",
        `最高点 ${formatKm(physics.apogee.altitudeM / 1000)}`,
        `飞行 ${formatDurationSeconds(physics.flightTimeSec)}`,
      ].filter(Boolean).join(" · "),
      physics.reentry?.interface70Km
        ? `70 km 空速 ${formatMps(physics.reentry.interface70Km.airRelativeSpeedMps ?? physics.reentry.interface70Km.groundRelativeSpeedMps)} · 再入角 ${formatDegrees(physics.reentry.interface70Km.flightPathAngleDeg)} · ${formatMach(physics.reentry.interface70Km.localMach)}`
        : "",
      impactLine,
    ].filter(Boolean);
    const labelPoint = projected[apexIndex]?.visible === false ? trajectoryLabelPoint(projected.filter((point) => point.visible !== false), width, height) : projected[apexIndex];
    if (labelPoint && labelPoint.visible !== false) {
      labelRequests.push({
        id: `${segment.track?.id || "track"}:${segment.stage.id}`,
        point: labelPoint,
        lines: label,
        color,
      });
    }
  }
  ctx.restore();
}

function drawBallisticPhasePolyline(ctx, projected, samples, color, lineWidth) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  let run = [];
  let runStartStyle = null;
  let runEndStyle = null;
  let runBucket = "";
  const flush = () => {
    if (run.length < 2 || !runStartStyle || !runEndStyle) {
      run = [];
      return;
    }
    ctx.strokeStyle = segmentColorGradient(ctx, run[0], run[run.length - 1], runStartStyle.color, runEndStyle.color);
    ctx.lineWidth = (runStartStyle.lineWidth + runEndStyle.lineWidth) / 2;
    ctx.setLineDash(runEndStyle.dash);
    strokeProjectedPolyline(ctx, run);
    run = [];
  };
  for (let index = 0; index < projected.length; index += 1) {
    const point = projected[index];
    if (!point || point.visible === false) {
      flush();
      runBucket = "";
      continue;
    }
    const sample = samples[index];
    const style = ballisticSampleStrokeStyle(sample, color, lineWidth);
    const bucket = ballisticSampleStrokeBucket(sample);
    if (run.length && bucket !== runBucket) {
      const previousPoint = run[run.length - 1];
      flush();
      run = [previousPoint];
      runStartStyle = runEndStyle;
    }
    if (!run.length) runStartStyle = style;
    run.push(point);
    runEndStyle = style;
    runBucket = bucket;
  }
  flush();
  ctx.restore();
}

function ballisticSampleStrokeBucket(sample) {
  const heat = reentryHeatVisual(sample.convectiveHeatFluxWm2).intensity;
  const atmosphere = smoothstep(0.2, 8, Number(sample.dynamicPressurePa) || 0);
  const aerothermalWeight = atmosphere * smoothstep(0.0001, 0.2, heat);
  if (aerothermalWeight > 0.001) return `aerothermal-${Math.round(aerothermalWeight * 32)}`;
  return sample?.descending ? "descent-coast" : "powered-coast";
}

function ballisticSampleStrokeStyle(sample, color, lineWidth, alpha = 0.96) {
  const heat = reentryHeatVisual(sample?.convectiveHeatFluxWm2);
  const atmosphereWeight = smoothstep(0.2, 8, Number(sample?.dynamicPressurePa) || 0);
  const aerothermalWeight = atmosphereWeight * smoothstep(0.0001, 0.2, heat.intensity);
  if (!sample?.descending && aerothermalWeight <= 0.001) {
    return {
      color: hexToRgba(color, Math.min(alpha, 0.9)),
      lineWidth: Math.max(2.1, lineWidth * 0.86),
      dash: [Math.max(8, lineWidth * 2), Math.max(5, lineWidth * 1.2)],
    };
  }
  const displayRgb = mixRgb([103, 213, 255], reentryGlowRgb(heat.intensity), atmosphereWeight);
  return {
    color: rgbaFromRgb(displayRgb, Math.min(alpha, 0.86 + atmosphereWeight * 0.14)),
    lineWidth: Math.max(2, lineWidth * 0.78 + atmosphereWeight * (0.35 + heat.areaScale * 3.4)),
    dash: [],
  };
}

function segmentColorGradient(ctx, start, end, startColor, endColor) {
  if (!start || !end || Math.hypot(end.x - start.x, end.y - start.y) < 0.25) return endColor;
  const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
  gradient.addColorStop(0, startColor);
  gradient.addColorStop(1, endColor);
  return gradient;
}

function drawBallisticEventMarkers(ctx, projected, samples, reentry, color) {
  const apexIndex = ballisticSampleSummary(samples).apexIndex;
  const events = [
    { elapsedSec: samples[apexIndex]?.elapsedSec, color: "#f8fbff", radius: 1.6 },
    ...(reentry?.interface120KmEvents || []).map((event) => ({
      elapsedSec: event.elapsedSec,
      color: event.direction === "ascending" ? "#8cf0c9" : "#6bd7ff",
      radius: 1.45,
    })),
    ...(reentry?.interface70KmEvents || []).map((event) => ({
      elapsedSec: event.elapsedSec,
      color: event.direction === "ascending" ? "#c7f6a2" : "#f8f3a0",
      radius: 1.55,
    })),
    { elapsedSec: reentry?.peakHeating?.elapsedSec, color: "#ffb24f", radius: 1.9 },
    { elapsedSec: reentry?.peakDynamicPressure?.elapsedSec, color: "#ff5b61", radius: 1.9 },
  ];
  ctx.save();
  ctx.setLineDash([]);
  for (const event of events) {
    if (!Number.isFinite(Number(event.elapsedSec))) continue;
    const bracket = ballisticSampleBracket(samples, Number(event.elapsedSec));
    const index = bracket.fraction >= 0.5 ? bracket.upperIndex : bracket.lowerIndex;
    const point = projected[index];
    if (!point || point.visible === false) continue;
    ctx.fillStyle = event.color;
    ctx.strokeStyle = hexToRgba(color, 0.92);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(point.x, point.y, event.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawBallisticTarget(ctx, segment, impactPoint, width, height, color) {
  const target = resolveBallisticTarget(segment.stage);
  if (!target) return;
  const point = isGlobeLayer()
    ? globeProjectAltitude(target.lon, target.lat, 0, width, height)
    : project(target.lon, target.lat, width, height);
  if (!point || point.visible === false) return;
  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "rgba(255, 240, 151, 0.82)";
  ctx.lineWidth = 1.4;
  if (impactPoint && impactPoint.visible !== false) {
    ctx.beginPath();
    ctx.moveTo(impactPoint.x, impactPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = "#fff19a";
  ctx.fillStyle = "rgba(11, 16, 18, 0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(point.x - 13, point.y);
  ctx.lineTo(point.x + 13, point.y);
  ctx.moveTo(point.x, point.y - 13);
  ctx.lineTo(point.x, point.y + 13);
  ctx.stroke();
  ctx.fillStyle = "#fff8c7";
  ctx.font = "10px Segoe UI, Arial";
  ctx.fillText("目标", point.x + 12, point.y - 10);
  ctx.restore();
}

function drawBallisticSeparationEvent(ctx, groundPoint, separationPoint, color) {
  if (!separationPoint || separationPoint.visible === false) return;
  ctx.save();
  ctx.setLineDash([3, 4]);
  ctx.strokeStyle = hexToRgba(color, 0.78);
  ctx.lineWidth = 1.5;
  if (groundPoint && groundPoint.visible !== false && Math.hypot(groundPoint.x - separationPoint.x, groundPoint.y - separationPoint.y) > 2) {
    ctx.beginPath();
    ctx.moveTo(groundPoint.x, groundPoint.y);
    ctx.lineTo(separationPoint.x, separationPoint.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.translate(separationPoint.x, separationPoint.y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#fff8d7";
  ctx.strokeStyle = hexToRgba(color, 1);
  ctx.lineWidth = 1.2;
  ctx.shadowColor = hexToRgba(color, 0.88);
  ctx.shadowBlur = 4;
  ctx.fillRect(-2.25, -2.25, 4.5, 4.5);
  ctx.strokeRect(-2.25, -2.25, 4.5, 4.5);
  ctx.restore();
}

function projectBallisticSamples(samples, width, height) {
  if (isGlobeLayer()) {
    if (GLOBE_CAMERA?.projectCartesian) {
      let vectors = ballisticGlobeVectorCache.get(samples);
      if (!vectors) {
        vectors = samples.map((sample) => GLOBE_CAMERA.spherePoint(
          sample.lon,
          sample.lat,
          1 + ballisticRenderAltitudeKm((Number(sample.altitudeM) || 0) / 1000) / GLOBE_CAMERA.EARTH_RADIUS_KM,
        ));
        ballisticGlobeVectorCache.set(samples, vectors);
      }
      const params = globeParams(width, height);
      return vectors.map((vector) => GLOBE_CAMERA.projectCartesian(vector, params, true));
    }
    return samples.map((sample) => globeProjectAltitude(
      sample.lon,
      sample.lat,
      ballisticRenderAltitudeKm(sample.altitudeM / 1000),
      width,
      height,
    ));
  }
  const normalized = normalizeTrajectoryForDrawing(samples);
  return projectUnwrappedPolyline(normalized, width, height);
}

function ballisticRenderAltitudeKm(altitudeKm) {
  return Math.max(0, Number(altitudeKm) || 0) + BALLISTIC_RENDER_OFFSET_KM;
}

function ballisticDisplaySamples(samples) {
  const interacting = isInteractiveRender();
  const maxSamples = interacting ? (isGlobeLayer() ? 140 : 180) : (isGlobeLayer() ? 900 : 1200);
  if (!Array.isArray(samples) || samples.length <= maxSamples) return samples || [];
  const cacheKey = `${isGlobeLayer() ? "globe" : "flat"}:${maxSamples}`;
  let cache = ballisticDisplaySampleCache.get(samples);
  if (!cache) {
    cache = new Map();
    ballisticDisplaySampleCache.set(samples, cache);
  }
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const indexes = new Set([0, samples.length - 1]);
  const stride = Math.ceil((samples.length - 1) / (maxSamples - 6));
  for (let index = 0; index < samples.length; index += stride) indexes.add(index);
  const metrics = ["altitudeM", "convectiveHeatFluxWm2", "dynamicPressurePa", "aerodynamicLoadG", "dragLoadG"];
  const bestByMetric = new Array(metrics.length).fill(0);
  for (let index = 1; index < samples.length; index += 1) {
    for (let metricIndex = 0; metricIndex < metrics.length; metricIndex += 1) {
      const metric = metrics[metricIndex];
      const best = bestByMetric[metricIndex];
      if (Number(samples[index]?.[metric]) > Number(samples[best]?.[metric])) bestByMetric[metricIndex] = index;
    }
  }
  bestByMetric.forEach((index) => indexes.add(index));
  const sampled = [...indexes].sort((a, b) => a - b).map((index) => samples[index]);
  cache.set(cacheKey, sampled);
  return sampled;
}

function ballisticSampleSummary(samples) {
  if (!samples?.length) return { apexIndex: 0 };
  const cached = ballisticSampleSummaryCache.get(samples);
  if (cached) return cached;
  let apexIndex = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (Number(samples[index]?.altitudeM) > Number(samples[apexIndex]?.altitudeM)) apexIndex = index;
  }
  const summary = { apexIndex };
  ballisticSampleSummaryCache.set(samples, summary);
  return summary;
}

function cachedBallisticProjection(physics, samples, width, height) {
  const quality = samples === physics.samples ? "full" : `sampled-${samples.length}`;
  const viewKey = projectionViewSignature(width, height, quality);
  const cached = ballisticProjectionCache.get(physics);
  if (cached?.viewKey === viewKey) {
    ballisticPerformanceStats.projectionHits += 1;
    return cached.projected;
  }
  const projected = projectBallisticSamples(samples, width, height);
  ballisticProjectionCache.set(physics, { viewKey, projected });
  ballisticPerformanceStats.projectionBuilds += 1;
  return projected;
}

function cachedBallisticGroundProjection(physics, samples, width, height) {
  const quality = samples === physics.samples ? "full" : `sampled-${samples.length}`;
  const viewKey = projectionViewSignature(width, height, `ground-${quality}`);
  const cached = ballisticGroundProjectionCache.get(physics);
  if (cached?.viewKey === viewKey) return cached.projected;
  const projected = isGlobeLayer()
    ? samples.map((sample) => globeProjectAltitude(sample.lon, sample.lat, 0, width, height))
    : projectUnwrappedPolyline(normalizeTrajectoryForDrawing(samples), width, height);
  ballisticGroundProjectionCache.set(physics, { viewKey, projected });
  return projected;
}

function syncBallisticPerformanceDataset() {
  if (!els.canvas) return;
  els.canvas.dataset.ballisticPropagationRuns = String(ballisticPerformanceStats.propagationRuns);
  els.canvas.dataset.ballisticPropagationHits = String(ballisticPerformanceStats.propagationHits);
  els.canvas.dataset.ballisticSegmentBuilds = String(ballisticPerformanceStats.segmentBuilds);
  els.canvas.dataset.ballisticSegmentHits = String(ballisticPerformanceStats.segmentHits);
  els.canvas.dataset.ballisticProjectionBuilds = String(ballisticPerformanceStats.projectionBuilds);
  els.canvas.dataset.ballisticProjectionHits = String(ballisticPerformanceStats.projectionHits);
  els.canvas.dataset.ballisticSimulationCache = String(ballisticSimulationCache.size + ballisticEmpiricalSimulationCache.size);
}

function strokeProjectedPolyline(ctx, projected) {
  let drawing = false;
  for (const point of projected) {
    if (point.visible === false) {
      if (drawing) ctx.stroke();
      drawing = false;
      continue;
    }
    if (!drawing) {
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      drawing = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  if (drawing) ctx.stroke();
}

function drawBallisticPoint(ctx, point, color, type) {
  if (!point || point.visible === false) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = type === "impact" ? hexToRgba(color, 0.95) : "#fff8d7";
  ctx.strokeStyle = hexToRgba(color, 0.95);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(point.x, point.y, type === "impact" ? 2.4 : 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBallisticInfoLabels(ctx, requests, obstaclePaths, width, height) {
  if (!requests?.length) return;
  const bounds = ballisticLabelMapBounds(width, height);
  ctx.save();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.font = "11px Segoe UI, Arial";
  const availableWidth = Math.max(220, bounds.right - bounds.left);
  const boxWidth = Math.min(310, Math.max(218, availableWidth * (requests.length > 5 ? 0.32 : 0.42)));
  const prepared = requests.map((request, index) => {
    const lines = wrapBallisticInfoLines(ctx, request.lines, boxWidth - 18);
    return {
      ...request,
      index,
      lines,
      width: boxWidth,
      height: 12 + lines.length * 15,
    };
  });
  const obstaclePoints = sampleBallisticLabelObstacles(obstaclePaths, 520);
  const placed = [];
  for (const item of prepared) {
    const placement = chooseBallisticLabelPlacement(item, placed, obstaclePoints, bounds);
    placed.push({ ...placement, item });
  }
  if (els.canvas) {
    els.canvas.dataset.ballisticLabelLayout = "anchored-avoidance";
    els.canvas.dataset.ballisticLabelPathClearancePx = "28";
    els.canvas.dataset.ballisticLabelOverlapCount = String(countRectangleOverlaps(placed.map((placement) => ({
      x: placement.x,
      y: placement.y,
      width: placement.item.width,
      height: placement.item.height,
    }))));
  }
  for (const placement of placed) drawBallisticInfoLabel(ctx, placement.item, placement);
  ctx.restore();
}

function ballisticLabelMapBounds(width, height) {
  const canvasRect = els.canvas?.getBoundingClientRect();
  const leftRect = document.querySelector(".filters-panel")?.getBoundingClientRect();
  const rightRect = document.querySelector(".details-panel")?.getBoundingClientRect();
  const left = !state.leftPanelCollapsed && canvasRect && leftRect?.width > 80
    ? clamp(leftRect.right - canvasRect.left + 10, 8, width - 220)
    : 8;
  const right = !state.rightPanelCollapsed && canvasRect && rightRect?.width > 80
    ? clamp(rightRect.left - canvasRect.left - 10, left + 220, width - 8)
    : width - 8;
  return { left, top: 12, right, bottom: height - 12 };
}

function wrapBallisticInfoLines(ctx, lines, maxWidth) {
  const wrapped = [];
  for (const rawLine of lines || []) {
    const text = window.AppI18n?.t(rawLine || "") || String(rawLine || "");
    if (window.AppI18n?.language === "en") {
      // Translate the full sentence before wrapping so terminology keeps its context.
      const words = text.match(/[+-]?[\d,.]+(?:\s+(?:km|m\/s|s|MW\/m²|kW\/m²|W\/m²|kPa|g\/m³|G|Ma))?(?=\s|$)|\S+/g) || [];
      let line = "";
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          wrapped.push(line);
          line = word;
        } else line = candidate;
      }
      if (line) wrapped.push(line);
      continue;
    }
    const characters = Array.from(text);
    let line = "";
    for (const character of characters) {
      const candidate = line + character;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        wrapped.push(line);
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line) wrapped.push(line);
  }
  return wrapped.length ? wrapped : [""];
}

function sampleBallisticLabelObstacles(obstaclePaths, maxPoints) {
  const paths = (obstaclePaths || []).filter((path) => Array.isArray(path) && path.length);
  const totalPoints = paths.reduce((sum, path) => sum + path.length, 0);
  if (!totalPoints) return [];
  const stride = Math.max(1, Math.ceil(totalPoints / Math.max(1, maxPoints)));
  const sampled = [];
  for (const path of paths) {
    for (let index = 0; index < path.length; index += stride) {
      const point = path[index];
      if (point && point.visible !== false) sampled.push(point);
    }
    const last = path[path.length - 1];
    if (last && last.visible !== false && sampled[sampled.length - 1] !== last) sampled.push(last);
  }
  return sampled;
}

function chooseBallisticLabelPlacement(item, placed, obstaclePoints, bounds) {
  const anchor = item.point;
  const directions = [
    [1, -1], [-1, -1], [1, 1], [-1, 1],
    [1, 0], [-1, 0], [0, -1], [0, 1],
  ];
  const rotatedDirections = directions.map((_, index) => directions[(index + item.index * 3) % directions.length]);
  const candidates = [];
  for (const radius of [72, 112, 164, 226, 296]) {
    for (const [dx, dy] of rotatedDirections) {
      const rawX = anchor.x + dx * radius - (dx < 0 ? item.width : dx === 0 ? item.width / 2 : 0);
      const rawY = anchor.y + dy * radius - (dy < 0 ? item.height : dy === 0 ? item.height / 2 : 0);
      candidates.push(ballisticLabelCandidate(rawX, rawY, item, bounds));
    }
  }
  const laneStep = Math.max(42, item.height + 10);
  for (let y = bounds.top; y <= Math.max(bounds.top, bounds.bottom - item.height); y += laneStep) {
    candidates.push(ballisticLabelCandidate(bounds.left, y, item, bounds));
    candidates.push(ballisticLabelCandidate(bounds.right - item.width, y, item, bounds));
  }
  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let score = Math.hypot(candidate.x + item.width / 2 - anchor.x, candidate.y + item.height / 2 - anchor.y) * 2;
    if (pointInsideBallisticLabel(anchor, candidate, 8)) score += 1e9;
    for (const previous of placed) {
      const overlapWidth = Math.max(0, Math.min(candidate.x + item.width, previous.x + previous.item.width) - Math.max(candidate.x, previous.x));
      const overlapHeight = Math.max(0, Math.min(candidate.y + item.height, previous.y + previous.item.height) - Math.max(candidate.y, previous.y));
      const overlapArea = overlapWidth * overlapHeight;
      if (overlapArea > 0.5) score += 1e12 + overlapArea * 5000;
    }
    for (const point of obstaclePoints || []) {
      const clearance = distancePointToBallisticLabel(point, candidate);
      if (clearance < 28) score += (28 - clearance) * 360000;
    }
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function ballisticLabelCandidate(x, y, item, bounds) {
  return {
    x: clamp(x, bounds.left, Math.max(bounds.left, bounds.right - item.width)),
    y: clamp(y, bounds.top, Math.max(bounds.top, bounds.bottom - item.height)),
    width: item.width,
    height: item.height,
  };
}

function pointInsideBallisticLabel(point, placement, padding = 0) {
  return point.x >= placement.x - padding &&
    point.x <= placement.x + (placement.item?.width || placement.width || 0) + padding &&
    point.y >= placement.y - padding &&
    point.y <= placement.y + (placement.item?.height || placement.height || 0) + padding;
}

function distancePointToBallisticLabel(point, placement) {
  const width = placement.item?.width || placement.width || 0;
  const height = placement.item?.height || placement.height || 0;
  const dx = Math.max(placement.x - point.x, 0, point.x - (placement.x + width));
  const dy = Math.max(placement.y - point.y, 0, point.y - (placement.y + height));
  return Math.hypot(dx, dy);
}

function drawBallisticInfoLabel(ctx, item, placement) {
  const { point, color, lines, width: boxWidth, height: boxHeight } = item;
  const edgeX = clamp(point.x, placement.x, placement.x + boxWidth);
  const edgeY = clamp(point.y, placement.y, placement.y + boxHeight);
  const angle = Math.atan2(point.y - edgeY, point.x - edgeX);
  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = hexToRgba(color, 0.88);
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(edgeX, edgeY);
  ctx.lineTo(point.x, point.y);
  ctx.stroke();
  const arrowLength = 8;
  ctx.fillStyle = hexToRgba(color, 0.96);
  ctx.beginPath();
  ctx.moveTo(point.x, point.y);
  ctx.lineTo(point.x - Math.cos(angle - 0.48) * arrowLength, point.y - Math.sin(angle - 0.48) * arrowLength);
  ctx.lineTo(point.x - Math.cos(angle + 0.48) * arrowLength, point.y - Math.sin(angle + 0.48) * arrowLength);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(6, 10, 14, 0.92)";
  ctx.strokeStyle = hexToRgba(color, 0.95);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(placement.x, placement.y, boxWidth, boxHeight, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f6fbff";
  ctx.font = "11px Segoe UI, Arial";
  lines.forEach((line, index) => ctx.fillText(line, placement.x + 9, placement.y + 17 + index * 15, boxWidth - 18));
  ctx.restore();
}

function drawBallisticAnimationLabel(ctx, entry, sample, placement, dpr = 1, timestamp = performance.now()) {
  if (!entry || !sample || !placement) return;
  const surface = ballisticAnimationLabelSurfaceFor(entry, sample, placement.width, placement.height, dpr, timestamp);
  const edgeX = clamp(placement.anchorX, placement.x, placement.x + placement.width);
  const edgeY = clamp(placement.anchorY, placement.y, placement.y + placement.height);
  ctx.save();
  ctx.strokeStyle = hexToRgba(entry.prepared.stageColor, entry.key === state.ballisticAnimation.focusKey ? 0.9 : 0.55);
  ctx.lineWidth = entry.key === state.ballisticAnimation.focusKey ? 1.5 : 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(placement.anchorX, placement.anchorY);
  ctx.lineTo(edgeX, edgeY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.drawImage(surface.canvas, 0, 0, surface.canvas.width, surface.canvas.height, placement.x, placement.y, placement.width, placement.height);
  ctx.restore();
}

function ballisticAnimationLabelSurfaceFor(entry, sample, boxWidth, boxHeight, dpr, timestamp) {
  const color = entry.prepared.stageColor;
  const focused = entry.key === state.ballisticAnimation.focusKey;
  const rows = [
    [`高度 ${formatKm(sample.altitudeM / 1000)}`, `空速 ${formatMps(sample.airRelativeSpeedMps ?? sample.groundRelativeSpeedMps)}`],
    [`热流 ${formatHeatFlux(sample.convectiveHeatFluxWm2)}`, `过载 ${formatGLoad(sample.aerodynamicLoadG ?? sample.dragLoadG)}`],
    [reentryPhaseLabel(sample.reentryPhase), `${formatMach(sample.localMach)} · ${formatPressure(sample.dynamicPressurePa)}`],
  ];
  const elapsedLabel = `T+${formatDurationSeconds(sample.elapsedSec)}`;
  const key = `${entry.prepared.stageName}:${color}:${boxWidth}:${boxHeight}:${dpr.toFixed(2)}:${focused}`;
  const contentKey = JSON.stringify([elapsedLabel, rows]);
  const previous = ballisticAnimationLabelCaches.get(entry.key);
  if (
    previous?.physics === entry.physics &&
    previous.key === key &&
    (
      previous.contentKey === contentKey ||
      timestamp - previous.updatedAt < BALLISTIC_ANIMATION_LABEL_INTERVAL_MS
    )
  ) {
    ballisticAnimationPerformanceStats.labelHits += 1;
    return previous;
  }
  const canvas = previous?.physics === entry.physics && previous.key === key ? previous.canvas : document.createElement("canvas");
  const targetWidth = Math.max(1, Math.ceil(boxWidth * dpr));
  const targetHeight = Math.max(1, Math.ceil(boxHeight * dpr));
  if (canvas.width !== targetWidth) canvas.width = targetWidth;
  if (canvas.height !== targetHeight) canvas.height = targetHeight;
  const surfaceCtx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  surfaceCtx.setTransform(1, 0, 0, 1, 0, 0);
  surfaceCtx.clearRect(0, 0, canvas.width, canvas.height);
  surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  surfaceCtx.fillStyle = "rgba(5, 9, 13, 0.92)";
  surfaceCtx.strokeStyle = hexToRgba(color, focused ? 1 : 0.76);
  surfaceCtx.lineWidth = focused ? 1.8 : 1;
  surfaceCtx.beginPath();
  surfaceCtx.roundRect(0.5, 0.5, boxWidth - 1, boxHeight - 1, 6);
  surfaceCtx.fill();
  surfaceCtx.stroke();
  surfaceCtx.fillStyle = color;
  surfaceCtx.beginPath();
  surfaceCtx.arc(11, 13, 4, 0, Math.PI * 2);
  surfaceCtx.fill();
  surfaceCtx.fillStyle = "#f7fbfd";
  surfaceCtx.font = "600 10px Segoe UI, Arial";
  surfaceCtx.textAlign = "left";
  surfaceCtx.fillText(entry.prepared.stageName, 20, 16, boxWidth - 100);
  surfaceCtx.textAlign = "right";
  surfaceCtx.fillStyle = "#9eb2b9";
  surfaceCtx.font = "9px Consolas, monospace";
  surfaceCtx.fillText(elapsedLabel, boxWidth - 8, 16, 62);
  rows.forEach((row, index) => {
    const y = 36 + index * 16;
    surfaceCtx.textAlign = "left";
    surfaceCtx.fillStyle = index === 2 ? "#91a8b0" : "#ecf6f8";
    surfaceCtx.font = index === 2 ? "9px Segoe UI, Arial" : "9px Consolas, monospace";
    surfaceCtx.fillText(row[0], 9, y, boxWidth / 2 - 12);
    surfaceCtx.textAlign = "right";
    surfaceCtx.fillText(row[1], boxWidth - 9, y, boxWidth / 2 - 10);
  });
  const cache = {
    physics: entry.physics,
    key,
    canvas,
    widthCss: boxWidth,
    heightCss: boxHeight,
    updatedAt: timestamp,
    sampleElapsedSec: Number(sample.elapsedSec) || 0,
    contentKey,
  };
  ballisticAnimationLabelCaches.set(entry.key, cache);
  ballisticAnimationPerformanceStats.labelBuilds += 1;
  return cache;
}

function activeBallisticSegment(track = activeTrajectory(), stage = activeBallisticStage(track)) {
  if (!track || !stage) return null;
  const selected = selectedTrajectoryItems(track);
  if (selected.length < 2) return null;
  const geometry = cachedTrajectoryGeometry(track, selected);
  const path = geometry.path;
  if (!path?.totalKm) return null;
  const stageIndex = Math.max(0, track.ballistic.stages.findIndex((candidate) => candidate.id === stage.id));
  return buildBallisticStageSegment(stage, selected, path, stageIndex, geometry.signature);
}

function animatedBallisticSegment() {
  const animation = ensureBallisticAnimationConfig();
  const focused = ballisticAnimationSession?.entries.find((entry) => entry.key === animation.focusKey) || ballisticAnimationSession?.entries[0];
  return focused?.segment || null;
}

function ballisticAnimationObjectFrame(entry, globalElapsedSec) {
  if (!entry?.prepared?.sampleTimes?.length) return null;
  const timelineState = REENTRY_ANIMATION
    ? REENTRY_ANIMATION.objectTimelineState(globalElapsedSec, entry.offsetSec, entry.durationSec)
    : { phase: "active", elapsedSec: clamp(globalElapsedSec - entry.offsetSec, 0, entry.durationSec) };
  if (timelineState.phase === "waiting") return { timelineState, bracket: null, sample: null };
  const bracket = REENTRY_ANIMATION
    ? REENTRY_ANIMATION.sampleBracket(entry.prepared.sampleTimes, timelineState.elapsedSec)
    : ballisticSampleBracket(entry.prepared.samples, timelineState.elapsedSec);
  return {
    timelineState,
    bracket,
    sample: ballisticSampleAtBracket(entry.prepared.samples, timelineState.elapsedSec, bracket),
  };
}

function ballisticSampleAtTime(samples, elapsedSec) {
  if (!samples?.length) return null;
  const bracket = ballisticSampleBracket(samples, elapsedSec);
  return ballisticSampleAtBracket(samples, elapsedSec, bracket);
}

function ballisticSampleAtBracket(samples, elapsedSec, bracket) {
  if (!samples?.length || !bracket || bracket.lowerIndex < 0) return null;
  if (bracket.lowerIndex === bracket.upperIndex) return samples[bracket.lowerIndex];
  const lower = samples[bracket.lowerIndex];
  const upper = samples[bracket.upperIndex];
  return interpolateBallisticSample(lower, upper, bracket.fraction, elapsedSec);
}

function interpolateBallisticSample(lower, upper, fraction, elapsedSec) {
  const safeFraction = clamp(Number(fraction) || 0, 0, 1);
  const position = interpolateGreatCircle(lower, upper, safeFraction);
  const out = { lon: position.lon, lat: position.lat, elapsedSec };
  for (const key of [
    "altitudeM",
    "inertialSpeedMps",
    "groundRelativeSpeedMps",
    "airRelativeSpeedMps",
    "speedOfSoundMps",
    "localMach",
    "airRelativeVerticalSpeedMps",
    "airRelativeHorizontalSpeedMps",
    "flightPathAngleDeg",
    "densityKgM3",
    "temperatureK",
    "dynamicPressurePa",
    "dragDecelerationMps2",
    "dragLoadG",
    "liftAccelerationMps2",
    "aerodynamicLoadG",
    "convectiveHeatFluxWm2",
    "dynamicViscosityPaS",
    "reynoldsNumber",
    "meanFreePathM",
    "knudsenNumber",
    "diagnosticReferenceLengthM",
    "cumulativeHeatJm2",
    "verticalSpeedMps",
    "heatRatio",
    "dynamicPressureRatio",
  ]) {
    const a = Number(lower[key]);
    const b = Number(upper[key]);
    out[key] = Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * safeFraction : Number.isFinite(a) ? a : b;
  }
  out.descending = out.verticalSpeedMps < -0.5;
  const nearestSource = safeFraction < 0.5 ? lower : upper;
  const passSource = [lower, upper].find((candidate) => {
    const entrySec = Number(candidate?.atmospherePassEntrySec);
    const exitSec = Number(candidate?.atmospherePassExitSec);
    return Number(candidate?.atmospherePassIndex) >= 0 &&
      Number.isFinite(entrySec) && elapsedSec >= entrySec - 1e-6 &&
      (!Number.isFinite(exitSec) || elapsedSec <= exitSec + 1e-6);
  }) || nearestSource;
  out.reentryPhase = passSource.reentryPhase;
  out.atmospherePassIndex = passSource.atmospherePassIndex;
  out.atmospherePassOutcome = passSource.atmospherePassOutcome;
  out.atmospherePassEntrySec = passSource.atmospherePassEntrySec;
  out.atmospherePassExitSec = passSource.atmospherePassExitSec;
  out.atmosphereSource = nearestSource.atmosphereSource;
  out.flowRegime = nearestSource.flowRegime;
  out.radiativeHeatingAdvisory = Boolean(lower.radiativeHeatingAdvisory || upper.radiativeHeatingAdvisory);
  return out;
}

function ballisticSampleBracket(samples, elapsedSec) {
  if (!samples?.length) return { lowerIndex: -1, upperIndex: -1, fraction: 0 };
  if (elapsedSec <= samples[0].elapsedSec) return { lowerIndex: 0, upperIndex: 0, fraction: 0 };
  const lastIndex = samples.length - 1;
  if (elapsedSec >= samples[lastIndex].elapsedSec) return { lowerIndex: lastIndex, upperIndex: lastIndex, fraction: 0 };
  let low = 0;
  let high = lastIndex;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].elapsedSec <= elapsedSec) low = middle;
    else high = middle;
  }
  const duration = Math.max(1e-9, samples[high].elapsedSec - samples[low].elapsedSec);
  return {
    lowerIndex: low,
    upperIndex: high,
    fraction: clamp((elapsedSec - samples[low].elapsedSec) / duration, 0, 1),
  };
}

function pauseBallisticAnimation() {
  const animation = ensureBallisticAnimationConfig();
  animation.playing = false;
  animation.playbackStartedAt = 0;
  animation.playbackStartElapsedSec = animation.elapsedSec;
  animation.impactFlashStartedAtByKey = {};
  ballisticAnimationLastDomUpdateAt = 0;
  if (ballisticAnimationFrame) cancelAnimationFrame(ballisticAnimationFrame);
  ballisticAnimationFrame = 0;
  requestBallisticAnimationDraw();
}

function resetBallisticAnimation() {
  pauseBallisticAnimation();
  const animation = ensureBallisticAnimationConfig();
  animation.trackId = "";
  animation.stageId = "";
  animation.objectKeys = [];
  animation.objectSettings = {};
  animation.focusKey = "";
  animation.elapsedSec = 0;
  animation.cacheStatus = "idle";
  animation.cacheMessage = "尚未预计算动画缓存";
  ballisticAnimationSession = null;
  ballisticAnimationTrailCaches.clear();
  ballisticAnimationCompositeTrailCache = null;
  ballisticAnimationLabelLayoutCache = null;
  ballisticProfileSurfaceCache = null;
  ballisticAnimationLabelCaches.clear();
}

function ballisticAnimationHasActiveFlash(timestamp) {
  const animation = ensureBallisticAnimationConfig();
  let active = false;
  for (const [key, startedAt] of Object.entries(animation.impactFlashStartedAtByKey)) {
    if (timestamp - startedAt < BALLISTIC_IMPACT_FLASH_DURATION_MS) active = true;
    else delete animation.impactFlashStartedAtByKey[key];
  }
  return active;
}

function startBallisticAnimationLoop() {
  if (ballisticAnimationFrame) return;
  const step = (timestamp) => {
    ballisticAnimationFrame = 0;
    const animation = ensureBallisticAnimationConfig();
    const flashActive = ballisticAnimationHasActiveFlash(timestamp);
    if (!animation.playing && !flashActive) {
      drawBallisticAnimationOverlay(timestamp);
      return;
    }
    const session = ballisticAnimationSession;
    if (!session?.entries?.length) {
      pauseBallisticAnimation();
      return;
    }
    const multiObjectInterval = session.entries.length >= 4 ? BALLISTIC_MULTI_OBJECT_FRAME_INTERVAL_MS : 0;
    if (
      animation.playing &&
      multiObjectInterval > 0 &&
      ballisticAnimationLastVisualDrawAt > 0 &&
      timestamp - ballisticAnimationLastVisualDrawAt < multiObjectInterval
    ) {
      ballisticAnimationFrame = requestAnimationFrame(step);
      return;
    }
    const previousElapsedSec = animation.elapsedSec;
    let reachedImpact = false;
    if (animation.playing && !animation.playbackStartedAt) {
      animation.playbackStartedAt = timestamp;
      animation.playbackStartElapsedSec = animation.elapsedSec;
    }
    if (animation.playing) {
      const wallElapsedSec = Math.max(0, (timestamp - animation.playbackStartedAt) / 1000);
      animation.elapsedSec = animation.playbackStartElapsedSec + wallElapsedSec * animation.speed;
    }
    if (animation.playing) {
      for (const entry of session.entries) {
        const impactGlobalSec = entry.offsetSec + entry.durationSec;
        if (
          entry.stage.impactFlashEnabled !== false &&
          entry.physics.status === "impact" &&
          previousElapsedSec < impactGlobalSec &&
          animation.elapsedSec >= impactGlobalSec
        ) {
          animation.impactFlashStartedAtByKey[entry.key] = timestamp;
          reachedImpact = true;
        }
      }
    }
    if (animation.playing && animation.elapsedSec >= session.durationSec) {
      animation.elapsedSec = session.durationSec;
      animation.playing = false;
      animation.playbackStartedAt = 0;
      animation.playbackStartElapsedSec = animation.elapsedSec;
    }
    if (!ballisticAnimationLastDomUpdateAt || timestamp - ballisticAnimationLastDomUpdateAt >= BALLISTIC_ANIMATION_DOM_INTERVAL_MS || reachedImpact) {
      ballisticAnimationLastDomUpdateAt = timestamp;
      updateBallisticAnimationDom(session);
    }
    if (ballisticAnimationDrawFrame) {
      cancelAnimationFrame(ballisticAnimationDrawFrame);
      ballisticAnimationDrawFrame = 0;
    }
    ballisticAnimationLastVisualDrawAt = timestamp;
    drawBallisticAnimationOverlay(timestamp);
    const continueFlash = ballisticAnimationHasActiveFlash(timestamp);
    if (animation.playing || continueFlash) ballisticAnimationFrame = requestAnimationFrame(step);
  };
  ballisticAnimationFrame = requestAnimationFrame(step);
}

function updateBallisticAnimationDom(session = ballisticAnimationSession) {
  if (!session?.entries?.length) return;
  const animation = ensureBallisticAnimationConfig();
  const root = els.trajectoryPlanList;
  const timeline = root.querySelector("[data-ballistic-animation-time]");
  if (timeline) {
    timeline.max = String(Math.max(1, session.durationSec));
    timeline.value = String(clamp(animation.elapsedSec, 0, session.durationSec));
  }
  const clock = root.querySelector("[data-ballistic-animation-clock]");
  if (clock) clock.textContent = formatDurationSeconds(animation.elapsedSec);
  const duration = root.querySelector("[data-ballistic-animation-duration]");
  if (duration) duration.textContent = formatDurationSeconds(session.durationSec);
  let focusedEntry = null;
  let focusedSample = null;
  session.entries.forEach((entry, index) => {
    const frame = ballisticAnimationObjectFrame(entry, animation.elapsedSec);
    const sample = frame?.sample;
    const row = root.querySelector(`[data-ballistic-animation-object-row="${index}"]`);
    if (row) {
      const stateTarget = row.querySelector("[data-ballistic-object-state]");
      const timeTarget = row.querySelector("[data-ballistic-object-time]");
      const altitudeTarget = row.querySelector("[data-ballistic-object-altitude]");
      const speedTarget = row.querySelector("[data-ballistic-object-speed]");
      const heatTarget = row.querySelector("[data-ballistic-object-heat]");
      if (stateTarget) stateTarget.textContent = ballisticAnimationPhaseLabel(frame?.timelineState?.phase, sample);
      if (timeTarget) timeTarget.textContent = formatDurationSeconds(frame?.timelineState?.elapsedSec || 0);
      if (altitudeTarget) altitudeTarget.textContent = sample ? formatKm(sample.altitudeM / 1000) : "-- km";
      if (speedTarget) speedTarget.textContent = sample ? formatMps(sample.airRelativeSpeedMps ?? sample.groundRelativeSpeedMps) : "-- m/s";
      if (heatTarget) heatTarget.textContent = sample ? formatHeatFlux(sample.convectiveHeatFluxWm2) : "-- W/m²";
    }
    if (entry.key === animation.focusKey || (!focusedEntry && index === 0)) {
      focusedEntry = entry;
      focusedSample = sample;
    }
  });
  const play = root.querySelector("[data-ballistic-animation-play]");
  if (play) {
    play.textContent = animation.playing ? "Ⅱ" : "▶";
    play.title = animation.playing ? "暂停动画" : "播放动画";
    play.setAttribute("aria-label", play.title);
  }
  if (focusedEntry) drawBallisticProfile(focusedEntry.segment, focusedSample || focusedEntry.physics.samples[0]);
}

function drawBallisticProfile(segment, currentSample = null) {
  const canvas = els.trajectoryPlanList.querySelector("[data-ballistic-profile]");
  const samples = segment?.physics?.samples;
  if (!canvas || !samples?.length) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 40 || rect.height < 40) return;
  const ctx = setupCanvas(canvas);
  const width = rect.width;
  const height = rect.height;
  const dpr = canvas.width / Math.max(1, width);
  const cache = ballisticProfileSurfaceFor(segment, width, height, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(cache.canvas, 0, 0, cache.canvas.width, cache.canvas.height, 0, 0, width, height);

  const activeSample = currentSample || samples[0];
  const bracket = ballisticSampleBracket(samples, activeSample.elapsedSec);
  const activeIndex = bracket.fraction >= 0.5 ? bracket.upperIndex : bracket.lowerIndex;
  const markerX = cache.xAt(cache.cumulativeKm[Math.max(0, activeIndex)] || 0);
  const markerY = cache.yAt(activeSample.altitudeM / 1000);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = reentryHeatColor(reentryHeatVisual(activeSample.convectiveHeatFluxWm2).intensity, 1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(markerX, markerY, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  canvas.dataset.profileCache = cache.cacheHit ? "hit" : "built";
}

function ballisticProfileSurfaceFor(segment, width, height, dpr) {
  const physics = segment.physics;
  const color = segment.stage.color || "#ff5b61";
  const key = `${Math.round(width * 10)}:${Math.round(height * 10)}:${dpr.toFixed(3)}:${color}`;
  if (ballisticProfileSurfaceCache?.physics === physics && ballisticProfileSurfaceCache.key === key) {
    ballisticAnimationPerformanceStats.profileHits += 1;
    ballisticProfileSurfaceCache.cacheHit = true;
    return ballisticProfileSurfaceCache;
  }
  const samples = physics.samples;
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.round(width * dpr));
  surface.height = Math.max(1, Math.round(height * dpr));
  const ctx = surface.getContext("2d", { alpha: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = { left: 31, right: 8, top: 8, bottom: 18 };
  const plotWidth = Math.max(1, width - pad.left - pad.right);
  const plotHeight = Math.max(1, height - pad.top - pad.bottom);
  const cumulativeKm = [0];
  for (let index = 1; index < samples.length; index += 1) {
    cumulativeKm.push(cumulativeKm[index - 1] + greatCircleDistanceKm(samples[index - 1], samples[index]));
  }
  const maxRangeKm = Math.max(1, cumulativeKm[cumulativeKm.length - 1]);
  let maxAltitudeKm = 120;
  for (const sample of samples) maxAltitudeKm = Math.max(maxAltitudeKm, sample.altitudeM / 1000);
  maxAltitudeKm *= 1.05;
  const xAt = (rangeKm) => pad.left + (rangeKm / maxRangeKm) * plotWidth;
  const yAt = (altitudeKm) => pad.top + (1 - clamp(altitudeKm / maxAltitudeKm, 0, 1)) * plotHeight;

  const bands = [
    { low: 0, high: 30, color: "rgba(255, 106, 93, 0.11)" },
    { low: 30, high: 70, color: "rgba(255, 181, 82, 0.08)" },
    { low: 70, high: 120, color: "rgba(91, 199, 239, 0.08)" },
    { low: 120, high: maxAltitudeKm, color: "rgba(67, 93, 119, 0.08)" },
  ];
  for (const band of bands) {
    const top = yAt(Math.min(maxAltitudeKm, band.high));
    const bottom = yAt(Math.min(maxAltitudeKm, band.low));
    ctx.fillStyle = band.color;
    ctx.fillRect(pad.left, top, plotWidth, Math.max(0, bottom - top));
  }
  ctx.font = "8px Segoe UI, Arial";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const altitude of [...new Set([0, 70, 120, Math.round(maxAltitudeKm)])]) {
    if (altitude > maxAltitudeKm) continue;
    const y = yAt(altitude);
    ctx.strokeStyle = "rgba(214, 232, 238, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(188, 208, 215, 0.8)";
    ctx.fillText(`${altitude}k`, pad.left - 4, y);
  }

  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  for (let index = 1; index < samples.length; index += 1) {
    const previousSample = samples[index - 1];
    const sample = samples[index];
    const previousHeat = reentryHeatVisual(previousSample.convectiveHeatFluxWm2);
    const heat = reentryHeatVisual(sample.convectiveHeatFluxWm2);
    const previousColor = previousSample.dynamicPressurePa >= 1 && previousHeat.intensity > 0.001
      ? reentryHeatColor(previousHeat.intensity, 0.98)
      : !previousSample.descending
        ? hexToRgba(segment.stage.color || "#ff5b61", 0.96)
        : "rgba(103, 213, 255, 0.92)";
    const currentColor = sample.dynamicPressurePa >= 1 && heat.intensity > 0.001
      ? reentryHeatColor(heat.intensity, 0.98)
      : !sample.descending
        ? hexToRgba(segment.stage.color || "#ff5b61", 0.96)
        : "rgba(103, 213, 255, 0.92)";
    const start = { x: xAt(cumulativeKm[index - 1]), y: yAt(previousSample.altitudeM / 1000) };
    const end = { x: xAt(cumulativeKm[index]), y: yAt(sample.altitudeM / 1000) };
    ctx.strokeStyle = segmentColorGradient(ctx, start, end, previousColor, currentColor);
    ctx.lineWidth = 1.8 + ((previousHeat.areaScale + heat.areaScale) / 2) * 2.2;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ballisticAnimationPerformanceStats.profileBuilds += 1;
  ballisticProfileSurfaceCache = {
    physics,
    key,
    canvas: surface,
    cumulativeKm,
    maxRangeKm,
    maxAltitudeKm,
    xAt,
    yAt,
    cacheHit: false,
  };
  return ballisticProfileSurfaceCache;
}

function requestBallisticAnimationDraw() {
  if (ballisticAnimationFrame || ballisticAnimationDrawFrame) return;
  ballisticAnimationDrawFrame = requestAnimationFrame((timestamp) => {
    ballisticAnimationDrawFrame = 0;
    drawBallisticAnimationOverlay(timestamp);
  });
}

function resetBallisticAnimationPerformanceClock() {
  ballisticAnimationPerformanceStats.lastFrameTimestamp = 0;
  ballisticAnimationPerformanceStats.frameIntervalEmaMs = 0;
  ballisticAnimationPerformanceStats.lastDatasetUpdateAt = 0;
  ballisticAnimationLastVisualDrawAt = 0;
}

function setupBallisticAnimationCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(currentRenderDprCap(), window.devicePixelRatio || 1);
  const targetWidth = Math.max(1, Math.round(rect.width * dpr));
  const targetHeight = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height, dpr };
}

function prepareBallisticAnimationViewCaches(session = ballisticAnimationSession) {
  if (!session?.entries?.length || !els.animationCanvas) return;
  const { width, height, dpr } = setupBallisticAnimationCanvas(els.animationCanvas);
  ballisticAnimationCompositeTrailFor(session, width, height, dpr);
  prewarmBallisticAnimationVisualCaches(dpr);
  session.visualCacheReady = true;
  ensureBallisticAnimationConfig().cacheMessage = `缓存就绪 · ${session.entries.length} 个物体 · ${session.sampleCount} 个精细样本 · 视觉缓存已预生成`;
}

function prewarmBallisticAnimationVisualCaches(dpr) {
  for (let level = 1; level < BALLISTIC_GLOW_LEVELS; level += 1) {
    ballisticHeatGlowSprite({ intensity: level / (BALLISTIC_GLOW_LEVELS - 1) }, dpr);
  }
  for (let frame = 0; frame < BALLISTIC_IMPACT_FLASH_FRAMES; frame += 1) ballisticImpactFlashSprite(frame, dpr);
}

function ballisticAnimationCompositeTrailFor(session, width, height, dpr) {
  const viewKey = projectionViewSignature(width, height, `animation-composite-${dpr.toFixed(3)}`);
  const key = `${session.signature}:${viewKey}`;
  if (ballisticAnimationCompositeTrailCache?.key === key) {
    ballisticAnimationPerformanceStats.trailHits += 1;
    ballisticAnimationCompositeTrailCache.cacheHit = true;
    return ballisticAnimationCompositeTrailCache;
  }
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.round(width * dpr));
  surface.height = Math.max(1, Math.round(height * dpr));
  const surfaceCtx = surface.getContext("2d", { alpha: true, desynchronized: true });
  surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const objects = new Map(session.entries.map((entry) => [entry.key, {
    projected: projectBallisticSamples(entry.prepared.samples, width, height),
    visuals: entry.prepared.visuals,
    renderedThroughIndex: 0,
  }]));
  ballisticAnimationCompositeTrailCache = {
    key,
    canvas: surface,
    ctx: surfaceCtx,
    objects,
    width,
    height,
    dpr,
    cacheHit: false,
  };
  ballisticAnimationPerformanceStats.trailBuilds += 1;
  return ballisticAnimationCompositeTrailCache;
}

function updateBallisticAnimationCompositeTrail(cache, frameItems) {
  const targets = new Map(frameItems.map((item) => [item.entry.key, item.bracket?.lowerIndex || 0]));
  let reset = false;
  for (const [key, object] of cache.objects) {
    if ((targets.get(key) || 0) < object.renderedThroughIndex) {
      reset = true;
      break;
    }
  }
  if (reset) {
    cache.ctx.save();
    cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
    cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
    cache.ctx.restore();
    for (const object of cache.objects.values()) object.renderedThroughIndex = 0;
  }
  for (const [key, object] of cache.objects) {
    const targetIndex = clamp(Math.trunc(targets.get(key) || 0), 0, object.projected.length - 1);
    for (let index = object.renderedThroughIndex + 1; index <= targetIndex; index += 1) {
      drawBallisticAnimationVisualSegment(
        cache.ctx,
        object.projected[index - 1],
        object.projected[index],
        object.visuals[index - 1],
        object.visuals[index],
      );
      ballisticAnimationPerformanceStats.trailSegmentsRendered += 1;
    }
    object.renderedThroughIndex = targetIndex;
  }
}

function drawBallisticAnimationInteractiveTrail(ctx, entry, bracket, width, height) {
  const samples = entry.prepared.samples;
  const targetIndex = clamp(Math.trunc(bracket?.lowerIndex || 0), 0, Math.max(0, samples.length - 1));
  if (targetIndex < 1) return 1;
  const maximum = isGlobeLayer() ? 110 : 150;
  const stride = Math.max(1, Math.ceil(targetIndex / Math.max(1, maximum - 1)));
  const selected = [];
  const sourceIndexes = [];
  for (let index = 0; index <= targetIndex; index += stride) {
    selected.push(samples[index]);
    sourceIndexes.push(index);
  }
  if (sourceIndexes[sourceIndexes.length - 1] !== targetIndex) {
    selected.push(samples[targetIndex]);
    sourceIndexes.push(targetIndex);
  }
  const projected = projectBallisticSamples(selected, width, height);
  for (let index = 1; index < projected.length; index += 1) {
    drawBallisticAnimationVisualSegment(
      ctx,
      projected[index - 1],
      projected[index],
      entry.prepared.visuals[sourceIndexes[index - 1]],
      entry.prepared.visuals[sourceIndexes[index]],
    );
  }
  return selected.length;
}

function ballisticAnimationPlumeProjectionScale(width, height) {
  const minimumViewport = Math.max(1, Math.min(width, height));
  if (REENTRY_ANIMATION?.plumeProjectionScale) {
    if (isGlobeLayer()) {
      const params = globeParams(width, height);
      return REENTRY_ANIMATION.plumeProjectionScale(
        Number(params?.radius) || minimumViewport * 0.5,
        minimumViewport,
        true,
        state.view.zoom,
      );
    }
    return REENTRY_ANIMATION.plumeProjectionScale(0, minimumViewport, false, state.view.zoom);
  }
  return isGlobeLayer()
    ? clamp((Number(globeParams(width, height)?.radius) || minimumViewport * 0.5) / (minimumViewport * 0.5), 0.4, 8)
    : clamp(2 ** ((Number(state.view.zoom) - 3) * 0.42), 0.4, 8);
}

function ballisticAnimationPlumePoints(entry, trail, bracket, marker, current, currentVisual, width, height, objectCount = 1) {
  const samples = entry?.prepared?.samples || [];
  const sampleTimes = entry?.prepared?.sampleTimes || [];
  if (!samples.length || !bracket || !marker) return [];
  const pressureWeight = smoothstep(40, 26000, Number(current?.dynamicPressurePa) || 0);
  const persistenceSec = 8 + currentVisual.heat.brightness * 18 + pressureWeight * 5;
  const elapsedSec = Number(current?.elapsedSec) || 0;
  let startIndex = clamp(Math.trunc(bracket.lowerIndex), 0, samples.length - 1);
  const passEntrySec = Number(current?.atmospherePassEntrySec);
  const completePassTrail = current?.atmospherePassOutcome === "exit" && Number.isFinite(passEntrySec);
  if (completePassTrail) {
    while (startIndex > 0 && Number(sampleTimes[startIndex - 1]) >= passEntrySec - 1e-6) startIndex -= 1;
  } else {
    while (startIndex > 0 && elapsedSec - Number(sampleTimes[startIndex - 1]) <= persistenceSec) startIndex -= 1;
  }
  const endIndex = clamp(Math.trunc(bracket.lowerIndex), startIndex, samples.length - 1);
  const available = endIndex - startIndex + 1;
  const maximumPoints = completePassTrail
    ? objectCount >= 7
      ? 40
      : objectCount >= 4
        ? 56
        : 96
    : objectCount >= 7
      ? 14
      : objectCount >= 4
        ? 20
        : 28;
  const stride = Math.max(1, Math.ceil(available / maximumPoints));
  const sourceIndexes = [];
  for (let index = startIndex; index <= endIndex; index += stride) sourceIndexes.push(index);
  if (sourceIndexes[sourceIndexes.length - 1] !== endIndex) sourceIndexes.push(endIndex);

  const projected = trail?.projected
    ? sourceIndexes.map((index) => trail.projected[index])
    : projectBallisticSamples(sourceIndexes.map((index) => samples[index]), width, height);
  const backward = [{ x: marker.x, y: marker.y, visible: marker.visible, elapsedSec, visual: currentVisual }];
  const jumpLimit = Math.max(72, Math.min(width, height) * 0.48);
  for (let projectedIndex = projected.length - 1; projectedIndex >= 0; projectedIndex -= 1) {
    const point = projected[projectedIndex];
    if (!point || point.visible === false) break;
    const previous = backward[backward.length - 1];
    const distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance < 0.35) continue;
    if (distance > jumpLimit) break;
    backward.push({
      x: point.x,
      y: point.y,
      visible: point.visible,
      elapsedSec: Number(sampleTimes[sourceIndexes[projectedIndex]]) || 0,
      visual: entry.prepared.visuals[sourceIndexes[projectedIndex]],
    });
  }
  const points = backward.reverse();
  points.completePassTrail = completePassTrail;
  return points;
}

function traceBallisticPlumeRibbon(ctx, geometry) {
  const { left, right, front, headNormal, widths } = geometry || {};
  if (!left?.length || !right?.length || !front || !headNormal) return false;
  const lastIndex = left.length - 1;
  const headWidth = widths[lastIndex];
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (let index = 1; index < lastIndex; index += 1) {
    const next = left[index + 1];
    ctx.quadraticCurveTo(left[index].x, left[index].y, (left[index].x + next.x) / 2, (left[index].y + next.y) / 2);
  }
  ctx.lineTo(left[lastIndex].x, left[lastIndex].y);
  ctx.quadraticCurveTo(
    front.x + headNormal.x * headWidth * 0.58,
    front.y + headNormal.y * headWidth * 0.58,
    front.x,
    front.y,
  );
  ctx.quadraticCurveTo(
    front.x - headNormal.x * headWidth * 0.58,
    front.y - headNormal.y * headWidth * 0.58,
    right[lastIndex].x,
    right[lastIndex].y,
  );
  for (let index = lastIndex - 1; index > 0; index -= 1) {
    const next = right[index - 1];
    ctx.quadraticCurveTo(right[index].x, right[index].y, (right[index].x + next.x) / 2, (right[index].y + next.y) / 2);
  }
  ctx.lineTo(right[0].x, right[0].y);
  ctx.closePath();
  return true;
}

function ballisticPlumeGradient(ctx, geometry, heat, opacity, inner = false, peakProgress = 1, endOpacity = opacity) {
  const tail = geometry.centers[0];
  const head = geometry.front;
  const gradient = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
  const strength = clamp(Number(opacity) || 0, 0, 1);
  const peak = clamp(Number(peakProgress) || 0, 0.02, 1);
  if (peak < 0.96) {
    const rise = Math.max(0.01, peak * 0.58);
    const approach = Math.max(rise + 0.005, peak * 0.88);
    const fade = Math.min(0.995, peak + (1 - peak) * 0.58);
    const terminalStrength = clamp(Number(endOpacity) || 0, 0, 1);
    gradient.addColorStop(0, reentryGlowColor(0, 0));
    gradient.addColorStop(rise, reentryGlowColor(heat.intensity * 0.3, strength * (inner ? 0.12 : 0.055)));
    gradient.addColorStop(approach, reentryGlowColor(heat.intensity * 0.78, strength * (inner ? 0.58 : 0.3)));
    gradient.addColorStop(peak, reentryGlowColor(clamp(heat.intensity * 1.06 + 0.02, 0, 1), strength * (inner ? 0.96 : 0.62)));
    gradient.addColorStop(fade, reentryGlowColor(heat.intensity * 0.42, Math.max(terminalStrength, strength * 0.08)));
    gradient.addColorStop(1, reentryGlowColor(heat.intensity * 0.2, terminalStrength * (inner ? 0.82 : 0.42)));
    return gradient;
  }
  if (inner) {
    gradient.addColorStop(0, reentryGlowColor(0, 0));
    gradient.addColorStop(0.18, reentryGlowColor(heat.intensity * 0.32, strength * 0.05));
    gradient.addColorStop(0.62, reentryGlowColor(heat.intensity * 0.78, strength * 0.4));
    gradient.addColorStop(1, reentryGlowColor(clamp(heat.intensity * 1.08 + 0.03, 0, 1), strength * 0.96));
  } else {
    gradient.addColorStop(0, reentryGlowColor(0, 0));
    gradient.addColorStop(0.28, reentryGlowColor(heat.intensity * 0.25, strength * 0.035));
    gradient.addColorStop(0.78, reentryGlowColor(heat.intensity * 0.58, strength * 0.24));
    gradient.addColorStop(1, reentryGlowColor(heat.intensity * 0.84, strength * 0.56));
  }
  return gradient;
}

function drawBallisticReentryPlume(ctx, entry, current, marker, currentVisual, trail, bracket, width, height, dpr, projectionScale, objectCount = 1) {
  if (!REENTRY_ANIMATION?.plumeRibbonGeometry) return;
  const points = ballisticAnimationPlumePoints(entry, trail, bracket, marker, current, currentVisual, width, height, objectCount);
  const peakPoint = points.reduce((best, point) => Number(point?.visual?.glowOpacity) > Number(best?.visual?.glowOpacity) ? point : best, points[0]);
  const peakVisual = peakPoint?.visual || currentVisual;
  const opacity = Math.max(Number(currentVisual.glowOpacity) || 0, Number(peakVisual.glowOpacity) || 0);
  if (opacity <= 0.001) return;
  if (points.length < 2) {
    drawBallisticHeatGlow(ctx, marker, currentVisual.heat, dpr, currentVisual.glowOpacity, projectionScale);
    return;
  }
  const maximumHalfWidth = clamp(
    (4.5 + peakVisual.heat.areaScale * 12) * Math.sqrt(opacity) * projectionScale * BALLISTIC_PLUME_VISUAL_SCALE,
    0.3,
    Math.min(width, height) * 0.0275,
  );
  const elapsedSpan = Math.max(1e-6, points[points.length - 1].elapsedSec - points[0].elapsedSec);
  const widths = points.map((point, index) => {
    const ageProgress = clamp((point.elapsedSec - points[0].elapsedSec) / elapsedSpan, 0, 1);
    const indexProgress = index / Math.max(1, points.length - 1);
    const progress = Math.max(ageProgress, indexProgress * 0.7);
    const visual = point.visual || currentVisual;
    const localScale = opacity > 0.001
      ? Math.sqrt(clamp(Number(visual.glowOpacity) || 0, 0, 1) / opacity) * (0.44 + visual.heat.areaScale * 0.56)
      : 0;
    const envelope = points.completePassTrail ? smoothstep(0, 0.06, progress) : smoothstep(0, 0.88, progress) * (0.72 + progress * 0.28);
    return maximumHalfWidth * localScale * envelope;
  });
  widths[0] = 0;
  const outer = REENTRY_ANIMATION.plumeRibbonGeometry(points, widths);
  const inner = REENTRY_ANIMATION.plumeRibbonGeometry(points, widths.map((value) => value * 0.42));
  if (!outer || !inner) return;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const peakIndex = Math.max(0, points.indexOf(peakPoint));
  const peakProgress = peakIndex / Math.max(1, points.length - 1);
  if (traceBallisticPlumeRibbon(ctx, outer)) {
    ctx.fillStyle = ballisticPlumeGradient(ctx, outer, peakVisual.heat, opacity, false, peakProgress, currentVisual.glowOpacity);
    ctx.fill();
  }
  if (traceBallisticPlumeRibbon(ctx, inner)) {
    ctx.fillStyle = ballisticPlumeGradient(ctx, inner, peakVisual.heat, opacity, true, peakProgress, currentVisual.glowOpacity);
    ctx.fill();
  }
  ctx.strokeStyle = ballisticPlumeGradient(
    ctx,
    outer,
    peakVisual.heat,
    opacity,
    true,
    peakProgress,
    currentVisual.glowOpacity,
  );
  ctx.lineWidth = clamp(maximumHalfWidth * 0.12, 1, 7.5);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(outer.centers[0].x, outer.centers[0].y);
  for (let index = 1; index < outer.centers.length - 1; index += 1) {
    const point = outer.centers[index];
    const next = outer.centers[index + 1];
    ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  ctx.lineTo(marker.x, marker.y);
  ctx.stroke();
  ctx.restore();
  if (currentVisual.glowOpacity > 0.001) drawBallisticHeatGlow(ctx, marker, currentVisual.heat, dpr, currentVisual.glowOpacity, projectionScale);
}

function drawBallisticAnimationOverlay(timestamp = performance.now()) {
  const frameStartedAt = performance.now();
  const canvas = els.animationCanvas;
  if (!canvas) return;
  const { ctx, width, height, dpr } = setupBallisticAnimationCanvas(canvas);
  const plumeProjectionScale = ballisticAnimationPlumeProjectionScale(width, height);
  ctx.clearRect(0, 0, width, height);
  const session = ballisticAnimationSession;
  if (!session?.entries?.length) {
    clearFlatBallisticGpu();
    return;
  }
  const animation = ensureBallisticAnimationConfig();
  const gpuGlobe = Boolean(isGlobeLayer() && globeRendererState?.ballisticAnimationGpuLayer);
  if (gpuGlobe) clearFlatBallisticGpu();
  if (gpuGlobe && !state.satellitePlaybackRate) renderThreeGlobe(width, height, true, { satelliteOnly: true });
  if (gpuGlobe && animation.referenceFrame === "trajectory-fixed" && timestamp - globeSurfaceLastDrawAt >= GLOBE_SURFACE_FRAME_INTERVAL_MS) {
    globeSurfaceLastDrawAt = timestamp;
    drawGlobeSurfaceAnnotations(width, height);
  }
  const animationFinished = !animation.playing && animation.elapsedSec >= session.durationSec - 0.05;
  const labelItems = [];
  let impactFlashActive = false;
  let activeObjectCount = 0;
  let renderedSampleCount = 0;
  let furthestRenderedIndex = 0;
  const interactive = isInteractiveRender();
  const frameItems = [];

  for (const entry of session.entries) {
    const frame = ballisticAnimationObjectFrame(entry, animation.elapsedSec);
    const current = frame?.sample;
    const bracket = frame?.bracket;
    if (!current || !bracket) continue;
    activeObjectCount += 1;
    frameItems.push({ entry, current, bracket });
  }

  const flatGpuFrame = !gpuGlobe
    ? updateFlatBallisticAnimationGpu(session, frameItems, timestamp, width, height, animationFinished)
    : null;
  const gpuFlat = Boolean(flatGpuFrame);
  const gpuAnimation = gpuGlobe || gpuFlat;
  if (flatGpuFrame?.impactFlashActive) impactFlashActive = true;
  const compositeTrail = gpuAnimation || interactive ? null : ballisticAnimationCompositeTrailFor(session, width, height, dpr);
  if (compositeTrail) {
    updateBallisticAnimationCompositeTrail(compositeTrail, frameItems);
    for (const object of compositeTrail.objects.values()) {
      furthestRenderedIndex = Math.max(furthestRenderedIndex, object.renderedThroughIndex);
      renderedSampleCount += object.projected.length;
    }
    ctx.drawImage(
      compositeTrail.canvas,
      0,
      0,
      compositeTrail.canvas.width,
      compositeTrail.canvas.height,
      0,
      0,
      width,
      height,
    );
  }

  for (const { entry, current, bracket } of frameItems) {
    const object = compositeTrail?.objects.get(entry.key) || null;
    if (!gpuAnimation && !interactive && !object) continue;
    if (interactive && !gpuAnimation) {
      renderedSampleCount += drawBallisticAnimationInteractiveTrail(ctx, entry, bracket, width, height);
      furthestRenderedIndex = Math.max(furthestRenderedIndex, bracket.lowerIndex);
    }
    const trail = object
      ? {
        projected: object.projected,
        visuals: object.visuals,
        stageColor: entry.prepared.stageColor,
      }
      : { stageColor: entry.prepared.stageColor };
    const marker = projectBallisticAnimationSample(entry, current, width, height, gpuAnimation || interactive ? null : trail, bracket);
    if (!marker || marker.visible === false) continue;
    if (!gpuAnimation && !interactive && bracket.upperIndex !== bracket.lowerIndex && bracket.fraction > 1e-6) {
      drawBallisticAnimationVisualSegment(
        ctx,
        trail.projected[bracket.lowerIndex],
        marker,
        trail.visuals[bracket.lowerIndex],
        ballisticAnimationVisual(current, trail.stageColor),
      );
    }

    const currentVisual = ballisticAnimationVisual(current, trail.stageColor);
    const heat = currentVisual.heat;
    if (!gpuAnimation && interactive) {
      if (currentVisual.glowOpacity > 0.001) {
        drawBallisticHeatGlow(ctx, marker, currentVisual.heat, dpr, currentVisual.glowOpacity, plumeProjectionScale);
      }
    } else if (!gpuAnimation) {
      drawBallisticReentryPlume(
        ctx,
        entry,
        current,
        marker,
        currentVisual,
        trail,
        bracket,
        width,
        height,
        dpr,
        plumeProjectionScale,
        frameItems.length,
      );
    }
    if (!gpuAnimation) {
      const markerScale = clamp(Math.sqrt(plumeProjectionScale), 0.68, 2.7);
      ctx.save();
      ctx.fillStyle = currentVisual.markerFillColor;
      ctx.strokeStyle = currentVisual.markerStrokeColor;
      ctx.lineWidth = entry.key === animation.focusKey ? 2.6 : 1.8;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, (6.2 + heat.areaScale * 8.5) * markerScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(3, 7, 10, 0.92)";
      ctx.font = "700 8px Segoe UI, Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(entry.index + 1), marker.x, marker.y + 0.2);
      ctx.restore();
    }

    const flashState = REENTRY_ANIMATION?.impactFlashState
      ? REENTRY_ANIMATION.impactFlashState(
        animation.impactFlashStartedAtByKey[entry.key],
        timestamp,
        BALLISTIC_IMPACT_FLASH_DURATION_MS,
        animationFinished,
      )
      : { mode: animationFinished ? "held" : "idle", ageMs: Number.POSITIVE_INFINITY };
    const flashEnabled = entry.stage.impactFlashEnabled !== false && entry.physics.status === "impact";
    if (flashEnabled && flashState.mode === "transient") {
      impactFlashActive = true;
      if (!gpuAnimation) drawBallisticImpactFlash(ctx, marker, flashState.ageMs, dpr);
    } else if (flashEnabled && flashState.mode === "held") {
      impactFlashActive = true;
      if (!gpuAnimation) drawBallisticImpactFlash(ctx, marker, 0, dpr, true);
    }
    if (entry.labelEnabled && entry.track.ballistic.showAnimationLabels !== false) {
      labelItems.push({
        id: entry.key,
        entry,
        sample: current,
        marker,
        anchorX: marker.x,
        anchorY: marker.y,
        width: width < 760 ? 180 : 216,
        height: 82,
        priority: entry.key === animation.focusKey ? 2 : 1,
      });
    }
  }

  const placements = ballisticAnimationLabelPlacements(labelItems, session, width, height, compositeTrail, timestamp, interactive);
  canvas.dataset.animationLabelLayout = "anchored-avoidance";
  canvas.dataset.animationLabelCount = String(placements.length);
  canvas.dataset.animationLabelOverlapCount = String(countRectangleOverlaps(placements));
  const labelById = new Map(labelItems.map((item) => [item.id, item]));
  for (const placement of placements) {
    const item = labelById.get(placement.id);
    if (item) drawBallisticAnimationLabel(ctx, item.entry, item.sample, placement, dpr, timestamp);
  }

  if (ballisticAnimationPerformanceStats.lastFrameTimestamp > 0) {
    const intervalMs = timestamp - ballisticAnimationPerformanceStats.lastFrameTimestamp;
    if (intervalMs > 0 && intervalMs < 2000) {
      ballisticAnimationPerformanceStats.frameIntervalEmaMs = ballisticAnimationPerformanceStats.frameIntervalEmaMs > 0
        ? ballisticAnimationPerformanceStats.frameIntervalEmaMs * 0.9 + intervalMs * 0.1
        : intervalMs;
    }
  }
  ballisticAnimationPerformanceStats.lastFrameTimestamp = timestamp;
  ballisticAnimationPerformanceStats.framesRendered += 1;
  canvas.dataset.impactFlash = impactFlashActive ? "active" : "idle";
  if (!impactFlashActive && canvas.dataset.impactFlashAgeMs) canvas.dataset.impactFlashAgeMs = "";
  if (
    !ballisticAnimationPerformanceStats.lastDatasetUpdateAt ||
    timestamp - ballisticAnimationPerformanceStats.lastDatasetUpdateAt >= BALLISTIC_ANIMATION_STATS_INTERVAL_MS ||
    impactFlashActive
  ) {
    ballisticAnimationPerformanceStats.lastDatasetUpdateAt = timestamp;
    canvas.dataset.trailCache = gpuAnimation ? "webgl-precomputed" : interactive ? "interactive-lite" : compositeTrail.cacheHit ? "hit" : "built";
    canvas.dataset.trailCompositeLayers = gpuAnimation || interactive ? "0" : "1";
    canvas.dataset.trailCacheBuilds = String(ballisticAnimationPerformanceStats.trailBuilds);
    canvas.dataset.trailCacheHits = String(ballisticAnimationPerformanceStats.trailHits);
    canvas.dataset.trailSegmentsRendered = String(ballisticAnimationPerformanceStats.trailSegmentsRendered);
    canvas.dataset.trailRenderedThrough = String(furthestRenderedIndex);
    canvas.dataset.trailSampleCount = String(renderedSampleCount);
    canvas.dataset.trailVisualMode = gpuAnimation ? "webgl-precomputed-stage-heat-line" : "stage-line-plus-tangent-plasma-plume";
    canvas.dataset.plumeGeometry = gpuAnimation ? "world-scaled-gpu-glow" : "curved-tapered-ribbon";
    canvas.dataset.plumeProjectionScale = plumeProjectionScale.toFixed(3);
    canvas.dataset.reentryOnset = "continuous";
    canvas.dataset.impactFlashHold = animationFinished ? "peak" : "transient";
    canvas.dataset.animationObjectCount = String(session.entries.length);
    canvas.dataset.animationActiveObjectCount = String(activeObjectCount);
    canvas.dataset.propagationDuringPlayback = String(Math.max(
      0,
      ballisticPerformanceStats.propagationRuns - session.propagationRunsAtPrepare,
    ));
    canvas.dataset.empiricalRequestsDuringPlayback = String(Math.max(
      0,
      ballisticPerformanceStats.empiricalRequests - session.empiricalRequestsAtPrepare,
    ));
    canvas.dataset.preparedSampleCount = String(session.sampleCount);
    canvas.dataset.animationFramesRendered = String(ballisticAnimationPerformanceStats.framesRendered);
    const estimatedFps = ballisticAnimationPerformanceStats.frameIntervalEmaMs > 0
      ? 1000 / ballisticAnimationPerformanceStats.frameIntervalEmaMs
      : 0;
    const frameWorkMs = performance.now() - frameStartedAt;
    canvas.dataset.estimatedFps = estimatedFps > 0 ? estimatedFps.toFixed(1) : "";
    canvas.dataset.fpsTarget = String(BALLISTIC_ANIMATION_MIN_FPS);
    canvas.dataset.fpsTargetMet = String((!estimatedFps || estimatedFps >= BALLISTIC_ANIMATION_MIN_FPS) && frameWorkMs <= BALLISTIC_ANIMATION_FRAME_BUDGET_MS);
    canvas.dataset.glowSpriteBuilds = String(ballisticAnimationPerformanceStats.glowSpriteBuilds);
    canvas.dataset.glowSpriteHits = String(ballisticAnimationPerformanceStats.glowSpriteHits);
    canvas.dataset.labelBuilds = String(ballisticAnimationPerformanceStats.labelBuilds);
    canvas.dataset.labelHits = String(ballisticAnimationPerformanceStats.labelHits);
    canvas.dataset.impactFlashAgeMs = impactFlashActive ? "active" : "";
    canvas.dataset.animationFrameWorkMs = frameWorkMs.toFixed(1);
    if (animation.playing && ballisticAnimationPerformanceStats.frameIntervalEmaMs > 0) {
      recordAdaptivePerformanceSample(ballisticAnimationPerformanceStats.frameIntervalEmaMs, "ballistic-animation");
    }
  }
}

function countRectangleOverlaps(rectangles) {
  let count = 0;
  for (let index = 0; index < rectangles.length; index += 1) {
    const current = rectangles[index];
    for (let otherIndex = index + 1; otherIndex < rectangles.length; otherIndex += 1) {
      const other = rectangles[otherIndex];
      const overlapWidth = Math.max(0, Math.min(current.x + current.width, other.x + other.width) - Math.max(current.x, other.x));
      const overlapHeight = Math.max(0, Math.min(current.y + current.height, other.y + other.height) - Math.max(current.y, other.y));
      if (overlapWidth * overlapHeight > 0.5) count += 1;
    }
  }
  return count;
}

function ballisticAnimationLabelPlacements(activeLabels, session, width, height, compositeTrail = null, timestamp = performance.now(), interactive = false) {
  if (!activeLabels.length || !REENTRY_ANIMATION) return [];
  const bounds = ballisticLabelMapBounds(width, height);
  const templates = activeLabels.map((item) => ({
    id: item.id,
    anchorX: item.anchorX,
    anchorY: item.anchorY,
    width: item.width,
    height: item.height,
    priority: item.priority,
  }));
  const key = JSON.stringify([
    session.signature,
    Math.round(width),
    Math.round(height),
    Math.round(bounds.left),
    Math.round(bounds.top),
    Math.round(bounds.right),
    Math.round(bounds.bottom),
    templates.map((item) => item.id),
  ]);
  const previous = ballisticAnimationLabelLayoutCache?.key === key
    ? ballisticAnimationLabelLayoutCache.placements
    : [];
  const refreshIntervalMs = interactive ? 220 : BALLISTIC_ANIMATION_LABEL_INTERVAL_MS;
  if (
    ballisticAnimationLabelLayoutCache?.key === key &&
    timestamp - Number(ballisticAnimationLabelLayoutCache.updatedAt || 0) < refreshIntervalMs
  ) {
    const previousAnchors = ballisticAnimationLabelLayoutCache.anchors || new Map();
    const templatesById = new Map(templates.map((item) => [item.id, item]));
    const adjusted = previous.map((placement) => {
      const template = templatesById.get(placement.id);
      const oldAnchor = previousAnchors.get(placement.id);
      if (!template || !oldAnchor) return placement;
      const dx = template.anchorX - oldAnchor.x;
      const dy = template.anchorY - oldAnchor.y;
      return {
        ...placement,
        anchorX: template.anchorX,
        anchorY: template.anchorY,
        x: clamp(placement.x + dx, bounds.left, Math.max(bounds.left, bounds.right - placement.width)),
        y: clamp(placement.y + dy, bounds.top, Math.max(bounds.top, bounds.bottom - placement.height)),
      };
    });
    ballisticAnimationLabelLayoutCache.placements = adjusted;
    ballisticAnimationLabelLayoutCache.anchors = new Map(templates.map((item) => [item.id, { x: item.anchorX, y: item.anchorY }]));
    return adjusted;
  }
  const obstacles = [];
  for (const object of compositeTrail?.objects?.values?.() || []) {
    const end = Math.min(object.projected.length - 1, object.renderedThroughIndex);
    const stride = Math.max(1, Math.ceil(Math.max(1, end) / 24));
    for (let index = 0; index <= end; index += stride) obstacles.push(object.projected[index]);
  }
  const placements = REENTRY_ANIMATION.layoutLabels(templates, width, height, { bounds, previous, obstacles });
  ballisticAnimationLabelLayoutCache = {
    key,
    placements,
    updatedAt: timestamp,
    anchors: new Map(templates.map((item) => [item.id, { x: item.anchorX, y: item.anchorY }])),
  };
  return placements;
}

function drawBallisticHeatGlow(ctx, marker, heat, dpr, opacity = 1, projectionScale = 1) {
  const exactLevel = clamp(heat.intensity * (BALLISTIC_GLOW_LEVELS - 1), 1, BALLISTIC_GLOW_LEVELS - 1);
  const lowerLevel = Math.floor(exactLevel);
  const upperLevel = Math.ceil(exactLevel);
  const fraction = exactLevel - lowerLevel;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const drawLevel = (level, alpha) => {
    if (alpha <= 0) return;
    const sprite = ballisticHeatGlowSpriteAtLevel(level, dpr);
    const displayedSize = sprite.sizeCss * clamp(Number(projectionScale) || 1, 0.35, 8) * BALLISTIC_PLUME_VISUAL_SCALE;
    ctx.globalAlpha = alpha * clamp(Number(opacity) || 0, 0, 1);
    ctx.drawImage(
      sprite.canvas,
      0,
      0,
      sprite.canvas.width,
      sprite.canvas.height,
      marker.x - displayedSize / 2,
      marker.y - displayedSize / 2,
      displayedSize,
      displayedSize,
    );
  };
  drawLevel(lowerLevel, 1 - fraction);
  if (upperLevel !== lowerLevel) drawLevel(upperLevel, fraction);
  ctx.restore();
}

function ballisticHeatGlowSprite(heat, dpr) {
  const level = clamp(Math.round(heat.intensity * (BALLISTIC_GLOW_LEVELS - 1)), 1, BALLISTIC_GLOW_LEVELS - 1);
  return ballisticHeatGlowSpriteAtLevel(level, dpr);
}

function ballisticHeatGlowSpriteAtLevel(level, dpr) {
  const normalized = level / (BALLISTIC_GLOW_LEVELS - 1);
  const dprKey = Math.max(1, Number(dpr) || 1).toFixed(2);
  const key = `${dprKey}:${level}`;
  const cached = ballisticGlowSpriteCache.get(key);
  if (cached) {
    ballisticAnimationPerformanceStats.glowSpriteHits += 1;
    return cached;
  }
  const visual = reentryHeatVisual(-REENTRY_GLOW_REFERENCE_W_M2 * Math.log(Math.max(1e-9, 1 - normalized)));
  const radius = 12 + visual.areaScale * 96;
  const sizeCss = Math.ceil(radius * 2 + 6);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(sizeCss * dpr));
  canvas.height = Math.max(1, Math.ceil(sizeCss * dpr));
  const spriteCtx = canvas.getContext("2d", { alpha: true });
  spriteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const center = sizeCss / 2;
  const glow = spriteCtx.createRadialGradient(center, center, 0, center, center, radius);
  glow.addColorStop(0, reentryGlowColor(clamp(normalized * 1.08 + 0.04, 0, 1), 0.78 + visual.brightness * 0.22));
  glow.addColorStop(0.12, reentryGlowColor(normalized, 0.56 + visual.brightness * 0.4));
  glow.addColorStop(0.34, reentryGlowColor(normalized * 0.84, 0.28 + visual.brightness * 0.46));
  glow.addColorStop(0.68, reentryGlowColor(normalized * 0.52, 0.09 + visual.brightness * 0.28));
  glow.addColorStop(1, reentryGlowColor(0, 0));
  spriteCtx.fillStyle = glow;
  spriteCtx.beginPath();
  spriteCtx.arc(center, center, radius, 0, Math.PI * 2);
  spriteCtx.fill();
  const sprite = { canvas, sizeCss };
  ballisticGlowSpriteCache.set(key, sprite);
  ballisticAnimationPerformanceStats.glowSpriteBuilds += 1;
  return sprite;
}

function drawBallisticImpactFlash(ctx, marker, ageMs, dpr, holdPeak = false) {
  const phase = clamp(ageMs / BALLISTIC_IMPACT_FLASH_DURATION_MS, 0, 1);
  const exactFrame = holdPeak
    ? BALLISTIC_IMPACT_FLASH_HOLD_FRAME
    : phase * (BALLISTIC_IMPACT_FLASH_FRAMES - 1);
  const lowerFrame = Math.floor(exactFrame);
  const upperFrame = Math.ceil(exactFrame);
  const fraction = exactFrame - lowerFrame;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const drawFrame = (frame, alpha) => {
    if (alpha <= 0) return;
    const sprite = ballisticImpactFlashSprite(frame, dpr);
    ctx.globalAlpha = alpha;
    ctx.drawImage(
      sprite.canvas,
      0,
      0,
      sprite.canvas.width,
      sprite.canvas.height,
      marker.x - sprite.widthCss / 2,
      marker.y - sprite.heightCss / 2,
      sprite.widthCss,
      sprite.heightCss,
    );
  };
  drawFrame(lowerFrame, 1 - fraction);
  if (upperFrame !== lowerFrame) drawFrame(upperFrame, fraction);
  ctx.restore();
}

function ballisticImpactFlashSprite(frame, dpr) {
  const spriteDpr = Math.min(1.15, Math.max(1, Number(dpr) || 1));
  const dprKey = spriteDpr.toFixed(2);
  const key = `${dprKey}:${frame}`;
  let sprite = ballisticImpactFlashSpriteCache.get(key);
  if (sprite) {
    ballisticAnimationPerformanceStats.glowSpriteHits += 1;
    return sprite;
  }
  const framePhase = frame / Math.max(1, BALLISTIC_IMPACT_FLASH_FRAMES - 1);
  const attack = smoothstep(0, 0.055, framePhase + 0.018);
  const envelope = attack * (1 - smoothstep(0.18, 1, framePhase)) ** 1.12;
  const widthCss = 430 + Math.sqrt(framePhase) * 520;
  const heightCss = 300 + Math.sqrt(framePhase) * 340;
  const textureWidth = 640;
  const textureHeight = 440;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textureWidth * spriteDpr);
  canvas.height = Math.ceil(textureHeight * spriteDpr);
  const spriteCtx = canvas.getContext("2d", { alpha: true });
  spriteCtx.setTransform(spriteDpr, 0, 0, spriteDpr, 0, 0);
  const centerX = textureWidth / 2;
  const centerY = textureHeight / 2;
  const radius = Math.min(textureHeight * 0.49, 128 + Math.sqrt(framePhase) * 82);
  const glow = spriteCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  glow.addColorStop(0, `rgba(224, 246, 255, ${Math.min(1, envelope * 2.4)})`);
  glow.addColorStop(0.045, `rgba(255, 255, 255, ${Math.min(1, envelope * 2.2)})`);
  glow.addColorStop(0.13, `rgba(255, 252, 221, ${Math.min(1, envelope * 1.7)})`);
  glow.addColorStop(0.34, `rgba(255, 178, 55, ${Math.min(1, envelope * 1.12)})`);
  glow.addColorStop(0.66, `rgba(255, 61, 14, ${envelope * 0.58})`);
  glow.addColorStop(1, "rgba(120, 0, 0, 0)");
  spriteCtx.fillStyle = glow;
  spriteCtx.beginPath();
  spriteCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  spriteCtx.fill();

  const horizontal = spriteCtx.createLinearGradient(0, centerY, textureWidth, centerY);
  horizontal.addColorStop(0, "rgba(255, 100, 25, 0)");
  horizontal.addColorStop(0.36, `rgba(255, 190, 85, ${envelope * 0.22})`);
  horizontal.addColorStop(0.48, `rgba(242, 250, 255, ${Math.min(1, envelope * 1.55)})`);
  horizontal.addColorStop(0.5, `rgba(255, 255, 255, ${Math.min(1, envelope * 2.15)})`);
  horizontal.addColorStop(0.52, `rgba(242, 250, 255, ${Math.min(1, envelope * 1.55)})`);
  horizontal.addColorStop(0.64, `rgba(255, 190, 85, ${envelope * 0.22})`);
  horizontal.addColorStop(1, "rgba(255, 100, 25, 0)");
  spriteCtx.fillStyle = horizontal;
  spriteCtx.fillRect(0, centerY - 9 - envelope * 10, textureWidth, 18 + envelope * 20);
  spriteCtx.globalAlpha = 0.72;
  spriteCtx.fillRect(0, centerY - 2.2, textureWidth, 4.4);
  spriteCtx.globalAlpha = 1;

  const ringRadius = 42 + Math.sqrt(framePhase) * 142;
  spriteCtx.strokeStyle = `rgba(255, 226, 142, ${envelope * (1 - framePhase) * 0.82})`;
  spriteCtx.lineWidth = 3 + (1 - framePhase) * 6;
  spriteCtx.beginPath();
  spriteCtx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
  spriteCtx.stroke();
  spriteCtx.fillStyle = `rgba(238, 250, 255, ${Math.min(1, envelope * 2.6)})`;
  spriteCtx.beginPath();
  spriteCtx.arc(centerX, centerY, 21 + Math.sqrt(framePhase) * 19, 0, Math.PI * 2);
  spriteCtx.fill();
  sprite = { canvas, widthCss, heightCss };
  ballisticImpactFlashSpriteCache.set(key, sprite);
  ballisticAnimationPerformanceStats.glowSpriteBuilds += 1;
  return sprite;
}

function ballisticAnimationTrailFor(entry, width, height, dpr) {
  const physics = entry.physics;
  const stageColor = entry.prepared.stageColor;
  const viewKey = projectionViewSignature(width, height, `animation-${dpr.toFixed(3)}`);
  const key = `${viewKey}:${stageColor}`;
  const existing = ballisticAnimationTrailCaches.get(entry.key);
  if (existing?.physics === physics && existing.key === key) {
    ballisticAnimationPerformanceStats.trailHits += 1;
    existing.cacheHit = true;
    return existing;
  }
  const surface = document.createElement("canvas");
  surface.width = Math.max(1, Math.round(width * dpr));
  surface.height = Math.max(1, Math.round(height * dpr));
  const surfaceCtx = surface.getContext("2d", { alpha: true });
  surfaceCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cache = {
    physics,
    key,
    stageColor,
    canvas: surface,
    ctx: surfaceCtx,
    projected: projectBallisticSamples(physics.samples, width, height),
    visuals: entry.prepared.visuals,
    renderedThroughIndex: 0,
    cacheHit: false,
  };
  ballisticAnimationTrailCaches.set(entry.key, cache);
  ballisticAnimationPerformanceStats.trailBuilds += 1;
  return cache;
}

function extendBallisticAnimationTrail(cache, targetIndex) {
  const lastIndex = cache.projected.length - 1;
  const safeTarget = clamp(Math.trunc(Number(targetIndex) || 0), 0, lastIndex);
  if (safeTarget < cache.renderedThroughIndex) {
    cache.ctx.save();
    cache.ctx.setTransform(1, 0, 0, 1, 0, 0);
    cache.ctx.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
    cache.ctx.restore();
    cache.renderedThroughIndex = 0;
  }
  for (let index = cache.renderedThroughIndex + 1; index <= safeTarget; index += 1) {
    drawBallisticAnimationVisualSegment(
      cache.ctx,
      cache.projected[index - 1],
      cache.projected[index],
      cache.visuals[index - 1],
      cache.visuals[index],
    );
    ballisticAnimationPerformanceStats.trailSegmentsRendered += 1;
  }
  cache.renderedThroughIndex = safeTarget;
}

function projectBallisticAnimationSample(entry, sample, width, height, trail = null, bracket = null) {
  if (!isGlobeLayer() && trail && bracket && bracket.lowerIndex !== bracket.upperIndex) {
    const start = trail.projected[bracket.lowerIndex];
    const end = trail.projected[bracket.upperIndex];
    if (start && end) {
      return {
        x: start.x + (end.x - start.x) * bracket.fraction,
        y: start.y + (end.y - start.y) * bracket.fraction,
        visible: start.visible !== false && end.visible !== false,
      };
    }
  }
  if (!isGlobeLayer()) return project(sample.lon, sample.lat, width, height);
  if (ensureBallisticAnimationConfig().referenceFrame === "trajectory-fixed") {
    return globeProjectSceneAltitude(
      ballisticAnimationSampleLongitude(entry, sample),
      sample.lat,
      sample.altitudeM / 1000,
      width,
      height,
    );
  }
  return globeProjectAltitude(sample.lon, sample.lat, sample.altitudeM / 1000, width, height);
}

function ballisticAnimationVisual(sample, stageColor) {
  const heat = reentryHeatVisual(sample?.convectiveHeatFluxWm2);
  const pressureWeight = smoothstep(0.04, 18, Number(sample?.dynamicPressurePa) || 0);
  const heatWeight = smoothstep(0.0001, 0.2, heat.intensity);
  const aeroWeight = pressureWeight * heatWeight;
  const glowOpacity = smoothstep(0.001, 0.34, aeroWeight);
  const markerBlend = smoothstep(0, 0.42, aeroWeight);
  const stageRgb = hexRgb(stageColor || "#ff5b61");
  const heatRgb = reentryGlowRgb(heat.intensity);
  const phaseRgb = mixRgb(stageRgb, heatRgb, smoothstep(0.01, 0.72, aeroWeight));
  const markerFillRgb = mixRgb([255, 253, 242], reentryGlowRgb(clamp(heat.intensity * 1.04 + 0.02, 0, 1)), markerBlend);
  const markerStrokeRgb = mixRgb(stageRgb, heatRgb, markerBlend);
  return {
    aero: glowOpacity > 0.001,
    aeroWeight,
    glowOpacity,
    heat,
    phaseColor: rgbaFromRgb(phaseRgb, 0.46 + aeroWeight * 0.52),
    glowOuterColor: reentryGlowColor(heat.intensity, aeroWeight * (0.05 + heat.brightness * 0.2)),
    glowInnerColor: reentryGlowColor(heat.intensity, aeroWeight * (0.14 + heat.brightness * 0.42)),
    markerFillColor: rgbaFromRgb(markerFillRgb, 1),
    markerStrokeColor: rgbaFromRgb(markerStrokeRgb, 0.96),
  };
}

function drawBallisticAnimationVisualSegment(ctx, start, end, startVisual, endVisual) {
  if (!start || !end || start.visible === false || end.visible === false) return;
  const aeroWeight = (Number(startVisual.aeroWeight) + Number(endVisual.aeroWeight)) / 2;
  const areaScale = (startVisual.heat.areaScale + endVisual.heat.areaScale) / 2;
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = segmentColorGradient(ctx, start, end, startVisual.phaseColor, endVisual.phaseColor);
  ctx.lineWidth = 1.7 + areaScale * (0.8 + aeroWeight * 1.2);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  ctx.restore();
}

function reentryGlowRgb(value) {
  const t = clamp(Number(value) || 0, 0, 1);
  for (let index = 1; index < REENTRY_GLOW_COLOR_STOPS.length; index += 1) {
    const [rightPosition, rightColor] = REENTRY_GLOW_COLOR_STOPS[index];
    const [leftPosition, leftColor] = REENTRY_GLOW_COLOR_STOPS[index - 1];
    if (t > rightPosition) continue;
    const fraction = (t - leftPosition) / Math.max(1e-9, rightPosition - leftPosition);
    return leftColor.map((channel, channelIndex) => Math.round(channel + (rightColor[channelIndex] - channel) * fraction));
  }
  return [...REENTRY_GLOW_COLOR_STOPS[REENTRY_GLOW_COLOR_STOPS.length - 1][1]];
}

function reentryGlowColor(value, alpha = 1) {
  const [red, green, blue] = reentryGlowRgb(value);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(Number(alpha) || 0, 0, 1)})`;
}

function reentryHeatColor(value, alpha = 1) {
  return rgbaFromRgb(reentryGlowRgb(value), alpha);
}

function reentryHeatVisual(convectiveHeatFluxWm2) {
  const flux = Math.max(0, Number(convectiveHeatFluxWm2) || 0);
  const intensity = clamp(1 - Math.exp(-flux / REENTRY_GLOW_REFERENCE_W_M2), 0, 1);
  return {
    flux,
    intensity,
    areaScale: Math.sqrt(intensity),
    brightness: intensity ** 0.55,
  };
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((Number(value) - edge0) / Math.max(1e-9, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hexRgb(hex) {
  const normalized = String(hex || "#ffffff").replace("#", "").padEnd(6, "f").slice(0, 6);
  return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) || 0);
}

function mixRgb(left, right, fraction) {
  const t = clamp(Number(fraction) || 0, 0, 1);
  return left.map((channel, index) => Math.round(channel + (right[index] - channel) * t));
}

function rgbaFromRgb(rgb, alpha = 1) {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp(Number(alpha) || 0, 0, 1)})`;
}

function trajectoryLabelPoint(projected, width, height) {
  const visible = projected.filter((point) => point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
  const candidates = visible.length ? visible : projected;
  return candidates[Math.floor(candidates.length * 0.55)] || projected[Math.floor(projected.length / 2)];
}

function drawTrajectoryLengthLabel(ctx, point, text, color, width, height) {
  if (!point || !text) return;
  ctx.save();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.font = "12px Segoe UI, Arial";
  const metrics = ctx.measureText(text);
  const boxWidth = metrics.width + 18;
  const boxHeight = 24;
  const x = clamp(point.x + 12, 8, Math.max(8, width - boxWidth - 8));
  const y = clamp(point.y - 34, 8, Math.max(8, height - boxHeight - 8));
  ctx.fillStyle = "rgba(7, 13, 15, 0.86)";
  ctx.strokeStyle = hexToRgba(color, 0.96);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, boxWidth, boxHeight, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#f5fbff";
  ctx.fillText(text, x + 9, y + 16);
  ctx.restore();
}

function drawLandmarks(ctx, width, height) {
  const showLabels = state.landmarkLabelsEnabled;
  if (isGlobeLayer() && state.view.zoom < 1 && !showLabels) return;
  for (const landmark of LANDMARKS) {
    if (!isLandmarkVisible(landmark.id)) continue;
    const point = project(landmark.lon, landmark.lat, width, height);
    if (point.visible === false) continue;
    if (point.x < -24 || point.x > width + 24 || point.y < -24 || point.y > height + 24) continue;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = landmark.color;
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 1.6;
    const size = showLabels ? 8 : 7;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x - size * 0.86, point.y + size * 0.65);
    ctx.lineTo(point.x + size * 0.86, point.y + size * 0.65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    if (!showLabels) {
      ctx.restore();
      continue;
    }
    ctx.shadowBlur = 0;
    ctx.font = "12px Segoe UI, Arial";
    const labelX = point.x + (landmark.callout?.dx ?? 11);
    const labelY = point.y + (landmark.callout?.dy ?? 4);
    const metrics = ctx.measureText(landmark.label);
    if (landmark.callout) {
      const elbowX = labelX + (landmark.callout.dx < 0 ? metrics.width + 8 : -8);
      const elbowY = labelY - 8;
      ctx.strokeStyle = hexToRgba(landmark.color, 0.9);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y + size * 0.3);
      ctx.lineTo(elbowX, point.y + size * 0.3);
      ctx.lineTo(elbowX, elbowY);
      ctx.lineTo(labelX - 5, elbowY);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(13, 18, 22, 0.84)";
    ctx.strokeStyle = hexToRgba(landmark.color, 0.95);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(labelX - 6, labelY - 15, metrics.width + 12, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff4f5";
    ctx.fillText(landmark.label, labelX, labelY);
    ctx.restore();
  }
}

function drawLaunchSites(ctx, width, height) {
  if (!state.launchRingsEnabled || (isGlobeLayer() && state.view.zoom < 1)) {
    els.canvas.dataset.launchRingCount = "0";
    return;
  }
  const sites = launchSiteGroups(launchForecastsForCurrentWindow(), { respectLandmarkVisibility: true });
  if (!sites.length) {
    els.canvas.dataset.launchRingCount = "0";
    return;
  }
  let drawnRingCount = 0;
  for (const site of sites) {
    const point = project(site.lon, site.lat, width, height);
    if (point.visible === false) continue;
    if (point.x < -34 || point.x > width + 34 || point.y < -34 || point.y > height + 34) continue;
    const selected = site.id === state.selectedLaunchSiteId;
    const hovered = site.id === state.hoverLaunchSiteId;
    const radius = selected ? 18 : hovered ? 16 : 14;
    const path = new Path2D();
    path.arc(point.x, point.y, radius, 0, Math.PI * 2);
    state.launchSitePaths.push({ siteId: site.id, path });

    ctx.save();
    ctx.lineWidth = selected ? 3 : 2.2;
    ctx.strokeStyle = hexToRgba(LAUNCH_SITE_COLOR, selected || hovered ? 1 : 0.86);
    ctx.fillStyle = hexToRgba(LAUNCH_SITE_COLOR, selected ? 0.18 : 0.1);
    ctx.shadowColor = "rgba(0, 0, 0, 0.42)";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = "700 11px Segoe UI, Arial";
    const text = String(site.count);
    const metrics = ctx.measureText(text);
    ctx.fillStyle = "rgba(10, 14, 14, 0.92)";
    ctx.beginPath();
    ctx.roundRect(point.x - metrics.width / 2 - 5, point.y - radius - 15, metrics.width + 10, 17, 6);
    ctx.fill();
    ctx.fillStyle = "#fff8dc";
    ctx.fillText(text, point.x - metrics.width / 2, point.y - radius - 3);
    ctx.restore();
    drawnRingCount += 1;
  }
  els.canvas.dataset.launchRingCount = String(drawnRingCount);
}

function drawNoShapeMarkers(ctx, width, height) {
  const markers = state.filtered.filter((item) => !item.hasGeometry && item.center);
  for (const item of markers) {
    const p = project(item.center.lon, item.center.lat, width, height);
    if (p.visible === false) continue;
    ctx.fillStyle = item.color;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, item.id === state.selectedId ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawGeometry(ctx, geometry, width, height, options = {}) {
  const paint = options.paint !== false;
  if (geometry.type === "Polygon") return drawGeoRings(ctx, geometry.coordinates, width, height, paint);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((rings) => drawGeoRings(ctx, rings, width, height, paint));
  }
  if (geometry.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    const p = project(lon, lat, width, height);
    if (p.visible === false) return [];
    const path = new Path2D();
    path.moveTo(p.x, p.y - 7);
    path.lineTo(p.x + 7, p.y);
    path.lineTo(p.x, p.y + 7);
    path.lineTo(p.x - 7, p.y);
    path.closePath();
    if (paint) {
      ctx.fill(path);
      ctx.stroke(path);
    }
    return [path];
  }
  if (geometry.type === "LineString") return drawGeoLine(ctx, geometry.coordinates, width, height, paint);
  return [];
}

function restrictionGeometryForDrawing(item) {
  return item?.geometry || null;
}

function isNotamHydropacNavareaItem(item) {
  if (isHydropacItem(item) || isNavareaItem(item) || isMsaWarningItem(item)) return true;
  const type = String(item?.type || item?.category || "").toUpperCase();
  return type.includes("NOTAM") || Boolean(item?.notamId);
}

function simplifyComplexRestrictionGeometry(geometry) {
  if (geometry.type === "Polygon") {
    const rings = simplifiedDisplayRings(geometry.coordinates || []);
    return rings ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = (geometry.coordinates || [])
      .map((rings) => simplifiedDisplayRings(rings))
      .filter(Boolean)
      .map((rings) => [rings[0]]);
    return polygons.length ? { type: "MultiPolygon", coordinates: polygons } : null;
  }
  return null;
}

function simplifiedDisplayRings(rings) {
  const cleanRings = (rings || [])
    .flatMap((ring) => splitDisplayClosedLoops(ring))
    .map((ring) => removeClosingVertex(ring))
    .filter((ring) => ring.length >= 3);
  if (!cleanRings.length) return null;
  const outer = cleanRings
    .map((ring) => ({ ring, area: Math.abs(planarRingArea(unwrapRingForArea(ring))) }))
    .sort((a, b) => b.area - a.area)[0]?.ring;
  if (!outer) return null;
  const finalRing = shouldHullRestrictionRing(outer) ? convexHullRing(outer) : outer;
  return finalRing?.length >= 3 ? [closeRing(finalRing)] : [closeRing(outer)];
}

function splitDisplayClosedLoops(ring) {
  const clean = removeClosingVertex(ring);
  if (clean.length < 3) return [];
  const loops = [];
  let current = [];
  for (const coord of clean) {
    current.push(coord);
    if (current.length >= 4 && sameDisplayVertex(coord, current[0])) {
      loops.push(removeClosingVertex(current));
      current = [];
    }
  }
  if (current.length >= 3) loops.push(current);
  return loops.length ? loops : [clean];
}

function sameDisplayVertex(a, b) {
  return Math.abs(Number(a?.[0]) - Number(b?.[0])) < 1e-9 && Math.abs(Number(a?.[1]) - Number(b?.[1])) < 1e-9;
}

function shouldHullRestrictionRing(ring) {
  const closed = closeRing(ring);
  const metrics = clientRingMetrics(closed);
  if (!metrics) return false;
  return (
    metrics.selfIntersects ||
    metrics.pointCount > 80 ||
    (metrics.pointCount >= 10 && metrics.maxSegmentRatio > 90 && metrics.maxSegmentKm > 80) ||
    (metrics.pointCount >= 8 && metrics.maxSegmentKm > 650 && metrics.minAngleDeg < 7)
  );
}

function unwrapRingForArea(ring) {
  const clean = removeClosingVertex(ring);
  if (!clean.length) return [];
  const unwrapped = [];
  let previousLon = normalizeLon(clean[0][0]);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, lat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, lat]);
  }
  return unwrapped;
}

function convexHullRing(ring) {
  const points = unwrapRingForArea(ring);
  const unique = [];
  const seen = new Set();
  for (const [lon, lat] of points) {
    const key = `${Math.round(lon * 1e7)}:${Math.round(lat * 1e7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push([lon, lat]);
  }
  if (unique.length < 3) return null;
  unique.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (origin, a, b) => (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function closeRing(ring) {
  const clean = removeClosingVertex(ring);
  if (!clean.length) return [];
  const first = clean[0];
  const last = clean[clean.length - 1];
  return Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9 ? clean : [...clean, [...first]];
}

function drawGeoLine(ctx, coordinates, width, height, paint = true) {
  const normalized = normalizeLineForDrawing(coordinates);
  if (!normalized?.length) return [];
  const projected = normalized.map(([lon, lat]) => projectUnwrapped(lon, lat, width, height));
  if (isGlobeLayer() && projected.some((point) => point.visible === false)) return [];
  if (!projectedIntersectsViewport(projected, width, height)) return [];
  const path = new Path2D();
  projected.forEach((point, index) => {
    if (index === 0) path.moveTo(point.x, point.y);
    else path.lineTo(point.x, point.y);
  });
  if (paint) ctx.stroke(path);
  return [path];
}

function normalizeLineForDrawing(coordinates) {
  const clean = (coordinates || [])
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 2) return null;
  const unwrapped = [];
  let previousLon = normalizeLonNear(clean[0][0], state.view.lon);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, rawLat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, clamp(rawLat, -85, 85)]);
  }
  if (isGlobeLayer()) return unwrapped;
  const avgLon = unwrapped.reduce((sum, [lon]) => sum + lon, 0) / unwrapped.length;
  const shift = Math.round((state.view.lon - avgLon) / 360) * 360;
  return unwrapped.map(([lon, lat]) => [lon + shift, lat]);
}

function drawGeoRings(ctx, rings, width, height, paint = true) {
  if (isGlobeLayer()) return drawGlobeGeoRings(ctx, rings, width, height, paint);
  const path = new Path2D();
  let added = false;
  let ringReferenceLon = state.view.lon;
  const worldSize = flatProjectionFrameFor(width, height).worldSize;
  for (const ring of rings) {
    const normalized = normalizeRingForDrawing(ring, ringReferenceLon);
    if (!normalized) continue;
    if (!added) ringReferenceLon = averageRingLongitude(normalized);
    const projected = normalized.map(([lon, lat]) => projectUnwrapped(lon, lat, width, height));
    const minX = Math.min(...projected.map((point) => point.x));
    const maxX = Math.max(...projected.map((point) => point.x));
    const firstCopy = Math.ceil(-maxX / worldSize);
    const lastCopy = Math.floor((width - minX) / worldSize);
    for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
      projected.forEach((point, index) => {
        const x = point.x + copy * worldSize;
        if (index === 0) path.moveTo(x, point.y);
        else path.lineTo(x, point.y);
      });
      path.closePath();
      added = true;
    }
  }
  if (!added) return [];
  if (paint) {
    ctx.fill(path, "evenodd");
    ctx.stroke(path);
  }
  return [path];
}

function drawGlobeGeoRings(ctx, rings, width, height, paint = true) {
  const path = new Path2D();
  let added = false;
  const params = globeParams(width, height);
  for (const ring of rings) {
    const source = globeRingProjectionSource(ring);
    if (!source) continue;
    const projected = simplifyProjectedClosedRing(
      GLOBE_CAMERA?.projectCartesian
        ? source.vectors.map((vector) => GLOBE_CAMERA.projectCartesian(vector, params, true))
        : source.coordinates.map(([lon, lat]) => globeProjectWithParams(lon, lat, params)),
      isInteractiveRender() ? 1.45 : 0.4,
    );
    if (!projected.every((point) => point.visible)) continue;
    if (!projectedIntersectsViewport(projected, width, height)) continue;
    projected.forEach((point, index) => {
      if (index === 0) path.moveTo(point.x, point.y);
      else path.lineTo(point.x, point.y);
    });
    path.closePath();
    added = true;
  }
  if (!added) return [];
  if (paint) {
    ctx.fill(path, "evenodd");
    ctx.stroke(path);
  }
  return [path];
}

function globeRingProjectionSource(ring) {
  if (!Array.isArray(ring)) return null;
  const cached = globeRingUnitVectorCache.get(ring);
  if (cached) return cached;
  const coordinates = ring
    .map(([lon, lat]) => [Number(lon), clamp(Number(lat), -90, 90)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (coordinates.length < 3) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) coordinates.push([...first]);
  const source = {
    coordinates,
    vectors: GLOBE_CAMERA?.spherePoint ? coordinates.map(([lon, lat]) => GLOBE_CAMERA.spherePoint(lon, lat, 1)) : [],
  };
  globeRingUnitVectorCache.set(ring, source);
  return source;
}

function simplifyProjectedClosedRing(points, tolerancePx) {
  if (!Array.isArray(points) || points.length <= 24 || tolerancePx <= 0) return points;
  const open = [...points];
  if (open.length > 1 && Math.hypot(open[0].x - open[open.length - 1].x, open[0].y - open[open.length - 1].y) < 1e-7) {
    open.pop();
  }
  if (open.length <= 24) return points;
  let splitIndex = 1;
  let maxDistance = -1;
  for (let index = 1; index < open.length; index += 1) {
    const distance = Math.hypot(open[index].x - open[0].x, open[index].y - open[0].y);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  const firstHalf = simplifyProjectedOpenPath(open.slice(0, splitIndex + 1), tolerancePx);
  const secondHalf = simplifyProjectedOpenPath([...open.slice(splitIndex), open[0]], tolerancePx);
  const simplified = [...firstHalf.slice(0, -1), ...secondHalf.slice(0, -1)];
  if (simplified.length < 3) return points;
  simplified.push({ ...simplified[0] });
  return simplified;
}

function simplifyProjectedOpenPath(points, tolerancePx) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [startIndex, endIndex] = stack.pop();
    const start = points[startIndex];
    const end = points[endIndex];
    let maxDistance = tolerancePx;
    let splitIndex = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const distance = distanceToSegment(points[index], start, end);
      if (distance > maxDistance) {
        maxDistance = distance;
        splitIndex = index;
      }
    }
    if (splitIndex < 0) continue;
    keep[splitIndex] = 1;
    stack.push([startIndex, splitIndex], [splitIndex, endIndex]);
  }
  return points.filter((point, index) => keep[index]);
}

function normalizeRingForGlobe(ring) {
  const clean = ring
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 3) return null;
  const unwrapped = [];
  let previousLon = normalizeLonNear(clean[0][0], state.view.lon);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, rawLat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, clamp(rawLat, -85, 85)]);
  }
  const first = unwrapped[0];
  const last = unwrapped[unwrapped.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) unwrapped.push([...first]);
  return unwrapped;
}

function normalizeRingForDrawing(ring, worldReferenceLon = state.view.lon) {
  const clean = ring
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 3) return null;

  const unwrapped = [];
  let previousLon = normalizeLonNear(clean[0][0], worldReferenceLon);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, rawLat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, clamp(rawLat, -85, 85)]);
  }

  const lonValues = unwrapped.map(([lon]) => lon);
  const latValues = unwrapped.map(([, lat]) => lat);
  const lonSpan = Math.max(...lonValues) - Math.min(...lonValues);
  const latSpan = Math.max(...latValues) - Math.min(...latValues);
  if (lonSpan > MAX_NOTAM_DRAW_LON_SPAN || latSpan > MAX_NOTAM_DRAW_LAT_SPAN) return null;

  const avgLon = lonValues.reduce((sum, lon) => sum + lon, 0) / lonValues.length;
  const shift = Math.round((worldReferenceLon - avgLon) / 360) * 360;
  const shifted = unwrapped.map(([lon, lat]) => [lon + shift, lat]);
  const first = shifted[0];
  const last = shifted[shifted.length - 1];
  if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) shifted.push([...first]);
  return shifted;
}

function averageRingLongitude(ring) {
  const open = removeClosingVertex(ring);
  if (!open.length) return state.view.lon;
  return open.reduce((sum, coordinate) => sum + Number(coordinate?.[0] || 0), 0) / open.length;
}

function projectedIntersectsViewport(points, width, height) {
  if (!points?.length) return false;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let visible = !isGlobeLayer();
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.visible !== false) visible = true;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (!visible || !Number.isFinite(minX)) return false;
  const margin = Math.max(width, height) * 0.6;
  return maxX >= -margin && minX <= width + margin && maxY >= -margin && minY <= height + margin;
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(currentRenderDprCap(), window.devicePixelRatio || 1);
  const targetW = Math.max(1, Math.round(rect.width * dpr));
  const targetH = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  return ctx;
}

function currentRenderDprCap() {
  const baseCap = HIGH_PERFORMANCE_MODE
    ? RENDER_DPR_MAX
    : isInteractiveRender() ? INTERACTION_DPR_MAX : RENDER_DPR_MAX;
  return baseCap * (adaptivePerformanceState.qualityScale || 1);
}

function project(lon, lat, width, height) {
  if (isGlobeLayer()) return globeProject(lon, lat, width, height);
  const frame = flatProjectionFrameFor(width, height);
  const pointX = ((normalizeLon(lon) + 180) / 360) * frame.worldSize;
  let dx = pointX - frame.centerX;
  if (dx > frame.worldSize / 2) dx -= frame.worldSize;
  if (dx < -frame.worldSize / 2) dx += frame.worldSize;
  return {
    x: width / 2 + dx,
    y: height / 2 + mercatorYUnit(lat) * frame.worldSize - frame.centerY,
  };
}

function projectUnwrapped(lon, lat, width, height) {
  if (isGlobeLayer()) return globeProject(lon, lat, width, height);
  const frame = flatProjectionFrameFor(width, height);
  return {
    x: width / 2 + ((lon + 180) / 360) * frame.worldSize - frame.centerX,
    y: height / 2 + mercatorYUnit(lat) * frame.worldSize - frame.centerY,
  };
}

function projectUnwrappedPolyline(points, width, height) {
  if (!Array.isArray(points) || !points.length) return [];
  if (isGlobeLayer()) {
    return points.map((point) => {
      const lon = Array.isArray(point) ? Number(point[0]) : Number(point?.lon);
      const lat = Array.isArray(point) ? Number(point[1]) : Number(point?.lat);
      return globeProject(lon, lat, width, height);
    });
  }
  const frame = flatProjectionFrameFor(width, height);
  const coordinates = points.map((point) => ({
    lon: Array.isArray(point) ? Number(point[0]) : Number(point?.lon),
    lat: Array.isArray(point) ? Number(point[1]) : Number(point?.lat),
  }));
  let anchorLon = 0;
  let validCount = 0;
  for (const point of coordinates) {
    if (!Number.isFinite(point.lon)) continue;
    anchorLon += point.lon;
    validCount += 1;
  }
  anchorLon = validCount ? anchorLon / validCount : normalizeLon(state.view.lon);
  const worldCopyShift = Math.round((normalizeLon(state.view.lon) - anchorLon) / 360) * 360;
  return coordinates.map((point) => ({
    x: width / 2 + ((point.lon + worldCopyShift + 180) / 360) * frame.worldSize - frame.centerX,
    y: height / 2 + mercatorYUnit(point.lat) * frame.worldSize - frame.centerY,
  }));
}

function unproject(x, y, width, height) {
  if (isGlobeLayer()) return globeUnproject(x, y, width, height);
  const frame = flatProjectionFrameFor(width, height);
  return worldToLonLat(frame.centerX + x - width / 2, frame.centerY + y - height / 2, frame.zoom);
}

function buildFlatProjectionFrame(width, height) {
  const zoom = state.view.zoom;
  const worldSize = TILE_SIZE * 2 ** zoom;
  return {
    width,
    height,
    zoom,
    lon: state.view.lon,
    lat: state.view.lat,
    worldSize,
    centerX: ((normalizeLon(state.view.lon) + 180) / 360) * worldSize,
    centerY: mercatorYUnit(state.view.lat) * worldSize,
  };
}

function flatProjectionFrameFor(width, height) {
  if (
    flatProjectionFrame?.width === width &&
    flatProjectionFrame?.height === height &&
    flatProjectionFrame?.zoom === state.view.zoom &&
    flatProjectionFrame?.lon === state.view.lon &&
    flatProjectionFrame?.lat === state.view.lat
  ) {
    return flatProjectionFrame;
  }
  flatProjectionFrame = buildFlatProjectionFrame(width, height);
  return flatProjectionFrame;
}

function globeParams(width, height) {
  const signature = [
    Math.round(width),
    Math.round(height),
    Number(state.view.lon).toFixed(8),
    Number(state.view.lat).toFixed(8),
    Number(state.view.zoom).toFixed(7),
    Number(state.view.globeTilt || 0).toFixed(6),
    Number(state.view.globeBearing || 0).toFixed(6),
    Number(state.view.globeFovDeg || 42).toFixed(4),
  ].join(":");
  if (globeParamsMemo?.signature === signature) return globeParamsMemo.params;
  if (GLOBE_CAMERA) {
    const params = GLOBE_CAMERA.createParams(state.view, width, height);
    globeParamsMemo = { signature, params };
    return params;
  }
  const zoomFactor = 2 ** ((state.view.zoom - GLOBE_ZOOM_RADIUS_REFERENCE) / 3.15);
  const minSide = Math.min(width, height);
  const maxSide = Math.max(width, height);
  const radius = clamp(minSide * 0.42 * zoomFactor, minSide * 0.035, maxSide * 4.6);
  const lat = clamp(state.view.lat, -82, 82);
  const latRad = toRad(lat);
  const params = {
    cx: width / 2,
    cy: height / 2,
    radius,
    lon: state.view.lon,
    lat,
    tilt: clamp(Number(state.view.globeTilt) || 0, 0, 80),
    bearing: normalizeBearing(Number(state.view.globeBearing) || 0),
    sinLat: Math.sin(latRad),
    cosLat: Math.cos(latRad),
  };
  globeParamsMemo = { signature, params };
  return params;
}

function globeProject(lon, lat, width, height) {
  const params = globeParams(width, height);
  return globeProjectWithParams(lon, lat, params);
}

function globeProjectAltitude(lon, lat, altitudeKm, width, height) {
  const params = globeParams(width, height);
  const displayLon = globeDisplayLongitude(lon);
  if (GLOBE_CAMERA) return { ...GLOBE_CAMERA.project(displayLon, lat, altitudeKm, params), altitudeKm: Math.max(0, Number(altitudeKm) || 0) };
  return globeProjectWithParams(displayLon, lat, params, true);
}

function globeProjectSceneAltitude(lon, lat, altitudeKm, width, height) {
  const params = globeParams(width, height);
  const displayLon = normalizeLon(Number(lon) || 0);
  if (GLOBE_CAMERA) return { ...GLOBE_CAMERA.project(displayLon, lat, altitudeKm, params), altitudeKm: Math.max(0, Number(altitudeKm) || 0) };
  return globeProjectWithParams(displayLon, lat, params, true);
}

function globeProjectWithParams(lon, lat, params, longitudeAlreadyAdjusted = false) {
  const displayLon = longitudeAlreadyAdjusted ? lon : globeDisplayLongitude(lon);
  if (GLOBE_CAMERA) return GLOBE_CAMERA.project(displayLon, lat, 0, params);
  const point = spherePoint(displayLon - params.lon, lat - params.lat, 1);
  return { x: params.cx + params.radius * point.x, y: params.cy - params.radius * point.y, visible: point.z >= 0, globeZ: point.z };
}

function globeUnproject(x, y, width, height) {
  return globeUnprojectWithParams(x, y, globeParams(width, height));
}

function globeUnprojectWithParams(x, y, params) {
  if (GLOBE_CAMERA) {
    const point = GLOBE_CAMERA.unproject(x, y, params);
    return point ? { ...point, lon: normalizeLon(point.lon - globeEarthRotationDeg()) } : null;
  }
  const gx = (x - params.cx) / params.radius;
  const gy = -(y - params.cy) / params.radius;
  if (gx * gx + gy * gy > 1) return null;
  return { lon: normalizeLon(params.lon + toDeg(Math.asin(gx)) - globeEarthRotationDeg()), lat: clamp(params.lat + toDeg(Math.asin(gy)), -85, 85) };
}

function normalizeBearing(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeLongitudeDeltaDeg(value) {
  return ((Number(value) + 540) % 360) - 180;
}

function globeViewSnapshot() {
  return {
    lon: normalizeLon(state.view.lon),
    lat: clamp(state.view.lat, -89.5, 89.5),
    zoom: clamp(state.view.zoom, GLOBE_MIN_ZOOM, MAX_ZOOM),
    globeTilt: clamp(Number(state.view.globeTilt) || 0, 0, 80),
    globeBearing: normalizeBearing(Number(state.view.globeBearing) || 0),
  };
}

function stopGlobeInertia() {
  if (!globeInertiaFrame) return;
  cancelAnimationFrame(globeInertiaFrame);
  globeInertiaFrame = 0;
}

function startGlobeInertia(mode, velocityX, velocityY) {
  stopGlobeInertia();
  let vx = clamp(Number(velocityX) || 0, -0.8, 0.8);
  let vy = clamp(Number(velocityY) || 0, -0.8, 0.8);
  if (Math.hypot(vx, vy) < 0.025) {
    scheduleDraw();
    return;
  }
  let previousAt = performance.now();
  const step = (now) => {
    if (!isGlobeLayer() || state.view.drag || state.trajectoryDrag) {
      globeInertiaFrame = 0;
      scheduleDraw();
      return;
    }
    const elapsed = clamp(now - previousAt, 8, 32);
    previousAt = now;
    const dx = vx * elapsed;
    const dy = vy * elapsed;
    if (mode === "globeOrbit") {
      state.view.globeBearing = normalizeBearing(state.view.globeBearing + dx * 0.24);
      state.view.globeTilt = clamp(state.view.globeTilt + dy * 0.2, 0, 80);
    } else if (GLOBE_CAMERA) {
      const rect = els.canvas.getBoundingClientRect();
      const nextView = GLOBE_CAMERA.panView(state.view, dx, dy, rect.width, rect.height);
      state.view.lon = nextView.lon;
      state.view.lat = nextView.lat;
    }
    vx *= 0.82 ** (elapsed / 16.67);
    vy *= 0.82 ** (elapsed / 16.67);
    scheduleDraw();
    if (Math.hypot(vx, vy) < 0.006) {
      globeInertiaFrame = 0;
      scheduleDraw();
      return;
    }
    globeInertiaFrame = requestAnimationFrame(step);
  };
  globeInertiaFrame = requestAnimationFrame(step);
}

function startDrag(event) {
  stopGlobeInertia();
  if (isGlobeLayer() && (event.button === 1 || (event.button === 0 && event.shiftKey) || event.button === 2)) {
    event.preventDefault();
    const rect = els.canvas.getBoundingClientRect();
    els.canvas.setPointerCapture(event.pointerId);
    state.view.drag = {
      mode: event.button === 2 ? "globeDolly" : "globeOrbit",
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      localX: event.clientX - rect.left,
      localY: event.clientY - rect.top,
      startView: globeViewSnapshot(),
      lastX: event.clientX,
      lastY: event.clientY,
      lastAt: performance.now(),
      velocityX: 0,
      velocityY: 0,
      moved: false,
    };
    return;
  }
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (event.button === 0 && hitTestSatelliteSwathPlanner(x, y)) {
    event.preventDefault();
    els.canvas.setPointerCapture(event.pointerId);
    state.satelliteSwathDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    return;
  }
  if (!state.ballisticPickStageId && !state.ballisticTargetPickStageId && !state.ballisticPoweredStartPickTrackId && state.trajectoryEnabled && !activeTrajectory().manualLocked) {
    const trajectoryHit = hitTestTrajectoryCurve(x, y, rect.width, rect.height);
    if (trajectoryHit) {
      const track = state.trajectoryTracks.find((candidate) => candidate.id === trajectoryHit.trackId);
      els.canvas.setPointerCapture(event.pointerId);
      state.trajectoryDrag = {
        ...trajectoryHit,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        historyBefore: track ? trajectoryEditSnapshot(track) : null,
      };
      return;
    }
  }

  els.canvas.setPointerCapture(event.pointerId);
  const drag = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
  };
  if (isGlobeLayer()) {
    drag.mode = "globePan";
    drag.startView = globeViewSnapshot();
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastAt = performance.now();
    drag.velocityX = 0;
    drag.velocityY = 0;
  } else {
    const center = lonLatToWorld(state.view.lon, state.view.lat, state.view.zoom);
    drag.centerX = center.x;
    drag.centerY = center.y;
  }
  state.view.drag = drag;
}

function movePointer(event) {
  if (state.satelliteSwathDrag && state.satelliteSwathDrag.pointerId === event.pointerId) {
    dragSatelliteSwathPlanner(event);
    return;
  }
  if (state.trajectoryDrag && state.trajectoryDrag.pointerId === event.pointerId) {
    dragTrajectoryCurve(event);
    return;
  }
  if (state.view.drag && state.view.drag.pointerId === event.pointerId) {
    dragMap(event);
    return;
  }
  pendingHoverPoint = { clientX: event.clientX, clientY: event.clientY };
  if (hoverFramePending) return;
  hoverFramePending = true;
  window.requestAnimationFrame(() => {
    hoverFramePending = false;
    const point = pendingHoverPoint;
    pendingHoverPoint = null;
    if (point && !state.view.drag && !state.trajectoryDrag) processPointerHover(point);
  });
}

function processPointerHover(event) {
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  if (state.tooltipPinned) {
    return;
  }
  const satelliteHit = hitTestSatellite(x, y);
  if (satelliteHit) {
    const changed = state.satelliteHoverId !== satelliteHit.id;
    state.satelliteHoverId = satelliteHit.id;
    clearTooltipHideTimer();
    showSatelliteTooltip(satelliteHit.id, event.clientX, event.clientY);
    if (changed) drawSatelliteOverlay();
    return;
  }
  if (state.satelliteHoverId) {
    state.satelliteHoverId = "";
    drawSatelliteOverlay();
  }
  const customHit = hitTestCustomCoordinate(x, y);
  if (customHit) {
    const changed = updateHoverState(customHit.id, [], "");
    clearTooltipHideTimer();
    showCustomCoordinateTooltip(customHit.id, event.clientX, event.clientY);
    if (changed) scheduleDraw();
    return;
  }
  const launchHit = hitTestLaunchSite(x, y);
  if (launchHit) {
    const changed = updateHoverState(null, [], launchHit.siteId);
    clearTooltipHideTimer();
    showLaunchTooltip(launchHit.siteId, event.clientX, event.clientY);
    if (changed) scheduleDraw();
    return;
  }
  const hits = hitTestStack(x, y, rect.width, rect.height);
  const hit = hits[0] || null;
  const changed = updateHoverState(hit?.id || null, hits.map((item) => item.id), "");
  if (hit) showTooltipStack(hits, event.clientX, event.clientY);
  else scheduleTooltipHide();
  if (changed) scheduleDraw();
}

function updateHoverState(nextHoverId, nextRestrictionIds, nextLaunchSiteId) {
  const nextSet = new Set(nextRestrictionIds || []);
  const changed =
    state.hoverId !== nextHoverId ||
    state.hoverLaunchSiteId !== nextLaunchSiteId ||
    !sameStringSet(state.hoverRestrictionIds, nextSet);
  if (!changed) return false;
  state.hoverId = nextHoverId;
  state.hoverRestrictionIds = nextSet;
  state.hoverLaunchSiteId = nextLaunchSiteId;
  return true;
}

function sameStringSet(a, b) {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function dragMap(event) {
  const drag = state.view.drag;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 4) drag.moved = true;
  if (isGlobeLayer()) {
    event.preventDefault();
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const now = performance.now();
    const elapsed = Math.max(4, now - (drag.lastAt || now));
    drag.velocityX = clamp((event.clientX - (drag.lastX ?? event.clientX)) / elapsed, -1.2, 1.2);
    drag.velocityY = clamp((event.clientY - (drag.lastY ?? event.clientY)) / elapsed, -1.2, 1.2);
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    drag.lastAt = now;
    const rect = els.canvas.getBoundingClientRect();
    if (drag.mode === "globeOrbit") {
      state.view.globeBearing = normalizeBearing(drag.startView.globeBearing + dx * 0.24);
      state.view.globeTilt = clamp(drag.startView.globeTilt + dy * 0.2, 0, 80);
    } else if (drag.mode === "globeDolly") {
      const nextZoom = clamp(drag.startView.zoom - dy * 0.015, GLOBE_MIN_ZOOM, MAX_ZOOM);
      state.view.lon = drag.startView.lon;
      state.view.lat = drag.startView.lat;
      state.view.zoom = nextZoom;
      state.view.globeBearing = drag.startView.globeBearing;
      state.view.globeTilt = drag.startView.globeTilt;
    } else if (GLOBE_CAMERA) {
      const nextView = GLOBE_CAMERA.panView(drag.startView, dx, dy, rect.width, rect.height);
      state.view.lon = nextView.lon;
      state.view.lat = nextView.lat;
    }
    state.hoverLaunchSiteId = "";
    hideTooltip();
    scheduleDraw();
    return;
  }
  const world = worldToLonLat(drag.centerX - (event.clientX - drag.x), drag.centerY - (event.clientY - drag.y), state.view.zoom);
  state.view.lon = world.lon;
  state.view.lat = world.lat;
  state.hoverLaunchSiteId = "";
  hideTooltip();
  scheduleDraw();
}

function endDrag(event) {
  if (state.satelliteSwathDrag && state.satelliteSwathDrag.pointerId === event.pointerId) {
    const completedDrag = state.satelliteSwathDrag;
    state.satelliteSwathDrag = null;
    state.view.suppressClick = Boolean(completedDrag.moved);
    state.view.suppressClickUntil = state.view.suppressClick ? performance.now() + 180 : 0;
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    if (completedDrag.moved) {
      satelliteGpuCoverageRevision += 1;
      satelliteCoverageRenderSignature = "";
    }
    syncSatelliteControls();
    drawSatelliteOverlay();
    return;
  }
  if (state.trajectoryDrag && state.trajectoryDrag.pointerId === event.pointerId) {
    const completedDrag = state.trajectoryDrag;
    state.view.suppressClick = true;
    state.view.suppressClickUntil = performance.now() + 180;
    state.trajectoryDrag = null;
    const track = state.trajectoryTracks.find((candidate) => candidate.id === completedDrag.trackId);
    if (track && completedDrag.moved) commitTrajectoryEdit(track, completedDrag.historyBefore);
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released.
    }
    if (track) {
      if (trajectoryMetricFrame) cancelAnimationFrame(trajectoryMetricFrame);
      trajectoryMetricFrame = 0;
      syncActiveTrajectoryState();
      renderTrajectoryPlan();
      renderList();
      updateTrajectoryCount();
    }
    scheduleDraw();
    return;
  }
  if (!state.view.drag || state.view.drag.pointerId !== event.pointerId) return;
  const completedDrag = state.view.drag;
  state.view.suppressClick = Boolean(completedDrag.moved);
  state.view.suppressClickUntil = state.view.suppressClick ? performance.now() + 180 : 0;
  state.view.drag = null;
  try {
    els.canvas.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture may already be released.
  }
  if (isGlobeLayer() && completedDrag.moved && ["globePan", "globeOrbit"].includes(completedDrag.mode)) {
    startGlobeInertia(completedDrag.mode, completedDrag.velocityX, completedDrag.velocityY);
  } else {
    scheduleDraw();
  }
}

function dragSatelliteSwathPlanner(event) {
  const drag = state.satelliteSwathDrag;
  const context = focusedSatelliteImagingContext();
  if (!drag || !context) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 2) drag.moved = true;
  const rect = els.canvas.getBoundingClientRect();
  const target = unproject(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  if (!target) return;
  const normalizedTarget = {
    lon: normalizeLon(Number(target.lon)),
    lat: clamp(Number(target.lat), -90, 90),
  };
  const pointing = SATELLITE_PAYLOADS?.imagingPointingSolution(context.position, normalizedTarget);
  state.satelliteSwathTargets.set(context.id, state.satelliteSwathMode === "angle-fixed" && pointing
    ? {
      mode: "angle-fixed",
      rollDeg: normalizeSatelliteSwathAngle(pointing.rollDeg),
      pitchDeg: normalizeSatelliteSwathAngle(pointing.pitchDeg),
    }
    : {
      mode: "ground-fixed",
      ...normalizedTarget,
      headingDeg: Number(context.position.headingDeg) || 0,
    });
  state.satelliteCoverageGeometryById.delete(context.id);
  renderSatelliteSwathPlannerStatus();
  scheduleDraw();
}

function dragTrajectoryCurve(event) {
  const drag = state.trajectoryDrag;
  const track = state.trajectoryTracks.find((candidate) => candidate.id === drag.trackId);
  if (!track || track.manualLocked) return;
  ensureTrajectoryPoints(track);
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 2) drag.moved = true;
  const rect = els.canvas.getBoundingClientRect();
  const lonLat = unproject(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  if (!lonLat) return;
  if (drag.type === "point") {
    const point = track.points.find((candidate) => candidate.id === drag.pointId);
    if (!point) return;
    point.lon = normalizeLon(lonLat.lon);
    point.lat = clamp(lonLat.lat, -85, 85);
  } else {
    if (!track.curveControls) track.curveControls = {};
    track.curveControls[drag.segmentKey] = {
      lon: normalizeLon(lonLat.lon),
      lat: clamp(lonLat.lat, -85, 85),
    };
  }
  requestTrajectoryCountUpdate();
  scheduleDraw();
}

function zoomMap(event) {
  event.preventDefault();
  const wheelScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
  const zoomDelta = isGlobeLayer()
    ? clamp(-event.deltaY * wheelScale * 0.0025, -1.25, 1.25)
    : event.deltaY < 0
      ? ZOOM_STEP
      : -ZOOM_STEP;
  const nextZoom = clamp(state.view.zoom + zoomDelta, isGlobeLayer() ? GLOBE_MIN_ZOOM : MIN_ZOOM, MAX_ZOOM);
  if (nextZoom === state.view.zoom) return;
  if (isGlobeLayer()) {
    stopGlobeInertia();
    const rect = els.canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const nextView = GLOBE_CAMERA
      ? GLOBE_CAMERA.zoomViewAt(state.view, nextZoom, localX, localY, rect.width, rect.height)
      : { ...state.view, zoom: nextZoom };
    state.view.lon = nextView.lon;
    state.view.lat = nextView.lat;
    state.view.zoom = nextView.zoom;
    updateCounts();
    scheduleDraw();
    return;
  }
  const rect = els.canvas.getBoundingClientRect();
  const focus = unproject(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  state.view.zoom = nextZoom;
  const focusAfter = unproject(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height);
  state.view.lon = normalizeLon(state.view.lon + focus.lon - focusAfter.lon);
  state.view.lat = clamp(state.view.lat + focus.lat - focusAfter.lat, -85, 85);
  updateCounts();
  scheduleDraw();
}

function hitTest(x, y, width, height) {
  return hitTestStack(x, y, width, height)[0] || null;
}

function pointWithinRestrictionBounds(point, bounds) {
  if (!point || !bounds) return true;
  const latitude = Number(point.lat);
  const longitude = normalizeLon(Number(point.lon));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < Number(bounds.minLat) - 1e-7 || latitude > Number(bounds.maxLat) + 1e-7) return false;
  const minLon = Number(bounds.minLon);
  const maxLon = Number(bounds.maxLon);
  const span = maxLon - minLon;
  if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || span < 0 || span > 180) return true;
  for (const shift of [-360, 0, 360]) {
    const shifted = longitude + shift;
    if (shifted >= minLon - 1e-7 && shifted <= maxLon + 1e-7) return true;
  }
  return false;
}

function hitTestStack(x, y, width, height) {
  const ctx = els.canvas.getContext("2d");
  const lonLat = unproject(x, y, width, height);
  if (!lonLat) return [];
  const drawn = state.drawableRestrictions || [];
  const drawnById = state.drawableRestrictionById || new Map();
  const candidates = restrictionHitCandidates(lonLat, drawn);
  const candidateIds = new Set(candidates.map((item) => item.id));
  const pathHits = new Map();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    if (state.restrictionPathsById?.size) {
      for (const restriction of candidates) {
        for (const item of state.restrictionPathsById.get(restriction.id) || []) {
          if (!pointWithinRestrictionBounds(lonLat, restrictionPickingBounds(restriction))) continue;
          if (!ctx.isPointInPath(item.path, x, y, item.fillRule || "nonzero")) continue;
          if (!isGlobeLayer() || !restriction.geometry || pointInRenderedRestriction(lonLat, restriction.geometry)) addRestrictionHit(pathHits, item);
        }
      }
    } else {
      for (let i = state.paths.length - 1; i >= 0; i -= 1) {
        const item = state.paths[i];
        if (!candidateIds.has(item.id)) continue;
        const restriction = item.item || drawnById.get(item.id);
        if (!pointWithinRestrictionBounds(lonLat, restrictionPickingBounds(restriction))) continue;
        if (!ctx.isPointInPath(item.path, x, y, item.fillRule || "nonzero")) continue;
        if (!isGlobeLayer() || !restriction?.geometry || pointInRenderedRestriction(lonLat, restriction.geometry)) addRestrictionHit(pathHits, item);
      }
    }
  } finally {
    ctx.restore();
  }
  if (pathHits.size) return sortRestrictionHits([...pathHits.values()]);

  const geometryHits = new Map();
  const orderById = restrictionHitSpatialIndex?.orderById || new Map();
  for (const item of candidates) {
    if (!pointWithinRestrictionBounds(lonLat, restrictionPickingBounds(item))) continue;
    if (item.hasGeometry && item.geometry && pointInRenderedRestriction(lonLat, item.geometry)) {
      addRestrictionHit(geometryHits, {
        id: item.id,
        hitArea: item.hitArea ?? geometryHitArea(item.geometry),
        hitOrder: orderById.get(item.id) ?? -1,
      });
    }
  }
  return sortRestrictionHits([...geometryHits.values()]);
}

function restrictionHitCandidates(point, drawn) {
  if (restrictionHitSpatialIndex?.source !== drawn || restrictionHitSpatialIndex.globe !== isGlobeLayer()) restrictionHitSpatialIndex = buildRestrictionHitSpatialIndex(drawn);
  const index = restrictionHitSpatialIndex;
  if (!index) return drawn;
  const key = restrictionHitCellKey(point.lon, point.lat, index.cellDeg);
  const candidates = index.cells.get(key) || [];
  if (els.canvas) {
    els.canvas.dataset.hitCandidateCount = String(candidates.length + index.unbounded.length);
    els.canvas.dataset.hitSourceCount = String(drawn.length);
  }
  if (!index.unbounded.length) return candidates;
  const merged = [...candidates];
  const seen = new Set(candidates.map((item) => item.id));
  for (const item of index.unbounded) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}

function buildRestrictionHitSpatialIndex(drawn) {
  const cellDeg = 8;
  const cells = new Map();
  const unbounded = [];
  const orderById = new Map();
  for (let order = 0; order < drawn.length; order += 1) {
    const item = drawn[order];
    orderById.set(item.id, order);
    const bounds = restrictionPickingBounds(item);
    if (!bounds || ![bounds.minLon, bounds.maxLon, bounds.minLat, bounds.maxLat].every(Number.isFinite)) {
      unbounded.push(item);
      continue;
    }
    const minLatCell = restrictionHitLatCell(bounds.minLat, cellDeg);
    const maxLatCell = restrictionHitLatCell(bounds.maxLat, cellDeg);
    for (const [minLon, maxLon] of restrictionHitLongitudeIntervals(bounds)) {
      const minLonCell = restrictionHitLonCell(minLon, cellDeg);
      const maxLonCell = restrictionHitLonCell(maxLon >= 180 ? 180 - 1e-9 : maxLon, cellDeg);
      for (let latCell = minLatCell; latCell <= maxLatCell; latCell += 1) {
        for (let lonCell = minLonCell; lonCell <= maxLonCell; lonCell += 1) {
          const key = `${lonCell}:${latCell}`;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(item);
        }
      }
    }
  }
  return { source: drawn, globe: isGlobeLayer(), cellDeg, cells, unbounded, orderById };
}

function restrictionHitLongitudeIntervals(bounds) {
  const minLon = Number(bounds.minLon);
  const maxLon = Number(bounds.maxLon);
  const span = maxLon - minLon;
  if (!Number.isFinite(span) || span < 0 || span >= 180) return [[-180, 180]];
  const west = normalizeLon(minLon);
  const east = west + span;
  return east <= 180 ? [[west, east]] : [[west, 180], [-180, east - 360]];
}

function restrictionHitCellKey(lon, lat, cellDeg) {
  return `${restrictionHitLonCell(lon, cellDeg)}:${restrictionHitLatCell(lat, cellDeg)}`;
}

function restrictionHitLonCell(lon, cellDeg) {
  return clamp(Math.floor((normalizeLon(Number(lon)) + 180) / cellDeg), 0, Math.ceil(360 / cellDeg) - 1);
}

function restrictionHitLatCell(lat, cellDeg) {
  return clamp(Math.floor((clamp(Number(lat), -90, 90) + 90) / cellDeg), 0, Math.ceil(180 / cellDeg) - 1);
}

function bestRestrictionHit(candidates) {
  return sortRestrictionHits(candidates)[0] || null;
}

function addRestrictionHit(map, candidate) {
  if (!candidate?.id) return;
  const current = map.get(candidate.id);
  if (!current || compareRestrictionHits(candidate, current) < 0) {
    map.set(candidate.id, {
      id: candidate.id,
      hitArea: Number.isFinite(candidate.hitArea) ? candidate.hitArea : Number.POSITIVE_INFINITY,
      hitOrder: Number.isFinite(candidate.hitOrder) ? candidate.hitOrder : -1,
    });
  }
}

function sortRestrictionHits(candidates) {
  return [...(candidates || [])].sort(compareRestrictionHits).map((candidate) => ({ id: candidate.id, hitArea: candidate.hitArea, hitOrder: candidate.hitOrder }));
}

function compareRestrictionHits(a, b) {
  const aArea = Number.isFinite(a?.hitArea) ? a.hitArea : Number.POSITIVE_INFINITY;
  const bArea = Number.isFinite(b?.hitArea) ? b.hitArea : Number.POSITIVE_INFINITY;
  if (Math.abs(aArea - bArea) > 1e-9) return aArea - bArea;
  const aOrder = Number.isFinite(a?.hitOrder) ? a.hitOrder : -1;
  const bOrder = Number.isFinite(b?.hitOrder) ? b.hitOrder : -1;
  return bOrder - aOrder;
}

function hitTestLaunchSite(x, y) {
  const ctx = els.canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    for (let i = state.launchSitePaths.length - 1; i >= 0; i -= 1) {
      const item = state.launchSitePaths[i];
      if (ctx.isPointInPath(item.path, x, y)) return item;
    }
  } finally {
    ctx.restore();
  }
  return null;
}

function hitTestCustomCoordinate(x, y) {
  if (!state.customCoordinatesEnabled || !state.customPaths.length) return null;
  const ctx = els.canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    for (let i = state.customPaths.length - 1; i >= 0; i -= 1) {
      const item = state.customPaths[i];
      if (item.geometryType === "LineString") {
        ctx.lineWidth = Math.max(12, (item.lineWidth || 2) + 8);
        if (ctx.isPointInStroke(item.path, x, y)) return item;
      } else if (ctx.isPointInPath(item.path, x, y)) {
        return item;
      }
    }
  } finally {
    ctx.restore();
  }
  return null;
}

function hitTestTrajectoryCurve(x, y, width, height) {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (track.manualLocked) return null;
  const selected = selectedTrajectoryItems(track);
  if (!selected.length) return null;

  for (let index = selected.length - 1; index >= 0; index -= 1) {
    const target = selected[index].target;
    const point = project(target.lon, target.lat, width, height);
    if (Math.hypot(point.x - x, point.y - y) <= 12) {
      return { type: "point", trackId: track.id, pointId: selected[index].point.id };
    }
  }

  if (track.geodesic) return null;

  for (let index = 0; index < selected.length - 1; index += 1) {
    const key = segmentControlKey(selected, index);
    const control = track.curveControls?.[key];
    if (!control) continue;
    const point = project(control.lon, control.lat, width, height);
    if (Math.hypot(point.x - x, point.y - y) <= 11) {
      return { type: "control", trackId: track.id, segmentKey: key };
    }
  }

  const geometry = cachedTrajectoryGeometry(track, selected);
  const samples = geometry.samples;
  const projected = cachedTrajectoryProjection(track, geometry, width, height).map((point, index) => ({
    ...point,
    segmentIndex: samples[index]?.segmentIndex ?? 0,
  }));
  let best = null;
  for (let index = 1; index < projected.length; index += 1) {
    const distance = distanceToSegment({ x, y }, projected[index - 1], projected[index]);
    if (!best || distance < best.distance) {
      best = { distance, segmentIndex: projected[index].segmentIndex };
    }
  }
  if (!best || best.distance > 13 || best.segmentIndex >= selected.length - 1) return null;
  return {
    type: "curve",
    trackId: track.id,
    segmentKey: segmentControlKey(selected, best.segmentIndex),
  };
}

function distanceToSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (!lengthSq) return Math.hypot(point.x - a.x, point.y - a.y);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1);
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function pointInGeometry(point, geometry) {
  if (geometry.type === "Polygon") return pointInPolygon(point, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => pointInPolygon(point, polygon));
  return false;
}

function pointInPolygon(point, rings) {
  if (!rings?.length || !pointInRing(point, rings[0])) return false;
  return !rings.slice(1).some((ring) => pointInRing(point, ring));
}

function pointInRing(point, ring) {
  let inside = false;
  const unwrapped = unwrapRingForArea(ring);
  if (unwrapped.length < 3) return false;
  const lon = normalizeLonNear(point.lon, averageRingLongitude(unwrapped));
  const lat = point.lat;
  for (let i = 0, j = unwrapped.length - 1; i < unwrapped.length; j = i, i += 1) {
    const [xi, yi] = unwrapped[i];
    const [xj, yj] = unwrapped[j];
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function restrictionPickingBounds(item) {
  if (!isGlobeLayer() || !item?.geometry || !item.bounds) return item?.bounds;
  const cached = restrictionSurfaceBoundsCache.get(item.geometry);
  if (cached) return cached;
  let padding = 0;
  for (const ring of geometryVertexRings(item.geometry)) {
    for (let i = 1; i < ring.length; i += 1) padding = Math.max(padding, greatCircleDistanceKm({ lon: ring[i - 1][0], lat: ring[i - 1][1] }, { lon: ring[i][0], lat: ring[i][1] }) / 6371.0088 * 180 / Math.PI / 2);
  }
  const bounds = { ...item.bounds, minLat: Math.max(-90, item.bounds.minLat - padding), maxLat: Math.min(90, item.bounds.maxLat + padding) };
  if (bounds.minLat <= -89.999 || bounds.maxLat >= 89.999) { bounds.minLon = -180; bounds.maxLon = 180; }
  restrictionSurfaceBoundsCache.set(item.geometry, bounds);
  return bounds;
}

function pointInRenderedRestriction(point, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates || [];
  if (!isGlobeLayer()) {
    const projectedPoint = { lon: point.lon, lat: mercatorYUnit(point.lat) };
    return polygons.some((rings) => {
      const inside = (ring) => pointInRing(projectedPoint, ring.map(([lon, lat]) => [lon, mercatorYUnit(lat)]));
      return rings.length && inside(rings[0]) && !rings.slice(1).some(inside);
    });
  }
  const THREE = globeRendererState?.THREE;
  if (!THREE) return pointInGeometry(point, geometry);
  const p = spherePoint(point.lon, point.lat, 1);
  const side = (a, b) => (a.y * b.z - a.z * b.y) * p.x + (a.z * b.x - a.x * b.z) * p.y + (a.x * b.y - a.y * b.x) * p.z;
  return polygons.some((polygon) => {
    const { vectors, faces } = restrictionSurfacePolygon(THREE, polygon);
    return faces.some(([i, j, k]) => {
      const a = vectors[i], b = vectors[j], c = vectors[k];
      if ((a.x + b.x + c.x) * p.x + (a.y + b.y + c.y) * p.y + (a.z + b.z + c.z) * p.z <= 0) return false;
      const signs = [side(a, b), side(b, c), side(c, a)];
      return signs.every((s) => s >= -1e-12) || signs.every((s) => s <= 1e-12);
    });
  });
}

function showTooltip(id, clientX, clientY) {
  showTooltipStack([{ id }], clientX, clientY);
}

function showTooltipStack(hits, clientX, clientY, options = {}) {
  const drawnById = state.drawableRestrictionById || state.restrictionById || new Map();
  const seen = new Set();
  const items = [];
  for (const hit of hits || []) {
    const id = typeof hit === "string" ? hit : hit?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const item = drawnById.get(id);
    if (item) items.push(item);
  }
  if (!items.length) return;
  const pinned = Boolean(options.pinned);
  if (pinned) {
    state.tooltipPinned = true;
    state.pinnedRestrictionIds = items.map((item) => item.id);
  }
  clearTooltipHideTimer();
  const signature = `${pinned ? "pinned:" : "hover:"}${items.map((item) => item.id).join("|")}`;
  els.tooltip.hidden = false;
  els.tooltip.classList.add("restriction-tooltip");
  els.tooltip.classList.toggle("pinned-restriction-tooltip", pinned);
  if (signature === state.tooltipSignature) {
    positionRestrictionTooltip();
    return;
  }
  state.tooltipSignature = signature;
  const pinnedNote = pinned
    ? `<div class="tooltip-pin-note"><span>已锁定详情；可在此上下滚动，再次点击所选区域即可取消。</span><button type="button" data-tooltip-unpin aria-label="关闭锁定详情" title="关闭锁定详情">×</button></div>`
    : "";
  if (items.length === 1) {
    els.tooltip.innerHTML = `${pinnedNote}${tooltipRestrictionHtml(items[0], { compact: false, layerIndex: 1, layerCount: 1 })}`;
    bindPinnedRestrictionTooltip();
    positionRestrictionTooltip(clientX);
    return;
  }
  const visibleItems = items.slice(0, 12);
  const sourceSummary = summarizeTooltipSources(items);
  els.tooltip.innerHTML = `
    ${pinnedNote}
    <b>重叠区域 ${items.length} 层</b>
    <strong>${escapeHtml(sourceSummary)}</strong>
    <span class="tooltip-overlap-note">按面积从小到大排列；完全重叠时按绘制顺序保留每一层。</span>
    <div class="tooltip-stack">
      ${visibleItems.map((item, index) => tooltipRestrictionHtml(item, { compact: true, layerIndex: index + 1, layerCount: items.length })).join("")}
    </div>
    ${items.length > visibleItems.length ? `<span class="tooltip-more">还有 ${items.length - visibleItems.length} 层，请放大地图或缩小筛选范围查看。</span>` : ""}
  `;
  bindPinnedRestrictionTooltip();
  positionRestrictionTooltip(clientX);
}

function bindPinnedRestrictionTooltip() {
  els.tooltip.querySelector("[data-tooltip-unpin]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    state.selectedId = null;
    clearPinnedRestrictionTooltip();
    renderList();
    draw();
  });
}

function tooltipRestrictionHtml(item, { compact, layerIndex, layerCount }) {
  const beijingTime = item.beijingTimeLabel || formatBeijingRange(item.beginsAt, item.endsAt);
  const altitudeNote = formatAltitudeWithMeters(item.altitude);
  const vertexText = formatGeometryVertices(item.geometry);
  const rawWarning = (item.savedRegion || item.sourceKind === "hydropac" || item.sourceKind === "msa" || item.sourceKind === "navarea") && item.rawText ? item.rawText : "";
  const rawWarningLabel = item.sourceKind === "msa" ? "原始中国航警" : item.sourceKind === "navarea" ? "原始 NAVAREA 警告" : isHydropacItem(item) ? "原始 HYDROPAC 警告" : "原始 NOTAM";
  const rawDisplay = rawWarning;
  const layerAttrs = compact ? ` class="tooltip-layer" style="--layer-color:${escapeHtml(item.color || "#ff6b6b")}"` : "";
  const layerTitle = compact
    ? `${layerIndex}/${layerCount} ${restrictionSourceLabel(item)} · ${item.notamId || item.type || "区域"}`
    : item.notamId || item.type;
  return `
    ${compact ? `<div${layerAttrs}>` : ""}
    <b>${escapeHtml(layerTitle)}</b>
    ${item.savedRegion ? `<span><span>已保存区域</span> · <span>数据刷新（北京时间）</span> <span data-i18n-static>${escapeHtml(item.savedRegion.refreshedAt ? new Date(item.savedRegion.refreshedAt).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai", hour12: false }) : "--")}</span></span>` : ""}
    <strong data-i18n-static>${escapeHtml(item.title || "")}</strong>
    <span>${escapeHtml([item.region, item.state, item.category].filter(Boolean).join(" / "))}</span>
    <span>原文时间：<span ${item.timeLabel ? "data-i18n-static" : ""}>${escapeHtml(item.timeLabel || "未解析")}</span></span>
    <span>北京时间：${escapeHtml(beijingTime)}</span>
    <span>高度：${escapeHtml(altitudeNote)}</span>
    <span>图形：${escapeHtml(item.hasGeometry ? item.geometrySource || "已解析" : item.geometryReason || "无")}</span>
    <span class="tooltip-coords"><em>顶点坐标（纬度 经度）</em>${escapeHtml(vertexText)}</span>
    ${rawDisplay ? `<span class="tooltip-raw ${compact ? "compact" : ""}"><em>${escapeHtml(rawWarningLabel)}</em><span data-i18n-static>${escapeHtml(rawDisplay)}</span></span>` : ""}
    ${compact ? "</div>" : ""}
  `;
}

function restrictionSourceLabel(item) {
  if (isMsaWarningItem(item)) return "中国航警";
  if (isHydropacItem(item)) return "HYDROPAC";
  if (isNavareaItem(item)) return "NAVAREA";
  return "NOTAM";
}

function summarizeTooltipSources(items) {
  const counts = countByArray(items, restrictionSourceLabel);
  return Object.entries(counts)
    .map(([label, count]) => `${label} ${count}`)
    .join(" / ");
}

function countByArray(items, keyFn) {
  const counts = {};
  for (const item of items || []) {
    const key = keyFn(item) || "未知";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function positionRestrictionTooltip(clientX = null) {
  const rect = els.tooltip.getBoundingClientRect();
  const top = 86;
  const viewportLeft = 12;
  const viewportRight = window.innerWidth - 12;
  const leftPanelRect = !state.leftPanelCollapsed
    ? document.querySelector(".filters-panel")?.getBoundingClientRect()
    : null;
  const rightPanelRect = !state.rightPanelCollapsed
    ? document.querySelector(".details-panel")?.getBoundingClientRect()
    : null;
  const availableLeft = leftPanelRect?.width > 60 ? Math.max(viewportLeft, leftPanelRect.right + 12) : viewportLeft;
  const availableRight = rightPanelRect?.width > 60 ? Math.min(viewportRight, rightPanelRect.left - 12) : viewportRight;
  const rightDock = Math.max(availableLeft, availableRight - rect.width);
  if (Number.isFinite(clientX)) {
    const overlapsPointer = clientX >= rightDock - 10 && clientX <= rightDock + rect.width + 10;
    const leftOfPointer = clientX - rect.width - 18;
    const rightOfPointer = clientX + 18;
    state.restrictionTooltipLeft = overlapsPointer && leftOfPointer >= availableLeft
      ? leftOfPointer
      : overlapsPointer && rightOfPointer + rect.width <= availableRight
        ? rightOfPointer
        : rightDock;
  }
  const left = clamp(
    Number.isFinite(state.restrictionTooltipLeft) ? state.restrictionTooltipLeft : rightDock,
    availableLeft,
    Math.max(availableLeft, availableRight - rect.width),
  );
  els.tooltip.style.left = `${left}px`;
  els.tooltip.style.top = `${top}px`;
}

function positionTooltip(clientX, clientY) {
  const offset = 16;
  const rect = els.tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 12, clientX + offset);
  const top = Math.min(window.innerHeight - rect.height - 12, clientY + offset);
  els.tooltip.style.left = `${Math.max(12, left)}px`;
  els.tooltip.style.top = `${Math.max(12, top)}px`;
}

function clearTooltipHideTimer() {
  if (!state.tooltipHideTimer) return;
  window.clearTimeout(state.tooltipHideTimer);
  state.tooltipHideTimer = null;
}

function scheduleTooltipHide(delay = TOOLTIP_HIDE_DELAY_MS) {
  if (els.tooltip.hidden || state.tooltipHovering || state.tooltipPinned) return;
  clearTooltipHideTimer();
  state.tooltipHideTimer = window.setTimeout(() => {
    state.tooltipHideTimer = null;
    if (!state.tooltipHovering && !state.tooltipPinned) hideTooltip();
  }, delay);
}

function showLaunchTooltip(siteId, clientX, clientY) {
  const site = launchSiteGroups().find((item) => item.id === siteId);
  if (!site) return;
  const next = [...site.launches].sort((a, b) => compareLaunchTime(a.net, b.net))[0];
  state.tooltipSignature = "";
  els.tooltip.classList.remove("restriction-tooltip");
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = `
    <b>火箭发射预告</b>
    <strong>${escapeHtml(site.label)}</strong>
    <span>预告数量：${escapeHtml(site.count)}</span>
    <span>下一发：${escapeHtml(next?.rocket || "未知火箭")} / ${escapeHtml(next?.mission || "未知载荷")}</span>
    <span>北京时间：${escapeHtml(next?.beijingTimeLabel || formatBeijingRange(next?.net, next?.net))}</span>
    <span>点击圆圈可在右侧打开该发射场预告列表</span>
  `;
  const offset = 16;
  const rect = els.tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 12, clientX + offset);
  const top = Math.min(window.innerHeight - rect.height - 12, clientY + offset);
  els.tooltip.style.left = `${Math.max(12, left)}px`;
  els.tooltip.style.top = `${Math.max(12, top)}px`;
}

function showCustomCoordinateTooltip(id, clientX, clientY) {
  const item = state.customItems.find((candidate) => candidate.id === id);
  if (!item) return;
  const vertexText = formatCustomGeometryCoordinates(item.geometry);
  state.tooltipSignature = "";
  els.tooltip.classList.remove("restriction-tooltip");
  els.tooltip.hidden = false;
  els.tooltip.innerHTML = `
    <b>自定义坐标</b>
    <strong>${escapeHtml(item.name || "未命名坐标")}</strong>
    <span>类型：${escapeHtml(customGeometryLabel(item.geometry?.type))}</span>
    <span>来源：${escapeHtml(item.source || "手动添加")}</span>
    ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ""}
    <span class="tooltip-coords"><em>坐标</em>${escapeHtml(vertexText)}</span>
  `;
  const offset = 16;
  const rect = els.tooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 12, clientX + offset);
  const top = Math.min(window.innerHeight - rect.height - 12, clientY + offset);
  els.tooltip.style.left = `${Math.max(12, left)}px`;
  els.tooltip.style.top = `${Math.max(12, top)}px`;
}

function hideTooltip(options = {}) {
  if (state.tooltipPinned && !options.force) return;
  clearTooltipHideTimer();
  els.tooltip.hidden = true;
  els.tooltip.classList.remove("restriction-tooltip", "pinned-restriction-tooltip");
  state.tooltipSignature = "";
  if (options.force) {
    state.tooltipPinned = false;
    state.pinnedRestrictionIds = [];
    state.restrictionTooltipLeft = null;
  }
}

function clearPinnedRestrictionTooltip() {
  hideTooltip({ force: true });
}

function handleCanvasClick(event) {
  if (state.view.suppressClick || performance.now() < state.view.suppressClickUntil) {
    state.view.suppressClick = false;
    return;
  }
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const satelliteHit = hitTestSatellite(x, y);
  const launchHit = hitTestLaunchSite(x, y);
  const customHit = hitTestCustomCoordinate(x, y);
  const hits = hitTestStack(x, y, rect.width, rect.height);
  const hit = hits[0] || null;
  const lonLat = unproject(x, y, rect.width, rect.height);
  if (event?.ctrlKey && hit?.id) {
    toggleTimeWindowHint(hit.id);
    return;
  }
  if (event?.ctrlKey && !hit?.id) {
    clearTimeWindowHint();
    return;
  }
  if (event?.shiftKey && hit?.id) {
    toggleHighlightedRestriction(hit.id);
    return;
  }
  if (state.ballisticPoweredStartPickTrackId) {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    if (state.ballisticPoweredStartPickTrackId !== track.id || !lonLat) {
      state.ballisticPoweredStartPickTrackId = "";
      els.canvas?.classList.remove("ballistic-pick-mode");
      return;
    }
    track.ballistic.poweredStartLon = normalizeLon(lonLat.lon);
    track.ballistic.poweredStartLat = clamp(lonLat.lat, -90, 90);
    state.ballisticPoweredStartPickTrackId = "";
    state.ballisticPoweredStartPickMessage = "主动段地表起点已设置；平滑线将从这里依次穿过全部分离点。";
    els.canvas?.classList.remove("ballistic-pick-mode");
    renderTrajectoryPlan();
    draw();
    return;
  }
  if (state.ballisticTargetPickStageId) {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    const stage = track.ballistic.stages.find((candidate) => candidate.id === state.ballisticTargetPickStageId);
    if (!stage || !lonLat) {
      state.ballisticTargetPickStageId = "";
      els.canvas?.classList.remove("ballistic-pick-mode");
      return;
    }
    stage.targetLon = normalizeLon(lonLat.lon);
    stage.targetLat = clamp(lonLat.lat, -90, 90);
    stage.targetLabel = "地图拾取目标落点";
    stage.inverseState = null;
    state.ballisticTargetPickStageId = "";
    state.ballisticTargetPickMessage = "目标落点已设置，可以开始反算。";
    els.canvas?.classList.remove("ballistic-pick-mode");
    renderTrajectoryPlan();
    draw();
    return;
  }
  if (state.ballisticPickStageId) {
    const track = activeTrajectory();
    ensureTrajectoryBallistic(track);
    let stage = track.ballistic.stages.find((candidate) => candidate.id === state.ballisticPickStageId);
    if (!stage) {
      state.ballisticPickStageId = "";
      els.canvas?.classList.remove("ballistic-pick-mode");
      return;
    }
    if (stage.positionMode !== "free") {
      const snapped = snapBallisticSeparationToScreen(track, x, y, rect.width, rect.height);
      if (!snapped || snapped.pixelDistance > 58) {
        state.ballisticPickMessage = snapped
          ? `点击位置距离主动段约 ${Math.round(snapped.pixelDistance)} 像素，请更靠近星下点线。`
          : "当前轨迹不足以确定主动段，请先绘制至少两个轨迹点。";
        renderTrajectoryPlan();
        return;
      }
      // Building the trajectory samples normalizes the stored stage models;
      // reacquire the active stage before applying the picked state.
      stage = track.ballistic.stages.find((candidate) => candidate.id === state.ballisticPickStageId);
      if (!stage) return;
      stage.burnoutLon = normalizeLon(snapped.lon);
      stage.burnoutLat = clamp(snapped.lat, -90, 90);
      stage.burnoutPathKm = snapped.distanceKm;
      stage.burnoutPathFraction = snapped.fraction;
      stage.burnoutLabel = `主动段吸附分离点（${formatKm(snapped.distanceKm)}）`;
      stage.positionMode = "track";
    } else {
      if (!lonLat) return;
      stage.burnoutLon = normalizeLon(lonLat.lon);
      stage.burnoutLat = clamp(lonLat.lat, -90, 90);
      stage.burnoutPathKm = null;
      stage.burnoutPathFraction = null;
      stage.burnoutLabel = "地图自由拾取分离点";
    }
    stage.burnoutPointId = "";
    stage.legacyBurnoutPct = null;
    stage.maxRangeState = null;
    state.ballisticPickStageId = "";
    state.ballisticPickMessage = "分离点已设置；请继续校准分离高度、瞬时速度和飞行路径角。";
    els.canvas?.classList.remove("ballistic-pick-mode");
    renderTrajectoryPlan();
    updateTrajectoryCount();
    draw();
    return;
  }
  if (state.trajectoryEnabled && !activeTrajectory().manualLocked) {
    if (!lonLat) return;
    if (state.trajectoryAreaPickEnabled && hit?.id) {
      toggleTrajectoryPoint(hit.id);
      return;
    }
    addTrajectoryPointFromMap(lonLat, null);
    return;
  }
  if (satelliteHit?.id) {
    state.detailMode = "satellite";
    state.rightPanelCollapsed = false;
    syncPanelCollapse();
    state.satelliteFocusedId = satelliteHit.id;
    if (!state.selectedSatelliteIds.has(satelliteHit.id)) {
      state.selectedSatelliteIds.add(satelliteHit.id);
      saveSatelliteSelection();
    }
    renderDetailModeUi();
    renderList();
    syncSatelliteControls();
    showSatelliteTooltip(satelliteHit.id, event.clientX, event.clientY);
    drawSatelliteOverlay();
    return;
  }
  if (customHit?.id) {
    selectCustomCoordinate(customHit.id);
    return;
  }
  if (state.customMapAddMode) {
    if (!lonLat) return;
    addCustomCoordinateFromMap(lonLat);
    return;
  }
  if (launchHit?.siteId) {
    selectLaunchSite(launchHit.siteId);
    return;
  }
  if (!hit?.id) return;
  if (state.tooltipPinned && state.selectedId === hit.id && state.pinnedRestrictionIds.includes(hit.id)) {
    state.selectedId = null;
    clearPinnedRestrictionTooltip();
    renderList();
    draw();
    return;
  }
  state.selectedId = hit.id;
  showTooltipStack(hits, event.clientX, event.clientY, { pinned: true });
  renderList();
  draw();
}

function fitFilteredBounds() {
  const trajectoryBounds = state.trajectoryTracks.some((track) => track.showGroundTrack !== false || track.ballistic?.enabled)
    ? state.trajectoryTracks.flatMap((track) => {
        return selectedTrajectoryItems(track).map(({ target }) => boundsFromPoint(target.lon, target.lat));
      })
    : [];
  const bounds = combinedBounds([
    ...drawnFilteredItems().map((item) => item.bounds).filter(Boolean),
    ...(state.customCoordinatesEnabled ? state.customItems.map((item) => item.bounds).filter(Boolean) : []),
    ...trajectoryBounds,
  ]);
  if (!bounds) {
    state.view = { ...state.view, lon: 20, lat: 12, zoom: 2, drag: null };
    draw();
    return;
  }
  fitBounds(bounds);
}

function fitRestriction(item) {
  if (!item) return;
  const bounds = item.bounds || (item.center ? boundsFromPoint(item.center.lon, item.center.lat) : null);
  if (bounds) fitBounds(bounds);
}

function selectLaunchSite(siteId) {
  state.detailMode = "launch";
  state.selectedLaunchSiteId = siteId;
  const site = launchSiteGroups().find((item) => item.id === siteId);
  state.selectedLaunchId = site?.launches?.[0]?.id || "";
  if (site) fitBounds(boundsFromPoint(site.lon, site.lat, 1.2));
  renderDetailModeUi();
  renderList();
  renderNotamIdSearchResults();
  draw();
}

function fitLaunch(launch) {
  const point = launch?.displayPoint || launchDisplayPoint(launch);
  if (point) fitBounds(boundsFromPoint(point.lon, point.lat, 1.2));
}

function fitBounds(bounds) {
  const rect = els.canvas.getBoundingClientRect();
  const centerLon = normalizeLon((bounds.minLon + bounds.maxLon) / 2);
  const centerLat = clamp((bounds.minLat + bounds.maxLat) / 2, -80, 80);
  let bestZoom = MIN_ZOOM;
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z -= ZOOM_STEP) {
    const min = lonLatToWorld(bounds.minLon, bounds.maxLat, z);
    const max = lonLatToWorld(bounds.maxLon, bounds.minLat, z);
    const width = Math.abs(max.x - min.x);
    const height = Math.abs(max.y - min.y);
    if (width <= rect.width * 0.74 && height <= rect.height * 0.74) {
      bestZoom = z;
      break;
    }
  }
  state.view.lon = centerLon;
  state.view.lat = centerLat;
  state.view.zoom = bestZoom;
  updateCounts();
  draw();
}

function combinedBounds(boundsList) {
  const bounds = boundsList.filter(Boolean);
  if (!bounds.length) return null;
  return bounds.reduce(
    (acc, item) => ({
      minLon: Math.min(acc.minLon, item.minLon),
      minLat: Math.min(acc.minLat, item.minLat),
      maxLon: Math.max(acc.maxLon, item.maxLon),
      maxLat: Math.max(acc.maxLat, item.maxLat),
    }),
    { ...bounds[0] },
  );
}

function geometryBounds(geometry) {
  const coords = flattenGeometryCoordinates(geometry);
  if (!coords.length) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lonRaw, latRaw] of coords) {
    const lon = normalizeLon(Number(lonRaw));
    const lat = Number(latRaw);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  if (!Number.isFinite(minLon)) return null;
  return { minLon, minLat, maxLon, maxLat };
}

function customGeometryBounds(geometry) {
  if (geometry?.type === "Point") {
    const [lon, lat] = geometry.coordinates || [];
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) return null;
    return boundsFromPoint(normalizeLon(Number(lon)), clamp(Number(lat), -85, 85), 0.12);
  }
  return geometryBounds(geometry);
}

function auditClientGeometry(geometry) {
  const rings = geometryVertexRings(geometry);
  if (!rings.length) return null;
  for (const ring of rings) {
    const metrics = clientRingMetrics(ring);
    if (!metrics) return "几何坐标无效，前端未绘制";
    if (metrics.lonSpan > MAX_NOTAM_DRAW_LON_SPAN || metrics.latSpan > MAX_NOTAM_DRAW_LAT_SPAN) {
      return "前端几何审计：跨度过大，疑似多个区域或航路点被错连";
    }
    if (metrics.selfIntersects) return "前端几何审计：坐标顺序形成自交多边形，未绘制";
    if (metrics.area <= 1e-16) return "Polygon has no area; not drawn.";
  }
  return null;
}

function clientRingMetrics(ring) {
  const clean = (Array.isArray(ring) ? ring : [])
    .map((coord) => [Number(coord?.[0]), Number(coord?.[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length < 4 || clean.length !== ring.length || clean.some(([lon, lat]) => Math.abs(lon) > 180 || Math.abs(lat) > 90)) return null;

  const unwrapped = [];
  let previousLon = normalizeLon(clean[0][0]);
  for (let index = 0; index < clean.length; index += 1) {
    const [rawLon, lat] = clean[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(rawLon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, lat]);
  }

  const lons = unwrapped.map(([lon]) => lon);
  const lats = unwrapped.map(([, lat]) => lat);
  const segments = [];
  for (let index = 1; index < unwrapped.length; index += 1) {
    segments.push(greatCircleDistanceKm({ lon: unwrapped[index - 1][0], lat: unwrapped[index - 1][1] }, { lon: unwrapped[index][0], lat: unwrapped[index][1] }));
  }
  const sorted = [...segments].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  const maxSegmentKm = Math.max(0, ...segments);
  return {
    pointCount: Math.max(0, clean.length - 1),
    lonSpan: Math.max(...lons) - Math.min(...lons),
    latSpan: Math.max(...lats) - Math.min(...lats),
    maxSegmentKm,
    maxSegmentRatio: median > 0 ? maxSegmentKm / median : 0,
    minAngleDeg: clientMinTurnAngleDeg(unwrapped),
    selfIntersects: clientRingSelfIntersects(unwrapped),
    area: Math.abs(planarRingArea(unwrapped)),
  };
}

function clientMinTurnAngleDeg(points) {
  let minAngle = 180;
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const c = points[index + 1];
    if (clientSamePoint(a, b) || clientSamePoint(b, c)) continue;
    const latRef = toRad(b[1]);
    const v1 = [(a[0] - b[0]) * Math.cos(latRef), a[1] - b[1]];
    const v2 = [(c[0] - b[0]) * Math.cos(latRef), c[1] - b[1]];
    const n1 = Math.hypot(v1[0], v1[1]);
    const n2 = Math.hypot(v2[0], v2[1]);
    if (!n1 || !n2) continue;
    const cos = clamp((v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2), -1, 1);
    minAngle = Math.min(minAngle, toDeg(Math.acos(cos)));
  }
  return minAngle;
}

function clientRingSelfIntersects(points) {
  const lastIndex = points.length - 1;
  for (let a = 0; a < lastIndex; a += 1) {
    for (let b = a + 1; b < lastIndex; b += 1) {
      if (Math.abs(a - b) <= 1) continue;
      if (a === 0 && b === lastIndex - 1) continue;
      if (clientSegmentsIntersect(points[a], points[a + 1], points[b], points[b + 1])) return true;
    }
  }
  return false;
}

function clientSegmentsIntersect(a, b, c, d) {
  const o1 = clientOrientation(a, b, c);
  const o2 = clientOrientation(a, b, d);
  const o3 = clientOrientation(c, d, a);
  const o4 = clientOrientation(c, d, b);
  const s1 = clientOrientationSign(o1);
  const s2 = clientOrientationSign(o2);
  const s3 = clientOrientationSign(o3);
  const s4 = clientOrientationSign(o4);
  if (s1 && s2 && s3 && s4 && s1 !== s2 && s3 !== s4) return true;
  if (!s1 && clientPointOnSegment(a, b, c)) return true;
  if (!s2 && clientPointOnSegment(a, b, d)) return true;
  if (!s3 && clientPointOnSegment(c, d, a)) return true;
  if (!s4 && clientPointOnSegment(c, d, b)) return true;
  return false;
}

function clientOrientationSign(value) {
  const epsilon = 1e-14;
  return value > epsilon ? 1 : value < -epsilon ? -1 : 0;
}

function clientPointOnSegment(a, b, point) {
  const epsilon = 1e-10;
  return (
    point[0] >= Math.min(a[0], b[0]) - epsilon &&
    point[0] <= Math.max(a[0], b[0]) + epsilon &&
    point[1] >= Math.min(a[1], b[1]) - epsilon &&
    point[1] <= Math.max(a[1], b[1]) + epsilon
  );
}

function clientOrientation(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function clientSamePoint(a, b) {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

function boundsFromPoint(lon, lat, radius = 1) {
  return { minLon: lon - radius, minLat: lat - radius, maxLon: lon + radius, maxLat: lat + radius };
}

function boundsIntersect(a, b) {
  return a.minLon <= b.maxLon && a.maxLon >= b.minLon && a.minLat <= b.maxLat && a.maxLat >= b.minLat;
}

function loadCustomCoordinatesFromStorage() {
  try {
    const raw = localStorage.getItem("notam-map-custom-coordinates");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    state.customItems = items
      .map((item, index) =>
        createCustomCoordinateItem({
          name: item.name || `自定义坐标 ${index + 1}`,
          description: item.description || "",
          source: item.source || "本地保存",
          geometry: item.geometry,
          color: item.color || CUSTOM_COORDINATE_COLOR,
        }),
      )
      .filter(Boolean);
    state.nextCustomCoordinateNumber = Math.max(state.nextCustomCoordinateNumber, state.customItems.length + 1);
  } catch {
    state.customItems = [];
  }
}

function saveCustomCoordinatesToStorage() {
  try {
    localStorage.setItem(
      "notam-map-custom-coordinates",
      JSON.stringify({
        items: state.customItems.map(({ name, description, source, geometry, color }) => ({ name, description, source, geometry, color })),
      }),
    );
  } catch {
    // Storage may be disabled; importing and drawing still work in memory.
  }
}

function renderCustomCoordinateControls(message = "") {
  if (els.customCoordinateCount) els.customCoordinateCount.textContent = String(state.customItems.length);
  if (els.customCoordinateToggle) els.customCoordinateToggle.checked = state.customCoordinatesEnabled;
  if (els.customMapAddToggle) els.customMapAddToggle.checked = state.customMapAddMode;
  els.canvas?.classList.toggle("custom-add-mode", Boolean(state.customMapAddMode));
  const selected = state.customItems.find((item) => item.id === state.selectedCustomId);
  if (state.selectedCustomId && !selected) {
    if (state.selectedId === state.selectedCustomId) state.selectedId = null;
    state.selectedCustomId = "";
  }
  renderCustomCoordinateList();
  if (els.selectedCustomCoordinateBox) els.selectedCustomCoordinateBox.hidden = !selected;
  if (selected) {
    if (els.selectedCustomCoordinateName && document.activeElement !== els.selectedCustomCoordinateName) {
      els.selectedCustomCoordinateName.value = selected.name || "";
    }
    if (els.selectedCustomCoordinateDescription && document.activeElement !== els.selectedCustomCoordinateDescription) {
      els.selectedCustomCoordinateDescription.value = selected.description || "";
    }
    renderSelectedCustomCoordinateValue(selected);
  } else {
    if (els.selectedCustomCoordinateName) els.selectedCustomCoordinateName.value = "";
    renderSelectedCustomCoordinateValue(null);
    if (els.selectedCustomCoordinateDescription) els.selectedCustomCoordinateDescription.value = "";
  }
  if (message) setCustomCoordinateStatus(message);
}

function renderCustomCoordinateList() {
  if (!els.customCoordinateList) return;
  els.customCoordinateList.replaceChildren();
  if (!state.customItems.length) {
    const empty = document.createElement("p");
    empty.className = "custom-coordinate-empty";
    empty.textContent = "\u6682\u65e0\u81ea\u5b9a\u4e49\u5750\u6807";
    els.customCoordinateList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of state.customItems) {
    const row = document.createElement("div");
    row.className = "custom-coordinate-row";
    row.classList.toggle("selected", item.id === state.selectedCustomId);

    const main = document.createElement("button");
    main.type = "button";
    main.className = "custom-coordinate-main";
    main.dataset.customSelect = item.id;

    const title = document.createElement("span");
    title.className = "custom-coordinate-name";
    title.textContent = item.name || "\u672a\u547d\u540d\u5750\u6807";

    const meta = document.createElement("span");
    meta.className = "custom-coordinate-meta";
    meta.textContent = customCoordinateListMeta(item);

    const coords = document.createElement("span");
    coords.className = "custom-coordinate-coords";
    coords.textContent = customCoordinateListCoordinates(item);

    main.append(title, meta, coords);

    const actions = document.createElement("div");
    actions.className = "custom-coordinate-actions";

    const fitButton = document.createElement("button");
    fitButton.type = "button";
    fitButton.dataset.customFit = item.id;
    fitButton.textContent = "\u5b9a\u4f4d";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.dataset.customDelete = item.id;
    deleteButton.textContent = "\u5220\u9664";

    actions.append(fitButton, deleteButton);
    row.append(main, actions);
    fragment.appendChild(row);
  }
  els.customCoordinateList.appendChild(fragment);
}

function renderSelectedCustomCoordinateValue(item) {
  const input = els.selectedCustomCoordinateValue;
  if (!input) return;
  if (!item) {
    input.value = "";
    input.disabled = false;
    if (els.selectedCustomCoordinateValueBox) els.selectedCustomCoordinateValueBox.hidden = true;
    return;
  }
  if (els.selectedCustomCoordinateValueBox) els.selectedCustomCoordinateValueBox.hidden = false;
  const isPoint = item.geometry?.type === "Point";
  input.disabled = !isPoint;
  input.placeholder = isPoint
    ? "39.014375, 102.007433"
    : "\u7ebf\u548c\u9762\u6682\u652f\u6301\u540d\u79f0\u3001\u5907\u6ce8\u7f16\u8f91";
  if (document.activeElement === input) return;
  input.value = isPoint ? formatCustomPointInput(item) : customCoordinateListCoordinates(item);
}

function customCoordinateListMeta(item) {
  const type = customGeometryLabel(item.geometry?.type);
  const source = item.source || "\u81ea\u5b9a\u4e49";
  return `${type} · ${source}`;
}

function customCoordinateListCoordinates(item) {
  if (item.geometry?.type === "Point") {
    const [lon, lat] = item.geometry.coordinates;
    return `${formatDecimalPair(lat, lon)} · ${formatDmsPair(lat, lon)}`;
  }
  const coords = flattenGeometryCoordinates(item.geometry);
  return `${customGeometryLabel(item.geometry?.type)} · ${coords.length} \u4e2a\u9876\u70b9`;
}

function formatCustomPointInput(item) {
  if (item?.geometry?.type !== "Point") return "";
  const [lon, lat] = item.geometry.coordinates;
  return formatDecimalPair(lat, lon);
}

function formatDecimalPair(lat, lon) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return "";
  return `${Number(lat).toFixed(8)}, ${Number(lon).toFixed(8)}`;
}

function handleCustomCoordinateListClick(event) {
  const deleteButton = event.target.closest?.("[data-custom-delete]");
  if (deleteButton) {
    event.preventDefault();
    deleteCustomCoordinateById(deleteButton.dataset.customDelete);
    return;
  }

  const fitButton = event.target.closest?.("[data-custom-fit]");
  if (fitButton) {
    event.preventDefault();
    const item = selectCustomCoordinate(fitButton.dataset.customFit);
    if (item) fitCustomCoordinate(item);
    return;
  }

  const selectButton = event.target.closest?.("[data-custom-select]");
  if (selectButton) {
    event.preventDefault();
    selectCustomCoordinate(selectButton.dataset.customSelect);
  }
}

function setCustomCoordinateStatus(message, isError = false) {
  if (!els.customCoordinateStatus) return;
  els.customCoordinateStatus.textContent = message;
  els.customCoordinateStatus.classList.toggle("error", Boolean(isError));
}

function addCustomCoordinateFromInputs() {
  const value = els.customCoordinateValue?.value || "";
  const parsed = parseCustomCoordinateLine(value);
  if (!parsed) {
    setCustomCoordinateStatus("没有识别到有效坐标。支持：纬度, 经度；或 39°0'51.75\"北, 102°0'26.76\"东。", true);
    return;
  }
  const name = (els.customCoordinateName?.value || parsed.name || "").trim() || `自定义坐标 ${state.nextCustomCoordinateNumber}`;
  const item = createCustomCoordinateItem({
    name,
    source: "手动添加",
    geometry: { type: "Point", coordinates: [parsed.lon, parsed.lat] },
  });
  addCustomCoordinateItems([item], { selectId: item?.id });
  if (els.customCoordinateValue) els.customCoordinateValue.value = "";
  if (els.customCoordinateName) els.customCoordinateName.value = "";
  setCustomCoordinateStatus(`已添加：${name}`);
}

function addCustomCoordinateFromMap(lonLat) {
  const item = createCustomCoordinateItem({
    name: `地图坐标 ${state.nextCustomCoordinateNumber}`,
    source: "地图点击",
    geometry: { type: "Point", coordinates: [lonLat.lon, lonLat.lat] },
  });
  if (!item) {
    setCustomCoordinateStatus("点击位置不在可用地图范围内，未添加坐标。", true);
    return;
  }
  addCustomCoordinateItems([item], { selectId: item.id });
  const [lon, lat] = item.geometry.coordinates;
  setCustomCoordinateStatus(`已从地图添加：${item.name}（${formatDmsPair(lat, lon)}）`);
}

function selectCustomCoordinate(id) {
  const item = state.customItems.find((candidate) => candidate.id === id);
  if (!item) return null;
  state.selectedCustomId = item.id;
  state.selectedId = item.id;
  state.customCoordinatesEnabled = true;
  renderCustomCoordinateControls(`已选中：${item.name || "未命名坐标"}`);
  renderLegend();
  draw();
  return item;
}

function updateSelectedCustomCoordinate() {
  const item = state.customItems.find((candidate) => candidate.id === state.selectedCustomId);
  if (!item) {
    renderCustomCoordinateControls();
    setCustomCoordinateStatus("请先在地图上点选一个自定义坐标。", true);
    return;
  }
  const name = (els.selectedCustomCoordinateName?.value || "").trim();
  const description = (els.selectedCustomCoordinateDescription?.value || "").trim();
  if (item.geometry?.type === "Point") {
    const coordinateValue = (els.selectedCustomCoordinateValue?.value || "").trim();
    if (coordinateValue) {
      const parsed = parseCustomCoordinateLine(coordinateValue);
      if (!parsed) {
        setCustomCoordinateStatus("\u5750\u6807\u672a\u8bc6\u522b\uff1a\u8bf7\u8f93\u5165\u7eac\u5ea6,\u7ecf\u5ea6\uff0c\u6216\u5ea6\u5206\u79d2\u683c\u5f0f\u3002", true);
        return;
      }
      const normalized = normalizeCustomGeometry({ type: "Point", coordinates: [parsed.lon, parsed.lat] });
      if (!normalized) {
        setCustomCoordinateStatus("\u5750\u6807\u8d85\u51fa\u53ef\u7528\u8303\u56f4\uff0c\u672a\u4fdd\u5b58\u3002", true);
        return;
      }
      item.geometry = normalized;
      item.bounds = customGeometryBounds(normalized);
    }
  }
  item.name = name || item.name || "未命名坐标";
  item.description = description;
  saveCustomCoordinatesToStorage();
  renderCustomCoordinateControls(`已保存：${item.name}`);
  draw();
}

function deleteSelectedCustomCoordinate() {
  const id = state.selectedCustomId;
  if (deleteCustomCoordinateById(id)) return;
  renderCustomCoordinateControls();
  setCustomCoordinateStatus("没有选中的自定义坐标可删除。", true);
}

function deleteCustomCoordinateById(id) {
  const item = state.customItems.find((candidate) => candidate.id === id);
  if (!item) return false;
  state.customItems = state.customItems.filter((candidate) => candidate.id !== id);
  if (state.selectedId === id) state.selectedId = null;
  if (state.selectedCustomId === id) state.selectedCustomId = "";
  saveCustomCoordinatesToStorage();
  renderCustomCoordinateControls(`已删除：${item.name || "未命名坐标"}`);
  renderLegend();
  draw();
  return true;
}

function importBatchCustomCoordinates() {
  const text = els.customCoordinateBatch?.value || "";
  const parsed = parseBatchCustomCoordinates(text);
  if (!parsed.items.length) {
    setCustomCoordinateStatus("批量文本中没有识别到有效坐标。", true);
    return;
  }
  addCustomCoordinateItems(parsed.items);
  setCustomCoordinateStatus(`批量导入 ${parsed.items.length} 个点${parsed.failed ? `；${parsed.failed} 行未识别` : ""}`);
}

async function importCustomKmlFile(event) {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    if (!KML_IO) throw new Error("KML/KMZ 解析模块未加载，请刷新页面后重试");
    if (file.size > 128 * 1024 * 1024) throw new Error("文件超过 128 MB，已拒绝导入");
    setCustomCoordinateStatus(`正在解析 ${file.name}…`);
    const documents = await readKmlDocuments(file);
    const items = [];
    const failures = [];
    for (const document of documents) {
      try {
        items.push(...parseKmlCustomCoordinates(document.text, `${file.name} / ${document.name}`));
      } catch (error) {
        failures.push(`${document.name}: ${error.message}`);
      }
    }
    if (!items.length) {
      const detail = failures[0] ? `；${failures[0]}` : "";
      setCustomCoordinateStatus(`KML/KMZ 中没有找到可绘制的点、线、面或轨迹${detail}`, true);
      return;
    }
    addCustomCoordinateItems(items);
    setCustomCoordinateStatus(
      `已从 ${file.name} 的 ${documents.length} 个 KML 文档导入 ${items.length} 个几何对象${failures.length ? `；${failures.length} 个文档解析失败` : ""}`,
    );
  } catch (error) {
    setCustomCoordinateStatus(`导入失败：${error.message}`, true);
  } finally {
    if (event.target) event.target.value = "";
  }
}

function addCustomCoordinateItems(items, options = {}) {
  const clean = items.filter(Boolean);
  if (!clean.length) return;
  state.customItems.push(...clean);
  state.customCoordinatesEnabled = true;
  if (options.selectId && clean.some((item) => item.id === options.selectId)) {
    state.selectedCustomId = options.selectId;
    state.selectedId = options.selectId;
  }
  saveCustomCoordinatesToStorage();
  renderCustomCoordinateControls();
  renderLegend();
  draw();
}

function clearCustomCoordinates() {
  state.customItems = [];
  if (String(state.selectedId || "").startsWith("custom-coordinate-")) state.selectedId = null;
  state.selectedCustomId = "";
  saveCustomCoordinatesToStorage();
  renderCustomCoordinateControls("已清空自定义坐标图层");
  renderLegend();
  draw();
}

function fitCustomCoordinates() {
  const bounds = combinedBounds(state.customItems.map((item) => item.bounds).filter(Boolean));
  if (bounds) fitBounds(bounds);
}

function fitCustomCoordinate(item) {
  if (item?.bounds) fitBounds(item.bounds);
}

function createCustomCoordinateItem({ name, description = "", source = "自定义", geometry, color = CUSTOM_COORDINATE_COLOR }) {
  const normalized = normalizeCustomGeometry(geometry);
  if (!normalized) return null;
  const id = `custom-coordinate-${state.nextCustomCoordinateNumber}`;
  state.nextCustomCoordinateNumber += 1;
  return {
    id,
    name: name || `自定义坐标 ${state.nextCustomCoordinateNumber - 1}`,
    description,
    source,
    geometry: normalized,
    bounds: customGeometryBounds(normalized),
    color,
  };
}

function normalizeCustomGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return null;
  if (geometry.type === "Point") {
    const [lon, lat, altitude] = geometry.coordinates || [];
    if (!Number.isFinite(Number(lon)) || !Number.isFinite(Number(lat))) return null;
    const coordinates = [normalizeLon(Number(lon)), clamp(Number(lat), -90, 90)];
    if (Number.isFinite(Number(altitude))) coordinates.push(Number(altitude));
    return { type: "Point", coordinates };
  }
  if (geometry.type === "LineString") {
    const coords = normalizeCoordinateList(geometry.coordinates);
    return coords.length >= 2 ? { type: "LineString", coordinates: coords } : null;
  }
  if (geometry.type === "Polygon") {
    const sourceRings = Array.isArray(geometry.coordinates?.[0]?.[0]) ? geometry.coordinates : [geometry.coordinates || []];
    const rings = sourceRings
      .map((sourceRing) => normalizeCoordinateList(sourceRing))
      .filter((ring) => ring.length >= 3)
      .map((ring) => {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (Math.abs(first[0] - last[0]) > 1e-9 || Math.abs(first[1] - last[1]) > 1e-9) ring.push([...first]);
        return ring;
      });
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  return null;
}

function normalizeCoordinateList(coordinates) {
  return (coordinates || [])
    .map((coord) => {
      const normalized = [normalizeLon(Number(coord?.[0])), clamp(Number(coord?.[1]), -90, 90)];
      if (Number.isFinite(Number(coord?.[2]))) normalized.push(Number(coord[2]));
      return normalized;
    })
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
}

function parseBatchCustomCoordinates(text) {
  const items = [];
  let failed = 0;
  for (const line of String(text || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parsed = parseCustomCoordinateLine(trimmed);
    if (!parsed) {
      failed += 1;
      continue;
    }
    items.push(
      createCustomCoordinateItem({
        name: parsed.name || `批量坐标 ${items.length + 1}`,
        source: "批量导入",
        geometry: { type: "Point", coordinates: [parsed.lon, parsed.lat] },
      }),
    );
  }
  return { items, failed };
}

function parseCustomCoordinateLine(line) {
  const source = String(line || "").trim();
  if (!source) return null;

  const dms = extractDmsCoordinates(source);
  const latDms = dms.find((item) => item.axis === "lat");
  const lonDms = dms.find((item) => item.axis === "lon");
  if (latDms && lonDms) {
    return {
      lat: latDms.value,
      lon: lonDms.value,
      name: cleanupCoordinateName(source, dms.map((item) => item.raw)),
    };
  }

  const hemiDecimal = parseHemisphereDecimalPair(source);
  if (hemiDecimal) {
    return {
      lat: hemiDecimal.lat,
      lon: hemiDecimal.lon,
      name: cleanupCoordinateName(source, hemiDecimal.rawParts),
    };
  }

  const labeled = parseDecimalCoordinatePair(source);
  if (labeled) {
    return {
      lat: labeled.lat,
      lon: labeled.lon,
      name: cleanupCoordinateName(source, labeled.rawParts),
    };
  }

  const delimited = parseDelimitedDecimalPair(source);
  if (delimited) {
    return {
      lat: delimited.lat,
      lon: delimited.lon,
      name: cleanupCoordinateName(source, delimited.rawParts),
    };
  }

  const numberMatches = standaloneNumberMatches(source);
  const numbers = numberMatches.map((match) => Number(match.value));
  if (numbers.length < 2) return null;
  let pair = decimalPairFromValues(numbers[0], numbers[1]);
  if (!pair) return null;
  const lower = source.toLowerCase();
  if ((/(^|[,;\s])(lon|lng|longitude)\b/.test(lower) || /(?:\u7ecf\u5ea6|\u4e1c\u7ecf|\u897f\u7ecf)/.test(source)) && Math.abs(numbers[1]) <= 90) {
    pair = { lat: numbers[1], lon: numbers[0] };
  }
  if (!pair || !Number.isFinite(pair.lat) || !Number.isFinite(pair.lon) || Math.abs(pair.lat) > 90 || Math.abs(pair.lon) > 180) return null;
  return {
    lat: pair.lat,
    lon: pair.lon,
    name: cleanupCoordinateName(source, numberMatches.slice(0, 2).map((match) => match.raw)),
  };
}

function extractDmsCoordinates(text) {
  const output = [];
  const source = String(text || "");
  const hemiChars = "NSEW\\u5317\\u5357\\u4e1c\\u897f";
  const chinesePrefix = /(\u5317\u7eac|\u5357\u7eac|\u4e1c\u7ecf|\u897f\u7ecf)\s*(\d{1,3}(?:\.\d+)?)\s*(?:\u00b0|\u02da|\u5ea6|d|\s)\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:'|\u2019|\u2032|\u5206|m|\s))?\s*(?:(\d{1,2}(?:\.\d+)?)\s*(?:"|\u201d|\u2033|\u79d2|s)?)?/gi;
  const hemiAhead = new RegExp(
    `([${hemiChars}])\\s*(?:\\u7eac\\u5ea6|\\u7ecf\\u5ea6)?\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*(?:\\u00b0|\\u02da|\\u5ea6|d|\\s)\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:'|\\u2019|\\u2032|\\u5206|m|\\s))?\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:"|\\u201d|\\u2033|\\u79d2|s)?)?`,
    "gi",
  );
  const hemiBehind = new RegExp(
    `(?:\\u7eac\\u5ea6|\\u7ecf\\u5ea6)?\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*(?:\\u00b0|\\u02da|\\u5ea6|d|\\s)\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:'|\\u2019|\\u2032|\\u5206|m|\\s))?\\s*(?:(\\d{1,2}(?:\\.\\d+)?)\\s*(?:"|\\u201d|\\u2033|\\u79d2|s)?)?\\s*([${hemiChars}])`,
    "gi",
  );

  const addDms = (raw, hemiValue, degreesValue, minutesValue = 0, secondsValue = 0) => {
    const hemi = normalizeHemisphere(hemiValue);
    if (!hemi) return;
    const degrees = Number(degreesValue);
    const minutes = Number(minutesValue || 0);
    const seconds = Number(secondsValue || 0);
    if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return;
    if ((hemi === "N" || hemi === "S") && degrees > 90) return;
    if ((hemi === "E" || hemi === "W") && degrees > 180) return;
    if (minutes >= 60 || seconds >= 60) return;
    const sign = hemi === "S" || hemi === "W" ? -1 : 1;
    output.push({
      axis: hemi === "N" || hemi === "S" ? "lat" : "lon",
      value: sign * (degrees + minutes / 60 + seconds / 3600),
      raw,
    });
  };

  for (const match of source.matchAll(chinesePrefix)) addDms(match[0], match[1], match[2], match[3], match[4]);
  for (const match of source.matchAll(hemiAhead)) addDms(match[0], match[1], match[2], match[3], match[4]);
  for (const match of source.matchAll(hemiBehind)) addDms(match[0], match[4], match[1], match[2], match[3]);
  return dedupeDmsCoordinates(output);
}

function normalizeHemisphere(value) {
  const raw = String(value || "");
  const text = raw.toUpperCase();
  if (text === "N" || raw === "\u5317" || raw === "\u5317\u7eac") return "N";
  if (text === "S" || raw === "\u5357" || raw === "\u5357\u7eac") return "S";
  if (text === "E" || raw === "\u4e1c" || raw === "\u4e1c\u7ecf") return "E";
  if (text === "W" || raw === "\u897f" || raw === "\u897f\u7ecf") return "W";
  return "";
}

function dedupeDmsCoordinates(coords) {
  const seen = new Set();
  const output = [];
  for (const item of coords) {
    const key = `${item.axis}:${Math.round(item.value * 1e9)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function parseDelimitedDecimalPair(line) {
  const source = String(line || "");
  const parts = source
    .split(/[,;\t|\u3001\uff0c\uff1b]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const numericParts = [];
  for (const part of parts) {
    const cleaned = part
      .replace(/\b(lat|lon|lng|latitude|longitude)\b/gi, " ")
      .replace(/(?:\u5317\u7eac|\u5357\u7eac|\u4e1c\u7ecf|\u897f\u7ecf|\u7eac\u5ea6|\u7ecf\u5ea6)/g, " ")
      .replace(/[=\uff1a:]/g, " ")
      .trim();
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned)) continue;
    numericParts.push({ value: Number(cleaned), raw: part });
  }
  for (let index = 0; index < numericParts.length - 1; index += 1) {
    const pair = decimalPairFromValues(numericParts[index].value, numericParts[index + 1].value);
    if (pair) return { ...pair, rawParts: [numericParts[index].raw, numericParts[index + 1].raw] };
  }
  return null;
}

function decimalPairFromValues(first, second) {
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  let lat = first;
  let lon = second;
  if (Math.abs(first) > 90 && Math.abs(second) <= 90) {
    lon = first;
    lat = second;
  }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function standaloneNumberMatches(source) {
  const matches = [];
  const text = String(source || "");
  const pattern = /[-+]?\d+(?:\.\d+)?/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index || 0;
    const end = start + match[0].length;
    const before = start > 0 ? text[start - 1] : "";
    const after = end < text.length ? text[end] : "";
    if (isNameAdjacentCoordinateChar(before) || isNameAdjacentCoordinateChar(after)) continue;
    matches.push({ value: match[0], raw: match[0] });
  }
  return matches;
}

function isNameAdjacentCoordinateChar(char) {
  return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function parseHemisphereDecimalPair(line) {
  const source = String(line || "");
  const hemiChars = "NSEW\\u5317\\u5357\\u4e1c\\u897f";
  const pattern = new RegExp(
    `([${hemiChars}])\\s*([-+]?\\d+(?:\\.\\d+)?)|([-+]?\\d+(?:\\.\\d+)?)\\s*(?:\\u00b0|\\u02da|\\u5ea6|deg)?\\s*([${hemiChars}])`,
    "gi",
  );
  const coords = [];
  for (const match of source.matchAll(pattern)) {
    const hemi = normalizeHemisphere(match[1] || match[4]);
    if (!hemi) continue;
    const rawNumber = Number(match[2] ?? match[3]);
    if (!Number.isFinite(rawNumber)) continue;
    const axis = hemi === "N" || hemi === "S" ? "lat" : "lon";
    const maxAbs = axis === "lat" ? 90 : 180;
    if (Math.abs(rawNumber) > maxAbs) continue;
    const sign = hemi === "S" || hemi === "W" ? -1 : 1;
    coords.push({
      axis,
      value: Math.abs(rawNumber) * sign,
      raw: match[0],
    });
  }
  const lat = coords.find((item) => item.axis === "lat");
  const lon = coords.find((item) => item.axis === "lon");
  if (!lat || !lon) return null;
  return { lat: lat.value, lon: lon.value, rawParts: [lat.raw, lon.raw] };
}

function parseDecimalCoordinatePair(line) {
  const source = String(line || "");
  const latMatch = source.match(/(?:lat(?:itude)?|\u7eac\u5ea6|\u5317\u7eac|\u5357\u7eac)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/i);
  const lonMatch = source.match(/(?:lon(?:gitude)?|lng|\u7ecf\u5ea6|\u4e1c\u7ecf|\u897f\u7ecf)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/i);
  if (!latMatch || !lonMatch) return null;
  let lat = Number(latMatch[1]);
  let lon = Number(lonMatch[1]);
  if (/\u5357\u7eac/.test(source) && lat > 0) lat *= -1;
  if (/\u897f\u7ecf/.test(source) && lon > 0) lon *= -1;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon, rawParts: [latMatch[0], lonMatch[0]] };
}

function cleanupCoordinateName(line, removals) {
  let name = String(line || "");
  for (const part of removals || []) {
    name = name.replace(String(part), " ");
  }
  name = name
    .replace(/[,+;\u3001\uff0c\u3002\uff1b]/g, " ")
    .replace(/\b(lat|lon|lng|latitude|longitude)\b/gi, " ")
    .replace(/(?:\u5317\u7eac|\u5357\u7eac|\u4e1c\u7ecf|\u897f\u7ecf|\u7eac\u5ea6|\u7ecf\u5ea6)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > 1 ? name : "";
}

async function readKmlDocuments(file) {
  const buffer = await file.arrayBuffer();
  const isKmz = file.name.toLowerCase().endsWith(".kmz") || file.type === "application/vnd.google-earth.kmz";
  if (!isKmz) return [{ name: file.name, text: KML_IO.decodeKmlArrayBuffer(buffer) }];

  const JSZip = await loadJsZip();
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith(".kml"))
    .sort((a, b) => {
      const aDoc = /(^|\/)doc\.kml$/i.test(a.name) ? 0 : 1;
      const bDoc = /(^|\/)doc\.kml$/i.test(b.name) ? 0 : 1;
      return aDoc - bDoc || a.name.length - b.name.length || a.name.localeCompare(b.name);
    });
  if (!entries.length) throw new Error("KMZ 压缩包中没有找到 KML 文档");

  let totalBytes = 0;
  const documents = [];
  for (const entry of entries) {
    const bytes = await entry.async("uint8array");
    totalBytes += bytes.byteLength;
    if (bytes.byteLength > 32 * 1024 * 1024 || totalBytes > 64 * 1024 * 1024) {
      throw new Error("KMZ 解压后的 KML 内容超过安全上限（单文件 32 MB、合计 64 MB）");
    }
    documents.push({ name: entry.name, text: KML_IO.decodeKmlArrayBuffer(bytes) });
  }
  return documents;
}

function loadJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  if (!jsZipPromise) {
    jsZipPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = JSZIP_URL;
      script.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error("JSZip 未加载")));
      script.onerror = () => reject(new Error("无法加载 KMZ 解析模块"));
      document.head.appendChild(script);
    });
  }
  return jsZipPromise;
}

function parseKmlCustomCoordinates(kmlText, sourceName = "KML") {
  if (!KML_IO) throw new Error("KML/KMZ 解析模块未加载");
  const parsed = KML_IO.parseKml(kmlText, { DOMParser });
  return parsed.features
    .map((feature) =>
      createCustomCoordinateItem({
        name: feature.name,
        description: feature.description,
        source: sourceName,
        geometry: feature.geometry,
      }),
    )
    .filter(Boolean);
}

async function exportCustomCoordinates(format) {
  if (!state.customItems.length) {
    setCustomCoordinateStatus("没有可导出的自定义坐标。", true);
    return;
  }
  try {
    const kml = buildCustomKml();
    if (format === "kmz") {
      const JSZip = await loadJsZip();
      const zip = new JSZip();
      zip.file("doc.kml", kml);
      const blob = await zip.generateAsync({
        type: "blob",
        mimeType: "application/vnd.google-earth.kmz",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      downloadBlob(blob, `NOTAM-MAP-custom-${dateStamp()}.kmz`);
    } else {
      downloadBlob(new Blob([kml], { type: "application/vnd.google-earth.kml+xml;charset=utf-8" }), `NOTAM-MAP-custom-${dateStamp()}.kml`);
    }
    setCustomCoordinateStatus(`已导出 ${state.customItems.length} 个自定义对象为 ${format.toUpperCase()}`);
  } catch (error) {
    setCustomCoordinateStatus(`导出失败：${error.message}`, true);
  }
}

function buildCustomKml() {
  if (!KML_IO) throw new Error("KML/KMZ 导出模块未加载");
  return KML_IO.buildKml(state.customItems, { documentName: "NOTAM MAP 自定义坐标" });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function customItemLabelPoint(item) {
  if (item.geometry?.type === "Point") {
    const [lon, lat] = item.geometry.coordinates;
    return { lon, lat };
  }
  const bounds = item.bounds;
  if (!bounds) return null;
  return {
    lon: normalizeLon((bounds.minLon + bounds.maxLon) / 2),
    lat: (bounds.minLat + bounds.maxLat) / 2,
  };
}

function customGeometryLabel(type) {
  if (type === "Point") return "点";
  if (type === "LineString") return "线";
  if (type === "Polygon") return "面";
  return type || "未知";
}

function formatCustomGeometryCoordinates(geometry) {
  if (geometry?.type === "Point") {
    const [lon, lat] = geometry.coordinates;
    return formatDmsPair(lat, lon);
  }
  if (geometry?.type === "LineString") {
    return geometry.coordinates.map(([lon, lat], index) => `${index + 1}. ${formatDmsPair(lat, lon)}`).join(" | ");
  }
  return formatGeometryVertices(geometry);
}

function activeTrajectory() {
  let track = state.trajectoryTracks.find((item) => item.id === state.activeTrajectoryId);
  if (!track) {
    track = state.trajectoryTracks[0] || createTrajectoryTrackModel();
    if (!state.trajectoryTracks.length) state.trajectoryTracks.push(track);
    state.activeTrajectoryId = track.id;
  }
  return track;
}

function trajectoryEditSnapshot(track) {
  ensureTrajectoryPoints(track);
  return TRAJECTORY_HISTORY?.snapshot(track) || {
    points: track.points.map((point) => ({ ...point })),
    curveControls: Object.fromEntries(Object.entries(track.curveControls || {}).map(([key, point]) => [key, { ...point }])),
  };
}

function commitTrajectoryEdit(track, before) {
  const committed = TRAJECTORY_HISTORY?.commit(track, before) || false;
  if (committed) invalidateTrajectoryDerivedState(track);
  return committed;
}

function invalidateTrajectoryDerivedState(track) {
  if (!track) return;
  trajectoryRenderRevision += 1;
  trajectoryGeometryCache.delete(track);
  trajectoryProjectionCache.delete(track);
  poweredPathGeometryCache.delete(track.ballistic);
  for (const stage of track.ballistic?.stages || []) ballisticStageSegmentCache.delete(stage);
  const selectedAnimationKeys = ensureBallisticAnimationConfig().objectKeys;
  if ((track.ballistic?.stages || []).some((stage) => selectedAnimationKeys.includes(ballisticAnimationObjectKey(track.id, stage.id)))) {
    state.ballisticAnimation.elapsedSec = 0;
    invalidateBallisticAnimationSession("星下点轨迹发生变化，请重新预计算");
  }
}

function trajectoryCanUndo(track) {
  return Boolean(TRAJECTORY_HISTORY?.canUndo(track));
}

function trajectoryCanRedo(track) {
  return Boolean(TRAJECTORY_HISTORY?.canRedo(track));
}

function syncTrajectoryEditButtons(track = activeTrajectory()) {
  if (els.canvas) {
    els.canvas.dataset.trajectoryManualLocked = track.manualLocked ? "true" : "false";
    els.canvas.dataset.trajectoryUndoCount = String(track.manualUndoStack?.length || 0);
    els.canvas.dataset.trajectoryRedoCount = String(track.manualRedoStack?.length || 0);
  }
  if (els.trajectoryLockButton) {
    els.trajectoryLockButton.classList.toggle("locked", track.manualLocked);
    els.trajectoryLockButton.setAttribute("aria-pressed", String(track.manualLocked));
    els.trajectoryLockButton.textContent = track.manualLocked ? "解除固定并继续编辑" : "固定当前星下点线";
  }
  if (els.trajectoryLockStatus) {
    els.trajectoryLockStatus.textContent = track.manualLocked
      ? "轨迹已固定：地图点击和曲线拖动不再改变此线"
      : "编辑中：点击地图加点，拖动线段调整曲线";
  }
  if (els.undoTrajectoryPointButton) els.undoTrajectoryPointButton.disabled = !trajectoryCanUndo(track);
  if (els.redoTrajectoryPointButton) els.redoTrajectoryPointButton.disabled = !trajectoryCanRedo(track);
}

function toggleTrajectoryLock() {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  track.manualLocked = !track.manualLocked;
  if (track.manualLocked) state.trajectoryDrag = null;
  syncTrajectoryEditButtons(track);
  renderTrajectoryPlan();
  updateTrajectoryCount();
  draw();
}

function createTrajectoryTrackModel() {
  const id = `trajectory-${state.nextTrajectoryNumber}`;
  const color = TRAJECTORY_COLORS[(state.nextTrajectoryNumber - 1) % TRAJECTORY_COLORS.length];
  return {
    id,
    name: `轨迹 ${state.nextTrajectoryNumber}`,
    color,
    lineWidth: DEFAULT_TRAJECTORY_LINE_WIDTH,
    dashDensity: DEFAULT_TRAJECTORY_DASH_DENSITY,
    groundTrackGlow: 10,
    geodesic: false,
    showGroundTrack: true,
    groundTrackMode: "manual",
    groundTrackSources: ["manual"],
    manualLocked: false,
    pointIds: [],
    points: [],
    curveControls: {},
    ballistic: createBallisticConfig(),
  };
}

function createBallisticConfig() {
  return {
    enabled: false,
    showPoweredPath: true,
    poweredPathColor: "#ffd166",
    poweredPathWidth: 4,
    poweredVerticalLaunch: true,
    poweredStartLon: null,
    poweredStartLat: null,
    showLabels: true,
    showAnimationLabels: true,
    showGroundRange: true,
    activeStageId: "",
    stages: [],
  };
}

function defaultBallisticEpochUtc() {
  const instant = new Date();
  instant.setUTCMinutes(0, 0, 0);
  return instant.toISOString();
}

function createBallisticStageModel(overrides = {}) {
  const sequence = state.nextBallisticStageNumber;
  state.nextBallisticStageNumber += 1;
  return {
    id: `ballistic-stage-${sequence}`,
    name: overrides.name || `${sequence} 级残骸`,
    color: overrides.color || BALLISTIC_COLORS[(sequence - 1) % BALLISTIC_COLORS.length],
    lineWidth: finiteOrClamp(
      overrides.lineWidth,
      BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
      BALLISTIC_STAGE_LINE_WIDTH_MIN,
      BALLISTIC_STAGE_LINE_WIDTH_MAX,
    ),
    burnoutPointId: overrides.burnoutPointId || "",
    burnoutLon: overrides.burnoutLon !== null && overrides.burnoutLon !== "" && Number.isFinite(Number(overrides.burnoutLon))
      ? normalizeLon(Number(overrides.burnoutLon))
      : null,
    burnoutLat: overrides.burnoutLat !== null && overrides.burnoutLat !== "" && Number.isFinite(Number(overrides.burnoutLat))
      ? clamp(Number(overrides.burnoutLat), -90, 90)
      : null,
    burnoutLabel: overrides.burnoutLabel || "",
    positionMode: overrides.positionMode === "free" ? "free" : "track",
    burnoutPathKm: Number.isFinite(Number(overrides.burnoutPathKm)) ? Math.max(0, Number(overrides.burnoutPathKm)) : null,
    burnoutPathFraction: Number.isFinite(Number(overrides.burnoutPathFraction)) ? clamp(Number(overrides.burnoutPathFraction), 0, 1) : null,
    legacyBurnoutPct: Number.isFinite(overrides.legacyBurnoutPct) ? overrides.legacyBurnoutPct : null,
    initialSpeedMps: Number.isFinite(overrides.initialSpeedMps) ? overrides.initialSpeedMps : BALLISTIC_DEFAULT_SPEED_MPS,
    flightPathAngleDeg: Number.isFinite(overrides.flightPathAngleDeg) ? overrides.flightPathAngleDeg : BALLISTIC_DEFAULT_ANGLE_DEG,
    burnoutAltitudeKm: Number.isFinite(overrides.burnoutAltitudeKm) ? overrides.burnoutAltitudeKm : BALLISTIC_DEFAULT_ALTITUDE_KM,
    headingMode: overrides.headingMode === "manual" ? "manual" : "track",
    manualHeadingDeg: Number.isFinite(Number(overrides.manualHeadingDeg)) ? normalizeBearing(Number(overrides.manualHeadingDeg)) : 90,
    headingOffsetDeg: Number.isFinite(overrides.headingOffsetDeg) ? overrides.headingOffsetDeg : 0,
    dragEnabled: overrides.dragEnabled !== false,
    impactFlashEnabled: overrides.impactFlashEnabled !== false,
    atmosphereModel: overrides.atmosphereModel === "standard1976" ? "standard1976" : "nrlmsise00",
    atmosphereEpochUtc: Number.isFinite(Date.parse(overrides.atmosphereEpochUtc || ""))
      ? new Date(overrides.atmosphereEpochUtc).toISOString()
      : defaultBallisticEpochUtc(),
    f107Daily: Number.isFinite(Number(overrides.f107Daily)) ? clamp(Number(overrides.f107Daily), 50, 400) : 150,
    f107Average: Number.isFinite(Number(overrides.f107Average)) ? clamp(Number(overrides.f107Average), 50, 400) : 150,
    ap: Number.isFinite(Number(overrides.ap)) ? clamp(Number(overrides.ap), 0, 400) : 4,
    noseRadiusM: Number.isFinite(Number(overrides.noseRadiusM)) ? clamp(Number(overrides.noseRadiusM), 0.01, 100) : 1,
    liftToDragRatio: Number.isFinite(Number(overrides.liftToDragRatio)) ? clamp(Number(overrides.liftToDragRatio), 0, 3) : 0,
    bankAngleDeg: Number.isFinite(Number(overrides.bankAngleDeg)) ? clamp(Number(overrides.bankAngleDeg), -180, 180) : 0,
    ballisticCoefficientKgM2: Number.isFinite(overrides.ballisticCoefficientKgM2)
      ? overrides.ballisticCoefficientKgM2
      : BALLISTIC_DEFAULT_COEFFICIENT_KG_M2,
    maxTimeSec: Number.isFinite(overrides.maxTimeSec) ? overrides.maxTimeSec : BALLISTIC_DEFAULT_MAX_TIME_SEC,
    targetLon: overrides.targetLon !== null && overrides.targetLon !== "" && Number.isFinite(Number(overrides.targetLon))
      ? normalizeLon(Number(overrides.targetLon))
      : null,
    targetLat: overrides.targetLat !== null && overrides.targetLat !== "" && Number.isFinite(Number(overrides.targetLat))
      ? clamp(Number(overrides.targetLat), -90, 90)
      : null,
    targetLabel: overrides.targetLabel || "",
    inverseMode: overrides.inverseMode === "heading-angle" ? "heading-angle" : "heading-speed",
    targetToleranceKm: Number.isFinite(Number(overrides.targetToleranceKm)) ? clamp(Number(overrides.targetToleranceKm), 0.01, 500) : 1,
  };
}

function syncActiveTrajectoryState() {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  state.trajectoryPointIds = track.points.map((point) => point.restrictionId).filter(Boolean);
}

function selectedTrajectoryItems(track = activeTrajectory()) {
  ensureTrajectoryPoints(track);
  return track.points
    .map((point) => {
      const item = point.restrictionId ? state.restrictionById.get(point.restrictionId) || null : null;
      const target = trajectoryPointTarget(point, item);
      return target ? { item, point, target } : null;
    })
    .filter(Boolean);
}

function trajectoryMembershipLegacy(id) {
  for (const track of state.trajectoryTracks) {
    ensureTrajectoryPoints(track);
    const index = track.points.findIndex((point) => point.restrictionId === id);
    if (index >= 0) return { color: track.color, label: `${track.name} 点 ${index + 1}` };
  }
  return null;
}

function trajectoryMembershipIndex() {
  const membershipById = new Map();
  for (const track of state.trajectoryTracks) {
    ensureTrajectoryPoints(track);
    track.points.forEach((point, pointIndex) => {
      if (!point.restrictionId || membershipById.has(point.restrictionId)) return;
      membershipById.set(point.restrictionId, {
        color: track.color,
        label: `${track.name} 点 ${pointIndex + 1}`,
      });
    });
  }
  return membershipById;
}

function trajectoryMembership(id, membershipIndex = null) {
  return (membershipIndex || trajectoryMembershipIndex()).get(id) || null;
}

function syncHighlightedRestrictionSelection() {
  const validIds = new Set(state.restrictions.map((item) => item.id));
  state.highlightedRestrictionIds = new Set([...state.highlightedRestrictionIds].filter((id) => validIds.has(id)));
  state.timeWindowRestrictionIds = new Set([...state.timeWindowRestrictionIds].filter((id) => validIds.has(id)));
  if (state.timeWindowAnchorId && !validIds.has(state.timeWindowAnchorId)) {
    state.timeWindowAnchorId = "";
    state.timeWindowSummary = null;
  }
}

function toggleHighlightedRestriction(id) {
  if (!id) return;
  if (state.highlightedRestrictionIds.has(id)) state.highlightedRestrictionIds.delete(id);
  else state.highlightedRestrictionIds.add(id);
  state.selectedId = id;
  renderList();
  draw();
}

function toggleTimeWindowHint(id) {
  if (!id) {
    clearTimeWindowHint();
    return;
  }
  if (state.timeWindowAnchorId === id && state.timeWindowRestrictionIds.size) {
    clearTimeWindowHint();
    return;
  }
  const anchor = state.restrictions.find((candidate) => candidate.id === id);
  if (!anchor) return;
  const peers = state.restrictions.filter((candidate) => sameRestrictionTimeWindow(anchor, candidate));
  state.timeWindowRestrictionIds = new Set((peers.length ? peers : [anchor]).map((item) => item.id));
  const sourceCounts = summarizeTooltipSources(peers.length ? peers : [anchor]);
  state.timeWindowAnchorId = id;
  state.timeWindowSummary = {
    count: state.timeWindowRestrictionIds.size,
    label: anchor.notamId || anchor.title || "当前区域",
    timeLabel: anchor.timeWindow?.beijingLabel || anchor.beijingTimeLabel || anchor.timeLabel || "",
    sourceCounts,
  };
  state.selectedId = id;
  renderList();
  updateCounts();
  draw();
}

function clearTimeWindowHint() {
  if (!state.timeWindowRestrictionIds.size && !state.timeWindowAnchorId) return;
  state.timeWindowRestrictionIds = new Set();
  state.timeWindowAnchorId = "";
  state.timeWindowSummary = null;
  renderList();
  updateCounts();
  draw();
}

function sameRestrictionTimeWindow(anchor, item) {
  if (!anchor?.id || !item?.id) return false;
  if (anchor.id === item.id) return true;
  const anchorWindow = anchor.timeWindow;
  const itemWindow = item.timeWindow;
  if (anchorWindow?.beijingKey && itemWindow?.beijingKey && anchorWindow.beijingKey === itemWindow.beijingKey) return true;
  if (anchorWindow?.key && itemWindow?.key && anchorWindow.key === itemWindow.key) return true;
  if (hasConcreteTimeWindow(anchorWindow) && hasConcreteTimeWindow(itemWindow)) {
    const sameStart = Math.abs(anchorWindow.startMs - itemWindow.startMs) <= TIME_WINDOW_TOLERANCE_MS;
    const sameEnd = Math.abs(anchorWindow.endMs - itemWindow.endMs) <= TIME_WINDOW_TOLERANCE_MS;
    if (sameStart && sameEnd) return true;

    const overlap = Math.min(anchorWindow.endMs, itemWindow.endMs) - Math.max(anchorWindow.startMs, itemWindow.startMs);
    const shorter = Math.min(anchorWindow.durationMs || 0, itemWindow.durationMs || 0);
    const durationDelta = Math.abs((anchorWindow.durationMs || 0) - (itemWindow.durationMs || 0));
    if (overlap > 0 && shorter > 0 && overlap / shorter >= 0.985 && durationDelta <= TIME_WINDOW_TOLERANCE_MS * 2) return true;
  }
  if (anchorWindow?.beijingTextKey && itemWindow?.beijingTextKey && anchorWindow.beijingTextKey === itemWindow.beijingTextKey) return true;
  return Boolean(anchor.timeTextKey && item.timeTextKey && anchor.timeTextKey === item.timeTextKey);
}

function hasConcreteTimeWindow(window) {
  return Number.isFinite(window?.startMs) && Number.isFinite(window?.endMs);
}

function toggleTrajectoryPoint(id) {
  const item = state.restrictions.find((candidate) => candidate.id === id);
  if (!item?.hasGeometry) return;
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (track.manualLocked) return;
  const before = trajectoryEditSnapshot(track);
  const index = track.points.findIndex((point) => point.restrictionId === id);
  if (index >= 0) track.points.splice(index, 1);
  else {
    const target = restrictionTargetPoint(item);
    if (!target) return;
    track.points.push(createTrajectoryPoint(target, item, "notam-center"));
  }
  track.pointIds = track.points.map((point) => point.restrictionId).filter(Boolean);
  pruneTrajectoryCurveControls(track);
  commitTrajectoryEdit(track, before);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  state.trajectoryEnabled = track.points.length > 0 || state.trajectoryEnabled;
  els.trajectoryToggle.checked = state.trajectoryEnabled;
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  renderLegend();
  draw();
}

function clearTrajectoryPoints() {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  const before = trajectoryEditSnapshot(track);
  track.points = [];
  track.pointIds = [];
  track.curveControls = {};
  commitTrajectoryEdit(track, before);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  draw();
}

function createTrajectoryTrack() {
  const track = createTrajectoryTrackModel();
  state.nextTrajectoryNumber += 1;
  state.trajectoryTracks.push(track);
  state.activeTrajectoryId = track.id;
  state.trajectoryEnabled = true;
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryControls();
  renderLegend();
  renderList();
  draw();
}

function deleteActiveTrajectoryTrack() {
  if (state.trajectoryTracks.length <= 1) {
    clearTrajectoryPoints();
    return;
  }
  const index = state.trajectoryTracks.findIndex((track) => track.id === state.activeTrajectoryId);
  const deletedTrack = state.trajectoryTracks[Math.max(0, index)];
  state.trajectoryTracks.splice(Math.max(0, index), 1);
  const animation = ensureBallisticAnimationConfig();
  const deletedKeys = new Set((deletedTrack?.ballistic?.stages || []).map((stage) => ballisticAnimationObjectKey(deletedTrack.id, stage.id)));
  if (animation.objectKeys.some((key) => deletedKeys.has(key))) {
    animation.objectKeys = animation.objectKeys.filter((key) => !deletedKeys.has(key));
    for (const key of deletedKeys) delete animation.objectSettings[key];
    if (deletedKeys.has(animation.focusKey)) animation.focusKey = animation.objectKeys[0] || "";
    invalidateBallisticAnimationSession("轨迹已删除，需要重新预计算");
  }
  state.activeTrajectoryId = state.trajectoryTracks[Math.max(0, index - 1)]?.id || state.trajectoryTracks[0].id;
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryControls();
  renderLegend();
  renderList();
  draw();
}

function updateTrajectoryCount() {
  if (!els.trajectoryCount) return;
  const track = activeTrajectory();
  const selected = selectedTrajectoryItems(track);
  const metricParts = [];
  const geometry = selected.length >= 2 && (state.trajectoryLengthLabels || state.trajectoryInclinationLabels)
    ? cachedTrajectoryGeometry(track, selected)
    : null;
  if (geometry && state.trajectoryLengthLabels) {
    metricParts.push(formatKm(trajectoryDisplayLengthKm(track, selected, geometry.normalized)));
  }
  if (selected.length >= 2 && state.trajectoryInclinationLabels) {
    metricParts.push(formatTrajectoryInclination(trajectoryInclinationDeg(geometry.normalized)));
  }
  if (track.ballistic?.enabled) metricParts.push(`${track.ballistic.stages?.length || 0} 级弹道`);
  els.trajectoryCount.textContent = `${selected.length} 点${metricParts.length ? ` · ${metricParts.join(" · ")}` : ""}${track.manualLocked ? " · 已固定" : state.trajectoryEnabled ? "" : " · 编辑关"}`;
}

function requestTrajectoryCountUpdate() {
  if (trajectoryMetricFrame) return;
  trajectoryMetricFrame = requestAnimationFrame(() => {
    trajectoryMetricFrame = 0;
    updateTrajectoryCount();
  });
}

function undoTrajectoryPoint() {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (!TRAJECTORY_HISTORY?.undo(track)) return;
  invalidateTrajectoryDerivedState(track);
  pruneTrajectoryCurveControls(track);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  draw();
}

function redoTrajectoryPoint() {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (!TRAJECTORY_HISTORY?.redo(track)) return;
  invalidateTrajectoryDerivedState(track);
  pruneTrajectoryCurveControls(track);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  draw();
}

function removeTrajectoryPoint(pointId) {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (track.manualLocked) return;
  const before = trajectoryEditSnapshot(track);
  track.points = track.points.filter((point) => point.id !== pointId);
  track.pointIds = track.points.map((point) => point.restrictionId).filter(Boolean);
  pruneTrajectoryCurveControls(track);
  commitTrajectoryEdit(track, before);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  renderLegend();
  draw();
}

function addTrajectoryPointFromMap(lonLat, restrictionId = null) {
  const track = activeTrajectory();
  ensureTrajectoryPoints(track);
  if (track.manualLocked) return;
  const before = trajectoryEditSnapshot(track);
  const item = restrictionId ? state.restrictionById.get(restrictionId) || null : null;
  const point = createTrajectoryPoint(
    { lon: normalizeLon(lonLat.lon), lat: clamp(lonLat.lat, -85, 85) },
    item,
    item ? "notam-click" : "custom",
  );
  track.points.push(point);
  track.pointIds = track.points.map((candidate) => candidate.restrictionId).filter(Boolean);
  commitTrajectoryEdit(track, before);
  syncActiveTrajectoryState();
  syncHighlightedRestrictionSelection();
  state.trajectoryEnabled = true;
  els.trajectoryToggle.checked = true;
  renderTrajectoryPlan();
  renderList();
  updateTrajectoryCount();
  renderLegend();
  draw();
}

function createTrajectoryPoint(target, item = null, type = "custom") {
  const sequence = state.nextTrajectoryPointNumber;
  state.nextTrajectoryPointNumber += 1;
  return {
    id: `trajectory-point-${sequence}`,
    type,
    restrictionId: item?.id || null,
    notamId: item?.notamId || item?.notamKey || null,
    label: item ? item.notamId || item.region || item.type || `NOTAM ${sequence}` : `自定义点 ${sequence}`,
    lon: normalizeLon(target.lon),
    lat: clamp(target.lat, -85, 85),
  };
}

function ensureTrajectoryPoints(track) {
  if (!track) return;
  if (!Number.isFinite(track.lineWidth)) track.lineWidth = DEFAULT_TRAJECTORY_LINE_WIDTH;
  if (!Number.isFinite(track.dashDensity)) track.dashDensity = DEFAULT_TRAJECTORY_DASH_DENSITY;
  track.groundTrackGlow = finiteOrClamp(track.groundTrackGlow, 10, 0, 30);
  track.geodesic = Boolean(track.geodesic);
  track.showGroundTrack = track.showGroundTrack !== false;
  track.manualLocked = Boolean(track.manualLocked);
  const legacyGroundTrackMode = track.groundTrackMode === "ballistic" ? "ballistic" : "manual";
  if (!Array.isArray(track.points)) {
    track.points = (track.pointIds || [])
      .map((id) => {
        const item = state.restrictionById.get(id) || null;
        const target = item ? restrictionTargetPoint(item) : null;
        return item && target ? createTrajectoryPoint(target, item, "notam-center") : null;
      })
      .filter(Boolean);
  }
  if (!track.curveControls || typeof track.curveControls !== "object") track.curveControls = {};
  TRAJECTORY_HISTORY?.ensure(track);
  ensureTrajectoryBallistic(track);
  const validSources = new Set([
    "manual",
    ...track.ballistic.stages.map((stage) => ballisticGroundTrackSourceKey(stage.id)),
  ]);
  if (!Array.isArray(track.groundTrackSources)) {
    track.groundTrackSources = legacyGroundTrackMode === "ballistic"
      ? track.ballistic.stages.map((stage) => ballisticGroundTrackSourceKey(stage.id))
      : ["manual"];
  } else {
    track.groundTrackSources = track.groundTrackSources.filter((source, index, sources) =>
      validSources.has(source) && sources.indexOf(source) === index);
  }
  track.groundTrackMode = track.groundTrackSources.includes("manual") ? "manual" : "ballistic";
}

function ensureTrajectoryBallistic(track) {
  if (!track) return;
  if (!track.ballistic || typeof track.ballistic !== "object") track.ballistic = createBallisticConfig();
  if (normalizedBallisticModels.has(track.ballistic)) return;
  track.ballistic.enabled = Boolean(track.ballistic.enabled);
  track.ballistic.showPoweredPath = track.ballistic.showPoweredPath !== false;
  track.ballistic.poweredPathColor = /^#[0-9a-f]{6}$/i.test(track.ballistic.poweredPathColor || "") ? track.ballistic.poweredPathColor : "#ffd166";
  track.ballistic.poweredPathWidth = finiteOrClamp(track.ballistic.poweredPathWidth, 4, 1, 12);
  track.ballistic.poweredVerticalLaunch = track.ballistic.poweredVerticalLaunch !== false;
  track.ballistic.poweredStartLon = track.ballistic.poweredStartLon !== null && track.ballistic.poweredStartLon !== "" && Number.isFinite(Number(track.ballistic.poweredStartLon))
    ? normalizeLon(Number(track.ballistic.poweredStartLon))
    : null;
  track.ballistic.poweredStartLat = track.ballistic.poweredStartLat !== null && track.ballistic.poweredStartLat !== "" && Number.isFinite(Number(track.ballistic.poweredStartLat))
    ? clamp(Number(track.ballistic.poweredStartLat), -90, 90)
    : null;
  track.ballistic.showLabels = track.ballistic.showLabels !== false;
  track.ballistic.showAnimationLabels = track.ballistic.showAnimationLabels !== false;
  track.ballistic.showGroundRange = track.ballistic.showGroundRange !== false;
  if (!Array.isArray(track.ballistic.stages)) track.ballistic.stages = [];
  track.ballistic.stages = track.ballistic.stages.map((stage, index) => {
    const normalized = {
    id: stage.id || `ballistic-stage-restored-${index + 1}`,
    name: stage.name || `${index + 1} 级残骸`,
    color: stage.color || BALLISTIC_COLORS[index % BALLISTIC_COLORS.length],
    lineWidth: finiteOrClamp(
      stage.lineWidth,
      BALLISTIC_STAGE_LINE_WIDTH_DEFAULT,
      BALLISTIC_STAGE_LINE_WIDTH_MIN,
      BALLISTIC_STAGE_LINE_WIDTH_MAX,
    ),
    burnoutPointId: stage.burnoutPointId || "",
    burnoutLon: stage.burnoutLon !== null && stage.burnoutLon !== "" && Number.isFinite(Number(stage.burnoutLon))
      ? normalizeLon(Number(stage.burnoutLon))
      : null,
    burnoutLat: stage.burnoutLat !== null && stage.burnoutLat !== "" && Number.isFinite(Number(stage.burnoutLat))
      ? clamp(Number(stage.burnoutLat), -90, 90)
      : null,
    burnoutLabel: stage.burnoutLabel || "",
    positionMode: stage.positionMode === "free" ? "free" : "track",
    burnoutPathKm: stage.burnoutPathKm !== null && stage.burnoutPathKm !== "" && Number.isFinite(Number(stage.burnoutPathKm))
      ? Math.max(0, Number(stage.burnoutPathKm))
      : null,
    burnoutPathFraction: stage.burnoutPathFraction !== null && stage.burnoutPathFraction !== "" && Number.isFinite(Number(stage.burnoutPathFraction))
      ? clamp(Number(stage.burnoutPathFraction), 0, 1)
      : null,
    legacyBurnoutPct: stage.legacyBurnoutPct !== null && stage.legacyBurnoutPct !== "" && Number.isFinite(Number(stage.legacyBurnoutPct))
      ? finiteOrClamp(stage.legacyBurnoutPct, null, 0, 100)
      : stage.burnoutPct !== null && stage.burnoutPct !== "" && Number.isFinite(Number(stage.burnoutPct))
        ? finiteOrClamp(stage.burnoutPct, null, 0, 100)
        : null,
    initialSpeedMps: finiteOrClamp(stage.initialSpeedMps, BALLISTIC_DEFAULT_SPEED_MPS, 1, 20000),
    flightPathAngleDeg: finiteOrClamp(stage.flightPathAngleDeg ?? stage.angleDeg, BALLISTIC_DEFAULT_ANGLE_DEG, -89, 89),
    burnoutAltitudeKm: finiteOrClamp(stage.burnoutAltitudeKm, BALLISTIC_DEFAULT_ALTITUDE_KM, 0, 5000),
    headingMode: stage.headingMode === "manual" ? "manual" : "track",
    manualHeadingDeg: finiteOrClamp(stage.manualHeadingDeg, 90, 0, 360),
    headingOffsetDeg: finiteOrClamp(stage.headingOffsetDeg, 0, -180, 180),
    dragEnabled: stage.dragEnabled !== false,
    impactFlashEnabled: stage.impactFlashEnabled !== false,
    atmosphereModel: stage.atmosphereModel === "standard1976" ? "standard1976" : "nrlmsise00",
    atmosphereEpochUtc: Number.isFinite(Date.parse(stage.atmosphereEpochUtc || ""))
      ? new Date(stage.atmosphereEpochUtc).toISOString()
      : defaultBallisticEpochUtc(),
    f107Daily: finiteOrClamp(stage.f107Daily, 150, 50, 400),
    f107Average: finiteOrClamp(stage.f107Average, 150, 50, 400),
    ap: finiteOrClamp(stage.ap, 4, 0, 400),
    noseRadiusM: finiteOrClamp(stage.noseRadiusM, 1, 0.01, 100),
    liftToDragRatio: finiteOrClamp(stage.liftToDragRatio, 0, 0, 3),
    bankAngleDeg: finiteOrClamp(stage.bankAngleDeg, 0, -180, 180),
    ballisticCoefficientKgM2: finiteOrClamp(
      stage.ballisticCoefficientKgM2,
      BALLISTIC_DEFAULT_COEFFICIENT_KG_M2,
      1,
      100000,
    ),
      maxTimeSec: finiteOrClamp(stage.maxTimeSec, BALLISTIC_DEFAULT_MAX_TIME_SEC, 10, 604800),
      targetLon: stage.targetLon !== null && stage.targetLon !== "" && Number.isFinite(Number(stage.targetLon))
        ? normalizeLon(Number(stage.targetLon))
        : null,
      targetLat: stage.targetLat !== null && stage.targetLat !== "" && Number.isFinite(Number(stage.targetLat))
        ? clamp(Number(stage.targetLat), -90, 90)
        : null,
      targetLabel: stage.targetLabel || "",
      inverseMode: stage.inverseMode === "heading-angle" ? "heading-angle" : "heading-speed",
      targetToleranceKm: finiteOrClamp(stage.targetToleranceKm, 1, 0.01, 500),
    };
    Object.assign(stage, normalized);
    return stage;
  });
  delete track.ballistic.payload;
  if (!track.ballistic.activeStageId && track.ballistic.stages.length) track.ballistic.activeStageId = track.ballistic.stages[0].id;
  if (track.ballistic.activeStageId && !track.ballistic.stages.some((stage) => stage.id === track.ballistic.activeStageId)) {
    track.ballistic.activeStageId = track.ballistic.stages[0]?.id || "";
  }
  normalizedBallisticModels.add(track.ballistic);
}

function finiteOrClamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, min, max) : fallback;
}

function trajectoryPointTarget(point, item = null) {
  if (Number.isFinite(point?.lon) && Number.isFinite(point?.lat)) {
    return { lon: normalizeLon(point.lon), lat: clamp(point.lat, -85, 85) };
  }
  return item ? restrictionTargetPoint(item) : null;
}

function trajectoryPointLabel(point, item = null) {
  if (point?.type === "notam-center") return `${point.label || item?.notamId || "NOTAM"} 中心`;
  if (point?.restrictionId) return `${point.label || item?.notamId || "NOTAM"} 点击点`;
  return point?.label || "自定义点";
}

function pruneTrajectoryCurveControls(track) {
  if (!track?.curveControls) return;
  const selected = selectedTrajectoryItems(track);
  const valid = new Set();
  for (let index = 0; index < selected.length - 1; index += 1) {
    valid.add(segmentControlKey(selected, index));
  }
  for (const key of Object.keys(track.curveControls)) {
    if (!valid.has(key)) delete track.curveControls[key];
  }
}

function segmentControlKey(selected, index) {
  return `${selected[index]?.point?.id || index}:${selected[index + 1]?.point?.id || index + 1}`;
}

function buildPaintCurveSamples(selected, track) {
  const targets = selected.map(({ target }) => target);
  if (targets.length < 2) {
    return targets.map((point) => ({ ...point, segmentIndex: 0 }));
  }
  const controls = targets.map((point, index) => ({
    lon: normalizeLon(point.lon),
    lat: clamp(point.lat, -85, 85),
    t: targets.length === 1 ? 0 : index / (targets.length - 1),
  }));
  const unwrapped = unwrapControlLongitudes(controls);
  const samples = [];
  for (let index = 0; index < unwrapped.length - 1; index += 1) {
    const p1 = unwrapped[index];
    const p2 = unwrapped[index + 1];
    const key = segmentControlKey(selected, index);
    const bend = track.curveControls?.[key];
    if (bend) {
      const control = {
        lon: normalizeLonNear(bend.lon, p1.lon),
        lat: clamp(bend.lat, -85, 85),
        t: (p1.t + p2.t) / 2,
      };
      const steps = trajectorySegmentSampleSteps(p1, p2, control);
      for (let step = 0; step <= steps; step += 1) {
        if (index > 0 && step === 0) continue;
        const local = step / steps;
        samples.push({ ...quadraticPoint(p1, control, p2, local), segmentIndex: index });
      }
      continue;
    }

    const p0 = unwrapped[Math.max(0, index - 1)];
    const p3 = unwrapped[Math.min(unwrapped.length - 1, index + 2)];
    const steps = trajectorySegmentSampleSteps(p1, p2, null, p0, p3);
    for (let step = 0; step <= steps; step += 1) {
      if (index > 0 && step === 0) continue;
      const local = step / steps;
      samples.push({ ...catmullRomPoint(p0, p1, p2, p3, local), segmentIndex: index });
    }
  }
  return samples;
}

function buildTrajectorySamples(selected, track) {
  return track?.geodesic ? buildEllipsoidGeodesicSamples(selected) : buildPaintCurveSamples(selected, track);
}

function buildEllipsoidGeodesicSamples(selected) {
  const targets = selected.map(({ target }) => target);
  if (targets.length < 2) return targets.map((point) => ({ ...point, segmentIndex: 0 }));
  const start = targets[0];
  const end = targets[targets.length - 1];
  const inverse = vincentyInverse(start, end);
  if (!inverse || !Number.isFinite(inverse.distanceM) || inverse.distanceM < 1) {
    return [start, end].map((point, index) => ({ lon: normalizeLon(point.lon), lat: clamp(point.lat, -85, 85), segmentIndex: index }));
  }
  const steps = Math.round(clamp(Math.ceil(inverse.distanceM / 1000 / TRAJECTORY_SAMPLE_TARGET_KM), TRAJECTORY_SAMPLE_MIN_STEPS, TRAJECTORY_SAMPLE_MAX_STEPS));
  const samples = [];
  for (let step = 0; step <= steps; step += 1) {
    const point = vincentyDirect(start, inverse.initialBearingDeg, inverse.distanceM * (step / steps)) || interpolateGreatCircle(start, end, step / steps);
    samples.push({ lon: normalizeLon(point.lon), lat: clamp(point.lat, -85, 85), segmentIndex: 0 });
  }
  return samples;
}

function vincentyInverse(a, b) {
  const phi1 = toRad(clamp(a.lat, -89.999999, 89.999999));
  const phi2 = toRad(clamp(b.lat, -89.999999, 89.999999));
  const L = toRad(normalizeLonNear(b.lon, a.lon) - a.lon);
  const U1 = Math.atan((1 - WGS84_F) * Math.tan(phi1));
  const U2 = Math.atan((1 - WGS84_F) * Math.tan(phi2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);
  let lambda = L;
  let lambdaPrev = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let sinAlpha = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt((cosU2 * sinLambda) ** 2 + (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2);
    if (sinSigma === 0) return { distanceM: 0, initialBearingDeg: 0, finalBearingDeg: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha ** 2;
    cos2SigmaM = cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
    lambdaPrev = lambda;
    lambda =
      L +
      (1 - C) *
        WGS84_F *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
    if (Math.abs(lambda - lambdaPrev) < 1e-12) break;
    if (iteration === 99) return null;
  }
  const uSq = (cosSqAlpha * (WGS84_A ** 2 - WGS84_B ** 2)) / (WGS84_B ** 2);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
  const distanceM = WGS84_B * A * (sigma - deltaSigma);
  const initialBearingDeg = normalizeBearingDeg(toDeg(Math.atan2(cosU2 * Math.sin(lambda), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lambda))));
  const finalBearingDeg = normalizeBearingDeg(toDeg(Math.atan2(cosU1 * Math.sin(lambda), -sinU1 * cosU2 + cosU1 * sinU2 * Math.cos(lambda))));
  return { distanceM, initialBearingDeg, finalBearingDeg };
}

function vincentyDirect(start, initialBearingDeg, distanceM) {
  const alpha1 = toRad(initialBearingDeg);
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);
  const phi1 = toRad(clamp(start.lat, -89.999999, 89.999999));
  const lambda1 = toRad(normalizeLon(start.lon));
  const tanU1 = (1 - WGS84_F) * Math.tan(phi1);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 ** 2);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha ** 2;
  const uSq = (cosSqAlpha * (WGS84_A ** 2 - WGS84_B ** 2)) / (WGS84_B ** 2);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  let sigma = distanceM / (WGS84_B * A);
  let sigmaPrev = 0;
  let cos2SigmaM = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
            (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
    sigmaPrev = sigma;
    sigma = distanceM / (WGS84_B * A) + deltaSigma;
    if (Math.abs(sigma - sigmaPrev) < 1e-12) break;
    if (iteration === 99) return null;
  }
  const tmp = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const phi2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1, (1 - WGS84_F) * Math.sqrt(sinAlpha ** 2 + tmp ** 2));
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) *
      WGS84_F *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  return { lon: normalizeLon(toDeg(lambda1 + L)), lat: clamp(toDeg(phi2), -85, 85) };
}

function interpolateGreatCircle(a, b, t, latitudeLimit = 85) {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(normalizeLonNear(b.lon, a.lon));
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  if (!d) return { lon: normalizeLon(a.lon), lat: clamp(a.lat, -latitudeLimit, latitudeLimit) };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);
  return { lon: normalizeLon(toDeg(Math.atan2(y, x))), lat: clamp(toDeg(Math.atan2(z, Math.hypot(x, y))), -latitudeLimit, latitudeLimit) };
}

function normalizeBearingDeg(value) {
  return ((value % 360) + 360) % 360;
}

function trajectorySegmentSampleSteps(p1, p2, control = null, p0 = null, p3 = null) {
  const direct = greatCircleDistanceKm(p1, p2);
  const controlLength = control ? greatCircleDistanceKm(p1, control) + greatCircleDistanceKm(control, p2) : direct;
  const neighborBend =
    p0 && p3
      ? Math.max(greatCircleDistanceKm(p0, p1), greatCircleDistanceKm(p2, p3)) * 0.18
      : 0;
  const estimatedCurveKm = Math.max(direct, controlLength + neighborBend);
  return Math.round(clamp(Math.ceil(estimatedCurveKm / TRAJECTORY_SAMPLE_TARGET_KM), TRAJECTORY_SAMPLE_MIN_STEPS, TRAJECTORY_SAMPLE_MAX_STEPS));
}

function quadraticPoint(p0, p1, p2, t) {
  const inv = 1 - t;
  return {
    lon: inv * inv * p0.lon + 2 * inv * t * p1.lon + t * t * p2.lon,
    lat: inv * inv * p0.lat + 2 * inv * t * p1.lat + t * t * p2.lat,
    t: inv * inv * p0.t + 2 * inv * t * p1.t + t * t * p2.t,
  };
}

function restrictionTargetPoint(item) {
  const center = item.center;
  if (Number.isFinite(center?.lon) && Number.isFinite(center?.lat)) {
    return { lon: normalizeLon(center.lon), lat: clamp(center.lat, -85, 85) };
  }
  if (!item.bounds) return null;
  return {
    lon: normalizeLon((item.bounds.minLon + item.bounds.maxLon) / 2),
    lat: clamp((item.bounds.minLat + item.bounds.maxLat) / 2, -85, 85),
  };
}

function unwrapControlLongitudes(points) {
  if (!points.length) return [];
  const unwrapped = [{ ...points[0], lon: normalizeLonNear(points[0].lon, state.view.lon) }];
  for (let index = 1; index < points.length; index += 1) {
    unwrapped.push({ ...points[index], lon: normalizeLonNear(points[index].lon, unwrapped[index - 1].lon) });
  }
  return unwrapped;
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    lon:
      0.5 *
      (2 * p1.lon +
        (-p0.lon + p2.lon) * t +
        (2 * p0.lon - 5 * p1.lon + 4 * p2.lon - p3.lon) * t2 +
        (-p0.lon + 3 * p1.lon - 3 * p2.lon + p3.lon) * t3),
    lat:
      0.5 *
      (2 * p1.lat +
        (-p0.lat + p2.lat) * t +
        (2 * p0.lat - 5 * p1.lat + 4 * p2.lat - p3.lat) * t2 +
        (-p0.lat + 3 * p1.lat - 3 * p2.lat + p3.lat) * t3),
    t: p1.t + (p2.t - p1.t) * t,
  };
}

function normalizeTrajectoryForDrawing(points) {
  if (!points?.length) return [];
  const unwrapped = [];
  let previousLon = normalizeLonNear(points[0].lon, state.view.lon);
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const lon = index === 0 ? previousLon : normalizeLonNear(point.lon, previousLon);
    previousLon = lon;
    unwrapped.push([lon, clamp(point.lat, -85, 85)]);
  }
  const avgLon = unwrapped.reduce((sum, [lon]) => sum + lon, 0) / unwrapped.length;
  const shift = Math.round((state.view.lon - avgLon) / 360) * 360;
  return unwrapped.map(([lon, lat]) => [lon + shift, lat]);
}

function trajectoryTrackLengthKm(track) {
  const selected = selectedTrajectoryItems(track);
  if (selected.length < 2) return 0;
  return trajectoryDisplayLengthKm(track, selected, normalizeTrajectoryForDrawing(buildTrajectorySamples(selected, track)));
}

function trajectoryTrackInclinationDeg(track) {
  const selected = selectedTrajectoryItems(track);
  if (selected.length < 2) return null;
  return trajectoryInclinationDeg(normalizeTrajectoryForDrawing(buildTrajectorySamples(selected, track)));
}

function trajectoryLengthKm(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += greatCircleDistanceKm(
      { lon: points[index - 1][0], lat: points[index - 1][1] },
      { lon: points[index][0], lat: points[index][1] },
    );
  }
  return total;
}

function trajectoryDisplayLengthKm(track, selected, normalizedPoints) {
  if (track?.geodesic && selected?.length >= 2) {
    const start = selected[0].target;
    const end = selected[selected.length - 1].target;
    const inverse = vincentyInverse(start, end);
    if (inverse?.distanceM) return inverse.distanceM / 1000;
  }
  return trajectoryLengthKm(normalizedPoints || []);
}

function trajectoryInclinationDeg(points) {
  if (!points || points.length < 2) return null;
  let hx = 0;
  let hy = 0;
  let hz = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = lonLatToUnitVector(points[index - 1][0], points[index - 1][1]);
    const b = lonLatToUnitVector(points[index][0], points[index][1]);
    const cx = a.y * b.z - a.z * b.y;
    const cy = a.z * b.x - a.x * b.z;
    const cz = a.x * b.y - a.y * b.x;
    const length = Math.hypot(cx, cy, cz);
    if (length < 1e-9) continue;
    hx += cx / length;
    hy += cy / length;
    hz += cz / length;
  }
  const normalLength = Math.hypot(hx, hy, hz);
  if (normalLength < 1e-9) return null;
  return toDeg(Math.acos(clamp(hz / normalLength, -1, 1)));
}

function lonLatToUnitVector(lon, lat) {
  const lonRad = toRad(normalizeLon(lon));
  const latRad = toRad(clamp(lat, -89.999, 89.999));
  const cosLat = Math.cos(latRad);
  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad),
  };
}

function formatTrajectoryInclinationLegacy(value) {
  if (!Number.isFinite(value)) return "倾角--";
  return `倾角≈${formatDegrees(value)}`;
}

function formatDegreesLegacy(value) {
  if (!Number.isFinite(value)) return "--°";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}°`;
}

function formatTrajectoryInclination(value) {
  if (!Number.isFinite(value)) return "倾角 --";
  return `倾角 ≈ ${formatDegrees(value)}`;
}

function formatDegrees(value) {
  if (!Number.isFinite(value)) return "--°";
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}°`;
}

function greatCircleDistanceKm(a, b) {
  const aLat = toRad(a.lat);
  const bLat = toRad(b.lat);
  const dLat = bLat - aLat;
  const dLon = toRad(normalizeLonNear(b.lon, a.lon) - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function flattenGeometryCoordinates(geometry) {
  if (!geometry?.coordinates) return [];
  if (geometry.type === "Point") return [geometry.coordinates];
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function boxGeometry(minLon, minLat, maxLon, maxLat) {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

function lonLatToWorld(lon, lat, zoom) {
  return lonLatToWorldRaw(normalizeLon(lon), lat, zoom);
}

function lonLatToWorldRaw(lon, lat, zoom) {
  const size = TILE_SIZE * 2 ** zoom;
  return {
    x: ((lon + 180) / 360) * size,
    y: mercatorYUnit(lat) * size,
  };
}

function mercatorYUnit(lat) {
  const clampedLat = clamp(Number(lat), -85.05112878, 85.05112878);
  const cached = mercatorYUnitCache.get(clampedLat);
  if (cached !== undefined) return cached;
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  const value = 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
  if (mercatorYUnitCache.size >= 50000) mercatorYUnitCache.clear();
  mercatorYUnitCache.set(clampedLat, value);
  return value;
}

function worldToLonLat(x, y, zoom) {
  const size = TILE_SIZE * 2 ** zoom;
  const wrappedX = ((x % size) + size) % size;
  const lon = (wrappedX / size) * 360 - 180;
  const merc = Math.PI * (1 - (2 * clamp(y, 0, size)) / size);
  const lat = (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
  return { lon: normalizeLon(lon), lat: clamp(lat, -85, 85) };
}

function setLoading(isLoading, text = "", status = "loading") {
  if (els.refreshButton) {
    els.refreshButton.disabled = false;
    els.refreshButton.setAttribute("aria-busy", String(Boolean(isLoading)));
  }
  if (els.notamSourceRefreshButton) {
    els.notamSourceRefreshButton.disabled = false;
    els.notamSourceRefreshButton.setAttribute("aria-busy", String(Boolean(isLoading)));
  }
  updateRefreshProgress(status, text || (isLoading ? "正在读取数据" : "数据就绪"));
}

function setMapStatus(text) {
  if (!els.mapStatus) return;
  const value = String(text || "");
  els.mapStatus.textContent = value;
  els.mapStatus.title = value;
}

function updateRefreshProgress(status = "idle", message = "数据就绪") {
  if (!els.refreshProgress) return;
  const allowed = new Set(["idle", "loading", "refreshing", "busy", "success", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.refreshProgress.className = `refresh-progress ${normalized}`;
  els.refreshProgress.innerHTML = `
    <span class="spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>版本：${escapeHtml(dataVersionLabel())}</em>
  `;
}

function updateHydropacProgress(status = "idle", message = "NGA MSI HYDROPAC 未获取", detail = "独立航海/水文警告源") {
  if (!els.hydropacProgress) return;
  const allowed = new Set(["idle", "loading", "busy", "success", "warn", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.hydropacProgress.className = `hydropac-progress ${normalized}`;
  els.hydropacProgress.innerHTML = `
    <span class="mini-spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function updateLaunchProgress(status = "idle", message = "火箭发射预告未获取", detail = "Launch Library 2") {
  if (!els.launchProgress) return;
  const allowed = new Set(["idle", "loading", "busy", "success", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.launchProgress.className = `launch-progress ${normalized}`;
  els.launchProgress.innerHTML = `
    <span class="mini-spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function updateMsaProgress(status = "idle", message = "中国航警未获取", detail = "中国海事局航行警告") {
  if (!els.msaProgress) return;
  const allowed = new Set(["idle", "loading", "busy", "success", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.msaProgress.className = `msa-progress ${normalized}`;
  els.msaProgress.innerHTML = `
    <span class="mini-spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function updateNavareaProgress(status = "idle", message = "NAVAREA 未获取", detail = "I / II / IV / VIII / XI / XII / XIII 航行警告") {
  if (!els.navareaProgress) return;
  const allowed = new Set(["idle", "loading", "busy", "success", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.navareaProgress.className = `navarea-progress ${normalized}`;
  els.navareaProgress.innerHTML = `
    <span class="mini-spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function updateCloudProgress(status = "idle", message = "卫星云图未获取", detail = "NOAA GMGSI 全球小时云图，透明度可调") {
  if (!els.cloudProgress) return;
  const allowed = new Set(["idle", "loading", "busy", "success", "error"]);
  const normalized = allowed.has(status) ? status : "idle";
  els.cloudProgress.className = `cloud-progress ${normalized}`;
  els.cloudProgress.innerHTML = `
    <span class="mini-spinner" aria-hidden="true"></span>
    <strong>${escapeHtml(message)}</strong>
    <em>${escapeHtml(detail)}</em>
  `;
}

function dataVersionLabel() {
  const notam = state.payload?.sources?.faaNotamSearch || {};
  const fetchedAt = notam.fetchedAt || state.payload?.faaNotamFetchedAt || notam.cacheSavedAt || state.payload?.cacheSavedAt || state.payload?.generatedAt;
  if (fetchedAt) return `FAA NOTAM ${formatDateTime(fetchedAt)}`;
  if (state.payload?.dataVersion) return state.payload.dataVersion;
  return "--";
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatAltitudeWithMeters(value) {
  const raw = String(value || "").trim();
  if (!raw) return "高度未解析";

  const normalized = raw.toUpperCase();
  const annotations = [];
  const seen = new Set();
  const add = (key, text) => {
    if (seen.has(key)) return;
    seen.add(key);
    annotations.push(text);
  };

  if (/(?:\b(?:UNL|UNLIMITED)\b|无限高)/i.test(raw)) add("UNL", "UNL=无限高");
  if (/\b(SFC|SURFACE|SLC)\b/i.test(raw)) add("SFC", "SFC/SLC=海拔0米");
  if (/\bGND\b/i.test(raw)) add("GND", "GND=地面高度");

  for (const match of normalized.matchAll(/\bFL\s*([0-9]{2,3})\b/g)) {
    const label = `FL${match[1]}`;
    add(label, `${label}≈海拔${Math.round(Number(match[1]) * 100 * 0.3048)}米`);
  }

  for (const match of normalized.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\s*FT(?:\s*(AGL|AMSL|MSL))?\b/g)) {
    const feet = Number(match[1]);
    if (!Number.isFinite(feet)) continue;
    const suffix = match[2] || "";
    const key = `${match[1]}FT${suffix}`;
    const meters = Math.round(feet * 0.3048);
    add(key, suffix === "AGL" ? `${match[1]}FT AGL≈离地${meters}米` : `${match[1]}FT≈海拔${meters}米`);
  }

  for (const match of normalized.matchAll(/\b([0-9]+(?:\.[0-9]+)?)\s*M(?:\s*(AGL|AMSL|MSL))?\b/g)) {
    const meters = Number(match[1]);
    if (!Number.isFinite(meters)) continue;
    const suffix = match[2] || "";
    const key = `${match[1]}M${suffix}`;
    add(key, suffix === "AGL" ? `${match[1]}M AGL=离地${Math.round(meters)}米` : `${match[1]}M=海拔${Math.round(meters)}米`);
  }

  return annotations.length ? `${raw}（${annotations.join("；")}）` : raw;
}

function formatBeijingRange(beginAt, endAt) {
  const begin = formatTimeZoneDate(beginAt, "Asia/Shanghai");
  const end = formatTimeZoneDate(endAt, "Asia/Shanghai");
  if (begin && end) return `${begin} 至 ${end}`;
  if (begin) return `自 ${begin}`;
  if (end) return `至 ${end}`;
  return "未解析";
}

function formatTimeZoneDate(value, timeZone) {
  if (!value || /^(PERM|EST)$/i.test(String(value))) return value || "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(window.AppI18n?.isEnglish ? "en-US" : "zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatGeometryVertices(geometry) {
  const rings = geometryVertexRings(geometry);
  if (!rings.length) return "无可显示顶点";
  return rings
    .map((ring, ringIndex) => {
      const clean = removeClosingVertex(ring);
      const vertices = clean.map(([lon, lat], index) => `${index + 1}. ${formatDmsPair(lat, lon)}`);
      return `区域 ${ringIndex + 1}: ${vertices.join(" | ")}`;
    })
    .join(" / ");
}

function geometryVertexRings(geometry) {
  if (geometry?.type === "Polygon") return geometry.coordinates || [];
  if (geometry?.type === "MultiPolygon") return (geometry.coordinates || []).flat();
  return [];
}

function removeClosingVertex(ring) {
  const clean = (Array.isArray(ring) ? ring : [])
    .map(([lon, lat]) => [Number(lon), Number(lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (clean.length > 1) {
    const first = clean[0];
    const last = clean[clean.length - 1];
    if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) clean.pop();
  }
  return clean;
}

function formatDmsPair(lat, lon) {
  return `${formatDms(lat, "lat")} ${formatDms(lon, "lon")}`;
}

function formatDms(value, axis) {
  const hemi = axis === "lat" ? (value < 0 ? "S" : "N") : value < 0 ? "W" : "E";
  const abs = Math.abs(value);
  const degrees = Math.floor(abs);
  const minutesFloat = (abs - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  const normalizedSeconds = seconds === 60 ? 0 : seconds;
  const normalizedMinutes = seconds === 60 ? minutes + 1 : minutes;
  const normalizedDegrees = normalizedMinutes === 60 ? degrees + 1 : degrees;
  const finalMinutes = normalizedMinutes === 60 ? 0 : normalizedMinutes;
  return `${hemi}${String(normalizedDegrees).padStart(axis === "lon" ? 3 : 2, "0")}°${String(finalMinutes).padStart(2, "0")}'${String(
    normalizedSeconds,
  ).padStart(2, "0")}"`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(window.AppI18n?.isEnglish ? "en-US" : "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeLon(value) {
  return ((value + 540) % 360) - 180;
}

function normalizeLonNear(value, reference) {
  let lon = normalizeLon(value);
  while (lon - reference > 180) lon -= 360;
  while (lon - reference < -180) lon += 360;
  return lon;
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function toDeg(value) {
  return (value * 180) / Math.PI;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
