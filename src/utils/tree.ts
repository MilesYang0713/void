import type { GrowthEntry, GrowthEntryType, IdeaNodeData, Vec3 } from '../types'

export function findNode(nodes: IdeaNodeData[], id: string | null): IdeaNodeData | null {
  if (!id) return null

  for (const node of nodes) {
    if (node.id === id) return node
    const nested = findNode(node.children, id)
    if (nested) return nested
  }

  return null
}

export function findPath(nodes: IdeaNodeData[], id: string | null): IdeaNodeData[] {
  if (!id) return []

  for (const node of nodes) {
    if (node.id === id) return [node]
    const nestedPath = findPath(node.children, id)
    if (nestedPath.length > 0) return [node, ...nestedPath]
  }

  return []
}

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}


function normalizeGrowthEntries(node: IdeaNodeData, fallbackDate: string): GrowthEntry[] {
  if (Array.isArray(node.growthEntries)) {
    return node.growthEntries
      .filter((entry) => entry && typeof entry.content === 'string')
      .map((entry) => ({
        ...entry,
        id: entry.id || makeGrowthEntryId(),
        type: (['created', 'note', 'edit', 'branch', 'move', 'relation', 'inbox', 'restore', 'delete', 'origin', 'addition', 'inference', 'question', 'action', 'revision'] as GrowthEntryType[]).includes(entry.type) ? entry.type : 'note',
        content: entry.content.trim(),
        createdAt: entry.createdAt || fallbackDate,
        updatedAt: entry.updatedAt || entry.createdAt || fallbackDate,
        completed: entry.type === 'action' ? Boolean(entry.completed) : undefined,
      }))
      .filter((entry) => entry.content.length > 0)
  }

  const description = typeof node.description === 'string' ? node.description.trim() : ''
  if (!description) return []
  return [{
    id: `origin-${node.id}`,
    type: 'created',
    content: description,
    createdAt: node.createdAt || fallbackDate,
    updatedAt: node.createdAt || fallbackDate,
  }]
}

export function normalizeTree(nodes: IdeaNodeData[]): IdeaNodeData[] {
  return nodes.map((node) => {
    const children = normalizeTree(Array.isArray(node.children) ? node.children : [])
    const fallbackDate = node.updatedAt || node.createdAt || new Date().toISOString()

    return {
      ...node,
      children,
      accessCount: Number.isFinite(node.accessCount) ? Math.max(0, node.accessCount ?? 0) : 0,
      childCreationCount: Number.isFinite(node.childCreationCount)
        ? Math.max(0, node.childCreationCount ?? 0)
        : children.length,
      lastAccessedAt: node.lastAccessedAt || fallbackDate,
      position: isVec3(node.position) ? node.position : undefined,
      growthEntries: normalizeGrowthEntries(node, fallbackDate),
    }
  })
}

export function insertNode(
  nodes: IdeaNodeData[],
  parentId: string | null,
  newNode: IdeaNodeData,
): IdeaNodeData[] {
  if (!parentId) return [...nodes, newNode]

  return nodes.map((node) => {
    if (node.id === parentId) {
      const timestamp = new Date().toISOString()
      return {
        ...node,
        updatedAt: timestamp,
        lastAccessedAt: timestamp,
        childCreationCount: (node.childCreationCount ?? node.children.length) + 1,
        children: [...node.children, newNode],
      }
    }

    return {
      ...node,
      children: insertNode(node.children, parentId, newNode),
    }
  })
}

export function updateNode(
  nodes: IdeaNodeData[],
  id: string,
  changes: Pick<IdeaNodeData, 'title' | 'description' | 'color'>,
): IdeaNodeData[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return {
        ...node,
        ...changes,
        updatedAt: new Date().toISOString(),
      }
    }

    return {
      ...node,
      children: updateNode(node.children, id, changes),
    }
  })
}

