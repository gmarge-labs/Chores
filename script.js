const STORAGE_KEY = "chores-multi-family-state-v1";
const cloudConfig = window.CHORES_SUPABASE_CONFIG || {};
const cloudModeEnabled = Boolean(cloudConfig.enabled && cloudConfig.url && cloudConfig.anonKey);
const cloudAuthEnabled = true;
const supabaseClient = cloudModeEnabled && window.supabase?.createClient
  ? window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const emptyState = {
  families: [],
  session: null,
};

const MAX_CREATE_KIDS = 10;
const BASE_CREATE_FIELDS = [
  { name: "familyName", placeholder: "Family name", type: "text" },
  { name: "parentName", placeholder: "Parent name", type: "text" },
  { name: "parentEmail", placeholder: "Parent email", type: "email" },
  { name: "parentPin", placeholder: "Parent PIN", type: "password" },
  { name: "confirmParentPin", placeholder: "Confirm parent PIN", type: "password" },
];
function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

async function hashPin(pin) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode("chores-pin-salt-v1"), iterations: 100000, hash: "SHA-256" },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function verifyPin(plain, stored) {
  if (!stored) return false;
  const isHashed = /^[0-9a-f]{64}$/.test(stored);
  if (!isHashed) return plain === stored;
  try { return (await hashPin(plain)) === stored; } catch { return false; }
}

function buildCloudAuthPassword(parentEmail, parentPin) {
  return `chores::${String(parentEmail || "").trim().toLowerCase()}::${String(parentPin || "").trim()}::family-auth`;
}

function createEmptyCreateAccountDraft() {
  const draft = {
    familyName: "",
    parentName: "",
    parentEmail: "",
    parentPin: "",
    confirmParentPin: "",
  };

  for (let index = 1; index <= MAX_CREATE_KIDS; index += 1) {
    draft[`kidName${index}`] = "";
    draft[`kidPin${index}`] = "";
    draft[`kidColour${index}`] = index - 1;
  }

  return draft;
}

const KID_COLOUR_PALETTE = [
  { accent: "#ff9d57", deep: "#f07a45" },
  { accent: "#4fc7b5", deep: "#2f9f8f" },
  { accent: "#6dafff", deep: "#3f84db" },
  { accent: "#b99cff", deep: "#8b68f0" },
  { accent: "#f472b6", deep: "#d946a0" },
  { accent: "#68d8cf", deep: "#2bada5" },
  { accent: "#ffbd6f", deep: "#e09020" },
  { accent: "#a8e063", deep: "#74bb2a" },
];

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return "109,175,255";
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `${r},${g},${b}`;
}

function getDefaultKidColour(name, index = 0) {
  return KID_COLOUR_PALETTE[index % KID_COLOUR_PALETTE.length];
}

function createKid(name, kidPin, avatar = "", colourIndex = 0) {
  const col = getDefaultKidColour(name, colourIndex);
  return {
    id: createId("kid"),
    name,
    kidPin,
    avatar,
    accentColour: col.accent,
    accentColourDeep: col.deep,
    points: 0,
    pointsPerDollarReward: 100,
    dollarRewardValue: 20,
    celebrationThreshold: 100,
    lastCelebratedThreshold: 0,
    due: [],
    awaiting: [],
    completed: [],
    taskTemplates: [],
    rewards: [],
    bonusPenalty: [
      { type: "bonus", title: "+0 points", value: "+0 points", reason: "", dateKey: null, createdAt: null },
      { type: "penalty", title: "-0 points", value: "-0 points", reason: "", dateKey: null, createdAt: null },
    ],
    bonusReasons: [],
    penaltyReasons: [],
    pointsHistory: [],
    missedDaysInARow: 0,
    lastMissedCheckDate: null,
    lastTaskRefreshDate: getTodayDateKey(),
  };
}

function createFamily({ familyName, parentName, parentEmail, parentPin, kids }) {
  return {
    id: createId("family"),
    familyName,
    parentName,
    parentEmail,
    parentEmailLower: parentEmail.trim().toLowerCase(),
    parentPin,
    kids,
    favorClaims: [],
    createdAt: new Date().toISOString(),
  };
}

function cloneEmptyState() {
  return JSON.parse(JSON.stringify(emptyState));
}

function normalizeKid(kid) {
  const fallbackDateKey = kid.lastTaskRefreshDate || getTodayDateKey();
  const normalizedTaskTemplates = Array.isArray(kid.taskTemplates)
    ? kid.taskTemplates
        .map((task) => normalizeTaskTemplate(task))
        .filter(Boolean)
    : buildTaskTemplatesFromLegacyKid(kid);

  return {
    id: kid.id || createId("kid"),
    name: kid.name || "Kid",
    kidPin: kid.kidPin || "",
    avatar: typeof kid.avatar === "string" ? kid.avatar : "",
    points: Number.isFinite(Number(kid.points)) ? Number(kid.points) : 0,
    pointsPerDollarReward: Number.isFinite(Number(kid.pointsPerDollarReward)) ? Number(kid.pointsPerDollarReward) : 100,
    dollarRewardValue: Number.isFinite(Number(kid.dollarRewardValue)) ? Number(kid.dollarRewardValue) : 20,
    celebrationThreshold: Number.isFinite(Number(kid.celebrationThreshold)) ? Number(kid.celebrationThreshold) : 100,
    lastCelebratedThreshold: Number.isFinite(Number(kid.lastCelebratedThreshold)) ? Number(kid.lastCelebratedThreshold) : 0,
    due: normalizeTaskInstances(kid.due, fallbackDateKey),
    awaiting: normalizeTaskInstances(kid.awaiting, fallbackDateKey),
    completed: normalizeTaskInstances(kid.completed, fallbackDateKey).filter(
      (t) => t.instanceDateKey === (kid.lastTaskRefreshDate || getTodayDateKey())
    ),
    taskTemplates: normalizedTaskTemplates,
    rewards: Array.isArray(kid.rewards) ? kid.rewards : [],
    bonusPenalty: Array.isArray(kid.bonusPenalty) && kid.bonusPenalty.length
      ? kid.bonusPenalty.map((entry) => ({
          type: entry.type || "bonus",
          title: entry.title || "",
          value: entry.value || "",
          reason: entry.reason || "",
          dateKey: entry.dateKey || null,
          createdAt: entry.createdAt || null,
        }))
      : [
          { type: "bonus", title: "+0 points", value: "+0 points", reason: "", dateKey: null, createdAt: null },
          { type: "penalty", title: "-0 points", value: "-0 points", reason: "", dateKey: null, createdAt: null },
        ],
    bonusReasons: Array.isArray(kid.bonusReasons) ? kid.bonusReasons : [],
    penaltyReasons: Array.isArray(kid.penaltyReasons) ? kid.penaltyReasons : [],
    pointsHistory: Array.isArray(kid.pointsHistory) ? kid.pointsHistory.slice(-500) : [],
    accentColour: kid.accentColour || getDefaultKidColour(kid.name || "").accent,
    accentColourDeep: kid.accentColourDeep || getDefaultKidColour(kid.name || "").deep,
    missedDaysInARow: Number.isFinite(Number(kid.missedDaysInARow)) ? Number(kid.missedDaysInARow) : 0,
    lastMissedCheckDate: kid.lastMissedCheckDate || null,
    lastTaskRefreshDate: kid.lastTaskRefreshDate || getTodayDateKey(),
  };
}

function normalizeFamily(family) {
  return {
    id: family.id || createId("family"),
    familyName: family.familyName || "My Family",
    parentName: family.parentName || "Parent",
    parentEmail: family.parentEmail || "",
    parentEmailLower: (family.parentEmailLower || family.parentEmail || "").trim().toLowerCase(),
    parentPin: family.parentPin || "",
    createdAt: family.createdAt || new Date().toISOString(),
    kids: Array.isArray(family.kids) ? family.kids.map(normalizeKid) : [],
    favorClaims: Array.isArray(family.favorClaims) ? family.favorClaims : [],
  };
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return cloneEmptyState();

    const parsed = JSON.parse(saved);
    return {
      families: Array.isArray(parsed.families) ? parsed.families.map(normalizeFamily) : [],
      session: parsed.session || null,
    };
  } catch {
    return cloneEmptyState();
  }
}

const state = loadState();
refreshAllTasksForToday();

function saveState(options = {}) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

}

let authStage = "intro";
let authView = "";
let authAccountReady = state.families.length > 0;
let authAccountJustCreated = false;
let aboutTopic = "";
let aboutTransitionTimer = null;
let authResetPasscodeOpen = false;
let createAccountStep = 1;
let createAccountDraft = createEmptyCreateAccountDraft();
let createAccountKidCompleteMode = false;
let currentSettingsSection = "";
let currentFamilyControlsSection = "";
function resetCreateAccountDraft() {
  createAccountStep = 1;
  createAccountDraft = createEmptyCreateAccountDraft();
  createAccountKidCompleteMode = false;
}

function renderSettingsSwitcher(activeSection = "") {
  const settingsButtons = [
    { key: "add-task", label: "Add task" },
    { key: "bonus-penalty", label: "Bonus & Penalty" },
    { key: "family-controls", label: "Family Controls" },
  ];

  return `
    <div class="settings-switcher" aria-label="Settings sections">
      ${settingsButtons
        .map(
          (button) => `
            <button
              class="settings-switch-button ${activeSection === button.key ? "active" : ""}"
              type="button"
              data-settings-view="${button.key}"
            >
              ${escapeHtml(button.label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function renderFamilyControlsSwitcher(activeSection = "") {
  const controlButtons = [
    { key: "add-child", label: "Add Child" },
    { key: "add-rewards", label: "Add Rewards" },
    { key: "manage-rewards", label: "Manage Rewards" },
    { key: "dollar-rate", label: "Dollar Rate" },
    { key: "celebration-threshold", label: "Celebration Threshold" },
    { key: "kid-colours", label: "Edit Kid Colours" },
    { key: "delete-kid", label: "Remove Child" },
    { key: "delete-family", label: "Delete Family" },
  ];

  return `
    <div class="family-controls-switcher" aria-label="Family control sections">
      ${controlButtons
        .map(
          (button) => `
            <button
              class="family-controls-switch-button ${activeSection === button.key ? "active" : ""}"
              type="button"
              data-family-controls-view="${button.key}"
            >
              ${escapeHtml(button.label)}
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function getFamilyControlsLabel(sectionKey = "") {
  const labels = {
    "add-child": "Add Child",
    "add-rewards": "Add Rewards",
    "manage-rewards": "Manage Rewards",
    "dollar-rate": "Dollar Rate",
    "celebration-threshold": "Celebration Threshold",
    "kid-colours": "Edit Kid Colours",
    "delete-kid": "Remove Child",
    "delete-family": "Delete Family",
  };

  return labels[sectionKey] || "Family Controls";
}

function renderActiveFamilyControlsHeader(activeSection = "") {
  return `
    <div class="family-controls-active-nav">
      <button class="family-controls-back-button" type="button" data-family-controls-back="true">Back</button>
      <button class="family-controls-current-button active" type="button" aria-current="page">
        ${escapeHtml(getFamilyControlsLabel(activeSection))}
      </button>
    </div>
  `;
}

function isFilled(value) {
  return String(value || "").trim().length > 0;
}

function isValidKidPin(value) {
  return /^\d{4}$/.test(String(value || "").trim());
}

function isValidCreateFieldValue(field, value) {
  if (!field) return false;
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return false;
  if (/^kidPin\d+$/.test(field.name)) {
    return isValidKidPin(trimmedValue);
  }
  return true;
}

function getCreateFieldGuidance(field, value) {
  if (!field) return "";
  const trimmedValue = String(value || "").trim();
  if (/^kidPin\d+$/.test(field.name)) {
    if (!trimmedValue) {
      return `<p class="create-guidance-pill">Choose a 4-digit password for this child.</p>`;
    }
    if (!isValidKidPin(trimmedValue)) {
      return `<p class="create-guidance-pill create-guidance-pill--warning">This kid password must be exactly 4 digits before you can continue.</p>`;
    }
    return `<p class="create-guidance-pill create-guidance-pill--success">Perfect. This 4-digit kid password is ready.</p>`;
  }
  return "";
}

function renderCreateField(name, placeholder, type = "text") {
  const value = createAccountDraft[name] || "";
  const isKidPinField = /^kidPin\d+$/.test(name);
  const extraAttrs = isKidPinField ? ` inputmode="numeric" pattern="\\d{4}" maxlength="4"` : "";
  return `<input type="${type}" name="${name}" placeholder="${placeholder}" value="${escapeHtml(value)}" ${extraAttrs} required />`;
}

const CREATE_ACCOUNT_FIELDS = [
  ...BASE_CREATE_FIELDS,
  ...Array.from({ length: MAX_CREATE_KIDS }, (_, index) => {
    const kidNumber = index + 1;
    return [
      { name: `kidName${kidNumber}`, placeholder: kidNumber === 1 ? "Kid 1 name" : `Kid ${kidNumber} name (optional)`, type: "text" },
      { name: `kidPin${kidNumber}`, placeholder: `Kid ${kidNumber} PIN`, type: "password" },
    ];
  }).flat(),
];

function getCurrentCreateField() {
  return CREATE_ACCOUNT_FIELDS[Math.max(0, Math.min(createAccountStep - 1, CREATE_ACCOUNT_FIELDS.length - 1))];
}

function getKidNumberFromFieldName(name) {
  const match = /^kid(?:Name|Pin)(\d+)$/.exec(name || "");
  return match ? Number(match[1]) : null;
}

function isKidPinCreateStep(field = getCurrentCreateField()) {
  return Boolean(field && /^kidPin\d+$/.test(field.name));
}

function renderCreateAccountActions() {
  const currentField = getCurrentCreateField();
  if (!currentField) return "";

  const currentValue = createAccountDraft[currentField.name] || "";
  const canAdvance = isValidCreateFieldValue(currentField, currentValue);
  const disabledAttr = canAdvance ? "" : "disabled";

  if (!/^kid/.test(currentField.name)) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-next="true" ${disabledAttr}>Next</button>
      </div>
    `;
  }

  if (/^kidName/.test(currentField.name)) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-next="true" ${disabledAttr}>Next</button>
      </div>
    `;
  }

  const kidNumber = getKidNumberFromFieldName(currentField.name);
  if (!kidNumber) return "";

  if (!createAccountKidCompleteMode) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-complete="true" ${disabledAttr}>Complete</button>
      </div>
    `;
  }

  if (kidNumber < MAX_CREATE_KIDS) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-submit="true" ${disabledAttr}>Create account</button>
        <button class="action-button secondary" type="button" data-add-child="true" ${disabledAttr}>Add another child</button>
      </div>
    `;
  }

  return `
    <div class="button-row create-progress-actions">
      <button class="action-button primary" type="button" data-create-submit="true" ${disabledAttr}>Create account</button>
    </div>
  `;
}

function renderCurrentCreateStep() {
  const currentField = getCurrentCreateField();
  if (!currentField) return "";
  const currentValue = createAccountDraft[currentField.name] || "";
  const guidance = getCreateFieldGuidance(currentField, currentValue);

  if (createAccountStep <= BASE_CREATE_FIELDS.length) {
    return `
      ${renderCreateField(currentField.name, currentField.placeholder, currentField.type)}
      ${guidance}
    `;
  }

  if (isKidPinCreateStep(currentField) && createAccountKidCompleteMode) {
    const kidNumber = getKidNumberFromFieldName(currentField.name);
    const kidName = String(createAccountDraft[`kidName${kidNumber}`] || "").trim() || `Kid ${kidNumber}`;
    return `
      <div class="auth-kid-block single-step-kid-block">
        <p class="eyebrow">Add your kids</p>
        <div class="create-complete-card">
          <p class="create-complete-label">${escapeHtml(kidName)} is ready.</p>
          <p class="create-complete-copy">Choose whether to create the account now or add another child first.</p>
        </div>
      </div>
    `;
  }

  const kidNumber = getKidNumberFromFieldName(currentField.name);
  const kidName2 = kidNumber ? (String(createAccountDraft["kidName" + kidNumber] || "").trim() || ("Kid " + kidNumber)) : "";
  const selColourIdx = kidNumber ? (Number(createAccountDraft["kidColour" + kidNumber]) || 0) : 0;
  const colourPickerHtml = isKidPinCreateStep(currentField) && kidNumber ? (
    "<div class=\"create-colour-picker\"><p class=\"eyebrow\" style=\"margin-bottom:8px;\">Pick " + escapeHtml(kidName2) + "&#39;s colour</p><div class=\"colour-swatch-row\">" +
    KID_COLOUR_PALETTE.map(function(col, i) {
      return "<button type=\"button\" class=\"colour-swatch " + (i === selColourIdx ? "colour-swatch--selected" : "") + "\" style=\"background:" + col.accent + ";\" data-create-kid-colour=\"" + kidNumber + "\" data-create-colour-index=\"" + i + "\" aria-label=\"Colour " + (i+1) + "\"></button>";
    }).join("") +
    "</div></div>"
  ) : "";
  return `
    <div class="auth-kid-block single-step-kid-block">
      <p class="eyebrow">Add your kids</p>
      <div class="auth-kid-grid">
        ${renderCreateField(currentField.name, currentField.placeholder, currentField.type)}
      </div>
      ${guidance}
      ${colourPickerHtml}
    </div>
  `;
}

function renderAboutTopicContent(topic) {
  if (topic === "what") {
    return `
      <h3>What it does</h3>
      <p>CHORES gives families one place to manage tasks, points, rewards, approvals, and progress in a fun way.</p>
    `;
  }

  if (topic === "parents") {
    return `
      <h3>Parents</h3>
      <p>Parents create the account, add kids, assign tasks, set rewards, approve chores, and check reports.</p>
    `;
  }

  if (topic === "kids") {
    return `
      <h3>Kids</h3>
      <p>Kids log in to their own view, mark tasks done, watch their points grow, and use points for favors.</p>
    `;
  }

  if (topic === "how") {
    return `
      <h3>How it works</h3>
      <p>Tasks move from due, to awaiting approval, to completed. Points update as chores are approved.</p>
    `;
  }

  if (topic === "start") {
    return `
      <h3>Getting started</h3>
      <p>Create your account first. After that, tap Next to reach the parent and kid login page.</p>
    `;
  }

  return `<p class="about-hint">Hover over a pill to preview the details.</p>`;
}

function updateAboutTopicDisplay(nextTopic) {
  aboutTopic = nextTopic || "";

  const display = document.querySelector(".auth-about-display");
  if (display) {
    display.classList.add("is-fading");
    if (aboutTransitionTimer) {
      window.clearTimeout(aboutTransitionTimer);
    }

    aboutTransitionTimer = window.setTimeout(() => {
      display.classList.toggle("active", Boolean(aboutTopic));
      display.dataset.aboutTone = aboutTopic || "";
      display.innerHTML = renderAboutTopicContent(aboutTopic);
      display.classList.remove("is-fading");
      aboutTransitionTimer = null;
    }, 220);
  }

  document.querySelectorAll("[data-about-topic]").forEach((button) => {
    button.classList.toggle("active", button.dataset.aboutTopic === aboutTopic);
  });
}
let tpHour = 8;
let tpMin = 0;
let tpAmPm = "AM";

function tpPad(n) { return String(n).padStart(2, "0"); }

function tpUpdate() {
  const hourEl = document.getElementById("tp-hour-display");
  const minEl  = document.getElementById("tp-min-display");
  const hidden = document.getElementById("tp-hidden-value");
  if (!hourEl || !minEl || !hidden) return;
  hourEl.textContent = tpHour;
  minEl.textContent  = tpPad(tpMin);
  const h24 = tpAmPm === "AM" ? (tpHour === 12 ? 0 : tpHour) : (tpHour === 12 ? 12 : tpHour + 12);
  hidden.value = tpPad(h24) + ":" + tpPad(tpMin);
  document.querySelectorAll("[data-tp-ampm]").forEach(function(btn) {
    btn.classList.toggle("active", btn.dataset.tpAmpm === tpAmPm);
  });
  // also update the schedule preview
  updateTaskSchedulePreview(document.querySelector("#task-form"));
}

function tpReset() {
  tpHour = 8; tpMin = 0; tpAmPm = "AM";
}

let currentKidId = null;
let currentKidView = "dashboard";
let currentFamilyMode = false;
let currentAssignedKids = [];
let currentRewardAssignedKids = [];
let currentThresholdAssignedKids = [];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });
}

