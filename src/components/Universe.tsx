import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import type { Language } from '../i18n'
import { UI_TEXT } from '../i18n'
import type { DragStatus, IdeaNodeData, RelationTransition, Vec3, ViewTransition } from '../types'
import { calculateActivityLevel, countNodes } from '../utils/tree'
import {
  PARENT_REST_POSITION,
  createChildPositions,
  createRecursivePreviewLayout,
  createRootPositions,
  type PreviewLayoutEntry,
} from '../utils/layout'
import AmbientDust from './AmbientDust'
import CameraRig from './CameraRig'
import CosmicBackdrop from './CosmicBackdrop'
import DetachBoundary from './DetachBoundary'
import EnergyLink from './EnergyLink'
import IdeaNode from './IdeaNode'
import RelationTransitionEffect from './RelationTransitionEffect'

interface UniverseProps {
  roots: IdeaNodeData[]
  currentNode: IdeaNodeData | null
  parentNode: IdeaNodeData | null
  previousNode: IdeaNodeData | null
  transition: ViewTransition
  language: Language
  onSelect: (id: string, position: Vec3, scale: number) => void
  onBack: () => void
  onMoveRoot: (id: string, position: Vec3) => void
  onNestNode: (movingId: string, targetId: string, sourcePosition: Vec3, targetPosition: Vec3, sourceScale: number, targetScale: number) => void
  onDetachNode: (movingId: string, sourcePosition: Vec3, targetPosition: Vec3, sourceScale: number) => void
  onMoveToInbox: (id: string) => void
  onInboxDragHover?: (active: boolean) => void
  relationTransition: RelationTransition | null
  onDragStatusChange?: (status: DragStatus | null) => void
}

interface ClusterRegistryEntry {
  group: THREE.Group
  title: string
}

type ClusterRegistry = Map<string, ClusterRegistryEntry>

interface PointerSession {
  down: boolean
  cancelled: boolean
  startX: number
  startY: number
  startedAt: number
}

function isInboxDropZone(clientX: number, clientY: number) {
  const element = document.elementFromPoint(clientX, clientY)
  return Boolean(element?.closest('[data-inbox-dropzone]'))
}

function useInteractionLabels(language: Language) {
  const copy = UI_TEXT[language]
  return useMemo(() => ({
    dropTarget: copy.releaseIntoHere,
    dragging: copy.releaseToPlace,
    pressing: copy.preparingMove,
  }), [copy])
}

interface RootClusterProps {
  root: IdeaNodeData
  rootIndex: number
  rootPosition: Vec3
  language: Language
  clusterRegistry: MutableRefObject<ClusterRegistry>
  dropTargetId: string | null
  relationTransition: RelationTransition | null
  transition: ViewTransition
  onSelect: UniverseProps['onSelect']
  onMoveRoot: UniverseProps['onMoveRoot']
  onNestNode: UniverseProps['onNestNode']
  onMoveToInbox: UniverseProps['onMoveToInbox']
  onInboxDragHover: NonNullable<UniverseProps['onInboxDragHover']>
  onDropTargetChange: (targetId: string | null, targetTitle: string | null) => void
  onDragStateChange: (rootId: string, title: string, dragging: boolean) => void
}

