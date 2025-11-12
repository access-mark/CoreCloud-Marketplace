import { upsertContact } from './_lib/sage.js';

const SAGE_VAT_STD_ID = process.env.SAGE_VAT_STD_ID; // ZA 15% VAT id in your Sage org

async function sFetch(path, opts = {}) {
  // reuse the helper in _lib/sage.js if you prefer; duplicated here to keep file self-contained
  const { getAccessToken } = await import('./_lib/sage.js');
  const { access_token } = await getAccessToken();
  const SAGE_API_BASE  = process.env.SAGE_API_BASE;
  const SAGE_COMPANY_ID = process.env.SAGE_COMPANY_ID;
  const r = await fetch(`${SAGE_API_BASE}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Site': SAGE_COMPANY_ID,
      ...(opts.headers || {})
    }
  });
  if(!r.ok){
    const t = await r.text();
    throw new Error(`Sage ${r.status}: ${t}`);
  }
  return r.json();
}

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();
  try{
    const { buyer, cart, reference, notes } = req.body || {};
    if(!buyer?.email || !Array.isArray(cart) || cart.length===0){
      return res.status(400).json({ error:'buyer.email and cart[] required' });
    }

    // 1) Ensure Contact exists in Sage
    const contact = await upsertContact({
      name: buyer.name || buyer.company || buyer.email,
      email: buyer.email,
      phone: buyer.phone,
      tax_number: buyer.vat_number,
      addresses: buyer.addresses || []
    });
    const contact_id = contact?.id || contact?.$resource?.id;

    // 2) Build quote lines
    const lines = cart.map(i => ({
      description: i.name,
      item_id: i.sage_item_id || null,
      quantity: i.qty,
      unit_price: Number(i.price_zar),
      tax_rate_id: i.tax_rate_id || SAGE_VAT_STD_ID
    }));

    // 3) Create Sales Quote in Sage
    // Sage Accounting exposes a Sales Quotes resource (often `/sales_quotes` on v3.1). 
    const payload = {
      sales_quote: {
        contact_id,
        date: new Date().toISOString().slice(0,10),
        reference: reference || `QUOTE-${Date.now()}`,
        notes: notes || null,
        quote_lines: lines
      }
    };

    const q = await sFetch(`/sales_quotes`, { method:'POST', body: JSON.stringify(payload) });
    res.json({ ok:true, quote_id: q?.id || q?.$resource?.id, quote: q });
  }catch(e){
    res.status(500).json({ error: e.message });
  }
}
