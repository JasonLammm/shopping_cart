document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/me').then(r => r.json()).then(data => {
    const el = document.getElementById('user-status');
    if (!el) return;

    if (data.name) {
      const nameSpan = document.createElement('span');
      nameSpan.className   = 'user-greeting';
      nameSpan.textContent = `Logged in as: ${data.name}`;

      const changePassLink = document.createElement('a');
      changePassLink.href        = '/change-password';
      changePassLink.textContent = 'Change Password';
      changePassLink.className   = 'user-action-link';

      const ordersLink = document.createElement('a');
      ordersLink.href      = '/orders';
      ordersLink.textContent = 'My Orders';
      ordersLink.className = 'user-action-link';

      const logoutBtn = document.createElement('button');
      logoutBtn.textContent = 'Logout';
      logoutBtn.className   = 'user-logout-btn';
      logoutBtn.addEventListener('click', async () => {
        try {
          const tokenRes = await fetch('/api/csrf-token');
          const { csrfToken } = await tokenRes.json();
          const res = await fetch('/api/logout', {
            method: 'POST',
            headers: { 'x-csrf-token': csrfToken }
          });
          if (res.ok) window.location.href = '/login';
        } catch (err) {
          console.error('Logout error:', err);
        }
      });

      el.appendChild(nameSpan);
      el.appendChild(changePassLink);
      el.appendChild(ordersLink);
      el.appendChild(logoutBtn);

    } else {
      const guestSpan = document.createElement('span');
      guestSpan.className   = 'user-greeting';
      guestSpan.textContent = 'Guest';

      const link = document.createElement('a');
      link.href      = '/login';
      link.textContent = 'Login';
      link.className = 'user-action-link';

      el.appendChild(guestSpan);
      el.appendChild(link);
    }
  });
});
