import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cancelCodexLogin, getAgentGatewaySnapshot, getCodexLogin, refreshAgentGatewayModels, startCodexLogin, subscribeAgentGateway, type CodexLoginSnapshot } from '@/services/agent-gateway-client';

type LoginView = { scope: string; snapshot: CodexLoginSnapshot; busy: boolean; canceling: boolean; polling: boolean; error: string };
const active = (state: CodexLoginSnapshot['state']) => state === 'starting' || state === 'awaiting_login';
const buttonStyle = { padding: '0.5rem 0.85rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-light)', color: 'var(--text-primary)', fontSize: '0.8rem', cursor: 'pointer' };

export function CodexLoginControls() {
  const gateway = useSyncExternalStore(subscribeAgentGateway, getAgentGatewaySnapshot, getAgentGatewaySnapshot);
  const connectionScope = `${gateway.status}:${gateway.bridgeId ?? ''}`;
  const paired = gateway.status === 'ready' && Boolean(gateway.bridgeId);
  const [view, setView] = useState<LoginView>({ scope: '', snapshot: { state: 'idle' }, busy: false, canceling: false, polling: false, error: '' });
  const epoch = useRef(0), alive = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlight = useRef(false), startInFlight = useRef<string | null>(null), cancelInFlight = useRef<string | null>(null), checkInFlight = useRef<string | null>(null);
  const observed = useRef<{ scope: string; state: CodexLoginSnapshot['state'] } | null>(null);

  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  function connected(scope: string) {
    const latest = getAgentGatewaySnapshot();
    return latest.status === 'ready' && Boolean(latest.bridgeId) && `${latest.status}:${latest.bridgeId ?? ''}` === scope;
  }
  function current(scope: string, requestEpoch: number) { return alive.current && epoch.current === requestEpoch && connected(scope); }
  function accept(snapshot: CodexLoginSnapshot, scope: string) {
    const previous = observed.current;
    if (snapshot.state === 'success' && (previous?.scope !== scope || previous.state !== 'success')) void refreshAgentGatewayModels('codex').catch(() => undefined);
    observed.current = { scope, state: snapshot.state };
    setView({ scope, snapshot, busy: startInFlight.current === scope || cancelInFlight.current === scope || checkInFlight.current === scope, canceling: cancelInFlight.current === scope, polling: active(snapshot.state), error: '' });
  }

  useEffect(() => {
    alive.current = true;
    const requestEpoch = ++epoch.current, scope = connectionScope;
    clearTimer(); observed.current = null;
    setView({ scope, snapshot: { state: 'idle' }, busy: paired, canceling: false, polling: false, error: '' });
    if (paired) void getCodexLogin().then(result => { if (current(scope, requestEpoch)) accept(result, scope); }).catch(() => {
      if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: false, error: 'Could not check Codex sign-in status. Check the gateway connection and try again.' } : v);
    });
    return () => { if (epoch.current === requestEpoch) epoch.current++; clearTimer(); alive.current = false; /* Native sign-in outlives this view; unmount is not logout. */ };
  }, [connectionScope]);

  const currentView = paired && view.scope === connectionScope ? view : null;
  const snapshot = currentView?.snapshot ?? { state: 'idle' as const };
  const busy = currentView ? currentView.busy : paired;
  const isActive = active(snapshot.state);

  useEffect(() => {
    if (!paired || !currentView?.polling || currentView.busy || !isActive) return;
    const scope = connectionScope, requestEpoch = epoch.current;
    async function poll() {
      timer.current = null;
      if (!current(scope, requestEpoch)) return;
      if (pollInFlight.current) { timer.current = setTimeout(() => void poll(), 2000); return; }
      pollInFlight.current = true;
      setView(v => v.scope === scope ? { ...v, busy: true } : v);
      try {
        const result = await getCodexLogin();
        if (current(scope, requestEpoch)) accept(result, scope);
      } catch {
        if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: false, error: 'Could not check Codex sign-in status. The last status is still shown.' } : v);
      } finally { pollInFlight.current = false; }
    }
    timer.current = setTimeout(() => void poll(), 2000);
    return clearTimer;
  }, [connectionScope, paired, currentView?.polling, currentView?.busy, snapshot.state]);

  async function beginLogin() {
    if (!paired || startInFlight.current === connectionScope || busy || isActive) return;
    const scope = connectionScope, requestEpoch = ++epoch.current;
    clearTimer(); observed.current = null; startInFlight.current = scope;
    setView({ scope, snapshot: { state: 'starting' }, busy: true, canceling: false, polling: false, error: '' });
    try { const result = await startCodexLogin(); if (current(scope, requestEpoch)) accept(result, scope); }
    catch { if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, snapshot: { state: 'idle' }, busy: true, polling: false, error: 'Could not start Codex sign-in. Check the gateway connection and try again.' } : v); }
    finally {
      if (startInFlight.current === scope) startInFlight.current = null;
      if (alive.current && connected(scope)) setView(v => v.scope === scope ? { ...v, busy: cancelInFlight.current === scope || checkInFlight.current === scope } : v);
    }
  }

  async function cancelLogin() {
    if (!paired || !isActive || cancelInFlight.current === connectionScope) return;
    const scope = connectionScope, requestEpoch = ++epoch.current;
    clearTimer(); cancelInFlight.current = scope;
    if (checkInFlight.current === scope) checkInFlight.current = null;
    setView(v => v.scope === scope ? { ...v, snapshot: { state: v.snapshot.state }, busy: true, canceling: true, polling: false, error: '' } : v);
    try { const result = await cancelCodexLogin(); if (current(scope, requestEpoch)) accept(result, scope); }
    catch { if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: true, canceling: false, polling: false, error: 'Could not cancel Codex sign-in. Retry or check its status.' } : v); }
    finally {
      if (cancelInFlight.current === scope) cancelInFlight.current = null;
      if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: startInFlight.current === scope || checkInFlight.current === scope, canceling: false } : v);
    }
  }

  async function checkStatus() {
    if (!paired || currentView?.polling || checkInFlight.current === connectionScope || busy) return;
    const scope = connectionScope, requestEpoch = ++epoch.current;
    clearTimer(); checkInFlight.current = scope;
    setView(v => v.scope === scope ? { ...v, busy: true, error: '' } : v);
    try { const result = await getCodexLogin(); if (current(scope, requestEpoch)) accept(result, scope); }
    catch { if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: true, error: 'Could not check Codex sign-in status. Check the gateway connection and try again.' } : v); }
    finally {
      if (checkInFlight.current === scope) checkInFlight.current = null;
      if (current(scope, requestEpoch)) setView(v => v.scope === scope ? { ...v, busy: startInFlight.current === scope || cancelInFlight.current === scope } : v);
    }
  }

  const statusText = !paired ? 'Pair the local agent gateway to sign in.' : busy && snapshot.state === 'starting' ? 'Starting Codex sign-in…' : ({ idle: 'No sign-in is in progress.', starting: 'Codex sign-in is starting.', awaiting_login: 'Codex is waiting for OpenAI sign-in.', success: 'Codex sign-in completed.', failed: 'Codex sign-in failed.', cancelled: 'Codex sign-in was cancelled.' }[snapshot.state]);
  const authUrl = currentView && snapshot.state === 'awaiting_login' ? snapshot.authUrl : undefined;
  return <section style={{ display: 'grid', gap: '0.6rem', color: 'var(--text-primary)' }}>
    <div role="status" aria-live="polite">{statusText}</div>
    {currentView?.error && <div role="alert">{currentView.error}</div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
      <button type="button" style={buttonStyle} disabled={!paired || busy || isActive} onClick={() => void beginLogin()}>Sign in with Codex</button>
      {isActive && <button type="button" style={buttonStyle} disabled={currentView?.canceling} onClick={() => void cancelLogin()}>Cancel sign-in</button>}
      {paired && !currentView?.polling && <button type="button" style={buttonStyle} disabled={busy} onClick={() => void checkStatus()}>Check sign-in status</button>}
    </div>
    {authUrl && <a href={authUrl} target="_blank" rel="noopener noreferrer">Continue to OpenAI</a>}
  </section>;
}
