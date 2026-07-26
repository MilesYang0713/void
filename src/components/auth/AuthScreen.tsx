import { useMemo, useState, type FormEvent } from 'react'
import type { Language } from '../../i18n'

interface AuthScreenProps {
  configured: boolean
  loading?: boolean
  language: Language
  authError?: string | null
  onLanguageChange: (language: Language) => void
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<'signed-in' | 'confirm-email'>
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const MIN_PASSWORD_LENGTH = 8

const COPY = {
  'zh-CN': {
    eyebrow: '个人灵感空间',
    title: '进入你的 VOID',
    subtitle: '使用邮箱作为账户登录。每个账户拥有独立的本地数据与云端空间。',
    signIn: '登录',
    signUp: '注册',
    email: '邮箱账户',
    emailPlaceholder: 'name@example.com',
    password: '密码',
    passwordPlaceholder: '输入密码',
    confirmPassword: '再次输入密码',
    confirmPasswordPlaceholder: '再次输入相同密码',
    submitSignIn: '进入思维宇宙',
    submitSignUp: '创建个人空间',
    working: '正在连接…',
    confirmEmail: '账户已创建，但 Supabase 当前仍开启邮箱验证。你暂时不需要验证功能，请在 Supabase 的 Email Provider 中关闭 Confirm email。',
    loading: '正在恢复账户与本地灵感…',
    setupTitle: '云端尚未配置',
    setupText: '当前构建没有读取到 Supabase 配置。可以使用内置配置，也可以通过环境变量覆盖。',
    setupStep1: '检查 src/lib/supabase.ts 中的默认项目配置',
    setupStep2: '或复制 .env.example 为 .env.local',
    setupStep3: '在 Supabase SQL Editor 运行 supabase/schema.sql',
    setupStep4: '重新运行 npm run dev',
    setupHint: '前端只能使用 Publishable key，不能使用 Secret key 或 service_role key。',
    passwordRulesTitle: '密码必须同时满足：',
    passwordRuleLength: `至少 ${MIN_PASSWORD_LENGTH} 位`,
    passwordRuleLower: '包含小写字母',
    passwordRuleUpper: '包含大写字母',
    passwordRuleNumber: '包含数字',
    passwordRuleSymbol: '包含标点或特殊符号',
    emailInvalid: '请输入格式正确的邮箱，例如 name@example.com。',
    passwordMissing: '请输入密码。',
    passwordInvalid: '密码格式未满足全部要求。',
    confirmMissing: '请再次输入密码。',
    confirmMismatch: '两次输入的密码不一致。',
    invalidCredentials: '邮箱或密码不正确，请检查后重试。',
    userExists: '这个邮箱已经注册，请直接登录。',
    rateLimit: 'Supabase 邮件请求次数已达到限制。你目前不需要邮箱验证，请在后台关闭 Confirm email。',
    emailNotConfirmed: '这个账户尚未完成邮箱确认。你目前不使用验证功能，可在 Supabase 后台关闭 Confirm email。',
    networkError: '无法连接 Supabase，请检查网络、项目地址和 Publishable key。',
    genericError: '登录服务返回错误，请稍后再试。',
  },
  en: {
    eyebrow: 'Personal idea space',
    title: 'Enter your VOID',
    subtitle: 'Use an email address as your account. Each account has isolated local and cloud data.',
    signIn: 'Sign in',
    signUp: 'Register',
    email: 'Email account',
    emailPlaceholder: 'name@example.com',
    password: 'Password',
    passwordPlaceholder: 'Enter password',
    confirmPassword: 'Confirm password',
    confirmPasswordPlaceholder: 'Enter the same password again',
    submitSignIn: 'Enter thought universe',
    submitSignUp: 'Create personal space',
    working: 'Connecting…',
    confirmEmail: 'The account was created, but email confirmation is still enabled in Supabase. Disable Confirm email in the Email Provider settings for the current no-verification setup.',
    loading: 'Restoring your account and local ideas…',
    setupTitle: 'Cloud configuration is missing',
    setupText: 'This build could not find the Supabase settings. Use the bundled defaults or override them with environment variables.',
    setupStep1: 'Check the defaults in src/lib/supabase.ts',
    setupStep2: 'Or copy .env.example to .env.local',
    setupStep3: 'Run supabase/schema.sql in the Supabase SQL Editor',
    setupStep4: 'Restart npm run dev',
    setupHint: 'Only use a Publishable key in the frontend. Never use a Secret or service_role key.',
    passwordRulesTitle: 'The password must include:',
    passwordRuleLength: `At least ${MIN_PASSWORD_LENGTH} characters`,
    passwordRuleLower: 'A lowercase letter',
    passwordRuleUpper: 'An uppercase letter',
    passwordRuleNumber: 'A number',
    passwordRuleSymbol: 'A punctuation or special character',
    emailInvalid: 'Enter a valid email address, such as name@example.com.',
    passwordMissing: 'Enter your password.',
    passwordInvalid: 'The password does not meet every requirement.',
    confirmMissing: 'Enter the password again.',
    confirmMismatch: 'The two passwords do not match.',
    invalidCredentials: 'The email or password is incorrect.',
    userExists: 'This email is already registered. Sign in instead.',
    rateLimit: 'The Supabase email rate limit was reached. Disable Confirm email for the current no-verification setup.',
    emailNotConfirmed: 'This account has not confirmed its email. Disable Confirm email in Supabase for the current setup.',
    networkError: 'Could not reach Supabase. Check the network, project URL, and Publishable key.',
    genericError: 'The authentication service returned an error. Try again.',
  },
} as const

function getPasswordRules(password: string) {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^\p{L}\p{N}\s]/u.test(password),
  }
}

