const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./app.db', (err) => {
    if (err) {
        console.error('Error connecting to the database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// Insert drinks into the drinks table
db.serialize(() => {
    const drinks = [
        { name: 'Espresso', price: 2.99, image: 'espresso.jpg' },
        { name: 'Cappuccino', price: 3.99, image: 'cappuccino.jpg' },
        { name: 'Latte', price: 4.49, image: 'latte.jpg' },
        { name: 'Americano', price: 2.49, image: 'americano.jpg' }
    ];

    const query = `INSERT INTO drinks (name, price, image) VALUES (?, ?, ?)`;
    drinks.forEach((drink) => {
        db.run(query, [drink.name, drink.price, drink.image], (err) => {
            if (err) {
                console.error(err.message);
            }
        });
    });

    console.log('Drinks table populated!');
});

db.close();
