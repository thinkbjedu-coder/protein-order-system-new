require('dotenv').config();
const fs = require('fs');
const { generateReceipt } = require('./services/pdfService');

// テスト用の注文データ
const testOrder = {
    id: 123,
    user_name: 'Think Body Japan',
    total_price: 15000,
    created_at: new Date()
};

// ファイルストリームを作成
const output = fs.createWriteStream('test_receipt_improved.pdf');

// 領収書生成
generateReceipt(testOrder, output);

output.on('finish', () => {
    console.log('✅ 改善された領収書PDFが生成されました: test_receipt_improved.pdf');
});

output.on('error', (err) => {
    console.error('❌ エラー:', err);
});
