"use strict";

const FIREBASE_VERSION = "12.7.0";
const VIEW_TITLES = {
  today: "Today",
  build: "Build",
  library: "Library",
  settings: "Settings"
};

const starterTemplates = [
  {
    title: "Daily close",
    area: "Work",
    items: [
      "Capture loose notes",
      "Review calendar for tomorrow",
      "Update priority list",
      "Clear urgent messages",
      "Set first task"
    ]
  },
  {
    title: "Trip packing",
    area: "Travel",
    items: [
      "Passport and ID",
      "Chargers and adapters",
      "Toiletries",
      "Medication",
      "Travel outfit",
      "Booking details"
    ]
  },
  {
    title: "Weekly reset",
    area: "Personal",
    items: [
      "Review open loops",
      "Plan key appointments",
      "Check budget",
      "Tidy workspace",
      "Pick three priorities"
    ]
  },
  {
    title: "Client onboarding",
    area: "Work",
    items: [
      "Confirm scope",
      "Create shared folder",
      "Send welcome email",
      "Book kickoff call",
      "Add project milestones"
    ]
  }
];

const elements = {
  screenTitle: document.querySelector("#screenTitle"),
  installButton: document.querySelector("#installButton"),
  topCloudButton: document.querySelector("#topCloudButton"),
  tabs: document.querySelectorAll(".tab"),
  views: document.querySelectorAll(".view"),
  welcomeDashboard: document.querySelector("#welcomeDashboard"),
  todaySearch: document.querySelector("#todaySearch"),
  librarySearch: document.querySelector("#librarySearch"),
  newFromToday: document.querySelector("#newFromToday"),
  form: document.querySelector("#checklistForm"),
  title: document.querySelector("#checklistTitle"),
  area: document.querySelector("#checklistArea"),
  date: document.querySelector("#checklistDate"),
  items: document.querySelector("#checklistItems"),
  starterTemplates: document.querySelector("#starterTemplates"),
  activeChecklist: document.querySelector("#activeChecklist"),
  checklistList: document.querySelector("#checklistList"),
  libraryList: document.querySelector("#libraryList"),
  statOpen: document.querySelector("#statOpen"),
  statDone: document.querySelector("#statDone"),
  statItems: document.querySelector("#statItems"),
  themeSelect: document.querySelector("#themeSelect"),
  themeLabel: document.querySelector("#themeLabel"),
  hideCompletedToggle: document.querySelector("#hideCompletedToggle"),
  hideDoneLabel: document.querySelector("#hideDoneLabel"),
  cloudAccountLabel: document.querySelector("#cloudAccountLabel"),
  cloudAuthButton: document.querySelector("#cloudAuthButton"),
  workspaceLabel: document.querySelector("#workspaceLabel"),
  joinWorkspaceButton: document.querySelector("#joinWorkspaceButton"),
  shareWorkspaceButton: document.querySelector("#shareWorkspaceButton"),
  syncLabel: document.querySelector("#syncLabel"),
  syncButton: document.querySelector("#syncButton"),
  storageLabel: document.querySelector("#storageLabel"),
  exportButton: document.querySelector("#exportButton"),
  importInput: document.querySelector("#importInput"),
  dialog: document.querySelector("#checklistDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogBody: document.querySelector("#dialogBody"),
  toast: document.querySelector("#toast")
};

let deferredInstallPrompt = null;
purgeLocalRoutineStorage();
let state = createDefaultState();
let cloudSaveTimer = null;
const cloud = {
  configured: false,
  ready: false,
  user: null,
  workspaceId: "",
  workspaceName: "Personal cloud",
  status: "Local only",
  applyingRemote: false,
  unsubscribe: null,
  modules: null,
  app: null,
  auth: null,
  db: null,
  pendingJoinId: ""
};
const initialHash = window.location.hash.replace("#", "");
const initialView = initialHash.startsWith("sync=") || initialHash.startsWith("join=") ? "" : initialHash;
if (VIEW_TITLES[initialView]) {
  state.activeView = initialView;
}

renderStarterTemplates();
bindEvents();
applyTheme();
render();
handleIncomingSyncLink();
handleIncomingWorkspaceLink();
initCloud();
registerServiceWorker();

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultState() {
  return {
    activeView: "today",
    activeId: null,
    settings: {
      theme: "light",
      hideCompleted: false
    },
    checklists: []
  };
}

function purgeLocalRoutineStorage() {
  try {
    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith("checklist-studio:")) {
        keys.push(key);
      }
    }

    keys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    // Local storage may be unavailable in private browsing.
  }
}

function normalizeChecklist(checklist) {
  if (!checklist || typeof checklist !== "object" || !checklist.title) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: checklist.id || createId(),
    title: String(checklist.title),
    area: checklist.area || "Personal",
    date: checklist.date || "",
    mode: checklist.mode || "once",
    createdAt: checklist.createdAt || now,
    updatedAt: checklist.updatedAt || now,
    items: Array.isArray(checklist.items)
      ? checklist.items
          .map((item) => {
            if (typeof item === "string") {
              return { id: createId(), text: item, done: false };
            }

            if (!item || !item.text) {
              return null;
            }

            return {
              id: item.id || createId(),
              text: String(item.text),
              done: Boolean(item.done)
            };
          })
          .filter(Boolean)
      : []
  };
}

function persist() {
  if (!cloud.applyingRemote) {
    queueCloudSave();
  }
}

function saveAndRender(message) {
  persist();
  render();
  if (message) {
    showToast(message);
  }
}

function requireCloudReady() {
  if (cloud.ready && cloud.user && cloud.workspaceId) {
    return true;
  }

  showToast(cloud.user ? "Cloud is still connecting" : "Sign in to save routines in cloud");
  openCloudDialog();
  return false;
}

