package engine

import "fmt"

// GetBestDiscard evaluates a hand and returns the TileID that is mathematically best to discard.
// It relies on both the isolated state of the hand and the global discard pool (card counting).
func GetBestDiscard(hand []Tile, discards []Tile) (int, string) {
	if len(hand) == 0 {
		return -1, "Error: Empty hand"
	}

	bestTileID := hand[0].ID
	lowestScore := 9999

	// Group hand to easily check neighbors
	counts := make(map[string]int)
	for _, t := range hand {
		counts[string(t.Suit)+t.Value]++
	}

	// Count discards for penalty logic
	discardCounts := make(map[string]int)
	for _, t := range discards {
		discardCounts[string(t.Suit)+t.Value]++
	}

	for _, t := range hand {
		score := 0
		key := string(t.Suit) + t.Value

		// Is it a pair or triplet? (Very valuable)
		if counts[key] >= 2 {
			score += 50
		}

		// Is it an Honor or Terminal?
		isHonor := t.Suit == SuitWind || t.Suit == SuitDragon || t.Suit == SuitFlower || t.Suit == SuitSeason
		isTerminal := t.Value == "1" || t.Value == "9"

		if isHonor || isTerminal {
			// If it's isolated (no pair), score is 0. Dead weight.
			if counts[key] == 1 {
				score += 0
			}
		} else {
			// Middle suited tile. Check for adjacent sequence tiles.
			valInt := int(t.Value[0] - '0')
			hasNeighbor := false
			deadNeighbors := 0

			// Check N-2, N-1, N+1, N+2
			for _, offset := range []int{-2, -1, 1, 2} {
				neighborVal := valInt + offset
				if neighborVal >= 1 && neighborVal <= 9 {
					nKey := string(t.Suit) + string(rune('0'+neighborVal))
					if counts[nKey] > 0 {
						hasNeighbor = true
					}
					// Check how many of these sequence builders are already in the discard pile
					if count, ok := discardCounts[nKey]; ok {
						deadNeighbors += count
					}
				}
			}

			if hasNeighbor {
				score += 20 // Proto-sequence
			} else {
				score += 10 // Isolated middle tile is better than isolated honor
			}
			
			// Penalty: If sequence-building cards are dead in the discard pile, this tile is less valuable.
			score -= (deadNeighbors * 3)
		}

		// Penalty: If exact identical cards are dead, it's harder to build a pair.
		if dCount, ok := discardCounts[key]; ok {
			score -= (dCount * 5)
		}

		if score < lowestScore {
			lowestScore = score
			bestTileID = t.ID
		}
	}

	// Re-find the tile to generate the reason
	var bestTile Tile
	for _, t := range hand {
		if t.ID == bestTileID { bestTile = t; break }
	}

	return bestTileID, fmt.Sprintf("Card Counting: Discarded [%s %s] because it had the lowest utility score based on visible table discards.", bestTile.Value, string(bestTile.Suit))
}

// GetBestSteal evaluates if a bot should take an interrupt action
func GetBestSteal(hand []Tile, actions []string) string {
	for _, a := range actions {
		if a == "mahjong" {
			return "mahjong"
		}
	}
	for _, a := range actions {
		if a == "pung" || a == "kong" {
			return a // Always take pungs/kongs to accelerate hand
		}
	}
	for _, a := range actions {
		if a == "chow" {
			return a // Always take chow to accelerate hand
		}
	}
	return "skip"
}

