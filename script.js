/*
  FLOW TO THE VILLAGE
  A small, original student-style puzzle game. No packages required.

  Game logic in plain English:
  1. Put a spring and a home at opposite ends of a route.
  2. Randomize the rotations of the pipe tiles along that route.
  3. When a pipe is clicked, rotate it clockwise 90 degrees.
  4. Check whether each pipe opening matches its neighbors.
  5. When a connected route reaches the home, finish the level.
  6. Brown polluted tiles cost points and seconds. The timer is a challenge.
*/

const SIZE = 5;
const DIRECTIONS = ["N", "E", "S", "W"];
const DELTAS = [-SIZE, 1, SIZE, -1];
const OPPOSITE = { N: "S", E: "W", S: "N", W: "E" };

// Each number is a square on the 5x5 board (0-24), read left to right.
// The first square is the spring, and the last square is the neighborhood.
const levels = [
  {
    name: "Creekside",
    subtitle: "Help the first neighborhood get connected.",
    route: [0, 1, 2, 7, 12, 13, 14, 19, 24],
    pollution: [5, 11, 22],
    time: 75
  },
  {
    name: "Maple Market",
    subtitle: "The market needs a dependable water line.",
    route: [4, 9, 14, 13, 12, 17, 22, 21, 20],
    pollution: [2, 7, 18],
    time: 80
  },
  {
    name: "Sunrise Hill",
    subtitle: "One last connection before the mission is complete.",
    route: [2, 7, 8, 9, 14, 19, 18, 17, 22, 21, 20],
    pollution: [0, 5, 12, 24],
    time: 95
  }
];

const board = document.getElementById("board");
const scoreDisplay = document.getElementById("score");
const timerDisplay = document.getElementById("timer");
const connectedDisplay = document.getElementById("connected-count");
const villageProgress = document.getElementById("village-progress");
const levelNumber = document.getElementById("level-number");
const villageTitle = document.getElementById("village-title");
const villageSubtitle = document.getElementById("village-subtitle");
const modal = document.getElementById("modal");
const modalAction = document.getElementById("modal-action");
const modalSecondary = document.getElementById("modal-secondary");
const modalEmblem = document.getElementById("modal-emblem");
const modalKicker = document.getElementById("modal-kicker");
const modalTitle = document.getElementById("modal-title");
const modalText = document.getElementById("modal-text");
const toast = document.getElementById("toast");

let currentLevel = 0;
let points = 0;
let secondsLeft = levels[0].time;
let playing = false;
let pausedForHelp = false;
let clock = null;
let toastTimeout = null;
let tileData = [];

function directionBetween(a, b) {
  const rowA = Math.floor(a / SIZE), rowB = Math.floor(b / SIZE);
  const colA = a % SIZE, colB = b % SIZE;
  if (rowA === rowB && colB === colA + 1) return "E";
  if (rowA === rowB && colB === colA - 1) return "W";
  if (colA === colB && rowB === rowA + 1) return "S";
  if (colA === colB && rowB === rowA - 1) return "N";
  throw new Error("Route tiles must be neighbors: " + a + " -> " + b);
}

function rotatedOpenings(type, rotation) {
  const starting = type === "straight" ? ["N", "S"] : ["N", "E"];
  return starting.map(d => DIRECTIONS[(DIRECTIONS.indexOf(d) + rotation) % 4]);
}

function matchesOpenings(a, b) {
  return a.length === b.length && a.every(direction => b.includes(direction));
}

function makeTiles() {
  const level = levels[currentLevel];
  const route = level.route;
  tileData = Array.from({ length: SIZE * SIZE }, (_, id) => ({ id, type: "ground" }));

  route.forEach((id, step) => {
    if (step === 0) {
      tileData[id] = { id, type: "source", openings: [directionBetween(id, route[step + 1])] };
      return;
    }
    if (step === route.length - 1) {
      tileData[id] = { id, type: "home", openings: [directionBetween(id, route[step - 1])] };
      return;
    }

    const needed = [directionBetween(id, route[step - 1]), directionBetween(id, route[step + 1])];
    const type = OPPOSITE[needed[0]] === needed[1] ? "straight" : "corner";
    const correctRotation = [0, 1, 2, 3].find(rotation => matchesOpenings(rotatedOpenings(type, rotation), needed));
    // Every pipe starts misaligned, so the puzzle always has something to solve.
    const wrongOffset = Math.random() > 0.5 ? 1 : 3;
    tileData[id] = {
      id, type, rotation: (correctRotation + wrongOffset) % 4,
      correctRotation, rewarded: false
    };
  });

  level.pollution.forEach(id => { tileData[id] = { id, type: "hazard" }; });
}

function pipeSvg(type, rotation) {
  const path = type === "straight" ? "M50 5 L50 95" : "M50 5 L50 50 L95 50";
  return `<svg class="pipe-icon" style="--rotation:${rotation * 90}deg" viewBox="0 0 100 100" aria-hidden="true">
     <path class="pipe-shadow" d="${path}"/><path class="pipe-water" d="${path}"/><circle cx="50" cy="50" r="9"/>
   </svg>`;
}

