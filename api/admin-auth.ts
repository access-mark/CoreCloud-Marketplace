// /api/admin-auth.ts
import type { VercelRequest, VercelResponse } from 'vercel';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = (req.body ?? {}) as { key?: string };
  const ADMIN_KEY = process.env.ADMIN_KEY;
  if (!ADMIN_KEY) return res.status(500).json({ error: 'Server missing ADMIN_KEY' });

  if (key && key === ADMIN_KEY) return res.status(200).json({ ok: true });
  return res.status(401).json({ ok: false });
}
