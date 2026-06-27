import { getStore } from '@netlify/blobs';
export default async (req) => {
  const store = getStore({ name: 'posm-board', consistency: 'strong' });
  let board = (await store.get('board', { type: 'json' })) || { tasks: {} };
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
    board.savedAt = new Date().toISOString();
    await store.setJSON('board', board);
    return new Response(JSON.stringify({ ok: true, count: Object.keys(board.tasks).length }), {
      headers: { 'content-type': 'application/json' }
    });
  }
  return new Response('Method not allowed', { status: 405 });
};
export const config = { path: ['/api/board', '/.netlify/functions/store'] };
