const DATA_URL = "resources/public_highschools.csv";
const POSTAL_API = "https://geoapi.heartrails.com/api/json?method=searchByPostal&postal=";

// スライダー範囲
const DEV_MIN = 30;
const DEV_MAX = 80;
const NAISHIN_MIN = 0;
const NAISHIN_MAX = 45;

// URL に保存するキー（sector/gender/deptCat は複数値なので別途処理）
const stateKeys = [
  "q",
  "pref",
  "city",
  "sector",
  "gender",
  "deptCat",
  "devMin",
  "devMax",
  "naishinMin",
  "naishinMax",
  "postal",
  "sort",
  "dir",
  "favOnly",
  "favLists",
];

// ---------- お気に入り (localStorage) ----------
const FAV_KEY = "highschool_favorites";
const FAV_LISTS_KEY = "highschool_favorite_lists";
const DEFAULT_FAVORITE_LIST_ID = "default";
const DEFAULT_FAVORITE_LIST_NAME = "お気に入り";

function loadFavorites() {
  try {
    const value = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(set) {
  localStorage.setItem(FAV_KEY, JSON.stringify([...set]));
}

function loadFavoriteLists() {
  const legacyIds = [...loadFavorites()];
  try {
    const raw = localStorage.getItem(FAV_LISTS_KEY);
    if (raw !== null) return normalizeFavoriteLists(JSON.parse(raw));
  } catch {
    // Fall through to legacy migration.
  }

  return legacyIds.length ? [{
    id: DEFAULT_FAVORITE_LIST_ID,
    name: DEFAULT_FAVORITE_LIST_NAME,
    schoolIds: legacyIds,
  }] : [{
    id: DEFAULT_FAVORITE_LIST_ID,
    name: DEFAULT_FAVORITE_LIST_NAME,
    schoolIds: [],
  }];
}

function normalizeFavoriteLists(value) {
  const seen = new Set();
  return value
    .map((list, index) => {
      if (!list || typeof list !== "object") return null;
      const id = String(list.id || (index === 0 ? DEFAULT_FAVORITE_LIST_ID : createFavoriteListId()));
      if (seen.has(id)) return null;
      seen.add(id);
      const name = String(list.name || "").trim() || `${DEFAULT_FAVORITE_LIST_NAME}${index + 1}`;
      const schoolIds = Array.isArray(list.schoolIds) ? [...new Set(list.schoolIds.map(String).filter(Boolean))] : [];
      return { id, name, schoolIds };
    })
    .filter(Boolean);
}

function saveFavoriteLists(lists) {
  const normalized = normalizeFavoriteLists(lists);
  localStorage.setItem(FAV_LISTS_KEY, JSON.stringify(normalized));
  const defaultList = normalized.find((list) => list.id === DEFAULT_FAVORITE_LIST_ID) ?? normalized[0];
  saveFavorites(new Set(defaultList?.schoolIds ?? []));
  return normalized;
}

function createFavoriteListId() {
  if (globalThis.crypto?.randomUUID) return `fav-${globalThis.crypto.randomUUID()}`;
  return `fav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFavoriteListName(lists) {
  const names = new Set(lists.map((list) => list.name));
  let index = lists.length + 1;
  let name = `お気に入り ${index}`;
  while (names.has(name)) {
    index += 1;
    name = `お気に入り ${index}`;
  }
  return name;
}

function getFavoriteListSelection(departmentId) {
  return loadFavoriteLists().filter((list) => list.schoolIds.includes(String(departmentId))).map((list) => list.id);
}

function setFavoriteListSelection(departmentId, selectedListIds) {
  const selected = new Set(selectedListIds.map(String));
  const deptId = String(departmentId);
  const lists = loadFavoriteLists().map((list) => {
    const schoolIds = new Set(list.schoolIds);
    if (selected.has(list.id)) {
      schoolIds.add(deptId);
    } else {
      schoolIds.delete(deptId);
    }
    return { ...list, schoolIds: [...schoolIds] };
  });
  return saveFavoriteLists(lists);
}

function isInAnyFavoriteList(departmentId) {
  return getFavoriteListSelection(departmentId).length > 0;
}

// 公私区分・共学区分の全選択肢
const ALL_SECTORS = ["公立", "私立", "国立"];
const ALL_GENDERS = ["共学", "男子校", "女子校"];
const ALL_DEPT_CATS = [
  "普通科",
  "理数・情報系",
  "商業・国際系",
  "工業・ものづくり系",
  "農業・家庭・福祉系",
  "芸術・体育・総合その他",
];

// 学科名 → カテゴリのマッピング
function deptCategory(deptName) {
  if (!deptName) return "芸術・体育・総合その他";
  if (deptName.startsWith("普通科")) return "普通科";
  if ([
    "理数科",
    "理数科（先端サイエンス）",
    "総合科学科（IG/SG）",
    "情報処理科",
    "情報技術科",
    "情報サイエンス科",
    "情報メディア科",
    "情報通信科",
    "情報電子科",
  ].includes(deptName)) return "理数・情報系";
  if ([
    "商業科",
    "会計科",
    "ビジネス会計科",
    "ビジネス探究科",
    "総合ビジネス科",
    "流通経済科",
    "国際経済科",
    "国際流通科",
    "外国語科",
    "外国語コース",
    "国際教養科",
    "国際科",
    "人文科",
  ].includes(deptName)) return "商業・国際系";
  if ([
    "機械",
    "電気",
    "電子",
    "建築",
    "土木",
    "化学",
    "工業",
    "ロボット",
    "ものづくり",
    "デザイン科",
    "グラフィックアーツ科",
  ].some((keyword) => deptName.includes(keyword))) return "工業・ものづくり系";
  if ([
    "農業",
    "園芸",
    "森林",
    "生物",
    "食品",
    "食物",
    "食育",
    "フード",
    "生活",
    "家政",
    "ライフ",
    "保育",
    "看護",
    "福祉",
    "造園",
    "環境",
  ].some((keyword) => deptName.includes(keyword))) return "農業・家庭・福祉系";
  return "芸術・体育・総合その他";
}

const defaultState = {
  q: "",
  pref: "",
  city: "",
  sector: ALL_SECTORS.join(","),   // デフォルト: 全選択
  gender: ALL_GENDERS.join(","),   // デフォルト: 全選択
  deptCat: ALL_DEPT_CATS.join(","), // デフォルト: 全選択
  devMin: String(DEV_MIN),
  devMax: String(DEV_MAX),
  naishinMin: String(NAISHIN_MIN),
  naishinMax: String(NAISHIN_MAX),
  postal: "",
  sort: "deviation",
  dir: "desc",
  favOnly: "",
  favLists: "",
};

// ソートごとの順序ラベル
const DIR_LABELS = {
  deviation: { desc: "高い順", asc: "低い順" },
  naishin:   { desc: "高い順", asc: "低い順" },
  name:      { desc: "逆順",   asc: "あ→ん順" },
  area:      { desc: "逆順",   asc: "あ→ん順" },
  founded:   { desc: "新しい順", asc: "古い順" },
  distance:  { desc: "遠い順", asc: "近い順" },
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
let narrowWorkspaceQuery;
let resultsScrollY = 0;
let filterDrawerLastFocus = null;
let favoriteDialogDepartmentId = "";

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
  // 単一要素
  for (const key of ["q", "pref", "city", "devMin", "devMax", "naishinMin", "naishinMax",
                      "postal", "sort", "dir"]) {
    els[key] = document.getElementById(key);
  }
  // チェックグループ（NodeList）
  els.sectorCheckboxes  = document.querySelectorAll('input[name="sector"]');
  els.genderCheckboxes  = document.querySelectorAll('input[name="gender"]');
  els.deptCatCheckboxes = document.querySelectorAll('input[name="deptCat"]');

  els.favOnly      = document.getElementById("favOnly");
  els.favGroup     = document.getElementById("favGroup");
  els.favoriteEditorPanel = document.getElementById("favoriteEditorPanel");
  els.favoriteListEditor = document.getElementById("favoriteListEditor");
  els.addFavoriteListButton = document.getElementById("addFavoriteListButton");
  els.favoriteDialog = document.getElementById("favoriteDialog");
  els.favoriteDialogSchool = document.getElementById("favoriteDialogSchool");
  els.favoriteDialogLists = document.getElementById("favoriteDialogLists");
  els.favoriteDialogClose = document.getElementById("favoriteDialogClose");
  els.favoriteDialogCancel = document.getElementById("favoriteDialogCancel");
  els.favoriteDialogSave = document.getElementById("favoriteDialogSave");
  els.filterPanelTitle = document.getElementById("filterPanelTitle");
  els.filterPanelTabs = document.querySelectorAll("[data-filter-panel-tab]");
  els.filterPanelPanels = document.querySelectorAll("[data-filter-panel]");
  els.filters      = document.getElementById("filters");
  els.filterPanel  = document.getElementById("filterPanel");
  els.filterDrawerButton = document.getElementById("filterDrawerButton");
  els.filterCloseButton  = document.getElementById("filterCloseButton");
  els.filterBackdrop     = document.getElementById("filterBackdrop");
  els.contentPane  = document.getElementById("contentPane");
  els.appHeader    = document.querySelector(".app-header");
  els.appFooter    = document.querySelector(".app-footer");
  els.map          = document.getElementById("map");
  els.cards        = document.getElementById("cards");
  els.status       = document.getElementById("status");
  els.workspace    = document.querySelector(".workspace");
  els.viewTabs     = document.querySelectorAll("[data-view-tab]");
  els.distanceBasis   = document.getElementById("distanceBasis");
  els.visibleSummary  = document.getElementById("visibleSummary");
  els.copyUrlButton   = document.getElementById("copyUrlButton");
  els.resetButton     = document.getElementById("resetButton");
  els.devRangeLabel    = document.getElementById("devRangeLabel");
  els.naishinRangeLabel = document.getElementById("naishinRangeLabel");
  els.devFill     = document.getElementById("devFill");
  els.naishinFill = document.getElementById("naishinFill");
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
  els.filters.addEventListener("input", onFilterInput);
  els.filters.addEventListener("change", onFilterChange);
  narrowWorkspaceQuery = window.matchMedia("(max-width: 1120px)");
  narrowWorkspaceQuery.addEventListener("change", () => {
    syncFilterDrawerForViewport();
    if (els.workspace.dataset.view === "map") invalidateMapSoon();
  });
  syncFilterDrawerForViewport();
  els.filterDrawerButton.addEventListener("click", openFilterDrawer);
  els.filterCloseButton.addEventListener("click", closeFilterDrawer);
  els.filterBackdrop.addEventListener("click", closeFilterDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isFilterDrawerOpen()) closeFilterDrawer();
  });
  for (const tab of els.viewTabs) {
    tab.addEventListener("click", () => setWorkspaceView(tab.dataset.viewTab));
  }
  els.copyUrlButton.addEventListener("click", copyCurrentUrl);
  els.resetButton.addEventListener("click", async () => {
    applyState(defaultState);
    postalPoint = null;
    await update();
  });
  for (const tab of els.filterPanelTabs) {
    tab.addEventListener("click", () => setFilterPanelTab(tab.dataset.filterPanelTab));
    tab.addEventListener("keydown", handleFilterPanelTabKeydown);
  }
  els.addFavoriteListButton.addEventListener("click", addFavoriteList);
  els.favoriteListEditor.addEventListener("input", handleFavoriteEditorInput);
  els.favoriteListEditor.addEventListener("click", handleFavoriteEditorClick);
  els.favoriteDialogClose.addEventListener("click", closeFavoriteDialog);
  els.favoriteDialogCancel.addEventListener("click", closeFavoriteDialog);
  els.favoriteDialogSave.addEventListener("click", saveFavoriteDialogSelection);
  els.favoriteDialog.addEventListener("close", () => {
    favoriteDialogDepartmentId = "";
  });
  els.cards.addEventListener("click", (event) => {
    const favBtn = event.target.closest("[data-fav-school]");
    if (favBtn) {
      const deptId = favBtn.dataset.favSchool;
      openFavoriteDialog(deptId, favBtn.dataset.favSchoolLabel || "");
      return;
    }

    const button = event.target.closest("[data-focus-school]");
    if (!button) return;
    const marker = markerBySchoolId.get(button.dataset.focusSchool);
    if (marker) {
      if (isNarrowWorkspace()) setWorkspaceView("map");
      map.setView(marker.getLatLng(), 14);
      marker.openPopup();
    }
  });
  els.map.addEventListener("click", (event) => {
    const link = event.target.closest("[data-show-school-card]");
    if (!link) return;
    event.preventDefault();
    showSchoolCard(link.dataset.showSchoolCard, link.hash);
  });

  // スライダー同士の交差防止 & ラベル即時更新
  els.devMin.addEventListener("input", () => clampSlider("dev"));
  els.devMax.addEventListener("input", () => clampSlider("dev"));
  els.naishinMin.addEventListener("input", () => clampSlider("naishin"));
  els.naishinMax.addEventListener("input", () => clampSlider("naishin"));

  // ソート変更で順序ラベル更新
  els.sort.addEventListener("change", updateDirLabels);

  // ブラウザの進む/戻るでフィルター状態を復元
  window.addEventListener("popstate", async () => {
    applyState(readStateFromUrl());
    await update({ preserveUrl: true });
  });
}

function setWorkspaceView(view) {
  const nextView = view === "map" ? "map" : "results";
  const currentView = els.workspace.dataset.view;
  if (currentView === nextView) return;
  if (currentView === "results") {
    resultsScrollY = window.scrollY;
  }
  els.workspace.dataset.view = nextView;
  for (const tab of els.viewTabs) {
    const selected = tab.dataset.viewTab === nextView;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  if (nextView === "map") invalidateMapSoon();
  if (nextView === "results") restoreResultsScrollSoon();
}

function isNarrowWorkspace() {
  return narrowWorkspaceQuery?.matches ?? window.matchMedia("(max-width: 1120px)").matches;
}

function isFilterDrawerOpen() {
  return document.body.classList.contains("is-filter-drawer-open");
}

function openFilterDrawer() {
  if (!isNarrowWorkspace() || isFilterDrawerOpen()) return;
  filterDrawerLastFocus = document.activeElement;
  document.body.classList.add("is-filter-drawer-open");
  els.filterBackdrop.hidden = false;
  els.filterDrawerButton.setAttribute("aria-expanded", "true");
  els.filterPanel.inert = false;
  els.filterPanel.setAttribute("role", "dialog");
  els.filterPanel.setAttribute("aria-modal", "true");
  setPageContentInert(true);
  requestAnimationFrame(() => {
    const focusTarget = els.filterPanel.querySelector("button, input, select, textarea, a[href]");
    focusTarget?.focus();
  });
}

function closeFilterDrawer(options = {}) {
  const wasOpen = isFilterDrawerOpen();
  document.body.classList.remove("is-filter-drawer-open");
  els.filterBackdrop.hidden = true;
  els.filterDrawerButton.setAttribute("aria-expanded", "false");
  els.filterPanel.removeAttribute("role");
  els.filterPanel.removeAttribute("aria-modal");
  setPageContentInert(false);
  syncFilterDrawerForViewport();
  if (wasOpen && options.restoreFocus !== false && filterDrawerLastFocus?.focus) {
    filterDrawerLastFocus.focus();
  }
  filterDrawerLastFocus = null;
}

function syncFilterDrawerForViewport() {
  if (!isNarrowWorkspace()) {
    document.body.classList.remove("is-filter-drawer-open");
    els.filterBackdrop.hidden = true;
    els.filterDrawerButton.setAttribute("aria-expanded", "false");
    els.filterPanel.inert = false;
    els.filterPanel.removeAttribute("role");
    els.filterPanel.removeAttribute("aria-modal");
    setPageContentInert(false);
    return;
  }
  els.filterPanel.inert = !isFilterDrawerOpen();
}

function setPageContentInert(inert) {
  els.appHeader.inert = inert;
  els.contentPane.inert = inert;
  els.appFooter.inert = inert;
}

function invalidateMapSoon() {
  requestAnimationFrame(() => {
    map.invalidateSize();
  });
}

function restoreResultsScrollSoon() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: resultsScrollY, behavior: "auto" });
    });
  });
}

function onFilterInput() {
  updateRangeUI();
  scheduleUpdate();
}

function onFilterChange() {
  updateDirLabels();
  scheduleUpdate();
}

function scheduleUpdate() {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => update(), 180);
}

// スライダーの min/max を交差しないようにクランプし、UI更新
function clampSlider(prefix) {
  const minEl = els[`${prefix}Min`];
  const maxEl = els[`${prefix}Max`];
  let minVal = Number(minEl.value);
  let maxVal = Number(maxEl.value);
  if (minVal > maxVal) {
    if (document.activeElement === minEl) {
      maxEl.value = minVal;
    } else {
      minEl.value = maxVal;
    }
  }
  updateRangeUI();
}

function updateRangeUI() {
  // 偏差値
  const dMin = Number(els.devMin.value);
  const dMax = Number(els.devMax.value);
  const dRange = DEV_MAX - DEV_MIN;
  const dLeft  = ((dMin - DEV_MIN) / dRange) * 100;
  const dRight = ((DEV_MAX - dMax) / dRange) * 100;
  els.devFill.style.left  = `${dLeft}%`;
  els.devFill.style.right = `${dRight}%`;
  const devIsDefault = dMin === DEV_MIN && dMax === DEV_MAX;
  els.devRangeLabel.textContent = devIsDefault ? "（全範囲）" : `${dMin} 〜 ${dMax}`;

  // 内申点
  const nMin = Number(els.naishinMin.value);
  const nMax = Number(els.naishinMax.value);
  const nRange = NAISHIN_MAX - NAISHIN_MIN;
  const nLeft  = ((nMin - NAISHIN_MIN) / nRange) * 100;
  const nRight = ((NAISHIN_MAX - nMax) / nRange) * 100;
  els.naishinFill.style.left  = `${nLeft}%`;
  els.naishinFill.style.right = `${nRight}%`;
  const naishinIsDefault = nMin === NAISHIN_MIN && nMax === NAISHIN_MAX;
  els.naishinRangeLabel.textContent = naishinIsDefault ? "（全範囲）" : `${nMin} 〜 ${nMax}`;
}

function updateDirLabels() {
  const sort = els.sort.value;
  const labels = DIR_LABELS[sort] || { desc: "降順", asc: "昇順" };
  const opts = els.dir.options;
  for (const opt of opts) {
    if (opt.value === "desc") opt.textContent = labels.desc;
    if (opt.value === "asc")  opt.textContent = labels.asc;
  }
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
  renderDistanceBasis();
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
  const input = text.replace(/^﻿/, "");

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
  const lat = toNumber(row["緯度"] || row["代表点緯度"]);
  const lng = toNumber(row["経度"] || row["代表点経度"]);
  const founded = toNumber(row["創立年_西暦"]);
  const universityRate = toNumber(row["大学進学率"]);

  return {
    ...row,
    deviation,
    naishinMin,
    naishinMax,
    naishin: Number.isFinite(naishin) ? naishin : averageNumbers([naishinMin, naishinMax]),
    lat,
    lng,
    founded,
    universityRate,
    coordinateLabel: row["座標ラベル"] || row["代表点ラベル"],
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
  renderFavoriteFilterOptions();
  renderFavoriteEditor();
  // 初期スライダー状態を反映
  updateRangeUI();
  updateDirLabels();
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

function setFilterPanelTab(tabName) {
  const nextTab = tabName === "favorites" ? "favorites" : "filters";
  for (const tab of els.filterPanelTabs) {
    const selected = tab.dataset.filterPanelTab === nextTab;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  for (const panel of els.filterPanelPanels) {
    panel.hidden = panel.dataset.filterPanel !== nextTab;
  }
  els.filterPanelTitle.textContent = nextTab === "favorites" ? "お気に入り編集" : "絞り込み";
}

function handleFilterPanelTabKeydown(event) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...els.filterPanelTabs];
  const currentIndex = tabs.indexOf(event.currentTarget);
  let nextIndex = currentIndex;
  if (event.key === "ArrowLeft") nextIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
  if (event.key === "ArrowRight") nextIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
  if (event.key === "Home") nextIndex = 0;
  if (event.key === "End") nextIndex = tabs.length - 1;
  tabs[nextIndex]?.focus();
  setFilterPanelTab(tabs[nextIndex]?.dataset.filterPanelTab);
}

function renderFavoriteFilterOptions(selectedIds = getSelectedFavoriteListIds()) {
  const lists = loadFavoriteLists();
  const selected = new Set(selectedIds);
  els.favGroup.replaceChildren();

  for (const list of lists) {
    const inputId = `fav-list-filter-${list.id}`;
    const label = document.createElement("label");
    label.className = "check-chip";
    label.innerHTML = `
      <input type="checkbox" id="${escapeAttribute(inputId)}" name="favList" value="${escapeAttribute(list.id)}"${selected.has(list.id) ? " checked" : ""}>
      <span>${escapeHtml(list.name)}</span>
    `;
    els.favGroup.append(label);
  }
}

function renderFavoriteEditor() {
  const lists = loadFavoriteLists();
  if (!lists.length) {
    els.favoriteListEditor.replaceChildren(emptyMessage("お気に入り項目はありません。"));
    return;
  }

  els.favoriteListEditor.replaceChildren(...lists.map((list) => {
    const item = document.createElement("div");
    item.className = "favorite-editor-item";
    item.dataset.favoriteListId = list.id;
    const inputId = `favorite-name-${list.id}`;
    item.innerHTML = `
      <div class="favorite-name-field">
        <label for="${escapeAttribute(inputId)}">名前</label>
        <input id="${escapeAttribute(inputId)}" type="text" value="${escapeAttribute(list.name)}" data-favorite-name="${escapeAttribute(list.id)}" maxlength="40">
      </div>
      <span class="favorite-count">${list.schoolIds.length}件</span>
      <button type="button" class="text-button danger-text" data-delete-favorite-list="${escapeAttribute(list.id)}">削除</button>
    `;
    return item;
  }));
}

function addFavoriteList() {
  const lists = loadFavoriteLists();
  const next = {
    id: createFavoriteListId(),
    name: createFavoriteListName(lists),
    schoolIds: [],
  };
  const saved = saveFavoriteLists([...lists, next]);
  syncFavoriteViews(saved);
  setFilterPanelTab("favorites");
  requestAnimationFrame(() => {
    els.favoriteListEditor.querySelector(`[data-favorite-name="${cssEscape(next.id)}"]`)?.focus();
  });
}

function handleFavoriteEditorInput(event) {
  const input = event.target.closest("[data-favorite-name]");
  if (!input) return;
  const listId = input.dataset.favoriteName;
  const lists = loadFavoriteLists().map((list) => (
    list.id === listId ? { ...list, name: input.value.trim() || DEFAULT_FAVORITE_LIST_NAME } : list
  ));
  syncFavoriteViews(saveFavoriteLists(lists), { preserveEditorFocus: true });
}

function handleFavoriteEditorClick(event) {
  const button = event.target.closest("[data-delete-favorite-list]");
  if (!button) return;
  const listId = button.dataset.deleteFavoriteList;
  const saved = saveFavoriteLists(loadFavoriteLists().filter((list) => list.id !== listId));
  const selected = getSelectedFavoriteListIds().filter((id) => id !== listId);
  renderFavoriteFilterOptions(selected);
  renderFavoriteEditor();
  update();
  if (favoriteDialogDepartmentId) renderFavoriteDialogLists(favoriteDialogDepartmentId);
}

function syncFavoriteViews(lists = loadFavoriteLists(), options = {}) {
  renderFavoriteFilterOptions(getSelectedFavoriteListIds().filter((id) => lists.some((list) => list.id === id)));
  if (!options.preserveEditorFocus) renderFavoriteEditor();
  if (favoriteDialogDepartmentId) renderFavoriteDialogLists(favoriteDialogDepartmentId);
  renderCards(sortRows(filterRows(allRows, getState()), getState()));
}

function getSelectedFavoriteListIds() {
  return [...els.favGroup.querySelectorAll('input[name="favList"]:checked')].map((cb) => cb.value);
}

// --- State 読み書き ---

function readStateFromUrl() {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(
    stateKeys.map((key) => [key, params.get(key) ?? defaultState[key]])
  );
}

function applyState(state) {
  // テキスト系
  for (const key of ["q", "pref", "city", "postal", "sort", "dir"]) {
    if (els[key]) els[key].value = state[key] ?? defaultState[key] ?? "";
  }

  // チェックボックスグループ
  const sectorSet = new Set((state.sector || "").split(",").filter(Boolean));
  for (const cb of els.sectorCheckboxes) cb.checked = sectorSet.has(cb.value);

  const genderSet = new Set((state.gender || "").split(",").filter(Boolean));
  for (const cb of els.genderCheckboxes) cb.checked = genderSet.has(cb.value);

  const deptCatSet = new Set((state.deptCat || "").split(",").filter(Boolean));
  for (const cb of els.deptCatCheckboxes) cb.checked = deptCatSet.has(cb.value);

  // スライダー（デフォルトは最広範囲）
  els.devMin.value     = state.devMin     !== "" ? state.devMin     : DEV_MIN;
  els.devMax.value     = state.devMax     !== "" ? state.devMax     : DEV_MAX;
  els.naishinMin.value = state.naishinMin !== "" ? state.naishinMin : NAISHIN_MIN;
  els.naishinMax.value = state.naishinMax !== "" ? state.naishinMax : NAISHIN_MAX;

  // お気に入りのみ
  const favoriteListIds = (state.favLists || "").split(",").filter(Boolean);
  if (state.favOnly === "1" && !favoriteListIds.length) favoriteListIds.push(DEFAULT_FAVORITE_LIST_ID);
  els.favOnly.checked = false;
  renderFavoriteFilterOptions(favoriteListIds);

  updateRangeUI();
  updateDirLabels();
}

function getState() {
  // チェックボックスグループの値収集
  const sector = [...els.sectorCheckboxes]
    .filter((cb) => cb.checked).map((cb) => cb.value).join(",");
  const gender = [...els.genderCheckboxes]
    .filter((cb) => cb.checked).map((cb) => cb.value).join(",");
  const deptCat = [...els.deptCatCheckboxes]
    .filter((cb) => cb.checked).map((cb) => cb.value).join(",");
  const favLists = getSelectedFavoriteListIds().join(",");

  return {
    q:            els.q.value.trim(),
    pref:         els.pref.value,
    city:         els.city.value,
    sector,
    gender,
    deptCat,
    devMin:       els.devMin.value,
    devMax:       els.devMax.value,
    naishinMin:   els.naishinMin.value,
    naishinMax:   els.naishinMax.value,
    postal:       els.postal.value.trim(),
    sort:         els.sort.value,
    dir:          els.dir.value,
    favOnly:      els.favOnly.checked ? "1" : "",
    favLists,
  };
}

function writeStateToUrl(state) {
  const params = new URLSearchParams();
  for (const key of stateKeys) {
    const value = state[key];
    if (!value) continue;
    // デフォルト値は URL に含めない
    if (key === "sector"     && value === defaultState.sector)   continue;
    if (key === "gender"     && value === defaultState.gender)   continue;
    if (key === "deptCat"    && value === defaultState.deptCat)  continue;
    if (key === "devMin"     && value === String(DEV_MIN))      continue;
    if (key === "devMax"     && value === String(DEV_MAX))      continue;
    if (key === "naishinMin" && value === String(NAISHIN_MIN))  continue;
    if (key === "naishinMax" && value === String(NAISHIN_MAX))  continue;
    if (key === "sort"       && value === defaultState.sort)    continue;
    if (key === "dir"        && value === defaultState.dir)     continue;
    if (key === "favOnly"    && !value)                         continue;
    if (key === "favLists"   && !value)                         continue;
    params.set(key, value);
  }
  const query = params.toString();
  const newUrl = query ? `${location.pathname}?${query}` : location.pathname;
  // 現在のURLと同じ場合は replaceState（初回ロードや重複履歴を防ぐ）
  if (newUrl !== location.pathname + location.search) {
    history.pushState(null, "", newUrl);
  } else {
    history.replaceState(null, "", newUrl);
  }
}

// --- フィルター ---

function filterRows(rows, state) {
  const query = state.q.toLowerCase();
  const sectorSet  = new Set((state.sector  || "").split(",").filter(Boolean));
  const genderSet  = new Set((state.gender  || "").split(",").filter(Boolean));
  const deptCatSet = new Set((state.deptCat || "").split(",").filter(Boolean));
  const selectedFavoriteLists = new Set((state.favLists || "").split(",").filter(Boolean));
  const favoriteLists = selectedFavoriteLists.size || state.favOnly === "1" ? loadFavoriteLists() : [];
  const selectedFavoriteSchoolIds = new Set(
    favoriteLists
      .filter((list) => selectedFavoriteLists.size ? selectedFavoriteLists.has(list.id) : list.id === DEFAULT_FAVORITE_LIST_ID)
      .flatMap((list) => list.schoolIds),
  );
  const legacyFavoriteSchoolIds = state.favOnly === "1" ? loadFavorites() : new Set();

  // スライダー: デフォルト値の場合は絞り込まない
  const devMin    = Number(state.devMin);
  const devMax    = Number(state.devMax);
  const naishinMinVal = Number(state.naishinMin);
  const naishinMaxVal = Number(state.naishinMax);
  const devActive     = devMin !== DEV_MIN || devMax !== DEV_MAX;
  const naishinActive = naishinMinVal !== NAISHIN_MIN || naishinMaxVal !== NAISHIN_MAX;

  return rows.filter((row) => {
    if (query && !row.searchable.includes(query)) return false;
    if (state.pref && row["都道府県"] !== state.pref) return false;
    if (state.city && row["市区町村"] !== state.city) return false;
    // チェックが1つもない場合は絞り込まない（全選択も全未選択も全表示）
    if (sectorSet.size > 0 && sectorSet.size < ALL_SECTORS.length && !sectorSet.has(row["公立/私立/国立"])) return false;
    if (genderSet.size > 0 && genderSet.size < ALL_GENDERS.length && !genderSet.has(row["共学/男子校/女子校"])) return false;
    if (deptCatSet.size > 0 && deptCatSet.size < ALL_DEPT_CATS.length && !deptCatSet.has(deptCategory(row["学科名"]))) return false;
    if (selectedFavoriteLists.size || state.favOnly === "1") {
      const departmentId = String(row.department_id);
      if (!selectedFavoriteSchoolIds.has(departmentId) && !legacyFavoriteSchoolIds.has(departmentId)) return false;
    }
    if (devActive) {
      if (!Number.isFinite(row.deviation) || row.deviation < devMin || row.deviation > devMax) return false;
    }
    if (naishinActive) {
      if (!Number.isFinite(row.naishin) || row.naishin < naishinMinVal || row.naishin > naishinMaxVal) return false;
    }
    return true;
  });
}

// --- ソート ---

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

// --- 郵便番号 ---

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

// --- レンダリング ---

function renderSummary(rows) {
  const schools = new Set(rows.map((row) => row.school_id));
  els.visibleSummary.textContent = `${rows.length}件 / ${schools.size}校`;
}

function renderDistanceBasis() {
  if (postalPoint) {
    els.distanceBasis.textContent = `距離基準: ${postalPoint.label}`;
    els.distanceBasis.hidden = false;
    return;
  }
  els.distanceBasis.textContent = "";
  els.distanceBasis.hidden = true;
}

function openFavoriteDialog(departmentId, label) {
  favoriteDialogDepartmentId = String(departmentId);
  els.favoriteDialogSchool.textContent = label;
  renderFavoriteDialogLists(favoriteDialogDepartmentId);
  if (typeof els.favoriteDialog.showModal === "function") {
    els.favoriteDialog.showModal();
  }
}

function closeFavoriteDialog() {
  els.favoriteDialog.close();
}

function renderFavoriteDialogLists(departmentId) {
  const lists = loadFavoriteLists();
  if (!lists.length) {
    els.favoriteDialogLists.replaceChildren(emptyMessage("お気に入り項目はありません。編集タブで追加してください。"));
    return;
  }

  const selected = new Set(getFavoriteListSelection(departmentId));
  els.favoriteDialogLists.replaceChildren(...lists.map((list) => {
    const label = document.createElement("label");
    label.className = "favorite-dialog-option";
    label.innerHTML = `
      <input type="checkbox" name="favoriteDialogList" value="${escapeAttribute(list.id)}"${selected.has(list.id) ? " checked" : ""}>
      <span>${escapeHtml(list.name)}</span>
    `;
    return label;
  }));
}

function saveFavoriteDialogSelection() {
  if (!favoriteDialogDepartmentId) return;
  const selected = [...els.favoriteDialogLists.querySelectorAll('input[name="favoriteDialogList"]:checked')].map((input) => input.value);
  const lists = setFavoriteListSelection(favoriteDialogDepartmentId, selected);
  syncFavoriteViews(lists);
  scheduleUpdate();
  closeFavoriteDialog();
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
  card.id = schoolCardId(row);
  card.dataset.schoolId = row.school_id;
  card.tabIndex = -1;

  const distance = distanceFromPostal(row);
  const naishinLabel = row["内申点_app_display"] || row["内申点"] || row["内申点_classification"] || "-";
  const addressLabel = formatAddressWithFounded(row);
  const mapsUrl = buildMapsUrl(row);
  const isFav = isInAnyFavoriteList(row.department_id);
  const favoriteButtonLabel = `${row["高校名"]} ${row["学科名"]}`;
  const schoolNameHtml = row["Webサイト"]
    ? `<a class="school-name-link" href="${escapeAttribute(row["Webサイト"])}" target="_blank" rel="noopener" aria-label="${escapeAttribute(`${row["高校名"]} 公式サイトを開く`)}">${escapeHtml(row["高校名"])}</a>`
    : escapeHtml(row["高校名"]);

  card.innerHTML = `
    <div class="card-top">
      <div>
        <div class="school-title">
          <h3>${schoolNameHtml}</h3>
          <span class="kana">${escapeHtml(row["高校名かな"])}</span>
        </div>
        <p class="school-address">${escapeHtml(addressLabel)}</p>
      </div>
      <div class="card-actions">
        <button type="button" class="icon-btn map-focus" data-focus-school="${escapeHtml(row.school_id)}" aria-label="地図で見る">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
        <button type="button" class="icon-btn fav-btn${isFav ? " is-fav" : ""}"
          data-fav-school="${escapeHtml(row.department_id)}"
          data-fav-school-label="${escapeAttribute(favoriteButtonLabel)}"
          aria-label="お気に入りを編集"
          aria-pressed="${isFav}">
          <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" class="fav-star-shape"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="badges">
      <span class="badge">${escapeHtml(row["学科名"])}</span>
      <span class="badge">${escapeHtml(row["課程"])}</span>
      <span class="badge">${escapeHtml(row["公立/私立/国立"])}</span>
      <span class="badge">${escapeHtml(row["共学/男子校/女子校"])}</span>
    </div>
    <div class="data-grid">
      <div class="data-item"><span>偏差値</span><strong>${formatNumber(row.deviation)}</strong></div>
      <div class="data-item"><span>内申点</span><strong class="data-value-truncate" title="${escapeAttribute(naishinLabel)}">${escapeHtml(naishinLabel)}</strong></div>
      <div class="data-item"><span>距離</span><strong>${Number.isFinite(distance) ? `${distance.toFixed(1)} km` : "-"}</strong></div>
      <div class="data-item"><span>大学進学率</span><strong>${formatPercent(row.universityRate)}</strong></div>
    </div>
    <div class="sources">
      ${linkHtml(row["偏差値出典"], "偏差出典")}
      ${linkHtml(row["内申点_source_url"] || row["内申点出典"], "内申出典")}
      ${linkHtml(row["大学進学率_source_url"], "進学出典")}
      <a class="button-link" href="${escapeAttribute(mapsUrl)}" target="_blank" rel="noopener">Google Map</a>
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
    <div class="popup-actions">
      <a href="#${escapeAttribute(schoolCardId(first))}" data-show-school-card="${escapeAttribute(first.school_id)}">カードを見る</a>
      <a href="${escapeAttribute(buildMapsUrl(first))}" target="_blank" rel="noopener">Google Mapsで開く</a>
    </div>
  `;
}

function showSchoolCard(schoolId, hash) {
  const switchedView = isNarrowWorkspace() && els.workspace.dataset.view !== "results";
  if (isNarrowWorkspace()) setWorkspaceView("results");
  const selector = `[data-school-id="${cssEscape(schoolId)}"]`;
  const card = els.cards.querySelector(selector) || (hash ? document.querySelector(hash) : null);
  if (!card) return;

  afterAnimationFrames(switchedView ? 3 : 1, () => revealSchoolCard(card));
}

function revealSchoolCard(card) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!isElementInViewport(card)) {
    card.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "nearest" });
  }
  card.focus({ preventScroll: true });
  flashSchoolCard(card);
}

function flashSchoolCard(card) {
  for (const highlighted of els.cards.querySelectorAll(".is-map-target")) {
    highlighted.classList.remove("is-map-target");
  }
  card.classList.remove("is-map-target");
  requestAnimationFrame(() => {
    card.classList.add("is-map-target");
  });
}

function isElementInViewport(element) {
  const margin = 16;
  const rect = element.getBoundingClientRect();
  return rect.top >= margin && rect.bottom <= window.innerHeight - margin;
}

function afterAnimationFrames(count, callback) {
  if (count <= 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => afterAnimationFrames(count - 1, callback));
}

function schoolCardId(row) {
  return `school-card-${row.department_id}`;
}

function buildMapsUrl(row) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row["住所"] || row["高校名"])}`;
}

function buildStatusText(rows, state) {
  const parts = [];
  const missingPoints = rows.filter((row) => !Number.isFinite(row.lat) || !Number.isFinite(row.lng)).length;
  if (postalMessage) parts.push(postalMessage);
  if (missingPoints) parts.push(`座標なし: ${missingPoints}件`);
  if (state.sort === "distance" && !postalPoint && !postalMessage) parts.push("距離ソートには7桁の郵便番号が必要です");
  return parts.join("。");
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.hidden = !message;
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

function formatAddressWithFounded(row) {
  const address = row["住所"] || "";
  if (!Number.isFinite(row.founded)) return address;
  return `${address} (${Math.round(row.founded)}年創立)`;
}

function formatNumber(value) {
  return Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "-";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${formatNumber(value)}%` : "-";
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

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replaceAll('"', '\\"');
}
