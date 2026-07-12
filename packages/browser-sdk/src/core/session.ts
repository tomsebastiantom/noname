const SESSION_KEY = "noname_session";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_STORED_SESSIONS = 5;

interface SessionData {
  id: string;
  startedAt: number;
  lastActivity: number;
}

export function getOrCreateSession(): SessionData {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      const sessions: SessionData[] = JSON.parse(stored);
      const current = sessions[sessions.length - 1];
      if (current && Date.now() - current.lastActivity < SESSION_TIMEOUT_MS) {
        return current;
      }
    }
  } catch {
    // sessionStorage unavailable or corrupt
  }

  const session: SessionData = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    lastActivity: Date.now(),
  };

  persistSession(session);
  return session;
}

export function touchSession(session: SessionData): void {
  session.lastActivity = Date.now();
  persistSession(session);
}

function persistSession(session: SessionData): void {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    let sessions: SessionData[] = stored ? JSON.parse(stored) : [];

    const idx = sessions.findIndex((s) => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
      if (sessions.length > MAX_STORED_SESSIONS) {
        sessions = sessions.slice(-MAX_STORED_SESSIONS);
      }
    }

    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  } catch {
    // sessionStorage unavailable
  }
}
