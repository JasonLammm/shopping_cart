/* =========================================
   js/main.js
   PHASE 2B FINAL: Backend Integration + Shopping Cart
   ========================================= */

// --- Global Cart State ---
// Loads from LocalStorage so data persists on refresh
let cart = JSON.parse(localStorage.getItem('cart')) || [];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initialize Global UI (Cart & Navigation)
    updateCartUI();
    initCartDropdown();

    // 2. Detect Current Page and Run Specific Logic
    const isIndexPage = document.getElementById("product-container");
    const isProductPage = document.querySelector(".product-detail-view") || document.getElementById("product-details-container");

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
    // A. Load Categories for Sidebar
    await loadCategories();

    // B. Load All Products initially
    await fetchAndRenderProducts('all');

    // C. Setup Breadcrumb "Home" Click
    const homeLink = document.getElementById('bc-home');
    if (homeLink) {
        homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchAndRenderProducts('all');
            updateBreadcrumb('All Products');
            
            // Reset active category in sidebar
            document.querySelectorAll('.category-list li').forEach(li => li.classList.remove('active'));
            const allProdItem = document.querySelector('.category-list li[data-cat="all"]');
            if(allProdItem) allProdItem.classList.add('active');
        });
    }
}

// Fetch Categories from Server API
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error('Failed to load categories');
        const categories = await response.json();
        
        // Target the sidebar list
        const list = document.querySelector('.category-list');
        if (!list) return;

        // Reset list
        list.innerHTML = '';
        
        // 1. Create "All Products" Item (Plain LI, no <a href>)
        const allItem = document.createElement('li');
        allItem.textContent = "All Products";
        allItem.dataset.cat = "all";
        allItem.classList.add('active'); 
        allItem.style.cursor = "pointer"; // Make it look clickable
        list.appendChild(allItem);

        // 2. Add categories from DB (Plain LI, no <a href>)
        categories.forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat.name;
            li.dataset.cat = cat.catid; 
            li.style.cursor = "pointer"; // Make it look clickable
            list.appendChild(li);
        });

        // 3. Add Click Event Listeners
        const items = list.querySelectorAll('li');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                // e.preventDefault() is not strictly needed for LI, but good practice
                e.preventDefault(); 
                
                // Update UI (Active state)
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                // Fetch Products
                const catId = item.dataset.cat;
                fetchAndRenderProducts(catId);
                
                // Update Breadcrumb
                updateBreadcrumb(item.textContent);
            });
        });

    } catch (err) {
        console.error(err);
        const list = document.querySelector('.category-list');
        if(list) list.innerHTML = "<li>Error loading categories</li>";
    }
}

