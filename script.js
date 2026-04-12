const STORAGE_KEY = "chores-multi-family-state-v1";
const cloudConfig = window.CHORES_SUPABASE_CONFIG || {};
const cloudModeEnabled = Boolean(cloudConfig.enabled && cloudConfig.url && cloudConfig.anonKey);
const cloudAuthEnabled = false;
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

let cloudSyncQueue = Promise.resolve();
let cloudBootstrapStarted = false;
const MAX_CREATE_KIDS = 10;
const BASE_CREATE_FIELDS = [
  { name: "familyName", placeholder: "Family name", type: "text" },
  { name: "parentName", placeholder: "Parent name", type: "text" },
  { name: "parentEmail", placeholder: "Parent email", type: "email" },
  { name: "parentPin", placeholder: "Parent PIN", type: "password" },
  { name: "confirmParentPin", placeholder: "Confirm parent PIN", type: "password" },
];
const AVATAR_LIBRARY = [
  { id: "sun-lion", emoji: "🦁", label: "Sunny Lion" },
  { id: "dream-bunny", emoji: "🐰", label: "Dream Bunny" },
  { id: "rocket-bear", emoji: "🐻", label: "Rocket Bear" },
  { id: "sparkle-cat", emoji: "🐱", label: "Sparkle Cat" },
  { id: "giggle-fox", emoji: "🦊", label: "Giggle Fox" },
  { id: "happy-koala", emoji: "🐨", label: "Happy Koala" },
  { id: "party-panda", emoji: "🐼", label: "Party Panda" },
  { id: "star-tiger", emoji: "🐯", label: "Star Tiger" },
];

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
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
  }

  return draft;
}

function getDefaultAvatarPreset(name = "") {
  const clean = String(name || "").trim().toLowerCase();
  const seed = Array.from(clean).reduce((total, char) => total + char.charCodeAt(0), 0);
  return `preset:${AVATAR_LIBRARY[seed % AVATAR_LIBRARY.length].id}`;
}

