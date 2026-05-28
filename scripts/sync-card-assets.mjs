import { access, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = resolve(import.meta.dirname, '..');
const dataDir = process.env.HDT_BG_TRACKER_DATA ?? join(process.env.APPDATA ?? '', 'HDTBgTracker');
const gamesDir = join(dataDir, 'games');
const publicAssetDir = join(root, 'webapp', 'public', 'assets', 'hsbg', 'cards');
const manifestPath = join(root, 'webapp', 'src', 'data', 'card-assets.json');
const apiBase = 'https://hsbg.cards';
const hearthstoneJsonApi = 'https://api.hearthstonejson.com/v1/latest/enUS/cards.json';
const hearthstoneJsonArt = 'https://art.hearthstonejson.com/v1';
const forceDownload = process.env.HDT_ASSET_FORCE === '1';
const downloadAll = process.env.HDT_ASSET_DOWNLOAD_ALL === '1';
const assetAliases = [
  {
    id: 'BG25_HERO_105_SKIN_E',
    name: 'L800 E.T.C.',
    sourceId: 'BG25_HERO_105'
  }
];

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isPlaceholderHero(id, name) {
  const value = `${id ?? ''} ${name ?? ''}`.toLowerCase();
  return value.includes('hero_ph') || value.includes('baconphhero') || value.includes('kelthuzad') || value.includes("kel'thuzad");
}

async function fetchJson(url) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    }
    if (response.status !== 429) {
      throw new Error(`GET ${url} failed: ${response.status}`);
    }
    await wait(3000 + attempt * 2500);
  }
  throw new Error(`GET ${url} failed: rate limited`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  }
  catch {
    return false;
  }
}

async function isValidImage(path) {
  try {
    const info = await stat(path);
    if (info.size < 512) return false;
    const header = await readFile(path);
    const png = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    const jpg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const webp = header.slice(0, 4).toString('ascii') === 'RIFF' && header.slice(8, 12).toString('ascii') === 'WEBP';
    return png || jpg || webp;
  }
  catch {
    return false;
  }
}

async function removeIfInvalid(path) {
  if (await exists(path) && !(await isValidImage(path))) {
    await rm(path, { force: true });
  }
}

async function writeImageResponse(response, target) {
  if (!response.ok || !response.body) return false;
  await pipeline(response.body, createWriteStream(target));
  if (await isValidImage(target)) return true;
  await rm(target, { force: true });
  return false;
}

async function fetchAllCurrentCards() {
  const cards = [];
  const limit = 250;
  for (let offset = 0; ;) {
    const url = `${apiBase}/api/v1/cards?pool=current&limit=${limit}&offset=${offset}`;
    const page = await fetchJson(url);
    cards.push(...(page.data ?? []));
    if (!page.pagination?.nextOffset) break;
    offset = page.pagination.nextOffset;
  }
  return cards;
}

async function searchCardsByName(name) {
  const key = normalize(name);
  if (!key) return [];
  const url = `${apiBase}/api/v1/cards?q=${encodeURIComponent(name)}&limit=20`;
  const page = await fetchJson(url);
  return page.data ?? [];
}

async function fetchHearthstoneJsonCards() {
  const cards = await fetchJson(hearthstoneJsonApi);
  return Array.isArray(cards) ? cards : [];
}

function preferredType(typeHints) {
  if (typeHints.has('trinket')) return 'trinket';
  if (typeHints.has('hero')) return 'hero';
  return 'minion';
}

function addSeen(seen, id, name, type) {
  const cleanId = String(id ?? '').trim();
  const cleanName = String(name ?? '').trim();
  if (!cleanId && !cleanName) return;
  const key = cleanId || `name:${normalize(cleanName)}`;
  const current = seen.get(key) ?? {
    id: cleanId,
    name: cleanName,
    typeHints: new Set()
  };
  if (cleanId && !current.id) current.id = cleanId;
  if (cleanName && !current.name) current.name = cleanName;
  if (type) current.typeHints.add(type);
  seen.set(key, current);
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  catch {
    return [];
  }
}

