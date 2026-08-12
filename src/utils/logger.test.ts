import type { Logger } from '@/utils/logger'
import { createLogger, getLogLevel, logger, setLogLevel } from '@/utils/logger'

type Level = 'debug' | 'info' | 'warn' | 'error' | 'silent'
type Method = Exclude<Level, 'silent'>

const METHODS: Method[] = ['debug', 'info', 'warn', 'error']
const STORAGE_KEY = 'oru:log-level'

type Spies = Record<Method, ReturnType<typeof vi.spyOn>>

// Spies must be created per-test: afterEach restores the originals, which
// detaches them from `console` for good.
function spyOnConsole(): Spies {
  return Object.fromEntries(
    METHODS.map((m) => [m, vi.spyOn(console, m).mockImplementation(() => {})]),
  ) as Spies
}

/**
 * Re-imports the module with a fake `window` in place. `currentLevel` is
 * initialised at import time, so start-up behaviour is only observable on a
 * fresh module instance.
 */
async function importFresh(win?: { getItem?: () => string | null; setItem?: () => void }) {
  vi.resetModules()
  if (win) {
    ;(globalThis as any).window = {
      localStorage: {
        getItem: win.getItem ?? (() => null),
        setItem: win.setItem ?? (() => {}),
      },
    }
  } else {
    delete (globalThis as any).window
  }
  return import('@/utils/logger')
}

describe('logger', () => {
  let spies: Spies

  beforeEach(() => {
    spies = spyOnConsole()
    setLogLevel('debug')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    delete (globalThis as any).window
  })

  describe('level filtering', () => {
    // Each level emits itself and everything more severe.
    const cases: Array<[Level, Method[]]> = [
      ['debug', ['debug', 'info', 'warn', 'error']],
      ['info', ['info', 'warn', 'error']],
      ['warn', ['warn', 'error']],
      ['error', ['error']],
      ['silent', []],
    ]

    it.each(cases)('at level %s emits exactly %j', (level, expected) => {
      setLogLevel(level)
      const log = createLogger('scope')

      METHODS.forEach((m) => log[m]('message'))

      METHODS.forEach((m) => {
        expected.includes(m)
          ? expect(spies[m]).toHaveBeenCalledTimes(1)
          : expect(spies[m]).not.toHaveBeenCalled()
      })
    })
  })

  describe('output format', () => {
    it('prefixes with the scope name', () => {
      createLogger('websocket').warn('careful')
      expect(spies.warn).toHaveBeenCalledWith('[oru:websocket]', 'careful')
    })

    it('falls back to a bare prefix when unscoped', () => {
      createLogger().warn('careful')
      expect(spies.warn).toHaveBeenCalledWith('[oru]', 'careful')
    })

    it('forwards every argument untouched', () => {
      const payload = { id: 'abc' }
      createLogger('ws').error('failed %s', 42, payload)
      expect(spies.error).toHaveBeenCalledWith('[oru:ws]', 'failed %s', 42, payload)
    })

    it('exposes a ready-made unscoped logger', () => {
      logger.warn('hello')
      expect(spies.warn).toHaveBeenCalledWith('[oru]', 'hello')
    })
  })

  describe('setLogLevel / getLogLevel', () => {
    it('round-trips the current level', () => {
      setLogLevel('info')
      expect(getLogLevel()).toBe('info')
    })

    it('applies to loggers created before the change', () => {
      const log: Logger = createLogger('early')
      setLogLevel('error')
      log.warn('suppressed now')
      expect(spies.warn).not.toHaveBeenCalled()
    })
  })

  describe('start-up level', () => {
    it('defaults to debug outside production', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      const mod = await importFresh()
      expect(mod.getLogLevel()).toBe('debug')
    })

    it('defaults to warn in production, keeping user builds quiet', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      const mod = await importFresh()
      expect(mod.getLogLevel()).toBe('warn')
    })

    it('prefers a valid stored level over the default', async () => {
      const mod = await importFresh({ getItem: () => 'error' })
      expect(mod.getLogLevel()).toBe('error')
    })

    it('ignores a corrupted stored value', async () => {
      const mod = await importFresh({ getItem: () => 'not-a-level' })
      expect(mod.getLogLevel()).toBe('debug')
    })

    it('survives localStorage throwing (private browsing)', async () => {
      const mod = await importFresh({
        getItem: () => {
          throw new Error('SecurityError')
        },
      })
      expect(mod.getLogLevel()).toBe('debug')
    })
  })

  describe('persistence', () => {
    it('writes the level to localStorage', async () => {
      const setItem = vi.fn()
      const mod = await importFresh({ setItem })
      mod.setLogLevel('error')
      expect(setItem).toHaveBeenCalledWith(STORAGE_KEY, 'error')
    })

    it('still applies the level when the write throws', async () => {
      const mod = await importFresh({
        setItem: () => {
          throw new Error('QuotaExceededError')
        },
      })
      expect(() => mod.setLogLevel('error')).not.toThrow()
      expect(mod.getLogLevel()).toBe('error')
    })

    it('is a no-op without a window (SSR)', async () => {
      const mod = await importFresh()
      expect(() => mod.setLogLevel('error')).not.toThrow()
      expect(mod.getLogLevel()).toBe('error')
    })
  })

  describe('runtime escape hatch', () => {
    it('exposes __oruSetLogLevel on window for pre-built users', async () => {
      const mod = await importFresh({})
      const exposed = (globalThis as any).window.__oruSetLogLevel
      expect(exposed).toBe(mod.setLogLevel)

      exposed('silent')
      expect(mod.getLogLevel()).toBe('silent')
    })

    it('is not attached when there is no window', async () => {
      await importFresh()
      expect((globalThis as any).window).toBeUndefined()
    })
  })
})
