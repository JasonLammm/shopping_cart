/* =========================================
   server.js
   PHASE 4: XSS Prevention additions marked with [PHASE 4]
   All original Phase 2/3 functionality preserved
========================================= */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp'); // run: npm install sharp
const db      = require('./database');

const app  = express();
app.disable('x-powered-by');
const PORT = 3001;

// =========================================
// [PHASE 4] Content Security Policy Header
// Applied globally before all other middleware
// =========================================
// ── SECTION 1: CSP middleware (near top of file) ──────────────────
app.use((req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'", // FIXED
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
      ].join('; ')
    );
    next();
  });
  
  // ── SECTION 2: Static file serving (below CSP middleware) ─────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));          // ADDED
  app.use('/public', express.static(path.join(__dirname, 'public'))); // KEPT

// =========================================
// MULTER — Image Upload Configuration
// Saves to public/images/, validates type + size
// =========================================
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'images'));
  },
  filename: (req, file, cb) => {
    // Use timestamp + original extension to avoid filename collisions
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF and WebP images are allowed.'));
    }
  }
});

// =========================================
// [PHASE 4] SERVER-SIDE VALIDATION HELPERS
// =========================================

// Strips all HTML tags to prevent stored XSS
function stripHTML(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

// Validates a category name: letters, numbers, spaces, hyphens, underscores only
function validateCategoryName(name) {
  if (!name || typeof name !== 'string') return null;
  const cleaned = stripHTML(name).trim();
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  if (!/^[A-Za-z0-9 \-_]+$/.test(cleaned)) return null;
  return cleaned;
}

// Validates all product fields and returns cleaned values or errors
function validateProduct(body) {
  const errors = [];

  const name = stripHTML(body.name || '').trim();
  if (!name || name.length === 0) errors.push('Product name is required.');
  if (name.length > 255) errors.push('Product name must be under 255 characters.');

  const price = parseFloat(body.price);
  if (isNaN(price) || price < 0.01 || price > 999999.99)
    errors.push('Price must be a number between 0.01 and 999,999.99.');

  const catid = parseInt(body.catid);
  if (isNaN(catid) || catid < 1)
    errors.push('A valid category is required.');

  const description = stripHTML(body.description || '').trim();
  if (description.length > 1000)
    errors.push('Description must be under 1000 characters.');

  return { errors, cleaned: { name, price, catid, description } };
}

// =========================================
// THUMBNAIL HELPER
// Creates a 300x300 thumbnail prefixed with thumb_
// Falls back gracefully if sharp is unavailable
// =========================================
async function createThumbnail(filename) {
  try {
    const src  = path.join(__dirname, 'public', 'images', filename);
    const dest = path.join(__dirname, 'public', 'images', `thumb_${filename}`);
    await sharp(src).resize(300, 300, { fit: 'cover' }).toFile(dest);
  } catch (err) {
    // Non-fatal: thumbnail generation is a convenience, not a blocker
    console.warn('Thumbnail generation failed:', err.message);
  }
}

// =========================================
// PAGE ROUTES — Serve HTML files
// =========================================

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Product detail page
app.get('/product.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// Admin panel page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// =========================================
// API ROUTES — Categories
// =========================================

// GET /api/categories — return all categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT catid, name FROM categories ORDER BY catid ASC', [], (err, rows) => {
    if (err) {
      console.error('GET /api/categories error:', err.message);
      return res.status(500).json({ error: 'Database error.' });
    }
    res.json(rows);
  });
});

// POST /api/categories — add a new category
// [PHASE 4] Validates name with validateCategoryName()
app.post('/api/categories', (req, res) => {
  const name = validateCategoryName(req.body.name); // [PHASE 4]
  if (!name) {
    return res.status(400).json({
      error: 'Invalid category name. Use letters, numbers, spaces, hyphens or underscores only (max 100 chars).'
    });
  }

  // Parameterized query — SQL injection safe
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'A category with that name already exists.' });
      }
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    res.status(201).json({ catid: this.lastID, name });
  });
});

