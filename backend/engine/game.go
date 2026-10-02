package engine

import (
	"math/rand"
	"sort"
	"time"
)

type PlayerState struct {
	Hand      []Tile   `json:"hand"`
	Discards  []Tile   `json:"discards"`
	Melds     [][]Tile `json:"melds"`
	Algorithm string   `json:"algorithm"`
	ActionLog string   `json:"actionLog"`
}

type InterruptState struct {
	Active        bool
	DiscardedTile Tile
	DiscarderName string
	Actions       map[string][]string
}

type PlayerSnapshot struct {
	Hand      []Tile   `json:"hand"`
	Discards  []Tile   `json:"discards"`
	Melds     [][]Tile `json:"melds"`
	Algorithm string   `json:"algorithm"`
	ActionLog string   `json:"actionLog"`
}

type ReplaySnapshot struct {
	CurrentTurn    string                    `json:"currentTurn"`
	CenterDiscards []Tile                    `json:"centerDiscards"`
	Players        map[string]PlayerSnapshot `json:"players"`
}

type Game struct {
	Wall           []Tile
	Players        map[string]*PlayerState
	TurnOrder      []string
	CurrentTurnIdx int
	CenterDiscards []Tile
	Interrupt      *InterruptState
	History        []ReplaySnapshot
}

func NewGame(playerNames []string) *Game {
	g := &Game{
		Wall:           GenerateDeck(),
		Players:        make(map[string]*PlayerState),
		CenterDiscards: []Tile{},
		CurrentTurnIdx: 0,
		Interrupt:      &InterruptState{Active: false},
	}

	// Cryptographically secure shuffle of the 144 tiles
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	r.Shuffle(len(g.Wall), func(i, j int) {
		g.Wall[i], g.Wall[j] = g.Wall[j], g.Wall[i]
	})

	for _, name := range playerNames {
		g.TurnOrder = append(g.TurnOrder, name)
		g.Players[name] = &PlayerState{
			Hand:     []Tile{},
			Discards: []Tile{},
			Melds:    [][]Tile{},
		}
	}

	return g
}

func (g *Game) Deal() {
	// In Mahjong, the dealer (East) gets 14 tiles, everyone else gets 13.
	for i, name := range g.TurnOrder {
		count := 13
		if i == 0 {
			count = 14
		}
		for j := 0; j < count; j++ {
			if len(g.Wall) == 0 {
				break
			}
			tile := g.Wall[0]
			g.Wall = g.Wall[1:]
			g.Players[name].Hand = append(g.Players[name].Hand, tile)
		}
	}
}

// DiscardTile returns true if an Interrupt window (Steal) was triggered
func (g *Game) DiscardTile(playerName string, tileID int) bool {
	if g.TurnOrder[g.CurrentTurnIdx] != playerName { return false }

	ps := g.Players[playerName]
	foundIdx := -1
	var discardedTile Tile
	for i, t := range ps.Hand {
		if t.ID == tileID {
			foundIdx = i
			discardedTile = t
			break
		}
	}
	if foundIdx == -1 { return false }

	ps.Hand = append(ps.Hand[:foundIdx], ps.Hand[foundIdx+1:]...)
	g.CenterDiscards = append(g.CenterDiscards, discardedTile)
	ps.Discards = append(ps.Discards, discardedTile)

	// Check for interrupts (Pung/Kong)
	g.Interrupt = &InterruptState{
		Active:        true,
		DiscardedTile: discardedTile,
		DiscarderName: playerName,
		Actions:       make(map[string][]string),
	}

	hasActions := false
	nextPlayer := g.TurnOrder[(g.CurrentTurnIdx+1)%len(g.TurnOrder)]

	for _, pName := range g.TurnOrder {
		if pName == playerName { continue }
		
		count := 0
		for _, t := range g.Players[pName].Hand {
			if t.Suit == discardedTile.Suit && t.Value == discardedTile.Value {
				count++
			}
		}
		var actions []string
		if count >= 2 { actions = append(actions, "pung") }
		if count == 3 { actions = append(actions, "kong") }
		
		tempHand := append(g.Players[pName].Hand, discardedTile)
		if IsWinningHand(tempHand) {
			actions = append(actions, "mahjong")
		}

		// Check Chow (only next player)
		if pName == nextPlayer {
			if discardedTile.Suit == SuitBamboo || discardedTile.Suit == SuitCharacter || discardedTile.Suit == SuitDot {
				valInt := int(discardedTile.Value[0] - '0')
				ps := g.Players[pName]
				hasTile := func(v int) bool {
					if v < 1 || v > 9 { return false }
					vStr := string(rune('0' + v))
					for _, t := range ps.Hand {
						if t.Suit == discardedTile.Suit && t.Value == vStr { return true }
					}
					return false
				}
				if (hasTile(valInt-2) && hasTile(valInt-1)) || (hasTile(valInt-1) && hasTile(valInt+1)) || (hasTile(valInt+1) && hasTile(valInt+2)) {
					actions = append(actions, "chow")
				}
			}
		}
		
		if len(actions) > 0 {
			g.Interrupt.Actions[pName] = actions
			hasActions = true
		}
	}

	if !hasActions {
		g.Interrupt.Active = false
		return false
	}
	return true
}

