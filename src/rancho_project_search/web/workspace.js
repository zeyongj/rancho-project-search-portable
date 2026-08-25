"use strict";

const workspaceState = {
  editorFile: "pm.csv",
  editorDirty: false,
  distributionType: "ap",
  distributions: { ap: [], ar: [] },
};

document.addEventListener("DOMContentLoaded", async () => {
  setupWorkspaceEvents();
  await Promise.all([refreshFiles(), loadEditorFile("pm.csv"), loadDistributions()]);
});

function setupWorkspaceEvents() {
  document.getElementById("openFolderBtn").addEventListener("click", openDataFolder);
  document.getElementById("importProjectListBtn").addEventListener("click", importProjectList);
  document.getElementById("replaceFileBtn").addEventListener("click", replaceIndividualFile);
  document.getElementById("refreshFilesBtn").addEventListener("click", refreshFiles);
  document.getElementById("reloadEditorBtn").addEventListener("click", () => loadEditorFile(valueOf("editorFile"), true));
  document.getElementById("editorFile").addEventListener("change", async (event) => {
    if (workspaceState.editorDirty && !window.confirm("Discard unsaved editor changes?")) {
      event.target.value = workspaceState.editorFile;
      return;
    }
    await loadEditorFile(event.target.value, true);
  });
  document.getElementById("dataEditor").addEventListener("input", () => {
    workspaceState.editorDirty = true;
    updateEditorStatus();
  });
  document.getElementById("copyEditorBtn").addEventListener("click", copyEditor);
  document.getElementById("saveEditorBtn").addEventListener("click", saveEditor);
  document.querySelectorAll(".distribution-tab").forEach((button) => {
    button.addEventListener("click", () => switchDistribution(button.dataset.type));
  });
  document.getElementById("addDistributionBtn").addEventListener("click", addDistribution);
  document.getElementById("saveDistributionBtn").addEventListener("click", saveDistribution);
  window.addEventListener("beforeunload", (event) => {
    if (!workspaceState.editorDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });
}

async function importProjectList() {
  const input = document.getElementById("projectListFile");
  const file = input.files[0];
  if (!file) {
    showNotice("Choose a Project List .xlsx file first.", "error");
    return;
  }
  if (!window.confirm("Import this workbook and replace pm.csv and nlm.csv? Existing files will be backed up first.")) return;
  setBusy("importProjectListBtn", true, "Importing…");
  showNotice("Validating the workbook and deriving both CSV files…", "info");
  try {
    const result = await apiRequest("/api/import/project-list", {
      method: "POST",
      headers: writeHeaders("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      body: file,
    });
    const overlap = result.activeWinsOverNlm.length
      ? `\nActive priority applied to: ${result.activeWinsOverNlm.join(", ")}.`
      : "\nNo Active/NLM duplicate project numbers were found.";
    showNotice(
      `Workbook imported. ${result.activeProjects} Active projects and ${result.nlmProjects} NLM source projects were generated.` +
      `${overlap}\nBackups created: ${result.backups.length}.`,
      "success",
    );
    input.value = "";
    await Promise.all([refreshFiles(), loadEditorFile(workspaceState.editorFile, true)]);
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy("importProjectListBtn", false, "Import Project List");
  }
}

async function replaceIndividualFile() {
  const target = valueOf("replaceTarget");
  const input = document.getElementById("replacementFile");
  const file = input.files[0];
  if (!file) {
    showNotice("Choose a CSV or JSON file first.", "error");
    return;
  }
  const sourceExtension = file.name.split(".").pop().toLowerCase();
  const targetExtension = target.split(".").pop().toLowerCase();
  if (sourceExtension !== targetExtension) {
    showNotice(`The selected file is .${sourceExtension}, but ${target} requires .${targetExtension}.`, "error");
    return;
  }
  if (!window.confirm(`Replace ${target} with ${file.name}? A backup will be created first.`)) return;
  setBusy("replaceFileBtn", true, "Replacing…");
  try {
    const result = await apiRequest(`/api/files/${encodeURIComponent(target)}`, {
      method: "PUT",
      headers: writeHeaders(file.type || "application/octet-stream"),
      body: file,
    });
    showNotice(`${result.saved} was validated and replaced. Backups created: ${result.backups.length}.`, "success");
    input.value = "";
    await refreshFiles();
    if (workspaceState.editorFile === target) await loadEditorFile(target, true);
    if (target === "ap.json" || target === "ar.json") await loadDistributions();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy("replaceFileBtn", false, "Validate & Replace");
  }
}

async function loadEditorFile(name, force = false) {
  if (!force && workspaceState.editorDirty) return;
  try {
    document.getElementById("editorStatus").textContent = `Loading ${name}…`;
    const response = await fetch(`/api/files/${encodeURIComponent(name)}`, { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json()).error || `Unable to load ${name}`);
    document.getElementById("dataEditor").value = await response.text();
    document.getElementById("editorFile").value = name;
    document.getElementById("downloadEditorBtn").href = `/api/files/${encodeURIComponent(name)}`;
    document.getElementById("downloadEditorBtn").download = name;
    workspaceState.editorFile = name;
    workspaceState.editorDirty = false;
    updateEditorStatus();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function saveEditor() {
  const name = workspaceState.editorFile;
  if (!window.confirm(`Validate and save changes to ${name}? A backup will be created first.`)) return;
  setBusy("saveEditorBtn", true, "Saving…");
  try {
    const result = await apiRequest(`/api/files/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: writeHeaders("text/plain; charset=utf-8"),
      body: document.getElementById("dataEditor").value,
    });
    workspaceState.editorDirty = false;
    updateEditorStatus();
    showNotice(`${result.saved} was validated and saved. Backups created: ${result.backups.length}.`, "success");
    await refreshFiles();
    if (name === "ap.json" || name === "ar.json") await loadDistributions();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy("saveEditorBtn", false, "Save Changes");
  }
}

async function copyEditor() {
  try {
    await navigator.clipboard.writeText(document.getElementById("dataEditor").value);
    showNotice(`${workspaceState.editorFile} copied to the clipboard.`, "success");
  } catch {
    document.getElementById("dataEditor").select();
    showNotice("The text is selected. Press Ctrl+C or Cmd+C to copy it.", "info");
  }
}

async function loadDistributions() {
  try {
    const [apResponse, arResponse] = await Promise.all([
      fetch("/api/files/ap.json", { cache: "no-store" }),
      fetch("/api/files/ar.json", { cache: "no-store" }),
    ]);
    if (!apResponse.ok || !arResponse.ok) throw new Error("Unable to load AP/AR distribution data");
    workspaceState.distributions.ap = await apResponse.json();
    workspaceState.distributions.ar = await arResponse.json();
    renderDistributions();
  } catch (error) {
    showNotice(error.message, "error");
  }
}

function switchDistribution(type) {
  workspaceState.distributionType = type;
  document.querySelectorAll(".distribution-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.type === type);
  });
  document.getElementById("saveDistributionBtn").textContent = `Save ${type.toUpperCase()}`;
  renderDistributions();
}

function renderDistributions() {
  const type = workspaceState.distributionType;
  const entries = workspaceState.distributions[type];
  const container = document.getElementById("distributionList");
  if (!entries.length) {
    container.innerHTML = '<p class="empty-message">No entries yet. Select “Add Entry” to create one.</p>';
    return;
  }
  container.innerHTML = entries.map((entry, index) => `
    <div class="list-item">
      <input type="text" value="${escapeAttribute(entry.Name || "")}" placeholder="Name" data-index="${index}" data-field="Name">
      <input type="text" value="${escapeAttribute(entry.Portfolio || "")}" placeholder="e.g., 5218-5337" data-index="${index}" data-field="Portfolio">
      <input type="text" value="${escapeAttribute(entry.Include || "")}" placeholder="Comma-separated" data-index="${index}" data-field="Include">
      <input type="text" value="${escapeAttribute(entry.Exclude || "")}" placeholder="Comma-separated" data-index="${index}" data-field="Exclude">
      <button class="delete-btn" data-delete-index="${index}" aria-label="Delete entry">✕</button>
    </div>`).join("");
  container.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      workspaceState.distributions[type][Number(input.dataset.index)][input.dataset.field] = input.value;
    });
  });
  container.querySelectorAll("[data-delete-index]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("Delete this distribution entry?")) return;
      workspaceState.distributions[type].splice(Number(button.dataset.deleteIndex), 1);
      renderDistributions();
    });
  });
}

function addDistribution() {
  workspaceState.distributions[workspaceState.distributionType].push({ Name: "", Portfolio: "", Include: "", Exclude: "" });
  renderDistributions();
}

async function saveDistribution() {
  const type = workspaceState.distributionType;
  const name = `${type}.json`;
  setBusy("saveDistributionBtn", true, "Saving…");
  try {
    const result = await apiRequest(`/api/files/${name}`, {
      method: "PUT",
      headers: writeHeaders("text/plain; charset=utf-8"),
      body: `${JSON.stringify(workspaceState.distributions[type], null, 2)}\n`,
    });
    showNotice(`${name} saved. Backups created: ${result.backups.length}.`, "success");
    if (workspaceState.editorFile === name) await loadEditorFile(name, true);
    await refreshFiles();
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setBusy("saveDistributionBtn", false, `Save ${type.toUpperCase()}`);
  }
}

async function refreshFiles() {
  try {
    const data = await apiRequest("/api/files");
    document.getElementById("dataDirectory").textContent = data.dataDirectory;
    document.getElementById("fileInventory").innerHTML = data.files.map((file) => `
      <div class="file-card">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${file.exists ? formatBytes(file.size) : "Not created yet"}</span>
        <span>${file.updated ? `Updated ${escapeHtml(new Date(file.updated).toLocaleString())}` : ""}</span>
        ${file.exists ? `<a href="/api/files/${encodeURIComponent(file.name)}" download="${escapeAttribute(file.name)}">Download copy</a>` : ""}
      </div>`).join("");
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function openDataFolder() {
  try {
    const result = await apiRequest("/api/open-data-folder", { method: "POST", headers: writeHeaders("application/json"), body: "{}" });
    showNotice(`Opened ${result.opened}`, "success");
  } catch (error) {
    showNotice(error.message, "error");
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

function writeHeaders(contentType) {
  return { "Content-Type": contentType, "X-Rancho-Request": "1" };
}

function showNotice(message, type) {
  const notice = document.getElementById("notice");
  notice.textContent = message;
  notice.className = `workspace-notice visible ${type}`;
  notice.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function updateEditorStatus() {
  const bytes = new Blob([document.getElementById("dataEditor").value]).size;
  document.getElementById("editorStatus").textContent =
    `${workspaceState.editorFile} · ${formatBytes(bytes)}${workspaceState.editorDirty ? " · Unsaved changes" : " · Saved"}`;
}

function setBusy(id, busy, label) {
  const button = document.getElementById(id);
  button.disabled = busy;
  button.textContent = label;
}

function valueOf(id) {
  return document.getElementById(id).value.trim();
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

