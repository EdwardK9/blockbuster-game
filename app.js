// Blockbuster: The Movie Game — client-only party game engine.
// No backend needed: everything runs in-browser, meant to be played hotseat-style
// by everyone gathered around one screen.

const TEAM_COLORS = ["#0a3f8c", "#c0392b", "#1e8a4c", "#8e44ad", "#e07b00", "#0e7c86"];
const MIN_TEAMS = 2;
const MAX_TEAMS = 6;
const TURN_SECONDS_OPTIONS = [8, 12, 16];
const CLUE_SECONDS_OPTIONS = [20, 30, 45];
const SAVE_KEY = "blockbuster:save";
const SETTINGS_KEY = "blockbuster:settings";

const appEl = document.getElementById("app");
const newGameBtn = document.getElementById("newGameBtn");
const howToPlayBtn = document.getElementById("howToPlayBtn");
const muteBtn = document.getElementById("muteBtn");
const modalOverlay = document.getElementById("modalOverlay");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

let state = null;

// ---------------- Sound ----------------
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function beep(freq, duration = 0.12, type = "sine", vol = 0.15, delay = 0) {
  if (!state || state.settings.muted) return;
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch (e) { /* audio not available — fail silently */ }
}
const playTick = () => beep(880, 0.07, "square", 0.07);
const playCorrect = () => { beep(660, 0.1); beep(990, 0.12, "sine", 0.15, 0.09); };
const playElim = () => beep(160, 0.25, "sawtooth", 0.12);
const playRoundWin = () => { beep(523, 0.12); beep(659, 0.12, "sine", 0.15, 0.12); beep(784, 0.18, "sine", 0.18, 0.24); };
const playGameWin = () => [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.22, "sine", 0.18, i * 0.15));

// ---------------- Persistence ----------------
function defaultSettings() {
  return { turnSeconds: 12, clueSeconds: 30, muted: false };
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch (e) { return defaultSettings(); }
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch (e) { /* ignore */ }
}

function snapshotGame() {
  return {
    screen: state.screen === "winner" ? "winner" : "board",
    teamCount: state.teamCount,
    teams: state.teams.map(t => ({ name: t.name, color: t.color, genres: [...t.genres] })),
    turnPointer: state.turnPointer,
    usedCategories: state.usedCategories,
    usedMovies: state.usedMovies,
    winner: state.winner,
    history: state.history,
    roundNumber: state.roundNumber,
  };
}
function saveGame() {
  // Only persist on stable screens — never mid-round, so we never resume into a dead timer.
  if (!["board", "roundResult", "winner"].includes(state.screen)) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(snapshotGame())); } catch (e) { /* ignore */ }
}
function clearSavedGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (!snap || !Array.isArray(snap.teams) || !snap.teams.length) return null;
    const hasProgress = snap.teams.some(t => t.genres && t.genres.length) || (snap.history && snap.history.length);
    return hasProgress ? snap : null;
  } catch (e) { return null; }
}
function restoreFromSnapshot(snap) {
  state.teamCount = snap.teamCount;
  state.teams = snap.teams.map(t => ({ name: t.name, color: t.color, genres: new Set(t.genres) }));
  state.turnPointer = snap.turnPointer || 0;
  state.usedCategories = snap.usedCategories || [];
  state.usedMovies = snap.usedMovies || [];
  state.winner = typeof snap.winner === "number" ? snap.winner : null;
  state.history = snap.history || [];
  state.roundNumber = snap.roundNumber || (state.history ? state.history.length : 0);
  state.round = null;
  state.screen = state.winner !== null ? "winner" : "board";
}

