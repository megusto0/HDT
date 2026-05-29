import { useState } from 'react';
import { getEntityImage, getMinionAsset } from '../assets/cardAssets';
import type { BoardMinion } from '../types';

function abbrev(name: string) {
  return name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3).toUpperCase();
}

export function MinionChip({ minion }: { minion: BoardMinion }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = getMinionAsset(minion.cardId, minion.name);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);
  const hasStats = minion.attack > 0 || minion.health > 0;
  const tier = minion.tier >= 1 && minion.tier <= 7 ? minion.tier : null;
  const title = `${minion.name} / ${minion.attack}/${minion.health} / tier ${minion.tier}`;

  if (!showImage) {
    return (
      <span className={`minion-chip missing-art ${asset?.golden ? 'golden' : ''}`} title={title}>
        <span className="minion-tier">{minion.tier}</span>
        <span className="minion-fallback-name">{minion.name}</span>
        {hasStats ? <span className={`minion-attack ${String(minion.attack).length > 2 ? 'long' : ''}`}>{minion.attack}</span> : null}
        {hasStats ? <span className={`minion-health ${String(minion.health).length > 2 ? 'long' : ''}`}>{minion.health}</span> : null}
        {minion.taunt ? <span className="dot taunt" /> : null}
        {minion.divineShield ? <span className="dot shield" /> : null}
      </span>
    );
  }

  return (
    <span className={`minion-chip with-art ${asset?.golden ? 'golden' : ''}`} title={title}>
      <img className="bm-portrait" src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} />
      <img className="bm-frame" src="/assets/hsbg/ui/minion-border.png" alt="" aria-hidden="true" />
      {hasStats ? <span className="bm-stat bm-atk">{minion.attack}</span> : null}
      {hasStats ? <span className="bm-stat bm-hp">{minion.health}</span> : null}
      {tier ? <img className="bm-tier" src={`/assets/hsbg/ui/tier-${tier}.png`} alt={`Tier ${tier}`} loading="lazy" /> : null}
      {minion.taunt ? <span className="dot taunt" /> : null}
      {minion.divineShield ? <span className="dot shield" /> : null}
    </span>
  );
}

export default function MinionCard({ minion }: { minion: BoardMinion }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = getMinionAsset(minion.cardId, minion.name);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);
  const hasStats = minion.attack > 0 || minion.health > 0;

  return (
    <article className={`minion-card ${showImage ? 'with-art' : 'missing-art'} ${asset?.golden ? 'golden' : ''}`}>
      {showImage ? <img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} /> : null}
      <span className="minion-card-tier">T{minion.tier}</span>
      <h3>{minion.name}</h3>
      <strong>{asset ? asset.tribe ?? '' : abbrev(minion.name)}</strong>
      {hasStats ? (
        <footer>
          <span>{minion.attack}</span>
          <span>{minion.health}</span>
        </footer>
      ) : null}
    </article>
  );
}
