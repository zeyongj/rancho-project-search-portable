"use strict";

const state = {
  dataset: null,
  projects: new Map(),
  rmIndex: new Map(),
  searchMode: "simple",
  activeTab: "strata",
  rmGroups: [],
  rmDisplayed: 0,
  rmSearchTime: 0,
};

const RM_PAGE_SIZE = 50;
const FILTER_IDS = [
  "filterProjectName",
  "filterAddress",
  "filterStrata",
  "filterPM",
  "filterFA",
  "filterAP",
  "filterAR",
  "filterNLM",
];

document.addEventListener("DOMContentLoaded", async () => {
  setupEvents();
  updateFooter();
  updateTime();
  window.setInterval(updateTime, 1000);
  await loadDataset();
});

function setupEvents() {
  document.querySelectorAll(".mode-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.searchMode = button.dataset.mode;
      updatePlaceholder();
      clearResults();
    });
  });

  document.querySelectorAll(".top-tab").forEach((button) => {
    button.addEventListener("click", () => switchTopTab(button.dataset.tab));
  });

  document.getElementById("advancedBtn").addEventListener("click", () => {
    document.getElementById("advancedSearch").classList.toggle("active");
  });
  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
  document.getElementById("searchBtn").addEventListener("click", performProjectSearch);
  document.getElementById("rmSearchBtn").addEventListener("click", performRMSearch);
  document.getElementById("clearBtn").addEventListener("click", clearResults);
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") performProjectSearch();
  });
  document.getElementById("rmSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") performRMSearch();
  });
  FILTER_IDS.forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (event) => {
      if (event.key === "Enter") performProjectSearch();
    });
  });
}

async function loadDataset() {
  const loading = document.getElementById("loading");
  loading.style.display = "block";
  const started = performance.now();
  try {
    const response = await fetch("/api/dataset", { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json()).error || "Unable to load local data");
    state.dataset = await response.json();
    buildProjectIndex();
    buildRMIndex();
    updateStats(performance.now() - started);
    const overlap = state.dataset.summary.activeWinsOverNlm || [];
    if (overlap.length) {
      document.getElementById("priorityNote").textContent =
        `Active source priority applied to ${overlap.length} duplicate project number${overlap.length === 1 ? "" : "s"}: ${overlap.join(", ")}. ` +
        "These projects are Active and NLM rows are ignored.";
    }
    loading.style.display = "none";
  } catch (error) {
    loading.innerHTML = `<div class="search-error">${escapeHtml(error.message)}</div>`;
  }
}

function buildProjectIndex() {
  state.projects.clear();
  const activeKeys = new Set();
  for (const record of state.dataset.active) {
    activeKeys.add(record.proj);
    mergeProject(record, false);
  }
  for (const record of state.dataset.nlm) {
    if (!activeKeys.has(record.proj)) mergeProject(record, true);
  }

  const faByProject = new Map(state.dataset.fa.map((record) => [record.proj, titleCase(record.fa)]));
  for (const record of state.projects.values()) {
    record.fa = faByProject.get(record.proj) || "";
    const number = Number.parseInt(record.proj, 10);
    record.ap = findPerson(record.proj, number, state.dataset.ap) || "—";
    record.ar = findPerson(record.proj, number, state.dataset.ar) || "—";
  }
}

function mergeProject(incoming, isNlm) {
  const existing = state.projects.get(incoming.proj);
  if (!existing) {
    state.projects.set(incoming.proj, {
      ...incoming,
      isNlm,
      source: isNlm ? "nlm.csv" : "pm.csv",
      fa: "",
      ap: "—",
      ar: "—",
    });
    return;
  }
  for (const key of ["projectName", "address", "strataPlan", "pm"]) {
    if (!existing[key] && incoming[key]) existing[key] = incoming[key];
  }
}

function findPerson(project, number, entries) {
  for (const entry of entries) {
    const include = csvValues(entry.Include);
    const exclude = csvValues(entry.Exclude);
    if (include.includes(project)) return entry.Name || "";
    const portfolio = String(entry.Portfolio || "").trim();
    if (portfolio.endsWith("+")) {
      const start = Number.parseInt(portfolio.slice(0, -1), 10);
      if (number >= start && !exclude.includes(project)) return entry.Name || "";
    } else if (portfolio.includes("-")) {
      const [start, end] = portfolio.split("-").map((value) => Number.parseInt(value, 10));
      if (number >= start && number <= end && !exclude.includes(project)) return entry.Name || "";
    }
  }
  return "";
}