// ---------------- State ----------------
function freshTeam(i) {
  return { name: `Team ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length], genres: new Set() };
}

function initState(keepSettings) {
  const settings = keepSettings && state ? state.settings : loadSettings();
  state = {
    screen: "setup",
    teamCount: 2,
    teams: [freshTeam(0), freshTeam(1)],
    turnPointer: 0,
    usedCategories: [],
    usedMovies: [],
    round: null,
    winner: null,
    history: [],
    roundNumber: 0,
    settings,
  };
}

function shuffledCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCategory() {
  if (state.usedCategories.length >= CATEGORIES.length) state.usedCategories = [];
  const remaining = CATEGORIES.filter(c => !state.usedCategories.includes(c));
  const pick = remaining[Math.floor(Math.random() * remaining.length)];
  state.usedCategories.push(pick);
  return pick;
}

function pickMovies(count) {
  if (state.usedMovies.length + count > MOVIES.length) state.usedMovies = [];
  const remaining = MOVIES.filter(m => !state.usedMovies.includes(m.title));
  const picks = shuffledCopy(remaining).slice(0, count);
  picks.forEach(p => state.usedMovies.push(p.title));
  return picks;
}

function awardGenre(teamIdx, preferredGenre) {
  const team = state.teams[teamIdx];
  if (team.genres.size >= GENRES.length) return null;
  let genreToGive = preferredGenre;
  if (team.genres.has(genreToGive)) {
    const missing = GENRES.filter(g => !team.genres.has(g));
    genreToGive = missing[Math.floor(Math.random() * missing.length)];
  }
  team.genres.add(genreToGive);
  if (team.genres.size >= GENRES.length) {
    state.winner = teamIdx;
    state.screen = "winner";
  }
  return genreToGive;
}

function addHistory(text) {
  state.roundNumber++;
  state.history.unshift({ n: state.roundNumber, text });
  if (state.history.length > 30) state.history.pop();
}

// ---------------- Render dispatch ----------------
function render() {
  newGameBtn.hidden = state.screen === "setup";
  saveGame();
  if (state.screen === "setup") return renderSetup();
  if (state.screen === "resume") return renderResumePrompt();
  if (state.screen === "winner") return renderWinner();
  if (state.screen === "board") return renderBoard();
  if (state.screen === "category") return renderCategoryRound();
  if (state.screen === "clue") return renderClueRound();
  if (state.screen === "roundResult") return renderRoundResult();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------- Resume prompt ----------------
function renderResumePrompt() {
  const snap = state._pendingResume;
  appEl.innerHTML = `
    <div class="card" style="text-align:center;">
      <h2>Welcome back</h2>
      <p>You have a game in progress with ${snap.teams.length} teams
        (${snap.teams.map(t => `${escapeHtml(t.name)}: ${t.genres.length}/${GENRES.length}`).join(", ")}).</p>
      <div class="btn-row" style="justify-content:center;">
        <button class="btn" id="resumeBtn">Resume Game</button>
        <button class="btn danger" id="freshBtn">Start New Game</button>
      </div>
    </div>
  `;
  document.getElementById("resumeBtn").addEventListener("click", () => {
    restoreFromSnapshot(snap);
    render();
  });
  document.getElementById("freshBtn").addEventListener("click", () => {
    clearSavedGame();
    initState(true);
    render();
  });
}

// ---------------- Setup ----------------
function renderSetup() {
  appEl.innerHTML = `
    <div class="card">
      <h2>Gather your teams</h2>
      <p class="hint">2 teams is classic, but Blockbuster plays fine with 3 or more — everyone just gets fewer turns per round.</p>
      <div class="btn-row" style="margin-bottom:18px;">
        <button class="btn small" id="removeTeamBtn" ${state.teamCount <= MIN_TEAMS ? "disabled" : ""}>&minus; Remove team</button>
        <button class="btn small yellow" id="addTeamBtn" ${state.teamCount >= MAX_TEAMS ? "disabled" : ""}>&plus; Add team</button>
      </div>
      <div id="teamNameList"></div>
    </div>

    <div class="card">
      <h2>Round settings</h2>
      <p class="hint">Category Battle time bank (per team)</p>
      <div class="pill-row" id="turnSecondsRow"></div>
      <p class="hint" style="margin-top:14px;">Quote It / One Word round timer</p>
      <div class="pill-row" id="clueSecondsRow"></div>
    </div>

    <button class="btn" id="startBtn" style="width:100%;">Start Game</button>
  `;

  const list = document.getElementById("teamNameList");
  state.teams.forEach((team, i) => {
    const row = document.createElement("div");
    row.className = "team-name-input";
    row.innerHTML = `
      <button class="team-swatch" style="background:${team.color}" data-idx="${i}" title="Click to change color"></button>
      <input type="text" value="${escapeHtml(team.name)}" data-idx="${i}" maxlength="24" />
    `;
    list.appendChild(row);
  });
  list.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", e => {
      const idx = Number(e.target.dataset.idx);
      state.teams[idx].name = e.target.value || `Team ${idx + 1}`;
    });
  });
  list.querySelectorAll(".team-swatch").forEach(sw => {
    sw.addEventListener("click", () => {
      const idx = Number(sw.dataset.idx);
      const team = state.teams[idx];
      const curPos = TEAM_COLORS.indexOf(team.color);
      team.color = TEAM_COLORS[(curPos + 1) % TEAM_COLORS.length];
      renderSetup();
    });
  });

  const turnRow = document.getElementById("turnSecondsRow");
  TURN_SECONDS_OPTIONS.forEach(sec => {
    const b = document.createElement("button");
    b.className = "pill" + (state.settings.turnSeconds === sec ? " selected" : "");
    b.textContent = `${sec}s`;
    b.addEventListener("click", () => {
      state.settings.turnSeconds = sec;
      saveSettings();
      renderSetup();
    });
    turnRow.appendChild(b);
  });
  const clueRow = document.getElementById("clueSecondsRow");
  CLUE_SECONDS_OPTIONS.forEach(sec => {
    const b = document.createElement("button");
    b.className = "pill" + (state.settings.clueSeconds === sec ? " selected" : "");
    b.textContent = `${sec}s`;
    b.addEventListener("click", () => {
      state.settings.clueSeconds = sec;
      saveSettings();
      renderSetup();
    });
    clueRow.appendChild(b);
  });

  document.getElementById("addTeamBtn").addEventListener("click", () => {
    if (state.teamCount >= MAX_TEAMS) return;
    state.teams.push(freshTeam(state.teamCount));
    state.teamCount++;
    renderSetup();
  });
  document.getElementById("removeTeamBtn").addEventListener("click", () => {
    if (state.teamCount <= MIN_TEAMS) return;
    state.teams.pop();
    state.teamCount--;
    renderSetup();
  });
  document.getElementById("startBtn").addEventListener("click", () => {
    clearSavedGame();
    state.screen = "board";
    render();
  });
}

// ---------------- Board / round chooser ----------------
function renderBoard() {
  appEl.innerHTML = `
    ${boardHtml()}
    <div class="card">
      <h2>Choose the next round</h2>
      <p class="hint">Acting team / first turn rotates automatically each round.</p>
      <div class="round-choice-grid">
        <div class="round-choice" id="chooseCategoryBtn">
          <h3>🎬 Category Battle</h3>
          <p>Teams call out movies fitting a category, chess-clock style — each team has its own ${state.settings.turnSeconds}s bank that only runs on their turn. Say one and pass it on; run your clock to zero and you're out. Last team standing wins a genre card.</p>
        </div>
        <div class="round-choice" id="chooseClueBtn">
          <h3>🤫 Quote It / One Word</h3>
          <p>One team's Clue Giver gets ${state.settings.clueSeconds} seconds to get their team guessing 3 movies — by quote, one-word clue, or acting it out. Each correct guess wins a genre card.</p>
        </div>
      </div>
    </div>
    ${historyHtml()}
  `;
  document.getElementById("chooseCategoryBtn").addEventListener("click", startCategoryRound);
  document.getElementById("chooseClueBtn").addEventListener("click", startClueRound);
}

function boardHtml() {
  return `
    <div class="board">
      ${state.teams.map((team, i) => `
        <div class="team-panel" style="background:${team.color}">
          <h3>${escapeHtml(team.name)}</h3>
          <div class="genre-grid">
            ${GENRES.map(g => `<div class="genre-chip ${team.genres.has(g) ? "owned" : ""}">${(GENRE_ICONS[g] || "")} ${g}</div>`).join("")}
          </div>
          <div class="team-progress">${team.genres.size} / ${GENRES.length} genre cards</div>
        </div>
      `).join("")}
    </div>
  `;
}

function historyHtml() {
  if (!state.history.length) return "";
  return `
    <details class="card history-card">
      <summary>Round history (${state.history.length})</summary>
      <ul class="history-list">
        ${state.history.map(h => `<li><span class="history-n">#${h.n}</span> ${h.text}</li>`).join("")}
      </ul>
    </details>
  `;
}

// ---------------- Category Battle round ----------------
// Chess-clock style: every team gets its own countdown "time bank" for the
// round. Only the active team's clock runs. Players just call out movies
// out loud (no typing) — tap "Got one, pass it on" to hand the clock to the
// next team, or a team is out the moment its own bank hits zero.
function startCategoryRound() {
  const startTeam = state.turnPointer % state.teamCount;
  const teamTimes = {};
  state.teams.forEach((_, i) => { teamTimes[i] = state.settings.turnSeconds; });
  state.round = {
    type: "category",
    category: pickCategory(),
    alive: state.teams.map((_, i) => i),
    activePos: 0,
    startTeam,
    teamTimes,
    timerId: null,
    lastTickSecond: null,
  };
  const r = state.round;
  const startIdx = r.alive.indexOf(startTeam);
  r.alive = r.alive.slice(startIdx).concat(r.alive.slice(0, startIdx));
  state.screen = "category";
  render();
  startTeamTimer();
}

function currentCategoryTeam() {
  const r = state.round;
  return r.alive[r.activePos % r.alive.length];
}

function startTeamTimer() {
  const r = state.round;
  clearInterval(r.timerId);
  r.lastTickSecond = null;
  r.timerId = setInterval(() => {
    const teamIdx = currentCategoryTeam();
    r.teamTimes[teamIdx] -= 0.1;
    if (r.teamTimes[teamIdx] <= 0) {
      r.teamTimes[teamIdx] = 0;
      clearInterval(r.timerId);
      eliminateTeam(teamIdx);
      return;
    }
    const secLeft = Math.ceil(r.teamTimes[teamIdx]);
    if (secLeft <= 3 && secLeft !== r.lastTickSecond) {
      r.lastTickSecond = secLeft;
      playTick();
    }
    updateTimerBarOnly();
  }, 100);
}

function updateTimerBarOnly() {
  const bar = document.getElementById("catTimerBar");
  const numEl = document.getElementById("catTimerNum");
  if (!bar || !numEl) return;
  const r = state.round;
  const teamIdx = currentCategoryTeam();
  const timeLeft = r.teamTimes[teamIdx];
  const pct = Math.max(0, (timeLeft / state.settings.turnSeconds) * 100);
  bar.style.width = pct + "%";
  bar.classList.toggle("warn", pct <= 50 && pct > 20);
  bar.classList.toggle("danger", pct <= 20);
  numEl.textContent = Math.ceil(timeLeft);
}

function passTurn() {
  const r = state.round;
  playTick();
  clearInterval(r.timerId);
  r.activePos = (r.activePos + 1) % r.alive.length;
  render();
  startTeamTimer();
}

function eliminateTeam(teamIdx) {
  const r = state.round;
  playElim();
  const removedPos = r.alive.indexOf(teamIdx);
  r.alive.splice(removedPos, 1);
  if (r.alive.length <= 1) {
    clearInterval(r.timerId);
    finishCategoryRound();
    return;
  }
  r.activePos = removedPos % r.alive.length;
  render();
  startTeamTimer();
}

function finishCategoryRound() {
  const r = state.round;
  const winnerTeam = r.alive[0];
  const winnerName = state.teams[winnerTeam].name;
  const genre = GENRES[Math.floor(Math.random() * GENRES.length)];
  const given = awardGenre(winnerTeam, genre);
  playRoundWin();
  addHistory(`<strong>${escapeHtml(winnerName)}</strong> won Category Battle ("${escapeHtml(r.category)}")` +
    (given ? ` and earned <strong>${given}</strong>` : " (already had every genre)"));
  state.turnPointer = (r.startTeam + 1) % state.teamCount;
  state.lastAward = { teamIdx: winnerTeam, genre: given, roundType: "category" };
  if (state.screen !== "winner") state.screen = "roundResult";
  render();
}

function renderCategoryRound() {
  const r = state.round;
  const activeTeamIdx = currentCategoryTeam();
  const activeTeam = state.teams[activeTeamIdx];
  const eliminated = state.teams.map((t, i) => i).filter(i => !r.alive.includes(i));

  appEl.innerHTML = `
    ${boardHtml()}
    <div class="card">
      <div class="category-banner">
        <div class="label">Category</div>
        <div class="value">${escapeHtml(r.category)}</div>
      </div>

      <div class="time-bank-row">
        ${r.alive.map(i => `
          <div class="time-bank-chip ${i === activeTeamIdx ? "active" : ""}" style="border-color:${state.teams[i].color}">
            <span class="tb-name">${escapeHtml(state.teams[i].name)}</span>
            <span class="tb-time">${Math.ceil(r.teamTimes[i])}s</span>
          </div>
        `).join("")}
      </div>

      <div class="timer-bar-outer"><div class="timer-bar-inner" id="catTimerBar" style="width:100%"></div></div>
      <div class="turn-status" style="color:${activeTeam.color}">
        <span id="catTimerNum">${Math.ceil(r.teamTimes[activeTeamIdx])}</span>s left on ${escapeHtml(activeTeam.name)}'s clock
      </div>
      <p class="hint" style="text-align:center;">${escapeHtml(activeTeam.name)} calls out a movie that fits — everyone else judges it live.</p>

      ${eliminated.length ? `<div class="eliminated-list">Out: ${eliminated.map(i => escapeHtml(state.teams[i].name)).join(", ")}</div>` : ""}

      <div class="btn-row" style="justify-content:center;">
        <button class="btn good" id="passTurnBtn">✅ Got one — pass it on</button>
        <button class="btn small danger" id="forfeitBtn">🏳 ${escapeHtml(activeTeam.name)} is out</button>
      </div>
    </div>
  `;

  document.getElementById("passTurnBtn").addEventListener("click", passTurn);
  document.getElementById("forfeitBtn").addEventListener("click", () => {
    clearInterval(r.timerId);
    eliminateTeam(activeTeamIdx);
  });
}

// ---------------- Clue round ----------------
function startClueRound() {
  const actingTeam = state.turnPointer % state.teamCount;
  state.round = {
    type: "clue",
    actingTeam,
    movies: pickMovies(3),
    idx: 0,
    correct: 0,
    revealed: false,
    timeLeft: state.settings.clueSeconds,
    timerId: null,
    started: false,
    lastTickSecond: null,
  };
  state.screen = "clue";
  render();
}

function beginClueTimer() {
  const r = state.round;
  r.started = true;
  r.timerId = setInterval(() => {
    r.timeLeft -= 0.1;
    if (r.timeLeft <= 0) {
      r.timeLeft = 0;
      clearInterval(r.timerId);
      finishClueRound();
      return;
    }
    const secLeft = Math.ceil(r.timeLeft);
    if (secLeft <= 5 && secLeft !== r.lastTickSecond) {
      r.lastTickSecond = secLeft;
      playTick();
    }
    updateClueTimerOnly();
  }, 100);
  render();
}

function updateClueTimerOnly() {
  const numEl = document.getElementById("clueTimerNum");
  if (!numEl) return;
  const r = state.round;
  numEl.textContent = Math.ceil(r.timeLeft);
  numEl.classList.toggle("danger", r.timeLeft <= 10);
}

function markCorrect() {
  const r = state.round;
  r.correct++;
  playCorrect();
  nextClueMovie();
}

function skipMovie() {
  nextClueMovie();
}

function nextClueMovie() {
  const r = state.round;
  r.idx++;
  r.revealed = false;
  if (r.idx >= r.movies.length) {
    clearInterval(r.timerId);
    finishClueRound();
  } else {
    render();
  }
}

function finishClueRound() {
  const r = state.round;
  const awarded = [];
  for (let i = 0; i < r.correct; i++) {
    const movie = r.movies[i];
    const g = awardGenre(r.actingTeam, movie ? movie.genre : GENRES[0]);
    if (g) awarded.push(g);
    if (state.screen === "winner") break;
  }
  if (r.correct > 0) playRoundWin();
  const teamName = state.teams[r.actingTeam].name;
  addHistory(`<strong>${escapeHtml(teamName)}</strong> guessed ${r.correct}/${r.movies.length} in Quote It / One Word` +
    (awarded.length ? ` and earned: <strong>${awarded.join(", ")}</strong>` : ""));
  state.turnPointer = (r.actingTeam + 1) % state.teamCount;
  state.lastAward = { teamIdx: r.actingTeam, genres: awarded, roundType: "clue", correct: r.correct, total: r.movies.length };
  if (state.screen !== "winner") state.screen = "roundResult";
  render();
}

function renderClueRound() {
  const r = state.round;
  const team = state.teams[r.actingTeam];
  const movie = r.movies[r.idx];

  if (!r.started) {
    appEl.innerHTML = `
      ${boardHtml()}
      <div class="card">
        <h2>🤫 Quote It / One Word — ${escapeHtml(team.name)}'s turn</h2>
        <div class="clue-warning">Pick one Clue Giver from ${escapeHtml(team.name)}. Only they should look at the next screen! Everyone else, look away.</div>
        <p>The Clue Giver has ${state.settings.clueSeconds} seconds to get their team to guess 3 movies by reading the quote, saying one word, or acting it out (no title, no spelling, no "sounds like").</p>
        <button class="btn" id="clueReadyBtn">Clue Giver is ready — Start ${state.settings.clueSeconds}s Timer</button>
      </div>
    `;
    document.getElementById("clueReadyBtn").addEventListener("click", beginClueTimer);
    return;
  }

  appEl.innerHTML = `
    ${boardHtml()}
    <div class="card">
      <h2 style="text-align:center;">${escapeHtml(team.name)}'s Clue Giver</h2>
      <div class="big-timer ${r.timeLeft <= 10 ? "danger" : ""}" id="clueTimerNum">${Math.ceil(r.timeLeft)}</div>
      <div class="clue-progress">
        ${r.movies.map((_, i) => `<div class="dot ${i < r.idx ? "done" : i === r.idx ? "current" : ""}"></div>`).join("")}
      </div>
      <div class="flip-card ${r.revealed ? "" : "hidden-card"}" id="flipCard">
        ${r.revealed ? `
          <div class="movie-genre">${GENRE_ICONS[movie.genre] || ""} ${movie.genre}</div>
          <div class="movie-title">${escapeHtml(movie.title)}</div>
          <div class="movie-quote">"${escapeHtml(movie.quote)}"</div>
        ` : `
          <div class="movie-title">🎬 Tap to reveal to Clue Giver only</div>
        `}
      </div>
      <div class="btn-row" style="justify-content:center;">
        <button class="btn good" id="clueCorrectBtn">✅ Guessed it!</button>
        <button class="btn danger" id="clueSkipBtn">⏭ Skip</button>
      </div>
    </div>
  `;
  document.getElementById("flipCard").addEventListener("click", () => {
    r.revealed = !r.revealed;
    render();
  });
  document.getElementById("clueCorrectBtn").addEventListener("click", markCorrect);
  document.getElementById("clueSkipBtn").addEventListener("click", skipMovie);
}

// ---------------- Round result / winner ----------------
function renderRoundResult() {
  const a = state.lastAward;
  const team = state.teams[a.teamIdx];
  let body;
  if (a.roundType === "category") {
    body = a.genre
      ? `<p><strong>${escapeHtml(team.name)}</strong> wins the round and earns the <strong>${GENRE_ICONS[a.genre] || ""} ${a.genre}</strong> genre card!</p>`
      : `<p><strong>${escapeHtml(team.name)}</strong> already has every genre card.</p>`;
  } else {
    body = `<p><strong>${escapeHtml(team.name)}</strong> guessed ${a.correct} / ${a.total} movies` +
      (a.genres.length ? ` and earned: <strong>${a.genres.map(g => `${GENRE_ICONS[g] || ""} ${g}`).join(", ")}</strong>.` : ".") + `</p>`;
  }
  appEl.innerHTML = `
    ${boardHtml()}
    <div class="card" style="text-align:center;">
      <h2>Round Result</h2>
      ${body}
      <button class="btn" id="continueBtn">Continue</button>
    </div>
  `;
  document.getElementById("continueBtn").addEventListener("click", () => {
    state.screen = "board";
    render();
  });
}

function renderWinner() {
  const team = state.teams[state.winner];
  appEl.innerHTML = `
    <div class="winner-screen">
      <div class="confetti-layer" id="confettiLayer"></div>
      <div class="trophy">🏆</div>
      <h1 style="color:${team.color}">${escapeHtml(team.name)} wins Blockbuster!</h1>
      <p>Collected all ${GENRES.length} genre cards.</p>
      ${boardHtml()}
      ${historyHtml()}
      <button class="btn" id="playAgainBtn">Play Again</button>
    </div>
  `;
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    clearSavedGame();
    initState(true);
    render();
  });
  clearSavedGame();
  spawnConfetti(document.getElementById("confettiLayer"));
  playGameWin();
}

function spawnConfetti(container) {
  if (!container) return;
  const colors = ["#ffc72c", "#0a3f8c", "#1e8a4c", "#c0392b", "#8e44ad", "#ffffff"];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.6) + "s";
    piece.style.animationDuration = (2.2 + Math.random() * 1.6) + "s";
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    container.appendChild(piece);
  }
}

// ---------------- How to Play modal ----------------
function howToPlayHtml() {
  return `
    <h2>How to Play</h2>
    <p>2 or more teams race to collect all ${GENRES.length} genre cards
      (${GENRES.map(g => `${GENRE_ICONS[g] || ""} ${g}`).join(", ")}). Each round, the group picks one of two mini-games:</p>
    <h3>🎬 Category Battle</h3>
    <p>A category appears (e.g. "Movies set in space"). It's a chess clock: each team gets its own
      countdown bank, and only the active team's clock is running. Call out a movie that fits out loud —
      no typing — and everyone else judges on the spot. Got one? Tap "pass it on" to hand the clock to the
      next team. Let your own clock hit zero (or concede) and your team is out. Last team standing wins the
      round and a genre card.</p>
    <h3>🤫 Quote It / One Word</h3>
    <p>One team picks a Clue Giver. Everyone else on the team looks away while the Clue Giver
      reveals a hidden movie on screen, then has one round-timer to get their teammates guessing —
      by reciting the quote, giving a single-word clue, or acting it out charades-style. No saying
      the title, spelling it, or "sounds like". Each of the 3 movies guessed correctly wins a genre card.</p>
    <h3>Winning</h3>
    <p>First team to collect all ${GENRES.length} distinct genre cards wins the game.</p>
    <p class="hint">Fan-made browser tribute to the <em>Blockbuster</em> party game — play it with friends in the same room.</p>
  `;
}
function openModal(html) {
  modalBody.innerHTML = html;
  modalOverlay.hidden = false;
}
function closeModal() {
  modalOverlay.hidden = true;
}
howToPlayBtn.addEventListener("click", () => openModal(howToPlayHtml()));
modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !modalOverlay.hidden) closeModal(); });

// ---------------- Top bar controls ----------------
function refreshMuteBtn() {
  muteBtn.textContent = state.settings.muted ? "🔇" : "🔊";
}
muteBtn.addEventListener("click", () => {
  state.settings.muted = !state.settings.muted;
  saveSettings();
  refreshMuteBtn();
});
newGameBtn.addEventListener("click", () => {
  if (confirm("Start a brand new game? Current progress will be lost.")) {
    clearSavedGame();
    initState(true);
    render();
  }
});

// ---------------- Boot ----------------
initState();
const saved = loadSavedGame();
if (saved) {
  state.screen = "resume";
  state._pendingResume = saved;
}
refreshMuteBtn();
render();
