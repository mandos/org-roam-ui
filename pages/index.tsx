import {
  Box,
  Flex,
  IconButton,
  Tooltip,
  useDisclosure,
  useOutsideClick,
} from '@chakra-ui/react'
import { useWindowSize } from '@react-hook/window-size'
import { GraphData, NodeObject } from 'force-graph'
import Head from 'next/head'
import React, {
  useEffect,
  useRef,
  useState,
} from 'react'
import { BiNetworkChart } from 'react-icons/bi'
import { BsReverseLayoutSidebarInsetReverse } from 'react-icons/bs'
import ReconnectingWebSocket from 'reconnecting-websocket'
import useUndo from 'use-undo'
import { OrgRoamGraphReponse, OrgRoamLink, OrgRoamNode } from '../api'
import {
  initialBehavior,
  initialColoring,
  initialFilter,
  initialLocal,
  initialMouse,
  initialPhysics,
  initialVisuals,
  TagColors,
} from '../components/config'
import { ContextMenu } from '../components/contextmenu'
import Sidebar from '../components/Sidebar'
import { Tweaks } from '../components/Tweaks'
import { usePersistantState } from '../util/persistant-state'
import { VariablesContext } from '../util/variablesContext'
import { normalizeLinkEnds } from '../util/normalizeLinkEnds'
import { createLogger } from '@/utils/logger'
import { Graph } from '@/components/Graph'

const log = createLogger('page')

export type NodeById = { [nodeId: string]: OrgRoamNode | undefined }
export type LinksByNodeId = { [nodeId: string]: OrgRoamLink[] | undefined }
export type NodesByFile = { [file: string]: OrgRoamNode[] | undefined }
export type NodeByCite = { [key: string]: OrgRoamNode | undefined }
export interface EmacsVariables {
  roamDir?: string
  dailyDir?: string
  katexMacros?: { [key: string]: string }
  attachDir?: string
  useInheritance?: boolean
  subDirs: string[]
}
export type Tags = string[]
export type Scope = {
  nodeIds: string[]
  excludedNodeIds: string[]
}

export default function Home() {
  // only render on the client
  const [showPage, setShowPage] = useState(false)
  useEffect(() => {
    setShowPage(true)
  }, [])

  if (!showPage) {
    return null
  }
  return (
    <>
      <Head>
        <title>ORUI</title>
      </Head>
      <GraphPage />
    </>
  )
}

