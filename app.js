// Change to 'let' so our DOMContentLoaded lifecycle hook can safely mount/re-assign it 💡
let canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
let messageEl = document.getElementById('message');

// --- Cache DOM Elements at Initial Boot ---
const overlayParrot = document.getElementById('overlayParrot');
const overlayTarget = document.getElementById('overlayTarget');

// --- Mathematical Scale Configuration (0,0) to (5,10) ---
const originX = 80;                  
const groundY = canvas.height - 60;  
const unitScaleX = 140;              // 5.0 units * 140px = 700px horizontal span
const unitScaleY = 42;               // 10.0 units * 42px = 420px vertical span

// Physics constants 
const g = 0.15;                      // Gravity constant

// Dynamic Game Config Parameters
let a = 4.0;                         // Equation Multiplier
let b = 8;                           // Equation Exponent
let shrinkFactor = 0.5;              // Ramp Peak Height
let initVelParam = 2.0;              // Starting push velocity

// Fixed Target at Math position (2.0, 6.0)
const targetMath = { x: 2.0, y: 6 }; 
const targetRadius = 18;

// --- Pop-up Alert Tracking Variables ---
let parrotMessageActive = false;      // Controls if the message should draw
let parrotMessageTimestamp = 0;       // Stores the exact system time the pop-up started
let lastInitVelValue = 2.0;           // Tracks previous dropdown state to detect a fresh change

// --- Dynamic Obnoxious Parrot State Variables ---
let parrotX = 100;
let parrotY = 100;
let parrotVX = 10;                    // Increased velocity values to match doubled velocity scale
let parrotVY = 8;  
const parrotSize = 250; 

// Ball instance variables
let ball = { x: 0, y: 0, vx: 0, vy: 0, radius: 8, state: 'idle' };
let trackPoints = [];
let currentTrackIndex = 0;
let ballSpeed = 0; 
let ballPathHistory = [];
// Convert math coordinates to layout pixels
function mathToPixel(mx, my) {
    // 1. Get the current physical size of the canvas on the screen
    const rect = canvas.getBoundingClientRect();
    
    // 2. Calculate the ratio between the "math" 900x550 space 
    // and the "physical" space on the phone
    const scaleX = rect.width / 900;
    const scaleY = rect.height / 550;

    // 3. Apply the scaling
    return {
        x: (originX + (mx * unitScaleX)) * scaleX,
        y: (groundY - (my * unitScaleY)) * scaleY
    };
}
function positionTargetAsset() {
    if (!overlayTarget) return;
    
    // 1. Get the exact pixel coordinates
    let targetPix = mathToPixel(targetMath.x, targetMath.y);
    
    // 2. Position Cake (Centered using the transform: translate(-50%, -50%) in your HTML)
    overlayTarget.style.left = `${targetPix.x}px`;
    overlayTarget.style.top = `${targetPix.y}px`;

    // 3. Position the Cake Pointer
    const cakePointer = document.getElementById('cake-pointer');
    if (cakePointer) {
        cakePointer.style.left = `${targetPix.x}px`;
        // Move the pointer up by 40-50px so it hovers above the cake
        cakePointer.style.top = `${targetPix.y - 50}px`; 
    }
}


function generateTrack() {
    trackPoints = [];
    let inputA = parseFloat(document.getElementById('paramA').value);
    
    if (isNaN(inputA)) inputA = 4.0; 
    a = Math.max(1.0, Math.min(10.0, inputA)); 

    b = parseInt(document.getElementById('exponentB').value);
    shrinkFactor = parseFloat(document.getElementById('shrinkFactor').value);
    
    let currentVel = parseFloat(document.getElementById('initVelocity').value);
    initVelParam = currentVel;

    if (currentVel === 13.4 && lastInitVelValue !== 13.4) {
        parrotMessageActive = true;
        parrotMessageTimestamp = Date.now(); 
        
        parrotX = Math.random() * (canvas.width - parrotSize);
        parrotY = Math.random() * (canvas.height - parrotSize);
    }
    
    lastInitVelValue = currentVel;

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
    generateTrack();
    
    // 💡 RequestAnimationFrame wrapper ensures browser DOM layout updates have completely finished
    // before computing target asset coordinates. Prevents canvas/cake visual desync.
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

// --- Physics Engine ---
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

        let ballMathX = (ball.x - originX) / unitScaleX;
        let ballMathY = (groundY - ball.y) / unitScaleY;

        let mathDistToTarget = Math.hypot(ballMathX - targetMath.x, ballMathY - targetMath.y);

        if (mathDistToTarget <= 0.2) {
            ball.state = 'done';
            document.getElementById('victoryModal').style.display = 'flex';
        }

        // Out-of-bounds safety check 
        if (ball.y >= groundY + 200 || ball.x > canvas.width || ball.x < 0) {
            ball.state = 'done';
            if (messageEl && messageEl.textContent === "") {
                messageEl.textContent = "WOMP WOMP";
                messageEl.style.color = "#ff4a4a";
            }
        }
    }
}

