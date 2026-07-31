import { useMemo, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import type { IdeaNodeData } from '../../types'

export type SearchMode = 'title' | 'content'

interface SearchEntry {
  node: IdeaNodeData
  path: string[]
  field: string
  score: number
  exact: boolean
  matchedCharacters: number
}

interface GlobalSearchProps {
  ideas: IdeaNodeData[]
  language: Language
  onOpenIdea: (id: string) => void
}

function flattenIdeas(nodes: IdeaNodeData[], parents: string[] = []): Array<{ node: IdeaNodeData; path: string[] }> {
  return nodes.flatMap((node) => {
    const path = [...parents, node.title]
    return [{ node, path }, ...flattenIdeas(node.children, path)]
  })
}

function rankField(fieldValue: string, rawQuery: string) {
  const field = fieldValue.trim().toLocaleLowerCase()
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!field || !query) return null

  const exactIndex = field.indexOf(query)
  if (exactIndex >= 0) {
    return {
      score: 10_000 - exactIndex * 10 - Math.max(0, field.length - query.length),
      exact: true,
      matchedCharacters: [...query].length,
    }
  }

  const queryCharacters = [...new Set([...query].filter((character) => character.trim()))]
  const matchedCharacters = queryCharacters.filter((character) => field.includes(character)).length
  if (matchedCharacters === 0) return null

  let orderedIndex = -1
  let orderedMatches = 0
  queryCharacters.forEach((character) => {
    const nextIndex = field.indexOf(character, orderedIndex + 1)
    if (nextIndex >= 0) {
      orderedIndex = nextIndex
      orderedMatches += 1
    }
  })

  return {
    score: matchedCharacters * 500 + orderedMatches * 120 - field.length,
    exact: false,
    matchedCharacters,
  }
}

export default function GlobalSearch({ ideas, language, onOpenIdea }: GlobalSearchProps) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('title')
  const [focused, setFocused] = useState(false)
  const allEntries = useMemo(() => flattenIdeas(ideas), [ideas])

  const results = useMemo<SearchEntry[]>(() => {
    const trimmed = query.trim()
    if (!trimmed) return []

    return allEntries
      .flatMap(({ node, path }) => {
        const field = mode === 'title' ? node.title : node.description
        const ranked = rankField(field, trimmed)
        if (!ranked) return []
        return [{ node, path, field, ...ranked }]
      })
      .sort((left, right) => {
        if (left.exact !== right.exact) return left.exact ? -1 : 1
        if (left.matchedCharacters !== right.matchedCharacters) return right.matchedCharacters - left.matchedCharacters
        return right.score - left.score
      })
      .slice(0, 16)
  }, [allEntries, mode, query])

  const open = focused && query.trim().length > 0
  const title = language === 'zh-CN' ? '搜索灵感' : 'Search ideas'

  return (
    <section className={`global-search ${open ? 'global-search--open' : ''}`}>
      <div className="global-search__bar">
        <span className="global-search__icon">⌕</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('')
              setFocused(false)
            }
            if (event.key === 'Enter' && results[0]) {
              onOpenIdea(results[0].node.id)
              setFocused(false)
            }
          }}
          placeholder={language === 'zh-CN' ? '输入主题或内容，例如：牛肉' : 'Search a title or description'}
          aria-label={title}
        />
        {query && (
          <button type="button" className="global-search__clear" onClick={() => setQuery('')} aria-label={language === 'zh-CN' ? '清空' : 'Clear'}>
            ×
          </button>
        )}
        <div className="global-search__modes" aria-label={language === 'zh-CN' ? '搜索范围' : 'Search scope'}>
          <button type="button" className={mode === 'title' ? 'is-active' : ''} onClick={() => setMode('title')}>
            {language === 'zh-CN' ? '主题' : 'Title'}
          </button>
          <button type="button" className={mode === 'content' ? 'is-active' : ''} onClick={() => setMode('content')}>
            {language === 'zh-CN' ? '内容' : 'Content'}
          </button>
        </div>
      </div>

      {open && (
        <div className="global-search__results" onMouseDown={(event) => event.preventDefault()}>
          <header>
            <span>{mode === 'title' ? (language === 'zh-CN' ? '主题匹配' : 'Title matches') : (language === 'zh-CN' ? '内容匹配' : 'Content matches')}</span>
            <small>{language === 'zh-CN' ? `${results.length} 条结果 · 完整词优先，其次模糊字符` : `${results.length} results · phrase matches first`}</small>
          </header>
          {results.length === 0 ? (
            <div className="global-search__empty">{language === 'zh-CN' ? '没有找到相关灵感' : 'No matching ideas'}</div>
          ) : (
            <div className="global-search__list">
              {results.map((result) => (
                <button
                  type="button"
                  key={result.node.id}
                  className="global-search__result"
                  style={{ '--search-color': result.node.color } as CSSProperties}
                  onClick={() => {
                    onOpenIdea(result.node.id)
                    setFocused(false)
                  }}
                >
                  <i />
                  <span>
                    <strong>{result.node.title}</strong>
                    <small>{result.path.join(' / ')}</small>
                    {mode === 'content' && <p>{result.field || (language === 'zh-CN' ? '暂无简介' : 'No description')}</p>}
                  </span>
                  <em>{result.exact ? (language === 'zh-CN' ? '完整匹配' : 'Exact') : (language === 'zh-CN' ? '模糊匹配' : 'Fuzzy')}</em>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
