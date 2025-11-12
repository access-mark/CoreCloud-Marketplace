// api/payment-webhook.js
const { allocateReceipt } = require('./_lib/sage.js');

// Disable Next/Vercel JSON body parsing — we need the raw form body from PayFast
module.exports.config = { api: { bodyParser: false } };

// Parse x-www-form-urlencoded body (PayFast IPN)
function parsePayfastBody(bodyStr) {
  const params = new URLSearchParams(bodyStr);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // Collect raw body
    const raw = await new Promise((resolve) => {
      let data = '';
      req.on('data', (c) => (data += c));
      req.on('end', () => resolve(data));
    });

    const pf = parsePayfastBody(raw);

    // Minimal fields (validate signature/IPN origin in production)
    const invoice_id = pf.m_payment_id;                // we sent Sage invoice id here
    const amount     = pf.amount_gross || pf.amount_net || pf.amount;
    const buyerEmail = pf.email_address || pf.email || '';
    const gatewayRef = pf.pf_payment_id || pf.signature || pf.token || 'payfast';

    if (!invoice_id || !amount) {
      res.status(400).json({ error: 'missing invoice_id/amount' });
      return;
    }

    // If your Sage requires contact_id for receipts, either:
    //  - fetch the invoice to get contact_id, or
    //  - store a mapping when creating the invoice.
    // Many setups allow allocation by invoice only.
    await allocateReceipt({
      contact_id: null,             // optional depending on Sage setup
      invoice_id,
      amount,
      reference: `${gatewayRef}:${buyerEmail}`
    });

    // PayFast expects a 200 with plain-text 'OK'
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(200).send('OK');
  } catch (e) {
    // Return JSON error for easier debugging
    res.status(500).json({ error: e.message });
  }
};
