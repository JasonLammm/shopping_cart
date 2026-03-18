/* =========================================
server.js
PHASE 4: XSS Prevention + CSRF Protection
========================================= */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const sharp   = require('sharp');
const crypto  = require('crypto');         // ← NEW
const session = require('express-session'); // ← NEW
const db      = require('./database');
const bcrypt = require('bcrypt');

const app = express();
app.disable('x-powered-by');
const PORT = 3001;

// =========================================
// [PHASE 4] Session + CSRF Setup            ← NEW BLOCK
// =========================================
app.use(session({
  secret: crypto.randomBytes(64).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,           // set to true once HTTPS is live
    sameSite: 'Strict',      // Defence 2: blocks cross-site cookie sending
    maxAge: 1000 * 60 * 60 * 24 * 2  // 2 days
  }
}));

// Generate CSRF nonce once per session
app.use((req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
});

// Expose nonce to frontend
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// CSRF validation middleware — used on all POST/PUT/DELETE routes
function validateCSRF(req, res, next) {
  const token = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid CSRF token.' });
  }
  next();
}

// Middleware: must be logged in
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    // API routes → return JSON error
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Login required.' });
    }
    // Page routes → redirect to login
    return res.redirect('/login');
  }
  next();
}

// Middleware: must be admin
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Login required.' });
    }
    return res.redirect('/login');
  }
  if (!req.session.isAdmin) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    return res.redirect('/');
  }
  next();
}

// =========================================
// [PHASE 4] Content Security Policy Header
// =========================================
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
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

// =========================================
// MIDDLEWARE
// =========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// =========================================
// MULTER — Image Upload Configuration
// =========================================
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'public', 'images'));
  },
  filename: (req, file, cb) => {
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
function stripHTML(str) {
  return String(str).replace(/<[^>]*>/g, '').trim();
}

function validateCategoryName(name) {
  if (!name || typeof name !== 'string') return null;
  const cleaned = stripHTML(name).trim();
  if (cleaned.length === 0 || cleaned.length > 100) return null;
  if (!/^[A-Za-z0-9 \-_]+$/.test(cleaned)) return null;
  return cleaned;
}

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
// =========================================
async function createThumbnail(filename) {
  try {
    const src  = path.join(__dirname, 'public', 'images', filename);
    const dest = path.join(__dirname, 'public', 'images', `thumb_${filename}`);
    await sharp(src).resize(300, 300, { fit: 'cover' }).toFile(dest);
  } catch (err) {
    console.warn('Thumbnail generation failed:', err.message);
  }
}

// =========================================
// PAGE ROUTES — Serve HTML files
// =========================================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/product.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.html', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/change-password', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'change-password.html'));
});


// POST /api/login
app.post('/api/login', validateCSRF, (req, res) => {
  const email    = stripHTML(req.body.email    || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });

    // Generic error — never reveal which field is wrong
    if (!user) {
      return res.status(401).json({ error: 'Either email or password is incorrect.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Either email or password is incorrect.' });
    }

    // Regenerate session to prevent session fixation (Point 5 sub-bullet)
    req.session.regenerate((regenErr) => {
      if (regenErr) return res.status(500).json({ error: 'Session error.' });

      req.session.userId  = user.userid;
      req.session.name    = user.name;
      req.session.isAdmin = user.isAdmin === 1;

      // Rotate CSRF token after login
      req.session.csrfToken = require('crypto').randomBytes(32).toString('hex');

      res.json({ success: true, name: user.name, isAdmin: user.isAdmin === 1 });
    });
  });
});

// POST /api/logout
app.post('/api/logout', validateCSRF, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'Strict',
      secure: false       // match your session cookie config exactly
    });
    res.json({ success: true });
  });
});

app.post('/api/change-password', validateCSRF, requireAuth, async (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword     = req.body.newPassword     || '';
  const confirmPassword = req.body.confirmPassword || '';

  if (!currentPassword || !newPassword || !confirmPassword)
    return res.status(400).json({ error: 'All fields are required.' });

  if (newPassword !== confirmPassword)
    return res.status(400).json({ error: 'New passwords do not match.' });

  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  if (newPassword === currentPassword)
    return res.status(400).json({ error: 'New password must differ from current password.' });

  db.get('SELECT * FROM users WHERE userid = ?', [req.session.userId], async (err, user) => {
    if (err || !user) return res.status(500).json({ error: 'User not found.' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(newPassword, 12);
    db.run('UPDATE users SET password = ? WHERE userid = ?', [hash, req.session.userId],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: 'Database error.' });

        // Logout after password change
        req.session.destroy(() => {
          res.clearCookie('connect.sid', {
            httpOnly: true,
            sameSite: 'Strict',
            secure: false
          });
          res.json({ success: true });
        });
      }
    );
  });
});

