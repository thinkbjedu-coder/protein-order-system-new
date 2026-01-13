require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('=== メール設定診断 ===');
console.log('Current Working Directory:', process.cwd());

const smtpHost = process.env.SMTP_HOST;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

console.log('SMTP_HOST:', smtpHost ? `'${smtpHost}'` : '(未設定)');
console.log('SMTP_PORT:', process.env.SMTP_PORT || 587);
console.log('SMTP_USER:', smtpUser ? `'${smtpUser}'` : '(未設定)');
console.log('SMTP_PASS:', smtpPass ? '(設定あり - 文字数: ' + smtpPass.length + ')' : '(未設定)');

if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('\n[ERROR] 必須の環境変数が不足しています。.envファイルを確認してください。');
    process.exit(1);
}

const transportConfig = {
    host: smtpHost,
    port: parseInt(process.env.SMTP_PORT || 587),
    secure: false, // 465の場合はtrueにするのが一般的
    auth: {
        user: smtpUser,
        pass: smtpPass
    }
};

const transporter = nodemailer.createTransport(transportConfig);

console.log('\nSMTPサーバーへの接続テスト中...');

transporter.verify((error, success) => {
    if (error) {
        console.error('\n[ERROR] 接続テスト失敗:');
        console.error(error);
    } else {
        console.log('\n[SUCCESS] SMTPサーバーへの接続に成功しました。メール送信は可能です。');
    }
});