function bindEvents() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
  });

  elements.newFromToday.addEventListener("click", () => {
    setView("build");
    requestAnimationFrame(() => elements.title.focus());
  });

  elements.todaySearch.addEventListener("input", render);
  elements.librarySearch.addEventListener("input", render);

  elements.form.addEventListener("submit", handleChecklistSubmit);
  elements.form.addEventListener("reset", () => {
    requestAnimationFrame(() => {
      elements.form.querySelector('[name="mode"][value="once"]').checked = true;
      if (state.activeView === "build") {
        elements.title.focus();
      }
    });
  });

  elements.themeSelect.addEventListener("change", () => {
    state.settings.theme = elements.themeSelect.value;
    applyTheme();
    saveAndRender("Theme updated");
  });

  elements.hideCompletedToggle.addEventListener("change", () => {
    state.settings.hideCompleted = elements.hideCompletedToggle.checked;
    saveAndRender(state.settings.hideCompleted ? "Completed items hidden" : "Completed items visible");
  });

  elements.topCloudButton.addEventListener("click", openCloudDialog);
  elements.cloudAuthButton.addEventListener("click", handleCloudAuthClick);
  elements.shareWorkspaceButton.addEventListener("click", shareCloudWorkspace);
  elements.joinWorkspaceButton.addEventListener("click", openJoinWorkspaceDialog);
  elements.syncButton.addEventListener("click", openSyncDialog);
  elements.exportButton.addEventListener("click", exportData);
  elements.importInput.addEventListener("change", importData);

  document.addEventListener("click", handleDocumentClick);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.classList.remove("is-hidden");
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    elements.installButton.classList.add("is-hidden");
  });

  const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof colorSchemeQuery.addEventListener === "function") {
    colorSchemeQuery.addEventListener("change", applyTheme);
  } else if (typeof colorSchemeQuery.addListener === "function") {
    colorSchemeQuery.addListener(applyTheme);
  }
}

function handleChecklistSubmit(event) {
  event.preventDefault();

  if (!requireCloudReady()) {
    return;
  }

  const title = elements.title.value.trim();
  const items = parseItems(elements.items.value);
  const mode = new FormData(elements.form).get("mode") || "once";

  if (!title) {
    showToast("Add a checklist name");
    elements.title.focus();
    return;
  }

  if (!items.length) {
    showToast("Add at least one item");
    elements.items.focus();
    return;
  }

  const checklist = normalizeChecklist({
    id: createId(),
    title,
    area: elements.area.value,
    date: elements.date.value,
    mode,
    items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  state.checklists.unshift(checklist);
  state.activeId = mode === "template" ? state.activeId : checklist.id;
  elements.form.reset();
  elements.form.querySelector('[name="mode"][value="once"]').checked = true;
  setView(mode === "template" ? "library" : "today", false);
  saveAndRender("Checklist saved");
}

function parseItems(value) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text) => ({ id: createId(), text, done: false }));
}

function renderStarterTemplates() {
  elements.starterTemplates.innerHTML = starterTemplates
    .map((template, index) => {
      const count = template.items.length;
      return `
        <button class="template-button" type="button" data-template-index="${index}">
          <strong>${escapeHtml(template.title)}</strong>
          <span>${count} items</span>
        </button>
      `;
    })
    .join("");
}

