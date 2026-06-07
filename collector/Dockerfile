FROM golang:1.25-alpine

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o collector ./cmd/collector && ls -la collector

EXPOSE 4317 4318

CMD ["./collector"]
