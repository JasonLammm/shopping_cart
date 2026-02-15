const sqlite3 = require('sqlite3').verbose();

// 1. Connect to the database
// 'shopping.db' will be created automatically in your project folder
const db = new sqlite3.Database('./shopping.db', (err) => {
    if (err) {
        console.error('Error opening database ' + err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // 2. Initialize Tables inside the callback
        // This ensures tables are created after connection is established
        initCategories();
        initProducts();
    }
});

// Function to create Categories table
function initCategories() {
    db.run(`CREATE TABLE IF NOT EXISTS categories (
        catid INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )`, (err) => {
        if (err) {
            console.log("Categories table already exists or error: " + err);
        } else {
            // 3. Insert Dummy Data (Only if table was just created/empty)
            // We use INSERT OR IGNORE to prevent duplicate errors on restart
            const insert = 'INSERT OR IGNORE INTO categories (catid, name) VALUES (?,?)';
            db.run(insert, [1, "Electronics"]);
            db.run(insert, [2, "Clothing"]);
            console.log("Categories initialized.");
        }
    });
}

// Function to create Products table
function initProducts() {
    // Note: We add an 'image' column to store the filename/path
    db.run(`CREATE TABLE IF NOT EXISTS products (
        pid INTEGER PRIMARY KEY AUTOINCREMENT,
        catid INTEGER,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT,
        image TEXT,
        FOREIGN KEY (catid) REFERENCES categories (catid)
    )`, (err) => {
        if (err) {
            console.log("Products table error: " + err);
        } else {
            // 4. Insert Dummy Data (At least 2 per category)
            const insert = 'INSERT OR IGNORE INTO products (pid, catid, name, price, description, image) VALUES (?,?,?,?,?,?)';
            
            // Category 1: Electronics
            db.run(insert, [1, 1, "Smartphone X", 699.99, "Latest model", "1.jpg"]);
            db.run(insert, [2, 1, "Wireless Earbuds", 129.50, "Noise cancelling", "2.jpg"]);
            
            // Category 2: Clothing
            db.run(insert, [3, 2, "Cotton T-Shirt", 19.99, "100% Cotton", "3.jpg"]);
            db.run(insert, [4, 2, "Denim Jeans", 49.99, "Classic fit", "4.jpg"]);
            
            console.log("Products initialized.");
        }
    });
}

// Export the db object to use in server.js
module.exports = db;