// --- Render Engine ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Math Cartesian Grid lines (Y Range: 0 to 10)
    ctx.strokeStyle = '#e2e2e2'; 
    ctx.lineWidth = 1;
    for (let yVal = 0; yVal <= 10.0; yVal += 1.0) {
        let pixelPos = mathToPixel(0, yVal);
        ctx.beginPath(); ctx.moveTo(0, pixelPos.y); ctx.lineTo(canvas.width, pixelPos.y); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(yVal.toFixed(0), originX - 25, pixelPos.y + 4);
    }
    
    // Draw Math Cartesian Grid lines (X Range: 0 to 5)
    for (let xVal = 0; xVal <= 5.0; xVal += 0.5) {
        let pixelPos = mathToPixel(xVal, 0);
        ctx.beginPath(); ctx.moveTo(pixelPos.x, 0); ctx.lineTo(pixelPos.x, canvas.height); ctx.stroke();
        ctx.fillStyle = '#666';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(xVal.toFixed(1), pixelPos.x - 8, groundY + 20);
    }

    // 2. Main Axis Reference Bars
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(originX, 0); ctx.lineTo(originX, groundY); ctx.stroke(); 
    ctx.beginPath(); ctx.moveTo(originX, groundY); ctx.lineTo(canvas.width, groundY); ctx.stroke(); 

    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.fillText("X Axis", canvas.width - 60, groundY + 35);
    ctx.fillText("Y Axis", originX - 50, 30);

    // 3. Draw Incline Track Layout
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

    // // Structural scaffolding
    // ctx.strokeStyle = '#eef5fa';
    // ctx.lineWidth = 1;
    // for (let i = 0; i < trackPoints.length; i += 5) {
    //     ctx.beginPath(); ctx.moveTo(trackPoints[i].x, trackPoints[i].y); ctx.lineTo(trackPoints[i].x, groundY); ctx.stroke();
    // }

    // ✨ NEW STEP: Render Dynamic Dashed Path Trace Tail
    if (ballPathHistory.length > 1) {
        ctx.strokeStyle = '#cccccc';      /* Crisp light grey color hex */
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        
        // Tells the canvas to draw 4px dashes separated by 4px blank spaces 💡
        ctx.setLineDash([4, 4]); 
        
        ctx.beginPath();
        ctx.moveTo(ballPathHistory[0].x, ballPathHistory[0].y);
        for (let i = 1; i < ballPathHistory.length; i++) {
            ctx.lineTo(ballPathHistory[i].x, ballPathHistory[i].y);
        }
        ctx.stroke();
        
        // 🚨 IMPORTANT: Reset line dash configuration to solid 
        // so it doesn't accidentally make your track or grid lines dashed too!
        ctx.setLineDash([]); 
    }

    // 4. Render Projectile Ball
    ctx.fillStyle = '#821414'; 
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; 

    // 5. ANIMATE THE BOUNCING PARROT ELEMENT LAYER
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

            // --- Central Overlay Text Pop-up ---
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

// --- Global Interactive Control Router ---
window.triggerLaunch = function() {
    resetSimulation();        
    currentTrackIndex = 0;     
    ball.state = 'onRamp'; 
    ballPathHistory = [];    
};

// Global Clean Closer Trigger
window.closeVictoryModal = function() {
    document.getElementById('victoryModal').style.display = 'none';
    resetSimulation(); 
};

// Listeners to rebuild track geometry on input adjustment
document.getElementById('paramA').addEventListener('change', resetSimulation);
document.getElementById('exponentB').addEventListener('change', resetSimulation);
document.getElementById('shrinkFactor').addEventListener('change', resetSimulation);
document.getElementById('initVelocity').addEventListener('change', resetSimulation);

document.addEventListener('DOMContentLoaded', () => {
    // Safely look up DOM components on execution mounting lifecycle
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    messageEl = document.getElementById('message'); 
    
    resetSimulation();
    loop();
});

window.addEventListener('resize', () => {
    // Add a tiny delay to allow CSS to finish calculating the new size
    setTimeout(positionTargetAsset, 50);
});