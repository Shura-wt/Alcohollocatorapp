// Service pour l'autocomplétion des villes via Nominatim (OpenStreetMap)
import { log as baseLog } from '../utils/logger';
const log = baseLog.child('services:nominatim');

export interface City {
  place_id: number;
  display_name: string;
  name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  boundingbox?: string[]; // [min_lat, max_lat, min_lon, max_lon]
}

interface NominatimResponse {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  importance: number;
  boundingbox?: string[];
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
  name?: string;
}

// Cache pour les recherches de villes
const searchCache = new Map<string, City[]>();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// Dernière requête pour éviter trop de requêtes rapides
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 300; // 300ms entre chaque requête

/**
 * Recherche de villes via l'API Nominatim
 * @param query - Terme de recherche
 * @param limit - Nombre maximum de résultats (par défaut 5)
 * @returns Liste des villes trouvées
 */
export async function searchCities(query: string, limit: number = 5): Promise<City[]> {
  if (!query || query.length < 2) {
    return [];
  }

  // Vérifier le cache
  const cacheKey = `${query.toLowerCase()}-${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Throttle: attendre si la dernière requête est trop récente
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  try {
    // Construire l'URL de recherche
    // On recherche uniquement les villes, villages, towns, etc.
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      addressdetails: '1',
      limit: (limit * 2).toString(), // Demander plus de résultats pour filtrer ensuite
      // Ne pas filtrer par featuretype pour avoir plus de résultats internationaux
      'accept-language': 'fr',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'TrouveTonBar/1.0', // Nominatim requiert un User-Agent
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data: NominatimResponse[] = await response.json();

    // Transformer et filtrer les résultats
    const cities: City[] = data
      .filter((item) => {
        // Filtrer pour ne garder que les villes, villages, etc.
        // Accepter plus de types pour les villes internationales
        const validTypes = [
          'city', 'town', 'village', 'municipality', 'suburb', 'hamlet', 
          'administrative', 'neighbourhood', 'quarter', 'borough'
        ];
        
        // Exclure les types non pertinents
        const invalidTypes = ['road', 'street', 'highway', 'path', 'footway'];
        
        return (validTypes.includes(item.type) || 
               (item.address && (item.address.city || item.address.town || item.address.village))) &&
               !invalidTypes.includes(item.type);
      })
      .map((item) => {
        // Extraire le nom de la ville depuis l'adresse
        const cityName = item.address?.city || 
                        item.address?.town || 
                        item.address?.village || 
                        item.address?.municipality ||
                        item.name ||
                        item.display_name.split(',')[0];

        return {
          place_id: item.place_id,
          display_name: item.display_name,
          name: cityName,
          lat: item.lat,
          lon: item.lon,
          type: item.type,
          importance: item.importance,
          boundingbox: item.boundingbox,
        };
      })
      // Supprimer les doublons par nom de ville
      .filter((city, index, self) => 
        index === self.findIndex((c) => c.name.toLowerCase() === city.name.toLowerCase())
      )
      // Trier par importance
      .sort((a, b) => b.importance - a.importance)
      // Limiter au nombre demandé
      .slice(0, limit);

    // Mettre en cache
    searchCache.set(cacheKey, cities);
    
    // Nettoyer le cache après un certain temps
    setTimeout(() => {
      searchCache.delete(cacheKey);
    }, CACHE_DURATION);

    return cities;
  } catch (error) {
    console.error('Erreur lors de la recherche de villes:', error);
    return [];
  }
}

/**
 * Vide le cache de recherche
 */
export function clearCitySearchCache() {
  searchCache.clear();
}

/**
 * Récupère les détails d'une ville par son nom
 * @param cityName - Nom de la ville
 * @returns Détails de la ville ou null si non trouvée
 */
export async function getCityDetails(cityName: string): Promise<City | null> {
  try {
    const cities = await searchCities(cityName, 1);
    return cities.length > 0 ? cities[0] : null;
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de la ville:', error);
    return null;
  }
}
