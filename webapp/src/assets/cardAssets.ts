import manifest from '../data/card-assets.json';

type CardAsset = {
  id: string;
  dbfId?: number;
  slug?: string;
  name: string;
  type: 'hero' | 'minion' | 'trinket';
  tier?: number | null;
  tribe?: string | null;
  path: string;
  portraitPath?: string;
  golden?: boolean;
};

type CardAssetManifest = {
  byId: Record<string, CardAsset>;
  byName: Record<string, CardAsset>;
};

const assets = manifest as CardAssetManifest;

export function normalizeCardName(value: string | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function getCardAsset(id?: string, name?: string): CardAsset | undefined {
  if (id && assets.byId[id]) return assets.byId[id];
  const baseId = id?.replace(/_G$/, '');
  if (baseId && assets.byId[baseId]) return { ...assets.byId[baseId], golden: id !== baseId };
  const key = normalizeCardName(name);
  return key ? assets.byName[key] : undefined;
}

export function getTypedCardAsset(type: CardAsset['type'], id?: string, name?: string): CardAsset | undefined {
  const byId = id ? getCardAsset(id, undefined) : undefined;
  if (byId?.type === type) return byId;
  const byName = getCardAsset(undefined, name);
  return byName?.type === type ? byName : undefined;
}

export function getHeroAsset(id?: string, name?: string) {
  return getTypedCardAsset('hero', id, name);
}

export function getMinionAsset(id?: string, name?: string) {
  return getTypedCardAsset('minion', id, name);
}

export function getTrinketAsset(id?: string, name?: string) {
  return getTypedCardAsset('trinket', id, name);
}

export function getEntityImage(asset: CardAsset | undefined) {
  return asset?.portraitPath ?? asset?.path;
}
