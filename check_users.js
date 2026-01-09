const { initDatabase, getAll } = require('./database');

async function checkUsers() {
    await initDatabase();
    const users = getAll('SELECT id, email, company_name, last_name, first_name FROM users');
    console.log('登録ユーザー一覧:');
    console.log(JSON.stringify(users, null, 2));

    const admins = getAll('SELECT id, username FROM admin_users');
    console.log('\n管理者一覧:');
    console.log(JSON.stringify(admins, null, 2));
}

checkUsers();
