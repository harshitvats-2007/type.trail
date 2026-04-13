const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// In-Game UI Elements
const scoreElement = document.getElementById('scoreVal');
const missedElement = document.getElementById('missedVal');
const comboElement = document.getElementById('comboVal');
const wpmElement = document.getElementById('wpmVal');
const accElement = document.getElementById('accVal');
const flashOverlay = document.getElementById('flash-overlay');

// Menu UI Elements
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
const virtualKeyboard = document.getElementById('virtual-keyboard');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Core Variables
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

// Tracking Variables
let totalKeys = 0;
let correctKeys = 0;
let shiftStartTime = 0;

// Load High Score (Updated to typeTrail)
let highScore = localStorage.getItem('typeTrailHighScore') || 0;
highScoreElement.innerText = highScore;

// Check for mobile device
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// --- AUDIO SYNTHESIZER ---
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'type') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'stamp') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    }
}

// --- DYNAMIC API DICTIONARY SYSTEM ---
let wordBuffer = []; 
let isFetching = false;

async function fetchParagraphs() {
    if (isFetching) return;
    isFetching = true;
    try {
        const response = await fetch('https://dummyjson.com/quotes/random');
        const data = await response.json();
        let paragraph = data.quote;
        let cleanedWords = paragraph.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        cleanedWords = cleanedWords.filter(word => word.length > 3 && word.length < 9);
        wordBuffer = wordBuffer.concat(cleanedWords);
    } catch (error) {
        wordBuffer.push("type", "trail", "system", "speed", "logic");
    } finally {
        isFetching = false;
    }
}

function getUniqueWord() {
    if (wordBuffer.length < 10) fetchParagraphs();
    if (wordBuffer.length === 0) return "loading";
    return wordBuffer.shift(); 
}

fetchParagraphs();

const lanes = isMobile ? [
    canvas.height * 0.20, canvas.height * 0.35, canvas.height * 0.50
] : [
    canvas.height * 0.25, canvas.height * 0.45, canvas.height * 0.65, canvas.height * 0.85
];

// --- VISUAL EFFECTS CLASSES ---
class Stamp {
    constructor(x, y, text, color, isError = false) {
        this.x = x; this.y = y; this.text = text; this.color = color;
        this.life = 1.0; this.scale = 2.5; this.targetScale = 1.0;
        this.rotation = (Math.random() - 0.5) * 0.4; 
        if (isError) this.rotation = (Math.random() - 0.5) * 0.8; 
    }
    update() {
        if (this.scale > this.targetScale) this.scale -= 0.3;
        else this.life -= 0.03; 
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
        ctx.fillStyle = this.color;
        ctx.font = `bold ${isMobile ? 30 : 45}px 'Impact'`;
        ctx.fillText(this.text, 0, 0);
        ctx.globalAlpha = Math.max(0, this.life * 0.5);
        ctx.fillText(this.text, 2, 2);
        ctx.restore();
    }
}

class Box {
    constructor() {
        this.word = getUniqueWord();
        this.x = -200; 
        this.y = lanes[Math.floor(Math.random() * lanes.length)];
        this.speed = (Math.random() * 0.5 + 0.8); 
        this.typedIndex = 0;
    }
    update(deltaTime, globalSpeedMult) {
        this.x += this.speed * globalSpeedMult * (deltaTime * 0.1);
    }
    draw() {
        ctx.font = isMobile ? "24px 'Impact'" : "32px 'Impact'";
        let boxWidth = ctx.measureText(this.word).width + (isMobile ? 40 : 60);
        let boxHeight = isMobile ? 45 : 65;
        let yOffset = isMobile ? 30 : 45;

        // Box Base
        ctx.fillStyle = "#8b6b4a"; 
        ctx.fillRect(this.x, this.y - yOffset, boxWidth, boxHeight);
        ctx.strokeStyle = "#5c432a"; ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y - yOffset, boxWidth, boxHeight);

        // Tape
        ctx.fillStyle = "rgba(220, 200, 150, 0.4)";
        ctx.fillRect(this.x + boxWidth/2 - 10, this.y - yOffset, 20, boxHeight);

