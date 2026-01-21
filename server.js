require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');
const { initDatabase, runQuery, getOne, getAll, getLastInsertId, saveDatabase } = require('./database');
const multer = require('multer');
const { generateInvoice, generateReceipt } = require('./services/pdfService');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Multer設定（セキュリティ強化版）
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'product-' + uniqueSuffix + ext);
    }
});

// ファイルフィルター（画像のみ許可）
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('画像ファイル(JPEG, PNG, WebP)のみアップロード可能です'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB制限
    }
});

const app = express();
const PORT = 3000;

// SendGrid設定（環境変数から取得）
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.FROM_EMAIL || 'life-admin@thinkbody.co.jp';
const fromName = process.env.FROM_NAME || '株式会社Think Life';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@thinkbodyjapan.com';

// SendGrid APIキーを設定
if (sendgridApiKey) {
    sgMail.setApiKey(sendgridApiKey);
    console.log('========================================');
    console.log('✓ SendGrid設定を読み込みました');
    console.log('環境変数の読み込み状況:');
    console.log('  SENDGRID_API_KEY:', sendgridApiKey ? '✓' : '✗');
    console.log('  FROM_EMAIL:', fromEmail);
    console.log('  FROM_NAME:', fromName);
    console.log('  ADMIN_EMAIL:', adminEmail);
    console.log('========================================');
} else {
    console.warn('========================================');
    console.warn('⚠️ SENDGRID_API_KEY が設定されていません');
    console.warn('  メール送信機能は無効化されます');
    console.warn('========================================');
}

// メール送信関数（SendGrid使用）
async function sendEmail(to, subject, html) {
    // SendGrid APIキーチェック
    if (!sendgridApiKey) {
        console.warn('⚠️ SENDGRID_API_KEY が設定されていません');
        console.warn('  メール送信をスキップします');
        console.warn('  宛先:', to);
        console.warn('  件名:', subject);
        return;
    }

    try {
        const msg = {
            to: to,
            from: {
                email: fromEmail,
                name: fromName
            },
            subject: subject,
            html: html
        };

        await sgMail.send(msg);
        console.log(`✓ メール送信成功 (SendGrid): ${to}`);
        console.log(`  件名: ${subject}`);
    } catch (error) {
        console.error('✗ メール送信エラー (SendGrid):', error.message);
        console.error('  宛先:', to);
        console.error('  件名:', subject);
        if (error.response) {
            console.error('  SendGrid Response:', error.response.body);
        }
        // エラーを再スローせず、処理を継続
    }
}

// データベース初期化（非同期）
let dbReady = false;
initDatabase().then(() => {
    dbReady = true;
    console.log('データベース準備完了');
});

// セキュリティミドルウェア
app.use(helmet({
    contentSecurityPolicy: false // 必要に応じて設定
}));

// レート制限（全体）
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 100, // 100リクエスト/15分
    message: 'リクエストが多すぎます。しばらくしてから再試行してください。'
});

// レート制限（ログイン専用）
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 5, // 5回まで
    message: 'ログイン試行回数が多すぎます。15分後に再試行してください。'
});

app.use('/api/', generalLimiter);

// ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// セッション設定（環境変数対応）
// Renderはリバースプロキシ経由なので、secure: falseに設定
app.use(session({
    secret: process.env.SESSION_SECRET || 'protein-order-secret-key-2024-CHANGE-THIS',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Renderのプロキシ経由のため、falseに設定
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax' // strictだとリダイレクト時にCookieが送信されない
    }
}));

// DB準備チェック
app.use((req, res, next) => {
    if (!dbReady && !req.path.includes('/health')) {
        return res.status(503).json({ error: 'サーバー準備中です' });
    }
    next();
});

// 認証ミドルウェア
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: '認証が必要です' });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({ error: '管理者権限が必要です' });
    }
    next();
}

// ============ 商品API ============

app.get('/api/products', async (req, res) => {
    try {
        const products = await getAll('SELECT * FROM products WHERE is_active = 1 ORDER BY id ASC');
        res.json(products);
    } catch (error) {
        console.error('商品取得エラー:', error);
        res.status(500).json({ error: '商品の取得に失敗しました' });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await getOne('SELECT * FROM products WHERE id = ?', [req.params.id]);
        if (!product) {
            return res.status(404).json({ error: '商品が見つかりません' });
        }
        res.json(product);
    } catch (error) {
        console.error('商品取得エラー:', error);
        res.status(500).json({ error: '商品の取得に失敗しました' });
    }
});

// ============ 認証API ============