function RootCluster({
  root,
  rootIndex,
  rootPosition,
  language,
  clusterRegistry,
  dropTargetId,
  relationTransition,
  transition,
  onSelect,
  onMoveRoot,
  onNestNode,
  onMoveToInbox,
  onInboxDragHover,
  onDropTargetChange,
  onDragStateChange,
}: RootClusterProps) {
  const copy = UI_TEXT[language]
  const interactionLabels = useInteractionLabels(language)
  const groupRef = useRef<THREE.Group>(null)
  const previewLayoutCacheRef = useRef<Map<string, PreviewLayoutEntry>>(new Map())
  const { camera, gl } = useThree()
  const [pressing, setPressing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const transitionHoldRef = useRef(false)
  const suppressClickRef = useRef(false)
  const latestElapsedRef = useRef(0)
  const releaseAtRef = useRef(-100)
  const longPressTimerRef = useRef<number | null>(null)
  const pointerSessionRef = useRef<PointerSession>({ down: false, cancelled: false, startX: 0, startY: 0, startedAt: 0 })
  const anchorRef = useRef(new THREE.Vector3(...rootPosition))
  const dragTargetRef = useRef(new THREE.Vector3(...rootPosition))
  const dragOffsetRef = useRef(new THREE.Vector3())
  const motionTargetRef = useRef(new THREE.Vector3())
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerNdcRef = useRef(new THREE.Vector2())
  const dragPlaneRef = useRef(new THREE.Plane())
  const planeNormalRef = useRef(new THREE.Vector3())
  const intersectionRef = useRef(new THREE.Vector3())
  const projectedPositionRef = useRef(new THREE.Vector3())
  const worldPositionRef = useRef(new THREE.Vector3())
  const currentDropTargetRef = useRef<{ id: string; title: string } | null>(null)
  const inboxDropRef = useRef(false)

  const previewLayout = useMemo(() => {
    const desiredLayout = createRecursivePreviewLayout(root.children)
    const cache = previewLayoutCacheRef.current
    const activeIds = new Set(desiredLayout.map((entry) => entry.node.id))

    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) cache.delete(cachedId)
    }

    const invalidated = new Set<string>()
    const resolvedPositions = new Map<string, Vec3>()

    return desiredLayout.map((entry) => {
      const cached = cache.get(entry.node.id)
      const parentWasRepositioned = Boolean(entry.parentId && invalidated.has(entry.parentId))
      const canKeepPosition = Boolean(
        cached
        && cached.parentId === entry.parentId
        && !parentWasRepositioned
      )
      const resolvedParent = entry.parentId
        ? resolvedPositions.get(entry.parentId) ?? entry.parentPosition
        : [0, 0, 0] as Vec3

      let position: Vec3
      if (canKeepPosition && cached) {
        position = [...cached.position] as Vec3
      } else {
        invalidated.add(entry.node.id)
        const relative: Vec3 = [
          entry.position[0] - entry.parentPosition[0],
          entry.position[1] - entry.parentPosition[1],
          entry.position[2] - entry.parentPosition[2],
        ]
        position = [
          resolvedParent[0] + relative[0],
          resolvedParent[1] + relative[1],
          resolvedParent[2] + relative[2],
        ]
      }

      const resolved: PreviewLayoutEntry = {
        ...entry,
        position,
        parentPosition: [...resolvedParent] as Vec3,
        delay: canKeepPosition ? 0 : entry.delay,
      }
      cache.set(entry.node.id, resolved)
      resolvedPositions.set(entry.node.id, position)
      return resolved
    })
  }, [root.children])
  const descendantCount = countNodes(root.children)
  const activityLevel = calculateActivityLevel(root)
  const rootScale = Math.min(1.02, 0.69 + Math.min(descendantCount, 24) * 0.008 + activityLevel * 0.1)
  const motionPhase = useMemo(
    () => [...root.id].reduce((sum, char) => sum + char.charCodeAt(0) * 0.019, 0),
    [root.id],
  )
  const driftAmplitude = 0.28 + Math.min(descendantCount, 20) * 0.006 + activityLevel * 0.18
  const createdTimestamp = Date.parse(root.createdAt)
  const isRecentlyCreated = Number.isFinite(createdTimestamp) && Date.now() - createdTimestamp < 3_800
  const isDetaching = relationTransition?.kind === 'detach' && relationTransition.movingId === root.id
  const isMovingRelation = relationTransition?.kind === 'nest' && relationTransition.movingId === root.id
  const isRelationTarget = relationTransition?.kind === 'nest' && relationTransition.targetId === root.id
  const isReturningFromFocus = transition.direction === 'exit' && transition.previousId === root.id
  const isVoidReturn = transition.direction === 'exit'

  const setClusterGroupRef = useCallback((group: THREE.Group | null) => {
    groupRef.current = group
    if (group) clusterRegistry.current.set(root.id, { group, title: root.title })
    else clusterRegistry.current.delete(root.id)
  }, [clusterRegistry, root.id, root.title])

  const findDropTarget = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    const threshold = Math.max(72, Math.min(112, rect.width * 0.075))
    let nearest: { id: string; title: string; distance: number } | null = null

    for (const [id, entry] of clusterRegistry.current.entries()) {
      if (id === root.id) continue
      entry.group.getWorldPosition(worldPositionRef.current)
      projectedPositionRef.current.copy(worldPositionRef.current).project(camera)
      if (projectedPositionRef.current.z < -1 || projectedPositionRef.current.z > 1) continue

      const x = rect.left + (projectedPositionRef.current.x + 1) * 0.5 * rect.width
      const y = rect.top + (1 - projectedPositionRef.current.y) * 0.5 * rect.height
      const distance = Math.hypot(clientX - x, clientY - y)
      if (distance <= threshold && (!nearest || distance < nearest.distance)) {
        nearest = { id, title: entry.title, distance }
      }
    }

    return nearest
  }, [camera, clusterRegistry, gl.domElement, root.id])

  useEffect(() => {
    if (draggingRef.current) return
    anchorRef.current.set(...rootPosition)
  }, [rootPosition])

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const pointerToPlane = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    pointerNdcRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera)
    return raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectionRef.current)
  }, [camera, gl.domElement])

  const activateDrag = useCallback(() => {
    const session = pointerSessionRef.current
    if (!session.down || session.cancelled || !groupRef.current || draggingRef.current) return

    draggingRef.current = true
    setDragging(true)
    setPressing(false)
    dragTargetRef.current.copy(groupRef.current.position)
    onDragStateChange(root.id, root.title, true)
    document.body.style.cursor = 'grabbing'
  }, [onDragStateChange, root.id, root.title])

  useEffect(() => {
    const updateDropTarget = (clientX: number, clientY: number) => {
      const candidate = findDropTarget(clientX, clientY)
      const previousId = currentDropTargetRef.current?.id ?? null
      const nextId = candidate?.id ?? null
      if (previousId === nextId) return

      currentDropTargetRef.current = candidate ? { id: candidate.id, title: candidate.title } : null
      onDropTargetChange(nextId, candidate?.title ?? null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session.down) return

      const movement = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
      const heldFor = performance.now() - session.startedAt

      if (!draggingRef.current && movement > 4 && heldFor >= 60) {
        activateDrag()
      } else if (!draggingRef.current && movement > 16 && heldFor < 60) {
        session.cancelled = true
        setPressing(false)
        clearLongPressTimer()
        return
      }

      if (!draggingRef.current) return
      event.preventDefault()

      const overInbox = isInboxDropZone(event.clientX, event.clientY)
      if (inboxDropRef.current !== overInbox) {
        inboxDropRef.current = overInbox
        onInboxDragHover(overInbox)
      }
      if (overInbox) {
        currentDropTargetRef.current = null
        onDropTargetChange(null, null)
        return
      }

      const intersection = pointerToPlane(event.clientX, event.clientY)
      if (!intersection) return
      dragTargetRef.current.copy(intersection).add(dragOffsetRef.current)
      updateDropTarget(event.clientX, event.clientY)
    }

    const finishPointer = () => {
      const session = pointerSessionRef.current
      if (!session.down) return
      session.down = false
      clearLongPressTimer()
      setPressing(false)

      if (!draggingRef.current) return

      const target = currentDropTargetRef.current
      const group = groupRef.current
      if (inboxDropRef.current) {
        onMoveToInbox(root.id)
      } else if (target && group) {
        const targetEntry = clusterRegistry.current.get(target.id)
        if (targetEntry) {
          group.getWorldPosition(worldPositionRef.current)
          const sourcePosition: Vec3 = [worldPositionRef.current.x, worldPositionRef.current.y, worldPositionRef.current.z]
          targetEntry.group.getWorldPosition(projectedPositionRef.current)
          const targetPosition: Vec3 = [projectedPositionRef.current.x, projectedPositionRef.current.y, projectedPositionRef.current.z]
          transitionHoldRef.current = true
          onNestNode(root.id, target.id, sourcePosition, targetPosition, rootScale, 0.72)
        }
      } else if (group) {
        group.position.copy(dragTargetRef.current)
        anchorRef.current.copy(dragTargetRef.current)
        releaseAtRef.current = latestElapsedRef.current
        onMoveRoot(root.id, [group.position.x, group.position.y, group.position.z])
      }

      inboxDropRef.current = false
      onInboxDragHover(false)
      currentDropTargetRef.current = null
      onDropTargetChange(null, null)
      draggingRef.current = false
      setDragging(false)
      onDragStateChange(root.id, root.title, false)
      document.body.style.cursor = 'default'
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 180)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
      clearLongPressTimer()
    }
  }, [activateDrag, clearLongPressTimer, findDropTarget, onDragStateChange, onDropTargetChange, onInboxDragHover, onMoveRoot, onMoveToInbox, onNestNode, pointerToPlane, root.id, root.title])

  useFrame(({ clock }, delta) => {
    const group = groupRef.current
    if (!group) return

    const elapsed = clock.getElapsedTime()
    latestElapsedRef.current = elapsed
    const smooth = 1 - Math.exp(-2.35 * delta)

    if (draggingRef.current) {
      group.position.lerp(dragTargetRef.current, 1 - Math.pow(0.00001, delta))
    } else if (transitionHoldRef.current) {
      group.position.lerp(dragTargetRef.current, 1 - Math.pow(0.00001, delta))
    } else {
      const driftRamp = THREE.MathUtils.smoothstep(elapsed - releaseAtRef.current, 0, 1.35)
      const t = elapsed + motionPhase
      const xDrift = (
        Math.sin(t * 0.19) * 0.64
        + Math.cos(t * 0.071 + motionPhase) * 0.29
        + Math.sin(t * 0.037 + 1.4) * 0.18
      ) * driftAmplitude
      const yDrift = (
        Math.cos(t * 0.16 + 0.7) * 0.54
        + Math.sin(t * 0.061 + motionPhase * 0.4) * 0.27
      ) * driftAmplitude
      const zDrift = (
        Math.sin(t * 0.13 + motionPhase * 1.4) * 0.58
        + Math.cos(t * 0.043 - 0.9) * 0.31
      ) * driftAmplitude

      motionTargetRef.current.set(
        anchorRef.current.x + xDrift * driftRamp,
        anchorRef.current.y + yDrift * driftRamp,
        anchorRef.current.z + zDrift * driftRamp,
      )
      group.position.lerp(motionTargetRef.current, smooth)
    }

    group.rotation.y += delta * (0.05 + (motionPhase % 1.1) * 0.006 + activityLevel * 0.025)
    group.rotation.z = Math.sin(elapsed * 0.12 + motionPhase) * 0.11
    group.rotation.x = Math.cos(elapsed * 0.095 + motionPhase) * 0.075
  })

  const beginLongPress = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !groupRef.current) return
    event.stopPropagation()

    transitionHoldRef.current = false
    pointerSessionRef.current = {
      down: true,
      cancelled: false,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
    }
    setPressing(true)

    camera.getWorldDirection(planeNormalRef.current).normalize()
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormalRef.current, groupRef.current.position)
    const intersection = pointerToPlane(event.clientX, event.clientY)
    if (intersection) dragOffsetRef.current.copy(groupRef.current.position).sub(intersection)
    else dragOffsetRef.current.set(0, 0, 0)

    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(activateDrag, 120)
  }

  return (
    <group ref={setClusterGroupRef} position={rootPosition}>
      <IdeaNode
        key={`root-${root.id}-${relationTransition?.movingId === root.id ? relationTransition.serial : 0}`}
        id={root.id}
        title={root.title}
        color={root.color}
        targetPosition={[0, 0, 0]}
        initialPosition={isReturningFromFocus ? [-rootPosition[0], -rootPosition[1], -rootPosition[2]] : [0, 0, 0]}
        initialScale={isReturningFromFocus ? 1.28 : isDetaching ? 0.05 : isRecentlyCreated ? 0.04 : isVoidReturn ? rootScale * 0.72 : rootScale}
        targetScale={isMovingRelation ? 0.07 : rootScale}
        initialOpacity={isReturningFromFocus ? 1 : isDetaching || isRecentlyCreated ? 0 : isVoidReturn ? 0.16 : 1}
        targetOpacity={isMovingRelation ? 0.02 : 1}
        transitionDuration={isReturningFromFocus ? 2.05 : isDetaching ? 0.9 : isRecentlyCreated ? 1.55 : isVoidReturn ? 1.55 : 1.05}
        transitionArc={isReturningFromFocus ? -0.72 : isRecentlyCreated ? 0.42 : isVoidReturn ? 0.18 : 0}
        transitionEffect={isReturningFromFocus ? 'focus' : isDetaching ? 'birth' : isRecentlyCreated ? 'birth' : isVoidReturn ? 'focus' : 'none'}
        showLabel
        labelDetail={copy.rootBranchEnergy(root.children.length, Math.round(activityLevel * 100))}
        delay={isReturningFromFocus ? 0 : isVoidReturn ? 0.28 + rootIndex * 0.055 : rootIndex * 0.04}
        floatStrength={0.12}
        orbitStrength={0.075}
        motionSpeed={0.62 + rootIndex * 0.045}
        activityLevel={activityLevel}
        particleCount={80 + Math.round(activityLevel * 100)}
        draggable
        pressing={pressing}
        dragging={dragging}
        dropTarget={dropTargetId === root.id || isRelationTarget}
        interactionLabels={interactionLabels}
        onPointerDown={beginLongPress}
        onClick={(position, scale) => {
          if (suppressClickRef.current || draggingRef.current) return
          onSelect(root.id, position, scale)
        }}
      />

      {!isMovingRelation && previewLayout.map((entry, index) => {
        const childActivity = calculateActivityLevel(entry.node)
        const isRelationArrival = relationTransition?.kind === 'nest' && relationTransition.movingId === entry.node.id
        return (
          <group key={`preview-${root.id}-${entry.node.id}`}>
            <EnergyLink
              start={entry.parentPosition}
              end={entry.position}
              color={entry.node.color}
              opacity={Math.max(0.055, (0.14 + childActivity * 0.1) * Math.pow(0.79, entry.depth - 1))}
              lineWidth={Math.max(0.18, 0.42 - entry.depth * 0.055)}
              sparkScale={Math.max(0.23, 0.5 - entry.depth * 0.055)}
              delay={isRelationArrival ? 0 : isReturningFromFocus ? 0.72 + entry.delay * 0.5 : entry.delay * 0.72}
            />
            <IdeaNode
              id={entry.node.id}
              title={entry.node.title}
              color={entry.node.color}
              targetPosition={entry.position}
              initialPosition={isRelationArrival ? entry.parentPosition : entry.parentPosition}
              initialScale={isRelationArrival ? entry.scale : isReturningFromFocus ? entry.scale * 0.6 : 0.015}
              targetScale={entry.scale}
              initialOpacity={isRelationArrival ? entry.opacity : isReturningFromFocus ? 0.06 : 0}
              targetOpacity={entry.opacity}
              compact
              activityLevel={childActivity * 0.84}
              particleCount={entry.depth <= 1 ? 36 : 20}
              floatStrength={Math.max(0.008, 0.03 - entry.depth * 0.003)}
              orbitStrength={Math.max(0.006, 0.023 - entry.depth * 0.0025)}
              motionSpeed={0.72 + (index % 7) * 0.04}
              delay={isRelationArrival ? 0 : isReturningFromFocus ? 0.74 + entry.delay * 0.5 : entry.delay}
              transitionDuration={isRelationArrival ? 0.72 : isReturningFromFocus ? 1.45 : 1.35 + Math.min(entry.depth, 4) * 0.08}
              transitionArc={isRelationArrival ? 0.08 : Math.max(0.08, 0.32 - entry.depth * 0.035)}
              transitionEffect={isRelationArrival ? 'none' : entry.depth <= 2 ? 'birth' : 'none'}
              positionDamping={relationTransition ? 1.75 : 4.2}
              interactionLabels={interactionLabels}
              onClick={(position, scale) => onSelect(entry.node.id, position, scale)}
            />
          </group>
        )
      })}
    </group>
  )
}

