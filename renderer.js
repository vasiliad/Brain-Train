import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// НАСТРОЙКИ ОБЛАКА FIREBASE
// Когда создадите проект, раскомментируйте строки ниже и вставьте свои ключи:
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBfTfq4AnX-h_D5O1f8AMgOcc5yS8XxkII",
  authDomain: "brain-train-99e93.firebaseapp.com",
  projectId: "brain-train-99e93",
  storageBucket: "brain-train-99e93.firebasestorage.app",
  messagingSenderId: "387198830671",
  appId: "1:387198830671:web:ae23892fe3873e0c9d823a"
};

const useFirebase = Object.keys(firebaseConfig).length > 0;
let db = null;
if (useFirebase) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

// Memory Test Game Logic
const VIEW_TIME = 60000; // 60 seconds in ms
const NUMBER_LENGTH = 10;

// Mersenne Twister (MT19937) - Monte Carlo grade RNG
class MersenneTwister {
  constructor(seed = Date.now()) {
    this.N = 624;
    this.M = 397;
    this.MATRIX_A = 0x9908b0df;
    this.UPPER_MASK = 0x80000000;
    this.LOWER_MASK = 0x7fffffff;
    this.mt = new Array(this.N);
    this.mti = this.N + 1;
    this.init_genrand(seed);
  }

  init_genrand(s) {
    this.mt[0] = s >>> 0;
    for (this.mti = 1; this.mti < this.N; this.mti++) {
      const t = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
      this.mt[this.mti] = (((((t & 0xffff0000) >>> 16) * 1812433253) << 16) + (t & 0x0000ffff) * 1812433253)
        + this.mti;
      this.mt[this.mti] >>>= 0;
    }
  }

  genrand_int32() {
    let y;
    const mag01 = [0x0, this.MATRIX_A];

    if (this.mti >= this.N) {
      let kk;
      for (kk = 0; kk < this.N - this.M; kk++) {
        y = (this.mt[kk] & this.UPPER_MASK) | (this.mt[kk + 1] & this.LOWER_MASK);
        this.mt[kk] = this.mt[kk + this.M] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      for (; kk < this.N - 1; kk++) {
        y = (this.mt[kk] & this.UPPER_MASK) | (this.mt[kk + 1] & this.LOWER_MASK);
        this.mt[kk] = this.mt[kk + this.M - this.N] ^ (y >>> 1) ^ mag01[y & 0x1];
      }
      y = (this.mt[this.N - 1] & this.UPPER_MASK) | (this.mt[0] & this.LOWER_MASK);
      this.mt[this.N - 1] = this.mt[this.M - 1] ^ (y >>> 1) ^ mag01[y & 0x1];
      this.mti = 0;
    }

    y = this.mt[this.mti++];
    y ^= (y >>> 11);
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= (y >>> 18);
    return y >>> 0;
  }

  // Random float in [0, 1)
  random() {
    return this.genrand_int32() * (1.0 / 4294967296.0);
  }

  // Random integer in [0, max)
  randomInt(max) {
    return Math.floor(this.random() * max);
  }
}

// Initialize RNG with timestamp seed
const rng = new MersenneTwister();

// Game state
let currentState = 'viewing'; // 'viewing', 'inputting', 'result'
let currentNumber = '';
let timerInterval = null;
let timeRemaining = 60;
let sessions = [];
let gameMode = 'normal'; // 'normal' or 'trainer'
let currentUserName = '';

// Trainer mode state
let trainerCurrentNumber = null;
let trainerAttempts = 0;

// DOM Elements
const viewState = document.getElementById('viewState');
const inputState = document.getElementById('inputState');
const resultState = document.getElementById('resultState');
const digitsDisplay = document.getElementById('digitsDisplay');
const inputDigits = document.getElementById('inputDigits');
const timerDisplay = document.getElementById('timerDisplay');
const timerProgress = document.querySelector('.timer-progress');
const submitBtn = document.getElementById('submitBtn');
const skipBtn = document.getElementById('skipBtn');
const nextBtn = document.getElementById('nextBtn');
const resultDisplay = document.getElementById('resultDisplay');
const resultsBtn = document.getElementById('resultsBtn');
const resultsModal = document.getElementById('resultsModal');
const closeModal = document.getElementById('closeModal');
const modalCorrect = document.getElementById('modalCorrect');
const modalIncorrect = document.getElementById('modalIncorrect');
const modalTotal = document.getElementById('modalTotal');
const modalAccuracy = document.getElementById('modalAccuracy');
const historyList = document.getElementById('historyList');
const statsCorrect = document.getElementById('statsCorrect');
const statsTotal = document.getElementById('statsTotal');
const statsStreak = document.getElementById('statsStreak');
const attemptCounter = document.getElementById('attemptCounter');
const trainerInfo = document.getElementById('trainerInfo');
const modeNormalBtn = document.getElementById('modeNormal');
const modeTrainerBtn = document.getElementById('modeTrainer');
const readyBtn = document.getElementById('readyBtn');
const welcomeScreen = document.getElementById('welcomeScreen');
const mainApp = document.getElementById('mainApp');
const welcomeTitle = document.getElementById('welcomeTitle');
const welcomeMessage = document.getElementById('welcomeMessage');
const nameInputContainer = document.getElementById('nameInputContainer');
const userNameInput = document.getElementById('userNameInput');
const startGameBtn = document.getElementById('startGameBtn');

// Initialize
function init() {
  setupModeSelector();
  setupEventListeners();
  checkUser();
}

function checkUser() {
  const savedName = localStorage.getItem('brainTrainUserName');
  if (savedName) {
    welcomeTitle.textContent = `Привет, ${savedName}!`;
    welcomeMessage.textContent = "Мы рады, что ты вернулся, чтобы дальше тренировать свою память.";
    nameInputContainer.style.display = 'none';
  } else {
    welcomeTitle.textContent = "Добро пожаловать в Brain Train!";
    welcomeMessage.textContent = "Как мы можем к тебе обращаться?";
  }
}

async function startGameFlow() {
  let name = localStorage.getItem('brainTrainUserName');
  if (!name && nameInputContainer.style.display !== 'none') {
    name = userNameInput.value.trim();
    if (name) {
      localStorage.setItem('brainTrainUserName', name);
    }
  }
  
  if (!name) name = "Гость";
  currentUserName = name;

  // Show loading state on button
  const originalBtnText = startGameBtn.textContent;
  startGameBtn.textContent = "Загрузка профиля...";
  startGameBtn.disabled = true;

  await loadSessions();
  
  welcomeScreen.style.display = 'none';
  mainApp.style.display = 'flex';
  startNewGame();
}

// Load sessions
async function loadSessions() {
  if (useFirebase && db) {
    try {
      const docRef = doc(db, "users", currentUserName);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        sessions = docSnap.data().sessions || [];
      } else {
        sessions = [];
      }
    } catch (e) {
      console.error("Firebase load error:", e);
      loadLocalSessions(); // Fallback
    }
  } else {
    loadLocalSessions();
  }
  updateStats();
}

