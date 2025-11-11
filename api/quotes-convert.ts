// /api/quotes-convert.ts
import type { VercelRequest, VercelResponse } from 'vercel';

const SAGE_BASE = 'https://accounting.sageone.co.za';
const API_VERSION = '3.1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { quote_id } = req.body || {};
    if (!quote_id) return res.status(400).json({ error: 'quote_id required' });

    const { accessToken, siteId } = await getSageTokenAndSite();

    // Some regions provide a convenience action; otherwise: read quote -> map -> create invoice
    // 1) Read quote
    const q = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/quotes/${quote_id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Site': siteId }
    });
    if (!q.ok) throw new Error(`Quote load failed: ${q.status}`);
    const qJson: any = await q.json();

    // 2) Create invoice with same lines/contact
    const payload = {
      contact_id: qJson.contact_id,
      date: new Date().toISOString().slice(0,10),
      reference: `From quote ${qJson.displayed_as || qJson.id}`,
      line_items: qJson.line_items.map((l: any) => ({
        description: l.description,
        product_code: l.product_code || undefined,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_rate_id: l.tax_rate_id || 'STANDARD'
      })),
      currency_id: 'ZAR',
      status_id: 'DRAFT'
    };

    const inv = await fetch(`${SAGE_BASE}/api/${API_VERSION}/sales/invoices`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'X-Site': siteId, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!inv.ok) {
      const t = await inv.text().catch(()=> '');
      throw new Error(`Invoice create failed (${inv.status}): ${t}`);
    }
    const invJson: any = await inv.json();

    // Optional PDF fetch similar to quotes-create
    return res.status(200).json({
      invoice_id: invJson.id,
      invoice_number: invJson.displayed_as || invJson.reference || invJson.id,
      pdf_url: null,
      due_date: invJson.due_date || null
    });

  } catch (err: any) {
    console.error('quotes-convert error', err?.message || err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function getSageTokenAndSite(): Promise<{ accessToken: string; siteId: string }> {
  const accessToken = process.env.SAGE_ACCESS_TOKEN as string;
  const siteId = process.env.SAGE_SITE_ID as string;
  if (!accessToken || !siteId) throw new Error('Missing SAGE_ACCESS_TOKEN or SAGE_SITE_ID');
  return { accessToken, siteId };
}
