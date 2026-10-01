# Multiplayer Mahjong Web App

A full-stack, real-time multiplayer Hong Kong Mahjong game. It features a custom-built Go game engine, an intelligent auto-play bot system, and a beautifully designed, responsive vanilla Javascript frontend.

## Features
- **Real-Time Multiplayer:** Built on WebSockets for instant, zero-lag gameplay.
- **Full Ruleset Engine:** Validates Pungs, Chows, Kongs, and perfectly mathematically verifies 14-tile Mahjong winning hands using a recursive backtracking algorithm.
- **Smart Bots & Auto-Play:** If you don't have 4 human players, the server automatically fills the table with intelligent bots that analyze hand heuristics to make algorithmic discard choices. If a player disconnects or times out, a bot seamlessly takes over their seat!
- **Dynamic 4-Second Interrupts:** Replicates the fast-paced nature of real Mahjong. When a tile is discarded, the game pauses for 4 seconds allowing any player to steal it.
- **Beautiful UI:** Premium, dynamic SVG tiles generated completely in the browser (scalable to any size without pixelation), with a toggle to switch back to minimalist "Basic Text" tiles.

## Architecture
- **Backend (`/backend`)**: Written in Go. Manages WebSocket connections, room states, turn timers, and the core Mahjong rules engine.
- **Frontend (`/frontend`)**: Pure Vanilla HTML/CSS/JS. Connects to the Go server via WebSockets. No build steps or heavy frameworks required.

## How to Run Locally

### 1. Start the Go Backend
Ensure you have Go installed on your machine.
```bash
cd backend
go run main.go
```
The WebSocket server will start on `ws://localhost:8080/ws`.

### 2. Start the Frontend
Since it's vanilla Javascript, you can simply open `frontend/index.html` in your web browser. 
Alternatively, serve it with any simple HTTP server:
```bash
cd frontend
npx http-server -p 3000
```
Then visit `http://localhost:3000`.

## Deployment
- **Backend**: Designed to be easily containerized or deployed to a platform like Render.
- **Frontend**: Because it is static, it can be hosted instantly on GitHub Pages, Vercel, or Netlify. *(Note: Ensure you update `WS_URL` in `app.js` to point to your production secure WebSocket `wss://...` URL).*

## How to Play Mahjong

### The Goal
Your objective is to draw and discard tiles until you can organize your entire 14-tile hand into **4 Melds and 1 Pair (The Eye)**.

### Melds
A Meld is a specific combination of tiles. There are three types:
1. **Pung (Triplet):** Three identical tiles of any suit (e.g., three 1s of Dots, or three East Winds). You can steal a tile from *any* player to form a Pung.
2. **Chow (Sequence):** Three sequential tiles of the same numbered suit (e.g., 2, 3, 4 of Bamboo). You can only steal a tile to form a Chow from the player sitting exactly before you.
3. **Kong (Quadruplet):** Four identical tiles. When formed, it counts as a single Pung toward your 4-Meld requirement. You can steal from *any* player to form a Kong.

### The Eye (Pair)
In addition to your 4 melds, you must have exactly one pair of identical tiles to win the game.

### Stealing
When another player discards a tile, the game pauses for 4 seconds. If that discarded tile completes a Pung, Kong, Chow, or gives you a Winning Hand, you can click the respective button to **steal** it! If you don't make a decision within your 30-second turn timer, the game will auto-discard for you.