function csvValues(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function buildRMIndex() {
  state.rmIndex.clear();
  for (const record of state.dataset.rm) {
    if (!state.rmIndex.has(record.key)) state.rmIndex.set(record.key, []);
    state.rmIndex.get(record.key).push(record);
  }
}

function performProjectSearch() {
  if (!state.dataset) return;
  const started = performance.now();
  const query = document.getElementById("searchInput").value.trim();
  const hasFilters = FILTER_IDS.some((id) => document.getElementById(id).value.trim());
  if (!query && !hasFilters) {
    window.alert("Enter a project number/search term or use at least one Advanced Search field.");
    return;
  }

  let results = [...state.projects.values()];
  if (query) {
    if (state.searchMode === "simple") {
      const project = (query.match(/\d{4}/) || [query.slice(0, 4)])[0];
      results = results.filter((record) => record.proj === project);
    } else if (state.searchMode === "multi") {
      const requested = new Set(
        query.split(/[,;\s]+/).map((part) => (part.match(/\d{4}/) || [part.slice(0, 4)])[0]).filter(Boolean),
      );
      results = results.filter((record) => requested.has(record.proj));
    } else {
      results = results.filter((record) => fuzzyMatch(record.strataPlan, query));
    }
  }

  results = applyAdvancedFilters(results).sort((left, right) => left.proj.localeCompare(right.proj, undefined, { numeric: true }));
  displayProjectResults(results, performance.now() - started, query);
}

function applyAdvancedFilters(results) {
  const filters = {
    projectName: valueOf("filterProjectName"),
    address: valueOf("filterAddress"),
    strataPlan: valueOf("filterStrata"),
    pm: valueOf("filterPM"),
    fa: valueOf("filterFA"),
    ap: valueOf("filterAP"),
    ar: valueOf("filterAR"),
    status: valueOf("filterNLM"),
  };
  return results.filter((record) => {
    if (filters.projectName && !fuzzyMatch(record.projectName, filters.projectName)) return false;
    if (filters.address && !fuzzyMatch(record.address, filters.address)) return false;
    if (filters.strataPlan && !fuzzyMatch(record.strataPlan, filters.strataPlan)) return false;
    if (filters.pm && !fuzzyMatch(record.pm, filters.pm)) return false;
    if (filters.fa && !fuzzyMatch(record.fa, filters.fa)) return false;
    if (filters.ap && !fuzzyMatch(record.ap, filters.ap)) return false;
    if (filters.ar && !fuzzyMatch(record.ar, filters.ar)) return false;
    if (filters.status === "active" && record.isNlm) return false;
    if (filters.status === "nlm" && !record.isNlm) return false;
    return true;
  });
}

function fuzzyMatch(candidate, query) {
  const haystack = normalizeText(candidate);
  const needle = normalizeText(query);
  if (!needle) return true;
  if (!haystack) return false;
  if (haystack.includes(needle)) return true;
  const candidateTokens = haystack.split(" ").filter(Boolean);
  const queryTokens = needle.split(" ").filter(Boolean);
  return queryTokens.every((token) =>
    candidateTokens.some((candidateToken) =>
      candidateToken.startsWith(token) || token.startsWith(candidateToken) ||
      (token.length >= 4 && candidateToken.length >= 4 && levenshteinWithinOne(candidateToken, token)),
    ),
  );
}

function normalizeText(value) {
  const synonyms = {
    avenue: "ave", boulevard: "blvd", drive: "dr", highway: "hwy", lane: "ln",
    place: "pl", road: "rd", street: "st", british: "bc", columbia: "bc",
  };
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bno\.?\s*(\d)/g, "no $1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((token) => synonyms[token] || token)
    .join(" ");
}

function levenshteinWithinOne(left, right) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) i += 1;
    else if (right.length > left.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + Number(i < left.length || j < right.length) <= 1;
}

