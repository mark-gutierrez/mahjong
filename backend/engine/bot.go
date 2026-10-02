package engine

// GetBestDiscard evaluates a hand and returns the TileID that is mathematically best to discard.
// It relies on both the isolated state of the hand and the global discard pool (card counting).
func GetBestDiscard(hand []Tile, discards []Tile) int {
	if len(hand) == 0 {
		return -1
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

	return bestTileID
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
func CalculateShanten(hand []Tile) int {
	score := 8
	counts := make(map[string]int)
	for _, t := range hand {
		counts[string(t.Suit)+t.Value]++
	}
	for _, count := range counts {
		if count >= 3 { score -= 2 } else if count == 2 { score -= 1 }
	}
	return score
}

// GetBestDiscardShanten uses a distance-to-win approach
func GetBestDiscardShanten(hand []Tile) int {
	if len(hand) == 0 { return -1 }
	bestTileID := hand[0].ID
	bestShanten := 999
	for i, t := range hand {
		tempHand := append([]Tile{}, hand[:i]...)
		tempHand = append(tempHand, hand[i+1:]...)
		shanten := CalculateShanten(tempHand)
		if shanten < bestShanten {
			bestShanten = shanten
			bestTileID = t.ID
		}
	}
	return bestTileID
}

// GetBestDiscardBetaori strictly discards tiles that opponents have already discarded
func GetBestDiscardBetaori(hand []Tile, opponents []*PlayerState) int {
	if len(hand) == 0 { return -1 }
	safeTiles := make(map[string]bool)
	for _, opp := range opponents {
		for _, t := range opp.Discards {
			safeTiles[string(t.Suit)+t.Value] = true
		}
	}
	// Try to discard a perfectly safe tile
	for _, t := range hand {
		if safeTiles[string(t.Suit)+t.Value] {
			return t.ID
		}
	}
	// Fallback to honors, which are statistically safer
	for _, t := range hand {
		if t.Suit == SuitWind || t.Suit == SuitDragon { return t.ID }
	}
	// Panic fallback: random
	return hand[0].ID
}

// RunBotAlgorithm routes the decision to the assigned algorithm
func RunBotAlgorithm(algName string, hand []Tile, visibleTiles []Tile, opponents []*PlayerState) int {
	switch algName {
	case "Shanten":
		return GetBestDiscardShanten(hand)
	case "Betaori":
		return GetBestDiscardBetaori(hand, opponents)
	case "Push/Fold":
		highestThreat := 0
		for _, opp := range opponents {
			if len(opp.Melds) > highestThreat { highestThreat = len(opp.Melds) }
		}
		if highestThreat >= 2 && CalculateShanten(hand) > 2 {
			return GetBestDiscardBetaori(hand, opponents)
		}
		return GetBestDiscardShanten(hand)
	default: // "Heuristic" or empty (Human timeout fallback)
		return GetBestDiscard(hand, visibleTiles)
	}
}
