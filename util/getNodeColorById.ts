import { initialColoring, initialVisuals } from '../components/config'
import { LinksByNodeId } from '../pages'

// TODO: I cannot remove it for now, because it is used in getLinkNodeColor
export const getNodeColorById = ({
  id,
  linksByNodeId,
  visuals,
  coloring,
  cluster,
}: {
  id: string
  linksByNodeId: LinksByNodeId
  visuals: typeof initialVisuals
  cluster: any
  coloring: typeof initialColoring
}) => {
  const linklen = linksByNodeId[id!]?.length ?? 0
  if (coloring.method === 'degree') {
    return visuals.nodeColorScheme[
      Math.min(Math.max(linklen, 0), visuals.nodeColorScheme.length - 1)
    ]
  }
  return visuals.nodeColorScheme[linklen && cluster[id] % visuals.nodeColorScheme.length]
}
