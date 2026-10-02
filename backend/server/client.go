package server

import (
	"encoding/json"
	"log"

	"golang.org/x/net/websocket"
)

type Client struct {
	Hub      *Hub
	Room     *Room
	Conn     *websocket.Conn
	Send     chan []byte
	Nickname string
}

type IncomingMessage struct {
	Action   string `json:"action"`
	Nickname string `json:"nickname,omitempty"`
	RoomCode string `json:"roomCode,omitempty"`
	TileID   int    `json:"tileId,omitempty"`
	Data     string `json:"data,omitempty"`
}

// ReadPump continuously reads JSON actions from the browser
func (c *Client) ReadPump() {
	defer func() {
		if c.Room != nil {
			c.Room.Unregister <- c
		}
		c.Conn.Close()
	}()

	for {
		var msg []byte
		err := websocket.Message.Receive(c.Conn, &msg)
		if err != nil {
			log.Println("Client read error/disconnected:", err)
			break
		}

		var m IncomingMessage
		if err := json.Unmarshal(msg, &m); err != nil {
			log.Println("Invalid JSON received:", err)
			continue
		}

		c.handleAction(m)
	}
}

// WritePump continuously sends JSON messages to the browser
func (c *Client) WritePump() {
	defer func() {
		c.Conn.Close()
	}()
	for {
		message, ok := <-c.Send
		if !ok {
			websocket.Message.Send(c.Conn, `{"error": "connection closed"}`)
			return
		}
		
		err := websocket.Message.Send(c.Conn, string(message))
		if err != nil {
			log.Println("Client write error:", err)
			return
		}
	}
}

// Routes the action to the correct logic
func (c *Client) handleAction(m IncomingMessage) {
	switch m.Action {
	case "create_room":
		c.Nickname = m.Nickname
		room := c.Hub.CreateRoom()
		c.Room = room
		
		// Send immediate confirmation before registering to room
		response, _ := json.Marshal(map[string]string{
			"type":     "room_created",
			"roomCode": room.ID,
		})
		c.Send <- response
		
		room.Register <- c

	case "join_room":
		c.Nickname = m.Nickname
		room := c.Hub.GetRoom(m.RoomCode)
		if room == nil {
			response, _ := json.Marshal(map[string]string{
				"type":    "error",
				"message": "Room not found",
			})
			c.Send <- response
			return
		}
		c.Room = room
		
		response, _ := json.Marshal(map[string]string{
			"type":     "room_joined",
			"roomCode": room.ID,
		})
		c.Send <- response
		
		room.Register <- c
		
	case "start_game":
		if c.Room != nil {
			c.Room.StartGame <- true
		}
		
	case "discard_tile":
		if c.Room != nil {
			c.Room.GameAction <- GameAction{
				Client: c,
				Action: "discard_tile",
				TileID: m.TileID,
			}
		}
	
	case "execute_steal":
		if c.Room != nil {
			c.Room.GameAction <- GameAction{
				Client: c,
				Action: "execute_steal",
				Data:   m.Data,
			}
		}
	
	case "declare_mahjong":
		if c.Room != nil {
			c.Room.GameAction <- GameAction{
				Client: c,
				Action: "declare_mahjong",
			}
		}
		
	case "execute_bot_alg":
		if c.Room != nil {
			c.Room.GameAction <- GameAction{
				Client: c,
				Action: "execute_bot_alg",
				Data:   m.Data,
			}
		}

	case "skip":
		if c.Room != nil {
			c.Room.GameAction <- GameAction{
				Client: c,
				Action: "skip",
			}
		}
	}
}
