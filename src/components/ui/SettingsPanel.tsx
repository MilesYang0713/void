import { useRef } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import type { SyncStatus } from '../../hooks/useLocalFirstSpace'

interface SettingsPanelProps {
  language: Language
  onLanguageChange: (language: Language) => void
  onClose: () => void
  accountEmail: string
  syncStatus: SyncStatus
  isOnline: boolean
  lastSyncedAt: string | null
  totalIdeas: number
  onSyncNow: () => void
  onExport: () => void
  onImport: (file: File) => void
  onSignOut: () => void
}

export default function SettingsPanel({
  language,
  onLanguageChange,
  onClose,
  accountEmail,
  syncStatus,
  isOnline,
  lastSyncedAt,
  totalIdeas,
  onSyncNow,
  onExport,
  onImport,
  onSignOut,
}: SettingsPanelProps) {
  const copy = UI_TEXT[language]
  const inputRef = useRef<HTMLInputElement>(null)
  const syncTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : copy.neverSynced

  const syncText = !isOnline || syncStatus === 'offline'
    ? copy.dataOffline
    : syncStatus === 'syncing'
      ? copy.dataSyncing
      : syncStatus === 'pending'
        ? copy.dataPending
        : syncStatus === 'error'
          ? copy.dataError
          : copy.dataSynced

  return (
    <aside className="settings-panel" aria-label={copy.settingsTitle}>
      <header className="settings-panel__header">
        <div>
          <span>{copy.settingsEyebrow}</span>
          <h2>{copy.settingsTitle}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>
          ×
        </button>
      </header>

      <p className="settings-panel__description">{copy.settingsDescription}</p>

      <section className="settings-group">
        <span className="settings-group__label">{copy.account}</span>
        <div className="account-card">
          <span className="account-avatar">{accountEmail.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{accountEmail}</strong>
            <small>{copy.personalCloudSpace}</small>
          </div>
          <button type="button" className="text-button text-button--danger" onClick={onSignOut}>
            {copy.signOut}
          </button>
        </div>
      </section>

      <section className="settings-group">
        <span className="settings-group__label">{copy.language}</span>
        <div className="language-options">
          <button
            type="button"
            className={`language-option ${language === 'zh-CN' ? 'language-option--active' : ''}`}
            onClick={() => onLanguageChange('zh-CN')}
          >
            <strong>简</strong>
            <span>{copy.simplifiedChinese}</span>
          </button>
          <button
            type="button"
            className={`language-option ${language === 'en' ? 'language-option--active' : ''}`}
            onClick={() => onLanguageChange('en')}
          >
            <strong>EN</strong>
            <span>{copy.english}</span>
          </button>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group__heading">
          <span className="settings-group__label">{copy.dataAndSync}</span>
          <span className={`sync-pill sync-pill--${syncStatus}`}>{syncText}</span>
        </div>

        <div className="data-summary">
          <div><strong>{totalIdeas}</strong><span>{copy.ideaCountLabel}</span></div>
          <div><strong>{syncTime}</strong><span>{copy.lastCloudSync}</span></div>
        </div>

        <p className="data-note">{copy.localFirstExplanation}</p>

        <div className="settings-actions settings-actions--two">
          <button type="button" className="secondary-button" onClick={onSyncNow} disabled={!isOnline || syncStatus === 'syncing'}>
            ↻ {copy.syncNow}
          </button>
          <button type="button" className="secondary-button" onClick={onExport}>
            ↓ {copy.exportJson}
          </button>
          <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>
            ↑ {copy.importJson}
          </button>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onImport(file)
              event.target.value = ''
            }}
          />
        </div>
      </section>
    </aside>
  )
}