export function GraphPage() {
  const [threeDim, setThreeDim] = usePersistantState('3d', false)
  const [tagColors, setTagColors] = usePersistantState<TagColors>('tagCols', {})
  const [scope, setScope] = useState<Scope>({ nodeIds: [], excludedNodeIds: [] })

  const [physics, setPhysics] = usePersistantState('physics', initialPhysics)
  const [filter, setFilter] = usePersistantState('filter', initialFilter)
  const [visuals, setVisuals] = usePersistantState('visuals', initialVisuals)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [emacsNodeId, setEmacsNodeId] = useState<string | null>(null)
  const [behavior, setBehavior] = usePersistantState('behavior', initialBehavior)
  const [mouse, setMouse] = usePersistantState('mouse', initialMouse)
  const [coloring, setColoring] = useState(initialColoring)
  const [local, setLocal] = usePersistantState('local', initialLocal)

  const [
    previewNodeState,
    {
      set: setPreviewNode,
      reset: resetPreviewNode,
      undo: previousPreviewNode,
      redo: nextPreviewNode,
      canUndo,
      canRedo,
    },
  ] = useUndo<NodeObject>({})
  const {
    past: pastPreviewNodes,
    present: previewNode,
    future: futurePreviewNodes,
  } = previewNodeState
  const [sidebarHighlightedNode, setSidebarHighlightedNode] = useState<OrgRoamNode | null>(null)
  const { isOpen, onOpen, onClose } = useDisclosure()

  const nodeByIdRef = useRef<NodeById>({})
  const linksByNodeIdRef = useRef<LinksByNodeId>({})
  const nodeByCiteRef = useRef<NodeByCite>({})
  const tagsRef = useRef<Tags>([])
  const graphRef = useRef<any>(null)
  const [emacsVariables, setEmacsVariables] = useState<EmacsVariables>({} as EmacsVariables)
  const clusterRef = useRef<{ [id: string]: number }>({})

  const currentGraphDataRef = useRef<GraphData>({ nodes: [], links: [] })

  const updateGraphData = (orgRoamGraphData: OrgRoamGraphReponse) => {
    const oldNodeById = nodeByIdRef.current
    tagsRef.current = orgRoamGraphData.tags ?? []
    const importNodes = orgRoamGraphData.nodes ?? []
    log.debug("Imported nodes", importNodes)
    const importLinks = orgRoamGraphData.links ?? []
    const nodesByFile = importNodes.reduce<NodesByFile>((acc, node) => {
      return {
        ...acc,
        [node.file]: [...(acc[node.file] ?? []), node],
      }
    }, {})

    // generate links between level 2 nodes and the level 1 node above it
    // org-roam does not generate such links, so we have to put them in ourselves
    const headingLinks: OrgRoamLink[] = Object.keys(nodesByFile).flatMap((file) => {
      const nodesInFile = nodesByFile[file] ?? []
      // "file node" as opposed to "heading node"
      const fileNode = nodesInFile.find((node) => node.level === 0)
      const headingNodes = nodesInFile.filter((node) => node.level !== 0)

      if (!fileNode) {
        return []
      }
      return headingNodes.map((headingNode) => {
        const smallerHeadings = nodesInFile.filter((node) => {
          if (
            node.level >= headingNode.level ||
            node.pos >= headingNode.pos ||
            !headingNode.olp?.includes((node.title as string)?.replace(/ *\[\d*\/\d*\] */g, ''))
          ) {
            return false
          }
          return true
        })

        // get the nearest heading
        const target = smallerHeadings.reduce((acc, node) => {
          if (node.level > acc.level) {
            acc = node
          }
          return acc
        }, fileNode)

        return {
          source: headingNode.id,
          target: target?.id || fileNode.id,
          type: 'heading',
        }
      })
    })

    // we want to support both linking to only the file node and to the next heading
    // to do this we need both links, as we can't really toggle between them without
    // recalculating the entire graph otherwise
    const fileLinks: OrgRoamLink[] = Object.keys(nodesByFile).flatMap((file) => {
      const nodesInFile = nodesByFile[file] ?? []
      // "file node" as opposed to "heading node"
      const fileNode = nodesInFile.find((node) => node.level === 0)
      const headingNodes = nodesInFile.filter((node) => node.level !== 0)

      if (!fileNode) {
        return []
      }
      return headingNodes.map((headingNode) => {
        return {
          source: headingNode.id,
          target: fileNode.id,
          type: 'parent',
        }
      })
    })

    nodeByIdRef.current = Object.fromEntries(importNodes.map((node) => [node.id, node]))
    const dirtyLinks = [...importLinks, ...headingLinks, ...fileLinks]
    const nonExistantNodes: OrgRoamNode[] = []
    const links = dirtyLinks.map((link) => {
      const sourceId = link.source as string
      const targetId = link.target as string
      if (!nodeByIdRef.current[sourceId]) {
        nonExistantNodes.push({
          id: sourceId,
          tags: ['bad'],
          properties: { FILELESS: 'yes', bad: 'yes' },
          file: '',
          title: sourceId,
          level: 0,
          pos: 0,
          olp: null,
        })
        return { ...link, type: 'bad' }
      }
      if (!nodeByIdRef.current[targetId]) {
        nonExistantNodes.push({
          id: targetId,
          tags: ['bad'],
          properties: { FILELESS: 'yes', bad: 'yes' },
          file: '',
          title: targetId,
          level: 0,
          pos: 0,
          olp: null,
        })
        return { ...link, type: 'bad' }
      }
      return link
    })

    nodeByIdRef.current = {
      ...nodeByIdRef.current,
      ...Object.fromEntries(nonExistantNodes.map((node) => [node.id, node])),
    }

    linksByNodeIdRef.current = links.reduce<LinksByNodeId>((acc, link) => {
      return {
        ...acc,
        [link.source]: [...(acc[link.source] ?? []), link],
        [link.target]: [...(acc[link.target] ?? []), link],
      }
    }, {})

    const nodes = [...importNodes, ...nonExistantNodes]

    nodeByCiteRef.current = nodes.reduce<NodeByCite>((acc, node) => {
      const ref = node.properties?.ROAM_REFS as string
      if (!ref?.includes('cite')) {
        return acc
      }
      const key = ref.replaceAll(/cite:(.*)/g, '$1')
      if (!key) {
        return acc
      }
      return {
        ...acc,
        [key]: node,
      }
    }, {})

    const orgRoamGraphDataProcessed = {
      nodes,
      links,
    }

    const currentGraphData = currentGraphDataRef.current
    if (currentGraphData.nodes.length === 0) {
      // react-force-graph modifies the graph data implicitly,
      // so we make sure there's no overlap between the objects we pass it and
      // nodeByIdRef, linksByNodeIdRef
      const orgRoamGraphDataClone = JSON.parse(JSON.stringify(orgRoamGraphDataProcessed))
      currentGraphDataRef.current = orgRoamGraphDataClone
      setGraphData(orgRoamGraphDataClone)
      log.debug(orgRoamGraphDataClone)
      return
    }

    const newNodes = [
      ...currentGraphData.nodes.flatMap((node: NodeObject) => {
        const newNode = nodeByIdRef.current[node?.id!] ?? false
        if (!newNode) {
          return []
        }
        return [{ ...node, ...newNode }]
      }),
      ...Object.keys(nodeByIdRef.current)
        .filter((id) => !oldNodeById[id])
        .map((id) => {
          return nodeByIdRef.current[id] as NodeObject
        }),
    ]

    const nodeIndex = newNodes.reduce<{ [id: string]: number }>((acc, node, index) => {
      const id = node?.id as string
      return {
        ...acc,
        [id]: index,
      }
    }, {})

    const newerLinks = links.map((link) => {
      const [source, target] = normalizeLinkEnds(link)
      return {
        ...link,
        source: newNodes[nodeIndex![source]],
        target: newNodes[nodeIndex![target]],
      }
    })

    setGraphData({ nodes: newNodes as NodeObject[], links: newerLinks })
  }

  useEffect(() => {
    if (!graphData) {
      return
    }
    // log.debug("graphData:", currentGraphDataRef.current)
    currentGraphDataRef.current = graphData
  }, [graphData])

  // const { setEmacsTheme } = useContext(ThemeContext)

  const scopeRef = useRef<Scope>({ nodeIds: [], excludedNodeIds: [] })
  const behaviorRef = useRef(initialBehavior)
  behaviorRef.current = behavior
  const WebSocketRef = useRef<ReconnectingWebSocket | null>(null)

  scopeRef.current = scope
  const followBehavior = (
    command: string,
    emacsNode: string,
    speed: number = 2000,
    padding: number = 200,
  ) => {
    if (command === 'color') {
      return
    }
    const fg = graphRef.current
    const sr = scopeRef.current
    const bh = behaviorRef.current
    const links = linksByNodeIdRef.current[emacsNode] ?? []
    const nodes = Object.fromEntries(
      [emacsNode as string, ...links.flatMap((link) => [link.source, link.target])].map(
        (nodeId) => [nodeId, {}],
      ),
    )
    if (command === 'zoom') {
      if (sr.nodeIds.length) {
        setScope({ nodeIds: [], excludedNodeIds: [] })
      }
      setTimeout(
        () => fg.zoomToFit(speed, padding, (node: NodeObject) => nodes[node.id as string]),
        50,
      )
      return
    }
    if (!sr.nodeIds.length) {
      setScope((current: Scope) => ({ ...current, nodeIds: [emacsNode] }))
      setTimeout(() => {
        fg.centerAt(0, 0, 10)
        fg.zoomToFit(1, padding)
      }, 50)
      return
    }
    if (bh.localSame !== 'add') {
      setScope((current: Scope) => ({ ...current, nodeIds: [emacsNode] }))
      setTimeout(() => {
        fg.centerAt(0, 0, 10)
        fg.zoomToFit(1, padding)
      }, 50)
      return
    }

    // if the node is in the scoped nodes, add it to scope instead of replacing it
    if (
      !sr.nodeIds.includes(emacsNode) ||
      !sr.nodeIds.some((scopeId: string) => {
        return nodes[scopeId]
      })
    ) {
      setScope((current: Scope) => ({ ...current, nodeIds: [emacsNode] }))
      setTimeout(() => {
        fg.centerAt(0, 0, 10)
        fg.zoomToFit(1, padding)
      }, 50)
      return
    }
    setScope((currentScope: Scope) => ({
      ...currentScope,
      nodeIds: [...currentScope.nodeIds, emacsNode as string],
    }))
    setTimeout(() => {
      fg.centerAt(0, 0, 10)
      fg.zoomToFit(1, padding)
    }, 50)
  }

  useEffect(() => {
    // initialize websocket
    WebSocketRef.current = new ReconnectingWebSocket('ws://localhost:35903')
    WebSocketRef.current.addEventListener('open', () => {
      log.info('Connection with Emacs established')
    })
    WebSocketRef.current.addEventListener('message', (event: any) => {
      log.debug(event)
      const bh = behaviorRef.current
      const message = JSON.parse(event.data)
      switch (message.type) {
        case 'graphdata':
          return updateGraphData(message.data)
        case 'variables':
          setEmacsVariables(message.data)
          log.debug(message)
          return
        // TODO: Remove when create new way to manage colors
        // case 'theme':
        //   return setEmacsTheme(['custom', message.data])
        case 'command':
          switch (message.data.commandName) {
            case 'local':
              const speed = behavior.zoomSpeed
              const padding = behavior.zoomPadding
              followBehavior('local', message.data.id, speed, padding)
              setEmacsNodeId(message.data.id)
              break
            case 'zoom': {
              const speed = message?.data?.speed || bh.zoomSpeed
              const padding = message?.data?.padding || bh.zoomPadding
              followBehavior('zoom', message.data.id, speed, padding)
              setEmacsNodeId(message.data.id)
              break
            }
            case 'follow': {
              followBehavior(bh.follow, message.data.id, bh.zoomSpeed, bh.zoomPadding)
              setEmacsNodeId(message.data.id)
              break
            }
            case 'change-local-graph': {
              const node = nodeByIdRef.current[message.data.id as string]
              if (!node) break
              log.debug(message)
              handleLocal(node, message.data.manipulation)
              break
            }
            default:
              return log.error('unknown message type', message.type)
          }
      }
    })
  }, [])

  useEffect(() => {
    const fg = graphRef.current
    if (!fg || scope.nodeIds.length > 1) {
      return
    }
    if (!scope.nodeIds.length && physics.gravityOn) {
      fg.zoomToFit()
      return
    }
    setTimeout(() => {
      fg.zoomToFit(5, 200)
    }, 50)
  }, [scope.nodeIds])

  const [windowWidth, windowHeight] = useWindowSize()

  const contextMenuRef = useRef<any>()
  const [contextMenuTarget, setContextMenuTarget] = useState<OrgRoamNode | string | null>(null)
  type ContextPos = {
    left: number | undefined
    right: number | undefined
    top: number | undefined
    bottom: number | undefined
  }
  const [contextPos, setContextPos] = useState<ContextPos>({
    left: 0,
    top: 0,
    right: undefined,
    bottom: undefined,
  })

  const contextMenu = useDisclosure()
  useOutsideClick({
    ref: contextMenuRef,
    handler: () => {
      contextMenu.onClose()
    },
  })

  const openContextMenu = (target: OrgRoamNode | string, event: any, coords?: ContextPos) => {
    coords
      ? setContextPos(coords)
      : setContextPos({ left: event.pageX, top: event.pageY, right: undefined, bottom: undefined })
    setContextMenuTarget(target)
    contextMenu.onOpen()
  }

  const handleLocal = (node: OrgRoamNode, command: string) => {
    if (command === 'remove') {
      setScope((currentScope: Scope) => ({
        nodeIds: currentScope.nodeIds.filter((id: string) => id !== node.id),
        excludedNodeIds: [...currentScope.excludedNodeIds, node.id as string],
      }))
      return
    }
    if (command === 'replace') {
      setScope({ nodeIds: [node.id], excludedNodeIds: [] })
      return
    }
    if (scope.nodeIds.includes(node.id as string)) {
      return
    }
    setScope((currentScope: Scope) => ({
      excludedNodeIds: currentScope.excludedNodeIds.filter((id: string) => id !== node.id),
      nodeIds: [...currentScope.nodeIds, node.id as string],
    }))
    return
  }

  // const [mainItem, setMainItem] = useState({
  //   type: 'Graph',
  //   title: 'Graph',
  //   icon: <BiNetworkChart />,
  // })

  const [mainWindowWidth, setMainWindowWidth] = usePersistantState<number>(
    'mainWindowWidth',
    windowWidth,
  )

  return (
    <VariablesContext.Provider value={{ ...emacsVariables }}>
      <Box
        display="flex"
        alignItems="flex-start"
        flexDirection="row"
        height="100vh"
        overflow="clip"
      >
        <Tweaks
          {...{
            physics,
            setPhysics,
            threeDim,
            setThreeDim,
            filter,
            setFilter,
            visuals,
            setVisuals,
            mouse,
            setMouse,
            behavior,
            setBehavior,
            tagColors,
            setTagColors,
            coloring,
            setColoring,
            local,
            setLocal,
          }}
          tags={tagsRef.current}
        />
        <Box position="absolute">
          {graphData && (
            <Graph
              //ref={graphRef}
              nodeById={nodeByIdRef.current!}
              linksByNodeId={linksByNodeIdRef.current!}
              webSocket={WebSocketRef.current}
              variables={emacsVariables}
              {...{
                physics,
                graphData,
                threeDim,
                emacsNodeId,
                filter,
                visuals,
                behavior,
                mouse,
                scope,
                setScope,
                tagColors,
                setPreviewNode,
                sidebarHighlightedNode,
                windowWidth,
                windowHeight,
                openContextMenu,
                contextMenu,
                handleLocal,
                mainWindowWidth,
                setMainWindowWidth,
                setContextMenuTarget,
                graphRef,
                clusterRef,
                coloring,
                local,
              }}
            />
          )}
        </Box>
        <Box position="relative" zIndex={4} width="100%">
          <Flex className="headerBar" h={10} flexDir="column">
            <Flex alignItems="center" h={10} justifyContent="flex-end">
              {/* <Flex flexDir="row" alignItems="center">
               *   <Box color="blue.500" bgColor="alt.100" h="100%" p={3} mr={4}>
               *     {mainItem.icon}
               *   </Box>
               *   <Heading size="sm">{mainItem.title}</Heading>
               * </Flex> */}
              <Flex height="100%" flexDirection="row">
                {scope.nodeIds.length > 0 && (
                  <Tooltip label="Return to main graph">
                    <IconButton
                      m={1}
                      icon={<BiNetworkChart />}
                      aria-label="Exit local mode"
                      onClick={() =>
                        setScope((currentScope: Scope) => ({
                          ...currentScope,
                          nodeIds: [],
                        }))
                      }
                      variant="subtle"
                    />
                  </Tooltip>
                )}
                <Tooltip label={isOpen ? 'Close sidebar' : 'Open sidebar'}>
                  <IconButton
                    m={1}
                    // eslint-disable-next-line react/jsx-no-undef
                    icon={<BsReverseLayoutSidebarInsetReverse />}
                    aria-label="Close file-viewer"
                    variant="subtle"
                    onClick={isOpen ? onClose : onOpen}
                  />
                </Tooltip>
              </Flex>
            </Flex>
          </Flex>
        </Box>

        <Box position="relative" zIndex={4}>
          <Sidebar
            {...{
              isOpen,
              onOpen,
              onClose,
              previewNode,
              setPreviewNode,
              canUndo,
              canRedo,
              previousPreviewNode,
              nextPreviewNode,
              resetPreviewNode,
              setSidebarHighlightedNode,
              openContextMenu,
              scope,
              setScope,
              windowWidth,
              tagColors,
              setTagColors,
              filter,
              setFilter,
            }}
            macros={emacsVariables.katexMacros}
            attachDir={emacsVariables.attachDir || ''}
            useInheritance={emacsVariables.useInheritance || false}
            nodeById={nodeByIdRef.current!}
            linksByNodeId={linksByNodeIdRef.current!}
            nodeByCite={nodeByCiteRef.current!}
          />
        </Box>
        {contextMenu.isOpen && (
          <div ref={contextMenuRef}>
            <ContextMenu
              //contextMenuRef={contextMenuRef}
              scope={scope}
              target={contextMenuTarget}
              background={false}
              coordinates={contextPos}
              handleLocal={handleLocal}
              menuClose={contextMenu.onClose.bind(contextMenu)}
              webSocket={WebSocketRef.current}
              setPreviewNode={setPreviewNode}
              setFilter={setFilter}
              filter={filter}
              setTagColors={setTagColors}
              tagColors={tagColors}
            />
          </div>
        )}
      </Box>
    </VariablesContext.Provider>
  )
}
