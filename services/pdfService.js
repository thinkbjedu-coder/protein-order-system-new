const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// フォントパスの候補（優先順位順）
const FONT_CANDIDATES = [
    // プロジェクト内のフォント（最優先）
    path.join(__dirname, '../fonts/NotoSansJP-Regular.ttf'),
    // Windowsフォント
    'C:/Windows/Fonts/msgothic.ttc',
    'C:/Windows/Fonts/msmincho.ttc',
    'C:/Windows/Fonts/YuGothM.ttc',
    // Linuxフォント
    '/usr/share/fonts/truetype/takao-gothic/TakaoPGothic.ttf',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    // macOSフォント
    '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc'
];

// 利用可能なフォントを検索
function findAvailableFont() {
    for (const fontPath of FONT_CANDIDATES) {
        if (fs.existsSync(fontPath)) {
            console.log(`✓ 日本語フォントを検出: ${fontPath}`);
            return fontPath;
        }
    }
    console.error('❌ 利用可能な日本語フォントがありません');
    return null;
}

const FONT_PATH = findAvailableFont();

// 発行元情報（環境変数から取得）
const COMPANY_NAME = process.env.COMPANY_NAME || '株式会社ThinkBodyJapan';
const COMPANY_ADDRESS = process.env.COMPANY_ADDRESS || '東京都渋谷区...';
const INVOICE_NUMBER = process.env.INVOICE_NUMBER || 'T1180001124300';

/**
 * PDFDocumentにフォントを設定する共通関数
 */
function setupFont(doc) {
    if (FONT_PATH) {
        try {
            // PDFKitは自動でフォントファミリーを処理するため、パスのみ指定
            doc.font(FONT_PATH);
            console.log(`✓ フォントを適用: ${FONT_PATH}`);
            return true;
        } catch (e) {
            console.warn('⚠️ フォントの読み込みに失敗:', e.message);
            return false;
        }
    }
    console.error('❌ 利用可能な日本語フォントがありません');
    return false;
}

/**
 * 請求書PDF生成
 * @param {Object} order 注文情報 (商品詳細、ユーザー情報含む)
 * @param {Object} res Expressレスポンスオブジェクト
 */
function generateInvoice(order, res) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // フォント設定
    const fontLoaded = setupFont(doc);
    if (!fontLoaded) {
        console.warn('⚠️ 日本語フォントを使用できません。文字化けする可能性があります。');
    }

    // ヘッダー
    doc.fontSize(20).text('請求書', { align: 'center' });
    doc.moveDown();

    doc.fontSize(10);

    // 右寄せ: 発行日、登録番号
    const date = new Date().toLocaleDateString('ja-JP');
    doc.text(`発行日: ${date}`, { align: 'right' });
    doc.text(`請求書番号: INV-${String(order.id).padStart(6, '0')}`, { align: 'right' });
    doc.text(`登録番号: ${INVOICE_NUMBER}`, { align: 'right' });

    doc.moveDown();

    // 左: 宛名
    doc.fontSize(12).text(`${order.user_name} 様`, { align: 'left' });
    doc.moveDown();

    doc.fontSize(10);
    doc.text('下記のとおりご請求申し上げます。');
    doc.moveDown();

    // 請求金額
    doc.fontSize(14).text(`ご請求金額: ¥${order.total_price.toLocaleString()}-`, { align: 'center', underline: true });
    doc.moveDown();

    // 明細テーブルヘッダー
    const tableTop = 250;
    let y = tableTop;

    doc.fontSize(10);
    drawRow(doc, y, '品目', '単価', '数量', '金額', '税率');
    drawLine(doc, y + 15);
    y += 20;

    // 明細行
    // order.items がある想定 (JOIN済みデータを整形して渡す必要がある)
    // ここでは簡易的に order オブジェクトの構造に合わせて処理
    // server.js側で items 配列を作って渡す前提

    let totalTax8 = 0;
    let totalTax10 = 0;
    let taxable8 = 0;
    let taxable10 = 0;

    if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
            const price = item.price || 0;
            const quantity = item.quantity || 0;
            const amount = price * quantity;
            const isFood = true; // プロテインは飲食料品とする
            const taxRate = isFood ? '8%' : '10%';

            if (isFood) {
                taxable8 += amount;
                // 内税計算: amount / 1.08 * 0.08 ? いや、単価が税込か税抜かで変わる。
                // 既存システムはtotal_price保存のみ。ここでは簡易的に「税込金額」として扱い、そこから税額を割り戻すか、外税か。
                // 通常ECは税込表示が多い。
                // 税込金額からの割り戻し計算: 税額 = 税込 * (税率 / (100 + 税率))
                // totalTax8 += Math.floor(amount * 8 / 108); 
                // 正確なインボイスは「税率ごとの対価の合計」に対して税計算する。ここでは集計用に足す。
            } else {
                taxable10 += amount;
            }

            drawRow(doc, y, item.name, `¥${price.toLocaleString()}`, `${quantity}`, `¥${amount.toLocaleString()}`, taxRate);
            y += 20;
        });
    }

    // 送料など (もしあれば)
    // 今回は order.items に含まれているか、別途フィールドか？
    // DBのカラムにはないかもしれないので要確認。今回はitemsのみ。

    drawLine(doc, y);
    y += 10;

    // 消費税計算 (インボイス方式: 税率ごとに区分した消費税額)
    const tax8 = Math.floor(taxable8 * 8 / 108);
    const tax10 = Math.floor(taxable10 * 10 / 110);

    // 合計欄
    y += 10;
    doc.text(`8%対象: ¥${taxable8.toLocaleString()} (消費税: ¥${tax8.toLocaleString()})`, 300, y, { align: 'right' });
    y += 15;
    doc.text(`10%対象: ¥${taxable10.toLocaleString()} (消費税: ¥${tax10.toLocaleString()})`, 300, y, { align: 'right' });
    y += 20;
    doc.fontSize(12).text(`合計: ¥${order.total_price.toLocaleString()}`, 300, y, { align: 'right' });


    // フッター
    doc.fontSize(10);
    const bottomY = doc.page.height - 100;
    doc.text(`発行元: ${COMPANY_NAME}`, 50, bottomY);
    doc.text(`住所: ${COMPANY_ADDRESS}`, 50, bottomY + 15);

    doc.end();
}