async function readLocalSeenCards() {
  const seen = new Map();
  try {
    const files = (await readdir(gamesDir)).filter((file) => file.endsWith('.json'));
    for (const file of files) {
      const dump = JSON.parse(await readFile(join(gamesDir, file), 'utf8'));
      if (!isPlaceholderHero(dump.game?.hero_id, dump.game?.hero_name)) {
        addSeen(seen, dump.game?.hero_id, dump.game?.hero_name, 'hero');
      }
      for (const turn of dump.turns ?? []) {
        const minions = [...(turn.board_minions ?? []), ...(turn.shop_minions ?? [])];
        for (const minion of minions) {
          addSeen(seen, minion.card_id, minion.name, 'minion');
        }
      }
      for (const purchase of dump.purchases ?? []) {
        addSeen(seen, purchase.card_id, purchase.card_name, 'minion');
      }
      for (const combat of dump.combats ?? []) {
        for (const minion of parseJsonArray(combat.opponent_board)) {
          addSeen(seen, minion.card_id ?? minion.cardId, minion.name, 'minion');
        }
      }
      for (const trinket of dump.trinkets ?? []) {
        addSeen(seen, trinket.selected_card_id, trinket.selected_name, 'trinket');
        for (const offer of parseJsonArray(trinket.offered_json)) {
          const offerId = offer.card_id ?? offer.cardId;
          const offerName = offer.name ?? offer.card_name;
          const type = String(offerId ?? '').includes('MagicItem') ? 'trinket' : undefined;
          addSeen(seen, offerId, offerName, type);
        }
      }
    }
  }
  catch {
    // Local game dumps are optional; current-pool assets still get synced.
  }
  return [...seen.values()].map((entry) => ({
    ...entry,
    type: preferredType(entry.typeHints)
  }));
}

function cardAssetType(card) {
  if (card.cardType === 'trinket' || String(card.externalId ?? '').includes('MagicItem')) return 'trinket';
  if (card.isHero || card.isHeroSkin || card.cardType === 'hero') return 'hero';
  return 'minion';
}

function buildCardIndexes(cards) {
  const byId = new Map();
  const byName = new Map();
  for (const card of cards) {
    if (!card?.slug || !card?.image) continue;
    if (card.externalId) {
      byId.set(card.externalId, card);
      if (card.dbfIdGold) byId.set(`${card.externalId}_G`, card);
    }
    const nameKey = normalize(card.name);
    if (!nameKey) continue;
    const list = byName.get(nameKey) ?? [];
    list.push(card);
    byName.set(nameKey, list);
  }
  return { byId, byName };
}

function buildHearthstoneJsonIndexes(cards) {
  const byId = new Map();
  const byName = new Map();
  for (const card of cards) {
    if (!card?.id || !card?.name) continue;
    byId.set(card.id, card);
    const nameKey = normalize(card.name);
    const list = byName.get(nameKey) ?? [];
    list.push(card);
    byName.set(nameKey, list);
  }
  return { byId, byName };
}

function chooseCard(candidates, type) {
  if (!candidates.length) return undefined;
  return candidates.find((card) => cardAssetType(card) === type)
    ?? candidates.find((card) => card.pool === true)
    ?? candidates[0];
}

function shouldKeepSeenCard(card, seenType) {
  if (!card?.slug || !card?.image) return false;
  if (seenType === 'trinket') return cardAssetType(card) === 'trinket';
  if (seenType === 'hero') return cardAssetType(card) === 'hero';
  return cardAssetType(card) === 'minion';
}

function hjsonType(card) {
  if (!card) return undefined;
  if (card.type === 'HERO') return 'hero';
  if (card.type === 'BATTLEGROUND_TRINKET' || String(card.id ?? '').includes('MagicItem')) return 'trinket';
  return 'minion';
}