function createKid(name, kidPin, avatar = getDefaultAvatarPreset(name)) {
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
    rewards: [],
    bonusPenalty: [
      { type: "bonus", title: "+0 points", value: "+0 points" },
      { type: "penalty", title: "-0 points", value: "-0 points" },
    ],
    bonusReasons: [],
    penaltyReasons: [],
    missedDaysInARow: 0,
    lastMissedCheckDate: null,
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
  const avatarValue = typeof kid.avatar === "string" ? kid.avatar : "";
  const normalizedAvatar = avatarValue.startsWith("data:image") || avatarValue.startsWith("preset:")
    ? avatarValue
    : getDefaultAvatarPreset(kid.name || "Kid");
  return {
    id: kid.id || createId("kid"),
    name: kid.name || "Kid",
    kidPin: kid.kidPin || "",
    avatar: normalizedAvatar,
    points: Number.isFinite(Number(kid.points)) ? Number(kid.points) : 0,
    pointsPerDollarReward: Number.isFinite(Number(kid.pointsPerDollarReward)) ? Number(kid.pointsPerDollarReward) : 100,
    dollarRewardValue: Number.isFinite(Number(kid.dollarRewardValue)) ? Number(kid.dollarRewardValue) : 20,
    celebrationThreshold: Number.isFinite(Number(kid.celebrationThreshold)) ? Number(kid.celebrationThreshold) : 100,
    lastCelebratedThreshold: Number.isFinite(Number(kid.lastCelebratedThreshold)) ? Number(kid.lastCelebratedThreshold) : 0,
    due: Array.isArray(kid.due) ? kid.due : [],
    awaiting: Array.isArray(kid.awaiting) ? kid.awaiting : [],
    completed: Array.isArray(kid.completed) ? kid.completed : [],
    rewards: Array.isArray(kid.rewards) ? kid.rewards : [],
    bonusPenalty: Array.isArray(kid.bonusPenalty) && kid.bonusPenalty.length
      ? kid.bonusPenalty.map((entry) => ({
          type: entry.type || "bonus",
          title: entry.title || "",
          value: entry.value || "",
        }))
      : [
          { type: "bonus", title: "+0 points", value: "+0 points" },
          { type: "penalty", title: "-0 points", value: "-0 points" },
        ],
    bonusReasons: Array.isArray(kid.bonusReasons) ? kid.bonusReasons : [],
    penaltyReasons: Array.isArray(kid.penaltyReasons) ? kid.penaltyReasons : [],
    missedDaysInARow: Number.isFinite(Number(kid.missedDaysInARow)) ? Number(kid.missedDaysInARow) : 0,
    lastMissedCheckDate: kid.lastMissedCheckDate || null,
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

function saveState(options = {}) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!options.skipCloud && cloudAuthEnabled && cloudModeEnabled && isParentSession()) {
    void queueCloudSync();
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateMissedStreaksForToday() {
  const todayKey = getTodayKey();
  let didUpdate = false;

  state.families.forEach((family) => {
    family.kids.forEach((kid) => {
      if (kid.lastMissedCheckDate === todayKey) return;
      kid.missedDaysInARow = kid.due.length ? (Number(kid.missedDaysInARow) || 0) + 1 : 0;
      kid.lastMissedCheckDate = todayKey;
      didUpdate = true;
    });
  });

  if (didUpdate) saveState();
}

updateMissedStreaksForToday();

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
let pendingCloudFamilyDraft = null;
let currentSettingsSection = "";
let currentFamilyControlsSection = "";
let currentChildAvatarPreset = AVATAR_LIBRARY[0].id;
let currentAvatarEditKidId = "";
let currentAvatarLibrarySelection = AVATAR_LIBRARY[0].id;

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
let currentKidId = null;
let currentKidView = "dashboard";
let currentFamilyMode = false;
let currentAssignedKids = [];
let currentRewardAssignedKids = [];
let currentThresholdAssignedKids = [];
let isAssignPopupOpen = false;
let assignPopupPlacement = "task";

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

function getAvatarPreset(avatarValue) {
  const presetId = String(avatarValue || "").replace(/^preset:/, "");
  return AVATAR_LIBRARY.find((entry) => entry.id === presetId) || AVATAR_LIBRARY[0];
}

function renderAvatar(kid) {
  if (typeof kid.avatar === "string" && kid.avatar.startsWith("data:image")) {
    return `<img src="${kid.avatar}" alt="${escapeHtml(kid.name)} avatar" class="avatar-image" />`;
  }

  const preset = getAvatarPreset(kid.avatar);
  return `
    <span class="avatar-window">
      <span class="avatar-peeker" aria-hidden="true">${preset.emoji}</span>
      <span class="avatar-sill" aria-hidden="true"></span>
    </span>
  `;
}

function renderAvatarLibraryOptions({ inputName, selectedValue }) {
  return `
    <div class="avatar-library-grid">
      ${AVATAR_LIBRARY.map((avatar) => `
        <label class="avatar-library-option ${selectedValue === avatar.id ? "active" : ""}">
          <input type="radio" name="${escapeHtml(inputName)}" value="${escapeHtml(avatar.id)}" ${selectedValue === avatar.id ? "checked" : ""} />
          <span class="avatar-library-preview" aria-hidden="true">
            <span class="avatar-window">
              <span class="avatar-peeker">${avatar.emoji}</span>
              <span class="avatar-sill"></span>
            </span>
          </span>
          <span class="avatar-library-label">${escapeHtml(avatar.label)}</span>
        </label>
      `).join("")}
    </div>
  `;
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

  if (cloudAuthEnabled && cloudModeEnabled) {
    try {
      const family = await createCloudFamilyAccount({ familyName, parentName, parentEmail, parentPin, kids });
      upsertFamilyInState(family);
      pendingCloudFamilyDraft = null;
      authAccountReady = true;
      authAccountJustCreated = true;
      authStage = "login";
      authView = "parent";
      resetCreateAccountDraft();
      await supabaseClient.auth.signOut().catch(() => {
        // If sign-out fails, we still continue to the login step.
      });
      state.session = null;
      currentKidId = null;
      currentKidView = "dashboard";
      currentFamilyMode = false;
      currentAssignedKids = [];
      saveState({ skipCloud: true });
      showToast("Account created. Log in as parent to continue.");
      renderAuthHome();
    } catch (error) {
      const message = String(error?.message || "");
      if (/rate limit/i.test(message) || /already registered/i.test(message)) {
        upsertLocalFamilyDraft({ familyName, parentName, parentEmail, parentPin, kids });
        pendingCloudFamilyDraft = { familyName, parentName, parentEmail, parentPin, kids };
        authAccountReady = true;
        authAccountJustCreated = false;
        authStage = "login";
        authView = "parent";
        saveState({ skipCloud: true });
        renderAuthHome();
        showToast("Cloud signup is busy. You can log in on this device now, and sync can catch up later.");
        return;
      }
      showToast(message || "Could not create the family account.");
    }
    return;
  }

  const family = createFamily({ familyName, parentName, parentEmail, parentPin, kids });
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
  saveState();
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

function addAdjustment(kidIds, label, value) {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    const type = label.toLowerCase();
    const previousPoints = kid.points;
    kid.bonusPenalty = kid.bonusPenalty.filter((entry) => (entry.type || "").toLowerCase() !== type);
    kid.bonusPenalty.push({
      type,
      title: `${value > 0 ? "+" : ""}${value} points`,
      value: `${value > 0 ? "+" : ""}${value} points`,
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

function addChild(name, kidPin, avatar = getDefaultAvatarPreset(name)) {
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
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    kid.due.push({
      id: createId("task"),
      title,
      detail: buildTaskDetail(recurring, time, customDate ? formatCustomDate(customDate) : ""),
      points,
      recurring,
      time,
      customDate,
    });
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
    kid.lastCelebratedThreshold = 0;
    kid.missedDaysInARow = 0;
    kid.lastMissedCheckDate = getTodayKey();
  });
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
  isAssignPopupOpen = false;
  assignPopupPlacement = "task";
  authStage = "intro";
  authView = "";
  authAccountJustCreated = false;
  authAccountReady = state.families.length > 0;
  resetCreateAccountDraft();
  saveState({ skipCloud: true });
  return true;
}

async function logout() {
  if (cloudAuthEnabled && cloudModeEnabled && isParentSession() && supabaseClient) {
    await supabaseClient.auth.signOut().catch(() => {
      // Local logout still happens even if cloud sign out fails.
    });
  }

  state.session = null;
  currentKidId = null;
  currentKidView = "dashboard";
  currentFamilyMode = false;
  currentAssignedKids = [];
  isAssignPopupOpen = false;
  assignPopupPlacement = "task";
  saveState();
  renderApp();
}

function mapKidRowsToKidState(kidRow, taskRows, rewardRows, adjustmentRows, reasonRows) {
  const tasks = taskRows.filter((task) => task.kid_id === kidRow.id);
  const kidAdjustments = adjustmentRows
    .filter((entry) => entry.kid_id === kidRow.id)
    .sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  const latestBonus = kidAdjustments.find((entry) => entry.adjustment_type === "bonus");
  const latestPenalty = kidAdjustments.find((entry) => entry.adjustment_type === "penalty");

  return normalizeKid({
    id: kidRow.id,
    name: kidRow.name,
    kidPin: kidRow.kid_pin_hash || "",
    avatar: kidRow.avatar || kidRow.name.trim().charAt(0).toUpperCase() || "K",
    points: kidRow.points,
    pointsPerDollarReward: kidRow.points_per_dollar_reward,
    dollarRewardValue: kidRow.dollar_reward_value,
    celebrationThreshold: kidRow.celebration_threshold,
    lastCelebratedThreshold: kidRow.last_celebrated_threshold,
    missedDaysInARow: kidRow.missed_days_in_a_row,
    lastMissedCheckDate: kidRow.last_missed_check_date,
    due: tasks
      .filter((task) => task.status === "due")
      .map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.detail,
        points: task.points,
        recurring: task.recurring_key,
        time: task.due_time_label,
      })),
    awaiting: tasks
      .filter((task) => task.status === "awaiting")
      .map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.detail,
        points: task.points,
        recurring: task.recurring_key,
        time: task.due_time_label,
      })),
    completed: tasks
      .filter((task) => task.status === "completed")
      .map((task) => ({
        id: task.id,
        title: task.title,
        detail: task.detail,
        points: task.points,
        recurring: task.recurring_key,
        time: task.due_time_label,
      })),
    rewards: rewardRows
      .filter((reward) => reward.kid_id === kidRow.id)
      .map((reward) => ({
        id: reward.id,
        title: reward.title,
        cost: reward.cost,
      })),
    bonusPenalty: [
      {
        type: "bonus",
        title: latestBonus?.display_value || "+0 points",
        value: latestBonus?.display_value || "+0 points",
      },
      {
        type: "penalty",
        title: latestPenalty?.display_value || "-0 points",
        value: latestPenalty?.display_value || "-0 points",
      },
    ],
    bonusReasons: reasonRows
      .filter((entry) => entry.kid_id === kidRow.id && entry.reason_type === "bonus")
      .map((entry) => entry.reason),
    penaltyReasons: reasonRows
      .filter((entry) => entry.kid_id === kidRow.id && entry.reason_type === "penalty")
      .map((entry) => entry.reason),
  });
}

