import { parentPort } from "node:worker_threads";
import { createRequire } from "node:module";
import nrlmsiseModule from "nrlmsise-00";

const require = createRequire(import.meta.url);
const BALLISTIC_ENGINE = require("./frontend/ballistics.js");
let nrlmsiseRuntimePromise = null;

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function normalizeEnvironment(value = {}) {
  const parsedEpoch = Date.parse(value.epochUtc || "");
  return {
    epochMs: Number.isFinite(parsedEpoch) ? parsedEpoch : Date.now(),
    f107Daily: clampNumber(value.f107Daily, 150, 50, 400),
    f107Average: clampNumber(value.f107Average, 150, 50, 400),
    ap: clampNumber(value.ap, 4, 0, 400),
  };
}

async function propagate(input = {}, workerIndex = 0) {
  const startedAt = performance.now();
  const environment = normalizeEnvironment(input.environment);
  const atmosphereModel = input.options?.atmosphereModel === "standard1976" ? "standard1976" : "nrlmsise00";
  if (atmosphereModel === "standard1976" || input.options?.dragEnabled === false) {
    const result = BALLISTIC_ENGINE.propagateStage({
      ...(input.options || {}),
      atmosphereModel: "standard1976",
      densityProvider: null,
    });
    return {
      result,
      environment: {
        model: input.options?.dragEnabled === false ? "disabled" : "1976 Standard Atmosphere",
        epochUtc: new Date(environment.epochMs).toISOString(),
        f107Daily: environment.f107Daily,
        f107Average: environment.f107Average,
        ap: environment.ap,
        evaluationCount: 0,
        workerIndex,
        computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
      },
    };
  }
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
      ...(input.options || {}),
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
        workerIndex,
        computeMs: Math.round((performance.now() - startedAt) * 10) / 10,
      },
    };
  } finally {
    model.delete();
  }
}

parentPort.on("message", async ({ id, input, workerIndex }) => {
  try {
    parentPort.postMessage({ id, ok: true, payload: await propagate(input, workerIndex) });
  } catch (error) {
    parentPort.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
