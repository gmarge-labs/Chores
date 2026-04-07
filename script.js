const STORAGE_KEY = "brightpoints-state";
const PARENT_PIN_KEY = "brightpoints-parent-pin";

const initialState = {
  kids: [
    {
      id: "ava",
      name: "Simra",
      age: 8,
      avatar: "🌈",
      points: 164,
      pointsPerDollarReward: 100,
      dollarRewardValue: 20,
      celebrationThreshold: 200,
      lastCelebratedThreshold: 0,
      streak: 5,
      due: [
        { title: "Make the bed", detail: "Due before 8:00 AM", points: 10 },
        { title: "Tidy bedroom", detail: "Due by 6:00 PM", points: 18 },
      ],
      awaiting: [
        { title: "Pack school bag", detail: "Submitted today", points: 12 },
      ],
      completed: [
        { title: "Brush teeth", detail: "Approved this morning", points: 8 },
        { title: "Put laundry away", detail: "Approved yesterday", points: 14 },
      ],
      rewards: [
        { id: "ava-r1", title: "$20", cost: 100 },
        { id: "ava-r2", title: "Stay up late", cost: 40 },
        { id: "ava-r3", title: "Choose dinner", cost: 50 },
      ],
      bonusPenalty: [
        { type: "bonus", title: "+15 points", value: "+15" },
        { type: "penalty", title: "-10 points", value: "-10" },
      ],
      bonusReasons: ["Helping sibling"],
      penaltyReasons: ["Skipped cleanup"],
      missedDaysInARow: 0,
      lastMissedCheckDate: null,
    },
    {
      id: "leo",
      name: "Jinan",
      age: 10,
      avatar: "🚀",
      points: 212,
      pointsPerDollarReward: 100,
      dollarRewardValue: 20,
      celebrationThreshold: 250,
      lastCelebratedThreshold: 0,
      streak: 7,
      due: [
        { title: "Feed the dog", detail: "Due before 8:30 AM", points: 12 },
        { title: "Homework block", detail: "Due at 4:30 PM", points: 20 },
      ],
      awaiting: [
        { title: "Set the table", detail: "Submitted at 6:05 PM", points: 14 },
      ],
      completed: [
        { title: "Morning routine", detail: "Approved today", points: 16 },
        { title: "Reading time", detail: "Approved yesterday", points: 10 },
      ],
      rewards: [
        { id: "leo-r1", title: "$20", cost: 100 },
        { id: "leo-r2", title: "Stay up late", cost: 40 },
        { id: "leo-r3", title: "Choose dinner", cost: 50 },
      ],
      bonusPenalty: [
        { type: "bonus", title: "+20 points", value: "+20" },
        { type: "penalty", title: "-8 points", value: "-8" },
      ],
      bonusReasons: ["Finished homework early"],
      penaltyReasons: ["Late bedtime"],
      missedDaysInARow: 0,
      lastMissedCheckDate: null,
    },
    {
      id: "mila",
      name: "Rayyan",
      age: 6,
      avatar: "🦄",
      points: 98,
      pointsPerDollarReward: 100,
      dollarRewardValue: 20,
      celebrationThreshold: 100,
      lastCelebratedThreshold: 0,
      streak: 3,
      due: [
        { title: "Put toys away", detail: "Due before lunch", points: 10 },
        { title: "Get dressed", detail: "Due before school", points: 8 },
      ],
      awaiting: [
        { title: "Snack helper", detail: "Submitted today", points: 6 },
      ],
      completed: [
        { title: "Brush teeth", detail: "Approved this morning", points: 8 },
      ],
      rewards: [
        { id: "mila-r1", title: "$20", cost: 100 },
        { id: "mila-r2", title: "Stay up late", cost: 40 },
        { id: "mila-r3", title: "Choose dinner", cost: 50 },
      ],
      bonusPenalty: [
        { type: "bonus", title: "+10 points", value: "+10" },
        { type: "penalty", title: "-5 points", value: "-5" },
      ],
      bonusReasons: ["Great sharing"],
      penaltyReasons: ["Ignored timer"],
      missedDaysInARow: 0,
      lastMissedCheckDate: null,
    },
  ],
};

