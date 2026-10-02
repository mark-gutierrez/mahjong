// IndexedDB Setup for Replays
const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open("MahjongReplays", 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("replays")) {
            db.createObjectStore("replays", { keyPath: "id" });
        }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
});

async function saveReplay(history, winner, roundPoints) {
    if (!history || history.length === 0) return null;
    const db = await dbPromise;
    const tx = db.transaction("replays", "readwrite");
    const id = Date.now();
    tx.objectStore("replays").put({ id, date: new Date().toISOString(), history, winner, roundPoints });
    return id;
}

// Replay State
let currentReplay = null;
let currentTurnIdx = 0;

function showReplayScreen(replayData) {
    currentReplay = replayData.history;
    currentTurnIdx = 0;
    
    document.getElementById('replay-slider').max = currentReplay.length - 1;
    document.getElementById('replay-slider').value = 0;
    
    showScreen('replay');
    renderReplayTurn(0);
}

const ALL_TILES = [
    ...[1,2,3,4,5,6,7,8,9].flatMap(v => ['bamboo','character','dot'].map(s => ({suit: s, value: v.toString()}))),
    ...['N','E','W','S'].map(v => ({suit: 'wind', value: v})),
    ...['Red','Green','White'].map(v => ({suit: 'dragon', value: v}))
];

function calculateUkeire(hand, melds, currentShanten, visibleTilesMap) {
    let ukeireCount = 0;
    ALL_TILES.forEach(pt => {
        const testHand = [...(hand || []), {suit: pt.suit, value: pt.value, id: 'test'}];
        const newShanten = calculateShanten(testHand, melds);
        if (newShanten < currentShanten) {
            let visible = visibleTilesMap[pt.suit + pt.value] || 0;
            ukeireCount += Math.max(0, 4 - visible);
        }
    });
    return ukeireCount;
}

function getDangerPercentage(tile, centerMap) {
    if (centerMap[tile.suit + tile.value]) return { pct: 0, color: "#10b981" }; // Green (Safe)
    if (tile.suit === 'wind' || tile.suit === 'dragon') return { pct: 25, color: "#f59e0b" }; // Yellow
    if (tile.value === '1' || tile.value === '9') return { pct: 40, color: "#f59e0b" }; // Yellow
    if (tile.value === '2' || tile.value === '8') return { pct: 65, color: "#ef4444" }; // Red
    return { pct: 85, color: "#ef4444" }; // Red (Dangerous)
}

function calculateShanten(hand, melds) {
    let score = 8;
    if (melds) score -= (melds.length * 2);
    
    const counts = {};
    const suitVals = {};
    
    (hand || []).forEach(t => { 
        counts[t.suit + t.value] = (counts[t.suit + t.value] || 0) + 1; 
        if (!['wind', 'dragon', 'season', 'flower'].includes(t.suit)) {
            if (!suitVals[t.suit]) suitVals[t.suit] = new Set();
            suitVals[t.suit].add(parseInt(t.value));
        }
    });
    
    // Deduct for pairs and pungs
    for (const count of Object.values(counts)) {
        if (count >= 3) score -= 2;
        else if (count === 2) score -= 1;
    }
    
    // Deduct for proto-sequences (very simplified)
    for (const [suit, vals] of Object.entries(suitVals)) {
        let seqFound = 0;
        const vArr = Array.from(vals).sort((a,b)=>a-b);
        for(let i=0; i<vArr.length-1; i++) {
            if (vArr[i+1] - vArr[i] === 1 || vArr[i+1] - vArr[i] === 2) {
                seqFound++;
                i++; // skip next to avoid double count loosely
            }
        }
        score -= seqFound;
    }
    
    return Math.max(0, score);
}

