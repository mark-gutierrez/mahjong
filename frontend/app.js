// Determine WebSocket URL based on environment
const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1" || window.location.protocol === "file:";
// IMPORTANT: Once deployed to Render, put your actual Render URL here
const WS_URL = isLocal ? `ws://localhost:8080/ws` : `wss://mahjong-server-6zi9.onrender.com/ws`;

const ws = new WebSocket(WS_URL);
window.useSimpleTiles = false;
window.showAnalytics = false;
let lastGameDataRaw = null;

ws.onopen = () => {
    console.log("✅ Connected to Mahjong Server");
};

const TILE_COLORS = { red: '#ef4444', green: '#10b981', blue: '#3b82f6', black: '#0f172a' };

function renderDot(x, y, color, r = 12) {
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" />
            <circle cx="${x}" cy="${y}" r="${r/2}" fill="white" opacity="0.3" />`;
}

function renderStick(x, y, color) {
    return `<rect x="${x-6}" y="${y-16}" width="12" height="32" rx="6" fill="${color}" />
            <line x1="${x}" y1="${y-10}" x2="${x}" y2="${y+10}" stroke="white" stroke-width="2" opacity="0.5"/>`;
}

window.executeBotAlg = (algName) => {
    ws.send(JSON.stringify({ action: "execute_bot_alg", data: algName }));
};

function getTileFace(tile) {
    if (window.useSimpleTiles) {
        return `<span class="val">${tile.value}</span><span class="suit">${tile.suit}</span>`;
    }
    const suit = tile.suit.charAt(0).toUpperCase() + tile.suit.slice(1);
    const value = tile.value.charAt(0).toUpperCase() + tile.value.slice(1);
    const num = parseInt(value);
    let inner = '';
    
    if (suit === 'Character') {
        const chars = ['一','二','三','四','五','六','七','八','九'];
        const char = chars[num-1] || value;
        inner = `
            <text x="50" y="55" font-family="'KaiTi', 'STKaiti', serif" font-weight="bold" font-size="40" fill="#0f172a" text-anchor="middle">${char}</text>
            <text x="50" y="100" font-family="'KaiTi', 'STKaiti', serif" font-weight="bold" font-size="45" fill="#ef4444" text-anchor="middle">萬</text>
        `;
    } 
    else if (suit === 'Dot') {
        let dots = [];
        const R = TILE_COLORS.red, B = TILE_COLORS.blue, G = TILE_COLORS.green;
        if (num === 1) dots = [[50,55,R,25]];
        else if (num === 2) dots = [[50,30,G], [50,85,B]];
        else if (num === 3) dots = [[30,30,B], [50,55,R], [70,85,G]];
        else if (num === 4) dots = [[30,30,B], [70,30,G], [30,85,G], [70,85,B]];
        else if (num === 5) dots = [[30,30,B], [70,30,G], [50,55,R], [30,85,G], [70,85,B]];
        else if (num === 6) dots = [[30,25,G], [70,25,G], [30,55,R], [70,55,R], [30,85,R], [70,85,R]];
        else if (num === 7) dots = [[30,20,G], [50,35,G], [70,50,G], [30,75,R], [70,75,R], [30,95,R], [70,95,R]];
        else if (num === 8) dots = [[30,20,B], [70,20,B], [30,45,B], [70,45,B], [30,70,B], [70,70,B], [30,95,B], [70,95,B]];
        else if (num === 9) dots = [[25,25,B], [50,25,B], [75,25,B], [25,55,R], [50,55,R], [75,55,R], [25,85,G], [50,85,G], [75,85,G]];
        
        inner = dots.map(d => renderDot(d[0], d[1], d[2], d[3]||14)).join('');
    }
    else if (suit === 'Bamboo') {
        let sticks = [];
        const R = TILE_COLORS.red, B = TILE_COLORS.blue, G = TILE_COLORS.green;
        
        if (num === 1) {
            inner = `<path d="M50 80 Q70 60 70 40 Q70 20 50 20 Q30 20 30 40 Q30 60 50 80 Z" fill="${G}" />
                     <circle cx="45" cy="35" r="3" fill="#fff" />
                     <circle cx="55" cy="35" r="3" fill="#fff" />
                     <path d="M45 45 L55 45 L50 55 Z" fill="${R}" />`;
        }
        else if (num === 2) sticks = [[50,35,B], [50,80,G]];
        else if (num === 3) sticks = [[50,25,B], [35,75,G], [65,75,G]];
        else if (num === 4) sticks = [[35,35,B], [65,35,G], [35,80,G], [65,80,B]];
        else if (num === 5) sticks = [[35,25,B], [65,25,G], [50,50,R], [35,80,G], [65,80,B]];
        else if (num === 6) sticks = [[30,35,G], [50,35,G], [70,35,G], [30,80,B], [50,80,B], [70,80,B]];
        else if (num === 7) sticks = [[50,20,R], [30,50,G], [50,50,G], [70,50,G], [30,85,B], [50,85,B], [70,85,B]];
        else if (num === 8) sticks = [[35,20,G], [65,20,G], [25,50,B], [75,50,B], [35,85,G], [65,85,G], [50,35,R], [50,70,R]];
        else if (num === 9) sticks = [[30,25,R], [50,25,B], [70,25,G], [30,55,R], [50,55,B], [70,55,G], [30,85,R], [50,85,B], [70,85,G]];
        
        if (num !== 1) inner = sticks.map(s => renderStick(s[0], s[1], s[2])).join('');
    }
    else if (suit === 'Wind') {
        const windMap = {'East': '東', 'South': '南', 'West': '西', 'North': '北'};
        const colorMap = {'East': TILE_COLORS.blue, 'South': TILE_COLORS.green, 'West': TILE_COLORS.black, 'North': TILE_COLORS.red};
        inner = `
            <text x="50" y="70" font-family="'KaiTi', 'STKaiti', serif" font-weight="bold" font-size="55" fill="${colorMap[value]||TILE_COLORS.black}" text-anchor="middle">${windMap[value]||value}</text>
        `;
    }
    else if (suit === 'Dragon') {
        if (value === 'Red') inner = `<text x="50" y="70" font-family="'KaiTi', 'STKaiti', serif" font-weight="bold" font-size="60" fill="${TILE_COLORS.red}" text-anchor="middle">中</text>`;
        else if (value === 'Green') inner = `<text x="50" y="70" font-family="'KaiTi', 'STKaiti', serif" font-weight="bold" font-size="60" fill="${TILE_COLORS.green}" text-anchor="middle">發</text>`;
        else if (value === 'White') inner = `<rect x="25" y="20" width="50" height="60" fill="none" stroke="${TILE_COLORS.blue}" stroke-width="8" />`;
    }

    if (!inner) {
        inner = `
            <text x="50" y="65" font-family="sans-serif" font-weight="bold" font-size="30" fill="#ef4444" text-anchor="middle">${value}</text>
        `;
    }

    // Top left index
    const topIndex = num ? num : value.charAt(0);
    const cornerText = `<text x="16" y="26" font-family="sans-serif" font-weight="900" font-size="22" fill="#64748b">${topIndex}</text>`;

    // Bottom caption
    let bottomText = suit;
    if (suit === 'Wind' || suit === 'Dragon' || suit === 'Flower' || suit === 'Season') {
        bottomText = value; 
    }
    let fontSize = 16;
    if (bottomText.length > 6) fontSize = 14;
    if (bottomText.length > 8) fontSize = 12;
    const caption = `<text x="50" y="122" font-family="sans-serif" font-size="${fontSize}" font-weight="900" fill="#475569" text-anchor="middle" letter-spacing="1">${bottomText}</text>`;

    return `<svg viewBox="0 0 100 130" width="100%" height="100%">${inner}${cornerText}${caption}</svg>`;
}

ws.onmessage = (event) => {
    lastGameDataRaw = event.data;
    console.log("📨 Message from server:", event.data);
    const data = JSON.parse(event.data);
    
    if (data.type === "error") {
        alert("Error: " + data.message);
        showScreen('landing');
        return;
    }
    
    if (data.type === "room_created" || data.type === "room_joined") {
        document.getElementById('display-room-code').innerText = data.roomCode;
        showScreen('lobby');
    }
    
    if (data.type === "player_list") {
        const list = document.getElementById('players-list');
        list.innerHTML = "";
        
        data.players.forEach((player, idx) => {
            const li = document.createElement('li');
            li.innerText = player + (idx === 0 ? " (Host)" : "");
            list.appendChild(li);
        });
        
        // Fill empty slots up to 4
        for (let i = data.players.length; i < 4; i++) {
            const li = document.createElement('li');
            li.className = "empty-slot";
            li.innerText = "Waiting for player...";
            list.appendChild(li);
        }
        
        // Enable start button if host and room is full (for now just enable if > 1 player)
        if (data.players.length >= 1) {
            document.getElementById('btn-start').removeAttribute('disabled');
        }
    }
    
    if (data.type === "game_update") {
        showScreen('game');
        const myName = document.getElementById('nickname').value.trim();
        const isMyTurn = data.currentTurn === myName;
        
        // Update Turn Indicator & Timer
        const turnDisplay = document.getElementById('current-turn-display');
        turnDisplay.innerHTML = isMyTurn ? "<strong>Your Turn!</strong>" : `Waiting on <strong>${data.currentTurn}</strong>`;
        if (isMyTurn) turnDisplay.style.color = 'var(--accent)';
        else turnDisplay.style.color = 'var(--text)';

        const botQuickActions = document.getElementById('bot-quick-actions');
        if (botQuickActions) {
            if (isMyTurn && window.showBotActions && (!data.actions || data.actions.length === 0)) {
                botQuickActions.style.opacity = '1';
                botQuickActions.style.pointerEvents = 'auto';
            } else {
                botQuickActions.style.opacity = '0';
                botQuickActions.style.pointerEvents = 'none';
            }
        }

        clearInterval(window.turnTimerInterval);
        const updateTimer = () => {
            const remaining = Math.max(0, Math.floor((data.actionDeadline - Date.now()) / 1000));
            const timerEl = document.getElementById('turn-timer');
            if (timerEl) {
                timerEl.innerText = remaining + "s";
                if (remaining <= 5) {
                    timerEl.style.color = '#ef4444';
                    timerEl.style.animation = 'pulse 1s infinite';
                } else {
                    timerEl.style.color = 'inherit';
                    timerEl.style.animation = 'none';
                }
            }
        };
        updateTimer();
        window.turnTimerInterval = setInterval(updateTimer, 1000);

        // Render Opponents Area
        const oppArea = document.getElementById('opponents-area');
        oppArea.innerHTML = '';
        if (data.players) {
            data.players.forEach(p => {
                if (p.nickname === myName) return;
                const lastDiscard = (p.discards && p.discards.length > 0) ? p.discards[p.discards.length - 1] : null;
                const discardHtml = lastDiscard ? `<div class="tile mini">${getTileFace(lastDiscard)}</div>` : `<div class="empty-slot"></div>`;
                const isOppTurn = data.currentTurn === p.nickname;
                
                let meldsHtml = '';
                if (p.melds && p.melds.length > 0) {
                    meldsHtml = '<div class="opp-melds">';
                    p.melds.forEach(meld => {
                        meldsHtml += '<div class="opp-meld-group">';
                        meld.forEach(tile => {
                            meldsHtml += `<div class="tile micro">${getTileFace(tile)}</div>`;
                        });
                        meldsHtml += '</div>';
                    });
                    meldsHtml += '</div>';
                }
                
                const oppCard = document.createElement('div');
                oppCard.className = 'opponent-card' + (isOppTurn ? ' active-turn' : '');
                const algName = p.algorithm ? p.algorithm.toUpperCase() : 'HUMAN';
                oppCard.innerHTML = `
                    <div class="opp-name">${p.nickname}</div>
                    <div class="opp-alg" style="font-size: 0.65rem; color: #a5b4fc; letter-spacing: 1px; margin-bottom: 5px; opacity: 0.8;">[${algName}]</div>
                    <div class="opp-discard-label">Latest Discard</div>
                    ${discardHtml}
                    ${meldsHtml}
                `;
                oppArea.appendChild(oppCard);
            });
        }

        // Render Hand
        const handContainer = document.getElementById('my-hand');
        handContainer.innerHTML = '';
        const sortedHand = data.hand.sort((a, b) => {
            if (a.suit === b.suit) return a.value.localeCompare(b.value);
            return a.suit.localeCompare(b.suit);
        });
        // Analytics: Discard Probability
        const counts = {};
        sortedHand.forEach(t => {
            counts[t.suit + t.value] = (counts[t.suit + t.value] || 0) + 1;
        });
        
        const discardCounts = {};
        if (data.discards) {
            data.discards.forEach(t => {
                discardCounts[t.suit + t.value] = (discardCounts[t.suit + t.value] || 0) + 1;
            });
        }
        if (data.players) {
            data.players.forEach(p => {
                if (p.melds) {
                    p.melds.forEach(meld => {
                        meld.forEach(t => {
                            discardCounts[t.suit + t.value] = (discardCounts[t.suit + t.value] || 0) + 1;
                        });
                    });
                }
            });
        }

        const weights = sortedHand.map(t => {
            const key = t.suit + t.value;
            if (counts[key] >= 2) return 0; // Pairs/Pungs are highly valuable
            const isHonor = ['wind', 'dragon', 'flower', 'season'].includes(t.suit.toLowerCase());
            const isTerminal = t.value === '1' || t.value === '9';
            
            let weight = (isHonor || isTerminal) ? 100 : 60;
            
            if (!isHonor && !isTerminal) {
                // Check proto-sequences for middle tiles
                const valInt = parseInt(t.value);
                let hasNeighbor = false;
                let deadNeighbors = 0;
                for (let offset of [-2, -1, 1, 2]) {
                    const nVal = valInt + offset;
                    if (nVal >= 1 && nVal <= 9) {
                        const nKey = t.suit + nVal.toString();
                        if (counts[nKey]) hasNeighbor = true;
                        if (discardCounts[nKey]) deadNeighbors += discardCounts[nKey];
                    }
                }
                if (hasNeighbor) weight = 20;
                
                // Penalty: if sequence builders are dead, it's harder to build sequences
                weight += (deadNeighbors * 15);
            }
            
            // Penalty: if identical tiles are dead, it's harder to build a pair
            if (discardCounts[key]) {
                weight += (discardCounts[key] * 25);
            }
            
            return Math.min(100, weight);
        });

        const totalWeight = weights.reduce((a, b) => a + b, 0);

        sortedHand.forEach((tile, index) => {
            const tileDiv = document.createElement('div');
            tileDiv.className = 'tile' + (isMyTurn ? ' interactive' : '');
            tileDiv.style.position = 'relative';
            tileDiv.innerHTML = getTileFace(tile);
            
            // Render Analytics Badge
            if (window.showAnalytics) {
                const pct = totalWeight === 0 ? 0 : Math.round((weights[index] / totalWeight) * 100);
                const badgeColor = pct >= 20 ? '#ef4444' : (pct > 0 ? '#f59e0b' : '#10b981');
                const badge = document.createElement('div');
                badge.style.cssText = `position: absolute; top: -8px; right: -8px; background: ${badgeColor}; color: white; font-size: 11px; font-weight: 900; padding: 2px 5px; border-radius: 4px; z-index: 10; box-shadow: 0 2px 4px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.2);`;
                badge.innerText = `${pct}%`;
                tileDiv.appendChild(badge);
            }

            if (isMyTurn) {
                tileDiv.addEventListener('click', () => {
                    ws.send(JSON.stringify({ action: "discard_tile", tileId: tile.id }));
                });
            }
            handContainer.appendChild(tileDiv);
        });

        // Render Center Discard Pool
        const pool = document.getElementById('discard-pool');
        pool.innerHTML = '';
        if (data.discards) {
            data.discards.forEach(tile => {
                const t = document.createElement('div');
                t.className = 'tile discarded';
                t.innerHTML = getTileFace(tile);
                pool.appendChild(t);
            });
        }

        // Render Melds
        const meldsArea = document.getElementById('melds-area');
        meldsArea.innerHTML = '';
        if (data.melds && data.melds.length > 0) {
            data.melds.forEach(meld => {
                const mDiv = document.createElement('div');
                mDiv.className = 'meld-group';
                meld.forEach(tile => {
                    const t = document.createElement('div');
                    t.className = 'tile exposed';
                    t.innerHTML = getTileFace(tile);
                    mDiv.appendChild(t);
                });
                meldsArea.appendChild(mDiv);
            });
        }

        // Action Buttons
        const existingBtn = document.getElementById('action-buttons');
        if (existingBtn) existingBtn.remove();
        if (data.actions && data.actions.length > 0) {
            const btnContainer = document.createElement('div');
            btnContainer.id = 'action-buttons';
            btnContainer.className = 'action-buttons';
            data.actions.forEach(act => {
                const btn = document.createElement('button');
                btn.innerText = act.toUpperCase() + "!";
                btn.onclick = () => { ws.send(JSON.stringify({action: "execute_steal", data: act})); };
                btnContainer.appendChild(btn);
            });
            const skipBtn = document.createElement('button');
            skipBtn.className = 'btn-secondary';
            skipBtn.innerText = 'SKIP';
            skipBtn.onclick = () => {
                ws.send(JSON.stringify({action: "skip"}));
                btnContainer.remove();
            };
            btnContainer.appendChild(skipBtn);
            document.querySelector('.player-area').prepend(btnContainer);
        }

        if (data.canMahjong) {
            let btnContainer = document.getElementById('action-buttons');
            if (!btnContainer) {
                btnContainer = document.createElement('div');
                btnContainer.id = 'action-buttons';
                btnContainer.className = 'action-buttons';
                document.querySelector('.player-area').prepend(btnContainer);
            }
            
            const btn = document.createElement('button');
            btn.className = 'btn-primary';
            btn.innerText = "MAHJONG!";
            btn.onclick = () => {
                ws.send(JSON.stringify({action: "declare_mahjong"}));
            };
            btnContainer.appendChild(btn);
        }
    }

    if (data.type === "game_over") {
        showScreen('lobby');
        
        // Save to IndexedDB via replay.js function
        if (data.replayLog && window.saveReplay) {
            window.saveReplay(data.replayLog, data.winner, data.roundPoints).then(id => {
                if (id) {
                    const btn = document.createElement('button');
                    btn.className = 'btn-secondary';
                    btn.style.marginTop = '10px';
                    btn.innerText = '🎥 View Replay of this Game';
                    btn.onclick = () => window.showReplayScreen({history: data.replayLog});
                    document.getElementById('game-results').appendChild(btn);
                }
            });
        }
        
        let resultsDiv = document.getElementById('game-results');
        if (!resultsDiv) {
            resultsDiv = document.createElement('div');
            resultsDiv.id = 'game-results';
            resultsDiv.style.cssText = "margin: 20px 0; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);";
            const btn = document.getElementById('btn-start');
            btn.parentNode.insertBefore(resultsDiv, btn);
        }
        
        let html = `<h3 style="color: var(--accent); margin-top: 0;">🎉 ${data.winner} won the round! 🎉</h3>`;
        html += `<table style="width: 100%; text-align: left; border-collapse: collapse; margin-top: 10px;">
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1);"><th style="padding-bottom:5px;">Player</th><th style="padding-bottom:5px;">Round Points</th><th style="padding-bottom:5px;">Total Score</th></tr>`;
            
        for (const [pName, score] of Object.entries(data.totalScores || {})) {
            const roundScore = data.roundPoints ? data.roundPoints[pName] : 0;
            const roundStr = roundScore > 0 ? `+${roundScore}` : `${roundScore}`;
            const roundColor = roundScore > 0 ? '#10b981' : '#ef4444';
            html += `<tr>
                <td style="padding: 8px 0;">${pName}</td>
                <td style="padding: 8px 0; color: ${roundColor};">${roundStr}</td>
                <td style="padding: 8px 0; font-weight: bold;">${score}</td>
            </tr>`;
        }
        html += `</table>`;
        resultsDiv.innerHTML = html;
        
        document.getElementById('btn-start').innerText = "Play Next Round";
        document.getElementById('btn-start').disabled = false;
    }
};

