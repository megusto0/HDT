import { useState } from 'react';
import { getEntityImage, getHeroAsset } from '../assets/cardAssets';

export default function HeroPortrait({ name, id, compact = false }: { name: string; id?: string; compact?: boolean }) {
  const asset = getHeroAsset(id, name);
  const fallbackImage = getEntityImage(asset);
  // Prefer the square 256x character crop (same source the minions use). The manifest
  // hero `portraitPath` is a wide "tile" strip that crops to just an ear in a square box.
  const baseId = (asset?.id ?? id)?.replace(/_G$/, '');
  const primaryImage = baseId ? `https://art.hearthstonejson.com/v1/256x/${baseId}.webp` : fallbackImage;
  const [src, setSrc] = useState(primaryImage);
  const showImage = Boolean(src);

  const handleError = () => {
    if (fallbackImage && src !== fallbackImage) setSrc(fallbackImage);
    else setSrc(undefined);
  };

  return (
    <span className={`hero-chip ${compact ? 'compact' : ''} ${showImage ? 'with-art' : 'text-only'}`} title={id}>
      {showImage ? <span className="hero-mark"><img src={src} alt="" loading="lazy" onError={handleError} /></span> : null}
      <span>{name}</span>
    </span>
  );
}
