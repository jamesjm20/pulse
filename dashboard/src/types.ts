export interface Span {
  id: string;
  trace_id: string;
  parent_id: string | null;
  name: string;
  service_name: string | null;
  model: string | null;
  start_time: string;
  end_time: string | null;
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  input_cost_usd: number;
  output_cost_usd: number;
  cost_usd: number;
  cost_model_version: string | null;
  rate_limit_limit: number;
  rate_limit_remaining: number;
  rate_limit_reset_tokens: string | null;
  attributes: string | null;
  created_at: string;
}

export interface Trace {
  trace_id: string;
  started_at: string;
  ended_at: string | null;
  total_duration_ms: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_usd: number;
  span_count: number;
  models: string | null;
  services: string | null;
}

export interface ModelStat {
  model: string;
  span_count: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  avg_duration_ms: number;
  token_efficiency: number;
}

export interface CostBreakdown {
  input_cost_usd: number;
  output_cost_usd: number;
  total_cost_usd: number;
  input_cost_percentage: number;
}

export interface TimelinePoint {
  hour: string;
  cost_usd: number;
  input_cost_usd: number;
  output_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  span_count: number;
  avg_duration_ms: number;
  avg_rate_limit_remaining: number;
  max_rate_limit_remaining: number;
}

export interface Config {
  allowance_usd: number;
  allowance_period: string;
  user: {
    email: string | null;
    account_id: string | null;
  } | null;
}

export interface Stats {
  totals: {
    trace_count: number;
    span_count: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
    total_input_cost_usd: number;
    total_output_cost_usd: number;
    avg_duration_ms: number;
    max_duration_ms: number;
    avg_rate_limit_remaining: number;
    min_rate_limit_remaining: number;
  };
  byModel: ModelStat[];
  costTimeline: TimelinePoint[];
  costBreakdown: CostBreakdown;
}
