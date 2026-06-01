const DATA_URL = "resources/public_highschools.csv";
const POSTAL_API = "https://geoapi.heartrails.com/api/json?method=searchByPostal&postal=";

const stateKeys = [
  "q",
  "pref",
  "city",
  "sector",
  "gender",
  "devMin",
  "devMax",
  "naishinMin",
  "naishinMax",
  "naishinClass",
  "postal",
  "sort",
  "dir",
];

const defaultState = {
  q: "",
  pref: "",
  city: "",
  sector: "",
  gender: "",
  devMin: "",
  devMax: "",
  naishinMin: "",
  naishinMax: "",
  naishinClass: "",
  postal: "",
  sort: "deviation",
  dir: "desc",
};

const els = {};
let allRows = [];
let map;
let markersLayer;
let markerBySchoolId = new Map();
let postalPoint = null;
let postalMessage = "";
let postalCache = new Map();
let filterTimer;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheElements();
  initMap();
  bindEvents();

  try {
    const csv = await fetch(DATA_URL).then((response) => {
      if (!response.ok) throw new Error(`CSV読み込み失敗: ${response.status}`);
      return response.text();
    });
    allRows = parseCsv(csv).map(normalizeRow);
    populateFilters();
    applyState(readStateFromUrl());
    await update({ preserveUrl: true });
  } catch (error) {
    setStatus(error.message, true);
  }
}

function cacheElements() {
  for (const key of stateKeys) {
    els[key] = document.getElementById(key);
  }
  els.filters = document.getElementById("filters");
  els.cards = document.getElementById("cards");
  els.status = document.getElementById("status");
  els.recordCount = document.getElementById("recordCount");
  els.schoolCount = document.getElementById("schoolCount");
  els.avgDeviation = document.getElementById("avgDeviation");
  els.naishinCount = document.getElementById("naishinCount");
  els.visibleSummary = document.getElementById("visibleSummary");
  els.copyUrlButton = document.getElementById("copyUrlButton");
  els.resetButton = document.getElementById("resetButton");
}

function initMap() {
  map = L.map("map", { scrollWheelZoom: false }).setView([35.88, 139.62], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
}

function bindEvents() {
  els.filters.addEventListener("input", scheduleUpdate);
  els.filters.addEventListener("change", scheduleUpdate);
  els.copyUrlButton.addEventListener("click", copyCurrentUrl);
  els.resetButton.addEventListener("click", async () => {
    applyState(defaultState);
    postalPoint = null;
    await update();
  });
  els.cards.addEventListener("click", (event) => {
    const button = event.target.closest("[data-focus-school]");
    if (!button) return;
    const marker = markerBySchoolId.get(button.dataset.focusSchool);
    if (marker) {
      map.setView(marker.getLatLng(), 14);
      marker.openPopup();
    }
  });
}

function scheduleUpdate() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => update(), 180);
}

async function update(options = {}) {
  const state = getState();
  await resolvePostalPoint(state.postal);

  if (state.sort === "distance" && !postalPoint) {
    state.sort = "deviation";
    els.sort.value = "deviation";
  }

  const filtered = sortRows(filterRows(allRows, state), state);
  renderSummary(filtered);
  renderCards(filtered);
  renderMap(filtered);

  if (!options.preserveUrl) writeStateToUrl(getState());
  setStatus(buildStatusText(filtered, state), Boolean(postalMessage));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])),
  );
}

function normalizeRow(row) {
  const deviation = toNumber(row["標準偏差値"]);
  const naishinMin = toNumber(row["内申点_min"]);
  const naishinMax = toNumber(row["内申点_max"]);
  const naishin = toNumber(row["内申点"]);
  const lat = toNumber(row["代表点緯度"]);
  const lng = toNumber(row["代表点経度"]);
  const founded = toNumber(row["創立年_西暦"]);

  return {
    ...row,
    deviation,
    naishinMin,
    naishinMax,
    naishin: Number.isFinite(naishin) ? naishin : averageNumbers([naishinMin, naishinMax]),
    lat,
    lng,
    founded,
    postalAreaLabel: row["代表点ラベル"],
    searchable: [
      row["高校名"],
      row["高校名かな"],
      row["学科名"],
      row["住所"],
      row["市区町村"],
    ].join(" ").toLowerCase(),
  };
}

