// public/js/admin.js

document.addEventListener('DOMContentLoaded', () => {
    fetchCategories();
    fetchProducts();
    
    // --- CATEGORY LOGIC ---
    
    const catForm = document.getElementById('add-category-form');
    catForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('cat-name-input').value;

            // ... inside catForm.addEventListener ...
        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            
            if (res.ok) {
                document.getElementById('cat-name-input').value = '';
                fetchCategories(); 
                fetchProducts(); 
            } else {
                // --- NEW: Read the actual error message from server ---
                const data = await res.json();
                alert('Error: ' + data.error); 
            }
        } catch (err) {
            console.error(err);
            alert("Network or Server Error");
        }
    });

    // --- PRODUCT LOGIC ---

    const prodForm = document.getElementById('product-form');
    const cancelBtn = document.getElementById('cancel-btn');

    // Handle Add/Edit Submit
    prodForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pid = document.getElementById('prod-id').value;
        const isEdit = !!pid;
        
        const formData = new FormData();
        formData.append('catid', document.getElementById('prod-cat').value);
        formData.append('name', document.getElementById('prod-name').value);
        formData.append('price', document.getElementById('prod-price').value);
        formData.append('description', document.getElementById('prod-desc').value);
        
        const fileInput = document.getElementById('prod-image');
        if (fileInput.files[0]) {
            formData.append('image', fileInput.files[0]);
        }

        const url = isEdit ? `/api/products/${pid}` : '/api/products';
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                body: formData
            });

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

// --- HELPER FUNCTIONS ---

async function fetchCategories() {
    const res = await fetch('/api/categories');
    const categories = await res.json();
    
    // Populate Table
    const tbody = document.getElementById('category-table-body');
    tbody.innerHTML = '';
    
    // Populate Dropdown
    const select = document.getElementById('prod-cat');
    select.innerHTML = '<option value="">Select Category</option>';

    categories.forEach(cat => {
        // Table Row
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${cat.catid}</td>
            <td><input type="text" value="${cat.name}" id="cat-name-${cat.catid}"></td>
            <td>
                <button class="edit" onclick="updateCategory(${cat.catid})">Update</button>
                <button class="delete" onclick="deleteCategory(${cat.catid})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);

        // Dropdown Option
        const opt = document.createElement('option');
        opt.value = cat.catid;
        opt.textContent = cat.name;
        select.appendChild(opt);
    });
}

async function fetchProducts() {
    const res = await fetch('/api/products'); // Fetch all
    const products = await res.json();
    
    const tbody = document.getElementById('product-table-body');
    tbody.innerHTML = '';

    products.forEach(p => {
        const tr = document.createElement('tr');
        // Show thumbnail if available, else standard image
        const imgPath = p.image ? `images/thumb_${p.image}` : ''; 
        
        tr.innerHTML = `
            <td>${p.pid}</td>
            <td><img src="${imgPath}" height="50" alt="img" onerror="this.style.display='none'"></td>
            <td>${p.name}</td>
            <td>$${p.price}</td>
            <td>${p.catid}</td>
            <td>
                <button class="edit" onclick='editProduct(${JSON.stringify(p)})'>Edit</button>
                <button class="delete" onclick="deleteProduct(${p.pid})">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- ACTION FUNCTIONS (Called from HTML onclick) ---

async function updateCategory(id) {
    const newName = document.getElementById(`cat-name-${id}`).value;
    await fetch(`/api/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName })
    });
    fetchCategories();
}

async function deleteCategory(id) {
    if(!confirm("Delete this category?")) return;
    await fetch(`/api/categories/${id}`, { method: 'DELETE' });
    fetchCategories();
    fetchProducts();
}

async function deleteProduct(id) {
    if(!confirm("Delete this product?")) return;
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    fetchProducts();
}

function editProduct(product) {
    document.getElementById('form-title').textContent = 'Edit Product ID: ' + product.pid;
    document.getElementById('prod-id').value = product.pid;
    document.getElementById('prod-cat').value = product.catid;
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-price').value = product.price;
    document.getElementById('prod-desc').value = product.description;
    
    document.getElementById('submit-btn').textContent = 'Update Product';
    document.getElementById('cancel-btn').classList.remove('hidden');
    
    // Optional: Show current image name
    if (product.image) {
        document.getElementById('current-image-text').classList.remove('hidden');
        document.getElementById('img-name').textContent = product.image;
    }
}

function resetProductForm() {
    document.getElementById('product-form').reset();
    document.getElementById('form-title').textContent = 'Add New Product';
    document.getElementById('prod-id').value = '';
    document.getElementById('submit-btn').textContent = 'Save Product';
    document.getElementById('cancel-btn').classList.add('hidden');
    document.getElementById('current-image-text').classList.add('hidden');
}