function shouldPreloadCurrentCard(card) {
  if (!card?.externalId || !card?.slug || !card?.image) return false;
  if (card.cardType === 'trinket') return true;
  if (String(card.externalId).includes('MagicItem') && card.cardType !== 'minion') return true;
  if (card.cardType !== 'minion') return false;
  if (card.isHero || card.isHeroSkin) return false;
  const categories = new Set(card.categories ?? []);
  return categories.has('tavern') || categories.has('token') || categories.has('buddy');
}

function buildCurrentHjsonIds(cards) {
  const byDbf = new Map(cards.filter((card) => card.dbfId).map((card) => [card.dbfId, card]));
  const ids = new Set();
  for (const card of cards) {
    if (card.type !== 'MINION' || !card.isBattlegroundsPoolMinion) continue;
    ids.add(card.id);
    if (card.battlegroundsPremiumDbfId && byDbf.has(card.battlegroundsPremiumDbfId)) {
      ids.add(byDbf.get(card.battlegroundsPremiumDbfId).id);
    }
  }
  return ids;
}

function shouldPreloadHjsonCard(card, currentMinionIds) {
  if (!card?.id || !card?.name || card.set !== 'BATTLEGROUNDS') return false;
  if (isPlaceholderHero(card.id, card.name)) return false;
  if (card.type === 'HERO') {
    return Boolean(card.battlegroundsHero || card.battlegroundsSkinParentId || card.heroPowerDbfId || String(card.id).includes('HERO'));
  }
  if (card.type === 'MINION') return currentMinionIds.has(card.id);
  return card.type === 'BATTLEGROUND_TRINKET';
}

function hjsonRemoteImage(card, kind = 'art') {
  if (!card?.id) return undefined;
  if (kind === 'render') return `${hearthstoneJsonArt}/render/latest/enUS/512x/${card.id}.png`;
  if (kind === 'tile') return `${hearthstoneJsonArt}/tiles/${card.id}.png`;
  return `${hearthstoneJsonArt}/512x/${card.id}.jpg`;
}

function addManifestAsset(manifest, asset) {
  if (!asset?.id || !asset?.name) return;
  const existing = manifest.byId[asset.id];
  const existingIsLocal = existing && !String(existing.path ?? '').startsWith('https://');
  const incomingIsRemote = String(asset.path ?? '').startsWith('https://');
  const finalAsset = existingIsLocal && incomingIsRemote ? existing : asset;
  manifest.byId[finalAsset.id] = finalAsset;
  const nameKey = normalize(asset.name);
  if (!nameKey) return;
  const current = manifest.byName[nameKey];
  const currentIsLocal = current && !String(current.path ?? '').startsWith('https://');
  const finalIsRemote = String(finalAsset.path ?? '').startsWith('https://');
  if (!current || (current.golden && !finalAsset.golden) || (!currentIsLocal && !finalIsRemote)) {
    manifest.byName[nameKey] = finalAsset;
  }
}

function chooseHjsonCard(candidates, type) {
  return candidates.find((card) => hjsonType(card) === type) ?? candidates[0];
}

async function downloadCardImage(card, fileName) {
  const target = join(publicAssetDir, fileName);
  if (forceDownload && await exists(target)) {
    await rm(target);
  }
  await removeIfInvalid(target);
  if (await exists(target)) return false;

  const urls = [
    `${apiBase}/api/v1/cards/${card.slug}/image?size=full&format=webp`,
    `${apiBase}/api/v1/cards/${card.slug}/image?size=large&format=webp`,
    `${apiBase}/api/v1/cards/${card.slug}/image?size=medium&format=webp`
  ];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    for (const url of urls) {
      const response = await fetch(url);
      if (response.ok && response.body) {
        if (!(await writeImageResponse(response, target))) continue;
        await wait(180);
        return true;
      }
      if (response.status !== 429 && response.status !== 404) {
        throw new Error(`Image download failed for ${card.slug}: ${response.status}`);
      }
    }
    await wait(2500 + attempt * 1500);
  }
  throw new Error(`Image download rate-limited for ${card.slug}`);
}