// Fetch Products (All or Filtered)
async function fetchAndRenderProducts(catId) {
    const container = document.getElementById("product-container");
    container.innerHTML = '<p>Loading products...</p>';

    try {
        let url = '/api/products';
        if (catId && catId !== 'all') {
            url += `?catid=${catId}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch products');
        const products = await response.json();
        
        renderProducts(products);

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Error loading products.</p>";
    }
}

// Render Product Cards
function renderProducts(products) {
    const container = document.getElementById("product-container");
    container.innerHTML = ""; // Clear existing content

    if (products.length === 0) {
        container.innerHTML = "<p>No products found in this category.</p>";
        return;
    }

    products.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";
        
        // Ensure price is a number for safe formatting
        const price = parseFloat(p.price) || 0;
        
        // Image Logic: Prefer thumbnail, fallback to main, fallback to placeholder
        const imgPath = p.image ? `images/thumb_${p.image}` : 'images/placeholder.jpg';
        const mainPath = p.image ? `images/${p.image}` : 'images/placeholder.jpg';

        card.innerHTML = `
            <a href="product.html?id=${p.pid}" style="text-decoration: none; color: inherit; display: block;">
                <img src="${imgPath}" 
                     alt="${p.name}" 
                     class="product-image"
                     onerror="this.onerror=null;this.src='${mainPath}';">
                
                <div class="product-info">
                    <h3>${p.name}</h3>
                    <p class="price">$${price.toFixed(1)}</p>
                </div>
            </a>
            <button class="add-btn">ADD TO CART</button>
        `;

        // Attach Event Listener to "Add to Cart" Button
        const btn = card.querySelector('.add-btn');
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from triggering the link
            e.preventDefault();
            addToCart(p.pid, p.name, price);
        });

        container.appendChild(card);
    });
}

function updateBreadcrumb(text) {
    const nav = document.getElementById("breadcrumb-nav");
    if (nav) nav.innerHTML = `Home > ${text}`;
}


/* =========================================
   PART 2: PRODUCT DETAILS PAGE (product.html)
   ========================================= */

async function initProductPage() {
    // 1. Get Product ID from URL
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("id");

    if (!pid) {
        document.querySelector("main").innerHTML = "<p class='error'>No product ID specified.</p>";
        return;
    }

    try {
        // 2. Fetch Product Data
        const res = await fetch(`/api/product/${pid}`);
        if (!res.ok) throw new Error("Product not found");
        const product = await res.json();

        // 3. Populate Image
        const imgEl = document.querySelector(".product-detail-image img");
        if(imgEl) {
            if (product.image) {
                imgEl.src = `images/${product.image}`;
                imgEl.alt = product.name;
                imgEl.onerror = function() {
                    this.onerror = null; 
                    this.src = 'images/placeholder.jpg';
                };
            } else {
                imgEl.src = 'images/placeholder.jpg';
            }
        }

        // 4. Populate Text Info
        const titleEl = document.querySelector(".product-info h2");
        const descBox = document.querySelector(".description-box p"); 
        const descEl = document.querySelector(".product-info p:not(.price)");
        const priceEl = document.querySelector(".product-info .price");

        if(titleEl) titleEl.textContent = product.name;
        
        if(descBox) {
            descBox.textContent = product.description || "No description available.";
        } else if(descEl) {
             descEl.textContent = product.description || "No description available.";
        }

        if(priceEl) priceEl.textContent = `$${parseFloat(product.price).toFixed(1)}`;

        // 5. Update Breadcrumb
        const breadcrumb = document.getElementById("breadcrumb-nav");
        if(breadcrumb) {
            breadcrumb.innerHTML = `<a href="index.html">Home</a> > Products > ${product.name}`;
        }

        // 6. Activate "Add to Cart" Button (UPDATED Logic)
        const addBtn = document.getElementById("add-to-cart-btn");
        if (addBtn) {
            addBtn.onclick = () => {
                // Get the quantity from the input box
                const qtyInput = document.getElementById("product-qty");
                let quantity = 1;

                if (qtyInput) {
                    quantity = parseInt(qtyInput.value);
                    // Basic validation to prevent adding 0 or negative numbers
                    if (isNaN(quantity) || quantity < 1) quantity = 1;
                }

                // Pass the quantity to addToCart
                addToCart(product.pid, product.name, parseFloat(product.price), quantity);
            };
        }

    } catch (err) {
        console.error(err);
        const main = document.querySelector("main");
        if(main) main.innerHTML = `<p class='error'>Error loading product: ${err.message}</p>`;
    }
}

/* =========================================
   PART 3: SHOPPING CART LOGIC
   ========================================= */
function addToCart(pid, name, price, quantity = 1) {
    // Check if item is already in cart
    const existingItem = cart.find(item => item.pid == pid);

    if (existingItem) {
        // Increment by the chosen quantity
        existingItem.qty += quantity;
    } else {
        // Add new item with the chosen quantity
        cart.push({ pid: pid, name: name, price: price, qty: quantity });
    }

    saveCart();
    updateCartUI();
    
    // Optional: Visual feedback
    alert(`Added ${quantity} x ${name} to cart!`);
}


function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Updates the Header UI (Total & Dropdown List)
function updateCartUI() {
    // 1. Calculate Total
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // 2. Update Header Text
    const trigger = document.querySelector('.shopping-list-trigger');
    if (trigger) {
        trigger.textContent = `Shopping List (Total: $${total.toFixed(1)})`;
    }

    // 3. Update Dropdown Content
    const listContainer = document.querySelector('.shopping-list-content');
    if (listContainer) {
        listContainer.innerHTML = ''; // Clear current list
        
        if (cart.length === 0) {
            listContainer.innerHTML = '<p style="padding:10px; text-align:center;">Cart is empty</p>';
            return;
        }

        // Create Table for items
        const table = document.createElement('table');
        table.style.width = '100%';
        
        cart.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding:5px;">${item.name}</td>
                <td style="padding:5px;">$${item.price}</td>
                <td style="padding:5px;">
                    <input type="number" min="1" value="${item.qty}" 
                           onchange="updateQty(${item.pid}, this.value)"
                           style="width: 40px;">
                </td>
                <td style="padding:5px;">
                    <button onclick="removeFromCart(${item.pid})" style="color:red; border:none; background:none; cursor:pointer;">&times;</button>
                </td>
            `;
            table.appendChild(row);
        });

        // Add Checkout / Total Row
        const totalRow = document.createElement('div');
        totalRow.style.padding = '10px';
        totalRow.style.fontWeight = 'bold';
        totalRow.style.textAlign = 'right';
        totalRow.style.borderTop = '1px solid #eee';
        totalRow.textContent = `Total: $${total.toFixed(1)}`;

        listContainer.appendChild(table);
        listContainer.appendChild(totalRow);
    }
}

// Helper: Toggle Dropdown
function initCartDropdown() {
    const trigger = document.querySelector('.shopping-list-trigger');
    const content = document.querySelector('.shopping-list-content');
    
    if (trigger && content) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            content.classList.toggle('active'); // Toggle visibility class
            // Note: You need CSS for .active { display: block; }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!content.contains(e.target) && e.target !== trigger) {
                content.classList.remove('active');
            }
        });
        
        // Prevent closing when clicking inside content
        content.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}

// Make these global so HTML onclick attributes can see them
window.updateQty = function(pid, newQty) {
    const item = cart.find(i => i.pid == pid);
    if (item) {
        item.qty = parseInt(newQty);
        if (item.qty <= 0) removeFromCart(pid);
        else {
            saveCart();
            updateCartUI();
        }
    }
};

window.removeFromCart = function(pid) {
    cart = cart.filter(item => item.pid != pid);
    saveCart();
    updateCartUI();
};
