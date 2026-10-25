/* app.js — 网页版「今日穿搭」：天气获取 + 女装推荐 + 渲染
 * 纯前端，无需打包；天气数据来自 Open-Meteo（免 Key，支持 CORS）。
 * 逻辑与小程序的 utils/ 完全一致，仅把 module.exports 改为浏览器全局。
 */

/* ====================== 天气：Open-Meteo ====================== */
const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WX_URL = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT = 10000;

const WMO_CN = {
  0: '晴', 1: '大部晴朗', 2: '局部多云', 3: '阴',
  45: '雾', 48: '冻雾',
  51: '小毛毛雨', 53: '毛毛雨', 55: '浓毛毛雨',
  56: '冻毛毛雨', 57: '浓冻毛毛雨',
  61: '小雨', 63: '中雨', 65: '大雨',
  66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '米雪',
  80: '小阵雨', 81: '中阵雨', 82: '强阵雨',
  85: '小阵雪', 86: '大阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '雷阵雨伴强冰雹',
};
const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const STORM_CODES = [95, 96, 99];
const FOG_CODES = [45, 48];
const CLEAR_CODES = [0, 1, 2];
const WINDY_KMPH = 20;
const inList = (code, list) => list.indexOf(code) !== -1;

function codeToEmoji(code) {
  if (inList(code, STORM_CODES)) return '⛈️';
  if (inList(code, SNOW_CODES)) return '❄️';
  if (inList(code, RAIN_CODES)) return '🌧️';
  if (inList(code, FOG_CODES)) return '🌫️';
  if (inList(code, CLEAR_CODES)) return '☀️';
  return '☁️';
}

function buildUrl(base, params) {
  const qs = Object.keys(params || {})
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
  return qs ? `${base}?${qs}` : base;
}

function httpGet(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  return fetch(url, { signal: ctrl.signal })
    .then((res) => {
      clearTimeout(t);
      if (!res.ok) throw new Error(`天气服务返回 HTTP ${res.status}`);
      return res.json();
    })
    .catch((err) => {
      clearTimeout(t);
      throw err;
    });
}

function searchCity(name) {
  const url = buildUrl(GEO_URL, { name, count: 8, language: 'zh', format: 'json' });
  return httpGet(url).then((data) => {
    const list = (data && data.results) || [];
    return list.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      region: r.admin1 || '',
      district: r.admin2 || '',
      country: r.country || '',
      timezone: r.timezone || '',
      label: [r.name, r.admin1, r.country].filter(Boolean).join(' · '),
    }));
  });
}

function fetchByLatLon(lat, lon, placeName) {
  const url = buildUrl(WX_URL, {
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,uv_index,precipitation',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: 1,
  });
  return httpGet(url).then((data) => normalize(data, placeName));
}

function normalize(data, placeName) {
  const cur = (data && data.current) || {};
  const daily = (data && data.daily) || {};
  const pick = (arr, i) => (Array.isArray(arr) && arr.length > i ? arr[i] : null);
  const code = cur.weather_code !== undefined ? cur.weather_code : pick(daily.weather_code, 0);
  const numCode = Number(code) || 0;
  const temp = typeof cur.temperature_2m === 'number' ? cur.temperature_2m : 0;
  const feels = typeof cur.apparent_temperature === 'number' ? cur.apparent_temperature : temp;

  return {
    city: placeName || '当前位置',
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone || '',
    temperature: Math.round(temp * 10) / 10,
    feelsLike: Math.round(feels * 10) / 10,
    tempMax: pick(daily.temperature_2m_max, 0),
    tempMin: pick(daily.temperature_2m_min, 0),
    humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
    windKmph: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m * 10) / 10 : 0,
    windMax: pick(daily.wind_speed_10m_max, 0),
    precipMm: cur.precipitation != null ? cur.precipitation : 0,
    precipProb: pick(daily.precipitation_probability_max, 0),
    uvIndex: cur.uv_index != null ? cur.uv_index : 0,
    uvMax: pick(daily.uv_index_max, 0),
    code: numCode,
    condition: WMO_CN[numCode] || '未知',
    isRain: inList(numCode, RAIN_CODES),
    isSnow: inList(numCode, SNOW_CODES),
    isStorm: inList(numCode, STORM_CODES),
    isFog: inList(numCode, FOG_CODES),
    isClear: inList(numCode, CLEAR_CODES),
    isWindy: (cur.wind_speed_10m || 0) >= WINDY_KMPH || (pick(daily.wind_speed_10m_max, 0) || 0) >= WINDY_KMPH,
    source: 'Open-Meteo',
  };
}