function renderBoard() {
  board.innerHTML = "";
  const fragment = document.createDocumentFragment();

  tileData.forEach(tile => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `tile ${tile.type}`;
    button.dataset.id = tile.id;
    if (tile.type === "straight" || tile.type === "corner") {
      button.classList.add("pipe");
      button.setAttribute("aria-label", `Row ${Math.floor(tile.id / SIZE) + 1}, column ${tile.id % SIZE + 1}: rotate ${tile.type} pipe`);
      button.innerHTML = pipeSvg(tile.type, tile.rotation);
      button.addEventListener("click", () => rotatePipe(tile.id));
    } else if (tile.type === "source") {
      button.innerHTML = '<span class="special-icon" aria-hidden="true">💧</span><span class="tile-label">SPRING</span>';
      button.setAttribute("aria-label", "Clean water spring. Start of pipeline.");
      button.disabled = true;
    } else if (tile.type === "home") {
      button.innerHTML = '<span class="special-icon" aria-hidden="true">🏠</span><span class="tile-label">HOME</span>';
      button.setAttribute("aria-label", "Village home. End of pipeline.");
      button.disabled = true;
    } else if (tile.type === "hazard") {
      button.innerHTML = '<span class="hazard-icon" aria-hidden="true">🟤</span><span class="tile-label">DIRTY</span>';
      button.setAttribute("aria-label", "Polluted water! Clicking loses 15 points and 4 seconds.");
      button.addEventListener("click", collectPollution);
    } else {
      button.innerHTML = "";
      button.setAttribute("aria-label", "Empty ground");
      button.disabled = true;
    }
    fragment.appendChild(button);
  });
  board.appendChild(fragment);
  updateFlow();
}

function displayStats() {
  scoreDisplay.textContent = points;
  timerDisplay.textContent = secondsLeft;
  timerDisplay.parentElement.style.color = secondsLeft <= 15 ? "#b43c32" : "";
  villageProgress.textContent = `COMMUNITY ${currentLevel + 1} OF ${levels.length}`;
  for (let i = 0; i < levels.length; i++) {
    document.getElementById(`dot-${i}`).classList.toggle("done", i < currentLevel);
  }
}

function isNeighbor(a, b, direction) {
  if (direction === "E") return Math.floor(a / SIZE) === Math.floor(b / SIZE) && b === a + 1;
  if (direction === "W") return Math.floor(a / SIZE) === Math.floor(b / SIZE) && b === a - 1;
  if (direction === "S") return b === a + SIZE;
  return b === a - SIZE;
}

function openings(tile) {
  if (tile.type === "source" || tile.type === "home") return tile.openings;
  if (tile.type === "straight" || tile.type === "corner") return rotatedOpenings(tile.type, tile.rotation);
  return [];
}

// Walk the pipeline from the spring, but only cross when BOTH pipes connect.
function findFlow() {
  const start = levels[currentLevel].route[0];
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const id = queue.shift();
    const tile = tileData[id];
    for (const direction of openings(tile)) {
      const nextId = id + DELTAS[DIRECTIONS.indexOf(direction)];
      if (nextId < 0 || nextId >= SIZE * SIZE || !isNeighbor(id, nextId, direction)) continue;
      if (visited.has(nextId) || !openings(tileData[nextId]).includes(OPPOSITE[direction])) continue;
      visited.add(nextId);
      queue.push(nextId);
    }
  }
  return visited;
}

function updateFlow() {
  const flowing = findFlow();
  const route = levels[currentLevel].route;
  const totalPipes = route.length - 2;
  const connected = route.slice(1, -1).filter(id => flowing.has(id)).length;
  connectedDisplay.textContent = `${connected} / ${totalPipes}`;

  board.querySelectorAll(".tile.pipe").forEach(element => {
    const tile = tileData[Number(element.dataset.id)];
    element.classList.toggle("active", flowing.has(tile.id));
    element.classList.toggle("correct", isAligned(tile));
  });
  return flowing.has(route[route.length - 1]);
}

function isAligned(tile) {
  return matchesOpenings(rotatedOpenings(tile.type, tile.rotation), rotatedOpenings(tile.type, tile.correctRotation));
}

function rotatePipe(id) {
  if (!playing) return;
  const tile = tileData[id];
  tile.rotation = (tile.rotation + 1) % 4;
  const button = board.querySelector(`[data-id="${id}"]`);
  button.querySelector(".pipe-icon").style.setProperty("--rotation", `${tile.rotation * 90}deg`);
  if (isAligned(tile) && !tile.rewarded) {
    tile.rewarded = true;
    points += 10;
    showToast("+10 · Pipe lined up!");
  }
  displayStats();
  if (updateFlow()) completeLevel();
}

function collectPollution() {
  if (!playing) return;
  points = Math.max(0, points - 15);
  secondsLeft = Math.max(0, secondsLeft - 4);
  displayStats();
  showToast("Pollution! −15 points, −4 seconds");
  if (secondsLeft === 0) outOfTime();
}

