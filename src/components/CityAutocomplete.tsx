import { useState, useEffect, useRef } from 'react';
import { Check, MapPin, Loader2, X } from 'lucide-react';
import { Input } from './ui/input';
import { cn } from './ui/utils';
import { searchCities, City } from '../services/nominatim';

interface CityAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
}

export function CityAutocomplete({ value, onValueChange, placeholder = "Ex: Paris" }: CityAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Synchroniser la valeur externe avec l'input
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Rechercher les villes quand l'input change
  useEffect(() => {
    if (inputValue.length < 2) {
      setCities([]);
      setIsOpen(false);
      return;
    }

    // Debounce la recherche
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchCities(inputValue, 8);
        setCities(results);
        setIsOpen(results.length > 0);
      } catch (error) {
        console.error('Erreur de recherche:', error);
        setCities([]);
        setIsOpen(false);
      } finally {
        setIsLoading(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [inputValue]);

  // Fermer le dropdown au clic extérieur
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (city: City) => {
    setInputValue(city.name);
    onValueChange(city.name);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onValueChange('');
    setCities([]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={() => {
            if (cities.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="pl-10 pr-10"
        />
        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
        )}
      </div>

      {/* Liste déroulante des suggestions */}
      {isOpen && cities.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {cities.map((city) => (
            <button
              key={city.place_id}
              type="button"
              onClick={() => handleSelect(city)}
              className={cn(
                "w-full px-3 py-2 text-left hover:bg-gray-100 transition-colors flex items-start gap-2",
                value === city.name && "bg-blue-50"
              )}
            >
              <Check
                className={cn(
                  "h-4 w-4 mt-0.5 shrink-0",
                  value === city.name ? "opacity-100 text-blue-600" : "opacity-0"
                )}
              />
              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                <span className="truncate text-sm">{city.name}</span>
                <span className="text-xs text-gray-500 truncate">
                  {city.display_name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Message si aucune ville trouvée */}
      {isOpen && cities.length === 0 && inputValue.length >= 2 && !isLoading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-3">
          <p className="text-sm text-gray-500 text-center">Aucune ville trouvée</p>
        </div>
      )}

      {/* Message pour taper plus de caractères */}
      {inputValue.length > 0 && inputValue.length < 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg p-3">
          <p className="text-sm text-gray-500 text-center">Tapez au moins 2 caractères</p>
        </div>
      )}
    </div>
  );
}
