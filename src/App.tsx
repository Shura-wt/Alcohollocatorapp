import { useState, useEffect } from 'react';
import { Menu, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from './components/ui/sheet';
import { Compass } from './components/Compass';
import { FilterMenu, FilterState } from './components/FilterMenu';
import { EstablishmentList } from './components/EstablishmentList';
import { queryOverpass, Establishment } from './services/overpass';
import { getCityDetails, City } from './services/nominatim';
import { useDeviceOrientation } from './hooks/useDeviceOrientation';
import { toast, Toaster } from 'sonner@2.0.3';
import { log as baseLog } from './utils/logger';
const log = baseLog.child('App');

export default function App() {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [compassDirection, setCompassDirection] = useState(0);
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);
  const [distance, setDistance] = useState<number>(0);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [filters, setFilters] = useState<FilterState>({
    searchMode: 'proximity',
    city: '',
    radius: 5,
    openOnly: false,
    establishmentTypes: ['bar', 'wine-cellar', 'nightclub', 'supermarket', 'restaurant', 'liquor-store'],
  });

  // Hook pour l'orientation du téléphone
  const { orientation, requestPermission, stopTracking, isActive } = useDeviceOrientation();

  // Fonction pour calculer la distance entre deux points (formule de Haversine)
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
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
  };

  // Fonction pour calculer l'angle entre deux points
  const calculateBearing = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    const θ = Math.atan2(y, x);
    const bearing = ((θ * 180) / Math.PI + 360) % 360;

    return bearing;
  };

  // Obtenir la position de l'utilisateur
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          // Position par défaut (Paris) si la géolocalisation échoue
          toast.info('Géolocalisation non disponible. Utilisation de Paris comme position par défaut.');
          setUserLocation({ lat: 48.8566, lng: 2.3522 });
        }
      );
    } else {
      // Position par défaut (Paris)
      toast.info('Géolocalisation non supportée. Utilisation de Paris comme position par défaut.');
      setUserLocation({ lat: 48.8566, lng: 2.3522 });
    }
  }, []);

  // Suivre la position de l'utilisateur en continu
  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.warn('Erreur watchPosition:', error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 5000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Charger les établissements depuis l'API Overpass avec debounce
  useEffect(() => {
    if (!userLocation) return;
    
    // Ne pas charger si recherche par ville et pas de ville spécifiée
    if (filters.searchMode === 'city' && !filters.city) {
      setEstablishments([]);
      setSelectedEstablishment(null);
      return;
    }
    
    const loadEstablishments = async () => {
      setIsLoading(true);
      try {
        let queryLat = userLocation.lat;
        let queryLng = userLocation.lng;
        let cityData: { name: string; boundingbox?: string[] } | undefined;

        // Si mode de recherche par ville, récupérer les coordonnées de la ville
        if (filters.searchMode === 'city' && filters.city) {
          const cityDetails = await getCityDetails(filters.city);
          if (!cityDetails) {
            toast.error(`Impossible de trouver la ville: ${filters.city}`);
            setEstablishments([]);
            setIsLoading(false);
            return;
          }
          queryLat = parseFloat(cityDetails.lat);
          queryLng = parseFloat(cityDetails.lon);
          cityData = {
            name: cityDetails.name,
            boundingbox: cityDetails.boundingbox,
          };
          toast.info(`Recherche dans ${cityDetails.name}...`);
        }

        const data = await queryOverpass(
          queryLat,
          queryLng,
          filters.radius,
          filters.establishmentTypes,
          filters.searchMode,
          cityData
        );
        setEstablishments(data);
        
        if (data.length > 0) {
          toast.success(`${data.length} établissement(s) trouvé(s)`);
        } else {
          toast.info('Aucun établissement trouvé. Essayez d\'élargir le rayon de recherche.');
        }
      } catch (error) {
        console.error('Erreur lors du chargement des établissements:', error);
        const errorMessage = (error as Error).message;
        if (errorMessage.includes('429')) {
          toast.error('Trop de requêtes. Veuillez patienter quelques secondes et réessayer.');
        } else {
          toast.error('Erreur lors de la recherche. Veuillez réessayer.');
        }
        setEstablishments([]);
      } finally {
        setIsLoading(false);
      }
    };
    
    // Debounce de 1 seconde pour éviter trop de requêtes
    const timeoutId = setTimeout(() => {
      loadEstablishments();
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [userLocation, filters]);

  // Sélection par défaut et maintien de la sélection utilisateur
  useEffect(() => {
    if (!userLocation || establishments.length === 0) {
      setSelectedEstablishment(null);
      return;
    }

    // Filtrer les établissements selon les critères
    const filteredEstablishments = establishments.filter((est) => {
      // Filtre ouvert/fermé
      if (filters.openOnly && !est.isOpen) return false;
      return true;
    });

    if (filteredEstablishments.length === 0) {
      setSelectedEstablishment(null);
      return;
    }

    // Si l'utilisateur a déjà sélectionné un établissement, on le conserve s'il est encore dans la liste
    if (selectedEstablishment) {
      const updated = filteredEstablishments.find(est => est.id === selectedEstablishment.id);
      if (updated) {
        // Mettre à jour la référence (ex: champs isOpen) sans casser la sélection
        if (updated !== selectedEstablishment) {
          setSelectedEstablishment(updated);
        }
        return;
      }
    }

    // Sinon, sélectionner le plus proche par défaut
    let nearest = filteredEstablishments[0];
    let minDistance = calculateDistance(
      userLocation.lat,
      userLocation.lng,
      nearest.lat,
      nearest.lng
    );

    for (const est of filteredEstablishments) {
      const dist = calculateDistance(userLocation.lat, userLocation.lng, est.lat, est.lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = est;
      }
    }

    setSelectedEstablishment(nearest);
  }, [userLocation, establishments, filters.openOnly, selectedEstablishment]);


  // Recalculer la distance quand l'établissement sélectionné change
  useEffect(() => {
    if (userLocation && selectedEstablishment) {
      const dist = calculateDistance(
        userLocation.lat,
        userLocation.lng,
        selectedEstablishment.lat,
        selectedEstablishment.lng
      );
      setDistance(dist);
      
      const bearing = calculateBearing(
        userLocation.lat,
        userLocation.lng,
        selectedEstablishment.lat,
        selectedEstablishment.lng
      );
      setCompassDirection(bearing);
    }
  }, [selectedEstablishment, userLocation]);

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
  };

  const handleEstablishmentSelect = (establishment: Establishment) => {
    setSelectedEstablishment(establishment);
    toast.success(`Direction vers: ${establishment.name}`);
  };

  const handleRequestOrientation = async () => {
    if (isActive) {
      stopTracking();
      toast.info('Orientation désactivée');
    } else {
      const granted = await requestPermission();
      if (granted) {
        toast.success('Orientation activée ! Tournez votre téléphone.');
      } else {
        if (orientation.error) {
          toast.error(orientation.error);
        } else {
          toast.error('Impossible d\'activer l\'orientation');
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <Toaster position="top-center" richColors />
      
      {/* Header avec burger menu */}
      <header className="sticky top-0 z-50 bg-white shadow-sm">
        <div className="flex items-center justify-between p-4">
          <h1 className="text-gray-900">Trouve ton Bar</h1>
          
          <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
            <SheetTrigger asChild>
              <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <Menu className="w-6 h-6 text-gray-700" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filtres de recherche</SheetTitle>
                <SheetDescription>
                  Personnalisez votre recherche d'établissements
                </SheetDescription>
              </SheetHeader>
              <FilterMenu
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onApply={() => setIsSheetOpen(false)}
              />
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="container mx-auto px-4 py-8">
        {!userLocation ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-gray-600">Chargement de votre position...</p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-gray-600">Recherche des établissements...</p>
            </div>
          </div>
        ) : selectedEstablishment ? (
          <>
            <Compass
              direction={compassDirection}
              distance={distance}
              establishmentName={selectedEstablishment.name}
              deviceHeading={orientation.heading}
              onRequestOrientation={handleRequestOrientation}
              isOrientationActive={isActive}
            />
            
            <div className="mt-8 bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="text-gray-900 capitalize">
                    {selectedEstablishment.type === 'wine-cellar' ? 'Cave à vin' :
                     selectedEstablishment.type === 'nightclub' ? 'Boîte de nuit' :
                     selectedEstablishment.type === 'supermarket' ? 'Supermarché' :
                     selectedEstablishment.type === 'liquor-store' ? 'Magasin de spiritueux' :
                     selectedEstablishment.type}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Statut:</span>
                  <span className={selectedEstablishment.isOpen ? 'text-green-600' : 'text-red-600'}>
                    {selectedEstablishment.isOpen ? 'Ouvert' : 'Fermé'}
                  </span>
                </div>
                {selectedEstablishment.city && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Ville:</span>
                    <span className="text-gray-900">{selectedEstablishment.city}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Liste des établissements */}
            {establishments.length > 0 && userLocation && (
              <div className="mt-8 max-w-md mx-auto">
                <EstablishmentList
                  establishments={establishments}
                  selectedId={selectedEstablishment.id}
                  onSelect={handleEstablishmentSelect}
                  userLocation={userLocation}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <p className="text-gray-600">Aucun établissement trouvé</p>
              <p className="text-gray-500 mt-2">
                {filters.searchMode === 'city' && !filters.city
                  ? 'Veuillez entrer un nom de ville dans les filtres'
                  : 'Essayez de modifier vos filtres ou d\'élargir le rayon de recherche'}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
