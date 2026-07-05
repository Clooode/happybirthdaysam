// --- Global DOM Elements ---
let canvas, ctx, messageEl;
const overlayParrot = document.getElementById('overlayParrot');
const overlayTarget = document.getElementById('overlayTarget');

// --- Global Coordinate System (The "Brain") ---
const margin = 40; 
let originX = 0;
let groundY = 0;
let unitScaleX = 0;
let unitScaleY = 0;

// --- Physics & Game Configuration ---
const g = 0.15;                      // Gravity constant
let a = 4.0;                         // Equation Multiplier
let b = 8;                           // Equation Exponent
let shrinkFactor = 0.5;              // Ramp Peak Height
let initVelParam = 2.0;              // Starting push velocity

// Fixed Target at Math position (2.0, 6.0)
const targetMath = { x: 2.0, y: 6.0 }; 
const targetRadius = 18;

// --- Dynamic Obnoxious Parrot State Variables ---
let parrotMessageActive = false;      
let parrotMessageTimestamp = 0;       
let lastInitVelValue = 2.0;           
let parrotX = 100;
let parrotY = 100;
let parrotVX = 10;                    
let parrotVY = 8;  
const parrotSize = 250; 

// --- Ball & Track State Variables ---
let ball = { x: 0, y: 0, vx: 0, vy: 0, radius: 8, state: 'idle' };
let trackPoints = [];
let currentTrackIndex = 0;
let ballSpeed = 0; 
let ballPathHistory = [];


// ==========================================
// CORE CALCULATION ENGINE
// ==========================================

function updateScale() {
    if (!canvas) return;

    // 1. Force internal resolution to match screen layout!
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
    }

    // 2. Define the Graph Origin (bottom-left)
    originX = margin;
    groundY = canvas.height - margin;

    // 3. Define Pixels per Math Unit (assuming X: 0-5, Y: 0-10)
    unitScaleX = (canvas.width - (margin * 2)) / 5.0;
    unitScaleY = (canvas.height - (margin * 2)) / 10.0;
}

function mathToPixel(mx, my) {
    // Relies purely on the global scale variables calculated above
    return {
        x: originX + (mx * unitScaleX),
        y: groundY - (my * unitScaleY)
    };
}

function positionTargetAsset() {
    if (!overlayTarget) return;
    
    let targetPix = mathToPixel(targetMath.x, targetMath.y);
    
    // Position Cake Center perfectly on the node
    overlayTarget.style.left = `${targetPix.x}px`;
    overlayTarget.style.top = `${targetPix.y}px`;

    const cakePointer = document.getElementById('cake-pointer');
    if (cakePointer) {
        cakePointer.style.left = `${targetPix.x}px`;
        cakePointer.style.top = `${targetPix.y - 45}px`; 
    }
}

function generateTrack() {
    trackPoints = [];
    
    // Safely pull from inputs, falling back to defaults if DOM isn't ready
    let inputA = parseFloat(document.getElementById('paramA')?.value);
    if (isNaN(inputA)) inputA = 4.0; 
    a = Math.max(1.0, Math.min(10.0, inputA)); 

    let inputB = document.getElementById('exponentB')?.value;
    b = inputB ? parseInt(inputB) : 8;
    
    let inputShrink = document.getElementById('shrinkFactor')?.value;
    shrinkFactor = inputShrink ? parseFloat(inputShrink) : 0.5;
    
    let inputVel = document.getElementById('initVelocity')?.value;
    let currentVel = inputVel ? parseFloat(inputVel) : 2.0;
    initVelParam = currentVel;

    // Trigger Parrot easter egg
    if (currentVel === 13.4 && lastInitVelValue !== 13.4) {
        parrotMessageActive = true;
        parrotMessageTimestamp = Date.now(); 
        parrotX = Math.random() * (canvas.width - parrotSize);
        parrotY = Math.random() * (canvas.height - parrotSize);
    }
    lastInitVelValue = currentVel;

    // Build Math Track Points
    const thresholdY = 0.05 * a; 
    const transitionX = 1 - Math.pow(thresholdY / a, 1 / b);

    const downhillSteps = 120;
    for (let i = 0; i <= downhillSteps; i++) {
        let mx = (i / downhillSteps) * transitionX; 
        let my = a * Math.pow(1 - mx, b); 
        trackPoints.push({ xMath: mx, yMath: my, ...mathToPixel(mx, my) });
    }

    const uphillSteps = 120;
    for (let i = 1; i <= uphillSteps; i++) {
        let mx = transitionX + (0.5 * (i / uphillSteps));
        let normalizedUpProgress = (mx - transitionX) / 0.5; 
        let my = thresholdY + Math.pow(normalizedUpProgress, 2) * (shrinkFactor * a - thresholdY); 
        trackPoints.push({ xMath: mx, yMath: my, ...mathToPixel(mx, my) });
    }
}

