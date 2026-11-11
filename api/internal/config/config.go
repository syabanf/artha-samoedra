// Package config reads settings from the environment, after loading a local .env file
// for variables the environment does not set yet.
package config

import (
	"bufio"
	"errors"
	"os"
	"strings"
)

type Config struct {
	DatabaseURL  string
	Port         string
	JWTSecret    string
	DemoPassword string
	CORSOrigin   string
}

// DevJWTSecret is used when JWT_SECRET is empty, so a fresh checkout runs. Never in production.
const DevJWTSecret = "dev-only-secret-change-me"

// Load reads the environment, then .env (local secrets, git-ignored), then .env.production
// (committed defaults the server build uses). A variable set earlier always wins.
// It fails without DATABASE_URL.
func Load() (Config, error) {
	loadDotEnv(".env")
	loadDotEnv(".env.production")
	c := Config{
		DatabaseURL:  os.Getenv("DATABASE_URL"),
		Port:         env("PORT", "8080"),
		JWTSecret:    env("JWT_SECRET", DevJWTSecret),
		DemoPassword: env("DEMO_PASSWORD", "artha-demo"),
		CORSOrigin:   env("CORS_ORIGIN", "http://localhost:5180"),
	}
	if c.DatabaseURL == "" {
		return c, errors.New("set DATABASE_URL, e.g. postgres://artha:artha@localhost:5433/artha?sslmode=disable")
	}
	return c, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// loadDotEnv sets KEY=value lines from path for keys the environment lacks. It never prints values.
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		k, v, ok := strings.Cut(line, "=")
		if !ok || strings.HasPrefix(line, "#") {
			continue
		}
		k, v = strings.TrimSpace(strings.TrimPrefix(k, "export ")), strings.Trim(strings.TrimSpace(v), `"'`)
		if _, set := os.LookupEnv(k); !set {
			os.Setenv(k, v)
		}
	}
}
