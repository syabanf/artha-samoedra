package shared

import (
	"crypto/rand"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// NewID returns an id such as "lst-mh3k2x9a4f7q", the shape newId gives in the frontend.
func NewID(prefix string) string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	n := uint64(b[0])<<24 | uint64(b[1])<<16 | uint64(b[2])<<8 | uint64(b[3])
	return prefix + "-" + strconv.FormatInt(time.Now().UnixMilli(), 36) + strconv.FormatUint(n, 36)
}

// NextCode returns the code after the highest existing one with the prefix, padded to width,
// e.g. NextCode(["AS-0016"], "AS-", 4) is "AS-0017". It ports nextCode from format.ts.
func NextCode(existing []string, prefix string, width int) string {
	max := 0
	for _, c := range existing {
		if !strings.HasPrefix(c, prefix) {
			continue
		}
		if n, err := strconv.Atoi(c[len(prefix):]); err == nil && n > max {
			max = n
		}
	}
	return fmt.Sprintf("%s%0*d", prefix, width, max+1)
}

// SystemClock reads the wall clock.
type SystemClock struct{}

func (SystemClock) Now() time.Time { return time.Now() }
