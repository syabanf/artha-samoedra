# Variables from .env reach every recipe without being printed.
-include .env
export

.PHONY: up down seed reseed run test test-unit lint

up: ## start Postgres and wait until it answers
	docker compose up -d --wait

down: ## stop Postgres (the data volume stays)
	docker compose down

seed: ## apply migrations and load the demo data if the database is empty
	go run ./cmd/seed

reseed: ## empty the tables and load the demo data again
	go run ./cmd/seed --reset

run: ## serve the API on $(PORT)
	go run ./cmd/api

test: ## unit tests, plus integration tests when DATABASE_URL is set
	go test ./...

test-unit: ## unit tests only
	DATABASE_URL= go test ./...

lint: ## gofmt and go vet
	@unformatted="$$(gofmt -l .)"; if [ -n "$$unformatted" ]; then echo "$$unformatted"; exit 1; fi
	go vet ./...
