// --- FIREBASE CONFIG ---
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
canvas.width = window.innerWidth; canvas.height = window.innerHeight;

// --- STATE ---
let gameRunning = false; let score = 0; let missed = 0; let combo = 1;
let carts = []; let stamps = []; let particles = []; let currentTarget = null;
let lastTime = 0; let spawnTimer = 0;
let totalKeys = 0; let correctKeys = 0; let shiftStartTime = 0;

let trainingMode = false; let customBuffer = []; let lanes = [];
let hasRevived = false; const MAX_MISSES = 5; 
let powerups = 2; // START WITH 2 DYNAMITE

// --- AUDIO SYNTHESIZER ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;

    if (type === 'type') {
        // Pickaxe clink
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.05);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'miss') {
        // Dull clank
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    } else if (type === 'mined') {
        // Heavy thud/chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } else if (type === 'gold') {
        // High pitched gold ding
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.1); 
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'blast') {
        // Deep rumble explosion
        osc.type = 'square';
        osc.frequency.setValueAtTime(50, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gainNode.gain.setValueAtTime(0.5, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
}

// --- PRESET PARAGRAPHS ---
const PRESETS = {
    p1: "the shaft is dark and cold we dig deep for iron and coal swing the pick and break the rock load the cart and send it up",
    p2: "strike the vein of gold with a heavy hammer the lantern flickers in the dusty draft keep the wheels rolling on the iron rails",
    p3: "subterranean pressure builds as we descend into sector seven quartz and titanium deposits require explosive breaching secure the perimeter",
    p4: "geological instability detected in the lower caverns evacuation protocols initiated abandon the drilling equipment and sprint for the surface elevator",
    p5: "the motherlode glows with an eerie luminescence ancient geodes crack under pneumatic drills we have unearthed something that should have remained buried"
};

// --- UI ELEMENTS ---
const ui = {
    score: document.getElementById('scoreVal'), missed: document.getElementById('missedVal'),
    combo: document.getElementById('comboVal'), wpm: document.getElementById('wpmVal'),
    acc: document.getElementById('accVal'), flash: document.getElementById('flash-overlay'),
    menu: document.getElementById('menu-layer'), inGame: document.getElementById('ui-layer'),
    lbList: document.getElementById('leaderboard-list'), kb: document.getElementById('virtual-keyboard'),
    customInput: document.getElementById('custom-text-input'), presetSelector: document.getElementById('preset-selector'),
    tutorialModal: document.getElementById('tutorial-modal'), powerup: document.getElementById('powerupVal'),
    mobileBlast: document.getElementById('mobile-blast-btn')
};

// --- KEYBOARD SETUP ---
const keyMap = {
    'q': 'f-pinky-l', 'a': 'f-pinky-l', 'z': 'f-pinky-l', 'w': 'f-ring-l', 's': 'f-ring-l', 'x': 'f-ring-l',
    'e': 'f-mid-l', 'd': 'f-mid-l', 'c': 'f-mid-l', 'r': 'f-index-l', 't': 'f-index-l', 'f': 'f-index-l', 'g': 'f-index-l', 'v': 'f-index-l', 'b': 'f-index-l',
    'y': 'f-index-r', 'u': 'f-index-r', 'h': 'f-index-r', 'j': 'f-index-r', 'n': 'f-index-r', 'm': 'f-index-r',
    'i': 'f-mid-r', 'k': 'f-mid-r', 'o': 'f-ring-r', 'l': 'f-ring-r', 'p': 'f-pinky-r'
};
const rows = [ ['q','w','e','r','t','y','u','i','o','p'], ['a','s','d','f','g','h','j','k','l'], ['z','x','c','v','b','n','m'] ];

rows.forEach((row, i) => {
    let rowDiv = document.getElementById(`row-${i+1}`);
    row.forEach(key => {
        let btn = document.createElement('button');
        btn.className = 'key'; btn.id = `key-${key}`; btn.innerText = key;
        rowDiv.appendChild(btn);
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); handleInput(key); });
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); handleInput(key); });
    });
});