function handleDocumentClick(event) {
  const templateButton = event.target.closest("[data-template-index]");
  if (templateButton) {
    applyStarterTemplate(Number(templateButton.dataset.templateIndex));
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const action = actionButton.dataset.action;
  const checklistId = actionButton.dataset.checklistId;
  const itemId = actionButton.dataset.itemId;

  if (action === "open") {
    state.activeId = checklistId;
    setView("today", false);
    saveAndRender();
    return;
  }

  if (action === "start-template") {
    startFromTemplate(checklistId);
    return;
  }

  if (action === "duplicate") {
    duplicateChecklist(checklistId);
    return;
  }

  if (action === "edit-checklist") {
    openChecklistEditor(checklistId);
    return;
  }

  if (action === "delete-checklist") {
    deleteChecklist(checklistId);
    return;
  }

  if (action === "toggle-item") {
    toggleItem(checklistId, itemId);
    return;
  }

  if (action === "edit-item") {
    openItemEditor(checklistId, itemId);
    return;
  }

  if (action === "delete-item") {
    deleteItem(checklistId, itemId);
    return;
  }

  if (action === "quick-add") {
    quickAddItem(checklistId);
    return;
  }

  if (action === "reset-checklist") {
    resetChecklist(checklistId);
    return;
  }

  if (action === "switch-view") {
    setView(actionButton.dataset.view);
    return;
  }

  if (action === "open-cloud") {
    openCloudDialog();
  }
}

function applyStarterTemplate(index) {
  const template = starterTemplates[index];
  if (!template) {
    return;
  }

  elements.title.value = template.title;
  elements.area.value = template.area;
  elements.items.value = template.items.join("\n");
  elements.form.querySelector('[name="mode"][value="once"]').checked = true;
  elements.title.focus();
  showToast("Template loaded");
}

function setView(view, shouldRender = true) {
  state.activeView = VIEW_TITLES[view] ? view : "today";
  elements.screenTitle.textContent = VIEW_TITLES[state.activeView];

  elements.tabs.forEach((tab) => {
    const isActive = tab.dataset.view === state.activeView;
    tab.classList.toggle("is-active", isActive);
    tab.toggleAttribute("aria-current", isActive);
  });

  elements.views.forEach((viewElement) => {
    viewElement.classList.toggle("is-active", viewElement.id === `${state.activeView}View`);
  });

  if (shouldRender) {
    saveAndRender();
  }
}

function render() {
  ensureActiveChecklist();
  setView(state.activeView || "today", false);
  renderWelcomeDashboard();
  renderStats();
  renderActiveChecklist();
  renderChecklistList();
  renderLibrary();
  renderSettings();
}

function ensureActiveChecklist() {
  const active = getChecklist(state.activeId);
  if (active && active.mode !== "template") {
    return;
  }

  const firstOpen = getOpenChecklists()[0];
  state.activeId = firstOpen ? firstOpen.id : null;
}

function renderWelcomeDashboard() {
  const firstName = cloud.user && cloud.user.displayName
    ? cloud.user.displayName.split(" ")[0]
    : "there";
  const title = cloud.user ? `Welcome back, ${firstName}` : "A calmer place for your routines";
  const body = cloud.user
    ? `${cloud.workspaceName} is private to your Google account unless you share a workspace.`
    : "Sign in with Google to sync across your phone and laptop, then share a workspace with friends.";
  const cloudClass = cloud.ready ? "cloud-status is-live" : "cloud-status";
  const cloudLabel = cloud.ready
    ? cloud.workspaceName
    : cloud.user
      ? "Connecting cloud"
      : cloud.configured
        ? "Sign in required"
      : "Cloud setup needed";

  elements.welcomeDashboard.innerHTML = `
    <section class="welcome-dashboard" aria-label="Welcome dashboard">
      <div class="welcome-copy">
        <span class="${cloudClass}">${escapeHtml(cloudLabel)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body)}</p>
      </div>
      <div class="welcome-actions">
        <button class="button primary" type="button" data-action="switch-view" data-view="build">New routine</button>
        <button class="button" type="button" data-action="open-cloud">Cloud</button>
      </div>
    </section>
  `;
}

function renderStats() {
  const open = getOpenChecklists();
  const itemCount = open.reduce((total, checklist) => total + checklist.items.length, 0);
  const doneCount = open.reduce(
    (total, checklist) => total + checklist.items.filter((item) => item.done).length,
    0
  );
  const percent = itemCount ? Math.round((doneCount / itemCount) * 100) : 0;

  elements.statOpen.textContent = String(open.length);
  elements.statDone.textContent = `${percent}%`;
  elements.statItems.textContent = String(itemCount);
}

function renderActiveChecklist() {
  const checklist = getChecklist(state.activeId);
  if (!checklist || checklist.mode === "template") {
    if (!cloud.ready) {
      elements.activeChecklist.innerHTML = `
        <div class="empty-state">
          <svg><use href="#icon-cloud"></use></svg>
          <h2>Cloud sign-in required</h2>
          <p>Routines are saved only in Google cloud. Sign in to load or create them.</p>
          <button class="button primary" type="button" data-action="open-cloud">Cloud</button>
        </div>
      `;
      return;
    }

    elements.activeChecklist.innerHTML = emptyState(
      "No active checklist",
      "Create one or start from a saved template.",
      "Build",
      "build"
    );
    return;
  }

  const visibleItems = state.settings.hideCompleted
    ? checklist.items.filter((item) => !item.done)
    : checklist.items;

  const progress = getProgress(checklist);
  const itemsHtml = visibleItems.length
    ? visibleItems
        .map((item) => {
          return `
            <div class="item-row ${item.done ? "is-done" : ""}">
              <button class="check-toggle" type="button" data-action="toggle-item" data-checklist-id="${escapeAttr(checklist.id)}" data-item-id="${escapeAttr(item.id)}" aria-label="${item.done ? "Mark incomplete" : "Mark complete"}">
                <svg><use href="#icon-check"></use></svg>
              </button>
              <span class="item-text">${escapeHtml(item.text)}</span>
              <span class="item-actions">
                <button class="icon-button" type="button" data-action="edit-item" data-checklist-id="${escapeAttr(checklist.id)}" data-item-id="${escapeAttr(item.id)}" aria-label="Edit item" title="Edit item">
                  <svg><use href="#icon-edit"></use></svg>
                </button>
                <button class="icon-button danger" type="button" data-action="delete-item" data-checklist-id="${escapeAttr(checklist.id)}" data-item-id="${escapeAttr(item.id)}" aria-label="Delete item" title="Delete item">
                  <svg><use href="#icon-trash"></use></svg>
                </button>
              </span>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state"><h2>All visible items are complete</h2></div>`;

  elements.activeChecklist.innerHTML = `
    <section class="active-panel" aria-label="${escapeAttr(checklist.title)}">
      <header>
        <div>
          <h2>${escapeHtml(checklist.title)}</h2>
          <div class="meta-row">${renderMeta(checklist)}</div>
        </div>
        <div class="card-actions">
          <button class="icon-button" type="button" data-action="reset-checklist" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Reset checklist" title="Reset checklist">
            <svg><use href="#icon-refresh"></use></svg>
          </button>
          <button class="icon-button" type="button" data-action="edit-checklist" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Edit checklist" title="Edit checklist">
            <svg><use href="#icon-edit"></use></svg>
          </button>
        </div>
      </header>
      <div class="progress" aria-label="${progress}% complete" style="--progress: ${progress}%"><span></span></div>
      <div class="items">${itemsHtml}</div>
      <div class="quick-add">
        <input id="quickAdd-${escapeAttr(checklist.id)}" type="text" placeholder="Add item" autocomplete="off">
        <button class="icon-button primary" type="button" data-action="quick-add" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Add item" title="Add item">
          <svg><use href="#icon-plus"></use></svg>
        </button>
      </div>
    </section>
  `;

  const quickInput = document.getElementById(`quickAdd-${checklist.id}`);
  quickInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      quickAddItem(checklist.id);
    }
  });
}

function renderChecklistList() {
  const query = normalizeSearch(elements.todaySearch.value);
  const activeId = state.activeId;
  const checklists = getOpenChecklists()
    .filter((checklist) => checklist.id !== activeId)
    .filter((checklist) => matchesChecklist(checklist, query));

  if (!checklists.length) {
    elements.checklistList.innerHTML = "";
    return;
  }

  elements.checklistList.innerHTML = checklists.map((checklist) => checklistCard(checklist, "today")).join("");
}

function renderLibrary() {
  const query = normalizeSearch(elements.librarySearch.value);
  const checklists = [...state.checklists]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .filter((checklist) => matchesChecklist(checklist, query));

  if (!checklists.length) {
    elements.libraryList.innerHTML = emptyState(
      "Library is empty",
      "Templates and saved checklists will appear here.",
      "Build",
      "build"
    );
    return;
  }

  elements.libraryList.innerHTML = checklists.map((checklist) => checklistCard(checklist, "library")).join("");
}

function renderSettings() {
  elements.themeSelect.value = state.settings.theme;
  elements.themeLabel.textContent = labelForTheme(state.settings.theme);
  elements.hideCompletedToggle.checked = Boolean(state.settings.hideCompleted);
  elements.hideDoneLabel.textContent = state.settings.hideCompleted ? "Hidden" : "Visible";
  elements.cloudAccountLabel.textContent = cloud.user
    ? `${cloud.user.displayName || cloud.user.email || "Signed in"} · private cloud`
    : cloud.configured
      ? "Ready for Google sign-in"
      : "Add Firebase config to enable";
  elements.cloudAuthButton.textContent = cloud.user ? "Sign out" : "Sign in";
  elements.workspaceLabel.textContent = cloud.ready
    ? `${cloud.workspaceName} · ${cloud.status}`
    : cloud.user
      ? "Starting personal cloud"
      : "Local browser only";
  elements.shareWorkspaceButton.disabled = !cloud.ready;
  elements.joinWorkspaceButton.disabled = !cloud.user || !cloud.configured;

  const count = state.checklists.length;
  const itemCount = state.checklists.reduce((total, checklist) => total + checklist.items.length, 0);
  elements.syncLabel.textContent = count ? `${count} checklists ready to sync` : "No routines yet";
  elements.storageLabel.textContent = `${count} checklists, ${itemCount} items`;
}