async function downloadEntityImage(cardId, fileBase) {
  if (!cardId) return undefined;
  const artCandidates = [
    { url: `${hearthstoneJsonArt}/512x/${cardId}.jpg`, fileName: `art-${fileBase}.jpg` },
    { url: `${hearthstoneJsonArt}/orig/${cardId}.png`, fileName: `art-${fileBase}.png` }
  ];
  const tileCandidate = { url: `${hearthstoneJsonArt}/tiles/${cardId}.png`, fileName: `tile-${fileBase}.png` };

  for (const candidate of artCandidates) {
    const target = join(publicAssetDir, candidate.fileName);
    if (forceDownload && await exists(target)) await rm(target);
    await removeIfInvalid(target);
    if (await exists(target)) return { fileName: candidate.fileName, downloaded: false };
  }
  const tileTarget = join(publicAssetDir, tileCandidate.fileName);
  if (forceDownload && await exists(tileTarget)) await rm(tileTarget);
  await removeIfInvalid(tileTarget);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    for (const candidate of artCandidates) {
      const target = join(publicAssetDir, candidate.fileName);
      try {
        const response = await fetch(candidate.url);
        if (response.ok && response.body) {
          if (!(await writeImageResponse(response, target))) continue;
          await wait(120);
          return { fileName: candidate.fileName, downloaded: true };
        }
        if (response.status === 404) continue;
        if (response.status !== 429) {
          throw new Error(`Entity art download failed for ${cardId}: ${response.status}`);
        }
      }
      catch (error) {
        if (attempt === 3) throw error;
      }
    }
    await wait(1600 + attempt * 900);
  }

  if (await exists(tileTarget)) return { fileName: tileCandidate.fileName, downloaded: false };
  const response = await fetch(tileCandidate.url);
  if (response.ok && response.body) {
    if (!(await writeImageResponse(response, tileTarget))) return undefined;
    await wait(120);
    return { fileName: tileCandidate.fileName, downloaded: true };
  }
  return undefined;
}

async function downloadHearthstoneJsonImage(card, fileBase) {
  const candidates = [
    { url: `${hearthstoneJsonArt}/render/latest/enUS/512x/${card.id}.png`, ext: 'png' },
    { url: `${hearthstoneJsonArt}/512x/${card.id}.jpg`, ext: 'jpg' },
    { url: `${hearthstoneJsonArt}/orig/${card.id}.png`, ext: 'png' },
    { url: `${hearthstoneJsonArt}/tiles/${card.id}.png`, ext: 'png' }
  ];

  for (const candidate of candidates) {
    const fileName = `${fileBase}.${candidate.ext}`;
    const target = join(publicAssetDir, fileName);
    if (forceDownload && await exists(target)) await rm(target);
    await removeIfInvalid(target);
    if (await exists(target)) return { fileName, downloaded: false };

    const response = await fetch(candidate.url);
    if (response.ok && response.body) {
      if (!(await writeImageResponse(response, target))) continue;
      await wait(180);
      return { fileName, downloaded: true };
    }
    if (response.status !== 404 && response.status !== 429) {
      throw new Error(`HearthstoneJSON image download failed for ${card.id}: ${response.status}`);
    }
    if (response.status === 429) await wait(2500);
  }
  return undefined;
}

