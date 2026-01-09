const { runQuery } = require('./database');
const bcrypt = require('bcryptjs');

// テストユーザーを追加
async function addTestUser() {
    const hashedPassword = await bcrypt.hash('think0305', 10);

    runQuery(
        'INSERT INTO users (email, password, company_name, last_name, first_name, phone, postal_code, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        ['thinkbj.edu@gmail.com', hashedPassword, 'Think Body Japan', 'テスト', 'ユーザー', '08012345678', '', '']
    );

    console.log('テストユーザーを追加しました');
    console.log('メールアドレス: thinkbj.edu@gmail.com');
    console.log('パスワード: think0305');
}

addTestUser();
