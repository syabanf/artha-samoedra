// Package seed embeds the demo data exported from the frontend fixtures
// (pnpm --filter @artha/fixtures export:seed), so frontend and API start from the same records.
package seed

import _ "embed"

//go:embed seed.json
var JSON []byte