ws.onclose = () => {
    console.log("❌ Disconnected from server");
    alert("Lost connection to server. Please refresh.");
};

// --- UI State Management ---
const screens = {
    landing: document.getElementById('landing'),
    lobby: document.getElementById('lobby'),
    game: document.getElementById('game'),
    replay: document.getElementById('replay')
};

function showScreen(screenName) {
    // Hide all screens
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    // Show requested screen
    screens[screenName].classList.remove('hidden');
}

// --- Event Listeners ---

// Create Room
document.getElementById('btn-create').addEventListener('click', () => {
    const nickname = document.getElementById('nickname').value.trim();
    if (!nickname) return alert("Please enter a nickname first.");
    
    const payload = {
        action: "create_room",
        nickname: nickname
    };
    ws.send(JSON.stringify(payload));
    
    // Update UI immediately for snappiness, though server confirms it
    showScreen('lobby');
});

// Join Room
document.getElementById('btn-join').addEventListener('click', () => {
    const nickname = document.getElementById('nickname').value.trim();
    const roomCode = document.getElementById('room-code').value.trim().toUpperCase();
    
    if (!nickname) return alert("Please enter a nickname.");
    if (!roomCode) return alert("Please enter a room code.");
    
    // Send action to Go backend
    const payload = {
        action: "join_room",
        nickname: nickname,
        roomCode: roomCode
    };
    ws.send(JSON.stringify(payload));
    
    // Update UI
    document.getElementById('display-room-code').innerText = roomCode;
    showScreen('lobby');
});

