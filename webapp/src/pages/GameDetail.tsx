import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { getGame } from '../api/client';
import { getEntityImage, getTrinketAsset } from '../assets/cardAssets';
import BoardView from '../components/BoardView';
import HeroPortrait from '../components/HeroPortrait';
import PageHeader from '../components/PageHeader';
import Panel from '../components/Panel';
import PlacementBadge from '../components/PlacementBadge';
import type { GameDetailResponse } from '../types';

type Trinket = GameDetailResponse['trinkets'][number];

function slotLabel(slot: Trinket['slot']) {
  if (slot === 'lesser') return 'младший';
  if (slot === 'greater') return 'старший';
  return 'тринкет';
}

function trinketBaseId(value?: string | null) {
  return String(value ?? '').replace(/t$/, '');
}

function isPlaceholderTrinketOffer(offer: Trinket['offered'][number]) {
  const normalizedName = String(offer.name ?? '').trim().toLowerCase();
  return offer.cardId === 'BG30_Trinket_1st'
    || offer.cardId === 'BG30_Trinket_2nd'
    || normalizedName === 'lesser trinket'
    || normalizedName === 'greater trinket';
}

function TrinketOffer({ offer }: { offer: Trinket['offered'][number] }) {
  const [imageFailed, setImageFailed] = useState(false);
  const offerAsset = getTrinketAsset(offer.cardId, offer.name);
  const offerImage = getEntityImage(offerAsset);
  const showImage = Boolean(offerImage && !imageFailed);

  return (
    <span className={`trinket-offer ${showImage ? 'with-art' : 'text-only'}`} title={offer.name}>
      {showImage ? <img src={offerImage} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : offer.name}
    </span>
  );
}

function TrinketCard({ trinket }: { trinket: Trinket }) {
  const [imageFailed, setImageFailed] = useState(false);
  const selectedName = trinket.selected_name ?? 'Неизвестный тринкет';
  const asset = getTrinketAsset(trinket.selected_card_id ?? undefined, selectedName);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);
  const selectedBaseId = trinketBaseId(trinket.selected_card_id);
  const seenOffers = new Set<string>();
  const offered = trinket.offered
    .filter((offer) => (offer.cardId || offer.name) && !isPlaceholderTrinketOffer(offer))
    .filter((offer) => trinketBaseId(offer.cardId) !== selectedBaseId)
    .filter((offer) => {
      const key = `${trinketBaseId(offer.cardId)}:${String(offer.name).trim().toLowerCase()}`;
      if (seenOffers.has(key)) return false;
      seenOffers.add(key);
      return true;
    })
    .slice(0, 3);

  return (
    <article className={`trinket-card ${showImage ? 'with-art' : ''}`}>
      {showImage ? <div className="trinket-art"><img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} /></div> : null}
      <div className="trinket-body">
        <span className="row-label">{slotLabel(trinket.slot)} · ход {trinket.turn_number}</span>
        <h3>{selectedName}</h3>
        {offered.length ? (
          <div className="trinket-offers" aria-label="Видимые варианты тринкетов">
            {offered.map((offer) => <TrinketOffer key={`${offer.cardId}-${offer.name}`} offer={offer} />)}
          </div>
        ) : (
          <p>Варианты выбора не попали в snapshot HDT.</p>
        )}
      </div>
    </article>
  );
}

