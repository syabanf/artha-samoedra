# Builds the API and the seed loader into a small image. Build from the api/ folder:
#   docker build -t artha-api .
#   docker run -p 8080:8080 -e DATABASE_URL=... -e JWT_SECRET=... -e DEEPSEEK_API_KEY=... artha-api
# Load the demo data once with: docker run --rm -e DATABASE_URL=... artha-api /app/seed --reset
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/seed ./cmd/seed

FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=build /out/api /out/seed ./
# Jessy's provider and model; the key, DATABASE_URL and JWT_SECRET come from the server's environment.
COPY .env.production ./
ENV PORT=8080
EXPOSE 8080
USER nonroot
ENTRYPOINT ["/app/api"]
