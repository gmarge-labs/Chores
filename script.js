// v2.0.1 - Firebase sync + Golden Trophy rewards
const STORAGE_KEY = "chores-multi-family-state-v1";
const cloudConfig = window.CHORES_FIREBASE_CONFIG || {};
const cloudModeEnabled = Boolean(cloudConfig.enabled && cloudConfig.apiKey);
const cloudAuthEnabled = true;

var firebaseApp  = null;
var firebaseAuth = null;
var firebaseDb   = null;

if (cloudModeEnabled && typeof firebase !== "undefined") {
  try {
    firebaseApp  = firebase.initializeApp({
      apiKey:            cloudConfig.apiKey,
      authDomain:        cloudConfig.authDomain,
      projectId:         cloudConfig.projectId,
      storageBucket:     cloudConfig.storageBucket,
      messagingSenderId: cloudConfig.messagingSenderId,
      appId:             cloudConfig.appId,
    });
    firebaseAuth = firebase.auth(firebaseApp);
    firebaseDb   = firebase.firestore(firebaseApp);
  } catch(e) {
    console.warn("Firebase init error:", e.message);
  }
}

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

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
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
  }

  return draft;
}

function createKid(name, kidPin, avatar = "") {
  return {
    id: createId("kid"),
    name,
    kidPin,
    avatar,
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
    missedDaysInARow: 0,
    lastMissedCheckDate: null,
    lastTaskRefreshDate: getTodayDateKey(),
  };
}

function createFamily({ familyName, parentName, parentEmail, parentPin, kids }) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);
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
    isPro: false,
    proTier: null,
    trialEndsAt: trialEnd.toISOString(),
    cloudAuthKey: null,
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
    completed: normalizeTaskInstances(kid.completed, fallbackDateKey),
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
    ownerUid: family.ownerUid || "",
    isPro: family.isPro || false,
    proTier: family.proTier || null,
    trialEndsAt: family.trialEndsAt || null,
    stripeCustomerId: family.stripeCustomerId || null,
    haWebhookUrl: family.haWebhookUrl || null,
    cloudAuthKey: family.cloudAuthKey || null,
    subscriptionEndsAt: family.subscriptionEndsAt || null,
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
  const canSyncKidDoc = Boolean(options.kidId && state.session?.familyId);
  const canSyncFamilyDoc = Boolean(options.forceCloudFamily && state.session?.familyId);
  if (!options.skipCloud && cloudAuthEnabled && cloudModeEnabled && (isParentSession() || canSyncKidDoc || canSyncFamilyDoc)) {
    cloudSave(options.kidId);
  }
}

