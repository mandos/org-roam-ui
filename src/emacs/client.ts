import { EmacsTransport, EmacsTransportEvent } from '@/emacs/transport'
import { RpcCancelledError, RpcError, RpcResponse, RpcTimeoutError } from '@/emacs/jsonrpc'


type NoParams = Record<string, never>

type ApiSpecs = {
  'node/delete': { params: { nodeFile: string }, result: 'done' }
  'node/getBody': { params: { nodeId: UUID }, result: string }
  'theme/get': { params: NoParams, result: EmacsTheme }
}

export interface EmacsClient {
  getOrgText(nodeId: UUID): PendingResponse<ApiSpecs['node/getBody']['result']>
  deleteNode(file: string): PendingResponse<ApiSpecs['node/delete']['result']>
  getTheme(): PendingResponse<ApiSpecs['theme/get']['result']>
}

type UUID = string

type EmacsTheme = {
  name: string,
  colors: Record<string, string>
}

type PendingResponse<T> = Promise<T> & { cancel: () => void }

const DEFAULT_REQUEST_TIMEOUT = 1000

export function createEmacsClient(transport: EmacsTransport): EmacsClient {
  let reqId = 1

  function generateJsonRPC(method: string, reqId: number, params: object | Array<any> | null = null): string {
    return JSON.stringify({ jsonrpc: "2.0", id: reqId, method: method, ...(params !== null && { params }) })
  }

  function setResponseTimeout<T>(promise: Promise<T>, timeoutValue: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout>
    const requestTimeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new RpcTimeoutError(timeoutValue)) }, timeoutValue)
    })
    return Promise.race([promise, requestTimeout]).finally(() => { clearTimeout(timer) })
  }

  function sendAndWaitForResponse<M extends keyof ApiSpecs>(
    method: M,
    data: ApiSpecs[M]['params'],
    timeout: number = DEFAULT_REQUEST_TIMEOUT
  ): PendingResponse<ApiSpecs[M]['result']> {
    const id = reqId++
    let responseHandler: (event: EmacsTransportEvent) => void
    let rejectResponse: (reason: RpcError) => void

    const response = new Promise<ApiSpecs[M]['result']>((resolve, reject: (reason: RpcError) => void) => {
      rejectResponse = reject
      responseHandler = (event) => {
        let decoded: RpcResponse
        try { decoded = JSON.parse(event.data) }
        catch { return }
        if (decoded.id !== id) return
        if ('error' in decoded) {
          reject(new RpcError(decoded.error))
          return
        }
        // TODO: Should be verification in runtime if result has correct shape
        resolve(decoded.result as ApiSpecs[M]['result'])

      }
      transport.addEventListener('message', responseHandler)
      transport.send(generateJsonRPC(method, id, data))
    })
    const cleanup = () => transport.removeEventListener('message', responseHandler)
    const cancel = () => {
      cleanup()
      rejectResponse(new RpcCancelledError())
    }
    return Object.assign(setResponseTimeout(response, timeout).finally(cleanup), { cancel })
  }

  function getOrgText(nodeId: UUID): PendingResponse<ApiSpecs['node/getBody']['result']> {
    return sendAndWaitForResponse('node/getBody', { nodeId })
  }
  function deleteNode(nodeFile: string): PendingResponse<ApiSpecs['node/delete']['result']> {
    return sendAndWaitForResponse("node/delete", { nodeFile })
  }
  function getTheme(): PendingResponse<ApiSpecs['theme/get']['result']> {
    return sendAndWaitForResponse("theme/get", {})
  }

  return {
    getOrgText,
    deleteNode,
    getTheme,
  }

}
