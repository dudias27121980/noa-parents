import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LoginScreen } from './components/LoginScreen';
import { SharedStore } from './sync/store';
import { webSocketTransport } from './sync/transport';
import { Session, clearSession, loadSession, saveSession } from './sync/session';
import { guardSession } from './sync/sessionGuard';
import { useKeepAlive } from './sync/keepAlive';
import './index.css';

/** Login first; then one live connection to the shared server for as long as the session is valid */
function Root() {
  useKeepAlive();
  const [session, setSession] = useState<Session | null>(loadSession);
  const [store, setStore] = useState<SharedStore | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    const s = new SharedStore(webSocketTransport(session.token));
    const unsubscribe = s.subscribe(() => {
      if (s.getView().status === 'unauthorized') {
        // Expired or rejected token (e.g. the access code was changed): back to login
        clearSession();
        setSession(null);
        setMessage('פג תוקף הכניסה - יש להתחבר מחדש');
      }
    });
    s.start();
    const unguard = guardSession(s, session.token);
    setStore(s);
    return () => {
      unguard();
      unsubscribe();
      s.stop();
      setStore(null);
    };
  }, [session]);

  if (!session) {
    return (
      <LoginScreen
        message={message}
        onLogin={(s) => {
          saveSession(s);
          setMessage(null);
          setSession(s);
        }}
      />
    );
  }
  if (!store) return null;
  return (
    <App
      store={store}
      onLogout={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