app.post('/api/register', async (req, res) => {
    try {
        const { email, password, company_name, last_name, first_name, phone, postal_code, address } = req.body;

        if (!email || !password || !company_name || !last_name || !first_name || !phone) {
            return res.status(400).json({ error: '必須項目を入力してください' });
        }

        const existingUser = await getOne('SELECT * FROM users WHERE email = ?', [email]);
        if (existingUser) {
            return res.status(400).json({ error: 'このメールアドレスは既に登録されています' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await runQuery(
            'INSERT INTO users (email, password, company_name, last_name, first_name, phone, postal_code, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [email, hashedPassword, company_name, last_name, first_name, phone, postal_code || '', address || '']
        );

        const userId = await getLastInsertId();
        req.session.userId = userId;

        res.json({ success: true, userId, message: '登録が完了しました' });
    } catch (error) {
        console.error('登録エラー:', error);
        res.status(500).json({ error: '登録に失敗しました' });
    }
});

app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await getOne('SELECT * FROM users WHERE email = ?', [email]);
        console.log('DEBUG: User object:', user);
        console.log('DEBUG: User password field:', user ? user.password : 'user is null');

        if (!user) {
            return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
        }

        req.session.userId = user.id;
        res.json({ success: true, userId: user.id });
    } catch (error) {
        console.error('ログインエラー:', error);
        res.status(500).json({ error: 'ログインに失敗しました' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// パスワードリセット要求
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await getOne('SELECT * FROM users WHERE email = ?', [email]);
        if (!user) {
            // セキュリティのため、ユーザーが存在しなくても成功のように振る舞う（またはエラーを返す）
            // ここでは親切にエラーを返すが、本番では曖昧にするのが一般的
            return res.json({ success: true, message: 'パスワード再設定メールを送信しました' });
        }

        // トークン生成
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1時間後

        // 古いトークンを削除し、新しいトークンを保存
        await runQuery('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);
        await runQuery(
            'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
            [token, user.id, expiresAt.toISOString()]
        );

        // メール送信
        const resetLink = `${req.protocol}://${req.get('host')}/reset_password.html?token=${token}`;
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">パスワードの再設定</h2>
                <p>${user.company_name} 様</p>
                <p>パスワードの再設定リクエストを受け付けました。</p>
                <p>以下のリンクをクリックして、新しいパスワードを設定してください。</p>
                <div style="margin: 30px 0; text-align: center;">
                    <a href="${resetLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">パスワードを再設定する</a>
                </div>
                <p>リンクの有効期限は1時間です。</p>
                <p style="color: #6b7280; font-size: 14px;">心当たりがない場合は、このメールを破棄してください。</p>
            </div>
        `;

        await sendEmail(email, '【Think Body Japan】パスワードの再設定', emailHtml);

        // 開発用ログ（メールが飛ばない環境用）
        console.log(`[DEV] Reset Link for ${email}: ${resetLink}`);

        res.json({ success: true, message: 'パスワード再設定メールを送信しました' });
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ error: '処理に失敗しました' });
    }
});

// パスワード再設定実行
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ error: '無効なリクエストです' });
        }

        // トークンの検証
        const tokenData = await getOne('SELECT * FROM password_reset_tokens WHERE token = ?', [token]);
        if (!tokenData) {
            return res.status(400).json({ error: '無効なトークンです' });
        }

        // 有効期限チェック
        if (new Date(tokenData.expires_at) < new Date()) {
            return res.status(400).json({ error: 'トークンの有効期限が切れています' });
        }

        // パスワード更新
        const hashedPassword = await bcrypt.hash(password, 10);
        await runQuery('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, tokenData.user_id]);

        // トークン削除
        await runQuery('DELETE FROM password_reset_tokens WHERE token = ?', [token]);

        res.json({ success: true, message: 'パスワードを更新しました' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'パスワードの更新に失敗しました' });
    }
});

app.get('/api/me', requireAuth, async (req, res) => {
    try {
        const user = await getOne('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.status(404).json({ error: 'ユーザーが見つかりません' });
        }

        const { password, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        console.error('ユーザー情報取得エラー:', error);
        res.status(500).json({ error: 'ユーザー情報の取得に失敗しました' });
    }
});

// ============ 注文API ============

app.post('/api/orders', requireAuth, async (req, res) => {
    try {
        const { product_id, shipping_address_id, quantity } = req.body;

        if (!shipping_address_id || !quantity) {
            return res.status(400).json({ error: '配送先と数量を指定してください' });
        }

        if (quantity < 10) {
            return res.status(400).json({ error: '必須項目を入力してください' });
        }

        // 商品情報の取得（指定がない場合はデフォルトの1番目の商品）
        const product = product_id
            ? await getOne('SELECT * FROM products WHERE id = ?', [product_id])
            : await getOne('SELECT * FROM products WHERE is_active = 1 ORDER BY id ASC LIMIT 1');

        if (!product) {
            return res.status(400).json({ error: '有効な商品が見つかりません' });
        }

        const unit_price = product.price;
        const total_price = quantity * unit_price;

        await runQuery(
            'INSERT INTO orders (user_id, product_id, shipping_address_id, quantity, unit_price, total_price, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.session.userId, product.id, shipping_address_id, quantity, unit_price, total_price, '処理中']
        );

        const orderId = await getLastInsertId();
        const user = await getOne('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        const shippingAddress = await getOne('SELECT * FROM shipping_addresses WHERE id = ?', [shipping_address_id]);

        // 顧客へのメール送信
        const customerEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">ご注文ありがとうございます</h2>
                <p>${user.company_name} 様</p>
                <p>以下の内容でご注文を承りました。</p>
                
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">注文内容</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">注文番号:</td>
                            <td style="padding: 8px 0; font-weight: bold;">#${orderId}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">商品:</td>
                            <td style="padding: 8px 0;">${product.name} ${product.flavor ? `(${product.flavor})` : ''}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">数量:</td>
                            <td style="padding: 8px 0;">${quantity}袋</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">合計金額:</td>
                            <td style="padding: 8px 0; font-weight: bold; color: #2563eb; font-size: 18px;">¥${total_price.toLocaleString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
                    <h3 style="margin-top: 0; color: #92400e;">お支払い方法</h3>
                    <p style="color: #92400e; margin: 10px 0;">以下の口座にお振込みください。</p>
                    <div style="background-color: white; padding: 15px; border-radius: 4px; margin-top: 10px;">
                        <p style="margin: 5px 0;"><strong>銀行名:</strong> 瀬戸信用金庫</p>
                        <p style="margin: 5px 0;"><strong>支店名:</strong> 尾張旭支店</p>
                        <p style="margin: 5px 0;"><strong>口座種別:</strong> 普通</p>
                        <p style="margin: 5px 0;"><strong>口座番号:</strong> 0836092</p>
                        <p style="margin: 5px 0;"><strong>口座名義:</strong> 株式会社ThinkLife</p>
                    </div>
                </div>

                <div style="margin: 20px 0;">
                    <h3>配送先</h3>
                    <p style="margin: 5px 0;"><strong>${shippingAddress.label}</strong></p>
                    <p style="margin: 5px 0;">〒${shippingAddress.postal_code}</p>
                    <p style="margin: 5px 0;">${shippingAddress.address}</p>
                    <p style="margin: 5px 0;">TEL: ${shippingAddress.phone}</p>
                </div>

                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                    ご不明な点がございましたら、お気軽にお問い合わせください。<br>
                    今後ともThink Body Japanをよろしくお願いいたします。
                </p>
            </div>
        `;

        // 顧客へのメール送信（非同期・待機しない）
        sendEmail(user.email, `【Think Body Japan】ご注文ありがとうございます（注文番号: #${orderId}）`, customerEmailHtml)
            .catch(err => console.error('顧客メール送信失敗:', err));

        // 管理者へのメール送信
        const adminEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #dc2626;">新規注文が入りました</h2>
                
                <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">注文情報</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">注文番号:</td>
                            <td style="padding: 8px 0; font-weight: bold;">#${orderId}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">事業者名:</td>
                            <td style="padding: 8px 0; font-weight: bold;">${user.company_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">担当者:</td>
                            <td style="padding: 8px 0;">${user.last_name} ${user.first_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">メール:</td>
                            <td style="padding: 8px 0;">${user.email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">電話:</td>
                            <td style="padding: 8px 0;">${user.phone}</td>
                        </tr>
                    </table>
                </div>

                <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <h3 style="margin-top: 0;">注文内容</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">商品:</td>
                            <td style="padding: 8px 0;">BASE (ココア味)</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">数量:</td>
                            <td style="padding: 8px 0; font-weight: bold;">${quantity}袋</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; color: #6b7280;">単価:</td>
                            <td style="padding: 8px 0;">¥${unit_price.toLocaleString()}</td>
                        </tr>
                        <tr style="border-top: 2px solid #93c5fd;">
                            <td style="padding: 8px 0; font-weight: bold;">合計金額:</td>
                            <td style="padding: 8px 0; font-weight: bold; color: #2563eb; font-size: 18px;">¥${total_price.toLocaleString()}</td>
                        </tr>
                    </table>
                </div>

                <div style="margin: 20px 0;">
                    <h3>配送先</h3>
                    <p style="margin: 5px 0;"><strong>${shippingAddress.label}</strong></p>
                    <p style="margin: 5px 0;">〒${shippingAddress.postal_code}</p>
                    <p style="margin: 5px 0;">${shippingAddress.address}</p>
                    <p style="margin: 5px 0;">TEL: ${shippingAddress.phone}</p>
                </div>

                <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                    管理画面から注文の詳細を確認し、ステータスを更新してください。
                </p>
            </div>
        `;

        // 管理者へのメール送信（非同期・待機しない）
        sendEmail(adminEmail, `【Think Body Japan】新規注文 #${orderId} - ${user.company_name}`, adminEmailHtml)
            .catch(err => console.error('管理者メール送信失敗:', err));

        res.json({ success: true, orderId, message: '注文を受け付けました' });
    } catch (error) {
        console.error('注文作成エラー:', error);
        res.status(500).json({ error: '注文の作成に失敗しました' });
    }
});

app.get('/api/orders', requireAuth, async (req, res) => {
    try {
        const orders = await getAll('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC', [req.session.userId]);
        res.json(orders);
    } catch (error) {
        console.error('注文履歴取得エラー:', error);
        res.status(500).json({ error: '注文履歴の取得に失敗しました' });
    }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
        const order = await getOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (!order || order.user_id !== req.session.userId) {
            return res.status(404).json({ error: '注文が見つかりません' });
        }

        const shippingAddress = await getOne('SELECT * FROM shipping_addresses WHERE id = ?', [order.shipping_address_id]);

        res.json({ ...order, shipping_address: shippingAddress });
    } catch (error) {
        console.error('注文詳細取得エラー:', error);
        res.status(500).json({ error: '注文詳細の取得に失敗しました' });
    }
});

// ============ ユーザー情報API ============

app.put('/api/profile', requireAuth, async (req, res) => {
    try {
        const { company_name, last_name, first_name, phone, postal_code, address, email } = req.body;

        // メールアドレス変更のチェック
        if (email) {
            const existingUser = await getOne('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.session.userId]);
            if (existingUser) {
                return res.status(400).json({ error: 'このメールアドレスは既に使用されています' });
            }
        }

        // 現在のメールアドレスを取得（指定がない場合は変更しないため）
        const currentUser = await getOne('SELECT email FROM users WHERE id = ?', [req.session.userId]);
        const newEmail = email || currentUser.email;

        await runQuery(
            'UPDATE users SET company_name = ?, last_name = ?, first_name = ?, phone = ?, postal_code = ?, address = ?, email = ? WHERE id = ?',
            [company_name, last_name, first_name, phone, postal_code || '', address || '', newEmail, req.session.userId]
        );

        res.json({ success: true, message: '会員情報を更新しました' });
    } catch (error) {
        console.error('会員情報更新エラー:', error);
        res.status(500).json({ error: '会員情報の更新に失敗しました' });
    }
});

app.put('/api/profile/password', requireAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'パスワードを入力してください' });
        }

        const user = await getOne('SELECT * FROM users WHERE id = ?', [req.session.userId]);
        if (!user) {
            return res.status(404).json({ error: 'ユーザーが見つかりません' });
        }

        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: '現在のパスワードが正しくありません' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await runQuery('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.session.userId]);

        res.json({ success: true, message: 'パスワードを更新しました' });
    } catch (error) {
        console.error('パスワード更新エラー:', error);
        res.status(500).json({ error: 'パスワードの更新に失敗しました' });
    }
});

// ============ 配送先API ============

app.get('/api/shipping-addresses', requireAuth, async (req, res) => {
    try {
        const addresses = await getAll('SELECT * FROM shipping_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC', [req.session.userId]);
        res.json(addresses);
    } catch (error) {
        console.error('配送先取得エラー:', error);
        res.status(500).json({ error: '配送先の取得に失敗しました' });
    }
});

app.post('/api/shipping-addresses', requireAuth, async (req, res) => {
    try {
        const { label, postal_code, address, phone, is_default } = req.body;

        if (!label || !postal_code || !address || !phone) {
            return res.status(400).json({ error: '必須項目を入力してください' });
        }

        if (is_default) {
            await runQuery('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.session.userId]);
        }

        await runQuery(
            'INSERT INTO shipping_addresses (user_id, label, postal_code, address, phone, is_default) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.userId, label, postal_code, address, phone, is_default ? 1 : 0]
        );

        const addressId = await getLastInsertId();

        res.json({ success: true, addressId, message: '配送先を追加しました' });
    } catch (error) {
        console.error('配送先追加エラー:', error);
        res.status(500).json({ error: '配送先の追加に失敗しました' });
    }
});

app.put('/api/shipping-addresses/:id', requireAuth, async (req, res) => {
    try {
        const { label, postal_code, address, phone, is_default } = req.body;

        if (is_default) {
            await runQuery('UPDATE shipping_addresses SET is_default = 0 WHERE user_id = ?', [req.session.userId]);
        }

        await runQuery(
            'UPDATE shipping_addresses SET label = ?, postal_code = ?, address = ?, phone = ?, is_default = ? WHERE id = ? AND user_id = ?',
            [label, postal_code, address, phone, is_default ? 1 : 0, req.params.id, req.session.userId]
        );

        res.json({ success: true, message: '配送先を更新しました' });
    } catch (error) {
        console.error('配送先更新エラー:', error);
        res.status(500).json({ error: '配送先の更新に失敗しました' });
    }
});

app.delete('/api/shipping-addresses/:id', requireAuth, async (req, res) => {
    try {
        await runQuery('DELETE FROM shipping_addresses WHERE id = ? AND user_id = ?', [req.params.id, req.session.userId]);
        res.json({ success: true, message: '配送先を削除しました' });
    } catch (error) {
        console.error('配送先削除エラー:', error);
        res.status(500).json({ error: '配送先の削除に失敗しました' });
    }
});

// ============ 管理者API ============

app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await getOne('SELECT * FROM admin_users WHERE username = ?', [username]);
        if (!admin) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'ユーザー名またはパスワードが正しくありません' });
        }

        req.session.adminId = admin.id;
        res.json({ success: true });
    } catch (error) {
        console.error('管理者ログインエラー:', error);
        res.status(500).json({ error: 'ログインに失敗しました' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// 管理者パスワード変更
app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
    try {
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ error: '必須項目を入力してください' });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ error: 'パスワードは6文字以上で設定してください' });
        }

        // 現在のパスワードを確認
        const admin = await getOne('SELECT * FROM admin_users WHERE id = ?', [req.session.adminId]);
        if (!admin) {
            return res.status(404).json({ error: '管理者が見つかりません' });
        }

        const validPassword = await bcrypt.compare(current_password, admin.password);
        if (!validPassword) {
            return res.status(401).json({ error: '現在のパスワードが正しくありません' });
        }

        // 新しいパスワードをハッシュ化
        const hashedPassword = await bcrypt.hash(new_password, 10);

        // パスワードを更新
        await runQuery('UPDATE admin_users SET password = ? WHERE id = ?', [hashedPassword, req.session.adminId]);

        res.json({ success: true, message: 'パスワードを変更しました' });
    } catch (error) {
        console.error('パスワード変更エラー:', error);
        res.status(500).json({ error: 'パスワードの変更に失敗しました' });
    }
});

