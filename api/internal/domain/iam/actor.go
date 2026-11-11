// Package iam defines who acts and what they may do. Permission keys match
// PERMISSION_GROUPS in packages/types/src/iam.ts.
package iam

import (
	"context"
	"slices"
)

// Permission is a key such as "listing.approve". The empty permission means the action is public.
type Permission string

const Public Permission = ""

// Actor is the signed-in user a command or query runs for.
type Actor struct {
	UserID string
	Name   string
	RoleID string
	perms  map[Permission]bool
}

func NewActor(userID, name, roleID string, perms []string) Actor {
	set := make(map[Permission]bool, len(perms))
	for _, p := range perms {
		set[Permission(p)] = true
	}
	return Actor{UserID: userID, Name: name, RoleID: roleID, perms: set}
}

func (a Actor) Can(p Permission) bool { return p == Public || a.perms[p] }

// Anonymous is the actor of a public request (the website, a share link).
var Anonymous = Actor{UserID: "public", Name: "Website visitor"}

func (a Actor) IsAnonymous() bool { return a.UserID == Anonymous.UserID }

type actorKey struct{}

func WithActor(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, actorKey{}, a)
}

// ActorFrom returns the request's actor, or Anonymous.
func ActorFrom(ctx context.Context) Actor {
	if a, ok := ctx.Value(actorKey{}).(Actor); ok {
		return a
	}
	return Anonymous
}

// Permissions lists what the actor may do, sorted, for GET /me.
func (a Actor) Permissions() []Permission {
	out := make([]Permission, 0, len(a.perms))
	for p := range a.perms {
		out = append(out, p)
	}
	slices.Sort(out)
	return out
}
