package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
	"github.com/haguro/elevenlabs-go"
)
type Response struct {
	Model              string    `json:"model"`
	CreatedAt          time.Time `json:"created_at"`
	Message            Message   `json:"message"`
	Done               bool      `json:"done"`
	TotalDuration      int64     `json:"total_duration"`
	LoadDuration       int       `json:"load_duration"`
	PromptEvalCount    int       `json:"prompt_eval_count"`
	PromptEvalDuration int       `json:"prompt_eval_duration"`
	EvalCount          int       `json:"eval_count"`
	EvalDuration       int64     `json:"eval_duration"`
   }

type Request struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Stream   bool      `json:"stream"`
   }
   
type Message struct {
Role    string `json:"role"`
Content string `json:"content"`
}

func talkToOllama(url string, ollamaReq Request) (*Response, error) {
	js, err := json.Marshal(&ollamaReq)
	if err != nil {
	 return nil, err
	}
	client := http.Client{}
	httpReq, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(js))
	if err != nil {
	 return nil, err
	}
	httpResp, err := client.Do(httpReq)
	if err != nil {
	 return nil, err
	}
	defer httpResp.Body.Close()
	ollamaResp := Response{}
	err = json.NewDecoder(httpResp.Body).Decode(&ollamaResp)
	return &ollamaResp, err
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func main() {
	const defaultOllamaURL = "http://localhost:11434/api/chat"
	ELEVENLABS_API_KEY := os.Args[2]
	VOICE_ID := "24JGmqE2AvYy6abpAy3g"
	log.Println("key: " + ELEVENLABS_API_KEY)
	var hasError bool
	var errMu sync.Mutex

	length, err := strconv.Atoi(os.Args[1])
	if err != nil {
		log.Println("Invalid length argument:", err)
		hasError = true
		os.Exit(1)
	}

	items := os.Args[3 : 3+length]
	log.Println("Items:", items)

	var wg sync.WaitGroup

	for j := 0; j < len(items); j++ {
		item := items[j] 
		if fileExists("./audioFiles/" + item + ".mp3") {
			continue
		}
		wg.Add(1)
		go func(i string) {
			defer wg.Done()

			str := "You're an auctioneer. Present the following item in no more than 10 words with starting bid of the number contained at the end of this prompt in dollars: " + i 
			msg := Message{Role: "user", Content: str}
			req := Request{Model: "llama3:latest", Stream: false, Messages: []Message{msg}}

			resp, err := talkToOllama(defaultOllamaURL, req)
			if err != nil || resp == nil {
				log.Println("💥 talkToOllama failed for:", i, "| error:", err)
				errMu.Lock()
				hasError = true
				errMu.Unlock()
				return
			}

			line := resp.Message.Content
			// log.Println(resp.Message.Content)
			log.Println(line)

			client := elevenlabs.NewClient(context.Background(), ELEVENLABS_API_KEY, 30*time.Second)

			ttsReq := elevenlabs.TextToSpeechRequest{
				Text:    line,
				ModelID: "eleven_turbo_v2_5",
				VoiceSettings: &elevenlabs.VoiceSettings{
					SimilarityBoost: 0.5,
					Stability:       0.5,
					Style:           0.0,
					SpeakerBoost:    true,
				},
			}

			audio, err := client.TextToSpeech(VOICE_ID, ttsReq)
			if err != nil {
				log.Println("TextToSpeech failed for:", item, "| error:", err)
				errMu.Lock()
				hasError = true
				errMu.Unlock()
				return
			}

			if err := os.MkdirAll("audioFiles", os.ModePerm); err != nil {
				log.Println("💥 Failed to create audioFiles directory:", err)
				errMu.Lock()
				hasError = true
				errMu.Unlock()
				return
			}

			au := "./audioFiles/" + item + ".mp3"
			if err := os.WriteFile(au, audio, 0644); err != nil {
				log.Println("Failed to write file for:", item, "| error:", err)
				errMu.Lock()
				hasError = true
				errMu.Unlock()
				return
			}
		}(item)
	}

	wg.Wait()

	
	if hasError {
		log.Println("Exiting with error due to hasError = true")
		os.Exit(1)
	} else {
		log.Println("Successfully generated audio files")
		os.Exit(0)
	}
}