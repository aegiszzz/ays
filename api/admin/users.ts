import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function verifyAdmin(req: VercelRequest): Promise<string | null> {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;

  const { data } = await supabaseAdmin
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!data?.is_admin) return null;
  return user.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const allowedOrigin = process.env.EXPO_PUBLIC_APP_URL;
  if (!allowedOrigin) return res.status(500).json({ error: 'Server misconfigured' });
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const adminId = await verifyAdmin(req);
  if (!adminId) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) { console.error('listUsers error:', error); return res.status(500).json({ error: 'Failed to retrieve users' }); }
    return res.status(200).json({ users: data.users });
  }

  if (req.method === 'DELETE') {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Invalid userId format' });
    if (userId === adminId) return res.status(400).json({ error: 'Cannot delete yourself' });

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) { console.error('deleteUser error:', error); return res.status(500).json({ error: 'Failed to delete user' }); }
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
