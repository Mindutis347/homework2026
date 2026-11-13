// Package migrations bundles the ordered .sql files into the binary so the
// server can apply them on boot without shipping a separate migrator.
package migrations

import "embed"

//go:embed *.sql
var FS embed.FS
