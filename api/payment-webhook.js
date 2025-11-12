import { allocateReceipt } from './_lib/sage.js';

/*
Configure PayFast "Notify URL" to point here.
You may also expose a separate /api/payfast-notify if you want to keep this generic.
*/

function parsePayfastBody(bodyStr){
  const params = new URLSearchParams(bodyStr);
  const out = {};
  for(const [k,v] of params) out[k]=v;
  return out;
}

export const config = { api:{ bodyParser:false } };

export default async function handler(req, res){
  if(req.method !== 'POST') return res.status(405).end();

  try{
    const raw = await new Promise(resolve=>{
      let data=''; req.on('data',c=>data+=c); req.on('end', ()=>resolve(data));
    });
    const pf = parsePayfastBody(raw);

    // Minimal fields (validate signature/IPN in production)
    const invoice_id = pf.m_payment_id;         // we sent Sage invoice id here
    const amount     = pf.amount_gross || pf.amount_net || pf.amount;
    const buyerEmail = pf.email_address || pf.email || '';
    const gatewayRef = pf.pf_payment_id || pf.signature || pf.token || 'payfast';

    if(!invoice_id || !amount) return res.status(400).json({ error:'missing invoice_id/amount' });

    // Contact id is not returned; allocate by invoice only is also valid in Sage.
    // If your Sage requires contact_id, store mapping externally or fetch invoice to get contact id.
    const receipt = await allocateReceipt({
      contact_id: null,     // optional depending on Sage setup
      invoice_id,
      amount,
      reference: `${gatewayRef}:${buyerEmail}`
    });

    res.json({ ok:true, receipt });
  }catch(e){ res.status(500).json({ error:e.message }); }
}
