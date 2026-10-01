package engine

type Suit string

const (
	SuitBamboo    Suit = "bamboo"
	SuitCharacter Suit = "character"
	SuitDot       Suit = "dot"
	SuitWind      Suit = "wind"
	SuitDragon    Suit = "dragon"
	SuitFlower    Suit = "flower"
	SuitSeason    Suit = "season"
)

type Tile struct {
	ID    int    `json:"id"`
	Suit  Suit   `json:"suit"`
	Value string `json:"value"` // "1"-"9" for suits, "east", "south", "west", "north" for winds, "red", "green", "white" for dragons
}

// GenerateDeck creates the standard 144 tiles for Hong Kong Mahjong
func GenerateDeck() []Tile {
	var deck []Tile
	id := 1

	// Helper to add 4 copies of a tile
	addTiles := func(suit Suit, value string) {
		for i := 0; i < 4; i++ {
			deck = append(deck, Tile{ID: id, Suit: suit, Value: value})
			id++
		}
	}

	// 1-9 Bamboos, Characters, Dots
	suits := []Suit{SuitBamboo, SuitCharacter, SuitDot}
	for _, suit := range suits {
		for val := 1; val <= 9; val++ {
			// Convert integer 1-9 to string "1"-"9"
			addTiles(suit, string(rune('0'+val)))
		}
	}

	// Winds (East, South, West, North)
	winds := []string{"east", "south", "west", "north"}
	for _, w := range winds {
		addTiles(SuitWind, w)
	}

	// Dragons (Red, Green, White)
	dragons := []string{"red", "green", "white"}
	for _, d := range dragons {
		addTiles(SuitDragon, d)
	}

	// Flowers (1 each)
	flowers := []string{"plum", "orchid", "chrysanthemum", "bamboo"}
	for _, f := range flowers {
		deck = append(deck, Tile{ID: id, Suit: SuitFlower, Value: f})
		id++
	}

	// Seasons (1 each)
	seasons := []string{"spring", "summer", "autumn", "winter"}
	for _, s := range seasons {
		deck = append(deck, Tile{ID: id, Suit: SuitSeason, Value: s})
		id++
	}

	return deck
}
