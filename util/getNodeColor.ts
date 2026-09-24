import { OrgRoamNode } from '@/emacs/api'
import { initialColoring, initialVisuals } from '../components/config'
import { LinksByNodeId } from '../pages'
import { createLogger } from '@/utils/logger'
import { ThemeContextProps } from '@/context/theme'

const log = createLogger("getNodeColor")

export const getNodeColor = ({
  node,
  theme,
  highlightedNodes,
  previouslyHighlightedNodes,
  visuals,
  tagColors,
  opacity,
  emacsNodeId,
  linksByNodeId,
  cluster,
  coloring,
}: {
  node: OrgRoamNode
  theme: ThemeContextProps
  visuals: typeof initialVisuals
  highlightedNodes: Record<string, any>
  previouslyHighlightedNodes: Record<string, any>
  tagColors: Record<string, any>
  opacity: number
  emacsNodeId: string | null
  linksByNodeId: LinksByNodeId
  cluster: any
  coloring: typeof initialColoring
}) => {
  const palette = theme.emacsTheme[1]
  const colorInterpolationMatrix = theme.colorInterpolationMatrix

  // TODO: Check this function
  const getNodeColorById = () => {
    const linklen = linksByNodeId[node.id!]?.length ?? 0
    if (coloring.method === 'degree') {
      return coloring.nodeScheme[
        Math.min(Math.max(linklen, 0), visuals.nodeColorScheme.length - 1)
      ]
    }
    return coloring.nodeScheme[linklen && cluster[node.id] % visuals.nodeColorScheme.length]
  }

  const needsHighlighting = highlightedNodes[node.id!] || previouslyHighlightedNodes[node.id!]
  //const needsHighlighting = hoverNode?.id === node.id! || lastHoverNode?.current?.id === node.id
  // if we are matching the node color and don't have a highlight color
  // or we don't have our own scheme and we're not being highlighted

  // When is open in Emacs
  if (node.id === emacsNodeId) {
    return palette[coloring.emacsNode]
  }
  // TODO: Lets ignore tag color for now
  // if (tagColors && node?.tags.some((tag) => tagColors[tag])) {
  //   const tagColor = tagColors[node?.tags.filter((tag) => tagColors[tag])[0]]
  //   return needsHighlighting
  //     ? highlightColors[tagColor][tagColor](visuals.highlightFade * opacity)
  //     : highlightColors[tagColor][visuals.backgroundColor](visuals.highlightFade * opacity)
  // }
  //
  // TODO: I don't know what cite nodes are, what is FILELESS property?
  // if (visuals.citeNodeColor && node?.properties?.ROAM_REFS && node?.properties?.FILELESS) {
  //   return needsHighlighting
  //     ? getThemeColor(visuals.citeNodeColor, theme)
  //     : highlightColors[visuals.citeNodeColor][visuals.backgroundColor](
  //       visuals.highlightFade * opacity,
  //     )
  // }

  // For nodes which have references
  if (node.properties.ROAM_REFS) {
    return needsHighlighting ? palette[coloring.refNode]
      : colorInterpolationMatrix[coloring.refNode][coloring.background](visuals.highlightFade * opacity)
  }
  if (!needsHighlighting) {
    return colorInterpolationMatrix[
      getNodeColorById()
    ][coloring.background](visuals.highlightFade * opacity)
  }
  return palette[getNodeColorById()]
  // return highlightColors[
  //   getNodeColorById({ id: node.id as string, cluster, coloring, linksByNodeId, visuals })
  // ][visuals.nodeHighlight](opacity)
}
