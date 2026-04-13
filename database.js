const sqlite3 = require('sqlite3').verbose();
const bcrypt  = require('bcrypt');

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
        initUsers();
        initOrders();
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

function initUsers() {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      userid    INTEGER PRIMARY KEY AUTOINCREMENT,
      email     TEXT    NOT NULL UNIQUE,
      password  TEXT    NOT NULL,
      name      TEXT    NOT NULL,
      isAdmin   INTEGER NOT NULL DEFAULT 0
    )`, (err) => {
      if (err) {
        console.log('Users table error: ' + err);
      } else {
        // Pre-hash passwords with salt rounds = 12
        const adminHash = bcrypt.hashSync('Admin@1234', 12);
        const userHash  = bcrypt.hashSync('User@1234', 12);
  
        const insert = `INSERT OR IGNORE INTO users
                        (userid, email, password, name, isAdmin)
                        VALUES (?, ?, ?, ?, ?)`;
  
        db.run(insert, [1, 'admin@shop.com',  adminHash, 'Admin',   1]);
        db.run(insert, [2, 'alice@shop.com',  userHash,  'Alice',   0]);
  
        console.log('Users initialized.');
      }
    });
  }

// Export the db object to use in server.js

function initOrders() {
    db.run(`CREATE TABLE IF NOT EXISTS orders (
      orderid           INTEGER PRIMARY KEY AUTOINCREMENT,
      userid            INTEGER NOT NULL,
      email             TEXT NOT NULL,
      currency          TEXT NOT NULL,
      merchant_email    TEXT NOT NULL,
      salt              TEXT NOT NULL,
      digest            TEXT NOT NULL,
      total             REAL NOT NULL,
      status            TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userid) REFERENCES users(userid)
    )`, (err) => {
      if (err) console.log('Orders table error: ' + err);
      else console.log('Orders table initialized.');
    });
  
    db.run(`CREATE TABLE IF NOT EXISTS order_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      orderid   INTEGER NOT NULL,
      pid       INTEGER NOT NULL,
      quantity  INTEGER NOT NULL,
      price     REAL NOT NULL,
      FOREIGN KEY (orderid) REFERENCES orders(orderid),
      FOREIGN KEY (pid)     REFERENCES products(pid)
    )`, (err) => {
      if (err) console.log('Order items table error: ' + err);
      else console.log('Order items table initialized.');
    });
  }
  
module.exports = db;