function checklistCard(checklist, context) {
  const progress = getProgress(checklist);
  const primaryAction = checklist.mode === "template" ? "start-template" : "open";
  const primaryIcon = checklist.mode === "template" ? "icon-plus" : "icon-list";
  const primaryLabel = checklist.mode === "template" ? "Start from template" : "Open checklist";

  return `
    <article class="checklist-card">
      <div class="checklist-header">
        <div class="checklist-title">
          <h2>${escapeHtml(checklist.title)}</h2>
          <div class="meta-row">${renderMeta(checklist)}</div>
        </div>
        <div class="card-actions">
          <button class="icon-button primary" type="button" data-action="${primaryAction}" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="${primaryLabel}" title="${primaryLabel}">
            <svg><use href="#${primaryIcon}"></use></svg>
          </button>
        </div>
      </div>
      <div class="progress" aria-label="${progress}% complete" style="--progress: ${progress}%"><span></span></div>
      <div class="card-actions">
        <button class="icon-button" type="button" data-action="duplicate" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Duplicate checklist" title="Duplicate checklist">
          <svg><use href="#icon-copy"></use></svg>
        </button>
        <button class="icon-button" type="button" data-action="edit-checklist" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Edit checklist" title="Edit checklist">
          <svg><use href="#icon-edit"></use></svg>
        </button>
        <button class="icon-button danger" type="button" data-action="delete-checklist" data-checklist-id="${escapeAttr(checklist.id)}" aria-label="Delete checklist" title="Delete checklist">
          <svg><use href="#icon-trash"></use></svg>
        </button>
      </div>
    </article>
  `;
}

function renderMeta(checklist) {
  const parts = [
    `<span class="pill">${escapeHtml(checklist.area)}</span>`,
    `<span class="pill accent">${escapeHtml(labelForMode(checklist.mode))}</span>`,
    `<span class="pill">${checklist.items.length} items</span>`
  ];

  if (checklist.date) {
    parts.splice(1, 0, `<span class="pill">${escapeHtml(formatDate(checklist.date))}</span>`);
  }

  return parts.join("");
}

function emptyState(title, body, actionLabel, view) {
  return `
    <div class="empty-state">
      <svg><use href="#icon-list"></use></svg>
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
      <button class="button primary" type="button" data-action="switch-view" data-view="${escapeAttr(view)}">${escapeHtml(actionLabel)}</button>
    </div>
  `;
}

