require('dotenv').config(); // Must be line 1
/* =========================================
   server.js
   PHASE 4: XSS Prevention + CSRF Protection
   PHASE 5: Stripe Checkout + Orders
========================================= */

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const sharp    = require('sharp');
const crypto   = require('crypto');
const session  = require('express-session');
const db       = require('./database');
const bcrypt   = require('bcrypt');

// =========================================
// [PHASE 5] Stripe Setup
// =========================================
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL;
const CURRENCY = process.env.CURRENCY || 'usd';
const YOUR_DOMAIN = (process.env.YOUR_DOMAIN || 'http://localhost:3001').replace(/\/$/, '');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const PORT = process.env.PORT;

// =========================================
// [PHASE 4] Session + CSRF Setup
// =========================================
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // set for testing locally
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 2 // 2 days
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

// CSRF validation middleware
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
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Login required.' });
    }
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
// [PHASE 4 FIX] Security Headers
// =========================================
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://connect.facebook.net",
      "frame-src 'self' https://www.facebook.com",
      "style-src 'self' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https://www.facebook.com https://static.xx.fbcdn.net",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests"
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // Uncomment after TLS is live:
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// =========================================
// [PHASE 5] Stripe Webhook
// MUST be BEFORE express.json() middleware
// =========================================
app.post('/api/webhook',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig           = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature.' });
    }

    if (event.type === 'checkout.session.completed') {
      const stripeSession = event.data.object;
      const { orderid } = stripeSession.metadata;

      try {
        const order = await new Promise((resolve, reject) => {
          db.get(`SELECT * FROM orders WHERE orderid = ?`, [orderid],
            (err, row) => err ? reject(err) : resolve(row));
        });

        if (!order) {
          console.error('Order not found:', orderid);
          return res.status(404).json({ error: 'Order not found.' });
        }

        // Idempotency check
        if (order.status === 'paid') {
          console.log('Duplicate webhook ignored for order:', orderid);
          return res.json({ received: true });
        }

        const orderItems = await new Promise((resolve, reject) => {
          db.all(`SELECT * FROM order_items WHERE orderid = ?`, [orderid],
            (err, rows) => err ? reject(err) : resolve(rows));
        });

        const itemsString = orderItems.map(i => `${i.pid}:${i.quantity}:${i.price}`).join(',');
        const total       = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
        const rawString   = [order.currency, order.merchant_email, order.salt, itemsString, total.toFixed(2)].join('|');
        const regenDigest = crypto.createHash('sha256').update(rawString).digest('hex');

        if (regenDigest !== order.digest) {
          console.error('Digest mismatch — possible tampering! Order:', orderid);
          return res.status(400).json({ error: 'Digest mismatch.' });
        }

        await new Promise((resolve, reject) => {
          db.run(`UPDATE orders SET status = 'paid' WHERE orderid = ?`, [orderid],
            err => err ? reject(err) : resolve());
        });

        console.log('Order paid and verified:', orderid);

      } catch (err) {
        console.error('Webhook processing error:', err);
        return res.status(500).json({ error: 'Processing failed.' });
      }
    }

    res.json({ received: true });
  }
);

// =========================================
// MIDDLEWARE
// =========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  if (req.path === '/admin.html') {
    return res.redirect('/admin');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// =========================================
// MULTER — Image Upload Configuration
// =========================================
const ALLOWED_MIME  = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
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

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/change-password', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'change-password.html'));
});

app.get('/orders', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'orders.html'));
});

// =========================================
// AUTH API ROUTES
// =========================================
app.post('/api/login', validateCSRF, (req, res) => {
  const email    = stripHTML(req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });

    if (!user) {
      return res.status(401).json({ error: 'Either email or password is incorrect.' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Either email or password is incorrect.' });
    }

    req.session.regenerate((regenErr) => {
      if (regenErr) return res.status(500).json({ error: 'Session error.' });

      req.session.userId  = user.userid;
      req.session.name    = user.name;
      req.session.email   = user.email;
      req.session.isAdmin = user.isAdmin === 1;
      req.session.csrfToken = crypto.randomBytes(32).toString('hex');

      res.json({ success: true, name: user.name, isAdmin: user.isAdmin === 1 });
    });
  });
});

app.post('/api/logout', validateCSRF, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid', {
      httpOnly: true,
      sameSite: 'Strict',
      secure: true
    });
    res.json({ success: true });
  });
});