/**
 * 領収書PDF生成
 */
function generateReceipt(order, res) {
    const doc = new PDFDocument({ size: 'A4', margin: 50 }); // A4縦に変更

    doc.pipe(res);

    // フォント設定
    const fontLoaded = setupFont(doc);
    if (!fontLoaded) {
        console.warn('⚠️ 日本語フォントを使用できません。文字化けする可能性があります。');
    }

    // タイトル
    doc.fontSize(24).text('領収書', { align: 'center' });
    doc.moveDown(1.5);

    // 宛名
    doc.fontSize(14).text(`${order.user_name} 様`, { align: 'left' });
    doc.moveDown(2);

    // 金額 (大きく目立たせる)
    doc.fontSize(20).text(`¥${order.total_price.toLocaleString()}-`, { align: 'center', underline: true });
    doc.moveDown(0.5);

    // 但し書き
    doc.fontSize(11).text('但し プロテイン代として', { align: 'center' });
    doc.text('上記正に領収いたしました。', { align: 'center' });
    doc.moveDown(2);

    // 消費税内訳 (プロテインは軽減税率8%対象)
    const taxableAmount = Math.floor(order.total_price / 1.08);
    const taxAmount = order.total_price - taxableAmount;

    doc.fontSize(10);
    doc.text(`(内消費税等 ¥${taxAmount.toLocaleString()})`, { align: 'center' });
    doc.text('※軽減税率(8%)対象商品', { align: 'center' });
    doc.moveDown(2);

    // 発行情報
    const date = new Date().toLocaleDateString('ja-JP');
    doc.fontSize(10);
    doc.text(`発行日: ${date}`, { align: 'left' });
    doc.moveDown(1.5);

    // 発行者情報 (枠で囲む)
    const issuerY = doc.y;
    doc.fontSize(11).text(`発行者: ${COMPANY_NAME}`, { align: 'left' });
    doc.fontSize(10).text(`住所: ${COMPANY_ADDRESS}`, { align: 'left' });
    doc.text(`登録番号: ${INVOICE_NUMBER}`, { align: 'left' });

    // 発行者情報の枠線
    doc.rect(40, issuerY - 10, 520, 60).stroke();

    doc.end();
}

function drawRow(doc, y, col1, col2, col3, col4, col5) {
    doc.text(col1, 50, y);
    doc.text(col2, 250, y, { width: 70, align: 'right' });
    doc.text(col3, 330, y, { width: 40, align: 'right' });
    doc.text(col4, 380, y, { width: 80, align: 'right' });
    doc.text(col5, 470, y, { width: 40, align: 'right' });
}

function drawLine(doc, y) {
    doc.moveTo(50, y).lineTo(520, y).stroke();
}

module.exports = { generateInvoice, generateReceipt };
