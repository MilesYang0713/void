import type { IdeaNodeData, Vec3 } from '../types'

export const PARENT_REST_POSITION: Vec3 = [-3.2, 1.62, -2.55]

export interface PreviewLayoutEntry {
  node: IdeaNodeData
  parentId: string | null
  position: Vec3
  parentPosition: Vec3
  depth: number
  scale: number
  opacity: number
  delay: number
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function createRingPositions(
  count: number,
  options: {
    perRing: number
    firstRadius: number
    ringGap: number
    yRatio: number
    angleOffset?: number
    zDepth?: number
  },
): Vec3[] {
  const positions: Vec3[] = []

  for (let index = 0; index < count; index += 1) {
    const ring = Math.floor(index / options.perRing)
    const ringStart = ring * options.perRing
    const ringCount = Math.min(options.perRing, count - ringStart)
    const localIndex = index - ringStart
    const angle = (
      (localIndex / Math.max(1, ringCount)) * Math.PI * 2
      + (options.angleOffset ?? 0)
      + ring * 0.38
    )
    const radius = options.firstRadius + ring * options.ringGap

    positions.push([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * options.yRatio,
      Math.sin(angle * 1.65 + ring) * (options.zDepth ?? 0.2) - ring * 0.14,
    ])
  }

  return positions
}

export function createRootPositions(count: number): Vec3[] {
  return createRingPositions(count, {
    perRing: 6,
    firstRadius: count <= 2 ? 2.2 : 3.25,
    ringGap: 2.65,
    yRatio: 0.58,
    angleOffset: Math.PI * 0.18,
    zDepth: 0.38,
  })
}

export function createChildPositions(count: number): Vec3[] {
  return createRingPositions(count, {
    perRing: 8,
    firstRadius: 2.42,
    ringGap: 1.35,
    yRatio: 0.68,
    angleOffset: Math.PI * 0.12,
    zDepth: 0.36,
  })
}

function subtreeWeight(node: IdeaNodeData): number {
  if (node.children.length === 0) return 1
  return Math.max(1, node.children.reduce((total, child) => total + subtreeWeight(child), 0))
}

function previewRadius(depth: number): number {
  const maxRadius = 1.82
  return maxRadius * (1 - Math.exp(-depth / 2.15))
}

function previewScale(depth: number, childCount: number): number {
  const base = 0.255 * Math.pow(0.72, Math.max(0, depth - 1))
  const branchBoost = Math.min(childCount, 6) * 0.006
  return Math.max(0.065, Math.min(0.27, base + branchBoost))
}

function previewOpacity(depth: number): number {
  return Math.max(0.35, 0.92 * Math.pow(0.84, Math.max(0, depth - 1)))
}

/**
 * Builds a compact radial layout for every descendant of a root idea.
 * Each subtree receives its own angular sector, so deeper generations remain
 * visually grouped with their ancestors rather than forming a random cloud.
 */
export function createRecursivePreviewLayout(children: IdeaNodeData[]): PreviewLayoutEntry[] {
  const entries: PreviewLayoutEntry[] = []
  const totalWeight = Math.max(1, children.reduce((total, child) => total + subtreeWeight(child), 0))
  let cursor = -Math.PI * 0.94
  let order = 0

  const visit = (
    node: IdeaNodeData,
    depth: number,
    sectorStart: number,
    sectorEnd: number,
    parentId: string | null,
    parentPosition: Vec3,
  ) => {
    const angle = (sectorStart + sectorEnd) / 2
    const radius = previewRadius(depth)
    const position: Vec3 = [
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.72,
      Math.sin(angle * 1.72 + depth * 0.88) * (0.13 + Math.min(depth, 5) * 0.035)
        - Math.min(depth - 1, 5) * 0.035,
    ]

    entries.push({
      node,
      parentId,
      position,
      parentPosition,
      depth,
      scale: previewScale(depth, node.children.length),
      opacity: previewOpacity(depth),
      delay: 0.16 + order * 0.018 + depth * 0.055,
    })
    order += 1

    if (node.children.length === 0) return

    const sectorPadding = Math.min(0.06, Math.max(0.018, (sectorEnd - sectorStart) * 0.045))
    const usableStart = sectorStart + sectorPadding
    const usableEnd = sectorEnd - sectorPadding
    const childWeight = Math.max(
      1,
      node.children.reduce((total, child) => total + subtreeWeight(child), 0),
    )
    let childCursor = usableStart

    node.children.forEach((child) => {
      const fraction = subtreeWeight(child) / childWeight
      const childEnd = childCursor + (usableEnd - usableStart) * fraction
      visit(child, depth + 1, childCursor, childEnd, node.id, position)
      childCursor = childEnd
    })
  }

  children.forEach((child) => {
    const fraction = subtreeWeight(child) / totalWeight
    const sectorEnd = cursor + Math.PI * 1.88 * fraction
    visit(child, 1, cursor, sectorEnd, null, [0, 0, 0])
    cursor = sectorEnd
  })

  return entries
}