app.put('/api/categories/:catid', (req, res) => {
    const catid = parseInt(req.params.catid);
    if (isNaN(catid)) return res.status(400).json({ error: 'Invalid category ID.' });
    const name = validateCategoryName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Invalid category name.' });
    db.run('UPDATE categories SET name=? WHERE catid=?', [name, catid], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Category not found.' });
      res.json({ success: true });
    });
});

// DELETE /api/categories/:catid — delete a category by ID
app.delete('/api/categories/:catid', (req, res) => {
  const catid = parseInt(req.params.catid);
  if (isNaN(catid)) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }

  // Parameterized query — SQL injection safe
  db.run('DELETE FROM categories WHERE catid = ?', [catid], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ success: true });
  });
});

// =========================================
// API ROUTES — Products
// =========================================

// GET /api/products — return all products, optionally filtered by ?catid=
// Joins with categories to include category_name for admin table display
app.get('/api/products', (req, res) => {
  const catid = req.query.catid;

  // [PHASE 4] Validate catid query param before using it
  if (catid !== undefined) {
    const catidInt = parseInt(catid);
    if (isNaN(catidInt) || catidInt < 1) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }

    // Parameterized query — SQL injection safe
    const sql = `
      SELECT p.pid, p.catid, p.name, p.price, p.description, p.image,
             c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.catid = c.catid
      WHERE p.catid = ?
      ORDER BY p.pid ASC
    `;
    db.all(sql, [catidInt], (err, rows) => {
      if (err) {
        console.error('GET /api/products (filtered) error:', err.message);
        return res.status(500).json({ error: 'Database error.' });
      }
      res.json(rows);
    });
  } else {
    // No filter — return all products
    const sql = `
      SELECT p.pid, p.catid, p.name, p.price, p.description, p.image,
             c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON p.catid = c.catid
      ORDER BY p.pid ASC
    `;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error('GET /api/products error:', err.message);
        return res.status(500).json({ error: 'Database error.' });
      }
      res.json(rows);
    });
  }
});

