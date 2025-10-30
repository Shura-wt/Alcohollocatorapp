import { useState } from 'react';
import { MapPin, Compass as CompassIcon, Clock, Filter, Building2, Wine, PartyPopper, ShoppingCart, Utensils, Beer } from 'lucide-react';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { CityAutocomplete } from './CityAutocomplete';

export type SearchMode = 'proximity' | 'city';
export type EstablishmentType = 'bar' | 'wine-cellar' | 'nightclub' | 'supermarket' | 'restaurant' | 'liquor-store';

export interface FilterState {
  searchMode: SearchMode;
  city: string;
  radius: number;
  openOnly: boolean;
  establishmentTypes: EstablishmentType[];
}

interface FilterMenuProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onApply: () => void;
}

export function FilterMenu({ filters, onFiltersChange, onApply }: FilterMenuProps) {
  const [localFilters, setLocalFilters] = useState(filters);

  const establishmentOptions: { value: EstablishmentType; label: string; icon: React.ReactNode }[] = [
    { value: 'bar', label: 'Bar', icon: <Beer className="w-4 h-4" /> },
    { value: 'wine-cellar', label: 'Cave à vin', icon: <Wine className="w-4 h-4" /> },
    { value: 'nightclub', label: 'Boîte de nuit', icon: <PartyPopper className="w-4 h-4" /> },
    { value: 'supermarket', label: 'Supermarché', icon: <ShoppingCart className="w-4 h-4" /> },
    { value: 'restaurant', label: 'Restaurant', icon: <Utensils className="w-4 h-4" /> },
    { value: 'liquor-store', label: 'Magasin de spiritueux', icon: <Building2 className="w-4 h-4" /> },
  ];

  const toggleEstablishmentType = (type: EstablishmentType) => {
    const newTypes = localFilters.establishmentTypes.includes(type)
      ? localFilters.establishmentTypes.filter(t => t !== type)
      : [...localFilters.establishmentTypes, type];
    
    setLocalFilters({ ...localFilters, establishmentTypes: newTypes });
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onApply();
  };

  const selectedCount = localFilters.establishmentTypes.length;

  return (
    <div className="space-y-6 pt-6">
      {/* En-tête avec icône */}
      <div className="flex items-center gap-3 pb-2">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Filter className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-gray-900">Affiner ma recherche</h3>
          <p className="text-sm text-gray-500">Personnalisez vos critères</p>
        </div>
      </div>

      <Separator />

      {/* Mode de recherche */}
      <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <CompassIcon className="w-4 h-4 text-blue-600" />
            <Label className="text-gray-900">Mode de recherche</Label>
          </div>
          <RadioGroup
            value={localFilters.searchMode}
            onValueChange={(value) => 
              setLocalFilters({ ...localFilters, searchMode: value as SearchMode })
            }
            className="space-y-3"
          >
            <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/50 transition-colors">
              <RadioGroupItem value="proximity" id="proximity" />
              <Label htmlFor="proximity" className="cursor-pointer flex items-center gap-2 flex-1">
                <CompassIcon className="w-4 h-4 text-gray-600" />
                Rayon autour de moi
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/50 transition-colors">
              <RadioGroupItem value="city" id="city" />
              <Label htmlFor="city" className="cursor-pointer flex items-center gap-2 flex-1">
                <MapPin className="w-4 h-4 text-gray-600" />
                Recherche par ville
              </Label>
            </div>
          </RadioGroup>
        </div>
      </Card>

      {/* Recherche par ville */}
      {localFilters.searchMode === 'city' && (
        <Card className="p-4 border-blue-100">
          <div className="space-y-3">
            <Label htmlFor="city-input" className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600" />
              Ville
            </Label>
            <CityAutocomplete
              value={localFilters.city}
              onValueChange={(city) => setLocalFilters({ ...localFilters, city })}
              placeholder="Ex: Paris"
            />
          </div>
        </Card>
      )}

      {/* Rayon de recherche */}
      {localFilters.searchMode === 'proximity' && (
        <Card className="p-4 border-blue-100">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <CompassIcon className="w-4 h-4 text-blue-600" />
                Rayon de recherche
              </Label>
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                {localFilters.radius} km
              </Badge>
            </div>
            <Slider
              value={[localFilters.radius]}
              onValueChange={(value) => setLocalFilters({ ...localFilters, radius: value[0] })}
              min={1}
              max={50}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>1 km</span>
              <span>50 km</span>
            </div>
          </div>
        </Card>
      )}

      <Separator />

      {/* Filtre ouvert/fermé */}
      <Card className="p-4 border-green-100 bg-gradient-to-br from-green-50 to-emerald-50">
        <div className="flex items-center justify-between">
          <Label htmlFor="open-only" className="cursor-pointer flex items-center gap-2 flex-1">
            <Clock className="w-4 h-4 text-green-600" />
            <span>Uniquement les établissements ouverts</span>
          </Label>
          <Switch
            id="open-only"
            checked={localFilters.openOnly}
            onCheckedChange={(checked) => 
              setLocalFilters({ ...localFilters, openOnly: checked })
            }
          />
        </div>
      </Card>

      <Separator />

      {/* Types d'établissements */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-purple-600" />
            Types d'établissements
          </Label>
          <Badge variant="outline" className="border-purple-200 text-purple-700">
            {selectedCount}/{establishmentOptions.length}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {establishmentOptions.map((option) => {
            const isChecked = localFilters.establishmentTypes.includes(option.value);
            return (
              <Card 
                key={option.value} 
                className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                  isChecked 
                    ? 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 ring-1 ring-purple-200' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => toggleEstablishmentType(option.value)}
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id={option.value}
                    checked={isChecked}
                    onChange={() => toggleEstablishmentType(option.value)}
                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="flex items-center gap-2 flex-1">
                    <div className={`p-1.5 rounded-md ${isChecked ? 'bg-purple-100' : 'bg-gray-100'}`}>
                      {option.icon}
                    </div>
                    <Label htmlFor={option.value} className="cursor-pointer flex-1">
                      {option.label}
                    </Label>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Bouton d'application */}
      <div className="pt-4 sticky bottom-0 bg-white pb-2 border-t">
        <Button 
          onClick={handleApply} 
          className="w-full h-12 text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
        >
          <Filter className="w-4 h-4 mr-2" />
          Appliquer les filtres
        </Button>
      </div>
    </div>
  );
}
