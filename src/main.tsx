
  import { createRoot } from "react-dom/client";
  import App from "./App.tsx";
  import "./index.css";
  import { log } from "./utils/logger";

  const logger = log.child('bootstrap');
  logger.info('Initialisation de l\'application...');

  try {
    createRoot(document.getElementById("root")!).render(<App />);
    logger.info('Application rendue avec succès');
  } catch (e) {
    logger.error('Erreur lors du rendu de l\'application', e);
    throw e;
  }
  