interface RootClustersProps extends Pick<UniverseProps, 'roots' | 'language' | 'onSelect' | 'onMoveRoot' | 'onNestNode' | 'onMoveToInbox' | 'relationTransition' | 'transition'> {
  onDragStatusChange: (status: DragStatus | null) => void
  onInboxDragHover: NonNullable<UniverseProps['onInboxDragHover']>
}

function RootClusters({ roots, language, onSelect, onMoveRoot, onNestNode, onMoveToInbox, relationTransition, transition, onDragStatusChange, onInboxDragHover }: RootClustersProps) {
  const positionCacheRef = useRef<Map<string, Vec3>>(new Map())
  const clusterRegistry = useRef<ClusterRegistry>(new Map())
  const [draggingSource, setDraggingSource] = useState<{ id: string; title: string } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)

  const handleDragStateChange = (rootId: string, title: string, isDragging: boolean) => {
    if (isDragging) {
      setDraggingSource({ id: rootId, title })
      onDragStatusChange({ sourceTitle: title, targetTitle: null, scope: 'root' })
      return
    }

    setDraggingSource(null)
    setDropTargetId(null)
    onDragStatusChange(null)
  }

  const handleDropTargetChange = (targetId: string | null, targetTitle: string | null) => {
    setDropTargetId(targetId)
    if (!draggingSource) return
    onDragStatusChange({ sourceTitle: draggingSource.title, targetTitle, scope: 'root' })
  }

  const rootPositions = useMemo(() => {
    const cache = positionCacheRef.current
    const activeIds = new Set(roots.map((root) => root.id))
    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) cache.delete(cachedId)
    }

    const candidates = createRootPositions(Math.max(8, roots.length + 4))
    const used = [...cache.values()]

    roots.forEach((root, index) => {
      if (root.position) {
        const stored: Vec3 = [root.position[0], root.position[1], root.position[2]]
        cache.set(root.id, stored)
        if (!used.some((position) => position === stored)) used.push(stored)
        return
      }
      if (cache.has(root.id)) return

      const candidate = candidates.find((position) => used.every((existing) => {
        const dx = position[0] - existing[0]
        const dy = position[1] - existing[1]
        const dz = position[2] - existing[2]
        return dx * dx + dy * dy + dz * dz > 2.15 * 2.15
      })) ?? candidates[index % candidates.length]
      const stored: Vec3 = [candidate[0], candidate[1], candidate[2]]
      cache.set(root.id, stored)
      used.push(stored)
    })

    return roots.map((root) => cache.get(root.id) ?? [0, 0, 0] as Vec3)
  }, [roots])

  return (
    <>
      {roots.map((root, rootIndex) => (
        <RootCluster
          key={`cluster-${root.id}`}
          root={root}
          rootIndex={rootIndex}
          rootPosition={rootPositions[rootIndex]}
          language={language}
          clusterRegistry={clusterRegistry}
          dropTargetId={dropTargetId}
          relationTransition={relationTransition}
          transition={transition}
          onSelect={onSelect}
          onMoveRoot={onMoveRoot}
          onNestNode={onNestNode}
          onMoveToInbox={onMoveToInbox}
          onInboxDragHover={onInboxDragHover}
          onDropTargetChange={handleDropTargetChange}
          onDragStateChange={handleDragStateChange}
        />
      ))}
    </>
  )
}

