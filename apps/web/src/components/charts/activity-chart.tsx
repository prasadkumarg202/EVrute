'use client';

/**
 * Shared 7/30-day activity chart for the owner and admin dashboards.
 *
 * Renders as a Recharts bar chart, but a canvas/SVG chart is invisible to a
 * screen reader — so every render also emits a `sr-only` data table with the
 * same numbers, per WCAG 1.1.1 (non-text content needs a text alternative).
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { formatDate } from '@/lib/utils/format';

export interface ActivityChartSeries {
  readonly key: string;
  readonly label: string;
  /** CSS colour value, e.g. `var(--color-brand-500)`. */
  readonly color: string;
  readonly formatValue?: (value: number) => string;
}

export interface ActivityChartDatum {
  readonly day: string;
  readonly [seriesKey: string]: string | number;
}

export interface ActivityChartProps {
  readonly title: string;
  readonly data: readonly ActivityChartDatum[];
  readonly series: readonly ActivityChartSeries[];
  readonly height?: number;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: TooltipProps<number, string> & { readonly series: readonly ActivityChartSeries[] }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="mb-1 font-medium text-[var(--text-primary)]">{formatDate(String(label))}</p>
      {series.map((s) => {
        const entry = payload.find((p) => p.dataKey === s.key);
        if (!entry || typeof entry.value !== 'number') return null;
        return (
          <p key={s.key} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <span aria-hidden="true" className="inline-block size-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}: <span className="tabular font-medium text-[var(--text-primary)]">
              {s.formatValue ? s.formatValue(entry.value) : entry.value}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function ActivityChart({ title, data, series, height = 260 }: ActivityChartProps) {
  const hasData = data.length > 0 && data.some((d) => series.some((s) => Number(d[s.key] ?? 0) > 0));

  return (
    <div>
      {hasData ? (
        <div style={{ height }} aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...data]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis
                dataKey="day"
                tickFormatter={(value: string) => formatDate(value).replace(/, \d{4}$/, '')}
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<ChartTooltip series={series} />} cursor={{ fill: 'var(--surface-sunken)' }} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          style={{ height }}
          className="flex items-center justify-center rounded-lg border border-dashed border-[var(--border-subtle)] text-sm text-[var(--text-muted)]"
        >
          No activity in this period yet.
        </div>
      )}

      {/* Screen-reader / no-JS accessible equivalent of the chart above. */}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{formatDate(d.day)}</th>
              {series.map((s) => {
                const value = Number(d[s.key] ?? 0);
                return <td key={s.key}>{s.formatValue ? s.formatValue(value) : value}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
