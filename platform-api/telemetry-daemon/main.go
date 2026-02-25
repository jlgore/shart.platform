package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/fsnotify/fsnotify"
)

type Config struct {
	InstanceID     string   `json:"instance_id"`
	InstanceSecret string   `json:"instance_secret"`
	APIURL         string   `json:"api_url"`
	WatchPaths     []string `json:"watch_paths"`
	HeartbeatSecs  int      `json:"heartbeat_secs"`
}

type HoneytokenPayload struct {
	InstanceID     string                 `json:"instance_id"`
	InstanceSecret string                 `json:"instance_secret"`
	TokenName      string                 `json:"token_name"`
	TokenPath      string                 `json:"token_path"`
	Metadata       map[string]interface{} `json:"metadata"`
}

type HeartbeatPayload struct {
	InstanceID     string `json:"instance_id"`
	InstanceSecret string `json:"instance_secret"`
}

var config Config

func loadConfig() error {
	// Load from environment (set via K8s secret)
	config.InstanceID = os.Getenv("INSTANCE_ID")
	config.InstanceSecret = os.Getenv("INSTANCE_SECRET")
	config.APIURL = os.Getenv("API_URL")

	if config.APIURL == "" {
		config.APIURL = "https://platform.shart.cloud/api/ctf/telemetry"
	}

	// Default watch paths (honeytokens)
	config.WatchPaths = []string{
		"/etc/kubernetes/secrets/aws-admin.json",
		"/etc/kubernetes/secrets/azure-sp.json",
		"/var/lib/shart/honeypot-creds.txt",
		"/opt/shart/fake-database.db",
		"/tmp/.secret-backup-key",
	}

	// Override with config file if present
	if configFile := os.Getenv("CONFIG_FILE"); configFile != "" {
		data, err := os.ReadFile(configFile)
		if err == nil {
			json.Unmarshal(data, &config)
		}
	}

	config.HeartbeatSecs = 300 // 5 minutes

	if config.InstanceID == "" || config.InstanceSecret == "" {
		return fmt.Errorf("INSTANCE_ID and INSTANCE_SECRET must be set")
	}

	return nil
}

func reportHoneytoken(tokenPath string) error {
	tokenName := filepath.Base(tokenPath)

	payload := HoneytokenPayload{
		InstanceID:     config.InstanceID,
		InstanceSecret: config.InstanceSecret,
		TokenName:      tokenName,
		TokenPath:      tokenPath,
		Metadata: map[string]interface{}{
			"accessed_at": time.Now().UTC().Format(time.RFC3339),
			"hostname":    getHostname(),
		},
	}

	return sendTelemetry("/honeytoken", payload)
}

func sendHeartbeat() error {
	payload := HeartbeatPayload{
		InstanceID:     config.InstanceID,
		InstanceSecret: config.InstanceSecret,
	}

	return sendTelemetry("/heartbeat", payload)
}

func sendTelemetry(endpoint string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	url := config.APIURL + endpoint
	resp, err := http.Post(url, "application/json", bytes.NewBuffer(data))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("API returned status %d", resp.StatusCode)
	}

	return nil
}

func getHostname() string {
	hostname, err := os.Hostname()
	if err != nil {
		return "unknown"
	}
	return hostname
}

func watchHoneytokens() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Fatalf("Failed to create watcher: %v", err)
	}
	defer watcher.Close()

	// Add all honeytoken paths to watcher
	for _, path := range config.WatchPaths {
		// Create parent directories and empty file if they don't exist
		dir := filepath.Dir(path)
		os.MkdirAll(dir, 0755)

		// Create honeytoken file if it doesn't exist
		if _, err := os.Stat(path); os.IsNotExist(err) {
			os.WriteFile(path, []byte("# HONEYTOKEN - DO NOT ACCESS\n"), 0644)
		}

		// Watch the directory (fsnotify can't watch non-existent files)
		if err := watcher.Add(dir); err != nil {
			log.Printf("Warning: couldn't watch %s: %v", dir, err)
		}
	}

	// Create a set for quick lookup
	honeytokenSet := make(map[string]bool)
	for _, path := range config.WatchPaths {
		honeytokenSet[path] = true
	}

	log.Printf("Watching %d honeytoken paths", len(config.WatchPaths))

	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			// Check if accessed file is a honeytoken
			if honeytokenSet[event.Name] {
				if event.Op&(fsnotify.Read|fsnotify.Open) != 0 {
					log.Printf("HONEYTOKEN TRIPPED: %s", event.Name)
					if err := reportHoneytoken(event.Name); err != nil {
						log.Printf("Failed to report honeytoken: %v", err)
					}
				}
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Watcher error: %v", err)
		}
	}
}

func heartbeatLoop() {
	ticker := time.NewTicker(time.Duration(config.HeartbeatSecs) * time.Second)
	defer ticker.Stop()

	// Send initial heartbeat
	if err := sendHeartbeat(); err != nil {
		log.Printf("Initial heartbeat failed: %v", err)
	}

	for range ticker.C {
		if err := sendHeartbeat(); err != nil {
			log.Printf("Heartbeat failed: %v", err)
		}
	}
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("shart-telemetry daemon starting...")

	if err := loadConfig(); err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	log.Printf("Instance ID: %s", config.InstanceID)
	log.Printf("API URL: %s", config.APIURL)

	// Start heartbeat in background
	go heartbeatLoop()

	// Watch honeytokens (blocks)
	watchHoneytokens()
}
