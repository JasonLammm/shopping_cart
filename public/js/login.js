// public/js/login.js
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email    = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl    = document.getElementById('login-error');
  
      const tokenRes = await fetch('/api/csrf-token');
      const { csrfToken } = await tokenRes.json();
  
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ email, password })
      });
  
      const data = await res.json();
  
      if (res.ok) {
        window.location.href = data.isAdmin ? '/admin' : '/';
      } else {
        errEl.textContent = data.error;
        errEl.style.display = 'block';
      }
    });
  });
  