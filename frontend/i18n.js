(function initAppInternationalization(root) {
  "use strict";

  const STORAGE_KEY = "space-enthusiast-map-language-v1";
  const ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-description"];
  const HAN_PATTERN = /[\u3400-\u9fff]+/g;
  const HAN_TEST_PATTERN = /[\u3400-\u9fff]/;
  const generated = root.NOTAM_EN_TRANSLATIONS || {};
  const manual = Object.freeze({
    "航天爱好者地图": "Space Enthusiast Map",
    "底图": "Base map",
    "地球": "Globe",
    "卫星": "Satellite",
    "卫星图": "Satellite imagery",
    "卫星地图": "Satellite map",
    "太阳昼夜": "Day and night",
    "地名标注": "Place labels",
    "中文标签": "Landmark labels",
    "图层": "Layers",
    "区域": "Regions",
    "场": "Sites",
    "轨迹": "Ground tracks",
    "轨迹连线": "Ground-track lines",
    "坐标": "Coordinates",
    "显示": "Display",
    "匹配": "Matches",
    "图形": "Geometry",
    "缩放": "Zoom",
    "个场": "sites",
    "全部叠加": "Show all",
    "按区域": "By region",
    "搜索": "Search",
    "新发布": "Recently issued",
    "有图形": "With geometry",
    "仅显示高亮": "Show highlighted only",
    "四类区域可独立显示": "The four area layers can be displayed independently",
    "搜索和": "Search together with",
    "会共同筛选当前内容": "filters the current content",
    "只保留": "keeps only",
    "选中的区域": "selected areas",
    "绘制图层": "Area layers",
    "绘制": "Show",
    "绘制中国航警": "Show China warnings",
    "刷新": "Refresh",
    "刷新历史": "Refresh history",
    "清除": "Clear",
    "删除": "Delete",
    "编辑": "Edit",
    "定位": "Locate",
    "确认": "Confirm",
    "取消": "Cancel",
    "应用": "Apply",
    "重试": "Retry",
    "加载": "Load",
    "导入": "Import",
    "导出": "Export",
    "保存": "Save",
    "关闭": "Off",
    "开启": "On",
    "隐藏": "Hide",
    "全部显示": "Show all",
    "全部隐藏": "Hide all",
    "国家": "Countries",
    "国家和地区": "Countries and regions",
    "地区与海域": "Regions and maritime areas",
    "海域": "Maritime area",
    "发射": "Launch",
    "着陆": "Landing",
    "靶场": "Test range",
    "发射场": "Launch site",
    "着陆场": "Landing site",
    "发射预告": "Launch forecast",
    "发射预告圆环": "Launch forecast rings",
    "火箭发射预告": "Rocket launch forecast",
    "中国航警": "China navigational warnings",
    "中国海事局航警": "China MSA navigational warnings",
    "大沽口海事局": "Dagukou Maritime Safety Administration",
    "东疆海事局": "Dongjiang Maritime Safety Administration",
    "广东海事局": "Guangdong Maritime Safety Administration",
    "清澜海事局": "Qinglan Maritime Safety Administration",
    "威海海事局": "Weihai Maritime Safety Administration",
    "烟台海事局": "Yantai Maritime Safety Administration",
    "舟山海事局": "Zhoushan Maritime Safety Administration",
    "嘉兴海事局": "Jiaxing Maritime Safety Administration",
    "揭阳海事局": "Jieyang Maritime Safety Administration",
    "连云港海事局": "Lianyungang Maritime Safety Administration",
    "茂名海事局": "Maoming Maritime Safety Administration",
    "南山海事局": "Nanshan Maritime Safety Administration",
    "台州海事局": "Taizhou Maritime Safety Administration",
    "湛江海事局": "Zhanjiang Maritime Safety Administration",
    "航行警告": "Navigational warnings",
    "航警": "Navigational warning",
    "卫星云图": "Satellite cloud imagery",
    "云图": "Cloud imagery",
    "透明度": "Opacity",
    "当前": "Current",
    "历史": "History",
    "时间": "Time",
    "日期": "Date",
    "北京时间": "Beijing Time",
    "世界协调时": "UTC",
    "获取日期": "Acquired",
    "数据源": "Data source",
    "数据就绪": "Data ready",
    "已加载": "Loaded",
    "未获取": "Not loaded",
    "正在加载": "Loading",
    "正在载入": "Loading",
    "正在刷新": "Refreshing",
    "刷新中": "Refreshing",
    "刷新失败": "Refresh failed",
    "读取失败": "Read failed",
    "获取失败": "Retrieval failed",
    "连接失败": "Connection failed",
    "成功": "Success",
    "失败": "Failed",
    "错误": "Error",
    "警告": "Warning",
    "暂无": "None",
    "无": "None",
    "全部": "All",
    "数量": "Count",
    "条": "items",
    "个对象": "objects",
    "个卫星": "satellites",
    "地图数据": "map data",
    "官方数据源": "official data source",
    "全球": "Global",
    "完整缓存": "complete cache",
    "后台刷新": "background refresh",
    "详细信息": "Details",
    "原始信息": "Original information",
    "原始警告信息": "Original warning text",
    "生效时间": "Effective period",
    "当天有效": "Effective that day",
    "开始时间": "Start time",
    "结束时间": "End time",
    "无限高": "Unlimited altitude",
    "地表": "Surface",
    "海拔": "Altitude",
    "高度": "Altitude",
    "经度": "Longitude",
    "纬度": "Latitude",
    "顶点": "Vertices",
    "顶点坐标": "Vertex coordinates",
    "新建": "New",
    "固定": "Lock",
    "解除固定": "Unlock",
    "撤回": "Undo",
    "重做": "Redo",
    "颜色": "Color",
    "粗细": "Width",
    "外发光": "Glow",
    "虚线密度": "Dash density",
    "地表长度": "Surface distance",
    "倾角": "Inclination",
    "最短测地线": "Shortest geodesic",
    "轨迹点": "track points",
    "星下点": "Ground track",
    "星下点线": "Ground-track line",
    "星下点轨迹线": "Ground-track line",
    "主动段": "Powered flight",
    "主动段连线": "Powered-flight path",
    "主动段弹道": "Powered-flight trajectory",
    "弹道": "Ballistic trajectory",
    "弹道线": "Ballistic trajectory",
    "弹道模拟": "Ballistic simulation",
    "弹道模拟器": "Ballistic simulator",
    "分离": "Separation",
    "分离点": "Separation point",
    "分离级": "Separated stage",
    "级名称": "Stage name",
    "级残骸": "stage debris",
    "一级残骸": "Stage 1 debris",
    "二级残骸": "Stage 2 debris",
    "三级残骸": "Stage 3 debris",
    "初速度": "Initial speed",
    "地速": "Ground speed",
    "空速": "Airspeed",
    "航向": "Heading",
    "飞行路径角": "Flight-path angle",
    "弹道倾角": "Flight-path angle",
    "弹道系数": "Ballistic coefficient",
    "传播时间": "Propagation time",
    "传播时限": "Propagation limit",
    "最大地面射程": "Maximum ground range",
    "地面射程": "Ground range",
    "落点": "Impact point",
    "目标": "Target",
    "目标点": "Target point",
    "反算": "Inverse solve",
    "大气再入": "Atmospheric reentry",
    "再入动画": "Reentry animation",
    "动画标签": "Animation labels",
    "弹道总标签": "Trajectory labels",
    "热流": "Heat flux",
    "热流密度": "Heat flux",
    "动压": "Dynamic pressure",
    "过载": "Load factor",
    "马赫数": "Mach number",
    "本地马赫数": "Local Mach number",
    "密度": "Density",
    "高热流段": "High-heating phase",
    "高动压段": "High-dynamic-pressure phase",
    "等待": "Waiting",
    "运行中": "Running",
    "已完成": "Complete",
    "撞击": "Impact",
    "入轨": "Orbit achieved",
    "束缚轨道": "Bound orbit",
    "近地点": "Perigee",
    "远地点": "Apogee",
    "轨道倾角": "Orbital inclination",
    "轨道周期": "Orbital period",
    "轨道根数": "Orbital elements",
    "卫星轨道": "Satellite orbits",
    "卫星轨道线": "Satellite orbit lines",
    "卫星名称": "Satellite names",
    "卫星详情": "Satellite details",
    "卫星目录": "Satellite catalog",
    "空间对象": "Space objects",
    "在役卫星": "Active satellites",
    "退役卫星": "Inactive satellites",
    "火箭体": "Rocket bodies",
    "太空垃圾": "Space debris",
    "未知对象": "Unknown objects",
    "低地球轨道": "Low Earth orbit",
    "中地球轨道": "Medium Earth orbit",
    "地球同步轨道": "Geosynchronous orbit",
    "大椭圆轨道": "Highly elliptical orbit",
    "轨道层": "Orbit classes",
    "轨道线": "Orbit lines",
    "名称": "Names",
    "全部名称": "All names",
    "地标覆盖": "Ground footprints",
    "成像幅宽": "Imaging swath",
    "通信范围": "Communication coverage",
    "幅宽": "Swath width",
    "分辨率": "Resolution",
    "传感器": "Sensor",
    "入轨时间": "Launch date",
    "发射时间": "Launch date",
    "离轴角": "Off-nadir angle",
    "侧摆角": "Roll angle",
    "固定目标": "Fixed target",
    "固定侧摆角": "Fixed roll angle",
    "地球固定": "Earth-fixed",
    "轨道固定": "Orbit-fixed",
    "弹道固定": "Trajectory-fixed",
    "实时": "Real time",
    "暂停": "Pause",
    "播放": "Play",
    "倍速": "Speed",
    "性能": "Performance",
    "硬件自适应": "Hardware adaptive",
    "均衡": "Balanced",
    "高性能": "High performance",
    "动态画质": "Dynamic quality",
    "线程": "threads",
    "卫星计算线程": "satellite worker threads",
    "按需控制轨道": "Control orbits on demand",
    "通用": "Generic",
    "未命名坐标": "Unnamed coordinate",
    "自定义坐标": "Custom coordinates",
    "坐标名称": "Coordinate name",
    "坐标备注": "Notes",
    "点击地图添加坐标": "Click the map to add a coordinate",
    "度分秒": "DMS",
    "小数度": "Decimal degrees",
    "酒泉卫星发射中心": "Jiuquan Satellite Launch Center",
    "民勤回收火箭着陆场": "Minqin Rocket Recovery Landing Site",
    "蓝箭航天火箭着陆场": "LandSpace Rocket Landing Site",
    "太原卫星发射中心": "Taiyuan Satellite Launch Center",
    "库尔勒反导试验靶场": "Korla ABM Test Range",
    "西昌卫星发射中心": "Xichang Satellite Launch Center",
    "东方航天港": "Oriental Spaceport",
    "文昌航天发射场": "Wenchang Space Launch Site",
    "海南商业航天发射场": "Hainan Commercial Space Launch Site",
    "民丰靶场": "Minfeng Test Range",
    "东方航天发射场": "Vostochny Cosmodrome",
    "栋巴罗夫斯基战略火箭军基地": "Dombarovsky Strategic Missile Base",
    "萨雷沙甘反导试验场": "Sary-Shagan ABM Test Range",
    "萨雷": "Sary",
    "沙甘反导试验场": "Shagan ABM Test Range",
    "拜科努尔航天发射场": "Baikonur Cosmodrome",
    "卡普斯京亚尔试验场": "Kapustin Yar Test Range",
    "普列谢茨克航天发射场": "Plesetsk Cosmodrome",
    "库拉导弹试验靶场": "Kura Missile Test Range",
    "种子岛宇宙中心": "Tanegashima Space Center",
    "内之浦宇宙空间观测所": "Uchinoura Space Center",
    "纪伊发射场": "Kii Spaceport",
    "罗老宇宙中心": "Naro Space Center",
    "西海卫星发射场": "Sohae Satellite Launching Station",
    "萨迪什达万航天中心": "Satish Dhawan Space Centre",
    "萨迪什": "Satish",
    "达万航天中心": "Dhawan Space Centre",
    "阿卜杜勒卡拉姆博士岛": "Dr. Abdul Kalam Island",
    "阿卜杜勒": "Abdul",
    "卡拉姆博士岛": "Kalam Island",
    "综合试验靶场": "Integrated Test Range",
    "肯尼迪航天中心": "Kennedy Space Center",
    "星港": "Starbase",
    "范登堡太空军基地": "Vandenberg Space Force Base",
    "吉兰泰试验训练基地": "Jilantai Test and Training Base",
    "圭亚那航天中心": "Guiana Space Centre",
    "火箭实验室号发射复合体": "Rocket Lab Launch Complex 1",
    "火箭实验室": "Rocket Lab",
    "号发射复合体": "Launch Complex",
    "罗纳德里根太空和导弹测试场": "Ronald Reagan Ballistic Missile Defense Test Site",
    "罗纳德": "Ronald",
    "里根太空和导弹测试场": "Reagan Ballistic Missile Defense Test Site",
    "导弹试验场": "Missile Test Range",
    "瓜州": "Guazhou",
    "哈密": "Hami",
    "杭锦旗": "Hanggin Banner",
    "海上发射平台": "Sea Launch Platform",
    "夸贾林环礁空射发射点": "Kwajalein Air-Launch Site",
    "安岛航天港": "Andoya Spaceport",
    "萨克萨沃德航天港": "SaxaVord Spaceport",
    "埃斯兰格航天中心": "Esrange Space Center",
    "阿尔坎塔拉航天中心": "Alcantara Space Center",
    "瓦勒普斯飞行基地": "Wallops Flight Facility",
    "鲍恩轨道航天港": "Bowen Orbital Spaceport",
    "埃特拉格太空港": "Etlaq Spaceport",
    "白沙空射发射点": "White Sands Air-Launch Site",
    "北海道航天港": "Hokkaido Spaceport",
    "奇扎导弹试验靶场": "Chizha Missile Test Range",
    "吉林一号": "Jilin-1",
    "遥感": "Yaogan",
    "试验": "Shiyan",
    "通信技术试验": "TJS",
    "互联地轨": "Guowang LEO",
    "千帆": "Qianfan",
    "星网": "Guowang",
    "北斗": "BeiDou",
    "格洛纳斯": "GLONASS",
    "伽利略": "Galileo"
  });

  const translations = Object.freeze({ ...generated, ...manual, ...root.NOTAM_EN_REVIEWED_TRANSLATIONS });
  const formatters = root.NOTAM_EN_FORMATTERS || [];
  const translationCache = new Map();
  const termsByInitial = new Map();
  for (const term of Object.keys(translations)) {
    if (!/^[\u3400-\u9fff]+$/.test(term)) continue;
    const terms = termsByInitial.get(term[0]) || [];
    terms.push(term);
    termsByInitial.set(term[0], terms);
  }
  for (const terms of termsByInitial.values()) terms.sort((a, b) => b.length - a.length);
  const originalText = new WeakMap();
  const originalAttributes = new WeakMap();
  let language = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
  let observer = null;
  let fallbackCount = 0;
  const fallbackTerms = new Set();
  const fallbackRuns = new Set();

  function cleanEnglishPhrase(value) {
    return String(value || "")
      .replace(/[.!]+$/g, "")
      .replace(/^\s+|\s+$/g, "");
  }

  function translateHanRun(value) {
    const exact = translations[value];
    if (exact) return cleanEnglishPhrase(exact);
    const pieces = [];
    let index = 0;
    while (index < value.length) {
      const match = (termsByInitial.get(value[index]) || []).find((term) => value.startsWith(term, index));
      if (match) {
        pieces.push(cleanEnglishPhrase(translations[match]));
        index += match.length;
      } else {
        fallbackCount += 1;
        if (fallbackRuns.size < 300) fallbackRuns.add(value);
        if (fallbackTerms.size < 300) fallbackTerms.add(value[index]);
        if (pieces.length && /[\u3400-\u9fff]$/.test(pieces[pieces.length - 1])) pieces[pieces.length - 1] += value[index];
        else pieces.push(value[index]);
        index += 1;
      }
    }
    return pieces.join(" ");
  }

  function normalizeEnglishPunctuation(value) {
    return value
      .replace(/，/g, ", ")
      .replace(/。/g, ". ")
      .replace(/；/g, "; ")
      .replace(/：/g, ": ")
      .replace(/！/g, "! ")
      .replace(/？/g, "? ")
      .replace(/（/g, " (")
      .replace(/）/g, ") ")
      .replace(/“/g, " ‘")
      .replace(/”/g, "’ ")
      .replace(/[‘’]/g, "'")
      .replace(/、/g, ", ")
      .replace(/《/g, '"')
      .replace(/》/g, '"')
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")")
      .replace(/[ \t]{2,}/g, " ");
  }

  function t(value) {
    const source = String(value ?? "");
    if (language !== "en" || !HAN_TEST_PATTERN.test(source)) return source;
    if (translationCache.has(source)) return translationCache.get(source);
    const leading = source.match(/^\s*/)?.[0] || "";
    const trailing = source.match(/\s*$/)?.[0] || "";
    const core = source.slice(leading.length, source.length - trailing.length || source.length);
    let translated = translations[core];
    if (translated) translated = /[。！？]$/.test(core) ? translated.trim() : cleanEnglishPhrase(translated);
    if (!translated) {
      for (const formatter of formatters) {
        translated = formatter(core, t);
        if (translated != null) break;
      }
    }
    if (translated == null) {
      translated = core.replace(HAN_PATTERN, (run, offset) => {
        const phrase = translateHanRun(run);
        const before = core[offset - 1] || "";
        const after = core[offset + run.length] || "";
        return `${/[A-Za-z0-9]/.test(before) ? " " : ""}${phrase}${/[A-Za-z0-9]/.test(after) ? " " : ""}`;
      });
    }
    const result = `${leading}${normalizeEnglishPunctuation(translated).trim()}${trailing}`;
    if (translationCache.size >= 6000) translationCache.delete(translationCache.keys().next().value);
    translationCache.set(source, result);
    return result;
  }

  function isStaticNode(node) {
    const parent = node?.parentElement;
    return !parent || Boolean(parent.closest("script, style, template, noscript, [data-i18n-static]"));
  }

  function translateTextNode(node) {
    if (!node || isStaticNode(node)) return;
    const current = String(node.nodeValue || "");
    if (language === "en") {
      if (HAN_TEST_PATTERN.test(current)) {
        const previous = originalText.get(node);
        if (previous?.translated === current && previous.source !== current) return;
        const translated = node.parentElement?.getAttribute?.("data-i18n-en") || t(current);
        originalText.set(node, { source: current, translated });
        if (current !== translated) node.nodeValue = translated;
      } else if (!originalText.has(node)) {
        originalText.set(node, { source: current, translated: current });
      }
      return;
    }
    const previous = originalText.get(node);
    if (previous && current === previous.translated) node.nodeValue = previous.source;
    originalText.set(node, { source: node.nodeValue, translated: node.nodeValue });
  }

  function attributeStore(element) {
    let values = originalAttributes.get(element);
    if (!values) {
      values = new Map();
      originalAttributes.set(element, values);
    }
    return values;
  }

  function translateAttributes(element) {
    if (!(element instanceof Element) || element.closest("[data-i18n-static]")) return;
    const values = attributeStore(element);
    for (const name of ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name) || "";
      if (language === "en") {
        if (HAN_TEST_PATTERN.test(current)) {
          const previous = values.get(name);
          if (previous?.translated === current && previous.source !== current) continue;
          const translated = t(current);
          values.set(name, { source: current, translated });
          if (current !== translated) element.setAttribute(name, translated);
        } else if (!values.has(name)) {
          values.set(name, { source: current, translated: current });
        }
      } else if (values.has(name)) {
        const previous = values.get(name);
        if (current === previous.translated) element.setAttribute(name, previous.source);
        values.set(name, { source: element.getAttribute(name), translated: element.getAttribute(name) });
      } else {
        values.set(name, { source: current, translated: current });
      }
    }
  }

  function translateTree(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === Node.TEXT_NODE) translateTextNode(rootNode);
    if (rootNode.nodeType === Node.ELEMENT_NODE) translateAttributes(rootNode);
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateAttributes(node);
      node = walker.nextNode();
    }
  }

  function observe() {
    if (!document.documentElement || language !== "en") return;
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      observer.disconnect();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateTextNode(mutation.target);
        if (mutation.type === "attributes") translateAttributes(mutation.target);
        for (const node of mutation.addedNodes || []) translateTree(node);
      }
      observe();
    });
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }

  function syncControls() {
    document.querySelectorAll("[data-app-language]").forEach((button) => {
      const active = button.dataset.appLanguage === language;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function applyLanguage(nextLanguage, emit = true) {
    const normalized = nextLanguage === "en" ? "en" : "zh";
    const changed = normalized !== language;
    language = normalized;
    translationCache.clear();
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    if (document.body) document.body.dataset.language = language;
    observer?.disconnect();
    translateTree(document.documentElement);
    syncControls();
    observe();
    if (document.body) document.body.dataset.i18nFallbackCount = String(fallbackCount);
    if (emit && changed) root.dispatchEvent(new CustomEvent("app-language-change", { detail: { language } }));
  }

  function bindControls() {
    document.querySelectorAll("[data-app-language]").forEach((button) => {
      button.addEventListener("click", () => applyLanguage(button.dataset.appLanguage));
    });
  }

  function patchCanvasText() {
    const prototype = root.CanvasRenderingContext2D?.prototype;
    if (!prototype || prototype.__spaceMapI18nPatched) return;
    const nativeFillText = prototype.fillText;
    const nativeStrokeText = prototype.strokeText;
    const nativeMeasureText = prototype.measureText;
    prototype.fillText = function localizedFillText(text, ...args) {
      return nativeFillText.call(this, t(text), ...args);
    };
    prototype.strokeText = function localizedStrokeText(text, ...args) {
      return nativeStrokeText.call(this, t(text), ...args);
    };
    prototype.measureText = function localizedMeasureText(text) {
      return nativeMeasureText.call(this, t(text));
    };
    Object.defineProperty(prototype, "__spaceMapI18nPatched", { value: true });
  }

  const api = {
    t,
    setLanguage: applyLanguage,
    get language() { return language; },
    get isEnglish() { return language === "en"; },
    get fallbackTerms() { return [...fallbackTerms]; },
    get fallbackRuns() { return [...fallbackRuns]; },
    translateTree,
  };
  root.AppI18n = api;
  patchCanvasText();
  bindControls();
  applyLanguage(language, false);
})(typeof globalThis !== "undefined" ? globalThis : window);
