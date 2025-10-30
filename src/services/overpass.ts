// Service pour interroger l'API Overpass d'OpenStreetMap

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
  const maxRetries = OVERPASS_INSTANCES.length;
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    const endpoint = OVERPASS_INSTANCES[currentInstanceIndex];
    
    try {
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
      
      // Si erreur 429, essayer l'instance suivante
      if (response.status === 429) {
        console.warn(`Instance ${endpoint} surchargée (429), tentative avec une autre instance...`);
        currentInstanceIndex = (currentInstanceIndex + 1) % OVERPASS_INSTANCES.length;
        lastError = new Error(`Trop de requêtes (429) sur ${endpoint}`);
        continue;
      }
      
      throw new Error(`Overpass API error: ${response.status}`);
    } catch (error) {
      console.error(`Erreur avec l'instance ${endpoint}:`, error);
      lastError = error as Error;
      currentInstanceIndex = (currentInstanceIndex + 1) % OVERPASS_INSTANCES.length;
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
    console.log('Données récupérées depuis le cache');
    return cached.data;
  }
  
  // Nettoyer le cache expiré
  cleanExpiredCache();
  
  const query = searchMode === 'city' && cityData
    ? buildOverpassQueryByCity(lat, lng, cityData.boundingbox, types)
    : buildOverpassQuery(lat, lng, radius, types);
  
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
}
