(function attachSatelliteIdentities(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatelliteIdentities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSatelliteIdentities() {
  "use strict";

  const SOURCE = Object.freeze({
    label: "GCAT 吉林一号逐次发射与在轨状态目录",
    url: "https://planet4589.org/space/con/jil/table.ppf",
    verifiedAt: "2026-08-28",
  });

  const PLANET_SOURCE = Object.freeze({
    label: "Planet 在轨遥感卫星全量 NORAD 核查（2026-08-28）",
    url: "/data/reference/planet-remote-sensing-2026-08-28.json",
    verifiedAt: "2026-08-28",
  });

  // Membership is keyed by NORAD identity because public names frequently stay
  // as OBJECT letters, COSPAR designators, or customer mission names for years.
  const JILIN_LAUNCHES = Object.freeze([
    launch("2015-057", "2015-10-07", ["40958", "40959", "40960", "40961"]),
    launch("2017-002", "2017-01-09", ["41914"]),
    launch("2017-074", "2017-11-21", ["43022", "43023", "43024"]),
    launch("2018-008", "2018-01-19", ["43159", "43160"]),
    launch("2019-005", "2019-01-21", ["43943", "43946"]),
    launch("2019-075", "2019-11-13", ["44777"]),
    launch("2019-086", "2019-12-07", ["44836"]),
    launch("2020-003", "2020-01-15", ["45016"]),
    launch("2020-065", "2020-09-15", ["46457", "46458", "46459", "46460"]),
    launch("2021-061", "2021-07-03", ["49003"]),
    launch("2021-086", "2021-09-27", ["49256"]),
    launch("2021-097", "2021-10-27", ["49338"]),
    launch("2022-048", "2022-05-05", ["52443", "52444", "52446"]),
    launch("2022-098", "2022-08-10", ["53444", "53445", "53446", "53448", "53452", "53453"]),
    launch("2022-155", "2022-11-16", ["54251", "54252", "54253", "54255"]),
    launch("2022-167", "2022-12-09", ["54685", "54686", "54689", "54690", "54692", "54694", "54695"]),
    launch("2023-085", "2023-06-15", ["57004", "57012", "57014", "57023", "57026", "57031", "57036", "57037", "57038", "57044"]),
    launch("2023-127", "2023-08-25", ["57696"]),
    launch("2024-169", "2024-09-20", ["61189", "61190", "61191", "61192", "61193", "61194"]),
    launch("2024-174", "2024-09-24", ["61240"]),
    launch("2024-205", "2024-11-11", ["61897", "61905"]),
    launch("2025-226", "2025-10-11", ["65938"]),
    launch("2025-292", "2025-12-10", ["66993", "66995", "66996"]),
    launch("2026-080", "2026-04-14", ["68691", "68692", "68693", "68694", "68695", "68696", "68697", "68698"]),
    launch("2026-106", "2026-05-15", ["69099"]),
    launch("2026-134", "2026-06-15", ["69538", "69539", "69540", "69541", "69542", "69543", "69544", "69545"]),
  ]);

  // The uploaded audit separates physical presence from operational status.
  // Only the 141 records with public NORAD identities can be propagated. The
  // two analyst objects remain catalog metadata and never receive invented GP.
  const PLANET_GROUPS = Object.freeze([
    identityGroup("SkySat", "SKYSAT", ["39418", "40072", "41601", "41771", "41772", "41773", "41774", "42987", "42988", "42989", "42990", "42991", "42992", "43797"]),
    identityGroup("Dove early test", "DOVE_EARLY", ["39429"]),
    identityGroup("PlanetScope / Flock 4Q", "PLANETSCOPE", ["58271", "58273", "58274", "58280", "58282", "58284", "58285", "58286", "58304", "58306", "58308", "58309", "58318", "58320", "58322", "58327", "58328"]),
    identityGroup("Pelican", "PELICAN", ["58296", "62631", "65315", "65316", "66667", "66703", "69017", "69019", "69871"]),
    identityGroup("PlanetScope / Flock 4BE", "PLANETSCOPE", ["60480", "60481", "60484", "60486", "60487", "60488", "60489", "60490", "60491", "60492", "60494", "60495", "60497", "60499", "60501", "60505", "60509", "60511", "60512", "60513", "60514", "60516", "60517", "60518", "60519", "60558", "60559", "60561", "60563"]),
    identityGroup("Tanager", "TANAGER", ["60507"]),
    identityGroup("PlanetScope / Flock 4G", "PLANETSCOPE", ["62613", "62621", "62622", "62624", "62625", "62629", "62633", "62634", "62636", "62637", "62638", "62639", "62641", "62642", "62645", "62646", "62647", "62650", "62651", "62652", "62659", "62660", "62661", "62663", "62666", "62667", "62670", "62675", "62678", "62679", "62680", "62681", "62683", "62685"]),
    identityGroup("PlanetScope / Flock 4H", "PLANETSCOPE", ["66704", "66705", "66706", "66707", "66708", "66709", "66710", "66711", "66712", "66713", "66714", "66715", "66716", "66717", "66718", "66719", "66720", "66721", "66722", "66723", "66724", "66725", "66726", "66727", "66728", "66729", "66730", "66731", "66732", "66733", "66734", "66735", "66736", "66737", "66738", "66739"]),
  ]);

  const PLANET_PLATFORM_SPECS = Object.freeze({
    SKYSAT: Object.freeze({
      swathWidthKm: 5.73,
      sceneLengthKm: 2.5,
      resolution: "正射产品 0.50 m；全色 + 4 波段多光谱",
      sourceKey: "planetSkySatAudit",
    }),
    PLANETSCOPE: Object.freeze({
      swathWidthKm: 32.5,
      sceneLengthKm: 19.6,
      resolution: "原生地面采样约 3.7-4.2 m；标准正射产品重采样 3 m",
      sourceKey: "planetScopeAudit",
    }),
    PELICAN: Object.freeze({
      swathWidthKm: 8,
      displayDurationSec: 3,
      resolution: "Gen 1 正射产品 0.50 m；后续 Gen 2 规划 0.30 m",
      sourceKey: "planetPelicanAudit",
    }),
    TANAGER: Object.freeze({
      swathWidthKm: 18,
      displayDurationSec: 4,
      resolution: "约 30 m 高光谱地面采样；约 426 波段",
      sourceKey: "planetTanagerAudit",
    }),
  });

  const PLANET_ANALYST_OBJECTS = Object.freeze([
    Object.freeze({ name: "DOVE-4", analystId: "A08222", platformSeries: "Dove early test", operationalState: "inactive" }),
    Object.freeze({ name: "FLOCK 4G-19", analystId: "A11643", platformSeries: "PlanetScope / Flock 4G", operationalState: "inactive" }),
  ]);

  const JILIN_CANONICAL_NAMES = Object.freeze({
    "40958": "JILIN-1 LINGQIAO YANZHENG (LQSAT)",
    "40959": "JILIN-1 SHIPIN 1",
    "40960": "JILIN-1 SHIPIN 2",
    "53446": "JILIN-1 HENAN-1",
    "57004": "JILIN-1 GAOFEN 03D 19",
    "57012": "JILIN-1 GAOFEN 06A 01",
    "57014": "JILIN-1 GAOFEN 06A 03",
    "57023": "JILIN-1 GAOFEN 06A 12",
    "57026": "JILIN-1 GAOFEN 06A 15",
    "57031": "JILIN-1 GAOFEN 06A 20",
    "57036": "JILIN-1 GAOFEN 06A 25",
    "57037": "JILIN-1 GAOFEN 06A 26",
    "57038": "JILIN-1 GAOFEN 06A 27",
    "57044": "JILIN-1 HUOERGUOSI-1",
    "61240": "JILIN-1 SAR-01A",
    "61897": "JILIN-1 GAOFEN 05B",
    "61905": "JILIN-1 TIANZHI-2C",
    "65938": "JILIN-1 JIXING KUANFU-02B 07",
    "66993": "JILIN-1 GAOFEN 07B 01",
    "66995": "JILIN-1 GAOFEN 07C 01",
    "66996": "JILIN-1 GAOFEN 07D 01",
    "69099": "JILIN-1 GAOFEN 03D 55",
    "69538": "JILIN-1 GAOFEN 07C 04",
    "69539": "JILIN-1 WENWU 01",
    "69540": "JILIN-1 CAIYUN GUANGXE 01",
    "69541": "JILIN-1 ANTIE 03",
    "69542": "JILIN-1 LICHUANHONG",
    "69543": "JILIN-1 GAOFEN 07D 02",
    "69544": "JILIN-1 GAOFEN 07D 03",
    "69545": "JILIN-1 GAOFEN 07D 04",
  });

  // GCAT identifies 40959 as failed around 2020 while 40958 remains working.
  // Current public GP/SATCAT feeds have these two states reversed.
  const STATUS_OVERRIDES = Object.freeze({
    "40958": Object.freeze({
      operationalState: "active",
      operationalStatusCode: "+",
      operationalStatusLabel: "公开源判定运行中（GCAT）",
    }),
    "40959": Object.freeze({
      operationalState: "inactive",
      operationalStatusCode: "-",
      operationalStatusLabel: "公开源判定约 2020 年失效，仍在轨（GCAT）",
    }),
  });

  const records = new Map();
  for (const group of JILIN_LAUNCHES) {
    for (const noradId of group.noradIds) {
      records.set(noradId, Object.freeze({
        noradId,
        seriesKey: "JILIN",
        constellation: "吉林一号",
        launchId: group.launchId,
        launchDate: group.launchDate,
        canonicalName: JILIN_CANONICAL_NAMES[noradId] || "",
        aliases: Object.freeze(["吉林一号", "JILIN-1", JILIN_CANONICAL_NAMES[noradId]].filter(Boolean)),
        source: SOURCE,
        ...(STATUS_OVERRIDES[noradId] || {}),
      }));
    }
  }

  for (const group of PLANET_GROUPS) {
    for (const noradId of group.noradIds) {
      const canonicalName = noradId === "39429" ? "DOVE-3" : "";
      records.set(noradId, Object.freeze({
        noradId,
        seriesKey: "PLANET",
        constellation: "Planet",
        platformSeries: group.platformSeries,
        canonicalName,
        aliases: Object.freeze([
          "Planet",
          "Planet Labs",
          group.platformSeries,
          group.payloadSpecKey === "PLANETSCOPE" ? "PlanetScope" : "",
          group.payloadSpecKey === "PLANETSCOPE" ? "SuperDove" : "",
          canonicalName,
        ].filter(Boolean)),
        source: PLANET_SOURCE,
        payloadSpec: PLANET_PLATFORM_SPECS[group.payloadSpecKey] || null,
      }));
    }
  }

  function launch(launchId, launchDate, noradIds) {
    return Object.freeze({ launchId, launchDate, noradIds: Object.freeze([...noradIds]) });
  }

  function identityGroup(platformSeries, payloadSpecKey, noradIds) {
    return Object.freeze({ platformSeries, payloadSpecKey, noradIds: Object.freeze([...noradIds]) });
  }

  function noradIdentity(input) {
    if (typeof input === "string" || typeof input === "number") return String(input);
    return String(input?.noradId || input?.id || input?.omm?.NORAD_CAT_ID || "");
  }

  function resolve(input) {
    return records.get(noradIdentity(input)) || null;
  }

  function enrich(input) {
    const identity = resolve(input);
    if (!identity || !input || typeof input !== "object") return input;
    const status = STATUS_OVERRIDES[identity.noradId] || null;
    const catalogName = String(input.name || input.objectName || input.omm?.OBJECT_NAME || "").trim();
    const name = identity.canonicalName || catalogName;
    const objectClass = status
      ? status.operationalState === "active" ? "ACTIVE_PAYLOAD" : "RETIRED_PAYLOAD"
      : input.objectClass;
    return {
      ...input,
      name,
      catalogName: catalogName && catalogName !== name ? catalogName : input.catalogName,
      identityAliases: [...new Set([...(input.identityAliases || []), ...identity.aliases, catalogName].filter(Boolean))],
      identitySource: identity.source,
      constellationIdentity: identity.constellation,
      platformSeries: identity.platformSeries || input.platformSeries,
      identityPayloadSpec: identity.payloadSpec ? { ...identity.payloadSpec } : input.identityPayloadSpec,
      launchDate: input.launchDate || identity.launchDate,
      ...(status ? {
        objectClass,
        catalogClass: objectClass,
        operationalState: status.operationalState,
        operationalStatusCode: status.operationalStatusCode,
        operationalStatusLabel: status.operationalStatusLabel,
      } : {}),
    };
  }

  function members(seriesKey) {
    const key = String(seriesKey || "").toUpperCase();
    return [...records.values()].filter((record) => record.seriesKey === key);
  }

  function analystObjects(seriesKey) {
    return String(seriesKey || "").toUpperCase() === "PLANET" ? [...PLANET_ANALYST_OBJECTS] : [];
  }

  function summary(seriesKey) {
    const key = String(seriesKey || "").toUpperCase();
    if (key === "PLANET") {
      return {
        physicalInOrbit: 143,
        publicNorad: 141,
        analystObjectsWithoutPublicNorad: 2,
        operational: 122,
        nonOperationalInOrbit: 21,
      };
    }
    if (key === "JILIN") return { physicalInOrbit: 83, publicNorad: 83, operational: 82, nonOperationalInOrbit: 1 };
    return null;
  }

  return Object.freeze({
    VERSION: "2026-08-28-jilin83-planet143",
    SOURCE,
    PLANET_SOURCE,
    resolve,
    enrich,
    members,
    analystObjects,
    summary,
  });
});