async function fetchCloudFamilyForUser(user) {
  if (!supabaseClient || !user) return null;

  const { data: memberships, error: membershipError } = await supabaseClient
    .from("parent_memberships")
    .select("family_id, parent_name, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError) throw membershipError;
  if (!memberships?.length) return null;

  const membership = memberships[0];
  const familyId = membership.family_id;

  const [
    { data: familyRow, error: familyError },
    { data: kidRows, error: kidsError },
    { data: settingsRow, error: settingsError },
  ] = await Promise.all([
    supabaseClient.from("families").select("id, family_name, created_at").eq("id", familyId).single(),
    supabaseClient.from("kids").select("*").eq("family_id", familyId).order("created_at", { ascending: true }),
    supabaseClient.from("family_settings").select("*").eq("family_id", familyId).maybeSingle(),
  ]);

  if (familyError) throw familyError;
  if (kidsError) throw kidsError;
  if (settingsError) throw settingsError;

  const kidIds = (kidRows || []).map((kid) => kid.id);
  let taskRows = [];
  let rewardRows = [];
  let adjustmentRows = [];
  let reasonRows = [];

  if (kidIds.length) {
    const [
      { data: fetchedTasks, error: tasksError },
      { data: fetchedRewards, error: rewardsError },
      { data: fetchedAdjustments, error: adjustmentsError },
      { data: fetchedReasons, error: reasonsError },
    ] = await Promise.all([
      supabaseClient.from("tasks").select("*").in("kid_id", kidIds).order("created_at", { ascending: true }),
      supabaseClient.from("rewards").select("*").in("kid_id", kidIds).order("created_at", { ascending: true }),
      supabaseClient.from("adjustments").select("*").in("kid_id", kidIds).order("created_at", { ascending: true }),
      supabaseClient.from("reason_lists").select("*").in("kid_id", kidIds).order("created_at", { ascending: true }),
    ]);

    if (tasksError) throw tasksError;
    if (rewardsError) throw rewardsError;
    if (adjustmentsError) throw adjustmentsError;
    if (reasonsError) throw reasonsError;

    taskRows = fetchedTasks || [];
    rewardRows = fetchedRewards || [];
    adjustmentRows = fetchedAdjustments || [];
    reasonRows = fetchedReasons || [];
  }

  return normalizeFamily({
    id: familyRow.id,
    familyName: familyRow.family_name,
    parentName: membership.parent_name || user.user_metadata?.parent_name || "Parent",
    parentEmail: user.email || "",
    parentEmailLower: (user.email || "").toLowerCase(),
    parentPin: settingsRow?.parent_pin_hash || "",
    createdAt: familyRow.created_at,
    kids: (kidRows || []).map((kidRow) => mapKidRowsToKidState(kidRow, taskRows, rewardRows, adjustmentRows, reasonRows)),
  });
}

async function createCloudFamilyDataForUser(user, { familyName, parentName, parentPin, kids }) {
  const { data: familyRow, error: familyError } = await supabaseClient
    .from("families")
    .insert({ family_name: familyName })
    .select("id, family_name, created_at")
    .single();

  if (familyError) throw familyError;

  const { error: membershipError } = await supabaseClient.from("parent_memberships").insert({
    family_id: familyRow.id,
    user_id: user.id,
    parent_name: parentName,
  });

  if (membershipError) throw membershipError;

  const { error: settingsError } = await supabaseClient.from("family_settings").upsert({
    family_id: familyRow.id,
    parent_pin_hash: parentPin,
  });

  if (settingsError) throw settingsError;

  if (kids.length) {
    const { error: kidsError } = await supabaseClient.from("kids").insert(
      kids.map((kid) => ({
        id: kid.id,
        family_id: familyRow.id,
        name: kid.name,
        avatar: kid.avatar,
        kid_pin_hash: kid.kidPin,
        points: kid.points,
        points_per_dollar_reward: kid.pointsPerDollarReward,
        dollar_reward_value: kid.dollarRewardValue,
        celebration_threshold: kid.celebrationThreshold,
        last_celebrated_threshold: kid.lastCelebratedThreshold,
        missed_days_in_a_row: kid.missedDaysInARow,
        last_missed_check_date: kid.lastMissedCheckDate,
      }))
    );

    if (kidsError) throw kidsError;
  }

  return fetchCloudFamilyForUser(user);
}

async function createCloudFamilyAccount({ familyName, parentName, parentEmail, parentPin, kids }) {
  if (!supabaseClient) throw new Error("Cloud sync is not configured yet.");
  const authPassword = buildCloudAuthPassword(parentEmail, parentPin);

  const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
    email: parentEmail,
    password: authPassword,
    options: {
      data: {
        parent_name: parentName,
        family_name: familyName,
      },
    },
  });

  if (signUpError) throw signUpError;

  let session = signUpData.session;
  if (!session) {
    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: parentEmail,
      password: authPassword,
    });

    if (signInError || !signInData.session) {
      throw new Error("Signup worked, but Supabase still needs email confirmation. In Supabase, disable Confirm email for now or confirm the email before logging in.");
    }

    session = signInData.session;
  }

  const user = session.user;
  return createCloudFamilyDataForUser(user, { familyName, parentName, parentPin, kids });
}

