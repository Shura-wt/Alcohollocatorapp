import { motion } from 'motion/react';
import { Navigation, Compass as CompassIcon } from 'lucide-react';
import { Button } from './ui/button';

interface CompassProps {
  direction: number; // Direction en degrés (0 = Nord)
  distance?: number; // Distance en mètres
  establishmentName?: string;
  deviceHeading?: number | null; // Orientation du téléphone (si disponible)
  onRequestOrientation?: () => void; // Callback pour demander l'orientation
  isOrientationActive?: boolean;
}

export function Compass({ 
  direction, 
  distance, 
  establishmentName,
  deviceHeading,
  onRequestOrientation,
  isOrientationActive 
}: CompassProps) {
  // Calculer la direction finale (direction cible - orientation téléphone)
  const finalDirection = deviceHeading !== null && deviceHeading !== undefined
    ? direction - deviceHeading
    : direction;

  return (
    <div className="flex flex-col items-center justify-center p-8">
      {/* Boussole */}
      <div 
        className="relative w-64 h-64 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-2xl flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
        onClick={onRequestOrientation}
      >
        {/* Indicateur d'orientation active */}
        {isOrientationActive && (
          <div className="absolute -top-2 -right-2 bg-green-500 rounded-full p-2 shadow-lg animate-pulse">
            <CompassIcon className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Cercle extérieur avec marques cardinales — fixe (ne bouge pas) */}
        <motion.div 
          className="absolute inset-0 rounded-full border-4 border-white/30"
          // Cadran cardinal fixe (N/E/S/O) — ne tourne plus avec l'orientation du téléphone
          animate={{ rotate: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-white/90">N</div>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-white/90">S</div>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 text-white/90">O</div>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-white/90">E</div>
        </motion.div>
        
        {/* Cercle intérieur */}
        <div className="w-48 h-48 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
          {/* Flèche qui pointe vers la direction */}
          <motion.div
            animate={{ rotate: finalDirection }}
            transition={{ type: "spring", stiffness: 50, damping: 20 }}
            className="absolute"
          >
            <Navigation className="w-20 h-20 text-white drop-shadow-lg" fill="white" />
          </motion.div>
        </div>

        {/* Texte d'aide au centre */}
        {!isOrientationActive && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70 text-center px-4">
            Appuyez pour activer l'orientation
          </div>
        )}
      </div>
      
      {/* Bouton pour activer/désactiver l'orientation */}
      {onRequestOrientation && (
        <Button
          onClick={onRequestOrientation}
          variant={isOrientationActive ? "default" : "outline"}
          className="mt-4"
        >
          {isOrientationActive ? (
            <>
              <CompassIcon className="w-4 h-4 mr-2" />
              Orientation activée
            </>
          ) : (
            <>
              <CompassIcon className="w-4 h-4 mr-2" />
              Activer l'orientation
            </>
          )}
        </Button>
      )}
      
      {/* Informations sur l'établissement */}
      {establishmentName && (
        <div className="mt-6 text-center">
          <p className="text-gray-700">{establishmentName}</p>
          {distance && (
            <p className="text-gray-500 mt-1">
              {distance < 1000 
                ? `${Math.round(distance)} m` 
                : `${(distance / 1000).toFixed(1)} km`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