function getCurrentFamily() {
  if (!state.session) return null;
  return state.families.find((family) => family.id === state.session.familyId) || null;
}

function upsertFamilyInState(family) {
  const existingIndex = state.families.findIndex((entry) => entry.id === family.id);
  if (existingIndex >= 0) {
    state.families[existingIndex] = normalizeFamily(family);
    return state.families[existingIndex];
  }

  const normalized = normalizeFamily(family);
  state.families.push(normalized);
  return normalized;
}

function upsertLocalFamilyDraft({ familyName, parentName, parentEmail, parentPin, kids }) {
  const existing = state.families.find((entry) => entry.parentEmailLower === parentEmail.trim().toLowerCase());
  const family = createFamily({ familyName, parentName, parentEmail, parentPin, kids });
  family.id = existing?.id || family.id;
  return upsertFamilyInState(family);
}

function getFamilyKids() {
  return getCurrentFamily()?.kids || [];
}

function getKid(kidId) {
  return getFamilyKids().find((kid) => kid.id === kidId) || null;
}

function isParentSession() {
  return state.session?.role === "parent";
}

function isKidSession() {
  return state.session?.role === "kid";
}

function getAssignedKidNames() {
  return currentAssignedKids.map((kidId) => getKid(kidId)?.name).filter(Boolean);
}

function getRewardAssignedKidNames() {
  return currentRewardAssignedKids.map((kidId) => getKid(kidId)?.name).filter(Boolean);
}

function getThresholdAssignedKidNames() {
  return currentThresholdAssignedKids.map((kidId) => getKid(kidId)?.name).filter(Boolean);
}

function getDollarEquivalent(kid) {
  const pointUnit = Number(kid.pointsPerDollarReward) || 100;
  const dollarUnit = Number(kid.dollarRewardValue) || 20;
  return Math.floor((Number(kid.points) / pointUnit) * dollarUnit);
}

function renderPointsHistory(kid) {
  const history = Array.isArray(kid.pointsHistory) ? kid.pointsHistory : [];
  if (!history.length) return "";
  const recent = history.slice().reverse().slice(0, 20);
  const rows = recent.map(function(h) {
    const isPos = (h.pointsDelta || 0) >= 0;
    const dotClass = h.changeType === "task" ? "history-dot--task" : h.changeType === "bonus" ? "history-dot--bonus" : h.changeType === "penalty" ? "history-dot--penalty" : "history-dot--reward_claim";
    const deltaLabel = isPos ? ("+" + h.pointsDelta) : String(h.pointsDelta);
    const timeLabel = h.createdAt ? new Date(h.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
    return '<div class="history-entry"><span class="history-dot ' + dotClass + '"></span><span class="history-desc">' + escapeHtml(h.description || h.changeType) + '</span><span class="history-delta ' + (isPos ? "history-delta--pos" : "history-delta--neg") + '">' + escapeHtml(deltaLabel) + '</span><span class="history-time">' + escapeHtml(timeLabel) + '</span></div>';
  }).join("");
  return '<div class="points-history-block"><p class="eyebrow" style="margin-bottom:10px;">Points history</p><div class="history-list">' + rows + '</div></div>';
}

function renderAvatar(kid) {
  const initial = String(kid.name || "K").trim().charAt(0).toUpperCase() || "K";
  return `<span class="avatar-initial" aria-hidden="true">${escapeHtml(initial)}</span>`;
}

function renderTileBubbles() {
  return `
    <span class="tile-bubbles" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </span>
  `;
}

function renderCardList(items, renderer, emptyText) {
  if (!items.length) {
    return `<p class="empty">${emptyText}</p>`;
  }

  return items.map(renderer).join("");
}

function getShellClass(name, familyMode) {
  return familyMode ? "family" : "kid";
}

function showFieldError(form, message) {
  if (!form) { showToast(message); return; }
  form.querySelector(".form-error-msg")?.remove();
  const err = document.createElement("p");
  err.className = "form-error-msg";
  err.textContent = message;
  form.appendChild(err);
  setTimeout(() => err?.remove(), 3200);
}

function showToast(message) {
  const notice = document.createElement("div");
  notice.className = "pin-toast";
  notice.textContent = message;
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 2200);
}

async function handleCreateFamilyAccount() {
  const familyName = String(createAccountDraft.familyName || "").trim();
  const parentName = String(createAccountDraft.parentName || "").trim();
  const parentEmail = String(createAccountDraft.parentEmail || "").trim();
  const parentPin = String(createAccountDraft.parentPin || "").trim();
  const confirmParentPin = String(createAccountDraft.confirmParentPin || "").trim();

  if (!familyName || !parentName || !parentEmail || !parentPin) return;
  if (parentPin !== confirmParentPin) {
    showToast("Parent PINs do not match.");
    return;
  }

  if (state.families.some((family) => family.parentEmailLower === parentEmail.toLowerCase())) {
    showToast("That parent email already has an account.");
    return;
  }

  const kids = [];
  let invalidKidPin = false;
  for (let index = 1; index <= MAX_CREATE_KIDS; index += 1) {
    const name = String(createAccountDraft[`kidName${index}`] || "").trim();
    const pin = String(createAccountDraft[`kidPin${index}`] || "").trim();
    if (!name) continue;
    if (!pin || !isValidKidPin(pin)) {
      invalidKidPin = true;
      continue;
    }
    const colourIdx = Number(createAccountDraft[`kidColour${index}`]) || (kids.length);
    kids.push(createKid(name, pin, "", colourIdx));
  }

  if (invalidKidPin) {
    showToast("Each kid PIN must be exactly 4 digits.");
    return;
  }

  if (!kids.length) {
    showToast("Add at least one child with a 4-digit PIN.");
    return;
  }

  const hashedParentPin = await hashPin(parentPin);
  for (const kid of kids) { kid.kidPin = await hashPin(kid.kidPin); }
  const family = createFamily({ familyName, parentName, parentEmail, parentPin: hashedParentPin, kids });
  family.id = createId("family"); // ensure stable local id before cloud
  state.families.push(family);
  authAccountReady = true;
  authAccountJustCreated = true;
  authStage = "login";
  authView = "parent";
  resetCreateAccountDraft();
  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  saveState({ skipCloud: true });

  // Cloud signup (non-blocking — local account already works)
  if (cloudAuthEnabled && cloudModeEnabled) {
    cloudSignUp(familyName, parentName, parentEmail, parentPin, family.kids).then(function(cloudFamilyId) {
      family.id = cloudFamilyId;
      saveState({ skipCloud: true });
      showToast("Account synced to cloud ✓");
    }).catch(function(err) {
      console.error("Cloud signup full error:", JSON.stringify(err), err.message, err.status, err.code);
      // Show longer-lasting error
      var msg = "Cloud sync failed: " + (err.message || JSON.stringify(err) || "unknown");
      var el = document.createElement("div");
      el.className = "pin-toast";
      el.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999;background:#333;color:#fff;padding:12px 20px;border-radius:12px;font-size:0.85rem;max-width:90vw;text-align:center;";
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(function() { el.remove(); }, 8000);
    });
  }

  showToast("Account created. Log in as parent to continue.");
  renderAuthHome();
}

function showThresholdCelebration(kid, threshold) {
  const celebration = document.createElement("div");
  celebration.className = "celebration-pop";
  celebration.setAttribute("role", "status");
  celebration.innerHTML = `
    <div class="celebration-card">
      <div class="celebration-emojis" aria-hidden="true">
        <span>\uD83C\uDF89</span><span>\u2B50</span><span>\u2728</span><span>\uD83C\uDFC6</span><span>\uD83D\uDCAB</span><span>\uD83C\uDF1F</span>
        <span>\uD83C\uDF8A</span><span>\u2B50</span><span>\u2728</span><span>\uD83C\uDFC5</span><span>\uD83D\uDCA5</span><span>\uD83C\uDF08</span>
      </div>
      <p class="eyebrow">Threshold reached</p>
      <h2>${escapeHtml(kid.name)} hit ${escapeHtml(threshold)} points!</h2>
      <p>Celebration unlocked!</p>
    </div>
  `;
  document.body.appendChild(celebration);
  window.setTimeout(() => celebration.remove(), 3200);
}

function maybeCelebrateThreshold(kid, previousPoints) {
  const threshold = Number(kid.celebrationThreshold) || 0;
  if (!threshold || previousPoints >= threshold || kid.points < threshold || kid.lastCelebratedThreshold === threshold) return;

  kid.lastCelebratedThreshold = threshold;
  showThresholdCelebration(kid, threshold);
}

