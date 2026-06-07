import { useCallback, useEffect, useState } from 'react';
import { Card, Title, Text, Metric, BarList } from '@tremor/react';
import {
  AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { fetchStats } from '../api';
import type { Stats } from '../types';
import { formatCost, formatDuration, formatTokens } from '../utils';

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!stats) return <p className="text-gray-400 text-sm">Loading…</p>;

  const { totals, byModel, costTimeline } = stats;

  const modelBarData = byModel.map((m) => ({ name: m.model, value: m.cost_usd }));
  const costEfficiencyData = byModel.map((m) => ({
    model: m.model.split('-').slice(0, 3).join('-'),
    efficiency: (m.token_efficiency || 0).toFixed(3),
    cost: m.cost_usd,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Pulse Dashboard</h1>
        <p className="text-gray-500">Real-time observability for Claude API usage</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-blue-600 font-semibold">Total Cost</Text>
              <Metric className="text-blue-900 mt-2">{formatCost(totals.total_cost_usd)}</Metric>
            </div>
            <div className="text-3xl text-blue-300">💰</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-purple-600 font-semibold">Avg Latency</Text>
              <Metric className="text-purple-900 mt-2">{formatDuration(totals.avg_duration_ms)}</Metric>
              <p className="text-xs text-purple-500 mt-1">Max: {formatDuration(totals.max_duration_ms)}</p>
            </div>
            <div className="text-3xl text-purple-300">⚡</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-green-600 font-semibold">Total Tokens</Text>
              <Metric className="text-green-900 mt-2">{formatTokens(totals.total_input_tokens + totals.total_output_tokens)}</Metric>
              <p className="text-xs text-green-500 mt-1">{formatTokens(totals.total_output_tokens)} output</p>
            </div>
            <div className="text-3xl text-green-300">📊</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-orange-600 font-semibold">Traces</Text>
              <Metric className="text-orange-900 mt-2">{totals.trace_count.toLocaleString()}</Metric>
              <p className="text-xs text-orange-500 mt-1">{totals.span_count.toLocaleString()} spans</p>
            </div>
            <div className="text-3xl text-orange-300">🔗</div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <Title>Cost Timeline</Title>
          {costTimeline.length === 0 ? (
            <p className="text-gray-400 text-sm mt-4">No data yet</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={costTimeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h: string) => h.slice(11, 16)}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => formatCost(v)}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={60}
                  />
                  <Tooltip
                    formatter={(v: number) => [formatCost(v), 'Cost']}
                    labelFormatter={(l: string) => `${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cost_usd"
                    stroke="#3b82f6"
                    fill="url(#costGrad)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <Title className="text-sm">Top Models by Cost</Title>
          {modelBarData.length === 0 ? (
            <p className="text-gray-400 text-sm mt-4">No data yet</p>
          ) : (
            <BarList
              data={modelBarData.slice(0, 5)}
              valueFormatter={(v: number) => formatCost(v)}
              className="mt-4"
              color="blue"
            />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <Title>Model Performance</Title>
          <div className="mt-4 space-y-3">
            {byModel.length === 0 ? (
              <p className="text-gray-400 text-sm">No data yet</p>
            ) : (
              byModel.map((model) => (
                <div key={model.model} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">{model.model.split('-').slice(0, 3).join('-')}</p>
                    <p className="text-xs text-gray-500">Avg latency: {formatDuration(model.avg_duration_ms)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-blue-600">{formatCost(model.cost_usd)}</p>
                    <p className="text-xs text-gray-500">{model.span_count} spans</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <Title>Token Efficiency (Output/Input)</Title>
          <div className="mt-4 space-y-3">
            {byModel.length === 0 ? (
              <p className="text-gray-400 text-sm">No data yet</p>
            ) : (
              byModel.map((model) => (
                <div key={model.model} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">{model.model.split('-').slice(0, 3).join('-')}</p>
                    <p className="text-xs text-gray-500">{formatTokens(model.input_tokens)} → {formatTokens(model.output_tokens)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-600">{(model.token_efficiency || 0).toFixed(3)}</p>
                    <p className="text-xs text-gray-500">{model.span_count} calls</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