// 管理者セッションチェック
app.get('/api/admin/me', requireAdmin, async (req, res) => {
    try {
        const admin = await getOne('SELECT id, username FROM admin_users WHERE id = ?', [req.session.adminId]);
        if (!admin) {
            return res.status(404).json({ error: '管理者が見つかりません' });
        }
        res.json(admin);
    } catch (error) {
        console.error('管理者情報取得エラー:', error);
        res.status(500).json({ error: '管理者情報の取得に失敗しました' });
    }
});


app.get('/api/admin/orders', requireAdmin, async (req, res) => {
    try {
        const orders = await getAll('SELECT * FROM orders ORDER BY created_at DESC');

        const ordersWithDetails = await Promise.all(orders.map(async order => {
            const user = await getOne('SELECT * FROM users WHERE id = ?', [order.user_id]);
            const shippingAddress = await getOne('SELECT * FROM shipping_addresses WHERE id = ?', [order.shipping_address_id]);
            const product = await getOne('SELECT * FROM products WHERE id = ?', [order.product_id]);

            return {
                ...order,
                company_name: user ? user.company_name : '不明',
                user_name: user ? `${user.last_name} ${user.first_name}` : '不明',
                product_name: product ? `${product.name}${product.flavor ? `(${product.flavor})` : ''}` : '不明',
                shipping_address: shippingAddress
            };
        }));

        res.json(ordersWithDetails);
    } catch (error) {
        console.error('注文一覧取得エラー:', error);
        res.status(500).json({ error: '注文一覧の取得に失敗しました' });
    }
});

