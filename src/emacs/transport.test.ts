import { createEmacsTransport } from './transport'

const { instances, MockSocket } = vi.hoisted(() => {
  class MockSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    CONNECTING = 0
    OPEN = 1
    CLOSING = 2
    CLOSED = 3
    readyState = 0
    url: string
    protocols: unknown
    options: unknown
    reconnect = vi.fn()
    close = vi.fn()
    send = vi.fn()
    addEventListener = vi.fn()

    constructor(url: string, protocols: unknown, options: unknown) {
      this.url = url
      this.protocols = protocols
      this.options = options
      instances.push(this)
    }
  }
  const instances: MockSocket[] = []
  return { instances, MockSocket }
})

vi.mock('reconnecting-websocket', () => ({ default: MockSocket }))

// Every createEmacsTransport() call constructs exactly one socket; tests
// only ever care about the most recent one.
function lastSocket() {
  const socket = instances[instances.length - 1]
  if (!socket) throw new Error('no socket was created')
  return socket
}

describe('createEmacsTransport', () => {
  beforeEach(() => {
    instances.length = 0
    vi.spyOn(console, 'debug').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a ReconnectingWebSocket that starts closed and has no protocols', () => {
    createEmacsTransport('ws://localhost:35901')

    const socket = lastSocket()
    expect(socket.url).toBe('ws://localhost:35901')
    expect(socket.protocols).toEqual([])
    expect(socket.options).toEqual({ startClosed: true })
  })

  it('open() reconnects the underlying socket', () => {
    const transport = createEmacsTransport('ws://x')

    transport.open()

    expect(lastSocket().reconnect).toHaveBeenCalledTimes(1)
  })

  it('close() closes the underlying socket', () => {
    const transport = createEmacsTransport('ws://x')

    transport.close()

    expect(lastSocket().close).toHaveBeenCalledTimes(1)
  })

  it('send() forwards data to the underlying socket', () => {
    const transport = createEmacsTransport('ws://x')

    transport.send('(+ 1 2)')

    expect(lastSocket().send).toHaveBeenCalledWith('(+ 1 2)')
  })

  it('addEventListener() forwards the type and listener to the underlying socket', () => {
    const transport = createEmacsTransport('ws://x')
    const listener = () => {}

    transport.addEventListener('message', listener)

    expect(lastSocket().addEventListener).toHaveBeenCalledWith('message', listener)
  })

  describe('getState()', () => {
    const cases: Array<[number, string]> = [
      [0, 'connecting'],
      [1, 'open'],
      [2, 'closing'],
      [3, 'closed'],
    ]

    it.each(cases)('maps readyState %i to %s', (readyState, expected) => {
      const transport = createEmacsTransport('ws://x')
      lastSocket().readyState = readyState

      expect(transport.getState()).toBe(expected)
    })

    it('throws for an unrecognized readyState', () => {
      const transport = createEmacsTransport('ws://x')
      lastSocket().readyState = 99

      expect(() => transport.getState()).toThrow('Unknown websocket state: 99')
    })
  })
})
