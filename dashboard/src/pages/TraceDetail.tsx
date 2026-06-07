import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Title, Text, Badge } from '@tremor/react';
import { fetchTrace } from '../api';
import type { Span } from '../types';
import { formatCost, formatDuration, formatTime, formatTokens, shortId } from '../utils';

interface ParsedAttrs {
  user_prompt_length?: number;
  ttft_ms?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  stop_reason?: string;
  speed?: string;
  session_id?: string;
  interaction_sequence?: number;
  span_type?: string;
}

function parseAttrs(raw: string | null): ParsedAttrs {
  if (!raw) return {};
  try {
    const a = JSON.parse(raw);
    return {
      user_prompt_length: a['user_prompt_length'],
      ttft_ms: a['ttft_ms'],
      cache_read_tokens: a['cache_read_tokens'],
      cache_creation_tokens: a['cache_creation_tokens'],
      stop_reason: a['stop_reason'],
      speed: a['speed'],
      session_id: a['session.id'],
      interaction_sequence: a['interaction.sequence'],
      span_type: a['span.type'],
    };
  } catch {
    return {};
  }
}

function Waterfall({ spans, onSelect }: { spans: Span[]; onSelect: (s: Span) => void }) {
  const starts = spans.map((s) => new Date(s.start_time).getTime());
  const ends = spans.map((s) =>
    s.end_time ? new Date(s.end_time).getTime() : new Date(s.start_time).getTime() + s.duration_ms,
  );
  const minT = Math.min(...starts);
  const totalMs = Math.max(Math.max(...ends) - minT, 1);

  const barColor = (span: Span) => {
    const attrs = parseAttrs(span.attributes);
    if (attrs.span_type === 'llm_request') return 'bg-blue-500 hover:bg-blue-600';
    if (attrs.span_type === 'interaction') return 'bg-purple-400 hover:bg-purple-500';
    return 'bg-gray-400 hover:bg-gray-500';
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="pb-2 pr-4 font-medium" style={{ width: 260 }}>Span</th>
            <th className="pb-2 pr-4 font-medium text-right" style={{ width: 70 }}>Duration</th>
            <th className="pb-2 pr-4 font-medium text-right" style={{ width: 60 }}>Cost</th>
            <th className="pb-2 font-medium">Timeline</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const left = ((new Date(span.start_time).getTime() - minT) / totalMs) * 100;
            const width = Math.max((span.duration_ms / totalMs) * 100, 0.5);
            return (
              <tr
                key={span.id}
                className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer group transition-colors"
                onClick={() => onSelect(span)}
              >
                <td className="py-2 pr-4">
                  <p className="font-medium text-gray-800 truncate max-w-[240px]" title={span.name}>
                    {span.name}
                  </p>
                  {span.model && (
                    <p className="text-xs text-gray-400 truncate">{span.model}</p>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-500 text-xs">
                  {formatDuration(span.duration_ms)}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-xs font-medium text-blue-600">
                  {span.cost_usd > 0 ? formatCost(span.cost_usd) : '—'}
                </td>
                <td className="py-2">
                  <div className="relative h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={`absolute h-full rounded transition-colors ${barColor(span)}`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SpanDetail({ span, onClose }: { span: Span; onClose: () => void }) {
  const attrs = parseAttrs(span.attributes);

  return (
    <Card className="border-l-4 border-l-blue-500">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{span.name}</h3>
          {span.model && <p className="text-xs text-gray-500 mt-0.5">{span.model}</p>}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Duration</p>
          <p className="text-sm font-semibold text-gray-900">{formatDuration(span.duration_ms)}</p>
        </div>
        {span.cost_usd > 0 && (
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-500">Cost</p>
            <p className="text-sm font-semibold text-blue-900">{formatCost(span.cost_usd)}</p>
          </div>
        )}
        {span.input_tokens > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Input Tokens</p>
            <p className="text-sm font-semibold text-gray-900">{formatTokens(span.input_tokens)}</p>
          </div>
        )}
        {span.output_tokens > 0 && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Output Tokens</p>
            <p className="text-sm font-semibold text-gray-900">{formatTokens(span.output_tokens)}</p>
          </div>
        )}
        {attrs.ttft_ms != null && (
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-xs text-purple-500">Time to First Token</p>
            <p className="text-sm font-semibold text-purple-900">{formatDuration(attrs.ttft_ms)}</p>
          </div>
        )}
        {attrs.cache_read_tokens != null && attrs.cache_read_tokens > 0 && (
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-500">Cache Read Tokens</p>
            <p className="text-sm font-semibold text-green-900">{formatTokens(attrs.cache_read_tokens)}</p>
          </div>
        )}
        {attrs.cache_creation_tokens != null && attrs.cache_creation_tokens > 0 && (
          <div className="bg-yellow-50 rounded-lg p-3">
            <p className="text-xs text-yellow-600">Cache Created Tokens</p>
            <p className="text-sm font-semibold text-yellow-900">{formatTokens(attrs.cache_creation_tokens)}</p>
          </div>
        )}
        {attrs.user_prompt_length != null && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Prompt Length</p>
            <p className="text-sm font-semibold text-gray-900">{attrs.user_prompt_length.toLocaleString()} chars</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {attrs.stop_reason && (
          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">stop: {attrs.stop_reason}</span>
        )}
        {attrs.speed && (
          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">speed: {attrs.speed}</span>
        )}
        {attrs.interaction_sequence != null && (
          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">interaction #{attrs.interaction_sequence}</span>
        )}
        <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded font-mono">{shortId(span.id)}</span>
      </div>

      <div className="mt-3 text-xs text-gray-400">
        <span>{formatTime(span.start_time)}</span>
        {span.end_time && <span> → {formatTime(span.end_time)}</span>}
      </div>
    </Card>
  );
}

export default function TraceDetail() {
  const { traceId } = useParams<{ traceId: string }>();
  const [spans, setSpans] = useState<Span[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  useEffect(() => {
    if (!traceId) return;
    fetchTrace(traceId)
      .then((data) => setSpans(data.spans))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [traceId]);

  if (!traceId) return <p className="text-red-500 text-sm">Invalid trace ID</p>;
  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>;
  if (error) return <p className="text-red-500 text-sm">{error}</p>;

  const totalCost = spans.reduce((s, sp) => s + sp.cost_usd, 0);
  const totalTokens = spans.reduce((s, sp) => s + sp.input_tokens + sp.output_tokens, 0);
  const totalMs = spans.reduce((s, sp) => s + sp.duration_ms, 0);
  const models = [...new Set(spans.map((s) => s.model).filter((m): m is string => m !== null))];

  const llmSpans = spans.filter(s => {
    const a = parseAttrs(s.attributes);
    return a.span_type === 'llm_request';
  });
  const avgTtft = llmSpans.length > 0
    ? llmSpans.reduce((sum, s) => sum + (parseAttrs(s.attributes).ttft_ms ?? 0), 0) / llmSpans.length
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/traces" className="text-blue-600 text-sm hover:underline font-medium">
          ← Traces
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono text-sm text-gray-500">{traceId}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <Text className="text-blue-600 font-semibold">Cost</Text>
          <p className="text-2xl font-bold text-blue-900 mt-1">{formatCost(totalCost)}</p>
        </Card>
        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <Text className="text-purple-600 font-semibold">Duration</Text>
          <p className="text-2xl font-bold text-purple-900 mt-1">{formatDuration(totalMs)}</p>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <Text className="text-green-600 font-semibold">Tokens</Text>
          <p className="text-2xl font-bold text-green-900 mt-1">{formatTokens(totalTokens)}</p>
        </Card>
        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <Text className="text-orange-600 font-semibold">Spans</Text>
          <p className="text-2xl font-bold text-orange-900 mt-1">{spans.length}</p>
        </Card>
        {avgTtft != null && (
          <Card className="bg-gradient-to-br from-pink-50 to-pink-100 border-pink-200">
            <Text className="text-pink-600 font-semibold">Avg TTFT</Text>
            <p className="text-2xl font-bold text-pink-900 mt-1">{formatDuration(avgTtft)}</p>
          </Card>
        )}
      </div>

      {selectedSpan && (
        <SpanDetail span={selectedSpan} onClose={() => setSelectedSpan(null)} />
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <Title>Span Waterfall</Title>
            <p className="text-xs text-gray-400 mt-0.5">Click a span to see details</p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded bg-blue-500" /> LLM request
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <div className="w-3 h-3 rounded bg-purple-400" /> Interaction
            </div>
            {models.map((m) => (
              <Badge key={m} className="bg-blue-100 text-blue-800">{m.split('-').slice(0, 3).join('-')}</Badge>
            ))}
          </div>
        </div>
        <Waterfall spans={spans} onSelect={setSelectedSpan} />
      </Card>
    </div>
  );
}
