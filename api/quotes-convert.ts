// /api/quotes-convert.ts
import type { VercelRequest, VercelResponse } from 'vercel';

const SAGE_BASE = 'https://api.accounting.sageone.co.za'; // ZA
const API_VERSION = '3.1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Dev CORS (remove/lock down in prod)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Site');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { quote_id } = (req.body ?? {}) as { quote_id?: string };
    if (!quote_id) return res.status(400).json({ error: 'quote_id required' });

    const { accessToken, siteId } = await getSageTokenAndSite();

    // 1) Load the quote
    const qRes = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes/${encodeURIComponent(quote_id)}`, {
      headers: { Authorization: `Bearer ${accessToken}`, 'X-Site': siteId }
    });
    if (!qRes.ok) {
      const t = await safeText(qRes);
      throw new Error(`Quote load failed (${qRes.status}): ${t}`);
    }
    const quote: any = await qRes.json();

    const srcLines = Array.isArray(quote?.line_items) ? quote.line_items : [];
    if (!srcLines.length) return res.status(400).json({ error: 'Quote has no line items' });

    // 2) Create invoice (Draft by default if status omitted)
    const today = new Date().toISOString().slice(0, 10);

    const line_items = srcLines.map((l: any) => {
      const li: any = {
        description: l?.description ?? '',
        quantity: Number(l?.quantity ?? 1),
        unit_price: Number(l?.unit_price ?? 0)
      };
      if (l?.product_code) li.product_code = String(l.product_code);
      // If/when you have a numeric VAT ID, set: li.tax_rate_id = <number>;
      return li;
    });

    const payload: any = {
      contact_id: quote.contact_id,
      date: today,
      reference: `From quote ${quote.displayed_as ?? quote.id}`,
      line_items,
      currency_id: 'ZAR'
      // status_id: <omit; defaults to Draft>
    };

    const invRes = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/invoices`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Site': siteId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!invRes.ok) {
      const t = await safeText(invRes);
      throw new Error(`Invoice create failed (${invRes.status}): ${t}`);
    }
    const invoice: any = await invRes.json();

    // Optional: fetch/emit PDF here similar to quotes
    return res.status(200).json({
      ok: true,
      invoice_id: invoice.id,
      invoice_number: invoice.displayed_as || invoice.reference || String(invoice.id),
      pdf_url: null,
      due_date: invoice.due_date || null
    });
  } catch (err: any) {
    console.error('quotes-convert error:', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function getSageTokenAndSite(): Promise<{ accessToken: string; siteId: string }> {
  const accessToken = process.env.SAGE_ACCESS_TOKEN as string;
  const siteId = process.env.SAGE_SITE_ID as string; // resource_owner_id / business GUID
  if (!accessToken || !siteId) throw new Error('Missing SAGE_ACCESS_TOKEN or SAGE_SITE_ID');
  return { accessToken, siteId };
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ''; }
}
