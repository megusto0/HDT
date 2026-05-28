import { useState } from 'react';
import { getEntityImage, getHeroAsset } from '../assets/cardAssets';

export default function HeroPortrait({ name, id, compact = false }: { name: string; id?: string; compact?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const asset = getHeroAsset(id, name);
  const image = getEntityImage(asset);
  const showImage = Boolean(image && !imageFailed);

  return (
    <span className={`hero-chip ${compact ? 'compact' : ''} ${showImage ? 'with-art' : 'text-only'}`} title={id}>
      {showImage ? <span className="hero-mark"><img src={image} alt="" loading="lazy" onError={() => setImageFailed(true)} /></span> : null}
      <span>{name}</span>
    </span>
  );
}
