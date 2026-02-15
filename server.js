// server.js
const express = require('express');
const app = express();
const path = require('path');
const db = require('./database.js');
const multer = require('multer');
const fs = require('fs');
const sharp = require('sharp'); // REQUIRED: npm install sharp

// 1. Configure Multer for File Uploads
// Requirement: Validation (Size <= 10MB, Image format)
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'public/images';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        // Temporary name; we will rename it using the product ID later
        cb(null, 'temp_' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed!'));
    }
});

// 2. Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- READ APIs ---

app.get('/api/categories', (req, res) => {
    db.all("SELECT * FROM categories", [], (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/products', (req, res) => {
    const catid = req.query.catid;
    let sql = "SELECT * FROM products";
    let params = [];
    if (catid) {
        sql += " WHERE catid = ?";
        params.push(catid);
    }
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/product/:id', (req, res) => {
    db.get("SELECT * FROM products WHERE pid = ?", [req.params.id], (err, row) => {
        if (err) return res.status(400).json({ error: err.message });
        res.json(row);
    });
});

// --- WRITE APIs (Phase 2B) ---

// Helper function to process image (Rename & Resize)
const processImage = (file, pid, callback) => {
    const oldPath = file.path;
    const extension = path.extname(file.originalname);
    const newFilename = `${pid}${extension}`;
    const newPath = path.join('public/images', newFilename);
    const thumbFilename = `thumb_${pid}${extension}`;
    const thumbPath = path.join('public/images', thumbFilename);

    // 1. Rename original file
    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            console.error("Rename error:", err);
            return callback(err);
        }

        // 2. Create Thumbnail (Sharp)
        sharp(newPath)
            .resize(300, 300, { fit: 'inside' }) // Resize to reasonable thumbnail size
            .toFile(thumbPath, (err, info) => {
                if (err) console.error("Thumbnail error:", err);
                // Return the main filename
                callback(null, newFilename);
            });
    });
};

// POST /api/products: Add a new product
app.post('/api/products', upload.single('image'), (req, res) => {
    const { name, price, description, catid } = req.body;
    const file = req.file;

    // Validation
    if (!name || !price || !catid || !file) {
        return res.status(400).json({ error: "Missing required fields or image" });
    }

    const sql = "INSERT INTO products (catid, name, price, description, image) VALUES (?,?,?,?,?)";
    // Insert with placeholder image first
    db.run(sql, [catid, name, price, description, file.filename], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        
        const pid = this.lastID;
        
        // Process Image (Rename + Resize)
        processImage(file, pid, (err, newFilename) => {
            if (err) return res.status(500).json({ error: "Image processing failed" });

            // Update DB with correct filename
            db.run("UPDATE products SET image = ? WHERE pid = ?", [newFilename, pid], (err) => {
                if (err) console.error("DB Update error:", err);
                res.json({ message: "Product created", pid: pid, image: newFilename });
            });
        });
    });
});

// PUT /api/products/:id: Update a product (New Requirement)
app.put('/api/products/:id', upload.single('image'), (req, res) => {
    const { name, price, description, catid } = req.body;
    const pid = req.params.id;
    const file = req.file;

    if (!name || !price || !catid) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    if (file) {
        // If new image provided, process it and update everything
        processImage(file, pid, (err, newFilename) => {
            if (err) return res.status(500).json({ error: "Image processing failed" });
            
            const sql = "UPDATE products SET name=?, price=?, description=?, catid=?, image=? WHERE pid=?";
            db.run(sql, [name, price, description, catid, newFilename, pid], function(err) {
                if (err) return res.status(400).json({ error: err.message });
                res.json({ message: "Product updated with new image", changes: this.changes });
            });
        });
    } else {
        // Update text only
        const sql = "UPDATE products SET name=?, price=?, description=?, catid=? WHERE pid=?";
        db.run(sql, [name, price, description, catid, pid], function(err) {
            if (err) return res.status(400).json({ error: err.message });
            res.json({ message: "Product updated", changes: this.changes });
        });
    }
});

// DELETE /api/products/:id
app.delete('/api/products/:id', (req, res) => {
    // Optional: Fetch image name first to delete file from disk
    db.run("DELETE FROM products WHERE pid = ?", req.params.id, function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: "Deleted", changes: this.changes });
    });
});

// --- CATEGORY APIs (New Requirement) ---

app.post('/api/categories', (req, res) => {
    if (!req.body.name) return res.status(400).json({ error: "Name required" });
    db.run("INSERT INTO categories (name) VALUES (?)", [req.body.name], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ catid: this.lastID, name: req.body.name });
    });
});

app.put('/api/categories/:id', (req, res) => {
    if (!req.body.name) return res.status(400).json({ error: "Name required" });
    db.run("UPDATE categories SET name = ? WHERE catid = ?", [req.body.name, req.params.id], function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ changes: this.changes });
    });
});

app.delete('/api/categories/:id', (req, res) => {
    db.run("DELETE FROM categories WHERE catid = ?", req.params.id, function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ changes: this.changes });
    });
});

// Start Server
const PORT = 3001;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
