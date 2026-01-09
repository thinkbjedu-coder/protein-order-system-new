const { initDatabase, getAll } = require('./database');

async function check() {
    await initDatabase();
    const products = getAll('SELECT * FROM products');
    console.log('Products:', JSON.stringify(products, null, 2));

    const orders = getAll('SELECT * FROM orders');
    console.log('Orders (last 5):', JSON.stringify(orders.slice(-5), null, 2));
}

check();
