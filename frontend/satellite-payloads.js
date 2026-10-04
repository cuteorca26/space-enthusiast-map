(function attachSatellitePayloadCatalog(root, factory) {
  const commercialImagingCatalog = root.NotamCommercialImagingCatalog || (
    typeof module === "object" && module.exports
      ? require("./satellite-commercial-imaging-catalog.js")
      : null
  );
  const satelliteIdentities = root.NotamSatelliteIdentities || (
    typeof module === "object" && module.exports
      ? require("./satellite-identities.js")
      : null
  );
  const api = factory(commercialImagingCatalog, satelliteIdentities);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.NotamSatellitePayloads = api;
})(typeof globalThis !== "undefined" ? globalThis : window, function createSatellitePayloadCatalog(COMMERCIAL_IMAGING_CATALOG, SATELLITE_IDENTITIES) {
  "use strict";

  const EARTH_MEAN_RADIUS_KM = 6371.0088;
  const AUDIT_VERSION = "2026-08-28-r8-planet-norad-audit";
  const EXCLUDED_IDENTITIES = new Set([
    "NORAD:68460",
    "COSPAR:2026-067AW",
  ]);

  const SOURCES = Object.freeze({
    sentinel1: {
      label: "ESA Sentinel-1 C-SAR 任务参数",
      url: "https://sentinels.copernicus.eu/documents/247904/349449/S1_SP-1322_1.pdf",
    },
    sentinel2: {
      label: "ESA Sentinel-2 任务事实与幅宽参数",
      url: "https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Facts_and_figures",
    },
    sentinel3: {
      label: "Copernicus Sentinel-3 OLCI Land User Handbook",
      url: "https://sentinels.copernicus.eu/documents/247904/4598066/Sentinel-3-OLCI-Land-Handbook.pdf",
    },
    sentinel5p: {
      label: "Copernicus Sentinel-5P TROPOMI 参数",
      url: "https://sentinels.copernicus.eu/documents/247904/1848259/Sentinel-5P_Data_Access_and_Products",
    },
    sentinel6: {
      label: "EUMETSAT Sentinel-6 Level-2 仪器与足迹说明",
      url: "https://user.eumetsat.int/resources/user-guides/sentinel-6-altimetry-level-2-data-guide",
    },
    jilinProducts: {
      label: "长光卫星吉林一号产品参数",
      url: "https://www.jl1.cn/product_view.aspx?id=4253",
    },
    jilinGf03: {
      label: "长光卫星高分03系列参数",
      url: "https://www.jl1.cn/aboutlb_view.aspx?id=3224",
    },
    jilinLegacy: {
      label: "长光卫星公开型号参数",
      url: "https://www.jl1.cn/news_view.aspx?id=2291",
    },
    planetScope: {
      label: "Planet PlanetScope / SuperDove 产品规格",
      url: "https://docs.planet.com/data/imagery/planetscope/",
    },
    planetSkySat: {
      label: "Planet SkySat 产品规格",
      url: "https://docs.planet.com/data/imagery/skysat/",
    },
    planetPelican: {
      label: "Planet Pelican 产品规格",
      url: "https://docs.planet.com/data/imagery/pelican/",
    },
    planetTanager: {
      label: "Planet Tanager 产品规格",
      url: "https://docs.planet.com/data/imagery/tanager/",
    },
    planetSkySatAudit: {
      label: "Planet 在轨遥感卫星全量 NORAD 核查：SkySat",
      url: "/data/reference/planet-remote-sensing-2026-08-28.json",
    },
    planetScopeAudit: {
      label: "Planet 在轨遥感卫星全量 NORAD 核查：PlanetScope / SuperDove",
      url: "/data/reference/planet-remote-sensing-2026-08-28.json",
    },
    planetPelicanAudit: {
      label: "Planet 在轨遥感卫星全量 NORAD 核查：Pelican",
      url: "/data/reference/planet-remote-sensing-2026-08-28.json",
    },
    planetTanagerAudit: {
      label: "Planet 在轨遥感卫星全量 NORAD 核查：Tanager",
      url: "/data/reference/planet-remote-sensing-2026-08-28.json",
    },
    vantorConstellation: {
      label: "Vantor 在轨成像星座官方参数",
      url: "https://vantor.com/company/constellation/",
    },
    blackSkyGen3: {
      label: "BlackSky Gen-3 官方数据表",
      url: "https://info.blacksky.com/hubfs/Gated-downloads/Blacksky_DataSheet_Gen-3.pdf",
    },
    blackSkyGen2: {
      label: "BlackSky Gen-2 官方任务与景幅参数",
      url: "https://blacksky.com/press-releases/spaceflight-industries-celebrates-successful-launch-of-the-blacksky-pathfinder-satellite-aboard-indias-pslv-2/",
    },
    iceye: {
      label: "ICEYE SAR Data Product Specification 6",
      url: "https://sar.iceye.com/6.0.5/productspecification/introduction/",
    },
    capella: {
      label: "Capella SAR Imagery Products Guide",
      url: "https://support.capellaspace.com/sar-imagery-products-guide",
    },
    umbra: {
      label: "Umbra Canopy Scan Tasking 官方参数",
      url: "https://docs.canopy.umbra.space/docs/scan-tasking",
    },
    satellogicMark4: {
      label: "Satellogic Mark-IV / Mark-V 多光谱载荷规格",
      url: "https://developers.satellogic.com/data/payload-specs/multispectral.html",
    },
    satellogicMark5: {
      label: "Satellogic NewSat Mark-V 官方数据表",
      url: "https://satellogic.com/wp-content/uploads/2024/05/Space-Systems-Mark-V-May-2024.pdf",
    },
    satellogicGenerations: {
      label: "Satellogic 逐星平台代次表与在轨星座清单",
      url: "https://investors.satellogic.com/static-files/49fcc126-da77-43ca-b32e-67f372f12900",
    },
    synspective: {
      label: "Synspective StriX SAR Data Product Guide",
      url: "https://synspective.com/wp-content/uploads/2026/02/SAR-Data-Product-Guide_EN_v16.0_general_users.pdf",
    },
    iqps: {
      label: "iQPS QPS-SAR 产品规格",
      url: "https://i-qps.net/en/product/",
    },
    pixxel: {
      label: "Pixxel Firefly 星座规格",
      url: "https://support.pixxel.space/hc/en-us/sections/18372617641500-Satellite-Constellations",
    },
    axelGrus1: {
      label: "Axelspace GRUS-1 官方任务参数",
      url: "https://www.axelspace.com/news/press_20150916/",
    },
    axelGrus3: {
      label: "Axelspace GRUS-3 官方任务参数",
      url: "https://www.axelspace.com/assets/pdf/missions/grus-3_en.pdf",
    },
    landsat: {
      label: "USGS Landsat 8/9 WRS-2 景幅参数",
      url: "https://data.usgs.gov/datacatalog/data/USGS%3A6837862ed4be025379182951",
    },
    modis: {
      label: "NASA MODIS 仪器参数",
      url: "https://modis.gsfc.nasa.gov/data/",
    },
    viirs: {
      label: "NASA VIIRS/MODIS 对比参数",
      url: "https://ladsweb.modaps.eosdis.nasa.gov/learn/modis-to-viirs-transition",
    },
    airbusOptical: {
      label: "Airbus 光学卫星星座官方幅宽参数",
      url: "https://space-solutions.airbus.com/expert-answers/revolutionizing-mapping/",
    },
    terraSarX: {
      label: "DLR TerraSAR-X 官方成像模式参数",
      url: "https://www.dlr.de/en/research-and-transfer/projects-and-missions/terrasar-x/synthetic-aperture-radar-sar",
    },
    radarsat: {
      label: "加拿大航天局 RADARSAT 模式对照表",
      url: "https://www.asc-csa.gc.ca/eng/satellites/radarsat/technical-features/radarsat-comparison.asp",
    },
    cosmoSkymed: {
      label: "意大利航天局 COSMO-SkyMed 系统手册",
      url: "https://www.asi.it/wp-content/uploads/2019/07/cosmo-skymed_mission_and_products_description_update_2_1.pdf",
    },
    cosmoSkymed2: {
      label: "意大利航天局 COSMO-SkyMed Second Generation 产品说明",
      url: "https://www.asi.it/wp-content/uploads/2021/02/CSG-Mission-and-Products-Description_issue-A-2.pdf",
    },
    alos2: {
      label: "JAXA ALOS-2 PALSAR-2 官方任务参数",
      url: "https://www.eorc.jaxa.jp/ALOS/en/ra/ra6/alos2_ra6_150729.pdf",
    },
    alos4: {
      label: "JAXA ALOS-4 PALSAR-3 官方观测模式",
      url: "https://www.eorc.jaxa.jp/ALOS/en/alos-4/map/asc/pal3_asc_e.htm",
    },
    nisar: {
      label: "NASA/JPL NISAR 任务参数",
      url: "https://nisar.jpl.nasa.gov/mission/mission-concept/",
    },
    enmap: {
      label: "EnMAP 官方任务参数",
      url: "https://www.enmap.org/mission/spacesegment/",
    },
    prisma: {
      label: "意大利航天局 PRISMA 官方任务参数",
      url: "https://www.asi.it/wp-content/uploads/2025/06/Sacco_ASI_PRISMA.pdf",
    },
    cartosat3: {
      label: "ISRO Cartosat-3 载荷参数",
      url: "https://www.isro.gov.in/media_isro/pdf/Publications/Payloads.pdf",
    },
    formosat5: {
      label: "WMO OSCAR FORMOSAT-5 RSI 参数",
      url: "https://space.oscar.wmo.int/instruments/view/rsi_formosat_5",
    },
    saocom: {
      label: "CONAE SAOCOM-1 SAR Level-1 产品参数",
      url: "https://catalogos.conae.gov.ar/catalogo/docs/SAOCOM/SAOCOM-1_SAR_Level-1_Product-Format_13Jan2020.pdf",
    },
    resursP: {
      label: "俄罗斯国家地球监测中心 Resurs-P 4/5 载荷参数",
      url: "https://ntsomz.ru/ka_resurs_p_4_5/",
    },
    russianEoHandbook: {
      label: "俄罗斯国家地球监测中心卫星与产品手册",
      url: "https://bbp.ntsomz.ru/assets-landing/BBP_Handbook_20210414.pdf",
    },
    gaofen1: {
      label: "中国国家航天局高分一号载荷参数",
      url: "https://www.cnsa.gov.cn/n6758824/n6759009/n6759041/n6759071/c6796014/content.html",
    },
    gaofen2: {
      label: "中国国家航天局高分二号载荷参数",
      url: "https://www.cnsa.gov.cn/n6758824/n6759009/n6759041/n6759071/c6795974/content.html",
    },
    haiyang1: {
      label: "中国国家航天局海洋一号 C/D 载荷参数",
      url: "https://www.cnsa.gov.cn/n6758823/n6758838/c6809664/content.html",
    },
    fengyun3: {
      label: "国家卫星气象中心风云三号成像仪参数",
      url: "https://sac347.nsmc.org.cn/nsmc/cn/satellite/FY3H.html",
    },
    commercialImagingCatalog: {
      label: "全球在轨在役商业遥感卫星全量清单逐星核验修订版 2026-08-26",
      url: "/data/reference/commercial-imaging-satellites-2026-08-26.txt",
    },
    starlink: {
      label: "FCC Starlink 用户终端最低仰角条件",
      url: "https://docs.fcc.gov/public/attachments/DA-24-1160A1_Rcd.pdf",
    },
    oneweb: {
      label: "FCC OneWeb 最低仰角分析参数",
      url: "https://docs.fcc.gov/public/attachments/fcc-21-48a1.pdf",
    },
    amazonLeo: {
      label: "FCC Amazon Leo 最低地面站仰角分析",
      url: "https://docs.fcc.gov/public/attachments/FCC-26-26A1.pdf",
    },
    ituGeometry: {
      label: "ITU 非静止轨道网络参数说明",
      url: "https://www.itu.int/epfdsupport/required-data/",
    },
    phasedArrayEstimate: {
      label: "中科院巨型星座 Q/V 星载相控阵指标（扫描范围不小于 +/-45°）",
      url: "https://www.hf.cas.cn/lmjx/glbm/kyghc/kyc_kyghc/tzgg/202411/W020210512324991449215.pdf",
    },
    qianfanMission: {
      label: "工信部千帆星座组网与 Ku/Q/V 频段说明",
      url: "https://www.miit.gov.cn/jgsj/wgj/gzdt/art/2026/art_c4c24554eb114493ba05c0abf0e6100c.html",
    },
    bureau1440: {
      label: "Bureau 1440 黎明低轨宽带星座官方参数",
      url: "https://1440.space/en/",
    },
    guowangFilings: {
      label: "ITU GW-A59 / GW-2 非静止轨道网络申报记录",
      url: "https://www.itu.int/net/ITU-R/space/snl/bresult/radvance.asp?norder=ntwk_org&sel_satname=GW-A59",
    },
    ituSatelliteHandbook: {
      label: "ITU 卫星通信手册（GSO 典型最低仰角 5°-10°）",
      url: "https://www.itu.int/dms_pub/itu-r/opb/hdb/R-HDB-42-2002-PDF-E.pdf",
    },
    chinaSatnetHighOrbit: {
      label: "国家航天局卫星互联网高轨卫星任务信息",
      url: "https://www.cnsa.gov.cn/n6758823/n6758838/c10582716/content.html",
    },
    gps: {
      label: "GPS.gov 空间星座参数",
      url: "https://www.gps.gov/space-segment",
    },
    glonass: {
      label: "ESA Navipedia GLONASS 空间段参数",
      url: "https://gssc.esa.int/navipedia/index.php/GLONASS_Space_Segment",
    },
    beidou: {
      label: "北斗卫星导航系统官方星座说明",
      url: "https://www.beidou.gov.cn/zy/kpyd/201912/t20191226_19774.html",
    },
    galileo: {
      label: "欧洲 GNSS 服务中心 Galileo 系统参数",
      url: "https://www.gsc-europa.eu/galileo/system",
    },
  });

  const IMAGING_PROFILES = [
    imaging(/^SENTINEL-1[A-Z]?$/i, "Sentinel-1", "C-SAR IW", 250, {
      displayDurationSec: 45,
      mode: "IW 标称模式",
      sourceKey: "sentinel1",
      color: "#50e3c2",
      note: "IW 官方幅宽 250 km；沿轨长度随实际 datatake 时长变化。",
    }),
    imaging(/^SENTINEL-2[A-Z]?$/i, "Sentinel-2", "MSI", 290, {
      sceneLengthKm: 100,
      mode: "MGRS 标准产品瓦片",
      sourceKey: "sentinel2",
      color: "#85f59f",
      note: "官方幅宽 290 km；显示长度采用标准 100 km 产品瓦片边长。",
    }),
    imaging(/^SENTINEL-3[A-Z]?$/i, "Sentinel-3", "OLCI", 1270, {
      displayDurationSec: 45,
      sourceKey: "sentinel3",
      color: "#54d5ff",
      note: "OLCI 官方幅宽 1270 km；沿轨长度按 45 秒显示窗计算。",
    }),
    imaging(/^SENTINEL-5P$/i, "Sentinel-5P", "TROPOMI", 2600, {
      displayDurationSec: 45,
      sourceKey: "sentinel5p",
      color: "#73a9ff",
      note: "TROPOMI 官方幅宽约 2600 km；沿轨长度按 45 秒显示窗计算。",
    }),
    imaging(/^SENTINEL-6[A-Z]?$/i, "Sentinel-6", "Poseidon-4 / AMR-C", 25, {
      sceneLengthKm: 25,
      mode: "AMR-C 天底测量足迹（非面阵成像）",
      geometryKind: "measurement-footprint",
      sourceKey: "sentinel6",
      color: "#8ad7ff",
      note: "AMR-C 标称空间分辨率约 25 km，HRMR 可达约 5 km；这里显示 25 km 天底测量足迹，不代表光学影像景幅或实时任务。",
    }),
    imaging(/JILIN.*(?:KUANFU 02|KUANFU-?02)/i, "吉林一号", "宽幅02系列", 150, {
      displayDurationSec: 12,
      sourceKey: "jilinProducts",
      color: "#ffb454",
      note: "官方公布幅宽优于 150 km；沿轨长度按 12 秒显示窗计算。",
    }),
    imaging(/^JILIN-1 KUANFU 01$/i, "吉林一号", "宽幅01", 136, {
      displayDurationSec: 12,
      sourceKey: "jilinLegacy",
      color: "#ffad45",
      parameterScope: "individual-satellite",
      note: "宽幅01官方幅宽 136 km；沿轨长度只是 12 秒显示窗，不是固定产品长度。",
    }),
    imaging(/JILIN.*KUANFU[- ]?01(?:B|C)$/i, "吉林一号", "宽幅01B/01C系列", 150, {
      displayDurationSec: 12,
      sourceKey: "jilinProducts",
      color: "#ffad45",
      note: "01B/01C 公开参数为 150 km 级幅宽；沿轨长度按 12 秒显示窗计算。",
    }),
    imaging(/JILIN.*GAOFEN[ -]?(?:2|02)[A-Z]?$/i, "吉林一号", "高分02系列", 40, {
      displayDurationSec: 8,
      sourceKey: "jilinLegacy",
      color: "#ff8f6b",
      note: "高分02系列公开幅宽 40 km；沿轨长度按 8 秒显示窗计算。",
    }),
    imaging(/JILIN.*(?:GAOFEN OBJECT|GAOFEN[ -]?(?:3|03))/i, "吉林一号", "高分03系列", 17, {
      displayDurationSec: 8,
      sourceKey: "jilinGf03",
      color: "#ff7f72",
      note: "高分03系列官方幅宽大于 17 km；未具名在轨对象按同批系列参数显示。",
    }),
    imaging(/^JILIN-1 (?:0[3-9]|10)$/i, "吉林一号", "视频系列", 19, {
      sceneLengthKm: 4.5,
      sourceKey: "jilinLegacy",
      color: "#ffcf5c",
      note: "视频系列公开单帧覆盖约 19 km × 4.5 km。",
    }),
    imaging(/^JILIN-1 SHIPIN [12]$/i, "吉林一号", "视频系列", 19, {
      sceneLengthKm: 4.5,
      sourceKey: "jilinLegacy",
      color: "#ffcf5c",
      note: "首批视频星公开单帧覆盖约 19 km × 4.5 km。",
    }),
    imaging(/^JILIN-1$/i, "吉林一号", "光学A星", 11.6, {
      displayDurationSec: 4,
      sourceKey: "jilinLegacy",
      color: "#ffc269",
      note: "光学A星公开幅宽 11.6 km；沿轨长度按 4 秒显示窗计算。",
    }),
    imaging(/^FLOCK 4(?:BE|G|H|Q)-/i, "PlanetScope", "SuperDove PSB.SD", 32.5, {
      sceneLengthKm: 19.6,
      sourceKey: "planetScope",
      color: "#83f28f",
      aliases: ["Planet", "Dove", "SuperDove", "行星实验室"],
      note: "当前在役 FLOCK 4BE/4G/4H/4Q 按 SuperDove PSB.SD 标准景幅 32.5 km x 19.6 km 逐星显示。",
    }),
    imaging(/^FLOCK (?!4(?:BE|G|H|Q)-)/i, "PlanetScope", "Dove 系列", 25, {
      sceneLengthKm: 23,
      sourceKey: "planetScope",
      color: "#76e884",
      aliases: ["Planet", "Dove", "行星实验室"],
      estimated: true,
      note: "无法从公开轨道名判定具体传感器代次时，采用仍在轨 Dove-R 的 25 km x 23 km 景幅；卡片会标明估算。",
    }),
    imaging(/^SKYSAT-/i, "Planet SkySat", "SkySat 三相机", 5.73, {
      sceneLengthKm: 2.5,
      sourceKey: "planetSkySat",
      color: "#4ce0b3",
      aliases: ["Planet", "SkySat", "行星实验室"],
      note: "官方整机跨轨幅宽约 5.73 km；沿轨显示采用单 Scene 的约 2.5 km 长度。",
    }),
    imaging(/^(?:PELICAN-|EDDA-1$)/i, "Planet Pelican", "Pelican 线阵", 8, {
      displayDurationSec: 3,
      sourceKey: "planetPelican",
      color: "#39d8c8",
      aliases: ["Planet", "Pelican", "行星实验室"],
      note: "Pelican Gen-1 天底幅宽 8 km；真实条带长度随任务模式变化，图上采用 3 秒沿轨显示窗。",
    }),
    imaging(/^TANAGER-/i, "Planet Tanager", "VSWIR 成像光谱仪", 18, {
      displayDurationSec: 4,
      sourceKey: "planetTanager",
      color: "#34ceb7",
      aliases: ["Planet", "Tanager", "Carbon Mapper", "高光谱"],
      note: "Tanager 官方幅宽 18 km；任务长度依灵敏度模式为 18-481.2 km，图上采用 4 秒沿轨显示窗。",
    }),
    imaging(/^LEGION [1-6]$/i, "Vantor WorldView Legion", "30 cm级多光谱", 9, {
      displayDurationSec: 3,
      sourceKey: "vantorConstellation",
      color: "#55aaff",
      aliases: ["Vantor", "WorldView Legion", "Maxar Intelligence"],
      note: "Vantor 当前六颗 WorldView Legion 均归入本系列；按官方任务资料的 9 km 天底幅宽绘制，沿轨长度采用 3 秒显示窗。",
    }),
    imaging(/^WORLDVIEW-1(?: |$)/i, "Vantor WorldView", "WorldView-1 PAN", 17.6, {
      displayDurationSec: 3,
      sourceKey: "vantorConstellation",
      color: "#77c7ff",
      aliases: ["Maxar", "WorldView", "Vantor"],
      note: "WorldView-1 天底单条带幅宽 17.6 km；沿轨长度取 3 秒显示窗。",
    }),
    imaging(/^WORLDVIEW-2(?: |$)/i, "Vantor WorldView", "WorldView-2 VNIR", 16.4, {
      displayDurationSec: 3,
      sourceKey: "vantorConstellation",
      color: "#6dbdff",
      aliases: ["Maxar", "WorldView", "Vantor"],
      note: "WorldView-2 天底单条带幅宽 16.4 km；沿轨长度取 3 秒显示窗。",
    }),
    imaging(/^WORLDVIEW-3(?: |$)/i, "Vantor WorldView", "WorldView-3 VNIR", 13.1, {
      displayDurationSec: 3,
      sourceKey: "vantorConstellation",
      color: "#62b4ff",
      aliases: ["Maxar", "WorldView", "Vantor"],
      note: "WorldView-3 VNIR 天底单条带幅宽 13.1 km；沿轨长度取 3 秒显示窗。",
    }),
    imaging(/^GEOEYE 1$/i, "Vantor GeoEye", "GeoEye-1", 15.2, {
      displayDurationSec: 3,
      sourceKey: "vantorConstellation",
      color: "#8fcfff",
      aliases: ["Maxar", "GeoEye", "Vantor"],
      note: "GeoEye-1 天底单条带幅宽 15.2 km；沿轨长度取 3 秒显示窗。",
    }),
    imaging(/^GLOBAL-(?:3[1-9]|[4-9][0-9])$/i, "BlackSky", "Gen-3 可见光", 3.7, {
      sceneLengthKm: 4.9,
      sourceKey: "blackSkyGen3",
      color: "#ff7e6b",
      aliases: ["BlackSky", "Gen-3", "黑天"],
      note: "Gen-3 官方最小可见光景幅 3.7 km x 4.9 km；按每颗 GLOBAL-31 及以后在役星显示。",
    }),
    imaging(/^GLOBAL-(?!(?:3[1-9]|[4-9][0-9])$)/i, "BlackSky", "Gen-2 可见光", 4.4, {
      sceneLengthKm: 6.6,
      sourceKey: "blackSkyGen2",
      color: "#ff967c",
      aliases: ["BlackSky", "Gen-2", "黑天"],
      note: "BlackSky 官方任务资料给出 4.4 km x 6.6 km 单景；逐星按 Gen-2 身份应用，不再作为工程估算。",
    }),
    imaging(/^ICEYE-X/i, "ICEYE", "X-band SAR Strip", 30, {
      sceneLengthKm: 50,
      sourceKey: "iceye",
      color: "#e68cff",
      aliases: ["ICEYE", "SAR", "冰眼"],
      note: "逐星采用 ICEYE 官方 Strip 标称 30 km x 50 km；Spot、Scan 与 Scan Wide 是不同可选任务模式。",
    }),
    imaging(/^CAPELLA-/i, "Capella Space", "X-band SAR Spotlight", 5, {
      sceneLengthKm: 5,
      sourceKey: "capella",
      color: "#d995ff",
      aliases: ["Capella", "Acadia", "卡佩拉"],
      note: "逐星采用官方 Spotlight 标准 5 km x 5 km 足迹；Stripmap 任务长度会随订单变化。",
    }),
    imaging(/^UMBRA-/i, "Umbra", "X-band SAR Scan", 8, {
      sceneLengthKm: 50,
      sceneLengthRangeKm: [25, 100],
      sourceKey: "umbra",
      color: "#c58cff",
      aliases: ["Umbra", "SAR"],
      note: "官方 Scan 幅宽固定 8 km、任务长度可选 25-100 km；图上采用区间内 50 km 参考任务，不代表正在执行的实际订单长度。",
    }),
    imaging(/^NUSAT-(?:26|35|4[0-9]|5[0-9])(?: |$)/i, "Satellogic NewSat", "Mark-V 多光谱", 6.5, {
      sceneLengthKm: 10,
      sourceKey: "satellogicMark5",
      color: "#ffd166",
      aliases: ["Satellogic", "NewSat", "ÑuSat"],
      identitySourceKey: "satellogicGenerations",
      note: "逐星代次按 Satellogic 官方表和后续任务清单判定；Mark-V 官方天底幅宽约 6.5 km，10 km 为 POI 沿轨展示长度。",
    }),
    imaging(/^NUSAT-(?!(?:26|35|4[0-9]|5[0-9])(?: |$))/i, "Satellogic NewSat", "Mark-IV 多光谱", 5, {
      sceneLengthKm: 10,
      sourceKey: "satellogicMark4",
      color: "#ffca55",
      aliases: ["Satellogic", "NewSat", "ÑuSat"],
      identitySourceKey: "satellogicGenerations",
      note: "逐星代次按 Satellogic 官方表判定；Mark-IV 官方多光谱幅宽约 5 km，10 km 为 POI 沿轨展示长度。",
    }),
    imaging(/^STRIX-/i, "Synspective StriX", "X-band SAR Stripmap", 20, {
      sceneLengthKm: 50,
      sourceKey: "synspective",
      color: "#b58cff",
      aliases: ["Synspective", "StriX", "SAR"],
      note: "官方 Stripmap 标称幅宽 20 km（可用范围 10-30 km）、产品长度大于 50 km；图上采用 20 km x 50 km。",
    }),
    imaging(/^QPS-SAR-/i, "iQPS QPS-SAR", "X-band SAR Stripmap", 7, {
      sceneLengthKm: 14,
      sourceKey: "iqps",
      color: "#9b8cff",
      aliases: ["iQPS", "QPS-SAR", "SAR"],
      note: "官方 Stripmap 景幅为沿轨 14 km x 地距 7 km；方向已按卫星航向放置。",
    }),
    imaging(/^FIREFLY-/i, "Pixxel Firefly", "VNIR 高光谱", 40, {
      displayDurationSec: 4,
      sourceKey: "pixxel",
      color: "#ff6fae",
      aliases: ["Pixxel", "Firefly", "高光谱"],
      note: "Firefly 每颗卫星官方幅宽 40 km；连续条带长度随任务变化，图上采用 4 秒沿轨显示窗。",
    }),
    imaging(/^GRUS-3/i, "Axelspace AxelGlobe", "GRUS-3 多光谱", 28.3, {
      displayDurationSec: 5,
      sourceKey: "axelGrus3",
      color: "#ff9f6e",
      aliases: ["Axelspace", "AxelGlobe", "GRUS"],
      note: "GRUS-3 每颗官方有效幅宽 28.3 km、最长可拍 1,356 km；图上采用 5 秒沿轨显示窗。",
    }),
    imaging(/^GRUS-1/i, "Axelspace AxelGlobe", "GRUS-1 多光谱", 50, {
      displayDurationSec: 5,
      sourceKey: "axelGrus1",
      color: "#ffa878",
      aliases: ["Axelspace", "AxelGlobe", "GRUS"],
      note: "GRUS-1 官方公开幅宽为 50 km 以上；图上按 50 km 保守值和 5 秒沿轨显示窗绘制。",
    }),
    imaging(/^LANDSAT (?:8|9)$/i, "Landsat", "OLI/TIRS", 185, {
      sceneLengthKm: 180,
      sourceKey: "landsat",
      color: "#b7f36b",
      note: "USGS WRS-2 标准景幅约 185 km × 180 km。",
    }),
    imaging(/^(?:TERRA|AQUA)$/i, "NASA EOS", "MODIS", 2330, {
      sceneLengthKm: 10,
      sourceKey: "modis",
      color: "#6de8d0",
      note: "MODIS 官方跨轨幅宽 2330 km；沿轨 10 km 为单次扫描条带。",
    }),
    imaging(/^(?:SUOMI NPP|NOAA 20|NOAA 21|JPSS)/i, "JPSS", "VIIRS", 3040, {
      displayDurationSec: 30,
      sourceKey: "viirs",
      color: "#5ac8ff",
      note: "VIIRS 官方跨轨幅宽 3040 km；沿轨长度按 30 秒显示窗计算。",
    }),
    imaging(/^PLEIADES NEO /i, "Airbus Pléiades Neo", "30 cm 光学", 14, {
      displayDurationSec: 3,
      sourceKey: "airbusOptical",
      color: "#62b8ff",
      aliases: ["Airbus", "Pléiades Neo", "光学"],
      note: "官方天底幅宽 14 km；连续条带长度由任务规划决定，图上采用 3 秒沿轨显示窗。",
    }),
    imaging(/^PLEIADES 1[AB]$/i, "Airbus Pléiades", "50 cm 光学", 20, {
      displayDurationSec: 3,
      sourceKey: "airbusOptical",
      color: "#77c7ff",
      aliases: ["Airbus", "Pléiades", "光学"],
      note: "官方天底幅宽 20 km；连续条带长度由任务规划决定，图上采用 3 秒沿轨显示窗。",
    }),
    imaging(/^SPOT [67]$/i, "Airbus SPOT", "1.5 m 光学", 60, {
      displayDurationSec: 8,
      sourceKey: "airbusOptical",
      color: "#89d0ff",
      aliases: ["Airbus", "SPOT", "光学"],
      note: "官方天底幅宽 60 km；连续条带长度由任务规划决定，图上采用 8 秒沿轨显示窗。",
    }),
    imaging(/^(?:TERRASAR-X|TANDEM-X|PAZ)$/i, "TerraSAR-X / TanDEM-X / PAZ", "X-band SAR StripMap", 30, {
      displayDurationSec: 7,
      mode: "StripMap 参考模式",
      sourceKey: "terraSarX",
      color: "#ca8cff",
      aliases: ["TerraSAR-X", "TanDEM-X", "PAZ", "SAR"],
      note: "官方 StripMap 幅宽 30 km；Spotlight 为 10 km、ScanSAR 为 100 km，图上不混用不同模式。",
    }),
    imaging(/^RADARSAT-2$/i, "RADARSAT-2", "C-band SAR Fine", 50, {
      displayDurationSec: 7,
      mode: "Fine 参考模式",
      sourceKey: "radarsat",
      color: "#b789ff",
      aliases: ["RADARSAT", "SAR"],
      note: "官方 Fine 模式幅宽 50 km；其他模式从 18 km 到 530 km，图上明确采用 Fine 参考模式。",
    }),
    imaging(/^RCM-[123]$/i, "RADARSAT Constellation", "C-band SAR High Resolution", 30, {
      displayDurationSec: 7,
      mode: "High Resolution 参考模式",
      sourceKey: "radarsat",
      color: "#ab82ff",
      aliases: ["RCM", "RADARSAT", "SAR"],
      note: "官方 High Resolution 模式幅宽 30 km；宽域模式可达 500 km，图上不以最大值代替当前参考模式。",
    }),
    imaging(/^CSG-[123]$/i, "COSMO-SkyMed Second Generation", "X-band SAR Stripmap", 40, {
      sceneLengthKm: 40,
      mode: "Stripmap 参考模式",
      sourceKey: "cosmoSkymed2",
      color: "#d785ff",
      aliases: ["COSMO-SkyMed", "CSG", "SAR"],
      note: "CSG 官方 Stripmap 参考产品约 40 km x 40 km；Spotlight、PingPong、QuadPol 与 ScanSAR 均为独立任务模式。",
    }),
    imaging(/^COSMO-SKYMED [1-4]$/i, "COSMO-SkyMed", "X-band SAR HIMAGE", 40, {
      sceneLengthKm: 40,
      mode: "HIMAGE StripMap 参考模式",
      sourceKey: "cosmoSkymed",
      color: "#cf7fff",
      aliases: ["COSMO-SkyMed", "SAR"],
      note: "第一代官方 HIMAGE 产品为 40 km x 40 km；Spotlight、PingPong 和 ScanSAR 是独立任务模式。",
    }),
    imaging(/^ALOS-2$/i, "JAXA ALOS-2", "PALSAR-2 L-band SAR", 50, {
      displayDurationSec: 8,
      mode: "Ultra-Fine StripMap 参考模式",
      sourceKey: "alos2",
      color: "#d39bff",
      aliases: ["DAICHI-2", "PALSAR-2", "SAR"],
      note: "官方 Ultra-Fine StripMap 幅宽 50 km；Spotlight 为 25 km、ScanSAR 为 350/490 km。",
    }),
    imaging(/^ALOS-4(?: \(DAICHI-4\))?$/i, "JAXA ALOS-4", "PALSAR-3 L-band SAR", 200, {
      displayDurationSec: 12,
      mode: "高分辨率 StripMap 参考模式",
      sourceKey: "alos4",
      color: "#bc8cff",
      aliases: ["DAICHI-4", "PALSAR-3", "SAR"],
      note: "官方常规高分辨率 StripMap 幅宽 200 km；ScanSAR 700 km 是另一独立模式。",
    }),
    imaging(/^NISAR$/i, "NASA-ISRO NISAR", "L/S-band SweepSAR", 240, {
      displayDurationSec: 12,
      sourceKey: "nisar",
      color: "#d58cff",
      aliases: ["NISAR", "SAR", "NASA", "ISRO"],
      note: "官方 SweepSAR 成像幅宽大于 240 km；图上按公开标称下限 240 km 绘制。",
    }),
    imaging(/^ENMAP$/i, "DLR EnMAP", "高光谱 VNIR/SWIR", 30, {
      sceneLengthKm: 30,
      sourceKey: "enmap",
      color: "#ff74b7",
      aliases: ["EnMAP", "高光谱"],
      note: "官方幅宽 30 km，标准产品瓦片为 30 km x 30 km。",
    }),
    imaging(/^PRISMA$/i, "ASI PRISMA", "高光谱 VNIR/SWIR + PAN", 30, {
      sceneLengthKm: 30,
      sourceKey: "prisma",
      color: "#f06fbd",
      aliases: ["PRISMA", "高光谱"],
      note: "官方幅宽 30 km，标准高光谱场景为 30 km x 30 km。",
    }),
    imaging(/^CARTOSAT-3$/i, "ISRO Cartosat-3", "PAN / MX 光学", 17, {
      displayDurationSec: 4,
      sourceKey: "cartosat3",
      color: "#74c9ff",
      aliases: ["Cartosat", "ISRO", "光学"],
      note: "ISRO 官方完整天底幅宽 17 km；部分 0.45 m 产品会裁为 10 km，不与完整幅宽混用。",
    }),
    imaging(/^FORMOSAT-5$/i, "FORMOSAT-5", "RSI 光学", 24, {
      displayDurationSec: 4,
      sourceKey: "formosat5",
      color: "#82d2ff",
      aliases: ["FORMOSAT", "福卫五号", "光学"],
      note: "WMO OSCAR 公开 RSI 天底幅宽 24 km；可在约 500 km 指向范围内侧摆。",
    }),
    imaging(/^SAOCOM 1[AB]$/i, "CONAE SAOCOM-1", "L-band SAR StripMap S1", 49.7, {
      sceneLengthKm: 74.1,
      mode: "StripMap S1 单/双极化参考模式",
      sourceKey: "saocom",
      color: "#c989ff",
      aliases: ["SAOCOM", "CONAE", "SAR"],
      note: "官方 S1 单/双极化产品最小幅宽 49.7 km、标称沿轨长度 74.1 km；TOPSAR 是独立宽域模式。",
    }),
    imaging(/^RESURS-P [45]$/i, "Resurs-P", "Geoton-L 高分辨率多光谱", 38, {
      displayDurationSec: 8,
      sourceKey: "resursP",
      color: "#79d6ff",
      aliases: ["Resurs-P", "资源-P", "俄罗斯遥感"],
      note: "Resurs-P 4/5 官方公布 Geoton-L 天底幅宽 38 km；97.2 km 宽角和 30 km 高光谱是独立载荷模式。",
    }),
    imaging(/^KANOPUS-V(?:[- ](?:IK|[1-6]))?$/i, "Kanopus-V", "PSS 全色", 23, {
      displayDurationSec: 8,
      sourceKey: "russianEoHandbook",
      color: "#6ec9f5",
      aliases: ["Kanopus-V", "俄罗斯遥感"],
      note: "俄罗斯官方产品手册列出 PSS 全色幅宽 23 km；MSS/MSSM 为 20 km，图上选用高分辨率全色模式。",
    }),
    imaging(/^METEOR-M(?:2)?(?:-| )/i, "Meteor-M", "MSU-MR 多通道扫描仪", 2850, {
      displayDurationSec: 35,
      sourceKey: "russianEoHandbook",
      color: "#63c7ef",
      aliases: ["Meteor-M", "气象卫星", "俄罗斯遥感"],
      note: "官方产品手册列出 MSU-MR 幅宽 2850 km；KMSS 系列是窄得多的独立成像仪。",
    }),
    imaging(/^GAOFEN 1(?: |$)/i, "高分一号", "PMS 2 m / 8 m", 60, {
      displayDurationSec: 10,
      sourceKey: "gaofen1",
      color: "#55d6a8",
      aliases: ["高分一号", "GF-1", "中国遥感"],
      note: "国家航天局公布 PMS 高分辨率组合幅宽 60 km；WFV 16 m 模式为 800 km，不与 PMS 混合。",
    }),
    imaging(/^GAOFEN 2(?: |$)/i, "高分二号", "PMS 0.8 m / 3.2 m", 45, {
      displayDurationSec: 8,
      sourceKey: "gaofen2",
      color: "#4bcf9f",
      aliases: ["高分二号", "GF-2", "中国遥感"],
      note: "国家航天局公布观测幅宽优于 45 km，图上按保守的 45 km 绘制。",
    }),
    imaging(/^HAIYANG 1[CD](?: |$)/i, "海洋一号 C/D", "COCTS 海洋水色水温扫描仪", 2900, {
      displayDurationSec: 35,
      sourceKey: "haiyang1",
      color: "#45c8d8",
      aliases: ["海洋一号", "HY-1C", "HY-1D", "中国海洋遥感"],
      note: "国家航天局公布 COCTS 幅宽大于 2900 km；CZI 海岸带成像仪为 950 km 独立模式。",
    }),
    imaging(/^FENGYUN 3[ABCDE]$/i, "风云三号", "MERSI / MERSI-II", 2900, {
      displayDurationSec: 35,
      sourceKey: "fengyun3",
      color: "#50c8e8",
      aliases: ["风云三号", "FY-3", "气象卫星"],
      note: "A-E 星主要全球成像仪的幅宽约 2900 km；不同载荷另有独立窄幅观测。",
    }),
    imaging(/^FENGYUN 3[HF]$/i, "风云三号 F/H", "MERSI-III", 2800, {
      displayDurationSec: 35,
      sourceKey: "fengyun3",
      color: "#42bee4",
      aliases: ["风云三号", "FY-3F", "FY-3H", "气象卫星"],
      note: "国家卫星气象中心公布 MERSI-III 幅宽 2800 km。",
    }),
    imaging(/^FENGYUN 3G$/i, "风云三号 G", "PMR 中分辨率光学成像仪", 1000, {
      displayDurationSec: 20,
      sourceKey: "fengyun3",
      color: "#3db8dd",
      aliases: ["风云三号", "FY-3G", "降水星"],
      note: "国家卫星气象中心公布光学成像仪幅宽约 1000 km。",
    }),
  ];

  const COMMUNICATION_PROFILES = [
    communication(/STARLINK/i, "Starlink", 25, "starlink", "#58bfff", {
      aliases: ["星链", "SPACEX"],
      note: "按 FCC 常规用户终端 25° 最低仰角计算；高纬临时/专项授权可能不同。",
    }),
    communication(/ONEWEB/i, "OneWeb（一网）", 40, "oneweb", "#ffbd59", {
      aliases: ["一网", "EUTELSAT ONEWEB"],
      note: "按 FCC 干扰分析中 OneWeb 40° 最低仰角计算，属于保守可见范围。",
    }),
    communication(/(?:KUIPER|AMAZON LEO)/i, "Amazon Leo（原 Kuiper）", 35, "amazonLeo", "#ba8cff", {
      aliases: ["亚马逊LEO", "亚马逊 LEO", "PROJECT KUIPER"],
      note: "按 Amazon/FCC 技术附件中的用户终端 35° 最低仰角计算。",
    }),
    communication(/(?:HULIANWAN GAOGUI|\bHG-0[1-3]\b)/i, "星网高轨 / Guowang GEO", 10, "ituSatelliteHandbook", "#ff567d", {
      aliases: ["星网", "国网", "高轨卫星", "HULIANWAN", "GAOGUI"],
      estimated: true,
      minElevationRangeDeg: [5, 15],
      estimateConfidence: "medium",
      identitySourceKey: "chinaSatnetHighOrbit",
      note: "逐星轨道取当前 OMM/TLE；中心值采用 ITU 对高频 GSO 链路常用的 10°最低仰角，5°-15°作为环境与终端差异区间。",
    }),
    communication(/^(?!.*GAOGUI).*(?:GUOWANG|HULIANWANG(?: DIGUI)?|HULIANWAN|DIGUI[- ]?\d+)/i, "星网 / Guowang", null, "phasedArrayEstimate", "#ff6f91", {
      aliases: ["星网", "国网", "GW", "HULIANWANG", "DIGUI"],
      estimated: true,
      maxOffNadirDeg: 45,
      offNadirRangeDeg: [40, 55],
      estimateConfidence: "medium-low",
      identitySourceKey: "guowangFilings",
      parameterScope: "per-satellite-orbit-and-antenna-model",
      note: "逐星使用实时高度；以公开巨型星座 Q/V 相控阵不小于 +/-45°扫描指标为中心，40°-55°离轴角为合理区间。该范围仍不是运营商实时点波束。",
    }),
    communication(/QIANFAN/i, "千帆星座", null, "phasedArrayEstimate", "#47e0b4", {
      aliases: ["千帆", "G60"],
      estimated: true,
      maxOffNadirDeg: 45,
      offNadirRangeDeg: [40, 55],
      estimateConfidence: "medium-low",
      identitySourceKey: "qianfanMission",
      parameterScope: "per-satellite-orbit-and-antenna-model",
      note: "逐星使用实时高度；以公开巨型星座 Q/V 相控阵不小于 +/-45°扫描指标为中心，40°-55°离轴角为合理区间。该范围仍不是运营商实时点波束。",
    }),
    communication(/^RASSVET(?:-| )/i, "Bureau 1440 黎明星座", null, "bureau1440", "#ff805d", {
      aliases: ["Rassvet", "黎明", "Bureau 1440", "俄罗斯星链"],
      estimated: true,
      maxOffNadirDeg: 45,
      offNadirRangeDeg: [35, 55],
      estimateConfidence: "low",
      parameterScope: "per-satellite-orbit-engineering-envelope",
      note: "官方公开 800 km 轨道、星间激光链路和 5G NTN 宽带能力，但未公布用户波束边界；图上逐星使用实时高度，并以 45°离轴角、35°-55°区间给出有界工程估算，不代表运营商实时点波束。",
    }),
  ];

  const NAVIGATION_PROFILES = [
    navigation(/^NAVSTAR |^GPS (?:BIIR|BIIF|III)/i, "GPS", "L-band PNT", "gps", {
      aliases: ["GPS", "NAVSTAR", "全球定位系统"],
      note: "GPS MEO 导航星座；轨道显示直接使用逐星 OMM/TLE，不绘制通信波束。",
    }),
    navigation(/\[GLONASS-(?:M|K|K1|K2)\]|^GLONASS/i, "GLONASS", "L-band PNT", "glonass", {
      aliases: ["GLONASS", "格洛纳斯"],
      note: "GLONASS MEO 导航星座；轨道显示直接使用逐星 OMM/TLE。",
    }),
    navigation(/^BEIDOU-/i, "北斗", "BDS PNT / 短报文", "beidou", {
      aliases: ["北斗", "BeiDou", "BDS"],
      note: "北斗包含 MEO、IGSO 与 GEO 混合星座，按缓存中的逐星轨道类别完整归组。",
    }),
    navigation(/GALILEO|^GSAT\d+/i, "Galileo", "L-band PNT", "galileo", {
      aliases: ["Galileo", "伽利略"],
      note: "Galileo MEO 导航星座；轨道显示直接使用逐星 OMM/TLE。",
    }),
  ];

  const PRESETS = Object.freeze([
    preset("sentinel", "Sentinel", /SENTINEL/i, "imaging"),
    preset("jilin", "吉林一号", /JILIN/i, "imaging"),
    preset("planet", "Planet", /FLOCK|SKYSAT|PELICAN|EDDA-1|TANAGER/i, "imaging"),
    preset("vantor", "Vantor", /WORLDVIEW|GEOEYE|^LEGION [1-6]$/i, "imaging"),
    preset("blacksky", "BlackSky", /^GLOBAL-/i, "imaging"),
    preset("iceye", "ICEYE", /^ICEYE-X/i, "imaging"),
    preset("capella", "Capella", /^CAPELLA-/i, "imaging"),
    preset("umbra", "Umbra", /^UMBRA-/i, "imaging"),
    preset("satellogic", "Satellogic", /^NUSAT-/i, "imaging"),
    preset("synspective", "Synspective", /^STRIX-/i, "imaging"),
    preset("iqps", "iQPS", /^QPS-SAR-/i, "imaging"),
    preset("pixxel", "Pixxel", /^FIREFLY-/i, "imaging"),
    preset("axelspace", "Axelspace", /^GRUS-/i, "imaging"),
    preset("starlink", "星链", /STARLINK/i, "communications"),
    preset("oneweb", "一网", /ONEWEB/i, "communications"),
    preset("amazon-leo", "Amazon Leo", /KUIPER|AMAZON LEO/i, "communications"),
    preset("guowang", "星网", /GUOWANG|HULIANWANG|HULIANWAN|GAOGUI|DIGUI/i, "communications"),
    preset("qianfan", "千帆", /QIANFAN/i, "communications"),
    preset("rassvet-1440", "Bureau 1440 黎明", /^RASSVET(?:-| )/i, "communications"),
    preset("gps", "GPS", /^NAVSTAR |^GPS (?:BIIR|BIIF|III)/i, "navigation"),
    preset("glonass", "GLONASS", /\[GLONASS-(?:M|K|K1|K2)\]|^GLONASS/i, "navigation"),
    preset("beidou", "北斗", /^BEIDOU-/i, "navigation"),
    preset("galileo", "Galileo", /GALILEO|^GSAT\d+/i, "navigation"),
  ]);

  function preset(id, label, pattern, kind) {
    return Object.freeze({ id, label, pattern, kind });
  }

  function imaging(pattern, constellation, sensor, swathWidthKm, options) {
    return Object.freeze({
      pattern,
      profileId: options?.profileId || profileSlug("imaging", options?.sourceKey, constellation, sensor),
      kind: "imaging",
      constellation,
      sensor,
      swathWidthKm,
      sceneLengthKm: null,
      displayDurationSec: null,
      mode: "标称对地成像",
      geometryKind: "imaging-swath",
      parameterScope: "platform-family",
      evidenceLevel: "published-platform",
      estimated: false,
      ...options,
    });
  }

  function communication(pattern, constellation, minElevationDeg, sourceKey, color, options = {}) {
    return Object.freeze({
      pattern,
      profileId: options?.profileId || profileSlug("communications", sourceKey, constellation),
      kind: "communications",
      constellation,
      minElevationDeg,
      sourceKey,
      color,
      coverageModel: "minimum-elevation-envelope",
      beamFootprintKnown: false,
      parameterScope: "constellation-regulatory-model",
      evidenceLevel: "published-regulatory",
      estimated: false,
      aliases: [],
      ...options,
    });
  }

  function navigation(pattern, constellation, service, sourceKey, options = {}) {
    return Object.freeze({
      pattern,
      profileId: options?.profileId || profileSlug("navigation", sourceKey, constellation),
      kind: "navigation",
      constellation,
      service,
      sourceKey,
      parameterScope: "constellation",
      evidenceLevel: "published-platform",
      estimated: false,
      aliases: [],
      ...options,
    });
  }

  function profileSlug(...parts) {
    return parts.join("-").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function normalizeSatellite(input) {
    if (typeof input === "string") return { name: input };
    const satellite = input && typeof input === "object" ? input : { name: "" };
    return SATELLITE_IDENTITIES?.enrich?.(satellite) || satellite;
  }

  function normalizedName(input) {
    return String(normalizeSatellite(input).name || "").trim().toUpperCase();
  }

  function identityKeys(input) {
    const satellite = normalizeSatellite(input);
    return [
      satellite.noradId || satellite.id ? `NORAD:${satellite.noradId || satellite.id}` : "",
      satellite.internationalDesignator ? `COSPAR:${String(satellite.internationalDesignator).toUpperCase()}` : "",
    ].filter(Boolean);
  }

  function isExcludedIdentity(input) {
    return identityKeys(input).some((key) => EXCLUDED_IDENTITIES.has(key));
  }

  function matchingProfiles(input) {
    const satellite = normalizeSatellite(input);
    if (satellite.objectClass && satellite.objectClass !== "ACTIVE_PAYLOAD") return [];
    const normalized = normalizedName(input);
    if (!normalized || isExcludedIdentity(input)) return [];
    const exactEntry = COMMERCIAL_IMAGING_CATALOG?.resolve?.(satellite) || null;
    const exactImaging = exactCommercialImagingProfile(satellite, exactEntry);
    if (exactImaging) return [exactImaging];
    if (exactEntry && exactEntry.allowFamilyFallback === false) return [];
    return [...IMAGING_PROFILES, ...COMMUNICATION_PROFILES, ...NAVIGATION_PROFILES]
      .filter((profile) => profile.pattern.test(normalized));
  }

  const exactImagingProfileCache = new Map();

  function exactCommercialImagingProfile(satellite, resolvedEntry = undefined) {
    const entry = resolvedEntry === undefined ? COMMERCIAL_IMAGING_CATALOG?.resolve?.(satellite) : resolvedEntry;
    if (!entry || !(Number(entry.swathWidthKm) > 0)) return null;
    const id = String(entry.noradId || satellite?.noradId || satellite?.id || "");
    if (exactImagingProfileCache.has(id)) return exactImagingProfileCache.get(id);
    const identity = SATELLITE_IDENTITIES?.resolve?.(satellite) || null;
    const auditedSpec = identity?.seriesKey === "PLANET" ? identity.payloadSpec : null;
    const swathWidthKm = Number(auditedSpec?.swathWidthKm) > 0
      ? Number(auditedSpec.swathWidthKm)
      : Number(entry.swathWidthKm);
    const normalized = normalizedName(satellite);
    const fallback = IMAGING_PROFILES.find((profile) => profile.pattern.test(normalized)) || null;
    const sceneLengthKm = Number(auditedSpec?.sceneLengthKm) > 0
      ? Number(auditedSpec.sceneLengthKm)
      : Number(entry.sceneLengthKm) > 0
        ? Number(entry.sceneLengthKm)
        : Number(fallback?.sceneLengthKm) > 0
          ? Number(fallback.sceneLengthKm)
          : null;
    const durationSec = Number(sceneLengthKm) > 0
      ? null
      : Number(auditedSpec?.displayDurationSec) > 0
        ? Number(auditedSpec.displayDurationSec)
        : Number(fallback?.displayDurationSec) > 0
        ? Number(fallback.displayDurationSec)
        : entry.modality === "MET" ? 30 : entry.modality === "IMG-R" ? 7 : 5;
    const widthDescription = auditedSpec
      ? `${swathWidthKm} km（逐颗 NORAD 身份核对后采用对应平台公开值）`
      : entry.swathDerivedFromRange
      ? `${entry.swathWidthRangeKm?.join("-") || entry.swathRaw} km范围采用中值显示`
      : entry.swathLowerBound
        ? `${entry.swathWidthKm} km公开下限`
        : entry.swathRaw;
    const profile = imaging(/$a/, entry.specificationName || entry.operator || entry.name, entry.sensorType || entry.specificationCode, swathWidthKm, {
      profileId: auditedSpec ? `planet-audit-exact-${id}` : `commercial-imaging-exact-${id}`,
      resolution: auditedSpec?.resolution || entry.resolution || fallback?.resolution || "",
      launchDate: entry.launchDate || "",
      sceneLengthKm,
      displayDurationSec: durationSec,
      mode: entry.displayMode || fallback?.mode || "资料标称成像幅宽",
      geometryKind: fallback?.geometryKind || "imaging-swath",
      sourceKey: auditedSpec?.sourceKey || "commercialImagingCatalog",
      color: fallback?.color || (entry.modality === "IMG-R" ? "#d995ff" : entry.modality === "MET" ? "#50c8e8" : entry.modality === "EOSCI" ? "#ff74b7" : "#5fd6ff"),
      aliases: [entry.name, entry.operator, entry.country, entry.specificationCode].filter(Boolean),
      parameterScope: auditedSpec ? "audited-constellation-member" : "individual-satellite-catalog",
      evidenceLevel: auditedSpec ? "published-platform" : entry.swathDerivedFromRange ? "published-range" : "published-catalog",
      estimated: false,
      catalogConfidence: entry.confidence,
      catalogStatus: entry.status,
      catalogSwathRaw: entry.swathRaw,
      catalogSourceCodes: entry.sourceCodes,
      note: `NORAD ${id} 逐星匹配上传清单；${widthDescription}。${entry.note || ""}`,
    });
    exactImagingProfileCache.set(id, profile);
    return profile;
  }

  function resolve(input) {
    const satellite = normalizeSatellite(input);
    const matches = matchingProfiles(satellite);
    if (!matches.length) return null;
    return materialize(matches[0], satellite, matches.length);
  }

  function evidenceLabel(level) {
    if (level === "published-individual") return "逐星公开值";
    if (level === "published-catalog") return "逐星清单匹配值";
    if (level === "published-range") return "公开范围中值";
    if (level === "published-regulatory") return "监管文件模型";
    if (level === "published-platform") return "同平台公开值";
    if (level === "engineering-bracketed") return "有界工程估算";
    if (level === "engineering-estimate") return "工程估算";
    return "来源待核";
  }

  function materialize(profile, satellite = {}, matchCount = 1) {
    const source = SOURCES[profile.sourceKey] || null;
    const identitySource = SOURCES[profile.identitySourceKey] || null;
    const { pattern, sourceKey, identitySourceKey, ...publicProfile } = profile;
    const evidenceLevel = profile.estimated
      ? profile.minElevationRangeDeg || profile.offNadirRangeDeg
        ? "engineering-bracketed"
        : "engineering-estimate"
      : profile.evidenceLevel;
    return {
      ...publicProfile,
      evidenceLevel,
      evidenceLabel: evidenceLabel(evidenceLevel),
      source: source ? { ...source, verifiedAt: AUDIT_VERSION } : null,
      identitySource: identitySource ? { ...identitySource, verifiedAt: AUDIT_VERSION } : null,
      resolvedNoradId: String(satellite.noradId || satellite.id || ""),
      resolvedInternationalDesignator: String(satellite.internationalDesignator || ""),
      matchCount,
    };
  }

  function imagingDimensions(profile, position) {
    if (!profile || profile.kind !== "imaging") return null;
    const groundSpeedKmS = Math.max(0, Number(position?.groundSpeedKmS) || 0);
    const durationSec = Math.max(0, Number(profile.displayDurationSec) || 0);
    const computedLengthKm = groundSpeedKmS > 0 && durationSec > 0 ? groundSpeedKmS * durationSec : 0;
    const lengthKm = Number(profile.sceneLengthKm) > 0
      ? Number(profile.sceneLengthKm)
      : computedLengthKm > 0
        ? computedLengthKm
        : Math.max(5, Number(profile.swathWidthKm) * 0.5);
    return {
      widthKm: Number(profile.swathWidthKm),
      lengthKm,
      lengthBasis: Number(profile.sceneLengthKm) > 0
        ? profile.geometryKind === "measurement-footprint"
          ? "公开天底测量足迹"
          : "公开景幅/产品参考长度"
        : `${durationSec || 1} 秒沿轨显示窗`,
      geometryKind: profile.geometryKind || "imaging-swath",
    };
  }

  function imagingPointingSolution(position, target) {
    const altitudeKm = Math.max(0, Number(position?.altitudeKm) || 0);
    const satelliteLatDeg = Number(position?.lat);
    const satelliteLonDeg = Number(position?.lon);
    const targetLatDeg = Number(target?.lat);
    const targetLonDeg = Number(target?.lon);
    if (![altitudeKm, satelliteLatDeg, satelliteLonDeg, targetLatDeg, targetLonDeg].every(Number.isFinite) || altitudeKm <= 0) return null;
    const toRad = (value) => value * Math.PI / 180;
    const toDeg = (value) => value * 180 / Math.PI;
    const lat = toRad(satelliteLatDeg);
    const lon = toRad(satelliteLonDeg);
    const targetLat = toRad(targetLatDeg);
    const targetLon = toRad(targetLonDeg);
    const equatorialRadiusKm = 6378.137;
    const flattening = 1 / 298.257223563;
    const eccentricitySq = flattening * (2 - flattening);
    const geodeticEcef = (latRad, lonRad, heightKm) => {
      const sinLat = Math.sin(latRad);
      const primeVerticalKm = equatorialRadiusKm / Math.sqrt(1 - eccentricitySq * sinLat * sinLat);
      return [
        (primeVerticalKm + heightKm) * Math.cos(latRad) * Math.cos(lonRad),
        (primeVerticalKm + heightKm) * Math.cos(latRad) * Math.sin(lonRad),
        (primeVerticalKm * (1 - eccentricitySq) + heightKm) * sinLat,
      ];
    };
    const up = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    const targetUp = [Math.cos(targetLat) * Math.cos(targetLon), Math.cos(targetLat) * Math.sin(targetLon), Math.sin(targetLat)];
    const east = [-Math.sin(lon), Math.cos(lon), 0];
    const north = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
    const heading = toRad(Number(position?.headingDeg) || 0);
    const along = north.map((value, index) => value * Math.cos(heading) + east[index] * Math.sin(heading));
    const right = east.map((value, index) => value * Math.cos(heading) - north[index] * Math.sin(heading));
    const satelliteEcef = geodeticEcef(lat, lon, altitudeKm);
    const targetEcef = geodeticEcef(targetLat, targetLon, 0);
    const los = targetEcef.map((value, index) => value - satelliteEcef[index]);
    const losLength = Math.hypot(...los);
    if (!(losLength > 0)) return null;
    const direction = los.map((value) => value / losLength);
    const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
    const nadir = up.map((value) => -value);
    const nadirComponent = dot(direction, nadir);
    const alongComponent = dot(direction, along);
    const rightComponent = dot(direction, right);
    const centralAngleRad = Math.acos(Math.max(-1, Math.min(1, dot(up, targetUp))));
    const localSurfaceRadiusKm = Math.hypot(...geodeticEcef(lat, lon, 0));
    const horizonCentralAngleRad = Math.acos(localSurfaceRadiusKm / (localSurfaceRadiusKm + altitudeKm));
    const targetToSatellite = satelliteEcef.map((value, index) => value - targetEcef[index]);
    const reachable = dot(targetUp, targetToSatellite) >= -1e-9 && nadirComponent > 0;
    return {
      reachable,
      groundOffsetKm: wgs84GeodesicDistanceKm(satelliteLatDeg, satelliteLonDeg, targetLatDeg, targetLonDeg),
      horizonGroundRangeKm: horizonCentralAngleRad * localSurfaceRadiusKm,
      slantRangeKm: losLength,
      offNadirDeg: toDeg(Math.acos(Math.max(-1, Math.min(1, nadirComponent)))),
      rollDeg: toDeg(Math.atan2(rightComponent, nadirComponent)),
      pitchDeg: toDeg(Math.atan2(alongComponent, nadirComponent)),
      side: Math.abs(rightComponent) < 1e-8 ? "nadir" : rightComponent > 0 ? "right" : "left",
    };
  }

  function wgs84GeodesicDistanceKm(lat1Deg, lon1Deg, lat2Deg, lon2Deg) {
    const aKm = 6378.137;
    const f = 1 / 298.257223563;
    const bKm = aKm * (1 - f);
    const toRad = (value) => value * Math.PI / 180;
    const reduced1 = Math.atan((1 - f) * Math.tan(toRad(lat1Deg)));
    const reduced2 = Math.atan((1 - f) * Math.tan(toRad(lat2Deg)));
    const sin1 = Math.sin(reduced1);
    const cos1 = Math.cos(reduced1);
    const sin2 = Math.sin(reduced2);
    const cos2 = Math.cos(reduced2);
    const longitude = toRad(lon2Deg - lon1Deg);
    let lambda = longitude;
    let sinSigma = 0;
    let cosSigma = 1;
    let sigma = 0;
    let sinAlpha = 0;
    let cosSqAlpha = 1;
    let cos2SigmaM = 0;
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const sinLambda = Math.sin(lambda);
      const cosLambda = Math.cos(lambda);
      sinSigma = Math.hypot(cos2 * sinLambda, cos1 * sin2 - sin1 * cos2 * cosLambda);
      if (sinSigma < 1e-15) return 0;
      cosSigma = sin1 * sin2 + cos1 * cos2 * cosLambda;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = cos1 * cos2 * sinLambda / sinSigma;
      cosSqAlpha = 1 - sinAlpha * sinAlpha;
      cos2SigmaM = cosSqAlpha > 1e-15 ? cosSigma - 2 * sin1 * sin2 / cosSqAlpha : 0;
      const c = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
      const next = longitude + (1 - c) * f * sinAlpha * (
        sigma + c * sinSigma * (cos2SigmaM + c * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
      );
      if (Math.abs(next - lambda) < 1e-12) {
        lambda = next;
        break;
      }
      lambda = next;
    }
    const uSq = cosSqAlpha * (aKm * aKm - bKm * bKm) / (bKm * bKm);
    const coefficientA = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
    const coefficientB = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
    const deltaSigma = coefficientB * sinSigma * (
      cos2SigmaM + coefficientB / 4 * (
        cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)
        - coefficientB / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
      )
    );
    return bKm * coefficientA * (sigma - deltaSigma);
  }

  function communicationRadiusKm(altitudeKm, minElevationDeg) {
    const altitude = Math.max(0, Number(altitudeKm) || 0);
    const elevation = Math.max(0, Math.min(89.9, Number(minElevationDeg) || 0));
    if (!altitude) return 0;
    const elevationRad = elevation * Math.PI / 180;
    const centralAngle = Math.acos(
      Math.min(1, Math.max(-1, EARTH_MEAN_RADIUS_KM / (EARTH_MEAN_RADIUS_KM + altitude) * Math.cos(elevationRad))),
    ) - elevationRad;
    return Math.max(0, centralAngle * EARTH_MEAN_RADIUS_KM);
  }

  function communicationRadiusFromOffNadirKm(altitudeKm, offNadirDeg) {
    const altitude = Math.max(0, Number(altitudeKm) || 0);
    if (!altitude) return 0;
    const orbitRadius = EARTH_MEAN_RADIUS_KM + altitude;
    const horizonLookRad = Math.asin(EARTH_MEAN_RADIUS_KM / orbitRadius);
    const lookRad = Math.max(0, Math.min(horizonLookRad, Number(offNadirDeg) * Math.PI / 180));
    const centralAngle = Math.asin(Math.min(1, orbitRadius / EARTH_MEAN_RADIUS_KM * Math.sin(lookRad))) - lookRad;
    return Math.max(0, centralAngle * EARTH_MEAN_RADIUS_KM);
  }

  function groundElevationFromOffNadirDeg(altitudeKm, offNadirDeg) {
    const radiusKm = communicationRadiusFromOffNadirKm(altitudeKm, offNadirDeg);
    const centralDeg = radiusKm / EARTH_MEAN_RADIUS_KM * 180 / Math.PI;
    return Math.max(0, 90 - Number(offNadirDeg || 0) - centralDeg);
  }

  function communicationEnvelope(profile, altitudeKm) {
    const altitude = Math.max(0, Number(altitudeKm) || 0);
    if (!profile || profile.kind !== "communications" || !altitude) return null;
    if (Number(profile.maxOffNadirDeg) > 0) {
      const range = Array.isArray(profile.offNadirRangeDeg) ? profile.offNadirRangeDeg.map(Number).sort((a, b) => a - b) : [];
      const lowLook = range[0] > 0 ? range[0] : Number(profile.maxOffNadirDeg);
      const highLook = range[1] > 0 ? range[1] : Number(profile.maxOffNadirDeg);
      return {
        model: "phased-array-off-nadir-envelope",
        radiusKm: communicationRadiusFromOffNadirKm(altitude, profile.maxOffNadirDeg),
        radiusMinKm: communicationRadiusFromOffNadirKm(altitude, lowLook),
        radiusMaxKm: communicationRadiusFromOffNadirKm(altitude, highLook),
        minElevationDeg: groundElevationFromOffNadirDeg(altitude, profile.maxOffNadirDeg),
        minElevationMinDeg: groundElevationFromOffNadirDeg(altitude, highLook),
        minElevationMaxDeg: groundElevationFromOffNadirDeg(altitude, lowLook),
        offNadirDeg: Number(profile.maxOffNadirDeg),
        offNadirMinDeg: lowLook,
        offNadirMaxDeg: highLook,
      };
    }
    const range = Array.isArray(profile.minElevationRangeDeg) ? profile.minElevationRangeDeg.map(Number).sort((a, b) => a - b) : [];
    const lowElevation = range[0] >= 0 ? range[0] : Number(profile.minElevationDeg);
    const highElevation = range[1] > 0 ? range[1] : Number(profile.minElevationDeg);
    return {
      model: "minimum-elevation-envelope",
      radiusKm: communicationRadiusKm(altitude, profile.minElevationDeg),
      radiusMinKm: communicationRadiusKm(altitude, highElevation),
      radiusMaxKm: communicationRadiusKm(altitude, lowElevation),
      minElevationDeg: Number(profile.minElevationDeg),
      minElevationMinDeg: lowElevation,
      minElevationMaxDeg: highElevation,
      offNadirDeg: null,
      offNadirMinDeg: null,
      offNadirMaxDeg: null,
    };
  }

  function communicationCoverageRadiusKm(profile, altitudeKm) {
    return communicationEnvelope(profile, altitudeKm)?.radiusKm || 0;
  }

  function searchText(satellite) {
    const profile = resolve(satellite);
    if (!profile) return "";
    return [profile.constellation, profile.sensor, profile.service, profile.evidenceLabel, ...(profile.aliases || [])].filter(Boolean).join(" ");
  }

  function summarize(satellites) {
    const summary = {
      imaging: 0,
      communications: 0,
      navigation: 0,
      audited: 0,
      published: 0,
      estimated: 0,
      ambiguous: 0,
      missingSource: 0,
      byPreset: Object.fromEntries(PRESETS.map((preset) => [preset.id, 0])),
    };
    for (const satellite of satellites || []) {
      const profile = resolve(satellite);
      if (profile?.kind === "imaging") summary.imaging += 1;
      if (profile?.kind === "communications") summary.communications += 1;
      if (profile?.kind === "navigation") summary.navigation += 1;
      if (profile?.kind === "imaging" || profile?.kind === "communications") {
        summary.audited += 1;
        if (profile.estimated) summary.estimated += 1;
        else summary.published += 1;
        if (profile.matchCount > 1) summary.ambiguous += 1;
        if (!profile.source?.url) summary.missingSource += 1;
      }
      const upperName = normalizedName(satellite);
      for (const preset of PRESETS) {
        if (preset.pattern.test(upperName)) summary.byPreset[preset.id] += 1;
      }
    }
    return summary;
  }

  function auditCatalog(satellites) {
    const records = [];
    for (const satellite of satellites || []) {
      const profile = resolve(satellite);
      if (!profile || (profile.kind !== "imaging" && profile.kind !== "communications")) continue;
      const perigeeKm = Number(satellite.perigeeKm);
      const apogeeKm = Number(satellite.apogeeKm);
      const altitudeKm = (perigeeKm + apogeeKm) / 2;
      const envelope = profile.kind === "communications" ? communicationEnvelope(profile, altitudeKm) : null;
      const perigeeEnvelope = profile.kind === "communications" ? communicationEnvelope(profile, perigeeKm) : null;
      const apogeeEnvelope = profile.kind === "communications" ? communicationEnvelope(profile, apogeeKm) : null;
      records.push({
        noradId: String(satellite.noradId || satellite.id || ""),
        internationalDesignator: String(satellite.internationalDesignator || ""),
        name: String(satellite.name || ""),
        orbitClass: String(satellite.orbitClass || ""),
        kind: profile.kind,
        constellation: profile.constellation,
        profileId: profile.profileId,
        platformOrSensor: profile.sensor || "",
        launchDate: String(satellite.launchDate || profile.launchDate || ""),
        resolution: profile.kind === "imaging" ? String(profile.resolution || "") : "",
        parameterScope: profile.parameterScope,
        evidenceLevel: profile.evidenceLevel,
        evidenceLabel: profile.evidenceLabel,
        estimated: Boolean(profile.estimated),
        sourceUrl: profile.source?.url || "",
        identitySourceUrl: profile.identitySource?.url || "",
        swathWidthKm: profile.kind === "imaging" ? Number(profile.swathWidthKm) : null,
        sceneLengthKm: profile.kind === "imaging" && Number(profile.sceneLengthKm) > 0 ? Number(profile.sceneLengthKm) : null,
        sceneLengthMinKm: profile.kind === "imaging" && Array.isArray(profile.sceneLengthRangeKm) ? Number(profile.sceneLengthRangeKm[0]) : null,
        sceneLengthMaxKm: profile.kind === "imaging" && Array.isArray(profile.sceneLengthRangeKm) ? Number(profile.sceneLengthRangeKm[1]) : null,
        displayDurationSec: profile.kind === "imaging" && Number(profile.displayDurationSec) > 0 ? Number(profile.displayDurationSec) : null,
        orbitAltitudeMeanKm: profile.kind === "communications" ? altitudeKm : null,
        orbitAltitudeMinKm: profile.kind === "communications" ? perigeeKm : null,
        orbitAltitudeMaxKm: profile.kind === "communications" ? apogeeKm : null,
        minElevationDeg: envelope?.minElevationDeg ?? null,
        minElevationMinDeg: envelope?.minElevationMinDeg ?? null,
        minElevationMaxDeg: envelope?.minElevationMaxDeg ?? null,
        maxOffNadirDeg: envelope?.offNadirDeg ?? null,
        offNadirMinDeg: envelope?.offNadirMinDeg ?? null,
        offNadirMaxDeg: envelope?.offNadirMaxDeg ?? null,
        geometricEnvelopeRadiusKm: envelope?.radiusKm ?? null,
        geometricEnvelopeRadiusMinKm: perigeeEnvelope?.radiusMinKm ?? null,
        geometricEnvelopeRadiusMaxKm: apogeeEnvelope?.radiusMaxKm ?? null,
        estimateConfidence: profile.estimateConfidence || "",
        coverageModel: envelope?.model || profile.coverageModel || "",
        beamFootprintKnown: profile.beamFootprintKnown !== false,
        matchCount: profile.matchCount,
      });
    }
    const summary = summarize(satellites);
    return { auditVersion: AUDIT_VERSION, summary, records };
  }

  return Object.freeze({
    EARTH_MEAN_RADIUS_KM,
    AUDIT_VERSION,
    SOURCES,
    PRESETS,
    resolve,
    matchingProfiles,
    evidenceLabel,
    imagingDimensions,
    imagingPointingSolution,
    communicationRadiusKm,
    communicationRadiusFromOffNadirKm,
    groundElevationFromOffNadirDeg,
    communicationEnvelope,
    communicationCoverageRadiusKm,
    searchText,
    summarize,
    auditCatalog,
  });
});