export default function GameDetail() {
  const { id } = useParams<{ id: string }>();
  const game = useQuery({ queryKey: ['game', id], queryFn: () => getGame(id!), enabled: Boolean(id) });

  if (game.isLoading) return <div className="loading">Открываю матч...</div>;
  if (game.isError || !game.data) return <div className="error">Матч не найден.</div>;

  const purchaseByTurn = new Map<number, string[]>();
  for (const purchase of game.data.purchases) {
    const list = purchaseByTurn.get(purchase.turn_number) ?? [];
    list.push(`куплен ${purchase.card_name}`);
    purchaseByTurn.set(purchase.turn_number, list);
  }
  for (const upgrade of game.data.upgrades) {
    const list = purchaseByTurn.get(upgrade.turn_number) ?? [];
    list.push(`${upgrade.id < 0 ? 'ап по кривой' : 'ап'} ${upgrade.from_tier}→${upgrade.to_tier}`);
    purchaseByTurn.set(upgrade.turn_number, list);
  }
  const finalBoard = game.data.turns.at(-1)?.board ?? [];
  const derivedUpgrades = game.data.upgrades.filter((upgrade) => upgrade.id < 0).length;
  const purchaseSummary = game.data.purchases.length ? String(game.data.purchases.length) : 'не записываются';
  const combatSummary = game.data.combats.length ? String(game.data.combats.length) : 'не записываются';
  const upgradeSummary = derivedUpgrades ? `${game.data.upgrades.length} (по кривой таверны)` : String(game.data.upgrades.length);
  const heroIsKnown = game.data.game.hero_id !== 'unknown' && game.data.game.hero_name !== 'Unknown Hero';
  const heroTitle = heroIsKnown ? game.data.game.hero_name : 'Матч без героя';
  const chartTurns = [...game.data.turns];
  const lastTurn = chartTurns.at(-1);
  if (lastTurn && game.data.game.placement && game.data.game.placement > 1 && lastTurn.health > 0) {
    chartTurns.push({
      ...lastTurn,
      id: -1,
      turn_number: lastTurn.turn_number + 1,
      health: 0
    });
  }
  const minHealth = Math.min(0, ...chartTurns.map((turn) => turn.health ?? 0));

  return (
    <>
      <PageHeader
        kicker="Том I · Матч"
        title={heroTitle}
        accent={`#${game.data.game.id.slice(-6)}`}
        strap={`${new Date(game.data.game.started_at).toLocaleString('ru-RU')} · ${game.data.game.duration_seconds ? Math.round(game.data.game.duration_seconds / 60) : '—'} минут`}
        meta={
          <div className="detail-hero">
            {heroIsKnown ? <HeroPortrait name={game.data.game.hero_name} id={game.data.game.hero_id} /> : null}
            <PlacementBadge value={game.data.game.placement} large />
          </div>
        }
      />
      <div className="content-stack">
        <Panel title="Кривая таверны и здоровье" code="§ A" actions={<Link to="/games">Назад к партиям</Link>}>
          <div className="curve-detail-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartTurns}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="turn_number" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickFormatter={(v) => `Х${v}`} />
                <YAxis yAxisId="tier" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} allowDecimals={false} domain={[1, 6]} />
                <YAxis yAxisId="health" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} domain={[minHealth, 45]} />
                <Tooltip contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--accent)', color: 'var(--text)' }} />
                <Area yAxisId="health" dataKey="health" fill="rgba(107, 163, 104, .18)" stroke="var(--green)" />
                <Line yAxisId="tier" type="stepAfter" dataKey="tavern_tier" stroke="var(--accent)" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        {game.data.trinkets.length ? (
          <Panel title="Тринкеты" code="§ T">
            <div className="trinket-grid">
              {game.data.trinkets.map((trinket) => <TrinketCard key={trinket.id} trinket={trinket} />)}
            </div>
          </Panel>
        ) : null}

        <div className="detail-grid">
          <Panel title="Ход за ходом" code="§ B">
            <div className="turn-list">
              {game.data.turns.map((turn) => (
                <article key={turn.id} className="turn-row">
                  <div className="turn-num">
                    <strong>{turn.turn_number}</strong>
                    <span>T{turn.tavern_tier}</span>
                  </div>
                  <div>
                    <span className="row-label">стол</span>
                    <BoardView minions={turn.board} />
                  </div>
                  <p>{purchaseByTurn.get(turn.turn_number)?.join(' · ') ?? 'без событий'}</p>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Бои" code="§ C">
            <div className="combat-list">
              {game.data.combats.map((combat) => (
                <article key={combat.id} className={`combat-card ${combat.result}`}>
                  <header>
                    <span>Ход {combat.turn_number}</span>
                    <b>{combat.result === 'win' ? 'W' : combat.result === 'loss' ? 'L' : 'T'}</b>
                  </header>
                  <p className="mono">+{combat.damage_dealt ?? 0} / -{combat.damage_taken ?? 0}</p>
                  <BoardView minions={combat.opponentBoard} slots={5} />
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Финальный состав" code="§ D">
          <div className="final-board">
            <div className="final-cards">
              <BoardView minions={finalBoard} />
            </div>
            <aside>
              <h3>Итог матча</h3>
              <p>Покупок: {purchaseSummary}. Улучшений таверны: {upgradeSummary}. Боёв: {combatSummary}. Тринкетов: {game.data.trinkets.length}.</p>
              <p>JSON-аудит: {game.data.game.raw_json_path ?? 'будет создан плагином после реальной партии'}.</p>
            </aside>
          </div>
        </Panel>
      </div>
    </>
  );
}
