export const SATELLITE_SGP4_EARTH_RADIUS_KM = 6378.135;

export function satrecRadiusEnvelopeKm(satrec) {
  const perigeeRatio = Number(satrec?.altp);
  const apogeeRatio = Number(satrec?.alta);
  if (![perigeeRatio, apogeeRatio].every(Number.isFinite)) return null;
  const minimumKm = (1 + Math.min(perigeeRatio, apogeeRatio)) * SATELLITE_SGP4_EARTH_RADIUS_KM;
  const maximumKm = (1 + Math.max(perigeeRatio, apogeeRatio)) * SATELLITE_SGP4_EARTH_RADIUS_KM;
  if (!(minimumKm > 0) || !(maximumKm >= minimumKm)) return null;
  const spanKm = maximumKm - minimumKm;
  const marginKm = Math.max(160, maximumKm * 0.04, spanKm * 0.08);
  return {
    minimumKm: Math.max(SATELLITE_SGP4_EARTH_RADIUS_KM * 0.94, minimumKm - marginKm),
    maximumKm: maximumKm + marginKm,
    nominalMinimumKm: minimumKm,
    nominalMaximumKm: maximumKm,
    marginKm,
  };
}

export function positionWithinSatrecEnvelope(position, satrec) {
  if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return false;
  const envelope = satrecRadiusEnvelopeKm(satrec);
  if (!envelope) return true;
  const radiusKm = Math.hypot(position.x, position.y, position.z);
  return radiusKm >= envelope.minimumKm && radiusKm <= envelope.maximumKm;
}
