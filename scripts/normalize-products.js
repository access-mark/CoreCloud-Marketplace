// scripts/normalize-products.js
const fs = require('fs');

const SRC = 'assets/data/products.json';
const OUT = 'assets/data/products.normalized.json';

// simple slug for filenames
const fslug = s => s
  .trim()
  .replace(/[“”"]/g, '')       // quotes
  .replace(/\s+/g, '-')        // spaces -> hyphen
  .replace(/-+/g, '-')         // collapse
  .toLowerCase();

// build a simple ItemCode from sku + specs (tweak later as you wish)
function suggestItemCode(p){
  // e.g., dell-latitude-7440 -> LAT-7440
  const m = (p.sku || '').match(/dell-(latitude|precision|xps)-([\w-]+)/i);
  const base = m ? `${m[1].slice(0,3).toUpperCase()}-${m[2].toUpperCase()}` : (p.sku || '').toUpperCase();
  const ram = (p.ram || '').replace(/\D+/g,'');              // "32GB" -> "32"
  const ssd = (p.storage || '').match(/(\d+)\s*TB/i) ? `${RegExp.$1}T`
             : (p.storage || '').match(/(\d+)\s*GB/i) ? `${RegExp.$1}G` : '';
  const disp = /13|14|15|16/.test(p.display||'') ? (p.display.match(/\d+/)||[''])[0] : '';
  const parts = [base, ram && `${ram}G`, ssd, disp && `${disp}"`].filter(Boolean);
  return parts.join('-');
}

// compute incl VAT (15%)
const incl = n => Math.round(Number(n||0) * 1.15);

const data = JSON.parse(fs.readFileSync(SRC,'utf8'));
const out = data.map(p => {
  const image = p.image ? (() => {
    const parts = p.image.split('/');
    const file = parts.pop();
    const dir  = parts.join('/');
    return `${dir}/${fslug(file)}`;
  })() : p.image;

  const stock_badge = p.stock_type === 'newgen' ? 'pro' : (p.stock_type === 'surplus' ? 'fire' : null);

  return {
    ...p,
    image,
    // only add these if not present
    ...(p.item_code ? {} : { item_code: suggestItemCode(p) }),
    // tax_rate_id: <fill when Sage gives numeric VAT id>,
    price_incl: incl(p.price),
    ...(stock_badge ? { stock_badge } : {})
  };
});

fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`Wrote ${OUT} (${out.length} items).`);
