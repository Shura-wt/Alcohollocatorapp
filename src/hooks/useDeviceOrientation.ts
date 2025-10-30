import { useState, useEffect } from 'react';

interface DeviceOrientationState {
  alpha: number | null; // Rotation autour de l'axe Z (boussole, 0-360°)
  beta: number | null;  // Rotation autour de l'axe X (-180 à 180°)
  gamma: number | null; // Rotation autour de l'axe Y (-90 à 90°)
  heading: number | null; // Cap boussole normalisé (0 = Nord)
  absolute: boolean;
  isSupported: boolean;
  hasPermission: boolean | null;
  error: string | null;
}

export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState<DeviceOrientationState>({
    alpha: null,
    beta: null,
    gamma: null,
    heading: null,
    absolute: false,
    isSupported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    hasPermission: null,
    error: null,
  });

  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!isActive) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      // Calcul du cap (heading) normalisé en degrés (0 = Nord)
      let heading: number | null = null;
      const anyEvent = event as any;

      // iOS Safari fournit webkitCompassHeading (0 = Nord, augmente dans le sens horaire)
      if (typeof anyEvent?.webkitCompassHeading === 'number') {
        heading = anyEvent.webkitCompassHeading as number;
      } else if (typeof event.alpha === 'number') {
        // Fallback: convertir alpha (0 = Nord, mais sens anti-horaire) en cap classique
        heading = (360 - (event.alpha as number)) % 360;
      }

      // Correction selon l'orientation de l'écran (portrait/paysage)
      let screenAngle = 0;
      const scr: any = window.screen as any;
      if (scr?.orientation && typeof scr.orientation.angle === 'number') {
        screenAngle = scr.orientation.angle as number;
      } else if (typeof (window as any).orientation === 'number') {
        screenAngle = (window as any).orientation as number;
      }
      if (heading !== null) {
        heading = (heading + screenAngle) % 360;
        if (heading < 0) heading += 360;
      }

      setOrientation(prev => ({
        ...prev,
        alpha: event.alpha ?? null,
        beta: event.beta ?? null,
        gamma: event.gamma ?? null,
        heading,
        absolute: event.absolute,
        hasPermission: true,
        error: null,
      }));
    };

    window.addEventListener('deviceorientation', handleOrientation);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [isActive]);

  const requestPermission = async (): Promise<boolean> => {
    if (!orientation.isSupported) {
      setOrientation(prev => ({
        ...prev,
        error: 'DeviceOrientation API non supportée sur cet appareil',
      }));
      return false;
    }

    // Pour iOS 13+, il faut demander la permission
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        
        if (permission === 'granted') {
          setIsActive(true);
          setOrientation(prev => ({
            ...prev,
            hasPermission: true,
            error: null,
          }));
          return true;
        } else {
          setOrientation(prev => ({
            ...prev,
            hasPermission: false,
            error: 'Permission refusée pour accéder à l\'orientation',
          }));
          return false;
        }
      } catch (error) {
        setOrientation(prev => ({
          ...prev,
          hasPermission: false,
          error: 'Erreur lors de la demande de permission',
        }));
        return false;
      }
    } else {
      // Pour les autres navigateurs, activer directement
      setIsActive(true);
      setOrientation(prev => ({
        ...prev,
        hasPermission: true,
        error: null,
      }));
      return true;
    }
  };

  const stopTracking = () => {
    setIsActive(false);
    setOrientation(prev => ({
      ...prev,
      alpha: null,
      beta: null,
      gamma: null,
      heading: null,
    }));
  };

  return {
    orientation,
    requestPermission,
    stopTracking,
    isActive,
  };
}
