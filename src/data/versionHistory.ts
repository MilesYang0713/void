import type { VersionHistoryEntry } from '../types'

const RECORDED_AT = '2026-07-30T01:48:00+10:00'

export const defaultVersionHistory: VersionHistoryEntry[] = [
  {
    id: 'version-v0170',
    version: 'v0.17.0',
    title: '加入版本演化日志',
    reason: 'VOID 已经从视觉原型发展为长期使用的个人灵感系统，需要在软件内部留下每次产品决策，而不是只依赖聊天记录或 Git 提交。',
    changedTo: '在设置中加入独立的版本演化时间轴。每个节点记录版本、为什么更改、具体改成什么，以及验证结果或下一步。',
    result: '以后可以在 VOID 内回顾产品为什么走到现在，也能把这条路线直接整理为作品集中的设计过程。',
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
  {
    id: 'version-retrospective-v01-v016',
    version: 'v0.1–v0.16',
    title: '从三维能量球到个人灵感系统',
    reason: '最初只是想验证黑色虚空中的三维灵感球是否能表达思维发散，但持续使用后发现真正需求是“随时捕捉、持续发展、能够复盘并安全保存”。',
    changedTo: '逐步加入无限层级、拖拽融入与脱出、卫星轨道、灵感箱、横向思路路径、Word 导出、账户隔离、离线优先云同步、黑洞、搜索、撤销、云端历史备份和操作日历。',
    result: 'VOID 已经具备个人长期使用的基础。下一阶段优先通过真实使用发现问题，再决定作品集整理和商业化方向。',
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  },
]

export function cloneVersionHistory(entries: VersionHistoryEntry[]): VersionHistoryEntry[] {
  return entries.map((entry) => ({ ...entry }))
}

export function normalizeVersionHistory(value: unknown): VersionHistoryEntry[] {
  if (!Array.isArray(value)) return cloneVersionHistory(defaultVersionHistory)
  const entries = value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return []
    const entry = raw as Partial<VersionHistoryEntry>
    if (typeof entry.id !== 'string' || typeof entry.title !== 'string') return []
    const createdAt = entry.createdAt && Number.isFinite(Date.parse(entry.createdAt))
      ? entry.createdAt
      : new Date().toISOString()
    const updatedAt = entry.updatedAt && Number.isFinite(Date.parse(entry.updatedAt))
      ? entry.updatedAt
      : createdAt
    return [{
      id: entry.id,
      version: typeof entry.version === 'string' ? entry.version : '',
      title: entry.title,
      reason: typeof entry.reason === 'string' ? entry.reason : '',
      changedTo: typeof entry.changedTo === 'string' ? entry.changedTo : '',
      result: typeof entry.result === 'string' ? entry.result : '',
      createdAt,
      updatedAt,
    } satisfies VersionHistoryEntry]
  })
  return entries
}
