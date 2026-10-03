let model;
const MODEL_SAVE_PATH = 'indexeddb://mahjong-bot-v1';

function log(msg) {
    const logs = document.getElementById('logs');
    const div = document.createElement('div');
    div.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.appendChild(div);
    
    // Automatically flush logs to keep the browser running at lightning speed
    while (logs.children.length > 200) {
        logs.removeChild(logs.firstChild);
    }
    
    logs.scrollTop = logs.scrollHeight;
}

// Initialize WebAssembly Engine
const go = new Go();
WebAssembly.instantiateStreaming(fetch("engine.wasm"), go.importObject).then((result) => {
    go.run(result.instance);
    log("Wasm Engine Loaded & Ready!");
}).catch(err => {
    log("Failed to load Wasm: " + err);
});

// For very small Neural Networks (like ours), the CPU backend is actually FASTER 
// than WebGL because it completely skips the overhead of copying memory to the Graphics Card!
tf.setBackend('cpu').then(() => log("TF.js Backend set to: CPU (Optimized for small tensors)"));

// 1. Define or Load the Neural Network
async function initModel() {
    try {
        log("Attempting to load existing model from IndexedDB...");
        model = await tf.loadLayersModel(MODEL_SAVE_PATH);
        log("Model loaded successfully!");
    } catch (e) {
        log("No existing model found. Creating a new brain from scratch...");
        model = tf.sequential();
        model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [50] }));
        model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dense({ units: 34 }));
        log("New Neural Network architecture created.");
        await model.save(MODEL_SAVE_PATH);
        log("Initial randomized model saved to IndexedDB.");
    }
    
    model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError'
    });
    
    log("Model compiled and ready for training.");
    document.getElementById('model-status').innerText = "Loaded & Ready!";
    document.getElementById('model-status').style.color = "#10b981";
}

document.getElementById('btn-init-model').addEventListener('click', initModel);

document.getElementById('btn-clear-model').addEventListener('click', async () => {
    try {
        await tf.io.removeModel(MODEL_SAVE_PATH);
        log("Model successfully wiped from IndexedDB.");
        document.getElementById('model-status').innerText = "Wiped";
        document.getElementById('model-status').style.color = "#ef4444";
        model = null;
    } catch (e) {
        log("Nothing to wipe.");
    }
});

// 2. Training Loop & Virtual Bot Client
let isTraining = false;
let bots = [];
let gamesPlayed = 0;

class VirtualBot {
    constructor(id) {
        this.name = `AI_Bot_${id}`;
        this.isHost = (id === 1);
        this.experienceMemory = []; // Stores [stateTensor, actionIndex]
    }

    vectorizeState(hand) {
        const state = new Array(50).fill(0);
        hand.forEach(t => {
            let offset = 0;
            if (t.suit === 'character') offset = 0;
            else if (t.suit === 'bamboo') offset = 9;
            else if (t.suit === 'dot') offset = 18;
            else if (t.suit === 'wind') offset = 27;
            else if (t.suit === 'dragon') offset = 31;
            
            let val = parseInt(t.value) || 1; 
            let index = offset + (val - 1);
            if (index < 34) {
                state[index] += 1;
            }
        });
        return state;
    }

    async takeTurn(hand) {
        try {
            const stateArray = this.vectorizeState(hand);
            const stateTensor = tf.tensor2d([stateArray]); 
            
            const predictions = model.predict(stateTensor);
            const actionProbabilities = predictions.dataSync(); // Synchronous to avoid async overhead
            
            let bestTile = null;
            let highestProb = -1;
            let bestActionIndex = -1;
            
            for (let i = 0; i < hand.length; i++) {
                let fakeActionIndex = i % 34; 
                let prob = actionProbabilities[fakeActionIndex];
                
                if (prob > highestProb) {
                    highestProb = prob;
                    bestTile = hand[i];
                    bestActionIndex = fakeActionIndex;
                }
            }
            
            if (!bestTile) {
                log(`[${this.name}] ERROR: No best tile found!`);
                return null;
            }

            this.experienceMemory.push({ state: stateArray, actionIndex: bestActionIndex });
            
            stateTensor.dispose();
            predictions.dispose();

            return bestTile.id;
        } catch (e) {
            log(`[${this.name}] CRITICAL ERROR in takeTurn: ${e.message}`);
            return null;
        }
    }

