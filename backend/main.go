package main

import (
	"log"
	"net/http"
	"os"

	"mahjong-go/server" // Import our new package

	"golang.org/x/net/websocket"
)

func main() {
	hub := server.NewHub() // Global Room Manager
	// Custom WebSocket Server to allow cross-origin (CORS) from GitHub Pages
	wsServer := websocket.Server{
		Handler: websocket.Handler(func(ws *websocket.Conn) {
			client := &server.Client{
				Hub:  hub,
				Conn: ws,
				Send: make(chan []byte, 256),
			}
			go client.WritePump()
			client.ReadPump() // This blocks until the client disconnects
		}),
		Handshake: func(config *websocket.Config, req *http.Request) error {
			// Accept all origins so GitHub Pages can connect to Render
			return nil
		},
	}

	http.Handle("/ws", wsServer)

	// Health check endpoint for Render to know the app is live
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Mahjong Backend is running!"))
	})

	// Render provides the PORT environment variable automatically
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Fallback for local development
	}

	log.Printf("Server starting on port %s\n", port)
	err := http.ListenAndServe(":"+port, nil)
	if err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
