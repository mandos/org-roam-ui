import React, { useEffect, useState } from 'react'
import { LinksByNodeId, NodeByCite, NodeById } from '../pages/index'
import { ProcessedOrg } from './processOrg'
import { createLogger } from '@/utils/logger'
import { useEmacs } from '@/context/emacs'

const log = createLogger('uniorg')

export interface UniOrgProps {
  nodeById: NodeById
  previewNode: any
  setPreviewNode: any
  nodeByCite: NodeByCite
  setSidebarHighlightedNode: any
  openContextMenu: any
  outline: boolean
  collapse: boolean
  linksByNodeId: LinksByNodeId
  macros?: { [key: string]: string }
  attachDir: string
  useInheritance: boolean
}

export const UniOrg = (props: UniOrgProps) => {
  const {
    openContextMenu,
    setSidebarHighlightedNode,
    nodeById,
    nodeByCite,
    previewNode,
    setPreviewNode,
    outline,
    collapse,
    linksByNodeId,
    macros,
    attachDir,
    useInheritance,
  } = props

  const [previewText, setPreviewText] = useState('')

  const emacsClient = useEmacs().client

  const id = encodeURIComponent(encodeURIComponent(previewNode.id))

  useEffect(() => {
    emacsClient.getOrgText(id).then((res) => {
      log.debug(res)
      setPreviewText(res)
    }).catch((e) => {
      setPreviewText(`(could recieve data for node: ${id})`)
      log.error(e)
      return 'Could not fetch the text for some reason, sorry!\n\n This can happen because you have an id with forward slashes (/) in it.'
    })
  }, [previewNode.id])

  return (
    <>
      {previewText && previewNode && (
        <ProcessedOrg
          {...{
            nodeById,
            previewNode,
            setPreviewNode,
            previewText,
            nodeByCite,
            setSidebarHighlightedNode,
            openContextMenu,
            outline,
            collapse,
            linksByNodeId,
            attachDir,
            useInheritance,
          }}
          macros={macros || {}}
        />
      )}
    </>
  )
}