async function loginCloudParent(parentEmail, parentPin) {
  if (!supabaseClient) throw new Error("Cloud sync is not configured yet.");
  const authPassword = buildCloudAuthPassword(parentEmail, parentPin);

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: parentEmail,
    password: authPassword,
  });

  if (error) throw error;
  return fetchCloudFamilyForUser(data.user);
}

function buildCloudTaskRows(family) {
  return family.kids.flatMap((kid) => (
    [
      ...kid.due.map((task) => ({ task, status: "due" })),
      ...kid.awaiting.map((task) => ({ task, status: "awaiting" })),
      ...kid.completed.map((task) => ({ task, status: "completed" })),
    ].map(({ task, status }) => ({
      id: task.id,
      kid_id: kid.id,
      title: task.title,
      detail: task.detail,
      points: Number(task.points) || 0,
      recurring_key: task.recurring || "daily",
      due_time_label: task.time || "",
      status,
    }))
  ));
}

function buildCloudRewardRows(family) {
  return family.kids.flatMap((kid) =>
    kid.rewards.map((reward) => ({
      id: reward.id,
      kid_id: kid.id,
      title: reward.title,
      cost: Number(reward.cost) || 0,
    }))
  );
}

function buildCloudAdjustmentRows(family) {
  return family.kids.flatMap((kid) =>
    kid.bonusPenalty.map((entry, index) => ({
      id: `${kid.id}-${entry.type || "adjustment"}-${index}`,
      kid_id: kid.id,
      adjustment_type: entry.type || "bonus",
      points_delta: Number(String(entry.value).replace(/[^\d-]/g, "")) || 0,
      display_value: entry.value || entry.title || "",
    }))
  );
}

