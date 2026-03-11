/* =========================================
   js/main.js
   PHASE 4: XSS-safe frontend
   - renderProducts: card.innerHTML → DOM methods
   - initProductPage: breadcrumb.innerHTML → DOM methods
   - updateCartUI: row.innerHTML → DOM methods
========================================= */

// --- Global Cart State ---
// Only stores { pid, qty } — name/price are fetched from server on restore
let cart = [];

document.addEventListener('DOMContentLoaded', async () => {
  await restoreCart();
  initCartDropdown();

  const isIndexPage = document.getElementById('product-container');
  const isProductPage =
    document.querySelector('.product-detail-view') ||
    document.getElementById('product-details-container');

  if (isIndexPage) {
    initHomePage();
  } else if (isProductPage) {
    initProductPage();
  }
});

/* =========================================
   PART 1: HOME PAGE LOGIC (index.html)
========================================= */
async function initHomePage() {
  await loadCategories();

  const params = new URLSearchParams(window.location.search);
  const catIdFromURL = params.get('catid') || 'all';
  await fetchAndRenderProducts(catIdFromURL);

  if (catIdFromURL !== 'all') {
    const activeItem = document.querySelector(
      `.category-list li[data-cat="${catIdFromURL}"]`
    );
    if (activeItem) {
      document.querySelectorAll('.category-list li')
        .forEach(li => li.classList.remove('active'));
      activeItem.classList.add('active');
      updateBreadcrumb(activeItem.textContent);
    }
  } else {
    updateBreadcrumb('All Products');
  }

  window.addEventListener('popstate', (e) => {
    const catId = e.state?.catId || 'all';
    fetchAndRenderProducts(catId);
    document.querySelectorAll('.category-list li')
      .forEach(li => li.classList.remove('active'));
    const targetItem = document.querySelector(
      `.category-list li[data-cat="${catId}"]`
    );
    if (targetItem) {
      targetItem.classList.add('active');
      updateBreadcrumb(targetItem.textContent);
    }
  });
}

async function loadCategories() {
    try {
      const response = await fetch('/api/categories');
      if (!response.ok) throw new Error('Failed to load categories');
      const categories = await response.json();
  
      const list = document.querySelector('.category-list');
      if (!list) return;
      list.innerHTML = '';
  
      // "All Products" item
      const allItem = document.createElement('li');
      allItem.textContent = 'All Products';
      allItem.dataset.cat = 'all';
      allItem.classList.add('active');
      list.appendChild(allItem);
  
      // Category items from DB
      categories.forEach(cat => {
        const li = document.createElement('li');
        li.textContent = cat.name;
        li.dataset.cat = cat.catid;
        list.appendChild(li);
      });
  
      // Click handlers
      const items = list.querySelectorAll('li');
      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          items.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
          const catId = item.dataset.cat;
          const newUrl =
            catId === 'all'
              ? window.location.pathname
              : `${window.location.pathname}?catid=${catId}`;
          history.pushState({ catId }, '', newUrl);
          fetchAndRenderProducts(catId);
          updateBreadcrumb(item.textContent);
        });
      });
    } catch (err) {
      console.error(err);
      const list = document.querySelector('.category-list');
      if (list) list.textContent = 'Failed to load categories.';
    }
}  

