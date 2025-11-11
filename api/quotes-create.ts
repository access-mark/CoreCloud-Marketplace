// /api/quotes-create.ts
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

const SAGE_BASE = 'https://accounting.sageone.co.za'; // ZA
const API_VERSION = '3.1'; // modern REST ref; v2.0.0 RPC also available
// NOTE: Sage Accounting requires both Bearer token AND X-Site (resource_owner_id / business id)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body as CreateQuoteBody;
    if (!body?.customer?.name || !body?.customer?.email || !Array.isArray(body?.cart?.items)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const items = body.cart.items.filter(i => i.qty > 0 && i.unit_price >= 0);
    if (!items.length) return res.status(400).json({ error: 'Empty cart' });

    const { accessToken, siteId } = await getSageTokenAndSite();

    // 1) Upsert contact (Customer)
    const contactId = await upsertContact(accessToken, siteId, body.customer);

    // 2) Create Sales Quote
    const now = new Date();
    const expires = new Date(now.getTime() + 14 * 86400000); // 14 days
    const quotePayload = {
      contact_id: contactId,
      date: now.toISOString().slice(0, 10),
      expiry_date: expires.toISOString().slice(0, 10),
      reference: 'CoreCloud Marketplace',
      notes: body.cart.notes || '',
      status_id: 'DRAFT', // let accounting send email / convert later
      line_items: items.map((i) => ({
        description: i.name,
        product_code: i.sku || undefined,
        quantity: i.qty,
        unit_price: i.unit_price,
        tax_rate_id: 'STANDARD', // 15% VAT (ensure business is set up with STANDARD)
      })),
      currency_id: 'ZAR'
    };

    const qRes = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
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

    // OPTIONAL: fetch PDF URL if available (or render via your own HTML->PDF)
    // Some regions expose /sales/quotes/{id}/pdf
    let pdfUrl: string | null = null;
    try {
      const p = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes/${qJson.id}/pdf`, {
        headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Site': siteId }
      });
      if (p.ok) {
        const blob = await p.blob();
        // Store to object storage in production; for now just skip returning binary
        pdfUrl = null; // placeholder
      }
    } catch {}

    return res.status(200).json({
      quote_id: qJson.id,
      quote_number: qJson.displayed_as || qJson.reference || qJson.id,
      pdf_url: pdfUrl,
      expires_at: quotePayload.expiry_date
    });

  } catch (err: any) {
    console.error('quotes-create error', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

/* ---------------- Helpers ---------------- */

async function getSageTokenAndSite(): Promise<{ accessToken: string; siteId: string }> {
  // Use Authorization Code flow. You’ll do the initial consent once; then keep/refresh.
  // Store refresh_token securely (KV/db). This stub expects env vars for a pre-created token.
  // See: OAuth & headers (Authorization + X-Site). :contentReference[oaicite:0]{index=0}
  const accessToken = process.env.SAGE_ACCESS_TOKEN as string;
  const siteId = process.env.SAGE_SITE_ID as string; // resource_owner_id / business id
  if (!accessToken || !siteId) throw new Error('Missing SAGE_ACCESS_TOKEN or SAGE_SITE_ID');
  return { accessToken, siteId };
}

async function upsertContact(
  token: string,
  siteId: string,
  c: { name: string; email: string; phone?: string; vat_number?: string; billing_address?: string }
): Promise<string> {
  // 1) Try find by email
  const find = await fetch(`${SAGE_BASE}/api/${API_VERSION}/contacts?email=${encodeURIComponent(c.email)}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'X-Site': siteId }
  });
  if (find.ok) {
    const list: any = await find.json();
    const existing = Array.isArray(list?.$items) ? list.$items.find((x: any) => x.email === c.email) : null;
    if (existing?.id) return existing.id;
  }

  // 2) Create
  const payload = {
    name: c.name,
    email: c.email,
    mobile: c.phone || '',
    tax_number: c.vat_number || '',
    contact_type_ids: ['CUSTOMER'],
    addresses: c.billing_address ? [{ is_default: true, description: 'Billing', address: c.billing_address }] : []
  };
  const r = await fetch(`${SAGE_BASE}/api/${API_VERSION}/contacts`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'X-Site': siteId, 'Content-Type': 'application/json' },
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
