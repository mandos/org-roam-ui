export type RpcErrorObject = {
  code: number,
  message: string,
  data?: unknown,
}

export type RpcResponse = { // success
  jsonrpc: '2.0',
  result: unknown,
  id: string | number
} | { // error
  jsonrpc: '2.0',
  error: RpcErrorObject,
  id: string | number | null
}

export type RpcRequest = {
  jsonrpc: '2.0',
  method: string,
  params?: Record<string, unknown> | unknown[],
  id?: string | number
}

export class RpcError extends Error {
  readonly code: number
  readonly data?: unknown

  // TODO: Options are added in TS 4.6.2, add it when we bump version
  constructor(error: RpcErrorObject) {
    super(error.message)
    this.code = error.code
    this.data = error.data

    // NOTE: Once again analyse solution with subclasses and instanceof
    Object.setPrototypeOf(this, new.target.prototype)
    this.name = new.target.name
  }
}

export class RpcTimeoutError extends RpcError {
  constructor(timeoutValue: number) {
    super({ message: `Request to WebSocket server failed because of timeout (${timeoutValue} ms)`, code: -32000 })
  }
}

export class RpcCancelledError extends RpcError {
  constructor() {
    super({ message: `Request to WebSocket server was cancelled`, code: -32001 })
  }
}

export function isRpcError(e: unknown): e is RpcError {
  return e instanceof RpcError
}