const _loginAttempts = {};
function checkLoginRateLimit(email) {
  const now = Date.now();
  const key = email.toLowerCase();
  if (!_loginAttempts[key]) _loginAttempts[key] = { count: 0, lockedUntil: 0 };
  const rec = _loginAttempts[key];
  if (rec.lockedUntil > now) {
    const secsLeft = Math.ceil((rec.lockedUntil - now) / 1000);
    showToast(`Too many attempts. Try again in ${secsLeft} seconds.`);
    return false;
  }
  rec.count++;
  if (rec.count >= 5) {
    rec.lockedUntil = now + 30000; // 30 second lockout
    rec.count = 0;
    showToast("Too many failed attempts. Please wait 30 seconds.");
    return false;
  }
  return true;
}
function clearLoginRateLimit(email) {
  delete _loginAttempts[email.toLowerCase()];
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
    { key: "add-rewards", label: "Add Rewards" },
    { key: "dollar-rate", label: "Dollar Rate" },
    { key: "add-child", label: "Add Child" },
    { key: "remove-child", label: "Remove Child" },
    { key: "celebration-threshold", label: "Celebration Threshold" },
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
    "add-rewards": "Add Rewards",
    "dollar-rate": "Dollar Rate",
    "add-child": "Add Child",
    "remove-child": "Remove Child",
    "celebration-threshold": "Celebration Threshold",
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

const WEAK_PINS = new Set([
  "0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","2345","3456","4567","5678","6789","0123","9876","8765","7654",
  "6543","5432","4321","3210","1212","2121","1313","3131","1010","0101",
  "1122","2211","1221","2112","1231","1232","1230"
]);

function isStrongPin(value) {
  const pin = String(value || "").trim();
  if (!/^\d{4}$/.test(pin)) return false;
  if (WEAK_PINS.has(pin)) return false;
  return true;
}

function isValidParentPin(value) {
  return isStrongPin(value);
}

function getParentPinGuidance(value) {
  const pin = String(value || "").trim();
  if (!pin) return "";
  if (!/^\d{4}$/.test(pin)) return `<p class="create-guidance-pill create-guidance-pill--warning">PIN must be exactly 4 digits.</p>`;
  if (WEAK_PINS.has(pin)) return `<p class="create-guidance-pill create-guidance-pill--warning">That PIN is too easy to guess. Try something less predictable.</p>`;
  return `<p class="create-guidance-pill create-guidance-pill--success">Strong PIN.</p>`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidCreateFieldValue(field, value) {
  if (!field) return false;
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return false;
  if (/^kidPin\d+$/.test(field.name)) {
    return isValidKidPin(trimmedValue);
  }
  if (field.name === "parentEmail") {
    return isValidEmail(trimmedValue);
  }
  if (field.name === "parentPin") {
    return isValidParentPin(trimmedValue);
  }
  if (field.name === "confirmParentPin") {
    return trimmedValue.length > 0;
  }
  return true;
}

function getCreateFieldGuidance(field, value) {
  if (!field) return "";
  const trimmedValue = String(value || "").trim();
  if (field.name === "parentEmail") {
    if (!trimmedValue) return "";
    if (!isValidEmail(trimmedValue)) {
      return `<p class="create-guidance-pill create-guidance-pill--warning">Please enter a valid email address (e.g. name@example.com).</p>`;
    }
    return `<p class="create-guidance-pill create-guidance-pill--success">Email looks good.</p>`;
  }
  if (field.name === "parentPin") {
    return getParentPinGuidance(trimmedValue);
  }
  if (field.name === "confirmParentPin") {
    if (!trimmedValue) return "";
    const parentPinValue = (typeof createAccountDraft !== "undefined" ? createAccountDraft.parentPin : "") || "";
    if (trimmedValue !== parentPinValue) {
      return `<p class="create-guidance-pill create-guidance-pill--warning">PINs don\'t match.</p>`;
    }
    return `<p class="create-guidance-pill create-guidance-pill--success">PINs match.</p>`;
  }
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

function getBlockedMessage(field, value) {
  if (!field) return "";
  const trimmedValue = String(value || "").trim();
  if (!trimmedValue) return `Enter your ${field.placeholder || "details"} to continue.`;
  if (field.name === "parentEmail" && !isValidEmail(trimmedValue)) {
    return "Please enter a valid email address (e.g. name@example.com).";
  }
  if (/^kidPin\d+$/.test(field.name) && !isValidKidPin(trimmedValue)) {
    return "Kid PIN must be exactly 4 digits.";
  }
  return "";
}

function renderCreateAccountActions() {
  const currentField = getCurrentCreateField();
  if (!currentField) return "";

  const currentValue = createAccountDraft[currentField.name] || "";
  const canAdvance = isValidCreateFieldValue(currentField, currentValue);
  const disabledAttr = canAdvance ? "" : "disabled";
  const blockedMsg = !canAdvance ? getBlockedMessage(currentField, currentValue) : "";
  const hintHtml = blockedMsg ? `<p class="create-guidance-pill create-guidance-pill--warning" style="margin-top:8px;">${blockedMsg}</p>` : "";

  if (!/^kid/.test(currentField.name)) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-next="true" ${disabledAttr}>Next</button>
      </div>
      ${hintHtml}
    `;
  }

  if (/^kidName/.test(currentField.name)) {
    return `
      <div class="button-row create-progress-actions">
        <button class="action-button primary" type="button" data-create-next="true" ${disabledAttr}>Next</button>
      </div>
      ${hintHtml}
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

  return `
    <div class="auth-kid-block single-step-kid-block">
      <p class="eyebrow">Add your kids</p>
      <div class="auth-kid-grid">
        ${renderCreateField(currentField.name, currentField.placeholder, currentField.type)}
      </div>
      ${guidance}
    </div>
  `;
}

function renderAboutTopicContent(topic) {
  if (topic === "what") {
    return `
      <h3>What it does</h3>
      <p>ChoreHeroes gives families one place to manage tasks, points, rewards, approvals, and progress in a fun way.</p>
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
  if (familyMode) return "family";
  const lower = String(name || "").trim().toLowerCase();
  if (["simra", "jinan", "rayyan"].includes(lower)) return lower;
  return "family";
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

function showAppEdit(task, onSave) {
  const existing = document.getElementById("app-edit-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "app-edit-modal";
  modal.className = "app-modal-overlay";
  modal.innerHTML = `
    <div class="app-modal">
      <p class="app-modal-message">Edit task</p>
      <div class="app-modal-form">
        <input class="app-modal-input" id="edit-task-title" type="text" value="${task.title.replace(/"/g,'&quot;')}" placeholder="Task title" />
        <input class="app-modal-input" id="edit-task-points" type="number" value="${task.points}" placeholder="Points" min="1" />
      </div>
      <div class="app-modal-buttons">
        <button class="action-button secondary app-modal-cancel">Cancel</button>
        <button class="action-button primary app-modal-save">Save</button>
      </div>
    </div>
  `;
  modal.querySelector(".app-modal-cancel").addEventListener("click", () => modal.remove());
  modal.querySelector(".app-modal-save").addEventListener("click", () => {
    const title = modal.querySelector("#edit-task-title").value.trim();
    const points = Number(modal.querySelector("#edit-task-points").value);
    if (!title) { modal.querySelector("#edit-task-title").focus(); return; }
    if (!points || points < 1) { modal.querySelector("#edit-task-points").focus(); return; }
    modal.remove();
    onSave(title, points);
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector("#edit-task-title").focus(), 50);
}

function showAppConfirm(message, onConfirm) {
  const existing = document.getElementById("app-confirm-modal");
  if (existing) existing.remove();
  const modal = document.createElement("div");
  modal.id = "app-confirm-modal";
  modal.className = "app-modal-overlay";
  modal.innerHTML = `
    <div class="app-modal">
      <p class="app-modal-message">${message}</p>
      <div class="app-modal-buttons">
        <button class="action-button secondary app-modal-cancel">Cancel</button>
        <button class="action-button danger app-modal-confirm">Confirm</button>
      </div>
    </div>
  `;
  modal.querySelector(".app-modal-cancel").addEventListener("click", () => modal.remove());
  modal.querySelector(".app-modal-confirm").addEventListener("click", () => { modal.remove(); onConfirm(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
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
  if (!isValidParentPin(parentPin)) {
    showToast("Please choose a stronger PIN — avoid sequences like 1234 or repeated digits like 1111.");
    return;
  }

  if (parentPin !== confirmParentPin) {
    showToast("Parent PINs do not match.");
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
    showToast("Please enter a valid email address.");
    return;
  }

  if (state.families.some((family) => family.parentEmailLower === parentEmail.toLowerCase())) {
    showToast("That email already has an account. Please log in instead.");
    return;
  }

  // Also check Firestore for duplicate email
  if (firebaseDb) {
    try {
      const snap = await firebaseDb.collection("families")
        .where("parentEmailLower", "==", parentEmail.toLowerCase())
        .limit(1)
        .get();
      if (!snap.empty) {
        showToast("That email already has an account. Please log in instead.");
        return;
      }
    } catch(e) { console.warn("Duplicate email check failed:", e.message); }
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
    kids.push(createKid(name, pin));
  }

  if (invalidKidPin) {
    showToast("Each kid PIN must be exactly 4 digits.");
    return;
  }

  if (!kids.length) {
    showToast("Add at least one child with a 4-digit PIN.");
    return;
  }

  // Hash parent PIN before storing
  const hashedParentPin = await hashPin(parentPin);
  const family = createFamily({ familyName, parentName, parentEmail, parentPin: hashedParentPin, kids });

  // Create Firebase Auth account immediately at signup
  if (cloudAuthEnabled && cloudModeEnabled && firebaseAuth) {
    // Show loading state
    const submitBtn = document.querySelector("[data-create-submit]");
    if (submitBtn) { submitBtn.textContent = "Creating account..."; submitBtn.disabled = true; }

    try {
      const authPwd = buildCloudAuthPassword(parentEmail, parentPin);
      const signUpRes = await firebaseAuth.createUserWithEmailAndPassword(parentEmail, authPwd);
      if (signUpRes.user) {
        family.ownerUid = signUpRes.user.uid;
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 30);
        family.trialEndsAt = trialEnd.toISOString();
        // Send email verification
        try {
          await signUpRes.user.sendEmailVerification({
            url: "https://choreheroes.app"
          });
        } catch(e) { console.warn("Verification email failed:", e.message); }
        try {
          // Write family doc to Firestore
          await firebaseDb.collection("families").doc(family.id).set({
            familyName: family.familyName,
            parentName: family.parentName,
            parentPin: family.parentPin,
            parentEmail: family.parentEmail,
            parentEmailLower: family.parentEmailLower,
            ownerUid: signUpRes.user.uid,
            favorClaims: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            trialEndsAt: family.trialEndsAt,
            isPro: false,
            proTier: null,
          });
          // Write kids subcollection
          const batch = firebaseDb.batch();
          family.kids.forEach(kid => {
            batch.set(
              firebaseDb.collection("families").doc(family.id).collection("kids").doc(kid.id),
              kidToFirestoreDoc(kid)
            );
          });
          await batch.commit();
        } catch(firestoreErr) {
          // Auth succeeded but Firestore failed — delete the Auth account to avoid orphan
          console.warn("Firestore write failed, rolling back Auth:", firestoreErr.message);
          try { await signUpRes.user.delete(); } catch(e) {}
          if (submitBtn) { submitBtn.textContent = "Create account"; submitBtn.disabled = false; }
          showToast("Account creation failed. Please check your connection and try again.");
          return;
        }
      }
    } catch(signUpErr) {
      if (submitBtn) { submitBtn.textContent = "Create account"; submitBtn.disabled = false; }
      if (signUpErr.code === "auth/email-already-in-use") {
        showToast("That email already has an account. Please log in instead.");
        return;
      }
      console.warn("Firebase signup failed:", signUpErr.message);
      // Continue with local-only account if Firebase fails
    }
  }

  state.families.push(family);
  authAccountReady = true;
  authAccountJustCreated = true;
  authStage = "login";
  authView = "verify-email";
  resetCreateAccountDraft();
  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  saveState({ skipCloud: true });
  renderAuthHome();
}

function showThresholdCelebration(kid, threshold) {
  const celebration = document.createElement("div");
  celebration.className = "celebration-pop";
  celebration.setAttribute("role", "status");
  celebration.innerHTML = `
    <div class="celebration-card">
      <div class="celebration-emojis" aria-hidden="true">
        <span>🎉</span><span>⭐</span><span>✨</span><span>🏆</span><span>💫</span><span>🌟</span>
        <span>🎊</span><span>⭐</span><span>✨</span><span>🏅</span><span>💥</span><span>🌈</span>
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
    detail: buildTaskDetail(template.recurring, formatTaskTimeValue(template.time) || template.time, template.customDate ? formatCustomDate(template.customDate) : ""),
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

function timeToMinutes(timeValue) {
  const str = String(timeValue || "").trim();
  if (!str) return 9999;
  // Handle raw 24h format: "05:30" or "17:30"
  const raw = str.match(/^(\d{1,2}):(\d{2})$/);
  if (raw) return parseInt(raw[1], 10) * 60 + parseInt(raw[2], 10);
  // Handle display format: "5:30 AM" or "5:30 PM"
  const disp = str.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (disp) {
    let h = parseInt(disp[1], 10);
    const m = parseInt(disp[2], 10);
    const isPM = disp[3].toUpperCase() === "PM";
    if (isPM && h !== 12) h += 12;
    if (!isPM && h === 12) h = 0;
    return h * 60 + m;
  }
  return 9999;
}

function formatTaskTimeValue(timeValue) {
  const str = String(timeValue || "").trim();
  if (!str) return "";
  // Already in "8:00 AM" or "5:30 PM" format — return as-is
  if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(str)) return str;
  // Convert from 24hr "08:00" or "17:30" format
  const [hoursRaw, minutesRaw] = str.split(":");
  const hoursNum = Number(hoursRaw);
  if (!Number.isFinite(hoursNum)) return "";
  const minutes = (minutesRaw || "00").substring(0, 2).padStart(2, "0");
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
  const timeInput = taskForm.querySelector('input[name="time"]');
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

  return `${labels[recurring] || "Daily"} • ${time}`;
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

function addChild(name, kidPin, avatar = "") {
  const family = getCurrentFamily();
  if (!family) return;
  family.kids.push(createKid(name, kidPin, avatar));
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
    maybeCelebrateThreshold(kid, previousPoints);
  }

  if (fromStatus === "completed" && toStatus !== "completed") {
    kid.points = Math.max(0, kid.points - (Number(task.points) || 0));
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

function resetAllTasksAndPoints() {
  getFamilyKids().forEach((kid) => {
    kid.points = 0;
    kid.due = [];
    kid.awaiting = [];
    kid.completed = [];
    kid.taskTemplates = [];
    kid.lastCelebratedThreshold = 0;
    kid.missedDaysInARow = 0;
    kid.lastMissedCheckDate = getTodayDateKey();
    kid.lastTaskRefreshDate = getTodayDateKey();
  });
}

async function deleteCurrentFamilyFromDevice() {
  const family = getCurrentFamily();
  if (!family) return false;

  // Cancel Stripe subscription if active
  if (family.isPro && family.stripeCustomerId && family.ownerUid) {
    try {
      await fetch("https://us-central1-chores-c605d.cloudfunctions.net/cancelSubscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid: family.ownerUid })
      });
    } catch(e) { console.warn("Subscription cancel failed:", e.message); }
  }

  // Delete Firestore family doc and kids subcollection
  if (firebaseDb && family.id) {
    try {
      const kidsSnap = await firebaseDb.collection("families").doc(family.id).collection("kids").get();
      const batch = firebaseDb.batch();
      kidsSnap.docs.forEach(doc => batch.delete(doc.ref));
      batch.delete(firebaseDb.collection("families").doc(family.id));
      await batch.commit();
    } catch(e) { console.warn("Firestore deletion failed:", e.message); }
  }

  // Delete Firebase Auth account
  if (firebaseAuth?.currentUser) {
    try { await firebaseAuth.currentUser.delete(); } catch(e) { console.warn("Auth deletion failed:", e.message); }
  }

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
  // Sign out of Firebase Auth
  if (firebaseAuth) {
    try { await firebaseAuth.signOut(); } catch(e) { console.warn("Firebase signOut failed:", e.message); }
  }
  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  saveState({ skipCloud: true });
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
        <label class="time-field task-time-capsule" aria-label="Task time">
          <span class="task-time-icon" aria-hidden="true">◔</span>
          <input type="time" name="time" required />
        </label>
      </div>
      <p class="task-schedule-preview" data-task-schedule-preview="true">Choose a repeat style and time to preview the schedule.</p>
    </div>
  `;
}

function renderAuthHome() {
  if (authStage === "intro" && !["about", "create", "returning", ""].includes(authView)) {
    authView = "";
  }

  if (authStage === "login" && !["parent", "kid", "returning", "verify-email"].includes(authView)) {
    authView = "";
  }

  document.getElementById("page-home").innerHTML = `
    <div class="home-shell auth-shell">
      <header class="home-header">
        <p class="eyebrow">Family task tracker</p>
        <h1 class="rainbow-title-new" aria-label="ChoreHeroes">
          <span class="title-star" aria-hidden="true">✦</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">h</span>
          <span aria-hidden="true">o</span>
          <span aria-hidden="true">r</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">r</span>
          <span aria-hidden="true">o</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">s</span>
          <span class="title-star" aria-hidden="true">✦</span>
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
                : authView === ""
                  ? `
                    <div class="login-picker">
                      <button class="login-picker-btn login-picker-parent" type="button" data-auth-view="parent">
                        <span class="score-sparkles" aria-hidden="true"></span>
                        Parent login
                      </button>
                      <button class="login-picker-btn login-picker-kid" type="button" data-auth-view="kid">
                        <span class="score-sparkles" aria-hidden="true"></span>
                        Kid login
                      </button>
                      <button class="action-button secondary" type="button" data-auth-stage="intro" style="margin-top:8px;">Back to home</button>
                    </div>
                  `
                  : authView === "verify-email"
                    ? `<button class="action-button secondary auth-back-button" type="button" data-auth-view="parent">← Back to login</button>`
                  : `
                    <button class="action-button secondary auth-back-button" type="button" data-auth-view="login-picker">← Back</button>
                    <button class="view-button active" type="button">${authView === "parent" ? "Parent login" : "Kid login"}</button>
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
                    ${authAccountJustCreated ? `<p style="font-size:0.75rem;color:#888;margin-top:4px;">By creating an account you agree to our <a href="/terms.html" target="_blank" style="color:#534AB7;">Terms</a> and <a href="/privacy.html" target="_blank" style="color:#534AB7;">Privacy Policy</a>.</p>` : ""}
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
                    <input type="email" name="username" placeholder="Your email" required />
                    <input type="password" name="currentPassword" placeholder="Current PIN" inputmode="numeric" maxlength="4" required />
                    <input type="password" name="newPassword" placeholder="New PIN (4 digits, not 1234 etc)" inputmode="numeric" maxlength="4" required />
                    <div class="button-row create-progress-actions">
                      <button class="action-button primary" type="submit">Save new PIN</button>
                      <button class="action-button secondary" type="button" data-auth-view="back-intro">Back to home</button>
                      <button class="action-button secondary" type="button" data-reset-passcode-toggle="true">Cancel</button>
                    </div>
                  </form>
                `
                : `
                  <form class="reward-form auth-form" id="returning-login-form">
                    <input type="email" name="username" placeholder="Username" autocomplete="email" required />
                    <input type="password" name="password" placeholder="Password" autocomplete="current-password" required />
                    <div class="button-row create-progress-actions">
                      <button class="action-button primary" type="submit" form="returning-login-form">Log in</button>
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

          <div class="auth-panel ${authView === "verify-email" ? "active" : ""}">
            <div style="text-align:center;padding:16px 0;">
              <div style="font-size:3rem;margin-bottom:12px;">📬</div>
              <p class="eyebrow">Almost there!</p>
              <h2 class="auth-title" style="margin-bottom:12px;">Check your inbox</h2>
              <p class="auth-copy" style="margin-bottom:8px;">
                We sent a verification email to:<br/>
                <strong style="color:#fff;">${getCurrentFamily()?.parentEmail || ""}</strong>
              </p>
              <p class="auth-copy" style="font-size:0.85rem;opacity:0.8;margin-bottom:24px;">
                Click the link in the email to verify your address, then come back and log in.
              </p>
              <div class="button-row" style="flex-direction:column;gap:10px;">
                <button class="action-button primary" type="button" data-auth-view="parent">
                  I've verified — Log in
                </button>
                <button class="action-button secondary" type="button" id="resend-verification-btn">
                  Resend verification email
                </button>
              </div>
              <p style="font-size:0.72rem;opacity:0.6;margin-top:16px;">
                Check your spam folder if you don't see it within a minute.
              </p>
            </div>
          </div>
        </article>
      </section>
      <p style="text-align:center;font-size:0.75rem;color:rgba(255,255,255,0.5);padding:16px 0 8px;">
        <a href="/privacy.html" target="_blank" style="color:rgba(255,255,255,0.6);">Privacy Policy</a>
        &nbsp;·&nbsp;
        <a href="/terms.html" target="_blank" style="color:rgba(255,255,255,0.6);">Terms of Service</a>
      </p>
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
        <h1 class="rainbow-title-new" aria-label="ChoreHeroes">
          <span class="title-star" aria-hidden="true">✦</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">h</span>
          <span aria-hidden="true">o</span>
          <span aria-hidden="true">r</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">r</span>
          <span aria-hidden="true">o</span>
          <span aria-hidden="true">e</span>
          <span aria-hidden="true">s</span>
          <span class="title-star" aria-hidden="true">✦</span>
        </h1>
      </header>
      ${(() => {
        const sub = getSubscriptionStatus(family);
        if (sub.startsWith("trial:")) {
          const days = sub.split(":")[1];
          return `<div class="trial-banner">${escapeHtml(days)} day${days === "1" ? "" : "s"} left in your free trial — <button class="trial-banner-link" type="button" data-show-upgrade="true">Subscribe now</button></div>`;
        }
        if (family.isPro) return `<div class="trial-banner trial-banner--pro">ChoreHeroes Pro ${family.proTier === "tier2" ? "✦ Home Assistant included" : ""} — <button class="trial-banner-link" type="button" data-manage-subscription="true">Manage subscription</button></div>`;
        return "";
      })()}

      <section class="kid-grid" id="home-kids">
        ${kids
          .map(
            (kid) => `
              <article class="kid-card ${escapeHtml(getShellClass(kid.name, false))}" data-kid-id="${escapeHtml(kid.id)}" role="button" tabindex="0">
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
  const pageTitle = familyMode ? family.familyName : kid.name;
  const canSeeReports = role === "parent";
  const canSeeSettings = role === "parent";
  const hasReachedThreshold = Number(kid.celebrationThreshold) > 0 && Number(kid.points) >= Number(kid.celebrationThreshold);
  const todayBonus = getKidAdjustmentForToday(kid, "bonus");
  const todayPenalty = getKidAdjustmentForToday(kid, "penalty");
  const parentFocusedNav = (currentKidView === "settings" || currentKidView === "report") && isParentSession();
  document.getElementById("page-kid").innerHTML = `
    <div class="kid-shell ${escapeHtml(shellClass)}">
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
        <button class="back-button" type="button" id="back-home" aria-label="${isParentSession() ? "Back to family" : "Log out"}"><span class="back-arrow">←</span><span class="back-label">${isParentSession() ? " Back to family" : " Log out"}</span></button>
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
                  [...kid.due].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
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
                  [...kid.awaiting].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
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
                  [...kid.completed].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
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
                  <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                  <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
                  <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                  <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
                </span>
              `
              : ""
          }
          <div class="rewards-layout rewards-layout-v2">
            <div class="points-column">
              <article class="points-card points-card-v2 is-bursting ${hasReachedThreshold ? "threshold-celebration" : ""}" data-points-card="true" role="button" tabindex="0" aria-label="Make points sparkle">
                ${renderTileBubbles()}
                ${
                  hasReachedThreshold
                    ? `
                      <span class="points-celebration-cloud" aria-hidden="true">
                        <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                        <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
                      </span>
                    `
                    : ""
                }

                <div class="points-gem-ring" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <p class="eyebrow points-eyebrow">Points earned</p>
                <h3 class="points-total">${escapeHtml(kid.points)}</h3>
                <div class="points-coin-trail" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
                <p class="points-message is-changing">${
                  kid.points === 0 ? "Ready to launch, " + escapeHtml(kid.name) + "!"
                  : kid.points < 20 ? "Growing strong, " + escapeHtml(kid.name) + "!"
                  : kid.points < 50 ? "On fire, " + escapeHtml(kid.name) + "!"
                  : kid.points < 100 ? "Smashing it, " + escapeHtml(kid.name) + "!"
                  : kid.points < 200 ? "Royalty vibes, " + escapeHtml(kid.name) + "!"
                  : "Legend status, " + escapeHtml(kid.name) + "!"
                }</p>
              </article>

              <div class="gold-bottom-row">
                <div class="gold-tab bonus-tab">
                  <div class="gold-dot">+</div>
                  <div class="gold-tab-text">
                    <span class="gold-tab-label">Bonus</span>
                    <span class="gold-tab-title">${todayBonus ? escapeHtml(todayBonus.value) : "No bonus yet"}</span>
                  </div>
                </div>
                <div class="gold-tab penalty-tab">
                  <div class="gold-dot">-</div>
                  <div class="gold-tab-text">
                    <span class="gold-tab-label">Penalty</span>
                    <span class="gold-tab-title">${todayPenalty ? escapeHtml(todayPenalty.value) : "All clear!"}</span>
                  </div>
                </div>
                <button class="gold-tab favor-tab" type="button" data-view="favors">
                  <div class="gold-dot gold-dot-star">&#9733;</div>
                  <div class="gold-tab-text">
                    <span class="gold-tab-label">Spend points</span>
                    <span class="gold-tab-title">Buy favors</span>
                  </div>
                </button>
              </div>
            </div>


          </div>
        </article>

        ${currentKidView === "favors" ? `
        <article class="section-card primary kid-view active" data-panel="favors">
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
        ` : ""}

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
                  <section class="report-tile ${escapeHtml(getShellClass(child.name, false))}">
                    ${renderTileBubbles()}
                    <div class="report-head">
                      <h3>${escapeHtml(child.name)}</h3>
                      <span class="report-count">${escapeHtml(child.due.length)} due</span>
                    </div>
                    <div class="report-list">
                      ${renderCardList(
                        [...child.due].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time)),
                        (task) => `
                          <article class="task-card report-task">
                            <h4>${escapeHtml(task.title)}</h4>
                            <p class="meta">${escapeHtml(task.detail)}</p>
                            <p class="meta">Not done yet • ${escapeHtml(task.points)} points</p>
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
                    <article class="watch-pill ${escapeHtml(getShellClass(child.name, false))} ${missedDays >= 3 ? "alert" : ""}">
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
                              ${(() => {
                                const allTasks = getFamilyKids().flatMap(k => k.taskTemplates || []);
                                const unique = [...new Map(allTasks.map(t => [t.title.toLowerCase(), t])).values()]
                                  .sort((a, b) => a.title.localeCompare(b.title));
                                if (!unique.length) return `<input type="text" name="title" placeholder="Task title" required />`;
                                return `
                                  <div class="task-library-wrapper">
                                    <input type="text" name="title" placeholder="Task title" required />
                                    <button class="task-library-toggle" type="button" data-toggle-library="true" title="Pick from history">
                                      <span>&#128196;</span> Pick from history
                                    </button>
                                    <div class="task-library-dropdown hidden" id="task-library-dropdown">
                                      ${unique.map(t => `
                                        <button class="task-library-item" type="button"
                                          data-library-title="${escapeHtml(t.title)}"
                                          data-library-points="${escapeHtml(String(t.points))}">
                                          <span class="task-library-item-title">${escapeHtml(t.title)}</span>
                                          <span class="task-library-item-pts">${escapeHtml(String(t.points))} pts</span>
                                        </button>
                                      `).join("")}
                                    </div>
                                  </div>
                                `;
                              })()}
                              ${renderAssignedKidsBlock()}
                              ${renderTaskRecurringBlock()}
                              <input type="number" name="points" placeholder="Points" min="1" required />
                              <div class="button-row">
                                <button class="action-button primary" type="submit">Add task</button>
                                <button class="action-button danger" type="button" data-reset-tasks="true">Reset tasks & points</button>
                              </div>
                            </form>
                            ${(() => {
                              const allTasks = getFamilyKids().flatMap(k => (k.taskTemplates || []).map(t => ({ ...t, kidId: k.id, kidName: k.name })));
                              if (!allTasks.length) return "";
                              return `
                                <details class="existing-tasks-dropdown">
                                  <summary class="existing-tasks-summary">
                                    <span class="eyebrow" style="margin:0;">Existing tasks</span>
                                    <span class="existing-tasks-count">${allTasks.length}</span>
                                    <span class="existing-tasks-chevron">&#9662;</span>
                                  </summary>
                                  <div class="existing-tasks-list">
                                    ${allTasks.map(t => `
                                      <div class="existing-task-row">
                                        <div class="existing-task-info">
                                          <span class="existing-task-title">${escapeHtml(t.title)}</span>
                                          <span class="existing-task-meta">${escapeHtml(t.kidName)} • ${escapeHtml(t.points)} pts</span>
                                        </div>
                                        <div class="existing-task-actions">
                                          <button class="action-button secondary btn-sm" type="button" data-edit-task="${escapeHtml(t.id)}" data-edit-kid="${escapeHtml(t.kidId)}">Edit</button>
                                          <button class="action-button danger btn-sm" type="button" data-delete-task="${escapeHtml(t.id)}" data-delete-kid="${escapeHtml(t.kidId)}">Delete</button>
                                        </div>
                                      </div>
                                    `).join("")}
                                  </div>
                                </details>
                              `;
                            })()}
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
                                                <div class="button-row">
                                                  <button class="action-button primary" type="submit">Add child</button>
                                                </div>
                                              </form>
                                            </section>
                                          `
                                          : ""
                                      }
                                      ${
                                        currentFamilyControlsSection === "remove-child"
                                          ? `
                                            <section class="settings-mini-section family-controls-page">
                                              <p class="eyebrow">Remove child</p>
                                              <div class="remove-child-list">
                                                ${getFamilyKids().map(child => `
                                                  <div class="remove-child-row">
                                                    <span>${escapeHtml(child.name)}</span>
                                                    <button class="action-button danger" type="button" data-remove-kid="${escapeHtml(child.id)}">Remove</button>
                                                  </div>
                                                `).join("")}
                                              </div>
                                            </section>
                                          `
                                          :
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
}

function getSubscriptionStatus(family) {
  if (!family) return "expired";

  if (family.isPro) {
    // Safety net: if subscriptionEndsAt is set and more than 7 days past, treat as expired
    // (7 day grace period covers Stripe retry window + webhook delivery delays)
    if (family.subscriptionEndsAt) {
      const endDate = new Date(family.subscriptionEndsAt);
      if (!isNaN(endDate.getTime())) {
        const now = new Date();
        const daysPast = Math.floor((now - endDate) / (1000 * 60 * 60 * 24));
        if (daysPast > 7) return "expired";
      }
    }
    return "pro";
  }

  // Free trial logic
  const trial = family.trialEndsAt;
  if (!trial) return "expired";
  const trialDate = new Date(trial);
  if (isNaN(trialDate.getTime())) return "expired";
  const now = new Date();
  const daysLeft = Math.ceil((trialDate - now) / (1000 * 60 * 60 * 24));
  if (daysLeft > 0) return "trial:" + daysLeft;
  return "expired";
}

function showUpgradeModal(status) {
  const existing = document.getElementById("upgrade-modal-overlay");
  if (existing) existing.remove();

  const isExpired = status === "expired";
  const headline = isExpired
    ? "Your free trial has ended"
    : "Subscribe to keep using ChoreHeroes";
  const subtext = isExpired
    ? "Subscribe to keep managing your family's tasks, points, and rewards."
    : "Your trial has ended. Choose a plan to keep going.";

  const CHECKOUT_URL = "https://us-central1-chores-c605d.cloudfunctions.net/createCheckoutSession";

  const overlay = document.createElement("div");
  overlay.id = "upgrade-modal-overlay";
  overlay.innerHTML = `
    <div class="upgrade-modal">
      <div class="upgrade-modal-blobs">
        <div class="upgrade-blob upgrade-blob-1"></div>
        <div class="upgrade-blob upgrade-blob-2"></div>
        <div class="upgrade-blob upgrade-blob-3"></div>
      </div>
      <div class="upgrade-modal-card">
        <div class="upgrade-modal-app-label">Family Task Tracker</div>
        <h2 class="upgrade-modal-title">${escapeHtml(headline)}</h2>
        <p class="upgrade-modal-sub">${escapeHtml(subtext)}</p>
        <div class="upgrade-plans">
          <div class="upgrade-plan">
            <div class="upgrade-plan-tier">Tier 1</div>
            <div class="upgrade-plan-name">App only</div>
            <div class="upgrade-plan-price">$4.99<span>/mo</span></div>
            <div class="upgrade-plan-desc">Full access to tasks, points, rewards and reports for your whole family.</div>
            <button class="upgrade-plan-btn" id="upgrade-tier1-btn">Subscribe — $4.99/mo</button>
          </div>
          <div class="upgrade-plan upgrade-plan-featured">
            <div class="upgrade-plan-badge">Recommended</div>
            <div class="upgrade-plan-tier">Tier 2</div>
            <div class="upgrade-plan-name">App + Home Assistant</div>
            <div class="upgrade-plan-price">$9.99<span>/mo</span></div>
            <div class="upgrade-plan-desc">Everything in Tier 1, plus voice announcements via your smart speakers.</div>
            <button class="upgrade-plan-btn upgrade-plan-btn-featured" id="upgrade-tier2-btn">Subscribe — $9.99/mo</button>
          </div>
        </div>
        <p class="upgrade-modal-footer">🔒 Cancel anytime. Secure payment via Stripe.</p>
        <p class="upgrade-modal-footer" style="margin-top:8px;font-size:0.72rem;">By subscribing you agree to our <a href="/terms.html" target="_blank" style="color:#534AB7;">Terms of Service</a> and <a href="/privacy.html" target="_blank" style="color:#534AB7;">Privacy Policy</a>.</p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const appUrl = window.location.href.split("?")[0];

  async function startCheckout(priceId) {
    const btn = document.getElementById(priceId === "price_1TO5E9Rt74M3AjXKT7mRnvyE" ? "upgrade-tier1-btn" : "upgrade-tier2-btn");
    if (btn) { btn.textContent = "Loading..."; btn.disabled = true; }
    const ownerUid = getCurrentFamily()?.ownerUid || "";
    if (!ownerUid) {
      if (btn) { btn.textContent = "Try again"; btn.disabled = false; }
      showToast("Please log in again before subscribing.");
      return;
    }
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUid, priceId, successUrl: appUrl + "?subscribed=true", cancelUrl: appUrl + "?cancelled=true" })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error || "No URL returned");
    } catch (err) {
      if (btn) { btn.textContent = "Try again"; btn.disabled = false; }
      showToast("Payment error: " + err.message);
    }
  }

  document.getElementById("upgrade-tier1-btn").addEventListener("click", () => startCheckout("price_1TO5E9Rt74M3AjXKT7mRnvyE"));
  document.getElementById("upgrade-tier2-btn").addEventListener("click", () => startCheckout("price_1TO5JPRt74M3AjXK2gfE7BXv"));
}

async function manageSubscription() {
  const family = getCurrentFamily();
  const stripeCustomerId = family?.stripeCustomerId || "";
  const ownerUid = family?.ownerUid || "";
  if (!ownerUid) { showToast("Could not identify account."); return; }
  if (!stripeCustomerId) { showToast("No billing account found. Please contact support at noreply@choreheroes.app."); return; }
  const PORTAL_URL = "https://us-central1-chores-c605d.cloudfunctions.net/createPortalSession";
  showToast("Opening subscription portal...");
  try {
    const res = await fetch(PORTAL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerUid, returnUrl: window.location.href.split("?")[0] })
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else throw new Error(data.error || "No portal URL returned");
  } catch(err) {
    showToast("Portal error: " + err.message);
  }
}

function renderApp() {
  // Always clear upgrade modal first so login flow is never blocked
  const existingModal = document.getElementById("upgrade-modal-overlay");
  if (existingModal) existingModal.remove();

  const family = getCurrentFamily();

  if (!state.session || !family) {
    state.session = null;
    renderAuthHome();
    return;
  }

  // ── Subscription / trial check ───────────────────────────
  const subStatus = getSubscriptionStatus(family);
  if (subStatus === "expired") {
    showUpgradeModal("expired");
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

document.body.addEventListener("click", async (event) => {
  // Resend verification email button
  const resendBtn = event.target.closest("#resend-verification-btn");
  if (resendBtn) {
    resendBtn.textContent = "Sending...";
    resendBtn.disabled = true;
    try {
      const user = firebaseAuth.currentUser;
      if (user) {
        await user.sendEmailVerification({ url: "https://choreheroes.app" });
        showToast("Verification email sent! Check your inbox.");
      } else {
        // Re-sign in to get the user object
        const family = getCurrentFamily();
        if (family?.parentEmail && family?.parentPin) {
          const authPwd = buildCloudAuthPassword(family.parentEmailLower, family.parentPin);
          const res = await firebaseAuth.signInWithEmailAndPassword(family.parentEmailLower, authPwd);
          await res.user.sendEmailVerification({ url: "https://choreheroes.app" });
          await firebaseAuth.signOut();
          showToast("Verification email sent! Check your inbox.");
        }
      }
    } catch(e) {
      showToast("Could not resend — please try again in a minute.");
      console.warn("Resend failed:", e.message);
    }
    resendBtn.textContent = "Resend verification email";
    resendBtn.disabled = false;
    return;
  }

  const authButton = event.target.closest("[data-auth-view]");
  if (authButton && !state.session) {
    const nextView = authButton.dataset.authView || "create";
    if (nextView === "login-picker") {
      authView = "";
      renderAuthHome();
      return;
    }
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

  const showUpgradeBtn = event.target.closest("[data-show-upgrade]");
  if (showUpgradeBtn) {
    showUpgradeModal("manual");
    return;
  }

  const manageSubBtn = event.target.closest("[data-manage-subscription]");
  if (manageSubBtn) {
    manageSubscription();
    return;
  }

  const resetTasksButton = event.target.closest("[data-reset-tasks]");
  if (resetTasksButton && isParentSession()) {
    resetAllTasksAndPoints();
    saveState();
    renderKidPage(currentKidId);
    showToast("Tasks and points reset.");
    return;
  }

  // ── Task library toggle ───────────────────────────────────
  const libraryToggle = event.target.closest("[data-toggle-library]");
  if (libraryToggle) {
    const dropdown = document.getElementById("task-library-dropdown");
    if (dropdown) dropdown.classList.toggle("hidden");
    return;
  }

  // ── Task library item select ──────────────────────────────
  const libraryItem = event.target.closest("[data-library-title]");
  if (libraryItem) {
    const form = document.getElementById("task-form");
    if (!form) return;
    const titleInput = form.querySelector("input[name='title']");
    const pointsInput = form.querySelector("input[name='points']");
    if (titleInput) titleInput.value = libraryItem.dataset.libraryTitle;
    if (pointsInput) pointsInput.value = libraryItem.dataset.libraryPoints;
    const dropdown = document.getElementById("task-library-dropdown");
    if (dropdown) dropdown.classList.add("hidden");
    return;
  }

  // ── Edit task ─────────────────────────────────────────────
  const editTaskButton = event.target.closest("[data-edit-task]");
  if (editTaskButton && isParentSession()) {
    const taskId = editTaskButton.dataset.editTask;
    const kidId = editTaskButton.dataset.editKid;
    const kid = getKid(kidId);
    if (!kid) return;
    const task = kid.taskTemplates.find(t => t.id === taskId);
    if (!task) return;
    showAppEdit(task, (newTitle, newPoints) => {
      task.title = newTitle;
      task.points = newPoints;
      saveState({ kidId });
      showToast("Task updated.");
      renderApp();
    });
    return;
  }

  // ── Delete task ────────────────────────────────────────────
  const deleteTaskButton = event.target.closest("[data-delete-task]");
  if (deleteTaskButton && isParentSession()) {
    const taskId = deleteTaskButton.dataset.deleteTask;
    const kidId = deleteTaskButton.dataset.deleteKid;
    const kid = getKid(kidId);
    if (!kid) return;
    const task = kid.taskTemplates.find(t => t.id === taskId);
    if (!task) return;
    showAppConfirm(`Delete task "${task.title}"? This cannot be undone.`, () => {
      kid.taskTemplates = kid.taskTemplates.filter(t => t.id !== taskId);
      kid.due = kid.due.filter(t => t.id !== taskId);
      kid.awaiting = kid.awaiting.filter(t => t.id !== taskId);
      kid.completed = kid.completed.filter(t => t.id !== taskId);
      saveState({ kidId });
      showToast("Task deleted.");
      renderApp();
    });
    return;
  }

  const removeKidButton = event.target.closest("[data-remove-kid]");
  if (removeKidButton && isParentSession()) {
    const kidId = removeKidButton.dataset.removeKid;
    const kidToRemove = getKid(kidId);
    if (!kidToRemove) return;
    showAppConfirm(`Remove ${kidToRemove.name} from the family? This cannot be undone.`, () => {
      const family = getCurrentFamily();
      if (!family) return;
      family.kids = family.kids.filter(k => k.id !== kidId);
      if (currentKidId === kidId) currentKidId = getFamilyKids()[0]?.id || null;
      saveState();
      showToast(`${kidToRemove.name} removed.`);
      renderApp();
    });
    return;
  }

  const deleteFamilyButton = event.target.closest("[data-delete-family]");
  if (deleteFamilyButton && isParentSession()) {
    showAppConfirm("Delete this family from this device? This cannot be undone.", () => {
    const deleted = deleteCurrentFamilyFromDevice();
    if (!deleted) return;
    showToast("Family deleted from this device.");
    renderApp();
    return;
    });
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
    saveState({ forceCloudFamily: true });
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
    currentProfileAvatarPickerOpen = false;
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
    currentProfileAvatarPickerOpen = false;
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
    currentProfileAvatarPickerOpen = false;
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
    currentProfileAvatarPickerOpen = false;
    renderKidPage(currentKidId);
    return;
  }

  const familyControlsBackButton = event.target.closest("[data-family-controls-back]");
  if (familyControlsBackButton && currentKidView === "settings" && currentSettingsSection === "family-controls" && isParentSession()) {
    currentFamilyControlsSection = "";
    currentProfileAvatarPickerOpen = false;
    renderKidPage(currentKidId);
    return;
  }

  const kidCard = event.target.closest("[data-kid-id]");
  if (kidCard && isParentSession()) {
    currentKidId = kidCard.dataset.kidId;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentProfileAvatarPickerOpen = false;
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
    const newGuidance = getCreateFieldGuidance(currentField, value);
    if (guidanceNode) {
      guidanceNode.outerHTML = newGuidance || "";
    } else if (newGuidance) {
      const actionsEl = document.querySelector(".create-progress-actions");
      if (actionsEl) actionsEl.insertAdjacentHTML("afterend", newGuidance);
    }
    // Also update the blocked hint below the button
    const blockedHint = document.querySelector(".create-guidance-pill--warning");
    const blockedMsg = !canAdvance ? getBlockedMessage(currentField, value) : "";
    if (blockedHint && !newGuidance) {
      blockedHint.textContent = blockedMsg;
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

    if (!checkLoginRateLimit(email)) return;

    const loginBtn = parentLoginForm.querySelector("button[type='submit']");
    if (loginBtn) { loginBtn.textContent = "Logging in..."; loginBtn.disabled = true; }
    const resetLoginBtn = () => { if (loginBtn) { loginBtn.textContent = "Log in as parent"; loginBtn.disabled = false; } };

    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        const authPwd = buildCloudAuthPassword(email, pin);
        const signInRes = await firebaseAuth.signInWithEmailAndPassword(email, authPwd);
        if (signInRes.user) {
          // Check email verification — only enforce for brand-new accounts (no existing family)
          if (!signInRes.user.emailVerified) {
            const existingSnap = await firebaseDb.collection("families").where("ownerUid", "==", signInRes.user.uid).limit(1).get();
            if (existingSnap.empty) {
              // New account - enforce verification
              resetLoginBtn();
              showToast("Please verify your email first. Check your inbox for a verification link.");
              const resendToast = document.createElement("div");
              resendToast.className = "pin-toast";
              resendToast.innerHTML = `Didn\'t get the email? <button onclick="this.closest('.pin-toast').remove();window._resendVerification('${email.replace(/'/g,"\\'")}${''}" style="background:none;border:none;color:#fff;text-decoration:underline;cursor:pointer;font-size:inherit;">Resend it</button>`;
              document.body.appendChild(resendToast);
              setTimeout(() => resendToast?.remove(), 8000);
              window._resendVerification = async (e) => {
                try { await signInRes.user.sendEmailVerification({ url: "https://choreheroes.app" }); showToast("Verification email sent!"); } catch(err) { showToast("Could not resend — try again later."); }
              };
              return;
            }
            // Existing account - allow login but nudge them to verify
            showToast("Tip: verify your email address for better account security.");
          }
          const snap = await firebaseDb.collection("families").where("ownerUid", "==", signInRes.user.uid).limit(1).get();
          if (!snap.empty) {
            const cloudFamily = await fbPullFamily(snap.docs[0].id);
            cloudFamily.parentEmail = email;
            cloudFamily.parentEmailLower = email;
            cloudFamily.cloudAuthKey = authPwd;
            upsertFamilyInState(cloudFamily);
            authStage = "login"; authView = "parent"; authAccountJustCreated = false;
            state.session = { familyId: cloudFamily.id, role: "parent" };
            currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
            clearLoginRateLimit(email);
            saveState({ skipCloud: true });
            renderApp();
            return;
          } else {
            // Auth account exists but no Firestore doc — reset button and show error
            resetLoginBtn();
            showToast("Account not found. Please create a new account.");
            return;
          }
        }
      } catch (cloudErr) {
        // Cloud login failed — try local then cloudSyncOnLogin
        resetLoginBtn();
        console.warn("Cloud parent login failed:", cloudErr.message);
      }
    }

    // Local lookup + cloud sync for new accounts
    const hashedPin = await hashPin(pin);
    const family = state.families.find((entry) =>
      entry.parentEmailLower === email && (entry.parentPin === pin || entry.parentPin === hashedPin)
    );
    if (!family) { resetLoginBtn(); showToast("Incorrect login."); return; }

    // Sync new account to Firestore/Firebase Auth
    await cloudSyncOnLogin(email, pin, family);

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

    const retLoginBtn = returningLoginForm.querySelector("button[type='submit']");
    if (retLoginBtn) { retLoginBtn.textContent = "Logging in..."; retLoginBtn.disabled = true; }
    const resetRetLoginBtn = () => { if (retLoginBtn) { retLoginBtn.textContent = "Log in"; retLoginBtn.disabled = false; } };

    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        const authPwd = buildCloudAuthPassword(email, pin);
        const signInRes = await firebaseAuth.signInWithEmailAndPassword(email, authPwd);
        if (signInRes.user) {
          // Check email verification — only enforce for brand-new accounts (no existing family)
          if (!signInRes.user.emailVerified) {
            const existingSnap = await firebaseDb.collection("families").where("ownerUid", "==", signInRes.user.uid).limit(1).get();
            if (existingSnap.empty) {
              resetRetLoginBtn();
              showToast("Please verify your email first. Check your inbox for a verification link.");
              try { await signInRes.user.sendEmailVerification({ url: "https://choreheroes.app" }); } catch(e) {}
              return;
            }
            showToast("Tip: verify your email address for better account security.");
          }
          const snap = await firebaseDb.collection("families").where("ownerUid", "==", signInRes.user.uid).limit(1).get();
          if (!snap.empty) {
            const cloudFamily = await fbPullFamily(snap.docs[0].id);
            cloudFamily.parentEmail = email;
            cloudFamily.parentEmailLower = email;
            cloudFamily.cloudAuthKey = authPwd;
            upsertFamilyInState(cloudFamily);
            authStage = "login"; authView = "parent"; authAccountJustCreated = false;
            state.session = { familyId: cloudFamily.id, role: "parent" };
            currentKidId = null; currentKidView = "dashboard"; currentFamilyMode = false; currentAssignedKids = [];
            saveState({ skipCloud: true });
            renderApp();
            return;
          } else {
            resetRetLoginBtn();
            showToast("Account not found. Please create a new account.");
            return;
          }
        }
      } catch (cloudErr) {
        resetRetLoginBtn();
        console.warn("Cloud login failed:", cloudErr.message);
      }
    }

    const retHashedPin = await hashPin(pin);
    const family = state.families.find((entry) => entry.parentEmailLower === email && (entry.parentPin === pin || entry.parentPin === retHashedPin));
    if (!family) {
      resetRetLoginBtn();
      showToast("Incorrect login.");
      return;
    }

    authStage = "login";
    authView = "parent";
    authAccountJustCreated = false;
    state.session = { familyId: family.id, role: "parent" };
    currentKidId = null;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];

    // Always pull fresh from Firestore so isPro/proTier are never stale
    if (firebaseDb && family.id) {
      try {
        const freshSnap = await firebaseDb.collection("families").doc(family.id).get();
        if (freshSnap.exists) {
          const d = freshSnap.data();
          family.isPro = d.isPro || false;
          family.proTier = d.proTier || null;
          family.trialEndsAt = d.trialEndsAt || null;
          family.ownerUid = d.ownerUid || family.ownerUid || "";
          family.haWebhookUrl = d.haWebhookUrl || null;
        }
      } catch(e) { console.warn("Firestore refresh on login failed:", e.message); }
    }

    saveState({ skipCloud: true });
    renderApp();
    return;
  }

  const resetPasscodeForm = event.target.closest("#reset-passcode-form");
  if (resetPasscodeForm) {
    event.preventDefault();
    const usernameInput = resetPasscodeForm.querySelector('input[name="username"]');
    const currentPasswordInput = resetPasscodeForm.querySelector('input[name="currentPassword"]');
    const newPasswordInput = resetPasscodeForm.querySelector('input[name="newPassword"]');
    const email = String(usernameInput?.value || "").trim().toLowerCase();
    const currentPassword = String(currentPasswordInput?.value || "").trim();
    const newPassword = String(newPasswordInput?.value || "").trim();

    if (!email) { showToast("Enter your email first."); return; }
    if (!currentPassword) { showToast("Enter your current PIN."); return; }
    if (!newPassword) { showToast("Enter a new PIN."); return; }
    if (!isValidParentPin(newPassword)) {
      showToast("New PIN is too weak — avoid sequences like 1234 or repeated digits.");
      return;
    }

    const family = state.families.find((entry) => entry.parentEmailLower === email);
    if (!family) { showToast("No account found for that email."); return; }

    // Verify current PIN
    const currentPinOk = await verifyPin(currentPassword, family.parentPin);
    if (!currentPinOk) { showToast("Current PIN is incorrect."); return; }

    const hashedNew = await hashPin(newPassword);
    family.parentPin = hashedNew;

    // Update Firebase Auth password too
    if (cloudAuthEnabled && cloudModeEnabled && firebaseAuth) {
      try {
        const oldAuthPwd = "chores::" + email + "::" + currentPassword + "::v1";
        const newAuthPwd = "chores::" + email + "::" + newPassword + "::v1";
        const signInRes = await firebaseAuth.signInWithEmailAndPassword(email, oldAuthPwd);
        if (signInRes.user) await signInRes.user.updatePassword(newAuthPwd);
      } catch(e) { console.warn("Firebase password update failed:", e.message); }
    }

    saveState({ skipCloud: true });
    authResetPasscodeOpen = false;
    renderAuthHome();
    showToast("PIN updated successfully.");
    return;
  }

  const kidLoginForm = event.target.closest("#kid-login-form");
  if (kidLoginForm) {
    event.preventDefault();
    const kidLoginBtn = kidLoginForm.querySelector("button[type='submit']");
    if (kidLoginBtn) { kidLoginBtn.textContent = "Logging in..."; kidLoginBtn.disabled = true; }
    const resetKidLoginBtn = () => { if (kidLoginBtn) { kidLoginBtn.textContent = "Log in as kid"; kidLoginBtn.disabled = false; } };
    const formData = new FormData(kidLoginForm);
    const email = String(formData.get("familyEmail") || "").trim().toLowerCase();
    const kidName = String(formData.get("kidName") || "").trim().toLowerCase();
    const kidPin = String(formData.get("kidPin") || "").trim();
    if (!isValidKidPin(kidPin)) {
      resetKidLoginBtn(); showToast("Kid PIN must be exactly 4 digits."); return;
    }
    if (!checkLoginRateLimit(email + ":" + kidName)) { resetKidLoginBtn(); return; }
    const family = state.families.find((entry) => entry.parentEmailLower === email);
    const kidCandidate = family?.kids.find((entry) => entry.name.trim().toLowerCase() === kidName);
    const kidPinOk = kidCandidate ? await verifyPin(kidPin, kidCandidate.kidPin) : false;
    if (!family || !kidCandidate || !kidPinOk) { resetKidLoginBtn(); showToast("Incorrect kid login."); return; }
    if (kidCandidate.kidPin && !/^[0-9a-f]{64}$/.test(kidCandidate.kidPin)) { kidCandidate.kidPin = await hashPin(kidPin); saveState({ skipCloud: true }); }
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

    if (!title || !Number.isFinite(cost) || cost < 1 || !targetKids.length) {
      if (!targetKids.length) showToast("Select at least one kid for this reward.");
      return;
    }
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

    if (!kidId || !Number.isFinite(points) || points < 1 || !Number.isFinite(dollars) || dollars < 1) return;
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
    if (!childName || !childPin) return;
    if (!isValidKidPin(childPin)) {
      showToast("Child PIN must be exactly 4 digits.");
      return;
    }
    addChild(childName, childPin);
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
    if (!thresholdKidIds.length || !Number.isFinite(threshold) || threshold < 1) return;
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

    if (!title || !Number.isFinite(points) || points < 1 || !timeValue || !assignedKids.length) return;
    if (recurring === "custom-date" && !customDate) {
      showToast("Choose the custom date for this task.");
      return;
    }

    addTask(assignedKids, title, points, recurring, timeValue, customDate);
    saveState();
    currentAssignedKids = [];
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

    if (!reason || !Number.isFinite(value) || !adjustmentKidIds.length) return;
    addReason(adjustmentKidIds, label, reason);
    addAdjustment(adjustmentKidIds, label, label === "penalty" ? -Math.abs(value) : Math.abs(value), reason);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => r.unregister());
  });
  caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}



// ── Error monitoring ──────────────────────────────────────────
const ERROR_ENDPOINT = "https://us-central1-chores-c605d.cloudfunctions.net/logError";
let _errorReportCount = 0;

function reportError(message, source, stack) {
  if (_errorReportCount >= 5) return;
  _errorReportCount++;

  const ignore = ["ResizeObserver loop", "Non-Error promise rejection", "Load failed", "NetworkError", "Script error"];
  if (ignore.some(i => (message || "").includes(i))) return;

  const family = getCurrentFamily?.();
  try {
    fetch(ERROR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: String(message || "").substring(0, 500),
        source: String(source || "").substring(0, 200),
        stack: String(stack || "").substring(0, 2000),
        userAgent: navigator.userAgent.substring(0, 200),
        familyId: family?.id || null,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch(e) {}
}

// Catch unhandled JS errors
window.onerror = function(message, source, lineno, colno, error) {
  reportError(message, source + ":" + lineno + ":" + colno, error?.stack);
  return false;
};

// Catch unhandled promise rejections
window.addEventListener("unhandledrejection", function(event) {
  const msg = event.reason?.message || String(event.reason) || "Unhandled promise rejection";
  reportError(msg, "promise", event.reason?.stack);
});

// ── Handle Stripe redirect ────────────────────────────────────
(function handleStripeRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("subscribed") === "true") {
    history.replaceState({}, "", window.location.pathname);
    showToast("Welcome to ChoreHeroes Pro! Your subscription is active.");
  }
  if (params.get("cancelled") === "true") {
    history.replaceState({}, "", window.location.pathname);
    showToast("Subscription cancelled — you can try again anytime.");
  }
  // Landing page routing — store for after bootApp
  const viewParam = params.get("view");
  if (viewParam === "create" || viewParam === "returning") {
    history.replaceState({}, "", window.location.pathname);
    window._landingView = viewParam;
  }
})();

let initialAuthStatePromise = null;

function buildCloudAuthPassword(email, plainPin) {
  return "chores::" + String(email || "").trim().toLowerCase() + "::" + String(plainPin || "").trim() + "::v1";
}

function waitForInitialAuthState(timeoutMs = 3000) {
  if (!firebaseAuth) return Promise.resolve(null);
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);
  if (initialAuthStatePromise) return initialAuthStatePromise;

  initialAuthStatePromise = new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    const finish = (user) => {
      if (settled) return;
      settled = true;
      if (unsubscribe) unsubscribe();
      clearTimeout(timer);
      resolve(user || null);
    };
    unsubscribe = firebaseAuth.onAuthStateChanged(
      (user) => finish(user),
      () => finish(null)
    );
    const timer = window.setTimeout(() => finish(firebaseAuth.currentUser || null), timeoutMs);
  });

  return initialAuthStatePromise;
}

// Show brief loading screen then boot — prevents stale localStorage flash
async function bootApp() {
  // If no session, render immediately (login screen, no Firestore needed)
  if (!state.session || !firebaseDb) {
    renderApp();
    return;
  }

  const family = getCurrentFamily();
  if (!family || !family.id) {
    renderApp();
    return;
  }

  // For kid sessions, skip Firebase auth check — kids don't sign in via Firebase
  const isKidBoot = state.session?.role === "kid";

  // Kid sessions: render immediately, no Firestore refresh needed
  if (isKidBoot) {
    renderApp();
    return;
  }

  // For parent sessions, wait for Firebase auth state before fetching subscription data
  const authUser = await waitForInitialAuthState(2000);

  // No auth user means we can't safely read Firestore — just render with cached data
  if (!authUser) {
    renderApp();
    return;
  }

  // Show a minimal loading indicator while we fetch fresh subscription state
  const loader = document.createElement("div");
  loader.id = "boot-loader";
  loader.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(135deg,#1a1240 0%,#2d1b69 45%,#1a3a5c 100%);z-index:99999;">
      <div style="text-align:center;">
        <h1 style="color:#fff;font-size:2rem;font-weight:700;letter-spacing:0.05em;margin:0 0 12px;">ChoreHeroes</h1>
        <div style="width:40px;height:4px;background:rgba(255,255,255,0.3);border-radius:2px;margin:0 auto;overflow:hidden;">
          <div style="width:40%;height:100%;background:#fff;border-radius:2px;animation:bootSlide 1s ease-in-out infinite alternate;"></div>
        </div>
      </div>
    </div>
    <style>@keyframes bootSlide{from{transform:translateX(0)}to{transform:translateX(150%)}}</style>
  `;
  document.body.appendChild(loader);

  try {
    const snap = await firebaseDb.collection("families").doc(family.id).get();
    if (snap.exists) {
      const d = snap.data();
      family.isPro = d.isPro || false;
      family.proTier = d.proTier || null;
      family.trialEndsAt = d.trialEndsAt || null;
      family.ownerUid = d.ownerUid || family.ownerUid || "";
      family.haWebhookUrl = d.haWebhookUrl || null;
      family.stripeCustomerId = d.stripeCustomerId || null;
      family.subscriptionEndsAt = d.subscriptionEndsAt || null;
      saveState({ skipCloud: true });
    }
  } catch(e) {
    console.warn("Boot Firestore refresh failed:", e.message);
  } finally {
    loader.remove();
    renderApp();
  }
}

bootApp().then(() => {
  if (window._landingView) {
    authStage = "intro";
    authView = window._landingView;
    window._landingView = null;
    renderApp();
  }
  // Move trial banner to bottom
  setTimeout(() => {
    const banner = document.querySelector('.trial-banner');
    const actions = document.querySelector('.home-actions');
    if (banner && actions) {
      const clone = document.createElement('div');
      clone.className = 'trial-banner-bottom';
      clone.innerHTML = banner.innerHTML;
      actions.after(clone);
      clone.querySelectorAll('[data-manage-subscription]').forEach(btn => {
        btn.addEventListener('click', () => {
          const orig = document.querySelector('[data-manage-subscription="true"]');
          if (orig) orig.click();
        });
      });
    }
  }, 100);
  // Fix title after render
  const style = document.createElement("style");
  style.textContent = `.rainbow-title-new{font-family:'Baloo 2',cursive;font-size:52px!important;font-weight:800;letter-spacing:5px;display:flex;align-items:center;justify-content:center;gap:2px;margin:0;line-height:1}.rainbow-title-new .title-star{font-size:.4em;color:#fff;filter:drop-shadow(0 2px 4px rgba(255,255,255,.6));animation:title-letter-float 2.8s ease-in-out infinite}.rainbow-title-new>span:not(.title-star){display:inline-block;-webkit-text-stroke:4.5px rgba(255,255,255,.58);text-shadow:0 2px 0 rgba(255,255,255,.72),0 7px 0 rgba(25,19,58,.18),0 18px 28px rgba(25,19,58,.28);animation:title-letter-float 2.8s ease-in-out infinite}.rainbow-title-new>span:nth-child(2){color:#d44719;animation-delay:0ms}.rainbow-title-new>span:nth-child(3){color:#ee9412;animation-delay:80ms}.rainbow-title-new>span:nth-child(4){color:#1465cf;animation-delay:160ms}.rainbow-title-new>span:nth-child(5){color:#0a907f;animation-delay:240ms}.rainbow-title-new>span:nth-child(6){color:#7042d6;animation-delay:320ms}.rainbow-title-new>span:nth-child(7){color:#c22f7e;animation-delay:400ms}.rainbow-title-new>span:nth-child(8){color:#d44719;animation-delay:480ms}.rainbow-title-new>span:nth-child(9){color:#ee9412;animation-delay:560ms}.rainbow-title-new>span:nth-child(10){color:#1465cf;animation-delay:640ms}.rainbow-title-new>span:nth-child(11){color:#0a907f;animation-delay:720ms}.rainbow-title-new>span:nth-child(12){color:#7042d6;animation-delay:800ms}.rainbow-title-new>span:nth-child(13){color:#fff}`;
  document.head.appendChild(style);
  const h1 = document.querySelector(".rainbow-title,.rainbow-title-new");
  if (h1) {
    h1.className = "rainbow-title-new";
    h1.setAttribute("aria-label", "ChoreHeroes");
    h1.innerHTML = `<span class="title-star" aria-hidden="true">✦</span><span aria-hidden="true">C</span><span aria-hidden="true">h</span><span aria-hidden="true">o</span><span aria-hidden="true">r</span><span aria-hidden="true">e</span><span aria-hidden="true">H</span><span aria-hidden="true">e</span><span aria-hidden="true">r</span><span aria-hidden="true">o</span><span aria-hidden="true">e</span><span aria-hidden="true">s</span><span class="title-star" aria-hidden="true">✦</span>`;
  }
});

async function bootstrapCloudSessionIfAvailable() {
  // No-op — replaced by bootApp() above
}

// ── FIREBASE SYNC LAYER ───────────────────────────────────────
var _fbWriteQueue = Promise.resolve();
function fbEnqueue(fn) {
  _fbWriteQueue = _fbWriteQueue.then(fn).catch(function(err) {
    console.warn("Firebase write failed:", err.message || err);
  });
  return _fbWriteQueue;
}

function kidToFirestoreDoc(kid) {
  return {
    id: kid.id, name: kid.name, kidPin: kid.kidPin || "", avatar: kid.avatar || "",
    accentColour: kid.accentColour || "#6dafff", accentColourDeep: kid.accentColourDeep || "#3f84db",
    points: kid.points || 0, pointsPerDollarReward: kid.pointsPerDollarReward || 100,
    dollarRewardValue: kid.dollarRewardValue || 20, celebrationThreshold: kid.celebrationThreshold || 100,
    lastCelebratedThreshold: kid.lastCelebratedThreshold || 0, missedDaysInARow: kid.missedDaysInARow || 0,
    lastMissedCheckDate: kid.lastMissedCheckDate || null, lastTaskRefreshDate: kid.lastTaskRefreshDate || getTodayDateKey(),
    due: kid.due || [], awaiting: kid.awaiting || [], completed: kid.completed || [],
    taskTemplates: kid.taskTemplates || [], rewards: kid.rewards || [],
    bonusPenalty: kid.bonusPenalty || [], bonusReasons: kid.bonusReasons || [],
    penaltyReasons: kid.penaltyReasons || [], pointsHistory: (kid.pointsHistory || []).slice(-200),
  };
}

function firestoreDocToKid(doc) { return normalizeKid(doc); }

async function fbPushKid(familyId, kid) {
  if (!firebaseDb) return;
  await firebaseDb.collection("families").doc(familyId).collection("kids").doc(kid.id).set(kidToFirestoreDoc(kid), { merge: true });
}

async function fbPushFamily(family) {
  if (!firebaseDb) return;
  var famRef = firebaseDb.collection("families").doc(family.id);
  await famRef.set({
    familyName: family.familyName,
    parentName: family.parentName || "Parent",
    parentPin: family.parentPin || "",
    ownerUid: family.ownerUid || "",
    favorClaims: Array.isArray(family.favorClaims) ? family.favorClaims : [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    isPro: family.isPro || false,
    proTier: family.proTier || null,
    trialEndsAt: family.trialEndsAt || null,
  }, { merge: true });
  var batch = firebaseDb.batch();
  (family.kids || []).forEach(function(kid) { batch.set(famRef.collection("kids").doc(kid.id), kidToFirestoreDoc(kid), { merge: true }); });
  await batch.commit();
}

async function fbPullFamily(familyId) {
  if (!firebaseDb) throw new Error("Firebase not initialised");
  var famSnap = await firebaseDb.collection("families").doc(familyId).get();
  if (!famSnap.exists) throw new Error("Family not found in Firestore");
  var famData = famSnap.data();
  var kidsSnap = await firebaseDb.collection("families").doc(familyId).collection("kids").get();
  var kids = kidsSnap.docs.map(function(d) { return firestoreDocToKid(d.data()); });
  return normalizeFamily({ id: familyId, familyName: famData.familyName || "", parentName: famData.parentName || "Parent", parentPin: famData.parentPin || "", parentEmail: famData.parentEmail || "", parentEmailLower: famData.parentEmailLower || "", ownerUid: famData.ownerUid || "", kids: kids, favorClaims: famData.favorClaims || [], isPro: famData.isPro || false, proTier: famData.proTier || null, trialEndsAt: famData.trialEndsAt || null, stripeCustomerId: famData.stripeCustomerId || null, haWebhookUrl: famData.haWebhookUrl || null, subscriptionEndsAt: famData.subscriptionEndsAt || null });
}

function cloudSave(kidId) {
  if (!cloudAuthEnabled || !cloudModeEnabled || !firebaseDb) return;
  var family = getCurrentFamily(); if (!family) return;
  if (kidId) { var kid = getKid(kidId); if (kid) { fbEnqueue(function() { return fbPushKid(family.id, kid); }); return; } }
  fbEnqueue(function() { return fbPushFamily(family); });
}

async function cloudSyncOnLogin(email, plainPin, localFamily) {
  if (!firebaseAuth || !firebaseDb) return;
  var authPwd = buildCloudAuthPassword(email, plainPin);
  var user = null;
  try {
    var signInRes = await firebaseAuth.signInWithEmailAndPassword(email, authPwd);
    user = signInRes.user;
  } catch(signInErr) {
    if (["auth/user-not-found","auth/invalid-credential","auth/wrong-password","auth/invalid-login-credentials","auth/invalid-email"].includes(signInErr.code)) {
      try {
        var signUpRes = await firebaseAuth.createUserWithEmailAndPassword(email, authPwd);
        user = signUpRes.user;
      } catch(signUpErr) { console.warn("Firebase signup failed:", signUpErr.code); return; }
    } else { console.warn("Firebase sign in failed:", signInErr.message); return; }
  }
  if (!user) return;
  var existingSnap = await firebaseDb.collection("families").where("ownerUid", "==", user.uid).limit(1).get();
  if (!existingSnap.empty) {
    try {
      var cloudFamilyId = existingSnap.docs[0].id;
      var cloudFamily = await fbPullFamily(cloudFamilyId);
      cloudFamily.parentEmail = localFamily.parentEmail;
      cloudFamily.parentEmailLower = localFamily.parentEmailLower;
      upsertFamilyInState(cloudFamily);
      state.session = { familyId: cloudFamily.id, role: "parent" };
      saveState({ skipCloud: true }); renderApp();
      showToast("Synced from cloud \u2713");
    } catch(e) { console.warn("Firebase pull failed:", e.message); }
    return;
  }
  try {
    localFamily.ownerUid = user.uid;
    var trialEnd = new Date(); trialEnd.setDate(trialEnd.getDate() + 30);
    await firebaseDb.collection("families").doc(localFamily.id).set({ familyName: localFamily.familyName, parentName: localFamily.parentName || "Parent", parentPin: localFamily.parentPin || "", parentEmail: localFamily.parentEmail || "", parentEmailLower: localFamily.parentEmailLower || "", ownerUid: user.uid, favorClaims: localFamily.favorClaims || [], createdAt: firebase.firestore.FieldValue.serverTimestamp(), trialEndsAt: trialEnd.toISOString(), isPro: false, proTier: null });
    var batch = firebaseDb.batch();
    (localFamily.kids || []).forEach(function(kid) { batch.set(firebaseDb.collection("families").doc(localFamily.id).collection("kids").doc(kid.id), kidToFirestoreDoc(kid)); });
    await batch.commit();
    saveState({ skipCloud: true });
    showToast("Synced to cloud \u2713");
  } catch(e) { console.warn("Firebase push failed:", e.message); }
}

// ── OFFLINE INDICATOR ─────────────────────────────────────────
(function initOfflineIndicator() {
  var banner = null;
  function showOfflineBanner() {
    if (banner) return;
    banner = document.createElement("div"); banner.className = "offline-banner";
    banner.textContent = "You\u2019re offline \u2014 changes are saved on this device";
    document.body.appendChild(banner);
  }
  function hideOfflineBanner() {
    if (!banner) return; banner.classList.add("offline-banner--hide");
    setTimeout(function() { if (banner) { banner.remove(); banner = null; } }, 400);
  }
  if (!navigator.onLine) showOfflineBanner();
  window.addEventListener("offline", showOfflineBanner);
  window.addEventListener("online", function() { hideOfflineBanner(); showToast("Back online \u2713"); });
})();