function cloneInitialState() {
  return JSON.parse(JSON.stringify(initialState));
}

function loadState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : cloneInitialState();
  } catch {
    return cloneInitialState();
  }
}

function normalizeState(inputState) {
  const fallback = cloneInitialState();
  const nextState = inputState && Array.isArray(inputState.kids) ? inputState : fallback;

  nextState.kids = nextState.kids.map((kid, index) => {
    const fallbackKid = fallback.kids[index];
    const bonusReasons = Array.isArray(kid.bonusReasons) ? kid.bonusReasons : [];
    const penaltyReasons = Array.isArray(kid.penaltyReasons) ? kid.penaltyReasons : [];
    const derivedReasons = Array.isArray(kid.bonusPenalty)
      ? kid.bonusPenalty
          .filter((entry) => entry.detail)
          .map((entry) => ({
            type: (entry.type || "").toLowerCase(),
            reason: String(entry.detail).replace(/^Reason:\s*/i, ""),
          }))
      : [];

    return {
      ...fallbackKid,
      ...kid,
      pointsPerDollarReward: kid.pointsPerDollarReward || fallbackKid.pointsPerDollarReward || 100,
      dollarRewardValue: kid.dollarRewardValue || fallbackKid.dollarRewardValue || 20,
      celebrationThreshold: Number.isFinite(Number(kid.celebrationThreshold)) ? Number(kid.celebrationThreshold) : fallbackKid.celebrationThreshold || 100,
      lastCelebratedThreshold: Number.isFinite(Number(kid.lastCelebratedThreshold)) ? Number(kid.lastCelebratedThreshold) : fallbackKid.lastCelebratedThreshold || 0,
      missedDaysInARow: Number.isFinite(Number(kid.missedDaysInARow)) ? Number(kid.missedDaysInARow) : fallbackKid.missedDaysInARow || 0,
      lastMissedCheckDate: kid.lastMissedCheckDate || fallbackKid.lastMissedCheckDate || null,
      bonusPenalty: (kid.bonusPenalty || fallbackKid.bonusPenalty).map((entry) => ({
        type: entry.type,
        title: entry.title,
        value: entry.value,
      })),
      bonusReasons: bonusReasons.length
        ? bonusReasons
        : derivedReasons.filter((entry) => entry.type === "bonus").map((entry) => entry.reason).concat(fallbackKid.bonusReasons || []).slice(0, 10),
      penaltyReasons: penaltyReasons.length
        ? penaltyReasons
        : derivedReasons.filter((entry) => entry.type === "penalty").map((entry) => entry.reason).concat(fallbackKid.penaltyReasons || []).slice(0, 10),
    };
  });

  return nextState;
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showPinDialog({ title, message, confirmLabel = "Continue", placeholder = "Enter PIN" }) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "pin-modal";
    modal.innerHTML = `
      <form class="pin-card">
        ${renderTileBubbles()}
        <div class="pin-sparkles" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <p class="eyebrow">Parent only</p>
        <h2>${escapeHtml(title)}</h2>
        <p class="pin-message">${escapeHtml(message)}</p>
        <input class="pin-input" type="password" inputmode="numeric" autocomplete="off" placeholder="${escapeHtml(placeholder)}" required />
        <div class="button-row pin-actions">
          <button class="action-button secondary" type="button" data-pin-cancel="true">Cancel</button>
          <button class="action-button primary" type="submit">${escapeHtml(confirmLabel)}</button>
        </div>
      </form>
    `;

    const close = (value) => {
      modal.classList.add("is-closing");
      window.setTimeout(() => {
        modal.remove();
        resolve(value);
      }, 180);
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal || event.target.closest("[data-pin-cancel]")) {
        close(null);
      }
    });

    modal.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      close(modal.querySelector(".pin-input").value.trim());
    });

    document.body.appendChild(modal);
    window.setTimeout(() => modal.querySelector(".pin-input")?.focus(), 80);
  });
}

function showParentNotice(message) {
  const notice = document.createElement("div");
  notice.className = "pin-toast";
  notice.textContent = message;
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 2200);
}

