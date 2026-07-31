import type { GrowthEntryType, IdeaNodeData } from '../types'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '-').trim() || 'VOID'
}

const growthLabels: Record<GrowthEntryType, string> = {
  created: '创建记录',
  note: '补充记录',
  edit: '内容修改',
  branch: '分支变化',
  move: '位置移动',
  relation: '关系调整',
  inbox: '灵感箱操作',
  restore: '恢复记录',
  delete: '删除记录',
  origin: '创建时内容',
  addition: '旧版补充',
  inference: '旧版推论',
  question: '旧版问题',
  action: '旧版行动',
  revision: '旧版修订',
}


function renderGrowth(node: IdeaNodeData) {
  const entries = [...(node.growthEntries ?? [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  if (entries.length === 0) return ''
  return `<section class="growth"><h${Math.min(6, 3)}>操作日历</h${Math.min(6, 3)}>${entries.map((entry) => {
    const change = entry.previousContent || entry.nextContent
      ? `<div class="revision-before">${entry.previousContent ? `<b>修改前：</b>${escapeHtml(entry.previousContent).replaceAll('\n', '<br>')}` : ''}${entry.nextContent ? `<br><b>修改后：</b>${escapeHtml(entry.nextContent).replaceAll('\n', '<br>')}` : ''}</div>`
      : ''
    return `<div class="growth-entry"><strong>${growthLabels[entry.type]}</strong><span>${new Date(entry.createdAt).toLocaleString('zh-CN')}</span>${change}<p>${escapeHtml(entry.content).replaceAll('\n', '<br>')}</p></div>`
  }).join('')}</section>`
}

function renderNode(node: IdeaNodeData, depth: number): string {
  const headingLevel = Math.min(6, depth + 1)
  const heading = `h${headingLevel}`
  const description = node.description.trim()
    ? `<p class="description">${escapeHtml(node.description).replaceAll('\n', '<br>')}</p>`
    : '<p class="description muted">（暂无简介）</p>'
  const metadata = `<p class="metadata">创建：${new Date(node.createdAt).toLocaleString('zh-CN')} · 更新：${new Date(node.updatedAt).toLocaleString('zh-CN')}</p>`
  return `<${heading}>${escapeHtml(node.title)}</${heading}>${description}${metadata}${renderGrowth(node)}${node.children.map((child) => renderNode(child, depth + 1)).join('')}`
}

function downloadWord(title: string, body: string) {
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{margin:2.2cm}body{font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.7;color:#1d2230}h1{font-size:26pt;border-bottom:2px solid #7657d8;padding-bottom:10px}h2{font-size:19pt;margin-top:28px}h3{font-size:15pt;margin-top:22px}h4,h5,h6{font-size:12pt;margin-top:18px}.description{font-size:10.5pt;margin:6px 0 2px}.metadata{font-size:8.5pt;color:#777;margin:0 0 12px}.muted{color:#999}.growth{margin:12px 0 20px;padding:10px 16px;border-left:3px solid #8b5cf6;background:#f7f5ff}.growth h3{margin:0 0 8px;font-size:12pt}.growth-entry{margin:8px 0 12px}.growth-entry strong{display:inline-block;margin-right:10px;color:#5b3fb3}.growth-entry span{font-size:8pt;color:#888}.growth-entry p{margin:3px 0;font-size:10pt}.revision-before{margin:6px 0;padding:7px 9px;background:#efecf8;color:#666;font-size:9pt;border-left:2px solid #9b87d8}.cover{page-break-after:always;text-align:center;padding-top:180px}.cover h1{border:0;font-size:32pt}.cover p{color:#666}</style></head><body>${body}</body></html>`
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${safeFileName(title)}.doc`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportIdeaWord(root: IdeaNodeData) {
  downloadWord(root.title, renderNode(root, 0))
}

export function exportAllIdeasWord(roots: IdeaNodeData[]) {
  const date = new Date().toLocaleDateString('zh-CN')
  const cover = `<section class="cover"><h1>VOID 思维宇宙</h1><p>${roots.length} 个主体 · 导出日期 ${date}</p></section>`
  downloadWord(`VOID-全部主体-${new Date().toISOString().slice(0, 10)}`, cover + roots.map((root) => renderNode(root, 0)).join('<div style="page-break-before:always"></div>'))
}