async function main() {
  await mkdir(publicAssetDir, { recursive: true });
  await mkdir(join(root, 'webapp', 'src', 'data'), { recursive: true });

  const [cards, seenCards] = await Promise.all([fetchAllCurrentCards(), readLocalSeenCards()]);
  const selectedByAssetId = new Map();
  const localDownloadIds = new Set();
  const missing = [];
  const indexes = buildCardIndexes(cards);

  for (const card of cards) {
    if (!shouldPreloadCurrentCard(card)) continue;
    const assetKey = card.externalId ?? String(card.id);
    selectedByAssetId.set(assetKey, card);
  }

  for (const seen of seenCards) {
    const baseId = seen.id?.replace(/_G$/, '');
    const idCard = seen.id ? indexes.byId.get(seen.id) ?? indexes.byId.get(baseId) : undefined;
    const nameCandidates = indexes.byName.get(normalize(seen.name)) ?? [];
    let card = shouldKeepSeenCard(idCard, seen.type) ? idCard : chooseCard(nameCandidates, seen.type);

    if (!card && seen.name) {
      const searched = await searchCardsByName(seen.name);
      for (const found of searched) {
        cards.push(found);
      }
      const searchedIndexes = buildCardIndexes(searched);
      card = shouldKeepSeenCard(searchedIndexes.byId.get(seen.id) ?? searchedIndexes.byId.get(baseId), seen.type)
        ? searchedIndexes.byId.get(seen.id) ?? searchedIndexes.byId.get(baseId)
        : chooseCard(searchedIndexes.byName.get(normalize(seen.name)) ?? searched, seen.type);
      await wait(120);
    }

    if (!shouldKeepSeenCard(card, seen.type)) {
      missing.push({ id: seen.id || null, name: seen.name || null, type: seen.type });
      continue;
    }

    const assetKey = card.externalId ?? String(card.id);
    selectedByAssetId.set(assetKey, card);
    localDownloadIds.add(assetKey);
    if (seen.id?.endsWith('_G')) {
      selectedByAssetId.set(`${assetKey}_G`, card);
      localDownloadIds.add(`${assetKey}_G`);
    }
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: `${apiBase} + ${hearthstoneJsonApi}`,
    missing,
    byId: {},
    byName: {}
  };

  let downloaded = 0;
  for (const card of new Map([...selectedByAssetId.values()].map((card) => [card.id, card])).values()) {
    const assetKey = card.externalId ?? String(card.id);
    const shouldDownload = downloadAll || localDownloadIds.has(assetKey);
    const safeName = `${card.id}-${normalize(card.slug || card.name)}.webp`;
    if (shouldDownload && await downloadCardImage(card, safeName)) downloaded += 1;
    const asset = {
      id: assetKey,
      dbfId: card.id,
      slug: card.slug,
      name: String(card.name ?? '').trim(),
      type: cardAssetType(card),
      tier: card.tier ?? null,
      tribe: card.minionType ?? null,
      path: shouldDownload ? `/assets/hsbg/cards/${safeName}` : `${apiBase}${card.image}`
    };
    const entityImage = shouldDownload ? await downloadEntityImage(card.externalId, normalize(card.externalId ?? card.slug ?? card.name)) : undefined;
    if (entityImage) {
      if (entityImage.downloaded) downloaded += 1;
      asset.portraitPath = `/assets/hsbg/cards/${entityImage.fileName}`;
    } else if (card.externalId) {
      asset.portraitPath = hjsonRemoteImage({ id: card.externalId }, 'tile');
    }
    addManifestAsset(manifest, asset);
    if (card.externalId && card.dbfIdGold) {
      const goldenId = `${card.externalId}_G`;
      const shouldDownloadGolden = downloadAll || localDownloadIds.has(goldenId);
      const goldenTile = shouldDownloadGolden ? await downloadEntityImage(goldenId, normalize(goldenId)) : undefined;
      const goldenAsset = { ...asset, id: goldenId, golden: true };
      if (goldenTile) {
        if (goldenTile.downloaded) downloaded += 1;
        goldenAsset.portraitPath = `/assets/hsbg/cards/${goldenTile.fileName}`;
      } else {
        goldenAsset.portraitPath = hjsonRemoteImage({ id: goldenId }, 'tile');
      }
      addManifestAsset(manifest, goldenAsset);
    }
  }

  const hjsonCards = await fetchHearthstoneJsonCards();
  const hjsonIndexes = buildHearthstoneJsonIndexes(hjsonCards);
  const currentMinionIds = buildCurrentHjsonIds(hjsonCards);
  let preloadedHjson = 0;
  for (const card of hjsonCards) {
    if (!shouldPreloadHjsonCard(card, currentMinionIds)) continue;
    const type = hjsonType(card);
    const asset = {
      id: card.id,
      dbfId: card.dbfId ?? null,
      slug: normalize(card.name),
      name: card.name,
      type,
      tier: card.techLevel ?? null,
      tribe: Array.isArray(card.races) ? card.races[0] ?? null : card.race ?? null,
      path: hjsonRemoteImage(card, 'render'),
      portraitPath: hjsonRemoteImage(card, 'tile'),
      fallbackSource: 'hearthstonejson'
    };
    if (downloadAll) {
      const fileBase = `hjson-${card.dbfId ?? normalize(card.id)}-${normalize(card.id)}`;
      const result = await downloadHearthstoneJsonImage(card, fileBase);
      if (result) {
        if (result.downloaded) downloaded += 1;
        asset.path = `/assets/hsbg/cards/${result.fileName}`;
        asset.portraitPath = `/assets/hsbg/cards/${result.fileName}`;
      }
    }
    addManifestAsset(manifest, asset);
    preloadedHjson += 1;
  }

  if (missing.length) {
    const unresolved = [];
    for (const item of missing) {
      const baseId = item.id?.replace(/_G$/, '');
      const byId = item.id ? hjsonIndexes.byId.get(item.id) ?? hjsonIndexes.byId.get(baseId) : undefined;
      const byName = chooseHjsonCard(hjsonIndexes.byName.get(normalize(item.name)) ?? [], item.type);
      const card = hjsonType(byId) === item.type ? byId : byName;
      if (!card || hjsonType(card) !== item.type) {
        unresolved.push(item);
        continue;
      }

      const fileBase = `hjson-${card.dbfId ?? normalize(card.id)}-${normalize(card.id)}`;
      const result = await downloadHearthstoneJsonImage(card, fileBase);
      const asset = {
        id: item.id ?? card.id,
        dbfId: card.dbfId ?? null,
        slug: normalize(card.name),
        name: item.name ?? card.name,
        type: item.type,
        tier: card.techLevel ?? null,
        tribe: Array.isArray(card.races) ? card.races[0] ?? null : card.race ?? null,
        path: result ? `/assets/hsbg/cards/${result.fileName}` : hjsonRemoteImage(card, 'render'),
        portraitPath: result ? `/assets/hsbg/cards/${result.fileName}` : hjsonRemoteImage(card, 'tile'),
        fallbackSource: 'hearthstonejson'
      };
      if (result?.downloaded) downloaded += 1;
      addManifestAsset(manifest, asset);
      if (baseId && !item.id?.endsWith('_G')) addManifestAsset(manifest, { ...asset, id: baseId });
    }
    manifest.missing = unresolved;
  }

  for (const alias of assetAliases) {
    const source = manifest.byId[alias.sourceId];
    if (!source) continue;
    const aliased = { ...source, id: alias.id, name: alias.name };
    addManifestAsset(manifest, aliased);
  }

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Seen local card references: ${seenCards.length}`);
  console.log(`Current-pool hsbg.cards references: ${selectedByAssetId.size}`);
  console.log(`Preloaded HearthstoneJSON references: ${preloadedHjson}`);
  console.log(`Manifest assets: ${Object.keys(manifest.byId).length} ids / ${Object.keys(manifest.byName).length} names`);
  console.log(`Missing after API lookup: ${manifest.missing.length}`);
  console.log(`Synced ${downloaded} card images to ${publicAssetDir}`);
  console.log(`Manifest written to ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