function getWeatherByCity(name) {
  return searchCity(name).then((list) => {
    if (!list.length) throw new Error(`没找到「${name}」，换一个城市名试试`);
    const top = list[0];
    return fetchByLatLon(top.latitude, top.longitude, top.name).then((w) => {
      w.region = top.region;
      w.candidates = list;
      return w;
    });
  });
}

/* ====================== 女装单品库 ====================== */
function item(brand, name, reason) { return { brand, name, reason }; }

const WARDROBE = {
  cold: {
    image: 'images/cold.jpg',
    alt: '焦糖色长款大衣 · 短靴 · 链条包（雪地街拍）',
    外套: [
      item('ZARA', '双面呢长款大衣', '落肩直筒版型，垂坠感好、不压身高，比羽绒显瘦，通勤也压得住场'),
      item('优衣库 UNIQLO', '高级轻型羽绒大衣（女装）', '零下也能扛，收起来只有一小卷，肩线利落不显臃肿'),
    ],
    上衣: [
      item('优衣库 UNIQLO', '羊绒混纺高领针织', '高领护住脖子，细针距不显壮，单穿或叠在大衣里都显气质'),
      item('GU', '摇粒绒高领打底', '几十块的保暖中层，领口不扎，做内搭几乎不占厚度'),
    ],
    下装: [
      item('UR Urban Revivo', '高腰直筒西裤', '高腰 + 直筒拉长腿部线条，裤线挺括，里面能再塞保暖裤'),
      item('优衣库 UNIQLO', '羊毛混纺直筒裤', '有垂感不贴腿，遮肉显瘦，冬天单穿也不冰腿'),
    ],
    鞋履: [
      item('ZARA', '方头切尔西短靴', '方头比方圆头更时髦，粗跟稳当，配大衣和西裤都利落'),
    ],
    配饰: [
      item('优衣库 UNIQLO', '羊绒围巾 + 针织手套', '护住脖子和手，体感能高两三度，素色最好搭'),
    ],
  },
  cool: {
    image: 'images/cool.jpg',
    alt: '卡其风衣 · 白直筒裤 · 工装短靴（秋日街拍）',
    外套: [
      item('ZARA', '双排扣经典风衣', '卡其色最耐看，腰带收一下就有腰线，敞开穿也不塌肩'),
      item('UR Urban Revivo', '短款西装外套', '正肩短款，显肩平、显腰细，小个子也能撑起来'),
    ],
    上衣: [
      item('优衣库 UNIQLO', '精纺美利奴针织衫', '薄而不透，贴身穿不扎，版型收得干净，塞进裤腰很精神'),
      item('GU', '竖条纹衬衫', '竖条纹显瘦，宽松版型当薄外套也成立，越洗越软'),
    ],
    下装: [
      item('优衣库 UNIQLO', '高腰直筒牛仔裤', '高腰直筒修饰腿型，四季都能穿，越穿越有味道'),
      item('UR Urban Revivo', '西装阔腿裤', '面料有垂坠感，走路带风，遮胯显腿长'),
    ],
    鞋履: [
      item('ZARA', '乐福鞋', '一脚蹬通勤最省事，鞋型秀气，配西裤和牛仔都行'),
      item('回力 Warrior', '低帮帆布鞋', '雨天以外最百搭，便宜耐穿，走一天也不累'),
    ],
    配饰: [
      item('优衣库 UNIQLO', '薄款羊毛围巾', '早晚温差大时护住脖子，比再加一件衣服省事'),
    ],
  },
  warm: {
    image: 'images/warm.jpg',
    alt: '粉色针织开衫 · 白色纱裙 · 玛丽珍鞋（春日街拍）',
    外套: [
      item('优衣库 UNIQLO', '可机洗针织开衫', '当薄外套刚好，短款收腰显比例，机洗也不变形'),
    ],
    上衣: [
      item('优衣库 UNIQLO', '棉质宽松衬衫', '纯棉透气，落肩版型慵懒不显壮，扎进裙子立刻有腰线'),
      item('GU', '方领针织短袖', '方领露锁骨、显脖子长，针织有回弹，贴身穿也不勒'),
    ],
    下装: [
      item('优衣库 UNIQLO', '高腰直筒牛仔裤', '衣橱里最不会出错的一条，配衬衫和针织都成立'),
      item('UR Urban Revivo', '缎面中长半裙', '微光泽显质感，A 字版型遮胯，走动有流动感'),
    ],
    鞋履: [
      item('ZARA', '玛丽珍单鞋', '圆头 + 一根带，甜而不腻，配裙子和小白裤都很出片'),
      item('回力 Warrior', '小白鞋', '平价百搭，走路轻，配牛仔是永远的安全答案'),
    ],
    配饰: [
      item('蕉下 Beneunder', '冰薄防晒袖套', '骑车、开车时护住小臂，比反复补涂防晒省事'),
    ],
  },
  hot: {
    image: 'images/hot.jpg',
    alt: '白色阔腿套装 · 草帽 · 编织包（夏日街拍）',
    外套: [
      item('蕉下 Beneunder', '凉感防晒衣 AS599（UPF100+）', '原纱防晒可水洗，护颈口 + 帽檐一体，版型宽松不闷热'),
    ],
    上衣: [
      item('优衣库 UNIQLO', '亚麻混纺衬衫', '亚麻透气不闷汗，版型微宽松，敞开当薄外套也很高级'),
      item('GU', '方领短袖针织', '方领 + 短袖显肩颈线条，透气不贴身，比普通T有设计感'),
    ],
    下装: [
      item('优衣库 UNIQLO', '亚麻混纺半裙', '垂坠不贴腿，长度到小腿最显瘦，走路有风'),
      item('UR Urban Revivo', '高腰阔腿短裤', '裤口偏宽显腿细，高腰提高腰线，比紧身短裤更体面'),
    ],
    鞋履: [
      item('ZARA', '细带平底凉鞋', '细带显脚背细，平底好走，配裙子和短裤都清爽'),
      item('迪卡侬 DECATHLON', '女款运动凉鞋', '暴雨后蹚水也不心疼，排水快、抓地稳'),
    ],
    配饰: [
      item('蕉下 Beneunder', '防晒帽 + 冰薄口罩', '硬防晒比补涂防晒霜靠谱，午后通勤护住脸和脖子'),
    ],
  },
};

