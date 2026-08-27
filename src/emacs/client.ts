import { EmacsTransport, EmacsTransportEvent } from '@/emacs/transport'

type UUID = string

export interface EmacsClient {
  getOrgText(nodeId: UUID): Promise<string>
}

export function createEmacsClient(transport: EmacsTransport): EmacsClient {
  return {
    getOrgText: (nodeId: UUID): Promise<string> => {
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any // TODO: Add correct type
          try {
            decoded = JSON.parse(event.data)
          } catch {
            return
          }
          if (decoded.eventName !== 'getText' || decoded.id !== nodeId) return
          transport.removeEventListener('message', handleMessage)
          resolve(decoded.data)
        }
        transport.addEventListener('message', handleMessage)
        transport.send(JSON.stringify({ command: 'getNodeBody', data: { id: nodeId } }))
      })
    }
  }
}