function resetSimulation() {
    updateScale();
    generateTrack();
    
    // Ensure layout happens exactly when the track is freshly built
    requestAnimationFrame(() => {
        positionTargetAsset();
    });

    ball.state = 'idle';
    currentTrackIndex = 0;
    ballSpeed = 0;
    
    if (messageEl) messageEl.textContent = '';

    if (trackPoints.length > 0) {
        ball.x = trackPoints[0].x;
        ball.y = trackPoints[0].y;
    }
    ball.vx = 0;
    ball.vy = 0;
}


// ==========================================
// PHYSICS & RENDER LOOP
// ==========================================

function updatePhysics() {
    if (ball.state === 'idle' || ball.state === 'done') return;
    ballPathHistory.push({ x: ball.x, y: ball.y });
    
    if (ball.state === 'onRamp') {
        let currentPoint = trackPoints[currentTrackIndex];
        let heightDrop = a - currentPoint.yMath;
        
        ballSpeed = Math.sqrt(Math.max(0, 2 * g * heightDrop)) + initVelParam;
        let remainingMove = ballSpeed;

        while (remainingMove > 0 && currentTrackIndex < trackPoints.length - 1) {
            let p1 = trackPoints[currentTrackIndex];
            let p2 = trackPoints[currentTrackIndex + 1];
            let distToNextNode = Math.hypot(p2.x - ball.x, p2.y - ball.y);

            if (distToNextNode < 0.01) {
                currentTrackIndex++;
                if (currentTrackIndex < trackPoints.length) {
                    ball.x = trackPoints[currentTrackIndex].x;
                    ball.y = trackPoints[currentTrackIndex].y;
                }
                continue;
            }

            let angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

            if (remainingMove >= distToNextNode) {
                remainingMove -= distToNextNode;
                currentTrackIndex++;
                ball.x = p2.x;
                ball.y = p2.y;
            } else {
                ball.x += remainingMove * Math.cos(angle);
                ball.y += remainingMove * Math.sin(angle);
                
                ball.vx = ballSpeed * Math.cos(angle);
                ball.vy = ballSpeed * Math.sin(angle);
                
                remainingMove = 0; 
            }
        }

        if (currentTrackIndex >= trackPoints.length - 1) {
            let lastPt = trackPoints[trackPoints.length - 1];
            let prevPt = trackPoints[trackPoints.length - 2];
            
            ball.x = lastPt.x;
            ball.y = lastPt.y;
            
            let launchAngle = Math.atan2(lastPt.y - prevPt.y, lastPt.x - prevPt.x);
            ball.vx = ballSpeed * Math.cos(launchAngle);
            ball.vy = ballSpeed * Math.sin(launchAngle);
            
            ball.state = 'inAir';
        }
    } 
    else if (ball.state === 'inAir') {
        ball.vy += g; 
        ball.x += ball.vx;
        ball.y += ball.vy;

        // 🚨 IMPORTANT FIX: Collision detection now uses the shared global scale 
        let ballMathX = (ball.x - originX) / unitScaleX;
        let ballMathY = (groundY - ball.y) / unitScaleY;

        let mathDistToTarget = Math.hypot(ballMathX - targetMath.x, ballMathY - targetMath.y);

        if (mathDistToTarget <= 0.2) {
            ball.state = 'done';
            const victoryModal = document.getElementById('victoryModal');
            if (victoryModal) victoryModal.style.display = 'flex';
        }

        // Out-of-bounds check 
        if (ball.y >= groundY + 200 || ball.x > canvas.width || ball.x < 0) {
            ball.state = 'done';
            if (messageEl && messageEl.textContent === "") {
                messageEl.textContent = "WOMP WOMP";
                messageEl.style.color = "#ff4a4a";
            }
        }
    }
}

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // --- 1. Draw Grid Lines ---
    ctx.strokeStyle = '#e0e0e0'; 
    ctx.lineWidth = 1;
    ctx.fillStyle = '#999';
    ctx.font = '12px sans-serif';

    // X-axis vertical grid lines
    for (let i = 0; i <= 5; i++) {
        let pix = mathToPixel(i, 0); 
        ctx.beginPath();
        ctx.moveTo(pix.x, 0);
        ctx.lineTo(pix.x, groundY);
        ctx.stroke();
        ctx.fillText(i.toString(), pix.x - 4, groundY + 15);
    }

    // Y-axis horizontal grid lines
    for (let i = 0; i <= 10; i++) {
        let pix = mathToPixel(0, i); 
        ctx.beginPath();
        ctx.moveTo(originX, pix.y);
        ctx.lineTo(canvas.width, pix.y);
        ctx.stroke();
        ctx.fillText(i.toString(), originX - 25, pix.y + 4);
    }
    
    // --- 2. Main Axis Reference Bars ---
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, groundY); ctx.stroke(); 
    ctx.beginPath(); ctx.moveTo(originX, groundY); ctx.lineTo(canvas.width, groundY); ctx.stroke(); 

    ctx.fillStyle = '#888';
    ctx.fillText("X Axis", canvas.width - 60, groundY + 35);
    ctx.fillText("Y Axis", originX - 50, 30);

    // --- 3. Draw Incline Track Layout ---
    ctx.strokeStyle = '#1d3557';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    if (trackPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
        for (let p of trackPoints) {
            ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // --- 4. Render Dynamic Dashed Path Trace Tail ---
    if (ballPathHistory.length > 1) {
        ctx.strokeStyle = '#cccccc';      
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.setLineDash([4, 4]); 
        
        ctx.beginPath();
        ctx.moveTo(ballPathHistory[0].x, ballPathHistory[0].y);
        for (let i = 1; i < ballPathHistory.length; i++) {
            ctx.lineTo(ballPathHistory[i].x, ballPathHistory[i].y);
        }
        ctx.stroke();
        ctx.setLineDash([]); 
    }

    // --- 5. Render Projectile Ball ---
    ctx.fillStyle = '#821414'; 
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; 

    // --- 6. ANIMATE THE BOUNCING PARROT ---
    if (initVelParam === 13.4) {
        let elapsed = Date.now() - parrotMessageTimestamp;

        if (elapsed < 6700) {
            if (overlayParrot) overlayParrot.style.display = 'block';

            parrotX += parrotVX;
            parrotY += parrotVY;

            if (parrotX <= 0) { parrotX = 0; parrotVX *= -1; }
            else if (parrotX + parrotSize >= canvas.width) { parrotX = canvas.width - parrotSize; parrotVX *= -1; }

            if (parrotY <= 0) { parrotY = 0; parrotVY *= -1; }
            else if (parrotY + parrotSize >= canvas.height) { parrotY = canvas.height - parrotSize; parrotVY *= -1; }

            if (overlayParrot) {
                overlayParrot.style.left = `${parrotX}px`;
                overlayParrot.style.top = `${parrotY}px`;
                overlayParrot.style.width = `${parrotSize}px`;
                overlayParrot.style.height = `${parrotSize}px`;
            }

            if (parrotMessageActive) {
                const boxWidth = 320;
                const boxHeight = 70;
                const boxX = (canvas.width - boxWidth) / 2;
                const boxY = (canvas.height - boxHeight) / 2;

                ctx.fillStyle = 'rgba(15, 15, 15, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#a31f1f'; 
                ctx.beginPath();
                ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8); 
                ctx.fill();
                ctx.stroke();

                ctx.fillStyle = '#fff';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText("grown man btw", canvas.width / 2, canvas.height / 2);

                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
        } else {
            parrotMessageActive = false;
            if (overlayParrot) overlayParrot.style.display = 'none'; 
        }
    } else {
        if (overlayParrot) overlayParrot.style.display = 'none';
    }
}

function loop() {
    updatePhysics();
    draw();
    requestAnimationFrame(loop); 
}


// ==========================================
// INTERACTIVE ROUTERS & LISTENERS
// ==========================================

window.triggerLaunch = function() {
    resetSimulation();        
    currentTrackIndex = 0;     
    ball.state = 'onRamp'; 
    ballPathHistory = [];    
};

window.closeVictoryModal = function() {
    const victoryModal = document.getElementById('victoryModal');
    if (victoryModal) victoryModal.style.display = 'none';
    resetSimulation(); 
};

// Rebuild track dynamically on dropdown/input changes
const pA = document.getElementById('paramA');
const pB = document.getElementById('exponentB');
const pShrink = document.getElementById('shrinkFactor');
const pVel = document.getElementById('initVelocity');

if (pA) pA.addEventListener('change', resetSimulation);
if (pB) pB.addEventListener('change', resetSimulation);
if (pShrink) pShrink.addEventListener('change', resetSimulation);
if (pVel) pVel.addEventListener('change', resetSimulation);


// --- BOOT & WINDOW LISTENERS ---

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    messageEl = document.getElementById('message'); 
    
    // Calculate initial scale constraints BEFORE doing any math!
    updateScale();
    
    resetSimulation();
    loop();
});

window.addEventListener('resize', () => {
    // When the screen shifts, reset the global scale brain, then redraw the scene
    updateScale();
    generateTrack();
    positionTargetAsset();
    draw(); 
});