const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');

async function migrateCatchCopy() {
    const SQL = await initSqlJs();
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    try {
        // catch_copyカラムが存在するか確認
        const columns = db.exec("PRAGMA table_info(products)");
        const hasColumn = columns[0].values.some(col => col[1] === 'catch_copy');

        if (hasColumn) {
            console.log('✓ catch_copyカラムは既に存在します');
        } else {
            console.log('catch_copyカラムを追加します...');

            // catch_copyカラムを追加
            db.run('ALTER TABLE products ADD COLUMN catch_copy TEXT');

            console.log('✓ catch_copyカラムを追加しました');

            // 既存の商品(BASE)にデフォルトのキャッチコピーを設定
            const defaultCatchCopy = "高齢者でも安心して始めやすい\n続けやすいプロテインです";
            db.run('UPDATE products SET catch_copy = ? WHERE id = 1', [defaultCatchCopy]);
            console.log('✓ 既存の商品にデフォルトのキャッチコピーを設定しました');
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

migrateCatchCopy().catch(console.error);