export function touchNode(nodes: IdeaNodeData[], id: string): IdeaNodeData[] {
  const timestamp = new Date().toISOString()

  return nodes.map((node) => {
    if (node.id === id) {
      return {
        ...node,
        accessCount: (node.accessCount ?? 0) + 1,
        lastAccessedAt: timestamp,
        updatedAt: timestamp,
      }
    }

    return {
      ...node,
      children: touchNode(node.children, id),
    }
  })
}

export function updateNodePosition(
  nodes: IdeaNodeData[],
  id: string,
  position: Vec3,
): IdeaNodeData[] {
  return nodes.map((node) => {
    if (node.id === id) {
      return {
        ...node,
        position,
        updatedAt: new Date().toISOString(),
      }
    }

    return {
      ...node,
      children: updateNodePosition(node.children, id, position),
    }
  })
}

export function removeNode(nodes: IdeaNodeData[], id: string): IdeaNodeData[] {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => ({
      ...node,
      children: removeNode(node.children, id),
    }))
}

function containsNode(node: IdeaNodeData, id: string): boolean {
  if (node.id === id) return true
  return node.children.some((child) => containsNode(child, id))
}

function detachNode(
  nodes: IdeaNodeData[],
  id: string,
): { nodes: IdeaNodeData[]; detached: IdeaNodeData | null } {
  let detached: IdeaNodeData | null = null
  const timestamp = new Date().toISOString()

  const nextNodes = nodes.flatMap((node) => {
    if (node.id === id) {
      detached = node
      return []
    }

    if (detached) return [node]

    const result = detachNode(node.children, id)
    if (!result.detached) return [node]

    detached = result.detached
    return [{ ...node, children: result.nodes, updatedAt: timestamp }]
  })

  return { nodes: nextNodes, detached }
}

function appendExistingNode(
  nodes: IdeaNodeData[],
  parentId: string,
  movingNode: IdeaNodeData,
): IdeaNodeData[] {
  const timestamp = new Date().toISOString()

  return nodes.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        updatedAt: timestamp,
        lastAccessedAt: timestamp,
        children: [...node.children, movingNode],
      }
    }

    return {
      ...node,
      children: appendExistingNode(node.children, parentId, movingNode),
    }
  })
}

export function moveNodeUnder(
  nodes: IdeaNodeData[],
  movingId: string,
  newParentId: string,
): IdeaNodeData[] {
  if (movingId === newParentId) return nodes

  const movingNode = findNode(nodes, movingId)
  const newParent = findNode(nodes, newParentId)
  if (!movingNode || !newParent || containsNode(movingNode, newParentId)) return nodes

  const { nodes: withoutMoving, detached } = detachNode(nodes, movingId)
  if (!detached) return nodes

  const timestamp = new Date().toISOString()
  const nestedNode: IdeaNodeData = {
    ...detached,
    position: undefined,
    updatedAt: timestamp,
    lastAccessedAt: timestamp,
  }

  return appendExistingNode(withoutMoving, newParentId, nestedNode)
}

export function moveNodeToRoot(
  nodes: IdeaNodeData[],
  movingId: string,
  position: Vec3,
): IdeaNodeData[] {
  const path = findPath(nodes, movingId)
  if (path.length === 0) return nodes

  if (path.length === 1) {
    return updateNodePosition(nodes, movingId, position)
  }

  const { nodes: withoutMoving, detached } = detachNode(nodes, movingId)
  if (!detached) return nodes

  const timestamp = new Date().toISOString()
  return [
    ...withoutMoving,
    {
      ...detached,
      position,
      updatedAt: timestamp,
      lastAccessedAt: timestamp,
    },
  ]
}

export function countNodes(nodes: IdeaNodeData[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0)
}

export function cloneTree(nodes: IdeaNodeData[]): IdeaNodeData[] {
  return normalizeTree(nodes.map((node) => ({
    ...node,
    position: node.position ? [...node.position] as Vec3 : undefined,
    growthEntries: (node.growthEntries ?? []).map((entry) => ({ ...entry })),
    children: cloneTree(node.children),
  })))
}

