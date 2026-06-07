package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Storage  StorageConfig  `yaml:"storage"`
	Receiver ReceiverConfig `yaml:"receiver"`
	Enricher EnricherConfig `yaml:"enricher"`
	Exporter ExporterConfig `yaml:"exporter"`
}

type StorageConfig struct {
	Path string `yaml:"path"`
}

type ReceiverConfig struct {
	GRPCAddr string `yaml:"grpc_addr"`
	HTTPAddr string `yaml:"http_addr"`
}

type EnricherConfig struct {
	// Pricing per million tokens, keyed by model name prefix
	// e.g. "claude-3-5-sonnet": { InputPricePer1M: 3.00, OutputPricePer1M: 15.00 }
	ModelPricing map[string]ModelPrice `yaml:"model_pricing"`
}

type ModelPrice struct {
	InputPricePer1M  float64 `yaml:"input_price_per_1m"`
	OutputPricePer1M float64 `yaml:"output_price_per_1m"`
}

type ExporterConfig struct {
	BackendURL    string `yaml:"backend_url"`
	BatchSize     int    `yaml:"batch_size"`
	FlushInterval string `yaml:"flush_interval"` // e.g. "10s"
}

// Defaults applied when fields are missing from YAML
func defaults() *Config {
	return &Config{
		Storage: StorageConfig{
			Path: "pulse.db",
		},
		Receiver: ReceiverConfig{
			GRPCAddr: ":4317",
			HTTPAddr: ":4318",
		},
		Enricher: EnricherConfig{
			ModelPricing: map[string]ModelPrice{
				"claude-opus-4":     {InputPricePer1M: 15.00, OutputPricePer1M: 75.00},
				"claude-sonnet-4":   {InputPricePer1M: 3.00, OutputPricePer1M: 15.00},
				"claude-haiku-3-5":  {InputPricePer1M: 0.80, OutputPricePer1M: 4.00},
			},
		},
		Exporter: ExporterConfig{
			BackendURL:    "http://localhost:3000/api/spans",
			BatchSize:     100,
			FlushInterval: "10s",
		},
	}
}

func Load(path string) (*Config, error) {
	cfg := defaults()

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			// No config file — use all defaults
			return cfg, nil
		}
		return nil, err
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
