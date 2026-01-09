const PDFDocument = require('pdfkit');
const fs = require('fs');

console.log('基本テストV3開始: MS-Gothic指定');

try {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream('test_v3.pdf'));

    // MS-Gothic (ハイフンあり) を指定
    // 第2引数にはPostScript名を指定する必要がある
    doc.font('C:/Windows/Fonts/msgothic.ttc', 'MS-Gothic');
    doc.text('こんにちは、MS-Gothicです。');

    doc.end();
    console.log('Success!');
} catch (e) {
    console.error('Error:', e);
}
