const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');

async function checkSchema() {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    // ordersテーブルのスキーマを確認
    const schema = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'");

    console.log('=== Orders Table Schema ===');
    if (schema.length > 0 && schema[0].values.length > 0) {
        console.log(schema[0].values[0][0]);
    } else {
        console.log('Orders table not found');
    }

    // カラム一覧を確認
    const columns = db.exec("PRAGMA table_info(orders)");
    console.log('\n=== Orders Table Columns ===');
    if (columns.length > 0) {
        columns[0].values.forEach(col => {
            console.log(`${col[1]} (${col[2]})`);
        });
    }

    db.close();
}

checkSchema().catch(console.error);
