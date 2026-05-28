import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { CurveStats } from '../types';

export function curveToPoints(curve: CurveStats) {
  return [2, 3, 4, 5, 6].map((tier) => ({
    tier,
    turn: curve.avgTurnToTier[`t${tier}` as keyof CurveStats['avgTurnToTier']]
  }));
}

export default function CurveChart({ curve, height = 140 }: { curve: CurveStats; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curveToPoints(curve)} margin={{ top: 12, right: 12, bottom: 8, left: 0 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis dataKey="tier" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `T${v}`} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', color: 'var(--text)' }} />
          <Line type="monotone" dataKey="turn" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4, fill: 'var(--bg)' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
