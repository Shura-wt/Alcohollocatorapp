type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_ORDER: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function getEnv() {
  // Vite injecte import.meta.env
  const env: any = (import.meta as any).env || {};
  return env;
}

function parseEnabled(env: any): boolean {
  // Par défaut: activé en développement, désactivé en production sauf si VITE_ENABLE_LOGS=true
  const fromEnv = env.VITE_ENABLE_LOGS;
  if (typeof fromEnv === 'string') {
    return fromEnv.toLowerCase() === 'true' || fromEnv === '1';
  }
  return env.MODE !== 'production';
}

function parseLevel(env: any): LogLevel {
  const lvl = (env.VITE_LOG_LEVEL || (env.MODE === 'development' ? 'debug' : 'info')).toString().toLowerCase();
  if (lvl in LEVEL_ORDER) return lvl as LogLevel;
  return 'info';
}

function nowTs() {
  const d = new Date();
  const pad = (n: number, w = 2) => n.toString().padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export interface Logger {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
  child: (ns: string) => Logger;
}

export function createLogger(namespace: string): Logger {
  const env = getEnv();
  const enabled = parseEnabled(env);
  const level = parseLevel(env);

  function shouldLog(l: LogLevel) {
    return enabled && LEVEL_ORDER[l] <= LEVEL_ORDER[level];
  }

  function prefix(l: LogLevel) {
    return `[${nowTs()}] [${l.toUpperCase()}] [${namespace}]`;
  }

  const logger: Logger = {
    debug: (...args: any[]) => {
      if (shouldLog('debug')) console.debug(prefix('debug'), ...args);
    },
    info: (...args: any[]) => {
      if (shouldLog('info')) console.info(prefix('info'), ...args);
    },
    warn: (...args: any[]) => {
      if (shouldLog('warn')) console.warn(prefix('warn'), ...args);
    },
    error: (...args: any[]) => {
      if (shouldLog('error')) console.error(prefix('error'), ...args);
    },
    child: (ns: string) => createLogger(`${namespace}:${ns}`),
  };

  return logger;
}

// Logger par défaut de l'application
export const log = createLogger('app');
