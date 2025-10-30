import { useEffect, useRef, useState } from 'react';

interface DeviceOrientationState {
  alpha: number | null; // Rotation autour de l'axe Z (DeviceOrientation fallback)
  beta: number | null;  // Rotation autour de l'axe X
  gamma: number | null; // Rotation autour de l'axe Y
  heading: number | null; // Cap boussole normalisé (0 = Nord)
  absolute: boolean;
  isSupported: boolean; // Vrai si au moins un fournisseur est disponible
  hasPermission: boolean | null;
  error: string | null;
}

type Provider = 'absolute-orientation' | 'magnetometer' | 'deviceorientation' | null;

type Vec3 = { x: number; y: number; z: number };

function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a < 0) a += 360;
  return a;
}

function shortestDelta(a: number, b: number): number {
  // delta from a -> b in [-180,180]
  let d = (b - a + 540) % 360 - 180;
  return d;
}

// Compute compass heading from DeviceOrientation Euler angles (spec worked example)
function computeCompassHeadingFromEuler(alpha: number, beta: number, gamma: number): number {
  // Convert degrees to radians
  const alphaRad = alpha * (Math.PI / 180);
  const betaRad = beta * (Math.PI / 180);
  const gammaRad = gamma * (Math.PI / 180);

  // Calculate equation components
  const cA = Math.cos(alphaRad);
  const sA = Math.sin(alphaRad);
  const cB = Math.cos(betaRad);
  const sB = Math.sin(betaRad);
  const cG = Math.cos(gammaRad);
  const sG = Math.sin(gammaRad);

  // Calculate A, B rotation components (C is not required for heading)
  const rA = -cA * sG - sA * sB * cG;
  const rB = -sA * sG + cA * sB * cG;
  // const rC = -cB * cG;

  // Calculate compass heading in radians
  let compassHeading = Math.atan(rA / rB);

  // Convert from half unit circle to whole unit circle
  if (rB < 0) {
    compassHeading += Math.PI;
  } else if (rA < 0) {
    compassHeading += 2 * Math.PI;
  }

  // Convert radians to degrees
  return (compassHeading * 180) / Math.PI;
}

