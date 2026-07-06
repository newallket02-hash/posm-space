import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore({ name: 'posm-board', consistency: 'strong' });
  let board = (await store.get('board', { type: 'json' })) || { tasks: {} };
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

  if (req.method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch (e) {}
    (body.upsert || []).forEach((t) => { if (t && t.taskId) board.tasks[t.taskId] = t; });
    (body.delete || []).forEach((id) => { delete board.tasks[id]; });

    // Avatar: luu anh dai dien theo user id  { type:'avatar', id, img }
    if (body.type === 'avatar' && body.id) {
      if (body.img) board.avatars[body.id] = body.img;
      else delete board.avatars[body.id];
    }

  // Ghi nhat ky hoat dong (ai sua ID nao, luc nao) - giu 30 muc gan nhat
  if (Array.isArray(body.activity) && body.activity.length) {
    board.activity = board.activity.concat(body.activity).slice(-30);
  }
// Chat tam thoi: nhan tin nhan moi
    if (Array.isArray(body.messages) && body.messages.length) {
      board.messages = board.messages.concat(body.messages);
    }
    const TTL_MS = 10 * 60 * 1000;   // 10 phut -> tin nhan tu bien mat
    const now = Date.now();
    board.messages = board.messages
      .filter((m) => m && m.ts && (now - m.ts) < TTL_MS)
      .slice(-60);
    // Presence: heartbeat online/offline { presence:{ id, name } }
    if (body.presence && body.presence.id) {
      board.presence[body.presence.id] = { name: String(body.presence.name || body.presence.id), ts: Date.now() };
    }
    const PRES_TTL = 2 * 60 * 1000, pnow = Date.now();
    for (const k in board.presence) {
      if (!board.presence[k] || (pnow - board.presence[k].ts) > PRES_TTL) delete board.presence[k];
    }
    // Tin nhan rieng (DM) { dms:[{from,fromNick,to,text,ts}] }
    if (Array.isArray(body.dms) && body.dms.length) {
      board.dms = board.dms.concat(body.dms);
    }
    board.dms = board.dms.filter((m) => m && m.ts && (pnow - m.ts) < TTL_MS).slice(-200);
  // Nickname toan he thong: merge {username: nickname}
  if (body.nicknames && typeof body.nicknames === 'object') {
    for (const u in body.nicknames) {
      const v = body.nicknames[u];
      if (v) board.nicknames[u] = String(v); else delete board.nicknames[u];
    }
  }

  board.savedAt = new Date().toISOString();
    await store.setJSON('board', board);
    return new Response(JSON.stringify({ ok: true, count: Object.keys(board.tasks).length, activity: board.activity, nicknames: board.nicknames, avatars: board.avatars , messages: board.messages, presence: board.presence, dms: board.dms}), {
      headers: { 'content-type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config = { path: ['/api/board', '/.netlify/functions/store'] };