function buildCloudReasonRows(family) {
  return family.kids.flatMap((kid) => ([
    ...kid.bonusReasons.map((reason, index) => ({
      id: `${kid.id}-bonus-reason-${index}`,
      kid_id: kid.id,
      reason_type: "bonus",
      reason,
    })),
    ...kid.penaltyReasons.map((reason, index) => ({
      id: `${kid.id}-penalty-reason-${index}`,
      kid_id: kid.id,
      reason_type: "penalty",
      reason,
    })),
  ]));
}

async function syncCurrentFamilyToCloud() {
  if (!supabaseClient || !isParentSession()) return;

  const family = getCurrentFamily();
  if (!family) return;

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session?.user) return;

  const userId = sessionData.session.user.id;
  const localKidIds = family.kids.map((kid) => kid.id);

  const { error: familyUpdateError } = await supabaseClient
    .from("families")
    .update({ family_name: family.familyName })
    .eq("id", family.id);

  if (familyUpdateError) throw familyUpdateError;

  const { error: membershipError } = await supabaseClient
    .from("parent_memberships")
    .upsert(
      {
        family_id: family.id,
        user_id: userId,
        parent_name: family.parentName,
      },
      { onConflict: "family_id,user_id" }
    );

  if (membershipError) throw membershipError;

  const { error: settingsError } = await supabaseClient.from("family_settings").upsert({
    family_id: family.id,
    parent_pin_hash: family.parentPin || null,
  });

  if (settingsError) throw settingsError;

  const { data: remoteKids, error: remoteKidsError } = await supabaseClient
    .from("kids")
    .select("id")
    .eq("family_id", family.id);

  if (remoteKidsError) throw remoteKidsError;

  const removedKidIds = (remoteKids || [])
    .map((entry) => entry.id)
    .filter((kidId) => !localKidIds.includes(kidId));

  if (removedKidIds.length) {
    const { error: deleteKidsError } = await supabaseClient.from("kids").delete().in("id", removedKidIds);
    if (deleteKidsError) throw deleteKidsError;
  }

  if (localKidIds.length) {
    const { error: upsertKidsError } = await supabaseClient.from("kids").upsert(
      family.kids.map((kid) => ({
        id: kid.id,
        family_id: family.id,
        name: kid.name,
        avatar: kid.avatar,
        kid_pin_hash: kid.kidPin || "",
        points: Number(kid.points) || 0,
        points_per_dollar_reward: Number(kid.pointsPerDollarReward) || 100,
        dollar_reward_value: Number(kid.dollarRewardValue) || 20,
        celebration_threshold: Number(kid.celebrationThreshold) || 100,
        last_celebrated_threshold: Number(kid.lastCelebratedThreshold) || 0,
        missed_days_in_a_row: Number(kid.missedDaysInARow) || 0,
        last_missed_check_date: kid.lastMissedCheckDate,
      }))
    );

    if (upsertKidsError) throw upsertKidsError;

    const deleteOps = [
      supabaseClient.from("tasks").delete().in("kid_id", localKidIds),
      supabaseClient.from("rewards").delete().in("kid_id", localKidIds),
      supabaseClient.from("adjustments").delete().in("kid_id", localKidIds),
      supabaseClient.from("reason_lists").delete().in("kid_id", localKidIds),
    ];

    const deleteResults = await Promise.all(deleteOps);
    const deleteError = deleteResults.find((result) => result.error)?.error;
    if (deleteError) throw deleteError;

    const taskRows = buildCloudTaskRows(family);
    const rewardRows = buildCloudRewardRows(family);
    const adjustmentRows = buildCloudAdjustmentRows(family);
    const reasonRows = buildCloudReasonRows(family);

    if (taskRows.length) {
      const { error } = await supabaseClient.from("tasks").insert(taskRows);
      if (error) throw error;
    }

    if (rewardRows.length) {
      const { error } = await supabaseClient.from("rewards").insert(rewardRows);
      if (error) throw error;
    }

    if (adjustmentRows.length) {
      const { error } = await supabaseClient.from("adjustments").insert(adjustmentRows);
      if (error) throw error;
    }

    if (reasonRows.length) {
      const { error } = await supabaseClient.from("reason_lists").insert(reasonRows);
      if (error) throw error;
    }
  }
}

