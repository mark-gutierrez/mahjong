package engine

// GetBestDiscard evaluates a hand and returns the TileID that is mathematically best to discard.
// It relies strictly on the isolated state of the hand, representing a bot playing with hidden knowledge.
func GetBestDiscard(hand []Tile) int {
	if len(hand) == 0 {
		return -1
	}

	bestTileID := hand[0].ID
	lowestScore := 9999

	// Group hand to easily check neighbors
	counts := make(map[string]int)
	for _, t := range hand {
		key := string(t.Suit) + t.Value
		counts[key]++
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

			// Check N-2, N-1, N+1, N+2
			for _, offset := range []int{-2, -1, 1, 2} {
				neighborVal := valInt + offset
				if neighborVal >= 1 && neighborVal <= 9 {
					nKey := string(t.Suit) + string(rune('0'+neighborVal))
					if counts[nKey] > 0 {
						hasNeighbor = true
						break
					}
				}
			}

			if hasNeighbor {
				score += 20 // Proto-sequence
			} else {
				score += 10 // Isolated middle tile is better than isolated honor
			}
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
