import http from 'node:http';

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !process.env[key]);
const port = Number(process.env.PORT || 3000);
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': allowedOrigin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS' });
  res.end(JSON.stringify(body));
}

async function currentUser(token) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, authorization: token } });
  return response.ok ? response.json() : null;
}

async function supabase(path, options = {}) {
  return fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, { ...options, headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(options.headers || {}) } });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.url === '/health') return json(res, missing.length ? 503 : 200, { ok: missing.length === 0, missing });
  if (missing.length) return json(res, 503, { error: 'Server configuration is incomplete.', missing });
  const token = req.headers.authorization;
  const user = token && await currentUser(token);
  if (!user) return json(res, 401, { error: 'Please sign in first.' });
  if (req.method === 'GET' && req.url === '/api/tasks') {
    const response = await supabase(`tasks?user_id=eq.${user.id}&order=created_at.desc`);
    return json(res, response.status, await response.json());
  }
  if (req.method === 'POST' && req.url === '/api/tasks') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const { title } = JSON.parse(raw || '{}');
    if (!title?.trim()) return json(res, 400, { error: 'title is required' });
    const response = await supabase('tasks', { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify({ title: title.trim(), user_id: user.id, status: '收件箱' }) });
    return json(res, response.status, await response.json());
  }
  return json(res, 404, { error: 'Not found' });
});
server.listen(port, () => console.log(`Task API listening on ${port}`));
