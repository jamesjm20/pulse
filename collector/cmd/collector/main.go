package main

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"go.uber.org/zap"

	"github.com/pulse/collector/internal/config"
	"github.com/pulse/collector/internal/enricher"
	"github.com/pulse/collector/internal/exporter"
	"github.com/pulse/collector/internal/receiver"
	"github.com/pulse/collector/internal/store"
)

func main() {
	// Logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Config
	cfg, err := config.Load("pulse.yaml")
	if err != nil {
		logger.Fatal("failed to load config", zap.Error(err))
	}

	// Store (SQLite)
	db, err := store.New(cfg.Storage.Path)
	if err != nil {
		logger.Fatal("failed to open store", zap.Error(err))
	}

	// Enricher (cost/token calc)
	enrich := enricher.New(cfg.Enricher)

	// Exporter (batch HTTP POST to backend)
	exp, err := exporter.New(cfg.Exporter, db, logger)
	if err != nil {
		logger.Fatal("failed to create exporter", zap.Error(err))
	}

	// Receiver (gRPC + HTTP OTEL)
	rec, err := receiver.New(cfg.Receiver, db, enrich, logger)
	if err != nil {
		logger.Fatal("failed to create receiver", zap.Error(err))
	}

	ctx, cancel := context.WithCancel(context.Background())

	var wg sync.WaitGroup

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := rec.Start(ctx); err != nil {
			logger.Error("receiver error", zap.Error(err))
			cancel()
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		if err := exp.Start(ctx); err != nil {
			logger.Error("exporter error", zap.Error(err))
			cancel()
		}
	}()

	logger.Info("Pulse collector running",
		zap.String("grpc", cfg.Receiver.GRPCAddr),
		zap.String("http", cfg.Receiver.HTTPAddr),
	)

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	select {
	case <-quit:
		logger.Info("shutting down...")
	case <-ctx.Done():
	}

	cancel()  // ensure context is cancelled before waiting
	wg.Wait() // wait for exporter's final flush and receiver to stop
	db.Close()
}