function queueCloudSync() {
  cloudSyncQueue = cloudSyncQueue
    .then(() => syncCurrentFamilyToCloud())
    .catch((error) => {
      console.error("Cloud sync failed", error);
      showToast("Saved locally. Cloud sync needs attention.");
    });

  return cloudSyncQueue;
}

async function bootstrapCloudSessionIfAvailable() {
  if (!cloudAuthEnabled || !supabaseClient || cloudBootstrapStarted) return;
  cloudBootstrapStarted = true;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session?.user) return;

  const family = await fetchCloudFamilyForUser(data.session.user).catch((cloudError) => {
    console.error("Cloud bootstrap failed", cloudError);
    return null;
  });

  if (!family) return;

  upsertFamilyInState(family);
  if (!state.session || state.session.role === "parent") {
    state.session = { familyId: family.id, role: "parent" };
  }

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

function renderAuthHome() {
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
          <span class="title-star" aria-hidden="true">✦</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">O</span>
          <span aria-hidden="true">R</span>
          <span aria-hidden="true">E</span>
          <span aria-hidden="true">S</span>
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
  const family = getCurrentFamily();
  const kids = getFamilyKids();

  document.getElementById("page-home").innerHTML = `
    <div class="home-shell">
      <header class="home-header home-header--session">
        <button class="back-button home-logout-button" type="button" data-logout="true">Log out</button>
        <p class="eyebrow">${escapeHtml(family.familyName)} family</p>
        <h1 class="rainbow-title" aria-label="CHORES">
          <span class="title-star" aria-hidden="true">✦</span>
          <span aria-hidden="true">C</span>
          <span aria-hidden="true">H</span>
          <span aria-hidden="true">O</span>
          <span aria-hidden="true">R</span>
          <span aria-hidden="true">E</span>
          <span aria-hidden="true">S</span>
          <span class="title-star" aria-hidden="true">✦</span>
        </h1>
      </header>

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
  const parentFocusedNav = (currentKidView === "settings" || currentKidView === "report") && isParentSession();

  document.getElementById("page-kid").innerHTML = `
    <div class="kid-shell ${escapeHtml(shellClass)}">
      <header class="kid-header">
        <h1>${escapeHtml(pageTitle)}</h1>
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
        <button class="back-button" type="button" id="back-home">${isParentSession() ? "← Back to family" : "Log out"}</button>
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
                  <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                  <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
                  <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                  <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
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
                        <span>🥳</span><span>😄</span><span>😁</span><span>🤩</span><span>😆</span><span>🎉</span>
                        <span>😄</span><span>🥳</span><span>😁</span><span>🤩</span><span>😆</span><span>🎊</span>
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
            </div>

            <section class="reward-stack">
              ${renderTileBubbles()}
              <button class="favor-pill" type="button" data-view="favors">
                <span class="score-sparkles" aria-hidden="true"></span>
                <span>Buy favors with your points</span>
              </button>
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
                  <section class="report-tile ${escapeHtml(getShellClass(child.name, false))}">
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
                              <input type="text" name="title" placeholder="Task title" required />
                              ${renderAssignedKidsBlock()}
                              <select name="recurring" required>
                                <option value="daily">Daily</option>
                                <option value="every-other-day">Every other day</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                                <option value="custom-date">Custom date</option>
                              </select>
                              <input class="custom-date-field is-hidden" type="date" name="customDate" aria-label="Custom date" />
                              <label class="time-field" aria-label="Task time">
                                <input type="time" name="time" required />
                              </label>
                              <input type="number" name="points" placeholder="Points" min="1" required />
                              <div class="button-row">
                                <button class="action-button primary" type="submit">Add task</button>
                                <button class="action-button danger" type="button" data-reset-tasks="true">Reset tasks & points</button>
                              </div>
                            </form>
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
                                                <div class="avatar-picker-block">
                                                  <p class="assign-summary">Choose cartoon avatar</p>
                                                  ${renderAvatarLibraryOptions({ inputName: "childAvatarPreset", selectedValue: currentChildAvatarPreset })}
                                                </div>
                                                <div class="button-row">
                                                  <button class="action-button primary" type="submit">Add child</button>
                                                </div>
                                              </form>
                                              ${
                                                getFamilyKids().length
                                                  ? `
                                                    <div class="avatar-manager-block">
                                                      <p class="assign-summary">Change avatar for a kid</p>
                                                      <div class="assign-grid reward-assign-grid">
                                                        ${getFamilyKids()
                                                          .map(
                                                            (child) => `
                                                              <label class="assign-option">
                                                                <input type="radio" name="avatarTargetKid" value="${escapeHtml(child.id)}" ${currentAvatarEditKidId === child.id ? "checked" : ""} />
                                                                <span>${escapeHtml(child.name)}</span>
                                                              </label>
                                                            `
                                                          )
                                                          .join("")}
                                                      </div>
                                                      ${renderAvatarLibraryOptions({ inputName: "avatarLibrarySelection", selectedValue: currentAvatarLibrarySelection })}
                                                      <div class="button-row">
                                                        <button class="action-button primary" type="button" data-save-avatar-library="true" ${currentAvatarEditKidId ? "" : "disabled"}>Save avatar</button>
                                                      </div>
                                                    </div>
                                                  `
                                                  : ""
                                              }
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
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    renderApp();
  });

  showPage("page-kid");
}

