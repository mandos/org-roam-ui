import { createEmacsClient } from './client'
import type { EmacsTransport, EmacsTransportEvent } from './transport'

function createMockTransport(): EmacsTransport {
  return {
    open: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    getState: vi.fn(),
  }
}

function messageListeners(transport: EmacsTransport): Array<(event: EmacsTransportEvent) => void> {
  const calls = (transport.addEventListener as ReturnType<typeof vi.fn>).mock.calls
  return calls.filter(([type]) => type === 'message').map((call) => call[1])
}

function lastMessageListener(transport: EmacsTransport): (event: EmacsTransportEvent) => void {
  const listener = messageListeners(transport).pop()
  if (!listener) throw new Error('no message listener was registered')
  return listener
}

describe('createEmacsClient', () => {
  describe('getOrgText', () => {
    it('sends a getOrgText command with the node id', () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      client.getOrgText('abc-123')

      expect(transport.send).toHaveBeenCalledWith(
        JSON.stringify({ command: 'getOrgText', id: 'abc-123' })
      )
    })

    it('resolves with the text from a matching getText message', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promise = client.getOrgText('abc-123')
      lastMessageListener(transport)({
        data: JSON.stringify({ eventName: 'getText', id: 'abc-123', data: 'hello world' }),
      })

      await expect(promise).resolves.toBe('hello world')
    })

    it('removes the message listener once resolved', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promise = client.getOrgText('abc-123')
      const listener = lastMessageListener(transport)
      listener({ data: JSON.stringify({ eventName: 'getText', id: 'abc-123', data: 'hi' }) })
      await promise

      expect(transport.removeEventListener).toHaveBeenCalledWith('message', listener)
    })

    it('ignores messages for a different node id', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promise = client.getOrgText('abc-123')
      const listener = lastMessageListener(transport)
      listener({ data: JSON.stringify({ eventName: 'getText', id: 'other-id', data: 'nope' }) })
      listener({ data: JSON.stringify({ eventName: 'getText', id: 'abc-123', data: 'yep' }) })

      await expect(promise).resolves.toBe('yep')
    })

    it('ignores messages with a different event name', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promise = client.getOrgText('abc-123')
      const listener = lastMessageListener(transport)
      listener({ data: JSON.stringify({ eventName: 'somethingElse', id: 'abc-123', data: 'nope' }) })
      listener({ data: JSON.stringify({ eventName: 'getText', id: 'abc-123', data: 'yep' }) })

      await expect(promise).resolves.toBe('yep')
    })

    it('ignores messages that are not valid JSON', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promise = client.getOrgText('abc-123')
      const listener = lastMessageListener(transport)
      listener({ data: 'not json' })
      listener({ data: JSON.stringify({ eventName: 'getText', id: 'abc-123', data: 'yep' }) })

      await expect(promise).resolves.toBe('yep')
    })

    it('resolves concurrent requests for different node ids independently', async () => {
      const transport = createMockTransport()
      const client = createEmacsClient(transport)

      const promiseA = client.getOrgText('id-a')
      const promiseB = client.getOrgText('id-b')
      const [listenerA, listenerB] = messageListeners(transport)

      listenerB({ data: JSON.stringify({ eventName: 'getText', id: 'id-b', data: 'B text' }) })
      listenerA({ data: JSON.stringify({ eventName: 'getText', id: 'id-a', data: 'A text' }) })

      await expect(promiseA).resolves.toBe('A text')
      await expect(promiseB).resolves.toBe('B text')
    })
  })
})
