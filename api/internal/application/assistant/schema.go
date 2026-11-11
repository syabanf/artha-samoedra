package assistant

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
)

// Schema is the subset of JSON schema the tools use. The same value goes to the model as the
// tool's parameters and checks the arguments the model sends back, because models sometimes
// send values outside an enum or numbers as strings.
type Schema struct {
	Type                 string             `json:"type,omitempty"`
	Description          string             `json:"description,omitempty"`
	Properties           map[string]*Schema `json:"properties,omitempty"`
	Required             []string           `json:"required,omitempty"`
	Enum                 []string           `json:"enum,omitempty"`
	Items                *Schema            `json:"items,omitempty"`
	AdditionalProperties *Schema            `json:"additionalProperties,omitempty"`
	Minimum              *float64           `json:"minimum,omitempty"`
	Maximum              *float64           `json:"maximum,omitempty"`
}

func object(required []string, props map[string]*Schema) *Schema {
	if props == nil {
		props = map[string]*Schema{}
	}
	return &Schema{Type: "object", Properties: props, Required: required}
}

func str(desc string, enum ...string) *Schema {
	return &Schema{Type: "string", Description: desc, Enum: enum}
}

func integer(desc string, lo, hi float64) *Schema {
	return &Schema{Type: "integer", Description: desc, Minimum: &lo, Maximum: &hi}
}

// parseArgs decodes the model's arguments and checks them against s. The returned map holds
// normalized values: integers as int, and unknown keys dropped.
func parseArgs(s *Schema, raw json.RawMessage) (map[string]any, error) {
	var v any = map[string]any{}
	if t := strings.TrimSpace(string(raw)); t != "" && t != "null" {
		if err := json.Unmarshal(raw, &v); err != nil {
			return nil, fmt.Errorf("arguments are not valid JSON: %v", err)
		}
	}
	out, err := check(s, v, "arguments")
	if err != nil {
		return nil, err
	}
	m, _ := out.(map[string]any)
	return m, nil
}

func check(s *Schema, v any, path string) (any, error) {
	switch s.Type {
	case "object":
		m, ok := v.(map[string]any)
		if !ok {
			return nil, fmt.Errorf("%s must be an object", path)
		}
		for _, r := range s.Required {
			if val, ok := m[r]; !ok || val == nil || val == "" {
				return nil, fmt.Errorf("%s.%s is required", path, r)
			}
		}
		out := map[string]any{}
		for k, val := range m {
			sub := s.Properties[k]
			if sub == nil {
				sub = s.AdditionalProperties
			}
			if sub == nil || val == nil {
				continue
			}
			nv, err := check(sub, val, path+"."+k)
			if err != nil {
				return nil, err
			}
			out[k] = nv
		}
		return out, nil
	case "array":
		a, ok := v.([]any)
		if !ok {
			return nil, fmt.Errorf("%s must be an array", path)
		}
		out := make([]any, len(a))
		for i, val := range a {
			nv, err := check(s.Items, val, fmt.Sprintf("%s[%d]", path, i))
			if err != nil {
				return nil, err
			}
			out[i] = nv
		}
		return out, nil
	case "string":
		var sv string
		switch t := v.(type) {
		case string:
			sv = t
		case float64, bool:
			sv = fmt.Sprint(t)
		default:
			return nil, fmt.Errorf("%s must be a string", path)
		}
		if len(s.Enum) > 0 && !slices.Contains(s.Enum, sv) {
			return nil, fmt.Errorf("%s is %q but must be one of: %s", path, sv, strings.Join(s.Enum, ", "))
		}
		return sv, nil
	case "integer":
		var f float64
		switch t := v.(type) {
		case float64:
			f = t
		case string:
			p, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
			if err != nil {
				return nil, fmt.Errorf("%s must be a whole number", path)
			}
			f = p
		default:
			return nil, fmt.Errorf("%s must be a whole number", path)
		}
		if f != math.Trunc(f) {
			return nil, fmt.Errorf("%s must be a whole number", path)
		}
		if (s.Minimum != nil && f < *s.Minimum) || (s.Maximum != nil && f > *s.Maximum) {
			return nil, fmt.Errorf("%s must be between %g and %g", path, *s.Minimum, *s.Maximum)
		}
		return int(f), nil
	}
	return v, nil
}
