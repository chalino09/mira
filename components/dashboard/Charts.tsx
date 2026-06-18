"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const chartProps = {
  stroke: "#E6E6E2",
  fontSize: 12,
  tickLine: false,
  axisLine: false
};

export function YieldChart({ data }: { data: { label: string; kg: number }[] }) {
  return (
    <div className="h-64 rounded-app border border-app-border bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Rendimiento por semana</h3>
      <div className="mt-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#E6E6E2" vertical={false} />
            <XAxis dataKey="label" {...chartProps} />
            <YAxis {...chartProps} />
            <Tooltip />
            <Line dataKey="kg" stroke="#1C3A2A" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function IrrigationChart({ data }: { data: { label: string; litros: number }[] }) {
  return (
    <div className="h-64 rounded-app border border-app-border bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Riego semanal</h3>
      <div className="mt-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="#E6E6E2" vertical={false} />
            <XAxis dataKey="label" {...chartProps} />
            <YAxis {...chartProps} />
            <Tooltip />
            <Bar dataKey="litros" fill="#1C3A2A" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CostChart({ data }: { data: { category: string; amount: number }[] }) {
  return (
    <div className="h-64 rounded-app border border-app-border bg-white p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-app-muted">Costos por categoría</h3>
      <div className="mt-4 h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid stroke="#E6E6E2" horizontal={false} />
            <XAxis type="number" hide />
            <YAxis dataKey="category" type="category" width={96} {...chartProps} />
            <Tooltip />
            <Bar dataKey="amount" fill="#1C3A2A" radius={[0, 8, 8, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
