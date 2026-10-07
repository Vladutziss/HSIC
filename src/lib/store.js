// Persistence. In a claude.ai artifact the data lives in the artifact's
// database under data/users/<id>/ (private to each person); elsewhere it falls
// back to localStorage, and failing that it lasts for the session only.
//
//   data/users/<id>/state      habits, log, reviews (scores), to-dos, settings
//   data/users/<id>/m-YYYY-MM  proofs with their story fragments, review texts

import { useCallback, useEffect, useRef, useState } from "react";
import { capability, inViewer } from "./platform.js";
import { getClient } from "./supabase.js";
import * as remote from "./remote.js";

const PREFIX = "momentum2:";
const LEGACY_LOCAL_KEY = "momentum-habits-v1"; // the first version of the app
const NONE = Symbol("none");
export const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

function localRead(key) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return { ok: true, value: raw ? JSON.parse(raw) : null };
  } catch {
    return { ok: false, value: null };
  }
}
function localWrite(key, value) {
  try {
    if (value == null) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withRetry = (fn) => async (doc) => {
  try {
    await fn(doc);
  } catch (e) {
    if (!e || e.code !== "unavailable") throw e;
    await sleep(700 + Math.random() * 800);
    await fn(doc);
  }
};

// Debounced saves, one write in flight per document.
function makeWriter(save, onStatus) {
  let timer = null;
  let pending = NONE;
  let queue = Promise.resolve();
  let version = 0;
  let saved = 0;
  const flush = () => {
    if (pending === NONE) return queue;
    const doc = pending;
    const v = version;
    pending = NONE;
    onStatus("saving");
    queue = queue
      .then(() => save(doc))
      .then(() => {
        saved = Math.max(saved, v);
        if (saved >= version) onStatus("saved");
      })
      .catch((e) => {
        saved = Math.max(saved, v);
        onStatus(e && e.code === "invalid_argument" ? "readonly" : "error");
      });
    return queue;
  };
  return {
    schedule(doc, delay = 400) {
      pending = doc;
      version++;
      clearTimeout(timer);
      timer = setTimeout(flush, delay);
    },
    get dirty() {
      return saved < version;
    },
    flush() {
      clearTimeout(timer);
      return flush();
    },
  };
}

export function useAppStore() {
  const [state, setState] = useState(undefined); // undefined while loading, null before onboarding
  const [mode, setMode] = useState("loading"); // cloud | local | memory
  const [saveStatus, setSaveStatus] = useState("saved");
  const [months, setMonths] = useState({});
  const [legacy, setLegacy] = useState(null); // data from the first version of the app, offered for import
  const env = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let unsub = null;

    const useLocal = (extra = {}) => {
      const r = localRead("state");
      const e = { kind: r.ok ? "local" : "memory", writers: {}, monthCache: {}, ...extra };
      e.stateWriter = makeWriter(async (doc) => {
        if (e.kind === "local" && !localWrite("state", doc)) throw { code: "local_full" };
      }, setSaveStatus);
      e.data = r.value;
      env.current = e;
      setState(r.value);
      setMode(e.kind);
      if (!r.value) {
        try {
          const old = window.localStorage.getItem(LEGACY_LOCAL_KEY);
          if (old) setLegacy(JSON.parse(old));
        } catch {
          /* nothing to import */
        }
      }
    };

    const checkLegacy = () => {
      try {
        const old = window.localStorage.getItem(LEGACY_LOCAL_KEY);
        if (old) setLegacy(JSON.parse(old));
      } catch {
        /* nothing to import */
      }
    };

    // Supabase: the normal web build. Rows in Postgres, synced between devices.
    const useSupabase = async (client) => {
      const { data } = await client.auth.getSession();
      const authUser = data.session?.user;
      if (!authUser) return useLocal();
      const uid = authUser.id;
      const meta = authUser.user_metadata || {};
      const e = {
        kind: "supabase",
        client,
        uid,
        writers: {},
        monthCache: {},
        monthSaved: {}, // month documents as last read from / written to the database
        data: null,
        saved: null, // the state the database holds, for diffing
        user: { id: async () => uid, name: async () => meta.full_name || meta.name || "" },
      };
      e.stateWriter = makeWriter(async (doc) => {
        await remote.applyOps(client, remote.diff(e.saved, doc, uid));
        e.saved = clone(doc);
      }, setSaveStatus);

      let first;
      try {
        first = await remote.loadState(client, uid);
      } catch {
        setSaveStatus("error");
        return useLocal();
      }
      if (cancelled) return undefined;
      e.data = first;
      e.saved = clone(first);
      env.current = e;
      setState(first);
      setMode("supabase");
      if (!first) checkLegacy();

      // pick up changes made on another device (never while there are unsaved local edits)
      let busy = false;
      const refresh = async () => {
        if (cancelled || busy || e.stateWriter.dirty) return;
        busy = true;
        try {
          const fresh = await remote.loadState(client, uid);
          if (cancelled || e.stateWriter.dirty) return;
          const same = fresh && e.data ? remote.diff(e.data, fresh, uid).length === 0 : fresh === e.data;
          if (!same) {
            e.data = fresh;
            e.saved = clone(fresh);
            setState(fresh);
          }
        } catch {
          /* offline: try again later */
        } finally {
          busy = false;
        }
      };
      let timer = null;
      const soon = () => {
        clearTimeout(timer);
        timer = setTimeout(refresh, 700);
      };
      const channel = client.channel(`state-${uid}`);
      for (const table of ["profiles", "habits", "completions", "todos", "day_reviews"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: table === "profiles" ? `id=eq.${uid}` : `user_id=eq.${uid}` }, soon);
      }
      channel.subscribe();
      // Realtime cannot filter DELETE events, so a slow poll and a refresh on focus cover those
      const poll = setInterval(() => document.visibilityState === "visible" && refresh(), 45000);
      const onVisible = () => document.visibilityState === "visible" && refresh();
      document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearTimeout(timer);
        clearInterval(poll);
        document.removeEventListener("visibilitychange", onVisible);
        client.removeChannel(channel);
      };
    };

    (async () => {
      const sb = inViewer() ? null : await getClient();
      if (cancelled) return;
      if (sb) {
        const cleanup = await useSupabase(sb);
        if (cancelled && cleanup) cleanup();
        else unsub = cleanup || null;
        return;
      }
      const [db, user, assets] = await Promise.all([capability("db"), capability("user"), capability("assets")]);
      let uid = null;
      try {
        uid = user ? await user.id() : null;
      } catch {
        uid = null;
      }
      if (cancelled) return;
      if (!db || !uid) return useLocal({ user });

      const stateRef = db.doc(`data/users/${uid}/state`);
      const e = {
        kind: "cloud",
        db,
        uid,
        user,
        assets,
        stateRef,
        monthRef: (ym) => db.doc(`data/users/${uid}/m-${ym}`),
        writers: {},
        monthCache: {},
        data: null,
      };
      e.stateWriter = makeWriter(withRetry((doc) => (doc == null ? stateRef.delete() : stateRef.set(doc))), setSaveStatus);
      env.current = e;
      let first = true;
      unsub = stateRef.onSnapshot(
        (snap) => {
          // ignore echoes of our own writes while edits are still unsaved
          if (!first && (e.stateWriter.dirty || snap.metadata?.hasPendingWrites)) return;
          first = false;
          const data = snap.exists ? clone(snap.data()) : null;
          e.data = data;
          setState(data);
          setMode("cloud");
          if (!data && !e.legacyChecked) {
            e.legacyChecked = true;
            db.doc(`data/users/${uid}/momentum`)
              .get()
              .then((old) => old.exists && setLegacy(clone(old.data())))
              .catch(() => {});
          }
        },
        () => {
          if (first) {
            first = false;
            useLocal({ user });
          }
        }
      );
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  /** update(fn): fn receives a copy of the data and returns the new data. */
  const update = useCallback((fn) => {
    const e = env.current;
    if (!e) return;
    const next = fn(e.data == null ? null : clone(e.data));
    e.data = next;
    setState(next);
    e.stateWriter.schedule(next);
  }, []);

  const monthWriter = (e, ym) => {
    if (!e.writers[ym]) {
      e.writers[ym] = makeWriter(
        e.kind === "cloud"
          ? withRetry((doc) => (doc == null ? e.monthRef(ym).delete() : e.monthRef(ym).set(doc)))
          : e.kind === "supabase"
            ? async (doc) => {
                // diff against what the database really holds, so rows written elsewhere are never lost
                if (e.monthSaved[ym] === undefined) e.monthSaved[ym] = await remote.loadMonth(e.client, e.uid, ym);
                await remote.applyOps(e.client, remote.diffMonth(e.monthSaved[ym], doc, e.uid));
                e.monthSaved[ym] = clone(doc);
              }
            : async (doc) => {
                if (e.kind === "local" && !localWrite(`m-${ym}`, doc)) throw { code: "local_full" };
              },
        e.kind === "supabase" ? setSaveStatus : () => {}
      );
    }
    return e.writers[ym];
  };

  const loadMonth = useCallback(async (ym) => {
    const e = env.current;
    if (!e) return null;
    if (e.monthCache[ym] !== undefined) return e.monthCache[ym];
    let doc = null;
    if (e.kind === "cloud") {
      try {
        const snap = await e.monthRef(ym).get();
        doc = snap.exists ? clone(snap.data()) : null;
      } catch {
        doc = null;
      }
    } else if (e.kind === "supabase") {
      try {
        doc = await remote.loadMonth(e.client, e.uid, ym);
        e.monthSaved[ym] = clone(doc);
      } catch {
        // not cached: an empty month must never be mistaken for a loaded one
        setSaveStatus("error");
        return undefined;
      }
    } else if (e.kind === "local") doc = localRead(`m-${ym}`).value;
    if (e.monthCache[ym] === undefined) e.monthCache[ym] = doc;
    setMonths((m) => ({ ...m, [ym]: e.monthCache[ym] }));
    return e.monthCache[ym];
  }, []);

  const updateMonth = useCallback(
    async (ym, fn) => {
      const e = env.current;
      if (!e) return;
      if (e.monthCache[ym] === undefined) await loadMonth(ym);
      if (e.monthCache[ym] === undefined) return; // the month could not be read: do not overwrite it
      const next = fn(clone(e.monthCache[ym]) || { proofs: [], reviews: {} });
      e.monthCache[ym] = next;
      setMonths((m) => ({ ...m, [ym]: next }));
      monthWriter(e, ym).schedule(next, 150);
    },
    [loadMonth]
  );

  /** Seeds several month documents at once (demo data). */
  const putMonths = useCallback((docs) => {
    const e = env.current;
    if (!e) return;
    for (const [ym, doc] of Object.entries(docs)) {
      e.monthCache[ym] = doc;
      monthWriter(e, ym).schedule(doc, 50);
    }
    setMonths((m) => ({ ...m, ...docs }));
  }, []);

  const wipe = useCallback(async (monthKeys = []) => {
    const e = env.current;
    if (!e) return;
    if (e.kind === "supabase") {
      await Promise.allSettled([e.stateWriter.flush(), ...Object.values(e.writers).map((w) => w.flush())]);
      await removeAllFiles(e);
      for (const t of ["proofs", "chapters", "day_reviews", "streak_revives", "todos", "habits"]) await e.client.from(t).delete().eq("user_id", e.uid);
      await e.client.from("profiles").update(remote.EMPTY_PROFILE).eq("id", e.uid);
      e.monthCache = {};
      e.monthSaved = {};
      e.writers = {};
      e.data = null;
      e.saved = null;
      setMonths({});
      setState(null);
      return;
    }
    for (const ym of monthKeys) {
      e.monthCache[ym] = null;
      monthWriter(e, ym).schedule(null, 0);
    }
    setMonths({});
    e.data = null;
    setState(null);
    e.stateWriter.schedule(null, 0);
  }, []);

  return { state, mode, saveStatus, months, legacy, update, loadMonth, updateMonth, wipe, env };
}

// ------------------------------------------------------------ uploads

const FILE_EXT = { "image/jpeg": "jpg", "video/webm": "webm", "video/mp4": "mp4", "audio/webm": "webm", "audio/mp4": "mp4" };

/** Deletes every file the user stored (called before wiping data or the account; SQL cannot remove stored objects). */
export async function removeAllFiles(e) {
  const bucket = e.client.storage.from("proofs");
  for (;;) {
    const { data } = await bucket.list(e.uid, { limit: 100 });
    if (!data?.length) return;
    const { error } = await bucket.remove(data.map((f) => `${e.uid}/${f.name}`));
    if (error) return;
  }
}

/**
 * Stores a proof file and returns the id the proof record keeps: an artifact
 * asset id, or in Supabase mode a path in the private `proofs` bucket.
 */
export async function uploadAsset(env, blob, type) {
  const e = env?.current;
  if (e?.kind === "supabase") {
    const path = `${e.uid}/${crypto.randomUUID()}.${FILE_EXT[type] || "bin"}`;
    const { error } = await e.client.storage.from("proofs").upload(path, blob, { contentType: type });
    return error ? null : path;
  }
  const assets = e?.assets;
  if (!assets) return null;
  try {
    const res = await assets.upload(blob, type ? { type } : undefined);
    return res?.id || null;
  } catch (e) {
    if (e && e.code === "store_unavailable") {
      try {
        await sleep(800);
        const res = await assets.upload(blob, type ? { type } : undefined);
        return res?.id || null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export const assetUrl = (id) => (id ? "/_blob/" + id : null);
