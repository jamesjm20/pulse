import { useCallback, useEffect, useState } from 'react';
import { Card, Title, Text, Metric, BarList } from '@tremor/react';
import {
  AreaChart, Area, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { fetchStats, fetchConfig } from '../api';
import type { Stats, Config } from '../types';
import { formatCost, formatDuration, formatTokens } from '../utils';
import LoadingPlaceholder from '../components/LoadingPlaceholder';

export default function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([fetchStats(), fetchConfig()]);
      setStats(s);
      setConfig(c);
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
  if (!stats || stats.totals.trace_count === 0) return <LoadingPlaceholder />;

  const { totals, byModel, costTimeline, costBreakdown } = stats;
  const modelBarData = byModel.filter(m => m.cost_usd > 0).map((m) => ({ name: m.model, value: m.cost_usd }));

  // Prepare pie chart data for cost breakdown
  const costBreakdownData = [
    { name: 'Input', value: costBreakdown.input_cost_usd },
    { name: 'Output', value: costBreakdown.output_cost_usd },
  ];
  const COLORS = ['#3b82f6', '#ec4899'];

  // Calculate rate limit utilization percentage
  const rateLimitPct = totals.avg_rate_limit_remaining && totals.avg_rate_limit_remaining > 0
    ? Math.max(0, 100 - ((totals.avg_rate_limit_remaining / 100000) * 100))
    : 0;

  const allowance = config?.allowance_usd ?? 0;
  const allowancePct = allowance > 0 ? Math.min((totals.total_cost_usd / allowance) * 100, 100) : 0;
  const allowanceColor = allowancePct >= 90 ? 'bg-red-500' : allowancePct >= 70 ? 'bg-yellow-500' : 'bg-blue-500';
  const allowanceTextColor = allowancePct >= 90 ? 'text-red-600' : allowancePct >= 70 ? 'text-yellow-600' : 'text-blue-600';

  const userLabel = config?.user?.email
    ? config.user.email.split('@')[0]
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">
            {userLabel ? `Hi, ${userLabel} 👋` : 'Pulse Dashboard'}
          </h1>
          <p className="text-gray-500">Real-time observability for your Claude API usage</p>
        </div>
        {config?.user?.email && (
          <div className="text-right text-xs text-gray-400">
            <p>{config.user.email}</p>
          </div>
        )}
      </div>

      {allowance > 0 && (
        <Card className="border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {config?.allowance_period === 'monthly' ? 'Monthly' : 'Daily'} Allowance
              </p>
              <p className={`text-xs mt-0.5 ${allowanceTextColor}`}>
                {formatCost(totals.total_cost_usd)} used of {formatCost(allowance)} — {allowancePct.toFixed(1)}%
              </p>
            </div>
            <p className={`text-2xl font-bold ${allowanceTextColor}`}>{allowancePct.toFixed(0)}%</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${allowanceColor}`}
              style={{ width: `${allowancePct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>$0</span>
            <span>{formatCost(allowance)} limit</span>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-blue-600 font-semibold">Total Cost</Text>
              <Metric className="text-blue-900 mt-2">{formatCost(totals.total_cost_usd)}</Metric>
            </div>
            <div className="text-3xl">💰</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-purple-600 font-semibold">Avg Latency</Text>
              <Metric className="text-purple-900 mt-2">{formatDuration(totals.avg_duration_ms)}</Metric>
              <p className="text-xs text-purple-500 mt-1">Max: {formatDuration(totals.max_duration_ms)}</p>
            </div>
            <div className="text-3xl">⚡</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-green-600 font-semibold">Total Tokens</Text>
              <Metric className="text-green-900 mt-2">{formatTokens(totals.total_input_tokens + totals.total_output_tokens)}</Metric>
              <p className="text-xs text-green-500 mt-1">{formatTokens(totals.total_output_tokens)} output</p>
            </div>
            <div className="text-3xl">📊</div>
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <div className="flex items-start justify-between">
            <div>
              <Text className="text-orange-600 font-semibold">Traces</Text>
              <Metric className="text-orange-900 mt-2">{totals.trace_count.toLocaleString()}</Metric>
              <p className="text-xs text-orange-500 mt-1">{totals.span_count.toLocaleString()} spans</p>
            </div>
            <div className="text-3xl">🔗</div>
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
          <Title>Top Models by Cost</Title>
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
            {byModel.filter(m => m.cost_usd > 0).length === 0 ? (
              <p className="text-gray-400 text-sm">No data yet</p>
            ) : (
              byModel.filter(m => m.cost_usd > 0).map((model) => (
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
            {byModel.filter(m => m.cost_usd > 0).length === 0 ? (
              <p className="text-gray-400 text-sm">No data yet</p>
            ) : (
              byModel.filter(m => m.cost_usd > 0).map((model) => (
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <Title>Cost Breakdown</Title>
          {costBreakdown.total_cost_usd === 0 ? (
            <p className="text-gray-400 text-sm mt-4">No cost data yet</p>
          ) : (
            <>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costBreakdownData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${formatCost(value)}`}
                      outerRadius={60}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {costBreakdownData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">Input Cost:</span>
                  <span className="font-semibold text-blue-600">{formatCost(costBreakdown.input_cost_usd)} ({costBreakdown.input_cost_percentage.toFixed(1)}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Output Cost:</span>
                  <span className="font-semibold text-pink-600">{formatCost(costBreakdown.output_cost_usd)} ({(100 - costBreakdown.input_cost_percentage).toFixed(1)}%)</span>
                </div>
              </div>
            </>
          )}
        </Card>

        <Card>
          <Title>Rate Limit Status</Title>
          <div className="mt-4">
            <div className="text-center mb-4">
              <Metric className="text-2xl">{(totals.avg_rate_limit_remaining ?? 0).toLocaleString()}</Metric>
              <Text className="text-gray-600 text-sm">Tokens remaining</Text>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>Utilization</span>
                <span className="font-semibold">{rateLimitPct.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    rateLimitPct >= 90 ? 'bg-red-500' : rateLimitPct >= 70 ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(rateLimitPct, 100)}%` }}
                />
              </div>
            </div>
            {totals.min_rate_limit_remaining !== undefined && (
              <p className="text-xs text-gray-500 mt-3">
                Lowest point: {totals.min_rate_limit_remaining.toLocaleString()} tokens
              </p>
            )}
          </div>
        </Card>

        <Card>
          <Title>Rate Limit Timeline</Title>
          {costTimeline.length === 0 ? (
            <p className="text-gray-400 text-sm mt-4">No data yet</p>
          ) : (
            <div className="mt-4 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={costTimeline} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="hour"
                    tickFormatter={(h: string) => h.slice(11, 16)}
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString()}
                    labelFormatter={(l: string) => `${l}`}
                    contentStyle={{ fontSize: 11, borderRadius: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="max_rate_limit_remaining"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