interface FocusedChildNodeProps {
  node: IdeaNodeData
  index: number
  position: Vec3
  branchScale: number
  activityLevel: number
  language: Language
  transition: ViewTransition
  isMovingBackNode: boolean
  registry: MutableRefObject<ClusterRegistry>
  orbitFrameRef: { current: THREE.Group | null }
  dropTargetId: string | null
  onSelect: UniverseProps['onSelect']
  onNestNode: UniverseProps['onNestNode']
  onDetachNode: UniverseProps['onDetachNode']
  onMoveToInbox: UniverseProps['onMoveToInbox']
  onInboxDragHover: NonNullable<UniverseProps['onInboxDragHover']>
  relationTransition: RelationTransition | null
  onDropTargetChange: (targetId: string | null, targetTitle: string | null) => void
  onDragStateChange: (id: string, title: string, dragging: boolean) => void
  onDetachStateChange: (progress: number, ready: boolean) => void
}

function FocusedChildNode({
  node,
  index,
  position,
  branchScale,
  activityLevel,
  language,
  transition,
  isMovingBackNode,
  registry,
  orbitFrameRef,
  dropTargetId,
  onSelect,
  onNestNode,
  onDetachNode,
  onMoveToInbox,
  onInboxDragHover,
  relationTransition,
  onDropTargetChange,
  onDragStateChange,
  onDetachStateChange,
}: FocusedChildNodeProps) {
  const copy = UI_TEXT[language]
  const interactionLabels = useInteractionLabels(language)
  const groupRef = useRef<THREE.Group>(null)
  const { camera, gl } = useThree()
  const [pressing, setPressing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const draggingRef = useRef(false)
  const transitionHoldRef = useRef(false)
  const detachReadyRef = useRef(false)
  const suppressClickRef = useRef(false)
  const longPressTimerRef = useRef<number | null>(null)
  const pointerSessionRef = useRef<PointerSession>({ down: false, cancelled: false, startX: 0, startY: 0, startedAt: 0 })
  const basePositionRef = useRef(new THREE.Vector3(...position))
  const dragTargetRef = useRef(new THREE.Vector3(...position))
  const dragOffsetRef = useRef(new THREE.Vector3())
  const raycasterRef = useRef(new THREE.Raycaster())
  const pointerNdcRef = useRef(new THREE.Vector2())
  const dragPlaneRef = useRef(new THREE.Plane())
  const planeNormalRef = useRef(new THREE.Vector3())
  const intersectionRef = useRef(new THREE.Vector3())
  const localIntersectionRef = useRef(new THREE.Vector3())
  const projectedPositionRef = useRef(new THREE.Vector3())
  const worldPositionRef = useRef(new THREE.Vector3())
  const currentDropTargetRef = useRef<{ id: string; title: string } | null>(null)
  const inboxDropRef = useRef(false)

  const setGroupRef = useCallback((group: THREE.Group | null) => {
    groupRef.current = group
    if (group) registry.current.set(node.id, { group, title: node.title })
    else registry.current.delete(node.id)
  }, [node.id, node.title, registry])

  useEffect(() => {
    basePositionRef.current.set(...position)
  }, [position])

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const pointerToPlane = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    pointerNdcRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    raycasterRef.current.setFromCamera(pointerNdcRef.current, camera)
    const worldIntersection = raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, intersectionRef.current)
    if (!worldIntersection) return null

    localIntersectionRef.current.copy(worldIntersection)
    orbitFrameRef.current?.worldToLocal(localIntersectionRef.current)
    return localIntersectionRef.current
  }, [camera, gl.domElement, orbitFrameRef])

  const findDropTarget = useCallback((clientX: number, clientY: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    const threshold = Math.max(66, Math.min(98, rect.width * 0.065))
    let nearest: { id: string; title: string; distance: number } | null = null

    for (const [id, entry] of registry.current.entries()) {
      if (id === node.id) continue
      entry.group.getWorldPosition(worldPositionRef.current)
      projectedPositionRef.current.copy(worldPositionRef.current).project(camera)
      if (projectedPositionRef.current.z < -1 || projectedPositionRef.current.z > 1) continue

      const x = rect.left + (projectedPositionRef.current.x + 1) * 0.5 * rect.width
      const y = rect.top + (1 - projectedPositionRef.current.y) * 0.5 * rect.height
      const distance = Math.hypot(clientX - x, clientY - y)
      if (distance <= threshold && (!nearest || distance < nearest.distance)) {
        nearest = { id, title: entry.title, distance }
      }
    }

    return nearest
  }, [camera, gl.domElement, node.id, registry])

  const activateDrag = useCallback(() => {
    const session = pointerSessionRef.current
    if (!session.down || session.cancelled || !groupRef.current || draggingRef.current) return
    draggingRef.current = true
    setDragging(true)
    setPressing(false)
    dragTargetRef.current.copy(groupRef.current.position)
    onDragStateChange(node.id, node.title, true)
    document.body.style.cursor = 'grabbing'
  }, [node.id, node.title, onDragStateChange])

  useEffect(() => {
    const updateDropTarget = (clientX: number, clientY: number) => {
      const candidate = findDropTarget(clientX, clientY)
      const previousId = currentDropTargetRef.current?.id ?? null
      const nextId = candidate?.id ?? null
      if (previousId === nextId) return
      currentDropTargetRef.current = candidate ? { id: candidate.id, title: candidate.title } : null
      onDropTargetChange(nextId, candidate?.title ?? null)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const session = pointerSessionRef.current
      if (!session.down) return
      const movement = Math.hypot(event.clientX - session.startX, event.clientY - session.startY)
      const heldFor = performance.now() - session.startedAt

      if (!draggingRef.current && movement > 4 && heldFor >= 55) activateDrag()
      else if (!draggingRef.current && movement > 16 && heldFor < 55) {
        session.cancelled = true
        setPressing(false)
        clearLongPressTimer()
        return
      }

      if (!draggingRef.current) return
      event.preventDefault()

      const overInbox = isInboxDropZone(event.clientX, event.clientY)
      if (inboxDropRef.current !== overInbox) {
        inboxDropRef.current = overInbox
        onInboxDragHover(overInbox)
      }
      if (overInbox) {
        currentDropTargetRef.current = null
        onDropTargetChange(null, null)
        detachReadyRef.current = false
        onDetachStateChange(0, false)
        return
      }

      const intersection = pointerToPlane(event.clientX, event.clientY)
      if (!intersection) return
      dragTargetRef.current.copy(intersection).add(dragOffsetRef.current)
      updateDropTarget(event.clientX, event.clientY)
      const candidate = currentDropTargetRef.current
      projectedPositionRef.current.copy(dragTargetRef.current)
      orbitFrameRef.current?.localToWorld(projectedPositionRef.current)
      const radialDistance = Math.hypot(projectedPositionRef.current.x, projectedPositionRef.current.y)
      const detachProgress = candidate
        ? 0
        : THREE.MathUtils.clamp((radialDistance - 2.15) / (3.35 - 2.15), 0, 1)
      detachReadyRef.current = !candidate && radialDistance >= 3.35
      onDetachStateChange(detachProgress, detachReadyRef.current)
    }

    const finishPointer = () => {
      const session = pointerSessionRef.current
      if (!session.down) return
      session.down = false
      clearLongPressTimer()
      setPressing(false)

      if (!draggingRef.current) return
      const target = currentDropTargetRef.current
      if (inboxDropRef.current) {
        onMoveToInbox(node.id)
      } else if (target && groupRef.current) {
        const targetEntry = registry.current.get(target.id)
        if (targetEntry) {
          groupRef.current.getWorldPosition(worldPositionRef.current)
          const sourcePosition: Vec3 = [worldPositionRef.current.x, worldPositionRef.current.y, worldPositionRef.current.z]
          targetEntry.group.getWorldPosition(projectedPositionRef.current)
          const targetPosition: Vec3 = [projectedPositionRef.current.x, projectedPositionRef.current.y, projectedPositionRef.current.z]
          transitionHoldRef.current = true
          onNestNode(node.id, target.id, sourcePosition, targetPosition, branchScale, 0.52)
        }
      } else if (detachReadyRef.current && groupRef.current) {
        groupRef.current.getWorldPosition(worldPositionRef.current)
        const sourcePosition: Vec3 = [worldPositionRef.current.x, worldPositionRef.current.y, worldPositionRef.current.z]
        projectedPositionRef.current.copy(dragTargetRef.current)
        orbitFrameRef.current?.localToWorld(projectedPositionRef.current)
        const radial = new THREE.Vector3(projectedPositionRef.current.x, projectedPositionRef.current.y, 0)
        if (radial.lengthSq() < 0.001) radial.set(1, 0, 0)
        radial.normalize().multiplyScalar(4.25 + Math.min(0.7, index * 0.08))
        const targetPosition: Vec3 = [
          radial.x,
          radial.y * 0.72,
          THREE.MathUtils.clamp(projectedPositionRef.current.z, -1.35, 1.35),
        ]
        transitionHoldRef.current = true
        onDetachNode(node.id, sourcePosition, targetPosition, branchScale)
      }

      detachReadyRef.current = false
      onDetachStateChange(0, false)
      inboxDropRef.current = false
      onInboxDragHover(false)
      currentDropTargetRef.current = null
      onDropTargetChange(null, null)
      draggingRef.current = false
      setDragging(false)
      onDragStateChange(node.id, node.title, false)
      document.body.style.cursor = 'default'
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 180)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', finishPointer)
    window.addEventListener('pointercancel', finishPointer)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', finishPointer)
      window.removeEventListener('pointercancel', finishPointer)
      clearLongPressTimer()
    }
  }, [activateDrag, clearLongPressTimer, findDropTarget, index, node.id, node.title, onDetachNode, onDetachStateChange, onDragStateChange, onDropTargetChange, onInboxDragHover, onMoveToInbox, onNestNode, orbitFrameRef, pointerToPlane])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group) return
    const smooth = 1 - Math.exp(-2.55 * delta)
    const targetPosition = draggingRef.current || transitionHoldRef.current ? dragTargetRef.current : basePositionRef.current
    group.position.lerp(targetPosition, smooth)
  })

  const beginLongPress = (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0 || !groupRef.current) return
    event.stopPropagation()
    transitionHoldRef.current = false
    detachReadyRef.current = false
    onDetachStateChange(0, false)
    pointerSessionRef.current = {
      down: true,
      cancelled: false,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
    }
    setPressing(true)

    groupRef.current.getWorldPosition(worldPositionRef.current)
    camera.getWorldDirection(planeNormalRef.current).normalize()
    dragPlaneRef.current.setFromNormalAndCoplanarPoint(planeNormalRef.current, worldPositionRef.current)
    const intersection = pointerToPlane(event.clientX, event.clientY)
    if (intersection) dragOffsetRef.current.copy(groupRef.current.position).sub(intersection)
    else dragOffsetRef.current.set(0, 0, 0)

    clearLongPressTimer()
    longPressTimerRef.current = window.setTimeout(activateDrag, 105)
  }

  const isMovingRelation = relationTransition?.movingId === node.id
  const isRelationTarget = relationTransition?.kind === 'nest' && relationTransition.targetId === node.id
  const localEntrance: Vec3 = [-position[0], -position[1], -position[2]]

  return (
    <group ref={setGroupRef} position={position}>
      <IdeaNode
        key={isMovingBackNode ? `returning-${node.id}-${transition.serial}` : `child-${node.id}`}
        id={node.id}
        title={node.title}
        color={node.color}
        targetPosition={[0, 0, 0]}
        initialPosition={localEntrance}
        initialScale={isMovingBackNode ? 1.28 : 0.02}
        targetScale={isMovingRelation ? 0.06 : branchScale}
        initialOpacity={isMovingBackNode ? 1 : 0}
        targetOpacity={isMovingRelation ? 0.02 : 1}
        showLabel
        labelDetail={node.children.length > 0 ? copy.branchCount(node.children.length) : copy.dragBranch}
        delay={isMovingBackNode ? 0 : 0.24 + index * 0.085}
        transitionDuration={isMovingBackNode ? 1.7 : 1.35}
        transitionArc={isMovingBackNode ? 0.6 : 0.28}
        transitionEffect={isMovingBackNode ? 'focus' : 'birth'}
        activityLevel={activityLevel}
        particleCount={55 + Math.round(activityLevel * 55)}
        floatStrength={0.035}
        orbitStrength={0.022}
        motionSpeed={0.65 + index * 0.025}
        draggable
        pressing={pressing}
        dragging={dragging}
        dropTarget={dropTargetId === node.id}
        interactionLabels={interactionLabels}
        onPointerDown={beginLongPress}
        onClick={(worldPosition, worldScale) => {
          if (suppressClickRef.current || draggingRef.current) return
          onSelect(node.id, worldPosition, worldScale)
        }}
      />
    </group>
  )
}