        // Scanner Overlay
        if (currentTarget === this) {
            ctx.strokeStyle = "#ffcc00"; ctx.lineWidth = 3;
            let pad = 6;
            let bx = this.x - pad, by = this.y - yOffset - pad, bw = boxWidth + pad*2, bh = boxHeight + pad*2;
            ctx.fillStyle = "rgba(255, 204, 0, 0.1)";
            ctx.fillRect(bx, by, bw, bh);
            ctx.strokeRect(bx, by, bw, bh); 
        }

        // Text
        let startX = this.x + (isMobile ? 20 : 30);
        let typedPart = this.word.substring(0, this.typedIndex);
        let untypedPart = this.word.substring(this.typedIndex);
        
        ctx.fillStyle = "#000"; 
        ctx.fillText(typedPart, startX, this.y);
        let offset = ctx.measureText(typedPart).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.25)"; 
        ctx.fillText(untypedPart, startX + offset, this.y);
    }
}

function triggerErrorFlash() {
    flashOverlay.classList.add('flash-active');
    setTimeout(() => flashOverlay.classList.remove('flash-active'), 100);
}

// --- CORE LOGIC ---
function handleInput(key) {
    if (!gameRunning || gameOver || key.length !== 1) return;
    
    // Register every keystroke attempt
    totalKeys++;

    if (currentTarget) {
        if (currentTarget.word[currentTarget.typedIndex] === key) {
            currentTarget.typedIndex++;
            correctKeys++; // Register success
            playSound('type');
            
            if (currentTarget.typedIndex === currentTarget.word.length) {
                playSound('stamp');
                stamps.push(new Stamp(currentTarget.x + 40, currentTarget.y + 10, "SHIPPED!", "#00ff00"));
                boxes = boxes.filter(b => b !== currentTarget);
                currentTarget = null;
                combo++;
                score += (10 * combo);
                scoreElement.innerText = score;
                comboElement.innerText = combo;
            }
        } else {
            playSound('error');
            combo = 1;
            comboElement.innerText = combo;
            stamps.push(new Stamp(currentTarget.x + 20, currentTarget.y, "ERROR", "#ff3b30", true));
            triggerErrorFlash();
        }
    } else {
        let potentialTargets = boxes.filter(b => b.word[0] === key);
        if (potentialTargets.length > 0) {
            potentialTargets.sort((a, b) => b.x - a.x); 
            currentTarget = potentialTargets[0];
            currentTarget.typedIndex = 1;
            correctKeys++; // Register success on first lock-on hit
            playSound('type');
            
            if (currentTarget.typedIndex === currentTarget.word.length) {
                playSound('stamp');
                stamps.push(new Stamp(currentTarget.x + 40, currentTarget.y + 10, "SHIPPED!", "#00ff00"));
                boxes = boxes.filter(b => b !== currentTarget);
                currentTarget = null;
                combo++;
                score += (10 * combo);
                scoreElement.innerText = score;
                comboElement.innerText = combo;
            }
        } else {
            playSound('error'); // Missed lock-on
            combo = 1;
            comboElement.innerText = combo;
        }
    }
}

// Physical Keyboard Listener
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    handleInput(e.key.toLowerCase());
});

// Virtual Keyboard Listeners
document.querySelectorAll('.key').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault(); 
        handleInput(btn.innerText.toLowerCase());
    });
    btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        handleInput(btn.innerText.toLowerCase());
    });
});

// --- RENDER LOOP ---
function drawConveyorBelts(timestamp, globalSpeedMult) {
    lanes.forEach(laneY => {
        let beltTop = laneY - (isMobile ? 40 : 60);
        let beltHeight = isMobile ? 60 : 90;
        
        ctx.fillStyle = "#1a1a1a"; ctx.fillRect(0, beltTop, canvas.width, beltHeight);
        ctx.fillStyle = "#333"; ctx.fillRect(0, beltTop - 3, canvas.width, 3);
        ctx.fillRect(0, beltTop + beltHeight, canvas.width, 3);

        ctx.strokeStyle = "#111"; ctx.lineWidth = 4;
        let visualSpeed = timestamp * 0.15 * globalSpeedMult; 
        let offset = visualSpeed % 60;
        
        for(let i = -60; i < canvas.width + 60; i += 60) {
            ctx.beginPath();
            ctx.moveTo(i + offset, beltTop);
            ctx.lineTo(i + offset - 10, beltTop + beltHeight); 
            ctx.stroke();
        }
    });
}