function displayProjectResults(results, elapsed, query) {
  const container = document.getElementById("resultsContainer");
  const resultsElement = document.getElementById("results");
  container.classList.add("active");
  document.getElementById("resultsTitle").textContent = query ? "Search Results" : "Advanced Search Results";
  document.getElementById("resultsCount").textContent = `${results.length} result${results.length === 1 ? "" : "s"}`;
  document.getElementById("searchTime").textContent = `${elapsed.toFixed(1)}ms`;

  if (!results.length) {
    resultsElement.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">📭</div>
        <h3>No Results Found</h3>
        <p>Try fewer words, a partial address, or reset one of the filters.</p>
      </div>`;
  } else {
    resultsElement.innerHTML = results.map(projectCard).join("");
  }
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function projectCard(record) {
  return `
    <div class="result-card ${record.isNlm ? "nlm" : ""}">
      <div class="result-header">
        <div class="project-number">#${escapeHtml(record.proj)}</div>
        <span class="${record.isNlm ? "nlm-badge" : "active-badge"}">${record.isNlm ? "NLM" : "ACTIVE"}</span>
      </div>
      ${record.isNlm ? '<div style="color: var(--danger); font-weight: 500; margin-bottom: 15px;">⚠️ Project is No Longer Managed (NLM)</div>' : ""}
      <div class="result-details">
        ${detail("Project Name", record.projectName)}
        ${detail("Strata Plan", record.strataPlan)}
        ${detail("Address", record.address, "address-detail", "address-value")}
        ${detail("AP Name", record.ap)}
        ${detail("AR Name", record.ar)}
        ${detail("FA Name", record.fa)}
        ${detail("PM Name", record.pm)}
      </div>
      <div class="result-source-note">Status source: ${escapeHtml(record.source)}${record.isNlm ? "" : " (Active takes priority)"}</div>
    </div>`;
}

function detail(label, value, itemClass = "", valueClass = "") {
  return `
    <div class="detail-item ${itemClass}">
      <div class="detail-label">${escapeHtml(label)}</div>
      <div class="detail-value ${valueClass}">${escapeHtml(value || "—")}</div>
    </div>`;
}

function performRMSearch() {
  if (!state.dataset) return;
  const started = performance.now();
  const rawQuery = valueOf("rmSearchInput");
  if (!rawQuery) {
    window.alert("Please enter an RM file number, street, city, PM, or accountant.");
    return;
  }
  const query = rawQuery.toUpperCase();
  const groups = [];
  if (/^\d{1,4}$/.test(query)) {
    const key = query.padStart(4, "0");
    if (state.rmIndex.has(key)) groups.push({ key, records: state.rmIndex.get(key) });
  } else {
    for (const [key, records] of state.rmIndex) {
      const matches = records.filter((record) => fuzzyMatch(
        [record.fileNumber, record.streetNumber, record.street, record.city, record.pm, record.accountant].join(" "),
        rawQuery,
      ));
      if (matches.length) groups.push({ key, records: matches });
    }
  }
  state.rmGroups = groups.sort((left, right) => left.key.localeCompare(right.key, undefined, { numeric: true }));
  state.rmDisplayed = 0;
  state.rmSearchTime = performance.now() - started;
  displayRMResults();
}

function displayRMResults() {
  const container = document.getElementById("resultsContainer");
  const resultsElement = document.getElementById("results");
  container.classList.add("active");
  document.getElementById("resultsTitle").textContent = "RM Search Results";
  const totalRecords = state.rmGroups.reduce((total, group) => total + group.records.length, 0);
  document.getElementById("resultsCount").textContent = `${state.rmGroups.length} projects (${totalRecords} records)`;
  document.getElementById("searchTime").textContent = `${state.rmSearchTime.toFixed(1)}ms`;
  if (!state.rmGroups.length) {
    resultsElement.innerHTML = '<div class="no-results"><div class="no-results-icon">📭</div><h3>No RM Results Found</h3><p>Try a partial street, city, PM, or accountant.</p></div>';
  } else {
    resultsElement.innerHTML = "";
    appendRMResults();
  }
  container.scrollIntoView({ behavior: "smooth", block: "start" });
}

function appendRMResults() {
  const resultsElement = document.getElementById("results");
  document.getElementById("rmLoadMoreContainer")?.remove();
  const next = state.rmGroups.slice(state.rmDisplayed, state.rmDisplayed + RM_PAGE_SIZE);
  resultsElement.insertAdjacentHTML("beforeend", next.map(renderRMGroup).join(""));
  state.rmDisplayed += next.length;
  if (state.rmDisplayed < state.rmGroups.length) {
    const remaining = state.rmGroups.length - state.rmDisplayed;
    resultsElement.insertAdjacentHTML("beforeend", `
      <div class="load-more-container" id="rmLoadMoreContainer">
        <button class="btn-load-more" id="rmLoadMoreBtn">Load More (${Math.min(remaining, RM_PAGE_SIZE)} of ${remaining} remaining)</button>
        <div class="load-more-info">Showing ${state.rmDisplayed} of ${state.rmGroups.length} projects</div>
      </div>`);
    document.getElementById("rmLoadMoreBtn").addEventListener("click", appendRMResults);
  }
}

function renderRMGroup(group) {
  const first = group.records[0];
  if (group.records.length === 1) {
    return `
      <div class="result-card rm-card">
        <div class="result-header"><div class="project-number rm-number">RM${escapeHtml(group.key)}</div><span class="rm-badge">RM</span></div>
        <div class="result-details">
          ${detail("File #", first.fileNumber)}${detail("Unit #", first.unit)}${detail("St #", first.streetNumber)}
          ${detail("Street", first.street)}${detail("City", first.city)}${detail("PM", first.pm)}${detail("Accountant", first.accountant)}
        </div>
      </div>`;
  }
  return `
    <div class="result-card rm-card">
      <div class="result-header"><div class="project-number rm-number">RM${escapeHtml(group.key)}</div><span class="rm-badge">${group.records.length} units</span></div>
      <table class="rm-units-table">
        <thead><tr><th>File #</th><th>Unit #</th><th>St #</th><th>Street</th><th>City</th><th>PM</th><th>Accountant</th></tr></thead>
        <tbody>${group.records.map((record) => `<tr>
          <td>${escapeHtml(record.fileNumber)}</td><td>${escapeHtml(record.unit || "—")}</td><td>${escapeHtml(record.streetNumber || "—")}</td>
          <td>${escapeHtml(record.street || "—")}</td><td>${escapeHtml(record.city || "—")}</td><td>${escapeHtml(record.pm || "—")}</td><td>${escapeHtml(record.accountant || "—")}</td>
        </tr>`).join("")}</tbody>
      </table>
    </div>`;
}

function switchTopTab(tab) {
  state.activeTab = tab;
  const strata = tab === "strata";
  document.getElementById("strataContent").classList.toggle("active", strata);
  document.getElementById("rmContent").classList.toggle("active", !strata);
  document.getElementById("tabStrata").classList.toggle("active-strata", strata);
  document.getElementById("tabRM").classList.toggle("active-rm", !strata);
  document.getElementById("advancedBtn").style.display = strata ? "inline-flex" : "none";
  document.getElementById("searchTitle").textContent = strata ? "🔍 Project Search" : "🏠 RM Project Search";
  clearResults();
}

function updateStats(loadTime) {
  document.getElementById("stats").style.display = "grid";
  document.getElementById("totalProjects").textContent = state.dataset.summary.activeProjects;
  document.getElementById("nlmCount").textContent = state.dataset.summary.nlmProjects;
  document.getElementById("rmProjectCount").textContent = state.dataset.summary.rmProjects;
  document.getElementById("searchTime").textContent = `${loadTime.toFixed(1)}ms`;
  document.getElementById("strataCountBadge").textContent = state.dataset.summary.activeProjects;
  document.getElementById("rmCountBadge").textContent = state.dataset.summary.rmProjects;
}

function updatePlaceholder() {
  const placeholders = {
    simple: "Enter project number (e.g., 5164 or 5164-10)",
    multi: "Enter multiple projects separated by comma (e.g., 5164, 5200, 5300)",
    strata: "Enter all or part of a strata plan (e.g., LMS3174)",
  };
  document.getElementById("searchInput").placeholder = placeholders[state.searchMode];
}

function resetFilters() {
  FILTER_IDS.forEach((id) => { document.getElementById(id).value = ""; });
}

function clearResults() {
  document.getElementById("resultsContainer").classList.remove("active");
  document.getElementById("results").innerHTML = "";
  document.getElementById("searchInput").value = "";
  document.getElementById("rmSearchInput").value = "";
  state.rmGroups = [];
  state.rmDisplayed = 0;
}

function updateFooter() {
  document.getElementById("lastModified").textContent = "Application version 3.0 · Local data only";
  document.getElementById("currentYear").textContent = new Date().getFullYear();
}

function updateTime() {
  document.getElementById("currentTime").textContent = `🕐 ${new Date().toLocaleString("en-CA", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })}`;
}

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function titleCase(value) {
  return String(value || "").toLowerCase().replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
}