function populateFilters() {
  fillSelect(els.pref, "すべて", uniqueValues("都道府県"));
  fillSelect(els.city, "すべて", uniqueValues("市区町村"));
  fillSelect(els.sector, "すべて", uniqueValues("公立/私立/国立"));
  fillSelect(els.gender, "すべて", uniqueValues("共学/男子校/女子校"));
  fillSelect(els.naishinClass, "すべて", uniqueValues("内申点_classification"));
}

function fillSelect(select, emptyLabel, values) {
  select.replaceChildren(new Option(emptyLabel, ""));
  for (const value of values) {
    select.append(new Option(value, value));
  }
}

function uniqueValues(column) {
  return [...new Set(allRows.map((row) => row[column]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );
}

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(stateKeys.map((key) => [key, params.get(key) ?? defaultState[key]]));
}

function applyState(state) {
  for (const key of stateKeys) {
    if (!els[key]) continue;
    if (els[key].type === "checkbox") {
      els[key].checked = state[key] === "1";
    } else {
      els[key].value = state[key] ?? defaultState[key] ?? "";
    }
  }
}

function getState() {
  return Object.fromEntries(
    stateKeys.map((key) => {
      const element = els[key];
      return [key, element.type === "checkbox" ? (element.checked ? "1" : "") : element.value.trim()];
    }),
  );
}

function writeStateToUrl(state) {
  const params = new URLSearchParams();
  for (const key of stateKeys) {
    const value = state[key];
    if (value && value !== defaultState[key]) params.set(key, value);
  }
  const query = params.toString();
  history.replaceState(null, "", query ? `${location.pathname}?${query}` : location.pathname);
}

function filterRows(rows, state) {
  const query = state.q.toLowerCase();
  const devMin = toNumber(state.devMin);
  const devMax = toNumber(state.devMax);
  const naishinMin = toNumber(state.naishinMin);
  const naishinMax = toNumber(state.naishinMax);

  return rows.filter((row) => {
    if (query && !row.searchable.includes(query)) return false;
    if (state.pref && row["都道府県"] !== state.pref) return false;
    if (state.city && row["市区町村"] !== state.city) return false;
    if (state.sector && row["公立/私立/国立"] !== state.sector) return false;
    if (state.gender && row["共学/男子校/女子校"] !== state.gender) return false;
    if (state.naishinClass && row["内申点_classification"] !== state.naishinClass) return false;
    if (Number.isFinite(devMin) && (!Number.isFinite(row.deviation) || row.deviation < devMin)) return false;
    if (Number.isFinite(devMax) && (!Number.isFinite(row.deviation) || row.deviation > devMax)) return false;
    if (Number.isFinite(naishinMin) && (!Number.isFinite(row.naishin) || row.naishin < naishinMin)) return false;
    if (Number.isFinite(naishinMax) && (!Number.isFinite(row.naishin) || row.naishin > naishinMax)) return false;
    return true;
  });
}

function sortRows(rows, state) {
  const direction = state.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let result = 0;
    if (state.sort === "name") {
      result = a["高校名かな"].localeCompare(b["高校名かな"], "ja");
    } else if (state.sort === "area") {
      result = `${a["都道府県"]}${a["市区町村"]}${a["高校名かな"]}`.localeCompare(
        `${b["都道府県"]}${b["市区町村"]}${b["高校名かな"]}`,
        "ja",
      );
    } else if (state.sort === "founded") {
      result = compareNumber(a.founded, b.founded, direction);
    } else if (state.sort === "naishin") {
      result = compareNumber(a.naishin, b.naishin, direction);
    } else if (state.sort === "distance") {
      result = compareNumber(distanceFromPostal(a), distanceFromPostal(b), direction);
    } else {
      result = compareNumber(a.deviation, b.deviation, direction);
    }

    if (result === 0) {
      result = a["高校名かな"].localeCompare(b["高校名かな"], "ja") || a["学科名"].localeCompare(b["学科名"], "ja");
    }
    return state.sort === "name" || state.sort === "area" ? result * direction : result;
  });
}

function compareNumber(a, b, direction) {
  const aValid = Number.isFinite(a);
  const bValid = Number.isFinite(b);
  if (!aValid && !bValid) return 0;
  if (!aValid) return 1;
  if (!bValid) return -1;
  return (a - b) * direction;
}