export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState<DeviceOrientationState>({
    alpha: null,
    beta: null,
    gamma: null,
    heading: null,
    absolute: false,
    isSupported: typeof window !== 'undefined' && (
      'AbsoluteOrientationSensor' in (window as any) ||
      'Magnetometer' in (window as any) ||
      'DeviceOrientationEvent' in window
    ),
    hasPermission: null,
    error: null,
  });

  const [isActive, setIsActive] = useState(false);
  const providerRef = useRef<Provider>(null);

  // Sensor refs
  const absSensorRef = useRef<any>(null);
  const accelRef = useRef<any>(null);
  const magRef = useRef<any>(null);

  // Latest samples
  const latestAccel = useRef<Vec3 | null>(null);
  const latestMag = useRef<Vec3 | null>(null);
  const lastHeadingRef = useRef<number | null>(null);

  // Helpers
  const getScreenAngle = (): number => {
    let screenAngle = 0;
    const scr: any = window.screen as any;
    if (scr?.orientation && typeof scr.orientation.angle === 'number') {
      screenAngle = scr.orientation.angle as number;
    } else if (typeof (window as any).orientation === 'number') {
      screenAngle = (window as any).orientation as number;
    }
    return screenAngle;
  };

  const updateHeading = (newHeading: number, extra?: Partial<DeviceOrientationState>) => {
    // Smooth heading to reduce jitter
    const prev = lastHeadingRef.current;
    let smoothed = newHeading;
    if (typeof prev === 'number') {
      const delta = shortestDelta(prev, newHeading);
      const alpha = 0.2; // smoothing factor
      smoothed = normalizeAngle(prev + alpha * delta);
    }
    lastHeadingRef.current = smoothed;

    setOrientation(prevState => ({
      ...prevState,
      heading: smoothed,
      absolute: true,
      hasPermission: true,
      error: null,
      ...extra,
    }));
  };

  // Start sensors when active
  useEffect(() => {
    if (!isActive) return;

    const w = window as any;
    let cleanup: (() => void) | null = null;

    const startAbsoluteOrientation = () => {
      try {
        const sensor = new w.AbsoluteOrientationSensor({ frequency: 30 });
        absSensorRef.current = sensor;
        providerRef.current = 'absolute-orientation';
        sensor.onreading = () => {
          // sensor.quaternion: [x, y, z, w] (spec) but Chrome uses [w,x,y,z]? We'll handle both
          const q: any = sensor.quaternion;
          if (!q) return;
          let qw: number, qx: number, qy: number, qz: number;
          if (q.length === 4) {
            // Heuristic: if first component near 1 in magnitude, assume [w,x,y,z]
            if (Math.abs(q[0]) > 0.5) {
              qw = q[0]; qx = q[1]; qy = q[2]; qz = q[3];
            } else {
              // Assume [x,y,z,w]
              qx = q[0]; qy = q[1]; qz = q[2]; qw = q[3];
            }
          } else {
            return;
          }
          // Yaw about Z
          const yawRad = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
          let heading = normalizeAngle(360 - (yawRad * 180) / Math.PI);
          heading = normalizeAngle(heading + getScreenAngle());
          updateHeading(heading, { absolute: true });
        };
        sensor.onerror = (e: any) => {
          console.warn('AbsoluteOrientationSensor error', e);
          sensor.stop?.();
          absSensorRef.current = null;
          // Fallback to magnetometer
          startMagnetometer();
        };
        sensor.start();
        cleanup = () => {
          sensor.stop?.();
          absSensorRef.current = null;
        };
      } catch (err) {
        console.warn('AbsoluteOrientationSensor not available:', err);
        startMagnetometer();
      }
    };

    const startMagnetometer = () => {
      if (!('Magnetometer' in w) || !('Accelerometer' in w)) {
        // Fallback to DeviceOrientation
        startDeviceOrientation();
        return;
      }
      try {
        const accel = new w.Accelerometer({ frequency: 30 });
        const mag = new w.Magnetometer({ frequency: 30 });
        accelRef.current = accel;
        magRef.current = mag;
        providerRef.current = 'magnetometer';

        accel.onreading = () => {
          latestAccel.current = { x: accel.x, y: accel.y, z: accel.z };
          computeTiltCompensatedHeading();
        };
        accel.onerror = (e: any) => {
          console.warn('Accelerometer error', e);
        };

        mag.onreading = () => {
          latestMag.current = { x: mag.x, y: mag.y, z: mag.z };
          computeTiltCompensatedHeading();
        };
        mag.onerror = (e: any) => {
          console.warn('Magnetometer error', e);
          // If magnetometer errors (e.g. Permissions-Policy), fallback
          stopMagnetometer();
          startDeviceOrientation();
        };

        const stopMagnetometer = () => {
          try { mag.stop?.(); } catch {}
          try { accel.stop?.(); } catch {}
          magRef.current = null;
          accelRef.current = null;
        };

        const computeTiltCompensatedHeading = () => {
          const a = latestAccel.current;
          const m = latestMag.current;
          if (!a || !m) return;

          // Normalize accelerometer vector to get gravity direction
          const gNorm = Math.hypot(a.x, a.y, a.z) || 1;
          const ax = a.x / gNorm, ay = a.y / gNorm, az = a.z / gNorm;

          // Roll (phi) and Pitch (theta)
          const phi = Math.atan2(ay, az);
          const theta = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));

          // Tilt compensation of magnetometer
          const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
          const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);

          const Xh = m.x * cosTheta + m.z * sinTheta;
          const Yh = m.x * sinPhi * sinTheta + m.y * cosPhi - m.z * sinPhi * cosTheta;

          // Heading: Android often uses atan2(-Yh, Xh). If inverted, swap sign.
          let heading = Math.atan2(-Yh, Xh) * (180 / Math.PI);
          heading = normalizeAngle(heading);

          // Screen orientation correction
          heading = normalizeAngle(heading + getScreenAngle());

          updateHeading(heading);
        };

        accel.start();
        mag.start();

        cleanup = () => {
          stopMagnetometer();
        };
      } catch (err: any) {
        console.warn('Magnetometer/Accelerometer not available or blocked:', err);
        startDeviceOrientation();
      }
    };

    const startDeviceOrientation = () => {
      providerRef.current = 'deviceorientation';
      const handleOrientation = (event: DeviceOrientationEvent) => {
        let heading: number | null = null;
        const anyEvent = event as any;
        const { alpha, beta, gamma, absolute } = event as any;

        // iOS Safari provides webkitCompassHeading (already screen-corrected)
        if (typeof anyEvent?.webkitCompassHeading === 'number') {
          heading = anyEvent.webkitCompassHeading as number;
        } else if (
          absolute === true &&
          typeof alpha === 'number' &&
          typeof beta === 'number' &&
          typeof gamma === 'number'
        ) {
          // Spec-compliant absolute orientation: compute heading from Euler angles
          try {
            heading = computeCompassHeadingFromEuler(alpha, beta, gamma);
          } catch (e) {
            // Fallback below
          }
        }

        // Generic fallback: derive heading from alpha only (Android non-absolute)
        if (heading === null && typeof alpha === 'number') {
          heading = (360 - alpha) % 360;
        }

        if (heading !== null) {
          // Adjust for current screen orientation and normalize
          heading = normalizeAngle(heading + getScreenAngle());
          updateHeading(heading, {
            alpha: (typeof alpha === 'number') ? alpha : null,
            beta: (typeof beta === 'number') ? beta : null,
            gamma: (typeof gamma === 'number') ? gamma : null,
            absolute: !!absolute,
          });
        }
      };
      window.addEventListener('deviceorientation', handleOrientation);
      cleanup = () => {
        window.removeEventListener('deviceorientation', handleOrientation);
      };
    };

    // Choose best provider
    if ('AbsoluteOrientationSensor' in w) {
      startAbsoluteOrientation();
    } else if ('Magnetometer' in w && 'Accelerometer' in w) {
      startMagnetometer();
    } else if ('DeviceOrientationEvent' in window) {
      startDeviceOrientation();
    } else {
      setOrientation(prev => ({ ...prev, error: 'Aucun capteur d\'orientation disponible', isSupported: false }));
    }

    return () => {
      try {
        cleanup?.();
      } finally {
        // stop any sensors lingering
        try { absSensorRef.current?.stop?.(); } catch {}
        try { magRef.current?.stop?.(); } catch {}
        try { accelRef.current?.stop?.(); } catch {}
        absSensorRef.current = null;
        magRef.current = null;
        accelRef.current = null;
      }
    };
  }, [isActive]);

  const requestPermission = async (): Promise<boolean> => {
    // iOS explicit permission for DeviceOrientation
    if (typeof (window as any).DeviceOrientationEvent !== 'undefined' &&
        typeof ((window as any).DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permission = await ((window as any).DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setIsActive(true);
          setOrientation(prev => ({ ...prev, hasPermission: true, error: null }));
          return true;
        } else {
          setOrientation(prev => ({ ...prev, hasPermission: false, error: 'Permission refusée pour l\'orientation' }));
          return false;
        }
      } catch (error) {
        setOrientation(prev => ({ ...prev, hasPermission: false, error: 'Erreur lors de la demande de permission' }));
        return false;
      }
    }

    // For Generic Sensor API: try to start sensors in the effect by toggling active
    // Localhost is a secure context; otherwise HTTPS is required.
    setIsActive(true);
    setOrientation(prev => ({ ...prev, hasPermission: true, error: null }));
    return true;
  };

  const stopTracking = () => {
    setIsActive(false);
    lastHeadingRef.current = null;
    // Sensors/effects are stopped by the cleanup above
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
