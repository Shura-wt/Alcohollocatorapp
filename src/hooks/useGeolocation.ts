import { useEffect, useRef, useState } from 'react';
import { log as baseLog } from '../utils/logger';

const logger = baseLog.child('geo');

export type Coords = { lat: number; lng: number; accuracy?: number };

export type GeoProfile = 'balanced' | 'high' | 'degraded';

const PROFILES: Record<GeoProfile, PositionOptions> = {
  balanced: { enableHighAccuracy: false, maximumAge: 15000, timeout: 20000 },
  high: { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
  degraded: { enableHighAccuracy: false, maximumAge: 30000, timeout: 30000 },
};

export function useGeolocation() {
  const [location, setLocation] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWatching, setIsWatching] = useState(false);
  const [profile, setProfile] = useState<GeoProfile>('balanced');

  const lastFixAtRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const backoffRef = useRef(5000); // ms
  const backoffTimerRef = useRef<number | null>(null);

  const clearWatch = () => {
    if (watchIdRef.current !== null) {
      try { navigator.geolocation.clearWatch(watchIdRef.current); } catch {}
      watchIdRef.current = null;
    }
    if (backoffTimerRef.current !== null) {
      clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  };

  const onSuccess = (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy } = pos.coords;
    setLocation({ lat: latitude, lng: longitude, accuracy });
    setError(null);
    lastFixAtRef.current = Date.now();
    // Si le signal est bon (< 30 m) et qu’on est en balanced, on peut tenter high
    if (profile === 'balanced' && typeof accuracy === 'number' && accuracy < 30) {
      setProfile('high');
    }
  };

  const startWatch = () => {
    clearWatch();
    if (!('geolocation' in navigator)) {
      setError('Géolocalisation non supportée');
      setIsWatching(false);
      return;
    }
    try {
      watchIdRef.current = navigator.geolocation.watchPosition(onSuccess, onError, PROFILES[profile]);
      setIsWatching(true);
      logger.info('watchPosition démarré', PROFILES[profile]);
    } catch (e) {
      setError('Impossible de démarrer la géolocalisation');
      setIsWatching(false);
    }
  };

  const onError = (err: GeolocationPositionError) => {
    logger.warn('watchPosition error', { code: err.code, message: err.message, profile });
    if (err.code === 3) { // Timeout
      // Dégrader le profil et appliquer un backoff pour redémarrer
      setProfile('degraded');
      const next = Math.min(backoffRef.current * 2, 60000);
      backoffRef.current = next;
      // Redémarrer le watch après backoff
      backoffTimerRef.current = window.setTimeout(startWatch, next);
    } else if (err.code === 1) { // Permission refusée
      setError('Permission de localisation refusée');
      stop();
    } else { // Position indisponible (code 2)
      setError('Position indisponible, tentative de récupération…');
      // Essayer un getCurrentPosition souple en secours (sans bloquer)
      try {
        navigator.geolocation.getCurrentPosition(onSuccess, () => {}, {
          enableHighAccuracy: false,
          maximumAge: 600000,
          timeout: 10000,
        });
      } catch {}
    }
  };

  const start = async () => {
    // Fix initial rapide via réseau/Wi‑Fi si possible
    if ('geolocation' in navigator) {
      await new Promise<void>((resolve) => {
        try {
          navigator.geolocation.getCurrentPosition(
            (p) => { onSuccess(p); resolve(); },
            () => resolve(),
            { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 }
          );
        } catch {
          resolve();
        }
      });
    } else {
      setError('Géolocalisation non supportée');
    }

    // Réinitialiser le backoff et démarrer le watch en profil équilibré
    backoffRef.current = 5000;
    setProfile('balanced');
    startWatch();
  };

  const stop = () => {
    clearWatch();
    setIsWatching(false);
  };

  useEffect(() => {
    return () => clearWatch();
  }, []);

  return {
    location,
    error,
    isWatching,
    profile,
    start,
    stop,
    lastFixAt: lastFixAtRef.current,
  } as const;
}