function gameLoop(timestamp) {
    if (!gameRunning) return;
    let deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    ctx.fillStyle = "#0f0f11"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let globalSpeedMult = 1.0 + (score * 0.0002) + (combo * 0.01);
    drawConveyorBelts(timestamp, globalSpeedMult);

    // Calculate Live Stats
    let elapsedMinutes = (performance.now() - shiftStartTime) / 60000;
    let currentWPM = elapsedMinutes > 0 ? Math.floor((correctKeys / 5) / elapsedMinutes) : 0;
    let currentAcc = totalKeys > 0 ? Math.floor((correctKeys / totalKeys) * 100) : 100;
    
    wpmElement.innerText = currentWPM;
    accElement.innerText = currentAcc;

    if (combo > 1) {
        ctx.fillStyle = "rgba(255, 204, 0, 0.05)"; 
        ctx.font = `bold ${isMobile ? 200 : 400}px 'Impact'`;
        ctx.textAlign = "center";
        ctx.fillText(`x${combo}`, canvas.width / 2, canvas.height / 2 + (isMobile ? 50 : 150));
        ctx.textAlign = "left"; 
    }

    let currentSpawnRate = Math.max(1000, 2500 - (score * 0.3)); 
    spawnTimer += deltaTime;
    if (spawnTimer > currentSpawnRate) {
        boxes.push(new Box());
        spawnTimer = 0;
    }

    for (let i = 0; i < boxes.length; i++) {
        boxes[i].update(deltaTime, globalSpeedMult);
        boxes[i].draw();
        
        // Box falls off the end
        if (boxes[i].x > canvas.width) {
            if (currentTarget === boxes[i]) currentTarget = null;
            boxes.splice(i, 1);
            i--; 
            
            combo = 1; comboElement.innerText = combo;
            missed++; missedElement.innerText = missed;
            playSound('error');
            triggerErrorFlash();
            
            if (missed >= 10) {
                gameOver = true; gameRunning = false;
                
                // Finalize Stats
                if (score > highScore) {
                    highScore = score;
                    localStorage.setItem('typeTrailHighScore', highScore);
                    highScoreElement.innerText = highScore;
                }

                setTimeout(() => {
                    uiLayer.style.display = 'none';
                    if(isMobile) virtualKeyboard.style.display = 'none';
                    menuLayer.style.display = 'flex';
                    
                    menuTitle.innerText = "TRAIL ENDED";
                    menuTitle.style.color = "#ff3b30";
                    menuSubtitle.innerText = "Too many missed orders. The system has stopped.";
                    
                    finalResultsDisplay.style.display = "block";
                    finalScoreDisplay.innerText = score;
                    finalWpmDisplay.innerText = currentWPM;
                    finalAccDisplay.innerText = currentAcc;

                    startBtn.innerText = "TRY AGAIN";
                }, 1000);
            }
        }
    }

    for (let i = stamps.length - 1; i >= 0; i--) {
        stamps[i].update(); stamps[i].draw();
        if (stamps[i].life <= 0) stamps.splice(i, 1);
    }
    requestAnimationFrame(gameLoop);
}

// --- START UP ---
function startGame() {
    initAudio();
    if(audioCtx.state === 'suspended') audioCtx.resume();

    // Reset All Variables
    score = 0; missed = 0; combo = 1;
    totalKeys = 0; correctKeys = 0;
    boxes = []; stamps = []; currentTarget = null;
    spawnTimer = 0; gameOver = false;
    
    // Update UI
    scoreElement.innerText = score;
    missedElement.innerText = missed;
    comboElement.innerText = combo;
    wpmElement.innerText = 0;
    accElement.innerText = 100;

    menuLayer.style.display = 'none';
    uiLayer.style.display = 'block';
    
    if(isMobile) virtualKeyboard.style.display = 'flex';
    
    gameRunning = true;
    lastTime = performance.now();
    shiftStartTime = performance.now(); // Start the clock for WPM
    requestAnimationFrame(gameLoop);
}

startBtn.addEventListener('click', startGame);

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drawConveyorBelts(0, 0);
});

drawConveyorBelts(0, 0);