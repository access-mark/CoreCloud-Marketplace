import { upsertContact, createInvoice } from './_lib/sage.js';
import { buildPayfastLink } from './payfast-link.js';

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();
  try{
    const { buyer, cart, reference, notes } = req.body||{};
    if(!buyer?.email || !Array.isArray(cart) || cart.length===0){
      return res.status(400).json({ error:'buyer.email and cart[] required' });
    }

    const contact = await upsertContact({
      name: buyer.name || buyer.company || buyer.email,
      email: buyer.email,
      phone: buyer.phone,
      tax_number: buyer.vat_number,
      addresses: buyer.addresses || []
    });

    const lines = cart.map(i => ({
      description: i.name,
      item_id: i.sage_item_id || null,
      quantity: i.qty,
      unit_price: i.price_zar,
      tax_rate_id: i.tax_rate_id // fallback handled in lib
    }));

    const inv = await createInvoice({
      contact_id: contact.id || contact?.$resource?.id,
      lines,
      reference,
      notes
    });

    const invoice_id = inv?.id || inv?.$resource?.id;
    if(!invoice_id) return res.status(500).json({ error:'No invoice id returned from Sage' });

    // total can be computed client-side and sent, or re-summed here
    const total = lines.reduce((s,l)=> s + Number(l.unit_price)*Number(l.quantity), 0);

    const payUrl = buildPayfastLink({
      amount: total.toFixed(2),
      item_name: reference || `Marketplace Order`,
      m_payment_id: invoice_id, // your internal ref (Sage invoice)
      email_address: buyer.email
    });

    res.json({ ok:true, invoice_id, pay_url: payUrl });
  }catch(e){ res.status(500).json({ error: e.message }); }
}
