import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

type Theme = {
  id: string
  nameKey: string
  bg: string
  panel: string
  border: string
  textMain: string
  textMuted: string
  accent: string
  hover: string
}

type CustomTheme = Omit<Theme, 'id' | 'nameKey'>

type SettingsPage = 'theme' | 'language' | 'settingsFile'

type SettingsGroup = {
  id: string
  labelKey: string
  icon: string
  children: Array<{
    id: SettingsPage
    labelKey: string
  }>
}

type SettingsDialogProps = {
  appVersion: string
  customTheme: CustomTheme
  onClose: () => void
  onCustomThemeChange: (theme: CustomTheme) => void
  language: string
  onLanguageChange: (language: string) => void
  onThemeChange: (themeId: string) => void
  themeId: string
  themes: Theme[]
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'appearance',
    labelKey: 'settings.appearance',
    icon: '◐',
    children: [{ id: 'theme', labelKey: 'settings.theme' }]
  },
  {
    id: 'general',
    labelKey: 'settings.general',
    icon: '⚙',
    children: [
      { id: 'language', labelKey: 'settings.language' },
      { id: 'settingsFile', labelKey: 'settings.settingsFile' }
    ]
  }
]

const CUSTOM_COLOR_FIELDS: Array<{
  key: keyof Pick<CustomTheme, 'bg' | 'panel' | 'textMain' | 'accent'>
  labelKey: string
}> = [
  { key: 'bg', labelKey: 'settings.background' },
  { key: 'panel', labelKey: 'settings.panels' },
  { key: 'textMain', labelKey: 'settings.text' },
  { key: 'accent', labelKey: 'settings.accent' }
]

function SettingsDialog({
  appVersion,
  customTheme,
  language,
  onClose,
  onCustomThemeChange,
  onLanguageChange,
  onThemeChange,
  themeId,
  themes
}: SettingsDialogProps) {
  const { t } = useTranslation()
  const [activePage, setActivePage] = useState<SettingsPage>('theme')

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const changeCustomColor = (key: keyof CustomTheme, value: string) => {
    const hover = key === 'accent' ? value : customTheme.hover
    onCustomThemeChange({ ...customTheme, [key]: value, hover })
  }

  const renderThemeSettings = () => (
    <>
      <div className="settings-page-heading">
        <span className="settings-eyebrow">{t('settings.appearance')}</span>
        <h3>{t('settings.theme')}</h3>
        <p>{t('settings.themeDescription')}</p>
      </div>

      <div className="theme-grid">
        {themes.map((theme) => (
          <button
            className={`theme-card ${themeId === theme.id ? 'active' : ''}`}
            key={theme.id}
            onClick={() => onThemeChange(theme.id)}
            type="button"
          >
            <span className="theme-preview" style={{ background: theme.bg }}>
              <span style={{ background: theme.panel }} />
              <span style={{ background: theme.accent }} />
            </span>
            <span className="theme-card-label">
              <span>{t(`themes.${theme.nameKey}`)}</span>
              {themeId === theme.id && <span className="settings-check">✓</span>}
            </span>
          </button>
        ))}

        <button
          className={`theme-card ${themeId === 'custom' ? 'active' : ''}`}
          onClick={() => onThemeChange('custom')}
          type="button"
        >
          <span className="theme-preview" style={{ background: customTheme.bg }}>
            <span style={{ background: customTheme.panel }} />
            <span style={{ background: customTheme.accent }} />
          </span>
          <span className="theme-card-label">
            <span>{t('app.customTheme')}</span>
            {themeId === 'custom' && <span className="settings-check">✓</span>}
          </span>
        </button>
      </div>

      {themeId === 'custom' && (
        <section className="custom-theme-editor">
          <div>
            <h4>{t('settings.customColors')}</h4>
            <p>{t('settings.customColorsDescription')}</p>
          </div>
          <div className="custom-color-grid">
            {CUSTOM_COLOR_FIELDS.map((field) => (
              <label className="custom-color-field" key={field.key}>
                <input
                  type="color"
                  value={customTheme[field.key]}
                  onChange={(event) => changeCustomColor(field.key, event.target.value)}
                />
                <span>
                  <strong>{t(field.labelKey)}</strong>
                  <small>{customTheme[field.key]}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}
    </>
  )

  const renderLanguageSettings = () => (
    <>
      <div className="settings-page-heading">
        <span className="settings-eyebrow">{t('settings.general')}</span>
        <h3>{t('settings.language')}</h3>
        <p>{t('settings.languageDescription')}</p>
      </div>

      <div className="language-options">
        {['es', 'en'].map((languageCode) => {
          const isActive = language === languageCode
          return (
            <button
              className={`language-option ${isActive ? 'active' : ''}`}
              key={languageCode}
              onClick={() => onLanguageChange(languageCode)}
              type="button"
            >
              <span className="language-code">{languageCode.toUpperCase()}</span>
              <span>
                <strong>{t(languageCode === 'es' ? 'app.spanish' : 'app.english')}</strong>
                <small>{t(`settings.${languageCode}Language`)}</small>
              </span>
              {isActive && <span className="settings-check">✓</span>}
            </button>
          )
        })}
      </div>
    </>
  )

  const renderSettingsFile = () => (
    <>
      <div className="settings-page-heading">
        <span className="settings-eyebrow">{t('settings.general')}</span>
        <h3>{t('settings.settingsFile')}</h3>
        <p>{t('settings.settingsFileDescription')}</p>
      </div>

      <section className="settings-file-card">
        <span className="settings-file-icon">{'{ }'}</span>
        <div>
          <strong>settings.json</strong>
          <p>{t('settings.settingsFileHint')}</p>
        </div>
        {window.electronAPI && (
          <button onClick={() => window.electronAPI.openSettingsFolder()} type="button">
            {t('settings.openSettingsFolder')}
          </button>
        )}
      </section>
    </>
  )

  const renderActivePage = () => {
    if (activePage === 'theme') {
      return renderThemeSettings()
    }
    if (activePage === 'language') {
      return renderLanguageSettings()
    }
    return renderSettingsFile()
  }

  return createPortal(
    <div className="settings-backdrop" onMouseDown={onClose}>
      <div
        aria-label={t('settings.title')}
        aria-modal="true"
        className="settings-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <aside className="settings-navigation">
          <div className="settings-navigation-header">
            <span className="settings-logo">W</span>
            <div>
              <h2>{t('settings.title')}</h2>
              <span>Wooly Wonder</span>
            </div>
          </div>

          <nav aria-label={t('settings.navigation')} className="settings-tree">
            {SETTINGS_GROUPS.map((group) => (
              <div className="settings-tree-group" key={group.id}>
                <div className="settings-tree-parent">
                  <span>{group.icon}</span>
                  {t(group.labelKey)}
                </div>
                <div className="settings-tree-children">
                  {group.children.map((child) => (
                    <button
                      aria-current={activePage === child.id ? 'page' : undefined}
                      className={activePage === child.id ? 'active' : ''}
                      key={child.id}
                      onClick={() => setActivePage(child.id)}
                      type="button"
                    >
                      {t(child.labelKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {appVersion && <span className="settings-version">Wooly Wonder v{appVersion}</span>}
        </aside>

        <section className="settings-content">
          <button
            aria-label={t('settings.close')}
            className="settings-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
          <div className="settings-content-scroll">
            {renderActivePage()}
          </div>
        </section>
      </div>
    </div>,
    document.body
  )
}

export default SettingsDialog