app.put('/api/admin/orders/:id', requireAdmin, async (req, res) => {
    try {
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({ error: 'ステータスを指定してください' });
        }

        // 注文情報を取得
        const order = await getOne('SELECT * FROM orders WHERE id = ?', [req.params.id]);
        if (!order) {
            return res.status(404).json({ error: '注文が見つかりません' });
        }

        // ステータスを更新
        await runQuery('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);

        // ユーザー情報と配送先情報を取得
        const user = await getOne('SELECT * FROM users WHERE id = ?', [order.user_id]);
        const shippingAddress = await getOne('SELECT * FROM shipping_addresses WHERE id = ?', [order.shipping_address_id]);

        // ステータスに応じてメール送信
        if (status === '発送完了' && user) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #16a34a;">商品を発送いたしました</h2>
                    <p>${user.company_name} 様</p>
                    <p>ご注文いただいた商品を発送いたしました。</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">注文情報</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">注文番号:</td>
                                <td style="padding: 8px 0; font-weight: bold;">#${order.id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">商品:</td>
                                <td style="padding: 8px 0;">BASE (ココア味)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">数量:</td>
                                <td style="padding: 8px 0;">${order.quantity}袋</td>
                            </tr>
                        </table>
                    </div>

                    <div style="margin: 20px 0;">
                        <h3>配送先</h3>
                        <p style="margin: 5px 0;"><strong>${shippingAddress.label}</strong></p>
                        <p style="margin: 5px 0;">〒${shippingAddress.postal_code}</p>
                        <p style="margin: 5px 0;">${shippingAddress.address}</p>
                        <p style="margin: 5px 0;">TEL: ${shippingAddress.phone}</p>
                    </div>

                    <div style="background-color: #dcfce7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
                        <p style="margin: 0; color: #166534;">商品到着まで今しばらくお待ちください。</p>
                    </div>

                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                        ご不明な点がございましたら、お気軽にお問い合わせください。<br>
                        今後ともThink Body Japanをよろしくお願いいたします。
                    </p>
                </div>
            `;

            // 発送完了メール送信（非同期・待機しない）
            sendEmail(user.email, `【Think Body Japan】商品を発送いたしました（注文番号: #${order.id}）`, emailHtml)
                .catch(err => console.error('発送完了メール送信失敗:', err));
        } else if (status === 'キャンセル' && user) {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #dc2626;">ご注文がキャンセルされました</h2>
                    <p>${user.company_name} 様</p>
                    <p>以下のご注文がキャンセルされました。</p>
                    
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">注文情報</h3>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">注文番号:</td>
                                <td style="padding: 8px 0; font-weight: bold;">#${order.id}</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">商品:</td>
                                <td style="padding: 8px 0;">BASE (ココア味)</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">数量:</td>
                                <td style="padding: 8px 0;">${order.quantity}袋</td>
                            </tr>
                            <tr>
                                <td style="padding: 8px 0; color: #6b7280;">金額:</td>
                                <td style="padding: 8px 0;">¥${order.total_price.toLocaleString()}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background-color: #fee2e2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
                        <p style="margin: 0; color: #991b1b;">既にお振込みいただいている場合は、ご返金の手続きをさせていただきます。</p>
                    </div>

                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                        ご不明な点がございましたら、お気軽にお問い合わせください。<br>
                        今後ともThink Body Japanをよろしくお願いいたします。
                    </p>
                </div>
            `;

            // キャンセルメール送信（非同期・待機しない）
            sendEmail(user.email, `【Think Body Japan】ご注文がキャンセルされました（注文番号: #${order.id}）`, emailHtml)
                .catch(err => console.error('キャンセルメール送信失敗:', err));
        }

        res.json({ success: true, message: 'ステータスを更新しました' });
    } catch (error) {
        console.error('ステータス更新エラー:', error);
        res.status(500).json({ error: 'ステータスの更新に失敗しました' });
    }
});

