import { EmacsTransport, EmacsTransportEvent } from '@/emacs/transport'

type UUID = string

export interface EmacsClient {
  getOrgText(nodeId: UUID): Promise<string>
  getTheme(): Promise<EmacsTheme>
}

interface EmacsEvent {
  event: string,
  data: string
}

type EmacsTheme = {
  name: string,
  colors: Record<string, string>
}

export function createEmacsClient(transport: EmacsTransport): EmacsClient {
  let reqId = 1

  function generateJsonRPC(method: string, reqId: number, params: object | Array<any> | null = null): string {
    return JSON.stringify({ jsonrpc: "2.0", id: reqId, method: method, ...(params !== null && { params }) })
  }

  return {
    getOrgText: (nodeId: UUID): Promise<string> => {
      reqId++
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any // TODO: Add correct type
          try {
            decoded = JSON.parse(event.data)
          } catch {
            return
          }
          if (decoded.id !== reqId) return
          transport.removeEventListener('message', handleMessage)
          resolve(decoded.result)
        }
        transport.addEventListener('message', handleMessage)
        transport.send(generateJsonRPC('node/getBody', reqId, { nodeId: nodeId }))
      })
    },
    getTheme: (): Promise<EmacsTheme> => {
      reqId++
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any
          try {
            decoded = JSON.parse(event.data)
          } catch { return }
          if (decoded.id !== reqId) return
          transport.removeEventListener('message', handleMessage)
          resolve(decoded.result)
        }
        transport.addEventListener('message', handleMessage)
        transport.send(generateJsonRPC('theme/get', reqId))
      })
    },
  }

}