function loadLocalSessions() {
  try {
    const stored = localStorage.getItem(`memoryTestSessions_${currentUserName}`);
    if (stored) {
      sessions = JSON.parse(stored);
    } else {
      sessions = [];
    }
  } catch (e) {
    sessions = [];
  }
}

// Save sessions
async function saveSessions() {
  if (useFirebase && db) {
    try {
      await setDoc(doc(db, "users", currentUserName), {
        sessions: sessions,
        lastActive: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Firebase save error:", e);
      saveLocalSessions(); // Fallback
    }
  } else {
    saveLocalSessions();
  }
}

function saveLocalSessions() {
  try {
    localStorage.setItem(`memoryTestSessions_${currentUserName}`, JSON.stringify(sessions));
  } catch (e) {
    console.error('Failed to save sessions:', e);
  }
}

// Generate random 10-digit number using Mersenne Twister (Monte Carlo grade RNG)
function generateNumber() {
  let num = '';
  for (let i = 0; i < NUMBER_LENGTH; i++) {
    num += rng.randomInt(10);
  }
  return num;
}

// Display number with spaced digits
function displayNumber(number) {
  digitsDisplay.innerHTML = '';
  for (let i = 0; i < number.length; i++) {
    const span = document.createElement('span');
    span.className = 'digit';
    span.textContent = number[i];
    span.style.animationDelay = `${i * 0.05}s`;
    digitsDisplay.appendChild(span);
  }
}

// Start timer
function startTimer() {
  timeRemaining = 60;
  updateTimerDisplay();

  timerInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();

    if (timeRemaining <= 0) {
      clearInterval(timerInterval);
      readyToInput();
    }
  }, 1000);
}

// Transition to input state
function readyToInput() {
  clearInterval(timerInterval);
  setState('inputting');
  const inputs = inputDigits.querySelectorAll('input');
  if (inputs.length > 0) {
    inputs[0].focus();
  }
}

