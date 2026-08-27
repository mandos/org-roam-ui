import ReconnectingWebSocket from 'reconnecting-websocket'
import { createLogger } from '@/utils/logger'

const log = createLogger('websocket')

type ReadyState = 'connecting' | 'open' | 'closing' | 'closed'

export interface EmacsTransportEvent {
  data: string
}

export interface EmacsTransport {
  open(): void
  close(): void
  send(data: string): void
  addEventListener(type: 'message', listener: (event: EmacsTransportEvent) => void): void
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void
  removeEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: EmacsTransportEvent | null) => void): void
  getState(): ReadyState
}

export function createEmacsTransport(url: string): EmacsTransport {
  const options = {
    startClosed: true,
  }
  const webSocket = new ReconnectingWebSocket(url, [], options)

  return {
    open: () => {
      log.debug('Opening websocket %s ...', url)
      webSocket.reconnect()
    },
    close: () => {
      log.debug('Closing websocket...')
      webSocket.close()
    },
    send: (data: string) => {
      webSocket.send(data)
    },
    addEventListener: (type, listener) => {
      webSocket.addEventListener(type, listener)
    },
    removeEventListener: (type, listener) => {
      webSocket.removeEventListener(type, listener)
    },
    getState: () => {
      switch (webSocket.readyState) {
        case webSocket.CONNECTING:
          return 'connecting'
        case webSocket.OPEN:
          return 'open'
        case webSocket.CLOSING:
          return 'closing'
        case webSocket.CLOSED:
          return 'closed'
        default:
          throw new Error(`Unknown websocket state: ${webSocket.readyState}`)
      }
    },
  }
}
