// Groups and progress partners. In a claude.ai artifact they are shared
// documents everyone who can open the app can see:
//   groups/<gid>                 {name, code, kind, owner, createdAt}
//   groups/<gid>/members/<uid>   public stats each member publishes for themselves
//   groups/<gid>/nudges/<nid>    reminders: {from, to: [uid], text, at, read: {uid: true}}
// Without the database a demo group with simulated members stands in.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, mondayOf } from "./dates.js";
import { levelInfo } from "./engine.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
const newId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const NUDGE_TEMPLATES = [
  "Hai că poți! Fă azi măcar misiunea cea mai ușoară.",
  "Ne vedem diseară la raport. Nu-ți lăsa personajul să adoarmă!",
  "Am terminat ce aveam azi. Rândul tău!",
  "Mâine dimineață facem împreună?",
];

// ------------------------------------------------------------ demo group

function seeded(seed) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function demoGroup(me, today) {
  const rnd = seeded([...today].reduce((a, c) => a + c.charCodeAt(0), 0));
  const base = Math.max(120, me.weekGain || 300);
  const mk = (id, nick, path, stage, factor, streak, mood = "idle") => {
    const weekGain = Math.round(base * factor * (0.9 + rnd() * 0.2));
    const momentum = Math.round((me.momentum || 400) * factor * (0.85 + rnd() * 0.3));
    const lvl = levelInfo(momentum);
    return { id, nick, path, stage, mood, weekGain, momentum, level: lvl.lvl, levelName: lvl.name, streak, todayDone: Math.round(rnd() * 3), todayTotal: 4, demo: true };
  };
  const members = [
    mk("demo-ana", "Ana", "sport", "adept", 1.18, 12),
    mk("demo-ioana", "Ioana", "minte", "master", 1.42, 23, "happy"),
    mk("demo-mihai", "Mihai", "studiu", "apprentice", 0.82, 4),
    mk("demo-radu", "Radu", "bani", "hatchling", 0.38, 0, "sleep"),
  ];
  return {
    id: "demo",
    demo: true,
    info: { name: "Clubul de dimineață", code: "DEMO42", kind: "group" },
    members,
    startInbox: [
      {
        id: "demo-n1",
        from: "demo-ana",
        text: "Hai că poți! Ne vedem diseară la raport.",
        at: `${addDays(today, 0)}T08:12:00`,
        read: false,
      },
    ],
  };
}

// ------------------------------------------------------------ hook

