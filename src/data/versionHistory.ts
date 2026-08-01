import type { VersionHistoryEntry } from '../types'

const RECORDED_AT = '2026-07-30T01:48:00+10:00'

export const defaultVersionHistory: VersionHistoryEntry[] = [
  {
    id: 'version-v0190-personal-alpha',
    version: 'v0.19.0',
    title: '固定个人手机版逻辑并转入私网使用阶段',
    reason: '手机端的“速记”和“构思”都要求填写标题、简介和归属，实际使用时承担了相同任务；同时当前目标不是公开发布，而是先形成一个能够远程使用、持续验证的个人 App。',
    changedTo: '底部导航从五项收缩为主题、速记、灵感箱、设置四项；速记改成单一大输入框，自动生成标题并直接进入未整理灵感箱；结构化新增只保留在主题和分支详情中的加号；灵感箱增加转为主体、选择任意主题或分支归入、放回原位和删除到黑洞；设置加入本机运行加 Tailscale Serve 的私人访问说明。',
    result: '手机端形成“速记负责捕捉，主题加号负责结构化，灵感箱负责整理”的明确分工。前端不需要公开部署，可以先通过 Tailscale 私网作为个人 Alpha 长期使用，再根据真实习惯更新。',
    createdAt: '2026-08-01T13:08:00+10:00',
    updatedAt: '2026-08-01T13:08:00+10:00',
  },
  {
    id: 'version-v0187-mobile-theme-drilldown',
    version: 'v0.18.7',
    title: '手机端主题详情与分支逐层进入',
    reason: '原主题详情页只能查看根主题，新增分支入口分散在每个分支行末尾，也缺少编辑和删除能力，不符合手机端逐层浏览和单手操作习惯。',
    changedTo: '详情页左侧集中展示直接分支、全部后代和操作记录，右侧设置独立大加号用于向当前节点添加分支；原“构思到这里”改为“编辑详情”，增加删除到黑洞按钮；整行分支均可点击进入下一层，移除每个小球旁边的小加号，并支持逐层返回和路径跳转。',
    result: '手机端可以从主体连续进入任意深度分支，在当前层新增子分支、编辑名称简介和颜色、查看操作日历或删除当前节点。底部五页导航、主环动画和 PC 端均保持不变。',
    createdAt: '2026-07-31T18:35:00+10:00',
    updatedAt: '2026-07-31T18:35:00+10:00',
  },
  {
    id: 'version-v0186-mobile-arc-layout',
    version: 'v0.18.6',
    title: '重排手机端呼吸弧线箭头',
    reason: '原来的左右三枚角标呈平行散开状态，与弧线切线方向不完全一致，在小屏幕上显得拥挤且排列不自然。',
    changedTo: '左右两端改为对称的双层能量箭头，并沿弧线末端切线轻微倾斜；内层箭头先亮、外层随后呼吸，形成向外引导。删除三处分散的固定脉冲点，只在弧线中央保留一个柔和呼吸节点。',
    result: '滑动指示更对称、方向更清楚，视觉密度下降；主题球、小分支球、页面布局和滑动性能逻辑均保持不变。',
    createdAt: '2026-07-31T18:27:00+10:00',
    updatedAt: '2026-07-31T18:27:00+10:00',
  },
  {
    id: 'version-v0185-mobile-satellite-restore',
    version: 'v0.18.5',
    title: '恢复主球外围分支小球并保留滑动优化',
    reason: 'v0.18.4 为降低移动端重绘开销，对主题球增加了绘制范围限制；该限制同时裁掉了主球边界之外的分支卫星，因此界面只剩主球。',
    changedTo: '移除会裁剪外围内容的 paint containment，只保留不会隐藏卫星的布局隔离；恢复当前主题最多六个直接分支小球，并在手指拖动主题环时临时暂停球体内部装饰动画，松手后从原帧继续，呼吸弧线保持独立连续。',
    result: '主球外围的小分支球重新显示，原有页面布局、悬浮速记和底部页面导航不变；滑动期间减少无关动画计算，但不会通过删除小球换取流畅度。',
    createdAt: '2026-07-31T18:22:00+10:00',
    updatedAt: '2026-07-31T18:22:00+10:00',
  },
  {
    id: 'version-v0184-mobile-one-hand-layout',
    version: 'v0.18.4',
    title: '重排主题桌面并加入可移动悬浮速记',
    reason: '主题名称、描述和统计位于球体下方时，单手浏览需要在视觉焦点和操作区之间来回移动；速记也必须切换到底部页面。与此同时，移动端打开速记或构思会自动聚焦输入框并弹出键盘，主题环与呼吸弧线在滑动结束时还有短暂卡顿。',
    changedTo: '把主题名称、描述和分支统计移到页面上方，主体球和呼吸弧线置于中部，进入主题与操作日历固定在其下；在主题桌面加入可自由拖动的半透明悬浮速记球，并在设置中提供开关与透明度滑杆；取消移动端输入页自动聚焦；使用 requestAnimationFrame 节流拖动更新，固定球体布局尺寸并移除滑动中的高成本滤镜和弧线动画重启。',
    result: '主题桌面的阅读顺序更符合单手使用，常用速记可以从任意顺手位置直接进入；切换速记和构思时不会主动弹出键盘，主题轮换与下方脉冲动画在滑动前后更加连续。',
    createdAt: '2026-07-31T16:57:00+10:00',
    updatedAt: '2026-07-31T16:57:00+10:00',
  },
  {
    id: 'version-v0183-mobile-native-tabs',
    version: 'v0.18.3',
    title: '将底部功能改为移动端原生页面导航',
    reason: '速记、构思、灵感箱和设置此前仍以弹出面板出现，使用感更像桌面端缩小版，而不是手机应用中稳定、可预期的页面切换。',
    changedTo: '把底部五个入口重构为固定标签页：主题、速记、构思、灵感箱和设置各自拥有完整页面；主题详情和操作日历也改为主题栏中的二级页面，不再使用底部弹层。',
    result: '手机版形成清晰的主导航结构，切换行为更接近成熟移动平台；连续速记、选择构思归属、整理灵感箱和管理设置都能在独立页面完成。',
    createdAt: '2026-07-31T16:18:00+10:00',
    updatedAt: '2026-07-31T16:18:00+10:00',
  },
  {
    id: 'version-v0182-mobile-ring-spacing',
    version: 'v0.18.2',
    title: '拉开主题环并重新适配手机视口',
    reason: '首个空间环版本中，相邻球体距离偏近，滑动弧线与主体之间留白过大；在较矮屏幕上，主题信息和按钮还可能被底部功能栏遮挡。',
    changedTo: '扩大主题环的横向半径和角度间隔，增强远近缩放与景深；把呼吸弧线上移到主体球附近；压缩顶部栏和环形舞台高度，并让主题内容区在小屏幕上可以独立滚动。',
    result: '主题之间更容易辨认，弧线与主体形成一个完整控件；不同高度的手机都能查看下方信息和操作按钮，不再被底部栏固定遮挡。',
    createdAt: '2026-07-31T16:10:00+10:00',
    updatedAt: '2026-07-31T16:10:00+10:00',
  },
  {
    id: 'version-v0181-mobile-spatial-ring',
    version: 'v0.18.1',
    title: '将平面转盘重做为空间主题环',
    reason: '左轮弹仓式背景仍然像平面控件，没有形成主体球在三维空间里轮换的感觉。',
    changedTo: '移除弹仓背景，让主体球直接沿空间圆环排列；加入深度缩放、虚化和遮挡，并在主体下方增加带呼吸箭头的能量弧线。',
    result: '手机版主页形成独立的三维主题选择体验，下一步根据真机反馈继续调整球距、弧线位置和整体视口布局。',
    createdAt: '2026-07-31T15:55:00+10:00',
    updatedAt: '2026-07-31T15:55:00+10:00',
  },
  {
    id: 'version-v0180-mobile-shell',
    version: 'v0.18.0',
    title: '建立移动端旋转主题入口',
    reason: '手机的首要任务是快速选择思考领域并捕捉灵感，不适合直接缩小电脑端的完整三维编辑器。',
    changedTo: '新增手机专用界面：保留虚空背景，使用类似左轮弹仓的主题转盘，通过左右滑动切换主体，并在底部固定速记、构思、灵感箱和设置入口。电脑端界面保持不变。',
    result: '同一套账户、离线数据与 Supabase 同步可以在手机和电脑之间共用。下一步通过真机使用验证滑动手感、速记速度和灵感箱整理流程。',
    createdAt: '2026-07-31T15:30:00+10:00',
    updatedAt: '2026-07-31T15:30:00+10:00',
  },
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
  const existingIds = new Set(entries.map((entry) => entry.id))
  const missingDefaults = defaultVersionHistory.filter((entry) => !existingIds.has(entry.id))
  return [...missingDefaults.map((entry) => ({ ...entry })), ...entries]
}
