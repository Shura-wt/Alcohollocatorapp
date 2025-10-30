// Service pour interroger l'API Overpass d'OpenStreetMap
import { log as baseLog } from '../utils/logger';
const log = baseLog.child('services:overpass');

// Cache pour les requêtes
interface CacheEntry {
  data: Establishment[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Liste des instances Overpass disponibles
const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

let currentInstanceIndex = 0;

// Configuration de limitation de débit (rate limiting) via variables d'environnement Vite
const __env: any = (import.meta as any).env || {};
function __toInt(val: any, def: number): number {
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 ? n : def;
}
// Par défaut: 1 requête toutes les 2 secondes, et max 3 requêtes sur 10s
const MIN_INTERVAL_MS = __toInt(__env.VITE_OVERPASS_MIN_INTERVAL_MS, 2000);
const WINDOW_MS = __toInt(__env.VITE_OVERPASS_WINDOW_MS, 10000);
const MAX_REQS_PER_WINDOW = __toInt(__env.VITE_OVERPASS_MAX_REQUESTS_PER_WINDOW, 3);
const BACKOFF_BASE_MS = __toInt(__env.VITE_OVERPASS_429_BACKOFF_BASE_MS, 800);

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Etat global du limiteur
let lastRequestTs = 0;
const recentRequests: number[] = [];
let rateLimiterChain: Promise<void> = Promise.resolve();

async function waitForRateLimit() {
  const now = Date.now();
  // Respecter l'intervalle minimum entre deux requêtes
  const since = now - lastRequestTs;
  if (since < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - since + Math.floor(Math.random() * 150));
  }
  // Nettoyer la fenêtre glissante
  const cutoff = Date.now() - WINDOW_MS;
  while (recentRequests.length && recentRequests[0] < cutoff) {
    recentRequests.shift();
  }
  // Limiter le nombre de requêtes dans la fenêtre
  if (recentRequests.length >= MAX_REQS_PER_WINDOW) {
    const waitMs = WINDOW_MS - (Date.now() - recentRequests[0]) + Math.floor(Math.random() * 150);
    if (waitMs > 0) await sleep(waitMs);
  }
  const ts = Date.now();
  lastRequestTs = ts;
  recentRequests.push(ts);
}

// Sérialiser l'accès au slot de rate limit entre appels concurrents
function enqueueRateLimitedSlot(): Promise<void> {
  const run = async () => { await waitForRateLimit(); };
  const p = rateLimiterChain.then(run, run);
  rateLimiterChain = p.then(() => {}, () => {});
  return p;
}

// Déduplication des requêtes identiques en cours
const inFlightRequests = new Map<string, Promise<Establishment[]>>();

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    [key: string]: string;
  };
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

export type EstablishmentType = 'bar' | 'wine-cellar' | 'nightclub' | 'supermarket' | 'restaurant' | 'liquor-store';

export interface Establishment {
  id: string;
  name: string;
  type: EstablishmentType;
  lat: number;
  lng: number;
  isOpen: boolean;
  city?: string;
  tags: { [key: string]: string };
}

// Mapping des tags OSM vers nos types d'établissements
function mapOsmTagsToType(tags: { [key: string]: string }): EstablishmentType | null {
  if (tags.amenity === 'bar' || tags.amenity === 'pub') return 'bar';
  if (tags.amenity === 'nightclub') return 'nightclub';
  if (tags.shop === 'wine') return 'wine-cellar';
  if (tags.shop === 'alcohol' || tags.shop === 'beverages') return 'liquor-store';
  if (tags.amenity === 'restaurant') return 'restaurant';
  if (tags.shop === 'supermarket' || tags.shop === 'convenience') return 'supermarket';
  return null;
}

// Détermine si un établissement est ouvert (simplifié)
function isEstablishmentOpen(tags: { [key: string]: string }): boolean {
  // Si pas d'info d'horaires, on considère ouvert par défaut
  if (!tags.opening_hours) return true;
  
  // Logique simplifiée : vérifier si "24/7"
  if (tags.opening_hours === '24/7') return true;
  
  // Pour une vraie implémentation, il faudrait parser opening_hours
  // et vérifier l'heure actuelle
  return true;
}