function getOpenChecklists() {
  return [...state.checklists]
    .filter((checklist) => checklist.mode !== "template")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getChecklist(id) {
  return state.checklists.find((checklist) => checklist.id === id);
}

function getProgress(checklist) {
  if (!checklist.items.length) {
    return 0;
  }

  const done = checklist.items.filter((item) => item.done).length;
  return Math.round((done / checklist.items.length) * 100);
}

function matchesChecklist(checklist, query) {
  if (!query) {
    return true;
  }

  const content = normalizeSearch(
    [
      checklist.title,
      checklist.area,
      checklist.mode,
      checklist.date,
      ...checklist.items.map((item) => item.text)
    ].join(" ")
  );

  return content.includes(query);
}

function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function startFromTemplate(id) {
  if (!requireCloudReady()) {
    return;
  }

  const template = getChecklist(id);
  if (!template) {
    return;
  }

  const checklist = normalizeChecklist({
    id: createId(),
    title: template.title,
    area: template.area,
    date: "",
    mode: "once",
    items: template.items.map((item) => ({ text: item.text, done: false })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  state.checklists.unshift(checklist);
  state.activeId = checklist.id;
  setView("today", false);
  saveAndRender("Checklist started");
}

function duplicateChecklist(id) {
  if (!requireCloudReady()) {
    return;
  }

  const source = getChecklist(id);
  if (!source) {
    return;
  }

  const checklist = normalizeChecklist({
    id: createId(),
    title: `${source.title} copy`,
    area: source.area,
    date: source.date,
    mode: source.mode,
    items: source.items.map((item) => ({ text: item.text, done: false })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  state.checklists.unshift(checklist);
  if (checklist.mode !== "template") {
    state.activeId = checklist.id;
  }
  saveAndRender("Checklist duplicated");
}

function deleteChecklist(id) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(id);
  if (!checklist) {
    return;
  }

  if (!window.confirm(`Delete "${checklist.title}"?`)) {
    return;
  }

  state.checklists = state.checklists.filter((item) => item.id !== id);
  if (state.activeId === id) {
    state.activeId = null;
  }
  saveAndRender("Checklist deleted");
}

function toggleItem(checklistId, itemId) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(checklistId);
  const item = checklist && checklist.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  item.done = !item.done;
  checklist.updatedAt = new Date().toISOString();
  saveAndRender();
}

function quickAddItem(checklistId) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(checklistId);
  const input = document.getElementById(`quickAdd-${checklistId}`);
  const text = input ? input.value.trim() : "";

  if (!checklist || !text) {
    return;
  }

  checklist.items.push({ id: createId(), text, done: false });
  checklist.updatedAt = new Date().toISOString();
  saveAndRender("Item added");
}

function deleteItem(checklistId, itemId) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(checklistId);
  if (!checklist) {
    return;
  }

  checklist.items = checklist.items.filter((item) => item.id !== itemId);
  checklist.updatedAt = new Date().toISOString();
  saveAndRender("Item deleted");
}

function resetChecklist(checklistId) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(checklistId);
  if (!checklist) {
    return;
  }

  checklist.items = checklist.items.map((item) => ({ ...item, done: false }));
  checklist.updatedAt = new Date().toISOString();
  saveAndRender("Checklist reset");
}

function openChecklistEditor(id) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(id);
  if (!checklist) {
    return;
  }

  elements.dialogTitle.textContent = "Edit checklist";
  elements.dialogBody.innerHTML = `
    <form class="dialog-form" id="editChecklistForm">
      <div class="field">
        <label for="editTitle">Checklist name</label>
        <input id="editTitle" name="title" type="text" value="${escapeAttr(checklist.title)}" required>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="editArea">Area</label>
          <select id="editArea" name="area">
            ${["Personal", "Work", "Home", "Travel", "Health"]
              .map(
                (area) =>
                  `<option ${area === checklist.area ? "selected" : ""}>${escapeHtml(area)}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <label for="editDate">Target date</label>
          <input id="editDate" name="date" type="date" value="${escapeAttr(checklist.date)}">
        </div>
      </div>
      <fieldset class="field segmented-field">
        <legend>Mode</legend>
        <div class="segmented">
          ${["once", "repeat", "template"]
            .map(
              (mode) => `
                <label>
                  <input type="radio" name="mode" value="${mode}" ${mode === checklist.mode ? "checked" : ""}>
                  <span>${escapeHtml(labelForMode(mode))}</span>
                </label>
              `
            )
            .join("")}
        </div>
      </fieldset>
      <div class="field">
        <label for="editItems">Items</label>
        <textarea id="editItems" name="items" rows="8">${escapeHtml(
          checklist.items.map((item) => item.text).join("\n")
        )}</textarea>
      </div>
      <div class="action-row">
        <button class="button ghost" type="button" data-close-dialog>Cancel</button>
        <button class="button primary" type="submit">Save changes</button>
      </div>
    </form>
  `;

  openDialog();

  const form = elements.dialogBody.querySelector("#editChecklistForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const lines = parseItems(String(formData.get("items") || ""));

    if (!lines.length) {
      showToast("Add at least one item");
      return;
    }

    checklist.title = String(formData.get("title") || "").trim();
    checklist.area = String(formData.get("area") || "Personal");
    checklist.date = String(formData.get("date") || "");
    checklist.mode = String(formData.get("mode") || "once");
    checklist.items = lines.map((line, index) => ({
      ...line,
      done: checklist.items[index] ? checklist.items[index].done : false
    }));
    checklist.updatedAt = new Date().toISOString();

    if (checklist.mode === "template" && state.activeId === checklist.id) {
      state.activeId = null;
    }

    closeDialog();
    saveAndRender("Checklist updated");
  });

  elements.dialogBody.querySelector("[data-close-dialog]").addEventListener("click", closeDialog);
}

function openItemEditor(checklistId, itemId) {
  if (!requireCloudReady()) {
    return;
  }

  const checklist = getChecklist(checklistId);
  const item = checklist && checklist.items.find((entry) => entry.id === itemId);
  if (!item) {
    return;
  }

  elements.dialogTitle.textContent = "Edit item";
  elements.dialogBody.innerHTML = `
    <form class="dialog-form" id="editItemForm">
      <div class="field">
        <label for="editItemText">Item</label>
        <input id="editItemText" name="text" type="text" value="${escapeAttr(item.text)}" required>
      </div>
      <div class="action-row">
        <button class="button ghost" type="button" data-close-dialog>Cancel</button>
        <button class="button primary" type="submit">Save item</button>
      </div>
    </form>
  `;

  openDialog();

  const form = elements.dialogBody.querySelector("#editItemForm");
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = String(new FormData(form).get("text") || "").trim();
    if (!text) {
      return;
    }

    item.text = text;
    checklist.updatedAt = new Date().toISOString();
    closeDialog();
    saveAndRender("Item updated");
  });

  elements.dialogBody.querySelector("[data-close-dialog]").addEventListener("click", closeDialog);
}

function openDialog() {
  if (elements.dialog.open) {
    return;
  }

  if (typeof elements.dialog.showModal === "function") {
    elements.dialog.showModal();
  } else {
    elements.dialog.setAttribute("open", "");
  }

  requestAnimationFrame(() => {
    const focusTarget = elements.dialogBody.querySelector("input, textarea, select, button");
    if (focusTarget) {
      focusTarget.focus();
    }
  });
}

function closeDialog() {
  if (typeof elements.dialog.close === "function") {
    elements.dialog.close();
  } else {
    elements.dialog.removeAttribute("open");
  }
}

async function initCloud() {
  const firebaseConfig = getFirebaseConfig();
  cloud.configured = Boolean(firebaseConfig);

  if (!cloud.configured) {
    cloud.status = "Cloud setup needed";
    render();
    return;
  }

  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`)
    ]);

    cloud.modules = { ...appModule, ...authModule, ...firestoreModule };
    cloud.app = cloud.modules.initializeApp(firebaseConfig);
    cloud.auth = cloud.modules.getAuth(cloud.app);
    cloud.db = cloud.modules.getFirestore(cloud.app);
    cloud.status = "Ready for Google sign-in";

    cloud.modules.getRedirectResult(cloud.auth).catch(() => {});
    cloud.modules.onAuthStateChanged(cloud.auth, async (user) => {
      cloud.user = user;

      if (!user) {
        stopCloudSync();
        cloud.workspaceId = "";
        cloud.workspaceName = "Personal cloud";
        state = createDefaultState();
        cloud.status = "Signed out";
        render();
        return;
      }

      try {
        if (cloud.pendingJoinId) {
          await joinWorkspaceById(cloud.pendingJoinId);
          cloud.pendingJoinId = "";
          clearSyncHash();
        } else {
          await activateWorkspace(defaultWorkspaceIdForUser(user));
        }
      } catch (error) {
        cloud.status = "Cloud sync needs attention";
        showToast("Cloud sync could not start");
      }

      render();
    });
  } catch (error) {
    cloud.configured = false;
    cloud.status = "Cloud unavailable";
    render();
  }
}

function getFirebaseConfig() {
  const config = window.CHECKLIST_FIREBASE_CONFIG;
  if (!config || !config.enabled || !config.firebase) {
    return null;
  }

  if (!config.firebase.apiKey || config.firebase.apiKey.includes("PASTE_")) {
    return null;
  }

  return config.firebase;
}

async function handleCloudAuthClick() {
  if (!cloud.configured) {
    openCloudSetupDialog();
    return;
  }

  if (cloud.user) {
    await cloud.modules.signOut(cloud.auth);
    showToast("Signed out");
    return;
  }

  await signInToCloud();
}

