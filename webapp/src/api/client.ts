import type { GameDetailResponse, GameListItem, LevelingCurvesResponse, MinionStat, Summary } from '../types';

export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5174' : window.location.origin);

export function getApiDisplayHost() {
  try {
    return new URL(API_URL).host;
  }
  catch {
    return API_URL;
  }
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export function getHealth() {
  return request<{ ok: true }>('/api/health');
}

export function getSummary() {
  return request<Summary>('/api/summary');
}

export function getGames(params: { hero?: string; limit?: number } = {}) {
  const search = new URLSearchParams();
  if (params.hero) search.set('hero', params.hero);
  if (params.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  return request<{ games: GameListItem[] }>(`/api/games${qs ? `?${qs}` : ''}`);
}

export function getGame(id: string) {
  return request<GameDetailResponse>(`/api/games/${id}`);
}

export function getLevelingCurves() {
  return request<LevelingCurvesResponse>('/api/analytics/leveling-curves');
}

export function getMinions(params: { phase: 'early' | 'mid' | 'late'; minGames?: number; heroId?: string }) {
  const search = new URLSearchParams({ phase: params.phase, minGames: String(params.minGames ?? 1) });
  if (params.heroId) search.set('heroId', params.heroId);
  return request<{ minions: MinionStat[] }>(`/api/analytics/minions?${search.toString()}`);
}
