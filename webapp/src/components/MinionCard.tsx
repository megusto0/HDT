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

  return (
    <span className={`minion-chip ${showImage ? 'with-art' : 'missing-art'} ${asset?.golden ? 'golden' : ''}`} title={`${minion.name} / ${minion.attack}/${minion.health} / tier ${minion.tier}`}>
      {showImage ? <span className="minion-art"><img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} /></span> : null}
      <span className="minion-tier">{minion.tier}</span>
      {showImage ? null : <span className="minion-fallback-name">{minion.name}</span>}
      {hasStats ? <span className={`minion-attack ${String(minion.attack).length > 2 ? 'long' : ''}`}>{minion.attack}</span> : null}
      {hasStats ? <span className={`minion-health ${String(minion.health).length > 2 ? 'long' : ''}`}>{minion.health}</span> : null}
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
