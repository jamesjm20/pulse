import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Title, Table, TableHead, TableRow, TableHeaderCell,
  TableBody, TableCell, Badge,
} from '@tremor/react';
import { fetchTraces } from '../api';
import type { Trace } from '../types';
import { formatCost, formatDuration, formatTime, formatTokens, shortId } from '../utils';

export default function Traces() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'cost' | 'duration' | 'recent'>('recent');
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const data = await fetchTraces({ limit: '100' });
      setTraces(data.traces);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const sortedTraces = [...traces].sort((a, b) => {
    if (sortBy === 'cost') return b.total_cost_usd - a.total_cost_usd;
    if (sortBy === 'duration') return b.total_duration_ms - a.total_duration_ms;
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });

  const costSum = traces.reduce((sum, t) => sum + t.total_cost_usd, 0);
  const avgCost = traces.length > 0 ? costSum / traces.length : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Traces</h1>
        <p className="text-gray-500">View all captured traces with detailed metrics</p>
      </div>

      {error && (
        <Card className="bg-red-50 border-red-200">
          <p className="text-red-700 text-sm">{error}</p>
        </Card>
      )}

      {traces.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <p className="text-sm text-blue-600 font-semibold">Total Cost</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{formatCost(costSum)}</p>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
            <p className="text-sm text-purple-600 font-semibold">Average Cost</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">{formatCost(avgCost)}</p>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <p className="text-sm text-green-600 font-semibold">Total Traces</p>
            <p className="text-2xl font-bold text-green-900 mt-1">{traces.length}</p>
          </Card>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <Title>All Traces</Title>
          <div className="flex gap-2">
            {(['recent', 'cost', 'duration'] as const).map((sort) => (
              <button
                key={sort}
                onClick={() => setSortBy(sort)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  sortBy === sort
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {sort === 'recent' ? '📅 Recent' : sort === 'cost' ? '💰 Cost' : '⚡ Duration'}
              </button>
            ))}
          </div>
        </div>

        {sortedTraces.length === 0 && !loading && !error && (
          <p className="text-center text-gray-400 text-sm py-8">
            No traces yet — start the collector to begin capturing spans.
          </p>
        )}

        {sortedTraces.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Trace ID</TableHeaderCell>
                  <TableHeaderCell>Started</TableHeaderCell>
                  <TableHeaderCell>Duration</TableHeaderCell>
                  <TableHeaderCell>Cost</TableHeaderCell>
                  <TableHeaderCell>Tokens</TableHeaderCell>
                  <TableHeaderCell>Models</TableHeaderCell>
                  <TableHeaderCell>Spans</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedTraces.map((t) => (
                  <TableRow
                    key={t.trace_id}
                    className="cursor-pointer hover:bg-blue-50 transition-colors"
                    onClick={() => void navigate(`/traces/${t.trace_id}`)}
                  >
                    <TableCell>
                      <span className="font-mono text-xs text-blue-600 hover:text-blue-800">{shortId(t.trace_id)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-500">{formatTime(t.started_at)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{formatDuration(t.total_duration_ms)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-blue-600">{formatCost(t.total_cost_usd)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-gray-600">
                        {formatTokens(t.total_input_tokens + t.total_output_tokens)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {t.models?.split(',').filter(Boolean).map((m) => (
                          <Badge key={m} className="bg-blue-100 text-blue-800">{m.split('-').slice(0, 3).join('-')}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="bg-gray-100 px-2 py-1 rounded text-sm font-medium text-gray-700">{t.span_count}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
