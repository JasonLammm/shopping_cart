/* =========================================
   js/main.js
   MAIN APPLICATION LOGIC
   ========================================= */

// Global Cart State (Resets on refresh as per original design)
let cartTotal = 0;
let cart = [];

document.addEventListener("DOMContentLoaded", () => {
    // 1. Identify which page we are on
    const isIndexPage = document.getElementById("product-container");
    const isProductPage = document.querySelector(".product-detail-view");

    // 2. Initialize the specific page logic
    if (isIndexPage) {
        initHomePage();
    } else if (isProductPage) {
        initProductPage();
    }

    // 3. Initialize Global Cart Listeners (if any exist in header)
    // (The cart display is updated when items are added)
});


/* =========================================
   HOME PAGE FUNCTIONS (index.html)
   ========================================= */
function initHomePage() {
    // Initial Render of all products
    renderProducts('all');

    // Attach Click Listeners to Sidebar Categories
    const categoryLinks = document.querySelectorAll('.category-link');
    categoryLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const category = link.getAttribute('data-category');
            renderProducts(category);
            updateBreadcrumb(category);
        });
    });
}

function renderProducts(category) {
    const container = document.getElementById("product-container");
    container.innerHTML = ""; // Clear existing content

    // Filter products based on category
    const filteredProducts = category === 'all' 
        ? products 
        : products.filter(p => p.category === category);

    if (filteredProducts.length === 0) {
        container.innerHTML = "<p>No products found in this category.</p>";
        return;
    }

    // Create HTML for each product
    filteredProducts.forEach(product => {
        // Create Card
        const card = document.createElement("div");
        card.className = "product-card"; // Make sure to add CSS for this class

        // Inner HTML: Note the href points to product.html with ?id=...
        card.innerHTML = `
            <a href="product.html?id=${product.id}" style="text-decoration: none; color: inherit;">
                <img src="${product.image}" alt="${product.name}" style="width:100%; border-radius: 5px;">
                <h4>${product.name}</h4>
                <p class="price">$${product.price.toFixed(1)}</p>
            </a>
            <button class="add-btn" onclick="addToCart(${product.id})">Add to Cart</button>
        `;

        container.appendChild(card);
    });
}

function updateBreadcrumb(category) {
    const nav = document.getElementById("breadcrumb-nav");
    const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
    // Re-bind the Home click to renderProducts('all')
    nav.innerHTML = `<a href="#" id="bc-home">Home</a> &gt; ${categoryName === 'All' ? 'All Products' : categoryName}`;
    
    document.getElementById("bc-home").addEventListener("click", (e) => {
        e.preventDefault();
        renderProducts('all');
        updateBreadcrumb('all');
    });
}


/* =========================================
   PRODUCT PAGE FUNCTIONS (product.html)
   ========================================= */
function initProductPage() {
    // 1. Get the Product ID from the URL (e.g., product.html?id=2)
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    
    // 2. Find the product in the database
    const product = products.find(p => p.id == idParam);

    if (!product) {
        document.querySelector("main").innerHTML = "<h2>Product not found.</h2><a href='index.html'>Return Home</a>";
        return;
    }

    // 3. Inject Data into HTML
    
    // Breadcrumbs
    const breadcrumbs = document.querySelector(".breadcrumbs");
    breadcrumbs.innerHTML = `
        <a href="index.html">Home</a> &gt; 
        <a href="index.html">${capitalize(product.category)}</a> &gt; 
        <span>${product.name}</span>
    `;

    // Main Image
    const imgElement = document.querySelector(".main-image");
    imgElement.src = product.image;
    imgElement.alt = product.name;

    // Title & Price
    document.querySelector(".detail-info h1").textContent = product.name;
    document.querySelector(".detail-price").textContent = "$" + product.price.toFixed(1);

    // Description (Dynamic Mockup)
    document.querySelector(".detail-desc").textContent = 
        `This is a detailed view of ${product.name}. It belongs to the ${product.category} category ` +
        `and is currently one of our best sellers. Quality guaranteed. ` +
        `Lorem ipsum dolor sit amet, consectetur adipiscing elit.`;

    // Add to Cart Button
    const addBtn = document.querySelector(".detail-info .add-btn");
    addBtn.onclick = () => {
        addToCart(product.id);
    };
}


