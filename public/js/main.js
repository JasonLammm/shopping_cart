/* =========================================
   js/main.js
   PHASE 2B FINAL: Backend Integration + Shopping Cart
   ========================================= */


// --- Global Cart State ---
// Only stores { pid, qty } — name/price are fetched from server on restore
let cart = [];


document.addEventListener("DOMContentLoaded", async () => {
    // 1. Restore cart from localStorage by fetching name/price from server
    //    FIX #1: Name/price come from backend, not from localStorage
    await restoreCart();

    // 2. Initialize Global UI (Cart Dropdown & Navigation)
    initCartDropdown();

    // 3. Detect Current Page and Run Specific Logic
    const isIndexPage = document.getElementById("product-container");
    const isProductPage = document.querySelector(".product-detail-view") ||
                          document.getElementById("product-details-container");

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

    // FIX #2: Read catid from URL on page load so refresh restores the filter
    const params = new URLSearchParams(window.location.search);
    const catIdFromURL = params.get('catid') || 'all';
    await fetchAndRenderProducts(catIdFromURL);

    // Highlight the correct sidebar item if a catid is in the URL
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

    // Handle browser Back/Forward button navigation
    window.addEventListener('popstate', (e) => {
        const catId = e.state?.catId || 'all';
        fetchAndRenderProducts(catId);

        // Sync sidebar active state
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


// Fetch Categories from Server API and build Sidebar
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error('Failed to load categories');
        const categories = await response.json();

        const list = document.querySelector('.category-list');
        if (!list) return;

        list.innerHTML = '';

        // 1. "All Products" item
        const allItem = document.createElement('li');
        allItem.textContent = "All Products";
        allItem.dataset.cat = "all";
        allItem.classList.add('active');
        allItem.style.cursor = "pointer";
        list.appendChild(allItem);

        // 2. Categories from DB
        categories.forEach(cat => {
            const li = document.createElement('li');
            li.textContent = cat.name;
            li.dataset.cat = cat.catid;
            li.style.cursor = "pointer";
            list.appendChild(li);
        });

        // 3. Click Event Listeners
        const items = list.querySelectorAll('li');
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();

                // Update sidebar active state
                items.forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                const catId = item.dataset.cat;

                // FIX #2: Reflect catid in the URL query string
                const newUrl = catId === 'all'
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
        if (list) list.innerHTML = "<li>Error loading categories</li>";
    }
}


// Fetch Products (All or Filtered by catId)
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


// Render Product Cards on Homepage
function renderProducts(products) {
    const container = document.getElementById("product-container");
    container.innerHTML = "";

    if (products.length === 0) {
        container.innerHTML = "<p>No products found in this category.</p>";
        return;
    }

    products.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";

        const price = parseFloat(p.price) || 0;

        // Thumbnail for list; fallback to full image; fallback to placeholder
        const imgPath  = p.image ? `images/thumb_${p.image}` : 'images/placeholder.jpg';
        const mainPath = p.image ? `images/${p.image}`       : 'images/placeholder.jpg';

        card.innerHTML = `
            <a href="product.html?id=${p.pid}" style="text-decoration:none; color:inherit; display:block;">
                <img src="${imgPath}"
                     alt="${p.name}"
                     class="product-image"
                     onerror="this.onerror=null; this.src='${mainPath}';">
                <div class="product-info">
                    <h3>${p.name}</h3>
                    <p class="price">$${price.toFixed(1)}</p>
                </div>
            </a>
            <button class="add-btn">ADD TO CART</button>
        `;

        card.querySelector('.add-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            addToCart(p.pid, p.name, price);
        });

        container.appendChild(card);
    });
}


// FIX #4: Always render "Home" as a hyperlink so users can navigate back
function updateBreadcrumb(text) {
    const nav = document.getElementById("breadcrumb-nav");
    if (!nav) return;

    nav.innerHTML = `<a href="index.html" id="bc-home">Home</a> > ${text}`;

    // Re-attach SPA click handler on the Home link (index page only)
    const homeLink = document.getElementById('bc-home');
    if (homeLink && document.getElementById("product-container")) {
        homeLink.addEventListener('click', (e) => {
            e.preventDefault();
            fetchAndRenderProducts('all');
            updateBreadcrumb('All Products');
            history.pushState({ catId: 'all' }, '', window.location.pathname);

            document.querySelectorAll('.category-list li')
                    .forEach(li => li.classList.remove('active'));
            const allProdItem = document.querySelector('.category-list li[data-cat="all"]');
            if (allProdItem) allProdItem.classList.add('active');
        });
    }
}


/* =========================================
   PART 2: PRODUCT DETAILS PAGE (product.html)
   ========================================= */