export function useGroups({ store, state, update, myStats, today }) {
  const env = store.env.current;
  const cloud = store.mode === "cloud" && env?.db && env?.uid;
  const myId = cloud ? env.uid : "me";
  const gids = state?.groups || [];
  const [infos, setInfos] = useState({});
  const [members, setMembers] = useState({});
  const [inbox, setInbox] = useState({});
  const [sent, setSent] = useState({});
  const [profiles, setProfiles] = useState({});
  const [demoInbox, setDemoInbox] = useState(null);
  const [demoSent, setDemoSent] = useState([]);
  const published = useRef({});

  // subscriptions to the real groups
  const key = gids.join(",");
  useEffect(() => {
    if (!cloud || !gids.length) return undefined;
    const db = env.db;
    const unsubs = [];
    for (const gid of gids) {
      db.doc(`groups/${gid}`)
        .get()
        .then((snap) => setInfos((m) => ({ ...m, [gid]: snap.exists ? snap.data() : { missing: true } })))
        .catch(() => {});
      unsubs.push(
        db.collection(`groups/${gid}/members`).onSnapshot(
          (qs) => setMembers((m) => ({ ...m, [gid]: qs.docs.map((d) => ({ id: d.id, ...d.data() })) })),
          () => {}
        )
      );
      unsubs.push(
        db
          .collection(`groups/${gid}/nudges`)
          .where("to", "array-contains", env.uid)
          .onSnapshot(
            (qs) => setInbox((m) => ({ ...m, [gid]: qs.docs.map((d) => ({ id: d.id, ...d.data() })) })),
            () => {}
          )
      );
      unsubs.push(
        db
          .collection(`groups/${gid}/nudges`)
          .where("from", "==", env.uid)
          .onSnapshot(
            (qs) => setSent((m) => ({ ...m, [gid]: qs.docs.map((d) => ({ id: d.id, ...d.data() })) })),
            () => {}
          )
      );
    }
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, key]);

  // names of the people on screen, resolved for this viewer
  const memberIds = useMemo(() => Object.values(members).flat().map((m) => m.id), [members]);
  useEffect(() => {
    if (!cloud || !env.user || !memberIds.length) return;
    let alive = true;
    env.user
      .profiles(memberIds)
      .then((ps) => alive && setProfiles(ps || {}))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, memberIds.join(",")]);

  // publish my public stats to each group (only when they change)
  const statsJson = JSON.stringify(myStats || {});
  useEffect(() => {
    if (!cloud || !gids.length || !myStats) return undefined;
    const t = setTimeout(() => {
      for (const gid of gids) {
        if (published.current[gid] === statsJson) continue;
        published.current[gid] = statsJson;
        env.db
          .doc(`groups/${gid}/members/${env.uid}`)
          .set({ ...myStats, updatedAt: new Date().toISOString() })
          .catch(() => {
            published.current[gid] = null;
          });
      }
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, key, statsJson]);

  const demo = useMemo(() => demoGroup(myStats || {}, today), [today, myStats?.weekGain, myStats?.momentum]);
  useEffect(() => {
    if (demoInbox === null) setDemoInbox(demo.startInbox);
  }, [demo, demoInbox]);

  const groups = useMemo(() => {
    const real = gids.map((gid) => {
      const info = infos[gid] || {};
      const list = (members[gid] || []).map((m) => ({
        ...m,
        isMe: m.id === myId,
        name: profiles[m.id]?.name || m.nick || "Membru",
        avatarUrl: profiles[m.id]?.avatarUrl || null,
      }));
      if (!list.some((m) => m.isMe) && myStats) list.push({ id: myId, ...myStats, isMe: true, name: myStats.nick || "Tu" });
      return {
        id: gid,
        demo: false,
        info,
        members: list,
        inbox: (inbox[gid] || []).map((n) => ({ ...n, read: !!n.read?.[myId] })).sort((a, b) => (a.at < b.at ? 1 : -1)),
        sent: (sent[gid] || []).sort((a, b) => (a.at < b.at ? 1 : -1)),
      };
    });
    const demoMembers = [...demo.members, { id: "me", ...(myStats || {}), isMe: true, name: myStats?.nick || "Tu" }].map((m) => ({
      ...m,
      name: m.isMe ? m.name : m.nick,
    }));
    const demoEntry = {
      id: "demo",
      demo: true,
      info: demo.info,
      members: demoMembers,
      inbox: demoInbox || [],
      sent: demoSent,
    };
    return { real, demo: demoEntry };
  }, [gids, infos, members, inbox, sent, profiles, myId, myStats, demo, demoInbox, demoSent]);

  const unread = useMemo(() => {
    const realUnread = groups.real.reduce((a, g) => a + g.inbox.filter((n) => !n.read).length, 0);
    const demoUnread = groups.real.length ? 0 : (demoInbox || []).filter((n) => !n.read).length;
    return realUnread + demoUnread;
  }, [groups, demoInbox]);

  // ------------------------------------------------------------ actions

  const create = useCallback(
    async (name, kind) => {
      if (!cloud) throw new Error("offline");
      const gid = newId("g");
      const code = newCode();
      await env.db.doc(`groups/${gid}`).set({ name: name.trim().slice(0, 40), code, kind, owner: env.uid, createdAt: new Date().toISOString() });
      await env.db.doc(`groups/${gid}/members/${env.uid}`).set({ ...myStats, joinedAt: new Date().toISOString() });
      published.current[gid] = JSON.stringify(myStats || {});
      update((d) => ({ ...d, groups: [...(d.groups || []), gid] }));
      return { gid, code };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, statsJson]
  );

  const join = useCallback(
    async (code) => {
      if (!cloud) throw new Error("offline");
      const clean = code.trim().toUpperCase();
      const qs = await env.db.collection("groups").where("code", "==", clean).limit(1).get();
      if (qs.empty) return { ok: false, reason: "not_found" };
      const gid = qs.docs[0].id;
      if (gids.includes(gid)) return { ok: true, gid, already: true };
      await env.db.doc(`groups/${gid}/members/${env.uid}`).set({ ...myStats, joinedAt: new Date().toISOString() });
      published.current[gid] = JSON.stringify(myStats || {});
      update((d) => ({ ...d, groups: [...(d.groups || []), gid] }));
      return { ok: true, gid };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, key, statsJson]
  );

  const leave = useCallback(
    async (gid) => {
      if (cloud) await env.db.doc(`groups/${gid}/members/${env.uid}`).delete().catch(() => {});
      update((d) => ({ ...d, groups: (d.groups || []).filter((g) => g !== gid) }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud]
  );

  const send = useCallback(
    async (gid, to, text) => {
      const body = text.trim().slice(0, 200);
      if (!body || !to.length) return;
      if (gid === "demo") {
        const n = { id: newId("n"), from: "me", to, text: body, at: new Date().toISOString() };
        setDemoSent((s) => [n, ...s]);
        const replier = to.find((t) => t !== "me");
        if (replier) {
          const who = demo.members.find((m) => m.id === replier);
          setTimeout(() => {
            setDemoInbox((list) => [
              {
                id: newId("n"),
                from: replier,
                text: who?.mood === "sleep" ? "Mersi că mi-ai amintit! Mă trezesc și mă apuc." : "Mersi! Tocmai mă apucam. Spor și ție!",
                at: new Date().toISOString(),
                read: false,
              },
              ...(list || []),
            ]);
          }, 2500);
        }
        return;
      }
      if (!cloud) return;
      const nid = newId("n");
      await env.db.doc(`groups/${gid}/nudges/${nid}`).set({ from: env.uid, to, text: body, at: new Date().toISOString(), read: {} });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, demo]
  );

  const markRead = useCallback(
    async (gid, nid) => {
      if (gid === "demo") {
        setDemoInbox((list) => (list || []).map((n) => (n.id === nid ? { ...n, read: true } : n)));
        return;
      }
      if (!cloud) return;
      await env.db
        .doc(`groups/${gid}/nudges/${nid}`)
        .update({ read: { [env.uid]: true } })
        .catch(() => {});
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud]
  );

  return { cloud: !!cloud, myId, groups, unread, create, join, leave, send, markRead };
}

/** Points earned since Monday; the leaderboard ranks by this. */
export const weekStart = (today) => mondayOf(today);
