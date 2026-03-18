// public/js/userStatus.js
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/me').then(r => r.json()).then(data => {
      const el = document.getElementById('user-status');
      if (!el) return;
      if (data.name) {
        el.textContent = `Logged in as: ${data.name}`;
      } else {
        el.textContent = 'Guest | ';
        const link = document.createElement('a');
        link.href = '/login';
        link.textContent = 'Login';
        el.appendChild(link);
      }
    });
  });
  