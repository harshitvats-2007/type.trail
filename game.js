// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBJLe3ijqtluFB8_DPcf1bM55pIdPx1TI8",
    authDomain: "type-trail.firebaseapp.com",
    databaseURL: "https://type-trail-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "type-trail",
    storageBucket: "type-trail.firebasestorage.app",
    messagingSenderId: "754135474412",
    appId: "1:754135474412:web:f3553cfa9c4060e1cec5c9",
    measurementId: "G-DM4FJDG8GH"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('scoreVal');
const missedElement = document.getElementById('missedVal');
const comboElement = document.getElementById('comboVal');
const wpmElement = document.getElementById('wpmVal');
const accElement = document.getElementById('accVal');
const flashOverlay = document.getElementById('flash-overlay');

const menuLayer = document.getElementById('menu-layer');
const uiLayer = document.getElementById('ui-layer');
const startBtn = document.getElementById('start-btn');
const finalResultsDisplay = document.getElementById('final-results');
const finalScoreDisplay = document.querySelector('#final-score span');
const finalWpmDisplay = document.getElementById('finalWpm');
const finalAccDisplay = document.getElementById('finalAcc');
const highScoreElement = document.getElementById('highScoreVal');
const leaderboardList = document.getElementById('leaderboard-list');
const virtualKeyboard = document.getElementById('virtual-keyboard');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let gameRunning = false;
let gameOver = false;
let score = 0;
let missed = 0;
let combo = 1;
let boxes = [];
let stamps = [];
let currentTarget = null;
let lastTime = 0;
let spawnTimer = 0;
let audioCtx = null;
let totalKeys = 0;
let correctKeys = 0;
let shiftStartTime = 0;

let highScore = localStorage.getItem('typeTrailHighScore') || 0;
highScoreElement.innerText = highScore;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- LEADERBOARD LOGIC ---
function saveScoreToFirebase(name, finalScore) {
    database.ref('leaderboard').push({
        name: name,
        score: finalScore,
        timestamp: Date.now()
    });
}

function loadLeaderboard() {
    database.ref('leaderboard').orderByChild('score').limitToLast(5).on('value', (snapshot) => {
        let scores = [];
        snapshot.forEach((child) => {
            scores.push(child.val());
        });
        scores.reverse();
        
        leaderboardList.innerHTML = "";
        scores.forEach((entry, index) => {
            leaderboardList.innerHTML += `<div>${index+1}. ${entry.name} <span>${entry.score}</span></div>`;
        });
    });
}

loadLeaderboard();

// --- AUDIO ---
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    if (type === 'type') { osc.frequency.setValueAtTime(400, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05); }
    else if (type === 'stamp') { osc.frequency.setValueAtTime(150, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3); }
    else if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
}

// --- API FETCH ---
let wordBuffer = [];
async function fetchParagraphs() {
    try {
        const response = await fetch('https://dummyjson.com/quotes/random');
        const data = await response.json();
        let cleaned = data.quote.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        wordBuffer = wordBuffer.concat(cleaned);
    } catch (e) { wordBuffer.push("type", "trail", "logic", "flow"); }
}
function getUniqueWord() { if (wordBuffer.length < 5) fetchParagraphs(); return wordBuffer.length === 0 ? "loading" : wordBuffer.shift(); }
fetchParagraphs();

const lanes = isMobile ? [canvas.height * 0.2, canvas.height * 0.4, canvas.height * 0.6] : [canvas.height * 0.25, canvas.height * 0.45, canvas.height * 0.65, canvas.height * 0.85];

class Stamp {
    constructor(x, y, text, color) { this.x = x; this.y = y; this.text = text; this.color = color; this.life = 1.0; this.scale = 2.0; }
    update() { if (this.scale > 1.0) this.scale -= 0.2; else this.life -= 0.03; }
    draw() { ctx.save(); ctx.globalAlpha = Math.max(0, this.life); ctx.fillStyle = this.color; ctx.font = `bold ${30 * this.scale}px 'Impact'`; ctx.fillText(this.text, this.x, this.y); ctx.restore(); }
}

