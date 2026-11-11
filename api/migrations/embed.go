// Package migrations embeds the SQL files. The migrator applies every *.sql file once,
// in file-name order, and records it in schema_migrations.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