function updateTrainingColors() {
    document.querySelectorAll('.key').forEach(btn => {
        let key = btn.innerText.toLowerCase();
        btn.style.borderColor = trainingMode ? `var(--${keyMap[key]})` : '#5c3a21';
        btn.style.color = trainingMode ? `var(--${keyMap[key]})` : '#a68a77';
    });
}

function updateKeyHighlight() {
    document.querySelectorAll('.key').forEach(k => k.classList.remove('active-target'));
    if (trainingMode && gameRunning) {
        let nextChar = null;
        if (currentTarget) nextChar = currentTarget.word[currentTarget.typedIndex];
        else if (carts.length > 0) nextChar = [...carts].sort((a,b) => b.x - a.x)[0].word[0];
        if (nextChar) {
            let targetBtn = document.getElementById(`key-${nextChar}`);
            if (targetBtn) targetBtn.classList.add('active-target');
        }
    }
}

// --- MENU LOGIC ---
document.getElementById('tutorial-open-btn').addEventListener('click', () => { ui.tutorialModal.classList.remove('hidden'); });
document.getElementById('tutorial-close-btn').addEventListener('click', () => { ui.tutorialModal.classList.add('hidden'); });
document.getElementById('training-toggle').addEventListener('change', (e) => { trainingMode = e.target.checked; updateTrainingColors(); });
ui.presetSelector.addEventListener('change', (e) => { ui.customInput.classList.toggle('hidden', e.target.value !== 'custom'); });

// --- API / WORD GENERATION ---
let wordBuffer = [];
async function fetchWords() {
    try {
        let r = await fetch('https://dummyjson.com/quotes/random');
        let d = await r.json();
        wordBuffer.push(...d.quote.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3 && w.length < 9));
    } catch (e) { wordBuffer.push("rock", "stone", "iron", "gold", "mine"); }
}

function getWord() {
    if(customBuffer.length > 0) return customBuffer.shift();
    if(ui.presetSelector.value !== 'random') return "complete"; 
    if (wordBuffer.length < 5) fetchWords();
    return wordBuffer.length === 0 ? "loading" : wordBuffer.shift();
}
fetchWords();

function loadPayload() {
    let mode = ui.presetSelector.value;
    if (mode === 'random') { customBuffer = []; return; }
    let textToProcess = mode === 'custom' ? ui.customInput.value : PRESETS[mode];
    customBuffer = textToProcess.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 0);
}

function calculateLanes() {
    let availableHeight = canvas.height;
    if (trainingMode || window.innerWidth < 800) { availableHeight -= 220; }
    let startY = 100;
    let gap = (availableHeight - startY) / 3;
    lanes = [startY, startY + gap, startY + gap*2];
}

// --- GRAPHICS & OBJECTS ---
class Particle {
    constructor(x, y, color) { this.x = x; this.y = y; this.vx = (Math.random() - 0.5) * 15; this.vy = (Math.random() - 0.5) * 15; this.life = 1.0; this.color = color; }
    update() { this.x += this.vx; this.y += this.vy; this.life -= 0.05; }
    draw() { ctx.fillStyle = `rgba(${this.color}, ${this.life})`; ctx.fillRect(this.x, this.y, 6, 6); }
}

class Stamp {
    constructor(x, y, text, color) { this.x = x; this.y = y; this.text = text; this.color = color; this.life = 1.0; this.scale = 2.0; this.rot = (Math.random()-0.5)*0.5;}
    update() { if (this.scale > 1.0) this.scale -= 0.15; else this.life -= 0.05; }
    draw() { ctx.save(); ctx.globalAlpha = Math.max(0, this.life); ctx.translate(this.x, this.y); ctx.rotate(this.rot); ctx.fillStyle = this.color; ctx.font = `bold ${30 * this.scale}px 'Rye'`; ctx.fillText(this.text, 0, 0); ctx.restore(); }
}