// Start Game (from Lobby)
document.getElementById('btn-start').addEventListener('click', () => {
    // Send action to Go backend
    ws.send(JSON.stringify({ action: "start_game" }));
    showScreen('game');
});

// Leave Room (from Lobby)
document.getElementById('btn-leave-room').addEventListener('click', () => {
    // A full reload ensures clean state and drops the websocket, cleaning up the backend room.
    window.location.reload();
});

// For testing purposes: Enable the start button immediately
document.getElementById('btn-start').removeAttribute('disabled');

// Toggle Tile Style
document.getElementById('toggle-style').addEventListener('click', () => {
    window.useSimpleTiles = !window.useSimpleTiles;
    if (lastGameDataRaw) {
        // Re-trigger the render with the last known data packet
        ws.onmessage({ data: lastGameDataRaw });
    }
});

// Toggle Analytics
document.getElementById('toggle-analytics').addEventListener('click', () => {
    window.showAnalytics = !window.showAnalytics;
    document.getElementById('toggle-analytics').innerText = window.showAnalytics ? "Hide Analytics" : "Show Analytics";
    if (lastGameDataRaw) {
        ws.onmessage({ data: lastGameDataRaw });
    }
});

// Toggle Bot Quick Actions
window.showBotActions = false;
document.getElementById('toggle-bot-actions').addEventListener('click', () => {
    window.showBotActions = !window.showBotActions;
    const btn = document.getElementById('toggle-bot-actions');
    btn.innerText = window.showBotActions ? "Disable Bot Actions" : "Enable Bot Actions";
    btn.style.background = window.showBotActions ? "#ef4444" : "#8b5cf6";
    if (lastGameDataRaw) {
        ws.onmessage({ data: lastGameDataRaw });
    }
});