async function signInToCloud() {
  if (!cloud.configured) {
    openCloudSetupDialog();
    return;
  }

  const provider = new cloud.modules.GoogleAuthProvider();
  provider.addScope("profile");
  provider.addScope("email");

  try {
    await cloud.modules.signInWithPopup(cloud.auth, provider);
  } catch (error) {
    if (
      error.code === "auth/popup-blocked" ||
      error.code === "auth/popup-closed-by-user" ||
      error.code === "auth/operation-not-supported-in-this-environment"
    ) {
      await cloud.modules.signInWithRedirect(cloud.auth, provider);
      return;
    }

    showToast("Google sign-in failed");
  }
}

function stopCloudSync() {
  if (cloud.unsubscribe) {
    cloud.unsubscribe();
    cloud.unsubscribe = null;
  }
  cloud.ready = false;
}

function personalWorkspaceId(user) {
  return `personal_${user.uid}`;
}

function defaultWorkspaceIdForUser(user) {
  return personalWorkspaceId(user);
}

function isPersonalWorkspace(workspaceId) {
  return Boolean(cloud.user) && workspaceId === personalWorkspaceId(cloud.user);
}

function workspaceRef(workspaceId) {
  return cloud.modules.doc(cloud.db, "workspaces", workspaceId);
}

async function activateWorkspace(workspaceId) {
  if (!cloud.user || !cloud.db) {
    return;
  }

  stopCloudSync();
  cloud.workspaceId = workspaceId;
  cloud.workspaceName = workspaceId.startsWith("personal_") ? "Personal cloud" : "Shared workspace";

  const ref = workspaceRef(workspaceId);
  let snap = null;

  try {
    snap = await cloud.modules.getDoc(ref);
  } catch (error) {
    if (!isPersonalWorkspace(workspaceId)) {
      throw error;
    }
  }

  if (!snap || !snap.exists()) {
    await cloud.modules.setDoc(ref, buildCloudDocument({ workspaceId }), { merge: true });
  } else {
    applyCloudDocument(snap.data(), false);
  }

  cloud.ready = true;
  cloud.status = "Live";

  cloud.unsubscribe = cloud.modules.onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) {
        return;
      }
      applyCloudDocument(snapshot.data(), false);
    },
    () => {
      cloud.status = "Cloud listener paused";
      render();
    }
  );

  queueCloudSave();
}

function applyCloudDocument(data, shouldMergeLocal) {
  if (data.workspaceName) {
    cloud.workspaceName = String(data.workspaceName);
  }

  const incomingState = normalizeImportedState({
    activeId: data.activeId || null,
    settings: data.settings || {},
    checklists: Array.isArray(data.checklists) ? data.checklists : []
  });
  const nextState = shouldMergeLocal ? mergeImportedWithCurrent(incomingState) : incomingState;

  cloud.applyingRemote = true;
  state = {
    ...state,
    activeId: nextState.activeId || state.activeId,
    settings: {
      ...state.settings,
      ...nextState.settings
    },
    checklists: nextState.checklists
  };
  persist();
  cloud.applyingRemote = false;
  render();
}

function mergeImportedWithCurrent(importedState) {
  const byId = new Map(importedState.checklists.map((checklist) => [checklist.id, checklist]));
  state.checklists.forEach((checklist) => {
    const existing = byId.get(checklist.id);
    if (!existing || checklist.updatedAt > existing.updatedAt) {
      byId.set(checklist.id, checklist);
    }
  });

  return {
    activeId: state.activeId || importedState.activeId,
    settings: {
      ...importedState.settings,
      ...state.settings
    },
    checklists: [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  };
}

function buildCloudDocument(overrides = {}) {
  const uid = cloud.user.uid;
  return {
    app: "Checklists",
    version: 1,
    ownerUid: overrides.ownerUid || uid,
    workspaceName: overrides.workspaceName || cloud.workspaceName || "Personal cloud",
    joinOpen: Boolean(overrides.joinOpen),
    members: {
      [uid]: true
    },
    memberProfiles: {
      [uid]: {
        name: cloud.user.displayName || "",
        email: cloud.user.email || ""
      }
    },
    activeId: state.activeId || null,
    settings: state.settings,
    checklists: state.checklists,
    updatedAt: Date.now(),
    updatedBy: uid
  };
}

function queueCloudSave() {
  if (!cloud.ready || !cloud.user || !cloud.workspaceId || cloud.applyingRemote) {
    return;
  }

  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(saveToCloud, 850);
}

async function saveToCloud() {
  if (!cloud.ready || !cloud.user || !cloud.workspaceId || cloud.applyingRemote) {
    return;
  }

  try {
    await cloud.modules.setDoc(
      workspaceRef(cloud.workspaceId),
      {
        activeId: state.activeId || null,
        settings: state.settings,
        checklists: state.checklists,
        updatedAt: Date.now(),
        updatedBy: cloud.user.uid
      },
      { merge: true }
    );
    cloud.status = "Synced";
    renderSettings();
  } catch (error) {
    cloud.status = "Sync failed";
    renderSettings();
  }
}

function openCloudDialog() {
  if (!cloud.configured) {
    openCloudSetupDialog();
    return;
  }

  const signedIn = Boolean(cloud.user);
  elements.dialogTitle.textContent = "Google cloud";
  elements.dialogBody.innerHTML = `
    <div class="dialog-form">
      <p class="sync-note">${escapeHtml(
        signedIn
          ? cloud.ready
            ? `${cloud.user.displayName || cloud.user.email} is connected. Personal cloud data is private to this Google account. Shared workspaces are separate.`
            : `${cloud.user.displayName || cloud.user.email} is signed in, but the Firestore workspace is still connecting. If this does not change, check Firestore Rules are published.`
          : "Sign in with Google to sync routines across devices and invite friends into a shared workspace."
      )}</p>
      <div class="action-row">
        <button class="button ghost" type="button" id="cloudSecondaryButton">${signedIn ? "Sign out" : "Close"}</button>
        <button class="button primary" type="button" id="cloudPrimaryButton">${signedIn ? "Share workspace" : "Sign in with Google"}</button>
      </div>
      <button class="button" type="button" id="joinCloudWorkspaceButton">Join workspace code</button>
    </div>
  `;

  openDialog();
  elements.dialogBody.querySelector("#cloudSecondaryButton").addEventListener("click", async () => {
    if (signedIn) {
      await cloud.modules.signOut(cloud.auth);
      closeDialog();
      return;
    }
    closeDialog();
  });
  elements.dialogBody.querySelector("#cloudPrimaryButton").addEventListener("click", async () => {
    if (signedIn) {
      await shareCloudWorkspace();
      return;
    }
    await signInToCloud();
  });
  elements.dialogBody.querySelector("#joinCloudWorkspaceButton").addEventListener("click", openJoinWorkspaceDialog);
}

function openCloudSetupDialog() {
  elements.dialogTitle.textContent = "Set up Google cloud";
  elements.dialogBody.innerHTML = `
    <div class="dialog-form">
      <p class="sync-note">Firebase is not configured yet. Add your Firebase web config to firebase-config.js, enable Google sign-in, then publish the files again.</p>
      <div class="action-row">
        <button class="button ghost" type="button" data-close-dialog>Close</button>
        <button class="button primary" type="button" data-close-dialog>Got it</button>
      </div>
    </div>
  `;
  openDialog();
  elements.dialogBody.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });
}

