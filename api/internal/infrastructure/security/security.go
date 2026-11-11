// Package security implements the auth ports: HS256 session tokens and bcrypt password hashes.
package security

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const issuer = "artha-api"

// JWT implements auth.Tokens with HS256.
type JWT struct {
	Secret []byte
	TTL    time.Duration
	Now    func() time.Time
}

func (j JWT) Issue(userID string) (string, time.Time, error) {
	now := j.Now()
	exp := now.Add(j.TTL)
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.RegisteredClaims{
		Subject: userID, Issuer: issuer, IssuedAt: jwt.NewNumericDate(now), ExpiresAt: jwt.NewNumericDate(exp),
	})
	signed, err := token.SignedString(j.Secret)
	return signed, exp, err
}

func (j JWT) Verify(token string) (string, error) {
	var claims jwt.RegisteredClaims
	_, err := jwt.ParseWithClaims(token, &claims, func(*jwt.Token) (any, error) { return j.Secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(), jwt.WithTimeFunc(j.Now))
	if err != nil {
		return "", err
	}
	if claims.Subject == "" {
		return "", errors.New("token has no subject")
	}
	return claims.Subject, nil
}

// Bcrypt implements auth.Passwords.
type Bcrypt struct{}

// dummyHash lets a lookup for an unknown email spend the same time as a real comparison.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("no-such-user"), bcrypt.DefaultCost)

func (Bcrypt) Matches(hash, password string) bool {
	if hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Hash returns a bcrypt hash of password at the default cost.
func Hash(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}