const ADDONS = {
  rain: [
    { category: '配饰', replace: false, items: [item('蕉下 Beneunder', '胶囊伞（五折 / 三折）', '小到能塞进小包，突然下雨不慌，浅色比黑色更好搭')] },
    { category: '鞋履', replace: true, items: [
      item('ZARA', '防水短靴', '皮面挡水，配风衣和裙子都好看，踩水不心疼'),
      item('迪卡侬 DECATHLON', '女款防水徒步鞋', '真要长时间走湿地就换它，抓地稳、不磨脚'),
    ] },
  ],
  snow: [
    { category: '鞋履', replace: true, items: [item('迪卡侬 DECATHLON', '女款保暖防水雪地靴', '深纹防滑底，雪地结冰也不容易摔，内里加绒不冻脚')] },
  ],
  wind: [
    { category: '外套', replace: false, items: [item('ZARA', '防风风衣', '挡风不闷，收腰版型不被吹成麻袋，通勤体面')] },
  ],
  uv: [
    { category: '外套', replace: false, items: [item('蕉下 Beneunder', '凉感防晒衣 AS599（UPF100+）', '硬防晒比补涂防晒霜更靠谱，原纱防晒可水洗')] },
    { category: '配饰', replace: false, items: [item('蕉下 Beneunder', '偏光太阳镜', '正午强光下护眼，还能顺便修饰脸型')] },
  ],
  storm: [
    { category: '配饰', replace: false, items: [item('蕉下 Beneunder', '胶囊伞（抗风款）', '雷雨天尽量少外出，别在空旷处撑伞')] },
  ],
  humidHot: [
    { category: '上衣', replace: false, items: [item('优衣库 UNIQLO', 'AIRism 凉感上衣', '闷热天比纯棉干得快，不贴背、不留汗痕')] },
  ],
};

/* ====================== 推荐引擎 ====================== */
const BANDS = [
  { key: 'cold', upper: 10, name: '寒冷', range: '低于 10 ℃', emoji: '🥶' },
  { key: 'cool', upper: 20, name: '凉爽', range: '10 ~ 20 ℃', emoji: '🍂' },
  { key: 'warm', upper: 28, name: '温暖', range: '20 ~ 28 ℃', emoji: '🌤️' },
  { key: 'hot', upper: null, name: '炎热', range: '28 ℃ 及以上', emoji: '🔥' },
];
const CATEGORY_ORDER = ['外套', '上衣', '下装', '鞋履', '配饰'];
const CAT_EMOJI = { 外套: '🧥', 上衣: '👚', 下装: '👖', 鞋履: '👟', 配饰: '🧣' };
const UV_STRONG = 6;
const HUMID_HOT = 70;
const TEMP_GAP = 10;
const EXCLUSIVE_KEYWORDS = ['伞'];