app.post('/api/change-password', validateCSRF, requireAuth, async (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword     = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';

  if (!currentPassword || !newPassword || !confirmPassword)
    return res.status(400).json({ error: 'All fields are required.' });

  if (newPassword !== confirmPassword)
    return res.status(400).json({ error: 'New passwords do not match.' });

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(newPassword))
    return res.status(400).json({ error: 'New password must be at least 8 characters and include uppercase, lowercase, number, and special character.' });

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

        req.session.destroy(() => {
          res.clearCookie('connect.sid', {
            httpOnly: true,
            sameSite: 'Strict',
            secure: true
          });
          res.json({ success: true });
        });
      }
    );
  });
});

app.post('/api/register', validateCSRF, async (req, res) => {
  const name     = stripHTML(req.body.name || '').trim();
  const email    = stripHTML(req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirm  = req.body.confirmPassword || '';

  if (!name || !email || !password || !confirm)
    return res.status(400).json({ error: 'All fields are required.' });

  if (password !== confirm)
    return res.status(400).json({ error: 'Passwords do not match.' });

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
  if (!passwordRegex.test(password))
    return res.status(400).json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character.' });

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

app.post('/api/categories', validateCSRF, requireAdmin, (req, res) => {
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

app.put('/api/categories/:catid', validateCSRF, requireAdmin, (req, res) => {
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

app.delete('/api/categories/:catid', validateCSRF, requireAdmin, (req, res) => {
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
  if (req.query.catid !== undefined && !/^\d+$/.test(req.query.catid)) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }

  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(20, parseInt(req.query.limit) || 8);
  const offset = (page - 1) * limit;

  const catid = parseInt(req.query.catid);

  if (req.query.catid !== undefined) {
    const catidInt = parseInt(catid);
    if (isNaN(catidInt) || catidInt < 1) {
      return res.status(400).json({ error: 'Invalid category ID.' });
    }
    const sql = `
      SELECT p.pid, p.catid, p.name, p.price, p.description, p.image,
            c.name AS category_name,
            COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN categories c ON p.catid = c.catid
      WHERE p.catid = ?
      ORDER BY p.pid ASC
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [catidInt, limit, offset], (err, rows) => {
      if (err) {
        console.error('GET /api/products (filtered) error:', err.message);
        return res.status(500).json({ error: 'Database error.' });
      }
      const total = rows[0]?.total_count || 0;
      res.json({ products: rows, total, page, limit });
    });
  } else {
    const sql = `
      SELECT p.pid, p.catid, p.name, p.price, p.description, p.image,
            c.name AS category_name,
            COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN categories c ON p.catid = c.catid
      ORDER BY p.pid ASC
      LIMIT ? OFFSET ?
    `;
    db.all(sql, [limit, offset], (err, rows) => {
      if (err) {
        console.error('GET /api/products error:', err.message);
        return res.status(500).json({ error: 'Database error.' });
      }
      const total = rows[0]?.total_count || 0;
      res.json({ products: rows, total, page, limit });
    });
  }
});

app.get('/api/product/:pid', (req, res) => {
  if (!/^\d+$/.test(req.params.pid)) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }
  const pid = parseInt(req.params.pid);
  if (pid <= 0) {
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

app.post('/api/products', validateCSRF, requireAdmin, upload.single('image'), (req, res) => {
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
        const ext       = path.extname(tempImage);
        const finalName = `${pid}${ext}`;
        const oldPath   = path.join(__dirname, 'public', 'images', tempImage);
        const newPath   = path.join(__dirname, 'public', 'images', finalName);
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

app.put('/api/products/:pid', validateCSRF, requireAdmin, upload.single('image'), (req, res) => {
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

      const ext       = path.extname(req.file.filename);
      const finalName = `${pid}${ext}`;
      const tempPath  = path.join(__dirname, 'public', 'images', req.file.filename);
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

app.delete('/api/products/:pid', validateCSRF, requireAdmin, (req, res) => {
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
// [PHASE 5] CHECKOUT — Order Validation
// =========================================
app.post('/api/checkout', validateCSRF, requireAuth, async (req, res) => {
  const items = req.body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  for (const item of items) {
    const pid = parseInt(item.pid);
    const qty = parseInt(item.qty);
    if (isNaN(pid) || pid < 1 || isNaN(qty) || qty < 1) {
      return res.status(400).json({ error: 'Invalid item in cart.' });
    }
  }

  try {
    const pidList      = items.map(i => parseInt(i.pid));
    const placeholders = pidList.map(() => '?').join(',');
    const dbProducts   = await new Promise((resolve, reject) => {
      db.all(
        `SELECT pid, name, price FROM products WHERE pid IN (${placeholders})`,
        pidList,
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    if (dbProducts.length !== pidList.length) {
      return res.status(400).json({ error: 'One or more products not found.' });
    }

    const priceMap   = Object.fromEntries(dbProducts.map(p => [p.pid, p]));
    const orderItems = items.map(i => ({
      pid  : parseInt(i.pid),
      qty  : parseInt(i.qty),
      price: priceMap[parseInt(i.pid)].price,
      name : priceMap[parseInt(i.pid)].name
    }));

    const total = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);

    const salt        = crypto.randomBytes(16).toString('hex');
    const itemsString = orderItems.map(i => `${i.pid}:${i.qty}:${i.price}`).join(',');
    const rawString   = [CURRENCY, MERCHANT_EMAIL, salt, itemsString, total.toFixed(2)].join('|');
    const digest      = crypto.createHash('sha256').update(rawString).digest('hex');

    const orderid = await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO orders (userid, email, currency, merchant_email, salt, digest, total, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [req.session.userId, req.session.email, CURRENCY, MERCHANT_EMAIL, salt, digest, total],
        function (err) { err ? reject(err) : resolve(this.lastID); }
      );
    });

    for (const item of orderItems) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO order_items (orderid, pid, quantity, price) VALUES (?, ?, ?, ?)`,
          [orderid, item.pid, item.qty, item.price],
          err => err ? reject(err) : resolve()
        );
      });
    }

    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: orderItems.map(i => ({
        price_data: {
          currency    : CURRENCY,
          product_data: { name: i.name },
          unit_amount : Math.round(i.price * 100)
        },
        quantity: i.qty
      })),
      mode       : 'payment',
      success_url: `${YOUR_DOMAIN}/orders?success=1`,
      cancel_url: `${YOUR_DOMAIN}/orders?cancelled=1`,
      metadata   : { orderid: String(orderid), digest }
    });

    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE orders SET stripe_session_id = ? WHERE orderid = ?`,
        [stripeSession.id, orderid],
        err => err ? reject(err) : resolve()
      );
    });

    res.json({ url: stripeSession.url });

  } catch (err) {
    console.error('/api/checkout error:', err);
    res.status(500).json({ error: 'Checkout failed.' });
  }
});

// =========================================
// [PHASE 5] MEMBER — Last 5 Orders
// =========================================
app.get('/api/my-orders', requireAuth, (req, res) => {
  db.all(
    `SELECT o.orderid, o.total, o.status, o.currency, o.created_at,
            oi.pid, oi.quantity, oi.price,
            p.name AS product_name
     FROM orders o
     JOIN order_items oi ON o.orderid = oi.orderid
     LEFT JOIN products p ON oi.pid = p.pid
     WHERE o.userid = ?
       AND o.orderid IN (
         SELECT orderid FROM orders
         WHERE userid = ?
         ORDER BY created_at DESC
         LIMIT 5
       )
     ORDER BY o.created_at DESC`,
    [req.session.userId, req.session.userId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });

      const ordersMap = new Map();
      for (const row of rows) {
        if (!ordersMap.has(row.orderid)) {
          ordersMap.set(row.orderid, {
            orderid   : row.orderid,
            total     : row.total,
            status    : row.status,
            currency  : row.currency,
            created_at: row.created_at,
            items     : []
          });
        }
        ordersMap.get(row.orderid).items.push({
          pid         : row.pid,
          product_name: row.product_name,
          quantity    : row.quantity,
          price       : row.price
        });
      }

      const orders = [...ordersMap.values()];
      res.json(orders);
    }
  );
});

// =========================================
// [PHASE 5] ADMIN — All Orders
// =========================================
app.get('/api/admin/orders', requireAdmin, (req, res) => {
  db.all(
    `SELECT o.orderid, o.email, o.total, o.status, o.currency, o.created_at,
            oi.pid, oi.quantity, oi.price,
            p.name AS product_name
     FROM orders o
     JOIN order_items oi ON o.orderid = oi.orderid
     LEFT JOIN products p ON oi.pid = p.pid
     ORDER BY o.created_at DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error.' });

      const ordersMap = new Map();
      for (const row of rows) {
        if (!ordersMap.has(row.orderid)) {
          ordersMap.set(row.orderid, {
            orderid   : row.orderid,
            email     : row.email,
            total     : row.total,
            status    : row.status,
            currency  : row.currency,
            created_at: row.created_at,
            items     : []
          });
        }
        ordersMap.get(row.orderid).items.push({
          pid         : row.pid,
          product_name: row.product_name,
          quantity    : row.quantity,
          price       : row.price
        });
      }

      res.json([...ordersMap.values()]);
    }
  );
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
// [PHASE 4 FIX] GLOBAL ERROR HANDLER
// =========================================
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'An internal server error occurred.' });
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