// POST /api/register
app.post('/api/register', validateCSRF, async (req, res) => {
  const name     = stripHTML(req.body.name     || '').trim();
  const email    = stripHTML(req.body.email    || '').trim().toLowerCase();
  const password = req.body.password            || '';
  const confirm  = req.body.confirmPassword     || '';

  if (!name || !email || !password || !confirm)
    return res.status(400).json({ error: 'All fields are required.' });

  if (password !== confirm)
    return res.status(400).json({ error: 'Passwords do not match.' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email))
    return res.status(400).json({ error: 'Invalid email address.' });

  try {
    const hash = await bcrypt.hash(password, 12);
    db.run(
      'INSERT INTO users (email, password, name, isAdmin) VALUES (?, ?, ?, 0)',
      [email, hash, name],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE'))
            return res.status(409).json({ error: 'An account with that email already exists.' });
          return res.status(500).json({ error: 'Database error.' });
        }
        res.status(201).json({ success: true });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/me — tell the frontend who is logged in
app.get('/api/me', (req, res) => {
  if (req.session.userId) {
    res.json({ name: req.session.name, isAdmin: req.session.isAdmin });
  } else {
    res.json({ name: null, isAdmin: false });
  }
});

// =========================================
// API ROUTES — Categories
// =========================================
app.get('/api/categories', (req, res) => {
  db.all('SELECT catid, name FROM categories ORDER BY catid ASC', [], (err, rows) => {
    if (err) {
      console.error('GET /api/categories error:', err.message);
      return res.status(500).json({ error: 'Database error.' });
    }
    res.json(rows);
  });
});

app.post('/api/categories', validateCSRF, requireAdmin, (req, res) => {  // ← validateCSRF added
  const name = validateCategoryName(req.body.name);
  if (!name) {
    return res.status(400).json({
      error: 'Invalid category name. Use letters, numbers, spaces, hyphens or underscores only (max 100 chars).'
    });
  }
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

app.put('/api/categories/:catid', validateCSRF, requireAdmin, (req, res) => {  // ← validateCSRF added
  const catid = parseInt(req.params.catid);
  if (isNaN(catid)) return res.status(400).json({ error: 'Invalid category ID.' });
  const name = validateCategoryName(req.body.name);
  if (!name) return res.status(400).json({ error: 'Invalid category name.' });
  db.run('UPDATE categories SET name=? WHERE catid=?', [name, catid], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Category not found.' });
    res.json({ success: true });
  });
});

app.delete('/api/categories/:catid', validateCSRF, requireAdmin, (req, res) => {  // ← validateCSRF added
  const catid = parseInt(req.params.catid);
  if (isNaN(catid)) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }
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
app.get('/api/products', (req, res) => {
  const catid = req.query.catid;
  if (catid !== undefined) {
    const catidInt = parseInt(catid);
    if (isNaN(catidInt) || catidInt < 1) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }
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

app.get('/api/product/:pid', (req, res) => {
  const pid = parseInt(req.params.pid);
  if (isNaN(pid) || pid < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }
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

// ⚠️ validateCSRF MUST come BEFORE upload.single so req.body is not yet parsed by multer
// The _csrf field in FormData is read by express.urlencoded BEFORE multer runs
// Actually for multipart/form-data, we need a different approach:
// validateCSRF reads from req.headers['x-csrf-token'] for FormData routes
app.post('/api/products', validateCSRF, requireAdmin, upload.single('image'), (req, res) => {  // ← validateCSRF added
  const { errors, cleaned } = validateProduct(req.body);
  if (errors.length > 0) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: errors.join(' ') });
  }

  const tempImage = req.file ? req.file.filename : null;

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
        const ext = path.extname(tempImage);
        const finalName = `${pid}${ext}`;
        const oldPath = path.join(__dirname, 'public', 'images', tempImage);
        const newPath = path.join(__dirname, 'public', 'images', finalName);
        fs.renameSync(oldPath, newPath);
        db.run('UPDATE products SET image=? WHERE pid=?', [finalName, pid]);
        await createThumbnail(finalName);
        res.status(201).json({ pid });
      } else {
        res.status(201).json({ pid });
      }
    }
  );
});

app.put('/api/products/:pid', validateCSRF, requireAdmin, upload.single('image'), (req, res) => {  // ← validateCSRF added
  const pid = parseInt(req.params.pid);
  if (isNaN(pid) || pid < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const { errors, cleaned } = validateProduct(req.body);
  if (errors.length > 0) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: errors.join(' ') });
  }

  if (req.file) {
    db.get('SELECT image FROM products WHERE pid = ?', [pid], async (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) {
        fs.unlink(req.file.path, () => {});
        return res.status(404).json({ error: 'Product not found.' });
      }

      const ext = path.extname(req.file.filename);
      const finalName = `${pid}${ext}`;
      const tempPath = path.join(__dirname, 'public', 'images', req.file.filename);
      const finalPath = path.join(__dirname, 'public', 'images', finalName);
      fs.renameSync(tempPath, finalPath);

      db.run(
        'UPDATE products SET catid=?, name=?, price=?, description=?, image=? WHERE pid=?',
        [cleaned.catid, cleaned.name, cleaned.price, cleaned.description, finalName, pid],
        async function (updateErr) {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          if (row.image && row.image !== finalName) {
            fs.unlink(path.join(__dirname, 'public', 'images', row.image), () => {});
            fs.unlink(path.join(__dirname, 'public', 'images', `thumb_${row.image}`), () => {});
          }

          await createThumbnail(finalName);
          res.json({ success: true });
        }
      );
    });
  } else {
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

app.delete('/api/products/:pid', validateCSRF, requireAdmin, (req, res) => {  // ← validateCSRF added
  const pid = parseInt(req.params.pid);
  if (isNaN(pid) || pid < 1) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  db.get('SELECT image FROM products WHERE pid = ?', [pid], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Product not found.' });

    db.run('DELETE FROM products WHERE pid = ?', [pid], function (deleteErr) {
      if (deleteErr) return res.status(500).json({ error: deleteErr.message });

      if (row.image) {
        fs.unlink(path.join(__dirname, 'public', 'images', row.image), () => {});
        fs.unlink(path.join(__dirname, 'public', 'images', `thumb_${row.image}`), () => {});
      }

      res.json({ success: true });
    });
  });
});

// =========================================
// MULTER ERROR HANDLER
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