function matchBand(temp) {
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    if (b.upper === null || temp < b.upper) return b;
  }
  return BANDS[BANDS.length - 1];
}

function recommend(w) {
  const tempUsed = (w.tempMax != null ? w.tempMax : w.temperature);
  const band = matchBand(tempUsed);
  const base = WARDROBE[band.key] || {};
  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    emoji: CAT_EMOJI[cat],
    items: (base[cat] || []).slice(),
  }));

  const tips = [];
  const addons = [];

  if (w.isRain) {
    addons.push(...ADDONS.rain);
    tips.push(`有雨（降水概率 ${w.precipProb}%），雨伞和防水鞋安排上。`);
  }
  if (w.isSnow) {
    addons.push(...ADDONS.snow);
    tips.push('有雪，鞋底一定要防滑，别穿平底鞋。');
  }
  if (w.isStorm) {
    addons.push(...ADDONS.storm);
    tips.push('有雷阵雨，尽量减少户外停留，别在空旷处撑伞。');
  }
  if (w.isFog) {
    tips.push('有雾/霾，能见度低，建议穿颜色鲜艳的衣物。');
  }
  if ((w.uvMax || 0) >= UV_STRONG) {
    addons.push(...ADDONS.uv);
    tips.push(`今日紫外线指数最高 ${w.uvMax}，硬防晒（防晒衣/墨镜）比补涂防晒霜更管用。`);
  }
  if (w.isWindy) {
    addons.push(...ADDONS.wind);
    tips.push(`风较大（最大 ${w.windMax} km/h），外套选防风的，帽子容易被吹飞就别戴了。`);
  }
  if (tempUsed >= 28 && (w.humidity || 0) >= HUMID_HOT) {
    addons.push(...ADDONS.humidHot);
    tips.push(`湿度 ${w.humidity}% 且高温，闷热感明显，优先速干面料。`);
  }
  if ((w.isRain || w.isSnow) && (w.feelsLike != null ? w.feelsLike : tempUsed) < 10) {
    tips.push('又湿又冷，体感比气温更低，内层保暖 + 外层防水才扛得住。');
  }
  if (w.tempMax != null && w.tempMin != null && (w.tempMax - w.tempMin) >= TEMP_GAP) {
    tips.push(`今天温差 ${Math.round(w.tempMax - w.tempMin)}℃（${w.tempMin}℃ ~ ${w.tempMax}℃），按叠穿准备，方便穿脱。`);
  }

  addons.forEach((a) => {
    let g = groups.filter((x) => x.category === a.category)[0];
    if (!g) {
      g = { category: a.category, emoji: CAT_EMOJI[a.category] || '•', items: [] };
      groups.push(g);
    }
    if (a.replace) {
      g.items = a.items.slice();
    } else {
      a.items.forEach((it) => {
        const dup = g.items.some((x) => x.name === it.name && x.brand === it.brand);
        if (dup) return;
        const kw = EXCLUSIVE_KEYWORDS.filter((k) => it.name.indexOf(k) !== -1)[0];
        if (kw) g.items = g.items.filter((x) => x.name.indexOf(kw) === -1);
        g.items.push(it);
      });
    }
  });

  const finalGroups = groups.filter((g) => g.items && g.items.length);

  const extras = [];
  if (w.isSnow) {
    extras.push({ key: 'snow', src: 'images/rain.jpg', label: '雨雪天这样加' });
  } else if (w.isRain || w.isStorm) {
    extras.push({ key: 'rain', src: 'images/rain.jpg', label: '雨天这样加' });
  }
  if ((w.uvMax || 0) >= UV_STRONG) {
    extras.push({ key: 'uv', src: 'images/sun.jpg', label: '强紫外线这样加' });
  }

  return {
    band: { key: band.key, name: band.name, range: band.range, emoji: band.emoji },
    heroImage: base.image || '',
    heroAlt: base.alt || '',
    extras,
    tempUsed: Math.round(tempUsed * 10) / 10,
    groups: finalGroups,
    tips,
  };
}

