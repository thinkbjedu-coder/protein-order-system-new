// 既存のordersテーブルに入金確認フィールドを追加するマイグレーションスクリプト
const fs = require('fs');
const initSqlJs = require('sql.js');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');

async function migrate() {
    const SQL = await initSqlJs();

    if (!fs.existsSync(dbPath)) {
        console.log('データベースファイルが見つかりません。マイグレーション不要です。');
        return;
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    try {
        // payment_confirmedカラムが存在するか確認
        const tableInfo = db.exec("PRAGMA table_info(orders)");
        const columns = tableInfo[0]?.values.map(row => row[1]) || [];

        if (columns.includes('payment_confirmed')) {
            console.log('✅ payment_confirmedカラムは既に存在します');
        } else {
            console.log('⚙️  payment_confirmedカラムを追加中...');
            db.run('ALTER TABLE orders ADD COLUMN payment_confirmed INTEGER DEFAULT 0');
            console.log('✅ payment_confirmedカラムを追加しました');
        }

        if (columns.includes('payment_date')) {
            console.log('✅ payment_dateカラムは既に存在します');
        } else {
            console.log('⚙️  payment_dateカラムを追加中...');
            db.run('ALTER TABLE orders ADD COLUMN payment_date DATETIME');
            console.log('✅ payment_dateカラムを追加しました');
        }

        // データベースを保存
        const data = db.export();
        const newBuffer = Buffer.from(data);
        fs.writeFileSync(dbPath, newBuffer);

        console.log('✅ マイグレーション完了!');
    } catch (error) {
        console.error('❌ マイグレーションエラー:', error);
    }
}

migrate();
