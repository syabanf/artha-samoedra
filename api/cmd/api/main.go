// Command api serves the Artha Samoedra ERP over HTTP.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/app"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant/pgstore"
	"github.com/syabanf/artha-samoedra/api/internal/config"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/llm/deepseek"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/llm/ollama"
	assistanthttp "github.com/syabanf/artha-samoedra/api/internal/interfaces/httpapi/assistant"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	if err := run(log); err != nil {
		log.Error("api stopped", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if cfg.JWTSecret == config.DevJWTSecret {
		log.Warn("JWT_SECRET is not set; using the development secret")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	a, err := app.Build(ctx, cfg, log)
	if err != nil {
		return err
	}
	defer a.Pool.Close()

	// Jessy, the console assistant. Her tools run on the same buses, so permissions, transactions
	// and the audit log apply to everything she reads or, after a Confirm, changes.
	llm, err := chatModel(log)
	if err != nil {
		return err
	}
	jessy, err := assistant.New(assistant.Config{
		LLM:      llm,
		Queries:  a.Queries,
		Commands: a.Commands,
		Store:    pgstore.New(a.Pool),
		Logger:   log,
	})
	if err != nil {
		return err
	}
	a.Server.Mount("/api/v1/assistant/", http.StripPrefix("/api/v1/assistant", assistanthttp.New(jessy)))

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           a.Server.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errc := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", srv.Addr)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Info("shutting down")
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdown)
}

// chatModel picks Jessy's model provider from LLM_PROVIDER: deepseek (the default) or ollama.
func chatModel(log *slog.Logger) (assistant.LLM, error) {
	switch p := os.Getenv("LLM_PROVIDER"); p {
	case "", "deepseek":
		if os.Getenv("DEEPSEEK_API_KEY") == "" {
			log.Warn("DEEPSEEK_API_KEY is not set; the assistant will answer 502")
		}
		return deepseek.New(deepseek.ConfigFromEnv()), nil
	case "ollama":
		if os.Getenv("OLLAMA_API_KEY") == "" {
			log.Warn("OLLAMA_API_KEY is not set; the assistant will answer 502")
		}
		return ollama.New(ollama.ConfigFromEnv()), nil
	default:
		return nil, fmt.Errorf("LLM_PROVIDER %q is not deepseek or ollama", p)
	}
}
