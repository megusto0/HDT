import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getLevelingCurves } from '../api/client';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import type { CurveStats, TierTransition } from '../types';
import { useQuery } from '@tanstack/react-query';

const tiers = [2, 3, 4, 5, 6] as const;
const tierKeys = ['t2', 't3', 't4', 't5', 't6'] as const;
const curveColors = ['#f0c060', '#d4a04a', '#b68a43', '#9f7b3d', '#c9bd9f', '#8a8377', '#6f6658'];

// Pro-guide "standard curve" — the ideal earliest turn to reach each tier.
const STANDARD_REFERENCE = [
  { turn: 1, tier: 1 },
  { turn: 2, tier: 2 },
  { turn: 4, tier: 3 },
  { turn: 6, tier: 4 },
  { turn: 8, tier: 5 },
  { turn: 10, tier: 6 }
];
const TARGET_TURN: Record<number, number> = { 2: 2, 3: 4, 4: 6, 5: 8, 6: 10 };

type TierKey = (typeof tierKeys)[number];
type SortKey = 'archetype' | TierKey | 'games' | 'top4Rate' | 'top1Rate' | 'avgPlacement';

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value: number | null) {
  return value === null ? '–' : value.toFixed(1);
}

function titleCase(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sortRows(rows: CurveStats[], sortKey: SortKey) {
  return [...rows].sort((a, b) => {
    if (sortKey === 'archetype') return a.archetype.localeCompare(b.archetype);
    if (tierKeys.includes(sortKey as TierKey)) {
      const av = a.avgTurnToTier[sortKey as TierKey] ?? Number.POSITIVE_INFINITY;
      const bv = b.avgTurnToTier[sortKey as TierKey] ?? Number.POSITIVE_INFINITY;
      return av - bv || b.top4Rate - a.top4Rate;
    }
    if (sortKey === 'avgPlacement') return a.avgPlacement - b.avgPlacement;
    if (sortKey === 'games') return b.games - a.games;
    if (sortKey === 'top4Rate') return b.top4Rate - a.top4Rate;
    return b.top1Rate - a.top1Rate;
  });
}

function tierCellStyle(rows: CurveStats[], key: TierKey, value: number | null) {
  if (value === null) return undefined;
  const values = rows.map((row) => row.avgTurnToTier[key]).filter((item): item is number => item !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const strength = max === min ? 1 : (max - value) / (max - min);
  return { background: `rgba(212, 160, 74, ${0.08 + strength * 0.26})` };
}

function referencePath(x: (turn: number) => number, y: (tier: number) => number) {
  return STANDARD_REFERENCE.slice(1).reduce(
    (path, point) => `${path} H ${x(point.turn)} V ${y(point.tier)}`,
    `M ${x(STANDARD_REFERENCE[0].turn)} ${y(STANDARD_REFERENCE[0].tier)}`
  );
}

function CurveHeroChart({
  rows,
  hovered,
  hidden,
  onHover,
  onToggle
}: {
  rows: CurveStats[];
  hovered: string | null;
  hidden: Set<string>;
  onHover: (value: string | null) => void;
  onToggle: (value: string) => void;
}) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.top4Rate - a.top4Rate), [rows]);
  const left = 66;
  const top = 28;
  const width = 680;
  const height = 332;
  const x = (turn: number) => left + ((turn - 1) / 13) * width;
  const y = (tier: number) => top + ((6 - tier) / 5) * height;

  function pathFor(row: CurveStats) {
    const points = row.medianCurve.length ? row.medianCurve : Array.from({ length: 14 }, (_, index) => ({ turn: index + 1, tier: 1 }));
    return points.slice(1).reduce((path, point) => {
      return `${path} H ${x(point.turn)} V ${y(point.tier)}`;
    }, `M ${x(points[0].turn)} ${y(points[0].tier)}`);
  }

  return (
    <div className="curve-hero-chart" onMouseLeave={() => onHover(null)}>
      <svg viewBox="0 0 1000 420" role="img" aria-label="Average leveling curve by turn and tavern tier">
        {[1, 2, 3, 4, 5, 6].map((tier) => (
          <g key={tier}>
            <line x1={left} x2={left + width} y1={y(tier)} y2={y(tier)} className="curve-gridline" />
            <text x={20} y={y(tier) + 5} className="curve-y-label">{`T.${tier}`}</text>
          </g>
        ))}
        {Array.from({ length: 14 }, (_, index) => index + 1).map((turn) => (
          <g key={turn}>
            <line x1={x(turn)} x2={x(turn)} y1={top} y2={top + height} className="curve-vline" />
            <text x={x(turn)} y={top + height + 30} className="curve-x-label">{turn}</text>
          </g>
        ))}
        <text x={left + width - 18} y={top + height + 58} className="curve-axis-note">turn</text>

        <path d={referencePath(x, y)} className="curve-reference" />
        {STANDARD_REFERENCE.slice(1).map((point) => (
          <circle key={point.tier} cx={x(point.turn)} cy={y(point.tier)} r={4} className="curve-reference-dot" />
        ))}

        {sorted.map((row, index) => {
          const color = curveColors[index % curveColors.length];
          const isHidden = hidden.has(row.archetype);
          const isHovered = hovered === row.archetype;
          const faded = hovered !== null && !isHovered;
          return (
            <g
              key={row.archetype}
              className="curve-series"
              opacity={isHidden ? 0.1 : faded ? 0.25 : 1}
              onMouseEnter={() => onHover(row.archetype)}
            >
              <path d={pathFor(row)} fill="none" stroke={color} strokeWidth={isHovered ? 3.5 : 2.5} strokeLinecap="square" />
              {tiers.map((tier) => {
                const value = row.avgTurnToTier[`t${tier}` as TierKey];
                if (value === null) return null;
                return (
                  <g key={tier}>
                    <circle cx={x(value)} cy={y(tier)} r={5} fill="var(--bg)" stroke={color} strokeWidth={2} />
                    {isHovered ? (
                      <text x={x(value) + 8} y={y(tier) - 8} className="curve-callout" fill={color}>{`T${tier} @ ${value.toFixed(1)}`}</text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="curve-legend">
        <div className="curve-legend-row reference">
          <span className="curve-swatch dashed" />
          <span>Standard curve</span>
          <b>pro</b>
        </div>
        {sorted.map((row, index) => {
          const color = curveColors[index % curveColors.length];
          const muted = hidden.has(row.archetype);
          return (
            <button
              key={row.archetype}
              type="button"
              className={`curve-legend-row${hovered === row.archetype ? ' active' : ''}${muted ? ' muted-line' : ''}`}
              onMouseEnter={() => onHover(row.archetype)}
              onFocus={() => onHover(row.archetype)}
              onClick={() => onToggle(row.archetype)}
            >
              <span className="curve-swatch" style={{ background: color }} />
              <span>{titleCase(row.archetype)}</span>
              <b>{pct(row.top4Rate)}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function verdictFor(t: TierTransition) {
  if (!t.tempoCritical) return { label: 'Board-led', cls: 'board' };
  if (t.medianTurn === null) return { label: 'No data', cls: 'na' };
  const target = TARGET_TURN[t.tier] ?? t.benchmarkTurn;
  if (t.medianTurn <= target) return { label: 'On curve', cls: 'good' };
  if (t.medianTurn <= t.benchmarkTurn) return { label: 'Drifting', cls: 'warn' };
  return { label: 'Behind lobby', cls: 'bad' };
}

function TierUpCard({ t }: { t: TierTransition }) {
  const verdict = verdictFor(t);
  const maxCount = Math.max(1, ...t.distribution.map((d) => d.count));
  return (
    <article className={`tierup-card v-${verdict.cls}`}>
      <header>
        <span className="tierup-jump">
          <em>T{t.tier - 1}</em>
          <span className="tierup-arrow">→</span>
          <em className="to">T{t.tier}</em>
        </span>
        <span className={`verdict-pill ${verdict.cls}`}>{verdict.label}</span>
      </header>

      <div className="tierup-stats">
        <div>
          <b>{oneDecimal(t.medianTurn)}</b>
          <small>your median turn</small>
        </div>
        <div>
          <b>{t.benchmarkLabel}</b>
          <small>pro benchmark</small>
        </div>
        <div>
          <b>{t.avgHealthAtLevel === null ? '–' : `${t.avgHealthAtLevel}`}</b>
          <small>avg HP at level-up</small>
        </div>
      </div>

      <div className="tierup-dist" aria-label="Turn distribution">
        {t.distribution.length === 0 ? (
          <span className="tierup-dist-empty">no sample</span>
        ) : (
          t.distribution.map((d) => (
            <span key={d.turn} className="dist-col" title={`${d.count} game${d.count === 1 ? '' : 's'} on turn ${d.turn}`}>
              <span
                className={`dist-bar${d.turn <= t.benchmarkTurn ? ' on' : ' behind'}`}
                style={{ height: `${20 + (d.count / maxCount) * 44}px` }}
              />
              <small>{d.turn}</small>
            </span>
          ))
        )}
      </div>

      <div className="tierup-outcome">
        <div className="oc on">
          <span>On pace</span>
          <b>{t.onPace.games ? pct(t.onPace.top4Rate) : '–'}</b>
          <small>top-4 · {t.onPace.games}g</small>
        </div>
        <div className={`oc behind${t.behind.games ? '' : ' empty'}`}>
          <span>Behind</span>
          <b>{t.behind.games ? pct(t.behind.top4Rate) : '–'}</b>
          <small>top-4 · {t.behind.games}g</small>
        </div>
      </div>
    </article>
  );
}

const PRINCIPLES: { tier: string; when: string; rule: string; stay: string }[] = [
  {
    tier: 'T1 → T2',
    when: 'Turn 2 · ~85% of games',
    rule: 'Just level. Skipping it means buying 1-drops while the lobby buys 2-drops — you open turn 3 already behind.',
    stay: 'Stay down only for a 1-cost hero power that must fire every turn, or a curve-fixing spell.'
  },
  {
    tier: 'T2 → T3',
    when: 'Turns 3–5 · curve out with the shop',
    rule: 'Going 3-on-3 beats stalling on trash. Buy strong pairs and synergy combos; skip a beast-less Snapdragon or dragon-less synthesizer and just level instead.',
    stay: 'Never reach T3 later than turn 5 — there is no game-warping reason to be slower.'
  },
  {
    tier: 'T3 → T4',
    when: 'Turns 5–7 · read your board, not the shop',
    rule: 'Full board or a stable five? Level. Not stable? Buy one stabilizing pair / synergy on T3 first, then jump.',
    stay: '4-on-4 (turn 4) is a desperation line off a dead shop — expect a bottom finish.'
  },
  {
    tier: 'T4 → T5 / T6',
    when: 'Timing-independent · board & HP decide',
    rule: 'Ask “what am I leveling for?” and “will I die if I level?”. Name the 5-/6-drops you actually want before pressing the button.',
    stay: '~36 HP can eat a 10-damage swing; a weak board cannot. Meta and tribe set whether the ceiling lives on T5 or T6.'
  }
];

function TurnMatrix({
  rows,
  sortedRows,
  sortKey,
  hovered,
  onSort,
  onHover
}: {
  rows: CurveStats[];
  sortedRows: CurveStats[];
  sortKey: SortKey;
  hovered: string | null;
  onSort: (key: SortKey) => void;
  onHover: (value: string | null) => void;
}) {
  return (
    <table className="data-table curve-matrix">
      <thead>
        <tr>
          <th><button type="button" onClick={() => onSort('archetype')}>Archetype</button></th>
          {tiers.map((tier) => (
            <th key={tier} className="num"><button type="button" onClick={() => onSort(`t${tier}` as TierKey)}>{`T.${tier}`}</button></th>
          ))}
          <th className="num"><button type="button" onClick={() => onSort('games')}>Games</button></th>
          <th className="num"><button type="button" onClick={() => onSort('top4Rate')}>Top-4</button></th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((row) => (
          <tr
            key={row.archetype}
            className={hovered === row.archetype ? 'matrix-row-active' : ''}
            onMouseEnter={() => onHover(row.archetype)}
            onMouseLeave={() => onHover(null)}
          >
            <td>
              <span className="matrix-name">{titleCase(row.archetype)}</span>
              {sortKey === 'archetype' ? <span className="sort-dot" /> : null}
            </td>
            {tierKeys.map((key) => (
              <td key={key} className="num mono tier-cell" style={tierCellStyle(rows, key, row.avgTurnToTier[key])}>
                {oneDecimal(row.avgTurnToTier[key])}
              </td>
            ))}
            <td className="num mono">{row.games}</td>
            <td className="num mono gold">{pct(row.top4Rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LevelingCurves() {
  const curves = useQuery({ queryKey: ['curves'], queryFn: getLevelingCurves });
  const rows = useMemo(() => curves.data?.archetypes ?? [], [curves.data?.archetypes]);
  const transitions = useMemo(() => curves.data?.transitions ?? [], [curves.data?.transitions]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('top4Rate');
  const sortedRows = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);
  const barRows = useMemo(() => [...rows].sort((a, b) => b.top4Rate - a.top4Rate), [rows]);
  const standardCurveRate = curves.data?.baseline.standardCurveRate ?? 0;

  function toggleHidden(archetype: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(archetype)) next.delete(archetype);
      else next.add(archetype);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        kicker="Book II · Tempo"
        title="Of Leveling"
        accent="Curves"
        strap="Every tavern tier is its own decision. Measure each jump against the standard curve."
        meta={
          <>
            <span>Games · <b>{curves.data?.baseline.totalGames ?? 0}</b></span>
            <span>Turn-2 adherence · <b>{pct(standardCurveRate)}</b></span>
            <span>Avg place · <b>{curves.data?.baseline.overallAvgPlacement ?? 0}</b></span>
          </>
        }
      />
      <div className="content-stack leveling-page">
        <Panel title="The Curve — your tiers vs the standard line" code="§ A" className="curve-hero-panel">
          <CurveHeroChart rows={rows} hovered={hovered} hidden={hidden} onHover={setHovered} onToggle={toggleHidden} />
        </Panel>

        <Panel title="Tier-up ledger — when you commit, and what it costs" code="§ B">
          <div className="tierup-grid">
            {transitions.map((t) => (
              <TierUpCard key={t.tier} t={t} />
            ))}
          </div>
          <p className="tierup-foot">
            “On pace” = leveled on or before the benchmark turn; “Behind” = slower than the lobby. Bars show how many of your games hit each turn —
            <span className="swatch-inline on" /> on pace, <span className="swatch-inline behind" /> behind.
          </p>
        </Panel>

        <div className="split-grid">
          <Panel title="Decision principles" code="§ C">
            <div className="principles">
              {PRINCIPLES.map((p) => (
                <article key={p.tier} className="principle">
                  <header>
                    <h3>{p.tier}</h3>
                    <span>{p.when}</span>
                  </header>
                  <p>{p.rule}</p>
                  <p className="principle-stay">{p.stay}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Archetype mix" code="§ D">
            <TurnMatrix rows={rows} sortedRows={sortedRows} sortKey={sortKey} hovered={hovered} onSort={setSortKey} onHover={setHovered} />
            <div className="bar-chart-block curve-bottom-bars">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barRows} layout="vertical" margin={{ top: 12, right: 24, left: 12, bottom: 12 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => pct(Number(v))} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                  <YAxis dataKey="archetype" type="category" width={120} tickFormatter={titleCase} tick={{ fill: 'var(--text)', fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', color: 'var(--text)' }} formatter={(v) => pct(Number(v))} labelFormatter={titleCase} />
                  <Bar dataKey="top4Rate" barSize={14}>
                    {barRows.map((row, index) => (
                      <Cell key={row.archetype} fill={curveColors[index % curveColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