function renderReplayTurn(idx) {
    if (!currentReplay || !currentReplay[idx]) return;
    const snap = currentReplay[idx];
    const board = document.getElementById('replay-board');
    board.innerHTML = '';
    
    // Calculate Analytics
    let lowestShanten = 99;
    let avgShanten = 0;
    let totalMelds = 0;
    let numPlayers = 0;
    
    for (const ps of Object.values(snap.players)) {
        const sh = calculateShanten(ps.hand, ps.melds);
        ps._shanten = sh;
        if (sh < lowestShanten) lowestShanten = sh;
        avgShanten += sh;
        totalMelds += (ps.melds ? ps.melds.length : 0);
        numPlayers++;
    }
    avgShanten = (avgShanten / numPlayers).toFixed(1);
    
    let tensionColor = "#10b981"; // Green
    let tensionText = "LOW (Early Game)";
    if (lowestShanten <= 1) { tensionColor = "#ef4444"; tensionText = "HIGH (Someone is ready to win!)"; }
    else if (lowestShanten <= 3) { tensionColor = "#f59e0b"; tensionText = "MEDIUM (Building Hands)"; }
    
    // Header
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.background = 'rgba(255,255,255,0.03)';
    header.style.padding = '10px 15px';
    header.style.borderRadius = '8px';
    header.innerHTML = `
        <div>
            <h3 style="margin:0; color:var(--accent);">Turn ${idx + 1} / ${currentReplay.length}</h3>
            <p style="margin:5px 0 0 0; font-size:0.9em;">Current Turn: <strong>${snap.currentTurn}</strong></p>
        </div>
        <div style="text-align:right; font-size:0.85em; color:var(--text-secondary);">
            <div>Table Tension: <strong style="color:${tensionColor};">${tensionText}</strong></div>
            <div>Avg Distance to Win: <strong>${avgShanten}</strong></div>
            <div>Total Melds on Table: <strong>${totalMelds}</strong></div>
        </div>
    `;
    board.appendChild(header);
    
    // Build Maps for Analytics
    const centerMap = {};
    (snap.centerDiscards || []).forEach(t => { centerMap[t.suit + t.value] = true; });
    
    // Players
    const playersDiv = document.createElement('div');
    playersDiv.style.display = 'grid';
    playersDiv.style.gridTemplateColumns = '1fr 1fr';
    playersDiv.style.gap = '10px';
    
    for (const [pName, ps] of Object.entries(snap.players)) {
        // Build visible tiles map for this player (their hand + all table discards/melds)
        const visibleMap = {};
        (snap.centerDiscards || []).forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; });
        (ps.hand || []).forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; });
        for (const op of Object.values(snap.players)) {
            (op.melds || []).forEach(m => m.forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; }));
        }
        
        const ukeire = calculateUkeire(ps.hand, ps.melds, ps._shanten, visibleMap);
        
        const pCard = document.createElement('div');
        pCard.style.cssText = `background: rgba(255,255,255,0.05); padding: 8px; border-radius: 6px; border: ${snap.currentTurn === pName ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)'}`;
        
        let handHtml = '';
        if (ps.hand) {
            ps.hand.sort((a, b) => a.suit === b.suit ? a.value.localeCompare(b.value) : a.suit.localeCompare(b.suit)).forEach(t => {
                const danger = getDangerPercentage(t, centerMap);
                handHtml += `<div class="tile" style="position:relative; width:41px; height:60px; min-width:41px; border:1px solid rgba(255,255,255,0.1);">
                                ${getTileFace(t)}
                                <div style="position:absolute; top:-6px; right:-6px; font-size:11px; font-weight:bold; background:var(--bg-color); color:${danger.color}; padding:2px 4px; border-radius:4px; box-shadow: 0 2px 4px rgba(0,0,0,0.8); z-index:2; border: 1px solid ${danger.color};">${danger.pct}%</div>
                             </div>`;
            });
        }
        
        let meldHtml = '';
        if (ps.melds) {
            ps.melds.forEach(m => {
                meldHtml += `<div style="border:1px solid #444; border-radius:5px; padding:3px; background:rgba(0,0,0,0.2); display:inline-flex; gap:2px;">`;
                m.forEach(t => {
                    meldHtml += `<div class="tile" style="width:41px; height:60px; min-width:41px;">${getTileFace(t)}</div>`;
                });
                meldHtml += `</div>`;
            });
        }
        
        const isTenpai = ps._shanten <= 1;
        pCard.innerHTML = `
            <div style="font-weight:bold; font-size:0.85em; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <span style="${isTenpai ? 'color:#ef4444;' : ''}">${pName} ${isTenpai ? '🔥' : ''}</span>
                <div style="display:flex; gap:10px; align-items:center;">
                    <span style="font-size:0.8em; color:var(--text-secondary);" title="Ukeire (Acceptance)">Ukeire: ${ukeire}</span>
                    <span style="font-size:0.8em; color:var(--text-secondary);">Dist: ${ps._shanten}</span>
                    <span style="font-size:0.8em; color:#a5b4fc; background:rgba(99,102,241,0.2); padding:2px 4px; border-radius:3px;">[${ps.algorithm || 'HUMAN'}]</span>
                </div>
            </div>
            <div style="display:flex; align-items:flex-start; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${handHtml}</div>
                ${meldHtml}
            </div>
            ${ps.actionLog ? `<div style="margin-top: 8px; font-size: 0.75em; color: #a5b4fc; background: rgba(99,102,241,0.1); padding: 4px 8px; border-radius: 4px; border-left: 2px solid #a5b4fc;"><strong>🤖 Bot Log:</strong> ${ps.actionLog}</div>` : ''}
        `;
        playersDiv.appendChild(pCard);
    }
    board.appendChild(playersDiv);
    
    // Discards
    const discardsDiv = document.createElement('div');
    discardsDiv.style.marginTop = '20px';
    let dHtml = `<h4 style="margin:0 0 10px 0; font-size:1rem; color:var(--text-secondary);">Center Pool</h4><div style="display:flex; flex-wrap:wrap; gap:4px;">`;
    if (snap.centerDiscards) {
        snap.centerDiscards.forEach(t => {
            dHtml += `<div class="tile discarded" style="width:30px; height:45px; min-width:30px;">${getTileFace(t)}</div>`;
        });
    }
    dHtml += `</div>`;
    discardsDiv.innerHTML = dHtml;
    board.appendChild(discardsDiv);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-exit-replay').onclick = () => showScreen('lobby');
    
    document.getElementById('btn-replay-prev').onclick = () => {
        if (currentTurnIdx > 0) {
            currentTurnIdx--;
            document.getElementById('replay-slider').value = currentTurnIdx;
            renderReplayTurn(currentTurnIdx);
        }
    };
    
    document.getElementById('btn-replay-next').onclick = () => {
        if (currentTurnIdx < currentReplay.length - 1) {
            currentTurnIdx++;
            document.getElementById('replay-slider').value = currentTurnIdx;
            renderReplayTurn(currentTurnIdx);
        }
    };
    
    document.getElementById('replay-slider').oninput = (e) => {
        currentTurnIdx = parseInt(e.target.value);
        renderReplayTurn(currentTurnIdx);
    };
    
    // Load local replays on the landing page
    loadReplaysList();
});