// Update timer display
function updateTimerDisplay() {
  timerDisplay.textContent = timeRemaining;

  // Update progress ring (283 = 2 * PI * 45)
  const progress = (timeRemaining / 60) * 283;
  timerProgress.style.strokeDashoffset = 283 - progress;

  // Color changes
  timerProgress.classList.remove('warning', 'danger');
  if (timeRemaining <= 10) {
    timerProgress.classList.add('danger');
  } else if (timeRemaining <= 20) {
    timerProgress.classList.add('warning');
  }
}

// Switch game state
function setState(state) {
  currentState = state;
  viewState.classList.toggle('active', state === 'viewing');
  inputState.classList.toggle('active', state === 'inputting');
  resultState.classList.toggle('active', state === 'result');
}

// Setup mode selector - Removed since we only have one mode now
function setupModeSelector() {
  // No-op
}

// Start new game round
function startNewGame() {
  // If we don't have a current number (first game) or last attempt was correct, generate new
  if (trainerCurrentNumber === null) {
    trainerCurrentNumber = generateNumber();
    trainerAttempts = 0;
  }
  
  currentNumber = trainerCurrentNumber;

  displayNumber(currentNumber);
  setState('viewing');
  startTimer();
  updateAttemptCounter();

  // Clear input fields
  const inputs = inputDigits.querySelectorAll('input');
  inputs.forEach(input => {
    input.value = '';
    input.classList.remove('correct', 'incorrect', 'empty');
    input.disabled = false;
  });
  inputs[0].focus();

  // Hide trainer info
  trainerInfo.style.display = 'none';
  trainerInfo.classList.remove('success');
}

// Update attempt counter display
function updateAttemptCounter() {
  if (trainerCurrentNumber !== null && trainerAttempts > 0) {
    attemptCounter.style.display = 'block';
    attemptCounter.innerHTML = `<span style="color: #ff4757; font-weight: bold; font-size: 1.2em;">Попытка: ${trainerAttempts + 1}</span> (нужно повторить до успеха)`;
  } else {
    attemptCounter.style.display = 'none';
  }
}

// Auto-submit when timer expires
function autoSubmit() {
  const inputs = inputDigits.querySelectorAll('input');
  let userInput = '';
  inputs.forEach(input => {
    userInput += input.value || ' ';
  });
  checkAnswer(userInput.trim());
}

// Submit answer
function submitAnswer() {
  clearInterval(timerInterval);

  const inputs = inputDigits.querySelectorAll('input');
  let userInput = '';
  let allFilled = true;

  inputs.forEach(input => {
    userInput += input.value || ' ';
    if (!input.value) allFilled = false;
  });

  userInput = userInput.trim();

  if (!allFilled && userInput.length < NUMBER_LENGTH) {
    // Fill empty with spaces for comparison
    userInput = userInput.padEnd(NUMBER_LENGTH, ' ');
  }

  checkAnswer(userInput);
}

// Check answer
function checkAnswer(userInput) {
  const isCorrect = userInput === currentNumber;

  // Save session
  const session = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    number: currentNumber,
    input: userInput,
    correct: isCorrect,
    mode: 'trainer',
    attempts: trainerAttempts + 1
  };
  sessions.push(session);
  saveSessions();

  trainerAttempts++;
  if (isCorrect) {
    // Success! Show info and prepare for next number
    showTrainerSuccess(trainerAttempts);
    trainerCurrentNumber = null; // Will generate new on next round
    trainerAttempts = 0;
  } else {
    // Failed - same number again
    updateAttemptCounter();
  }

  // Show result with motivational message
  showResult(isCorrect, userInput);
  updateStats();
}

// Show trainer success info
function showTrainerSuccess(attempts) {
  trainerInfo.style.display = 'block';
  trainerInfo.classList.add('success');
  trainerInfo.innerHTML = `✓ Запомнено с <strong>${attempts}</strong> ${attempts === 1 ? 'попытки' : attempts < 5 ? 'попыток' : 'попыток'}!`;
}

// Show result
function showResult(isCorrect, userInput) {
  setState('result');

  let attemptNumber = trainerAttempts; // Already incremented in checkAnswer

  let message = isCorrect ? 'Правильно!' : 'Неправильно';
  if (isCorrect) {
    message = `Успешно с ${attemptNumber}-й попытки`;
    nextBtn.textContent = 'Следующее число';
  } else {
    message += ` (${attemptNumber}-я попытка)`;
    nextBtn.textContent = 'Попробовать еще раз';
  }

  resultDisplay.className = 'result-display ' + (isCorrect ? 'correct' : 'incorrect');
  resultDisplay.innerHTML = `
    <div class="result-icon"></div>
    <div class="result-title">${message}</div>
    <div class="result-detail">
      Было: <span>${formatNumber(currentNumber)}</span><br>
      Ввели: <span>${formatNumber(userInput)}</span>
    </div>
  `;
}

