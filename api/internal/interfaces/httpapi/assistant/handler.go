// Package assistant serves Jessy over HTTP. Mount it behind the auth middleware, which puts the
// actor in the request context; routes are relative, so strip the mount prefix first.
//
//	POST /messages                 {conversationId?, text}
//	POST /proposals/{id}/confirm
//	POST /proposals/{id}/cancel
//	GET  /conversations/{id}
package assistant

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	app "github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// New returns the handler for svc.
func New(svc *app.Service) http.Handler {
	h := &handler{svc: svc}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /messages", h.send)
	mux.HandleFunc("POST /proposals/{id}/confirm", h.confirm)
	mux.HandleFunc("POST /proposals/{id}/cancel", h.cancel)
	mux.HandleFunc("GET /conversations/{id}", h.conversation)
	return signedIn(mux)
}

type handler struct{ svc *app.Service }

// signedIn refuses anonymous requests before any route runs.
func signedIn(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if iam.ActorFrom(r.Context()).IsAnonymous() {
			writeError(w, shared.ErrUnauthenticated)
			return
		}
		next.ServeHTTP(w, r)
	})
}

type sendBody struct {
	ConversationID string `json:"conversationId"`
	Text           string `json:"text"`
}

func (h *handler) send(w http.ResponseWriter, r *http.Request) {
	var b sendBody
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&b); err != nil {
		writeError(w, shared.Rule("The request body must be JSON with a text field."))
		return
	}
	ans, err := h.svc.Send(r.Context(), b.ConversationID, b.Text)
	respond(w, ans, err)
}

func (h *handler) confirm(w http.ResponseWriter, r *http.Request) {
	res, err := h.svc.Confirm(r.Context(), r.PathValue("id"))
	respond(w, map[string]any{"proposalId": r.PathValue("id"), "status": app.ProposalConfirmed, "result": res}, err)
}

func (h *handler) cancel(w http.ResponseWriter, r *http.Request) {
	p, err := h.svc.Cancel(r.Context(), r.PathValue("id"))
	respond(w, p, err)
}

func (h *handler) conversation(w http.ResponseWriter, r *http.Request) {
	c, err := h.svc.Conversation(r.Context(), r.PathValue("id"))
	respond(w, c, err)
}

func respond(w http.ResponseWriter, v any, err error) {
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

var statusOf = map[string]int{
	"rule":            http.StatusUnprocessableEntity,
	"not_found":       http.StatusNotFound,
	"unauthenticated": http.StatusUnauthorized,
	"forbidden":       http.StatusForbidden,
	"conflict":        http.StatusConflict,
}

// writeError answers {error:{code,message}} like the core API. A model outage is 502; other
// unknown errors are logged and answer a generic 500.
func writeError(w http.ResponseWriter, err error) {
	kind := shared.Kind(err)
	status, known := statusOf[kind]
	msg := err.Error()
	var rule *shared.RuleError
	switch {
	case errors.As(err, &rule):
		msg = rule.Msg
	case errors.Is(err, app.ErrLLMUnavailable):
		slog.Warn("assistant model call failed", "err", err)
		status, kind, msg = http.StatusBadGateway, "model_unavailable", "Jessy cannot reach the model right now. Try again in a minute."
	case !known:
		slog.Error("assistant request failed", "err", err)
		status, kind, msg = http.StatusInternalServerError, "internal", "Something went wrong on our side."
	}
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": kind, "message": msg}})
}
