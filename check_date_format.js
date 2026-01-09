const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');

async function checkData() {
    try {
        const SQL = await initSqlJs();
        if (!fs.existsSync(dbPath)) {
            console.error('Database file not found');
            return;
        }

        const buffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(buffer);

        // データの確認
        console.log("Orders Data Sample:");
        const orders = db.exec("SELECT id, created_at FROM orders ORDER BY id DESC LIMIT 10");
        if (orders.length > 0 && orders[0].values.length > 0) {
            orders[0].values.forEach(row => {
                console.log(`ID: ${row[0]}, Created At: '${row[1]}'`);
            });
        } else {
            console.log("No orders found.");
        }

        // 集計テスト
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

        console.log(`\nTesting query for month: ${currentMonthStr}`);

        // 標準クエリ
        try {
            const result = db.exec(`
                SELECT 
                    COUNT(*) as count, 
                    COALESCE(SUM(total_price), 0) as sales 
                FROM orders 
                WHERE strftime('%Y-%m', datetime(created_at, 'localtime')) = '${currentMonthStr}'
            `);
            if (result.length > 0) {
                console.log("Standard query result:", result[0].values[0]);
            } else {
                console.log("Standard query returned no data.");
            }
        } catch (e) { console.log("Standard query error:", e.message); }

        // LIKEクエリテスト (YYYY/M/D...)
        try {
            const likePattern = `${currentYear}/${currentMonth}/%`;
            const resultLike = db.exec(`
                SELECT 
                    COUNT(*) as count, 
                    COALESCE(SUM(total_price), 0) as sales 
                FROM orders 
                WHERE created_at LIKE '${likePattern}'
            `);
            if (resultLike.length > 0) {
                console.log(`LIKE query result (${likePattern}):`, resultLike[0].values[0]);
            }
        } catch (e) { console.log("LIKE query error:", e.message); }

        // LIKEクエリテスト2 (YYYY-MM-DD...)
        try {
            const likePattern2 = `${currentYear}-${String(currentMonth).padStart(2, '0')}%`;
            const resultLike2 = db.exec(`
                SELECT 
                    COUNT(*) as count, 
                    COALESCE(SUM(total_price), 0) as sales 
                FROM orders 
                WHERE created_at LIKE '${likePattern2}'
            `);
            if (resultLike2.length > 0) {
                console.log(`LIKE query result (${likePattern2}):`, resultLike2[0].values[0]);
            }
        } catch (e) { console.log("LIKE query 2 error:", e.message); }

        db.close();

    } catch (err) {
        console.error(err);
    }
}

checkData();
