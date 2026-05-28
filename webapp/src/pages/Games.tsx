import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getGames } from '../api/client';
import HeroPortrait from '../components/HeroPortrait';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import PlacementBadge from '../components/PlacementBadge';

export default function Games() {
  const games = useQuery({ queryKey: ['games'], queryFn: () => getGames({ limit: 100 }) });

  return (
    <>
      <PageHeader
        kicker="Том I · Раздел II"
        title="Партии"
        accent="журнал"
        strap="фильтруемый список матчей: герой, место, рейтинг и длительность"
        meta={<span>Записей · <b>{games.data?.games.length ?? '—'}</b></span>}
      />
      <div className="content-stack">
        <Panel title="Матчи" code="§ A" actions={<span>новые сверху</span>}>
          <table className="data-table roomy">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Герой</th>
                <th>Место</th>
                <th className="num">MMR до</th>
                <th className="num">MMR после</th>
                <th className="num">Δ</th>
                <th className="num">Длит.</th>
              </tr>
            </thead>
            <tbody>
              {games.data?.games.map((game) => {
                const delta = game.mmr_before !== null && game.mmr_after !== null ? game.mmr_after - game.mmr_before : null;
                return (
                  <tr key={game.id}>
                    <td className="mono muted">{new Date(game.started_at).toLocaleString('ru-RU')}</td>
                    <td>
                      <Link to={`/games/${game.id}`}>
                        <HeroPortrait name={game.hero_name} id={game.hero_id} compact />
                      </Link>
                    </td>
                    <td><PlacementBadge value={game.placement} /></td>
                    <td className="num mono">{game.mmr_before ?? '—'}</td>
                    <td className="num mono">{game.mmr_after ?? '—'}</td>
                    <td className={`num mono ${delta !== null && delta > 0 ? 'green' : delta !== null && delta < 0 ? 'red' : ''}`}>
                      {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                    </td>
                    <td className="num mono muted">{game.duration_seconds ? `${Math.round(game.duration_seconds / 60)}м` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
    </>
  );
}

