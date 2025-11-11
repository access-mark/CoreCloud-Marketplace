import type { VercelRequest, VercelResponse } from 'vercel';

type CartItem = { sku: string; name: string; qty: number; unit_price: number; tax_code?: string };
type CreateQuoteBody = {
  customer: {
    name: string;
    email: string;
    phone?: string;
    vat_number?: string;
    billing_address?: string;
  };
  cart: { items: CartItem[]; notes?: string };
};

const SAGE_BASE = 'https://api.accounting.sageone.co.za'; // ZA
const API_VERSION = '3.1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- dev CORS (safe to remove in prod) ---
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Site');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const body = req.body as CreateQuoteBody;
    if (!body?.customer?.name || !body?.customer?.email || !Array.isArray(body?.cart?.items)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const items = body.cart.items.filter(i => (i.qty ?? 0) > 0 && (i.unit_price ?? -1) >= 0);
    if (!items.length) return res.status(400).json({ error: 'Empty cart' });

    const { accessToken, siteId } = await getSageTokenAndSite();

    // 1) Upsert contact
    const contactId = await upsertContact(accessToken, siteId, body.customer);

    // 2) Create quote (Draft by default if status omitted)
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 86400000);

    const line_items = items.map(i => {
      const li: any = {
        description: i.name,
        quantity: i.qty,
        unit_price: i.unit_price
      };
      if (i.sku) li.product_code = i.sku;       // when you have Sage ItemCodes, this binds stock/tax defaults
      // If you later fetch a numeric tax_rate_id, set li.tax_rate_id = <id>;
      return li;
    });

    const quotePayload = {
      contact_id: contactId,
      date: now.toISOString().slice(0, 10),
      expiry_date: expires.toISOString().slice(0, 10),
      reference: 'CoreCloud Marketplace',
      notes: body.cart.notes || '',
      // status_id: <omit to default Draft>
      line_items,
      currency_id: 'ZAR'
    };

    const qRes = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Site': siteId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(quotePayload)
    });

    if (!qRes.ok) {
      const t = await safeText(qRes);
      throw new Error(`Quote create failed (${qRes.status}): ${t}`);
    }
    const qJson: any = await qRes.json();

    // 3) (Optional) try to fetch PDF; many tenants require a separate “email/print” action
    let pdf_url: string | null = null;
    try {
      const p = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes/${qJson.id}/pdf`, {
        headers: { Authorization: `Bearer ${accessToken}`, 'X-Site': siteId }
      });
      if (p.ok) {
        // In production: stream to blob storage and return a signed URL.
        // For now: leave null so the client just shows the quote number.
        pdf_url = null;
      }
    } catch { /* ignore */ }

    return res.status(200).json({
      ok: true,
      quote_id: qJson.id,
      quote_number: qJson.displayed_as || qJson.reference || String(qJson.id),
      pdf_url,
      expires_at: quotePayload.expiry_date
    });

  } catch (err: any) {
    console.error('quotes-create error', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

/* ---------------- Helpers ---------------- */

async function getSageTokenAndSite(): Promise<{ accessToken: string; siteId: string }> {
  const accessToken = process.env.SAGE_ACCESS_TOKEN as string;
  const siteId = process.env.SAGE_SITE_ID as string; // resource_owner_id / business GUID
  if (!accessToken || !siteId) throw new Error('Missing SAGE_ACCESS_TOKEN or SAGE_SITE_ID');
  return { accessToken, siteId };
}

async function upsertContact(
  token: string,
  siteId: string,
  c: { name: string; email: string; phone?: string; vat_number?: string; billing_address?: string }
): Promise<string> {
  // Try find by email (paged list variants)
  try {
    const find = await fetch(
      `${SAGE_BASE}/api/${API_VERSION}/contacts?email=${encodeURIComponent(c.email)}`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Site': siteId } }
    );
    if (find.ok) {
      const data: any = await find.json();
      const list = Array.isArray(data?.$items) ? data.$items : (Array.isArray(data) ? data : []);
      const existing = list.find((x: any) => x?.email === c.email);
      if (existing?.id) return existing.id;
    }
  } catch { /* ignore */ }

  // Create
  const payload: any = {
    name: c.name,
    email: c.email,
    mobile: c.phone || '',
    tax_number: c.vat_number || '',
    contact_type_ids: ['CUSTOMER'],
  };
  if (c.billing_address) {
    payload.addresses = [{ is_default: true, description: 'Billing', address: c.billing_address }];
  }

  const r = await fetch(`${SAGE_BASE}/api/${API_VERSION}/contacts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'X-Site': siteId, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const t = await safeText(r);
    throw new Error(`Contact create failed (${r.status}): ${t}`);
  }
  const j: any = await r.json();
  return j.id;
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ''; }
}