async function shareCloudWorkspace() {
  if (!cloud.configured) {
    openCloudSetupDialog();
    return;
  }

  if (!cloud.user) {
    await signInToCloud();
    return;
  }

  if (!cloud.workspaceId) {
    await activateWorkspace(personalWorkspaceId(cloud.user));
  }

  const ref = workspaceRef(cloud.workspaceId);
  await cloud.modules.setDoc(ref, { joinOpen: true, updatedAt: Date.now() }, { merge: true });
  const url = new URL(window.location.href);
  url.hash = `join=${encodeURIComponent(cloud.workspaceId)}`;
  const link = url.href;

  elements.dialogTitle.textContent = "Share workspace";
  elements.dialogBody.innerHTML = `
    <div class="dialog-form">
      <p class="sync-note">Send this link to a friend. After they sign in with Google, their device joins this shared workspace.</p>
      <div class="field">
        <label for="workspaceShareLink">Invite link</label>
        <textarea id="workspaceShareLink" rows="4" readonly>${escapeHtml(link)}</textarea>
      </div>
      <div class="action-row">
        <button class="button ghost" type="button" id="copyWorkspaceLinkButton">Copy</button>
        <button class="button primary" type="button" id="shareWorkspaceLinkButton">Share</button>
      </div>
    </div>
  `;

  openDialog();
  elements.dialogBody.querySelector("#copyWorkspaceLinkButton").addEventListener("click", async () => {
    await copyText(link);
    showToast("Invite link copied");
  });
  elements.dialogBody.querySelector("#shareWorkspaceLinkButton").addEventListener("click", async () => {
    if (!navigator.share) {
      await copyText(link);
      showToast("Invite link copied");
      return;
    }

    await navigator.share({
      title: "Join my checklist workspace",
      text: "Open this link to join my checklist workspace.",
      url: link
    });
  });
}

function openJoinWorkspaceDialog() {
  if (!cloud.configured) {
    openCloudSetupDialog();
    return;
  }

  elements.dialogTitle.textContent = "Join workspace";
  elements.dialogBody.innerHTML = `
    <div class="dialog-form">
      <p class="sync-note">Paste a workspace invite link or code. You will need to sign in with Google before joining.</p>
      <div class="field">
        <label for="workspaceJoinInput">Invite link or code</label>
        <textarea id="workspaceJoinInput" rows="4" placeholder="https://...#join=..."></textarea>
      </div>
      <div class="action-row">
        <button class="button ghost" type="button" data-close-dialog>Cancel</button>
        <button class="button primary" type="button" id="joinWorkspaceConfirmButton">Join</button>
      </div>
    </div>
  `;

  openDialog();
  elements.dialogBody.querySelector("[data-close-dialog]").addEventListener("click", closeDialog);
  elements.dialogBody.querySelector("#joinWorkspaceConfirmButton").addEventListener("click", async () => {
    try {
      const workspaceId = extractWorkspaceId(elements.dialogBody.querySelector("#workspaceJoinInput").value);
      if (!cloud.user) {
        cloud.pendingJoinId = workspaceId;
        await signInToCloud();
        closeDialog();
        return;
      }
      await joinWorkspaceById(workspaceId);
      closeDialog();
      showToast("Workspace joined");
    } catch (error) {
      showToast("Could not join workspace");
    }
  });
}

function handleIncomingWorkspaceLink() {
  const hash = window.location.hash.replace("#", "");
  if (!hash.startsWith("join=")) {
    return;
  }

  cloud.pendingJoinId = decodeURIComponent(hash.slice(5));
  if (cloud.configured && cloud.user) {
    joinWorkspaceById(cloud.pendingJoinId).catch(() => showToast("Could not join workspace"));
    return;
  }
}

async function joinWorkspaceById(workspaceId) {
  if (!cloud.user) {
    cloud.pendingJoinId = workspaceId;
    await signInToCloud();
    return;
  }

  const ref = workspaceRef(workspaceId);
  await cloud.modules.updateDoc(ref, {
    [`members.${cloud.user.uid}`]: true,
    [`memberProfiles.${cloud.user.uid}`]: {
      name: cloud.user.displayName || "",
      email: cloud.user.email || ""
    },
    updatedAt: Date.now()
  });
  await activateWorkspace(workspaceId);
  clearSyncHash();
}

function extractWorkspaceId(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Missing workspace code");
  }

  try {
    const url = new URL(trimmed);
    const hash = url.hash.replace("#", "");
    if (hash.startsWith("join=")) {
      return decodeURIComponent(hash.slice(5));
    }
  } catch (error) {
    // Continue with raw code parsing.
  }

  return trimmed.replace(/^join=/, "");
}

