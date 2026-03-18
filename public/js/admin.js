/* =========================================
   js/admin.js
   PHASE 4: XSS-safe admin panel
   - Client-side input validation added
   - All innerHTML replaced with DOM methods
========================================= */

// ← ADD THESE at the very top of admin.js
let csrfToken = '';

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (res.status === 401 || res.status === 403) {
    window.location.href = '/login';
    return null;
  }
  return res;
}

document.addEventListener('DOMContentLoaded', async () => {
    // Fetch CSRF token FIRST before any state-changing request
    const tokenRes = await fetch('/api/csrf-token');
    const tokenData = await tokenRes.json();
    csrfToken = tokenData.csrfToken;
    fetchCategories();
    fetchProducts();
  
    // ─── CATEGORY LOGIC ───────────────────────────────────────────────
    const catForm = document.getElementById('add-category-form');
    catForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('cat-name-input');
      const name = nameInput.value.trim();
  
      // XSS FIX: client-side validation before sending
      if (!name || name.length === 0 || name.length > 100) {
        alert('Category name must be between 1 and 100 characters.');
        return;
      }
      if (!/^[A-Za-z0-9 \-_]+$/.test(name)) {
        alert('Category name may only contain letters, numbers, spaces, hyphens and underscores.');
        return;
      }
  
      try {
        const res = await apiFetch('/api/categories', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ name })
        });
        if (!res) return;
        if (res.ok) {
          nameInput.value = '';
          fetchCategories();
          fetchProducts();
        } else {
          const data = await res.json();
          alert('Error: ' + data.error);
        }
      } catch (err) {
        console.error(err);
        alert('Network or Server Error');
      }
    });
  
    // ─── PRODUCT LOGIC ────────────────────────────────────────────────
    const prodForm = document.getElementById('product-form');
    const cancelBtn = document.getElementById('cancel-btn');
  
    prodForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pid = document.getElementById('prod-id').value;
      const isEdit = !!pid;
  
      // XSS FIX: client-side validation before sending
      const name = document.getElementById('prod-name').value.trim();
      const priceRaw = document.getElementById('prod-price').value;
      const price = parseFloat(priceRaw);
      const catid = document.getElementById('prod-cat').value;
      const description = document.getElementById('prod-desc').value.trim();
      const fileInput = document.getElementById('prod-image');
  
      if (!name || name.length === 0) {
        alert('Product name is required.');
        return;
      }
      if (name.length > 255) {
        alert('Product name must be under 255 characters.');
        return;
      }
      if (isNaN(price) || price < 0.01 || price > 999999.99) {
        alert('Price must be a valid number between 0.01 and 999,999.99.');
        return;
      }
      if (!catid) {
        alert('Please select a category.');
        return;
      }
      if (description.length > 1000) {
        alert('Description must be under 1000 characters.');
        return;
      }
      if (fileInput.files[0]) {
        const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowed.includes(fileInput.files[0].type)) {
          alert('Only JPEG, PNG, GIF and WebP images are allowed.');
          return;
        }
      }
  
      const formData = new FormData();
      formData.append('catid', catid);
      formData.append('name', name);
      formData.append('price', price);
      formData.append('description', description);
      if (fileInput.files[0]) {
        formData.append('image', fileInput.files[0]);
      }
  
      const url = isEdit ? `/api/products/${pid}` : '/api/products';
      const method = isEdit ? 'PUT' : 'POST';
  
      try {
        // In prodForm submit handler — fetch call at the bottom
        const res = await apiFetch(url, {
          method,
          headers: { 'x-csrf-token': csrfToken },  // ← header, NOT FormData field
          body: formData
        });
        if (!res) return;
        if (res.ok) {
          resetProductForm();
          fetchProducts();
        } else {
          const data = await res.json();
          alert('Error: ' + data.error);
        }
      } catch (err) {
        console.error(err);
        alert('Request failed');
      }
    });
  
    cancelBtn.addEventListener('click', resetProductForm);
  });
  
  // ─── HELPER: Fetch & Render Categories ──────────────────────────────
  async function fetchCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      const categories = await res.json();
  
      const tbody = document.getElementById('category-table-body');
      tbody.innerHTML = '';
  
      const select = document.getElementById('prod-cat');
      select.innerHTML = '';
  
      categories.forEach(cat => {
        // XSS FIX: build table row with DOM methods, not innerHTML
        const tr = document.createElement('tr');
  
        const tdId = document.createElement('td');
        tdId.textContent = cat.catid;
  
        const tdName = document.createElement('td');
        tdName.textContent = cat.name; // safe: textContent, never innerHTML
  
        const tdActions = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteCategory(cat.catid)); // safe: no inline onclick

        // Edit category button — INSERT AFTER line 150, BEFORE tdActions.appendChild(delBtn)
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => {
        const newName = prompt(`New name for "${cat.name}":`, cat.name);
        if (!newName || !newName.trim()) return;
        apiFetch(`/api/categories/${cat.catid}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ name: newName.trim() })
        }).then(res => {
          if (!res) return;   // ← null check for 401/403
          res.ok
            ? fetchCategories()
            : res.json().then(d => alert('Error: ' + d.error));
          });
        });
        tdActions.appendChild(editBtn);          // ← add edit first
        tdActions.appendChild(document.createTextNode(' '));

        tdActions.appendChild(delBtn);
  
        tr.appendChild(tdId);
        tr.appendChild(tdName);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
  
        // XSS FIX: build dropdown option with DOM, not innerHTML
        const option = document.createElement('option');
        option.value = cat.catid;
        option.textContent = cat.name; // safe: textContent
        select.appendChild(option);
      });
    } catch (err) {
      console.error('fetchCategories error:', err);
    }
  }
  
  // ─── HELPER: Fetch & Render Products ────────────────────────────────
  async function fetchProducts() {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const products = await res.json();
  
      const tbody = document.getElementById('product-table-body');
      tbody.innerHTML = '';
  
      products.forEach(p => {
        // XSS FIX: build product row with DOM methods, not innerHTML
        const tr = document.createElement('tr');
  
        const tdId = document.createElement('td');
        tdId.textContent = p.pid;
  
        const tdImg = document.createElement('td');
        if (p.image) {
          const img = document.createElement('img');
          img.src = `/public/images/thumb_${p.image}`;
          img.alt = p.name; // safe: direct property assignment
          img.width = 50;
          img.onerror = function () {
            this.onerror = null;
            this.src = '/public/images/placeholder.jpg';
          };
          tdImg.appendChild(img);
        } else {
          tdImg.textContent = 'No image';
        }
  
        const tdName = document.createElement('td');
        tdName.textContent = p.name; // safe: textContent
  
        const tdPrice = document.createElement('td');
        tdPrice.textContent = `$${parseFloat(p.price).toFixed(2)}`;
  
        const tdCat = document.createElement('td');
        tdCat.textContent = p.category_name || p.catid; // safe: textContent
  
        const tdActions = document.createElement('td');
  
        const editBtn = document.createElement('button');
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => editProduct(p)); // safe: no inline onclick
  
        const delBtn = document.createElement('button');
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteProduct(p.pid)); // safe: no inline onclick
  
        tdActions.appendChild(editBtn);
        tdActions.appendChild(document.createTextNode(' '));
        tdActions.appendChild(delBtn);
  
        tr.appendChild(tdId);
        tr.appendChild(tdImg);
        tr.appendChild(tdName);
        tr.appendChild(tdPrice);
        tr.appendChild(tdCat);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('fetchProducts error:', err);
    }
  }
  
  // ─── HELPER: Pre-fill form for Edit ─────────────────────────────────
  function editProduct(product) {
    document.getElementById('prod-id').value = product.pid;
    document.getElementById('prod-cat').value = product.catid;
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-desc').value = product.description || '';
  
    const imgText = document.getElementById('current-image-text');
    const imgNameSpan = document.getElementById('img-name');
    if (product.image) {
      imgNameSpan.textContent = product.image; // safe: textContent
      imgText.classList.remove('hidden');
    } else {
      imgText.classList.add('hidden');
    }
  
    document.getElementById('form-title').textContent = 'Edit Product';
    document.getElementById('submit-btn').textContent = 'Update Product';
    document.getElementById('cancel-btn').classList.remove('hidden');
    document.getElementById('product-form-container').scrollIntoView({ behavior: 'smooth' });
  }
  
  // ─── HELPER: Reset product form back to Add mode ─────────────────────
  function resetProductForm() {
    document.getElementById('product-form').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('form-title').textContent = 'Add New Product';
    document.getElementById('submit-btn').textContent = 'Save Product';
    document.getElementById('cancel-btn').classList.add('hidden');
    document.getElementById('current-image-text').classList.add('hidden');
  }
  
  // ─── HELPER: Delete Category ─────────────────────────────────────────
  async function deleteCategory(catid) {
    if (!confirm('Delete this category? Associated products will be unlinked.')) return;
    try {
      const res = await apiFetch(`/api/categories/${catid}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken }  // ← add this
      });      
      if(!res) return;
      if (res.ok) {
        fetchCategories();
        fetchProducts();
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  }
  
  // ─── HELPER: Delete Product ───────────────────────────────────────────
  async function deleteProduct(pid) {
    if (!confirm('Delete this product?')) return;
    try {
      const res = await apiFetch(`/api/products/${pid}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrfToken }  // ← add this
      });      
      if (!res) return;
      if (res.ok) {
        fetchProducts();
      } else {
        const data = await res.json();
        alert('Error: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  }
  