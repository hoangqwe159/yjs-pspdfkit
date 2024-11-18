package main

import (
    "encoding/json"
    "log"
    "net/http"
    "os"
    "sync"
    "time"

    "github.com/gorilla/websocket"
)

const (
    wsReadyStateConnecting = iota
    wsReadyStateOpen
    wsReadyStateClosing
    wsReadyStateClosed
    pingTimeout = 30 * time.Second
)

var (
    port   = getEnv("PORT", "4444")
    topics = make(map[string]map[*websocket.Conn]bool)
    mu     sync.Mutex
    upgrader = websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool {
            return true
        },
    }
)

func getEnv(key, fallback string) string {
    if value, exists := os.LookupEnv(key); exists {
        return value
    }
    return fallback
}

func send(conn *websocket.Conn, message interface{}) {
    if conn == nil {
        return
    }
    if conn.WriteJSON(message) != nil {
        conn.Close()
    }
}

func onConnection(conn *websocket.Conn) {
    defer conn.Close()
    subscribedTopics := make(map[string]bool)
    pongReceived := true
    closed := false

    pingTicker := time.NewTicker(pingTimeout)
    defer pingTicker.Stop()

    go func() {
        for range pingTicker.C {
            if !pongReceived {
                conn.Close()
                return
            }
            pongReceived = false
            if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                conn.Close()
                return
            }
        }
    }()

    conn.SetPongHandler(func(appData string) error {
        pongReceived = true
        return nil
    })

    for {
        _, message, err := conn.ReadMessage()
        if err != nil {
            break
        }

        var msg map[string]interface{}
        if err := json.Unmarshal(message, &msg); err != nil {
            continue
        }

        if msgType, ok := msg["type"].(string); ok && !closed {
            switch msgType {
            case "subscribe":
                if topicsList, ok := msg["topics"].([]interface{}); ok {
                    for _, topic := range topicsList {
                        if topicName, ok := topic.(string); ok {
                            mu.Lock()
                            if topics[topicName] == nil {
                                topics[topicName] = make(map[*websocket.Conn]bool)
                            }
                            topics[topicName][conn] = true
                            subscribedTopics[topicName] = true
                            mu.Unlock()
                        }
                    }
                }
            case "unsubscribe":
                if topicsList, ok := msg["topics"].([]interface{}); ok {
                    for _, topic := range topicsList {
                        if topicName, ok := topic.(string); ok {
                            mu.Lock()
                            if subs, ok := topics[topicName]; ok {
                                delete(subs, conn)
                                if len(subs) == 0 {
                                    delete(topics, topicName)
                                }
                            }
                            delete(subscribedTopics, topicName)
                            mu.Unlock()
                        }
                    }
                }
            case "publish":
                if topicName, ok := msg["topic"].(string); ok {
                    mu.Lock()
                    if receivers, ok := topics[topicName]; ok {
                        msg["clients"] = len(receivers)
                        for receiver := range receivers {
                            send(receiver, msg)
                        }
                    }
                    mu.Unlock()
                }
            case "ping":
                send(conn, map[string]string{"type": "pong"})
            }
        }
    }

    mu.Lock()
    for topicName := range subscribedTopics {
        if subs, ok := topics[topicName]; ok {
            delete(subs, conn)
            if len(subs) == 0 {
                delete(topics, topicName)
            }
        }
    }
    mu.Unlock()
}

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("okay"))
    })

    http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
        conn, err := upgrader.Upgrade(w, r, nil)
        if err != nil {
            log.Println("Upgrade error:", err)
            return
        }
        onConnection(conn)
    })

    log.Println("Signaling server running on localhost:", port)
    if err := http.ListenAndServe(":"+port, nil); err != nil {
        log.Fatal("ListenAndServe:", err)
    }
}