app.put('/api/admin/orders/:id/payment', requireAdmin, async (req, res) => {
    try {
        const { payment_confirmed, payment_date } = req.body;

        if (payment_confirmed === undefined) {
            return res.status(400).json({ error: '入金確認ステータスを指定してください' });
        }

        // 入金情報を更新
        await runQuery(
            'UPDATE orders SET payment_confirmed = ?, payment_date = ? WHERE id = ?',
            [payment_confirmed, payment_date || null, req.params.id]
        );

        res.json({ success: true, message: '入金情報を更新しました' });
    } catch (error) {
        console.error('入金情報更新エラー:', error);
        res.status(500).json({ error: '入金情報の更新に失敗しました' });
    }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const users = await getAll('SELECT id, email, company_name, last_name, first_name, phone, postal_code, address, created_at FROM users ORDER BY created_at DESC');
        res.json(users);
    } catch (error) {
        console.error('ユーザー一覧取得エラー:', error);
        res.status(500).json({ error: 'ユーザー一覧の取得に失敗しました' });
    }
});

// 商品管理
app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
        const products = await getAll('SELECT * FROM products ORDER BY id ASC');
        res.json(products);
    } catch (error) {
        console.error('管理者商品取得エラー:', error);
        res.status(500).json({ error: '商品の取得に失敗しました' });
    }
});

