// Package httpapi exposes the buses over HTTP. Handlers decode, dispatch and encode; every
// rule lives in the domain and every permission check in the bus.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/syabanf/artha-samoedra/api/internal/application/auth"
	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/application/records"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

const maxBody = 1 << 20

type Server struct {
	commands, queries *cqrs.Bus
	auth              auth.Service
	log               *slog.Logger
	corsOrigin        string
	mux               *http.ServeMux
}

func New(commands, queries *cqrs.Bus, a auth.Service, log *slog.Logger, corsOrigin string) *Server {
	s := &Server{commands: commands, queries: queries, auth: a, log: log, corsOrigin: corsOrigin, mux: http.NewServeMux()}
	s.mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	s.mux.HandleFunc("POST /api/v1/auth/login", s.login)
	s.Mount("GET /api/v1/me", http.HandlerFunc(s.me))
	s.Mount("GET /api/v1/commands", http.HandlerFunc(s.catalog(s.commands)))
	s.Mount("GET /api/v1/queries", http.HandlerFunc(s.catalog(s.queries)))
	s.Mount("POST /api/v1/commands/{name}", http.HandlerFunc(s.dispatch(s.commands)))
	s.Mount("POST /api/v1/queries/{name}", http.HandlerFunc(s.dispatch(s.queries)))
	s.Mount("GET /api/v1/records/{collection}", http.HandlerFunc(s.listRecords))
	s.Mount("GET /api/v1/records/{collection}/{id}", http.HandlerFunc(s.getRecord))
	s.Mount("GET /api/v1/settings/{name}", http.HandlerFunc(s.getSetting))
	s.mux.HandleFunc("GET /api/v1/public/listings", s.publicListings)
	return s
}

// Mount serves h behind the auth middleware, so iam.ActorFrom(r.Context()) is the caller.
func (s *Server) Mount(pattern string, h http.Handler) { s.mux.Handle(pattern, s.authenticate(h)) }

// Handler is the full stack: request id, recovery, access log, CORS, routes.
func (s *Server) Handler() http.Handler {
	return requestID(s.recoverer(s.accessLog(s.cors(s.mux))))
}

type profileKey struct{}

// authenticate turns a bearer token into the actor. No token means iam.Anonymous; a bad one is 401.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || token == "" {
			next.ServeHTTP(w, r.WithContext(iam.WithActor(r.Context(), iam.Anonymous)))
			return
		}
		actor, profile, err := s.auth.Authenticate(r.Context(), token)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		ctx := context.WithValue(iam.WithActor(r.Context(), actor), profileKey{}, profile)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody)).Decode(&body); err != nil {
		s.fail(w, r, shared.Rule("Send {email, password} as JSON."))
		return
	}
	session, err := s.auth.Login(r.Context(), body.Email, body.Password)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	p, ok := r.Context().Value(profileKey{}).(auth.Profile)
	if !ok {
		s.fail(w, r, shared.ErrUnauthenticated)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) catalog(bus *cqrs.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"items": bus.CatalogFor(iam.ActorFrom(r.Context()))})
	}
}

func (s *Server) dispatch(bus *cqrs.Bus) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		m, err := bus.Decode(r.PathValue("name"), raw)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		s.run(w, r, bus, m)
	}
}

func (s *Server) run(w http.ResponseWriter, r *http.Request, bus *cqrs.Bus, m cqrs.Message) {
	out, err := bus.Dispatch(r.Context(), m)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// listRecords maps query parameters onto records.list: q, sort, limit, offset, and any other
// parameter as a field filter, e.g. ?status=active&sort=-price.
func (s *Server) listRecords(w http.ResponseWriter, r *http.Request) {
	q := records.List{Collection: r.PathValue("collection"), Where: map[string]string{}}
	for k, v := range r.URL.Query() {
		switch k {
		case "q":
			q.Q = v[0]
		case "sort":
			q.Sort = v[0]
		case "limit":
			q.Limit, _ = strconv.Atoi(v[0])
		case "offset":
			q.Offset, _ = strconv.Atoi(v[0])
		default:
			q.Where[k] = v[0]
		}
	}
	s.run(w, r, s.queries, q)
}

func (s *Server) getRecord(w http.ResponseWriter, r *http.Request) {
	s.run(w, r, s.queries, records.Get{Collection: r.PathValue("collection"), ID: r.PathValue("id")})
}

func (s *Server) getSetting(w http.ResponseWriter, r *http.Request) {
	s.run(w, r, s.queries, records.Setting{Name: r.PathValue("name")})
}

func (s *Server) publicListings(w http.ResponseWriter, r *http.Request) {
	q := records.PublicListings{Q: r.URL.Query().Get("q")}
	q.Limit, _ = strconv.Atoi(r.URL.Query().Get("limit"))
	q.Offset, _ = strconv.Atoi(r.URL.Query().Get("offset"))
	s.run(w, r.WithContext(iam.WithActor(r.Context(), iam.Anonymous)), s.queries, q)
}

var statusOf = map[string]int{
	"rule":            http.StatusUnprocessableEntity,
	"not_found":       http.StatusNotFound,
	"unauthenticated": http.StatusUnauthorized,
	"forbidden":       http.StatusForbidden,
	"conflict":        http.StatusConflict,
}

// fail writes {error:{code,message}}. Unknown errors are logged and hidden behind a generic 500.
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	kind := shared.Kind(err)
	status, known := statusOf[kind]
	msg := err.Error()
	var maxErr *http.MaxBytesError
	switch {
	case errors.As(err, &maxErr):
		status, kind, msg = http.StatusRequestEntityTooLarge, "too_large", "The request body is too large."
	case !known:
		s.log.ErrorContext(r.Context(), "request failed", "err", err, "request_id", RequestID(r.Context()))
		status, kind, msg = http.StatusInternalServerError, "internal", "Something went wrong on our side."
	}
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": kind, "message": msg}})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
