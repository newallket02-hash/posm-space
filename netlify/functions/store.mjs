import { getStore } from '@netlify/blobs';

export default async (req) => {
  const url = new URL(req.url);

  /* ================= PRESENCE (khoá riêng, tách khỏi board) ================= */
  if (url.searchParams.get('presence') === '1') {
    const pres = getStore({ name: 'posm-presence' }); // eventual, nhẹ
    const PRES_TTL = 60000; // 60s coi là online

    // Heartbeat: ghi khoá riêng cho từng user -> không ghi đè cả board
    if (req.method === 'POST') {
      let body = {};
      try { body = await req.json(); } catch (e) {}
      const p = body && body.presence;
      if (p && p.id) {
        const rec = {
          id: String(p.id),
          name: String(p.name || p.id),
          u: String(p.u || p.id),
          ts: Date.now()
        };
        try { await pres.setJSON('pres:' + rec.id, rec); } catch (e) {}
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
      });
    }

    // Đọc danh sách online: gom các khoá pres:*, bỏ khoá quá hạn
    const out = {};
    try {
      const now = Date.now();
      const { blobs } = await pres.list({ prefix: 'pres:' });
      await Promise.all((blobs || []).map(async (b) => {
        try {
          const rec = await pres.get(b.key, { type: 'json' });
          if (rec && rec.ts && now - rec.ts < PRES_TTL) {
            out[rec.id] = { name: rec.name, u: rec.u, ts: rec.ts };
          } else {
            // dọn khoá hết hạn để không phình
            try { await pres.delete(b.key); } catch (e) {}
          }
        } catch (e) {}
      }));
    } catch (e) {}
    return new Response(JSON.stringify({ presence: out }), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  /* ================= BOARD (giữ nguyên như cũ, chỉ bỏ strong + try/catch) ================= */
  const store = getStore({ name: 'posm-board' });
  let board;
  try {
    board = (await store.get('board', { type: 'json' })) || { tasks: {} };
  } catch (e) {
    board = { tasks: {} };
  }
  if (!Array.isArray(board.activity)) board.activity = [];
  if (!board.nicknames || typeof board.nicknames !== 'object') board.nicknames = {};
  if (!board.avatars || typeof board.avatars !== 'object') board.avatars = {};
  if (!Array.isArray(board.messages)) board.messages = [];
  if (!board.presence || typeof board.presence !== 'object') board.presence = {};
  if (!Array.isArray(board.dms)) board.dms = [];

  if (req.method === 'GET') {
    return new Response(JSON.stringify(board), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
    });
  }

  let body = {};
  try { body = await req.json(); } catch (e) {}
  (body.upsert || []).forEach(t => { if (t && t.taskId) board.tasks[t.taskId] = t; });
  (body.delete || []).forEach(id => { delete board.tasks[id]; });

  if (body.type === 'avatar' && body.id) {
    if (body.img) board.avatars[body.id] = body.img;
    else delete board.avatars[body.id];
  }

  if (Array.isArray(body.activity) && body.activity.length) {
    board.activity = board.activity.concat(body.activity).slice(-200);
  }

  if (Array.isArray(body.messages) && body.messages.length) {
    board.messages = board.messages.concat(body.messages);
  }
  const TTL_MS = 30 * 60 * 1000;
  const now = Date.now();
  board.messages = board.messages.filter(m => m && m.ts && (now - m.ts) < TTL_MS).slice(-500);

  if (Array.isArray(body.dms) && body.dms.length) {
    board.dms = board.dms.concat(body.dms);
  }
  board.dms = board.dms.filter(m => m && m.ts && (now - m.ts) < TTL_MS).slice(-500);

  if (body.nicknames && typeof body.nicknames === 'object') {
    for (const u in body.nicknames) {
      const v = body.nicknames[u];
      if (v) board.nicknames[u] = String(v); else delete board.nicknames[u];
    }
  }

  board.savedAt = new Date().toISOString();
  try { await store.setJSON('board', board); } catch (e) {}
  return new Response(JSON.stringify({
    ok: true,
    count: Object.keys(board.tasks).length,
    activity: board.activity,
    nicknames: board.nicknames
  }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
};
