"use client";

import { createContext, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase, initSupabase } from "@/core/supabase/client";
import { bootstrapAuthState } from "@/core/auth/bootstrap.actions";
import {
  validateSessionToken,
  buildUserFromSSOSession,
  buildDbUserFromSSOSession,
  buildRolesFromSSOSession,
} from "@/core/sso-client";

initSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const DEFAULT_AUTH_CONTEXT = Object.freeze({
  authUser: null,
  dbUser: null,
  roles: [],
  loading: true,
});

export const AuthContext = createContext(DEFAULT_AUTH_CONTEXT);

function fallbackUserFromAuth(user) {
  return {
    email: user?.email || "",
    username:
      String(user?.user_metadata?.username || "").trim() ||
      String(user?.email || "").split("@")[0] ||
      "",
    first_name: String(user?.user_metadata?.first_name || "").trim(),
    last_name: String(user?.user_metadata?.last_name || "").trim(),
    phone: "",
    address: "",
    comp_name: "",
    comp_email: "",
    dept_name: "",
    status_name: "",
  };
}

async function fetchBootstrapState() {
  return bootstrapAuthState();
}

function setAccessTokenCookie(session) {
  if (typeof document === "undefined") {
    return;
  }

  if (!session?.access_token) {
    return;
  }

  const maxAge = Number.isFinite(session?.expires_in) ? session.expires_in : 3600;
  document.cookie = `sb-access-token=${encodeURIComponent(session.access_token)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function clearAccessTokenCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = "sb-access-token=; Path=/; Max-Age=0; SameSite=Lax";
}

function buildAuthUserFromBootstrap(payloadAuthUser) {
  if (!payloadAuthUser || typeof payloadAuthUser !== "object") {
    return null;
  }

  return {
    id: payloadAuthUser.id || "",
    email: payloadAuthUser.email || "",
    user_metadata:
      payloadAuthUser.user_metadata && typeof payloadAuthUser.user_metadata === "object"
        ? payloadAuthUser.user_metadata
        : {},
  };
}

export default function AuthProvider({ children }) {
  const [authUser, setAuthUser] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasInitializedRef = useRef(false);
  const lastAuthUserIdRef = useRef(null);
  const lastBootstrapTsRef = useRef(0);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    async function resetAuthState() {
      if (!active) {
        return;
      }

      setAuthUser(null);
      setDbUser(null);
      setRoles([]);
      lastAuthUserIdRef.current = null;
      setLoading(false);
    }

    async function hydrateAuthState(user, options = {}) {
      const background = Boolean(options.background);
      const syncBootstrap = options.syncBootstrap !== false;

      if (!active) {
        return;
      }

      if (!user) {
        await resetAuthState();
        return;
      }

      if (!background) {
        setLoading(true);
      }

      if (!syncBootstrap) {
        setAuthUser((currentAuthUser) => {
          if (!currentAuthUser) {
            return user;
          }

          return {
            ...currentAuthUser,
            ...user,
            user_metadata: user.user_metadata || currentAuthUser.user_metadata || {},
          };
        });

        if (!background) {
          setLoading(false);
        }

        return;
      }

      let resolvedAuthUser = user;
      let resolvedDbUser = fallbackUserFromAuth(user);
      let resolvedRoles = [];

      try {
        const payload = await fetchBootstrapState();

        if (payload?.authUser && typeof payload.authUser === "object") {
          resolvedAuthUser = {
            ...user,
            ...payload.authUser,
            user_metadata: payload.authUser.user_metadata || user.user_metadata || {},
          };
        }

        if (payload?.dbUser && typeof payload.dbUser === "object") {
          resolvedDbUser = payload.dbUser;
        }

        resolvedRoles = Array.isArray(payload?.roles) ? payload.roles : [];
      } catch {
        resolvedAuthUser = user;
        resolvedDbUser = fallbackUserFromAuth(user);
        resolvedRoles = [];
      }

      if (!active) {
        return;
      }

      setAuthUser(resolvedAuthUser);
      setDbUser(resolvedDbUser);
      setRoles(resolvedRoles);
      lastAuthUserIdRef.current = resolvedAuthUser?.id || null;
      lastBootstrapTsRef.current = Date.now();
      if (!background) {
        setLoading(false);
      }
    }

    async function initializeAuth() {
      setLoading(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.access_token) {
          setAccessTokenCookie(sessionData.session);
        }

        const { data, error } = await supabase.auth.getUser();

        if (error || !data?.user) {
          // ── Fallback 1: Try server-side bootstrap (sb-access-token cookie) ──
          try {
            const bootstrapPayload = await fetchBootstrapState();
            const bootstrapAuthUser = buildAuthUserFromBootstrap(bootstrapPayload?.authUser);

            if (bootstrapAuthUser?.id) {
              setAuthUser(bootstrapAuthUser);
              setDbUser(
                bootstrapPayload?.dbUser && typeof bootstrapPayload.dbUser === "object"
                  ? bootstrapPayload.dbUser
                  : fallbackUserFromAuth(bootstrapAuthUser),
              );
              setRoles(Array.isArray(bootstrapPayload?.roles) ? bootstrapPayload.roles : []);
              lastAuthUserIdRef.current = bootstrapAuthUser.id;
              setLoading(false);
              return;
            }
          } catch {
            // Ignore bootstrap fallback failure.
          }

          // ── Fallback 2: Try SSO session (psb_session cookie from Core Portal) ──
          try {
            const ssoSession = await validateSessionToken();
            if (ssoSession?.userId) {
              const ssoUser = buildUserFromSSOSession(ssoSession);
              const ssoDbUser = buildDbUserFromSSOSession(ssoSession);
              const ssoRoles = buildRolesFromSSOSession(ssoSession);

              setAuthUser(ssoUser);
              setDbUser(ssoDbUser);
              setRoles(ssoRoles);
              lastAuthUserIdRef.current = ssoUser.id;
              setLoading(false);
              return;
            }
          } catch {
            // Ignore SSO fallback failure.
          }

          await resetAuthState();
          return;
        }

        await hydrateAuthState(data?.user ?? null);
      } finally {
        hasInitializedRef.current = true;
      }
    }

    initializeAuth();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        setAccessTokenCookie(session);
      } else if (event === "SIGNED_OUT") {
        clearAccessTokenCookie();
      }

      if (!hasInitializedRef.current && event === "INITIAL_SESSION") {
        return;
      }

      const sessionUser = session?.user ?? null;

      if (!sessionUser && event !== "SIGNED_OUT") {
        return;
      }

      // Skip redundant cross-tab events when user hasn't changed
      if (
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        sessionUser?.id &&
        sessionUser.id === lastAuthUserIdRef.current
      ) {
        return;
      }

      hydrateAuthState(sessionUser, {
        background: true,
        syncBootstrap: event !== "TOKEN_REFRESHED",
      });
    });

    // Re-bootstrap roles when the tab regains focus (e.g. after DB changes in admin).
    // Throttled to avoid re-bootstrapping on rapid tab switches.
    const VISIBILITY_THROTTLE_MS = 30_000;

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!hasInitializedRef.current || !lastAuthUserIdRef.current) return;
      if (Date.now() - lastBootstrapTsRef.current < VISIBILITY_THROTTLE_MS) return;

      lastBootstrapTsRef.current = Date.now();
      supabase.auth.getUser().then(({ data: userData }) => {
        if (active && userData?.user) {
          hydrateAuthState(userData.user, { background: true, syncBootstrap: true });
        }
      });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const value = useMemo(
    () => ({
      authUser,
      dbUser,
      roles,
      loading,
    }),
    [authUser, dbUser, roles, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