interface FocusedChildrenProps {
  currentNode: IdeaNodeData
  movingBackChildIndex: number
  transition: ViewTransition
  language: Language
  onSelect: UniverseProps['onSelect']
  onNestNode: UniverseProps['onNestNode']
  onDetachNode: UniverseProps['onDetachNode']
  onMoveToInbox: UniverseProps['onMoveToInbox']
  onInboxDragHover: NonNullable<UniverseProps['onInboxDragHover']>
  relationTransition: RelationTransition | null
  onDragStatusChange: (status: DragStatus | null) => void
}

function FocusedChildren({ currentNode, movingBackChildIndex, transition, language, onSelect, onNestNode, onDetachNode, onMoveToInbox, onInboxDragHover, relationTransition, onDragStatusChange }: FocusedChildrenProps) {
  const registry = useRef<ClusterRegistry>(new Map())
  const orbitFrameRef = useRef<THREE.Group>(null)
  const orbitAngleRef = useRef(0)
  const orbitVelocityRef = useRef(0)
  const positionParentRef = useRef(currentNode.id)
  const positionCacheRef = useRef<Map<string, Vec3>>(new Map())
  const [draggingSource, setDraggingSource] = useState<{ id: string; title: string } | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [detachState, setDetachState] = useState({ progress: 0, ready: false })

  if (positionParentRef.current !== currentNode.id) {
    positionParentRef.current = currentNode.id
    positionCacheRef.current.clear()
    orbitAngleRef.current = 0
    orbitVelocityRef.current = 0
  }

  const childPositions = useMemo(() => {
    const cache = positionCacheRef.current
    const activeIds = new Set(currentNode.children.map((child) => child.id))
    for (const cachedId of cache.keys()) {
      if (!activeIds.has(cachedId)) cache.delete(cachedId)
    }

    const candidateCount = Math.max(8, currentNode.children.length + 4)
    const candidates = createChildPositions(candidateCount)
    const used = [...cache.values()]

    currentNode.children.forEach((child, index) => {
      if (cache.has(child.id)) return
      const candidate = candidates.find((position) => used.every((existing) => {
        const dx = position[0] - existing[0]
        const dy = position[1] - existing[1]
        const dz = position[2] - existing[2]
        return dx * dx + dy * dy + dz * dz > 0.72 * 0.72
      })) ?? candidates[index % candidates.length]
      const stored: Vec3 = [candidate[0], candidate[1], candidate[2]]
      cache.set(child.id, stored)
      used.push(stored)
    })

    return currentNode.children.map((child) => cache.get(child.id) ?? [0, 0, 0] as Vec3)
  }, [currentNode.children, currentNode.id])

  const orbitPhase = useMemo(
    () => [...currentNode.id].reduce((sum, char) => sum + char.charCodeAt(0) * 0.011, 0),
    [currentNode.id],
  )
  const orbitRingCount = Math.max(1, Math.ceil(currentNode.children.length / 8))

  useFrame(({ clock }, delta) => {
    const orbit = orbitFrameRef.current
    if (!orbit) return

    const elapsed = clock.getElapsedTime()
    const paused = Boolean(draggingSource || relationTransition)
    if (paused) {
      orbitVelocityRef.current = 0
      return
    }

    const desiredVelocity = 0.085 + Math.min(currentNode.children.length, 18) * 0.0018
    orbitVelocityRef.current = THREE.MathUtils.lerp(
      orbitVelocityRef.current,
      desiredVelocity,
      1 - Math.pow(0.012, delta),
    )
    orbitAngleRef.current += delta * orbitVelocityRef.current

    orbit.rotation.z = orbitAngleRef.current
    orbit.rotation.x = 0.16 + Math.sin(elapsed * 0.17 + orbitPhase) * 0.055
    orbit.rotation.y = Math.sin(elapsed * 0.13 + orbitPhase * 1.3) * 0.12
  })

  const handleDragStateChange = (id: string, title: string, isDragging: boolean) => {
    if (isDragging) {
      setDraggingSource({ id, title })
      setDetachState({ progress: 0, ready: false })
      onDragStatusChange({ sourceTitle: title, targetTitle: null, scope: 'branch', detachProgress: 0, detachReady: false })
      return
    }
    setDraggingSource(null)
    setDropTargetId(null)
    setDetachState({ progress: 0, ready: false })
    onDragStatusChange(null)
  }

  const handleDropTargetChange = (targetId: string | null, targetTitle: string | null) => {
    setDropTargetId(targetId)
    if (!draggingSource) return
    onDragStatusChange({ sourceTitle: draggingSource.title, targetTitle, scope: 'branch', detachProgress: 0, detachReady: false })
  }

  const handleDetachStateChange = (progress: number, ready: boolean) => {
    setDetachState({ progress, ready })
    if (!draggingSource) return
    onDragStatusChange({
      sourceTitle: draggingSource.title,
      targetTitle: null,
      scope: 'branch',
      detachProgress: progress,
      detachReady: ready,
    })
  }

  return (
    <>
      {draggingSource && (
        <DetachBoundary
          radius={3.35}
          color={currentNode.color}
          progress={detachState.progress}
          ready={detachState.ready}
          language={language}
        />
      )}

      <group ref={orbitFrameRef}>
        {Array.from({ length: orbitRingCount }, (_, ringIndex) => (
          <mesh
            key={`orbit-guide-${currentNode.id}-${ringIndex}`}
            scale={[1, 0.68, 1]}
            rotation={[0, 0, ringIndex * 0.035]}
          >
            <torusGeometry args={[2.42 + ringIndex * 1.35, 0.008, 6, 160]} />
            <meshBasicMaterial
              color={currentNode.color}
              transparent
              opacity={0.045 - Math.min(ringIndex, 3) * 0.008}
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        ))}

        {currentNode.children.map((node, index) => {
          const position = childPositions[index]
          const isMovingBackNode = index === movingBackChildIndex
          const branchScale = Math.min(0.66, 0.54 + Math.min(countNodes(node.children), 8) * 0.012)
          const activityLevel = calculateActivityLevel(node)

          return (
            <group key={`child-wrap-${currentNode.id}-${node.id}`}>
              <EnergyLink
                end={position}
                color={currentNode.color}
                delay={index * 0.08}
                opacity={relationTransition?.movingId === node.id ? 0.025 : 0.25 + activityLevel * 0.12}
              />
              <FocusedChildNode
                node={node}
                index={index}
                position={position}
                branchScale={branchScale}
                activityLevel={activityLevel}
                language={language}
                transition={transition}
                isMovingBackNode={isMovingBackNode}
                registry={registry}
                orbitFrameRef={orbitFrameRef}
                dropTargetId={dropTargetId}
                onSelect={onSelect}
                onNestNode={onNestNode}
                onDetachNode={onDetachNode}
                onMoveToInbox={onMoveToInbox}
                onInboxDragHover={onInboxDragHover}
                relationTransition={relationTransition}
                onDetachStateChange={handleDetachStateChange}
                onDropTargetChange={handleDropTargetChange}
                onDragStateChange={handleDragStateChange}
              />
            </group>
          )
        })}
      </group>
    </>
  )
}