/* ====================== 渲染 ====================== */
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function setStatus(msg, isError) {
  const el = $('statusLine');
  el.textContent = msg || '';
  el.className = 'hint' + (isError ? ' error' : '');
}

function showLoading(on) {
  $('loading').classList.toggle('hidden', !on);
  if (on) {
    $('result').classList.add('hidden');
    $('empty').classList.add('hidden');
  }
}

function renderWeather(w) {
  $('wCity').textContent = w.city || '—';
  $('wRegion').textContent = w.region || '';
  $('wEmoji').textContent = codeToEmoji(w.code);
  $('wCond').textContent = w.condition || '—';
  $('wTemp').textContent = (w.temperature != null ? w.temperature : '—');
  $('wFeels').textContent = '体感 ' + (w.feelsLike != null ? w.feelsLike : '—') + '℃';
  $('wHL').textContent = (w.tempMin != null ? w.tempMin : '—') + ' ~ ' + (w.tempMax != null ? w.tempMax : '—') + '℃';

  const stats = [
    { k: '湿度', v: (w.humidity != null ? w.humidity : '—') + '%' },
    { k: '风', v: (w.windKmph != null ? w.windKmph : '—') + '' },
    { k: '紫外线', v: (w.uvIndex != null ? w.uvIndex : '—') },
    { k: '降水概率', v: (w.precipProb != null ? w.precipProb : '—') + '%' },
  ];
  $('wStats').innerHTML = stats.map((s) =>
    `<div class="stat"><div class="v">${esc(s.v)}</div><div class="k">${esc(s.k)}</div></div>`
  ).join('');
}

function renderOutfit(rec) {
  $('heroImg').src = rec.heroImage;
  $('heroImg').alt = rec.heroAlt;
  $('heroBadge').textContent = `${rec.band.emoji} ${rec.band.name}档`;
  $('heroCaption').textContent = `${rec.band.emoji} ${rec.band.name}档 · 整套这样穿（女装参考）：${rec.heroAlt}`;

  const extraBox = $('extraImgs');
  extraBox.innerHTML = (rec.extras || []).map((e) =>
    `<div class="extra-card"><img src="${esc(e.src)}" alt="${esc(e.label)}" loading="lazy" /><span class="lbl">${esc(e.label)}</span></div>`
  ).join('');

  $('itemGroups').innerHTML = rec.groups.map((g) => `
    <div class="item-group">
      <div class="group-head">${g.emoji} ${esc(g.category)}</div>
      ${g.items.map((it) => `
        <div class="item">
          <div class="item-emoji">${g.emoji}</div>
          <div class="item-body">
            <div class="item-name">${esc(it.name)}<span class="item-brand">${esc(it.brand)}</span></div>
            <div class="item-reason">${esc(it.reason)}</div>
          </div>
        </div>`).join('')}
    </div>`).join('');

  const tipsSection = $('tipsSection');
  if (rec.tips && rec.tips.length) {
    $('tipsList').innerHTML = rec.tips.map((t) => `<li>${esc(t)}</li>`).join('');
    tipsSection.classList.remove('hidden');
  } else {
    tipsSection.classList.add('hidden');
  }
}

function renderAll(w) {
  const rec = recommend(w);
  renderWeather(w);
  renderOutfit(rec);
  $('empty').classList.add('hidden');
  $('result').classList.remove('hidden');
}

function run(cityName) {
  const name = (cityName || '').trim();
  if (!name) { setStatus('请输入城市名', true); return; }
  showLoading(true);
  setStatus('');
  getWeatherByCity(name)
    .then((w) => { showLoading(false); renderAll(w); })
    .catch((err) => {
      showLoading(false);
      setStatus(err && err.message ? err.message : '查询失败，请稍后重试', true);
    });
}

/* ====================== 事件 ====================== */
$('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  run($('cityInput').value);
});

$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { setStatus('当前浏览器不支持定位', true); return; }
  setStatus('正在获取定位…');
  showLoading(true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      fetchByLatLon(latitude, longitude, '我的位置')
        .then((w) => { showLoading(false); renderAll(w); })
        .catch((err) => {
          showLoading(false);
          setStatus(err && err.message ? err.message : '定位查询失败', true);
        });
    },
    (err) => {
      showLoading(false);
      setStatus('定位失败：' + (err && err.message ? err.message : '已取消'), true);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
});

// 默认给个示例城市，避免一进来是空白
window.addEventListener('DOMContentLoaded', () => {
  run('北京');
});
