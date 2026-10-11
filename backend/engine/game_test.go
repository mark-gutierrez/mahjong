package engine

import (
	"testing"
)

func TestExecuteActionChowSpecific(t *testing.T) {
	playerNames := []string{"Alice", "Bob"}
	g := NewGame(playerNames)

	// Alice discards 4 Bamboo
	discardTile := Tile{ID: 100, Suit: SuitBamboo, Value: "4"}
	g.CenterDiscards = append(g.CenterDiscards, discardTile)
	g.Players["Alice"].Discards = append(g.Players["Alice"].Discards, discardTile)

	// Bob has 2, 3, 5, 6 Bamboo in hand
	g.Players["Bob"].Hand = []Tile{
		{ID: 101, Suit: SuitBamboo, Value: "2"},
		{ID: 102, Suit: SuitBamboo, Value: "3"},
		{ID: 103, Suit: SuitBamboo, Value: "5"},
		{ID: 104, Suit: SuitBamboo, Value: "6"},
	}

	g.CurrentTurnIdx = 0 // Alice's turn
	g.Interrupt = &InterruptState{
		Active:        true,
		DiscardedTile: discardTile,
		DiscarderName: "Alice",
		Actions: map[string][]string{
			"Bob": {"chow"},
		},
	}

	// Bob chooses specific chow "chow:3,5" (middle run: 3, 4, 5)
	success := g.ExecuteAction("Bob", "chow:3,5")
	if !success {
		t.Fatalf("expected chow:3,5 to succeed")
	}

	// Verify Bob's hand now only contains 2b and 6b
	if len(g.Players["Bob"].Hand) != 2 {
		t.Fatalf("expected Bob to have 2 tiles in hand, got %d", len(g.Players["Bob"].Hand))
	}
	for _, tile := range g.Players["Bob"].Hand {
		if tile.Value != "2" && tile.Value != "6" {
			t.Fatalf("expected hand to contain only 2 and 6, but found %s", tile.Value)
		}
	}

	// Verify Bob's melds contains the meld of 3 tiles: 3, 5, and discarded 4
	if len(g.Players["Bob"].Melds) != 1 {
		t.Fatalf("expected 1 meld, got %d", len(g.Players["Bob"].Melds))
	}
	meld := g.Players["Bob"].Melds[0]
	if len(meld) != 3 {
		t.Fatalf("expected meld length 3, got %d", len(meld))
	}
	values := map[string]bool{}
	for _, m := range meld {
		values[m.Value] = true
	}
	if !values["3"] || !values["4"] || !values["5"] {
		t.Fatalf("expected meld to contain 3, 4, 5, got %+v", meld)
	}
}

func TestExecuteActionPung(t *testing.T) {
	playerNames := []string{"Alice", "Bob"}
	g := NewGame(playerNames)

	discardTile := Tile{ID: 200, Suit: SuitDot, Value: "7"}
	g.CenterDiscards = append(g.CenterDiscards, discardTile)
	g.Players["Alice"].Discards = append(g.Players["Alice"].Discards, discardTile)

	g.Players["Bob"].Hand = []Tile{
		{ID: 201, Suit: SuitDot, Value: "7"},
		{ID: 202, Suit: SuitDot, Value: "7"},
		{ID: 203, Suit: SuitBamboo, Value: "1"},
	}

	g.CurrentTurnIdx = 0
	g.Interrupt = &InterruptState{
		Active:        true,
		DiscardedTile: discardTile,
		DiscarderName: "Alice",
		Actions: map[string][]string{
			"Bob": {"pung"},
		},
	}

	success := g.ExecuteAction("Bob", "pung")
	if !success {
		t.Fatalf("expected pung to succeed")
	}

	if len(g.Players["Bob"].Hand) != 1 || g.Players["Bob"].Hand[0].Value != "1" {
		t.Fatalf("expected Bob to have only tile 1 in hand, got %+v", g.Players["Bob"].Hand)
	}
	if len(g.Players["Bob"].Melds) != 1 || len(g.Players["Bob"].Melds[0]) != 3 {
		t.Fatalf("expected 1 meld of 3 tiles")
	}
}
