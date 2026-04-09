const STORAGE_KEY = "chores-multi-family-state-v1";

const emptyState = {
  families: [],
  session: null,
};

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function createKid(name, kidPin) {
  return {
    id: createId("kid"),
    name,
    kidPin,
    avatar: name.trim().charAt(0).toUpperCase() || "K",
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
    createdAt: new Date().toISOString(),
  };
}

function cloneEmptyState() {
  return JSON.parse(JSON.stringify(emptyState));
}

function normalizeKid(kid) {
  return {
    id: kid.id || createId("kid"),
    name: kid.name || "Kid",
    kidPin: kid.kidPin || "",
    avatar: kid.avatar || (kid.name || "K").charAt(0).toUpperCase(),
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

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

let authView = "create";
let currentKidId = null;
let currentKidView = "dashboard";
let currentFamilyMode = false;
let currentAssignedKids = [];
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

function getDollarEquivalent(kid) {
  const pointUnit = Number(kid.pointsPerDollarReward) || 100;
  const dollarUnit = Number(kid.dollarRewardValue) || 20;
  return Math.floor((Number(kid.points) / pointUnit) * dollarUnit);
}

function renderAvatar(kid) {
  if (typeof kid.avatar === "string" && kid.avatar.startsWith("data:image")) {
    return `<img src="${kid.avatar}" alt="${escapeHtml(kid.name)} avatar" class="avatar-image" />`;
  }

  return escapeHtml(kid.avatar);
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

function buildTaskDetail(recurring, time) {
  const labels = {
    daily: "Daily",
    "every-other-day": "Every other day",
    weekly: "Weekly",
    monthly: "Monthly",
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

function addChild(name, kidPin) {
  const family = getCurrentFamily();
  if (!family) return;
  family.kids.push(createKid(name, kidPin));
}

function updateDollarConversion(kidId, points, dollars) {
  const kid = getKid(kidId);
  if (!kid) return;
  kid.pointsPerDollarReward = points;
  kid.dollarRewardValue = dollars;
}

function updateCelebrationThreshold(kidId, threshold) {
  const kid = getKid(kidId);
  if (!kid) return;
  kid.celebrationThreshold = threshold;
  kid.lastCelebratedThreshold = 0;
}

function addTask(kidIds, title, points, recurring, time) {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    kid.due.push({
      id: createId("task"),
      title,
      detail: buildTaskDetail(recurring, time),
      points,
      recurring,
      time,
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

function claimReward(kidId, rewardId) {
  const kid = getKid(kidId);
  if (!kid) return;

  const reward = kid.rewards.find((entry) => entry.id === rewardId);
  if (!reward) return;
  kid.points = Math.max(0, kid.points - reward.cost);
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

function logout() {
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

function renderAssignPopup(placement) {
  if (!isAssignPopupOpen || assignPopupPlacement !== placement) return "";

  return `
    <div class="assign-popup">
      <div class="assign-grid">
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
      <div class="button-row" style="margin-top: 12px;">
        <button class="action-button primary" type="button" data-save-assign="true">Save selection</button>
      </div>
    </div>
  `;
}

function renderAuthHome() {
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
        <article class="section-card primary auth-intro">
          ${renderTileBubbles()}
          <p class="eyebrow">Welcome</p>
          <h2>Set up your family space.</h2>
          <p class="auth-copy">
            CHORES now starts with a clean slate. Parents create a family account, add their kids,
            and then manage tasks, rewards, bonuses, penalties, reports, and approvals from the parent interface.
          </p>
          <div class="auth-bullets">
            <p>Parent accounts can access everything.</p>
            <p>Kids can only access their own dashboard and rewards.</p>
            <p>Each family’s data stays separate on this device.</p>
          </div>
        </article>

        <article class="section-card primary auth-card">
          <div class="auth-tabs">
            <button class="view-button ${authView === "create" ? "active" : ""}" type="button" data-auth-view="create">Create family</button>
            <button class="view-button ${authView === "parent" ? "active" : ""}" type="button" data-auth-view="parent">Parent login</button>
            <button class="view-button ${authView === "kid" ? "active" : ""}" type="button" data-auth-view="kid">Kid login</button>
          </div>

          <div class="auth-panel ${authView === "create" ? "active" : ""}">
            <p class="eyebrow">Create account</p>
            <form class="reward-form auth-form" id="create-family-form">
              <input type="text" name="familyName" placeholder="Family name" required />
              <input type="text" name="parentName" placeholder="Parent name" required />
              <input type="email" name="parentEmail" placeholder="Parent email" required />
              <input type="password" name="parentPin" placeholder="Parent PIN" required />
              <input type="password" name="confirmParentPin" placeholder="Confirm parent PIN" required />
              <div class="auth-kid-block">
                <p class="eyebrow">Add your kids</p>
                <div class="auth-kid-grid">
                  <input type="text" name="kidName1" placeholder="Kid 1 name" required />
                  <input type="password" name="kidPin1" placeholder="Kid 1 PIN" required />
                  <input type="text" name="kidName2" placeholder="Kid 2 name (optional)" />
                  <input type="password" name="kidPin2" placeholder="Kid 2 PIN" />
                  <input type="text" name="kidName3" placeholder="Kid 3 name (optional)" />
                  <input type="password" name="kidPin3" placeholder="Kid 3 PIN" />
                </div>
              </div>
              <div class="button-row">
                <button class="action-button primary" type="submit">Create family account</button>
              </div>
            </form>
          </div>

          <div class="auth-panel ${authView === "parent" ? "active" : ""}">
            <p class="eyebrow">Parent login</p>
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
            <form class="reward-form auth-form" id="kid-login-form">
              <input type="email" name="familyEmail" placeholder="Family email" required />
              <input type="text" name="kidName" placeholder="Kid name" required />
              <input type="password" name="kidPin" placeholder="Kid PIN" required />
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
        <div class="session-strip">
          <span class="summary-stat">Parent: ${escapeHtml(family.parentName)}</span>
          <button class="back-button" type="button" data-logout="true">Log out</button>
        </div>
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
  if (!currentAssignedKids.length || currentAssignedKids.some((assignedKidId) => !getKid(assignedKidId))) {
    currentAssignedKids = [kidId];
  }

  const familyMode = currentFamilyMode && isParentSession();
  const role = isParentSession() ? "parent" : "kid";
  const shellClass = getShellClass(kid.name, familyMode);
  const pageTitle = familyMode ? family.familyName : kid.name;
  const canSeeReports = role === "parent";
  const canSeeSettings = role === "parent";

  document.getElementById("page-kid").innerHTML = `
    <div class="kid-shell ${escapeHtml(shellClass)}">
      <header class="kid-header">
        <h1>${escapeHtml(pageTitle)}</h1>
        <div class="view-switcher">
          <button class="view-button ${currentKidView === "dashboard" ? "active" : ""}" type="button" data-view="dashboard">Dashboard</button>
          <button class="view-button ${["rewards", "favors"].includes(currentKidView) ? "active" : ""}" type="button" data-view="rewards">Rewards</button>
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
          <div class="section-head">
            <div>
              <p class="eyebrow">${escapeHtml(kid.name)}'s Rewards</p>
              <h2>Rewards</h2>
            </div>
          </div>

          <div class="rewards-layout">
            <div class="points-column">
              <article class="points-card is-bursting" data-points-card="true" role="button" tabindex="0" aria-label="Make points sparkle">
                ${renderTileBubbles()}
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
        </article>

        <article class="section-card primary kid-view ${currentKidView === "settings" && canSeeSettings ? "active" : ""}" data-panel="settings">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <h2>Settings</h2>
            </div>
          </div>

          <div class="settings-tiles">
            <article class="reward-card settings-tile family-controls-tile">
              ${renderTileBubbles()}
              <p class="eyebrow">Family controls</p>
              <div class="family-controls-body">
                <section class="settings-mini-section add-rewards-section">
                  <p class="eyebrow">Add rewards</p>
                  <form class="reward-form" id="reward-form">
                    <input type="text" name="title" placeholder="Example: Choose dinner" required />
                    <input type="number" name="cost" placeholder="Points needed" min="1" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Add reward to selected kids</button>
                    </div>
                  </form>
                </section>

                <section class="settings-mini-section dollar-section">
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

                <section class="settings-mini-section avatar-section">
                  <p class="eyebrow">Add child</p>
                  <form class="reward-form" id="add-child-form">
                    <input type="text" name="childName" placeholder="Child name" required />
                    <input type="password" name="childPin" placeholder="Child PIN" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Add child</button>
                    </div>
                  </form>
                </section>

                <section class="settings-mini-section threshold-section">
                  <p class="eyebrow">Celebration threshold</p>
                  <form class="reward-form threshold-form" id="threshold-form">
                    <select name="thresholdKid" required>
                      ${getFamilyKids().map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join("")}
                    </select>
                    <input type="number" name="threshold" placeholder="Points target" min="1" value="${escapeHtml(kid.celebrationThreshold)}" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Save threshold</button>
                    </div>
                  </form>
                </section>
              </div>
            </article>

            <article class="reward-card settings-tile add-task-tile">
              ${renderTileBubbles()}
              <p class="eyebrow">Add task</p>
              <form class="reward-form" id="task-form">
                <input type="text" name="title" placeholder="Task title" required />
                <p class="assign-summary">Assigned to: ${escapeHtml(getAssignedKidNames().join(", ") || "No kids selected yet")}</p>
                <select name="recurring" required>
                  <option value="daily">Daily</option>
                  <option value="every-other-day">Every other day</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <label class="time-field" aria-label="Task time">
                  <input type="time" name="time" required />
                </label>
                <input type="number" name="points" placeholder="Points" min="1" required />
                <div class="button-row">
                  <button class="action-button secondary" type="button" data-open-assign="task">Assign</button>
                  <button class="action-button primary" type="submit">Add task</button>
                  <button class="action-button danger" type="button" data-reset-tasks="true">Reset tasks & points</button>
                </div>
              </form>
              ${renderAssignPopup("task")}
            </article>

            <article class="reward-card settings-tile bonus-penalty-tile">
              ${renderTileBubbles()}
              <div class="bonus-penalty-header">
                <p class="eyebrow">Bonus & Penalty</p>
                <button class="action-button secondary" type="button" data-open-assign="adjustments">Assign</button>
              </div>
              <p class="assign-summary">Assigned to: ${escapeHtml(getAssignedKidNames().join(", ") || "No kids selected yet")}</p>
              <div class="assign-popup-slot">${renderAssignPopup("adjustments")}</div>
              <div class="bonus-penalty-body">
                <div class="bonus-penalty-section bonus-section">
                  <p class="eyebrow">Bonus</p>
                  <form class="reward-form adjustment-form" data-adjustment-type="bonus">
                    <input type="number" name="value" placeholder="Points" min="1" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Save points</button>
                    </div>
                  </form>
                  <form class="reward-form reason-form" data-reason-type="bonus">
                    <input type="text" name="reason" placeholder="Reason" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Add reason</button>
                    </div>
                  </form>
                </div>
                <div class="bonus-penalty-section penalty-section">
                  <p class="eyebrow">Penalty</p>
                  <form class="reward-form adjustment-form" data-adjustment-type="penalty">
                    <input type="number" name="value" placeholder="Points" min="1" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Save points</button>
                    </div>
                  </form>
                  <form class="reward-form reason-form" data-reason-type="penalty">
                    <input type="text" name="reason" placeholder="Reason" required />
                    <div class="button-row">
                      <button class="action-button primary" type="submit">Add reason</button>
                    </div>
                  </form>
                </div>
              </div>
            </article>
          </div>
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
    authView = authButton.dataset.authView || "create";
    renderAuthHome();
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

  const openAssignButton = event.target.closest("[data-open-assign]");
  if (openAssignButton && isParentSession()) {
    isAssignPopupOpen = true;
    assignPopupPlacement = openAssignButton.dataset.openAssign || "task";
    renderKidPage(currentKidId);
    return;
  }

  const saveAssignButton = event.target.closest("[data-save-assign]");
  if (saveAssignButton && isParentSession()) {
    const checked = Array.from(document.querySelectorAll('input[name="assignedKids"]:checked')).map((input) => input.value);
    if (checked.length) currentAssignedKids = checked;
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    renderKidPage(currentKidId);
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
    claimReward(currentKidId, claimRewardButton.dataset.claimReward);
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
    currentAssignedKids = [firstKid.id];
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    renderKidPage(firstKid.id);
    return;
  }

  const kidCard = event.target.closest("[data-kid-id]");
  if (kidCard && isParentSession()) {
    currentKidId = kidCard.dataset.kidId;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [currentKidId];
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
    currentAssignedKids = [currentKidId];
    renderKidPage(currentKidId);
  }
});

document.body.addEventListener("change", (event) => {
  const thresholdSelect = event.target.closest?.('select[name="thresholdKid"]');
  if (thresholdSelect) {
    const thresholdForm = thresholdSelect.closest("#threshold-form");
    const thresholdInput = thresholdForm?.querySelector('input[name="threshold"]');
    const thresholdKid = getKid(thresholdSelect.value);
    if (thresholdInput && thresholdKid) {
      thresholdInput.value = thresholdKid.celebrationThreshold;
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

document.body.addEventListener("submit", (event) => {
  const createFamilyForm = event.target.closest("#create-family-form");
  if (createFamilyForm) {
    event.preventDefault();
    const formData = new FormData(createFamilyForm);
    const familyName = String(formData.get("familyName") || "").trim();
    const parentName = String(formData.get("parentName") || "").trim();
    const parentEmail = String(formData.get("parentEmail") || "").trim();
    const parentPin = String(formData.get("parentPin") || "").trim();
    const confirmParentPin = String(formData.get("confirmParentPin") || "").trim();

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
    [1, 2, 3].forEach((index) => {
      const name = String(formData.get(`kidName${index}`) || "").trim();
      const pin = String(formData.get(`kidPin${index}`) || "").trim();
      if (!name) return;
      if (!pin) return;
      kids.push(createKid(name, pin));
    });

    if (!kids.length) {
      showToast("Add at least one child with a PIN.");
      return;
    }

    const family = createFamily({ familyName, parentName, parentEmail, parentPin, kids });
    state.families.push(family);
    state.session = { familyId: family.id, role: "parent" };
    currentKidId = null;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];
    saveState();
    renderApp();
    return;
  }

  const parentLoginForm = event.target.closest("#parent-login-form");
  if (parentLoginForm) {
    event.preventDefault();
    const formData = new FormData(parentLoginForm);
    const email = String(formData.get("parentEmail") || "").trim().toLowerCase();
    const pin = String(formData.get("parentPin") || "").trim();
    const family = state.families.find((entry) => entry.parentEmailLower === email && entry.parentPin === pin);
    if (!family) {
      showToast("Incorrect parent login.");
      return;
    }

    state.session = { familyId: family.id, role: "parent" };
    currentKidId = null;
    currentKidView = "dashboard";
    currentFamilyMode = false;
    currentAssignedKids = [];
    saveState();
    renderApp();
    return;
  }

  const kidLoginForm = event.target.closest("#kid-login-form");
  if (kidLoginForm) {
    event.preventDefault();
    const formData = new FormData(kidLoginForm);
    const email = String(formData.get("familyEmail") || "").trim().toLowerCase();
    const kidName = String(formData.get("kidName") || "").trim().toLowerCase();
    const kidPin = String(formData.get("kidPin") || "").trim();
    const family = state.families.find((entry) => entry.parentEmailLower === email);
    const kid = family?.kids.find((entry) => entry.name.trim().toLowerCase() === kidName && entry.kidPin === kidPin);

    if (!family || !kid) {
      showToast("Incorrect kid login.");
      return;
    }

    state.session = { familyId: family.id, role: "kid", kidId: kid.id };
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
    const targetKids = currentAssignedKids.length ? currentAssignedKids : getFamilyKids().map((kid) => kid.id);

    if (!title || !Number.isFinite(cost) || cost < 1 || !targetKids.length) return;
    addReward(targetKids, title, cost);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
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
    const thresholdKidId = String(formData.get("thresholdKid") || "").trim();
    const threshold = Number(formData.get("threshold"));
    if (!thresholdKidId || !Number.isFinite(threshold) || threshold < 1) return;
    updateCelebrationThreshold(thresholdKidId, threshold);
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
    const assignedKids = currentAssignedKids.length ? currentAssignedKids : [currentKidId];

    if (!title || !Number.isFinite(points) || points < 1 || !timeValue || !assignedKids.length) return;

    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hoursNum = Number(hoursRaw);
    const minutes = minutesRaw || "00";
    const suffix = hoursNum >= 12 ? "PM" : "AM";
    const displayHour = ((hoursNum + 11) % 12) + 1;
    const displayTime = `${displayHour}:${minutes} ${suffix}`;

    addTask(assignedKids, title, points, recurring, displayTime);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const adjustmentForm = event.target.closest(".adjustment-form");
  if (adjustmentForm) {
    event.preventDefault();
    const formData = new FormData(adjustmentForm);
    const label = adjustmentForm.dataset.adjustmentType || "bonus";
    const value = Number(formData.get("value"));
    const adjustmentKidIds = currentAssignedKids.length ? currentAssignedKids : [currentKidId];

    if (!Number.isFinite(value) || !adjustmentKidIds.length) return;
    addAdjustment(adjustmentKidIds, label, label === "penalty" ? -Math.abs(value) : Math.abs(value));
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
    return;
  }

  const reasonForm = event.target.closest(".reason-form");
  if (reasonForm) {
    event.preventDefault();
    const formData = new FormData(reasonForm);
    const reason = String(formData.get("reason") || "").trim();
    const type = String(reasonForm.dataset.reasonType || "bonus").trim().toLowerCase();
    const reasonKidIds = currentAssignedKids.length ? currentAssignedKids : [currentKidId];

    if (!reason || !reasonKidIds.length) return;
    addReason(reasonKidIds, type, reason);
    saveState();
    renderKidPage(currentKidId || getFamilyKids()[0]?.id);
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