app.post('/api/admin/products', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, flavor, price, description, min_quantity, quantity_step, is_active, catch_copy } = req.body;
        // ファイルがアップロードされた場合はそのパスを、なければ空文字を設定
        const image_url = req.file ? `/uploads/${req.file.filename}` : '';

        if (!name || !price) {
            return res.status(400).json({ error: '商品名と価格は必須です' });
        }

        await runQuery(
            'INSERT INTO products (name, flavor, price, image_url, description, min_quantity, quantity_step, is_active, catch_copy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [name, flavor, price, image_url, description, min_quantity || 10, quantity_step || 10, is_active === undefined ? 1 : is_active, catch_copy || '']
        );

        res.json({ success: true, message: '商品を追加しました' });
    } catch (error) {
        console.error('商品追加エラー:', error);
        res.status(500).json({ error: '商品の追加に失敗しました' });
    }
});

app.put('/api/admin/products/:id', requireAdmin, upload.single('image'), async (req, res) => {
    try {
        const { name, flavor, price, description, min_quantity, quantity_step, is_active, catch_copy } = req.body;

        let sql = 'UPDATE products SET name = ?, flavor = ?, price = ?, description = ?, min_quantity = ?, quantity_step = ?, is_active = ?, catch_copy = ?';
        let params = [name, flavor, price, description, min_quantity, quantity_step, is_active, catch_copy || ''];

        // 新しい画像がある場合のみ image_url を更新
        if (req.file) {
            sql += ', image_url = ?';
            params.push(`/uploads/${req.file.filename}`);
        }

        sql += ' WHERE id = ?';
        params.push(req.params.id);

        await runQuery(sql, params);

        res.json({ success: true, message: '商品を更新しました' });
    } catch (error) {
        console.error('商品更新エラー:', error);
        res.status(500).json({ error: '商品の更新に失敗しました' });
    }
});

