package server

import (
	"encoding/json"
	"log"
	"fmt"
	"time"
	"math/rand"
	
	"mahjong-go/engine"
)

type GameAction struct {
	Client *Client
	Action string
	TileID int
	Data   string
}

type Room struct {
	ID         string
	Hub        *Hub
	Clients    map[*Client]bool
	Register   chan *Client
	Unregister chan *Client
	Broadcast  chan []byte
	StartGame    chan bool
	GameAction   chan GameAction
	Game         *engine.Game
	IsBot        map[string]bool
	Disconnected map[string]bool
	Scores       map[string]int
	TurnTimer    *time.Timer
	ActionDeadline int64
}

func NewRoom(id string, hub *Hub) *Room {
	return &Room{
		ID:           id,
		Hub:          hub,
		Clients:      make(map[*Client]bool),
		Register:     make(chan *Client),
		Unregister:   make(chan *Client),
		Broadcast:    make(chan []byte),
		StartGame:    make(chan bool),
		GameAction:   make(chan GameAction),
		IsBot:        make(map[string]bool),
		Disconnected: make(map[string]bool),
		Scores:       make(map[string]int),
	}
}

func (r *Room) Run() {
	for {
		select {
		case client := <-r.Register:
			r.Clients[client] = true
			log.Printf("Client %s joined room %s", client.Nickname, r.ID)
			if r.Game != nil {
				r.Disconnected[client.Nickname] = false
				r.BroadcastGameState()
			} else {
				r.broadcastPlayerList()
			}
			
		case client := <-r.Unregister:
			if _, ok := r.Clients[client]; ok {
				delete(r.Clients, client)
				close(client.Send)
				log.Printf("Client %s left room %s", client.Nickname, r.ID)
				
				// Destroy room if everyone leaves
				if len(r.Clients) == 0 {
					r.Hub.mu.Lock()
					delete(r.Hub.Rooms, r.ID)
					r.Hub.mu.Unlock()
					log.Printf("Room %s destroyed because it is empty", r.ID)
					return
				}
				if r.Game != nil {
					r.Disconnected[client.Nickname] = true
				} else {
					r.broadcastPlayerList()
				}
			}
			
		case message := <-r.Broadcast:
			for client := range r.Clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(r.Clients, client)
				}
			}
			
		case <-r.StartGame:
			// Initialize the Engine
			var playerNames []string
			for client := range r.Clients {
				playerNames = append(playerNames, client.Nickname)
			}

			// Auto-fill bots
			botCount := 1
			for len(playerNames) < 4 {
				botName := fmt.Sprintf("Bot-%d", botCount)
				playerNames = append(playerNames, botName)
				r.IsBot[botName] = true
				botCount++
			}
			
			r.Game = engine.NewGame(playerNames)
			
			algs := []string{"Heuristic", "Shanten", "Betaori", "Push/Fold"}
			for _, pName := range playerNames {
				if r.IsBot[pName] {
					r.Game.Players[pName].Algorithm = algs[rand.Intn(len(algs))]
				} else {
					r.Game.Players[pName].Algorithm = "Human" // Default for frontend to know
				}
			}
			
			r.Game.Deal() // Shuffle and deal 13/14 tiles
			
			log.Printf("Game started in room %s!", r.ID)
			r.triggerTurnLogic()
			r.BroadcastGameState()
			
		case action := <-r.GameAction:
			if r.Game == nil {
				continue
			}

			if action.Action == "auto_discard" {
				if r.Game.Interrupt != nil && r.Game.Interrupt.Active { continue }
				currentTurnPlayer := r.Game.TurnOrder[r.Game.CurrentTurnIdx]
				if currentTurnPlayer != action.Client.Nickname { continue }
				
				var visibleTiles []engine.Tile
				visibleTiles = append(visibleTiles, r.Game.CenterDiscards...)
				var opponents []*engine.PlayerState
				
				for pName, p := range r.Game.Players {
					for _, meld := range p.Melds {
						visibleTiles = append(visibleTiles, meld...)
					}
					if pName != currentTurnPlayer {
						opponents = append(opponents, p)
					}
				}
				
				botAlg := r.Game.Players[currentTurnPlayer].Algorithm
				bestTileID, reason := engine.RunBotAlgorithm(botAlg, r.Game.Players[currentTurnPlayer], visibleTiles, opponents)
				r.Game.Players[currentTurnPlayer].ActionLog = reason
				
				hasInterrupts := r.Game.DiscardTile(currentTurnPlayer, bestTileID)
				if hasInterrupts {
					r.triggerInterruptLogic()
					r.BroadcastGameState()
				} else {
					if len(r.Game.Wall) == 0 {
						r.BroadcastGameOver("DRAW")
						continue
					}
					r.Game.NextTurn()
					r.triggerTurnLogic()
					r.BroadcastGameState()
				}
			}

			if action.Action == "discard_tile" {
				if r.TurnTimer != nil { r.TurnTimer.Stop() }
				hasInterrupts := r.Game.DiscardTile(action.Client.Nickname, action.TileID)
				if hasInterrupts {
					r.triggerInterruptLogic()
					r.BroadcastGameState()
				} else {
					if len(r.Game.Wall) == 0 {
						r.BroadcastGameOver("DRAW")
						continue
					}
					r.Game.NextTurn()
					r.triggerTurnLogic()
					r.BroadcastGameState()
				}
			}
			
			if action.Action == "timeout" || action.Action == "skip" {
				if r.Game.Interrupt != nil && r.Game.Interrupt.Active {
					if action.Action == "timeout" && r.Game.Interrupt.DiscarderName == action.Client.Nickname {
						// Global timeout (4s) expired, force resolve
						r.Game.CancelInterrupt()
						if len(r.Game.Wall) == 0 {
							r.BroadcastGameOver("DRAW")
							continue
						}
						r.Game.NextTurn()
						r.triggerTurnLogic()
						r.BroadcastGameState()
					} else if action.Action == "skip" {
						_, canInterrupt := r.Game.Interrupt.Actions[action.Client.Nickname]
						if canInterrupt {
							// Remove this player's actions since they skipped
							delete(r.Game.Interrupt.Actions, action.Client.Nickname)
							// If no one else has pending actions, resolve immediately
							if len(r.Game.Interrupt.Actions) == 0 {
								r.Game.CancelInterrupt()
								if len(r.Game.Wall) == 0 {
									r.BroadcastGameOver("DRAW")
									continue
								}
								r.Game.NextTurn()
								r.triggerTurnLogic()
								r.BroadcastGameState()
							}
						}
					}
				}
			}

			if action.Action == "execute_steal" {
				if action.Data == "mahjong" {
					if r.TurnTimer != nil { r.TurnTimer.Stop() }
					r.BroadcastGameOver(action.Client.Nickname)
				} else {
					success := r.Game.ExecuteAction(action.Client.Nickname, action.Data)
					if success {
						r.triggerTurnLogic()
						r.BroadcastGameState()
					}
				}
			}

			if action.Action == "declare_mahjong" {
				if engine.IsWinningHand(r.Game.Players[action.Client.Nickname].Hand) {
					r.BroadcastGameOver(action.Client.Nickname)
				}
			}
		}
	}
}

