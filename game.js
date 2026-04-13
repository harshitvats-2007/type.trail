// --- FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyBJLe3ijqtluFB8_DPcf1bM55pIdPx1TI8",
    authDomain: "type-trail.firebaseapp.com",
    databaseURL: "https://type-trail-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "type-trail",
    storageBucket: "type-trail.firebasestorage.app",
    messagingSenderId: "754135474412",
    appId: "1:754135474412:web:f3553cfa9c4060e1cec5c9"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Selection
const scoreElement = document.getElementById('scoreVal');
const missedElement = document.getElementById('missedVal');
const comboElement = document.getElementById('comboVal');
const wpmElement = document.getElementById('wpmVal');
const accElement = document.getElementById('accVal');
const flashOverlay = document.getElementById('flash-overlay');
const menuLayer = document.getElementById('menu-layer');
const uiLayer = document.getElementById('ui-layer');
const startBtn = document.getElementById('start-btn');
const menuTitle = document.getElementById('menu-title');
const menuSubtitle = document.getElementById('menu-subtitle');
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
function saveScore(name, finalScore) {
    database.ref('leaderboard').push({
        name: name,
        score: finalScore,
        timestamp: Date.now()
    });
}

function loadLeaderboard() {
    database.ref('leaderboard').orderByChild('score').limitToLast(5).on('value', (snapshot) => {
        let scores = [];
        snapshot.forEach((child) => { scores.push(child.val()); });
        scores.reverse();
        leaderboardList.innerHTML = "";
        scores.forEach((entry, index) => {
            leaderboardList.innerHTML += `<div>${index+1}. ${entry.name.toUpperCase()} <span>${entry.score}</span></div>`;
        });
    });
}
loadLeaderboard();

// --- AUDIO SYNTH ---
function initAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playSound(type) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode); gainNode.connect(audioCtx.destination);
    if (type === 'type') { osc.type = 'square'; osc.frequency.setValueAtTime(400, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05); gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05); osc.start(); osc.stop(audioCtx.currentTime + 0.05); }
    else if (type === 'stamp') { osc.type = 'sine'; osc.frequency.setValueAtTime(150, audioCtx.currentTime); osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3); gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3); osc.start(); osc.stop(audioCtx.currentTime + 0.3); }
    else if (type === 'error') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, audioCtx.currentTime); gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2); osc.start(); osc.stop(audioCtx.currentTime + 0.2); }
}

// --- WORD API ---
let wordBuffer = []; 
let isFetching = false;
async function fetchParagraphs() {
    if (isFetching) return; isFetching = true;
    try {
        const response = await fetch('https://dummyjson.com/quotes/random');
        const data = await response.json();
        let cleanedWords = data.quote.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(word => word.length > 3 && word.length < 9);
        wordBuffer = wordBuffer.concat(cleanedWords);
    } catch (error) { wordBuffer.push("type", "trail", "system", "speed", "logic"); }
    finally { isFetching = false; }
}
function getUniqueWord() { if (wordBuffer.length < 10) fetchParagraphs(); return wordBuffer.length === 0 ? "loading" : wordBuffer.shift(); }
fetchParagraphs();

const lanes = isMobile ? [canvas.height * 0.20, canvas.height * 0.35, canvas.height * 0.50] : [canvas.height * 0.25, canvas.height * 0.45, canvas.height * 0.65, canvas.height * 0.85];

class Stamp {
    constructor(x, y, text, color, isError = false) { this.x = x; this.y = y; this.text = text; this.color = color; this.life = 1.0; this.scale = 2.5; this.targetScale = 1.0; this.rotation = (Math.random() - 0.5) * 0.4; if (isError) this.rotation = (Math.random() - 0.5) * 0.8; }
    update() { if (this.scale > this.targetScale) this.scale -= 0.3; else this.life -= 0.03; }
    draw() { ctx.save(); ctx.globalAlpha = Math.max(0, this.life); ctx.translate(this.x, this.y); ctx.rotate(this.rotation); ctx.fillStyle = this.color; ctx.font = `bold ${isMobile ? 30 : 45}px 'Impact'`; ctx.fillText(this.text, 0, 0); ctx.restore(); }
}

class Box {
    constructor() { this.word = getUniqueWord(); this.x = -200; this.y = lanes[Math.floor(Math.random() * lanes.length)]; this.speed = (Math.random() * 0.5 + 0.8); this.typedIndex = 0; }
    update(deltaTime, globalSpeedMult) { this.x += this.speed * globalSpeedMult * (deltaTime * 0.1); }
    draw() {
        ctx.font = isMobile ? "24px 'Impact'" : "32px 'Impact'";
        let boxWidth = ctx.measureText(this.word).width + (isMobile ? 40 : 60);
        let boxHeight = isMobile ? 45 : 65;
        let yOffset = isMobile ? 30 : 45;
        ctx.fillStyle = "#8b6b4a"; ctx.fillRect(this.x, this.y - yOffset, boxWidth, boxHeight);
        ctx.strokeStyle = "#5c432a"; ctx.lineWidth = 3; ctx.strokeRect(this.x, this.y - yOffset, boxWidth, boxHeight);
        if (currentTarget === this) { ctx.strokeStyle = "#ffcc00"; ctx.strokeRect(this.x-6, this.y-yOffset-6, boxWidth+12, boxHeight+12); }
        ctx.fillStyle = "#000"; ctx.fillText(this.word.substring(0, this.typedIndex), this.x + (isMobile?20:30), this.y);
        ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillText(this.word.substring(this.typedIndex), this.x + (isMobile?20:30) + ctx.measureText(this.word.substring(0, this.typedIndex)).width, this.y);
    }
}

