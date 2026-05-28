import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMinions } from '../api/client';
import { getEntityImage, getMinionAsset } from '../assets/cardAssets';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';

const phases = [
  { id: 'early', label: 'Ранняя', desc: 'ходы 2-4' },
  { id: 'mid', label: 'Средняя', desc: 'ходы 5-7' },
  { id: 'late', label: 'Поздняя', desc: 'ход 8+' }
] as const;

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function MinionIcon({ cardId, cardName }: { cardId: string; cardName: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = getMinionAsset(cardId, cardName);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);

  return showImage ? (
    <span className="minion-portrait">
      <img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} />
    </span>
  ) : null;
}

export default function Minions() {
  const [phase, setPhase] = useState<(typeof phases)[number]['id']>('early');
  const minions = useQuery({ queryKey: ['minions', phase], queryFn: () => getMinions({ phase, minGames: 1 }) });

  return (
    <>
      <PageHeader
        kicker="Том III · Покупки"
        title="Миньоны"
        accent="и победы"
        strap="связь между миньонами на столе или покупками в фазе партии и личным средним результатом"
        meta={<span>Фаза · <b>{phases.find((item) => item.id === phase)?.label}</b></span>}
      />
      <div className="content-stack">
        <div className="phase-tabs">
          {phases.map((item) => (
            <button key={item.id} className={item.id === phase ? 'active' : ''} onClick={() => setPhase(item.id)}>
              <span>{item.label}</span>
              <small>{item.desc}</small>
            </button>
          ))}
        </div>

        <Panel title="Миньоны по Δ к базе" code="§ A" actions={<span>меньше лучше</span>}>
          <table className="data-table roomy">
            <thead>
              <tr>
                <th>Миньон</th>
                <th className="num">Тир</th>
                <th className="num">Игры</th>
                <th className="num">Ср. место</th>
                <th className="num">Top-4</th>
                <th className="num">Top-1</th>
                <th className="num">Δ</th>
              </tr>
            </thead>
            <tbody>
              {minions.data?.minions.map((minion) => (
                  <tr key={`${minion.cardId}-${minion.phase}`}>
                    <td>
                      <span className="minion-name with-icon">
                        <MinionIcon cardId={minion.cardId} cardName={minion.cardName} />
                        <span>{minion.cardName}</span>
                      </span>
                      <small>{minion.cardId}</small>
                    </td>
                    <td className="num mono gold">{minion.tier}</td>
                    <td className="num mono">{minion.games}</td>
                    <td className="num mono">{minion.avgPlacement}</td>
                    <td className="num mono">{pct(minion.top4Rate)}</td>
                    <td className="num mono">{pct(minion.top1Rate)}</td>
                    <td className={`num mono ${minion.deltaVsBaseline < 0 ? 'green' : minion.deltaVsBaseline > 0 ? 'red' : ''}`}>
                      {minion.deltaVsBaseline > 0 ? '+' : ''}{minion.deltaVsBaseline}
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
          {!minions.isLoading && !minions.data?.minions.length ? (
            <div className="empty-state">
              <b>Нет выборки для этой фазы.</b>
              <p>Страница строится по покупкам и миньонам, замеченным на столе в сохранённых ходах. После нескольких полных партий таблица заполнится.</p>
            </div>
          ) : null}
        </Panel>
      </div>
    </>
  );
}
