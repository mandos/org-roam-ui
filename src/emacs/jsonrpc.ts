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

  // TODO: options are added in TS 4.6.2, add it when we bump version
  constructor(error: RpcErrorObject) {
    super(error.message)
    this.code = error.code
    this.data = error.data

    this.name = "RpcError"
    Object.setPrototypeOf(this, RpcError.prototype)
  }
}

export function isRpcError(e: unknown): e is RpcError {
  return e instanceof RpcError
}