function FocusedCluster({
  currentNode,
  parentNode,
  previousNode,
  transition,
  language,
  onSelect,
  onBack,
  onNestNode,
  onDetachNode,
  onMoveToInbox,
  onInboxDragHover,
  relationTransition,
  onDragStatusChange,
}: Omit<UniverseProps, 'roots' | 'onMoveRoot'> & { currentNode: IdeaNodeData }) {
  const copy = UI_TEXT[language]
  const interactionLabels = useInteractionLabels(language)
  const previousIsParent = Boolean(previousNode && parentNode && previousNode.id === parentNode.id)
  const movingBackChildIndex = transition.direction === 'back' && previousNode
    ? currentNode.children.findIndex((child) => child.id === previousNode.id)
    : -1
  const parentStartsAtCenter = previousIsParent && (transition.direction === 'forward' || transition.direction === 'create')
  const currentActivity = calculateActivityLevel(currentNode)
  const currentIsMovingRelation = relationTransition?.movingId === currentNode.id

  return (
    <>
      <IdeaNode
        key={`focus-${currentNode.id}-${transition.serial}`}
        id={currentNode.id}
        title={currentNode.title}
        color={currentNode.color}
        targetPosition={[0, 0, 0]}
        initialPosition={transition.startPosition}
        initialScale={transition.startScale}
        targetScale={currentIsMovingRelation ? 0.08 : 1.28}
        initialOpacity={transition.direction === 'create' ? 0.24 : 1}
        targetOpacity={currentIsMovingRelation ? 0.02 : 1}
        transitionDuration={transition.direction === 'create' ? 1.75 : 1.65}
        transitionArc={transition.direction === 'back' ? -0.5 : 0.72}
        transitionEffect={transition.direction === 'create' ? 'birth' : 'focus'}
        showLabel
        labelDetail={copy.rootBranchEnergy(currentNode.children.length, Math.round(currentActivity * 100))}
        active
        activityLevel={currentActivity}
        particleCount={100 + Math.round(currentActivity * 120)}
        floatStrength={0.045}
        orbitStrength={0.025}
        motionSpeed={0.5}
        interactionLabels={interactionLabels}
      />

      {parentNode && (
        <>
          <EnergyLink start={PARENT_REST_POSITION} end={[0, 0, 0]} color={parentNode.color} opacity={0.12} lineWidth={0.45} sparkScale={0.5} />
          <IdeaNode
            key={`parent-${parentNode.id}-${transition.serial}`}
            id={parentNode.id}
            title={parentNode.title}
            color={parentNode.color}
            targetPosition={PARENT_REST_POSITION}
            initialPosition={parentStartsAtCenter ? [0, 0, 0] : PARENT_REST_POSITION}
            initialScale={parentStartsAtCenter ? 1.28 : 0.34}
            targetScale={0.34}
            initialOpacity={parentStartsAtCenter ? 1 : 0.3}
            targetOpacity={0.3}
            transitionDuration={1.55}
            transitionArc={-0.48}
            transitionEffect="focus"
            showLabel
            labelDetail={copy.parentLayer}
            activityLevel={calculateActivityLevel(parentNode) * 0.72}
            floatStrength={0.018}
            orbitStrength={0.012}
            interactionLabels={interactionLabels}
            onClick={() => onBack()}
          />
        </>
      )}

      <FocusedChildren
        currentNode={currentNode}
        movingBackChildIndex={movingBackChildIndex}
        transition={transition}
        language={language}
        onSelect={onSelect}
        onNestNode={onNestNode}
        onDetachNode={onDetachNode}
        onMoveToInbox={onMoveToInbox}
        onInboxDragHover={onInboxDragHover ?? (() => undefined)}
        relationTransition={relationTransition}
        onDragStatusChange={onDragStatusChange ?? (() => undefined)}
      />
    </>
  )
}

