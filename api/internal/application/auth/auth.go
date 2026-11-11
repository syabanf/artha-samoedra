// Package auth signs users in and turns a token back into the actor commands and queries run for.
// Sign-in sits beside the buses: it creates the actor that the buses then authorize.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Account is a user record with the fields sign-in needs. Doc is the user document as stored.
type Account struct {
	ID, Name, Email, RoleID, Status string
	PasswordHash                    string
	Doc                             json.RawMessage
}

type Role struct {
	ID, Name    string
	Permissions []string
}

// Directory reads users, their password hashes and roles.
type Directory interface {
	AccountByEmail(ctx context.Context, email string) (Account, error)
	Account(ctx context.Context, userID string) (Account, error)
	Role(ctx context.Context, roleID string) (Role, error)
}

// Tokens issues and verifies signed session tokens.
type Tokens interface {
	Issue(userID string) (token string, expires time.Time, err error)
	Verify(token string) (userID string, err error)
}

// Passwords compares a password with its stored hash in constant time.
type Passwords interface {
	Matches(hash, password string) bool
}

type Service struct {
	Directory Directory
	Tokens    Tokens
	Passwords Passwords
}

var errWrongLogin = shared.Unauthenticated("The email or password is wrong.")

type Session struct {
	Token     string          `json:"token"`
	ExpiresAt string          `json:"expiresAt"`
	User      json.RawMessage `json:"user"`
}

// Login checks the password and returns a session token with the user.
func (s Service) Login(ctx context.Context, email, password string) (Session, error) {
	acc, err := s.Directory.AccountByEmail(ctx, strings.TrimSpace(email))
	if errors.Is(err, shared.ErrNotFound) {
		// Compare anyway so a missing email takes as long as a wrong password.
		s.Passwords.Matches("", password)
		return Session{}, errWrongLogin
	}
	if err != nil {
		return Session{}, err
	}
	if !s.Passwords.Matches(acc.PasswordHash, password) {
		return Session{}, errWrongLogin
	}
	if acc.Status == "disabled" {
		return Session{}, shared.Unauthenticated("This account is disabled. Ask an admin to turn it back on.")
	}
	token, exp, err := s.Tokens.Issue(acc.ID)
	if err != nil {
		return Session{}, err
	}
	return Session{Token: token, ExpiresAt: shared.ISO(exp), User: acc.Doc}, nil
}

// Profile is GET /me: the user, their role and what they may do.
type Profile struct {
	User        json.RawMessage  `json:"user"`
	Role        RoleRef          `json:"role"`
	Permissions []iam.Permission `json:"permissions"`
}

type RoleRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Authenticate turns a bearer token into the actor with the role's current permissions.
func (s Service) Authenticate(ctx context.Context, token string) (iam.Actor, Profile, error) {
	userID, err := s.Tokens.Verify(token)
	if err != nil {
		return iam.Anonymous, Profile{}, shared.Unauthenticated("Your session has expired. Sign in again.")
	}
	acc, err := s.Directory.Account(ctx, userID)
	if errors.Is(err, shared.ErrNotFound) || (err == nil && acc.Status == "disabled") {
		return iam.Anonymous, Profile{}, shared.Unauthenticated("This account can no longer sign in.")
	}
	if err != nil {
		return iam.Anonymous, Profile{}, err
	}
	role, err := s.Directory.Role(ctx, acc.RoleID)
	if err != nil && !errors.Is(err, shared.ErrNotFound) {
		return iam.Anonymous, Profile{}, err
	}
	actor := iam.NewActor(acc.ID, acc.Name, acc.RoleID, role.Permissions)
	return actor, Profile{User: acc.Doc, Role: RoleRef{ID: acc.RoleID, Name: role.Name}, Permissions: actor.Permissions()}, nil
}
