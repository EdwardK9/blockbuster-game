// Blockbuster: The Movie Game — client-only party game engine.
// No backend needed: everything runs in-browser, meant to be played hotseat-style
// by everyone gathered around one screen.

const TEAM_COLORS = ["#0a3f8c", "#c0392b", "#1e8a4c", "#8e44ad", "#e07b00", "#0e7c86"];
const MIN_TEAMS = 2;
const MAX_TEAMS = 6;
const TURN_SECONDS = 12;
const CLUE_ROUND_SECONDS = 30;

const appEl = document.getElementById("app");
const newGameBtn = document.getElementById("newGameBtn");

let state = null;

function freshTeam(i) {
  return { name: `Team ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length], genres: new Set() };
}

function initState() {
  state = {
    screen: "setup",
    teamCount: 2,
    teams: [freshTeam(0), freshTeam(1)],
    turnPointer: 0,       // whose turn it is generally (for category battle start / clue round acting team)
    usedCategories: [],
    usedMovies: [],
    round: null,          // active round object
    winner: null,
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

function render() {
  newGameBtn.hidden = state.screen === "setup";
  if (state.screen === "setup") return renderSetup();
  if (state.screen === "winner") return renderWinner();
  if (state.screen === "board") return renderBoard();
  if (state.screen === "category") return renderCategoryRound();
  if (state.screen === "clue") return renderClueRound();
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
      <button class="btn" id="startBtn" style="margin-top:10px;">Start Game</button>
    </div>
  `;
  const list = document.getElementById("teamNameList");
  state.teams.forEach((team, i) => {
    const row = document.createElement("div");
    row.className = "team-name-input";
    row.innerHTML = `
      <span class="team-swatch" style="background:${team.color}"></span>
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
    state.screen = "board";
    render();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
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
          <p>Teams race to name movies fitting a category. Miss, repeat, or run out of time and you're out — last team standing wins a genre card.</p>
        </div>
        <div class="round-choice" id="chooseClueBtn">
          <h3>🤫 Quote It / One Word</h3>
          <p>One team's Clue Giver gets 30 seconds to get their team guessing 3 movies — by quote, one-word clue, or acting it out. Each correct guess wins a genre card.</p>
        </div>
      </div>
    </div>
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
            ${GENRES.map(g => `<div class="genre-chip ${team.genres.has(g) ? "owned" : ""}">${g}</div>`).join("")}
          </div>
          <div class="team-progress">${team.genres.size} / ${GENRES.length} genre cards</div>
        </div>
      `).join("")}
    </div>
  `;
}

// ---------------- Category Battle round ----------------
function startCategoryRound() {
  const startTeam = state.turnPointer % state.teamCount;
  state.round = {
    type: "category",
    category: pickCategory(),
    alive: state.teams.map((_, i) => i),
    activePos: 0,           // index into alive[]
    startTeam,
    given: [],
    timeLeft: TURN_SECONDS,
    timerId: null,
  };
  // rotate alive[] so it starts at startTeam
  const r = state.round;
  const startIdx = r.alive.indexOf(startTeam);
  r.alive = r.alive.slice(startIdx).concat(r.alive.slice(0, startIdx));
  state.screen = "category";
  render();
  startTurnTimer();
}

function currentCategoryTeam() {
  const r = state.round;
  return r.alive[r.activePos % r.alive.length];
}

function startTurnTimer() {
  clearInterval(state.round.timerId);
  state.round.timeLeft = TURN_SECONDS;
  state.round.timerId = setInterval(() => {
    state.round.timeLeft -= 0.1;
    if (state.round.timeLeft <= 0) {
      state.round.timeLeft = 0;
      clearInterval(state.round.timerId);
      eliminateTeam(currentCategoryTeam(), "ran out of time");
      return;
    }
    updateTimerBarOnly();
  }, 100);
}

function updateTimerBarOnly() {
  const bar = document.getElementById("catTimerBar");
  if (!bar) return;
  const pct = Math.max(0, (state.round.timeLeft / TURN_SECONDS) * 100);
  bar.style.width = pct + "%";
  bar.classList.toggle("warn", pct <= 50 && pct > 20);
  bar.classList.toggle("danger", pct <= 20);
  const numEl = document.getElementById("catTimerNum");
  if (numEl) numEl.textContent = Math.ceil(state.round.timeLeft);
}

function eliminateTeam(teamIdx, reasonText) {
  const r = state.round;
  r.alive = r.alive.filter(t => t !== teamIdx);
  if (r.alive.length <= 1) {
    clearInterval(r.timerId);
    finishCategoryRound();
    return;
  }
  // move activePos to next alive team relative to eliminated one
  render();
  advanceCategoryTurn();
}

function advanceCategoryTurn() {
  const r = state.round;
  r.activePos = (r.activePos) % r.alive.length;
  render();
  startTurnTimer();
}

function finishCategoryRound() {
  const r = state.round;
  const winnerTeam = r.alive[0];
  const genre = GENRES[Math.floor(Math.random() * GENRES.length)];
  const given = awardGenre(winnerTeam, genre);
  state.turnPointer = (r.startTeam + 1) % state.teamCount;
  state.lastAward = { teamIdx: winnerTeam, genre: given, roundType: "category" };
  if (state.screen !== "winner") state.screen = "roundResult";
  render();
}

function submitCategoryAnswer(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  const r = state.round;
  const dupe = r.given.some(g => g.toLowerCase() === trimmed.toLowerCase());
  if (dupe) {
    flashInputError("Already said! Try another.");
    return;
  }
  clearInterval(r.timerId);
  r.pendingAnswer = trimmed;
  render();
}

function flashInputError(msg) {
  const input = document.getElementById("catAnswerInput");
  if (!input) return;
  input.placeholder = msg;
  input.value = "";
}

function resolvePendingAnswer(valid) {
  const r = state.round;
  const teamIdx = currentCategoryTeam();
  if (valid) {
    r.given.push(r.pendingAnswer);
    r.pendingAnswer = null;
    r.activePos++;
    advanceCategoryTurn();
  } else {
    r.pendingAnswer = null;
    eliminateTeam(teamIdx, "gave an invalid answer");
  }
}

function renderCategoryRound() {
  const r = state.round;
  const activeTeamIdx = currentCategoryTeam();
  const activeTeam = state.teams[activeTeamIdx];
  const eliminated = state.teams
    .map((t, i) => i)
    .filter(i => !r.alive.includes(i));

  appEl.innerHTML = `
    ${boardHtml()}
    <div class="card">
      <div class="category-banner">
        <div class="label">Category</div>
        <div class="value">${escapeHtml(r.category)}</div>
      </div>

      ${r.pendingAnswer ? `
        <div class="pending-answer">
          <div class="who">${escapeHtml(activeTeam.name)} says:</div>
          <div class="what">"${escapeHtml(r.pendingAnswer)}"</div>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn good" id="validBtn">✅ Valid</button>
            <button class="btn danger" id="invalidBtn">❌ Invalid</button>
          </div>
          <p class="hint">Other players judge: does it really fit the category?</p>
        </div>
      ` : `
        <div class="timer-bar-outer"><div class="timer-bar-inner" id="catTimerBar" style="width:100%"></div></div>
        <div class="turn-status" style="color:${activeTeam.color}">
          <span id="catTimerNum">${Math.ceil(r.timeLeft)}</span>s — ${escapeHtml(activeTeam.name)}'s turn
        </div>
        <form class="answer-form" id="catAnswerForm">
          <input type="text" id="catAnswerInput" autocomplete="off" placeholder="Type a movie title..." autofocus />
          <button class="btn" type="submit">Submit</button>
        </form>
      `}

      ${r.given.length ? `<div class="given-answers">${r.given.map(g => `<span>${escapeHtml(g)}</span>`).join("")}</div>` : ""}
      ${eliminated.length ? `<div class="eliminated-list">Out: ${eliminated.map(i => escapeHtml(state.teams[i].name)).join(", ")}</div>` : ""}

      <div class="btn-row">
        <button class="btn small danger" id="forfeitBtn">${escapeHtml(activeTeam.name)} gives up this turn</button>
      </div>
    </div>
  `;

  const form = document.getElementById("catAnswerForm");
  if (form) {
    form.addEventListener("submit", e => {
      e.preventDefault();
      submitCategoryAnswer(document.getElementById("catAnswerInput").value);
    });
  }
  const validBtn = document.getElementById("validBtn");
  if (validBtn) validBtn.addEventListener("click", () => resolvePendingAnswer(true));
  const invalidBtn = document.getElementById("invalidBtn");
  if (invalidBtn) invalidBtn.addEventListener("click", () => resolvePendingAnswer(false));
  document.getElementById("forfeitBtn").addEventListener("click", () => {
    clearInterval(r.timerId);
    eliminateTeam(activeTeamIdx, "gave up");
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
    timeLeft: CLUE_ROUND_SECONDS,
    timerId: null,
    started: false,
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
        <p>The Clue Giver has ${CLUE_ROUND_SECONDS} seconds to get their team to guess 3 movies by reading the quote, saying one word, or acting it out (no title, no spelling, no "sounds like").</p>
        <button class="btn" id="clueReadyBtn">Clue Giver is ready — Start 30s Timer</button>
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
          <div class="movie-genre">${movie.genre}</div>
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
      ? `<p><strong>${escapeHtml(team.name)}</strong> wins the round and earns the <strong>${a.genre}</strong> genre card!</p>`
      : `<p><strong>${escapeHtml(team.name)}</strong> already has every genre card.</p>`;
  } else {
    body = `<p><strong>${escapeHtml(team.name)}</strong> guessed ${a.correct} / ${a.total} movies` +
      (a.genres.length ? ` and earned: <strong>${a.genres.join(", ")}</strong>.` : ".") + `</p>`;
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
      <div class="trophy">🏆</div>
      <h1 style="color:${team.color}">${escapeHtml(team.name)} wins Blockbuster!</h1>
      <p>Collected all ${GENRES.length} genre cards.</p>
      ${boardHtml()}
      <button class="btn" id="playAgainBtn">Play Again</button>
    </div>
  `;
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    initState();
    render();
  });
}

// patch render to include roundResult screen
const _origRender = render;
render = function () {
  newGameBtn.hidden = state.screen === "setup";
  if (state.screen === "roundResult") return renderRoundResult();
  return _origRender();
};

newGameBtn.addEventListener("click", () => {
  if (confirm("Start a brand new game? Current progress will be lost.")) {
    initState();
    render();
  }
});

initState();
render();