function triggerErrorFlash() { flashOverlay.classList.add('flash-active'); setTimeout(() => flashOverlay.classList.remove('flash-active'), 100); }

function handleInput(key) {
    if (!gameRunning || gameOver || key.length !== 1) return;
    totalKeys++;
    if (currentTarget) {
        if (currentTarget.word[currentTarget.typedIndex] === key) {
            currentTarget.typedIndex++; correctKeys++; playSound('type');
            if (currentTarget.typedIndex === currentTarget.word.length) {
                playSound('stamp'); stamps.push(new Stamp(currentTarget.x + 40, currentTarget.y + 10, "SHIPPED!", "#00ff00"));
                boxes = boxes.filter(b => b !== currentTarget); currentTarget = null;
                combo++; score += (10 * combo); scoreElement.innerText = score; comboElement.innerText = combo;
            }
        } else { playSound('error'); combo = 1; comboElement.innerText = combo; stamps.push(new Stamp(currentTarget.x + 20, currentTarget.y, "ERROR", "#ff3b30", true)); triggerErrorFlash(); }
    } else {
        let potentialTargets = boxes.filter(b => b.word[0] === key);
        if (potentialTargets.length > 0) {
            potentialTargets.sort((a, b) => b.x - a.x); currentTarget = potentialTargets[0]; currentTarget.typedIndex = 1; correctKeys++; playSound('type');
        } else { playSound('error'); combo = 1; comboElement.innerText = combo; }
    }
}

window.addEventListener('keydown', (e) => { if (e.ctrlKey || e.altKey || e.metaKey) return; handleInput(e.key.toLowerCase()); });
document.querySelectorAll('.key').forEach(btn => { btn.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(btn.innerText.toLowerCase()); }); });

function drawConveyorBelts(timestamp, globalSpeedMult) {
    lanes.forEach(laneY => {
        let beltTop = laneY - (isMobile ? 40 : 60); let beltHeight = isMobile ? 60 : 90;
        ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, beltTop, canvas.width, beltHeight);
        ctx.strokeStyle = "#111"; ctx.lineWidth = 4;
        let offset = (timestamp * 0.15 * globalSpeedMult) % 60;
        for(let i = -60; i < canvas.width + 60; i += 60) { ctx.beginPath(); ctx.moveTo(i + offset, beltTop); ctx.lineTo(i + offset - 10, beltTop + beltHeight); ctx.stroke(); }
    });
}

function gameLoop(timestamp) {
    if (!gameRunning) return;
    let deltaTime = timestamp - lastTime; lastTime = timestamp;
    ctx.fillStyle = "#0f0f11"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let globalSpeedMult = 1.0 + (score * 0.0002) + (combo * 0.01);
    drawConveyorBelts(timestamp, globalSpeedMult);

    let elapsedMinutes = (performance.now() - shiftStartTime) / 60000;
    wpmElement.innerText = elapsedMinutes > 0 ? Math.floor((correctKeys / 5) / elapsedMinutes) : 0;
    accElement.innerText = totalKeys > 0 ? Math.floor((correctKeys / totalKeys) * 100) : 100;

    spawnTimer += deltaTime;
    if (spawnTimer > Math.max(1000, 2500 - (score * 0.3))) { boxes.push(new Box()); spawnTimer = 0; }

    for (let i = 0; i < boxes.length; i++) {
        boxes[i].update(deltaTime, globalSpeedMult); boxes[i].draw();
        if (boxes[i].x > canvas.width) {
            if (currentTarget === boxes[i]) currentTarget = null;
            boxes.splice(i, 1); i--; combo = 1; comboElement.innerText = combo; missed++; missedElement.innerText = missed; playSound('error'); triggerErrorFlash();
            if (missed >= 10) {
                gameOver = true; gameRunning = false;
                if (score > highScore) { highScore = score; localStorage.setItem('typeTrailHighScore', highScore); highScoreElement.innerText = highScore; }
                setTimeout(() => {
                    let userName = prompt("SHIFT COMPLETE. ENTER ID FOR GLOBAL RECORDS:", "PLAYER");
                    if (userName) saveScore(userName.substring(0, 10), score);
                    uiLayer.style.display = 'none'; if(isMobile) virtualKeyboard.style.display = 'none'; menuLayer.style.display = 'flex';
                    menuTitle.innerText = "TRAIL ENDED"; menuTitle.style.color = "#ff3b30";
                    finalResultsDisplay.style.display = "block"; finalScoreDisplay.innerText = score; finalWpmDisplay.innerText = wpmElement.innerText; finalAccDisplay.innerText = accElement.innerText;
                    startBtn.innerText = "TRY AGAIN";
                }, 1000);
            }
        }
    }
    stamps.forEach((s, i) => { s.update(); s.draw(); if (s.life <= 0) stamps.splice(i, 1); });
    requestAnimationFrame(gameLoop);
}

function startGame() {
    initAudio(); if(audioCtx.state === 'suspended') audioCtx.resume();
    score = 0; missed = 0; combo = 1; totalKeys = 0; correctKeys = 0; boxes = []; stamps = []; currentTarget = null; spawnTimer = 0; gameOver = false;
    scoreElement.innerText = 0; missedElement.innerText = 0; comboElement.innerText = 1; menuLayer.style.display = 'none'; uiLayer.style.display = 'block';
    if(isMobile) virtualKeyboard.style.display = 'flex';
    gameRunning = true; lastTime = performance.now(); shiftStartTime = performance.now(); requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', startGame);
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; drawConveyorBelts(0, 0); });
drawConveyorBelts(0, 0);