function openSyncDialog() {
  const hasLocalData = state.checklists.length > 0;
  const syncLink = hasLocalData ? createSyncLink() : "";
  elements.dialogTitle.textContent = "Sync routines";
  elements.dialogBody.innerHTML = `
    <div class="dialog-form">
      ${
        hasLocalData
          ? `
            <p class="sync-note">Send this device's routines to another device.</p>
            <div class="field">
              <label for="syncLinkText">Sync link</label>
              <textarea id="syncLinkText" rows="5" readonly>${escapeHtml(syncLink)}</textarea>
            </div>
            <div class="action-row">
              <button class="button ghost" type="button" id="copySyncLinkButton">Copy link</button>
              <button class="button primary" type="button" id="shareSyncLinkButton">Share</button>
            </div>
            <div class="sync-divider"></div>
          `
          : `<p class="sync-note">This device has no routines yet. Paste a sync link from your phone to bring them here.</p>`
      }
      <div class="field">
        <label for="incomingSyncLink">Paste sync link</label>
        <textarea id="incomingSyncLink" rows="5" placeholder="https://...#sync=..."></textarea>
      </div>
      <div class="action-row">
        <button class="button ghost" type="button" data-close-dialog>Close</button>
        <button class="button primary" type="button" id="importSyncLinkButton">Merge link</button>
      </div>
    </div>
  `;

  openDialog();

  const closeButton = elements.dialogBody.querySelector("[data-close-dialog]");
  closeButton.addEventListener("click", closeDialog);

  const copyButton = elements.dialogBody.querySelector("#copySyncLinkButton");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      await copyText(syncLink);
      showToast("Sync link copied");
    });
  }

  const shareButton = elements.dialogBody.querySelector("#shareSyncLinkButton");
  if (shareButton) {
    shareButton.addEventListener("click", async () => {
      if (!navigator.share) {
        await copyText(syncLink);
        showToast("Sync link copied");
        return;
      }

      try {
        await navigator.share({
          title: "Checklists sync",
          text: "Open this link to import my routines.",
          url: syncLink
        });
      } catch (error) {
        showToast("Share canceled");
      }
    });
  }

  elements.dialogBody.querySelector("#importSyncLinkButton").addEventListener("click", () => {
    if (!requireCloudReady()) {
      return;
    }

    const input = elements.dialogBody.querySelector("#incomingSyncLink");
    try {
      const importedState = readSyncStateFromText(input.value);
      mergeImportedState(importedState);
      closeDialog();
      saveAndRender("Routines synced");
    } catch (error) {
      showToast("Paste a valid sync link");
    }
  });
}

function createSyncLink() {
  const url = new URL(window.location.href);
  url.hash = `sync=${encodeSyncPayload(createPortableState())}`;
  return url.href;
}

function createPortableState() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    app: "Checklists",
    data: {
      activeId: state.activeId,
      settings: state.settings,
      checklists: state.checklists
    }
  };
}

function handleIncomingSyncLink() {
  const hash = window.location.hash.replace("#", "");
  if (!hash.startsWith("sync=")) {
    return;
  }

  try {
    const portable = decodeSyncPayload(hash.slice(5));
    const importedState = normalizeImportedState(portable.data || portable);
    const count = importedState.checklists.length;

    elements.dialogTitle.textContent = "Import routines";
    elements.dialogBody.innerHTML = `
      <div class="dialog-form">
        <p class="sync-note">This link contains ${count} checklist${count === 1 ? "" : "s"}. Merge keeps anything already on this device and adds the link data.</p>
        <div class="action-row">
          <button class="button ghost" type="button" id="replaceSyncButton">Replace</button>
          <button class="button primary" type="button" id="mergeSyncButton">Merge</button>
        </div>
      </div>
    `;

    openDialog();

    elements.dialogBody.querySelector("#mergeSyncButton").addEventListener("click", () => {
      if (!requireCloudReady()) {
        return;
      }

      mergeImportedState(importedState);
      clearSyncHash();
      closeDialog();
      saveAndRender("Routines synced");
    });

    elements.dialogBody.querySelector("#replaceSyncButton").addEventListener("click", () => {
      if (!requireCloudReady()) {
        return;
      }

      if (!window.confirm("Replace all routines on this device with the routines from this link?")) {
        return;
      }

      state = {
        ...state,
        ...importedState,
        activeView: "today"
      };
      clearSyncHash();
      applyTheme();
      closeDialog();
      saveAndRender("Routines imported");
    });
  } catch (error) {
    clearSyncHash();
    showToast("Sync link could not be read");
  }
}

function readSyncStateFromText(value) {
  const payload = extractSyncPayload(value);
  const portable = decodeSyncPayload(payload);
  return normalizeImportedState(portable.data || portable);
}

function extractSyncPayload(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("Missing sync link");
  }

  try {
    const url = new URL(trimmed);
    const hash = url.hash.replace("#", "");
    if (hash.startsWith("sync=")) {
      return hash.slice(5);
    }
  } catch (error) {
    // Continue with raw hash or payload parsing.
  }

  const hash = trimmed.replace(/^#/, "");
  if (hash.startsWith("sync=")) {
    return hash.slice(5);
  }

  return trimmed;
}

function mergeImportedState(importedState) {
  const byId = new Map(state.checklists.map((checklist) => [checklist.id, checklist]));
  importedState.checklists.forEach((checklist) => {
    byId.set(checklist.id, checklist);
  });

  state.checklists = [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  state.activeId = importedState.activeId || state.activeId;
  state.activeView = "today";
}

function normalizeImportedState(importedState) {
  if (!importedState || typeof importedState !== "object") {
    throw new Error("Invalid import");
  }

  return {
    activeView: "today",
    activeId: importedState.activeId || null,
    settings: {
      ...state.settings,
      ...(importedState.settings || {})
    },
    checklists: Array.isArray(importedState.checklists)
      ? importedState.checklists.map(normalizeChecklist).filter(Boolean)
      : []
  };
}

function encodeSyncPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeSyncPayload(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function clearSyncHash() {
  const cleanUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(null, "", cleanUrl || window.location.href.split("#")[0]);
}

function exportData() {
  const payload = createPortableState();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `checklist-studio-${date}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Export ready");
}

async function importData(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  if (!requireCloudReady()) {
    event.target.value = "";
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const normalized = normalizeImportedState(parsed.data || parsed);

    if (!window.confirm("Replace current checklist data with this file?")) {
      event.target.value = "";
      return;
    }

    state = normalized;
    applyTheme();
    saveAndRender("Data imported");
  } catch (error) {
    showToast("Import failed");
  } finally {
    event.target.value = "";
  }
}

function applyTheme() {
  const theme = state.settings.theme;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolvedTheme;
}

function labelForTheme(theme) {
  return {
    system: "System",
    light: "Light",
    dark: "Dark"
  }[theme] || "System";
}

function labelForMode(mode) {
  return {
    once: "Once",
    repeat: "Repeat",
    template: "Template"
  }[mode] || "Once";
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(year, month - 1, day));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      showToast("Offline setup unavailable");
    });
  });
}
