// Small leveled/scoped logger. Keeps end-user builds quiet by default while
// still letting anyone flip on debug output at runtime (no rebuild needed)
// via `window.__oruSetLogLevel('debug')` or localStorage, since org-roam-ui
// ships as a pre-built static export with no build step available to users.

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent'

const LEVEL_WEIGHT: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
}

const STORAGE_KEY = 'oru:log-level'

function isLevel(value: unknown): value is Level {
  return typeof value === 'string' && value in LEVEL_WEIGHT
}

function defaultLevel(): Level {
  return process.env.NODE_ENV === 'production' ? 'warn' : 'debug'
}

function readStoredLevel(): Level | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isLevel(stored) ? stored : null
  } catch {
    // localStorage can throw in private-browsing/sandboxed contexts
    return null
  }
}

let currentLevel: Level = readStoredLevel() ?? defaultLevel()

export function setLogLevel(level: Level): void {
  currentLevel = level
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // ignore: level still applies for the current session
  }
}

export function getLogLevel(): Level {
  return currentLevel
}

function shouldLog(level: Exclude<Level, 'silent'>): boolean {
  return LEVEL_WEIGHT[level] >= LEVEL_WEIGHT[currentLevel]
}

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export function createLogger(scope?: string): Logger {
  const prefix = scope ? `[oru:${scope}]` : '[oru]'
  return {
    debug: (...args) => shouldLog('debug') && console.debug(prefix, ...args),
    info: (...args) => shouldLog('info') && console.info(prefix, ...args),
    warn: (...args) => shouldLog('warn') && console.warn(prefix, ...args),
    error: (...args) => shouldLog('error') && console.error(prefix, ...args),
  }
}

export const logger = createLogger()

if (typeof window !== 'undefined') {
  ;(window as any).__oruSetLogLevel = setLogLevel
}