function showToast(message) {
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 1400);
}

function stopClock() {
  if (clock) clearInterval(clock);
  clock = null;
}

function startClock() {
  stopClock();
  clock = setInterval(() => {
    if (!playing) return;
    secondsLeft = Math.max(0, secondsLeft - 1);
    displayStats();
    if (secondsLeft === 0) outOfTime();
  }, 1000);
}

function configureModal({ emblem, kicker, title, text, action, onAction, secondary, onSecondary }) {
  modalEmblem.textContent = emblem;
  modalKicker.textContent = kicker;
  modalTitle.innerHTML = title;
  modalText.textContent = text;
  modalAction.textContent = action;
  modalAction.onclick = onAction;
  modalSecondary.hidden = !secondary;
  if (secondary) {
    modalSecondary.textContent = secondary;
    modalSecondary.onclick = onSecondary;
  }
  modal.hidden = false;
  modalAction.focus();
}

function hideModal() { modal.hidden = true; }

function prepareLevel() {
  playing = false;
  stopClock();
  secondsLeft = levels[currentLevel].time;
  levelNumber.textContent = String(currentLevel + 1).padStart(2, "0");
  villageTitle.textContent = levels[currentLevel].name;
  villageSubtitle.textContent = levels[currentLevel].subtitle;
  makeTiles();
  renderBoard();
  displayStats();
}

function startLevel() {
  hideModal();
  playing = true;
  pausedForHelp = false;
  startClock();
}

function resetMission() {
  points = 0;
  currentLevel = 0;
  document.getElementById("confetti").innerHTML = "";
  prepareLevel();
  configureModal({
    emblem: "💧", kicker: "WELCOME TO THE MISSION", title: "Ready to make<br>a connection?",
    text: "Three neighborhoods need clean water. Tap the blue pipes to rotate them until the spring connects to the home. Avoid the brown polluted tiles!",
    action: "Start the mission →", onAction: startLevel
  });
}

function completeLevel() {
  playing = false;
  stopClock();
  const bonus = 60 + Math.floor(secondsLeft / 5);
  points += bonus;
  displayStats();

  if (currentLevel === levels.length - 1) {
    document.querySelectorAll(".progress-dot").forEach(dot => dot.classList.add("done"));
    launchConfetti();
    configureModal({
      emblem: "🎉", kicker: "MISSION COMPLETE", title: "Three villages.<br>One awesome job!",
      text: `All three neighborhoods are connected! You earned ${points} points. Real clean water projects are more complex, but every solution starts by working together.`,
      action: "Play again ↻", onAction: resetMission
    });
  } else {
    configureModal({
      emblem: "🚰", kicker: "COMMUNITY CONNECTED", title: "The water<br>is flowing!",
      text: `${levels[currentLevel].name} now has a clean-water route! You earned a ${bonus}-point connection and time bonus. Ready for the next neighborhood?`,
      action: "Next community →", onAction: () => {
        currentLevel += 1;
        prepareLevel();
        startLevel();
      }
    });
  }
}

function outOfTime() {
  playing = false;
  stopClock();
  configureModal({
    emblem: "⏰", kicker: "TIME'S UP", title: "Almost there!<br>Try again?",
    text: "The timer ran out before the water reached the home. Take another shot and see if you can connect all three communities.",
    action: "Restart mission ↻", onAction: resetMission
  });
}

function showInstructions() {
  if (playing) {
    pausedForHelp = true;
    playing = false;
    stopClock();
  }
  configureModal({
    emblem: "🧩", kicker: "HOW TO PLAY", title: "Connect the<br>clean water.",
    text: "1) Click a blue pipe to rotate it clockwise. 2) Join the spring (💧) to the home (🏠). 3) Aligned pipes earn +10 once. 4) Brown polluted squares take 15 points and 4 seconds. 5) Beat the timer to reach all 3 communities.",
    action: "Got it! →", onAction: () => {
      hideModal();
      if (pausedForHelp) {
        pausedForHelp = false;
        playing = true;
        startClock();
      }
    }
  });
}

function launchConfetti() {
  const layer = document.getElementById("confetti");
  layer.innerHTML = "";
  const colors = ["#ffd447", "#45b7d2", "#2caf85", "#f28b56", "#ffffff"];
  for (let i = 0; i < 90; i++) {
    const bit = document.createElement("span");
    bit.className = "confetti-bit";
    bit.style.setProperty("--left", `${Math.random() * 100}%`);
    bit.style.setProperty("--drift", `${(Math.random() - .5) * 200}px`);
    bit.style.setProperty("--color", colors[i % colors.length]);
    bit.style.setProperty("--delay", `${Math.random() * 0.7}s`);
    bit.style.setProperty("--duration", `${2.2 + Math.random() * 1.5}s`);
    layer.appendChild(bit);
  }
  setTimeout(() => { layer.innerHTML = ""; }, 4400);
}

document.getElementById("reset-button").addEventListener("click", resetMission);
document.getElementById("how-button").addEventListener("click", showInstructions);
resetMission();
