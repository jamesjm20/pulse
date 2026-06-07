package enricher

import (
	"strings"

	"github.com/pulse/collector/internal/config"
	"github.com/pulse/collector/internal/store"
)

// Enricher adds cost + token data to a span based on OTEL attributes.
type Enricher struct {
	pricing map[string]config.ModelPrice
}

func New(cfg config.EnricherConfig) *Enricher {
	return &Enricher{pricing: cfg.ModelPricing}
}

// Enrich mutates the span in place, calculating cost from token counts.
// Token counts are expected to already be on the span (parsed from OTEL
// attributes by the receiver). This just does the pricing lookup.
func (e *Enricher) Enrich(span *store.Span) {
	if span.Model == "" {
		return
	}
	price, ok := e.priceForModel(span.Model)
	if !ok {
		return
	}

	span.CostUSD = (float64(span.InputTokens)/1_000_000)*price.InputPricePer1M +
		(float64(span.OutputTokens)/1_000_000)*price.OutputPricePer1M
}

// priceForModel does a longest-prefix match against configured model names.
// e.g. "claude-sonnet-4-20250514" matches "claude-sonnet-4".
func (e *Enricher) priceForModel(model string) (config.ModelPrice, bool) {
	bestLen := 0
	var best config.ModelPrice
	found := false

	for prefix, price := range e.pricing {
		if strings.HasPrefix(model, prefix) && len(prefix) > bestLen {
			bestLen = len(prefix)
			best = price
			found = true
		}
	}
	return best, found
}