async function resolvePostalPoint(postalInput) {
  const postal = normalizePostal(postalInput);
  postalPoint = null;
  postalMessage = "";
  els.sort.querySelector('option[value="distance"]').disabled = true;

  if (!postalInput) return;
  if (postal.length !== 7) {
    postalMessage = "基準郵便番号は7桁で入力してください。距離ソートは無効です。";
    return;
  }

  postalPoint = await fetchPostalPoint(postal);
  if (postalPoint) {
    els.sort.querySelector('option[value="distance"]').disabled = false;
  } else {
    postalMessage = "該当する郵便番号が見つかりません。距離ソートは無効です。";
  }
}

async function fetchPostalPoint(postal) {
  if (!postal || postal.length !== 7) return null;
  if (postalCache.has(postal)) return postalCache.get(postal);

  try {
    const response = await fetch(`${POSTAL_API}${postal}`);
    if (!response.ok) throw new Error("postal lookup failed");
    const json = await response.json();
    const locations = json.response?.location ?? [];
    if (!locations.length) throw new Error("postal not found");
    const point = {
      lat: averageNumbers(locations.map((item) => toNumber(item.y))),
      lng: averageNumbers(locations.map((item) => toNumber(item.x))),
      label: locations.map((item) => `${item.prefecture}${item.city}${item.town}`).join(" / "),
    };
    postalCache.set(postal, point);
    return point;
  } catch {
    postalCache.set(postal, null);
    return null;
  }
}