// Format number for display (continuous string)
function formatNumber(num) {
  return num;
}

// Update footer stats
function updateStats() {
  const correct = sessions.filter(s => s.correct).length;
  const total = sessions.length;
  const incorrect = total - correct;

  // Calculate current streak
  let streak = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].correct) {
      streak++;
    } else {
      break;
    }
  }

  statsCorrect.innerHTML = `Правильно: <strong>${correct}</strong>`;
  statsTotal.innerHTML = `Всего: <strong>${total}</strong>`;
  statsStreak.innerHTML = `Серия: <strong>${streak}</strong>`;
}

// Show results modal
function showResultsModal() {
  const correct = sessions.filter(s => s.correct).length;
  const total = sessions.length;
  const incorrect = total - correct;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  modalCorrect.textContent = correct;
  modalIncorrect.textContent = incorrect;
  modalTotal.textContent = total;
  modalAccuracy.textContent = `${accuracy}%`;

  // Render history (latest first)
  historyList.innerHTML = '';
  if (sessions.length === 0) {
    historyList.innerHTML = '<div class="history-empty">История пуста. Начните играть!</div>';
  } else {
    [...sessions].reverse().forEach(session => {
      const item = document.createElement('div');
      item.className = `history-item ${session.correct ? 'correct' : 'incorrect'}`;
      const time = new Date(session.timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      const modeLabel = session.mode === 'trainer' ? ' 🎯' : '';
      const attemptsInfo = session.mode === 'trainer' && session.attempts ? ` (попыток: ${session.attempts})` : '';
      item.innerHTML = `
        <span class="history-number">${formatNumber(session.number)}${modeLabel}${attemptsInfo}</span>
        <span class="history-input">${formatNumber(session.input)}</span>
        <span class="history-time">${time}</span>
      `;
      historyList.appendChild(item);
    });
  }

  resultsModal.showModal();
}

// Close results modal
function closeResultsModal() {
  resultsModal.close();
}

// Event Listeners
function setupEventListeners() {
  startGameBtn.addEventListener('click', startGameFlow);
  userNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startGameFlow();
  });
  
  submitBtn.addEventListener('click', submitAnswer);
  readyBtn.addEventListener('click', readyToInput);
  skipBtn.addEventListener('click', () => {
    clearInterval(timerInterval);
    autoSubmit();
  });
  nextBtn.addEventListener('click', startNewGame);
  resultsBtn.addEventListener('click', showResultsModal);
  closeModal.addEventListener('click', closeResultsModal);

  // Close modal on backdrop click
  resultsModal.addEventListener('click', (e) => {
    if (e.target === resultsModal) {
      closeResultsModal();
    }
  });

  // Input handling - auto-advance
  const inputs = inputDigits.querySelectorAll('input');
  inputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      // Only allow digits
      e.target.value = e.target.value.replace(/[^0-9]/g, '');

      if (e.target.value && index < inputs.length - 1) {
        inputs[index + 1].focus();
      }

      // Auto-submit when all filled
      const allFilled = Array.from(inputs).every(inp => inp.value);
      if (allFilled) {
        submitAnswer();
      }
    });

    // Handle backspace
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && index > 0) {
        inputs[index - 1].focus();
      }
    });

    // Paste handling
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '');
      if (pasted.length > 0) {
        const digits = pasted.slice(0, NUMBER_LENGTH - index);
        for (let i = 0; i < digits.length; i++) {
          if (inputs[index + i]) {
            inputs[index + i].value = digits[i];
          }
        }
        const nextIdx = Math.min(index + digits.length, inputs.length - 1);
        inputs[nextIdx].focus();

        // Check if all filled
        const allFilled = Array.from(inputs).every(inp => inp.value);
        if (allFilled) {
          submitAnswer();
        }
      }
    });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (resultsModal.open) {
        closeResultsModal();
      }
    }
    if (e.key === 'Enter' && currentState === 'result') {
      startNewGame();
    }
    if (e.key === 'r' || e.key === 'R') {
      if (currentState !== 'inputting' || document.activeElement.tagName !== 'INPUT') {
        showResultsModal();
      }
    }
  });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);