/* =========================================
   SHARED FUNCTIONS (Cart & Utils)
   ========================================= */

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    
    if (product) {
        // Check if item already exists in cart
        const existingItem = cart.find(item => item.id === productId);

        if (existingItem) {
            existingItem.count++;
        } else {
            cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                count: 1
            });
        }

        updateCartUI();
        // Removed alert() to make the UI update smoother
    }
}


function updateCartUI() {
    // 1. Calculate new total
    const total = cart.reduce((sum, item) => sum + (item.price * item.count), 0);

    // 2. Update the total label in the header
    const cartDisplay = document.querySelector(".cart-wrapper span");
    if (cartDisplay) {
        cartDisplay.textContent = `Shopping List (Total: $${total.toFixed(1)})`;
    }

    // 3. Render the list of items
    const shoppingListDiv = document.querySelector(".shopping-list");
    if (shoppingListDiv) {
        // Clear current content
        shoppingListDiv.innerHTML = "";

        // If cart is empty
        if (cart.length === 0) {
            const emptyMsg = document.createElement("div");
            emptyMsg.textContent = "Cart is empty";
            emptyMsg.style.padding = "10px";
            shoppingListDiv.appendChild(emptyMsg);
        } else {
            // Create the list (<ul>)
            const ul = document.createElement("ul");
            ul.style.listStyle = "none";
            ul.style.padding = "10px";
            ul.style.margin = "0";

            cart.forEach(item => {
                const li = document.createElement("li");
                li.style.borderBottom = "1px solid #eee";
                li.style.padding = "5px 0";
                li.style.display = "flex";
                li.style.justifyContent = "space-between";
                
                li.innerHTML = `
                    <span>${item.name} <small>(x${item.count})</small></span>
                    <span>$${(item.price * item.count).toFixed(1)}</span>
                `;
                ul.appendChild(li);
            });

            shoppingListDiv.appendChild(ul);
        }

        // 4. Re-add the Checkout button (since we cleared innerHTML)
        const checkoutBtn = document.createElement("button");
        checkoutBtn.className = "checkout-btn";
        checkoutBtn.textContent = "Checkout";
        checkoutBtn.onclick = handleCheckout; // Attach checkout logic here if needed
        
        // Style the button slightly to separate it from list
        checkoutBtn.style.width = "100%";
        checkoutBtn.style.marginTop = "10px";
        
        shoppingListDiv.appendChild(checkoutBtn);
    }
}

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function handleCheckout() {
    // 1. Validation: Ensure cart is not empty
    if (cart.length === 0) {
        alert("Your cart is empty! Please add items before checking out.");
        return;
    }

    // 2. Calculate final total
    const total = cart.reduce((sum, item) => sum + (item.price * item.count), 0);

    // 3. User Confirmation
    if (!confirm(`Proceed to payment? Total amount: $${total.toFixed(1)}`)) {
        return;
    }

    // 4. Prepare Payload
    // We send the cart array. In a real app, the server should recalculate 
    // prices to prevent tampering, but sending IDs and quantities is standard.
    const orderData = {
        items: cart,
        total: total,
        currency: "USD",
        timestamp: new Date().toISOString()
    };

    // 5. Send to Server (Assuming an endpoint like /api/checkout)
    // If you haven't built the backend yet, the .catch() block will handle the demo.
    fetch('/api/checkout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error("Server response was not ok.");
        }
    })
    .then(data => {
        // SUCCESS: Backend processed the order
        alert("Order success! Transaction ID: " + (data.transactionId || "N/A"));
        cart = [];      // Clear Global State
        updateCartUI(); // Clear UI
    })
    .catch(error => {
        // ERROR / DEMO MODE: 
        // If the fetch fails (e.g., 404 Not Found because backend is missing),
        // we simulate a success for the frontend demo.
        console.warn("Backend API not reachable. Performing client-side checkout simulation.");
        
        alert(`[Demo Mode] Payment processed successfully!\nTotal Charged: $${total.toFixed(1)}`);
        
        cart = [];      // Clear Global State
        updateCartUI(); // Clear UI
    });
}
