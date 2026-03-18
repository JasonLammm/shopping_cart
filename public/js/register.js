document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('register-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl    = document.getElementById('register-error');
      const name     = document.getElementById('reg-name').value.trim();
      const email    = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirm  = document.getElementById('reg-confirm').value;
  
      errEl.style.display = 'none';
  
      // Frontend: confirm password match
      if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.style.display = 'block';
        return;
      }
  
      if (password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.style.display = 'block';
        return;
      }
  
      const tokenRes = await fetch('/api/csrf-token');
      const { csrfToken } = await tokenRes.json();
  
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({ name, email, password, confirmPassword: confirm })
      });
  
      const data = await res.json();
  
      if (res.ok) {
        window.location.href = '/login';   // redirect to login after success
      } else {
        errEl.textContent = data.error;
        errEl.style.display = 'block';
      }
    });
  });
  