async function initProductPage() {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("id");

    if (!pid) {
        document.querySelector("main").innerHTML = "<p class='error'>No product ID specified.</p>";
        return;
    }

    try {
        const res = await fetch(`/api/product/${pid}`);
        if (!res.ok) throw new Error("Product not found");
        const product = await res.json();

        // Populate Image
        // FIX #5: Use consistent "public/images/" prefix (matches renderProducts)
        const imgEl = document.querySelector(".product-detail-image img");
        if (imgEl) {
            imgEl.src = product.image
                ? `images/${product.image}`
                : 'images/placeholder.jpg';
            imgEl.alt = product.name;
            imgEl.onerror = function () {
                this.onerror = null;
                this.src = 'public/images/placeholder.jpg';
            };
        }

        // Populate Text Info
        const titleEl   = document.querySelector(".product-info h2");
        const descBox   = document.querySelector(".description-box p");
        const descEl    = document.querySelector(".product-info p:not(.price)");
        const priceEl   = document.querySelector(".product-info .price");

        if (titleEl)  titleEl.textContent  = product.name;
        if (descBox)  descBox.textContent  = product.description || "No description available.";
        else if (descEl) descEl.textContent = product.description || "No description available.";
        if (priceEl)  priceEl.textContent  = `$${parseFloat(product.price).toFixed(1)}`;

        // Update Breadcrumb (product page — plain links, no SPA handler needed)
        const breadcrumb = document.getElementById("breadcrumb-nav");
        if (breadcrumb) {
            breadcrumb.innerHTML =
                `<a href="index.html">Home</a> > Products > ${product.name}`;
        }

        // Activate "Add to Cart" Button with Quantity Input
        const addBtn = document.getElementById("add-to-cart-btn");
        if (addBtn) {
            addBtn.onclick = () => {
                const qtyInput = document.getElementById("product-qty");
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
        const main = document.querySelector("main");
        if (main) main.innerHTML = `<p class='error'>Error loading product: ${err.message}</p>`;
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


// FIX #1: Only persist pid + qty — name/price always come from the server
function saveCart() {
    const minimal = cart.map(item => ({ pid: item.pid, qty: item.qty }));
    localStorage.setItem('cart', JSON.stringify(minimal));
}


// FIX #1: On every page load, re-fetch name/price from /api/product/:pid
async function restoreCart() {
    const stored = JSON.parse(localStorage.getItem('cart')) || [];
    cart = [];

    for (const entry of stored) {
        try {
            const res = await fetch(`/api/product/${entry.pid}`);
            if (res.ok) {
                const product = await res.json();
                cart.push({
                    pid:   product.pid,
                    name:  product.name,
                    price: parseFloat(product.price),
                    qty:   entry.qty
                });
            }
        } catch (err) {
            console.error(`Failed to restore cart item pid=${entry.pid}`, err);
        }
    }

    updateCartUI();
}


// Updates the Header UI (Total Count, Dropdown List, and Checkout Button)
function updateCartUI() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

    // Update header trigger text
    const trigger = document.querySelector('.shopping-list-trigger');
    if (trigger) {
        trigger.textContent = `Shopping List (Total: $${total.toFixed(1)})`;
    }

    const listContainer = document.querySelector('.shopping-list-content');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (cart.length === 0) {
        listContainer.innerHTML =
            '<p style="padding:10px; text-align:center;">Cart is empty</p>';
        return;
    }

    // Cart Items Table
    const table = document.createElement('table');
    table.style.width = '100%';

    cart.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding:5px;">${item.name}</td>
            <td style="padding:5px;">$${item.price.toFixed(1)}</td>
            <td style="padding:5px;">
                <input type="number" min="1" value="${item.qty}"
                       onchange="updateQty(${item.pid}, this.value)"
                       style="width:40px;">
            </td>
            <td style="padding:5px;">
                <button onclick="removeFromCart(${item.pid})"
                        style="color:red; border:none; background:none; cursor:pointer;">
                    &times;
                </button>
            </td>
        `;
        table.appendChild(row);
    });

    // Total Row
    const totalRow = document.createElement('div');
    totalRow.style.cssText = 'padding:10px; font-weight:bold; text-align:right; border-top:1px solid #eee;';
    totalRow.textContent = `Total: $${total.toFixed(1)}`;

    // FIX #3: Checkout Button (required by Phase 1 checklist)
    const checkoutBtn = document.createElement('button');
    checkoutBtn.textContent = 'Checkout';
    checkoutBtn.className = 'checkout-btn';
    checkoutBtn.addEventListener('click', () => {
        // Redirect to your payment/checkout page
        window.location.href = 'checkout.html';
    });

    listContainer.appendChild(table);
    listContainer.appendChild(totalRow);
    listContainer.appendChild(checkoutBtn);
}


// Toggle the dropdown open/closed
function initCartDropdown() {
    const trigger = document.querySelector('.shopping-list-trigger');
    const content = document.querySelector('.shopping-list-content');

    if (trigger && content) {
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            content.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
            if (!content.contains(e.target) && e.target !== trigger) {
                content.classList.remove('active');
            }
        });

        content.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
}


// Exposed globally for inline onchange / onclick in table rows
window.updateQty = function (pid, newQty) {
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

window.removeFromCart = function (pid) {
    cart = cart.filter(item => item.pid != pid);
    saveCart();
    updateCartUI();
};