// GET /api/product/:pid — return single product by ID
app.get('/api/product/:pid', (req, res) => {
  // [PHASE 4] Validate pid param
  const pid = parseInt(req.params.pid);
  if (isNaN(pid) || pid < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  // Parameterized query — SQL injection safe
  const sql = `
    SELECT p.pid, p.catid, p.name, p.price, p.description, p.image,
           c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON p.catid = c.catid
    WHERE p.pid = ?
  `;
  db.get(sql, [pid], (err, row) => {
    if (err) {
      console.error('GET /api/product/:pid error:', err.message);
      return res.status(500).json({ error: 'Database error.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(row);
  });
});

// POST /api/products — add a new product (with optional image upload)
// [PHASE 4] Validates all fields with validateProduct()
app.post('/api/products', upload.single('image'), (req, res) => {
  // [PHASE 4] Server-side validation
  const { errors, cleaned } = validateProduct(req.body);
  if (errors.length > 0) {
    // If an image was uploaded but validation failed, delete the orphaned file
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(400).json({ error: errors.join(' ') });
  }

  const tempImage = req.file ? req.file.filename : null; // keep temp name for INSERT

  db.run(
    'INSERT INTO products (catid, name, price, description, image) VALUES (?, ?, ?, ?, ?)',
    [cleaned.catid, cleaned.name, cleaned.price, cleaned.description, tempImage],
    async function (err) {
      if (err) {
        if (tempImage) fs.unlink(path.join(__dirname, 'public', 'images', tempImage), () => {});
        return res.status(500).json({ error: err.message });
      }

      const pid = this.lastID;

      if (tempImage) {
        // Rename from timestamp.jpg → pid.jpg
        const ext = path.extname(tempImage);
        const finalName = `${pid}${ext}`;
        const oldPath = path.join(__dirname, 'public', 'images', tempImage);
        const newPath = path.join(__dirname, 'public', 'images', finalName);
        fs.renameSync(oldPath, newPath);

        // Update DB record with final pid-based filename
        db.run('UPDATE products SET image=? WHERE pid=?', [finalName, pid]);
        await createThumbnail(finalName);
        res.status(201).json({ pid });
      } else {
        res.status(201).json({ pid });
      }
    }
  );
});

// PUT /api/products/:pid — update an existing product
// [PHASE 4] Validates all fields with validateProduct()
// [FIX] New image is renamed to pid.ext (e.g. 5.jpg) to match requirement
app.put('/api/products/:pid', upload.single('image'), (req, res) => {
    const pid = parseInt(req.params.pid);
    if (isNaN(pid) || pid < 1) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
  
    // [PHASE 4] Server-side validation
    const { errors, cleaned } = validateProduct(req.body);
    if (errors.length > 0) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: errors.join(' ') });
    }
  
    if (req.file) {
      // New image uploaded — rename to pid.ext before storing
      db.get('SELECT image FROM products WHERE pid = ?', [pid], async (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) {
          fs.unlink(req.file.path, () => {});
          return res.status(404).json({ error: 'Product not found.' });
        }
  
        // Rename timestamp.ext → pid.ext  e.g. 1741234567890.jpg → 5.jpg
        const ext = path.extname(req.file.filename);
        const finalName = `${pid}${ext}`;
        const tempPath = path.join(__dirname, 'public', 'images', req.file.filename);
        const finalPath = path.join(__dirname, 'public', 'images', finalName);
        fs.renameSync(tempPath, finalPath);
  
        // Parameterized query — SQL injection safe
        db.run(
          'UPDATE products SET catid=?, name=?, price=?, description=?, image=? WHERE pid=?',
          [cleaned.catid, cleaned.name, cleaned.price, cleaned.description, finalName, pid],
          async function (updateErr) {
            if (updateErr) return res.status(500).json({ error: updateErr.message });
  
            // Delete old image + thumbnail if they exist and differ from new file
            if (row.image && row.image !== finalName) {
              fs.unlink(path.join(__dirname, 'public', 'images', row.image), () => {});
              fs.unlink(path.join(__dirname, 'public', 'images', `thumb_${row.image}`), () => {});
            }
  
            // Generate thumbnail for new pid-named image: thumb_5.jpg
            await createThumbnail(finalName);
            res.json({ success: true });
          }
        );
      });
    } else {
      // No new image — keep existing image, only update other fields
      // Parameterized query — SQL injection safe
      db.run(
        'UPDATE products SET catid=?, name=?, price=?, description=? WHERE pid=?',
        [cleaned.catid, cleaned.name, cleaned.price, cleaned.description, pid],
        function (err) {
          if (err) return res.status(500).json({ error: err.message });
          if (this.changes === 0) return res.status(404).json({ error: 'Product not found.' });
          res.json({ success: true });
        }
      );
    }
  });
    
// DELETE /api/products/:pid — delete a product and its image files
app.delete('/api/products/:pid', (req, res) => {
  const pid = parseInt(req.params.pid);
  if (isNaN(pid) || pid < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  // Fetch the image filename first so we can clean it up after deletion
  db.get('SELECT image FROM products WHERE pid = ?', [pid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Product not found.' });

    // Parameterized query — SQL injection safe
    db.run('DELETE FROM products WHERE pid = ?', [pid], function (deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });

      // Delete image + thumbnail files if they exist
      if (row.image) {
        const imgPath   = path.join(__dirname, 'public', 'images', row.image);
        const thumbPath = path.join(__dirname, 'public', 'images', `thumb_${row.image}`);
        fs.unlink(imgPath,   () => {});
        fs.unlink(thumbPath, () => {});
      }

      res.json({ success: true });
    });
  });
});

// =========================================
// MULTER ERROR HANDLER
// Catches file type / size rejections from multer
// =========================================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
    }
    return res.status(400).json({ error: 'File upload error: ' + err.message });
  }
  if (err && err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

// =========================================
// 404 FALLBACK — must be last
// =========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// =========================================
// START SERVER
// =========================================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
