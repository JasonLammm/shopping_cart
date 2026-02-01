document.addEventListener('DOMContentLoaded', () => {

    /* =========================================
       DOM ELEMENTS
       ========================================= */
    const productContainer = document.getElementById('product-container');
    const breadcrumbNav = document.getElementById('breadcrumb-nav');
    const shoppingListContainer = document.querySelector('.shopping-list');
    const cartWrapper = document.querySelector('.cart-wrapper');
    const cartTotalLabel = document.querySelector('.cart-wrapper > span');

    /* =========================================
       1. RENDER LOGIC (CATEGORIES & PRODUCTS)
       ========================================= */
    
    // Global function to allow inline onclick from HTML
    window.renderProducts = function(category) {
        if (!productContainer) return; // Exit if not on index page

        // Clear container
        productContainer.innerHTML = '';

        // Filter Data (Using global 'products' from data.js)
        const filtered = (category === 'all') 
            ? products 
            : products.filter(p => p.category === category);

        // Render HTML
        if (filtered.length === 0) {
            productContainer.innerHTML = '<p style="padding:20px; color:#666;">No products found in this category.</p>';
        } else {
            filtered.forEach(p => {
                const article = document.createElement('article');
                article.className = 'product-card';
                article.innerHTML = `
                    <a href="product.html">
                        <img src="${p.image}" alt="${p.name}" class="product-thumb">
                    </a>
                    <a href="product.html" class="product-name">${p.name}</a>
                    <div class="product-price">$${p.price.toFixed(1)}</div>
                    <button class="add-btn" data-name="${p.name}" data-price="${p.price}">ADD TO CART</button>
                `;
                productContainer.appendChild(article);
            });
        }

        // Update Breadcrumbs
        if (breadcrumbNav) {
            const catName = category.charAt(0).toUpperCase() + category.slice(1);
            breadcrumbNav.innerHTML = `
                <a href="#" onclick="renderProducts('all'); return false;">Home</a> &gt; 
                ${category === 'all' ? 'All Products' : catName}
            `;
        }

        // Re-attach listeners to the new buttons
        attachCartListeners();
    };

    // Attach click events to sidebar category links
    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if(productContainer) {
                e.preventDefault();
                const category = link.getAttribute('data-category');
                renderProducts(category);
            }
        });
    });

    /* =========================================
       2. SHOPPING CART LOGIC
       ========================================= */

    function updateCartTotal() {
        let total = 0;
        const cartItems = document.querySelectorAll('.shopping-list .cart-item');
        
        cartItems.forEach(item => {
            const qtyInput = item.querySelector('input');
            const priceEl = item.querySelector('.item-price');
            if (qtyInput && priceEl) {
                const price = parseFloat(priceEl.innerText.replace('$', ''));
                const qty = parseInt(qtyInput.value);
                if (!isNaN(price) && !isNaN(qty)) {
                    total += price * qty;
                }
            }
        });

        if (cartTotalLabel) {
            cartTotalLabel.innerText = `Shopping List (Total: $${total.toFixed(1)})`;
        }
    }

    function addItemToCart(name, price) {
        const existingItems = document.querySelectorAll('.shopping-list .cart-item');
        let found = false;

        existingItems.forEach(item => {
            const nameEl = item.querySelector('span:first-child');
            if (nameEl && nameEl.innerText === name) {
                const input = item.querySelector('input');
                input.value = parseInt(input.value) + 1;
                found = true;
                
                // Visual Flash
                item.style.backgroundColor = '#e8f5e9';
                setTimeout(() => item.style.backgroundColor = 'transparent', 300);
            }
        });

        if (!found) {
            const newItem = document.createElement('div');
            newItem.className = 'cart-item';
            // Create a safe, unique identifier from the product name (e.g., "Product Name 1" -> "product-name-1")
            const inputId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
            newItem.innerHTML = `
                <span>${name}</span>
                <!-- Added name and id attributes to the input -->
                <label>Qty: <input type="number" value="1" min="1" name="qty-${inputId}" id="qty-${inputId}"></label>
                <span class="item-price">$${price}</span>
            `;

            
            const checkoutBtn = document.querySelector('.checkout-btn');
            if (checkoutBtn) {
                shoppingListContainer.insertBefore(newItem, checkoutBtn);
            } else {
                shoppingListContainer.appendChild(newItem);
            }

            const input = newItem.querySelector('input');
            input.addEventListener('change', updateCartTotal);
            input.addEventListener('input', updateCartTotal);
        }

        updateCartTotal();
    }

    function attachCartListeners() {
        const addButtons = document.querySelectorAll('.add-btn');
        addButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                
                let name, price;
                
                if (btn.hasAttribute('data-name')) {
                    name = btn.getAttribute('data-name');
                    price = btn.getAttribute('data-price');
                } else {
                    const infoContainer = btn.closest('.detail-info');
                    if (infoContainer) {
                        name = infoContainer.querySelector('h1').innerText;
                        price = infoContainer.querySelector('.detail-price').innerText.replace('$','');
                    }
                }

                if(name && price) {
                    addItemToCart(name, price);

                    const originalText = btn.innerText;
                    btn.innerText = "Added!";
                    btn.style.backgroundColor = "#27ae60";
                    btn.style.color = "white";
                    btn.style.borderColor = "#27ae60";
                    
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.style.backgroundColor = "";
                        btn.style.color = "";
                        btn.style.borderColor = "";
                    }, 1000);
                }
            });
        });
    }

    /* =========================================
       3. INITIALIZATION
       ========================================= */

    if (productContainer) {
        renderProducts('all');
    } else {
        attachCartListeners();
    }

    // Image Slider
    const mainImage = document.querySelector('.main-image');
    if (mainImage) {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'slider-thumbnails';
        sliderContainer.style.marginTop = '15px';
        sliderContainer.style.display = 'flex';
        sliderContainer.style.gap = '15px';
        sliderContainer.style.justifyContent = 'center';

        const images = [
            mainImage.src,
            'https://via.placeholder.com/450/667eea/fff?text=Side+View', 
            'https://via.placeholder.com/450/764ba2/fff?text=Detail+View'
        ];

        images.forEach((imgSrc, index) => {
            const thumb = document.createElement('img');
            thumb.src = imgSrc;
            thumb.style.width = '70px';
            thumb.style.height = '70px';
            thumb.style.objectFit = 'cover';
            thumb.style.cursor = 'pointer';
            thumb.style.borderRadius = '12px';
            thumb.style.border = (index === 0) ? '3px solid #667eea' : '3px solid transparent';
            
            thumb.addEventListener('click', () => {
                mainImage.src = imgSrc;
                sliderContainer.querySelectorAll('img').forEach(t => t.style.border = '3px solid transparent');
                thumb.style.border = '3px solid #667eea';
            });
            sliderContainer.appendChild(thumb);
        });
        mainImage.parentNode.insertBefore(sliderContainer, mainImage.nextSibling);
    }
});
