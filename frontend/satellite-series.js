(function initSatelliteSeries(root, factory) {
  const identities = root.NotamSatelliteIdentities || (
    typeof module === "object" && module.exports
      ? require("./satellite-identities.js")
      : null
  );
  const api = factory(identities);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatelliteSeries = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function buildSatelliteSeries(SATELLITE_IDENTITIES) {
  "use strict";

  // Public catalog identities traceable to announced NRO launches; classified
  // payloads without an official identity remain in the separate USA group.
  const nroPublicNoradIds = new Set([
    "23893", "25019", "26575", "27691", "27875",
    "39232", "43941", "48247", "48846", "48847", "48848",
    "51445", "52259", "53883", "63350", "66992",
  ]);
  const gssapPublicNoradIds = new Set(["40099", "40100", "41744", "41745", "51445", "51446"]);

  const seriesInfo = Object.freeze({
    PWSA: {
      label: "PWSA / SDA",
      country: "美国",
      purpose: "战役战术数据传输、导弹预警与跟踪",
      aliases: ["PWSA", "SDA", "扩散型作战人员空间架构", "TRANSPORT LAYER", "TRACKING LAYER"],
      sourceUrl: "https://www.sda.mil/on-orbit/",
    },
    US_MISSILE_WARNING: {
      label: "美国红外预警",
      country: "美国",
      purpose: "导弹预警、导弹跟踪与战场态势感知",
      aliases: ["SBIRS", "DSP", "WFOV", "HBTSS", "OPIR", "红外预警"],
      sourceUrl: "https://www.spaceforce.mil/About-Us/Fact-Sheets/Fact-Sheet-Display/Article/2197746/space-based-infrared-system/",
    },
    US_SPACE_AWARENESS: {
      label: "美国空间态势感知",
      country: "美国",
      purpose: "空间目标监视、跟踪与特征识别",
      aliases: ["SBSS", "GSSAP", "SILENTBARKER", "空间态势感知", "SPACE DOMAIN AWARENESS"],
      sourceUrl: "https://www.spaceforce.mil/About-Us/Fact-Sheets/Fact-Sheet-Display/Article/2197772/geosynchronous-space-situational-awareness-program/",
    },
    US_MIL_WEATHER: {
      label: "美国军用气象",
      country: "美国",
      purpose: "全球军事气象与空间天气保障",
      aliases: ["DMSP", "WSF-M", "军用气象"],
      sourceUrl: "https://www.spaceforce.mil/About-Us/Fact-Sheets/Fact-Sheet-Display/Article/2197779/defense-meteorological-satellite-program/",
    },
    US_TACTICAL_EXPERIMENTS: {
      label: "美国战术空间试验",
      country: "美国",
      purpose: "战术通信、光链路、导航与作战体系验证",
      aliases: ["BLACKJACK", "MANDRAKE", "LINCS", "NTS-3", "战术空间试验"],
      sourceUrl: "https://www.sda.mil/on-orbit/",
    },
    TIANLIAN: {
      label: "天链数据中继",
      country: "中国",
      purpose: "航天器数据中继、测控与天地传输",
      aliases: ["天链", "TIANLIAN", "数据中继卫星"],
      sourceUrl: "https://www.cnsa.gov.cn/n6758823/n6758838/c6805779/content.html",
    },
    RASSVET_1440: {
      label: "Bureau 1440 黎明",
      country: "俄罗斯",
      purpose: "低轨宽带通信与星间激光链路",
      aliases: ["RASSVET", "РАССВЕТ", "黎明", "BUREAU 1440", "俄罗斯星链"],
      sourceUrl: "https://1440.space/en/",
    },
    NRO_PUBLIC: {
      label: "NRO 公开可归属",
      country: "美国",
      purpose: "成像、信号情报、海洋监视与扩散型侦察任务",
      aliases: ["NRO", "NROL", "CRYSTAL", "KH-11", "FIA RADAR", "NOSS", "INTRUDER", "MENTOR", "STARSHIELD"],
      sourceUrl: "https://www.nro.gov/launch/",
    },
    PLANET: {
      label: "Planet",
      country: "美国",
      purpose: "143 颗物理在轨遥感卫星；141 颗有公开 NORAD 可绘制，2 颗仅有 GCAT 分析对象号",
      aliases: ["PLANET", "PLANETSCOPE", "SUPERDOVE", "SKYSAT", "PELICAN", "TANAGER"],
      sourceUrl: "/data/reference/planet-remote-sensing-2026-08-28.json",
    },
    UNCLASSIFIED: {
      label: "未归入现有系列",
      country: "待核实",
      purpose: "已获得轨道，但公开名称和载荷资料不足以高置信归入现有系列",
      aliases: ["UNCLASSIFIED", "未归类", "待核实"],
      sourceUrl: "https://celestrak.org/satcat/search.php",
    },
  });

  const definitions = [
    ["STARLINK", /STARLINK/, /STARLINK/],
    ["ONEWEB", /ONEWEB/, /ONEWEB/],
    ["AMAZON_LEO", /(?:KUIPER|AMAZON LEO)/, /AMAZON LEO/],
    ["GUOWANG", /(?:GUOWANG|HULIANWANG|HULIANWAN|GAOGUI|DIGUI)/, /(?:GUOWANG|星网)/],
    ["QIANFAN", /QIANFAN/, /QIANFAN/],
    ["IRIDIUM", /^IRIDIUM(?: NEXT)? \d+/, /IRIDIUM/],
    ["INMARSAT", /^(?:INMARSAT|ALPHASAT)(?:\s|$)/, /INMARSAT/],
    ["GLOBALSTAR", /^GLOBALSTAR(?:\s|$)/, /GLOBALSTAR/],
    ["ORBCOMM", /^(?:ORBCOMM|VESSELSAT)(?:\s|$)/, /ORBCOMM/],
    ["INTELSAT", /^(?:INTELSAT|GALAXY \d|HORIZONS-)/, /INTELSAT/],
    ["ECHOSTAR", /^(?:ECHOSTAR|SPACEWAY|JUPITER 3 \(ECHOSTAR|SES-11 \(ECHOSTAR)/, /ECHOSTAR/],
    ["VIASAT", /^VIASAT-/, /VIASAT/],
    ["SES_O3B", /^(?:O3B |SES-\d|ASTRA |AMC-\d)/, /(?:SES|O3B)/],
    ["SIRIUSXM", /^(?:SXM-|XM-\d|SIRIUS[- ])/, /SIRIUSXM/],
    ["DIRECTV", /^DIRECTV(?:\s|$)/, /DIRECTV/],
    ["TDRS", /^TDRS(?:\s|$)/, /TDRS/],
    ["AST_SPACEMOBILE", /^BLUEWALKER-/, /AST SPACEMOBILE/],
    ["LYNK", /^LYNK TOWER/, /LYNK/],
    ["US_MSS_LEGACY", /^(?:SKYTERRA|MSAT M|ICO G1|TERRESTAR-1)/, null],
    ["GPS", /^(?:NAVSTAR |GPS (?:BIIR|BIIF|III))/, null],
    ["GLONASS", /(?:\[GLONASS-(?:M|K|K1|K2)\]|^GLONASS)/, null],
    ["BEIDOU", /^BEIDOU-/, null],
    ["GALILEO", /(?:GALILEO|^GSAT\d+)/, null],
    ["JILIN", null, null],
    ["SENTINEL", /SENTINEL/, /^SENTINEL/],
    ["TJS", /(?:\b(?:TJS|TONGXIN JISHU SHIYAN)(?:-|\s|$)|^SHIYAN-10 (?:01|02)\b)/, null],
    ["TIANLIAN", /^TIANLIAN(?:-|\s)/, null],
    ["CHINASAT", /\b(?:CHINASAT|ZHONGXING)(?:-|\s)/, null],
    ["YAOGAN", /\bYAOGAN(?:-|\s)/, null],
    ["GAOFEN", /\bGAOFEN(?:-|\s)/, null],
    ["ZIYUAN", /\b(?:ZIYUAN|CBERS)(?:-|\s)/, null],
    ["FENGYUN", /\bFENGYUN(?:-|\s)/, null],
    ["TIANHUI", /\bTIANHUI(?:-|\s)/, null],
    ["CHINA_OCEAN_ENV", /^(?:HAIYANG|HY-|HJ-|HJS |CFOSAT)/, null],
    ["CHINA_COMMERCIAL_RS", /^(?:SUPERVIEW|PIESAT|LKW |TAIJING|NINGXIA|ZHUHAI|LUOJIA|SDGSAT)/, null],
    ["RESURS", /\bRESURS(?:-|\s)/, null],
    ["KANOPUS", /\bKANOPUS(?:-|\s)/, null],
    ["KONDOR", /\bKONDOR(?:-|\s)/, null],
    ["METEOR", /\bMETEOR(?:-|\s)/, null],
    ["ELEKTRO_ARKTIKA", /^(?:ELEKTRO-L|ARKTIKA-M)/, null],
    ["GONETS", /\bGONETS(?:-|\s)/, null],
    ["LUCH", /\bLUCH(?:-|\s)/, null],
    ["EXPRESS", /\bEXPRESS(?:-|\s)/, null],
    ["YAMAL", /\bYAMAL(?:-|\s)/, null],
    ["MERIDIAN", /^MERIDIAN/, null],
    ["EKS", /^COSMOS \d+ \(EKS \d+\)/, null],
    ["RODNIK", /^COSMOS \d+ \(RODNIK-S \d+\)/, null],
    ["RUSSIAN_MILITARY_COMMS", /^(?:BLAGOVEST|RADUGA|MOLNIYA|GORIZONT)/, null],
    ["RASSVET_1440", /^RASSVET(?:-|\s)/, null],
    ["RUSSIAN_SMALLSAT", /^(?:SITRO|AIST|GEOSCAN|ZORKIY|IONOSFERA|HORS|SKIF)/, null],
    ["RUSSIAN_COSMOS", /^COSMOS \d+/, null],
    ["PWSA", /^(?:(?:PRAETORIAN\s+)?SDA[_ -]\d+|T1DES(?:\s|$)|PWSA(?:\s|$))/, /(?:PWSA|SDA TRANSPORT|SDA TRACKING)/],
    ["US_MISSILE_WARNING", /(?:\bSBIRS\b|\bHBTSS\b|\bWFOV\b|\bNEXT[- ]?GEN(?:ERATION)? OPIR\b|\bNG[- ]?OPIR\b|\(DSP \d+\)|^OPS \d+ \(DSP \d+\))/, null],
    ["US_SPACE_AWARENESS", /(?:\bSBSS\b|\bGSSAP\b|SILENTBARKER)/, null],
    ["US_MIL_WEATHER", /^(?:DMSP\b|WSF-M\b|WEATHER SYSTEM FOLLOW-ON)/, null],
    ["US_TACTICAL_EXPERIMENTS", /^(?:BLACKJACK ACES-|MANDRAKE\s|LINCS\s|NTS-3$)/, null],
    ["WGS", /^WGS(?:\s|$)/, /WGS/],
    ["AEHF", /^AEHF-/, /AEHF/],
    ["MILSTAR", /MILSTAR/, /MILSTAR/],
    ["DSCS", /\bDSCS\b/, /DSCS/],
    ["MUOS", /^MUOS-/, /MUOS/],
    ["UFO", /^UFO \d/, /UHF FOLLOW-ON/],
    ["FLTSATCOM", /FLTSATCOM/, /FLTSATCOM/],
    ["US_TACSAT", /\bTACSAT(?:\s|$)/, /TACSAT/],
    ["NRO_PUBLIC", /(?:\bNROL[- ]?\d+\b|SILENTBARKER|\bNOSS\b|\bMENTOR\b|ADVANCED ORION|\bORION\b|KH-11|\bCRYSTAL\b|\bTOPAZ\b|FIA RADAR|\bTRUMPET\b|\bINTRUDER\b|\bSTARSH(?:IELD)?\b)/, null],
    ["US_CLASSIFIED", /^USA \d+(?:\s|$)/, null],
    ["LANDSAT", /\bLANDSAT(?:-|\s)/, null],
    ["COSMO_SKYMED", /\b(?:COSMO-SKYMED|CSG-)/, null],
    ["RADARSAT", /\b(?:RADARSAT|RCM-)/, null],
    ["PLEIADES", /\bPLEIADES(?:-|\s)/, null],
    ["KOMPSAT", /\bKOMPSAT(?:-|\s)/, null],
    ["PLANET", null, null],
    ["VANTOR", /^(?:WORLDVIEW-|GEOEYE |LEGION )/, null],
    ["BLACKSKY", /^GLOBAL-/, null],
    ["ICEYE", /^ICEYE-X/, null],
    ["CAPELLA", /^CAPELLA-/, null],
    ["UMBRA", /^UMBRA-/, null],
    ["SATELLOGIC", /^NUSAT-/, null],
    ["SYNSPECTIVE", /^STRIX-/, null],
    ["IQPS", /^QPS-SAR-/, null],
    ["PIXXEL", /^FIREFLY-/, null],
    ["AXELSPACE", /^GRUS-/, null],
  ];

  function classifyExplicit(item, profile) {
    const name = String(item?.name || "").toUpperCase();
    const constellation = String(profile?.constellation || "").toUpperCase();
    const noradId = String(item?.noradId || item?.id || "");
    const curatedIdentity = SATELLITE_IDENTITIES?.resolve?.(item);
    if (curatedIdentity?.seriesKey) return curatedIdentity.seriesKey;
    if (nroPublicNoradIds.has(noradId)) return "NRO_PUBLIC";
    if (gssapPublicNoradIds.has(noradId)) return "US_SPACE_AWARENESS";
    for (const [key, namePattern, constellationPattern] of definitions) {
      if (namePattern?.test(name) || constellationPattern?.test(constellation)) return key;
    }
    return "";
  }

  function countryFallback(item) {
    const owner = String(item?.owner || "").toUpperCase();
    if (["CIS", "RU", "RUS"].includes(owner)) return "RUSSIA_OTHER";
    if (["PRC", "CN", "CHN"].includes(owner)) return "CHINA_OTHER";
    return "";
  }

  function classify(item, profile) {
    return classifyExplicit(item, profile) || countryFallback(item);
  }

  function launchFamilyId(item) {
    const designator = String(item?.internationalDesignator || item?.OBJECT_ID || item?.omm?.OBJECT_ID || "").trim().toUpperCase();
    const match = designator.match(/^(\d{4})[- ]?(\d{3})/);
    return match ? `${match[1]}-${match[2]}` : "";
  }

  function classifyCatalog(items, resolveProfile = () => null) {
    const payloads = (items || []).filter((item) => item && String(item.id || item.noradId || ""));
    const resolved = new Map();
    const launchGroups = new Map();
    for (const item of payloads) {
      const id = String(item.id || item.noradId);
      const explicitKey = classifyExplicit(item, resolveProfile(item));
      if (explicitKey) resolved.set(id, { key: explicitKey, method: "名称、载荷或校核目录明确匹配", confidence: 1 });
      const launchId = launchFamilyId(item);
      if (launchId) {
        if (!launchGroups.has(launchId)) launchGroups.set(launchId, []);
        launchGroups.get(launchId).push({ item, id, explicitKey });
      }
    }

    // Only dedicated mass-deployment constellations may inherit a launch-family
    // classification. Rideshare launches remain unclassified rather than being
    // forced into whichever named payload happens to be most numerous.
    const dedicatedLaunchSeries = new Set(["STARLINK", "ONEWEB", "AMAZON_LEO", "GUOWANG", "QIANFAN", "RASSVET_1440"]);
    for (const group of launchGroups.values()) {
      const explicit = group.filter((entry) => entry.explicitKey && dedicatedLaunchSeries.has(entry.explicitKey));
      const keys = new Set(explicit.map((entry) => entry.explicitKey));
      if (keys.size !== 1 || explicit.length < 3 || explicit.length / group.length < 0.8) continue;
      const key = [...keys][0];
      for (const entry of group) {
        if (!resolved.has(entry.id)) resolved.set(entry.id, { key, method: "同一专属发射批次高置信匹配", confidence: 0.92 });
      }
    }

    for (const item of payloads) {
      const id = String(item.id || item.noradId);
      if (resolved.has(id)) continue;
      const fallback = countryFallback(item);
      resolved.set(id, fallback
        ? { key: fallback, method: "国家目录兜底", confidence: 0.45 }
        : { key: "UNCLASSIFIED", method: "资料不足，保留为未归类", confidence: 0 });
    }
    return resolved;
  }

  return {
    definitions: [...definitions.map(([key]) => key), "RUSSIA_OTHER", "CHINA_OTHER", "UNCLASSIFIED"],
    classify,
    classifyCatalog,
    describe(key) {
      const info = seriesInfo[String(key || "")];
      return info ? { ...info, aliases: [...info.aliases] } : null;
    },
  };
});
