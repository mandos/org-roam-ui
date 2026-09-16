import React, { ComponentPropsWithoutRef, useEffect, useMemo, useRef, useState } from 'react'
import { Box, useTheme } from '@chakra-ui/react'
import { useAnimation } from '@lilib/hooks'
import * as d3int from 'd3-interpolate'
//@ts-expect-error
import jLouvain from 'jlouvain.js'
import SpriteText from 'three-spritetext'
import type {
  ForceGraph2D as TForceGraph2D,
  ForceGraph3D as TForceGraph3D,
} from 'react-force-graph'
import { GraphData, NodeObject } from 'force-graph'

// Not sure about this dependencies, maybe should be in different places
import { EmacsVariables, LinksByNodeId, NodeById, Scope } from '@/pages'
import { OrgRoamLink, OrgRoamNode } from '@/api'

// New structure
import { drawLabels } from '@/components/Graph/drawLabels'
import { useTheme as useAppTheme } from '@/context/theme'

// TODO To refactor
import { algos, colorList, initialBehavior, initialColoring, initialFilter, initialLocal, initialMouse, initialPhysics, initialVisuals } from '@/components/config'
import { findNthNeighbors } from '@/util/findNthNeighbour'
import { normalizeLinkEnds } from '@/util/normalizeLinkEnds'
import { openNodeInEmacs } from '@/util/webSocketFunctions'
import { getThemeColor } from '@/util/getThemeColor'
import { nodeSize } from '@/util/nodeSize'
import { getNodeColor } from '@/util/getNodeColor'
import { getLinkColor } from '@/util/getLinkColor'
import { isLinkRelatedToNode } from '@/util/isLinkRelatedToNode'

const d3promise = import('d3-force-3d')

// react-force-graph fails on import when server-rendered
// https://github.com/vasturiano/react-force-graph/issues/155
const ForceGraph2D = (
  !!global.window ? require('react-force-graph').ForceGraph2D : null
) as typeof TForceGraph2D

const ForceGraph3D = (
  !!global.window ? require('react-force-graph').ForceGraph3D : null
) as typeof TForceGraph3D

export interface GraphProps {
  nodeById: NodeById
  linksByNodeId: LinksByNodeId
  graphData: GraphData
  physics: typeof initialPhysics
  threeDim: boolean
  filter: typeof initialFilter
  emacsNodeId: string | null
  visuals: typeof initialVisuals
  behavior: typeof initialBehavior
  mouse: typeof initialMouse
  local: typeof initialLocal
  scope: Scope
  setScope: any
  webSocket: any
  tagColors: { [tag: string]: string }
  setPreviewNode: any
  sidebarHighlightedNode: OrgRoamNode | null
  windowWidth: number
  windowHeight: number
  setContextMenuTarget: any
  openContextMenu: any
  contextMenu: any
  handleLocal: any
  mainWindowWidth: number
  setMainWindowWidth: any
  variables: EmacsVariables
  graphRef: any
  clusterRef: any
  coloring: typeof initialColoring
}

