/**
 * Horizontal bar chart for Try it results. Local because the shared SimpleBarChart wraps its <XAxis>/<YAxis> in a
 * React fragment, which Recharts 2 does not see (no axes, and the horizontal layout collapses to one bar).
 */
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { ChartFrame, useChartColors } from '@x10/shared/charts';

import { formatNumber } from '../domain/queries';

const compact = (v: number) =>
  Math.abs(v) >= 1000 ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v) : formatNumber(v);

export function ResultBarChart({
  data,
  measure,
  title,
  summary,
}: {
  data: { label: string; value: number }[];
  measure: string;
  title: string;
  summary: string;
}) {
  const c = useChartColors();
  const height = Math.max(140, data.length * 26 + 40);
  const labelWidth = Math.min(160, Math.max(60, Math.max(...data.map((d) => d.label.length)) * 7 + 8));
  return (
    <ChartFrame title={title} summary={summary} height={height} empty={!data.length}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" stroke={c.muted} tick={{ fill: c.muted, fontSize: 12 }} tickLine={false} tickFormatter={compact} />
          <YAxis
            type="category"
            dataKey="label"
            width={labelWidth}
            stroke={c.muted}
            tick={{ fill: c.muted, fontSize: 12 }}
            tickLine={false}
            interval={0}
            tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.4 }}
            formatter={(v: number) => [formatNumber(v), measure]}
            contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, color: c.text }}
            labelStyle={{ color: c.text, fontWeight: 600 }}
            itemStyle={{ color: c.text }}
          />
          <Bar dataKey="value" name={measure} fill={c.series[0]} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