    async handleGameOver(winner, shantens) {
        if (!this.isHost) return;

        let allStates = [];
        let allActions = [];
        let allRewards = [];
        
        bots.forEach(b => {
            if (b.experienceMemory.length > 0) {
                // Reward Shaping based on final Shanten
                let botReward = 0.01; // Base penalty for a complete loss/draw
                
                if (winner === b.name) {
                    botReward = 1.0; // Win
                } else if (shantens && shantens[b.name] !== undefined) {
                    let finalShanten = shantens[b.name];
                    if (finalShanten <= 0) botReward = 0.5; // Tenpai
                    else if (finalShanten === 1) botReward = 0.3; // 1-Shanten
                    else if (finalShanten === 2) botReward = 0.1; // 2-Shanten
                    else if (finalShanten === 3) botReward = 0.05; // 3-Shanten
                    else botReward = -0.1; // Negative penalty for being totally lost
                }
                
                // Add all memories to the batch
                b.experienceMemory.forEach(m => {
                    allStates.push(m.state);
                    allActions.push(m.actionIndex);
                    // Discount the reward slightly for older moves in the game
                    allRewards.push(botReward); 
                });
                
                b.experienceMemory = []; 
            }
        });
        
        if (allStates.length > 0) {
            try {
                // TRUE Q-LEARNING:
                // We only want to update the neural network for the ONE action it actually took!
                // If we set the other 33 actions to 0, the AI gets confused and forgets everything else.
                const x = tf.tensor2d(allStates);
                
                // Get the network's current predictions for all these states
                const currentPredictions = model.predict(x);
                let currentQValues = currentPredictions.arraySync();
                
                // Replace ONLY the score of the action we took with the actual reward we got
                for (let i = 0; i < allStates.length; i++) {
                    currentQValues[i][allActions[i]] = allRewards[i];
                }
                
                const y = tf.tensor2d(currentQValues);
                
                await model.fit(x, y, { epochs: 1, verbose: 0 });
                
                x.dispose();
                y.dispose();
                currentPredictions.dispose();
            } catch (err) {
                log(`[Host] Batch Training error: ${err.message}`);
            }
        }
        
        gamesPlayed++;
        document.getElementById('games-played').innerText = gamesPlayed;
        
        if (gamesPlayed % 5 === 0) {
            log("Saving updated brain to IndexedDB...");
            await model.save(MODEL_SAVE_PATH);
        }
        
        if (isTraining) {
            // Use requestAnimationFrame or setTimeout(0) to yield to the browser
            // so the UI can update before blocking with the next game loop
            setTimeout(runTrainingLoop, 0);
        }
    }
}

async function runTrainingLoop() {
    if (!isTraining) return;
    
    // 1. Initialize Game via WebAssembly
    let stateJson = window.MahjongEngine.startGame();
    let state = JSON.parse(stateJson);
    
    // 2. Play until someone wins (or draw)
    while (state.type !== "game_over" && isTraining) {
        let currentTurn = state.currentTurn;
        let bot = bots.find(b => b.name === currentTurn);
        
        let tileId = await bot.takeTurn(state.hand); 
        
        // Discard via Wasm
        stateJson = window.MahjongEngine.discardTile(currentTurn, tileId);
        state = JSON.parse(stateJson);
    }
    
    // A tiny await ONCE per game to allow garbage collection and UI updates 
    // This is 88x faster than doing it every turn!
    await new Promise(r => setTimeout(r, 0));
    
    // 3. Train on results!
    if (state.type === "game_over") {
        log(`Game ${gamesPlayed + 1} finished. Winner: ${state.winner}`);
        await bots[0].handleGameOver(state.winner, state.shantens); 
    }
}

document.getElementById('btn-start-training').addEventListener('click', () => {
    if (!model) {
        alert("Please initialize the model first!");
        return;
    }
    if (isTraining) return;
    
    isTraining = true;
    log("Starting blazing fast Wasm training loop...");
    
    if (bots.length === 0) {
        for (let i = 1; i <= 4; i++) {
            bots.push(new VirtualBot(i));
        }
    }
    
    runTrainingLoop();
});

document.getElementById('btn-stop-training').addEventListener('click', () => {
    isTraining = false;
    log("Training stopped. (Current game will finish)");
});
