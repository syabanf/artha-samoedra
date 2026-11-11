// Command seed applies the migrations and loads the frontend's demo data.
// With --reset it empties the tables first; without it, it skips a database that has records.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"

	"github.com/syabanf/artha-samoedra/api/internal/config"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/postgres"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/security"
	"github.com/syabanf/artha-samoedra/api/migrations"
	"github.com/syabanf/artha-samoedra/api/seed"
)

func main() {
	reset := flag.Bool("reset", false, "truncate the tables and load the seed again")
	flag.Parse()
	if err := run(*reset); err != nil {
		slog.Error("seed failed", "err", err)
		os.Exit(1)
	}
}

func run(reset bool) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	ctx := context.Background()
	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	if _, err := postgres.Migrate(ctx, pool, migrations.FS); err != nil {
		return err
	}
	hash, err := security.Hash(cfg.DemoPassword)
	if err != nil {
		return err
	}
	res, err := postgres.Seed(ctx, pool, seed.JSON, hash, reset)
	if err != nil {
		return err
	}
	if res.Skipped {
		fmt.Println("The database already has records; run with --reset to reload the seed.")
		return nil
	}
	fmt.Printf("Loaded %d records in %d collections, %d settings objects and %d user logins.\n",
		res.Records, res.Collections, res.Singletons, res.Users)
	return nil
}
