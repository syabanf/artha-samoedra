// Package shared holds what every bounded context speaks: errors, events and the actor.
// It imports nothing outside the standard library.
package shared

import (
	"errors"
	"fmt"
)

var (
	// ErrNotFound means the record does not exist (HTTP 404).
	ErrNotFound = errors.New("not found")
	// ErrUnauthenticated means no valid session (HTTP 401).
	ErrUnauthenticated = errors.New("sign in first")
	// ErrForbidden means the actor's role lacks the permission (HTTP 403).
	ErrForbidden = errors.New("your role cannot do this")
	// ErrConflict means someone else changed the record first (HTTP 409).
	ErrConflict = errors.New("the record changed; reload and try again")
)

// RuleError is a business rule refusing a command. Its message is the sentence the user reads,
// the same text the frontend store shows as a blocker (HTTP 422).
type RuleError struct{ Msg string }

func (e *RuleError) Error() string { return e.Msg }

// Rule refuses with a user-facing sentence.
func Rule(format string, args ...any) error { return &RuleError{Msg: fmt.Sprintf(format, args...)} }

// NotFound wraps ErrNotFound with the thing that was missing.
func NotFound(what string) error { return fmt.Errorf("%s: %w", what, ErrNotFound) }

// denied carries a user-facing message while still matching a sentinel with errors.Is.
type denied struct {
	msg  string
	kind error
}

func (e *denied) Error() string { return e.msg }
func (e *denied) Unwrap() error { return e.kind }

// Unauthenticated refuses with a sentence the user reads, e.g. a wrong password.
func Unauthenticated(msg string) error { return &denied{msg: msg, kind: ErrUnauthenticated} }

// Kind names the class of an error for HTTP status codes and the audit log:
// rule, not_found, unauthenticated, forbidden, conflict or error.
func Kind(err error) string {
	var r *RuleError
	switch {
	case errors.As(err, &r):
		return "rule"
	case errors.Is(err, ErrNotFound):
		return "not_found"
	case errors.Is(err, ErrUnauthenticated):
		return "unauthenticated"
	case errors.Is(err, ErrForbidden):
		return "forbidden"
	case errors.Is(err, ErrConflict):
		return "conflict"
	}
	return "error"
}