function renderApp() {
  const family = getCurrentFamily();

  if (!state.session || !family) {
    state.session = null;
    renderAuthHome();
    return;
  }

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

document.body.addEventListener("click", (event) => {
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
    resetAllTasksAndPoints();
    saveState();
    renderKidPage(currentKidId);
    showToast("Tasks and points reset.");
    return;
  }

  const deleteFamilyButton = event.target.closest("[data-delete-family]");
  if (deleteFamilyButton && isParentSession()) {
    const confirmed = window.confirm("Delete this family from this device? This cannot be undone.");
    if (!confirmed) return;
    const deleted = deleteCurrentFamilyFromDevice();
    if (!deleted) return;
    showToast("Family deleted from this device.");
    renderApp();
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
    saveState();
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
    saveState();
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
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
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
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
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
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
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

  const saveAvatarLibraryButton = event.target.closest("[data-save-avatar-library]");
  if (saveAvatarLibraryButton && currentKidView === "settings" && currentSettingsSection === "family-controls" && currentFamilyControlsSection === "add-child" && isParentSession()) {
    if (!currentAvatarEditKidId) {
      showToast("Select a kid first.");
      return;
    }

    const targetKid = getKid(currentAvatarEditKidId);
    if (!targetKid) {
      showToast("That kid could not be found.");
      return;
    }

    targetKid.avatar = `preset:${currentAvatarLibrarySelection}`;
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    showToast("Avatar updated.");
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
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
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
  const recurringSelect = event.target.closest?.('#task-form select[name="recurring"]');
  if (recurringSelect) {
    const taskForm = recurringSelect.closest("#task-form");
    const customDateInput = taskForm?.querySelector('input[name="customDate"]');
    if (customDateInput) {
      const showCustomDate = recurringSelect.value === "custom-date";
      customDateInput.classList.toggle("is-hidden", !showCustomDate);
      customDateInput.required = showCustomDate;
      if (!showCustomDate) {
        customDateInput.value = "";
      }
    }
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

    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        let family = await loginCloudParent(email, pin);
        if (!family && pendingCloudFamilyDraft && pendingCloudFamilyDraft.parentEmail.toLowerCase() === email && pendingCloudFamilyDraft.parentPin === pin) {
          const { data } = await supabaseClient.auth.getSession();
          if (data.session?.user) {
            family = await createCloudFamilyDataForUser(data.session.user, pendingCloudFamilyDraft);
            pendingCloudFamilyDraft = null;
          }
        }
        if (!family) {
          showToast("No family was found for this parent account yet.");
          return;
        }

        upsertFamilyInState(family);
        authStage = "login";
        authAccountJustCreated = false;
        state.session = { familyId: family.id, role: "parent" };
        currentKidId = null;
        currentKidView = "dashboard";
        currentFamilyMode = false;
        currentAssignedKids = [];
        saveState({ skipCloud: true });
        renderApp();
      } catch (error) {
        const localFamily = state.families.find((entry) => entry.parentEmailLower === email && entry.parentPin === pin);
        if (localFamily) {
          state.session = { familyId: localFamily.id, role: "parent" };
          authStage = "login";
          authAccountJustCreated = false;
          currentKidId = null;
          currentKidView = "dashboard";
          currentFamilyMode = false;
          currentAssignedKids = [];
          saveState({ skipCloud: true });
          showToast("Logged in on this device. Cloud sync will reconnect later.");
          renderApp();
          return;
        }
        showToast(error.message || "Incorrect parent login.");
      }
      return;
    }

    const family = state.families.find((entry) => entry.parentEmailLower === email && entry.parentPin === pin);
    if (!family) {
      showToast("Incorrect parent login.");
      return;
    }

    state.session = { familyId: family.id, role: "parent" };
    authStage = "login";
    authAccountJustCreated = false;
    currentKidId = null;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];
    saveState();
    renderApp();
    return;
  }

  const returningLoginForm = event.target.closest("#returning-login-form");
  if (returningLoginForm) {
    event.preventDefault();
    const formData = new FormData(returningLoginForm);
    const email = String(formData.get("username") || "").trim().toLowerCase();
    const pin = String(formData.get("password") || "").trim();

    if (cloudAuthEnabled && cloudModeEnabled) {
      try {
        let family = await loginCloudParent(email, pin);
        if (!family && pendingCloudFamilyDraft && pendingCloudFamilyDraft.parentEmail.toLowerCase() === email && pendingCloudFamilyDraft.parentPin === pin) {
          const { data } = await supabaseClient.auth.getSession();
          if (data.session?.user) {
            family = await createCloudFamilyDataForUser(data.session.user, pendingCloudFamilyDraft);
            pendingCloudFamilyDraft = null;
          }
        }
        if (!family) {
          showToast("No family was found for this account.");
          return;
        }

        upsertFamilyInState(family);
        authStage = "login";
        authView = "parent";
        authAccountJustCreated = false;
        state.session = { familyId: family.id, role: "parent" };
        currentKidId = null;
        currentKidView = "dashboard";
        currentFamilyMode = false;
        currentAssignedKids = [];
        saveState({ skipCloud: true });
        renderApp();
      } catch (error) {
        const localFamily = state.families.find((entry) => entry.parentEmailLower === email && entry.parentPin === pin);
        if (localFamily) {
          authStage = "login";
          authView = "parent";
          authAccountJustCreated = false;
          state.session = { familyId: localFamily.id, role: "parent" };
          currentKidId = null;
          currentKidView = "dashboard";
          currentFamilyMode = false;
          currentAssignedKids = [];
          saveState({ skipCloud: true });
          showToast("Logged in on this device. Cloud sync will reconnect later.");
          renderApp();
          return;
        }
        showToast(error.message || "Incorrect login.");
      }
      return;
    }

    const family = state.families.find((entry) => entry.parentEmailLower === email && entry.parentPin === pin);
    if (!family) {
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
    saveState();
    renderApp();
    return;
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
    const kid = family?.kids.find((entry) => entry.name.trim().toLowerCase() === kidName && entry.kidPin === kidPin);

    if (!family || !kid) {
      showToast("Incorrect kid login.");
      return;
    }

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
    addChild(childName, childPin, `preset:${currentChildAvatarPreset}`);
    currentChildAvatarPreset = AVATAR_LIBRARY[0].id;
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

    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hoursNum = Number(hoursRaw);
    const minutes = minutesRaw || "00";
    const suffix = hoursNum >= 12 ? "PM" : "AM";
    const displayHour = ((hoursNum + 11) % 12) + 1;
    const displayTime = `${displayHour}:${minutes} ${suffix}`;

    addTask(assignedKids, title, points, recurring, displayTime, customDate);
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
    addAdjustment(adjustmentKidIds, label, label === "penalty" ? -Math.abs(value) : Math.abs(value));
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const childAvatarRadio = event.target.closest?.('input[name="childAvatarPreset"]');
  if (childAvatarRadio) {
    currentChildAvatarPreset = childAvatarRadio.value;
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const avatarTargetKidRadio = event.target.closest?.('input[name="avatarTargetKid"]');
  if (avatarTargetKidRadio) {
    currentAvatarEditKidId = avatarTargetKidRadio.value;
    const targetKid = getKid(currentAvatarEditKidId);
    currentAvatarLibrarySelection = getAvatarPreset(targetKid?.avatar).id;
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const avatarLibrarySelectionRadio = event.target.closest?.('input[name="avatarLibrarySelection"]');
  if (avatarLibrarySelectionRadio) {
    currentAvatarLibrarySelection = avatarLibrarySelectionRadio.value;
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
void bootstrapCloudSessionIfAvailable();