async function requireParentAccess(actionLabel = "continue") {
  let parentPin = window.localStorage.getItem(PARENT_PIN_KEY);

  if (!parentPin) {
    const newPin = await showPinDialog({
      title: "Create parent PIN",
      message: "This keeps Settings and approvals parent-only.",
      confirmLabel: "Save PIN",
      placeholder: "Create PIN",
    });
    if (!newPin || !newPin.trim()) return false;

    const confirmPin = await showPinDialog({
      title: "Confirm parent PIN",
      message: "Enter the same PIN one more time.",
      confirmLabel: "Confirm",
      placeholder: "Confirm PIN",
    });
    if (newPin.trim() !== (confirmPin || "").trim()) {
      showParentNotice("The PINs did not match. Please try again.");
      return false;
    }

    parentPin = newPin.trim();
    window.localStorage.setItem(PARENT_PIN_KEY, parentPin);
    showParentNotice("Parent PIN saved.");
  }

  const enteredPin = await showPinDialog({
    title: "Parent PIN",
    message: `Enter your parent PIN to ${actionLabel}.`,
    confirmLabel: "Unlock",
    placeholder: "Parent PIN",
  });
  if ((enteredPin || "").trim() !== parentPin) {
    showParentNotice("Incorrect PIN. This action was not completed.");
    return false;
  }

  return true;
}

function requireParentApproval() {
  return requireParentAccess("approve this task");
}

const state = normalizeState(loadState());

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function updateMissedStreaksForToday() {
  const todayKey = getTodayKey();
  let didUpdate = false;

  state.kids.forEach((kid) => {
    if (kid.lastMissedCheckDate === todayKey) return;

    kid.missedDaysInARow = kid.due.length ? (Number(kid.missedDaysInARow) || 0) + 1 : 0;
    kid.lastMissedCheckDate = todayKey;
    didUpdate = true;
  });

  if (didUpdate) saveState();
}

updateMissedStreaksForToday();

let currentKidId = null;
let currentKidView = "dashboard";
let currentSettingsView = "task";
let currentAssignedKids = [];
let isAssignPopupOpen = false;
let assignPopupPlacement = "task";
let currentReasonList = null;
let currentFamilyMode = false;

function showPage(pageId) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === pageId);
  });
}

function getKid(id) {
  return state.kids.find((kid) => kid.id === id);
}

function getAssignedKidNames() {
  return currentAssignedKids.map((kidId) => getKid(kidId)?.name).filter(Boolean);
}