function formatCustomDate(dateValue) {
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Custom date";
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTodayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  const parsed = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDateKeyOffset(dateKey, offsetDays) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  parsed.setDate(parsed.getDate() + offsetDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateDiffInDays(fromDateKey, toDateKey) {
  const from = parseDateKey(fromDateKey);
  const to = parseDateKey(toDateKey);
  if (!from || !to) return 0;
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.floor((to - from) / MS_PER_DAY);
}

function buildTaskTemplate(task = {}, fallbackDateKey = getTodayDateKey()) {
  const recurring = String(task.recurring || "daily").trim().toLowerCase();
  const customDate = String(task.customDate || "").trim();
  const startDateKey = recurring === "custom-date"
    ? (customDate || fallbackDateKey)
    : String(task.startDateKey || task.instanceDateKey || fallbackDateKey);

  return {
    id: task.templateId || task.id || createId("task-template"),
    title: String(task.title || "").trim(),
    points: Number(task.points) || 0,
    recurring,
    time: String(task.time || "").trim(),
    customDate,
    startDateKey,
  };
}

function normalizeTaskTemplate(task = {}) {
  if (!task || !String(task.title || "").trim()) return null;
  return buildTaskTemplate(task, getTodayDateKey());
}

function normalizeTaskInstances(taskList, fallbackDateKey = getTodayDateKey()) {
  return Array.isArray(taskList)
    ? taskList
        .map((task) => ({
          id: task.id || createId("task"),
          templateId: task.templateId || task.id || createId("task-template-link"),
          title: String(task.title || "").trim(),
          detail: String(task.detail || "").trim(),
          points: Number(task.points) || 0,
          recurring: String(task.recurring || "daily").trim().toLowerCase(),
          time: String(task.time || "").trim(),
          customDate: String(task.customDate || "").trim(),
          instanceDateKey: task.instanceDateKey || fallbackDateKey,
        }))
        .filter((task) => task.title)
    : [];
}

function buildTaskTemplatesFromLegacyKid(kid = {}) {
  const seedTasks = [
    ...(Array.isArray(kid.due) ? kid.due : []),
    ...(Array.isArray(kid.awaiting) ? kid.awaiting : []),
    ...(Array.isArray(kid.completed) ? kid.completed : []),
  ];

  const seen = new Set();
  return seedTasks
    .map((task) => buildTaskTemplate(task, getTodayDateKey()))
    .filter((task) => {
      if (!task.title) return false;
      const key = [task.title, task.points, task.recurring, task.time, task.customDate, task.startDateKey].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildTaskInstanceFromTemplate(template, dateKey) {
  return {
    id: createId("task"),
    templateId: template.id,
    title: template.title,
    detail: buildTaskDetail(template.recurring, template.time, template.customDate ? formatCustomDate(template.customDate) : ""),
    points: Number(template.points) || 0,
    recurring: template.recurring,
    time: template.time,
    customDate: template.customDate,
    instanceDateKey: dateKey,
  };
}

function taskOccursOnDate(template, dateKey) {
  const startKey = template.recurring === "custom-date"
    ? (template.customDate || template.startDateKey)
    : (template.startDateKey || dateKey);
  const diffDays = getDateDiffInDays(startKey, dateKey);
  if (diffDays < 0) return false;

  switch (template.recurring) {
    case "daily":
      return true;
    case "every-other-day":
      return diffDays % 2 === 0;
    case "weekly": {
      const startDate = parseDateKey(startKey);
      const currentDate = parseDateKey(dateKey);
      return Boolean(startDate && currentDate && startDate.getDay() === currentDate.getDay());
    }
    case "monthly": {
      const startDate = parseDateKey(startKey);
      const currentDate = parseDateKey(dateKey);
      return Boolean(startDate && currentDate && startDate.getDate() === currentDate.getDate());
    }
    case "custom-date":
      return dateKey === (template.customDate || startKey);
    default:
      return dateKey === startKey;
  }
}

function updateMissedCycle(missedDaysInARow, hadMissedTasks) {
  if (!hadMissedTasks) return 0;
  const current = Number(missedDaysInARow) || 0;
  return current >= 3 ? 1 : current + 1;
}

function refreshKidTasksForToday(kid, todayKey = getTodayDateKey()) {
  if (!kid) return false;

  let didUpdate = false;
  if (!Array.isArray(kid.taskTemplates)) {
    kid.taskTemplates = buildTaskTemplatesFromLegacyKid(kid);
    didUpdate = true;
  }

  const lastRefreshDate = kid.lastTaskRefreshDate || todayKey;
  if (lastRefreshDate !== todayKey) {
    const dayDiff = Math.max(0, getDateDiffInDays(lastRefreshDate, todayKey));
    for (let step = 0; step < dayDiff; step += 1) {
      const cycleDate = getDateKeyOffset(lastRefreshDate, step);
      const dueForDate = kid.due.filter((task) => task.instanceDateKey === cycleDate);
      const awaitingForDate = kid.awaiting.filter((task) => task.instanceDateKey === cycleDate);
      const completedForDate = kid.completed.filter((task) => task.instanceDateKey === cycleDate);
      const scheduledTemplates = kid.taskTemplates.filter((task) => taskOccursOnDate(task, cycleDate));
      const hadMissedTasks = Boolean(dueForDate.length || awaitingForDate.length || (scheduledTemplates.length && !completedForDate.length));
      kid.missedDaysInARow = updateMissedCycle(kid.missedDaysInARow, hadMissedTasks);
      kid.lastMissedCheckDate = cycleDate;
    }

    kid.due = [];
    kid.awaiting = [];
    kid.completed = [];
    kid.lastTaskRefreshDate = todayKey;
    didUpdate = true;
  }

  const todayInstances = [
    ...kid.due.filter((task) => task.instanceDateKey === todayKey),
    ...kid.awaiting.filter((task) => task.instanceDateKey === todayKey),
    ...kid.completed.filter((task) => task.instanceDateKey === todayKey),
  ];
  const existingTemplateIds = new Set(todayInstances.map((task) => task.templateId));

  kid.taskTemplates.forEach((template) => {
    if (!taskOccursOnDate(template, todayKey)) return;
    if (existingTemplateIds.has(template.id)) return;
    kid.due.push(buildTaskInstanceFromTemplate(template, todayKey));
    didUpdate = true;
  });

  kid.due = kid.due.filter((task) => task.instanceDateKey === todayKey);
  kid.awaiting = kid.awaiting.filter((task) => task.instanceDateKey === todayKey);
  kid.completed = kid.completed.filter((task) => task.instanceDateKey === todayKey);

  if (kid.lastMissedCheckDate == null) {
    kid.lastMissedCheckDate = todayKey;
    didUpdate = true;
  }

  return didUpdate;
}

function refreshAllTasksForToday() {
  const todayKey = getTodayDateKey();
  let didUpdate = false;
  state.families.forEach((family) => {
    family.kids.forEach((kid) => {
      if (refreshKidTasksForToday(kid, todayKey)) didUpdate = true;
    });
  });
  if (didUpdate) saveState();
}

function formatTaskTimeValue(timeValue) {
  const [hoursRaw, minutesRaw] = String(timeValue || "").split(":");
  const hoursNum = Number(hoursRaw);
  if (!Number.isFinite(hoursNum)) return "";
  const minutes = minutesRaw || "00";
  const suffix = hoursNum >= 12 ? "PM" : "AM";
  const displayHour = ((hoursNum + 11) % 12) + 1;
  return `${displayHour}:${minutes} ${suffix}`;
}

function getKidAdjustmentForToday(kid, type) {
  const todayKey = getTodayDateKey();
  return (kid.bonusPenalty || []).find((entry) => (entry.type || "").toLowerCase() === type && entry.dateKey === todayKey) || null;
}

function getTaskSchedulePreviewText(recurring, timeValue, customDate = "") {
  const timeLabel = formatTaskTimeValue(timeValue);
  if (!timeLabel) return "Choose a repeat style and time to preview the schedule.";

  const labels = {
    daily: `Repeats daily at ${timeLabel}`,
    "every-other-day": `Repeats every other day at ${timeLabel}`,
    weekly: `Repeats weekly at ${timeLabel}`,
    monthly: `Repeats monthly at ${timeLabel}`,
    "custom-date": customDate ? `Happens on ${formatCustomDate(customDate)} at ${timeLabel}` : `Choose the custom date for ${timeLabel}`,
  };

  return labels[recurring] || `Repeats daily at ${timeLabel}`;
}

function updateTaskSchedulePreview(taskForm) {
  if (!taskForm) return;
  const preview = taskForm.querySelector("[data-task-schedule-preview]");
  const customDateInput = taskForm.querySelector('input[name="customDate"]');
  const recurringInput = taskForm.querySelector('input[name="recurring"]:checked');
  const timeInput = taskForm.querySelector('input[name="time"]') || taskForm.querySelector('#tp-hidden-value');
  const scheduleBlock = taskForm.querySelector(".task-schedule-block");
  if (!preview || !customDateInput || !timeInput || !scheduleBlock) return;

  const recurring = recurringInput?.value || "daily";
  const showCustomDate = recurring === "custom-date";
  scheduleBlock.classList.toggle("has-custom-date", showCustomDate);
  customDateInput.classList.toggle("is-hidden", !showCustomDate);
  customDateInput.required = showCustomDate;
  if (!showCustomDate) {
    customDateInput.value = "";
  }

  preview.textContent = getTaskSchedulePreviewText(recurring, timeInput.value, customDateInput.value);
}

function buildTaskDetail(recurring, time, customDateLabel = "") {
  const labels = {
    daily: "Daily",
    "every-other-day": "Every other day",
    weekly: "Weekly",
    monthly: "Monthly",
    "custom-date": customDateLabel || "Custom date",
  };

  return `${labels[recurring] || "Daily"} \u2022 ${time}`;
}

function addPointsHistory(kid, changeType, pointsDelta, description) {
  if (!Array.isArray(kid.pointsHistory)) kid.pointsHistory = [];
  kid.pointsHistory.push({ id: createId("hist"), changeType, pointsDelta, pointsAfter: kid.points, description: description || changeType, createdAt: new Date().toISOString() });
  if (kid.pointsHistory.length > 500) kid.pointsHistory = kid.pointsHistory.slice(-500);
}

function editTask(kidId, templateId, newTitle, newPoints, newTime) {
  const kid = getKid(kidId); if (!kid) return;
  const tmpl = kid.taskTemplates.find(t => t.id === templateId); if (!tmpl) return;
  tmpl.title = String(newTitle || "").trim().slice(0,100) || tmpl.title;
  tmpl.points = Math.max(0, Number(newPoints) || 0);
  tmpl.time = String(newTime || "").trim();
  [...kid.due, ...kid.awaiting].forEach(t => { if (t.templateId === templateId) { t.title = tmpl.title; t.points = tmpl.points; t.time = tmpl.time; t.detail = buildTaskDetail(t.recurring, tmpl.time, t.customDate ? formatCustomDate(t.customDate) : ""); } });
}

function deleteTask(kidId, templateId) {
  const kid = getKid(kidId); if (!kid) return;
  kid.taskTemplates = kid.taskTemplates.filter(t => t.id !== templateId);
  kid.due = kid.due.filter(t => t.templateId !== templateId);
  kid.awaiting = kid.awaiting.filter(t => t.templateId !== templateId);
}

function editReward(kidId, rewardId, newTitle, newCost) {
  const kid = getKid(kidId); if (!kid) return;
  const r = kid.rewards.find(r => r.id === rewardId); if (!r) return;
  r.title = String(newTitle || "").trim().slice(0,100) || r.title;
  r.cost = Math.max(0, Number(newCost) || 0);
}

function deleteReward(kidId, rewardId) {
  const kid = getKid(kidId); if (!kid) return;
  kid.rewards = kid.rewards.filter(r => r.id !== rewardId);
}

function updateKidColour(kidId, accent, deep) {
  const kid = getKid(kidId); if (!kid) return;
  kid.accentColour = accent; kid.accentColourDeep = deep;
}

function addReward(kidIds, title, cost) {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    kid.rewards.push({
      id: `${kidId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      cost,
    });
  });
}

function addAdjustment(kidIds, label, value, reason = "") {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    const type = label.toLowerCase();
    const previousPoints = kid.points;
    const now = new Date().toISOString();
    kid.bonusPenalty = kid.bonusPenalty.filter((entry) => (entry.type || "").toLowerCase() !== type);
    kid.bonusPenalty.push({
      type,
      title: `${value > 0 ? "+" : ""}${value} points`,
      value: `${value > 0 ? "+" : ""}${value} points`,
      reason,
      dateKey: getTodayDateKey(),
      createdAt: now,
    });

    kid.points = Math.max(0, kid.points + value);
    addPointsHistory(kid, type === "penalty" ? "penalty" : "bonus", value, reason || (type === "penalty" ? "Penalty" : "Bonus"));
    maybeCelebrateThreshold(kid, previousPoints);
  });
}

function addReason(kidIds, type, reason) {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    const key = type === "penalty" ? "penaltyReasons" : "bonusReasons";
    kid[key] = [...(kid[key] || []), reason];
  });
}

function addChild(name, kidPin, avatar = "", accentColour = "", accentColourDeep = "") {
  const family = getCurrentFamily();
  if (!family) return;
  const colourIndex = family.kids.length;
  const kid = createKid(name, kidPin, avatar, colourIndex);
  if (accentColour) { kid.accentColour = accentColour; kid.accentColourDeep = accentColourDeep || accentColour; }
  family.kids.push(kid);
}

function updateDollarConversion(kidId, points, dollars) {
  const kid = getKid(kidId);
  if (!kid) return;
  kid.pointsPerDollarReward = points;
  kid.dollarRewardValue = dollars;
}

function updateCelebrationThreshold(kidIds, threshold) {
  const ids = Array.isArray(kidIds) ? kidIds : [kidIds];
  ids.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;
    kid.celebrationThreshold = threshold;
    kid.lastCelebratedThreshold = 0;
  });
}

function addTask(kidIds, title, points, recurring, time, customDate = "") {
  const todayKey = getTodayDateKey();
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    if (!Array.isArray(kid.taskTemplates)) kid.taskTemplates = [];

    const template = buildTaskTemplate({
      id: createId("task-template"),
      title,
      points,
      recurring,
      time,
      customDate,
      startDateKey: todayKey,
    }, todayKey);

    kid.taskTemplates.push(template);

    if (taskOccursOnDate(template, todayKey)) {
      kid.due.push(buildTaskInstanceFromTemplate(template, todayKey));
    }
  });
}

function moveTask(kidId, fromStatus, toStatus, taskIndex) {
  const kid = getKid(kidId);
  if (!kid || !Array.isArray(kid[fromStatus]) || !Array.isArray(kid[toStatus])) return;
  if (!Number.isInteger(taskIndex) || taskIndex < 0 || taskIndex >= kid[fromStatus].length) return;

  const [task] = kid[fromStatus].splice(taskIndex, 1);
  if (!task) return;

  const previousPoints = kid.points;
  kid[toStatus].push(task);
  if (toStatus === "completed" && fromStatus !== "completed") {
    kid.points += Number(task.points) || 0;
    addPointsHistory(kid, "task", Number(task.points)||0, "Completed: " + task.title);
    maybeCelebrateThreshold(kid, previousPoints);
  }
  if (fromStatus === "completed" && toStatus !== "completed") {
    const delta = -(Number(task.points)||0);
    kid.points = Math.max(0, kid.points + delta);
    addPointsHistory(kid, "task", delta, "Uncompleted: " + task.title);
  }
}

function formatClaimTimestamp(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function claimReward(kidId, rewardId) {
  const family = getCurrentFamily();
  const kid = getKid(kidId);
  if (!family || !kid) return { ok: false, reason: "missing-kid" };

  const reward = kid.rewards.find((entry) => entry.id === rewardId);
  if (!reward) return { ok: false, reason: "missing-reward" };

  const cost = Math.max(0, Number(reward.cost) || 0);
  const currentPoints = Math.max(0, Number(kid.points) || 0);
  if (currentPoints < cost) {
    return {
      ok: false,
      reason: "not-enough-points",
      missingPoints: cost - currentPoints,
      rewardTitle: reward.title,
      kidName: kid.name,
    };
  }

  kid.points = currentPoints - cost;
  addPointsHistory(kid, "reward_claim", -cost, "Claimed: " + reward.title);
  family.favorClaims = [
    {
      id: createId("favor-claim"),
      kidId: kid.id,
      kidName: kid.name,
      rewardId: reward.id,
      rewardTitle: reward.title,
      cost,
      claimedAt: new Date().toISOString(),
    },
    ...(Array.isArray(family.favorClaims) ? family.favorClaims : []),
  ].slice(0, 20);

  return {
    ok: true,
    rewardTitle: reward.title,
    kidName: kid.name,
    cost,
  };
}

function resetAllTasks() {
  getFamilyKids().forEach((kid) => {
    kid.due = []; kid.awaiting = []; kid.completed = []; kid.taskTemplates = [];
    kid.missedDaysInARow = 0; kid.lastMissedCheckDate = getTodayDateKey(); kid.lastTaskRefreshDate = getTodayDateKey();
  });
}

function resetAllPoints() {
  getFamilyKids().forEach((kid) => {
    kid.points = 0; kid.lastCelebratedThreshold = 0; kid.pointsHistory = [];
    kid.bonusPenalty = [
      { type: "bonus", title: "+0 points", value: "+0 points", reason: "", dateKey: null, createdAt: null },
      { type: "penalty", title: "-0 points", value: "-0 points", reason: "", dateKey: null, createdAt: null },
    ];
  });
}

function resetAllTasksAndPoints() { resetAllTasks(); resetAllPoints(); }

function deleteKid(kidId) {
  const family = getCurrentFamily(); if (!family) return false;
  const kid = family.kids.find(k => k.id === kidId); if (!kid) return false;
  family.kids = family.kids.filter(k => k.id !== kidId);
  family.favorClaims = (family.favorClaims || []).filter(c => c.kidId !== kidId);
  return kid.name;
}

function deleteCurrentFamilyFromDevice() {
  const family = getCurrentFamily();
  if (!family) return false;

  state.families = state.families.filter((entry) => entry.id !== family.id);
  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  authStage = "intro";
  authView = "";
  authAccountJustCreated = false;
  authAccountReady = state.families.length > 0;
  resetCreateAccountDraft();
  saveState({ skipCloud: true });
  return true;
}

async function logout() {

  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  saveState();
  renderApp();
}

function renderAssignedKidsBlock() {
  return `
    <div class="reward-assignment-block">
      <p class="assign-summary">Assign to</p>
      <div class="assign-grid reward-assign-grid">
        ${getFamilyKids()
          .map(
            (child) => `
              <label class="assign-option">
                <input type="checkbox" name="assignedKids" value="${escapeHtml(child.id)}" ${currentAssignedKids.includes(child.id) ? "checked" : ""} />
                <span>${escapeHtml(child.name)}</span>
              </label>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderTaskRecurringBlock() {
  const options = [
    { value: "daily", label: "Daily" },
    { value: "every-other-day", label: "Every other day" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
    { value: "custom-date", label: "Custom date" },
  ];

  return `
    <div class="task-schedule-block">
      <div class="task-recurring-group" role="radiogroup" aria-label="Task repeat options">
        ${options
          .map(
            (option, index) => `
              <label class="task-recurring-pill ${index === 0 ? "is-default" : ""}">
                <input type="radio" name="recurring" value="${escapeHtml(option.value)}" ${index === 0 ? "checked" : ""} />
                <span>${escapeHtml(option.label)}</span>
              </label>
            `
          )
          .join("")}
      </div>
      <div class="task-time-row">
        <input class="custom-date-field is-hidden" type="date" name="customDate" aria-label="Custom date" />
        <div class="time-picker-wrap">
          <div class="tp-spinner">
            <button type="button" class="tp-arrow" data-tp-hour="+1">\u25B2</button>
            <div class="tp-val" id="tp-hour-display">8</div>
            <button type="button" class="tp-arrow" data-tp-hour="-1">\u25BC</button>
          </div>
          <div class="tp-sep">:</div>
          <div class="tp-spinner">
            <button type="button" class="tp-arrow" data-tp-min="+1">\u25B2</button>
            <div class="tp-val" id="tp-min-display">00</div>
            <button type="button" class="tp-arrow" data-tp-min="-1">\u25BC</button>
          </div>
          <div class="tp-ampm-group">
            <button type="button" class="tp-ampm-btn active" data-tp-ampm="AM">AM</button>
            <button type="button" class="tp-ampm-btn" data-tp-ampm="PM">PM</button>
          </div>
          <input type="hidden" name="time" id="tp-hidden-value" value="08:00" />
        </div>
      </div>
      <p class="task-schedule-preview" data-task-schedule-preview="true">Choose a repeat style and time to preview the schedule.</p>
    </div>
  `;
}

function renderAuthHome() {
  // DEBUG: show Supabase connection status
  var dbg = document.getElementById("supabase-debug-banner");
  if (!dbg) {
    dbg = document.createElement("div");
    dbg.id = "supabase-debug-banner";
    dbg.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;padding:6px 12px;font-size:0.75rem;font-weight:700;text-align:center;";
    document.body.appendChild(dbg);
  }
  if (!window.supabase) {
    dbg.style.background = "#ff4444";
    dbg.style.color = "#fff";
    dbg.textContent = "SUPABASE LIB NOT LOADED";
  } else if (!supabaseClient) {
    dbg.style.background = "#ff8800";
    dbg.style.color = "#fff";
    dbg.textContent = "SUPABASE CLIENT NULL - check config";
  } else {
    dbg.style.background = "#22cc66";
    dbg.style.color = "#fff";
    dbg.textContent = "SUPABASE OK - " + (cloudConfig.url || "no url");
  }
  if (authStage === "intro" && !["about", "create", "returning", ""].includes(authView)) {
    authView = "";
  }

  if (authStage === "login" && !["parent", "kid", "returning"].includes(authView)) {
    authView = "parent";
  }

  document.getElementById("page-home").innerHTML = `
    <div class="home-shell auth-shell">
      <header class="home-header">
        <p class="eyebrow">Family task tracker</p>
        <h1 class="rainbow-title" aria-label="CHORES">
          <span class="title-star" aria-hidden="true">\u2726</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">O</span>
          <span aria-hidden="true">R</span>
          <span aria-hidden="true">E</span>
          <span aria-hidden="true">S</span>
          <span class="title-star" aria-hidden="true">\u2726</span>
        </h1>
      </header>

      <section class="auth-layout">
        <article class="section-card primary auth-card">
          ${renderTileBubbles()}
          <div class="auth-tabs">
            ${
              authStage === "intro"
                ? `
                  ${
                    authView === "about"
                      ? `<button class="action-button secondary auth-back-button" type="button" data-auth-view="back-intro">Back</button>`
                      : authView === "create"
                        ? `
                            <button class="action-button secondary auth-back-button" type="button" data-auth-view="back-intro">Back</button>
                            <button class="view-button active auth-create-only" type="button">Create account</button>
                          `
                        : authView === "returning"
                          ? `<button class="view-button active auth-create-only" type="button">Login</button>`
                        : `
                        <button class="view-button ${authView === "about" ? "active" : ""}" type="button" data-auth-view="about">About app</button>
                        <button class="view-button ${authView === "create" ? "active" : ""}" type="button" data-auth-view="create">Create account</button>
                        <button class="view-button ${authView === "returning" ? "active" : ""}" type="button" data-auth-view="returning">Login</button>
                      `
                  }
                `
                : `
                  <button class="view-button ${authView === "parent" ? "active" : ""}" type="button" data-auth-view="parent">Parent login</button>
                  <button class="view-button ${authView === "kid" ? "active" : ""}" type="button" data-auth-view="kid">Kid login</button>
                `
            }
          </div>

          ${
            authStage === "login"
              ? `
                <div class="button-row auth-stage-actions">
                  <button class="action-button secondary" type="button" data-auth-stage="intro">Back to home</button>
                </div>
              `
              : ""
          }

          <div class="auth-panel ${authView === "about" ? "active" : ""}">
            <div class="about-pill-row">
              <button class="sub-view-button ${aboutTopic === "what" ? "active" : ""}" type="button" data-about-topic="what">What it does</button>
              <button class="sub-view-button ${aboutTopic === "parents" ? "active" : ""}" type="button" data-about-topic="parents">Parents</button>
              <button class="sub-view-button ${aboutTopic === "kids" ? "active" : ""}" type="button" data-about-topic="kids">Kids</button>
              <button class="sub-view-button ${aboutTopic === "how" ? "active" : ""}" type="button" data-about-topic="how">How it works</button>
              <button class="sub-view-button ${aboutTopic === "start" ? "active" : ""}" type="button" data-about-topic="start">Getting started</button>
            </div>
            <div class="auth-about-display ${aboutTopic ? "active" : ""}" data-about-tone="${escapeHtml(aboutTopic)}">
              ${renderAboutTopicContent(aboutTopic)}
            </div>
          </div>

          <div class="auth-panel ${authView === "create" ? "active" : ""}">
            <form class="reward-form auth-form" id="create-family-form">
              ${renderCurrentCreateStep()}
              ${createAccountStep > BASE_CREATE_FIELDS.length ? `<p class="create-progress-copy">Complete one line, then tap Next or add another child.</p>` : ""}
              ${renderCreateAccountActions()}
            </form>
            ${
              authAccountReady
                ? `
                  <div class="auth-next-card">
                    <p>${authAccountJustCreated ? "Your account is ready." : "Already created your account?"}</p>
                    <button class="action-button primary" type="button" data-auth-stage="login">Next</button>
                  </div>
                `
                : ""
            }
          </div>

          <div class="auth-panel ${authView === "returning" ? "active" : ""}">
            ${
              authResetPasscodeOpen
                ? `
                  <form class="reward-form auth-form auth-reset-form" id="reset-passcode-form">
                    <input type="email" name="username" placeholder="Username" required />
                    <input type="password" name="newPassword" placeholder="New passcode" required />
                    <div class="button-row create-progress-actions">
                      <button class="action-button primary" type="submit">Save new passcode</button>
                      <button class="action-button secondary" type="button" data-auth-view="back-intro">Back to home</button>
                      <button class="action-button secondary" type="button" data-reset-passcode-toggle="true">Cancel reset</button>
                    </div>
                  </form>
                `
                : `
                  <form class="reward-form auth-form" id="returning-login-form">
                    <input type="email" name="username" placeholder="Username" required />
                    <input type="password" name="password" placeholder="Password" required />
                    <div class="button-row create-progress-actions">
                      <button class="action-button primary" type="submit">Log in</button>
                      <button class="action-button secondary" type="button" data-auth-view="back-intro">Back to home</button>
                      <button class="action-button secondary" type="button" data-reset-passcode-toggle="true">Reset passcode</button>
                    </div>
                  </form>
                `
            }
          </div>

          <div class="auth-panel ${authView === "parent" ? "active" : ""}">
            <p class="eyebrow">Parent login</p>
            <h2 class="auth-title">Welcome back, parent.</h2>
            <p class="auth-copy">Use your parent email and PIN to open the full parent interface.</p>
            <form class="reward-form auth-form" id="parent-login-form">
              <input type="email" name="parentEmail" placeholder="Parent email" required />
              <input type="password" name="parentPin" placeholder="Parent PIN" required />
              <div class="button-row">
                <button class="action-button primary" type="submit">Log in as parent</button>
              </div>
            </form>
          </div>

          <div class="auth-panel ${authView === "kid" ? "active" : ""}">
            <p class="eyebrow">Kid login</p>
            <h2 class="auth-title">Kid sign-in.</h2>
            <p class="auth-copy">Kids use the family email, their name, and their kid PIN to reach their own dashboard and rewards.</p>
            <form class="reward-form auth-form" id="kid-login-form">
              <input type="email" name="familyEmail" placeholder="Family email" required />
              <input type="text" name="kidName" placeholder="Kid name" required />
              <input type="password" name="kidPin" placeholder="4-digit kid PIN" inputmode="numeric" pattern="\\d{4}" maxlength="4" required />
              <div class="button-row">
                <button class="action-button primary" type="submit">Log in as kid</button>
              </div>
            </form>
          </div>
        </article>
      </section>
    </div>
  `;

  showPage("page-home");
}

function renderParentHome() {
  refreshAllTasksForToday();
  const family = getCurrentFamily();
  const kids = getFamilyKids();

  document.getElementById("page-home").innerHTML = `
    <div class="home-shell">
      <header class="home-header home-header--session">
        <button class="back-button home-logout-button" type="button" data-logout="true">Log out</button>
        <p class="eyebrow">${escapeHtml(family.familyName)} family</p>
        <h1 class="rainbow-title" aria-label="CHORES">
          <span class="title-star" aria-hidden="true">\u2726</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">O</span>
          <span aria-hidden="true">R</span>
          <span aria-hidden="true">E</span>
          <span aria-hidden="true">S</span>
          <span class="title-star" aria-hidden="true">\u2726</span>
        </h1>
      </header>

      <section class="kid-grid" id="home-kids">
        ${kids
          .map(
            (kid) => `
              <article class="kid-card ${escapeHtml(getShellClass(kid.name, false))}" data-kid-id="${escapeHtml(kid.id)}" role="button" tabindex="0" ${kid.accentColour ? `style="--kid-accent:${kid.accentColour};--kid-accent-deep:${kid.accentColourDeep||kid.accentColour};--kid-accent-soft:rgba(${hexToRgb(kid.accentColour)},0.12);--kid-accent-rgb:${hexToRgb(kid.accentColour)};"` : ""}>
                ${renderTileBubbles()}
                <div class="kid-card-top">
                  <div class="avatar">${renderAvatar(kid)}</div>
                  <div>
                    <h2>${escapeHtml(kid.name)}</h2>
                  </div>
                </div>
                <div class="pill-row">
                  <span class="pill score-pill">
                    <span class="score-sparkles" aria-hidden="true"></span>
                    <span class="score-value">${escapeHtml(kid.points)} points</span>
                  </span>
                  <span class="pill dollar-pill">$${escapeHtml(getDollarEquivalent(kid))}</span>
                </div>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="home-actions" aria-label="Family shortcuts">
        <button class="family-tile report-shortcut" type="button" data-family-view="report">
          ${renderTileBubbles()}
          <span>Reports</span>
        </button>
        <button class="family-tile settings-shortcut" type="button" data-family-view="settings">
          ${renderTileBubbles()}
          <span>Settings</span>
        </button>
      </section>
    </div>
  `;

  showPage("page-home");
}

function renderKidPage(kidId) {
  refreshAllTasksForToday();
  const family = getCurrentFamily();
  const kid = getKid(kidId);
  if (!family || !kid) return;

  currentKidId = kidId;
  currentAssignedKids = currentAssignedKids.filter((assignedKidId) => Boolean(getKid(assignedKidId)));
  currentThresholdAssignedKids = currentThresholdAssignedKids.filter((assignedKidId) => Boolean(getKid(assignedKidId)));
  currentRewardAssignedKids = currentRewardAssignedKids.filter((assignedKidId) => Boolean(getKid(assignedKidId)));

  const familyMode = currentFamilyMode && isParentSession();
  const role = isParentSession() ? "parent" : "kid";
  const shellClass = getShellClass(kid.name, familyMode);
  const kidInlineStyle = kid.accentColour ? `style="--kid-accent:${kid.accentColour};--kid-accent-deep:${kid.accentColourDeep||kid.accentColour};--kid-accent-soft:rgba(${hexToRgb(kid.accentColour)},0.12);--kid-accent-rgb:${hexToRgb(kid.accentColour)};"` : "";
  const pageTitle = familyMode ? family.familyName : kid.name;
  const canSeeReports = role === "parent";
  const canSeeSettings = role === "parent";
  const hasReachedThreshold = Number(kid.celebrationThreshold) > 0 && Number(kid.points) >= Number(kid.celebrationThreshold);
  const todayBonus = getKidAdjustmentForToday(kid, "bonus");
  const todayPenalty = getKidAdjustmentForToday(kid, "penalty");
  const parentFocusedNav = (currentKidView === "settings" || currentKidView === "report") && isParentSession();
  document.getElementById("page-kid").innerHTML = `
    <div class="kid-shell ${escapeHtml(shellClass)}" ${kidInlineStyle}>
      <header class="kid-header">
        <div class="kid-profile-pill">
          <h1>${escapeHtml(pageTitle)}</h1>
        </div>
        <div class="view-switcher">
          ${
            parentFocusedNav
              ? ""
              : `<button class="view-button ${currentKidView === "dashboard" ? "active" : ""}" type="button" data-view="dashboard">Dashboard</button>
          <button class="view-button ${["rewards", "favors"].includes(currentKidView) ? "active" : ""}" type="button" data-view="rewards">Rewards</button>`
          }
          ${
            canSeeReports
              ? `<button class="view-button ${currentKidView === "report" ? "active" : ""}" type="button" data-view="report">Reports</button>`
              : ""
          }
          ${
            canSeeSettings
              ? `<button class="view-button ${currentKidView === "settings" ? "active" : ""}" type="button" data-view="settings">Settings</button>`
              : ""
          }
        </div>
        <button class="back-button" type="button" id="back-home">${isParentSession() ? "\u2190 Back to family" : "Log out"}</button>
      </header>

      <section class="kid-layout">
        <article class="section-card primary kid-view ${currentKidView === "dashboard" ? "active" : ""}" data-panel="dashboard">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <h2>Dashboard</h2>
            </div>
            <span class="summary-stat">${escapeHtml(kid.due.length)} due tasks</span>
          </div>

          <div class="task-columns">
            <section class="task-lane due">
              ${renderTileBubbles()}
              <h3>Due</h3>
              <div class="task-stack">
                ${renderCardList(
                  kid.due,
                  (task, taskIndex) => `
                    <article class="task-card">
                      <h4>${escapeHtml(task.title)}</h4>
                      <p class="meta">${escapeHtml(task.detail)}</p>
                      <p class="meta">${escapeHtml(task.points)} points</p>
                      <div class="task-actions">
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="due" data-to-status="awaiting" data-task-index="${taskIndex}">Done</button>
                      </div>
                    </article>
                  `,
                  "Nothing due right now."
                )}
              </div>
            </section>

            <section class="task-lane awaiting">
              ${renderTileBubbles()}
              <h3>Awaiting approval</h3>
              <div class="task-stack">
                ${renderCardList(
                  kid.awaiting,
                  (task, taskIndex) => `
                    <article class="task-card">
                      <h4>${escapeHtml(task.title)}</h4>
                      <p class="meta">${escapeHtml(task.detail)}</p>
                      <p class="meta">${escapeHtml(task.points)} points</p>
                      <div class="task-actions">
                        ${role === "parent" ? `<button class="task-action-pill" type="button" data-task-move="true" data-from-status="awaiting" data-to-status="completed" data-task-index="${taskIndex}">Approve</button>` : ""}
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="awaiting" data-to-status="due" data-task-index="${taskIndex}">Undo</button>
                      </div>
                    </article>
                  `,
                  "Nothing is waiting for approval."
                )}
              </div>
            </section>

            <section class="task-lane completed">
              ${renderTileBubbles()}
              <h3>Completed</h3>
              <div class="task-stack">
                ${renderCardList(
                  kid.completed,
                  (task, taskIndex) => `
                    <article class="task-card">
                      <h4>${escapeHtml(task.title)}</h4>
                      <p class="meta">${escapeHtml(task.detail)}</p>
                      <p class="meta">${escapeHtml(task.points)} points</p>
                      ${role === "parent" ? `<div class="task-actions"><button class="task-action-pill" type="button" data-task-move="true" data-from-status="completed" data-to-status="due" data-task-index="${taskIndex}">Undo</button></div>` : ""}
                    </article>
                  `,
                  "Nothing completed yet."
                )}
              </div>
            </section>
          </div>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "rewards" ? "active" : ""}" data-panel="rewards">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          ${
            hasReachedThreshold
              ? `
                <span class="rewards-celebration-cloud" aria-hidden="true">
                  <span>\uD83E\uDD73</span><span>\uD83D\uDE04</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF89</span>
                  <span>\uD83D\uDE04</span><span>\uD83E\uDD73</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF8A</span>
                  <span>\uD83E\uDD73</span><span>\uD83D\uDE04</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF89</span>
                  <span>\uD83D\uDE04</span><span>\uD83E\uDD73</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF8A</span>
                </span>
              `
              : ""
          }
          <div class="section-head">
            <div>
              <p class="eyebrow">${escapeHtml(kid.name)}'s Rewards</p>
              <h2>Rewards</h2>
            </div>
          </div>

          <div class="rewards-layout">
            <div class="points-column">
              <article class="points-card is-bursting ${hasReachedThreshold ? "threshold-celebration" : ""}" data-points-card="true" role="button" tabindex="0" aria-label="Make points sparkle">
                ${renderTileBubbles()}
                ${
                  hasReachedThreshold
                    ? `
                      <span class="points-celebration-cloud" aria-hidden="true">
                        <span>\uD83E\uDD73</span><span>\uD83D\uDE04</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF89</span>
                        <span>\uD83D\uDE04</span><span>\uD83E\uDD73</span><span>\uD83D\uDE01</span><span>\uD83E\uDD29</span><span>\uD83D\uDE06</span><span>\uD83C\uDF8A</span>
                      </span>
                    `
                    : ""
                }
                <span class="points-star-cloud" aria-hidden="true">
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                  <span></span><span></span><span></span><span></span><span></span><span></span>
                </span>
                <p class="eyebrow">Points earned</p>
                <h3 class="points-total">${escapeHtml(kid.points)}</h3>
                <p class="points-message is-changing">You are building your treasure, ${escapeHtml(kid.name)}!</p>
              </article>

              <section class="daily-adjustment-panel">
                <article class="daily-adjustment-card bonus ${todayBonus ? "has-update" : "is-empty"}">
                  <p class="eyebrow">Today's bonus</p>
                  ${
                    todayBonus
                      ? `
                        <h4>${escapeHtml(todayBonus.value)}</h4>
                        <p>${escapeHtml(todayBonus.reason || "A bonus was added today.")}</p>
                      `
                      : `
                        <h4>No bonus yet</h4>
                        <p>No bonus has been added for today.</p>
                      `
                  }
                </article>
                <article class="daily-adjustment-card penalty ${todayPenalty ? "has-update" : "is-empty"}">
                  <p class="eyebrow">Today's penalty</p>
                  ${
                    todayPenalty
                      ? `
                        <h4>${escapeHtml(todayPenalty.value)}</h4>
                        <p>${escapeHtml(todayPenalty.reason || "A penalty was added today.")}</p>
                      `
                      : `
                        <h4>No penalty yet</h4>
                        <p>No penalty has been added for today.</p>
                      `
                  }
                </article>
              </section>
            </div>

            <section class="reward-stack">
              ${renderTileBubbles()}
              <button class="favor-pill" type="button" data-view="favors">
                <span class="score-sparkles" aria-hidden="true"></span>
                <span>Buy favors with your points</span>
              </button>
              ${renderPointsHistory(kid)}
            </section>
          </div>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "favors" ? "active" : ""}" data-panel="favors">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <p class="eyebrow">${escapeHtml(kid.name)}'s favors</p>
              <h2>Buy favors with your points</h2>
            </div>
            <button class="action-button secondary" type="button" data-view="rewards">Back to rewards</button>
          </div>

          <section class="favor-list-tile">
            ${renderTileBubbles()}
            ${renderCardList(
              kid.rewards,
              (reward) => `
                <article class="reward-card reward-option">
                  <div class="reward-option-copy">
                    <h4>${escapeHtml(reward.title)}</h4>
                    <p class="meta">${escapeHtml(reward.cost)} points needed</p>
                  </div>
                  <div class="button-row">
                    <span class="reward-points">${escapeHtml(reward.cost)} pts</span>
                    <button class="action-button secondary" type="button" data-claim-reward="${escapeHtml(reward.id)}">Claim</button>
                  </div>
                </article>
              `,
              "No favors yet. Ask a parent to add some in Settings."
            )}
          </section>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "report" && canSeeReports ? "active" : ""}" data-panel="report">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <h2>Report</h2>
            </div>
            <span class="summary-stat">${escapeHtml(getFamilyKids().reduce((total, child) => total + child.due.length, 0))} due tasks</span>
          </div>

          <div class="report-grid">
            ${getFamilyKids()
              .map(
                (child) => `
                  <section class="report-tile ${escapeHtml(getShellClass(child.name, false))}" ${child.accentColour ? `style="--kid-accent:${child.accentColour};--kid-accent-deep:${child.accentColourDeep||child.accentColour};--kid-accent-soft:rgba(${hexToRgb(child.accentColour)},0.12);"` : ""}>
                    ${renderTileBubbles()}
                    <div class="report-head">
                      <h3>${escapeHtml(child.name)}</h3>
                      <span class="report-count">${escapeHtml(child.due.length)} due</span>
                    </div>
                    <div class="report-list">
                      ${renderCardList(
                        child.due,
                        (task) => `
                          <article class="task-card report-task">
                            <h4>${escapeHtml(task.title)}</h4>
                            <p class="meta">${escapeHtml(task.detail)}</p>
                            <p class="meta">Not done yet \u2022 ${escapeHtml(task.points)} points</p>
                          </article>
                        `,
                        "All caught up."
                      )}
                    </div>
                  </section>
                `
              )
              .join("")}
          </div>

          <div class="report-watch">
            <p class="eyebrow">3-day missed-task tracker</p>
            <div class="watch-grid">
              ${getFamilyKids()
                .map((child) => {
                  const missedDays = Number(child.missedDaysInARow) || 0;
                  const cappedDays = Math.min(missedDays, 3);
                  return `
                    <article class="watch-pill ${escapeHtml(getShellClass(child.name, false))} ${missedDays >= 3 ? "alert" : ""}" ${child.accentColour ? `style="--kid-accent:${child.accentColour};--kid-accent-deep:${child.accentColourDeep||child.accentColour};--kid-accent-soft:rgba(${hexToRgb(child.accentColour)},0.12);"` : ""}>
                      <strong>${escapeHtml(child.name)}</strong>
                      <span>${escapeHtml(cappedDays)}/3 days</span>
                      <em>${missedDays >= 3 ? "Check in today" : child.due.length ? "Still has due tasks" : "On track"}</em>
                    </article>
                  `;
                })
                .join("")}
            </div>
          </div>

          <div class="report-claims">
            <p class="eyebrow">Favor claim notifications</p>
            <div class="report-claims-list">
              ${renderCardList(
                Array.isArray(family.favorClaims) ? family.favorClaims : [],
                (claim) => `
                  <article class="entry-card report-claim-card">
                    <h4>${escapeHtml(claim.kidName)} claimed ${escapeHtml(claim.rewardTitle)}</h4>
                    <p class="meta">${escapeHtml(claim.cost)} points used</p>
                    <p class="meta">${escapeHtml(formatClaimTimestamp(claim.claimedAt))}</p>
                  </article>
                `,
                "No favors have been claimed yet."
              )}
            </div>
          </div>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "settings" && canSeeSettings ? "active" : ""}" data-panel="settings">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <h2>Settings</h2>
            </div>
          </div>

          ${
            !currentSettingsSection
              ? `
                <div class="settings-hub">
                  ${renderSettingsSwitcher("")}
                </div>
              `
              : `
                <div class="settings-detail">
                  ${renderSettingsSwitcher(currentSettingsSection)}

                  <div class="settings-subpage">
                    ${
                      currentSettingsSection === "add-task"
                        ? `
                          <article class="reward-card settings-tile add-task-tile single-settings-tile">
                            ${renderTileBubbles()}
                            <p class="eyebrow">Add task</p>
                            <form class="reward-form" id="task-form">
                              <input type="text" name="title" placeholder="Task title" required />
                              ${renderAssignedKidsBlock()}
                              ${renderTaskRecurringBlock()}
                              <input type="number" name="points" placeholder="Points" min="1" required />
                              <div class="button-row">
                                <button class="action-button primary" type="submit">Add task</button>
                                <button class="action-button danger" type="button" data-reset-tasks="true">Reset tasks</button>
                                <button class="action-button danger" type="button" data-reset-points="true">Reset points</button>
                              </div>
                            </form>
                          
                            ${kid.taskTemplates && kid.taskTemplates.length ? `
                            <article class="reward-card settings-tile single-settings-tile task-template-list-tile" style="margin-top:14px;">
                              ${renderTileBubbles()}
                              <p class="eyebrow">Task templates</p>
                              ${kid.taskTemplates.map(tmpl => `
                                <div class="template-row">
                                  <div class="template-row-info">
                                    <span class="template-row-title">${escapeHtml(tmpl.title)}</span>
                                    <span class="template-row-meta">${escapeHtml(tmpl.recurring)} \u00B7 ${escapeHtml(tmpl.time)} \u00B7 ${escapeHtml(tmpl.points)} pts</span>
                                  </div>
                                  <div class="template-row-actions">
                                    <button class="action-button secondary small-action-button" type="button" data-edit-task-template="${escapeHtml(tmpl.id)}">Edit</button>
                                    <button class="action-button danger small-action-button" type="button" data-delete-task-template="${escapeHtml(tmpl.id)}">Delete</button>
                                  </div>
                                </div>`).join("")}
                            </article>` : ""}
                          </article>
                        `
                        : ""
                    }

                    ${
                      currentSettingsSection === "family-controls"
                        ? `
                          <article class="reward-card settings-tile family-controls-tile single-settings-tile ${!currentFamilyControlsSection ? "family-controls-overview-tile" : ""}">
                            ${renderTileBubbles()}
                            <p class="eyebrow">Family controls</p>
                            ${
                              !currentFamilyControlsSection
                                ? `
                                  <div class="family-controls-hub">
                                    ${renderFamilyControlsSwitcher("")}
                                  </div>
                                `
                                : `
                                  <div class="family-controls-detail">
                                    ${renderActiveFamilyControlsHeader(currentFamilyControlsSection)}
                                    <div class="family-controls-subpage">
                                      ${
                                        currentFamilyControlsSection === "add-rewards"
                                          ? `
                                            <section class="settings-mini-section add-rewards-section family-controls-page">
                                              <p class="eyebrow">Add rewards</p>
                                              <form class="reward-form" id="reward-form">
                                                <div class="reward-input-row">
                                                  <input type="text" name="title" placeholder="Example: Choose dinner" required />
                                                  <input class="reward-points-input" type="number" name="cost" placeholder="Points" min="1" required />
                                                </div>
                                                <div class="reward-assignment-block">
                                                  <p class="assign-summary">Assign to</p>
                                                  <div class="assign-grid reward-assign-grid">
                                                    ${getFamilyKids()
                                                      .map(
                                                        (child) => `
                                                          <label class="assign-option">
                                                            <input type="checkbox" name="rewardAssignedKids" value="${escapeHtml(child.id)}" ${currentRewardAssignedKids.includes(child.id) ? "checked" : ""} />
                                                            <span>${escapeHtml(child.name)}</span>
                                                          </label>
                                                        `
                                                      )
                                                      .join("")}
                                                  </div>
                                                </div>
                                                <div class="button-row">
                                                  <button class="action-button primary reward-submit-button" type="submit" ${currentRewardAssignedKids.length ? "" : "disabled"}>Add rewards</button>
                                                </div>
                                              </form>
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "dollar-rate"
                                          ? `
                                            <section class="settings-mini-section dollar-section family-controls-page">
                                              <p class="eyebrow">Dollar rate</p>
                                              <form class="reward-form dollar-rate-form" id="dollar-form">
                                                <select name="kidId" required>
                                                  ${getFamilyKids().map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join("")}
                                                </select>
                                                <div class="dollar-rate-grid">
                                                  <label class="field-label">
                                                    <span>Points</span>
                                                    <input type="number" name="points" placeholder="100" min="1" value="${escapeHtml(kid.pointsPerDollarReward)}" required />
                                                  </label>
                                                  <label class="field-label">
                                                    <span>Dollars</span>
                                                    <span class="money-input">
                                                      <span aria-hidden="true">$</span>
                                                      <input type="number" name="dollars" placeholder="20" min="1" value="${escapeHtml(kid.dollarRewardValue)}" required />
                                                    </span>
                                                  </label>
                                                </div>
                                                <div class="button-row">
                                                  <button class="action-button primary" type="submit">Save dollar rate</button>
                                                </div>
                                              </form>
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "add-child"
                                          ? `
                                            <section class="settings-mini-section avatar-section family-controls-page">
                                              <p class="eyebrow">Add child</p>
                                              <form class="reward-form" id="add-child-form">
                                                <input type="text" name="childName" placeholder="Child name" required />
                                                <input type="password" name="childPin" placeholder="4-digit child PIN" inputmode="numeric" pattern="\\d{4}" maxlength="4" required />
                                                <div>
                                                  <p class="eyebrow" style="margin-bottom:8px;">Pick a colour</p>
                                                  <div class="colour-swatch-row" id="add-child-colour-row">
                                                    ${KID_COLOUR_PALETTE.map((col, i) => `<button type="button" class="colour-swatch ${i === 0 ? "colour-swatch--selected" : ""}" style="background:${col.accent};" data-new-child-colour-accent="${col.accent}" data-new-child-colour-deep="${col.deep}" aria-label="Colour ${i+1}"></button>`).join("")}
                                                  </div>
                                                  <input type="hidden" name="childColourAccent" value="${KID_COLOUR_PALETTE[0].accent}" />
                                                  <input type="hidden" name="childColourDeep" value="${KID_COLOUR_PALETTE[0].deep}" />
                                                </div>
                                                <div class="button-row">
                                                  <button class="action-button primary" type="submit">Add child</button>
                                                </div>
                                              </form>
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "celebration-threshold"
                                          ? `
                                            <section class="settings-mini-section threshold-section family-controls-page">
                                              <p class="eyebrow">Celebration threshold</p>
                                              <form class="reward-form threshold-form" id="threshold-form">
                                                <div class="reward-assignment-block">
                                                  <p class="assign-summary">Assign to</p>
                                                  <div class="assign-grid reward-assign-grid">
                                                    ${getFamilyKids()
                                                      .map(
                                                        (child) => `
                                                          <label class="assign-option">
                                                            <input type="checkbox" name="thresholdAssignedKids" value="${escapeHtml(child.id)}" ${currentThresholdAssignedKids.includes(child.id) ? "checked" : ""} />
                                                            <span>${escapeHtml(child.name)}</span>
                                                          </label>
                                                        `
                                                      )
                                                      .join("")}
                                                  </div>
                                                </div>
                                                <input type="number" name="threshold" placeholder="Points target" min="1" value="${escapeHtml(kid.celebrationThreshold)}" required />
                                                <div class="button-row">
                                                  <button class="action-button primary threshold-submit-button" type="submit" ${currentThresholdAssignedKids.length ? "" : "disabled"}>Save threshold</button>
                                                </div>
                                              </form>
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "manage-rewards"
                                          ? `
                                            <section class="settings-mini-section family-controls-page">
                                              <p class="eyebrow">Manage rewards</p>
                                              ${getFamilyKids().some(c => c.rewards && c.rewards.length) ? `
                                                ${getFamilyKids().filter(c => c.rewards && c.rewards.length).map(child => `
                                                  <p class="eyebrow" style="margin-top:12px;font-size:0.68rem;">${escapeHtml(child.name)}</p>
                                                  ${child.rewards.map(reward => `
                                                    <div class="template-row">
                                                      <div class="template-row-info">
                                                        <span class="template-row-title">${escapeHtml(reward.title)}</span>
                                                        <span class="template-row-meta">${escapeHtml(reward.cost)} pts</span>
                                                      </div>
                                                      <div class="template-row-actions">
                                                        <button class="action-button secondary small-action-button" type="button" data-edit-reward="${escapeHtml(reward.id)}" data-reward-kid="${escapeHtml(child.id)}">Edit</button>
                                                        <button class="action-button danger small-action-button" type="button" data-delete-reward="${escapeHtml(reward.id)}" data-reward-kid="${escapeHtml(child.id)}">Delete</button>
                                                      </div>
                                                    </div>
                                                  `).join("")}
                                                `).join("")}
                                              ` : `<p class="empty">No rewards added yet.</p>`}
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "kid-colours"
                                          ? `
                                            <section class="settings-mini-section family-controls-page">
                                              <p class="eyebrow">Edit kid colours</p>
                                              ${getFamilyKids().map(child => `
                                                <p class="eyebrow" style="margin-top:14px;font-size:0.68rem;">${escapeHtml(child.name)}</p>
                                                <div class="colour-swatch-row">
                                                  ${KID_COLOUR_PALETTE.map((col, i) => `
                                                    <button type="button" class="colour-swatch ${child.accentColour === col.accent ? "colour-swatch--selected" : ""}"
                                                      style="background:${col.accent};"
                                                      data-colour-kid="${escapeHtml(child.id)}"
                                                      data-colour-accent="${col.accent}"
                                                      data-colour-deep="${col.deep}"
                                                      aria-label="Colour ${i+1}"></button>
                                                  `).join("")}
                                                </div>
                                              `).join("")}
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "delete-kid"
                                          ? `
                                            <section class="settings-mini-section family-controls-page">
                                              <p class="eyebrow">Remove child</p>
                                              <p style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;">Permanently deletes all their tasks, points, and rewards.</p>
                                              ${getFamilyKids().length ? getFamilyKids().map(child => `
                                                <div class="template-row">
                                                  <div class="template-row-info">
                                                    <span class="template-row-title">${escapeHtml(child.name)}</span>
                                                    <span class="template-row-meta">${escapeHtml(child.points)} points</span>
                                                  </div>
                                                  <button class="action-button danger small-action-button" type="button" data-delete-kid="${escapeHtml(child.id)}">Remove</button>
                                                </div>
                                              `).join("") : `<p class="empty">No children added yet.</p>`}
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "delete-family"
                                          ? `
                                            <section class="settings-mini-section threshold-section family-controls-page">
                                              <p class="eyebrow">Delete family</p>
                                              <div class="button-row">
                                                <button class="action-button danger" type="button" data-delete-family="true">Delete this family</button>
                                              </div>
                                            </section>
                                          `
                                          : ""
                                      }
                                    </div>
                                  </div>
                                `
                            }
                          </article>
                        `
                        : ""
                    }

                    ${
                      currentSettingsSection === "bonus-penalty"
                        ? `
                          <article class="reward-card settings-tile bonus-penalty-tile single-settings-tile">
                            ${renderTileBubbles()}
                            <div class="bonus-penalty-header">
                              <p class="eyebrow">Bonus & Penalty</p>
                            </div>
                            ${renderAssignedKidsBlock()}
                            <div class="bonus-penalty-body">
                              <div class="bonus-penalty-section bonus-section">
                                <p class="eyebrow">Bonus</p>
                                <form class="reward-form bonus-penalty-save-form" data-adjustment-type="bonus">
                                  <div class="bonus-penalty-form-row">
                                    <input type="text" name="reason" placeholder="Reason" required />
                                    <input type="number" name="value" placeholder="Points" min="1" required />
                                    <button class="action-button primary" type="submit">Save</button>
                                  </div>
                                </form>
                              </div>
                              <div class="bonus-penalty-section penalty-section">
                                <p class="eyebrow">Penalty</p>
                                <form class="reward-form bonus-penalty-save-form" data-adjustment-type="penalty">
                                  <div class="bonus-penalty-form-row">
                                    <input type="text" name="reason" placeholder="Reason" required />
                                    <input type="number" name="value" placeholder="Points" min="1" required />
                                    <button class="action-button primary" type="submit">Save</button>
                                  </div>
                                </form>
                              </div>
                            </div>
                          </article>
                        `
                        : ""
                    }
                  </div>
                </div>
              `
          }
        </article>
      </section>
    </div>
  `;

  const backHome = document.getElementById("back-home");
  backHome?.addEventListener("click", () => {
    if (isKidSession()) {
      logout();
      return;
    }

    currentKidId = null;
    currentFamilyMode = false;
    currentKidView = "dashboard";
    renderApp();
  });

  showPage("page-kid");
  updateTaskSchedulePreview(document.querySelector("#task-form"));
  tpUpdate();
}

function renderApp() {
  const family = getCurrentFamily();

  if (!state.session || !family) {
    state.session = null;
    renderAuthHome();
    return;
  }

  refreshAllTasksForToday();

  if (isParentSession()) {
    if (!currentKidId && !currentFamilyMode) {
      renderParentHome();
      return;
    }

    if (!currentKidId && getFamilyKids()[0]) {
      currentKidId = getFamilyKids()[0].id;
    }

    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  if (isKidSession()) {
    currentFamilyMode = false;
    currentKidView = ["dashboard", "rewards", "favors"].includes(currentKidView) ? currentKidView : "dashboard";
    renderKidPage(state.session.kidId);
  }
}

function triggerPointsBurst(pointsCard) {
  pointsCard.classList.remove("is-bursting");
  void pointsCard.offsetWidth;
  pointsCard.classList.add("is-bursting");
  window.setTimeout(() => pointsCard.classList.remove("is-bursting"), 900);
}

function buildModalBubbles() {
  return '<span style="position:absolute;width:40px;height:40px;border-radius:50%;top:-12px;right:24px;background:linear-gradient(145deg,var(--kid-accent),var(--kid-accent-deep));opacity:0.55;animation:bubble-bounce 3s ease-in-out infinite;pointer-events:none;"></span><span style="position:absolute;width:22px;height:22px;border-radius:50%;bottom:18px;left:14px;background:linear-gradient(145deg,#ffd77a,#b99cff);opacity:0.45;animation:bubble-bounce 3.4s ease-in-out 0.8s infinite;pointer-events:none;"></span>';
}

function showAppConfirm(eyebrow, title, body, confirmLabel, isDanger) {
  if (confirmLabel === undefined) confirmLabel = "Confirm";
  if (isDanger === undefined) isDanger = false;
  return new Promise(function(resolve) {
    const modal = document.createElement("div");
    modal.className = "pin-modal";
    modal.innerHTML = '<div class="pin-card" style="text-align:left;max-width:380px;">' + buildModalBubbles() + '<p class="eyebrow" style="position:relative;z-index:2;">' + escapeHtml(eyebrow) + '</p><h2 style="font-size:1.5rem;margin:0 0 8px;position:relative;z-index:2;">' + escapeHtml(title) + '</h2><p style="font-size:0.88rem;color:rgba(46,44,58,0.76);margin:0 0 20px;line-height:1.5;position:relative;z-index:2;">' + escapeHtml(body) + '</p><div class="button-row pin-actions" style="justify-content:flex-end;position:relative;z-index:2;"><button class="action-button secondary" type="button" data-modal-cancel="true">Cancel</button><button class="action-button ' + (isDanger ? "danger" : "primary") + '" type="button" data-modal-confirm="true">' + escapeHtml(confirmLabel) + '</button></div></div>';
    document.body.appendChild(modal);
    const cleanup = function(val) { modal.classList.add("is-closing"); setTimeout(function() { modal.remove(); }, 200); resolve(val); };
    modal.querySelector("[data-modal-confirm]").onclick = function() { cleanup(true); };
    modal.querySelector("[data-modal-cancel]").onclick = function() { cleanup(false); };
    modal.addEventListener("click", function(e) { if (e.target === modal) cleanup(false); });
  });
}

function showAppEdit(eyebrow, title, fields, confirmLabel) {
  if (confirmLabel === undefined) confirmLabel = "Save";
  return new Promise(function(resolve) {
    const modal = document.createElement("div");
    modal.className = "pin-modal";
    const fieldsHtml = fields.map(function(f) {
      return '<div style="margin-bottom:12px;position:relative;z-index:2;"><p class="eyebrow" style="margin-bottom:4px;">' + escapeHtml(f.label) + '</p><input class="pin-input" style="font-size:1rem;letter-spacing:0;text-align:left;min-height:48px;" type="' + (f.type || "text") + '" name="' + f.name + '" value="' + escapeHtml(String(f.value || "")) + '" placeholder="' + escapeHtml(f.placeholder || "") + '" ' + (f.min !== undefined ? 'min="' + f.min + '"' : "") + ' /></div>';
    }).join("");
    modal.innerHTML = '<div class="pin-card" style="text-align:left;max-width:380px;">' + buildModalBubbles() + '<p class="eyebrow" style="position:relative;z-index:2;">' + escapeHtml(eyebrow) + '</p><h2 style="font-size:1.5rem;margin:0 0 16px;position:relative;z-index:2;">' + escapeHtml(title) + '</h2><form id="app-edit-form">' + fieldsHtml + '<div class="button-row pin-actions" style="justify-content:flex-end;position:relative;z-index:2;margin-top:8px;"><button class="action-button secondary" type="button" data-modal-cancel="true">Cancel</button><button class="action-button primary" type="submit">' + escapeHtml(confirmLabel) + '</button></div></form></div>';
    document.body.appendChild(modal);
    const cleanup = function(val) { modal.classList.add("is-closing"); setTimeout(function() { modal.remove(); }, 200); resolve(val); };
    modal.querySelector("[data-modal-cancel]").onclick = function() { cleanup(null); };
    modal.querySelector("#app-edit-form").onsubmit = function(e) { e.preventDefault(); const data = {}; fields.forEach(function(f) { data[f.name] = modal.querySelector('[name="' + f.name + '"]').value; }); cleanup(data); };
    modal.addEventListener("click", function(e) { if (e.target === modal) cleanup(null); });
    setTimeout(function() { modal.querySelector("input") && modal.querySelector("input").focus(); }, 50);
  });
}

document.body.addEventListener("click", async (event) => {
  // ── TIME PICKER ─────────────────────────────────────────────
  const tpHourBtn = event.target.closest("[data-tp-hour]");
  if (tpHourBtn) {
    const dir = Number(tpHourBtn.dataset.tpHour);
    tpHour = ((tpHour - 1 + dir + 12) % 12) + 1;
    tpUpdate(); return;
  }
  const tpMinBtn = event.target.closest("[data-tp-min]");
  if (tpMinBtn) {
    const dir = Number(tpMinBtn.dataset.tpMin);
    tpMin = (tpMin + dir * 15 + 60) % 60;
    tpUpdate(); return;
  }
  const tpAmPmBtn = event.target.closest("[data-tp-ampm]");
  if (tpAmPmBtn) {
    tpAmPm = tpAmPmBtn.dataset.tpAmpm;
    tpUpdate(); return;
  }

  const authButton = event.target.closest("[data-auth-view]");
  if (authButton && !state.session) {
    const nextView = authButton.dataset.authView || "create";
    if (nextView === "back-intro") {
      authView = "";
      aboutTopic = "";
      authResetPasscodeOpen = false;
      createAccountStep = 1;
      createAccountKidCompleteMode = false;
      renderAuthHome();
      return;
    }

    authView = nextView;
    if (authView !== "about") {
      aboutTopic = "";
    }
    if (authView !== "create") {
      createAccountKidCompleteMode = false;
    }
    if (authView !== "returning") {
      authResetPasscodeOpen = false;
    }
    renderAuthHome();
    return;
  }

  const aboutTopicButton = event.target.closest("[data-about-topic]");
  if (aboutTopicButton && !state.session) {
    updateAboutTopicDisplay(aboutTopicButton.dataset.aboutTopic || "");
    return;
  }

  const authStageButton = event.target.closest("[data-auth-stage]");
  if (authStageButton && !state.session) {
    authStage = authStageButton.dataset.authStage || "intro";
    authView = authStage === "login" ? "parent" : "";
    authResetPasscodeOpen = false;
    renderAuthHome();
    return;
  }

  const resetPasscodeToggle = event.target.closest("[data-reset-passcode-toggle]");
  if (resetPasscodeToggle && !state.session) {
    authResetPasscodeOpen = !authResetPasscodeOpen;
    renderAuthHome();
    return;
  }

  const createNextButton = event.target.closest("[data-create-next]");
  if (createNextButton && !state.session) {
    const currentField = getCurrentCreateField();
    if (!currentField) return;
    const currentValue = createAccountDraft[currentField.name] || "";
    if (!isValidCreateFieldValue(currentField, currentValue)) {
      if (/^kidPin\d+$/.test(currentField.name)) {
        showToast("Kid password must be exactly 4 digits before you can continue.");
      }
      return;
    }
    createAccountStep = Math.min(createAccountStep + 1, CREATE_ACCOUNT_FIELDS.length);
    createAccountKidCompleteMode = false;
    renderAuthHome();
    const nextField = document.querySelector(`#create-family-form input[name="${CREATE_ACCOUNT_FIELDS[Math.min(createAccountStep - 1, CREATE_ACCOUNT_FIELDS.length - 1)].name}"]`);
    nextField?.focus();
    return;
  }

  const createCompleteButton = event.target.closest("[data-create-complete]");
  if (createCompleteButton && !state.session) {
    const currentField = getCurrentCreateField();
    if (!isKidPinCreateStep(currentField)) return;
    const currentValue = createAccountDraft[currentField.name] || "";
    if (!isValidCreateFieldValue(currentField, currentValue)) {
      showToast("Kid password must be exactly 4 digits before you can continue.");
      return;
    }
    createAccountKidCompleteMode = true;
    renderAuthHome();
    return;
  }

  const createSubmitButton = event.target.closest("[data-create-submit]");
  if (createSubmitButton && !state.session) {
    void handleCreateFamilyAccount();
    return;
  }

  const addChildStepButton = event.target.closest("[data-add-child]");
  if (addChildStepButton && !state.session) {
    const currentField = getCurrentCreateField();
    const currentKidNumber = getKidNumberFromFieldName(currentField?.name || "");
    if (!currentKidNumber || currentKidNumber >= MAX_CREATE_KIDS) return;
    const nextStep = BASE_CREATE_FIELDS.length + (currentKidNumber * 2) + 1;
    createAccountStep = nextStep;
    createAccountKidCompleteMode = false;
    renderAuthHome();
    const nextField = document.querySelector(`#create-family-form input[name="${CREATE_ACCOUNT_FIELDS[nextStep - 1].name}"]`);
    nextField?.focus();
    return;
  }

  const logoutButton = event.target.closest("[data-logout]");
  if (logoutButton) {
    logout();
    return;
  }

  const pointsCard = event.target.closest("[data-points-card]");
  if (pointsCard) {
    triggerPointsBurst(pointsCard);
    return;
  }

  const resetTasksButton = event.target.closest("[data-reset-tasks]");
  if (resetTasksButton && isParentSession()) {
    const confirmed = await showAppConfirm("Reset all tasks", "Are you sure?", "This permanently deletes all task templates and clears today\u2019s tasks for every child. Points are not affected.", "Reset tasks", true);
    if (!confirmed) return;
    resetAllTasks(); saveState(); renderKidPage(currentKidId); showToast("All tasks reset."); return;
  }

  const resetPointsButton = event.target.closest("[data-reset-points]");
  if (resetPointsButton && isParentSession()) {
    const confirmed = await showAppConfirm("Reset all points", "Are you sure?", "This sets every child\u2019s points to zero and clears their points history. Tasks are not affected.", "Reset points", true);
    if (!confirmed) return;
    resetAllPoints(); saveState(); renderKidPage(currentKidId); showToast("All points reset."); return;
  }

  const deleteFamilyButton = event.target.closest("[data-delete-family]");
  if (deleteFamilyButton && isParentSession()) {
    const confirmed = await showAppConfirm("Delete family", "Are you sure?", "This permanently deletes your family, all kids, tasks, points, and rewards from this device. This cannot be undone.", "Delete forever", true);
    if (!confirmed) return;
    const deleted = deleteCurrentFamilyFromDevice();
    if (!deleted) return;
    showToast("Family deleted from this device.");
    renderApp();
    return;
  }

  const editTaskBtn = event.target.closest("[data-edit-task-template]");
  if (editTaskBtn && isParentSession() && currentKidId) {
    const templateId = editTaskBtn.dataset.editTaskTemplate;
    const kid = getKid(currentKidId);
    const tmpl = kid?.taskTemplates.find(t => t.id === templateId);
    if (!tmpl) return;
    const data = await showAppEdit("Edit task", tmpl.title, [
      { name: "title", label: "Title", value: tmpl.title, placeholder: "Task title" },
      { name: "points", label: "Points", value: tmpl.points, type: "number", min: 1 },
      { name: "time", label: "Time", value: tmpl.time, placeholder: "e.g. 8:00 AM" },
    ]);
    if (!data) return;
    editTask(currentKidId, templateId, data.title, data.points, data.time);
    saveState(); renderKidPage(currentKidId); showToast("Task updated."); return;
  }

  const deleteTaskBtn = event.target.closest("[data-delete-task-template]");
  if (deleteTaskBtn && isParentSession() && currentKidId) {
    const templateId = deleteTaskBtn.dataset.deleteTaskTemplate;
    const kid = getKid(currentKidId);
    const tmpl = kid?.taskTemplates.find(t => t.id === templateId);
    if (!tmpl) return;
    const confirmed = await showAppConfirm("Delete task", tmpl.title, "This removes the task and today\u2019s instance. This cannot be undone.", "Delete", true);
    if (!confirmed) return;
    deleteTask(currentKidId, templateId); saveState(); renderKidPage(currentKidId); showToast("Task deleted."); return;
  }

  const editRewardBtn = event.target.closest("[data-edit-reward]");
  if (editRewardBtn && isParentSession()) {
    const rewardId = editRewardBtn.dataset.editReward;
    const kidId = editRewardBtn.dataset.rewardKid;
    const kid = getKid(kidId);
    const reward = kid?.rewards.find(r => r.id === rewardId);
    if (!reward) return;
    const data = await showAppEdit("Edit reward", reward.title, [
      { name: "title", label: "Title", value: reward.title, placeholder: "Reward title" },
      { name: "cost", label: "Points cost", value: reward.cost, type: "number", min: 1 },
    ]);
    if (!data) return;
    editReward(kidId, rewardId, data.title, data.cost);
    saveState(); renderKidPage(currentKidId || getFamilyKids()[0]?.id); showToast("Reward updated."); return;
  }

  const deleteRewardBtn = event.target.closest("[data-delete-reward]");
  if (deleteRewardBtn && isParentSession()) {
    const rewardId = deleteRewardBtn.dataset.deleteReward;
    const kidId = deleteRewardBtn.dataset.rewardKid;
    const kid = getKid(kidId);
    const reward = kid?.rewards.find(r => r.id === rewardId);
    if (!reward) return;
    const confirmed = await showAppConfirm("Delete reward", reward.title, "This reward will be removed permanently.", "Delete", true);
    if (!confirmed) return;
    deleteReward(kidId, rewardId); saveState(); renderKidPage(currentKidId || getFamilyKids()[0]?.id); showToast("Reward deleted."); return;
  }

  const deleteKidButton = event.target.closest("[data-delete-kid]");
  if (deleteKidButton && isParentSession()) {
    const kidId = deleteKidButton.dataset.deleteKid;
    const kid = getKid(kidId);
    if (!kid) return;
    const confirmed = await showAppConfirm("Remove child", "Remove " + kid.name + "?", "This permanently deletes all of " + kid.name + "\u2019s tasks, points, rewards, and history.", "Remove", true);
    if (!confirmed) return;
    const kidName = deleteKid(kidId);
    if (currentKidId === kidId) { currentKidId = getFamilyKids()[0]?.id || null; }
    saveState(); showToast(kidName + " has been removed."); renderKidPage(currentKidId || getFamilyKids()[0]?.id); return;
  }

  const colourSwatch = event.target.closest("[data-colour-kid]");
  if (colourSwatch && isParentSession()) {
    updateKidColour(colourSwatch.dataset.colourKid, colourSwatch.dataset.colourAccent, colourSwatch.dataset.colourDeep);
    saveState(); renderKidPage(currentKidId || getFamilyKids()[0]?.id); return;
  }

  const newChildSwatch = event.target.closest("[data-new-child-colour-accent]");
  if (newChildSwatch) {
    const accent = newChildSwatch.dataset.newChildColourAccent;
    const deep = newChildSwatch.dataset.newChildColourDeep;
    const form = newChildSwatch.closest("form");
    if (form) { form.querySelector("[name=childColourAccent]").value = accent; form.querySelector("[name=childColourDeep]").value = deep; }
    document.querySelectorAll("[data-new-child-colour-accent]").forEach(s => { s.classList.toggle("colour-swatch--selected", s.dataset.newChildColourAccent === accent); });
    return;
  }

  const createKidColourSwatch = event.target.closest("[data-create-kid-colour]");
  if (createKidColourSwatch && !state.session) {
    const kidNumber = Number(createKidColourSwatch.dataset.createKidColour);
    const colourIndex = Number(createKidColourSwatch.dataset.createColourIndex);
    createAccountDraft["kidColour" + kidNumber] = colourIndex;
    document.querySelectorAll("[data-create-kid-colour=\"" + kidNumber + "\"]").forEach(s => { s.classList.toggle("colour-swatch--selected", Number(s.dataset.createColourIndex) === colourIndex); });
    return;
  }

  const taskMoveButton = event.target.closest("[data-task-move]");
  if (taskMoveButton && currentKidId) {
    const toStatus = taskMoveButton.dataset.toStatus;
    if (toStatus === "completed" && !isParentSession()) return;
    if (taskMoveButton.dataset.fromStatus === "completed" && !isParentSession()) return;

    moveTask(
      currentKidId,
      taskMoveButton.dataset.fromStatus,
      toStatus,
      Number(taskMoveButton.dataset.taskIndex)
    );
    saveState({ kidId: currentKidId });
    renderKidPage(currentKidId);
    return;
  }

  const claimRewardButton = event.target.closest("[data-claim-reward]");
  if (claimRewardButton && currentKidId) {
    const result = claimReward(currentKidId, claimRewardButton.dataset.claimReward);
    if (!result?.ok) {
      if (result?.reason === "not-enough-points") {
        const pointLabel = result.missingPoints === 1 ? "point" : "points";
        showToast(`${result.kidName} needs ${result.missingPoints} more ${pointLabel} to claim ${result.rewardTitle}.`);
      } else {
        showToast("That favor could not be claimed.");
      }
      renderKidPage(currentKidId);
      return;
    }
    showToast(`${result.kidName} successfully claimed ${result.rewardTitle}.`);
    saveState({ kidId: currentKidId });
    renderKidPage(currentKidId);
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton && currentKidId) {
    const view = viewButton.dataset.view;
    if (!view) return;
    if (isKidSession() && (view === "report" || view === "settings")) return;

    currentKidView = view;
    currentSettingsSection = view === "settings" ? "" : currentSettingsSection;
    currentFamilyControlsSection = view === "settings" ? "" : currentFamilyControlsSection;
    currentFamilyMode = view === "report" || view === "settings";
    renderKidPage(currentKidId);
    return;
  }

  const familyButton = event.target.closest("[data-family-view]");
  if (familyButton && isParentSession()) {
    const firstKid = getFamilyKids()[0];
    if (!firstKid) return;
    currentKidId = firstKid.id;
    currentFamilyMode = true;
    currentKidView = familyButton.dataset.familyView;
    currentSettingsSection = familyButton.dataset.familyView === "settings" ? "" : currentSettingsSection;
    currentFamilyControlsSection = familyButton.dataset.familyView === "settings" ? "" : currentFamilyControlsSection;
    currentAssignedKids = [];
    currentRewardAssignedKids = [];
    currentThresholdAssignedKids = [];
    renderKidPage(firstKid.id);
    return;
  }

  const settingsSwitchButton = event.target.closest("[data-settings-view]");
  if (settingsSwitchButton && currentKidView === "settings" && isParentSession()) {
    currentSettingsSection = settingsSwitchButton.dataset.settingsView || "";
    currentFamilyControlsSection = "";
    currentAssignedKids = [];
    currentRewardAssignedKids = [];
    currentThresholdAssignedKids = [];
    renderKidPage(currentKidId);
    return;
  }

  const familyControlsSwitchButton = event.target.closest("[data-family-controls-view]");
  if (familyControlsSwitchButton && currentKidView === "settings" && currentSettingsSection === "family-controls" && isParentSession()) {
    currentFamilyControlsSection = familyControlsSwitchButton.dataset.familyControlsView || "";
    if (currentFamilyControlsSection === "add-rewards") currentRewardAssignedKids = [];
    if (currentFamilyControlsSection === "celebration-threshold") currentThresholdAssignedKids = [];
    renderKidPage(currentKidId);
    return;
  }

  const familyControlsBackButton = event.target.closest("[data-family-controls-back]");
  if (familyControlsBackButton && currentKidView === "settings" && currentSettingsSection === "family-controls" && isParentSession()) {
    currentFamilyControlsSection = "";
    renderKidPage(currentKidId);
    return;
  }

  const kidCard = event.target.closest("[data-kid-id]");
  if (kidCard && isParentSession()) {
    currentKidId = kidCard.dataset.kidId;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];
    currentRewardAssignedKids = [];
    currentThresholdAssignedKids = [];
    renderKidPage(currentKidId);
  }
});

document.body.addEventListener("keydown", (event) => {
  const pointsCard = event.target.closest?.("[data-points-card]");
  if (pointsCard && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    triggerPointsBurst(pointsCard);
    return;
  }

  const kidCard = event.target.closest?.("[data-kid-id]");
  if (kidCard && isParentSession() && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    currentKidId = kidCard.dataset.kidId;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];
    currentRewardAssignedKids = [];
    currentThresholdAssignedKids = [];
    renderKidPage(currentKidId);
  }
});

document.body.addEventListener("change", (event) => {
  const assignedCheckbox = event.target.closest?.('input[name="assignedKids"]');
  if (assignedCheckbox) {
    currentAssignedKids = Array.from(document.querySelectorAll('input[name="assignedKids"]:checked')).map((input) => input.value);
    return;
  }

  const rewardCheckbox = event.target.closest?.('input[name="rewardAssignedKids"]');
  if (rewardCheckbox) {
    const checked = Array.from(document.querySelectorAll('input[name="rewardAssignedKids"]:checked')).map((input) => input.value);
    currentRewardAssignedKids = checked;

    const rewardSubmitButton = document.querySelector(".reward-submit-button");
    if (rewardSubmitButton) {
      rewardSubmitButton.disabled = checked.length === 0;
    }
    return;
  }

  const thresholdCheckbox = event.target.closest?.('input[name="thresholdAssignedKids"]');
  if (thresholdCheckbox) {
    const checked = Array.from(document.querySelectorAll('input[name="thresholdAssignedKids"]:checked')).map((input) => input.value);
    currentThresholdAssignedKids = checked;

    const thresholdSubmitButton = document.querySelector(".threshold-submit-button");
    if (thresholdSubmitButton) {
      thresholdSubmitButton.disabled = checked.length === 0;
    }
  }
});

document.body.addEventListener("mouseover", (event) => {
  const aboutTopicButton = event.target.closest?.("[data-about-topic]");
  if (!aboutTopicButton || state.session) return;

  const nextTopic = aboutTopicButton.dataset.aboutTopic || "";
  if (aboutTopic === nextTopic) return;
  updateAboutTopicDisplay(nextTopic);
});

document.body.addEventListener("focusin", (event) => {
  const aboutTopicButton = event.target.closest?.("[data-about-topic]");
  if (!aboutTopicButton || state.session) return;

  const nextTopic = aboutTopicButton.dataset.aboutTopic || "";
  if (aboutTopic === nextTopic) return;
  updateAboutTopicDisplay(nextTopic);
});

document.body.addEventListener("input", (event) => {
  const createFormField = event.target.closest?.("#create-family-form input");
  if (!createFormField || state.session) return;

  const { name, value } = createFormField;
  if (!Object.prototype.hasOwnProperty.call(createAccountDraft, name)) return;

  createAccountDraft[name] = value;
  if (/^kidPin\d+$/.test(name)) {
    createAccountKidCompleteMode = false;
  }

  const currentField = getCurrentCreateField();
  const canAdvance = currentField ? isValidCreateFieldValue(currentField, createAccountDraft[currentField.name]) : false;
  document.querySelectorAll("[data-create-next], [data-create-complete], [data-add-child], #create-family-form button[type='submit']").forEach((button) => {
    button.disabled = !canAdvance;
  });

  if (currentField && currentField.name === name) {
    const guidanceNode = document.querySelector(".create-guidance-pill");
    if (guidanceNode) {
      guidanceNode.outerHTML = getCreateFieldGuidance(currentField, value);
    }
  }
});

document.body.addEventListener("keydown", (event) => {
  const createFormField = event.target.closest?.("#create-family-form input");
  if (!createFormField || state.session || event.key !== "Enter") return;

  event.preventDefault();

  const { name } = createFormField;
  const fieldIndex = CREATE_ACCOUNT_FIELDS.findIndex((field) => field.name === name);
  if (fieldIndex < 0) return;
  const field = CREATE_ACCOUNT_FIELDS[fieldIndex];
  if (!isValidCreateFieldValue(field, createAccountDraft[name])) return;

  if (fieldIndex + 1 >= createAccountStep && createAccountStep < CREATE_ACCOUNT_FIELDS.length) {
    createAccountStep = Math.min(createAccountStep + 1, CREATE_ACCOUNT_FIELDS.length);
    createAccountKidCompleteMode = false;
    renderAuthHome();
  }

  const nextField = document.querySelector(`#create-family-form input[name="${CREATE_ACCOUNT_FIELDS[Math.min(fieldIndex + 1, createAccountStep - 1, CREATE_ACCOUNT_FIELDS.length - 1)].name}"]`);
  nextField?.focus();
});

document.body.addEventListener("change", (event) => {
  const taskScheduleField = event.target.closest?.('#task-form input[name="recurring"], #task-form input[name="customDate"], #task-form input[name="time"]');
  if (taskScheduleField) {
    const taskForm = taskScheduleField.closest("#task-form");
    updateTaskSchedulePreview(taskForm);
  }

  const dollarSelect = event.target.closest?.('#dollar-form select[name="kidId"]');
  if (dollarSelect) {
    const dollarForm = dollarSelect.closest("#dollar-form");
    const pointsInput = dollarForm?.querySelector('input[name="points"]');
    const dollarsInput = dollarForm?.querySelector('input[name="dollars"]');
    const selectedKid = getKid(dollarSelect.value);
    if (selectedKid && pointsInput && dollarsInput) {
      pointsInput.value = selectedKid.pointsPerDollarReward;
      dollarsInput.value = selectedKid.dollarRewardValue;
    }
  }
});

document.body.addEventListener("input", (event) => {
  const taskScheduleField = event.target.closest?.('#task-form input[name="customDate"], #task-form input[name="time"]');
  if (!taskScheduleField) return;
  const taskForm = taskScheduleField.closest("#task-form");
  updateTaskSchedulePreview(taskForm);
});

document.body.addEventListener("submit", async (event) => {
  const createFamilyForm = event.target.closest("#create-family-form");
  if (createFamilyForm) {
    event.preventDefault();
    await handleCreateFamilyAccount();
    return;
  }

  const parentLoginForm = event.target.closest("#parent-login-form");
  if (parentLoginForm) {
    event.preventDefault();
    const formData = new FormData(parentLoginForm);
    const email = String(formData.get("parentEmail") || "").trim().toLowerCase();
    const pin = String(formData.get("parentPin") || "").trim();

    // Try cloud login first, fall back to local
    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        showToast("Signing in…");
        const cloudFamily = await cloudLogin(email, pin);
        if (cloudFamily) {
          upsertFamilyInState(cloudFamily);
          authStage = "login"; authView = "parent"; authAccountJustCreated = false;
          state.session = { familyId: cloudFamily.id, role: "parent" };
          currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
          saveState({ skipCloud: true });
          renderApp();
          return;
        }
      } catch (cloudErr) {
        console.warn("Cloud login failed, trying local:", cloudErr.message);
      }
    }
    // Local fallback
    const family = state.families.find((entry) => entry.parentEmailLower === email);
    if (!family) { showToast("Incorrect login."); return; }
    const pinOk = await verifyPin(pin, family.parentPin);
    if (!pinOk) { showToast("Incorrect login."); return; }
    if (family.parentPin && !/^[0-9a-f]{64}$/.test(family.parentPin)) {
      family.parentPin = await hashPin(pin);
      saveState({ skipCloud: true });
    }
    authStage = "login"; authView = "parent"; authAccountJustCreated = false;
    state.session = { familyId: family.id, role: "parent" };
    currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
    saveState({ skipCloud: true });
    renderApp();
    return;
  }

  const returningLoginForm = event.target.closest("#returning-login-form");
  if (returningLoginForm) {
    event.preventDefault();
    const formData = new FormData(returningLoginForm);
    const email = String(formData.get("username") || "").trim().toLowerCase();
    const pin = String(formData.get("password") || "").trim();

    // Try cloud login first, fall back to local
    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        showToast("Signing in…");
        const cloudFamily = await cloudLogin(email, pin);
        if (cloudFamily) {
          upsertFamilyInState(cloudFamily);
          authStage = "login"; authView = "parent"; authAccountJustCreated = false;
          state.session = { familyId: cloudFamily.id, role: "parent" };
          currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
          saveState({ skipCloud: true });
          renderApp();
          return;
        }
      } catch (cloudErr) {
        // Cloud failed - try local fallback
        console.warn("Cloud login failed, trying local:", cloudErr.message);
      }
    }
    // Local fallback
    const family = state.families.find((entry) => entry.parentEmailLower === email);
    if (!family) { showToast("Incorrect login."); return; }
    const pinOk = await verifyPin(pin, family.parentPin);
    if (!pinOk) { showToast("Incorrect login."); return; }
    if (family.parentPin && !/^[0-9a-f]{64}$/.test(family.parentPin)) { family.parentPin = await hashPin(pin); saveState({ skipCloud: true }); }
    authStage = "login"; authView = "parent"; authAccountJustCreated = false;
    state.session = { familyId: family.id, role: "parent" };
    currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
    saveState({ skipCloud: true }); renderApp(); return;
  }

  const resetPasscodeForm = event.target.closest("#reset-passcode-form");
  if (resetPasscodeForm) {
    event.preventDefault();
    const usernameInput = resetPasscodeForm.querySelector('input[name="username"]');
    const newPasswordInput = resetPasscodeForm.querySelector('input[name="newPassword"]');
    const email = String(usernameInput?.value || "").trim().toLowerCase();
    const newPassword = String(newPasswordInput?.value || "").trim();

    if (!email) {
      showToast("Enter your username first.");
      return;
    }

    if (!newPassword) {
      showToast("Enter a new passcode.");
      return;
    }

    const family = state.families.find((entry) => entry.parentEmailLower === email);
    if (!family) {
      showToast("No account was found for that username.");
      return;
    }

    family.parentPin = newPassword;
    saveState();
    authResetPasscodeOpen = false;
    renderAuthHome();
    showToast("Passcode updated.");
    return;
  }

  const kidLoginForm = event.target.closest("#kid-login-form");
  if (kidLoginForm) {
    event.preventDefault();
    const formData = new FormData(kidLoginForm);
    const email = String(formData.get("familyEmail") || "").trim().toLowerCase();
    const kidName = String(formData.get("kidName") || "").trim().toLowerCase();
    const kidPin = String(formData.get("kidPin") || "").trim();
    if (!isValidKidPin(kidPin)) {
      showToast("Kid PIN must be exactly 4 digits.");
      return;
    }
    const family = state.families.find((entry) => entry.parentEmailLower === email);
    const kidCandidate = family?.kids.find((entry) => entry.name.trim().toLowerCase() === kidName);
    const kidPinOk = kidCandidate ? await verifyPin(kidPin, kidCandidate.kidPin) : false;
    if (!family || !kidCandidate || !kidPinOk) { showToast("Incorrect kid login."); return; }
    if (kidCandidate.kidPin && !/^[0-9a-f]{64}$/.test(kidCandidate.kidPin)) { kidCandidate.kidPin = await hashPin(kidPin); saveState(); }
    const kid = kidCandidate;

    state.session = { familyId: family.id, role: "kid", kidId: kid.id };
    authStage = "login";
    authAccountJustCreated = false;
    currentKidId = kid.id;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [kid.id];
    saveState();
    renderApp();
    return;
  }

  if (!isParentSession()) return;

  const rewardForm = event.target.closest("#reward-form");
  if (rewardForm) {
    event.preventDefault();
    const formData = new FormData(rewardForm);
    const title = String(formData.get("title") || "").trim();
    const cost = Number(formData.get("cost"));
    const targetKids = formData.getAll("rewardAssignedKids").map((value) => String(value)).filter(Boolean);

    if (!title) { showFieldError(rewardForm, "Please enter a reward title."); return; }
    if (!Number.isFinite(cost) || cost < 1) { showFieldError(rewardForm, "Points cost must be at least 1."); return; }
    if (!targetKids.length) { showFieldError(rewardForm, "Select at least one child for this reward."); return; }
    addReward(targetKids, title, cost);
    currentRewardAssignedKids = [];
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    showToast("Successfully added rewards.");
    return;
  }

  const dollarForm = event.target.closest("#dollar-form");
  if (dollarForm) {
    event.preventDefault();
    const formData = new FormData(dollarForm);
    const kidId = String(formData.get("kidId") || "").trim();
    const points = Number(formData.get("points"));
    const dollars = Number(formData.get("dollars"));

    if (!kidId) return;
    if (!Number.isFinite(points) || points < 1) { showFieldError(dollarForm, "Points must be at least 1."); return; }
    if (!Number.isFinite(dollars) || dollars < 1) { showFieldError(dollarForm, "Dollar value must be at least 1."); return; }
    updateDollarConversion(kidId, points, dollars);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const addChildForm = event.target.closest("#add-child-form");
  if (addChildForm) {
    event.preventDefault();
    const formData = new FormData(addChildForm);
    const childName = String(formData.get("childName") || "").trim();
    const childPin = String(formData.get("childPin") || "").trim();
    const childColourAccent = String(formData.get("childColourAccent") || "").trim();
    const childColourDeep = String(formData.get("childColourDeep") || "").trim();
    if (!childName) { showFieldError(addChildForm, "Please enter the child's name."); return; }
    if (!childPin) { showFieldError(addChildForm, "Please enter a 4-digit PIN."); return; }
    if (!isValidKidPin(childPin)) { showFieldError(addChildForm, "PIN must be exactly 4 digits (numbers only)."); return; }
    addChild(childName, childPin, "", childColourAccent, childColourDeep);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    showToast("Child added.");
    return;
  }

  const thresholdForm = event.target.closest("#threshold-form");
  if (thresholdForm) {
    event.preventDefault();
    const formData = new FormData(thresholdForm);
    const threshold = Number(formData.get("threshold"));
    const thresholdKidIds = currentThresholdAssignedKids.length ? currentThresholdAssignedKids : [currentKidId].filter(Boolean);
    if (!thresholdKidIds.length) { showFieldError(thresholdForm, "Select at least one child."); return; }
    if (!Number.isFinite(threshold) || threshold < 1) { showFieldError(thresholdForm, "Points target must be at least 1."); return; }
    updateCelebrationThreshold(thresholdKidIds, threshold);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const taskForm = event.target.closest("#task-form");
  if (taskForm) {
    event.preventDefault();
    const formData = new FormData(taskForm);
    const title = String(formData.get("title") || "").trim();
    const points = Number(formData.get("points"));
    const recurring = String(formData.get("recurring") || "daily").trim().toLowerCase();
    const timeValue = String(formData.get("time") || "").trim();
    const customDate = String(formData.get("customDate") || "").trim();
    const assignedKids = currentAssignedKids.length ? currentAssignedKids : [currentKidId];

    if (!title) { showFieldError(taskForm, "Please enter a task title."); return; }
    if (!timeValue) { showFieldError(taskForm, "Please pick a time."); return; }
    if (!Number.isFinite(points) || points < 1) { showFieldError(taskForm, "Points must be at least 1."); return; }
    if (!assignedKids.length) { showFieldError(taskForm, "Select at least one child."); return; }
    if (recurring === "custom-date" && !customDate) {
      showToast("Choose the custom date for this task.");
      return;
    }

    const displayTime = formatTaskTimeValue(timeValue);

    addTask(assignedKids, title, points, recurring, displayTime, customDate);
    saveState();
    currentAssignedKids = [];
    tpReset();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const bonusPenaltySaveForm = event.target.closest(".bonus-penalty-save-form");
  if (bonusPenaltySaveForm) {
    event.preventDefault();
    const formData = new FormData(bonusPenaltySaveForm);
    const label = bonusPenaltySaveForm.dataset.adjustmentType || "bonus";
    const value = Number(formData.get("value"));
    const reason = String(formData.get("reason") || "").trim();
    const adjustmentKidIds = currentAssignedKids.length ? currentAssignedKids : [currentKidId];

    if (!adjustmentKidIds.length) { showFieldError(bonusPenaltySaveForm, "Select at least one child."); return; }
    if (!reason) { showFieldError(bonusPenaltySaveForm, "Please enter a reason."); return; }
    if (!Number.isFinite(value) || value < 1) { showFieldError(bonusPenaltySaveForm, "Points must be at least 1."); return; }
    addReason(adjustmentKidIds, label, reason);
    addAdjustment(adjustmentKidIds, label, label === "penalty" ? -Math.abs(value) : Math.abs(value), reason);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // Offline support is progressive.
    });
  });
}

renderApp();

(function initOfflineIndicator() {
  let banner = null;
  function showOfflineBanner() {
    if (banner) return;
    banner = document.createElement("div");
    banner.className = "offline-banner";
    banner.textContent = "You\u2019re offline \u2014 changes are saved on this device";
    document.body.appendChild(banner);
  }
  function hideOfflineBanner() {
    if (!banner) return;
    banner.classList.add("offline-banner--hide");
    setTimeout(function() { if (banner) { banner.remove(); banner = null; } }, 400);
  }
  if (!navigator.onLine) showOfflineBanner();
  window.addEventListener("offline", showOfflineBanner);
  window.addEventListener("online", function() { hideOfflineBanner(); showToast("Back online \u2713"); });
})();

// ============================================================
// CLOUD SYNC LAYER
// Supabase is source of truth. localStorage is cache.
// ============================================================

// ── WRITE QUEUE ───────────────────────────────────────────────
// Serialises all cloud writes so concurrent saves don't race
let _writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  _writeQueue = _writeQueue.then(fn).catch(function(err) {
    console.warn("Cloud write failed (will retry on next save):", err.message || err);
  });
  return _writeQueue;
}

// ── HELPERS ───────────────────────────────────────────────────
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function kidToRow(kid, familyId) {
  return {
    id: kid.id,
    family_id: familyId,
    name: kid.name,
    avatar: kid.avatar || "",
    accent_colour: kid.accentColour || "#6dafff",
    accent_colour_deep: kid.accentColourDeep || "#3f84db",
    kid_pin_hash: kid.kidPin || "",
    points: Number(kid.points) || 0,
    points_per_dollar_reward: Number(kid.pointsPerDollarReward) || 100,
    dollar_reward_value: Number(kid.dollarRewardValue) || 20,
    celebration_threshold: Number(kid.celebrationThreshold) || 100,
    last_celebrated_threshold: Number(kid.lastCelebratedThreshold) || 0,
    missed_days_in_a_row: Number(kid.missedDaysInARow) || 0,
    last_missed_check_date: kid.lastMissedCheckDate || null,
    last_task_refresh_date: kid.lastTaskRefreshDate || todayIso(),
  };
}

function rowToKid(row, taskRows, rewardRows, adjustmentRows, reasonRows, templateRows, historyRows) {
  var tasks = (taskRows || []).filter(function(t) { return t.kid_id === row.id; });
  var templates = (templateRows || []).filter(function(t) { return t.kid_id === row.id; });
  var rewards = (rewardRows || []).filter(function(r) { return r.kid_id === row.id; });
  var adjustments = (adjustmentRows || []).filter(function(a) { return a.kid_id === row.id; });
  var reasons = (reasonRows || []).filter(function(r) { return r.kid_id === row.id; });
  var history = (historyRows || []).filter(function(h) { return h.kid_id === row.id; });
  var today = getTodayDateKey();

  return normalizeKid({
    id: row.id,
    name: row.name,
    kidPin: row.kid_pin_hash || "",
    avatar: row.avatar || "",
    accentColour: row.accent_colour || "#6dafff",
    accentColourDeep: row.accent_colour_deep || "#3f84db",
    points: row.points || 0,
    pointsPerDollarReward: row.points_per_dollar_reward || 100,
    dollarRewardValue: row.dollar_reward_value || 20,
    celebrationThreshold: row.celebration_threshold || 100,
    lastCelebratedThreshold: row.last_celebrated_threshold || 0,
    missedDaysInARow: row.missed_days_in_a_row || 0,
    lastMissedCheckDate: row.last_missed_check_date || null,
    lastTaskRefreshDate: row.last_task_refresh_date || today,
    due: tasks.filter(function(t) { return t.status === "due" && t.instance_date === today; }).map(taskRowToInstance),
    awaiting: tasks.filter(function(t) { return t.status === "awaiting" && t.instance_date === today; }).map(taskRowToInstance),
    completed: tasks.filter(function(t) { return t.status === "completed" && t.instance_date === today; }).map(taskRowToInstance),
    taskTemplates: templates.map(templateRowToTemplate),
    rewards: rewards.map(function(r) { return { id: r.id, title: r.title, cost: r.cost }; }),
    bonusPenalty: buildBonusPenaltyFromAdjustments(adjustments),
    bonusReasons: reasons.filter(function(r) { return r.reason_type === "bonus"; }).map(function(r) { return r.reason; }),
    penaltyReasons: reasons.filter(function(r) { return r.reason_type === "penalty"; }).map(function(r) { return r.reason; }),
    pointsHistory: history.slice(-500).map(function(h) {
      return { id: h.id, changeType: h.change_type, pointsDelta: h.points_delta, pointsAfter: h.points_after, description: h.description, createdAt: h.created_at };
    }),
  });
}

function taskRowToInstance(row) {
  return {
    id: row.id,
    templateId: row.template_id || null,
    title: row.title,
    detail: row.detail || "",
    points: row.points || 0,
    recurring: row.recurring || "daily",
    time: row.time_label || "",
    customDate: row.custom_date || "",
    instanceDateKey: row.instance_date || getTodayDateKey(),
  };
}

function templateRowToTemplate(row) {
  return {
    id: row.id,
    title: row.title,
    points: row.points || 0,
    recurring: row.recurring || "daily",
    time: row.time_label || "",
    customDate: row.custom_date || "",
    startDateKey: row.start_date_key || getTodayDateKey(),
    isActive: row.is_active !== false,
  };
}

function buildBonusPenaltyFromAdjustments(adjustments) {
  var today = getTodayDateKey();
  var bonus = adjustments.filter(function(a) { return a.adjustment_type === "bonus" && a.date_key === today; }).pop();
  var penalty = adjustments.filter(function(a) { return a.adjustment_type === "penalty" && a.date_key === today; }).pop();
  return [
    { type: "bonus", title: bonus ? bonus.display_value : "+0 points", value: bonus ? bonus.display_value : "+0 points", reason: bonus ? (bonus.reason || "") : "", dateKey: bonus ? today : null, createdAt: bonus ? bonus.created_at : null },
    { type: "penalty", title: penalty ? penalty.display_value : "-0 points", value: penalty ? penalty.display_value : "-0 points", reason: penalty ? (penalty.reason || "") : "", dateKey: penalty ? today : null, createdAt: penalty ? penalty.created_at : null },
  ];
}

// ── PULL: fetch entire family from Supabase ───────────────────
async function pullFamilyFromCloud(familyId) {
  if (!supabaseClient) throw new Error("Supabase not configured");

  var [familyRes, kidsRes, settingsRes] = await Promise.all([
    supabaseClient.from("families").select("*").eq("id", familyId).single(),
    supabaseClient.from("kids").select("*").eq("family_id", familyId).order("created_at"),
    supabaseClient.from("family_settings").select("*").eq("family_id", familyId).maybeSingle(),
  ]);

  if (familyRes.error) throw familyRes.error;
  if (kidsRes.error) throw kidsRes.error;

  var kidIds = (kidsRes.data || []).map(function(k) { return k.id; });
  var taskRows = [], templateRows = [], rewardRows = [], adjustmentRows = [], reasonRows = [], historyRows = [], claimRows = [];

  if (kidIds.length) {
    var today = getTodayDateKey();
    var results = await Promise.all([
      supabaseClient.from("tasks").select("*").in("kid_id", kidIds).eq("instance_date", today),
      supabaseClient.from("task_templates").select("*").in("kid_id", kidIds).eq("is_active", true),
      supabaseClient.from("rewards").select("*").in("kid_id", kidIds),
      supabaseClient.from("adjustments").select("*").in("kid_id", kidIds).eq("date_key", today),
      supabaseClient.from("reason_lists").select("*").in("kid_id", kidIds),
      supabaseClient.from("points_history").select("*").in("kid_id", kidIds).order("created_at").limit(500),
    ]);
    taskRows       = results[0].data || [];
    templateRows   = results[1].data || [];
    rewardRows     = results[2].data || [];
    adjustmentRows = results[3].data || [];
    reasonRows     = results[4].data || [];
    historyRows    = results[5].data || [];
  }

  var claimsRes = await supabaseClient.from("favour_claims").select("*").eq("family_id", familyId).order("claimed_at", { ascending: false }).limit(20);
  claimRows = claimsRes.data || [];

  var family = normalizeFamily({
    id: familyRes.data.id,
    familyName: familyRes.data.family_name,
    parentName: (settingsRes.data && settingsRes.data.parent_name) || "Parent",
    parentEmail: state.families.find(function(f) { return f.id === familyId; })?.parentEmail || "",
    parentEmailLower: state.families.find(function(f) { return f.id === familyId; })?.parentEmailLower || "",
    parentPin: (settingsRes.data && settingsRes.data.parent_pin_hash) || "",
    createdAt: familyRes.data.created_at,
    kids: (kidsRes.data || []).map(function(row) {
      return rowToKid(row, taskRows, rewardRows, adjustmentRows, reasonRows, templateRows, historyRows);
    }),
    favorClaims: claimRows.map(function(c) {
      return { id: c.id, kidId: c.kid_id, kidName: c.kid_name, rewardId: c.reward_id, rewardTitle: c.reward_title, cost: c.cost, claimedAt: c.claimed_at };
    }),
  });

  return family;
}

// ── PUSH: write entire family state to Supabase ───────────────
async function pushFamilyToCloud(family) {
  if (!supabaseClient) return;

  // 1. Upsert family row
  await supabaseClient.from("families").upsert({ id: family.id, family_name: family.familyName });

  // 2. Upsert family settings (pin hash, parent name)
  await supabaseClient.from("family_settings").upsert({
    family_id: family.id,
    parent_pin_hash: family.parentPin || "",
    parent_name: family.parentName || "Parent",
  }, { onConflict: "family_id" });

  // 3. Upsert kids
  if (family.kids.length) {
    await supabaseClient.from("kids").upsert(
      family.kids.map(function(k) { return kidToRow(k, family.id); }),
      { onConflict: "id" }
    );
  }

  // 4. Delete kids removed locally
  var remoteKidsRes = await supabaseClient.from("kids").select("id").eq("family_id", family.id);
  var remoteIds = (remoteKidsRes.data || []).map(function(r) { return r.id; });
  var localIds = family.kids.map(function(k) { return k.id; });
  var toDelete = remoteIds.filter(function(id) { return !localIds.includes(id); });
  if (toDelete.length) {
    await supabaseClient.from("kids").delete().in("id", toDelete);
  }

  // 5. For each kid — upsert templates, today's tasks, rewards
  var today = getTodayDateKey();
  for (var i = 0; i < family.kids.length; i++) {
    var kid = family.kids[i];

    // Task templates
    if (kid.taskTemplates.length) {
      await supabaseClient.from("task_templates").upsert(
        kid.taskTemplates.map(function(t) {
          return { id: t.id, kid_id: kid.id, title: t.title, points: t.points, recurring: t.recurring, time_label: t.time, custom_date: t.customDate || null, start_date_key: t.startDateKey || today, is_active: true };
        }),
        { onConflict: "id" }
      );
    }

    // Delete removed templates
    var remoteTplRes = await supabaseClient.from("task_templates").select("id").eq("kid_id", kid.id);
    var remoteTplIds = (remoteTplRes.data || []).map(function(r) { return r.id; });
    var localTplIds  = kid.taskTemplates.map(function(t) { return t.id; });
    var tplToDelete  = remoteTplIds.filter(function(id) { return !localTplIds.includes(id); });
    if (tplToDelete.length) {
      await supabaseClient.from("task_templates").delete().in("id", tplToDelete);
    }

    // Today's task instances — delete and re-insert
    await supabaseClient.from("tasks").delete().eq("kid_id", kid.id).eq("instance_date", today);
    var allTasks = [
      ...kid.due.map(function(t) { return Object.assign({}, t, { status: "due" }); }),
      ...kid.awaiting.map(function(t) { return Object.assign({}, t, { status: "awaiting" }); }),
      ...kid.completed.map(function(t) { return Object.assign({}, t, { status: "completed" }); }),
    ];
    if (allTasks.length) {
      await supabaseClient.from("tasks").insert(
        allTasks.map(function(t) {
          return { id: t.id, kid_id: kid.id, template_id: t.templateId || null, title: t.title, detail: t.detail || "", points: t.points, recurring: t.recurring || "daily", time_label: t.time || "", custom_date: t.customDate || null, instance_date: today, status: t.status };
        })
      );
    }

    // Rewards
    if (kid.rewards.length) {
      await supabaseClient.from("rewards").upsert(
        kid.rewards.map(function(r) { return { id: r.id, kid_id: kid.id, title: r.title, cost: r.cost }; }),
        { onConflict: "id" }
      );
    }
    var remoteRewRes = await supabaseClient.from("rewards").select("id").eq("kid_id", kid.id);
    var remoteRewIds = (remoteRewRes.data || []).map(function(r) { return r.id; });
    var localRewIds  = kid.rewards.map(function(r) { return r.id; });
    var rewToDelete  = remoteRewIds.filter(function(id) { return !localRewIds.includes(id); });
    if (rewToDelete.length) {
      await supabaseClient.from("rewards").delete().in("id", rewToDelete);
    }
  }
}

// ── PUSH SINGLE KID: fast path for task moves & points ────────
async function pushKidToCloud(familyId, kid) {
  if (!supabaseClient) return;
  var today = getTodayDateKey();

  // Update kid row
  await supabaseClient.from("kids").upsert(kidToRow(kid, familyId), { onConflict: "id" });

  // Replace today's tasks
  await supabaseClient.from("tasks").delete().eq("kid_id", kid.id).eq("instance_date", today);
  var allTasks = [
    ...kid.due.map(function(t) { return Object.assign({}, t, { status: "due" }); }),
    ...kid.awaiting.map(function(t) { return Object.assign({}, t, { status: "awaiting" }); }),
    ...kid.completed.map(function(t) { return Object.assign({}, t, { status: "completed" }); }),
  ];
  if (allTasks.length) {
    await supabaseClient.from("tasks").insert(
      allTasks.map(function(t) {
        return { id: t.id, kid_id: kid.id, template_id: t.templateId || null, title: t.title, detail: t.detail || "", points: t.points, recurring: t.recurring || "daily", time_label: t.time || "", custom_date: t.customDate || null, instance_date: today, status: t.status };
      })
    );
  }

  // Append any new points history entries (just insert, don't delete old)
  var recentHistory = (kid.pointsHistory || []).slice(-5);
  if (recentHistory.length) {
    await supabaseClient.from("points_history").upsert(
      recentHistory.map(function(h) {
        return { id: h.id, kid_id: kid.id, change_type: h.changeType, points_delta: h.pointsDelta, points_after: h.pointsAfter, description: h.description || "", created_at: h.createdAt };
      }),
      { onConflict: "id", ignoreDuplicates: true }
    );
  }
}

// ── CLOUD SAVE: called after every state mutation ─────────────
function cloudSave(kidId) {
  if (!cloudAuthEnabled || !cloudModeEnabled || !supabaseClient) return;
  var family = getCurrentFamily();
  if (!family) return;

  if (kidId) {
    var kid = getKid(kidId);
    if (kid) {
      enqueueWrite(function() { return pushKidToCloud(family.id, kid); });
      return;
    }
  }
  enqueueWrite(function() { return pushFamilyToCloud(family); });
}

// ── CLOUD SIGNUP: create account in Supabase ─────────────────
async function cloudSignUp(familyName, parentName, parentEmail, parentPin, kids) {
  if (!supabaseClient) throw new Error("Supabase not configured");
  console.log("CLOUD SIGNUP: starting for", parentEmail);

  var authPwd = "chores::" + parentEmail.toLowerCase().trim() + "::" + parentPin + "::v2";

  var signUpRes = await supabaseClient.auth.signUp({
    email: parentEmail,
    password: authPwd,
    options: { data: { parent_name: parentName, family_name: familyName } },
  });
  console.log("CLOUD SIGNUP: signUp result", signUpRes.error || "ok", signUpRes.data?.session ? "has session" : "no session", signUpRes.data?.user?.id || "no user");
  if (signUpRes.error) throw signUpRes.error;

  var session = signUpRes.data.session;
  var user = session ? session.user : null;
  if (!user) {
    console.log("CLOUD SIGNUP: no session from signUp, trying signIn");
    var signInRes = await supabaseClient.auth.signInWithPassword({ email: parentEmail, password: authPwd });
    console.log("CLOUD SIGNUP: signIn result", signInRes.error || "ok", signInRes.data?.user?.id || "no user");
    if (signInRes.error) throw new Error("Signup worked but sign-in failed: " + signInRes.error.message);
    session = signInRes.data.session;
    user = signInRes.data.user;
  }
  if (!user) throw new Error("Could not get authenticated user after signup.");
  console.log("CLOUD SIGNUP: authenticated as", user.id);

  var familyRes = await supabaseClient.from("families").insert({ family_name: familyName }).select("id").single();
  console.log("CLOUD SIGNUP: family insert", familyRes.error || "ok", familyRes.data?.id || "no id");
  if (familyRes.error) throw new Error("Could not create family: " + familyRes.error.message);
  var familyId = familyRes.data.id;

  var membershipRes = await supabaseClient.from("parent_memberships").insert({
    family_id: familyId, user_id: user.id, parent_name: parentName,
  });
  console.log("CLOUD SIGNUP: membership insert", membershipRes.error || "ok");
  if (membershipRes.error) throw new Error("Could not create membership: " + membershipRes.error.message);

  var settingsRes = await supabaseClient.from("family_settings").insert({
    family_id: familyId, parent_pin_hash: parentPin, parent_name: parentName,
  });
  console.log("CLOUD SIGNUP: settings insert", settingsRes.error || "ok");

  if (kids.length) {
    var kidsRes = await supabaseClient.from("kids").insert(kids.map(function(k) { return kidToRow(k, familyId); }));
    console.log("CLOUD SIGNUP: kids insert", kidsRes.error || "ok");
    if (kidsRes.error) throw new Error("Could not create kids: " + kidsRes.error.message);
  }

  console.log("CLOUD SIGNUP: complete, familyId =", familyId);
  return familyId;
}

// ── CLOUD LOGIN: sign in and pull family ──────────────────────
async function cloudLogin(parentEmail, parentPin) {
  if (!supabaseClient) throw new Error("Supabase not configured");

  var authPwd = "chores::" + parentEmail.toLowerCase().trim() + "::" + parentPin + "::v2";
  var signInRes = await supabaseClient.auth.signInWithPassword({ email: parentEmail, password: authPwd });
  if (signInRes.error) throw signInRes.error;

  var userId = signInRes.data.user.id;

  // Get family_id from memberships
  var membershipRes = await supabaseClient.from("parent_memberships").select("family_id").eq("user_id", userId).single();
  if (membershipRes.error) throw membershipRes.error;

  var familyId = membershipRes.data.family_id;
  return await pullFamilyFromCloud(familyId);
}
