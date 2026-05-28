import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getLevelingCurves } from '../api/client';
import { getEntityImage, getMinionAsset } from '../assets/cardAssets';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import type { CurveStats } from '../types';
import { useQuery } from '@tanstack/react-query';

const tiers = [2, 3, 4, 5, 6] as const;
const tierKeys = ['t2', 't3', 't4', 't5', 't6'] as const;
const curveColors = ['#f0c060', '#d4a04a', '#b68a43', '#9f7b3d', '#c9bd9f', '#8a8377', '#6f6658'];

type TierKey = (typeof tierKeys)[number];
type SortKey = 'archetype' | TierKey | 'games' | 'top4Rate' | 'top1Rate' | 'avgPlacement';

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function oneDecimal(value: number | null) {
  return value === null ? '-' : value.toFixed(1);
}

function titleCase(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function CommonMinionTile({ minion }: { minion: CurveStats['commonMinions'][number] }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = getMinionAsset(minion.cardId, minion.cardName);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);
  return (
    <span className={`common-minion-tile ${showImage ? 'with-art' : ''}`}>
      {showImage ? <span className="minion-portrait"><img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} /></span> : null}
      <b>{minion.cardName}</b>
      <small>{minion.phase} / {minion.count}</small>
    </span>
  );
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
                    <text x={x(value) + 8} y={y(tier) - 8} className="curve-callout" fill={color}>{`T${tier} @ ${value.toFixed(1)}`}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="curve-legend">
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
          <th className="num"><button type="button" onClick={() => onSort('top1Rate')}>Top-1</button></th>
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
            <td className="num mono">{pct(row.top1Rate)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LevelingCurves() {
  const curves = useQuery({ queryKey: ['curves'], queryFn: getLevelingCurves });
  const rows = useMemo(() => curves.data?.archetypes ?? [], [curves.data?.archetypes]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('top4Rate');
  const sortedRows = useMemo(() => sortRows(rows, sortKey), [rows, sortKey]);
  const barRows = useMemo(() => [...rows].sort((a, b) => b.top4Rate - a.top4Rate), [rows]);
  const medianTop4 = rows.length ? [...rows].sort((a, b) => a.top4Rate - b.top4Rate)[Math.floor(rows.length / 2)].top4Rate : 0;

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
        strap="Average turn-to-tier first, win rate second."
        meta={
          <>
            <span>Archetypes · <b>{rows.length}</b></span>
            <span>Games · <b>{curves.data?.baseline.totalGames ?? 0}</b></span>
            <span>Median Top-4 · <b>{pct(medianTop4)}</b></span>
          </>
        }
      />
      <div className="content-stack leveling-page">
        <Panel title="Average Curve — Turn x Tavern Tier" code="§ A" className="curve-hero-panel">
          <CurveHeroChart rows={rows} hovered={hovered} hidden={hidden} onHover={setHovered} onToggle={toggleHidden} />
        </Panel>

        <Panel title="Turn-to-tier matrix" code="§ B">
          <TurnMatrix rows={rows} sortedRows={sortedRows} sortKey={sortKey} hovered={hovered} onSort={setSortKey} onHover={setHovered} />
        </Panel>

        <div className="curve-grid">
          <Panel title="Archetype deep dive" code="§ C">
            <div className="curve-list deep-curve-list">
              {sortedRows.map((curve) => (
                <article
                  key={curve.archetype}
                  className={`curve-row deep-curve-row${hovered === curve.archetype ? ' active' : ''}`}
                  onMouseEnter={() => setHovered(curve.archetype)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <header>
                    <h3>{titleCase(curve.archetype)}</h3>
                    <p>{curve.games} games · avg place {curve.avgPlacement} · Top-4 {pct(curve.top4Rate)} · Top-1 {pct(curve.top1Rate)}</p>
                  </header>
                  <div className="sample-games">
                    {curve.sampleGameIds.slice(0, 6).map((id) => (
                      <a key={id} href={`/games/${id}`} className="sample-game-card">
                        <span>sample</span>
                        <b>{id.slice(-6)}</b>
                      </a>
                    ))}
                  </div>
                  <p className="curve-prose">
                    {titleCase(curve.archetype)} reaches T4 around turn {oneDecimal(curve.avgTurnToTier.t4)} and converts that tempo into a {pct(curve.top4Rate)} Top-4 rate.
                  </p>
                  <div className="common-minions">
                    {(curve.commonMinions.length ? curve.commonMinions : [{ cardId: 'none', cardName: 'No purchase sample yet', phase: 'early' as const, count: 0 }]).map((minion) => (
                      <CommonMinionTile key={`${minion.cardId}-${minion.phase}`} minion={minion} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Curve cheatsheet" code="§ D">
            <div className="almanac-note">
              <p>Hyper-fast curves buy tempo with health. They should win early fights or convert quickly into direction.</p>
              <p>Economy and late-tier-6 curves need a stable board before the expensive turns. Their reward is ceiling, not safety.</p>
              <p>Tier-3 stall and tier-4 rush are middle paths: they are best when shops offer a clear package before the lobby outscales you.</p>
            </div>
          </Panel>
        </div>

        <Panel title="Top-4 rate by archetype" code="§ E">
          <div className="bar-chart-block curve-bottom-bars">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barRows} layout="vertical" margin={{ top: 12, right: 24, left: 24, bottom: 12 }}>
                <CartesianGrid stroke="var(--border)" horizontal={false} />
                <XAxis type="number" domain={[0, 1]} tickFormatter={(v) => pct(Number(v))} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis dataKey="archetype" type="category" width={130} tickFormatter={titleCase} tick={{ fill: 'var(--text)', fontSize: 12 }} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', color: 'var(--text)' }} formatter={(v) => pct(Number(v))} labelFormatter={titleCase} />
                <Bar dataKey="top4Rate" barSize={16}>
                  {barRows.map((row, index) => (
                    <Cell key={row.archetype} fill={curveColors[index % curveColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </>
  );
}