function getDollarEquivalent(kid) {
  const pointUnit = Number(kid.pointsPerDollarReward) || 100;
  const dollarUnit = Number(kid.dollarRewardValue) || 20;
  return Math.floor((Number(kid.points) / pointUnit) * dollarUnit);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAvatar(kid) {
  if (typeof kid.avatar === "string" && kid.avatar.startsWith("data:image")) {
    return `<img src="${kid.avatar}" alt="${escapeHtml(kid.name)} avatar" class="avatar-image" />`;
  }

  return escapeHtml(kid.avatar);
}

function claimReward(kidId, rewardId) {
  const kid = getKid(kidId);
  if (!kid) return;
  const reward = kid.rewards.find((entry) => entry.id === rewardId);
  if (!reward) return;
  kid.points = Math.max(0, kid.points - reward.cost);
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

function addReward(kidId, title, cost) {
  const kid = getKid(kidId);
  if (!kid) return;

            kid.rewards.push({
    id: `${kidId}-${Date.now()}`,
    title,
    cost,
  });
}

function addAdjustment(kidId, label, value, reason) {
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
}

function addReason(kidId, type, reason) {
  const kid = getKid(kidId);
  if (!kid) return;

  const key = type === "penalty" ? "penaltyReasons" : "bonusReasons";
  kid[key] = [...(kid[key] || []), reason];
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

function buildTaskDetail(recurring, time) {
  const labels = {
    daily: "Daily",
    "every-other-day": "Every other day",
    weekly: "Weekly",
    monthly: "Monthly",
  };

  return `${labels[recurring] || "Daily"} • ${time}`;
}

function addTask(kidIds, title, points, recurring, time, status = "due") {
  kidIds.forEach((kidId) => {
    const kid = getKid(kidId);
    if (!kid) return;

    const nextTask = {
      title,
      detail: buildTaskDetail(recurring, time),
      points,
      recurring,
      time,
    };

    if (status === "awaiting") {
      kid.awaiting.push(nextTask);
      return;
    }

    if (status === "completed") {
      kid.completed.push(nextTask);
      const previousPoints = kid.points;
      kid.points += points;
      maybeCelebrateThreshold(kid, previousPoints);
      return;
    }

    kid.due.push(nextTask);
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

function resetAllTasks() {
  state.kids.forEach((kid) => {
    kid.points = 0;
    kid.due = [];
    kid.awaiting = [];
    kid.completed = [];
    kid.lastCelebratedThreshold = 0;
    kid.missedDaysInARow = 0;
    kid.lastMissedCheckDate = getTodayKey();
  });
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

function renderAssignPopup(placement) {
  if (!isAssignPopupOpen || assignPopupPlacement !== placement) return "";

  return `
    <div class="assign-popup">
      <div class="assign-grid">
        ${state.kids
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

function renderHome() {
  document.getElementById("home-kids").innerHTML = state.kids
    .map(
      (kid) => `
        <article class="kid-card ${escapeHtml(kid.name.toLowerCase())}" data-kid-id="${escapeHtml(kid.id)}" role="button" tabindex="0">
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
    .join("");
}

function renderCardList(items, renderer, emptyText) {
  if (!items.length) {
    return `<p class="empty">${emptyText}</p>`;
  }

  return items.map(renderer).join("");
}

function renderKidPage(kidId, familyMode = currentFamilyMode) {
  const kid = getKid(kidId);
  if (!kid) return;

  currentKidId = kidId;
  currentFamilyMode = familyMode;
  if (!currentAssignedKids.length) {
    currentAssignedKids = familyMode ? state.kids.map((child) => child.id) : [kidId];
  }

  const shellClass = familyMode ? "family" : kid.name.toLowerCase();
  const pageTitle = familyMode ? "Family" : kid.name;

  document.getElementById("page-kid").innerHTML = `
    <div class="kid-shell ${escapeHtml(shellClass)}">
      <header class="kid-header">
        <h1>${escapeHtml(pageTitle)}</h1>
        <div class="view-switcher">
          ${
            familyMode
              ? `
                <button class="view-button ${currentKidView === "report" ? "active" : ""}" type="button" data-view="report">Reports</button>
                <button class="view-button ${currentKidView === "settings" ? "active" : ""}" type="button" data-view="settings">Settings</button>
              `
              : `
                <button class="view-button ${currentKidView === "dashboard" ? "active" : ""}" type="button" data-view="dashboard">Dashboard</button>
                <button class="view-button ${["rewards", "favors"].includes(currentKidView) ? "active" : ""}" type="button" data-view="rewards">Rewards</button>
              `
          }
          ${currentKidView === "reasons" ? `<button class="view-button active" type="button" data-view="reasons">Reasons</button>` : ""}
        </div>
        <button class="back-button" type="button" id="back-home">← Back to home</button>
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
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="due" data-to-status="awaiting" data-task-index="${escapeHtml(taskIndex)}">Done</button>
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
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="awaiting" data-to-status="completed" data-task-index="${escapeHtml(taskIndex)}">Approve</button>
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="awaiting" data-to-status="due" data-task-index="${escapeHtml(taskIndex)}">Undo</button>
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
                      <div class="task-actions">
                        <button class="task-action-pill" type="button" data-task-move="true" data-from-status="completed" data-to-status="due" data-task-index="${escapeHtml(taskIndex)}">Undo</button>
                      </div>
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
              "No favors yet. Add some from Settings."
            )}
          </section>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "report" ? "active" : ""}" data-panel="report">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <h2>Report</h2>
            </div>
            <span class="summary-stat">${escapeHtml(state.kids.reduce((total, child) => total + child.due.length, 0))} due tasks</span>
          </div>

          <div class="report-grid">
            ${state.kids
              .map(
                (child) => `
                  <section class="report-tile ${escapeHtml(child.name.toLowerCase())}">
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
              ${state.kids
                .map((child) => {
                  const missedDays = Number(child.missedDaysInARow) || 0;
                  const cappedDays = Math.min(missedDays, 3);
                  return `
                    <article class="watch-pill ${escapeHtml(child.name.toLowerCase())} ${missedDays >= 3 ? "alert" : ""}">
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

        <article class="section-card primary kid-view ${currentKidView === "reasons" ? "active" : ""}" data-panel="reasons">
          <span class="panel-bubbles" aria-hidden="true"><span></span><span></span><span></span></span>
          <div class="section-head">
            <div>
              <p class="eyebrow">${escapeHtml(kid.name)}'s ${currentReasonList === "penalty" ? "Penalty" : "Bonus"} reasons</p>
              <h2>Reasons</h2>
            </div>
            <div class="button-row">
              <button class="action-button secondary" type="button" data-view="rewards">Back to rewards</button>
            </div>
          </div>
          <div class="reason-list">
            ${renderCardList(
              currentReasonList === "penalty" ? kid.penaltyReasons || [] : kid.bonusReasons || [],
              (reason) => `<p class="reason-item">${escapeHtml(reason)}</p>`,
              `No ${currentReasonList === "penalty" ? "penalty" : "bonus"} reasons yet.`
            )}
          </div>
        </article>

        <article class="section-card primary kid-view ${currentKidView === "settings" ? "active" : ""}" data-panel="settings">
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
                <p class="eyebrow">Add Rewards</p>
                <form class="reward-form" id="reward-form">
                  <input type="text" name="title" placeholder="Example: Choose dinner" required />
                  <input type="number" name="cost" placeholder="Points needed" min="1" required />
                  <div class="button-row">
                    <button class="action-button primary" type="submit">Add reward</button>
                  </div>
                </form>
              </section>

              <section class="settings-mini-section dollar-section">
                <p class="eyebrow">Dollar rate</p>
                <form class="reward-form dollar-rate-form" id="dollar-form">
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
                <p class="eyebrow">Change avatar</p>
                <form class="reward-form" id="avatar-form">
                  ${
                    familyMode
                      ? `
                        <select name="avatarKid" required>
                          ${state.kids.map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join("")}
                        </select>
                      `
                      : ""
                  }
                  <input type="file" name="avatar" accept="image/*" required />
                  <div class="button-row">
                    <button class="action-button primary" type="submit">Upload avatar</button>
                  </div>
                </form>
              </section>

              <section class="settings-mini-section threshold-section">
                <p class="eyebrow">Celebration threshold</p>
                <form class="reward-form threshold-form" id="threshold-form">
                  <select name="thresholdKid" required>
                    ${state.kids.map((child) => `<option value="${escapeHtml(child.id)}">${escapeHtml(child.name)}</option>`).join("")}
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

  document.getElementById("back-home").addEventListener("click", () => {
    currentKidId = null;
    currentFamilyMode = false;
    renderHome();
    showPage("page-home");
  });
}

function rerenderCurrentPage() {
  renderHome();
  if (currentKidId) {
    renderKidPage(currentKidId, currentFamilyMode);
  }
}

function triggerPointsBurst(pointsCard) {
  pointsCard.classList.remove("is-bursting");
  void pointsCard.offsetWidth;
  pointsCard.classList.add("is-bursting");
  window.setTimeout(() => pointsCard.classList.remove("is-bursting"), 900);
}

document.body.addEventListener("click", async (event) => {
  const pointsCard = event.target.closest("[data-points-card]");
  if (pointsCard) {
    triggerPointsBurst(pointsCard);
    return;
  }

  const reasonButton = event.target.closest("[data-open-reasons]");
  if (reasonButton && currentKidId) {
    currentReasonList = reasonButton.dataset.openReasons;
    currentKidView = "reasons";
    renderKidPage(currentKidId);
    return;
  }

  const openAssignButton = event.target.closest("[data-open-assign]");
  if (openAssignButton && currentKidId) {
    isAssignPopupOpen = true;
    assignPopupPlacement = openAssignButton.dataset.openAssign || "task";
    renderKidPage(currentKidId, currentFamilyMode);
    return;
  }

  const saveAssignButton = event.target.closest("[data-save-assign]");
  if (saveAssignButton && currentKidId) {
    const checked = Array.from(document.querySelectorAll('input[name="assignedKids"]:checked')).map((input) => input.value);
    if (checked.length) {
      currentAssignedKids = checked;
    }
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    renderKidPage(currentKidId, currentFamilyMode);
    return;
  }

  const resetTasksButton = event.target.closest("[data-reset-tasks]");
  if (resetTasksButton) {
    resetAllTasks();
    saveState();
    rerenderCurrentPage();
    return;
  }

  const taskMoveButton = event.target.closest("[data-task-move]");
  if (taskMoveButton && currentKidId) {
    if (taskMoveButton.dataset.toStatus === "completed" && !(await requireParentApproval())) {
      return;
    }

    moveTask(
      currentKidId,
      taskMoveButton.dataset.fromStatus,
      taskMoveButton.dataset.toStatus,
      Number(taskMoveButton.dataset.taskIndex)
    );
    saveState();
    rerenderCurrentPage();
    return;
  }

  const settingsButton = event.target.closest("[data-settings-view]");
  if (settingsButton) {
    if (!(await requireParentAccess("open Settings"))) {
      return;
    }

    currentSettingsView = settingsButton.dataset.settingsView;
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    if (currentKidId) {
      renderKidPage(currentKidId, currentFamilyMode);
    }
    return;
  }

  const claimRewardButton = event.target.closest("[data-claim-reward]");
  if (claimRewardButton && currentKidId) {
    claimReward(currentKidId, claimRewardButton.dataset.claimReward);
    saveState();
    rerenderCurrentPage();
    return;
  }

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    if (viewButton.dataset.view === "settings" && !(await requireParentAccess("open Settings"))) {
      return;
    }

    currentKidView = viewButton.dataset.view;
    if (currentKidId) {
      renderKidPage(currentKidId, currentFamilyMode);
    }
    return;
  }

  const familyButton = event.target.closest("[data-family-view]");
  if (familyButton) {
    const firstKid = state.kids[0];
    if (!firstKid) return;
    if (familyButton.dataset.familyView === "settings" && !(await requireParentAccess("open Settings"))) {
      return;
    }

    currentFamilyMode = true;
    currentKidId = firstKid.id;
    currentKidView = familyButton.dataset.familyView;
    currentSettingsView = "task";
    currentAssignedKids = state.kids.map((child) => child.id);
    isAssignPopupOpen = false;
    assignPopupPlacement = "task";
    currentReasonList = null;
    renderKidPage(firstKid.id, true);
    showPage("page-kid");
    return;
  }

  const button = event.target.closest("[data-kid-id]");
  if (!button) return;

  currentKidView = "dashboard";
  currentSettingsView = "task";
  currentAssignedKids = [button.dataset.kidId];
  isAssignPopupOpen = false;
  assignPopupPlacement = "task";
  currentReasonList = null;
  currentFamilyMode = false;
  renderKidPage(button.dataset.kidId, false);
  showPage("page-kid");
});

document.body.addEventListener("keydown", (event) => {
  const pointsCard = event.target.closest?.("[data-points-card]");
  if (!pointsCard || (event.key !== "Enter" && event.key !== " ")) return;

  event.preventDefault();
  triggerPointsBurst(pointsCard);
});

document.body.addEventListener("change", (event) => {
  const thresholdSelect = event.target.closest?.('select[name="thresholdKid"]');
  if (!thresholdSelect) return;

  const thresholdForm = thresholdSelect.closest("#threshold-form");
  const thresholdInput = thresholdForm?.querySelector('input[name="threshold"]');
  const kid = getKid(thresholdSelect.value);
  if (!thresholdInput || !kid) return;

  thresholdInput.value = kid.celebrationThreshold;
});

document.body.addEventListener("submit", (event) => {
  if (!currentKidId) return;
  const targetKidIds = currentFamilyMode ? state.kids.map((kid) => kid.id) : [currentKidId];

  const rewardForm = event.target.closest("#reward-form");
  if (rewardForm) {
    event.preventDefault();

    const formData = new FormData(rewardForm);
    const title = String(formData.get("title") || "").trim();
    const cost = Number(formData.get("cost"));

    if (!title || !Number.isFinite(cost) || cost < 1) return;

    targetKidIds.forEach((kidId) => addReward(kidId, title, cost));
    saveState();
    rerenderCurrentPage();
    return;
  }

  const adjustmentForm = event.target.closest(".adjustment-form");
  if (adjustmentForm) {
    event.preventDefault();

    const formData = new FormData(adjustmentForm);
    const label = adjustmentForm.dataset.adjustmentType || "bonus";
    const value = Number(formData.get("value"));

    if (!label || !Number.isFinite(value)) return;

    const adjustmentKidIds = currentAssignedKids.length ? currentAssignedKids : targetKidIds;
    adjustmentKidIds.forEach((kidId) => addAdjustment(kidId, label, label === "penalty" ? -Math.abs(value) : Math.abs(value)));
    saveState();
    rerenderCurrentPage();
    return;
  }

  const reasonForm = event.target.closest(".reason-form");
  if (reasonForm) {
    event.preventDefault();

    const formData = new FormData(reasonForm);
    const type = String(reasonForm.dataset.reasonType || "bonus").trim().toLowerCase();
    const reason = String(formData.get("reason") || "").trim();

    if (!reason) return;

    const reasonKidIds = currentAssignedKids.length ? currentAssignedKids : targetKidIds;
    reasonKidIds.forEach((kidId) => addReason(kidId, type, reason));
    currentReasonList = type;
    saveState();
    rerenderCurrentPage();
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
    const assignedKids = currentAssignedKids;

    if (!title || !Number.isFinite(points) || points < 1 || !timeValue || !assignedKids.length) return;

    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hoursNum = Number(hoursRaw);
    const minutes = minutesRaw || "00";
    const suffix = hoursNum >= 12 ? "PM" : "AM";
    const displayHour = ((hoursNum + 11) % 12) + 1;
    const displayTime = `${displayHour}:${minutes} ${suffix}`;

    addTask(assignedKids, title, points, recurring, displayTime);
    saveState();
    rerenderCurrentPage();
    return;
  }

  const avatarForm = event.target.closest("#avatar-form");
  if (avatarForm) {
    event.preventDefault();

    const fileInput = avatarForm.querySelector('input[name="avatar"]');
    const file = fileInput?.files?.[0];
    if (!file || !currentKidId) return;
    const formData = new FormData(avatarForm);
    const avatarKidId = currentFamilyMode ? String(formData.get("avatarKid") || currentKidId) : currentKidId;

    const reader = new FileReader();
    reader.onload = () => {
      const kid = getKid(avatarKidId);
      if (!kid) return;
      kid.avatar = String(reader.result);
      saveState();
      rerenderCurrentPage();
    };
    reader.readAsDataURL(file);
    return;
  }

  const dollarForm = event.target.closest("#dollar-form");
  if (dollarForm) {
    event.preventDefault();

    const formData = new FormData(dollarForm);
    const points = Number(formData.get("points"));
    const dollars = Number(formData.get("dollars"));

    if (!Number.isFinite(points) || points < 1 || !Number.isFinite(dollars) || dollars < 1) return;

    targetKidIds.forEach((kidId) => updateDollarConversion(kidId, points, dollars));
    saveState();
    rerenderCurrentPage();
    return;
  }

  const thresholdForm = event.target.closest("#threshold-form");
  if (thresholdForm) {
    event.preventDefault();

    const formData = new FormData(thresholdForm);
    const thresholdKidId = String(formData.get("thresholdKid") || currentKidId);
    const threshold = Number(formData.get("threshold"));

    if (!thresholdKidId || !Number.isFinite(threshold) || threshold < 1) return;

    updateCelebrationThreshold(thresholdKidId, threshold);
    saveState();
    rerenderCurrentPage();
  }
});

renderHome();
showPage("page-home");