func (g *Game) ExecuteAction(playerName string, action string) bool {
	if !g.Interrupt.Active { return false }
	
	if action == "pung" || action == "kong" {
		required := 2
		if action == "kong" { required = 3 }
		
		ps := g.Players[playerName]
		var newHand []Tile
		var meldTiles []Tile
		removed := 0
		
		for _, t := range ps.Hand {
			if removed < required && t.Suit == g.Interrupt.DiscardedTile.Suit && t.Value == g.Interrupt.DiscardedTile.Value {
				removed++
				meldTiles = append(meldTiles, t)
			} else {
				newHand = append(newHand, t)
			}
		}
		
		ps.Hand = newHand
		meldTiles = append(meldTiles, g.Interrupt.DiscardedTile)
		ps.Melds = append(ps.Melds, meldTiles)
		
		g.CenterDiscards = g.CenterDiscards[:len(g.CenterDiscards)-1]
		discarderPS := g.Players[g.Interrupt.DiscarderName]
		discarderPS.Discards = discarderPS.Discards[:len(discarderPS.Discards)-1]
		
		// Shift turn to punger
		for i, p := range g.TurnOrder {
			if p == playerName {
				g.CurrentTurnIdx = i
				break
			}
		}
		g.Interrupt.Active = false
		return true
	}
	
	if action == "chow" {
		nextPlayer := g.TurnOrder[(g.CurrentTurnIdx+1)%len(g.TurnOrder)]
		if playerName != nextPlayer { return false }
		
		valInt := int(g.Interrupt.DiscardedTile.Value[0] - '0')
		suit := g.Interrupt.DiscardedTile.Suit
		ps := g.Players[playerName]
		
		hasTile := func(v int) bool {
			if v < 1 || v > 9 { return false }
			vStr := string(rune('0' + v))
			for _, t := range ps.Hand {
				if t.Suit == suit && t.Value == vStr { return true }
			}
			return false
		}
		
		v1, v2 := -1, -1
		if hasTile(valInt-2) && hasTile(valInt-1) {
			v1, v2 = valInt-2, valInt-1
		} else if hasTile(valInt-1) && hasTile(valInt+1) {
			v1, v2 = valInt-1, valInt+1
		} else if hasTile(valInt+1) && hasTile(valInt+2) {
			v1, v2 = valInt+1, valInt+2
		}
		
		if v1 != -1 {
			var newHand []Tile
			var meldTiles []Tile
			found1, found2 := false, false
			
			for _, t := range ps.Hand {
				if !found1 && t.Suit == suit && t.Value == string(rune('0'+v1)) {
					found1 = true
					meldTiles = append(meldTiles, t)
				} else if !found2 && t.Suit == suit && t.Value == string(rune('0'+v2)) {
					found2 = true
					meldTiles = append(meldTiles, t)
				} else {
					newHand = append(newHand, t)
				}
			}
			
			ps.Hand = newHand
			meldTiles = append(meldTiles, g.Interrupt.DiscardedTile)
			ps.Melds = append(ps.Melds, meldTiles)
			
			g.CenterDiscards = g.CenterDiscards[:len(g.CenterDiscards)-1]
			discarderPS := g.Players[g.Interrupt.DiscarderName]
			discarderPS.Discards = discarderPS.Discards[:len(discarderPS.Discards)-1]
			
			for i, p := range g.TurnOrder {
				if p == playerName {
					g.CurrentTurnIdx = i
					break
				}
			}
			g.Interrupt.Active = false
			return true
		}
	}
	return false
}

func IsWinningHand(hand []Tile) bool {
	if len(hand)%3 != 2 {
		return false
	}

	sortedHand := make([]Tile, len(hand))
	copy(sortedHand, hand)
	sort.Slice(sortedHand, func(i, j int) bool {
		if sortedHand[i].Suit == sortedHand[j].Suit {
			return sortedHand[i].Value < sortedHand[j].Value
		}
		return sortedHand[i].Suit < sortedHand[j].Suit
	})

	for i := 0; i < len(sortedHand)-1; i++ {
		if sortedHand[i].Suit == sortedHand[i+1].Suit && sortedHand[i].Value == sortedHand[i+1].Value {
			remaining := make([]Tile, 0, len(sortedHand)-2)
			remaining = append(remaining, sortedHand[:i]...)
			remaining = append(remaining, sortedHand[i+2:]...)

			if checkMelds(remaining) {
				return true
			}

			for i < len(sortedHand)-1 && sortedHand[i].Suit == sortedHand[i+1].Suit && sortedHand[i].Value == sortedHand[i+1].Value {
				i++
			}
		}
	}
	return false
}