// Construit la requête Overpass QL
function buildOverpassQuery(
  lat: number,
  lng: number,
  radius: number,
  types: EstablishmentType[]
): string {
  // Vérifier que types est un tableau
  if (!Array.isArray(types)) {
    console.error('types is not an array:', types);
    types = [];
  }

  // Convertir le rayon en mètres
  const radiusMeters = radius * 1000;
  
  // Construire les filtres selon les types demandés
  const filters: string[] = [];
  
  if (types.includes('bar')) {
    filters.push('node["amenity"="bar"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('node["amenity"="pub"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["amenity"="bar"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["amenity"="pub"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  if (types.includes('nightclub')) {
    filters.push('node["amenity"="nightclub"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["amenity"="nightclub"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  if (types.includes('wine-cellar')) {
    filters.push('node["shop"="wine"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["shop"="wine"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  if (types.includes('liquor-store')) {
    filters.push('node["shop"="alcohol"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('node["shop"="beverages"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["shop"="alcohol"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["shop"="beverages"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  if (types.includes('restaurant')) {
    filters.push('node["amenity"="restaurant"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["amenity"="restaurant"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  if (types.includes('supermarket')) {
    filters.push('node["shop"="supermarket"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('node["shop"="convenience"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["shop"="supermarket"](around:{{radius}},{{lat}},{{lng}});');
    filters.push('way["shop"="convenience"](around:{{radius}},{{lat}},{{lng}});');
  }
  
  // Remplacer les placeholders
  const processedFilters = filters.map(f => 
    f.replace('{{radius}}', radiusMeters.toString())
     .replace('{{lat}}', lat.toString())
     .replace('{{lng}}', lng.toString())
  ).join('\n  ');
  
  const query = `
[out:json][timeout:90];
(
  ${processedFilters}
);
out center;
`;
  
  return query;
}

// Construit une requête Overpass QL pour recherche par ville (utilise les coordonnées)
function buildOverpassQueryByCity(
  lat: number,
  lng: number,
  boundingbox: string[] | undefined,
  types: EstablishmentType[]
): string {
  // Vérifier que types est un tableau
  if (!Array.isArray(types)) {
    console.error('types is not an array:', types);
    types = [];
  }

  // Utiliser la bounding box si disponible, sinon un rayon de 20km
  let areaQuery: string;
  
  if (boundingbox && boundingbox.length === 4) {
    // boundingbox format: [min_lat, max_lat, min_lon, max_lon]
    const [minLat, maxLat, minLon, maxLon] = boundingbox;
    areaQuery = `(${minLat},${minLon},${maxLat},${maxLon})`;
  } else {
    // Utiliser un rayon de 20km autour du centre de la ville
    const radiusMeters = 20000;
    areaQuery = `(around:${radiusMeters},${lat},${lng})`;
  }
  
  // Construire les filtres selon les types demandés
  const filters: string[] = [];
  
  if (types.includes('bar')) {
    filters.push(`node["amenity"="bar"]${areaQuery};`);
    filters.push(`node["amenity"="pub"]${areaQuery};`);
    filters.push(`way["amenity"="bar"]${areaQuery};`);
    filters.push(`way["amenity"="pub"]${areaQuery};`);
  }
  
  if (types.includes('nightclub')) {
    filters.push(`node["amenity"="nightclub"]${areaQuery};`);
    filters.push(`way["amenity"="nightclub"]${areaQuery};`);
  }
  
  if (types.includes('wine-cellar')) {
    filters.push(`node["shop"="wine"]${areaQuery};`);
    filters.push(`way["shop"="wine"]${areaQuery};`);
  }
  
  if (types.includes('liquor-store')) {
    filters.push(`node["shop"="alcohol"]${areaQuery};`);
    filters.push(`node["shop"="beverages"]${areaQuery};`);
    filters.push(`way["shop"="alcohol"]${areaQuery};`);
    filters.push(`way["shop"="beverages"]${areaQuery};`);
  }
  
  if (types.includes('restaurant')) {
    filters.push(`node["amenity"="restaurant"]${areaQuery};`);
    filters.push(`way["amenity"="restaurant"]${areaQuery};`);
  }
  
  if (types.includes('supermarket')) {
    filters.push(`node["shop"="supermarket"]${areaQuery};`);
    filters.push(`node["shop"="convenience"]${areaQuery};`);
    filters.push(`way["shop"="supermarket"]${areaQuery};`);
    filters.push(`way["shop"="convenience"]${areaQuery};`);
  }
  
  const processedFilters = filters.join('\n  ');
  
  const query = `
[out:json][timeout:90];
(
  ${processedFilters}
);
out center;
`;
  
  return query;
}

// Fonction utilitaire pour vider le cache (peut être appelée si nécessaire)
export function clearCache() {
  cache.clear();
  console.log('Cache Overpass vidé');
}

// Fonction pour obtenir une clé de cache
function getCacheKey(
  lat: number,
  lng: number,
  radius: number,
  types: EstablishmentType[],
  searchMode: 'proximity' | 'city',
  city?: string
): string {
  const typesStr = types.sort().join(',');
  if (searchMode === 'city' && city) {
    return `city:${city}:${typesStr}`;
  }
  // Arrondir les coordonnées pour augmenter les chances de cache hit
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  return `proximity:${roundedLat}:${roundedLng}:${radius}:${typesStr}`;
}

// Fonction pour nettoyer le cache expiré
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_DURATION) {
      cache.delete(key);
    }
  }
}

// Fonction pour essayer avec différentes instances Overpass
async function fetchWithFallback(query: string): Promise<OverpassResponse> {
  const maxTries = OVERPASS_INSTANCES.length * 2; // boucle sur les instances avec une 2e passe si besoin
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxTries; attempt++) {
    const endpoint = OVERPASS_INSTANCES[currentInstanceIndex];

    try {
      // Attendre un créneau de rate limit avant chaque tentative
      await enqueueRateLimitedSlot();

      const response = await fetch(endpoint, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 429) {
        // Trop de requêtes: backoff exponentiel + passer à l'instance suivante
        const backoff = BACKOFF_BASE_MS * Math.pow(2, Math.min(4, attempt)) + Math.floor(Math.random() * 250);
        console.warn(`429 sur ${endpoint}. Attente ${backoff}ms puis essai sur une autre instance...`);
        await sleep(backoff);
        currentInstanceIndex = (currentInstanceIndex + 1) % OVERPASS_INSTANCES.length;
        lastError = new Error(`Trop de requêtes (429) sur ${endpoint}`);
        continue;
      }

      // Pour les autres codes HTTP, passer à l'instance suivante
      lastError = new Error(`Overpass API error: ${response.status}`);
      currentInstanceIndex = (currentInstanceIndex + 1) % OVERPASS_INSTANCES.length;
    } catch (error) {
      console.error(`Erreur réseau/instance ${endpoint}:`, error);
      lastError = error as Error;
      currentInstanceIndex = (currentInstanceIndex + 1) % OVERPASS_INSTANCES.length;
      // petit backoff pour erreurs réseau transitoires
      await sleep(BACKOFF_BASE_MS + Math.floor(Math.random() * 200));
    }
  }

  throw lastError || new Error('Toutes les instances Overpass ont échoué');
}

// Interroge l'API Overpass avec cache
export async function queryOverpass(
  lat: number,
  lng: number,
  radius: number,
  types: EstablishmentType[],
  searchMode: 'proximity' | 'city' = 'proximity',
  cityData?: { name: string; boundingbox?: string[] }
): Promise<Establishment[]> {
  // Vérifier le cache
  const cacheKey = getCacheKey(lat, lng, radius, types, searchMode, cityData?.name);
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    log.info('Cache Overpass: hit', { key: cacheKey, ageMs: Date.now() - cached.timestamp });
    return cached.data;
  }
  
  // Si une requête identique est déjà en cours, s'y abonner
  const inFlight = inFlightRequests.get(cacheKey);
  if (inFlight) {
    log.debug('Requête identique en cours, on s’y abonne', { key: cacheKey });
    return inFlight;
  }

  // Nettoyer le cache expiré
  cleanExpiredCache();
  
  const query = searchMode === 'city' && cityData
    ? buildOverpassQueryByCity(lat, lng, cityData.boundingbox, types)
    : buildOverpassQuery(lat, lng, radius, types);
  
  const promise = (async () => {
    try {
      const data = await fetchWithFallback(query);
      
      // Convertir les éléments Overpass en établissements
      const establishments: Establishment[] = data.elements
        .map((element) => {
          if (!element.tags) return null;
          
          const type = mapOsmTagsToType(element.tags);
          if (!type) return null;
          
          // Obtenir les coordonnées
          let latitude: number;
          let longitude: number;
          
          if (element.type === 'node' && element.lat && element.lon) {
            latitude = element.lat;
            longitude = element.lon;
          } else if (element.center) {
            latitude = element.center.lat;
            longitude = element.center.lon;
          } else {
            return null;
          }
          
          return {
            id: `${element.type}-${element.id}`,
            name: element.tags.name || `${type} sans nom`,
            type,
            lat: latitude,
            lng: longitude,
            isOpen: isEstablishmentOpen(element.tags),
            city: element.tags['addr:city'],
            tags: element.tags,
          };
        })
        .filter((est): est is Establishment => est !== null);
      
      // Mettre en cache
      cache.set(cacheKey, {
        data: establishments,
        timestamp: Date.now(),
      });
      
      return establishments;
    } catch (error) {
      console.error('Erreur lors de la requête Overpass:', error);
      throw error;
    }
  })();

  inFlightRequests.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(cacheKey);
  }
}