// CalculateShanten is a simplified heuristic proxy for true Shanten
func CalculateShanten(hand []Tile, melds [][]Tile) int {
	score := 8
	score -= len(melds) * 2

	counts := make(map[string]int)
	suitVals := make(map[string][]int)

	for _, t := range hand {
		counts[string(t.Suit)+t.Value]++
		if t.Suit != SuitWind && t.Suit != SuitDragon && t.Suit != SuitSeason && t.Suit != SuitFlower {
			val := int(t.Value[0] - '0')
			// avoid duplicates for sequence checking simply by ignoring if already in slice
			found := false
			for _, v := range suitVals[string(t.Suit)] {
				if v == val { found = true; break }
			}
			if !found { suitVals[string(t.Suit)] = append(suitVals[string(t.Suit)], val) }
		}
	}
	for _, count := range counts {
		if count >= 3 { score -= 2 } else if count == 2 { score -= 1 }
	}
	
	// Deduct for proto-sequences
	for _, vals := range suitVals {
		seqFound := 0
		// sort vals manually
		for i := 0; i < len(vals); i++ {
			for j := i+1; j < len(vals); j++ {
				if vals[i] > vals[j] { vals[i], vals[j] = vals[j], vals[i] }
			}
		}
		for i := 0; i < len(vals)-1; i++ {
			if vals[i+1]-vals[i] == 1 || vals[i+1]-vals[i] == 2 {
				seqFound++
				i++ // skip next to avoid double count loosely
			}
		}
		score -= seqFound
	}
	
	if score < 0 { score = 0 }
	return score
}

// GetBestDiscardShanten uses a distance-to-win approach
func GetBestDiscardShanten(hand []Tile, melds [][]Tile) (int, string) {
	if len(hand) == 0 { return -1, "Error: Empty hand" }
	bestTileID := hand[0].ID
	bestShanten := 999
	for i, t := range hand {
		tempHand := append([]Tile{}, hand[:i]...)
		tempHand = append(tempHand, hand[i+1:]...)
		shanten := CalculateShanten(tempHand, melds)
		if shanten < bestShanten {
			bestShanten = shanten
			bestTileID = t.ID
		}
	}
	
	var bestTile Tile
	for _, t := range hand {
		if t.ID == bestTileID { bestTile = t; break }
	}
	
	return bestTileID, fmt.Sprintf("Shanten: Discarded [%s %s] because it minimizes our Distance-to-Win (Current Dist: %d).", bestTile.Value, string(bestTile.Suit), bestShanten)
}

// GetBestDiscardBetaori strictly discards tiles that opponents have already discarded
func GetBestDiscardBetaori(hand []Tile, opponents []*PlayerState) (int, string) {
	if len(hand) == 0 { return -1, "Error: Empty hand" }
	safeTiles := make(map[string]bool)
	for _, opp := range opponents {
		for _, t := range opp.Discards {
			safeTiles[string(t.Suit)+t.Value] = true
		}
	}
	// Try to discard a perfectly safe tile
	for _, t := range hand {
		if safeTiles[string(t.Suit)+t.Value] {
			return t.ID, fmt.Sprintf("Betaori: Discarded perfectly safe [%s %s] that was previously thrown by an opponent.", t.Value, string(t.Suit))
		}
	}
	// Fallback to honors, which are statistically safer
	for _, t := range hand {
		if t.Suit == SuitWind || t.Suit == SuitDragon { 
			return t.ID, fmt.Sprintf("Betaori: Discarded Honor [%s %s] as a statistical fallback.", t.Value, string(t.Suit)) 
		}
	}
	// Panic fallback: random
	return hand[0].ID, fmt.Sprintf("Betaori: Panic fold! Discarded [%s %s] because no safe tiles or honors were found.", hand[0].Value, string(hand[0].Suit))
}

// RunBotAlgorithm routes the decision to the assigned algorithm
func RunBotAlgorithm(algName string, bot *PlayerState, visibleTiles []Tile, opponents []*PlayerState) (int, string) {
	switch algName {
	case "Shanten":
		return GetBestDiscardShanten(bot.Hand, bot.Melds)
	case "Betaori":
		return GetBestDiscardBetaori(bot.Hand, opponents)
	case "Push/Fold":
		highestThreat := 0
		for _, opp := range opponents {
			if len(opp.Melds) > highestThreat { highestThreat = len(opp.Melds) }
		}
		if highestThreat >= 2 && CalculateShanten(bot.Hand, bot.Melds) > 2 {
			id, reason := GetBestDiscardBetaori(bot.Hand, opponents)
			return id, fmt.Sprintf("Push/Fold (High Threat): %s", reason)
		}
		id, reason := GetBestDiscardShanten(bot.Hand, bot.Melds)
		return id, fmt.Sprintf("Push/Fold (Low Threat): %s", reason)
	default: // "Card Counting" or empty (Human timeout fallback)
		return GetBestDiscard(bot.Hand, visibleTiles)
	}
}