// Fetch products from server (optionally filtered by catid)
async function fetchAndRenderProducts(catId) {
  const container = document.getElementById('product-container');
  container.textContent = 'Loading products...'; // safe: textContent

  try {
    let url = '/api/products';
    if (catId && catId !== 'all') {
      url += `?catid=${encodeURIComponent(catId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch products');
    const products = await response.json();
    renderProducts(products);
  } catch (err) {
    console.error(err);
    container.textContent = 'Error loading products.'; // safe: textContent
  }
}

function renderProducts(products) {
    const container = document.getElementById('product-container');
    container.innerHTML = '';
  
    if (products.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'No products found in this category.';
      container.appendChild(p);
      return;
    }
  
    products.forEach(p => {
      const price = parseFloat(p.price) || 0;
      const imgPath = p.image
        ? `/public/images/thumb_${p.image}`
        : '/public/images/placeholder.jpg';
  
      const card = document.createElement('div');
      card.className = 'product-card';
  
      // ── Clickable image + name + price (links to product page) ──────
      const link = document.createElement('a');
      link.href = `/product.html?pid=${encodeURIComponent(p.pid)}`;
  
      const img = document.createElement('img');
      img.src = imgPath;
      img.alt = p.name;
      img.onerror = function () {
        this.onerror = null;
        this.src = p.image
          ? `/public/images/${p.image}`
          : '/public/images/placeholder.jpg';
      };
  
      const h3 = document.createElement('h3');
      h3.textContent = p.name;
  
      const pPrice = document.createElement('p');
      pPrice.className = 'price';
      pPrice.textContent = `$${price.toFixed(1)}`;
  
      link.appendChild(img);
      link.appendChild(h3);
      link.appendChild(pPrice);
  
      // ── Add to Cart button ─────────────────────────────────────────
      // Required by Phase 1 Point 3 + Phase 3
      const addBtn = document.createElement('button');
      addBtn.className = 'add-btn';
      addBtn.textContent = 'Add to Cart';
      addBtn.addEventListener('click', (e) => {
        e.preventDefault(); // prevent link navigation
        addToCart(p.pid, p.name, price, 1);
      });
  
      card.appendChild(link);
      card.appendChild(addBtn); // button sits below the link, outside it
      container.appendChild(card);
    });
}
  

// Update breadcrumb text in the sidebar/nav area
function updateBreadcrumb(categoryName) {
  const breadcrumb = document.getElementById('breadcrumb-nav');
  if (!breadcrumb) return;

  breadcrumb.innerHTML = '';

  const homeLink = document.createElement('a');
  homeLink.href = '/';
  homeLink.id = 'bc-home-init';
  homeLink.textContent = 'Home'; // safe: textContent

  const separator = document.createTextNode(' > ');

  const categorySpan = document.createElement('span');
  categorySpan.textContent = categoryName; // safe: textContent

  breadcrumb.appendChild(homeLink);
  breadcrumb.appendChild(separator);
  breadcrumb.appendChild(categorySpan);
}

/* =========================================
   PART 2: PRODUCT PAGE LOGIC (product.html)
========================================= */
async function initProductPage() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get('pid');

  if (!pid) {
    const main = document.querySelector('main');
    if (main) main.textContent = 'No product ID specified.'; // safe: textContent
    return;
  }

  try {
    const res = await fetch(`/api/product/${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error('Product not found');
    const product = await res.json();

    // Populate image
    const imgEl = document.querySelector('.product-detail-image img');
    if (imgEl) {
      imgEl.src = product.image
        ? `/public/images/${product.image}`
        : '/public/images/placeholder.jpg';
      imgEl.alt = product.name; // safe: direct property
      imgEl.onerror = function () {
        this.onerror = null;
        this.src = '/public/images/placeholder.jpg';
      };
    }

    // Populate text fields — all use textContent (safe)
    const titleEl = document.querySelector('.product-info h2');
    const descBox = document.querySelector('.description-box p');
    const descEl = document.querySelector(".product-info p:not(.price)");
    const priceEl = document.querySelector('.product-info .price');

    if (titleEl) titleEl.textContent = product.name;
    if (descBox) descBox.textContent = product.description || 'No description available.';
    else if (descEl) descEl.textContent = product.description || 'No description available.';
    if (priceEl) priceEl.textContent = `$${parseFloat(product.price).toFixed(1)}`;

    // XSS FIX: Breadcrumb on product page — use DOM methods, not innerHTML
    const breadcrumb = document.getElementById('breadcrumb-nav');
    if (breadcrumb) {
      breadcrumb.innerHTML = '';

      const homeLink = document.createElement('a');
      homeLink.href = '/';
      homeLink.textContent = 'Home'; // safe: textContent

      const sep1 = document.createTextNode(' > ');

      const productsLink = document.createElement('a');
      productsLink.href = '/index.html';
      productsLink.textContent = 'Products'; // safe: textContent

      const sep2 = document.createTextNode(' > ');

      const productSpan = document.createElement('span');
      productSpan.textContent = product.name; // safe: textContent — CRITICAL FIX

      breadcrumb.appendChild(homeLink);
      breadcrumb.appendChild(sep1);
      breadcrumb.appendChild(productsLink);
      breadcrumb.appendChild(sep2);
      breadcrumb.appendChild(productSpan);
    }

    // Activate Add to Cart button
    const addBtn = document.getElementById('add-to-cart-btn');
    if (addBtn) {
      addBtn.onclick = () => {
        const qtyInput = document.getElementById('product-qty');
        let quantity = 1;
        if (qtyInput) {
          quantity = parseInt(qtyInput.value);
          if (isNaN(quantity) || quantity < 1) quantity = 1;
        }
        addToCart(product.pid, product.name, parseFloat(product.price), quantity);
      };
    }
  } catch (err) {
    console.error(err);
    const main = document.querySelector('main');
    if (main) main.textContent = `Error loading product: ${err.message}`; // safe: textContent
  }
}

/* =========================================
   PART 3: SHOPPING CART LOGIC
========================================= */
function addToCart(pid, name, price, quantity = 1) {
  const existingItem = cart.find(item => item.pid == pid);
  if (existingItem) {
    existingItem.qty += quantity;
  } else {
    cart.push({ pid, name, price, qty: quantity });
  }
  saveCart();
  updateCartUI();
  alert(`Added ${quantity} x ${name} to cart!`);
}

// Only persist pid + qty — name/price always fetched fresh from server
function saveCart() {
  const minimal = cart.map(item => ({ pid: item.pid, qty: item.qty }));
  localStorage.setItem('cart', JSON.stringify(minimal));
}

// On every page load, re-fetch name/price from /api/product/:pid
async function restoreCart() {
  const stored = JSON.parse(localStorage.getItem('cart')) || [];
  cart = [];
  for (const entry of stored) {
    try {
      const res = await fetch(`/api/product/${entry.pid}`);
      if (res.ok) {
        const product = await res.json();
        cart.push({
          pid: product.pid,
          name: product.name,
          price: parseFloat(product.price),
          qty: entry.qty
        });
      }
    } catch (err) {
      console.error(`Failed to restore cart item pid=${entry.pid}`, err);
    }
  }
  updateCartUI();
}

// Remove a single item from the cart
function removeFromCart(pid) {
  cart = cart.filter(item => item.pid != pid);
  saveCart();
  updateCartUI();
}

// Clear the entire cart
function clearCart() {
  cart = [];
  saveCart();
  updateCartUI();
}

function updateCartUI() {
    const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  
    const trigger = document.querySelector('.shopping-list-trigger');
    if (trigger) {
      trigger.textContent = `Shopping List (Total: $${total.toFixed(1)})`;
    }
  
    const listContainer = document.querySelector('.shopping-list-content');
    if (!listContainer) return;
    listContainer.innerHTML = '';
  
    // ── Empty state ───────────────────────────────────────────────────
    if (cart.length === 0) {
      const p = document.createElement('p');
      p.className = 'cart-empty';         // handles padding + text-align
      p.textContent = 'Cart is empty';
      listContainer.appendChild(p);
      return;
    }
  
    // ── Items table ───────────────────────────────────────────────────
    const table = document.createElement('table');
    table.className = 'cart-table';       // handles width + border-collapse
  
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Product', 'Qty', 'Price', ''].forEach(text => {
      const th = document.createElement('th');
      th.className = 'cart-th';
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
  
    const tbody = document.createElement('tbody');
    cart.forEach(item => {
      const row = document.createElement('tr');
  
      const tdName = document.createElement('td');
      tdName.className = 'cart-td';
      tdName.textContent = item.name;
  
      const tdQty = document.createElement('td');
      tdQty.className = 'cart-td';
  
      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.value = item.qty;
      qtyInput.min = 1;
      qtyInput.max = 99;
      qtyInput.className = 'cart-qty-input'; // handles width + padding
  
      qtyInput.addEventListener('change', () => {
        const newQty = parseInt(qtyInput.value);
        if (isNaN(newQty) || newQty < 1) {
          qtyInput.value = item.qty;
          return;
        }
        item.qty = newQty;
        saveCart();
        updateCartUI();
      });
  
      qtyInput.addEventListener('blur', () => {
        if (isNaN(parseInt(qtyInput.value)) || parseInt(qtyInput.value) < 1) {
          qtyInput.value = item.qty;
        }
      });
  
      tdQty.appendChild(qtyInput);
  
      const tdPrice = document.createElement('td');
      tdPrice.className = 'cart-td';
      tdPrice.textContent = `$${(item.price * item.qty).toFixed(1)}`;
  
      const tdRemove = document.createElement('td');
      tdRemove.className = 'cart-td';
  
      const removeBtn = document.createElement('button');
      removeBtn.className = 'cart-remove-btn'; // handles all button styles
      removeBtn.textContent = '×';
      removeBtn.title = `Remove ${item.name}`;
      removeBtn.addEventListener('click', () => removeFromCart(item.pid));
      tdRemove.appendChild(removeBtn);
  
      row.appendChild(tdName);
      row.appendChild(tdQty);
      row.appendChild(tdPrice);
      row.appendChild(tdRemove);
      tbody.appendChild(row);
    });
  
    table.appendChild(tbody);
    listContainer.appendChild(table);
  
    // ── Total row ─────────────────────────────────────────────────────
    const totalRow = document.createElement('div');
    totalRow.className = 'cart-total';    // handles padding + font + border
    totalRow.textContent = `Total: $${total.toFixed(1)}`;
    listContainer.appendChild(totalRow);
  
    // ── Action buttons ────────────────────────────────────────────────
    const btnRow = document.createElement('div');
    btnRow.className = 'cart-actions';    // handles display:flex + gap + padding
  
    const checkoutBtn = document.createElement('button');
    checkoutBtn.className = 'cart-checkout-btn';
    checkoutBtn.textContent = 'Checkout';
    checkoutBtn.addEventListener('click', () => alert('Checkout coming soon!'));
  
    const clearBtn = document.createElement('button');
    clearBtn.className = 'cart-clear-btn';
    clearBtn.textContent = 'Clear Cart';
    clearBtn.addEventListener('click', () => {
      if (confirm('Clear all items from cart?')) clearCart();
    });
  
    btnRow.appendChild(checkoutBtn);
    btnRow.appendChild(clearBtn);
    listContainer.appendChild(btnRow);
}  

// Initialize cart dropdown toggle behaviour
function initCartDropdown() {
  const trigger = document.querySelector('.shopping-list-trigger');
  const dropdown = document.querySelector('.shopping-list');
  if (!trigger || !dropdown) return;

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
  });
}
