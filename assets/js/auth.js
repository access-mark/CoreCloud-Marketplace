// assets/js/auth.js
(function(){
  const KEY = 'ccm-user';

  function getUser(){ try{ return JSON.parse(localStorage.getItem(KEY) || 'null'); }catch(e){ return null; } }
  function setUser(u){ localStorage.setItem(KEY, JSON.stringify(u)); }
  function clearUser(){ localStorage.removeItem(KEY); }

  // Expose globally
  window.CCMAuth = { getUser, setUser, clearUser };

  // Nav helper: swap Login -> Hello, {first}
  document.addEventListener('DOMContentLoaded', ()=>{
    const user = getUser();
    const nav = document.querySelector('.ccm-nav');
    if(!nav) return;

    const loginLink = nav.querySelector('a[href*="login.html"]');
    if(user && user.email){
      if(loginLink){
        loginLink.textContent = `Hello, ${user.first_name || 'there'}`;
        loginLink.href = 'login.html';
      }
      const actions = document.querySelector('.ccm-actions');
      if(actions && !actions.querySelector('#ccmLogout')){
        const btn = document.createElement('button');
        btn.id = 'ccmLogout';
        btn.textContent = 'Logout';
        btn.className = 'ccm-btn ghost';
        btn.style.marginLeft = '.5rem';
        btn.addEventListener('click', ()=>{
          clearUser();
          location.reload();
        });
        actions.appendChild(btn);
      }
    } else {
      if(loginLink){
        loginLink.textContent = 'Login';
      }
      const lo = document.getElementById('ccmLogout');
      if(lo) lo.remove();
    }
  });
})();