// ダッシュボード集計API
app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
        // 月の指定があればそれを使用、なければ現在日付
        let targetDate = new Date();
        if (req.query.month) {
            const [y, m] = req.query.month.split('-');
            targetDate = new Date(parseInt(y), parseInt(m) - 1, 1);
        }
        const now = targetDate;
        // const db = new sqlite3.Database(dbPath); // Removed
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastYear = lastMonthDate.getFullYear();
        const lastMonth = lastMonthDate.getMonth() + 1;

        // 日付範囲計算用のヘルパー
        // 指定した年月の初日と翌月の初日を取得（日本時間ベースで計算）
        const getMonthRange = (year, month) => {
            // month is 1-12
            const startStr = `${year}-${String(month).padStart(2, '0')}-01 00:00:00`;

            let nextYear = year;
            let nextMonth = month + 1;
            if (nextMonth > 12) {
                nextMonth = 1;
                nextYear++;
            }
            const endStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01 00:00:00`;

            return {
                start: startStr,
                end: endStr
            };
        };

        // 1. 今月(指定月)の集計
        // JSTでの「今月」の範囲を計算
        // DBにはUTCまたはJSTで入っているが、文字列比較で範囲指定すればインデックスも効きやすく安全
        // ※PostgreSQL(TIMESTAMP)もSQLite(TEXT)もYYYY-MM-DD HH:MM:SS形式での範囲比較は有効
        const currentRange = getMonthRange(currentYear, currentMonth);

        let currentMonthData = await getOne(`
            SELECT 
                COUNT(*) as count, 
                COALESCE(SUM(total_price), 0) as sales,
                COALESCE(SUM(quantity), 0) as total_quantity
            FROM orders 
            WHERE created_at >= ? AND created_at < ?
        `, [currentRange.start, currentRange.end]);

        if (!currentMonthData) currentMonthData = { count: 0, sales: 0, total_quantity: 0 };

        // 2. 前月の売上
        const lastMonthRange = getMonthRange(lastYear, lastMonth);
        const lastMonthData = await getOne(`
            SELECT COALESCE(SUM(total_price), 0) as sales 
            FROM orders 
            WHERE created_at >= ? AND created_at < ?
        `, [lastMonthRange.start, lastMonthRange.end]);

        // 3. 前月比成長率
        let growthRate = 0;
        if (lastMonthData.sales > 0) {
            growthRate = ((currentMonthData.sales - lastMonthData.sales) / lastMonthData.sales) * 100;
        } else if (currentMonthData.sales > 0) {
            growthRate = 100; // 前月0で今月売上ありなら100%扱い
        }

        // 4. 過去6ヶ月の売上推移
        const salesTrend = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const y = d.getFullYear();
            const m = d.getMonth() + 1;
            const mStr = `${y}-${String(m).padStart(2, '0')}`;
            const range = getMonthRange(y, m);

            const monthData = await getOne(`
                SELECT COALESCE(SUM(total_price), 0) as sales 
                FROM orders 
                WHERE created_at >= ? AND created_at < ?
            `, [range.start, range.end]);

            salesTrend.push({
                month: mStr,
                sales: monthData.sales
            });
        }

        // 5. 商品別ランキング (売上金額順)
        const productRanking = await getAll(`
            SELECT 
                p.name, 
                SUM(o.quantity) as total_quantity, 
                SUM(o.total_price) as total_sales 
            FROM orders o
            JOIN products p ON o.product_id = p.id
            GROUP BY p.id
            ORDER BY total_sales DESC
            LIMIT 5
        `, []);

        // 6. 総注文数、稼働商品数
        const totalStats = await getOne(`
            SELECT 
                (SELECT COUNT(*) FROM orders) as totalOrders,
                (SELECT COUNT(*) FROM products WHERE is_active = 1) as activeProducts
        `, []);

        // 数値型への確実な変換（PostgreSQLはBigIntを文字列で返すため）
        const safeInt = (val) => {
            if (val === null || val === undefined) return 0;
            const num = Number(val);
            return isNaN(num) ? 0 : num;
        };

        // 対象月の文字列を生成（YYYY-MM形式）
        const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

        const summary = {
            currentMonthSales: safeInt(currentMonthData.sales),
            lastMonthSales: safeInt(lastMonthData.sales),
            growthRate: Math.round(growthRate * 10) / 10,
            currentMonthOrders: safeInt(currentMonthData.count),
            currentMonthQuantity: safeInt(currentMonthData.total_quantity),
            totalOrders: safeInt(totalStats.totalOrders),
            activeProducts: safeInt(totalStats.activeProducts)
        };

        res.json({
            targetMonth: currentMonthStr,
            summary,
            salesTrend,
            productRanking,
            _debug: {
                currentRange,
                rawCurrentMonthData: currentMonthData,
                currentStr: currentMonthStr
            }
        });
    } catch (err) {
        console.error('Dashboard Error:', err);
        res.status(500).json({ error: 'ダッシュボードデータの取得に失敗しました' });
    }
});

// デバッグ用: 本番DBの中身を覗くエンドポイント (後で削除する)
app.get('/api/debug/dashboard', async (req, res) => {
    try {
        const { isProduction } = require('./database');

        // 1. 環境情報
        const envInfo = {
            isProduction,
            dbUrlExists: !!process.env.DATABASE_URL,
            timestamp: new Date().toISOString()
        };

        // 2. ordersテーブルの全件数
        const count = await getOne('SELECT COUNT(*) as total FROM orders');

        // 3. 最初の5件の生データ (日付フォーマット確認用)
        const sampleOrders = await getAll('SELECT id, created_at, total_price FROM orders ORDER BY id DESC LIMIT 5');

        // 4. まさに今実行しようとしているクエリのテスト
        // 今月 (2025-01 or 2026-01 etc.)
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const startStr = `${y}-${String(m).padStart(2, '0')}-01 00:00:00`;
        const nextM = m === 12 ? 1 : m + 1;
        const nextY = m === 12 ? y + 1 : y;
        const endStr = `${nextY}-${String(nextM).padStart(2, '0')}-01 00:00:00`;

        const queryTest = await getOne(`
            SELECT count(*) as count 
            FROM orders 
            WHERE created_at >= ? AND created_at < ?
        `, [startStr, endStr]);

        res.json({
            envInfo,
            totalOrders: count,
            sampleOrders,
            queryTest: {
                range: { start: startStr, end: endStr },
                result: queryTest
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});


// 請求書発行API
app.get('/api/admin/orders/:id/invoice', requireAdmin, async (req, res) => {
    try {
        const orderId = req.params.id;
        // 注文詳細取得
        const order = await getOne(`
            SELECT o.*, u.company_name, u.email as user_email, p.name as product_name, p.price as product_price
            FROM orders o
            JOIN users u ON o.user_id = u.id
            LEFT JOIN products p ON o.product_id = p.id
            WHERE o.id = ?
        `, [orderId]);

        // user_nameを構築
        order.user_name = order.company_name || 'お客様';

        if (!order) {
            return res.status(404).send('注文が見つかりません');
        }

        // 明細データの構築
        // unit_priceがあればそれを使用（注文時の価格）、なければ商品マスタの価格
        const unitPrice = order.unit_price || order.product_price || 0;

        order.items = [{
            name: order.product_name || 'プロテイン',
            price: unitPrice,
            quantity: order.quantity
        }];

        // 送料などの差額計算
        const itemsTotal = unitPrice * order.quantity;
        const shipping = order.total_price - itemsTotal;

        if (shipping > 0) {
            order.items.push({
                name: '送料・手数料',
                price: shipping,
                quantity: 1
            });
        }

        generateInvoice(order, res);
    } catch (err) {
        console.error('Invoice Error:', err);
        res.status(500).send('請求書の生成に失敗しました');
    }
});

// 領収書発行API
app.get('/api/admin/orders/:id/receipt', requireAdmin, async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await getOne(`
            SELECT o.*, u.company_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = ?
        `, [orderId]);

        // user_nameを構築
        order.user_name = order.company_name || 'お客様';

        if (!order) {
            return res.status(404).send('注文が見つかりません');
        }

        generateReceipt(order, res);
    } catch (err) {
        console.error('Receipt Error:', err);
        res.status(500).send('領収書の生成に失敗しました');
    }
});

// ユーザー側: 領収書発行API
app.get('/api/orders/:id/receipt', requireAuth, async (req, res) => {
    console.log('=== 領収書生成リクエスト開始 ===');
    console.log('注文ID:', req.params.id);
    console.log('ユーザーID:', req.session.userId);

    try {
        const orderId = req.params.id;
        const userId = req.session.userId;

        // 自分の注文かチェック
        const order = await getOne(`
            SELECT o.*, u.company_name
            FROM orders o
            JOIN users u ON o.user_id = u.id
            WHERE o.id = ? AND o.user_id = ?
        `, [orderId, userId]);

        if (!order) {
            console.log('エラー: 注文が見つかりません');
            return res.status(404).send('注文が見つかりません');
        }

        console.log('注文データ取得成功:', order);

        // user_nameを構築
        order.user_name = order.company_name || 'お客様';

        console.log('PDF生成開始...');

        // ファイル名を設定
        const filename = `receipt_${orderId}.pdf`;
        res.attachment(filename);
        res.contentType('application/pdf');

        generateReceipt(order, res);
        console.log('PDF生成関数呼び出し完了');
    } catch (err) {
        console.error('=== User Receipt Error ===');
        console.error('エラーメッセージ:', err.message);
        console.error('スタックトレース:', err.stack);
        res.status(500).send('領収書の生成に失敗しました');
    }
});



// === DEBUG: メール設定診断用エンドポイント ===
app.get('/api/debug/email', async (req, res) => {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = parseInt(process.env.SMTP_PORT || '587');

    // 診断ロジックも本番と同じ設定を使用
    const transportConfig = {
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // ポート465ならtrue
        auth: {
            user: smtpUser,
            pass: smtpPass
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
    };

    const result = {
        config: {
            SMTP_HOST: smtpHost || '(未設定)',
            SMTP_PORT: smtpPort,
            SMTP_SECURE: transportConfig.secure, // 自動判定結果を表示
            SMTP_USER: smtpUser || '(未設定)',
            SMTP_PASS: smtpPass ? '(設定あり)' : '(未設定)',
        },
        connectionTest: '未実行',
        error: null
    };

    if (!smtpHost || !smtpUser || !smtpPass) {
        result.connectionTest = 'スキップ（設定不足）';
        return res.json(result);
    }

    try {
        const tempTransporter = nodemailer.createTransport(transportConfig);
        await tempTransporter.verify();
        result.connectionTest = '成功';
    } catch (error) {
        result.connectionTest = '失敗';
        result.error = error.message;
        result.errorCode = error.code;
    }

    res.json(result);
});

app.listen(PORT, () => {
    console.log(`サーバーが起動しました: http://localhost:${PORT}`);
    console.log(`管理画面: http://localhost:${PORT}/admin.html`);
});
