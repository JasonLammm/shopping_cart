/* =========================================
   js/orders.js
   Phase 5: Member order history page
   - Shows last 5 orders for logged-in user
   - Displays success/cancelled banners
   - Redirects to login if not authenticated
========================================= */

document.addEventListener('DOMContentLoaded', async () => {
    handleBanners();
    await loadOrders();
  });
  
  /* ── Banner Display ──────────────────────── */
  function handleBanners() {
    const params = new URLSearchParams(window.location.search);
  
    if (params.get('success') === '1') {
      const banner = document.getElementById('success-banner');
      if (banner) banner.classList.remove('hidden');
    }
  
    if (params.get('cancelled') === '1') {
      const banner = document.getElementById('cancelled-banner');
      if (banner) banner.classList.remove('hidden');
    }
  }
  
  /* ── Fetch Orders from Server ────────────── */
  async function loadOrders() {
    const container = document.getElementById('orders-container');
    container.innerHTML = '';
    try {
      const res = await fetch('/api/my-orders');
  
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
  
      if (!res.ok) {
        throw new Error('Failed to fetch orders.');
      }
  
      const orders = await res.json();
      renderOrders(orders);
  
    } catch (err) {
      console.error('loadOrders error:', err);
      container.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'error-text';
      p.textContent = 'Failed to load orders. Please try again later.';
      container.appendChild(p);
    }
  }
  
  /* ── Render Orders List ──────────────────── */
  function renderOrders(orders) {
    const container = document.getElementById('orders-container');
    container.innerHTML = '';
  
    if (!orders || orders.length === 0) {
      const p = document.createElement('p');
      p.className = 'no-orders';
      p.textContent = 'You have no orders yet.';
      container.appendChild(p);
      return;
    }
  
    orders.forEach(order => {
      const card = createOrderCard(order);
      container.appendChild(card);
    });
  }
  
  /* ── Build a Single Order Card ───────────── */
  function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.appendChild(createOrderHeader(order));
    card.appendChild(createOrderItemsTable(order.items));
    card.appendChild(createOrderTotal(order));
  
    // Phase 6: Pay Again + Cancel for pending orders
    const actions = createOrderActions(order);
    if (actions) card.appendChild(actions);
  
    return card;
  }
  
  /* ── Order Header (ID, Status, Date) ─────── */
  function createOrderHeader(order) {
    const header = document.createElement('div');
    header.className = 'order-header';
  
    const idSpan = document.createElement('span');
    idSpan.className = 'order-id';
    idSpan.textContent = `Order #${order.orderid}`;
  
    const statusSpan = document.createElement('span');
    if (order.status === 'paid') {
      statusSpan.className = 'status-paid';
      statusSpan.textContent = 'Paid';
    } else if (order.status === 'cancelled') {
      statusSpan.className = 'status-cancelled';
      statusSpan.textContent = 'Cancelled';
    } else {
      statusSpan.className = 'status-pending';
      statusSpan.textContent = 'Pending';
    }
  
    const dateSpan = document.createElement('span');
    dateSpan.className = 'order-date';
    dateSpan.textContent = new Date(order.created_at).toLocaleString();
  
    header.appendChild(idSpan);
    header.appendChild(statusSpan);
    header.appendChild(dateSpan);
  
    return header;
  }
  
  /* ── Order Items Table ───────────────────── */
  function createOrderItemsTable(items) {
    const table = document.createElement('table');
    table.className = 'order-items-table';
  
    // Header row
    const thead  = document.createElement('thead');
    const hRow   = document.createElement('tr');
    ['Product', 'Qty', 'Unit Price', 'Subtotal'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      hRow.appendChild(th);
    });
    thead.appendChild(hRow);
    table.appendChild(thead);
  
    // Body rows
    const tbody = document.createElement('tbody');
    items.forEach(item => {
      const row      = document.createElement('tr');
      const subtotal = (item.price * item.quantity).toFixed(2);
  
      [
        item.product_name || `Product #${item.pid}`,
        item.quantity,
        `$${parseFloat(item.price).toFixed(2)}`,
        `$${subtotal}`
      ].forEach(val => {
        const td = document.createElement('td');
        td.textContent = val;
        row.appendChild(td);
      });
  
      tbody.appendChild(row);
    });
  
    table.appendChild(tbody);
    return table;
  }
  
  /* ── Order Total Row ─────────────────────── */
  function createOrderTotal(order) {
    const total = document.createElement('p');
    total.className = 'order-total';
    total.textContent = `Total: $${parseFloat(order.total).toFixed(2)} ${order.currency.toUpperCase()}`;
    return total;
  }

  function createOrderActions(order) {
    if (order.status !== 'pending') return null;
  
    const div = document.createElement('div');
    div.className = 'order-actions';
  
    const payBtn = document.createElement('button');
    payBtn.className = 'btn-pay-again';
    payBtn.textContent = 'Pay Again';
    payBtn.addEventListener('click', async () => {
      payBtn.disabled = true;
      payBtn.textContent = 'Redirecting...';
      try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch(`/api/orders/${order.orderid}/repay`, {
          method: 'POST',
          headers: { 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
        if (res.ok) window.location.href = data.url;
        else alert(data.error || 'Repay failed.');
      } catch (e) {
        alert('Network error.');
      }
      payBtn.disabled = false;
      payBtn.textContent = 'Pay Again';
    });
  
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel-order';
    cancelBtn.textContent = 'Cancel Order';
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('Cancel this order?')) return;
    
      // Disable both buttons immediately to prevent double-click
      cancelBtn.disabled = true;
      payBtn.disabled = true;
      cancelBtn.textContent = 'Cancelling...';
    
      try {
        const csrfRes = await fetch('/api/csrf-token');
        const { csrfToken } = await csrfRes.json();
        const res = await fetch(`/api/orders/${order.orderid}`, {
          method: 'DELETE',
          headers: { 'x-csrf-token': csrfToken }
        });
        const data = await res.json();
    
        if (res.ok) {
          // Re-fetch and re-render entire orders list from server
          await loadOrders();
        } else {
          alert(data.error || 'Cancel failed.');
          cancelBtn.disabled = false;
          payBtn.disabled = false;
          cancelBtn.textContent = 'Cancel Order';
        }
      } catch (e) {
        alert('Network error.');
        cancelBtn.disabled = false;
        payBtn.disabled = false;
        cancelBtn.textContent = 'Cancel Order';
      }
    });
  
    div.appendChild(payBtn);
    div.appendChild(cancelBtn);
    return div;
  }