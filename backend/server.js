// backend/server.js
const express = require('express');
const cors = require('cors');
const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const SECRET_KEY = 'your-secret-key';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Register a new user
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `INSERT INTO users (username, password) VALUES (?, ?)`;
        db.run(query, [username, hashedPassword], function (err) {
            if (err) {
                res.status(400).json({ error: 'Username already exists' });
            } else {
                res.json({ id: this.lastID });
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// User login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const query = `SELECT * FROM users WHERE username = ?`;
    db.get(query, [username], async (err, user) => {
        if (err || !user) {
            res.status(401).json({ error: 'Invalid username or password' });
        } else {
            // Compare hashed password
            const isPasswordCorrect = await bcrypt.compare(password, user.password);
            if (!isPasswordCorrect) {
                res.status(401).json({ error: 'Invalid username or password' });
            } else {
                // Generate JWT
                const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
                res.json({
                    token,
                    user_id: user.id,
                    username: user.username
                });
            }
        }
    });
});

// JWT verification middleware
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'Access denied' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user; // Add user info to request object
        next();
    });
}

// Get all drinks
app.get('/api/drinks', (req, res) => {
    db.all('SELECT * FROM drinks', [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

// Add a new drink
app.post('/api/drinks', (req, res) => {
    const { name, price, image } = req.body;
    const query = `INSERT INTO drinks (name, price, image) VALUES (?, ?, ?)`;
    db.run(query, [name, price, image], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID });
        }
    });
});


app.get('/api/cart', (req, res) => {
    const { user_id } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: 'User ID is required' });
    }

    const query = `
        SELECT cart.id, drinks.name, drinks.price, drinks.image, cart.quantity
        FROM cart
        JOIN drinks ON cart.drink_id = drinks.id
        WHERE cart.user_id = ?
    `;
    db.all(query, [user_id], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json(rows);
        }
    });
});

app.post('/api/cart', (req, res) => {
    const { user_id, drink_id, quantity } = req.body;

    if (!user_id || !drink_id || !quantity) {
        return res.status(400).json({ error: 'All fields (user_id, drink_id, quantity) are required' });
    }

    const query = `INSERT INTO cart (user_id, drink_id, quantity) VALUES (?, ?, ?)`;
    db.run(query, [user_id, drink_id, quantity], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ id: this.lastID });
        }
    });
});


// Update quantity of a cart item
app.put('/api/cart/:id', (req, res) => {
    const { quantity } = req.body;
    const { id } = req.params;
    const query = `UPDATE cart SET quantity = ? WHERE id = ?`;
    db.run(query, [quantity, id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ updated: this.changes });
        }
    });
});

// Remove an item from the cart
app.delete('/api/cart/:id', (req, res) => {
    const { id } = req.params;
    const query = `DELETE FROM cart WHERE id = ?`;
    db.run(query, [id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ deleted: this.changes });
        }
    });
});

// Remove cart after order
app.delete('/api/cart/delete', (req, res) => {
    const { user_id } = req.query;
    const query = `DELETE FROM cart WHERE user_id = ?`;
    db.run(query, [user_id], function (err) {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ deleted: this.changes });
        }
    });
});

// Check if cart is empty
app.get('/api/cart/empty', (req, res) => {
    const { user_id } = req.query;
    const query = 'SELECT COUNT(*) as count FROM cart where user_id = ?';
    db.get(query, [user_id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
        } else {
            res.json({ isEmpty: row.count === 0 });
        }
    });
});

app.post('/api/orders', (req, res) => {
    const { userId, items } = req.body;

    if (!userId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Invalid order data' });
    }

    const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const insertOrderQuery = `
        INSERT INTO orders (user_id, total_amount, created_at)
        VALUES (?, ?, datetime('now'))
    `;

    const insertOrderItemsQuery = `
        INSERT INTO order_items (order_id, product_id, quantity, price)
        VALUES (?, ?, ?, ?)
    `;

    db.run(insertOrderQuery, [userId, totalAmount], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const orderId = this.lastID;

        const orderItemsData = items.map((item) => [
            orderId,
            item.id, // This is the product ID (from cart or drinks table)
            item.quantity,
            item.price,
        ]);

        const insertOrderItems = db.prepare(insertOrderItemsQuery);

        for (const orderItem of orderItemsData) {
            insertOrderItems.run(orderItem, (err) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }
            });
        }

        insertOrderItems.finalize(() => {
            res.status(201).json({ message: 'Order created successfully', orderId });
        });
    });
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
