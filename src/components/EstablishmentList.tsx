import { MapPin, Navigation2, Clock } from 'lucide-react';
import { Establishment } from '../services/overpass';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

interface EstablishmentListProps {
  establishments: Establishment[];
  selectedId: string | null;
  onSelect: (establishment: Establishment) => void;
  userLocation: { lat: number; lng: number };
}

// Fonction pour calculer la distance
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Rayon de la Terre en mètres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Formater la distance
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Traduire le type d'établissement
function translateType(type: string): string {
  const translations: { [key: string]: string } = {
    'bar': 'Bar',
    'wine-cellar': 'Cave à vin',
    'nightclub': 'Boîte de nuit',
    'supermarket': 'Supermarché',
    'restaurant': 'Restaurant',
    'liquor-store': 'Magasin de spiritueux',
  };
  return translations[type] || type;
}

// Obtenir la couleur du badge selon le type
function getTypeBadgeColor(type: string): string {
  const colors: { [key: string]: string } = {
    'bar': 'bg-amber-100 text-amber-800',
    'wine-cellar': 'bg-purple-100 text-purple-800',
    'nightclub': 'bg-pink-100 text-pink-800',
    'supermarket': 'bg-blue-100 text-blue-800',
    'restaurant': 'bg-green-100 text-green-800',
    'liquor-store': 'bg-red-100 text-red-800',
  };
  return colors[type] || 'bg-gray-100 text-gray-800';
}

export function EstablishmentList({
  establishments,
  selectedId,
  onSelect,
  userLocation,
}: EstablishmentListProps) {
  // Calculer les distances et trier
  const establishmentsWithDistance = establishments
    .map((est) => ({
      ...est,
      distance: calculateDistance(userLocation.lat, userLocation.lng, est.lat, est.lng),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10); // Limiter à 10 résultats

  if (establishmentsWithDistance.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-700">Établissements à proximité</h3>
        <Badge variant="secondary">{establishmentsWithDistance.length}</Badge>
      </div>

      <div className="space-y-2">
        {establishmentsWithDistance.map((establishment, index) => {
          const isSelected = establishment.id === selectedId;
          
          return (
            <Card
              key={establishment.id}
              onClick={() => onSelect(establishment)}
              className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-blue-500 bg-blue-50'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {isSelected && (
                      <Navigation2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    )}
                    <h4 className="truncate text-gray-900">
                      {index + 1}. {establishment.name}
                    </h4>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge className={getTypeBadgeColor(establishment.type)}>
                      {translateType(establishment.type)}
                    </Badge>
                    
                    <div className="flex items-center gap-1 text-sm text-gray-600">
                      <MapPin className="w-3 h-3" />
                      <span>{formatDistance(establishment.distance)}</span>
                    </div>
                    
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="w-3 h-3" />
                      <span className={establishment.isOpen ? 'text-green-600' : 'text-red-600'}>
                        {establishment.isOpen ? 'Ouvert' : 'Fermé'}
                      </span>
                    </div>
                  </div>
                  
                  {establishment.city && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {establishment.city}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      
      <p className="text-xs text-gray-500 text-center mt-3">
        Cliquez sur un établissement pour le cibler avec la boussole
      </p>
    </div>
  );
}
