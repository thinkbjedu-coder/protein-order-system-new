const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');

async function migrateProductId() {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    try {
        // product_idカラムが存在するか確認
        const columns = db.exec("PRAGMA table_info(orders)");
        const hasProductId = columns[0].values.some(col => col[1] === 'product_id');

        if (hasProductId) {
            console.log('✓ product_idカラムは既に存在します');
        } else {
            console.log('product_idカラムを追加します...');

            // product_idカラムを追加
            db.run('ALTER TABLE orders ADD COLUMN product_id INTEGER');

            // 外部キー制約を追加(SQLiteの制限により、既存テーブルには追加できないため、コメントのみ)
            // FOREIGN KEY (product_id) REFERENCES products(id)

            console.log('✓ product_idカラムを追加しました');

            // 既存の注文にデフォルトの商品ID(1)を設定
            const existingOrders = db.exec('SELECT COUNT(*) as count FROM orders');
            const orderCount = existingOrders[0].values[0][0];

            if (orderCount > 0) {
                db.run('UPDATE orders SET product_id = 1 WHERE product_id IS NULL');
                console.log(`✓ 既存の${orderCount}件の注文にproduct_id=1を設定しました`);
            }
        }

        // データベースを保存
        const data = db.export();
        const newBuffer = Buffer.from(data);
        fs.writeFileSync(dbPath, newBuffer);
        console.log('✓ データベースを保存しました');

        db.close();
        console.log('\nマイグレーション完了!');
    } catch (error) {
        console.error('マイグレーションエラー:', error);
        db.close();
        process.exit(1);
    }
}

migrateProductId().catch(console.error);
