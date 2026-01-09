const { generateReceipt } = require('./services/pdfService');
const fs = require('fs');
const Stream = require('stream');

// Expressレスポンスのモック
class MockResponse extends Stream.Writable {
    constructor() {
        super();
        this.headers = {};
        this.data = [];
    }
    setHeader(key, value) {
        this.headers[key] = value;
    }
    attachment(filename) {
        this.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    contentType(type) {
        this.setHeader('Content-Type', type);
    }
    _write(chunk, encoding, callback) {
        this.data.push(chunk);
        callback();
    }
}

const testOrder = {
    id: 6,
    company_name: 'Think Body Japan',
    user_name: 'Think Body Japan',
    total_price: 15000,
    quantity: 10,
    created_at: '2026-01-05 02:20:54'
};

const res = new MockResponse();
const fileStream = fs.createWriteStream('test_debug_receipt.pdf');

console.log('Testing PDF generation...');
try {
    generateReceipt(testOrder, fileStream);
    fileStream.on('finish', () => {
        const stats = fs.statSync('test_debug_receipt.pdf');
        console.log(`PDF generated successfully. Size: ${stats.size} bytes`);
        if (stats.size < 1000) {
            console.error('Error: PDF is too small, likely empty or broken.');
        } else {
            console.log('Success: PDF size seems reasonable.');
        }
    });
} catch (err) {
    console.error('Catch Error:', err);
}