function Scene(props: UniverseProps) {
  const { roots, currentNode, language, onSelect, onMoveRoot, onNestNode, onMoveToInbox, onInboxDragHover, relationTransition, transition, onDragStatusChange } = props
  const [draggingNode, setDraggingNode] = useState(false)

  const handleDragStatusChange = (status: DragStatus | null) => {
    setDraggingNode(Boolean(status))
    onDragStatusChange?.(status)
  }

  return (
    <>
      <color attach="background" args={['#010106']} />
      <fog attach="fog" args={['#020107', 10, 33]} />

      <ambientLight intensity={0.42} />
      <hemisphereLight args={['#7c5cff', '#020106', 0.42]} />
      <pointLight position={[5, 6, 7]} intensity={13} color="#c4b5fd" />
      <pointLight position={[-7, -4, 3]} intensity={8} color="#2563eb" />
      <pointLight position={[0, -7, -7]} intensity={5} color="#c026d3" />

      <CosmicBackdrop />
      <AmbientDust />

      {currentNode
        ? <FocusedCluster {...props} currentNode={currentNode} onDragStatusChange={handleDragStatusChange} />
        : (
          <RootClusters
            roots={roots}
            language={language}
            onSelect={onSelect}
            onMoveRoot={onMoveRoot}
            onNestNode={onNestNode}
            onMoveToInbox={onMoveToInbox}
            onInboxDragHover={onInboxDragHover ?? (() => undefined)}
            relationTransition={relationTransition}
            transition={transition}
            onDragStatusChange={handleDragStatusChange}
          />
        )}

      {relationTransition && <RelationTransitionEffect key={relationTransition.serial} transition={relationTransition} />}

      <CameraRig focused={Boolean(currentNode)} returningToVoid={!currentNode && transition.direction === 'exit'} enabled={!draggingNode} />
    </>
  )
}

export default function Universe(props: UniverseProps) {
  return (
    <Canvas
      dpr={[1, 1.7]}
      camera={{ position: [0, 0, 8.2], fov: 52, near: 0.1, far: 140 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      onPointerMissed={props.onBack}
    >
      <Suspense fallback={null}>
        <Scene {...props} />
      </Suspense>
    </Canvas>
  )
}
