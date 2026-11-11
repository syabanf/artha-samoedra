package app

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/config"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/postgres"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/security"
	"github.com/syabanf/artha-samoedra/api/seed"
)

// These tests run against the docker Postgres and reload the seed, so they own the database
// while they run. They skip when DATABASE_URL is unset.

const password = "artha-demo"

type client struct {
	t   *testing.T
	url string
}

func (c client) do(method, path, token string, body any) (int, map[string]any) {
	c.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.url+path, r)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var out map[string]any
	_ = json.NewDecoder(res.Body).Decode(&out)
	return res.StatusCode, out
}

func (c client) login(email string) string {
	c.t.Helper()
	status, out := c.do("POST", "/api/v1/auth/login", "", map[string]string{"email": email, "password": password})
	if status != http.StatusOK {
		c.t.Fatalf("login %s: %d %v", email, status, out)
	}
	return out["token"].(string)
}

func start(t *testing.T) (client, *App) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		t.Skip("DATABASE_URL is not set")
	}
	ctx := context.Background()
	a, err := Build(ctx, config.Config{DatabaseURL: url, JWTSecret: "integration-secret", CORSOrigin: "http://localhost:5180"}, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(a.Pool.Close)
	hash, err := security.Hash(password)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := postgres.Seed(ctx, a.Pool, seed.JSON, hash, true); err != nil {
		t.Fatal(err)
	}
	srv := httptest.NewServer(a.Server.Handler())
	t.Cleanup(srv.Close)
	return client{t: t, url: srv.URL}, a
}

func TestIntegration(t *testing.T) {
	c, a := start(t)
	ctx := context.Background()
	admin := c.login("ayu@arthasamoedra.id")

	t.Run("me returns the role and permissions", func(t *testing.T) {
		status, out := c.do("GET", "/api/v1/me", admin, nil)
		if status != 200 || out["role"].(map[string]any)["id"] != "rol-admin" || len(out["permissions"].([]any)) == 0 {
			t.Fatalf("%d %v", status, out)
		}
	})

	t.Run("wrong password is 401", func(t *testing.T) {
		status, out := c.do("POST", "/api/v1/auth/login", "", map[string]string{"email": "ayu@arthasamoedra.id", "password": "nope"})
		if status != 401 || out["error"].(map[string]any)["code"] != "unauthenticated" {
			t.Fatalf("%d %v", status, out)
		}
	})

	t.Run("sales agent gets 403 on approve", func(t *testing.T) {
		dimas := c.login("dimas@arthasamoedra.id")
		status, out := c.do("POST", "/api/v1/commands/listings.approve", dimas, map[string]string{"id": "lst-13"})
		if status != 403 {
			t.Fatalf("%d %v", status, out)
		}
	})

	t.Run("admin approves lst-13 and the share and event follow", func(t *testing.T) {
		status, out := c.do("POST", "/api/v1/commands/listings.approve", admin, map[string]string{"id": "lst-13"})
		if status != 200 || out["status"] != "active" {
			t.Fatalf("%d %v", status, out)
		}
		status, page := c.do("GET", "/api/v1/records/profitShares?listingId=lst-13", admin, nil)
		if status != 200 || page["total"].(float64) != 1 {
			t.Fatalf("profit share: %d %v", status, page)
		}
		share := page["items"].([]any)[0].(map[string]any)
		if share["commissionPct"].(float64) != 2.5 || len(share["parties"].([]any)) != 2 {
			t.Fatalf("share %v", share)
		}
		var n int
		if err := a.Pool.QueryRow(ctx, `SELECT count(*) FROM events WHERE name = 'listing.approved' AND aggregate_id = 'lst-13'`).Scan(&n); err != nil || n != 1 {
			t.Fatalf("outbox rows %d, err %v", n, err)
		}
		// Approving again is refused by the rule, and both attempts are audited.
		status, out = c.do("POST", "/api/v1/commands/listings.approve", admin, map[string]string{"id": "lst-13"})
		if status != 422 || out["error"].(map[string]any)["message"] != "This listing has already been reviewed." {
			t.Fatalf("second approve: %d %v", status, out)
		}
		if err := a.Pool.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE command = 'listings.approve' AND actor_id = 'usr-1'`).Scan(&n); err != nil || n != 2 {
			t.Fatalf("audit rows %d, err %v", n, err)
		}
	})

	t.Run("delist ends exclusives and removes portal copies", func(t *testing.T) {
		status, out := c.do("POST", "/api/v1/commands/listings.delist", admin, map[string]string{"id": "lst-1", "reason": "Owner withdrew"})
		if status != 200 {
			t.Fatalf("%d %v", status, out)
		}
		var running, live int
		_ = a.Pool.QueryRow(ctx, `SELECT count(*) FROM records WHERE collection = 'exclusives' AND data ->> 'listingId' = 'lst-1' AND data -> 'endedAt' = 'null'`).Scan(&running)
		_ = a.Pool.QueryRow(ctx, `SELECT count(*) FROM records WHERE collection = 'portalSyncs' AND data ->> 'listingId' = 'lst-1' AND data ->> 'status' <> 'removed'`).Scan(&live)
		if running != 0 || live != 0 {
			t.Fatalf("running exclusives %d, live portal copies %d", running, live)
		}
		// Fields the domain does not model survive the save.
		_, rec := c.do("GET", "/api/v1/records/exclusives/exc-1", admin, nil)
		if rec["contractNo"] != "EXC/001/AS/2026" || rec["status"] != "ended" {
			t.Fatalf("exclusive %v", rec)
		}
	})

	t.Run("public inquiry without a token", func(t *testing.T) {
		status, out := c.do("POST", "/api/v1/commands/inquiries.submit", "", map[string]any{
			"name": "Sari Wulandari", "phone": "0812 7777 8888", "listingId": "lst-2", "message": "Is the price negotiable?",
		})
		if status != 200 || out["code"] != "INQ-26-0113" || out["status"] != "new" {
			t.Fatalf("%d %v", status, out)
		}
		status, out = c.do("POST", "/api/v1/commands/inquiries.submit", "", map[string]any{"name": "S", "phone": "0812"})
		if status != 422 {
			t.Fatalf("bad lead: %d %v", status, out)
		}
	})

	t.Run("reads respect permissions", func(t *testing.T) {
		if status, _ := c.do("GET", "/api/v1/records/listings", "", nil); status != 401 {
			t.Fatalf("anonymous listings: %d", status)
		}
		if status, _ := c.do("GET", "/api/v1/records/credentials", admin, nil); status != 404 {
			t.Fatalf("credentials: %d", status)
		}
		status, page := c.do("GET", "/api/v1/records/listings?status=active&sort=-price&limit=3", admin, nil)
		items := page["items"].([]any)
		if status != 200 || len(items) != 3 || items[0].(map[string]any)["price"].(float64) < items[1].(map[string]any)["price"].(float64) {
			t.Fatalf("%d %v", status, page)
		}
		status, pub := c.do("GET", "/api/v1/public/listings", "", nil)
		if status != 200 || pub["total"].(float64) == 0 {
			t.Fatalf("public: %d %v", status, pub)
		}
		status, stats := c.do("POST", "/api/v1/queries/listings.stats", admin, nil)
		if status != 200 || stats["total"].(float64) != 16 {
			t.Fatalf("stats: %d %v", status, stats)
		}
	})
}