interface ActivityStats {
  visits: number
  creations: number
  growth: number
  descendants: number
  latestActivity: number
}

function collectActivity(node: IdeaNodeData): ActivityStats {
  const ownTimestamp = Date.parse(node.lastAccessedAt || node.updatedAt || node.createdAt)
  let stats: ActivityStats = {
    visits: node.accessCount ?? 0,
    creations: node.childCreationCount ?? node.children.length,
    growth: node.growthEntries?.length ?? 0,
    descendants: node.children.length,
    latestActivity: Number.isFinite(ownTimestamp) ? ownTimestamp : 0,
  }

  node.children.forEach((child) => {
    const childStats = collectActivity(child)
    stats = {
      visits: stats.visits + childStats.visits,
      creations: stats.creations + childStats.creations,
      growth: stats.growth + childStats.growth,
      descendants: stats.descendants + childStats.descendants,
      latestActivity: Math.max(stats.latestActivity, childStats.latestActivity),
    }
  })

  return stats
}

export function calculateActivityLevel(node: IdeaNodeData): number {
  const stats = collectActivity(node)
  const visitScore = 1 - Math.exp(-stats.visits / 10)
  const creationScore = 1 - Math.exp(-stats.creations / 8)
  const branchScore = 1 - Math.exp(-stats.descendants / 9)
  const growthScore = 1 - Math.exp(-stats.growth / 12)
  const ageDays = stats.latestActivity > 0
    ? Math.max(0, (Date.now() - stats.latestActivity) / 86_400_000)
    : 999
  const recencyScore = Math.exp(-ageDays / 28)

  return Math.min(
    1,
    Math.max(
      0.16,
      0.16 + visitScore * 0.28 + creationScore * 0.19 + branchScore * 0.18 + growthScore * 0.15 + recencyScore * 0.04,
    ),
  )
}

export function makeIdeaId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function getParentId(nodes: IdeaNodeData[], id: string): string | null | undefined {
  for (const node of nodes) {
    if (node.id === id) return null
    if (node.children.some((child) => child.id === id)) return node.id
    const nested = getParentId(node.children, id)
    if (nested !== undefined) return nested
  }
  return undefined
}

export function extractNode(
  nodes: IdeaNodeData[],
  id: string,
): { nodes: IdeaNodeData[]; extracted: IdeaNodeData | null; parentId: string | null } {
  const parentId = getParentId(nodes, id)
  if (parentId === undefined) return { nodes, extracted: null, parentId: null }
  const result = detachNode(nodes, id)
  return { nodes: result.nodes, extracted: result.detached, parentId }
}

export function removeInboxMetadata(node: IdeaNodeData): IdeaNodeData {
  const { inboxOrigin: _inboxOrigin, ...rest } = node
  return {
    ...rest,
    children: node.children.map(removeInboxMetadata),
  }
}

export function replaceNodeChildren(
  nodes: IdeaNodeData[],
  id: string,
  children: IdeaNodeData[],
): IdeaNodeData[] {
  return nodes.map((node) => node.id === id
    ? { ...node, children, updatedAt: new Date().toISOString() }
    : { ...node, children: replaceNodeChildren(node.children, id, children) })
}


export function makeGrowthEntryId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `growth-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function updateGrowthEntries(
  nodes: IdeaNodeData[],
  id: string,
  updater: (entries: GrowthEntry[]) => GrowthEntry[],
): IdeaNodeData[] {
  return nodes.map((node) => {
    if (node.id === id) {
      const timestamp = new Date().toISOString()
      return {
        ...node,
        growthEntries: updater((node.growthEntries ?? []).map((entry) => ({ ...entry }))),
        updatedAt: timestamp,
        lastAccessedAt: timestamp,
      }
    }
    return { ...node, children: updateGrowthEntries(node.children, id, updater) }
  })
}