func (r *Room) triggerTurnLogic() {
	if r.Game == nil { return }
	
	currentTurnPlayer := r.Game.TurnOrder[r.Game.CurrentTurnIdx]
	isBot := r.IsBot[currentTurnPlayer] || r.Disconnected[currentTurnPlayer]
	
	delay := 30 * time.Second
	if isBot {
		delay = 2 * time.Second
	}
	r.ActionDeadline = time.Now().Add(delay).UnixMilli()
	
	if r.TurnTimer != nil {
		r.TurnTimer.Stop()
	}
	
	r.TurnTimer = time.AfterFunc(delay, func() {
		r.GameAction <- GameAction{Action: "auto_discard", Client: &Client{Nickname: currentTurnPlayer}}
	})
}

func (r *Room) triggerInterruptLogic() {
	for pName, actions := range r.Game.Interrupt.Actions {
		if r.IsBot[pName] || r.Disconnected[pName] {
			go func(botName string, acts []string) {
				time.Sleep(1500 * time.Millisecond)
				if r.Game == nil || r.Game.Players[botName] == nil { return }
				bestAct := engine.GetBestSteal(r.Game.Players[botName].Hand, acts)
				if bestAct != "skip" {
					r.GameAction <- GameAction{Action: "execute_steal", Data: bestAct, Client: &Client{Nickname: botName}}
				}
			}(pName, actions)
		}
	}
	
	discarder := r.Game.Interrupt.DiscarderName
	r.ActionDeadline = time.Now().Add(4 * time.Second).UnixMilli()
	
	time.AfterFunc(4 * time.Second, func() {
		r.GameAction <- GameAction{Action: "timeout", Client: &Client{Nickname: discarder}}
	})
}