class Box {
    constructor() { this.word = getUniqueWord(); this.x = -200; this.y = lanes[Math.floor(Math.random() * lanes.length)]; this.speed = 0.8 + Math.random() * 0.4; this.typedIndex = 0; }
    update(dt, speedMult) { this.x += this.speed * speedMult * (dt * 0.1); }
    draw() {
        let w = ctx.measureText(this.word).width + 40;
        ctx.fillStyle = "#8b6b4a"; ctx.fillRect(this.x, this.y - 30, w, 40);
        if (currentTarget === this) { ctx.strokeStyle = "#ffcc00"; ctx.strokeRect(this.x - 5, this.y - 35, w + 10, 50); }
        ctx.fillStyle = "#000"; ctx.font = "24px 'Impact'";
        ctx.fillText(this.word.substring(0, this.typedIndex), this.x + 20, this.y);
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillText(this.word.substring(this.typedIndex), this.x + 20 + ctx.measureText(this.word.substring(0, this.typedIndex)).width, this.y);
    }
}

function handleInput(key) {
    if (!gameRunning) return;
    totalKeys++;
    if (currentTarget) {
        if (currentTarget.word[currentTarget.typedIndex] === key) {
            currentTarget.typedIndex++; correctKeys++; playSound('type');
            if (currentTarget.typedIndex === currentTarget.word.length) {
                playSound('stamp'); stamps.push(new Stamp(currentTarget.x, currentTarget.y, "SHIPPED", "#0f0"));
                boxes = boxes.filter(b => b !== currentTarget); currentTarget = null;
                combo++; score += (10 * combo); scoreElement.innerText = score; comboElement.innerText = combo;
            }
        } else { combo = 1; comboElement.innerText = combo; playSound('error'); triggerErrorFlash(); }
    } else {
        let match = boxes.find(b => b.word[0] === key);
        if (match) { currentTarget = match; currentTarget.typedIndex = 1; correctKeys++; playSound('type'); }
    }
}

window.addEventListener('keydown', (e) => handleInput(e.key.toLowerCase()));
document.querySelectorAll('.key').forEach(k => k.addEventListener('click', () => handleInput(k.innerText.toLowerCase())));

function triggerErrorFlash() { flashOverlay.classList.add('flash-active'); setTimeout(() => flashOverlay.classList.remove('flash-active'), 100); }

function gameLoop(ts) {
    if (!gameRunning) return;
    let dt = ts - lastTime; lastTime = ts;
    ctx.fillStyle = "#0f0f11"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let speedMult = 1.0 + (score * 0.0002);
    
    let elapsed = (performance.now() - shiftStartTime) / 60000;
    wpmElement.innerText = elapsed > 0 ? Math.floor((correctKeys/5)/elapsed) : 0;
    accElement.innerText = totalKeys > 0 ? Math.floor((correctKeys/totalKeys)*100) : 100;

    spawnTimer += dt;
    if (spawnTimer > 2000 - (score * 0.2)) { boxes.push(new Box()); spawnTimer = 0; }

    boxes.forEach((b, i) => {
        b.update(dt, speedMult); b.draw();
        if (b.x > canvas.width) {
            boxes.splice(i, 1); missed++; missedElement.innerText = missed; playSound('error'); triggerErrorFlash();
            if (missed >= 10) endGame();
        }
    });
    stamps.forEach((s, i) => { s.update(); s.draw(); if (s.life <= 0) stamps.splice(i, 1); });
    requestAnimationFrame(gameLoop);
}

function endGame() {
    gameRunning = false;
    let finalWPM = wpmElement.innerText;
    let finalACC = accElement.innerText;
    
    setTimeout(() => {
        uiLayer.style.display = 'none';
        menuLayer.style.display = 'flex';
        finalResultsDisplay.style.display = 'block';
        finalScoreDisplay.innerText = score;
        finalWpmDisplay.innerText = finalWPM;
        finalAccDisplay.innerText = finalACC;
        
        // PROMPT FOR NAME IF TOP SCORE
        if (score > 0) {
            let name = prompt("NEW TRAIL RECORD! Enter your name for the Global Leaderboard:");
            if (name) saveScoreToFirebase(name.substring(0, 10), score);
        }

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('typeTrailHighScore', score);
            highScoreElement.innerText = score;
        }
    }, 500);
}

function startGame() {
    initAudio(); score = 0; missed = 0; combo = 1; totalKeys = 0; correctKeys = 0;
    boxes = []; stamps = []; currentTarget = null;
    scoreElement.innerText = 0; missedElement.innerText = 0;
    menuLayer.style.display = 'none'; uiLayer.style.display = 'block';
    gameRunning = true; lastTime = performance.now(); shiftStartTime = performance.now();
    requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', startGame);
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });