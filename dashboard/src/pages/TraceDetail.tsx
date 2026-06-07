import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, Title, Text, Badge } from '@tremor/react';
import { fetchTrace } from '../api';
import type { Span } from '../types';
import { formatCost, formatDuration, formatTime, shortId } from '../utils';

function Waterfall({ spans }: { spans: Span[] }) {
  const starts = spans.map((s) => new Date(s.start_time).getTime());
  const ends = spans.map((s) =>
    s.end_time
      ? new Date(s.end_time).getTime()
      : new Date(s.start_time).getTime() + s.duration_ms,
  );
  const minT = Math.min(...starts);
  const totalMs = Math.max(Math.max(...ends) - minT, 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
            <th className="pb-2 pr-4 font-medium" style={{ width: 260 }}>Span</th>
            <th className="pb-2 pr-6 font-medium text-right" style={{ width: 80 }}>Duration</th>
            <th className="pb-2 font-medium">Timeline</th>
          </tr>
        </thead>
        <tbody>
          {spans.map((span) => {
            const left = ((new Date(span.start_time).getTime() - minT) / totalMs) * 100;
            const width = Math.max((span.duration_ms / totalMs) * 100, 0.5);
            return (
              <tr key={span.id} className="border-b border-gray-50 hover:bg-gray-50 group">
                <td className="py-2 pr-4">
                  <p className="font-medium text-gray-800 truncate max-w-[240px]" title={span.name}>
                    {span.name}
                  </p>
                  {span.model && (
                    <p className="text-xs text-gray-400 truncate">{span.model}</p>
                  )}
                </td>
                <td className="py-2 pr-6 text-right tabular-nums text-gray-500 text-xs">
                  {formatDuration(span.duration_ms)}
                </td>
                <td className="py-2">
                  <div className="relative h-5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="absolute h-full bg-indigo-400 rounded group-hover:bg-indigo-500 transition-colors"
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

export default function TraceDetail() {
  const { traceId } = useParams<{ traceId: string }>();
  const [spans, setSpans] = useState<Span[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  const totalMs = spans.reduce((s, sp) => s + sp.duration_ms, 0);
  const models = [...new Set(spans.map((s) => s.model).filter((m): m is string => m !== null))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/traces" className="text-indigo-600 text-sm hover:underline">
          ← Traces
        </Link>
        <span className="text-gray-300">/</span>
        <span className="font-mono text-sm text-gray-700">{shortId(traceId)}</span>
        <span className="font-mono text-xs text-gray-400">{traceId}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <Text>Cost</Text>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{formatCost(totalCost)}</p>
        </Card>
        <Card>
          <Text>Total Duration</Text>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{formatDuration(totalMs)}</p>
        </Card>
        <Card>
          <Text>Spans</Text>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{spans.length}</p>
        </Card>
        <Card>
          <Text>Started</Text>
          <p className="text-sm font-medium text-gray-600 mt-1">
            {spans[0] ? formatTime(spans[0].start_time) : '—'}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Title>Spans</Title>
          <div className="flex flex-wrap gap-2">
            {models.map((m) => (
              <Badge key={m} size="sm">{m}</Badge>
            ))}
          </div>
        </div>
        <Waterfall spans={spans} />
      </Card>
    </div>
  );
}
