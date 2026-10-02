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
let currentReplayWinner = null;
let autoplayInterval = null;

function showReplayScreen(replayData) {
    currentReplay = replayData.history;
    currentReplayWinner = replayData.winner;
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
    
    renderAnalyticsGraph(currentReplay, currentReplayWinner, idx);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-exit-replay').onclick = () => {
        if (autoplayInterval) {
            clearInterval(autoplayInterval);
            autoplayInterval = null;
            document.getElementById('btn-replay-autoplay').innerText = "▶ Autoplay";
        }
        showScreen('lobby');
    };
    
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
    
    document.getElementById('btn-replay-autoplay').onclick = () => {
        const btn = document.getElementById('btn-replay-autoplay');
        if (autoplayInterval) {
            clearInterval(autoplayInterval);
            autoplayInterval = null;
            btn.innerText = "▶ Autoplay";
        } else {
            btn.innerText = "⏸ Pause";
            autoplayInterval = setInterval(() => {
                if (currentTurnIdx < currentReplay.length - 1) {
                    currentTurnIdx++;
                    document.getElementById('replay-slider').value = currentTurnIdx;
                    renderReplayTurn(currentTurnIdx);
                } else {
                    clearInterval(autoplayInterval);
                    autoplayInterval = null;
                    btn.innerText = "▶ Autoplay";
                }
            }, 800); // 800ms per turn
        }
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
                
                let scoreText = "";
                if (r.winner === "DRAW") {
                    scoreText = "Exhaustive Draw (0 Fan)";
                } else if (r.history && r.history.length > 0) {
                    const lastSnap = r.history[r.history.length - 1];
                    scoreText = calculateHongKongScore(lastSnap, r.winner);
                }

                card.innerHTML = `
                    <div>
                        <div style="font-weight: 600; margin-bottom: 4px;">Winner: <span style="color: var(--accent);">${r.winner}</span></div>
                        <div style="font-size: 0.8em; color: #aaa; margin-bottom: 4px;">${dateStr} • ${r.history.length} Turns</div>
                        <div style="font-size: 0.85em; color: #a5b4fc; background: rgba(99,102,241,0.15); padding: 2px 6px; border-radius: 4px; display: inline-block;">🏆 ${scoreText}</div>
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

function calculateHongKongScore(snapshot, winnerName) {
    if (!snapshot || !snapshot.players) return "Unknown";
    const ps = snapshot.players[winnerName];
    if (!ps) return "Unknown";

    const hand = ps.hand || [];
    const melds = ps.melds || [];

    const allTiles = [...hand];
    melds.forEach(m => allTiles.push(...m));

    let suits = new Set();
    let hasHonor = false;
    let hasTerminalOrHonor = false;

    allTiles.forEach(t => {
        if (['wind', 'dragon'].includes(t.suit)) {
            hasHonor = true;
            hasTerminalOrHonor = true;
        } else {
            suits.add(t.suit);
            if (t.value === '1' || t.value === '9') {
                hasTerminalOrHonor = true;
            }
        }
    });

    let fan = 0;
    let patterns = [];

    // Suit checks
    if (suits.size === 1 && hasHonor) {
        fan += 3;
        patterns.push("Half Flush (3 Fan)");
    } else if (suits.size === 1 && !hasHonor) {
        fan += 6;
        patterns.push("Full Flush (6 Fan)");
    } else if (suits.size === 0 && hasHonor) {
        fan += 10;
        patterns.push("All Honors (Max Fan)");
    }

    // All Pungs check
    let isAllPung = true;
    melds.forEach(m => {
        if (m.length < 3) isAllPung = false;
        else if (m[0].value !== m[1].value) isAllPung = false; // Chow
    });

    const counts = {};
    hand.forEach(t => counts[t.suit + t.value] = (counts[t.suit + t.value] || 0) + 1);
    let pairs = 0;
    Object.values(counts).forEach(c => {
        if (c === 2) pairs++;
        else if (c !== 3 && c !== 4) isAllPung = false;
    });

    if (isAllPung && pairs === 1) {
        fan += 3;
        patterns.push("All Pungs (3 Fan)");
    }

    // All Simples check
    if (!hasTerminalOrHonor) {
        fan += 1;
        patterns.push("All Simples (1 Fan)");
    }

    if (fan === 0) {
        fan = 1;
        patterns.push("Common Hand (1 Fan)");
    }

    return `${fan} Fan: ` + patterns.join(", ");
}

function renderAnalyticsGraph(history, winner, maxTurnIdx) {
    const container = document.getElementById('replay-analytics-graph');
    if (!container || !history || history.length === 0) return;

    let lastDanger = 0; // Carry over danger for continuity

    const dataPoints = history.map((snap, idx) => {
        let shanten = 8;
        let ukeire = 0;
        let fan = 1;
        let danger = lastDanger;

        let totalShanten = 0;
        let numPlayers = 0;
        let threatLevel = 0;

        // Base map for Ukeire
        const visibleMap = {};
        (snap.centerDiscards || []).forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; });
        for (const op of Object.values(snap.players)) {
            (op.melds || []).forEach(m => m.forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; }));
            
            if (op.melds) threatLevel += op.melds.length * 2;
            totalShanten += calculateShanten(op.hand, op.melds);
            numPlayers++;
        }
        
        let avgShanten = numPlayers > 0 ? (totalShanten / numPlayers) : 8;

        if (winner && snap.players[winner] && snap.players[winner].hand) {
            const wHand = snap.players[winner].hand;
            shanten = calculateShanten(wHand, snap.players[winner].melds);
            
            // Add winner hand to visible map
            (wHand || []).forEach(t => { visibleMap[t.suit + t.value] = (visibleMap[t.suit + t.value] || 0) + 1; });
            ukeire = calculateUkeire(wHand, snap.players[winner].melds, shanten, visibleMap);

            // Danger tracking
            if (idx > 0 && history[idx-1].currentTurn === winner) {
                const prevPool = history[idx-1].centerDiscards || [];
                const currPool = snap.centerDiscards || [];
                if (currPool.length > prevPool.length) {
                    const lastDiscard = currPool[currPool.length - 1];
                    const centerMap = {};
                    prevPool.forEach(t => { centerMap[t.suit + t.value] = true; });
                    danger = getDangerPercentage(lastDiscard, centerMap).pct;
                    lastDanger = danger;
                }
            }
            
            // Expected Fan
            const scoreStr = calculateHongKongScore(snap, winner);
            const match = scoreStr.match(/^(\d+) Fan/);
            if (match) fan = parseInt(match[1]);
        }
        
        return { turn: idx + 1, shanten, threatLevel, ukeire, avgShanten, danger, fan };
    });

    const w = 850;
    const h = 250; // Taller to fit everything
    const padding = 35;
    const turns = dataPoints.length;
    
    const scaleX = (idx) => padding + (idx / Math.max(1, turns - 1)) * (w - padding * 2);
    const scaleY = (val, maxVal, inverted = false) => {
        let ratio = val / maxVal;
        if (ratio > 1) ratio = 1;
        if (ratio < 0) ratio = 0;
        return inverted ? h - padding - (ratio * (h - padding * 2)) : padding + ((1 - ratio) * (h - padding * 2));
    };

    let shantenPath = "", threatPath = "", ukeirePath = "", avgShantenPath = "", dangerPath = "", fanPath = "";

    dataPoints.forEach((d, i) => {
        if (i > maxTurnIdx) return;
        const x = scaleX(i);
        const yShanten = scaleY(d.shanten, 8, false); // Inverted (0 is best, bottom of graph)
        const yThreat = scaleY(d.threatLevel, 16, true);
        const yUkeire = scaleY(d.ukeire, 30, true);
        const yAvgShanten = scaleY(d.avgShanten, 8, false);
        const yDanger = scaleY(d.danger, 100, true);
        const yFan = scaleY(d.fan, 10, true);
        
        if (i === 0) {
            shantenPath += `M ${x},${yShanten} `;
            threatPath += `M ${x},${yThreat} `;
            ukeirePath += `M ${x},${yUkeire} `;
            avgShantenPath += `M ${x},${yAvgShanten} `;
            dangerPath += `M ${x},${yDanger} `;
            fanPath += `M ${x},${yFan} `;
        } else {
            shantenPath += `L ${x},${yShanten} `;
            threatPath += `L ${x},${yThreat} `;
            ukeirePath += `L ${x},${yUkeire} `;
            avgShantenPath += `L ${x},${yAvgShanten} `;
            dangerPath += `L ${x},${yDanger} `;
            fanPath += `L ${x},${yFan} `;
        }
    });

    const svg = `
        <h3 style="margin-top: 0; margin-bottom: 15px; font-size: 1rem;">Game Timeline Analytics</h3>
        <div style="display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 10px; font-size: 0.8em; align-items: center; justify-content: center;">
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:12px;background:#6366f1;border-radius:50%;"></div><span>Winner Shanten</span></div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:2px;background:#8b5cf6;"></div><span>Avg Table Shanten</span></div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:12px;background:#10b981;border-radius:50%;"></div><span>Winner Ukeire</span></div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:12px;background:#f59e0b;border-radius:50%;"></div><span>Winner Discard Danger</span></div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:12px;background:#ef4444;border-radius:50%;"></div><span>Table Threat (Melds)</span></div>
            <div style="display: flex; align-items: center; gap: 5px;"><div style="width:12px;height:12px;background:#0ea5e9;border-radius:50%;"></div><span>Expected Fan</span></div>
        </div>
        <svg viewBox="0 0 ${w} ${h}" width="100%" height="250" style="background: rgba(0,0,0,0.2); border-radius: 4px; overflow: visible;">
            <!-- Y-Axis Grid Lines & Labels (Mapped to Shanten scale 0-8) -->
            ${[0, 2, 4, 6, 8].map(val => {
                const y = scaleY(val, 8, false);
                return `<line x1="${padding}" y1="${y}" x2="${w-padding}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
                        <text x="${padding-10}" y="${y+4}" fill="#888" font-size="10" text-anchor="end">${val}</text>`;
            }).join('')}
            <text x="${padding-10}" y="${padding-10}" fill="#888" font-size="10" text-anchor="end">Shanten</text>
            
            <!-- X-Axis Labels (Turn Numbers) -->
            ${dataPoints.map((d, i) => {
                // Show label every 5 turns, plus the first and last turn
                if (i === 0 || i === turns - 1 || (i + 1) % 5 === 0) {
                    const x = scaleX(i);
                    return `<text x="${x}" y="${h - padding + 15}" fill="#888" font-size="10" text-anchor="middle">T${d.turn}</text>
                            <line x1="${x}" y1="${h - padding}" x2="${x}" y2="${h - padding + 4}" stroke="#888" stroke-width="1" />`;
                }
                return '';
            }).join('')}
            
            <!-- Paths -->
            <path d="${avgShantenPath}" fill="none" stroke="#8b5cf6" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${threatPath}" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="4 4" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${dangerPath}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${fanPath}" fill="none" stroke="#0ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${ukeirePath}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="${shantenPath}" fill="none" stroke="#6366f1" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
            
            <!-- Points (Only up to maxTurnIdx) -->
            ${dataPoints.slice(0, maxTurnIdx + 1).map((d, i) => {
                const x = scaleX(i);
                return `
                    <circle cx="${x}" cy="${scaleY(d.avgShanten, 8, false)}" r="2" fill="#8b5cf6" />
                    <circle cx="${x}" cy="${scaleY(d.threatLevel, 16, true)}" r="3" fill="#ef4444" />
                    <circle cx="${x}" cy="${scaleY(d.danger, 100, true)}" r="3" fill="#f59e0b" />
                    <circle cx="${x}" cy="${scaleY(d.fan, 10, true)}" r="3" fill="#0ea5e9" />
                    <circle cx="${x}" cy="${scaleY(d.ukeire, 30, true)}" r="4" fill="#10b981" />
                    <circle cx="${x}" cy="${scaleY(d.shanten, 8, false)}" r="4" fill="#6366f1" stroke="#1e1e1e" stroke-width="2">
                        <title>Turn ${d.turn}: Shanten ${d.shanten} | Ukeire ${d.ukeire} | Avg Shanten ${d.avgShanten.toFixed(1)} | Danger ${d.danger}% | Threat ${d.threatLevel} | Fan ${d.fan}</title>
                    </circle>
                `;
            }).join('')}
        </svg>
    `;
    
    container.innerHTML = svg;
}
