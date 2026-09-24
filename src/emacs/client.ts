import { EmacsTransport, EmacsTransportEvent } from '@/emacs/transport'
import { RpcCancelledError, RpcError, RpcNotification, RpcResponse, RpcTimeoutError } from '@/emacs/jsonrpc'
import { EmacsApiSpec, EmacsNotifications, OrgRoamNode, UUID } from '@/emacs/api'
import { createLogger } from '@/utils/logger'

export interface EmacsClient {
  // To get notification from Emacs
  subscribeToChannel<M extends keyof EmacsNotifications>(channelName: M, subscriber: (data: EmacsNotifications[M]) => void): () => void
  // To make calls to Emacs
  getOrgText(nodeId: UUID): PendingResponse<EmacsApiSpec['node/getBody']['result']>
  openNode(node: OrgRoamNode): PendingResponse<EmacsApiSpec['node/open']['result']>
  createNode(node: OrgRoamNode): PendingResponse<EmacsApiSpec['node/create']['result']>
  deleteNode(file: string): PendingResponse<EmacsApiSpec['node/delete']['result']>
  getTheme(): PendingResponse<EmacsApiSpec['theme/get']['result']>
}

type PendingResponse<T> = Promise<T> & { cancel: () => void }

const DEFAULT_REQUEST_TIMEOUT = 1000
const log = createLogger("emacsClient")

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

  function sendAndWaitForResponse<M extends keyof EmacsApiSpec>(
    method: M,
    data: EmacsApiSpec[M]['params'],
    timeout: number = DEFAULT_REQUEST_TIMEOUT
  ): PendingResponse<EmacsApiSpec[M]['result']> {
    const id = reqId++
    let responseHandler: (event: EmacsTransportEvent) => void
    let rejectResponse: (reason: RpcError) => void

    const response = new Promise<EmacsApiSpec[M]['result']>((resolve, reject: (reason: RpcError) => void) => {
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
        resolve(decoded.result as EmacsApiSpec[M]['result'])
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

  function getOrgText(nodeId: UUID): PendingResponse<EmacsApiSpec['node/getBody']['result']> {
    return sendAndWaitForResponse('node/getBody', { nodeId })
  }
  function openNode(node: OrgRoamNode): PendingResponse<EmacsApiSpec['node/open']['result']> {
    return sendAndWaitForResponse('node/open', { nodeId: node.id })
  }
  function createNode(node: OrgRoamNode): PendingResponse<EmacsApiSpec['node/create']['result']> {
    return sendAndWaitForResponse('node/create', { nodeId: node.id, title: node.title, ref: node.properties.ROAM_REFS })
  }
  function deleteNode(nodeFile: string): PendingResponse<EmacsApiSpec['node/delete']['result']> {
    return sendAndWaitForResponse("node/delete", { nodeFile })
  }
  function getTheme(): PendingResponse<EmacsApiSpec['theme/get']['result']> {
    return sendAndWaitForResponse("theme/get", {})
  }

  function subscribeToChannel<M extends keyof EmacsNotifications>(
    name: M,
    subscriber: (data: EmacsNotifications[M]) => void
  ): () => void {
    const subscribeHandler: (event: EmacsTransportEvent) => void = (event) => {
      let decoded: RpcNotification<EmacsNotifications[M]>
      try { decoded = JSON.parse(event.data) }
      catch (e) {
        log.error("Error during decoding websocket payload", e)
        return
      }
      if (typeof decoded !== 'object' || decoded === null) return
      if ('id' in decoded || decoded.method !== name) return
      subscriber(decoded.params)
    }
    transport.addEventListener('message', subscribeHandler)
    return () => { transport.removeEventListener('message', subscribeHandler) }
  }

  // TODO: Should I hide it behind flag?
  transport.addEventListener('message', (event) => { log.debug("Message event:", event) })
  transport.addEventListener('error', (event) => { log.debug("Error event:", event) })
  transport.addEventListener('open', (event) => { log.debug("Open event:", event) })
  transport.addEventListener('close', (event) => { log.debug("Close event:", event) })

  return {
    subscribeToChannel,
    getOrgText,
    openNode,
    createNode,
    deleteNode,
    getTheme,
  }
}
