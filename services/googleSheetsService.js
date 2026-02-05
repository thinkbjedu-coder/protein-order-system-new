const { google } = require('googleapis');

// シート上の名前とDB上の情報のマッピング
// キー: DBのID, 値: スプシ上の名前
const PRODUCT_NAME_MAPPING = {
    1: 'base (ココア)' // DB: BASE, スプシ: base (ココア)
};

/**
 * Google Sheets API Service
 */
class GoogleSheetsService {
    constructor() {
        this.sheetId = process.env.GOOGLE_SHEET_ID;
        this.clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        // 環境変数の改行コード(\n)を正しく処理する
        this.privateKey = process.env.GOOGLE_PRIVATE_KEY
            ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : null;
        this.range = process.env.GOOGLE_SHEET_RANGE || 'M12:N20'; // デフォルト範囲
    }

    /**
     * Initialize the Auth client
     */
    async getAuthClient() {
        if (!this.clientEmail || !this.privateKey || !this.sheetId) {
            console.warn('⚠️ Google Sheets credentials are missing. Skipping stock check.');
            return null;
        }

        try {
            const auth = new google.auth.JWT(
                this.clientEmail,
                null,
                this.privateKey,
                ['https://www.googleapis.com/auth/spreadsheets.readonly']
            );
            await auth.authorize();
            return auth;
        } catch (error) {
            console.error('✗ Google Auth Error:', error.message);
            return null;
        }
    }

    /**
     * Check stock for a specific product
     * @param {Object} product - Product object from DB
     * @param {number} quantity - Ordered quantity
     * @returns {Promise<Object>} - { valid: boolean, stock: number, message: string }
     */
    async checkStock(product, quantity) {
        // 設定がない場合はチェックをスキップ（開発環境など）
        if (!this.clientEmail) {
            return { valid: true, message: 'Stock check skipped (no config)' };
        }

        // 検索対象の名前候補リストを作成
        const searchCandidates = [];

        // 優先度1: マッピング定義（最優先・既存の不一致対策）
        if (PRODUCT_NAME_MAPPING[product.id]) {
            searchCandidates.push(PRODUCT_NAME_MAPPING[product.id]);
        }

        // 優先度2: "商品名 (フレーバー)" の形式 (標準フォーマット)
        if (product.flavor) {
            searchCandidates.push(`${product.name} (${product.flavor})`);
        } else {
            searchCandidates.push(product.name);
        }

        const auth = await this.getAuthClient();
        if (!auth) {
            return { valid: true, message: 'Stock check skipped (auth failed)' };
        }

        try {
            const sheets = google.sheets({ version: 'v4', auth });

            // 指定範囲のデータを取得
            const response = await sheets.spreadsheets.values.get({
                spreadsheetId: this.sheetId,
                range: this.range,
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                console.warn('⚠️ No data found in spreadsheet.');
                return { valid: true, message: 'No data found' };
            }

            // 商品名で検索 (大文字小文字を区別せず完全一致で探す)
            const targetRow = rows.find(row => {
                if (!row[0]) return false;
                const sheetName = row[0].trim().toLowerCase(); // マスタ側も小文字化

                return searchCandidates.some(candidate => {
                    return sheetName === candidate.toLowerCase(); // 候補も小文字化して比較
                });
            });

            if (!targetRow) {
                console.warn(`⚠️ Product not found in sheet. Searched for: ${searchCandidates.join(', ')}`);
                // 将来の商品追加時にアプリ側の登録漏れで注文不可になるのを防ぐため、
                // 「シートにない＝在庫管理対象外」として通す設定にします。
                return { valid: true, message: 'Product not found in sheet (Skipped)' };
            }

            // 在庫数（N列相当）を取得
            // M列がindex 0なら、N列はindex 1
            const stockStr = targetRow[1];
            const currentStock = parseInt(stockStr, 10);

            if (isNaN(currentStock)) {
                console.warn(`⚠️ Invalid stock value for "${targetRow[0]}": ${stockStr}`);
                return { valid: true, message: 'Invalid stock data' };
            }

            console.log(`📦 Stock Check: ${searchCandidates[0]} (Matched: ${targetRow[0]}) - Requested: ${quantity}, Available: ${currentStock}`);

            if (currentStock < quantity) {
                return {
                    valid: false,
                    stock: currentStock,
                    message: `在庫不足です（残り${currentStock}袋）`
                };
            }

            return { valid: true, stock: currentStock };

        } catch (error) {
            console.error('✗ Google Sheets API Error:', error.message);
            // APIエラー時は注文を止めない運用にする場合は true を返す
            return { valid: true, message: 'Stock check skipped (API Error)' };
        }
    }
}

module.exports = new GoogleSheetsService();
