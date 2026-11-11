package assistant

import (
	"encoding/json"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	// resultBudget caps one tool result in bytes, so a few rounds fit a small context.
	resultBudget = 6000
	// maxString caps one string field inside a tool result.
	maxString = 280
)

// dropKeys never reach the model: they are large, binary or secret.
var dropKeys = map[string]bool{
	"photo": true, "photos": true, "image": true, "images": true, "avatar": true, "logo": true,
	"password": true, "passwordHash": true, "token": true, "tokenHash": true, "secret": true,
	"apiKey": true, "location": true, "html": true,
}

// encodeResult turns a tool result into compact JSON within resultBudget. A page of records
// loses items from the end first, with a note saying how many it kept.
func encodeResult(v any) string {
	v = shrink(toJSONValue(v), 0)
	b, _ := json.Marshal(v)
	if len(b) <= resultBudget {
		return string(b)
	}
	if m, ok := v.(map[string]any); ok {
		if items, ok := m["items"].([]any); ok {
			for n := len(items) / 2; n >= 1; n /= 2 {
				m["items"] = items[:n]
				m["note"] = fmt.Sprintf("Showing %d of the %d items returned; ask with a narrower filter or use offset for more.", n, len(items))
				if b, _ = json.Marshal(m); len(b) <= resultBudget {
					return string(b)
				}
			}
		}
	}
	return cut(string(b), resultBudget) + " [truncated]"
}

func toJSONValue(v any) any {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprint(v)
	}
	var out any
	_ = json.Unmarshal(b, &out)
	return out
}

func shrink(v any, depth int) any {
	switch t := v.(type) {
	case map[string]any:
		if depth > 4 {
			return "{...}"
		}
		for k, val := range t {
			if dropKeys[k] {
				delete(t, k)
				continue
			}
			t[k] = shrink(val, depth+1)
		}
		return t
	case []any:
		if depth > 4 {
			return fmt.Sprintf("[%d entries]", len(t))
		}
		for i := range t {
			t[i] = shrink(t[i], depth+1)
		}
		return t
	case string:
		if utf8.RuneCountInString(t) > maxString {
			return cut(t, maxString) + "..."
		}
	}
	return v
}

// cut shortens s to at most n bytes without splitting a UTF-8 character.
func cut(s string, n int) string {
	if len(s) <= n {
		return s
	}
	s = s[:n]
	for !utf8.ValidString(s) {
		s = s[:len(s)-1]
	}
	return strings.TrimSpace(s)
}