async function loadReplaysList() {
    const listUI = document.getElementById('replays-list-ui');
    if (!listUI) return;
    
    try {
        const db = await dbPromise;
        const tx = db.transaction("replays", "readonly");
        const store = tx.objectStore("replays");
        const request = store.getAll();
        
        request.onsuccess = (e) => {
            const replays = e.target.result;
            if (!replays || replays.length === 0) {
                listUI.innerHTML = `<p style="color: #888; font-size: 0.9em;">No local replays saved yet.</p>`;
                return;
            }
            
            // Sort newest first
            replays.sort((a, b) => b.id - a.id);
            listUI.innerHTML = '';
            
            replays.forEach(r => {
                const dateStr = new Date(r.date).toLocaleString();
                const card = document.createElement('div');
                card.style.cssText = "background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border: 1px solid rgba(255,255,255,0.1);";
                
                card.innerHTML = `
                    <div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Winner: <span style="color: var(--accent);">${r.winner}</span></div>
                        <div style="font-size: 0.8em; color: #aaa;">${dateStr} • ${r.history.length} Turns</div>
                    </div>
                `;
                
                const actionsDiv = document.createElement('div');
                actionsDiv.style.display = 'flex';
                actionsDiv.style.gap = '8px';

                const btn = document.createElement('button');
                btn.className = "btn-secondary";
                btn.style.padding = "5px 10px";
                btn.style.fontSize = "0.85em";
                btn.innerText = "▶ Watch";
                btn.onclick = () => {
                    document.getElementById('btn-exit-replay').onclick = () => showScreen('landing');
                    showReplayScreen(r);
                };
                
                const delBtn = document.createElement('button');
                delBtn.style.background = "#ef4444";
                delBtn.style.padding = "5px 10px";
                delBtn.style.fontSize = "0.85em";
                delBtn.innerText = "🗑 Delete";
                delBtn.onclick = async () => {
                    if (confirm("Delete this replay forever?")) {
                        const db = await dbPromise;
                        const tx = db.transaction("replays", "readwrite");
                        tx.objectStore("replays").delete(r.id);
                        tx.oncomplete = () => loadReplaysList();
                    }
                };
                
                actionsDiv.appendChild(btn);
                actionsDiv.appendChild(delBtn);
                card.appendChild(actionsDiv);
                listUI.appendChild(card);
            });
        };
    } catch (err) {
        console.error("Failed to load replays", err);
    }
}
