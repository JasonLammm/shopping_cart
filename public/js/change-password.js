document.addEventListener('DOMContentLoaded', () => {
    const form    = document.getElementById('cp-form');
    const errEl   = document.getElementById('cp-error');
    const succEl  = document.getElementById('cp-success');
  
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errEl.style.display  = 'none';
      succEl.style.display = 'none';
  
      const currentPassword = document.getElementById('current-password').value;
      const newPassword     = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-new-password').value;
  
      // Frontend validation
      if (newPassword !== confirmPassword) {
        errEl.textContent    = 'New passwords do not match.';
        errEl.style.display  = 'block';
        return;
      }
  
      if (newPassword.length < 8) {
        errEl.textContent    = 'New password must be at least 8 characters.';
        errEl.style.display  = 'block';
        return;
      }
  
      if (newPassword === currentPassword) {
        errEl.textContent    = 'New password must differ from current password.';
        errEl.style.display  = 'block';
        return;
      }
  
      try {
        const tokenRes = await fetch('/api/csrf-token');
        const { csrfToken } = await tokenRes.json();
  
        const res = await fetch('/api/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
  
        const data = await res.json();
  
        if (res.ok) {
          // Show success briefly then redirect to login
          succEl.textContent   = 'Password changed. Redirecting to login...';
          succEl.style.display = 'block';
          setTimeout(() => { window.location.href = '/login'; }, 1500);
        } else {
          errEl.textContent   = data.error;
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent   = 'Network error. Please try again.';
        errEl.style.display = 'block';
      }
    });
  });

