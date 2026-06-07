import type { Stats, Trace, Span } from './types';

const BASE = '/api';

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  const res = await fetch(BASE + path + qs);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const fetchStats = (params?: Record<string, string>) =>
  get<Stats>('/stats', params);

export const fetchTraces = (params?: Record<string, string>) =>
  get<{ traces: Trace[] }>('/traces', params);

export const fetchExpensiveTraces = (limit: string = '10') =>
  get<{ traces: Trace[] }>('/traces', { limit });

export const fetchTrace = (traceId: string) =>
  get<{ spans: Span[] }>(`/traces/${encodeURIComponent(traceId)}`);