// BroadcastGameState sends the public board state and individual hands to players
func (r *Room) BroadcastGameState() {
	var publicPlayers []map[string]interface{}
	if r.Game != nil {
		r.Game.RecordSnapshot()
		for _, pName := range r.Game.TurnOrder {
			pState := r.Game.Players[pName]
			publicPlayers = append(publicPlayers, map[string]interface{}{
				"nickname":  pName,
				"melds":     pState.Melds,
				"discards":  pState.Discards,
				"algorithm": pState.Algorithm,
			})
		}
	}

	for client := range r.Clients {
		state := r.Game.Players[client.Nickname]

		var availableActions []string
		if r.Game.Interrupt != nil && r.Game.Interrupt.Active {
			availableActions = r.Game.Interrupt.Actions[client.Nickname]
		}

		canMahjong := false
		if state.Hand != nil {
			canMahjong = engine.IsWinningHand(state.Hand)
		}

		response, _ := json.Marshal(map[string]interface{}{
			"type":           "game_update",
			"hand":           state.Hand,
			"melds":          state.Melds,
			"discards":       r.Game.CenterDiscards,
			"currentTurn":    r.Game.TurnOrder[r.Game.CurrentTurnIdx],
			"actions":        availableActions,
			"canMahjong":     canMahjong,
			"players":        publicPlayers,
			"actionDeadline": r.ActionDeadline,
		})
		
		select {
		case client.Send <- response:
		default:
			log.Printf("Client %s send buffer full, dropping client", client.Nickname)
			delete(r.Clients, client)
			close(client.Send)
			r.Disconnected[client.Nickname] = true
		}
	}
}

func (r *Room) BroadcastGameOver(winner string) {
	if r.TurnTimer != nil {
		r.TurnTimer.Stop()
	}
	
	roundPoints := make(map[string]int)
	if r.Game != nil {
		winPoints := 0
		if winner != "DRAW" && r.Game.Players[winner] != nil {
			_, pts := engine.CalculateScore(r.Game.Players[winner].Hand, r.Game.Players[winner].Melds)
			winPoints = pts
		}

		for _, pName := range r.Game.TurnOrder {
			if pName == winner {
				roundPoints[pName] = winPoints * 3 // Winner gets points from 3 losers
				r.Scores[pName] += roundPoints[pName]
			} else if winner != "DRAW" {
				roundPoints[pName] = -winPoints
				r.Scores[pName] -= winPoints
			} else {
				roundPoints[pName] = 0 // DRAW
			}
		}
	}
	
	var history []engine.ReplaySnapshot
	if r.Game != nil {
		history = r.Game.History
	}
	
	for client := range r.Clients {
		response, _ := json.Marshal(map[string]interface{}{
			"type":        "game_over",
			"winner":      winner,
			"roundPoints": roundPoints,
			"totalScores": r.Scores,
			"replayLog":   history,
		})
		
		select {
		case client.Send <- response:
		default:
			log.Printf("Client %s send buffer full, dropping client", client.Nickname)
			delete(r.Clients, client)
			close(client.Send)
			r.Disconnected[client.Nickname] = true
		}
	}
	r.Game = nil
}

func (r *Room) broadcastPlayerList() {
	var players []string
	for client := range r.Clients {
		players = append(players, client.Nickname)
	}

	response, _ := json.Marshal(map[string]interface{}{
		"type":    "player_list",
		"players": players,
	})

	for client := range r.Clients {
		client.Send <- response
	}
}
