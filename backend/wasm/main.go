package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"
	"mahjong-go/engine"
)

var currentGame *engine.Game

func startGame(this js.Value, args []js.Value) interface{} {
	players := []string{"AI_Bot_1", "AI_Bot_2", "AI_Bot_3", "AI_Bot_4"}
	currentGame = engine.NewGame(players)
	currentGame.Deal()

	stateJSON, err := getGameStateJSON()
	if err != nil {
		return fmt.Sprintf(`{"error": "%s"}`, err.Error())
	}
	return stateJSON
}

func discardTile(this js.Value, args []js.Value) interface{} {
	if currentGame == nil {
		return `{"error": "Game not started"}`
	}
	
	if len(args) < 2 {
		return `{"error": "Missing arguments"}`
	}
	
	playerName := args[0].String()
	tileID := args[1].Int()

	hasInterrupts := currentGame.DiscardTile(playerName, tileID)
	
	// Automatically skip interrupts for basic AI training loop to keep it blazing fast
	if hasInterrupts {
		currentGame.CancelInterrupt()
	}
	
	if len(currentGame.Wall) == 0 {
		return getGameOverJSON("DRAW")
	}
	
	currentGame.NextTurn()
	
	stateJSON, err := getGameStateJSON()
	if err != nil {
		return fmt.Sprintf(`{"error": "%s"}`, err.Error())
	}
	return stateJSON
}

func getGameOverJSON(winner string) string {
	shantens := make(map[string]int)
	for pName, p := range currentGame.Players {
		shantens[pName] = engine.CalculateShanten(p.Hand, p.Melds)
	}
	
	state := map[string]interface{}{
		"type": "game_over",
		"winner": winner,
		"shantens": shantens,
	}
	bytes, _ := json.Marshal(state)
	return string(bytes)
}

func getGameStateJSON() (string, error) {
	// Check for a winner first
	for pName, p := range currentGame.Players {
		if engine.IsWinningHand(p.Hand) {
			return getGameOverJSON(pName), nil
		}
	}
	
	currentTurn := currentGame.TurnOrder[currentGame.CurrentTurnIdx]
	state := map[string]interface{}{
		"type": "game_update",
		"currentTurn": currentTurn,
		"hand": currentGame.Players[currentTurn].Hand,
	}
	
	bytes, err := json.Marshal(state)
	return string(bytes), err
}

func main() {
	fmt.Println("Mahjong Engine Wasm loaded.")
	js.Global().Set("MahjongEngine", map[string]interface{}{
		"startGame": js.FuncOf(startGame),
		"discardTile": js.FuncOf(discardTile),
	})
	
	// Block indefinitely to keep the Wasm module running
	select {}
}
