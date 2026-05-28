import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getLevelingCurves, getMinions, getSummary } from '../api/client';
import HeroPortrait from '../components/HeroPortrait';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import PlacementBadge from '../components/PlacementBadge';
import StatCard from '../components/StatCard';

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function mmrDelta(before: number | null, after: number | null) {
  if (before === null || after === null) return '—';
  const delta = after - before;
  return `${delta > 0 ? '+' : ''}${delta}`;
}

export default function Dashboard() {
  const summary = useQuery({ queryKey: ['summary'], queryFn: getSummary });
  const curves = useQuery({ queryKey: ['curves'], queryFn: getLevelingCurves });
  const minions = useQuery({ queryKey: ['minions', 'mid'], queryFn: () => getMinions({ phase: 'mid', minGames: 1 }) });

  if (summary.isLoading) return <div className="loading">Загружаю летопись...</div>;
  if (summary.isError || !summary.data) return <div className="error">Не удалось получить данные API.</div>;

  const bestCurve = [...(curves.data?.archetypes ?? [])].sort((a, b) => b.top4Rate - a.top4Rate)[0];
  const bestMinion = minions.data?.minions[0];
  const topHero = summary.data.heroStats[0];

  return (
    <>
      <PageHeader
        kicker="Том I · Раздел I"
        title="Сводка"
        accent="поля боя"
        strap="короткий учет рейтинга, героев, покупок и темпа прокачки"
        meta={
          <>
            <span>Сезон · <b>MMXXVI</b></span>
            <span>Последний MMR · <b>{summary.data.latestMmr?.toLocaleString('ru-RU') ?? '—'}</b></span>
            <span>Партии · <b>{summary.data.totalGames}</b></span>
          </>
        }
      />

      <div className="content-stack">
        <div className="stat-row">
          <StatCard label="Всего партий" value={summary.data.totalGames} sub="локальная база HDTBgTracker" />
          <StatCard label="Среднее место" value={summary.data.avgPlacement ?? '—'} sub="чем ниже, тем лучше" />
          <StatCard label="Top-4" value={pct(summary.data.top4Rate)} sub="партии с положительным результатом" />
          <StatCard label="Победы" value={pct(summary.data.top1Rate)} sub="первое место в лобби" />
        </div>

        <div className="split-grid">
          <Panel title="Последние 10 партий" code="§ A" actions={<Link to="/games">Все партии</Link>}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Герой</th>
                  <th>Место</th>
                  <th className="num">Δ MMR</th>
                  <th className="num">Длит.</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.recentGames.map((game) => (
                  <tr key={game.id}>
                    <td className="mono muted">{new Date(game.started_at).toLocaleDateString('ru-RU')}</td>
                    <td>
                      <Link to={`/games/${game.id}`}>
                        <HeroPortrait name={game.hero_name} id={game.hero_id} compact />
                      </Link>
                    </td>
                    <td><PlacementBadge value={game.placement} /></td>
                    <td className="num mono">{mmrDelta(game.mmr_before, game.mmr_after)}</td>
                    <td className="num mono muted">{game.duration_seconds ? `${Math.round(game.duration_seconds / 60)}м` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Герои · сезон" code="§ B">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Герой</th>
                  <th className="num">Игры</th>
                  <th className="num">Ср.</th>
                  <th className="num">Top-4</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.heroStats.map((hero) => (
                  <tr key={hero.heroId}>
                    <td><HeroPortrait name={hero.heroName} id={hero.heroId} compact /></td>
                    <td className="num mono">{hero.games}</td>
                    <td className="num mono">{hero.avgPlacement.toFixed(1)}</td>
                    <td className="num mono gold">{pct(hero.top4Rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <Panel title="Рейтинг · последние партии" code="§ C" actions={<span>текущий {summary.data.latestMmr ?? '—'}</span>}>
          <div className="chart-lg">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.data.mmrTimeline.map((point, index) => ({ ...point, index: index + 1 }))}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="index" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} domain={['dataMin - 80', 'dataMax + 80']} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', color: 'var(--text)' }} />
                <Line dataKey="mmr_after" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--bg)' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <div className="insight-grid">
          <Panel title="Чаще всего" code="i">
            <div className="insight-big">{topHero ? <HeroPortrait name={topHero.heroName} id={topHero.heroId} /> : '—'}</div>
            <p>{topHero ? `${topHero.games} игр · среднее место ${topHero.avgPlacement.toFixed(1)}` : 'Нет данных'}</p>
          </Panel>
          <Panel title="Лучшая кривая" code="ii">
            <div className="insight-big">{bestCurve?.archetype.replace(/-/g, ' ') ?? '—'}</div>
            <p>{bestCurve ? `${pct(bestCurve.top4Rate)} Top-4 · ${bestCurve.games} игр` : 'Нет данных'}</p>
          </Panel>
          <Panel title="Миньон середины" code="iii">
            <div className="insight-big">{bestMinion?.cardName ?? '—'}</div>
            <p>{bestMinion ? `Δ ${bestMinion.deltaVsBaseline} · ${bestMinion.games} игр` : 'Нет данных'}</p>
          </Panel>
        </div>
      </div>
    </>
  );
}
