const { generateReceipt } = require('./services/pdfService');
const fs = require('fs');

// テスト用のモックレスポンスオブジェクト
const mockRes = {
    headers: {},
    setHeader(key, value) {
        this.headers[key] = value;
        console.log(`Header set: ${key} = ${value}`);
    },
    write(chunk) {
        // 何もしない（実際のファイル書き込みはpipeで行われる）
    },
    end() {
        console.log('Response ended');
    }
};

// テスト用の注文データ
const testOrder = {
    id: 1,
    user_name: 'テスト株式会社',
    total_price: 50000,
    quantity: 10,
    created_at: new Date().toISOString()
};

console.log('PDF生成テスト開始...');
console.log('注文データ:', testOrder);

try {
    // ファイルストリームを作成
    const writeStream = fs.createWriteStream('test_receipt_output.pdf');

    // mockResにpipeメソッドを追加
    const originalPipe = mockRes.pipe;
    mockRes.pipe = function (dest) {
        return writeStream;
    };

    generateReceipt(testOrder, mockRes);

    writeStream.on('finish', () => {
        console.log('✓ PDF生成成功！ファイル: test_receipt_output.pdf');
        process.exit(0);
    });

    writeStream.on('error', (err) => {
        console.error('✗ ファイル書き込みエラー:', err);
        process.exit(1);
    });

} catch (error) {
    console.error('✗ PDF生成エラー:', error);
    console.error('スタックトレース:', error.stack);
    process.exit(1);
}
