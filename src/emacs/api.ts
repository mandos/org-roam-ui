// Emacs server API, list of messages client can send to server with request params
// and expected response data. This API describes only request-response part,
// all messages are send with ID
type NoParams = Record<string, never>
export type UUID = string
export type EmacsApiSpec = {
  'node/delete': { params: { nodeFile: string }, result: 'done' }
  'node/open': { params: { nodeId: UUID }, result: 'done' }
  'node/create': { params: { nodeId: UUID, title: string, ref: string | number }, result: 'done' }
  'node/getBody': { params: { nodeId: UUID }, result: string }
  'theme/get': { params: NoParams, result: EmacsTheme }
}

// Emacs server notifications, messages from server which doesn't need response.
// They can be used as channels with message method as channel name
export type EmacsNotifications = {
  'graph/update': OrgRoamGraphReponse
  'variables/update': EmacsVariables
  // TODO: Specify shape of data
  'node/local': any
  'node/zoom': any
  'node/follow': any
  'node/changeLocalGraph': any
}

export type EmacsTheme = {
  name: string,
  colors: Record<string, string>
}

export type OrgRoamGraphReponse = {
  nodes: OrgRoamNode[]
  links: OrgRoamLink[]
  tags: string[]
}

export type OrgRoamNode = {
  id: string
  file: string
  title: string
  level: number
  pos: number
  olp: string[] | null
  properties: {
    [key: string]: string | number
  }
  tags: string[]
}

export type OrgRoamLink = {
  source: string
  target: string
  type: string
}

export interface EmacsVariables {
  roamDir?: string
  dailyDir?: string
  katexMacros?: { [key: string]: string }
  attachDir?: string
  useInheritance?: boolean
  subDirs: string[]
}
export type Tags = string[]