func CalculateScore(hand []Tile, melds [][]Tile) (int, int) {
	allTiles := append([]Tile{}, hand...)
	for _, m := range melds {
		allTiles = append(allTiles, m...)
	}

	suits := make(map[string]bool)
	hasHonor := false
	hasTerminalOrHonor := false

	for _, t := range allTiles {
		if t.Suit == SuitWind || t.Suit == SuitDragon {
			hasHonor = true
			hasTerminalOrHonor = true
		} else {
			suits[string(t.Suit)] = true
			if t.Value == "1" || t.Value == "9" {
				hasTerminalOrHonor = true
			}
		}
	}

	fan := 0
	if len(suits) == 1 && hasHonor {
		fan += 3
	} else if len(suits) == 1 && !hasHonor {
		fan += 6
	} else if len(suits) == 0 && hasHonor {
		fan += 10
	}

	isAllPung := true
	for _, m := range melds {
		if len(m) < 3 {
			isAllPung = false
		} else if m[0].Value != m[1].Value {
			isAllPung = false
		}
	}

	counts := make(map[string]int)
	for _, t := range hand {
		counts[string(t.Suit)+t.Value]++
	}
	pairs := 0
	for _, c := range counts {
		if c == 2 {
			pairs++
		} else if c != 3 && c != 4 {
			isAllPung = false
		}
	}

	if isAllPung && pairs == 1 {
		fan += 3
	}

	if !hasTerminalOrHonor {
		fan += 1
	}

	if fan == 0 {
		fan = 1
	}

	points := 10
	switch fan {
	case 1: points = 10
	case 2: points = 20
	case 3: points = 40
	case 4: points = 80
	case 5: points = 120
	case 6: points = 160
	default:
		if fan >= 7 { points = 320 }
	}

	return fan, points
}

func checkMelds(tiles []Tile) bool {
	if len(tiles) == 0 {
		return true
	}

	first := tiles[0]

	// Try Pung
	if len(tiles) >= 3 && tiles[1].Suit == first.Suit && tiles[1].Value == first.Value && tiles[2].Suit == first.Suit && tiles[2].Value == first.Value {
		remaining := make([]Tile, len(tiles)-3)
		copy(remaining, tiles[3:])
		if checkMelds(remaining) {
			return true
		}
	}

	// Try Chow
	if first.Suit == SuitBamboo || first.Suit == SuitCharacter || first.Suit == SuitDot {
		valInt := int(first.Value[0] - '0')
		idx1, idx2 := -1, -1
		
		for i := 1; i < len(tiles); i++ {
			if idx1 == -1 && tiles[i].Suit == first.Suit && int(tiles[i].Value[0]-'0') == valInt+1 {
				idx1 = i
			}
			if idx2 == -1 && tiles[i].Suit == first.Suit && int(tiles[i].Value[0]-'0') == valInt+2 {
				idx2 = i
			}
		}

		if idx1 != -1 && idx2 != -1 {
			remaining := make([]Tile, 0, len(tiles)-3)
			for i, t := range tiles {
				if i != 0 && i != idx1 && i != idx2 {
					remaining = append(remaining, t)
				}
			}
			if checkMelds(remaining) {
				return true
			}
		}
	}

	return false
}

func (g *Game) CancelInterrupt() {
	g.Interrupt.Active = false
}

// NextTurn advances the turn index and draws a tile for the next player
func (g *Game) NextTurn() string {
	g.CurrentTurnIdx = (g.CurrentTurnIdx + 1) % len(g.TurnOrder)
	nextPlayer := g.TurnOrder[g.CurrentTurnIdx]

	// Draw 1 tile from the wall
	if len(g.Wall) > 0 {
		tile := g.Wall[0]
		g.Wall = g.Wall[1:]
		g.Players[nextPlayer].Hand = append(g.Players[nextPlayer].Hand, tile)
	}

	return nextPlayer
}

// RecordSnapshot captures the full public and private state for replay logs
func (g *Game) RecordSnapshot() {
	snap := ReplaySnapshot{
		CurrentTurn:    g.TurnOrder[g.CurrentTurnIdx],
		CenterDiscards: make([]Tile, len(g.CenterDiscards)),
		Players:        make(map[string]PlayerSnapshot),
	}
	copy(snap.CenterDiscards, g.CenterDiscards)
	
	for name, ps := range g.Players {
		psnap := PlayerSnapshot{
			Hand:      make([]Tile, len(ps.Hand)),
			Discards:  make([]Tile, len(ps.Discards)),
			Melds:     make([][]Tile, len(ps.Melds)),
			Algorithm: ps.Algorithm,
			ActionLog: ps.ActionLog,
		}
		copy(psnap.Hand, ps.Hand)
		copy(psnap.Discards, ps.Discards)
		for i, m := range ps.Melds {
			psnap.Melds[i] = make([]Tile, len(m))
			copy(psnap.Melds[i], m)
		}
		snap.Players[name] = psnap
	}
	g.History = append(g.History, snap)
}
