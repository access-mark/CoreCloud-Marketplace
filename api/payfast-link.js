// Builds a PayFast redirect URL. Works with Sandbox or Live depending on env.
import crypto from 'crypto';

const PF_MERCHANT_ID = process.env.PF_MERCHANT_ID;
const PF_MERCHANT_KEY = process.env.PF_MERCHANT_KEY;
const PF_PASSPHRASE = process.env.PF_PASSPHRASE; // set in PayFast dashboard
const PF_SANDBOX = process.env.PF_SANDBOX === 'true';

const PF_BASE = PF_SANDBOX ? 'https://sandbox.payfast.co.za/eng/process' 
                           : 'https://www.payfast.co.za/eng/process';

const RETURN_URL = process.env.PF_RETURN_URL; // e.g. https://www.corecloud-marketplace.com/thank-you.html
const CANCEL_URL = process.env.PF_CANCEL_URL; // e.g. https://www.corecloud-marketplace.com/cart.html
const NOTIFY_URL = process.env.PF_NOTIFY_URL; // e.g. https://your-vercel-domain.vercel.app/api/payment-webhook

function signature(params){
  const q = Object.keys(params)
    .filter(k => params[k] !== undefined && params[k] !== '')
    .sort()
    .map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g,'+')}`)
    .join('&');
  const base = PF_PASSPHRASE ? `${q}&passphrase=${encodeURIComponent(PF_PASSPHRASE).replace(/%20/g,'+')}` : q;
  return crypto.createHash('md5').update(base).digest('hex');
}

export function buildPayfastLink({ amount, item_name, m_payment_id, email_address }){
  const params = {
    merchant_id: PF_MERCHANT_ID,
    merchant_key: PF_MERCHANT_KEY,
    return_url: RETURN_URL,
    cancel_url: CANCEL_URL,
    notify_url: NOTIFY_URL,
    amount,
    item_name,
    m_payment_id,
    email_address
  };
  const sig = signature(params);
  const query = Object.keys(params)
    .map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g,'+')}`)
    .join('&') + `&signature=${sig}`;
  return `${PF_BASE}?${query}`;
}
