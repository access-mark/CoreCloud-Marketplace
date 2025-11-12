<!-- Include this on your cart / checkout page AFTER your cart UI -->
<script>
(async function(){
  async function postJSON(url, body){
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const d = await r.json().catch(()=> ({}));
    if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
    return d;
  }

  const btn = document.getElementById('payCard'); // make sure your button has this id
  if(!btn) return;

  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    try{
      const buyer = JSON.parse(localStorage.getItem('ccm-user')||'{}');
      const cart  = JSON.parse(localStorage.getItem('ccm-cart')||'[]');

      if(!buyer?.email || !cart?.length){
        alert('Please sign in and add items to cart.'); btn.disabled=false; return;
      }

      const { ok, invoice_id, pay_url } = await postJSON('/api/create-invoice', {
        buyer,
        cart,
        reference: `CCM-${Date.now()}`,
        notes: `Online order for ${buyer.email}`
      });

      if(!ok || !pay_url){ throw new Error('Payment URL not generated'); }
      window.location = pay_url;
    }catch(e){
      console.error(e);
      alert('Checkout error: ' + e.message);
      btn.disabled = false;
    }
  });
})();
</script>
