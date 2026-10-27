import { useState, type FormEvent } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, GitBranch,
  KeyRound, LockKeyhole, Mail, Network, ShieldCheck, Sparkles, UserRound, Workflow, XCircle,
} from 'lucide-react';
import { authApi, type AuthSession } from '../api/auth';

type AuthMode = 'signin' | 'signup' | 'reset';
type Props = { onAuthenticated: (session: AuthSession) => void };

export default function AuthScreen({ onAuthenticated }: Props) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('demo@agentdesk.dev');
  const [password, setPassword] = useState('demo1234');
  const [confirmPassword, setConfirmPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setError('');
    setNotice('');
    if (next === 'signup') { setEmail(''); setPassword(''); setConfirmPassword(''); setRememberMe(true); }
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (mode === 'signup') {
      if (fullName.trim().length < 2) { setError('Enter your full name.'); return; }
      if (password.length < 8) { setError('Use at least 8 characters for the password.'); return; }
      if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'reset') {
        await authApi.requestPasswordReset(email);
        setNotice('If an account exists for this email, password reset instructions are on their way.');
      } else if (mode === 'signup') {
        const session = await authApi.signUp({ full_name: fullName, email, password }, rememberMe);
        onAuthenticated(session);
      } else {
        const session = await authApi.signIn(email, password, rememberMe);
        onAuthenticated(session);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const isSignUp = mode === 'signup';
  const isReset = mode === 'reset';
  const title = isReset ? 'Reset your password' : isSignUp ? 'Create your workspace' : 'Welcome back';
  const subtitle = isReset
    ? 'We’ll send you instructions to get back into your account.'
    : isSignUp ? 'Start building workflows that explain themselves.' : 'Sign in to continue to your workflow studio.';

  return (
    <main className="auth-shell">
      <section className="auth-showcase" aria-label="AgentDesk overview">
        <div className="auth-showcase-glow auth-glow-one" />
        <div className="auth-showcase-glow auth-glow-two" />
        <div className="auth-brand">
          <div className="auth-brand-mark"><Network size={22} strokeWidth={2.3} /></div>
          <span>agentdesk</span><span className="auth-brand-divider" /><small>WORKFLOW STUDIO</small>
        </div>
        <div className="auth-hero-copy">
          <div className="auth-pill"><Sparkles size={13} /> AI workflows, without the guesswork</div>
          <h1>Build flows.<br /><span>Debug every step.</span></h1>
          <p>Design AI workflows visually and see exactly what happened when something goes wrong.</p>
        </div>
        <div className="auth-trace-preview">
          <div className="auth-preview-top">
            <div><span className="auth-preview-dot" /><span className="auth-preview-dot" /><span className="auth-preview-dot" /></div>
            <span className="auth-preview-title"><Activity size={13} /> LAST EXECUTION TRACE</span>
            <span className="auth-preview-status"><XCircle size={12} /> Failed</span>
          </div>
          <div className="auth-preview-flow">
            <div className="auth-mini-node success"><span><CheckCircle2 size={13} /></span><div><strong>Incoming request</strong><small>Input · 12 ms</small></div><b>OK</b></div>
            <div className="auth-mini-connector"><span /></div>
            <div className="auth-mini-node success"><span><Sparkles size={13} /></span><div><strong>Incident analyst</strong><small>LLM · 1.24 s · 842 tokens</small></div><b>OK</b></div>
            <div className="auth-mini-connector is-error"><span /></div>
            <div className="auth-mini-node failed"><span><GitBranch size={13} /></span><div><strong>Search logs</strong><small>TOOL_TIMEOUT · attempt 2</small></div><b>ERR</b></div>
          </div>
          <div className="auth-preview-detail"><div className="auth-preview-detail-icon"><LockKeyhole size={14} /></div><div><strong>Root cause identified</strong><p>Tool exceeded its 15s execution timeout. Stack trace and input snapshot are available.</p></div></div>
        </div>
        <div className="auth-feature-row">
          <div><span><Workflow size={15} /></span><strong>Visual builder</strong><small>Compose with nodes</small></div>
          <div><span><Activity size={15} /></span><strong>Deep traces</strong><small>Understand every run</small></div>
          <div><span><ShieldCheck size={15} /></span><strong>Built-in limits</strong><small>Control each agent</small></div>
        </div>
        <div className="auth-showcase-footer"><span>© 2026 AgentDesk</span><span><span className="auth-online-dot" /> Systems operational</span></div>
      </section>

      <section className="auth-form-side">
        <div className="auth-mobile-brand"><div className="auth-brand-mark"><Network size={20} /></div><span>agentdesk</span></div>
        <div className="auth-form-wrap">
          <div className="auth-form-heading">
            <span className="auth-eyebrow">{isReset ? 'ACCOUNT RECOVERY' : isSignUp ? 'GET STARTED' : 'YOUR WORKSPACE'}</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          {!isReset && <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={!isSignUp} className={!isSignUp ? 'active' : ''} onClick={() => changeMode('signin')}>Sign in</button>
            <button type="button" role="tab" aria-selected={isSignUp} className={isSignUp ? 'active' : ''} onClick={() => changeMode('signup')}>Create account</button>
          </div>}

          {error && <div className="auth-alert error"><XCircle size={16} /><span>{error}</span></div>}
          {notice && <div className="auth-alert success"><CheckCircle2 size={16} /><span>{notice}</span></div>}

          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            {isSignUp && <label className="auth-field"><span>Full name</span><div className="auth-input-wrap"><UserRound size={17} /><input autoComplete="name" placeholder="Ilya Grebenshchikov" value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} /></div></label>}
            <label className="auth-field"><span>Email address</span><div className="auth-input-wrap"><Mail size={17} /><input type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></label>
            {!isReset && <label className="auth-field"><span>Password</span><div className="auth-input-wrap"><KeyRound size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={isSignUp ? 8 : undefined} /><button className="auth-password-toggle" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>}
            {isSignUp && <label className="auth-field"><span>Confirm password</span><div className="auth-input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} /></div></label>}
            {!isSignUp && !isReset && <div className="auth-form-options"><label className="auth-checkbox"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /><span className="auth-custom-check" />Remember me</label><button type="button" className="auth-text-button" onClick={() => changeMode('reset')}>Forgot password?</button></div>}
            {isReset && <p className="auth-reset-note">For this demo, the reset request is simulated. The API adapter is ready for a real recovery endpoint.</p>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? <span className="auth-spinner" /> : isReset ? <Mail size={17} /> : isSignUp ? <ArrowRight size={17} /> : <LockKeyhole size={16} />}<span>{busy ? (isReset ? 'Sending request…' : 'Please wait…') : isReset ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in to AgentDesk'}</span><ArrowRight className="auth-submit-arrow" size={16} /></button>
          </form>

          {mode === 'signin' && <div className="auth-demo-box"><div className="auth-demo-symbol"><Sparkles size={17} /></div><div><strong>Try the interactive demo</strong><p>Use the pre-filled credentials to explore the workflow builder.</p><div className="auth-demo-creds"><span>demo@agentdesk.dev</span><code>demo1234</code></div></div><button type="button" onClick={() => { setEmail('demo@agentdesk.dev'); setPassword('demo1234'); setError(''); }} aria-label="Use demo credentials"><ArrowRight size={16} /></button></div>}

          {isReset && <button type="button" className="auth-back-button" onClick={() => changeMode('signin')}><ArrowLeft size={15} /> Back to sign in</button>}
          <div className="auth-terms">By continuing, you agree to our <button type="button" onClick={() => setNotice('Terms of service are a demo placeholder for this MVP.')}>Terms of Service</button> and <button type="button" onClick={() => setNotice('Privacy policy is a demo placeholder for this MVP.')}>Privacy Policy</button>.</div>
        </div>
        <div className="auth-security-note"><ShieldCheck size={14} /><span>Secure authentication flow · Mock-backed in demo mode</span></div>
      </section>
    </main>
  );
}
