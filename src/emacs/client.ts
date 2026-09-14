import { EmacsTransport, EmacsTransportEvent } from '@/emacs/transport'

type UUID = string

export interface EmacsClient {
  getOrgText(nodeId: UUID): Promise<string>
  deleteNode(file: string): Promise<void>
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
      const id = reqId++
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any // TODO: Add correct type
          try {
            decoded = JSON.parse(event.data)
          } catch {
            return
          }
          if (decoded.id !== id) return
          transport.removeEventListener('message', handleMessage)
          resolve(decoded.result)
        }
        transport.addEventListener('message', handleMessage)
        transport.send(generateJsonRPC('node/getBody', id, { nodeId: nodeId }))
      })
    },
    deleteNode: (nodeFile: string): Promise<void> => {
      const id = reqId++
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any
          try { decoded = JSON.parse(event.data) }
          catch { return }
          if (decoded.id !== id) return
          transport.removeEventListener('message', handleMessage)
          if (decoded.error) {
            reject(new Error(decoded.error.message))
            return
          }
          resolve()
        }
        transport.addEventListener('message', handleMessage)
        transport.send(generateJsonRPC('node/delete', id, { nodeFile: nodeFile }))
      })
    },
    getTheme: (): Promise<EmacsTheme> => {
      const id = reqId++
      return new Promise((resolve, reject) => {
        const handleMessage = (event: EmacsTransportEvent) => {
          let decoded: any
          try {
            decoded = JSON.parse(event.data)
          } catch { return }
          if (decoded.id !== id) return
          transport.removeEventListener('message', handleMessage)
          resolve(decoded.result)
        }
        transport.addEventListener('message', handleMessage)
        transport.send(generateJsonRPC('theme/get', id))
      })
    },
  }

}
