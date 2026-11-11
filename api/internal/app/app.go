// Package app is the composition root: it connects the database, applies migrations and wires
// the repositories, buses, subscribers and HTTP server. cmd/api and the integration tests use it.
package app

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/application/auth"
	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/application/inquiries"
	"github.com/syabanf/artha-samoedra/api/internal/application/listings"
	"github.com/syabanf/artha-samoedra/api/internal/application/records"
	"github.com/syabanf/artha-samoedra/api/internal/config"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/postgres"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/security"
	"github.com/syabanf/artha-samoedra/api/internal/interfaces/httpapi"
	"github.com/syabanf/artha-samoedra/api/migrations"
)

// SessionTTL is how long a login token stays valid.
const SessionTTL = 12 * time.Hour

type App struct {
	Pool     *pgxpool.Pool
	Commands *cqrs.Bus
	Queries  *cqrs.Bus
	Server   *httpapi.Server
}

// Build connects and migrates the database and wires everything. Close the pool when done.
func Build(ctx context.Context, cfg config.Config, log *slog.Logger) (*App, error) {
	pool, err := postgres.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	applied, err := postgres.Migrate(ctx, pool, migrations.FS)
	if err != nil {
		pool.Close()
		return nil, err
	}
	if len(applied) > 0 {
		log.Info("migrations applied", "names", applied)
	}

	clock := shared.SystemClock{}
	reader := postgres.NewReader(pool)
	subs := cqrs.NewSubscribers()
	commands := cqrs.NewBus(
		cqrs.Authorize,
		cqrs.Transactional(postgres.TxManager{Pool: pool}),
		cqrs.Audit(postgres.NewAuditLog(pool), clock),
		cqrs.Events(subs, postgres.NewOutbox(pool)),
	)
	queries := cqrs.NewBus(cqrs.Authorize)

	listings.Register(commands, subs, listings.Handlers{
		Listings: postgres.NewListings(pool), Shares: postgres.NewShares(pool), Exclusives: postgres.NewExclusives(pool),
		Portals: postgres.NewPortals(pool), Directory: reader, Clock: clock,
	})
	inquiries.Register(commands, inquiries.Handlers{Inquiries: postgres.NewInquiries(pool), Directory: reader, Clock: clock})
	records.Register(queries, reader)

	authn := auth.Service{
		Directory: postgres.NewUsers(pool),
		Tokens:    security.JWT{Secret: []byte(cfg.JWTSecret), TTL: SessionTTL, Now: time.Now},
		Passwords: security.Bcrypt{},
	}
	server := httpapi.New(commands, queries, authn, log, cfg.CORSOrigin)
	return &App{Pool: pool, Commands: commands, Queries: queries, Server: server}, nil
}
