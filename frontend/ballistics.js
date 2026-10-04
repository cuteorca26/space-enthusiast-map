(function initBallistics(root, factory) {
  const api = factory();
  if (root) root.NotamBallistics = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBallisticsApi() {
  "use strict";

  const WGS84_A = 6378137;
  const WGS84_F = 1 / 298.257223563;
  const WGS84_B = WGS84_A * (1 - WGS84_F);
  const WGS84_E2 = WGS84_F * (2 - WGS84_F);
  const EARTH_MEAN_RADIUS_M = 6371008.8;
  const EARTH_MU = 3.986004418e14;
  const EARTH_J2 = 1.08262668e-3;
  const EARTH_J3 = -2.53215306e-6;
  const EARTH_J4 = -1.61098761e-6;
  const EARTH_ROTATION_RAD_S = 7.292115e-5;
  const EARTH_GEOPOTENTIAL_RADIUS_M = 6356766;
  const GAS_CONSTANT_AIR = 287.05287;
  const AIR_HEAT_CAPACITY_RATIO = 1.4;
  const STANDARD_GRAVITY = 9.80665;
  const SUTTON_GRAVES_EARTH_K = 1.83e-4;
  const SUTHERLAND_BETA_KG_M_S_SQRT_K = 1.458e-6;
  const SUTHERLAND_TEMPERATURE_K = 110.4;
  const RADIATIVE_HEATING_ADVISORY_SPEED_MPS = 10000;
  const ATMOSPHERE_INTERFACE_ALTITUDE_M = 120000;

  const ATMOSPHERE_LAYERS = [
    { h: 0, lapse: -0.0065 },
    { h: 11000, lapse: 0 },
    { h: 20000, lapse: 0.001 },
    { h: 32000, lapse: 0.0028 },
    { h: 47000, lapse: 0 },
    { h: 51000, lapse: -0.0028 },
    { h: 71000, lapse: -0.002 },
    { h: 84852, lapse: 0 },
  ];

  const HIGH_ALTITUDE_DENSITY = [
    [86000, 6.958e-6],
    [90000, 3.396e-6],
    [100000, 5.297e-7],
    [110000, 9.661e-8],
    [120000, 2.438e-8],
    [130000, 8.484e-9],
    [140000, 3.845e-9],
    [150000, 2.07e-9],
    [180000, 5.464e-10],
    [200000, 2.789e-10],
    [250000, 7.248e-11],
    [300000, 2.418e-11],
    [400000, 3.725e-12],
    [500000, 9.518e-13],
    [600000, 3.725e-13],
    [800000, 1.17e-14],
    [1000000, 3.019e-15],
  ];

  const HIGH_ALTITUDE_TEMPERATURE = [
    [86000, 186.946],
    [90000, 186.867],
    [100000, 195.081],
    [110000, 240],
    [120000, 360],
    [130000, 469.27],
    [140000, 559.63],
    [150000, 634.39],
    [160000, 696.29],
    [170000, 747.57],
    [180000, 790.07],
    [190000, 825.31],
    [200000, 854.56],
    [250000, 941.33],
    [300000, 976.01],
    [400000, 995.83],
    [500000, 999.24],
    [600000, 999.85],
    [800000, 999.99],
    [1000000, 1000],
  ];

  initializeAtmosphereLayers();

  function initializeAtmosphereLayers() {
    ATMOSPHERE_LAYERS[0].temperature = 288.15;
    ATMOSPHERE_LAYERS[0].pressure = 101325;
    for (let index = 1; index < ATMOSPHERE_LAYERS.length; index += 1) {
      const previous = ATMOSPHERE_LAYERS[index - 1];
      const current = ATMOSPHERE_LAYERS[index];
      const deltaHeight = current.h - previous.h;
      current.temperature = previous.temperature + previous.lapse * deltaHeight;
      current.pressure = previous.lapse === 0
        ? previous.pressure * Math.exp((-STANDARD_GRAVITY * deltaHeight) / (GAS_CONSTANT_AIR * previous.temperature))
        : previous.pressure * (previous.temperature / current.temperature) ** (STANDARD_GRAVITY / (GAS_CONSTANT_AIR * previous.lapse));
    }
  }

  function propagateStage(options = {}) {
    const settings = normalizeOptions(options);
    if (!settings.valid) return invalidResult(settings.error);

    const positionEcef = geodeticToEcef(settings.startLatDeg, settings.startLonDeg, settings.startAltitudeM);
    const velocityGroundEcef = localVelocityEcef(
      settings.startLatDeg,
      settings.startLonDeg,
      settings.headingDeg,
      settings.flightPathAngleDeg,
      settings.initialSpeedMps,
    );
    const rotationVelocity = cross({ x: 0, y: 0, z: EARTH_ROTATION_RAD_S }, positionEcef);
    let state = {
      r: positionEcef,
      v: add(velocityGroundEcef, rotationVelocity),
    };
    const initialOrbit = orbitalElementsFromState(state);
    let referenceOrbit = isClearOrbitalState(initialOrbit) ? orbitAtEpoch(initialOrbit, 0) : null;
    const orbitEnvelope = createOrbitEnvelope(initialOrbit);

    let elapsedSec = 0;
    let previousGeo = eciStateToGeodetic(state, elapsedSec);
    let previousState = cloneState(state);
    let groundRangeM = 0;
    let apogee = { altitudeM: previousGeo.altitudeM, elapsedSec: 0, ...previousGeo };
    let minimumAltitudeM = previousGeo.altitudeM;
    let nextOutputSec = 0;
    const samples = [];
    const diagnosticSamples = [];
    const initialSample = createBallisticSample(state, elapsedSec, previousGeo, settings);
    samples.push({ ...initialSample });
    diagnosticSamples.push(initialSample);
    nextOutputSec += settings.outputStepSec;

    let status = "timeout";
    let message = "达到最大传播时间，物体尚未撞击 WGS-84 椭球面";
    let integrationSteps = 0;
    let rejectedIntegrationSteps = 0;
    let toleranceLimitedSteps = 0;
    let maximumAcceptedPositionErrorM = 0;
    let maximumAcceptedVelocityErrorMps = 0;
    let impactRefinementIterations = 0;

    while (elapsedSec < settings.maxTimeSec && integrationSteps < settings.maxIntegrationSteps) {
      const requestedDt = Math.min(selectTimeStep(previousGeo.altitudeM, state, settings), settings.maxTimeSec - elapsedSec);
      if (!(requestedDt > 0)) break;
      previousState = cloneState(state);
      const previousElapsedSec = elapsedSec;
      const previousAltitudeM = previousGeo.altitudeM;
      const adaptiveStep = adaptiveRk4Step(state, elapsedSec, requestedDt, settings);
      const dt = adaptiveStep.dt;
      state = adaptiveStep.state;
      elapsedSec += dt;
      integrationSteps += 1;
      rejectedIntegrationSteps += adaptiveStep.rejectedSteps;
      if (adaptiveStep.toleranceLimited) toleranceLimitedSteps += 1;
      maximumAcceptedPositionErrorM = Math.max(maximumAcceptedPositionErrorM, adaptiveStep.positionErrorM);
      maximumAcceptedVelocityErrorMps = Math.max(maximumAcceptedVelocityErrorMps, adaptiveStep.velocityErrorMps);

      if (!isFiniteState(state)) return invalidResult("数值积分发散；请检查初速度、倾角和弹道系数");
      const currentGeo = eciStateToGeodetic(state, elapsedSec);
      const currentOrbit = orbitalElementsFromState(state);
      updateOrbitEnvelope(orbitEnvelope, currentOrbit);
      if (!referenceOrbit && isClearOrbitalState(currentOrbit)) referenceOrbit = orbitAtEpoch(currentOrbit, elapsedSec);
      minimumAltitudeM = Math.min(minimumAltitudeM, currentGeo.altitudeM);
      if (currentGeo.altitudeM > apogee.altitudeM) {
        apogee = { altitudeM: currentGeo.altitudeM, elapsedSec, ...currentGeo };
      }

      const crossedSurface = previousElapsedSec >= 0 && previousAltitudeM >= -0.01 && currentGeo.altitudeM < 0;
      if (crossedSurface) {
        const refinedImpact = refineSurfaceImpact(previousState, previousElapsedSec, dt, state, settings);
        elapsedSec = refinedImpact.elapsedSec;
        state = refinedImpact.state;
        impactRefinementIterations = refinedImpact.iterations;
        const impactGeo = eciStateToGeodetic(state, elapsedSec);
        impactGeo.altitudeM = 0;
        groundRangeM += ellipsoidDistanceM(previousGeo, impactGeo);
        const impactSample = createBallisticSample(state, elapsedSec, impactGeo, settings);
        diagnosticSamples.push(impactSample);
        pushSampleCopy(samples, impactSample);
        status = "impact";
        message = "已撞击 WGS-84 椭球面（海拔 0 米，不含地形）";
        previousGeo = impactGeo;
        break;
      }

      groundRangeM += ellipsoidDistanceM(previousGeo, currentGeo);
      const acceptedSample = createBallisticSample(state, elapsedSec, currentGeo, settings);
      diagnosticSamples.push(acceptedSample);

      if (elapsedSec + 1e-8 >= nextOutputSec) {
        pushSampleCopy(samples, acceptedSample);
        while (nextOutputSec <= elapsedSec + 1e-8) nextOutputSec += settings.outputStepSec;
      }

      const radius = magnitude(state.r);
      if (radius > settings.escapeRadiusM) {
        pushSampleCopy(samples, acceptedSample);
        status = "escaped";
        message = "传播对象已超出本地地球弹道模型的距离上限";
        previousGeo = currentGeo;
        break;
      }
      previousGeo = currentGeo;
    }

    if (integrationSteps >= settings.maxIntegrationSteps) {
      status = "step-limit";
      message = "达到积分步数上限；请缩短传播时间或调整输入参数";
    }
    if (samples[samples.length - 1]?.elapsedSec < elapsedSec - 1e-7) {
      const finalDiagnostic = diagnosticSamples[diagnosticSamples.length - 1];
      const finalSample = finalDiagnostic?.elapsedSec === elapsedSec
        ? finalDiagnostic
        : createBallisticSample(state, elapsedSec, previousGeo, settings);
      if (finalSample !== finalDiagnostic) diagnosticSamples.push(finalSample);
      pushSampleCopy(samples, finalSample);
    }

    const reentry = enrichReentrySamples(diagnosticSamples, settings);
    mergeCriticalDiagnosticSamples(samples, diagnosticSamples, reentry);
    applyReentryAnalysis(samples, diagnosticSamples, reentry);
    const finalOrbit = orbitalElementsFromState(state);
    if (!referenceOrbit && isClearOrbitalState(finalOrbit)) referenceOrbit = orbitAtEpoch(finalOrbit, elapsedSec);
    const orbitAnalysis = buildOrbitAnalysis(initialOrbit, finalOrbit, referenceOrbit, orbitEnvelope, reentry, elapsedSec);
    if (status === "timeout" && orbitAnalysis?.reference?.bound) {
      status = "orbit";
      message = orbitAnalysis.regime === "atmospheric-grazing"
        ? `传播时限内完成 ${orbitAnalysis.atmosphericPassCount} 次大气掠入并保持束缚轨道`
        : "传播时限内未触碰 WGS-84 椭球面，当前为束缚地球轨道";
    }
    const impact = status === "impact" ? samples[samples.length - 1] : null;
    const sampledGroundTrackDistanceM = polylineGroundDistance(samples);
    const endpointGeodesicDistanceM = samples.length >= 2
      ? ellipsoidDistanceM(samples[0], samples[samples.length - 1])
      : 0;
    return {
      valid: true,
      status,
      message,
      samples,
      impact,
      apogee,
      flightTimeSec: elapsedSec,
      groundRangeM,
      groundTrackDistanceM: groundRangeM,
      sampledGroundTrackDistanceM,
      endpointGeodesicDistanceM,
      integrationSteps,
      rejectedIntegrationSteps,
      integrationDiagnostics: {
        maximumAcceptedPositionErrorM,
        maximumAcceptedVelocityErrorMps,
        toleranceLimitedSteps,
        impactRefinementIterations,
      },
      minimumAltitudeM,
      orbit: status === "orbit" ? orbitAnalysis : null,
      orbitAnalysis,
      reentry,
      initialState: {
        latDeg: settings.startLatDeg,
        lonDeg: normalizeLon(settings.startLonDeg),
        altitudeM: settings.startAltitudeM,
        headingDeg: normalizeBearing(settings.headingDeg),
        flightPathAngleDeg: settings.flightPathAngleDeg,
        groundRelativeSpeedMps: settings.initialSpeedMps,
        inertialSpeedMps: magnitude(stateAtStart(positionEcef, velocityGroundEcef).v),
        earthRotationSpeedMps: magnitude(rotationVelocity),
      },
      model: {
        referenceEllipsoid: "WGS-84",
        gravity: "WGS-84 point mass with J2/J3/J4 zonal harmonics",
        atmosphere: settings.dragEnabled ? settings.atmosphereModelLabel : "disabled",
        standardAtmosphereAltitude: "WGS-84 geometric altitude converted to 1976 geopotential altitude below 86 km",
        earthRotation: true,
        propagationFrame: "Earth-centered inertial (ECI)",
        outputFrame: "WGS-84 Earth-fixed geodetic",
        rotatingFrameEffects: "Coriolis and centrifugal effects are implicit in the ECI/ECEF transformation",
        dragReferenceVelocity: "relative to a co-rotating atmosphere without winds",
        dragLaw: "D/m = q/beta using the user-supplied effective constant ballistic coefficient",
        liftLaw: settings.liftToDragRatio > 0
          ? "constant effective L/D with bank angle rotating lift about the air-relative velocity vector"
          : "disabled (L/D = 0)",
        flowDiagnostics: "Sutherland viscosity, Reynolds number, mean free path, and Knudsen number use twice the nose radius as a diagnostic reference length",
        aerothermalSampling: "peak heating, dynamic pressure, drag load, and integrated heat use every accepted adaptive integration step",
        convectiveHeating: "Sutton-Graves Earth-air cold-wall stagnation-point engineering correlation",
        radiativeHeating: "not applied; trajectories reaching 10 km/s or more are explicitly flagged",
        groundRange: "integration-step accumulated WGS-84 ellipsoid geodesic distance along the propagated subpoint track",
        endpointGeodesicDistance: "shortest WGS-84 inverse geodesic from separation to impact or propagated endpoint",
        groundTrackDistance: "backward-compatible alias of groundRange",
        integrator: "adaptive fourth-order Runge-Kutta step-doubling with local position/velocity error control",
        impactDetection: "high-order propagation and bisection within the final accepted step against the WGS-84 ellipsoid",
        atmosphericPassDetection: "every descending and ascending 120 km interface crossing is precomputed from accepted integration steps",
        orbitElements: "reference and final osculating two-body elements are reported separately under the J2/J3/J4 plus drag propagation",
        lift: settings.liftToDragRatio > 0,
        winds: false,
        terrain: false,
      },
    };
  }

  function maximizeGroundRange(options = {}, searchOptions = {}) {
    const requestedMinimum = Number(searchOptions.minimumAngleDeg);
    const requestedMaximum = Number(searchOptions.maximumAngleDeg);
    const minimumAngleDeg = clamp(Number.isFinite(requestedMinimum) ? requestedMinimum : -89, -89, 89);
    const maximumAngleDeg = clamp(Number.isFinite(requestedMaximum) ? requestedMaximum : 89, minimumAngleDeg, 89);
    const coarseStepDeg = clamp(Number(searchOptions.coarseStepDeg) || 5, 1, 30);
    const angleToleranceDeg = clamp(Number(searchOptions.angleToleranceDeg) || 0.025, 0.005, 1);
    const maxEvaluations = Math.round(clamp(Number(searchOptions.maxEvaluations) || 64, 16, 160));
    const currentAngleDeg = clamp(Number(options.flightPathAngleDeg) || 0, minimumAngleDeg, maximumAngleDeg);
    const evaluated = new Map();
    let evaluations = 0;
    let best = null;

    const evaluate = (rawAngleDeg) => {
      const angleDeg = clamp(Number(rawAngleDeg), minimumAngleDeg, maximumAngleDeg);
      const key = angleDeg.toFixed(7);
      if (evaluated.has(key)) return evaluated.get(key);
      if (evaluations >= maxEvaluations) return null;
      evaluations += 1;
      const result = propagateStage({ ...options, flightPathAngleDeg: angleDeg });
      const candidate = {
        angleDeg,
        result,
        eligible: Boolean(result?.valid && result.status === "impact" && result.impact && Number.isFinite(result.groundRangeM)),
        groundRangeM: Number.isFinite(result?.groundRangeM) ? result.groundRangeM : 0,
      };
      evaluated.set(key, candidate);
      if (candidate.eligible && (!best || candidate.groundRangeM > best.groundRangeM)) best = candidate;
      return candidate;
    };

    evaluate(minimumAngleDeg);
    for (let angleDeg = Math.ceil(minimumAngleDeg / coarseStepDeg) * coarseStepDeg; angleDeg <= maximumAngleDeg; angleDeg += coarseStepDeg) {
      evaluate(angleDeg);
    }
    evaluate(maximumAngleDeg);
    evaluate(currentAngleDeg);

    let refinementStepDeg = coarseStepDeg;
    let iterations = 0;
    while (best && evaluations < maxEvaluations && refinementStepDeg > angleToleranceDeg) {
      iterations += 1;
      const offset = refinementStepDeg / 2;
      evaluate(best.angleDeg - offset);
      evaluate(best.angleDeg + offset);
      refinementStepDeg *= 0.5;
    }

    if (!best) {
      return {
        valid: false,
        message: "在当前速度、高度、航向、传播时限和路径角范围内没有找到可落地轨迹",
        evaluations,
        iterations,
        minimumAngleDeg,
        maximumAngleDeg,
        result: null,
      };
    }

    return {
      valid: true,
      message: "已找到当前模型下的最大地面射程路径角",
      flightPathAngleDeg: best.angleDeg,
      groundRangeM: best.groundRangeM,
      impact: best.result.impact,
      apogee: best.result.apogee,
      flightTimeSec: best.result.flightTimeSec,
      evaluations,
      iterations,
      minimumAngleDeg,
      maximumAngleDeg,
      angleResolutionDeg: refinementStepDeg,
      result: best.result,
    };
  }

  function stateAtStart(positionEcef, velocityGroundEcef) {
    return {
      r: positionEcef,
      v: add(velocityGroundEcef, cross({ x: 0, y: 0, z: EARTH_ROTATION_RAD_S }, positionEcef)),
    };
  }

  function normalizeOptions(options) {
    const startLatDeg = Number(options.startLatDeg);
    const startLonDeg = Number(options.startLonDeg);
    const startAltitudeM = Number(options.startAltitudeM);
    const headingDeg = Number(options.headingDeg);
    const flightPathAngleDeg = Number(options.flightPathAngleDeg);
    const initialSpeedMps = Number(options.initialSpeedMps);
    const ballisticCoefficientKgM2 = Number(options.ballisticCoefficientKgM2);
    const maxTimeSec = Number(options.maxTimeSec);
    if (!Number.isFinite(startLatDeg) || startLatDeg < -90 || startLatDeg > 90) return { valid: false, error: "分离点纬度无效" };
    if (!Number.isFinite(startLonDeg)) return { valid: false, error: "分离点经度无效" };
    if (!Number.isFinite(startAltitudeM) || startAltitudeM < 0 || startAltitudeM > 5000000) return { valid: false, error: "分离高度必须在 0 至 5000 千米之间" };
    if (!Number.isFinite(headingDeg)) return { valid: false, error: "初始航向无效" };
    if (!Number.isFinite(flightPathAngleDeg) || flightPathAngleDeg < -89 || flightPathAngleDeg > 89) return { valid: false, error: "弹道倾角必须在 -89 至 89 度之间" };
    if (!Number.isFinite(initialSpeedMps) || initialSpeedMps <= 0 || initialSpeedMps > 20000) return { valid: false, error: "初速度必须大于 0 且不超过 20000 m/s" };
    const dragEnabled = options.dragEnabled !== false;
    if (dragEnabled && (!Number.isFinite(ballisticCoefficientKgM2) || ballisticCoefficientKgM2 <= 0)) {
      return { valid: false, error: "启用大气阻力时，弹道系数必须大于 0" };
    }
    return {
      valid: true,
      startLatDeg,
      startLonDeg: normalizeLon(startLonDeg),
      startAltitudeM,
      headingDeg: normalizeBearing(headingDeg),
      flightPathAngleDeg,
      initialSpeedMps,
      dragEnabled,
      ballisticCoefficientKgM2: dragEnabled ? ballisticCoefficientKgM2 : Infinity,
      liftToDragRatio: dragEnabled ? clamp(Number(options.liftToDragRatio) || 0, 0, 3) : 0,
      bankAngleDeg: clamp(Number(options.bankAngleDeg) || 0, -180, 180),
      noseRadiusM: clamp(Number(options.noseRadiusM) || 1, 0.01, 100),
      densityProvider: typeof options.densityProvider === "function" ? options.densityProvider : null,
      atmosphereModel: options.atmosphereModel === "nrlmsise00" ? "nrlmsise00" : "standard1976",
      atmosphereModelLabel: options.atmosphereModel === "nrlmsise00"
        ? "NRLMSISE-00 empirical atmosphere"
        : "1976 Standard Atmosphere with geopotential-height conversion",
      atmosphereFallbackCount: 0,
      maxTimeSec: clamp(Number.isFinite(maxTimeSec) ? maxTimeSec : 7200, 10, 604800),
      outputStepSec: clamp(Number(options.outputStepSec) || 4, 0.25, 60),
      minimumStepSec: clamp(Number(options.minimumStepSec) || 0.1, 0.02, 2),
      maximumStepSec: clamp(Number(options.maximumStepSec) || 8, 0.1, 30),
      positionToleranceM: clamp(Number(options.positionToleranceM) || 0.05, 0.001, 100),
      velocityToleranceMps: clamp(Number(options.velocityToleranceMps) || 0.00005, 1e-7, 1),
      relativeTolerance: clamp(Number(options.relativeTolerance) || 1e-10, 1e-13, 1e-6),
      maxIntegrationSteps: clamp(Math.round(Number(options.maxIntegrationSteps) || 500000), 1000, 2000000),
      escapeRadiusM: clamp(Number(options.escapeRadiusM) || 100000000, 10000000, 1000000000),
    };
  }

  function invalidResult(message) {
    return {
      valid: false,
      status: "invalid",
      message,
      samples: [],
      impact: null,
      apogee: null,
      flightTimeSec: 0,
      groundRangeM: 0,
      groundTrackDistanceM: 0,
      sampledGroundTrackDistanceM: 0,
      endpointGeodesicDistanceM: 0,
      integrationSteps: 0,
      rejectedIntegrationSteps: 0,
      orbit: null,
    };
  }

  function derivative(state, elapsedSec, settings) {
    const gravity = gravityZonal(state.r);
    const aerodynamics = settings.dragEnabled ? aerodynamicAcceleration(state, elapsedSec, settings) : vector(0, 0, 0);
    return { r: state.v, v: add(gravity, aerodynamics) };
  }

  function rk4Step(state, elapsedSec, dt, settings) {
    const k1 = derivative(state, elapsedSec, settings);
    const k2 = derivative(addScaledState(state, k1, dt / 2), elapsedSec + dt / 2, settings);
    const k3 = derivative(addScaledState(state, k2, dt / 2), elapsedSec + dt / 2, settings);
    const k4 = derivative(addScaledState(state, k3, dt), elapsedSec + dt, settings);
    return {
      r: {
        x: state.r.x + (dt / 6) * (k1.r.x + 2 * k2.r.x + 2 * k3.r.x + k4.r.x),
        y: state.r.y + (dt / 6) * (k1.r.y + 2 * k2.r.y + 2 * k3.r.y + k4.r.y),
        z: state.r.z + (dt / 6) * (k1.r.z + 2 * k2.r.z + 2 * k3.r.z + k4.r.z),
      },
      v: {
        x: state.v.x + (dt / 6) * (k1.v.x + 2 * k2.v.x + 2 * k3.v.x + k4.v.x),
        y: state.v.y + (dt / 6) * (k1.v.y + 2 * k2.v.y + 2 * k3.v.y + k4.v.y),
        z: state.v.z + (dt / 6) * (k1.v.z + 2 * k2.v.z + 2 * k3.v.z + k4.v.z),
      },
    };
  }

  function adaptiveRk4Step(state, elapsedSec, requestedDt, settings) {
    const minimumAllowedDt = Math.min(settings.minimumStepSec, requestedDt);
    let dt = Math.min(requestedDt, settings.maximumStepSec);
    let rejectedSteps = 0;
    while (true) {
      const full = rk4Step(state, elapsedSec, dt, settings);
      const firstHalf = rk4Step(state, elapsedSec, dt / 2, settings);
      const twoHalf = rk4Step(firstHalf, elapsedSec + dt / 2, dt / 2, settings);
      const positionErrorM = magnitude(subtract(twoHalf.r, full.r)) / 15;
      const velocityErrorMps = magnitude(subtract(twoHalf.v, full.v)) / 15;
      const positionScaleM = settings.positionToleranceM + settings.relativeTolerance * Math.max(magnitude(state.r), magnitude(twoHalf.r));
      const velocityScaleMps = settings.velocityToleranceMps + settings.relativeTolerance * Math.max(magnitude(state.v), magnitude(twoHalf.v));
      const normalizedError = Math.max(positionErrorM / positionScaleM, velocityErrorMps / velocityScaleMps);
      if (normalizedError <= 1 || dt <= minimumAllowedDt * 1.000001) {
        return {
          state: richardsonExtrapolateState(twoHalf, full),
          dt,
          rejectedSteps,
          positionErrorM,
          velocityErrorMps,
          normalizedError,
          toleranceLimited: normalizedError > 1,
        };
      }
      const reduction = clamp(0.9 * normalizedError ** -0.2, 0.2, 0.75);
      dt = Math.max(minimumAllowedDt, dt * reduction);
      rejectedSteps += 1;
    }
  }

  function richardsonExtrapolateState(twoHalf, full) {
    return {
      r: add(twoHalf.r, scale(subtract(twoHalf.r, full.r), 1 / 15)),
      v: add(twoHalf.v, scale(subtract(twoHalf.v, full.v), 1 / 15)),
    };
  }

  function fixedRk4ExtrapolatedStep(state, elapsedSec, dt, settings) {
    if (!(dt > 0)) return cloneState(state);
    const full = rk4Step(state, elapsedSec, dt, settings);
    const firstHalf = rk4Step(state, elapsedSec, dt / 2, settings);
    const twoHalf = rk4Step(firstHalf, elapsedSec + dt / 2, dt / 2, settings);
    return richardsonExtrapolateState(twoHalf, full);
  }

  function refineSurfaceImpact(previousState, previousElapsedSec, dt, crossedState, settings) {
    let lowDt = 0;
    let highDt = dt;
    let highState = crossedState;
    let iterations = 0;
    for (; iterations < 20 && highDt - lowDt > 1e-6; iterations += 1) {
      const midDt = (lowDt + highDt) / 2;
      const midState = fixedRk4ExtrapolatedStep(previousState, previousElapsedSec, midDt, settings);
      const altitudeM = eciStateToGeodetic(midState, previousElapsedSec + midDt).altitudeM;
      if (altitudeM >= 0) lowDt = midDt;
      else {
        highDt = midDt;
        highState = midState;
      }
    }
    return {
      state: highState,
      elapsedSec: previousElapsedSec + highDt,
      iterations,
    };
  }

  function selectTimeStep(altitudeM, state, settings) {
    const relativeSpeed = magnitude(relativeAtmosphericVelocity(state));
    let preferred = settings.maximumStepSec;
    if (altitudeM < 15000) preferred = 0.2;
    else if (altitudeM < 35000) preferred = 0.35;
    else if (altitudeM < 80000) preferred = 0.6;
    else if (altitudeM < 150000) preferred = 1;
    if (relativeSpeed > 6000 && altitudeM < 120000) preferred *= 0.6;
    return clamp(preferred, settings.minimumStepSec, settings.maximumStepSec);
  }

  function gravityZonal(r) {
    const radius = magnitude(r);
    if (!(radius > 0)) return vector(0, 0, 0);
    const radiusSq = radius * radius;
    const sineLatitude = r.z / radius;
    const acceleration = scale(r, -EARTH_MU / (radiusSq * radius));
    const terms = [
      { degree: 2, coefficient: EARTH_J2, p: 0.5 * (3 * sineLatitude ** 2 - 1), dp: 3 * sineLatitude },
      { degree: 3, coefficient: EARTH_J3, p: 0.5 * (5 * sineLatitude ** 3 - 3 * sineLatitude), dp: 1.5 * (5 * sineLatitude ** 2 - 1) },
      { degree: 4, coefficient: EARTH_J4, p: (35 * sineLatitude ** 4 - 30 * sineLatitude ** 2 + 3) / 8, dp: 0.5 * (35 * sineLatitude ** 3 - 15 * sineLatitude) },
    ];
    for (const term of terms) {
      const scaleFactor = -EARTH_MU * term.coefficient * WGS84_A ** term.degree / radius ** (term.degree + 3);
      const horizontalFactor = -(term.degree + 1) * term.p - sineLatitude * term.dp;
      const verticalFactor = -(term.degree + 1) * sineLatitude * term.p + (1 - sineLatitude ** 2) * term.dp;
      acceleration.x += scaleFactor * r.x * horizontalFactor;
      acceleration.y += scaleFactor * r.y * horizontalFactor;
      acceleration.z += scaleFactor * radius * verticalFactor;
    }
    return acceleration;
  }

  function aerodynamicAcceleration(state, elapsedSec, settings) {
    const ecefPosition = rotateZ(state.r, -EARTH_ROTATION_RAD_S * elapsedSec);
    const geo = ecefToGeodetic(ecefPosition);
    const density = atmospherePropertiesAt(geo, elapsedSec, settings).densityKgM3;
    if (!(density > 0)) return vector(0, 0, 0);
    const relativeVelocity = relativeAtmosphericVelocity(state);
    const speed = magnitude(relativeVelocity);
    if (!(speed > 0)) return vector(0, 0, 0);
    const dragMagnitudeMps2 = (0.5 * density * speed * speed) / settings.ballisticCoefficientKgM2;
    const velocityDirection = scale(relativeVelocity, 1 / speed);
    const drag = scale(velocityDirection, -dragMagnitudeMps2);
    if (!(settings.liftToDragRatio > 0) || !(dragMagnitudeMps2 > 0)) return drag;
    const latRad = toRad(geo.latDeg);
    const lonRad = toRad(geo.lonDeg);
    const localUpEcef = vector(
      Math.cos(latRad) * Math.cos(lonRad),
      Math.cos(latRad) * Math.sin(lonRad),
      Math.sin(latRad),
    );
    const localUpEci = rotateZ(localUpEcef, EARTH_ROTATION_RAD_S * elapsedSec);
    let liftUp = subtract(localUpEci, scale(velocityDirection, dot(localUpEci, velocityDirection)));
    const liftUpMagnitude = magnitude(liftUp);
    if (!(liftUpMagnitude > 1e-10)) return drag;
    liftUp = scale(liftUp, 1 / liftUpMagnitude);
    const liftCross = normalizeVector(cross(velocityDirection, liftUp));
    const bankRad = toRad(settings.bankAngleDeg);
    const liftDirection = add(scale(liftUp, Math.cos(bankRad)), scale(liftCross, Math.sin(bankRad)));
    return add(drag, scale(liftDirection, dragMagnitudeMps2 * settings.liftToDragRatio));
  }

  function relativeAtmosphericVelocity(state) {
    return subtract(state.v, cross({ x: 0, y: 0, z: EARTH_ROTATION_RAD_S }, state.r));
  }

  function atmospherePropertiesAt(geo, elapsedSec, settings) {
    if (settings?.densityProvider) {
      try {
        const supplied = settings.densityProvider({
          altitudeM: Math.max(0, Number(geo.altitudeM) || 0),
          latDeg: Number(geo.latDeg) || 0,
          lonDeg: normalizeLon(Number(geo.lonDeg) || 0),
          elapsedSec: Math.max(0, Number(elapsedSec) || 0),
        });
        const densityKgM3 = typeof supplied === "number" ? supplied : Number(supplied?.densityKgM3);
        if (Number.isFinite(densityKgM3) && densityKgM3 >= 0) {
          return {
            densityKgM3,
            temperatureK: Number.isFinite(Number(supplied?.temperatureK)) ? Number(supplied.temperatureK) : null,
            source: supplied?.source || settings.atmosphereModel,
          };
        }
      } catch {}
    }
    if (settings?.densityProvider) settings.atmosphereFallbackCount += 1;
    return standardAtmosphereProperties(geo.altitudeM);
  }

  function atmosphericDensity(geometricAltitudeM) {
    return standardAtmosphereProperties(geometricAltitudeM).densityKgM3;
  }

  function standardAtmosphereProperties(geometricAltitudeM) {
    const altitudeM = Math.max(0, Number(geometricAltitudeM) || 0);
    if (altitudeM >= HIGH_ALTITUDE_DENSITY[HIGH_ALTITUDE_DENSITY.length - 1][0]) {
      return { densityKgM3: 0, temperatureK: highAltitudeTemperatureK(altitudeM), source: "standard1976" };
    }
    if (altitudeM > HIGH_ALTITUDE_DENSITY[0][0]) {
      for (let index = 1; index < HIGH_ALTITUDE_DENSITY.length; index += 1) {
        const lower = HIGH_ALTITUDE_DENSITY[index - 1];
        const upper = HIGH_ALTITUDE_DENSITY[index];
        if (altitudeM <= upper[0]) {
          const fraction = (altitudeM - lower[0]) / (upper[0] - lower[0]);
          return {
            densityKgM3: Math.exp(Math.log(lower[1]) + fraction * (Math.log(upper[1]) - Math.log(lower[1]))),
            temperatureK: highAltitudeTemperatureK(altitudeM),
            source: "standard1976",
          };
        }
      }
      return { densityKgM3: 0, temperatureK: highAltitudeTemperatureK(altitudeM), source: "standard1976" };
    }
    const geopotentialHeight = (EARTH_GEOPOTENTIAL_RADIUS_M * altitudeM) / (EARTH_GEOPOTENTIAL_RADIUS_M + altitudeM);
    let layer = ATMOSPHERE_LAYERS[0];
    for (let index = 1; index < ATMOSPHERE_LAYERS.length; index += 1) {
      if (geopotentialHeight < ATMOSPHERE_LAYERS[index].h) break;
      layer = ATMOSPHERE_LAYERS[index];
    }
    const deltaHeight = geopotentialHeight - layer.h;
    const temperature = layer.temperature + layer.lapse * deltaHeight;
    const pressure = layer.lapse === 0
      ? layer.pressure * Math.exp((-STANDARD_GRAVITY * deltaHeight) / (GAS_CONSTANT_AIR * layer.temperature))
      : layer.pressure * (layer.temperature / temperature) ** (STANDARD_GRAVITY / (GAS_CONSTANT_AIR * layer.lapse));
    return {
      densityKgM3: pressure / (GAS_CONSTANT_AIR * temperature),
      temperatureK: temperature,
      source: "standard1976",
    };
  }

  function highAltitudeTemperatureK(altitudeM) {
    const altitude = Math.max(HIGH_ALTITUDE_TEMPERATURE[0][0], Number(altitudeM) || 0);
    for (let index = 1; index < HIGH_ALTITUDE_TEMPERATURE.length; index += 1) {
      const lower = HIGH_ALTITUDE_TEMPERATURE[index - 1];
      const upper = HIGH_ALTITUDE_TEMPERATURE[index];
      if (altitude > upper[0]) continue;
      const fraction = (altitude - lower[0]) / Math.max(1, upper[0] - lower[0]);
      return lower[1] + (upper[1] - lower[1]) * clamp(fraction, 0, 1);
    }
    return HIGH_ALTITUDE_TEMPERATURE[HIGH_ALTITUDE_TEMPERATURE.length - 1][1];
  }

  function localVelocityEcef(latDeg, lonDeg, headingDeg, flightPathAngleDeg, speedMps) {
    const lat = toRad(latDeg);
    const lon = toRad(lonDeg);
    const heading = toRad(headingDeg);
    const flightPathAngle = toRad(flightPathAngleDeg);
    const east = vector(-Math.sin(lon), Math.cos(lon), 0);
    const north = vector(-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat));
    const up = vector(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat));
    const horizontalSpeed = speedMps * Math.cos(flightPathAngle);
    return add(
      add(scale(east, horizontalSpeed * Math.sin(heading)), scale(north, horizontalSpeed * Math.cos(heading))),
      scale(up, speedMps * Math.sin(flightPathAngle)),
    );
  }

  function geodeticToEcef(latDeg, lonDeg, altitudeM = 0) {
    const lat = toRad(latDeg);
    const lon = toRad(lonDeg);
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    return {
      x: (primeVertical + altitudeM) * cosLat * Math.cos(lon),
      y: (primeVertical + altitudeM) * cosLat * Math.sin(lon),
      z: (primeVertical * (1 - WGS84_E2) + altitudeM) * sinLat,
    };
  }

  function ecefToGeodetic(position) {
    const p = Math.hypot(position.x, position.y);
    const lon = Math.atan2(position.y, position.x);
    if (p < 1e-8) {
      return {
        latDeg: position.z >= 0 ? 90 : -90,
        lonDeg: 0,
        altitudeM: Math.abs(position.z) - WGS84_B,
      };
    }
    let lat = Math.atan2(position.z, p * (1 - WGS84_E2));
    let altitudeM = 0;
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const sinLat = Math.sin(lat);
      const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
      altitudeM = p / Math.max(1e-12, Math.cos(lat)) - primeVertical;
      const nextLat = Math.atan2(position.z, p * (1 - (WGS84_E2 * primeVertical) / (primeVertical + altitudeM)));
      if (Math.abs(nextLat - lat) < 1e-13) {
        lat = nextLat;
        break;
      }
      lat = nextLat;
    }
    const sinLat = Math.sin(lat);
    const primeVertical = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    altitudeM = Math.abs(Math.cos(lat)) > 1e-10 ? p / Math.cos(lat) - primeVertical : Math.abs(position.z) - WGS84_B;
    return { latDeg: toDeg(lat), lonDeg: normalizeLon(toDeg(lon)), altitudeM };
  }

  function eciStateToGeodetic(state, elapsedSec) {
    return ecefToGeodetic(rotateZ(state.r, -EARTH_ROTATION_RAD_S * elapsedSec));
  }

  function createBallisticSample(state, elapsedSec, geo, settings) {
    const relativeVelocity = relativeAtmosphericVelocity(state);
    const airRelativeSpeedMps = magnitude(relativeVelocity);
    const atmosphere = settings.dragEnabled
      ? atmospherePropertiesAt(geo, elapsedSec, settings)
      : { densityKgM3: 0, temperatureK: null, source: "disabled" };
    const speedOfSoundMps = Number.isFinite(atmosphere.temperatureK) && atmosphere.temperatureK > 0
      ? Math.sqrt(AIR_HEAT_CAPACITY_RATIO * GAS_CONSTANT_AIR * atmosphere.temperatureK)
      : null;
    const localMach = Number.isFinite(speedOfSoundMps) && speedOfSoundMps > 0
      ? airRelativeSpeedMps / speedOfSoundMps
      : null;
    const latRad = toRad(geo.latDeg);
    const lonRad = toRad(geo.lonDeg);
    const localUpEcef = vector(
      Math.cos(latRad) * Math.cos(lonRad),
      Math.cos(latRad) * Math.sin(lonRad),
      Math.sin(latRad),
    );
    const localUpEci = rotateZ(localUpEcef, EARTH_ROTATION_RAD_S * elapsedSec);
    const airRelativeVerticalSpeedMps = dot(relativeVelocity, localUpEci);
    const airRelativeHorizontalSpeedMps = Math.sqrt(Math.max(0, airRelativeSpeedMps ** 2 - airRelativeVerticalSpeedMps ** 2));
    const flightPathAngleDeg = toDeg(Math.atan2(airRelativeVerticalSpeedMps, airRelativeHorizontalSpeedMps));
    const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * airRelativeSpeedMps * airRelativeSpeedMps;
    const dragDecelerationMps2 = settings.dragEnabled ? dynamicPressurePa / settings.ballisticCoefficientKgM2 : 0;
    const liftAccelerationMps2 = dragDecelerationMps2 * settings.liftToDragRatio;
    const aerodynamicLoadG = Math.hypot(dragDecelerationMps2, liftAccelerationMps2) / STANDARD_GRAVITY;
    const convectiveHeatFluxWm2 = settings.dragEnabled
      ? SUTTON_GRAVES_EARTH_K * Math.sqrt(atmosphere.densityKgM3 / settings.noseRadiusM) * airRelativeSpeedMps ** 3
      : 0;
    const flow = atmosphericFlowDiagnostics(atmosphere, airRelativeSpeedMps, settings.noseRadiusM * 2);
    return {
      lon: normalizeLon(geo.lonDeg),
      lat: geo.latDeg,
      altitudeM: Math.max(0, geo.altitudeM),
      elapsedSec,
      inertialSpeedMps: magnitude(state.v),
      groundRelativeSpeedMps: airRelativeSpeedMps,
      airRelativeSpeedMps,
      speedOfSoundMps,
      localMach,
      airRelativeVerticalSpeedMps,
      airRelativeHorizontalSpeedMps,
      flightPathAngleDeg,
      densityKgM3: atmosphere.densityKgM3,
      temperatureK: atmosphere.temperatureK,
      atmosphereSource: atmosphere.source,
      dynamicPressurePa,
      dragDecelerationMps2,
      dragLoadG: dragDecelerationMps2 / STANDARD_GRAVITY,
      liftAccelerationMps2,
      aerodynamicLoadG,
      convectiveHeatFluxWm2,
      dynamicViscosityPaS: flow.dynamicViscosityPaS,
      reynoldsNumber: flow.reynoldsNumber,
      meanFreePathM: flow.meanFreePathM,
      knudsenNumber: flow.knudsenNumber,
      flowRegime: flow.flowRegime,
      diagnosticReferenceLengthM: flow.referenceLengthM,
      radiativeHeatingAdvisory: convectiveHeatFluxWm2 > 0 && airRelativeSpeedMps >= RADIATIVE_HEATING_ADVISORY_SPEED_MPS,
    };
  }

  function pushSampleCopy(samples, sample) {
    if (!sample) return;
    if (samples.length && Math.abs(samples[samples.length - 1].elapsedSec - sample.elapsedSec) < 1e-8) {
      samples[samples.length - 1] = { ...sample };
      return;
    }
    samples.push({ ...sample });
  }

  function atmosphericFlowDiagnostics(atmosphere, speedMps, referenceLengthM) {
    const temperatureK = Number(atmosphere?.temperatureK);
    const densityKgM3 = Math.max(0, Number(atmosphere?.densityKgM3) || 0);
    const lengthM = Math.max(0.02, Number(referenceLengthM) || 0.02);
    if (!(temperatureK > 0)) {
      return {
        dynamicViscosityPaS: null,
        reynoldsNumber: null,
        meanFreePathM: null,
        knudsenNumber: null,
        flowRegime: "unknown",
        referenceLengthM: lengthM,
      };
    }
    const dynamicViscosityPaS = (SUTHERLAND_BETA_KG_M_S_SQRT_K * temperatureK ** 1.5) / (temperatureK + SUTHERLAND_TEMPERATURE_K);
    const meanFreePathM = densityKgM3 > 0
      ? (dynamicViscosityPaS / densityKgM3) * Math.sqrt(Math.PI / (2 * GAS_CONSTANT_AIR * temperatureK))
      : Number.POSITIVE_INFINITY;
    const reynoldsNumber = dynamicViscosityPaS > 0
      ? (densityKgM3 * Math.max(0, Number(speedMps) || 0) * lengthM) / dynamicViscosityPaS
      : null;
    const knudsenNumber = meanFreePathM / lengthM;
    const flowRegime = knudsenNumber >= 10
      ? "free-molecular"
      : knudsenNumber >= 0.1
        ? "transitional"
        : knudsenNumber >= 0.01
          ? "slip"
          : "continuum";
    return {
      dynamicViscosityPaS,
      reynoldsNumber,
      meanFreePathM,
      knudsenNumber,
      flowRegime,
      referenceLengthM: lengthM,
    };
  }

  function enrichReentrySamples(samples, settings) {
    if (!samples.length) {
      return {
        interface120Km: null,
        interface70Km: null,
        aerodynamicOnset: null,
        strongAerodynamics: null,
        peakHeating: null,
        peakDynamicPressure: null,
        peakDragLoad: null,
        peakAerodynamicLoad: null,
        interface120KmEvents: [],
        interface70KmEvents: [],
        passes: [],
        totalConvectiveHeatJm2: 0,
        atmosphereFallbackCount: settings.atmosphereFallbackCount,
      };
    }

    let totalConvectiveHeatJm2 = 0;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const previous = samples[Math.max(0, index - 1)];
      const next = samples[Math.min(samples.length - 1, index + 1)];
      const deltaTime = Math.max(1e-9, next.elapsedSec - previous.elapsedSec);
      sample.verticalSpeedMps = (next.altitudeM - previous.altitudeM) / deltaTime;
      sample.descending = sample.verticalSpeedMps < -0.5;
      if (index > 0) {
        const dt = Math.max(0, sample.elapsedSec - samples[index - 1].elapsedSec);
        totalConvectiveHeatJm2 += dt * (sample.convectiveHeatFluxWm2 + samples[index - 1].convectiveHeatFluxWm2) * 0.5;
      }
      sample.cumulativeHeatJm2 = totalConvectiveHeatJm2;
    }

    const interface120KmEvents = collectAltitudeEvents(samples, ATMOSPHERE_INTERFACE_ALTITUDE_M);
    const interface70KmEvents = collectAltitudeEvents(samples, 70000);
    const passes = buildAtmosphericPasses(samples, interface120KmEvents);
    annotateAtmosphericPasses(samples, passes);
    const descendingSamples = samples.filter((sample) => sample.descending);
    const atmosphericSamples = samples.filter((sample) => sample.atmospherePassIndex >= 0);
    const peakCandidates = atmosphericSamples.length ? atmosphericSamples : descendingSamples.length ? descendingSamples : samples;
    const peakHeating = peakCandidates.reduce((peak, sample) =>
      sample.convectiveHeatFluxWm2 > peak.convectiveHeatFluxWm2 ? sample : peak);
    const peakDynamicPressure = peakCandidates.reduce((peak, sample) =>
      sample.dynamicPressurePa > peak.dynamicPressurePa ? sample : peak);
    const peakDragLoad = peakCandidates.reduce((peak, sample) =>
      sample.dragLoadG > peak.dragLoadG ? sample : peak);
    const peakAerodynamicLoad = peakCandidates.reduce((peak, sample) =>
      sample.aerodynamicLoadG > peak.aerodynamicLoadG ? sample : peak);
    const radiativeHeatingAdvisory = peakCandidates.some((sample) => sample.radiativeHeatingAdvisory);

    const peakHeatValue = Math.max(1e-12, peakHeating.convectiveHeatFluxWm2);
    const peakPressureValue = Math.max(1e-12, peakDynamicPressure.dynamicPressurePa);
    for (const sample of samples) {
      sample.heatRatio = clamp(sample.convectiveHeatFluxWm2 / peakHeatValue, 0, 1);
      sample.dynamicPressureRatio = clamp(sample.dynamicPressurePa / peakPressureValue, 0, 1);
    }

    for (const sample of samples) sample.reentryPhase = classifyReentryPhase(sample);
    const interface120Km = interface120KmEvents.find((event) => event.direction === "descending") || null;
    const interface70Km = interface70KmEvents.find((event) => event.direction === "descending") || null;
    return {
      interface120Km: compactReentryEvent(interface120Km),
      interface70Km: compactReentryEvent(interface70Km),
      interface120KmEvents: interface120KmEvents.map(compactReentryEvent),
      interface70KmEvents: interface70KmEvents.map(compactReentryEvent),
      passes,
      aerodynamicOnset: compactReentryEvent(peakCandidates.find((sample) => sample.dynamicPressurePa >= 1)),
      strongAerodynamics: compactReentryEvent(peakCandidates.find((sample) => sample.dynamicPressurePa >= 100)),
      peakHeating: compactReentryEvent(peakHeating),
      peakDynamicPressure: compactReentryEvent(peakDynamicPressure),
      peakDragLoad: compactReentryEvent(peakDragLoad),
      peakAerodynamicLoad: compactReentryEvent(peakAerodynamicLoad),
      totalConvectiveHeatJm2,
      atmosphereFallbackCount: settings.atmosphereFallbackCount,
      noseRadiusM: settings.noseRadiusM,
      diagnosticSampleCount: samples.length,
      radiativeHeatingAdvisory,
      heatFluxMethod: "Sutton-Graves Earth-air cold-wall stagnation-point engineering correlation",
      samplingMethod: "every accepted adaptive integration step",
    };
  }

  function applyReentryAnalysis(outputSamples, diagnosticSamples, reentry) {
    if (!outputSamples.length || !diagnosticSamples.length) return;
    const peakHeat = Math.max(1e-12, Number(reentry?.peakHeating?.convectiveHeatFluxWm2) || 0);
    const peakPressure = Math.max(1e-12, Number(reentry?.peakDynamicPressure?.dynamicPressurePa) || 0);
    let cursor = 0;
    for (const sample of outputSamples) {
      while (cursor + 1 < diagnosticSamples.length && diagnosticSamples[cursor + 1].elapsedSec <= sample.elapsedSec + 1e-9) cursor += 1;
      const lower = diagnosticSamples[cursor];
      const upper = diagnosticSamples[Math.min(diagnosticSamples.length - 1, cursor + 1)];
      const duration = Math.max(1e-9, upper.elapsedSec - lower.elapsedSec);
      const fraction = clamp((sample.elapsedSec - lower.elapsedSec) / duration, 0, 1);
      for (const key of ["verticalSpeedMps", "cumulativeHeatJm2"]) {
        const start = Number(lower[key]);
        const end = Number(upper[key]);
        sample[key] = Number.isFinite(start) && Number.isFinite(end)
          ? start + (end - start) * fraction
          : Number.isFinite(start) ? start : end;
      }
      sample.descending = Number(sample.verticalSpeedMps) < -0.5;
      applyAtmosphericPassAnnotation(sample, reentry?.passes || []);
      sample.heatRatio = clamp(sample.convectiveHeatFluxWm2 / peakHeat, 0, 1);
      sample.dynamicPressureRatio = clamp(sample.dynamicPressurePa / peakPressure, 0, 1);
      sample.reentryPhase = classifyReentryPhase(sample);
    }
  }

  function mergeCriticalDiagnosticSamples(outputSamples, diagnosticSamples, reentry) {
    const eventTimes = [
      reentry?.aerodynamicOnset?.elapsedSec,
      reentry?.strongAerodynamics?.elapsedSec,
      reentry?.peakHeating?.elapsedSec,
      reentry?.peakDynamicPressure?.elapsedSec,
      reentry?.peakDragLoad?.elapsedSec,
      reentry?.peakAerodynamicLoad?.elapsedSec,
      ...(reentry?.interface120KmEvents || []).map((event) => event.elapsedSec),
      ...(reentry?.interface70KmEvents || []).map((event) => event.elapsedSec),
      ...(reentry?.passes || []).flatMap((pass) => [
        pass.minimumAltitude?.elapsedSec,
        pass.peakHeating?.elapsedSec,
        pass.peakDynamicPressure?.elapsedSec,
        pass.peakAerodynamicLoad?.elapsedSec,
      ]),
    ].filter(Number.isFinite);
    for (const elapsedSec of eventTimes) {
      let low = 0;
      let high = diagnosticSamples.length - 1;
      while (high - low > 1) {
        const middle = (low + high) >> 1;
        if (diagnosticSamples[middle].elapsedSec <= elapsedSec) low = middle;
        else high = middle;
      }
      const selected = Math.abs(diagnosticSamples[high].elapsedSec - elapsedSec) < Math.abs(diagnosticSamples[low].elapsedSec - elapsedSec)
        ? diagnosticSamples[high]
        : diagnosticSamples[low];
      outputSamples.push({ ...selected });
    }
    outputSamples.sort((a, b) => a.elapsedSec - b.elapsedSec);
    for (let index = outputSamples.length - 1; index > 0; index -= 1) {
      if (Math.abs(outputSamples[index].elapsedSec - outputSamples[index - 1].elapsedSec) < 1e-8) outputSamples.splice(index, 1);
    }
  }

  function classifyReentryPhase(sample) {
    if (!sample.descending && sample.atmospherePassIndex >= 0 && sample.altitudeM <= ATMOSPHERE_INTERFACE_ALTITUDE_M) {
      if (sample.dynamicPressurePa < 1) return "skip-exit-interface";
      if (sample.heatRatio >= 0.1) return "skip-exit-heating";
      return "skip-exit";
    }
    if (!sample.descending) return "coast";
    if (sample.altitudeM > 120000) return "exoatmospheric";
    if (sample.dynamicPressurePa < 1) return "entry-interface";
    if (sample.dynamicPressurePa < 100) return "rarefied-entry";
    if (sample.heatRatio >= 0.35) return "peak-heating";
    if (sample.dynamicPressureRatio >= 0.35) return "peak-pressure";
    if (sample.altitudeM < 30000) return "lower-atmosphere";
    return "dense-entry";
  }

  function compactReentryEvent(sample) {
    if (!sample) return null;
    return {
      elapsedSec: sample.elapsedSec,
      lat: sample.lat,
      lon: sample.lon,
      altitudeM: sample.altitudeM,
      groundRelativeSpeedMps: sample.groundRelativeSpeedMps,
      airRelativeSpeedMps: sample.airRelativeSpeedMps,
      speedOfSoundMps: sample.speedOfSoundMps,
      localMach: sample.localMach,
      airRelativeVerticalSpeedMps: sample.airRelativeVerticalSpeedMps,
      airRelativeHorizontalSpeedMps: sample.airRelativeHorizontalSpeedMps,
      flightPathAngleDeg: sample.flightPathAngleDeg,
      densityKgM3: sample.densityKgM3,
      dynamicPressurePa: sample.dynamicPressurePa,
      dragLoadG: sample.dragLoadG,
      liftAccelerationMps2: sample.liftAccelerationMps2,
      aerodynamicLoadG: sample.aerodynamicLoadG,
      convectiveHeatFluxWm2: sample.convectiveHeatFluxWm2,
      dynamicViscosityPaS: sample.dynamicViscosityPaS,
      reynoldsNumber: sample.reynoldsNumber,
      meanFreePathM: sample.meanFreePathM,
      knudsenNumber: sample.knudsenNumber,
      flowRegime: sample.flowRegime,
      diagnosticReferenceLengthM: sample.diagnosticReferenceLengthM,
      radiativeHeatingAdvisory: sample.radiativeHeatingAdvisory,
      reentryPhase: sample.reentryPhase,
      direction: sample.direction || null,
      atmospherePassIndex: Number.isFinite(Number(sample.atmospherePassIndex)) ? Number(sample.atmospherePassIndex) : null,
      atmospherePassOutcome: sample.atmospherePassOutcome || null,
    };
  }

  function interpolateDescendingAltitudeEvent(samples, targetAltitudeM) {
    return collectAltitudeEvents(samples, targetAltitudeM).find((event) => event.direction === "descending") || null;
  }

  function collectAltitudeEvents(samples, targetAltitudeM) {
    const events = [];
    for (let index = 1; index < samples.length; index += 1) {
      const previous = samples[index - 1];
      const current = samples[index];
      const startsOnBoundary = index === 1 && Math.abs(previous.altitudeM - targetAltitudeM) <= 0.1;
      const descending = (previous.altitudeM > targetAltitudeM && current.altitudeM <= targetAltitudeM) ||
        (startsOnBoundary && current.altitudeM < targetAltitudeM);
      const ascending = (previous.altitudeM < targetAltitudeM && current.altitudeM >= targetAltitudeM) ||
        (startsOnBoundary && current.altitudeM > targetAltitudeM);
      if (!descending && !ascending) continue;
      const event = interpolateAltitudeEvent(previous, current, targetAltitudeM, descending ? "descending" : "ascending");
      if (!events.length || Math.abs(events[events.length - 1].elapsedSec - event.elapsedSec) > 1e-6) events.push(event);
    }
    return events;
  }

  function interpolateAltitudeEvent(previous, current, targetAltitudeM, direction) {
    const altitudeDelta = current.altitudeM - previous.altitudeM;
    const fraction = clamp(
      Math.abs(altitudeDelta) > 1e-12 ? (targetAltitudeM - previous.altitudeM) / altitudeDelta : 0,
      0,
      1,
    );
    const event = {
      lon: normalizeLon(previous.lon + normalizeLon(current.lon - previous.lon) * fraction),
      lat: previous.lat + (current.lat - previous.lat) * fraction,
      altitudeM: targetAltitudeM,
      descending: direction === "descending",
      direction,
    };
    for (const key of [
      "elapsedSec", "inertialSpeedMps", "groundRelativeSpeedMps", "airRelativeSpeedMps",
      "speedOfSoundMps", "localMach", "airRelativeVerticalSpeedMps", "airRelativeHorizontalSpeedMps",
      "flightPathAngleDeg", "densityKgM3", "temperatureK", "dynamicPressurePa", "dragDecelerationMps2",
      "dragLoadG", "liftAccelerationMps2", "aerodynamicLoadG", "convectiveHeatFluxWm2", "dynamicViscosityPaS",
      "reynoldsNumber", "meanFreePathM", "knudsenNumber", "diagnosticReferenceLengthM", "cumulativeHeatJm2",
      "verticalSpeedMps", "heatRatio", "dynamicPressureRatio",
    ]) {
      const start = Number(previous[key]);
      const end = Number(current[key]);
      event[key] = Number.isFinite(start) && Number.isFinite(end)
        ? start + (end - start) * fraction
        : Number.isFinite(start) ? start : end;
    }
    event.atmosphereSource = fraction < 0.5 ? previous.atmosphereSource : current.atmosphereSource;
    event.flowRegime = fraction < 0.5 ? previous.flowRegime : current.flowRegime;
    event.radiativeHeatingAdvisory = Boolean(previous.radiativeHeatingAdvisory || current.radiativeHeatingAdvisory);
    return event;
  }

  function buildAtmosphericPasses(samples, interfaceEvents) {
    if (!samples.length) return [];
    const passes = [];
    let activeEntry = samples[0].altitudeM <= ATMOSPHERE_INTERFACE_ALTITUDE_M + 0.1
      ? { ...samples[0], direction: samples[0].descending ? "descending" : "initial-inside" }
      : null;
    for (const event of interfaceEvents) {
      if (event.direction === "descending") {
        if (!activeEntry) activeEntry = event;
        continue;
      }
      if (!activeEntry) activeEntry = { ...samples[0], direction: "initial-inside" };
      passes.push(summarizeAtmosphericPass(samples, activeEntry, event, "exit", passes.length));
      activeEntry = null;
    }
    if (activeEntry) {
      const last = samples[samples.length - 1];
      const outcome = last.altitudeM <= 0.01 ? "impact" : "ongoing";
      passes.push(summarizeAtmosphericPass(samples, activeEntry, outcome === "impact" ? last : null, outcome, passes.length));
    }
    return passes;
  }

  function summarizeAtmosphericPass(samples, entry, exit, outcome, index) {
    const startSec = Number(entry.elapsedSec) || 0;
    const endSec = exit ? Number(exit.elapsedSec) : Number(samples[samples.length - 1].elapsedSec);
    const candidates = [entry];
    for (const sample of samples) {
      if (sample.elapsedSec > startSec + 1e-9 && sample.elapsedSec < endSec - 1e-9) candidates.push(sample);
    }
    if (exit) candidates.push(exit);
    const minimumAltitude = candidates.reduce((best, sample) => sample.altitudeM < best.altitudeM ? sample : best);
    const peakHeating = candidates.reduce((best, sample) => sample.convectiveHeatFluxWm2 > best.convectiveHeatFluxWm2 ? sample : best);
    const peakDynamicPressure = candidates.reduce((best, sample) => sample.dynamicPressurePa > best.dynamicPressurePa ? sample : best);
    const peakAerodynamicLoad = candidates.reduce((best, sample) => sample.aerodynamicLoadG > best.aerodynamicLoadG ? sample : best);
    const totalConvectiveHeatJm2 = Math.max(
      0,
      (Number(candidates[candidates.length - 1].cumulativeHeatJm2) || 0) - (Number(candidates[0].cumulativeHeatJm2) || 0),
    );
    return {
      index,
      outcome,
      entry: compactReentryEvent(entry),
      exit: compactReentryEvent(exit),
      durationSec: Math.max(0, endSec - startSec),
      minimumAltitude: compactReentryEvent(minimumAltitude),
      peakHeating: compactReentryEvent(peakHeating),
      peakDynamicPressure: compactReentryEvent(peakDynamicPressure),
      peakAerodynamicLoad: compactReentryEvent(peakAerodynamicLoad),
      totalConvectiveHeatJm2,
      speedLossMps: Math.max(0, (Number(entry.airRelativeSpeedMps) || 0) - (Number(exit?.airRelativeSpeedMps) || Number(candidates[candidates.length - 1].airRelativeSpeedMps) || 0)),
    };
  }

  function annotateAtmosphericPasses(samples, passes) {
    for (const sample of samples) applyAtmosphericPassAnnotation(sample, passes);
  }

  function applyAtmosphericPassAnnotation(sample, passes) {
    sample.atmospherePassIndex = -1;
    sample.atmospherePassOutcome = null;
    sample.atmospherePassEntrySec = null;
    sample.atmospherePassExitSec = null;
    for (const pass of passes || []) {
      const startSec = Number(pass.entry?.elapsedSec);
      const endSec = Number.isFinite(Number(pass.exit?.elapsedSec)) ? Number(pass.exit.elapsedSec) : Number.POSITIVE_INFINITY;
      if (sample.elapsedSec < startSec - 1e-6 || sample.elapsedSec > endSec + 1e-6) continue;
      sample.atmospherePassIndex = pass.index;
      sample.atmospherePassOutcome = pass.outcome;
      sample.atmospherePassEntrySec = startSec;
      sample.atmospherePassExitSec = Number.isFinite(endSec) ? endSec : null;
      break;
    }
  }

  function polylineGroundDistance(samples) {
    let total = 0;
    for (let index = 1; index < samples.length; index += 1) {
      total += ellipsoidDistanceM(samples[index - 1], samples[index]);
    }
    return total;
  }

  function isClearOrbitalState(orbit) {
    return Boolean(orbit?.bound && Number(orbit.perigeeAltitudeM) > 0);
  }

  function orbitAtEpoch(orbit, epochSec) {
    return orbit ? { ...orbit, epochSec: Math.max(0, Number(epochSec) || 0) } : null;
  }

  function createOrbitEnvelope(initialOrbit) {
    const envelope = { sampleCount: 0 };
    updateOrbitEnvelope(envelope, initialOrbit);
    return envelope;
  }

  function updateOrbitEnvelope(envelope, orbit) {
    if (!envelope || !orbit?.bound) return;
    envelope.sampleCount += 1;
    for (const key of ["semiMajorAxisM", "eccentricity", "perigeeAltitudeM", "apogeeAltitudeM", "inclinationDeg", "specificEnergyJkg"]) {
      const value = Number(orbit[key]);
      if (!Number.isFinite(value)) continue;
      const minimumKey = `minimum${key[0].toUpperCase()}${key.slice(1)}`;
      const maximumKey = `maximum${key[0].toUpperCase()}${key.slice(1)}`;
      envelope[minimumKey] = Number.isFinite(envelope[minimumKey]) ? Math.min(envelope[minimumKey], value) : value;
      envelope[maximumKey] = Number.isFinite(envelope[maximumKey]) ? Math.max(envelope[maximumKey], value) : value;
    }
  }

  function buildOrbitAnalysis(initialOrbit, finalOrbit, referenceOrbit, envelope, reentry, finalEpochSec) {
    if (!initialOrbit && !finalOrbit) return null;
    const initial = orbitAtEpoch(initialOrbit, 0);
    const final = orbitAtEpoch(finalOrbit, finalEpochSec);
    const reference = referenceOrbit || (isClearOrbitalState(finalOrbit) ? final : null);
    const passes = Array.isArray(reentry?.passes) ? reentry.passes : [];
    const exitedPassCount = passes.filter((pass) => pass.outcome === "exit").length;
    const regime = exitedPassCount > 0
      ? "atmospheric-grazing"
      : passes.length > 0
        ? "atmospheric-decay"
        : "clear-orbit";
    const baseline = reference || final || initial;
    const variation = reference && final ? {
      semiMajorAxisM: final.semiMajorAxisM - reference.semiMajorAxisM,
      eccentricity: final.eccentricity - reference.eccentricity,
      perigeeAltitudeM: final.perigeeAltitudeM - reference.perigeeAltitudeM,
      apogeeAltitudeM: final.apogeeAltitudeM - reference.apogeeAltitudeM,
      inclinationDeg: final.inclinationDeg - reference.inclinationDeg,
      specificEnergyJkg: final.specificEnergyJkg - reference.specificEnergyJkg,
    } : null;
    return {
      ...baseline,
      reference,
      initialElements: reference,
      initial,
      final,
      envelope,
      variation,
      referenceKind: reference?.epochSec > 1e-9 ? "post-aerocapture-osculating" : "separation-osculating",
      regime,
      atmosphericPassCount: passes.length,
      exitedPassCount,
      elementType: "osculating-two-body",
    };
  }

  function orbitalElementsFromState(state) {
    if (!isFiniteState(state)) return null;
    const radiusM = magnitude(state.r);
    const speedSqM2S2 = dot(state.v, state.v);
    const angularMomentum = cross(state.r, state.v);
    const angularMomentumMagnitude = magnitude(angularMomentum);
    if (!(radiusM > 0) || !(angularMomentumMagnitude > 0)) return null;
    const eccentricityVector = subtract(scale(cross(state.v, angularMomentum), 1 / EARTH_MU), scale(state.r, 1 / radiusM));
    const eccentricity = magnitude(eccentricityVector);
    const specificEnergyJkg = speedSqM2S2 / 2 - EARTH_MU / radiusM;
    const bound = specificEnergyJkg < 0 && eccentricity < 1;
    const semiMajorAxisM = bound ? -EARTH_MU / (2 * specificEnergyJkg) : null;
    const perigeeRadiusM = bound ? semiMajorAxisM * (1 - eccentricity) : null;
    const apogeeRadiusM = bound ? semiMajorAxisM * (1 + eccentricity) : null;
    const inclinationDeg = toDeg(Math.acos(clamp(angularMomentum.z / angularMomentumMagnitude, -1, 1)));
    const nodeVector = vector(-angularMomentum.y, angularMomentum.x, 0);
    const nodeMagnitude = magnitude(nodeVector);
    let rightAscensionAscendingNodeDeg = null;
    if (nodeMagnitude > 1e-12) rightAscensionAscendingNodeDeg = normalizeBearing(toDeg(Math.atan2(nodeVector.y, nodeVector.x)));
    let argumentOfPerigeeDeg = null;
    if (nodeMagnitude > 1e-12 && eccentricity > 1e-12) {
      let angle = Math.acos(clamp(dot(nodeVector, eccentricityVector) / (nodeMagnitude * eccentricity), -1, 1));
      if (eccentricityVector.z < 0) angle = 2 * Math.PI - angle;
      argumentOfPerigeeDeg = normalizeBearing(toDeg(angle));
    }
    let trueAnomalyDeg = null;
    if (eccentricity > 1e-12) {
      let angle = Math.acos(clamp(dot(eccentricityVector, state.r) / (eccentricity * radiusM), -1, 1));
      if (dot(state.r, state.v) < 0) angle = 2 * Math.PI - angle;
      trueAnomalyDeg = normalizeBearing(toDeg(angle));
    }
    return {
      bound,
      eccentricity,
      specificEnergyJkg,
      semiMajorAxisM,
      perigeeRadiusM,
      apogeeRadiusM,
      perigeeAltitudeM: bound ? perigeeRadiusM - WGS84_A : null,
      apogeeAltitudeM: bound ? apogeeRadiusM - WGS84_A : null,
      inclinationDeg,
      rightAscensionAscendingNodeDeg,
      argumentOfPerigeeDeg,
      trueAnomalyDeg,
      specificAngularMomentumM2S: angularMomentumMagnitude,
      c3EnergyM2S2: 2 * specificEnergyJkg,
      periodSec: bound ? 2 * Math.PI * Math.sqrt(semiMajorAxisM ** 3 / EARTH_MU) : null,
    };
  }

  function ellipsoidDistanceM(a, b) {
    const lat1 = toRad(Number(a?.lat ?? a?.latDeg));
    const lat2 = toRad(Number(b?.lat ?? b?.latDeg));
    const lon1 = toRad(Number(a?.lon ?? a?.lonDeg));
    const lon2 = toRad(Number(b?.lon ?? b?.lonDeg));
    if (![lat1, lat2, lon1, lon2].every(Number.isFinite)) return NaN;
    if (Math.abs(lat1 - lat2) < 1e-15 && Math.abs(normalizeLon(toDeg(lon2 - lon1))) < 1e-13) return 0;

    const reducedLat1 = Math.atan((1 - WGS84_F) * Math.tan(lat1));
    const reducedLat2 = Math.atan((1 - WGS84_F) * Math.tan(lat2));
    const sinU1 = Math.sin(reducedLat1);
    const cosU1 = Math.cos(reducedLat1);
    const sinU2 = Math.sin(reducedLat2);
    const cosU2 = Math.cos(reducedLat2);
    const longitudeDifference = toRad(normalizeLon(toDeg(lon2 - lon1)));
    let lambda = longitudeDifference;
    let sinSigma = 0;
    let cosSigma = 0;
    let sigma = 0;
    let sinAlpha = 0;
    let cosSqAlpha = 0;
    let cos2SigmaM = 0;
    let converged = false;

    for (let iteration = 0; iteration < 100; iteration += 1) {
      const sinLambda = Math.sin(lambda);
      const cosLambda = Math.cos(lambda);
      const x = cosU2 * sinLambda;
      const y = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
      sinSigma = Math.hypot(x, y);
      if (sinSigma < 1e-15) return 0;
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
      cosSqAlpha = 1 - sinAlpha * sinAlpha;
      cos2SigmaM = cosSqAlpha > 1e-15 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
      const coefficient = (WGS84_F / 16) * cosSqAlpha * (4 + WGS84_F * (4 - 3 * cosSqAlpha));
      const nextLambda = longitudeDifference + (1 - coefficient) * WGS84_F * sinAlpha * (
        sigma + coefficient * sinSigma * (
          cos2SigmaM + coefficient * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
        )
      );
      if (Math.abs(nextLambda - lambda) < 1e-12) {
        lambda = nextLambda;
        converged = true;
        break;
      }
      lambda = nextLambda;
    }
    if (!converged) return greatCircleDistanceM({ lat: toDeg(lat1), lon: toDeg(lon1) }, { lat: toDeg(lat2), lon: toDeg(lon2) });

    const uSq = cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B) / (WGS84_B * WGS84_B);
    const coefficientA = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const coefficientB = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const deltaSigma = coefficientB * sinSigma * (
      cos2SigmaM + (coefficientB / 4) * (
        cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        (coefficientB / 6) * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
      )
    );
    return WGS84_B * coefficientA * (sigma - deltaSigma);
  }

  function greatCircleDistanceM(a, b) {
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const deltaLat = lat2 - lat1;
    const deltaLon = toRad(normalizeLon(b.lon - a.lon));
    const hav = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
    return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(hav)));
  }

  function addScaledState(state, derivativeState, scaleValue) {
    return {
      r: add(state.r, scale(derivativeState.r, scaleValue)),
      v: add(state.v, scale(derivativeState.v, scaleValue)),
    };
  }

  function interpolateState(a, b, fraction) {
    return {
      r: add(a.r, scale(subtract(b.r, a.r), fraction)),
      v: add(a.v, scale(subtract(b.v, a.v), fraction)),
    };
  }

  function cloneState(state) {
    return { r: { ...state.r }, v: { ...state.v } };
  }

  function isFiniteState(state) {
    return [state.r.x, state.r.y, state.r.z, state.v.x, state.v.y, state.v.z].every(Number.isFinite);
  }

  function vector(x, y, z) {
    return { x, y, z };
  }

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function scale(v, scalar) {
    return { x: v.x * scalar, y: v.y * scalar, z: v.z * scalar };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  }

  function magnitude(v) {
    return Math.hypot(v.x, v.y, v.z);
  }

  function normalizeVector(v) {
    const length = magnitude(v);
    return length > 1e-15 ? scale(v, 1 / length) : vector(0, 0, 0);
  }

  function rotateZ(v, angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return { x: cosine * v.x - sine * v.y, y: sine * v.x + cosine * v.y, z: v.z };
  }

  function normalizeLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  function normalizeBearing(bearing) {
    return ((bearing % 360) + 360) % 360;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toRad(value) {
    return (value * Math.PI) / 180;
  }

  function toDeg(value) {
    return (value * 180) / Math.PI;
  }

  return {
    constants: {
      WGS84_A,
      WGS84_B,
      WGS84_F,
      EARTH_MU,
      EARTH_J2,
      EARTH_J3,
      EARTH_J4,
      EARTH_ROTATION_RAD_S,
      EARTH_GEOPOTENTIAL_RADIUS_M,
    },
    propagateStage,
    maximizeGroundRange,
    geodeticToEcef,
    ecefToGeodetic,
    atmosphericDensity,
    ellipsoidDistanceM,
    orbitalElementsFromState,
  };
});