function mapAuthError(message: string | null | undefined, language: Language) {
  if (!message) return null
  const copy = COPY[language]
  const normalized = message.toLowerCase()

  if (normalized.includes('invalid login credentials')) return copy.invalidCredentials
  if (normalized.includes('user already registered') || normalized.includes('already been registered')) return copy.userExists
  if (normalized.includes('email rate limit exceeded') || normalized.includes('rate limit')) return copy.rateLimit
  if (normalized.includes('email not confirmed')) return copy.emailNotConfirmed
  if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('fetch')) return copy.networkError
  return message || copy.genericError
}

export default function AuthScreen({
  configured,
  loading = false,
  language,
  authError,
  onLanguageChange,
  onSignIn,
  onSignUp,
}: AuthScreenProps) {
  const copy = COPY[language]
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [validationVisible, setValidationVisible] = useState(false)

  const normalizedEmail = email.trim().toLowerCase()
  const emailIsValid = EMAIL_PATTERN.test(normalizedEmail)
  const passwordRules = useMemo(() => getPasswordRules(password), [password])
  const strongPassword = Object.values(passwordRules).every(Boolean)
  const passwordsMatch = password.length > 0 && password === confirmPassword
  const visibleAuthError = mapAuthError(authError, language)

  const changeMode = (nextMode: 'signin' | 'signup') => {
    setMode(nextMode)
    setPassword('')
    setConfirmPassword('')
    setLocalError(null)
    setMessage(null)
    setValidationVisible(false)
  }

  const validateLocally = () => {
    setValidationVisible(true)

    if (!emailIsValid) return copy.emailInvalid
    if (!password) return copy.passwordMissing

    if (mode === 'signup') {
      if (!strongPassword) return copy.passwordInvalid
      if (!confirmPassword) return copy.confirmMissing
      if (!passwordsMatch) return copy.confirmMismatch
    }

    return null
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const validationError = validateLocally()
    if (validationError) {
      setLocalError(validationError)
      return
    }

    setSubmitting(true)
    setMessage(null)
    setLocalError(null)

    try {
      if (mode === 'signin') {
        await onSignIn(normalizedEmail, password)
      } else {
        const result = await onSignUp(normalizedEmail, password)
        if (result === 'confirm-email') setMessage(copy.confirmEmail)
      }
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : String(error)
      setLocalError(mapAuthError(rawMessage, language))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <div className="auth-nebula auth-nebula--one" />
      <div className="auth-nebula auth-nebula--two" />
      <div className="auth-stars" />

      <header className="auth-brand">
        <span>悟</span>
        <div><strong>VOID</strong><small>Local-first idea universe</small></div>
      </header>

      <div className="auth-language">
        <button type="button" className={language === 'zh-CN' ? 'is-active' : ''} onClick={() => onLanguageChange('zh-CN')}>简</button>
        <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => onLanguageChange('en')}>EN</button>
      </div>

      {loading ? (
        <section className="auth-card auth-card--loading">
          <span className="auth-loader" />
          <p>{copy.loading}</p>
        </section>
      ) : !configured ? (
        <section className="auth-card auth-card--setup">
          <p className="auth-eyebrow">Cloud foundation</p>
          <h1>{copy.setupTitle}</h1>
          <p className="auth-subtitle">{copy.setupText}</p>
          <ol className="setup-list">
            <li><b>1</b><span>{copy.setupStep1}</span></li>
            <li><b>2</b><span>{copy.setupStep2}</span></li>
            <li><b>3</b><span>{copy.setupStep3}</span></li>
            <li><b>4</b><span>{copy.setupStep4}</span></li>
          </ol>
          <small className="setup-warning">{copy.setupHint}</small>
        </section>
      ) : (
        <section className="auth-card">
          <p className="auth-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="auth-subtitle">{copy.subtitle}</p>

          <div className="auth-tabs">
            <button type="button" className={mode === 'signin' ? 'is-active' : ''} onClick={() => changeMode('signin')}>{copy.signIn}</button>
            <button type="button" className={mode === 'signup' ? 'is-active' : ''} onClick={() => changeMode('signup')}>{copy.signUp}</button>
          </div>

          <form onSubmit={submit} className="auth-form" noValidate>
            <label className={validationVisible && !emailIsValid ? 'has-error' : ''}>
              <span>{copy.email}</span>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setLocalError(null)
                }}
                placeholder={copy.emailPlaceholder}
                autoComplete="email"
                spellCheck={false}
              />
            </label>

            <label className={validationVisible && !password ? 'has-error' : ''}>
              <span>{copy.password}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setLocalError(null)
                }}
                placeholder={copy.passwordPlaceholder}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'signup' && (
              <>
                <div className="password-rules" aria-live="polite">
                  <p>{copy.passwordRulesTitle}</p>
                  <ul>
                    <li className={passwordRules.length ? 'is-valid' : ''}><i>{passwordRules.length ? '✓' : '○'}</i>{copy.passwordRuleLength}</li>
                    <li className={passwordRules.lower ? 'is-valid' : ''}><i>{passwordRules.lower ? '✓' : '○'}</i>{copy.passwordRuleLower}</li>
                    <li className={passwordRules.upper ? 'is-valid' : ''}><i>{passwordRules.upper ? '✓' : '○'}</i>{copy.passwordRuleUpper}</li>
                    <li className={passwordRules.number ? 'is-valid' : ''}><i>{passwordRules.number ? '✓' : '○'}</i>{copy.passwordRuleNumber}</li>
                    <li className={passwordRules.symbol ? 'is-valid' : ''}><i>{passwordRules.symbol ? '✓' : '○'}</i>{copy.passwordRuleSymbol}</li>
                  </ul>
                </div>

                <label className={validationVisible && !passwordsMatch ? 'has-error' : ''}>
                  <span>{copy.confirmPassword}</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value)
                      setLocalError(null)
                    }}
                    placeholder={copy.confirmPasswordPlaceholder}
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}

            {(localError || visibleAuthError) && <div className="auth-message auth-message--error">{localError || visibleAuthError}</div>}
            {message && <div className="auth-message auth-message--success">{message}</div>}

            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? copy.working : mode === 'signin' ? copy.submitSignIn : copy.submitSignUp}
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
