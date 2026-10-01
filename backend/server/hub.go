package server

import (
	"log"
	"math/rand"
	"sync"
	"time"
)

type Hub struct {
	Rooms map[string]*Room
	mu    sync.RWMutex
}

func NewHub() *Hub {
	return &Hub{
		Rooms: make(map[string]*Room),
	}
}

func (h *Hub) CreateRoom() *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Generate a random 6-character alphanumeric room code
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	var seededRand *rand.Rand = rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 6)
	for i := range b {
		b[i] = charset[seededRand.Intn(len(charset))]
	}
	code := string(b)

	room := NewRoom(code, h)
	h.Rooms[code] = room
	go room.Run() // Start the room's event loop
	
	log.Printf("Room created: %s", code)
	return room
}

func (h *Hub) GetRoom(code string) *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.Rooms[code]
}
