import { useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Language } from '../../i18n'
import { UI_TEXT } from '../../i18n'
import VersionHistoryPanel from './VersionHistoryPanel'
import type { VersionHistoryEntry } from '../../types'
import type {
  BackupHistoryStatus,
  CloudBackupSummary,
  SyncStatus,
} from '../../hooks/useLocalFirstSpace'

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
  onExportWordAll: () => void
  onImport: (file: File) => void
  onSignOut: () => void
  backupHistory: CloudBackupSummary[]
  backupHistoryStatus: BackupHistoryStatus
  backupAction: 'idle' | 'creating' | 'restoring' | 'deleting'
  onRefreshBackups: () => Promise<void>
  onCreateBackup: () => Promise<void>
  onRestoreBackup: (backupId: string) => Promise<void>
  onDeleteBackup: (backupId: string) => Promise<void>
  versionHistory: VersionHistoryEntry[]
  onAddVersionEntry: (draft: Omit<VersionHistoryEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
  onUpdateVersionEntry: (id: string, draft: Omit<VersionHistoryEntry, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDeleteVersionEntry: (id: string) => void
  mobileFloatingQuickEnabled?: boolean
  mobileFloatingQuickOpacity?: number
  onMobileFloatingQuickEnabledChange?: (enabled: boolean) => void
  onMobileFloatingQuickOpacityChange?: (opacity: number) => void
  embedded?: boolean
}

function formatBackupTime(value: string, language: Language) {
  return new Date(value).toLocaleString(language === 'zh-CN' ? 'zh-CN' : 'en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  onExportWordAll,
  onImport,
  onSignOut,
  backupHistory,
  backupHistoryStatus,
  backupAction,
  onRefreshBackups,
  onCreateBackup,
  onRestoreBackup,
  onDeleteBackup,
  versionHistory,
  onAddVersionEntry,
  onUpdateVersionEntry,
  onDeleteVersionEntry,
  mobileFloatingQuickEnabled,
  mobileFloatingQuickOpacity,
  onMobileFloatingQuickEnabledChange,
  onMobileFloatingQuickOpacityChange,
  embedded = false,
}: SettingsPanelProps) {
  const copy = UI_TEXT[language]
  const inputRef = useRef<HTMLInputElement>(null)
  const [restoreCandidate, setRestoreCandidate] = useState<CloudBackupSummary | null>(null)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const [evolutionOpen, setEvolutionOpen] = useState(false)

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

  const sourceLabels = useMemo(() => ({
    automatic: language === 'zh-CN' ? '自动备份' : 'Automatic',
    manual: language === 'zh-CN' ? '手动备份' : 'Manual',
    pre_restore: language === 'zh-CN' ? '恢复前保护' : 'Pre-restore protection',
  }), [language])

  const runBackupAction = async (action: () => Promise<void>, success: string) => {
    setBackupError(null)
    setBackupMessage(null)
    try {
      await action()
      setBackupMessage(success)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : (language === 'zh-CN' ? '云端备份操作失败' : 'Cloud backup action failed'))
    }
  }

  return (
    <aside className={`settings-panel ${embedded ? 'settings-panel--embedded' : ''}`} aria-label={copy.settingsTitle}>
      <header className="settings-panel__header">
        <div>
          <span>{copy.settingsEyebrow}</span>
          <h2>{copy.settingsTitle}</h2>
        </div>
        {!embedded && (
          <button type="button" className="icon-button" onClick={onClose} aria-label={copy.close}>
            ×
          </button>
        )}
      </header>

      <p className="settings-panel__description">{copy.settingsDescription}</p>

      {typeof mobileFloatingQuickEnabled === 'boolean' && typeof mobileFloatingQuickOpacity === 'number' && onMobileFloatingQuickEnabledChange && onMobileFloatingQuickOpacityChange && (
        <section className="settings-group mobile-floating-settings">
          <div className="mobile-floating-settings__heading">
            <div>
              <span className="settings-group__label">{language === 'zh-CN' ? '主题桌面悬浮速记' : 'Floating capture on Themes'}</span>
              <p>{language === 'zh-CN' ? '像辅助触控一样拖到顺手的位置，轻点直接进入速记。此设置仅保存在当前设备。' : 'Drag it to a comfortable position like AssistiveTouch, then tap to open Capture. This setting stays on this device.'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={mobileFloatingQuickEnabled}
              className={`mobile-settings-switch ${mobileFloatingQuickEnabled ? 'is-on' : ''}`}
              onClick={() => onMobileFloatingQuickEnabledChange?.(!mobileFloatingQuickEnabled)}
            >
              <i />
              <span>{mobileFloatingQuickEnabled ? (language === 'zh-CN' ? '已开启' : 'On') : (language === 'zh-CN' ? '已关闭' : 'Off')}</span>
            </button>
          </div>

          <div className={`mobile-floating-opacity ${mobileFloatingQuickEnabled ? '' : 'is-disabled'}`}>
            <div className="mobile-floating-opacity__preview" style={{ '--preview-opacity': mobileFloatingQuickOpacity } as CSSProperties}>
              <span>⚡</span><small>{language === 'zh-CN' ? '速记' : 'Capture'}</small>
            </div>
            <label>
              <span>{language === 'zh-CN' ? '透明度' : 'Opacity'}</span>
              <strong>{Math.round(mobileFloatingQuickOpacity * 100)}%</strong>
              <input
                type="range"
                min="0.25"
                max="1"
                step="0.05"
                value={mobileFloatingQuickOpacity}
                disabled={!mobileFloatingQuickEnabled}
                onChange={(event) => onMobileFloatingQuickOpacityChange?.(Number(event.target.value))}
              />
            </label>
          </div>
        </section>
      )}

      {embedded && (
        <section className="settings-group private-access-settings">
          <div className="private-access-settings__heading">
            <div>
              <span className="settings-group__label">{language === 'zh-CN' ? '私人远程访问' : 'Private remote access'}</span>
              <h3>{language === 'zh-CN' ? '本机运行 · Tailscale 私网' : 'Local host · Tailscale tailnet'}</h3>
            </div>
            <span className="private-access-settings__badge">PRIVATE</span>
          </div>
          <p>{language === 'zh-CN'
            ? 'VOID 网页本体不部署到公网。电脑只监听本机端口，再由 Tailscale Serve 提供仅限你 tailnet 内设备访问的 HTTPS 地址。现有 Supabase 数据同步与 RLS 保持不变。'
            : 'The VOID front end is not deployed publicly. Your computer listens only on localhost, while Tailscale Serve provides an HTTPS address limited to devices in your tailnet. Existing Supabase sync and RLS remain unchanged.'}</p>
          <div className="private-access-settings__steps">
            <code>npm run build</code>
            <code>npm run preview:private</code>
            <code>tailscale serve --bg 4173</code>
          </div>
          <small>{language === 'zh-CN' ? '不要运行 tailscale funnel；Funnel 会公开到互联网。详细步骤见项目中的 PRIVATE_ACCESS.md。' : 'Do not use Tailscale Funnel, which would expose the service publicly. See PRIVATE_ACCESS.md for setup.'}</small>
        </section>
      )}

      <section className={`settings-group evolution-settings-group ${evolutionOpen ? 'evolution-settings-group--open' : ''}`}>
        <button
          type="button"
          className="evolution-settings-toggle"
          onClick={() => setEvolutionOpen((open) => !open)}
          aria-expanded={evolutionOpen}
        >
          <span className="evolution-settings-toggle__icon">◎</span>
          <span>
            <strong>{language === 'zh-CN' ? '版本演化' : 'Version evolution'}</strong>
            <small>{language === 'zh-CN' ? '记录为什么更改、改成了什么，以及实际结果' : 'Record why VOID changed, what replaced it, and the result'}</small>
          </span>
          <em>{versionHistory.length}</em>
          <b>{evolutionOpen ? '−' : '＋'}</b>
        </button>
        {evolutionOpen && (
          <VersionHistoryPanel
            language={language}
            entries={versionHistory}
            onAdd={onAddVersionEntry}
            onUpdate={onUpdateVersionEntry}
            onDelete={onDeleteVersionEntry}
          />
        )}
      </section>

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
          <button type="button" className="secondary-button" onClick={onExportWordAll}>
            ↓ {language === 'zh-CN' ? '导出全部 Word' : 'Export all Word'}
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

      <section className="settings-group cloud-backup-group">
        <div className="settings-group__heading cloud-backup-heading">
          <div>
            <span className="settings-group__label">{language === 'zh-CN' ? '云端历史备份' : 'Cloud backup history'}</span>
            <small>{language === 'zh-CN' ? '自动备份约每30分钟一次，最多保留30个版本' : 'Automatic backups run about every 30 minutes, with up to 30 versions retained'}</small>
          </div>
          <button
            type="button"
            className="secondary-button compact"
            disabled={!isOnline || backupAction !== 'idle' || backupHistoryStatus === 'missing'}
            onClick={() => void runBackupAction(
              onCreateBackup,
              language === 'zh-CN' ? '已创建手动云端备份' : 'Manual cloud backup created',
            )}
          >
            ＋ {backupAction === 'creating'
              ? (language === 'zh-CN' ? '备份中' : 'Saving')
              : (language === 'zh-CN' ? '立即备份' : 'Back up now')}
          </button>
        </div>

        <div className="backup-overwrite-note">
          <strong>{language === 'zh-CN' ? '切换版本会怎样？' : 'What happens when you switch versions?'}</strong>
          <p>
            {language === 'zh-CN'
              ? '打开历史不会修改数据；只有点击“恢复”并再次确认，才会用该版本覆盖当前宇宙、灵感箱、黑洞和语言设置。覆盖前，VOID 会自动保存当前状态为“恢复前保护”备份。'
              : 'Opening history does not change data. Only Restore followed by confirmation replaces the current universe, inbox, black hole, and language. VOID first saves the current state as a pre-restore protection backup.'}
          </p>
        </div>

        {backupHistoryStatus === 'missing' && (
          <div className="backup-state backup-state--warning">
            <strong>{language === 'zh-CN' ? '尚未建立云端备份表' : 'Cloud backup table is not installed'}</strong>
            <p>{language === 'zh-CN' ? '请在 Supabase SQL Editor 重新运行本版本的 supabase/schema.sql。原有宇宙同步仍可继续使用。' : 'Run this version’s supabase/schema.sql again in the Supabase SQL Editor. Existing universe sync continues to work.'}</p>
            <button type="button" className="text-button" onClick={() => void onRefreshBackups()}>
              {language === 'zh-CN' ? '运行 SQL 后重新检测' : 'Check again after running SQL'}
            </button>
          </div>
        )}

        {backupHistoryStatus === 'error' && (
          <div className="backup-state backup-state--warning">
            <strong>{language === 'zh-CN' ? '无法读取备份历史' : 'Unable to load backup history'}</strong>
            <button type="button" className="text-button" onClick={() => void onRefreshBackups()}>
              {language === 'zh-CN' ? '重新加载' : 'Reload'}
            </button>
          </div>
        )}

        {backupHistoryStatus === 'loading' && (
          <div className="backup-state">{language === 'zh-CN' ? '正在读取云端版本…' : 'Loading cloud versions…'}</div>
        )}

        {backupHistoryStatus === 'ready' && backupHistory.length === 0 && (
          <div className="backup-state">
            {language === 'zh-CN' ? '还没有历史版本。点击“立即备份”，或在下一次自动备份后查看。' : 'No historical versions yet. Use Back up now or wait for the next automatic backup.'}
          </div>
        )}

        {backupHistory.length > 0 && (
          <div className="backup-history-list">
            {backupHistory.map((backup) => (
              <article className="backup-history-item" key={backup.id}>
                <div className="backup-history-item__main">
                  <span className={`backup-source backup-source--${backup.source}`}>{sourceLabels[backup.source]}</span>
                  <strong>{formatBackupTime(backup.createdAt, language)}</strong>
                  <small>
                    {language === 'zh-CN'
                      ? `${backup.ideaCount} 个宇宙灵感 · ${backup.inboxCount} 个灵感箱项目 · ${backup.blackHoleCount} 个黑洞项目`
                      : `${backup.ideaCount} universe ideas · ${backup.inboxCount} inbox items · ${backup.blackHoleCount} black-hole items`}
                  </small>
                </div>
                <div className="backup-history-item__actions">
                  <button
                    type="button"
                    className="secondary-button compact"
                    disabled={!isOnline || backupAction !== 'idle'}
                    onClick={() => setRestoreCandidate(backup)}
                  >
                    {language === 'zh-CN' ? '恢复' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className="text-button text-button--danger"
                    disabled={!isOnline || backupAction !== 'idle'}
                    onClick={() => {
                      const confirmed = window.confirm(language === 'zh-CN'
                        ? '永久删除这个历史备份吗？这不会删除当前宇宙，但删除后无法再恢复到此版本。'
                        : 'Permanently delete this historical backup? This does not delete the current universe, but this version cannot be restored afterward.')
                      if (!confirmed) return
                      void runBackupAction(
                        () => onDeleteBackup(backup.id),
                        language === 'zh-CN' ? '历史备份已删除' : 'Historical backup deleted',
                      )
                    }}
                  >
                    {language === 'zh-CN' ? '删除' : 'Delete'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {backupMessage && <p className="backup-feedback backup-feedback--success">{backupMessage}</p>}
        {backupError && <p className="backup-feedback backup-feedback--error">{backupError}</p>}
      </section>

      {restoreCandidate && (
        <div className="backup-restore-dialog" role="dialog" aria-modal="true" aria-label={language === 'zh-CN' ? '恢复云端历史版本' : 'Restore cloud version'}>
          <div className="backup-restore-dialog__card">
            <span className="backup-restore-dialog__icon">↺</span>
            <div>
              <span>{language === 'zh-CN' ? '即将覆盖当前数据' : 'Current data will be replaced'}</span>
              <h3>{formatBackupTime(restoreCandidate.createdAt, language)}</h3>
            </div>
            <p>
              {language === 'zh-CN'
                ? '恢复后，这个历史版本将成为当前宇宙，并覆盖当前的主题结构、灵感箱、黑洞和语言设置。操作开始前，VOID 会先将你现在的数据保存为一个新的“恢复前保护”备份，因此之后仍可切回。历史列表中的其他备份不会被覆盖。'
                : 'This historical version will become the current universe and replace the current structure, inbox, black hole, and language. Before restoring, VOID saves the current data as a new pre-restore protection backup, so you can switch back later. Other historical backups are not overwritten.'}
            </p>
            <div className="backup-restore-dialog__summary">
              <span>{restoreCandidate.ideaCount} {language === 'zh-CN' ? '个宇宙灵感' : 'universe ideas'}</span>
              <span>{restoreCandidate.inboxCount} {language === 'zh-CN' ? '个灵感箱项目' : 'inbox items'}</span>
              <span>{restoreCandidate.blackHoleCount} {language === 'zh-CN' ? '个黑洞项目' : 'black-hole items'}</span>
            </div>
            <div className="backup-restore-dialog__actions">
              <button type="button" className="secondary-button" disabled={backupAction === 'restoring'} onClick={() => setRestoreCandidate(null)}>
                {language === 'zh-CN' ? '取消，不修改数据' : 'Cancel, keep current data'}
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={backupAction === 'restoring'}
                onClick={() => void runBackupAction(
                  async () => {
                    await onRestoreBackup(restoreCandidate.id)
                    setRestoreCandidate(null)
                  },
                  language === 'zh-CN' ? '历史版本已恢复，当前数据已同步' : 'Historical version restored and synced',
                )}
              >
                {backupAction === 'restoring'
                  ? (language === 'zh-CN' ? '正在保护并恢复…' : 'Protecting and restoring…')
                  : (language === 'zh-CN' ? '覆盖当前并恢复此版本' : 'Replace current and restore')}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
