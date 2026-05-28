export const UNKNOWN_HERO_ID = 'unknown';
export const UNKNOWN_HERO_NAME = 'Unknown Hero';

export function isPlaceholderHero(value: unknown) {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === ''
    || normalized === 'unknown'
    || normalized === 'unknown hero'
    || normalized.includes('kelthuzad')
    || normalized.includes("kel'thuzad")
    || normalized.includes('baconphhero')
    || normalized.includes('hero_ph');
}

export function sanitizeHeroId(value: unknown) {
  return isPlaceholderHero(value) ? UNKNOWN_HERO_ID : String(value);
}

export function sanitizeHeroName(value: unknown) {
  return isPlaceholderHero(value) ? UNKNOWN_HERO_NAME : String(value);
}

export function sanitizeGameHero<T extends { hero_id?: unknown; hero_name?: unknown }>(game: T): T {
  return {
    ...game,
    hero_id: sanitizeHeroId(game.hero_id),
    hero_name: sanitizeHeroName(game.hero_name)
  };
}

export function sanitizeHeroStat<T extends { heroId?: unknown; heroName?: unknown }>(hero: T): T {
  return {
    ...hero,
    heroId: sanitizeHeroId(hero.heroId),
    heroName: sanitizeHeroName(hero.heroName)
  };
}

export function hasKnownGameHero(game: { hero_id?: unknown; hero_name?: unknown }) {
  return !isPlaceholderHero(game.hero_id) || !isPlaceholderHero(game.hero_name);
}

export function hasKnownHeroStat(hero: { heroId?: unknown; heroName?: unknown }) {
  return !isPlaceholderHero(hero.heroId) || !isPlaceholderHero(hero.heroName);
}
