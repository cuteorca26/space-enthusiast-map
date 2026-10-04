(function initPerformanceProfile(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.NotamPerformanceProfile = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createPerformanceProfileApi() {
  "use strict";

  const TIER_ORDER = ["economy", "balanced", "performance", "ultra"];
  const TIER_LABELS = {
    economy: "节能",
    balanced: "均衡",
    performance: "高性能",
    ultra: "超高性能",
  };
  const VENDOR_LABELS = {
    nvidia: "NVIDIA",
    amd: "AMD",
    intel: "Intel",
    apple: "Apple",
    qualcomm: "Qualcomm",
    arm: "ARM",
    software: "软件渲染",
    unknown: "通用 GPU",
  };

  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function classifyGpuVendor(...parts) {
    const text = parts.filter(Boolean).join(" ").toLowerCase();
    if (/swiftshader|llvmpipe|software raster|microsoft basic render|mesa offscreen/.test(text)) return "software";
    if (/nvidia|geforce|quadro|tesla|rtx|gtx/.test(text)) return "nvidia";
    if (/amd|advanced micro devices|radeon|firepro/.test(text)) return "amd";
    if (/intel|iris|uhd graphics|hd graphics|arc\(tm\)/.test(text)) return "intel";
    if (/apple|metal/.test(text)) return "apple";
    if (/qualcomm|adreno/.test(text)) return "qualcomm";
    if (/arm|mali/.test(text)) return "arm";
    return "unknown";
  }

  function gpuCapabilityScore(gpu) {
    const renderer = String(gpu.renderer || "").toLowerCase();
    const vendor = gpu.vendor || classifyGpuVendor(gpu.unmaskedVendor, renderer);
    let score = 0;
    if (gpu.webgl2) score += 1;
    if (finite(gpu.maxTextureSize) >= 16384) score += 2;
    else if (finite(gpu.maxTextureSize) >= 8192) score += 1;
    else if (finite(gpu.maxTextureSize) > 0 && finite(gpu.maxTextureSize) <= 4096) score -= 2;
    if (finite(gpu.maxRenderbufferSize) >= 16384) score += 1;
    if (finite(gpu.maxSamples) >= 4) score += 1;
    if (gpu.fragmentHighp) score += 0.5;
    if (vendor === "software" || gpu.fallbackAdapter) score -= 7;
    if (vendor === "nvidia") score += 1;
    if (vendor === "amd" && /\brx\b|radeon pro|firepro/.test(renderer)) score += 1;
    if (vendor === "intel") {
      if (/\barc\b|arc\(tm\)/.test(renderer)) score += 2;
      else if (/iris\s*xe/.test(renderer)) score += 0.75;
      else if (/uhd|hd graphics [2-6]/.test(renderer)) score -= 0.75;
    }
    if (vendor === "apple") score += 1;
    return score;
  }

  function selectTier(input) {
    const threads = Math.max(1, Math.round(finite(input.cpu?.threads, 4)));
    const memoryGB = Math.max(0, finite(input.cpu?.memoryGB));
    let score = gpuCapabilityScore(input.gpu || {});
    if (threads >= 16) score += 2.5;
    else if (threads >= 8) score += 1.5;
    else if (threads >= 4) score += 0.5;
    else score -= 2;
    if (memoryGB >= 16) score += 1.5;
    else if (memoryGB >= 8) score += 0.75;
    else if (memoryGB > 0 && memoryGB <= 4) score -= 1.5;
    if (score >= 7) return "ultra";
    if (score >= 4) return "performance";
    if (score >= 1) return "balanced";
    return "economy";
  }

  function buildBudgets(tier, vendor, renderer, cpu) {
    const templates = {
      economy: {
        dprMax: 1.1, interactionDpr: 0.82, bulkDpr: 1,
        tileCacheMax: 620, cloudTileCacheMax: 300, globeTextureCacheMax: 620,
        textureUploadsPerFrame: 8, visibleTileBudget: 380,
        tileLoadConcurrency: 8, tileLoadQueueLimit: 480,
        coverageSegments: 18, satelliteHitLimit: 420,
        interactionFrameIntervalMs: 16, antialias: false, minimumQualityScale: 0.76,
      },
      balanced: {
        dprMax: 1.5, interactionDpr: 1, bulkDpr: 1.15,
        tileCacheMax: 920, cloudTileCacheMax: 430, globeTextureCacheMax: 880,
        textureUploadsPerFrame: 12, visibleTileBudget: 540,
        tileLoadConcurrency: 12, tileLoadQueueLimit: 720,
        coverageSegments: 24, satelliteHitLimit: 600,
        interactionFrameIntervalMs: 8, antialias: true, minimumQualityScale: 0.7,
      },
      performance: {
        dprMax: 1.8, interactionDpr: 1.2, bulkDpr: 1.32,
        tileCacheMax: 1350, cloudTileCacheMax: 580, globeTextureCacheMax: 1250,
        textureUploadsPerFrame: 18, visibleTileBudget: 700,
        tileLoadConcurrency: 18, tileLoadQueueLimit: 980,
        coverageSegments: 28, satelliteHitLimit: 760,
        interactionFrameIntervalMs: 0, antialias: true, minimumQualityScale: 0.65,
      },
      ultra: {
        dprMax: 2, interactionDpr: 1.5, bulkDpr: 1.48,
        tileCacheMax: 1750, cloudTileCacheMax: 760, globeTextureCacheMax: 1650,
        textureUploadsPerFrame: 24, visibleTileBudget: 880,
        tileLoadConcurrency: 24, tileLoadQueueLimit: 1320,
        coverageSegments: 32, satelliteHitLimit: 960,
        interactionFrameIntervalMs: 0, antialias: true, minimumQualityScale: 0.62,
      },
    };
    const budgets = { ...templates[tier] };
    const rendererText = String(renderer || "").toLowerCase();
    if (vendor === "intel") {
      const discreteArc = /\barc\b|arc\(tm\)/.test(rendererText);
      budgets.textureUploadsPerFrame = Math.min(budgets.textureUploadsPerFrame, discreteArc ? 22 : 16);
      budgets.coverageSegments = Math.min(budgets.coverageSegments, discreteArc ? 30 : 26);
      budgets.bulkDpr = Math.min(budgets.bulkDpr, discreteArc ? 1.4 : 1.24);
      if (tier === "economy") budgets.antialias = false;
    } else if (vendor === "amd") {
      budgets.coverageSegments = Math.min(32, budgets.coverageSegments + (tier === "ultra" ? 0 : 2));
      budgets.textureUploadsPerFrame = Math.min(24, budgets.textureUploadsPerFrame + 1);
    } else if (vendor === "nvidia") {
      budgets.coverageSegments = Math.min(34, budgets.coverageSegments + 2);
      budgets.textureUploadsPerFrame = Math.min(28, budgets.textureUploadsPerFrame + 2);
      budgets.bulkDpr = Math.min(1.55, budgets.bulkDpr + 0.05);
    } else if (vendor === "software") {
      budgets.dprMax = 1;
      budgets.interactionDpr = 0.75;
      budgets.bulkDpr = 0.9;
      budgets.coverageSegments = 14;
      budgets.textureUploadsPerFrame = 5;
      budgets.antialias = false;
    }
    const threads = Math.max(1, Math.round(finite(cpu?.threads, 4)));
    // Chromium reserves worker slots for rendering and service tasks. Twelve orbit
    // workers saturate high-core CPUs without crossing the browser's common limit.
    const workerCap = { economy: 4, balanced: 8, performance: 12, ultra: 12 }[tier];
    budgets.satelliteWorkers = Math.max(1, Math.min(workerCap, Math.max(1, threads - 1)));
    return budgets;
  }

  function buildProfile(input = {}) {
    const cpu = {
      threads: Math.max(1, Math.round(finite(input.cpu?.threads, 4))),
      memoryGB: Math.max(0, finite(input.cpu?.memoryGB)),
      model: String(input.cpu?.model || "").trim(),
      availableParallelism: Math.max(0, Math.round(finite(input.cpu?.availableParallelism))),
      logicalCores: Math.max(0, Math.round(finite(input.cpu?.logicalCores))),
    };
    const systemAdapters = Array.isArray(input.gpu?.systemAdapters) ? input.gpu.systemAdapters : [];
    const adapterNames = systemAdapters.map((item) => typeof item === "string" ? item : item?.name).filter(Boolean);
    const renderer = String(input.gpu?.renderer || input.gpu?.description || adapterNames[0] || "GPU information unavailable").trim();
    const unmaskedVendor = String(input.gpu?.unmaskedVendor || input.gpu?.vendorName || "").trim();
    const vendor = classifyGpuVendor(input.gpu?.vendor, unmaskedVendor, renderer, adapterNames.join(" "));
    const gpu = {
      ...input.gpu,
      renderer,
      unmaskedVendor,
      vendor,
      vendorLabel: VENDOR_LABELS[vendor],
      systemAdapters,
      maxTextureSize: finite(input.gpu?.maxTextureSize),
      maxRenderbufferSize: finite(input.gpu?.maxRenderbufferSize),
      maxSamples: finite(input.gpu?.maxSamples),
      webgl2: Boolean(input.gpu?.webgl2),
      fragmentHighp: Boolean(input.gpu?.fragmentHighp),
      fallbackAdapter: Boolean(input.gpu?.fallbackAdapter),
    };
    const tier = selectTier({ cpu, gpu });
    const targetFrameMs = { economy: 34, balanced: 29, performance: 25, ultra: 21 }[tier];
    return {
      version: 1,
      tier,
      tierRank: TIER_ORDER.indexOf(tier),
      tierLabel: TIER_LABELS[tier],
      targetFrameMs,
      cpu,
      gpu,
      budgets: buildBudgets(tier, vendor, renderer, cpu),
    };
  }

  function readWebGlCapabilities(environment = typeof globalThis !== "undefined" ? globalThis : {}) {
    const documentRef = environment.document;
    if (!documentRef?.createElement) return {};
    const canvas = documentRef.createElement("canvas");
    const options = { alpha: false, antialias: false, powerPreference: "high-performance", failIfMajorPerformanceCaveat: false };
    let gl = null;
    let webgl2 = false;
    try {
      gl = canvas.getContext("webgl2", options);
      webgl2 = Boolean(gl);
      if (!gl) gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
      if (!gl) return {};
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const anisotropy = gl.getExtension("EXT_texture_filter_anisotropic")
        || gl.getExtension("WEBKIT_EXT_texture_filter_anisotropic")
        || gl.getExtension("MOZ_EXT_texture_filter_anisotropic");
      const highp = gl.getShaderPrecisionFormat?.(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      const result = {
        webgl2,
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        unmaskedVendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxSamples: webgl2 ? gl.getParameter(gl.MAX_SAMPLES) : 0,
        maxVertexTextureUnits: gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS),
        maxAnisotropy: anisotropy ? gl.getParameter(anisotropy.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1,
        fragmentHighp: Boolean(highp && highp.precision > 0),
        timerQuery: Boolean(gl.getExtension(webgl2 ? "EXT_disjoint_timer_query_webgl2" : "EXT_disjoint_timer_query")),
        floatColorBuffer: Boolean(gl.getExtension("EXT_color_buffer_float") || gl.getExtension("WEBGL_color_buffer_float")),
      };
      result.vendor = classifyGpuVendor(result.unmaskedVendor, result.renderer);
      return result;
    } catch {
      return {};
    } finally {
      try {
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // Capability probing must never block startup.
      }
    }
  }

  function detectSync(environment = typeof globalThis !== "undefined" ? globalThis : {}) {
    return buildProfile({
      cpu: {
        threads: finite(environment.navigator?.hardwareConcurrency, 4),
        memoryGB: finite(environment.navigator?.deviceMemory),
      },
      gpu: readWebGlCapabilities(environment),
    });
  }

  async function readWebGpuInfo(environment = typeof globalThis !== "undefined" ? globalThis : {}) {
    try {
      const adapter = await environment.navigator?.gpu?.requestAdapter?.({ powerPreference: "high-performance" });
      if (!adapter) return null;
      const info = adapter.info || {};
      return {
        vendorName: String(info.vendor || ""),
        architecture: String(info.architecture || ""),
        device: String(info.device || ""),
        description: String(info.description || ""),
        fallbackAdapter: Boolean(info.isFallbackAdapter),
        maxTextureDimension2D: finite(adapter.limits?.maxTextureDimension2D),
      };
    } catch {
      return null;
    }
  }

  function enrichProfile(profile, system = null, webGpu = null) {
    const systemAdapters = Array.isArray(system?.gpuAdapters) ? system.gpuAdapters : profile.gpu.systemAdapters;
    const webGpuRenderer = String(webGpu?.description || "").trim();
    const currentRenderer = String(profile.gpu.renderer || "");
    const rendererIsGeneric = /angle|webgl|gpu information unavailable/i.test(currentRenderer) && !/nvidia|amd|radeon|intel|arc|iris|geforce|rtx|gtx/i.test(currentRenderer);
    return buildProfile({
      cpu: {
        threads: Math.min(
          profile.cpu.threads,
          Math.max(1, finite(system?.cpu?.availableParallelism, system?.cpu?.logicalCores || profile.cpu.threads)),
        ),
        memoryGB: finite(system?.memoryGB, profile.cpu.memoryGB),
        model: system?.cpu?.model || profile.cpu.model,
        availableParallelism: finite(system?.cpu?.availableParallelism, profile.cpu.availableParallelism),
        logicalCores: finite(system?.cpu?.logicalCores, profile.cpu.logicalCores),
      },
      gpu: {
        ...profile.gpu,
        renderer: rendererIsGeneric && webGpuRenderer ? webGpuRenderer : currentRenderer,
        vendorName: webGpu?.vendorName || profile.gpu.vendorName,
        description: webGpuRenderer || profile.gpu.description,
        architecture: webGpu?.architecture || profile.gpu.architecture,
        device: webGpu?.device || profile.gpu.device,
        fallbackAdapter: Boolean(webGpu?.fallbackAdapter || profile.gpu.fallbackAdapter),
        systemAdapters,
      },
    });
  }

  function createAdaptiveState(profile) {
    return {
      qualityScale: 1,
      minimumQualityScale: finite(profile?.budgets?.minimumQualityScale, 0.68),
      targetFrameMs: finite(profile?.targetFrameMs, 29),
      emaMs: 0,
      slowScore: 0,
      fastScore: 0,
      lastAdjustmentMs: 0,
      adjustmentCount: 0,
      lastSource: "",
      changed: false,
    };
  }

  function adaptQuality(current, sampleMs, nowMs, source = "render") {
    const sample = clamp(finite(sampleMs), 1, 250);
    const now = Math.max(0, finite(nowMs));
    const next = { ...current, changed: false, lastSource: source };
    next.emaMs = next.emaMs ? next.emaMs * 0.9 + sample * 0.1 : sample;
    const ratio = next.emaMs / Math.max(1, next.targetFrameMs);
    next.slowScore = Math.max(0, next.slowScore * 0.88 + Math.max(0, ratio - 1.04) * 2.2);
    next.fastScore = Math.max(0, next.fastScore * 0.96 + (ratio < 0.68 ? 1 : -2));
    if (now - next.lastAdjustmentMs < 4000) return next;
    if (next.slowScore >= 9 && next.qualityScale > next.minimumQualityScale + 0.001) {
      next.qualityScale = Math.max(next.minimumQualityScale, Math.round((next.qualityScale - 0.1) * 100) / 100);
      next.slowScore = 0;
      next.fastScore = 0;
      next.lastAdjustmentMs = now;
      next.adjustmentCount += 1;
      next.changed = true;
    } else if (next.fastScore >= 18 && next.qualityScale < 0.999) {
      next.qualityScale = Math.min(1, Math.round((next.qualityScale + 0.05) * 100) / 100);
      next.slowScore = 0;
      next.fastScore = 0;
      next.lastAdjustmentMs = now;
      next.adjustmentCount += 1;
      next.changed = true;
    }
    return next;
  }

  return {
    TIER_LABELS,
    VENDOR_LABELS,
    adaptQuality,
    buildProfile,
    classifyGpuVendor,
    createAdaptiveState,
    detectSync,
    enrichProfile,
    readWebGlCapabilities,
    readWebGpuInfo,
    selectTier,
  };
});
