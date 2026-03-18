document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/me').then(r => r.json()).then(data => {
    const el = document.getElementById('user-status');
    if (!el) return;

    if (data.name) {
      // Show username
      const nameSpan = document.createElement('span');
      nameSpan.textContent = `Logged in as: ${data.name}`;

      const changePassLink = document.createElement('a');
      changePassLink.href        = '/change-password';
      changePassLink.textContent = 'Change Password';
      changePassLink.style.cssText = 'font-size:0.8rem; font-weight:600; color:#667eea; margin-right:8px; text-decoration:none;';

      // Logout button
      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Logout';
      logoutBtn.addEventListener('click', async () => {
        try {
          const tokenRes = await fetch('/api/csrf-token');
          const { csrfToken } = await tokenRes.json();

          const res = await fetch('/api/logout', {
            method: 'POST',
            headers: { 'x-csrf-token': csrfToken }
          });

          if (res.ok) {
            window.location.href = '/login';
          }
        } catch (err) {
          console.error('Logout error:', err);
        }
      });

      el.appendChild(nameSpan);
      el.appendChild(changePassLink);
      el.appendChild(logoutBtn);

    } else {
      // Show Guest + login link
      const guestSpan = document.createElement('span');
      guestSpan.textContent = 'Guest | ';

      const link = document.createElement('a');
      link.href = '/login';
      link.textContent = 'Login';

      el.appendChild(guestSpan);
      el.appendChild(link);
    }
  });
});
