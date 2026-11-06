@@
 const scryptAsync = promisify(scrypt);
 const USERS_FILE = new URL("./users.json", import.meta.url);
+const SESSIONS_FILE = new URL("./sessions.json", import.meta.url);
@@
-  const sessions = new Map();
+  const sessions = new Map();
+  // Keep active sessions across process restarts. Store this file privately:
+  // session tokens grant access to chat accounts.
+  try {
+    const saved = JSON.parse(readFileSync(SESSIONS_FILE, "utf8"));
+    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
+      for (const [token, session] of Object.entries(saved)) {
+        if (
+          typeof token === "string" &&
+          session &&
+          typeof session.username === "string" &&
+          Number.isFinite(session.expires) &&
+          session.expires > Date.now()
+        ) {
+          sessions.set(token, session);
+        }
+      }
+    }
+  } catch { /* no saved sessions yet */ }
+
+  const persistSessions = () => {
+    const now = Date.now();
+    for (const [token, session] of sessions) {
+      if (session.expires <= now) sessions.delete(token);
+    }
+    try {
+      writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
+    } catch (e) {
+      console.error("auth: failed to persist sessions:", e.message);
+    }
+  };
+
   const issueToken = (username) => {
     const token = randomBytes(32).toString("hex");
     sessions.set(token, { username, expires: Date.now() + SESSION_TTL_MS });
+    persistSessions();
     return token;
   };
@@
-    if (s.expires < Date.now()) { sessions.delete(token); return null; }
+    if (s.expires <= Date.now()) {
+      sessions.delete(token);
+      persistSessions();
+      return null;
+    }
     return s.username;
   };
@@
     const isSignup = pathname === "/chat/signup" || pathname === "/chat/signup/";
     const isLogin = pathname === "/chat/login" || pathname === "/chat/login/";
     const isLogout = pathname === "/chat/logout" || pathname === "/chat/logout/";
-    if (!isSignup && !isLogin && !isLogout) return false;
+    const isSessionCheck = pathname === "/chat/session" || pathname === "/chat/session/";
+    if (!isSignup && !isLogin && !isLogout && !isSessionCheck) return false;
@@
     if (isLogout) {
-      if (data && data.token) sessions.delete(String(data.token));
+      if (data && data.token) {
+        sessions.delete(String(data.token));
+        persistSessions();
+      }
       send(res, 200, { ok: true });
       return true;
     }
 
+    if (isSessionCheck) {
+      const username = verifyToken(String((data && data.token) || ""));
+      if (!username) {
+        send(res, 401, { ok: false, error: "Session expired." });
+        return true;
+      }
+      send(res, 200, { ok: true, username });
+      return true;
+    }
+