export const Graph = function (props: GraphProps) {
  const {
    graphRef,
    physics,
    graphData,
    threeDim,
    linksByNodeId,
    filter,
    emacsNodeId,
    nodeById,
    visuals,
    behavior,
    mouse,
    scope,
    local,
    setScope,
    webSocket,
    tagColors,
    setPreviewNode,
    sidebarHighlightedNode,
    windowWidth,
    windowHeight,
    setContextMenuTarget,
    openContextMenu,
    contextMenu,
    handleLocal,
    variables,
    clusterRef,
    coloring,
  } = props

  const { dailyDir, roamDir } = variables

  const [hoverNode, setHoverNode] = useState<NodeObject | null>(null)

  const theme = useTheme()
  const appTheme = useAppTheme()

  // TODO: Remove after creating new color managment layer
  // const { emacsTheme } = useContext<ThemeContextProps>(ThemeContext)

  const handleClick = (click: string, node: OrgRoamNode, event: any) => {
    switch (click) {
      case mouse.preview: {
        setPreviewNode(node)
        break
      }
      case mouse.local: {
        handleLocal(node, behavior.localSame)
        break
      }
      case mouse.follow: {
        openNodeInEmacs(node, webSocket)
        break
      }
      case mouse.context: {
        openContextMenu(node, event)
      }
      default:
        break
    }
  }

  const centralHighlightedNode = useRef<NodeObject | null>(null)

  // Effect connected with node folowing from emacs
  useEffect(() => {
    if (!emacsNodeId) {
      return
    }
    setHoverNode(nodeById[emacsNodeId] as NodeObject)
  }, [emacsNodeId])

  const filteredLinksByNodeIdRef = useRef<LinksByNodeId>({})

  const hiddenNodeIdsRef = useRef<NodeById>({})
  const filteredGraphData = useMemo(() => {
    hiddenNodeIdsRef.current = {}
    const filteredNodes = graphData?.nodes
      ?.filter((nodeArg) => {
        const node = nodeArg as OrgRoamNode
        //dirs
        if (
          filter.dirsBlocklist.length &&
          filter.dirsBlocklist.some((dir) => node?.file?.includes(dir))
        ) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        if (
          filter.dirsAllowlist.length > 0 &&
          !filter.dirsAllowlist.some((dir) => node?.file?.includes(dir))
        ) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }

        if (
          filter.tagsBlacklist.length &&
          filter.tagsBlacklist.some((tag) => node?.tags?.indexOf(tag) > -1)
        ) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        if (
          filter.tagsWhitelist.length > 0 &&
          !filter.tagsWhitelist.some((tag) => node?.tags?.indexOf(tag) > -1)
        ) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        if (filter.filelessCites && node?.properties?.FILELESS) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        if (filter?.bad && node?.properties?.bad) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }

        if (filter.dailies && dailyDir && node.file?.includes(dailyDir)) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        if (filter.noter && node.properties?.NOTER_PAGE) {
          hiddenNodeIdsRef.current = { ...hiddenNodeIdsRef.current, [node.id]: node }
          return false
        }
        return true
      })
      .filter((node) => {
        const links = linksByNodeId[node?.id as string] ?? []
        const unhiddenLinks = links.filter(
          (link) =>
            !hiddenNodeIdsRef.current[link.source] && !hiddenNodeIdsRef.current[link.target],
        )

        if (!filter.orphans) {
          return true
        }

        if (filter.parent) {
          return unhiddenLinks.length !== 0
        }

        if (unhiddenLinks.length === 0) {
          return false
        }

        return unhiddenLinks.some((link) => !['parent', 'heading'].includes(link.type))
      })

    const filteredNodeIds = filteredNodes.map((node) => node.id as string)
    const filteredLinks = graphData.links.filter((link) => {
      const [sourceId, targetId] = normalizeLinkEnds(link)
      if (
        !filteredNodeIds.includes(sourceId as string) ||
        !filteredNodeIds.includes(targetId as string)
      ) {
        return false
      }
      const linkRoam = link as OrgRoamLink
      if (!filter.parent) {
        return !['parent', 'heading'].includes(linkRoam.type)
      }
      if (filter.parent === 'heading') {
        return linkRoam.type !== 'parent'
      }
      return linkRoam.type !== 'heading'
    })

    filteredLinksByNodeIdRef.current = filteredLinks.reduce<LinksByNodeId>((acc, linkArg) => {
      const link = linkArg as OrgRoamLink
      const [sourceId, targetId] = normalizeLinkEnds(link)
      return {
        ...acc,
        [sourceId]: [...(acc[sourceId] ?? []), link],
        [targetId]: [...(acc[targetId] ?? []), link],
      }
    }, {})

    const weightedLinks = filteredLinks.map((l) => {
      const [target, source] = normalizeLinkEnds(l)
      const link = l as OrgRoamLink
      return { target, source, weight: link.type === 'cite' ? 1 : 2 }
    })

    if (coloring.method === 'community') {
      const community = jLouvain().nodes(filteredNodeIds).edges(weightedLinks)
      clusterRef.current = community()
    }
    /* clusterRef.current = Object.fromEntries(
     *   Object.entries(community()).sort(([, a], [, b]) => a - b),
     * ) */
    //console.log(clusterRef.current)
    return { nodes: filteredNodes, links: filteredLinks }
  }, [filter, graphData, coloring.method])

  const [scopedGraphData, setScopedGraphData] = useState<GraphData>({ nodes: [], links: [] })

  useEffect(() => {
    if (!scope.nodeIds.length) {
      return
    }
    const oldScopedNodes =
      scope.nodeIds.length > 1
        ? scopedGraphData.nodes.filter((n) => !scope.excludedNodeIds.includes(n.id as string))
        : []
    const oldScopedNodeIds = oldScopedNodes.map((node) => node.id as string)
    const neighbs = findNthNeighbors({
      ids: scope.nodeIds,
      excludedIds: scope.excludedNodeIds,
      n: local.neighbors,
      linksByNodeId: filteredLinksByNodeIdRef.current,
    })
    const newScopedNodes = filteredGraphData.nodes
      .filter((node) => {
        if (oldScopedNodes.length) {
          if (oldScopedNodeIds.includes(node.id as string)) {
            return false
          }
          const links = filteredLinksByNodeIdRef.current[node.id as string] ?? []
          return links.some((link) => {
            const [source, target] = normalizeLinkEnds(link)
            return (
              !scope.excludedNodeIds.includes(source) &&
              !scope.excludedNodeIds.includes(target) &&
              (scope.nodeIds.includes(source) || scope.nodeIds.includes(target))
            )
          })
        }
        return neighbs.includes(node.id as string)
        // this creates new nodes, to separate them from the nodes in the global graph
        // and positions them in the center, so that the camera is not so jumpy
      })
      .map((node) => {
        return { ...node, x: 0, y: 0, vy: 0, vx: 0 }
      })
    const scopedNodes = [...oldScopedNodes, ...newScopedNodes]
    const scopedNodeIds = scopedNodes.map((node) => node.id as string)

    const oldRawScopedLinks = scope.nodeIds.length > 1 ? scopedGraphData.links : []
    const oldScopedLinks = oldRawScopedLinks.filter((l) => {
      !scope.excludedNodeIds.some((e) => normalizeLinkEnds(l).includes(e))
    })
    const newScopedLinks = filteredGraphData.links
      .filter((link) => {
        // we need to cover both because force-graph modifies the original data
        // but if we supply the original data on each render, the graph will re-render sporadically
        const [sourceId, targetId] = normalizeLinkEnds(link)
        if (
          oldScopedLinks.length &&
          oldScopedNodeIds.includes(targetId) &&
          oldScopedNodeIds.includes(sourceId)
        ) {
          return false
        }
        return (
          scopedNodeIds.includes(sourceId as string) && scopedNodeIds.includes(targetId as string)
        )
      })
      .map((link) => {
        const [sourceId, targetId] = normalizeLinkEnds(link)
        return { source: sourceId, target: targetId }
      })

    const scopedLinks = [...oldScopedLinks, ...newScopedLinks]

    setScopedGraphData({ nodes: scopedNodes, links: scopedLinks })
  }, [
    local.neighbors,
    filter,
    scope,
    scope.excludedNodeIds,
    scope.nodeIds,
    graphData,
    filteredGraphData.links,
    filteredGraphData.nodes,
  ])

  useEffect(() => {
    ; (async () => {
      const fg = graphRef.current
      const d3 = await d3promise
      if (physics.gravityOn && !(scope.nodeIds.length && !physics.gravityLocal)) {
        fg.d3Force('x', d3.forceX().strength(physics.gravity))
        fg.d3Force('y', d3.forceY().strength(physics.gravity))
        threeDim && fg.d3Force('z', d3.forceZ().strength(physics.gravity))
      } else {
        fg.d3Force('x', null)
        fg.d3Force('y', null)
        threeDim && fg.d3Force('z', null)
      }
      physics.centering
        ? fg.d3Force('center', d3.forceCenter().strength(physics.centeringStrength))
        : fg.d3Force('center', null)
      physics.linkStrength && fg.d3Force('link').strength(physics.linkStrength)
      physics.linkIts && fg.d3Force('link').iterations(physics.linkIts)
      physics.charge && fg.d3Force('charge').strength(physics.charge)
      fg.d3Force(
        'collide',
        physics.collision ? d3.forceCollide().radius(physics.collisionStrength) : null,
      )
    })()
  }, [physics, threeDim, scope])

  // Normally the graph doesn't update when you just change the physics parameters
  // This forces the graph to make a small update when you do
  useEffect(() => {
    graphRef.current?.d3ReheatSimulation()
  }, [physics, scope.nodeIds.length])

  // shitty handler to check for doubleClicks
  const lastNodeClickRef = useRef(0)

  // this is for animations, it's a bit hacky and can definitely be optimized
  const [opacity, setOpacity] = useState(1)
  const [fadeIn, cancel] = useAnimation((x) => setOpacity(x), {
    duration: visuals.animationSpeed,
    algorithm: algos[visuals.algorithmName],
  })
  const [fadeOut, fadeOutCancel] = useAnimation(
    (x) => setOpacity(Math.min(opacity, -1 * (x - 1))),
    {
      duration: visuals.animationSpeed,
      algorithm: algos[visuals.algorithmName],
    },
  )

  // NOTE: Generating higlited nodes
  const highlightedNodes = useMemo(() => {
    if (!centralHighlightedNode.current) {
      return {}
    }

    const links = filteredLinksByNodeIdRef.current[centralHighlightedNode.current.id!]
    if (!links) {
      return {}
    }
    return Object.fromEntries(
      [
        centralHighlightedNode.current?.id! as string,
        ...links.flatMap((link) => [link.source, link.target]),
      ].map((nodeId) => [nodeId, {}]),
    )
  }, [centralHighlightedNode.current, filteredLinksByNodeIdRef.current])


  useEffect(() => {
    if (sidebarHighlightedNode?.id) {
      setHoverNode(sidebarHighlightedNode)
    } else {
      setHoverNode(null)
    }
  }, [sidebarHighlightedNode])

  const lastHoverNode = useRef<OrgRoamNode | null>(null)

  useEffect(() => {
    centralHighlightedNode.current = hoverNode

    if (hoverNode) {
      lastHoverNode.current = hoverNode as OrgRoamNode
    }
    if (!visuals.highlightAnim) {
      return hoverNode ? setOpacity(1) : setOpacity(0)
    }
    if (hoverNode) {
      fadeIn()
    } else {
      // to prevent fadeout animation from starting at 1
      // when quickly moving away from a hovered node
      cancel()
      opacity > 0.5 ? fadeOut() : setOpacity(0)
    }
  }, [hoverNode])

  // TODO: Remove after migration to new Theme context
  const highlightColors = useMemo(() => {
    return Object.fromEntries(
      colorList.map((color) => {
        const color1 = getThemeColor(color, theme)
        const crisscross = colorList.map((color2) => [
          color2,
          d3int.interpolate(color1, getThemeColor(color2, theme)),
        ])
        return [color, Object.fromEntries(crisscross)]
      }),
    )
  }, [theme])

  const previouslyHighlightedNodes = useMemo(() => {
    const previouslyHighlightedLinks =
      filteredLinksByNodeIdRef.current[lastHoverNode.current?.id!] ?? []
    return Object.fromEntries(
      [
        lastHoverNode.current?.id! as string,
        ...previouslyHighlightedLinks.flatMap((link) => normalizeLinkEnds(link)),
      ].map((nodeId) => [nodeId, {}]),
    )
  }, [JSON.stringify(hoverNode), lastHoverNode.current, filteredLinksByNodeIdRef.current])

  const labelTextColor = useMemo(
    () => getThemeColor(visuals.labelTextColor, theme),
    [visuals.labelTextColor, theme],
  )

  const labelBackgroundColor = useMemo(
    () => getThemeColor(visuals.labelBackgroundColor, theme),
    [visuals.labelBackgroundColor, theme],
  )

  const [dragging, setDragging] = useState(false)

  const scaleRef = useRef(1)

  const graphCommonProps: ComponentPropsWithoutRef<typeof TForceGraph2D> = {
    // Sorted based on API documentation from https://github.com/vasturiano/react-force-graph
    // Data Input
    graphData: scope.nodeIds.length ? scopedGraphData : filteredGraphData,

    // Container layout
    width: windowWidth,
    height: windowHeight,
    backgroundColor: getThemeColor(visuals.backgroundColor, theme),

    // Node styling
    nodeRelSize: visuals.nodeRel,
    nodeVal: (node) => {
      return (
        nodeSize({
          node,
          highlightedNodes,
          linksByNodeId: filteredLinksByNodeIdRef.current,
          opacity,
          previouslyHighlightedNodes,
          visuals,
        }) / Math.pow(scaleRef.current, visuals.nodeZoomSize)
      )
    },
    nodeColor: (node) => {
      return getNodeColor({
        node: node as OrgRoamNode,
        theme: appTheme,
        visuals,
        highlightedNodes,
        previouslyHighlightedNodes,
        tagColors,
        opacity,
        emacsNodeId,
        linksByNodeId: filteredLinksByNodeIdRef.current,
        cluster: clusterRef.current,
        coloring,
      })
    },
    nodeCanvasObject: (node, ctx, globalScale) => {
      drawLabels({
        nodeRel: visuals.nodeRel,
        filteredLinksByNodeId: filteredLinksByNodeIdRef.current,
        lastHoverNode: lastHoverNode.current,
        ...{
          node,
          ctx,
          globalScale,
          highlightedNodes,
          previouslyHighlightedNodes,
          visuals,
          opacity,
          labelTextColor,
          labelBackgroundColor,
          hoverNode,
        },
      })
    },
    nodeCanvasObjectMode: () => 'after',

    // Link styling
    linkColor: (link) => {
      const sourceId = typeof link.source === 'object' ? link.source.id! : (link.source as string)
      const targetId = typeof link.target === 'object' ? link.target.id! : (link.target as string)
      const linkIsHighlighted = isLinkRelatedToNode(link, centralHighlightedNode.current)
      const linkWasHighlighted = isLinkRelatedToNode(link, lastHoverNode.current)
      const needsHighlighting = linkIsHighlighted || linkWasHighlighted
      const roamLink = link as OrgRoamLink

      if (visuals.refLinkColor && roamLink.type === 'ref') {
        return needsHighlighting && (visuals.refLinkHighlightColor || visuals.linkHighlight)
          ? highlightColors[visuals.refLinkColor][
            visuals.refLinkHighlightColor || visuals.linkHighlight
          ](opacity)
          : highlightColors[visuals.refLinkColor][visuals.backgroundColor](
            visuals.highlightFade * opacity,
          )
      }
      if (visuals.citeLinkColor && roamLink.type?.includes('cite')) {
        return needsHighlighting && (visuals.citeLinkHighlightColor || visuals.linkHighlight)
          ? highlightColors[visuals.citeLinkColor][
            visuals.citeLinkHighlightColor || visuals.linkHighlight
          ](opacity)
          : highlightColors[visuals.citeLinkColor][visuals.backgroundColor](
            visuals.highlightFade * opacity,
          )
      }

      return getLinkColor({
        sourceId: sourceId as string,
        targetId: targetId as string,
        needsHighlighting,
        theme,
        cluster: clusterRef.current,
        coloring,
        highlightColors,
        linksByNodeId: filteredLinksByNodeIdRef.current,
        opacity,
        visuals,
      })
    },
    linkWidth: (link) => {
      if (visuals.highlightLinkSize === 1) {
        return visuals.linkWidth
      }
      const linkIsHighlighted = isLinkRelatedToNode(link, centralHighlightedNode.current)
      const linkWasHighlighted = isLinkRelatedToNode(link, lastHoverNode.current)

      return linkIsHighlighted || linkWasHighlighted
        ? visuals.linkWidth * (1 + opacity * (visuals.highlightLinkSize - 1))
        : visuals.linkWidth
    },
    linkDirectionalArrowLength: visuals.arrows ? visuals.arrowsLength : undefined,
    linkDirectionalArrowColor: visuals.arrowsColor
      ? () => getThemeColor(visuals.arrowsColor, theme)
      : undefined,
    linkDirectionalArrowRelPos: visuals.arrowsPos,
    linkDirectionalParticles: visuals.particles ? visuals.particlesNumber : undefined,
    linkDirectionalParticleWidth: visuals.particlesWidth,

    // Force engine configuration
    d3AlphaMin: physics.alphaMin,
    d3AlphaDecay: physics.alphaDecay,
    d3VelocityDecay: physics.velocityDecay,
    warmupTicks: scope.nodeIds.length === 1 ? 100 : scope.nodeIds.length > 1 ? 20 : 0,

    // Interaction
    onNodeClick: (nodeArg: NodeObject, event: any) => {
      const node = nodeArg as OrgRoamNode
      //contextMenu.onClose()
      const doubleClickTimeBuffer = 200
      const isDoubleClick = event.timeStamp - lastNodeClickRef.current < doubleClickTimeBuffer
      lastNodeClickRef.current = event.timeStamp
      if (isDoubleClick) {
        return handleClick('double', node, event)
      }

      const prevNodeClickTime = lastNodeClickRef.current
      return setTimeout(() => {
        if (lastNodeClickRef.current !== prevNodeClickTime) {
          return
        }
        return handleClick('click', node, event)
      }, doubleClickTimeBuffer)
    },
    /* onBackgroundClick: () => {
     *   contextMenu.onClose()
     *   setHoverNode(null)
     *   if (scope.nodeIds.length === 0) {
     *     return
     *   }
     *   if (mouse.backgroundExitsLocal) {
     *     setScope((currentScope: Scope) => ({
     *       ...currentScope,
     *       nodeIds: [],
     *     }))
     *   }
     * }, */
    onNodeRightClick: (nodeArg, event) => {
      const node = nodeArg as OrgRoamNode

      handleClick('right', node, event)
    },
    onNodeHover: (node) => {
      if (!visuals.highlight) {
        return
      }
      if (dragging) {
        return
      }

      if (!hoverNode) {
        fadeOutCancel()
        setOpacity(0)
      }
      setHoverNode(node)
    },
    onNodeDrag: (node) => {
      //contextMenu.onClose()
      setHoverNode(node)
      setDragging(true)
    },
    onNodeDragEnd: () => {
      setHoverNode(null)
      setDragging(false)
    },
    onZoom: ({ k, x, y }) => (scaleRef.current = k),
  }

  return (
    <Box overflow="hidden" onClick={contextMenu.onClose}>
      {threeDim ? (
        <ForceGraph3D
          ref={graphRef}
          {...graphCommonProps}
          nodeThreeObjectExtend={true}
          nodeOpacity={visuals.nodeOpacity}
          nodeResolution={visuals.nodeResolution}
          linkOpacity={visuals.linkOpacity}
          nodeThreeObject={(node: OrgRoamNode) => {
            if (!visuals.labels) {
              return
            }
            if (visuals.labels < 3 && !highlightedNodes[node.id!]) {
              return
            }
            const sprite = new SpriteText(node.title.substring(0, 40))
            sprite.color = getThemeColor(visuals.labelTextColor, theme)
            sprite.backgroundColor = getThemeColor(visuals.labelBackgroundColor, theme)
            sprite.padding = 2
            sprite.textHeight = 8

            return sprite
          }}
        />
      ) : (
        <ForceGraph2D
          ref={graphRef}
          {...graphCommonProps}
          linkLineDash={(link) => {
            const linkArg = link as OrgRoamLink
            if (visuals.citeDashes && linkArg.type?.includes('cite')) {
              return [visuals.citeDashLength, visuals.citeGapLength]
            }
            if (visuals.refDashes && linkArg.type == 'ref') {
              return [visuals.refDashLength, visuals.refGapLength]
            }
            return null
          }}
        />
      )}
    </Box>
  )
}