function distanceFromPostal(row) {
  if (!postalPoint || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return NaN;
  return haversineKm(postalPoint.lat, postalPoint.lng, row.lat, row.lng);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const radius = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function renderSummary(rows) {
  const schools = new Set(rows.map((row) => row.school_id));
  const deviations = rows.map((row) => row.deviation).filter(Number.isFinite);
  const naishinRows = rows.filter((row) => row["内申点_classification"] === "取得済み");
  els.recordCount.textContent = rows.length.toLocaleString("ja-JP");
  els.schoolCount.textContent = schools.size.toLocaleString("ja-JP");
  els.avgDeviation.textContent = deviations.length ? averageNumbers(deviations).toFixed(1) : "-";
  els.naishinCount.textContent = naishinRows.length.toLocaleString("ja-JP");
  els.visibleSummary.textContent = `${rows.length}件 / ${schools.size}校`;
}

function renderCards(rows) {
  if (!rows.length) {
    els.cards.replaceChildren(emptyMessage("条件に一致する高校がありません。"));
    return;
  }

  els.cards.replaceChildren(...rows.map((row, index) => createCard(row, index)));
}

function createCard(row, index) {
  const card = document.createElement("article");
  card.className = index >= 4 ? "school-card deferred" : "school-card";

  const distance = distanceFromPostal(row);
  const naishinLabel = row["内申点_app_display"] || row["内申点"] || row["内申点_classification"] || "-";
  const mapsUrl = buildMapsUrl(row);

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="school-title">
          <h3>${escapeHtml(row["高校名"])}</h3>
          <span class="kana">${escapeHtml(row["高校名かな"])}</span>
        </div>
        <p class="meta">${escapeHtml(row["学科名"])} / ${escapeHtml(row["課程"])} / ${escapeHtml(row["市区町村"])}</p>
      </div>
      <button type="button" class="map-focus" data-focus-school="${escapeHtml(row.school_id)}">地図で見る</button>
    </div>
    <div class="badges">
      <span class="badge">${escapeHtml(row["公立/私立/国立"])}</span>
      <span class="badge">${escapeHtml(row["共学/男子校/女子校"])}</span>
      <span class="badge">${escapeHtml(row["内申点_classification"])}</span>
      <span class="badge warn">町域代表点</span>
    </div>
    <div class="data-grid">
      <div class="data-item"><span>偏差値</span><strong>${formatNumber(row.deviation)}</strong></div>
      <div class="data-item"><span>内申点</span><strong>${escapeHtml(naishinLabel)}</strong></div>
      <div class="data-item"><span>距離</span><strong>${Number.isFinite(distance) ? `${distance.toFixed(1)} km` : "-"}</strong></div>
      <div class="data-item"><span>創立</span><strong>${Number.isFinite(row.founded) ? `${Math.round(row.founded)}年` : "-"}</strong></div>
    </div>
    <p class="meta">${escapeHtml(row["住所"])}${row.postalAreaLabel ? ` / 地図位置: ${escapeHtml(row.postalAreaLabel)}` : ""}</p>
    <div class="sources">
      ${linkHtml(row["Webサイト"], "学校サイト")}
      ${linkHtml(row["偏差値出典"], "偏差値出典")}
      ${linkHtml(row["内申点_source_url"] || row["内申点出典"], "内申点出典")}
      <a class="button-link" href="${escapeAttribute(mapsUrl)}" target="_blank" rel="noopener">Google Maps</a>
    </div>
  `;

  return card;
}

function renderMap(rows) {
  markersLayer.clearLayers();
  markerBySchoolId = new Map();
  const schools = groupBySchool(rows);
  const bounds = [];

  for (const school of schools.values()) {
    const first = school[0];
    if (!Number.isFinite(first.lat) || !Number.isFinite(first.lng)) continue;
    const marker = L.marker([first.lat, first.lng]).bindPopup(buildPopup(first, school));
    marker.addTo(markersLayer);
    markerBySchoolId.set(first.school_id, marker);
    bounds.push([first.lat, first.lng]);
  }

  if (postalPoint) {
    const marker = L.circleMarker([postalPoint.lat, postalPoint.lng], {
      radius: 8,
      color: "#245a9c",
      fillColor: "#245a9c",
      fillOpacity: 0.85,
    }).bindPopup(`基準点<br>${escapeHtml(postalPoint.label)}`);
    marker.addTo(markersLayer);
    bounds.push([postalPoint.lat, postalPoint.lng]);
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
}

function groupBySchool(rows) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.school_id) ?? [];
    group.push(row);
    groups.set(row.school_id, group);
  }
  return groups;
}

function buildPopup(first, schoolRows) {
  const items = schoolRows
    .slice(0, 8)
    .map(
      (row) =>
        `<li>${escapeHtml(row["学科名"])}: 偏差値 ${formatNumber(row.deviation)} / 内申 ${escapeHtml(row["内申点_app_display"] || row["内申点"] || "-")}</li>`,
    )
    .join("");
  const more = schoolRows.length > 8 ? `<p>ほか ${schoolRows.length - 8} 件</p>` : "";
  return `
    <div class="popup-title">${escapeHtml(first["高校名"])}</div>
    <div>${escapeHtml(first["住所"])}</div>
    <ul class="popup-list">${items}</ul>
    ${more}
    <a href="${escapeAttribute(buildMapsUrl(first))}" target="_blank" rel="noopener">Google Mapsで開く</a>
  `;
}

function buildMapsUrl(row) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row["住所"] || row["高校名"])}`;
}

function buildStatusText(rows, state) {
  const parts = [`${rows.length}件を表示中`];
  const missingPoints = rows.filter((row) => !Number.isFinite(row.lat) || !Number.isFinite(row.lng)).length;
  if (postalPoint) parts.push(`距離基準: ${postalPoint.label}`);
  if (postalMessage) parts.push(postalMessage);
  if (missingPoints) parts.push(`町域代表点なし: ${missingPoints}件`);
  if (state.sort === "distance" && !postalPoint && !postalMessage) parts.push("距離ソートには7桁の郵便番号が必要です");
  return parts.join("。");
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

async function copyCurrentUrl() {
  try {
    await navigator.clipboard.writeText(location.href);
    setStatus("共有URLをコピーしました。");
  } catch {
    setStatus("クリップボードへコピーできませんでした。アドレスバーのURLを共有してください。", true);
  }
}

function emptyMessage(message) {
  const element = document.createElement("p");
  element.className = "status";
  element.textContent = message;
  return element;
}

function linkHtml(url, label) {
  if (!url) return "";
  return `<a class="button-link secondary" href="${escapeAttribute(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const normalized = String(value).replace(/[^\d.-]/g, "");
  if (!normalized) return NaN;
  return Number(normalized);
}

function normalizePostal(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function averageNumbers(values) {
  const nums = values.filter(Number.isFinite);
  return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : NaN;
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