class MineCart {
    constructor() { 
        this.word = getWord(); 
        this.x = -200; 
        this.y = lanes[Math.floor(Math.random() * lanes.length)]; 
        this.speed = (Math.random() * 0.4 + 0.6); 
        this.typedIndex = 0; 
        // 1 in 30 chance to be Golden
        this.isGolden = Math.random() < (1 / 30); 
    }
    update(dt, mult) { this.x += this.speed * mult * (dt * 0.1); }
    draw() {
        if(this.word === "complete") return;
        ctx.font = "26px 'Special Elite'";
        let w = ctx.measureText(this.word).width + 40; let h = 50; let yOff = 40;
        
        ctx.fillStyle = "#222"; ctx.beginPath(); ctx.arc(this.x + 15, this.y - yOff + h, 8, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(this.x + w - 15, this.y - yOff + h, 8, 0, Math.PI*2); ctx.fill();
        
        if(this.isGolden) {
            ctx.fillStyle = "#ffcc00"; 
            ctx.fillRect(this.x, this.y - yOff, w, h);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(this.x, this.y - yOff, w, h);
        } else {
            ctx.fillStyle = "#4e342e"; 
            ctx.fillRect(this.x, this.y - yOff, w, h);
            ctx.strokeStyle = currentTarget === this ? "#ffaa00" : "#261a14"; ctx.lineWidth = currentTarget === this ? 4 : 2; ctx.strokeRect(this.x, this.y - yOff, w, h);
            ctx.fillStyle = "#000"; ctx.fillRect(this.x+4, this.y-yOff+4, 4, 4); ctx.fillRect(this.x+w-8, this.y-yOff+4, 4, 4); ctx.fillRect(this.x+4, this.y-yOff+h-8, 4, 4); ctx.fillRect(this.x+w-8, this.y-yOff+h-8, 4, 4);
        }

        if (currentTarget === this) { ctx.shadowBlur = 15; ctx.shadowColor = "#ffaa00"; ctx.strokeRect(this.x, this.y - yOff, w, h); ctx.shadowBlur = 0; }
        
        ctx.fillStyle = this.isGolden ? "#000" : "#fff"; 
        ctx.fillText(this.word.substring(0, this.typedIndex), this.x + 20, this.y - 6);
        ctx.fillStyle = this.isGolden ? "rgba(0,0,0,0.3)" : "rgba(255, 255, 255, 0.3)"; 
        ctx.fillText(this.word.substring(this.typedIndex), this.x + 20 + ctx.measureText(this.word.substring(0, this.typedIndex)).width, this.y - 6);
    }
}

// --- LOGIC ---
function spawnExplosion(x, y, rgbStr) { for(let i=0; i<30; i++) particles.push(new Particle(x, y, rgbStr)); }

function triggerDynamite() {
    if (!gameRunning || powerups <= 0 || carts.length === 0) return;
    
    playSound('blast');
    powerups--;
    ui.powerup.innerText = powerups;
    
    // Blow up all carts
    carts.forEach(c => {
        spawnExplosion(c.x + 50, c.y, "255, 60, 0"); 
        score += 5; 
    });
    
    ui.score.innerText = score;
    ui.flash.classList.add('flash-active'); setTimeout(()=>ui.flash.classList.remove('flash-active'), 200);
    stamps.push(new Stamp(canvas.width/2, canvas.height/2, "BLAST CLEARED!", "#ff5500"));
    
    carts = [];
    currentTarget = null;
    updateKeyHighlight();
}

function handleInput(key) {
    if (!gameRunning || key.length !== 1) return;
    totalKeys++;
    if (currentTarget) {
        if (currentTarget.word[currentTarget.typedIndex] === key) {
            currentTarget.typedIndex++; correctKeys++;
            playSound('type');
            if (currentTarget.typedIndex === currentTarget.word.length) {
                
                if(currentTarget.isGolden) {
                    playSound('gold');
                    spawnExplosion(currentTarget.x + 50, currentTarget.y, "255, 255, 0"); 
                    stamps.push(new Stamp(currentTarget.x + 20, currentTarget.y + 10, "+1 DYNAMITE", "#ffd700"));
                    powerups++;
                    ui.powerup.innerText = powerups;
                } else {
                    playSound('mined');
                    spawnExplosion(currentTarget.x + 50, currentTarget.y, "255, 215, 0"); 
                    stamps.push(new Stamp(currentTarget.x + 20, currentTarget.y + 10, "NICE!", "#ffd700"));
                }
                
                carts = carts.filter(b => b !== currentTarget); currentTarget = null;
                combo++; score += (10 * combo); ui.score.innerText = score; ui.combo.innerText = combo;
                
                if (customBuffer.length === 0 && ui.presetSelector.value !== 'random' && carts.length === 0) endGame(true);
            }
        } else { 
            playSound('miss');
            combo = 1; ui.combo.innerText = combo; ui.flash.classList.add('flash-active'); setTimeout(()=>ui.flash.classList.remove('flash-active'),100); stamps.push(new Stamp(currentTarget.x + 10, currentTarget.y, "MISS", "#d90429")); 
        }
    } else {
        let match = carts.filter(b => b.word[0] === key).sort((a,b)=>b.x-a.x)[0];
        if (match) { 
            playSound('type');
            currentTarget = match; currentTarget.typedIndex = 1; correctKeys++; 
        } else { 
            playSound('miss');
            combo = 1; ui.combo.innerText = combo; 
        }
    }
    updateKeyHighlight();
}

window.addEventListener('keydown', (e) => { 
    if(e.key === 'Enter') { triggerDynamite(); return; }
    if(!e.ctrlKey && e.key.length === 1) handleInput(e.key.toLowerCase()); 
});

ui.mobileBlast.addEventListener('click', triggerDynamite);

// --- RENDER ---
function drawTracks(timestamp, globalSpeedMult) {
    lanes.forEach(laneY => {
        let top = laneY - 45; let h = 60;
        ctx.fillStyle = "#0c0805"; ctx.fillRect(0, top - 10, canvas.width, h + 20);
        ctx.fillStyle = "#3e2723"; 
        let offset = (timestamp * 0.1 * globalSpeedMult) % 100;
        for(let i = -100; i < canvas.width + 100; i += 100) { ctx.fillRect(i + offset, top - 5, 20, h + 10); }
        ctx.fillStyle = "#546e7a"; ctx.fillRect(0, top, canvas.width, 5); ctx.fillRect(0, top + h - 5, canvas.width, 5);
    });
}

function gameLoop(ts) {
    if (!gameRunning) return;
    let dt = ts - lastTime; lastTime = ts;
    ctx.fillStyle = "#140d07"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    let mins = (performance.now() - shiftStartTime) / 60000;
    
    let timeMult = mins * 0.3; 
    let mult = 1.0 + (score * 0.0003) + timeMult;
    
    drawTracks(ts, mult);

    ui.wpm.innerText = mins > 0 ? Math.floor((correctKeys/5)/mins) : 0;
    ui.acc.innerText = totalKeys > 0 ? Math.floor((correctKeys/totalKeys)*100) : 100;

    spawnTimer += dt;
    
    let spawnRate = Math.max(700, 2500 - (score * 0.4) - (mins * 400));
    if (spawnTimer > spawnRate) { 
        let newCart = new MineCart();
        if(newCart.word !== "complete") carts.push(newCart); 
        spawnTimer = 0; updateKeyHighlight(); 
    }

    for (let i = carts.length - 1; i >= 0; i--) {
        carts[i].update(dt, mult); carts[i].draw();
        
        if (carts[i].x > canvas.width) {
            if (currentTarget === carts[i]) currentTarget = null;
            carts.splice(i, 1); combo = 1; ui.combo.innerText = combo; 
            playSound('miss');
            missed++; ui.missed.innerText = `${missed}/${MAX_MISSES}`;
            ui.flash.classList.add('flash-active'); setTimeout(()=>ui.flash.classList.remove('flash-active'),100);
            
            if (missed >= MAX_MISSES) {
                gameRunning = false;
                if (!hasRevived) document.getElementById('revive-layer').classList.remove('hidden');
                else endGame(false);
            }
            updateKeyHighlight();
        }
    }

    particles.forEach((p, i) => { p.update(); p.draw(); if(p.life<=0) particles.splice(i,1); });
    stamps.forEach((s, i) => { s.update(); s.draw(); if(s.life<=0) stamps.splice(i,1); });
    
    requestAnimationFrame(gameLoop);
}

function endGame(victory) {
    gameRunning = false;
    ui.mobileBlast.classList.add('hidden'); 
    setTimeout(() => {
        let titleMsg = victory ? "TEXT COMPLETED!" : "GAME OVER!";
        let titleColor = victory ? "#ffd700" : "#d90429";
        
        let name = prompt(`Game Over! Enter your name for the leaderboard:`, "GUEST");
        if(name && score > 0) database.ref('leaderboard').push({name: name.substring(0,10), score: score, timestamp: Date.now()});
        
        ui.inGame.style.display = 'none'; ui.kb.style.display = 'none'; ui.menu.style.display = 'flex';
        document.getElementById('menu-title').innerText = titleMsg;
        document.getElementById('menu-title').style.color = titleColor;
        document.getElementById('final-results').style.display = 'block';
        document.getElementById('res-score').innerText = score;
        document.getElementById('finalWpm').innerText = ui.wpm.innerText;
        document.getElementById('finalAcc').innerText = ui.acc.innerText;
        document.getElementById('start-btn').innerText = "PLAY AGAIN";
    }, 1000);
}

// --- START GAME ---
document.getElementById('start-btn').addEventListener('click', () => {
    initAudio(); // Required by browsers to unlock audio context on first click
    loadPayload();
    if(ui.presetSelector.value !== 'random' && customBuffer.length === 0) { alert("Text is empty! Please add custom text."); return; }
    else if(ui.presetSelector.value === 'custom' && customBuffer.length > 0) { alert("Custom Text loaded! " + customBuffer.length + " words ready."); }
    
    calculateLanes();
    score = 0; missed = 0; combo = 1; totalKeys = 0; correctKeys = 0; carts = []; stamps = []; particles = []; currentTarget = null;
    hasRevived = false; 
    powerups = 2; 
    
    ui.score.innerText = 0; ui.missed.innerText = `0/${MAX_MISSES}`; ui.combo.innerText = 1; ui.powerup.innerText = powerups;
    ui.menu.style.display = 'none'; ui.inGame.style.display = 'block'; 
    
    if(trainingMode || window.innerWidth < 800) {
        ui.kb.style.display = 'flex';
        ui.mobileBlast.classList.remove('hidden');
    }
    
    gameRunning = true; lastTime = performance.now(); shiftStartTime = performance.now();
    requestAnimationFrame(gameLoop);
});

// --- AD REVIVE LOGIC ---
document.getElementById('watch-ad-btn').addEventListener('click', () => {
    document.getElementById('revive-layer').classList.add('hidden');
    document.getElementById('sim-ad-layer').classList.remove('hidden');
    let timeLeft = 5; document.getElementById('ad-timer').innerText = timeLeft;
    let adInterval = setInterval(() => {
        timeLeft--; document.getElementById('ad-timer').innerText = timeLeft;
        if(timeLeft <= 0) {
            clearInterval(adInterval);
            document.getElementById('sim-ad-layer').classList.add('hidden');
            hasRevived = true; missed = 0; ui.missed.innerText = `0/${MAX_MISSES}`; carts = []; currentTarget = null;
            ui.inGame.style.display = 'block'; 
            if(trainingMode || window.innerWidth < 800) { ui.kb.style.display = 'flex'; ui.mobileBlast.classList.remove('hidden'); }
            gameRunning = true; lastTime = performance.now(); requestAnimationFrame(gameLoop);
        }
    }, 1000);
});

document.getElementById('skip-ad-btn').addEventListener('click', () => {
    document.getElementById('revive-layer').classList.add('hidden');
    endGame(false);
});

window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; if(gameRunning) calculateLanes(); });

database.ref('leaderboard').orderByChild('score').limitToLast(5).on('value', snap => {
    let s = []; snap.forEach(c => s.push(c.val())); s.reverse();
    ui.lbList.innerHTML = s.length ? s.map((e,i) => `<div>${i+1}. ${e.name.substring(0,10).toUpperCase()} <span>${e.score}</span></div>`).join('') : '<div style="color:#a68a77">NO SCORES YET</div>';
});