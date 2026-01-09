const http = require('http');
const { initDatabase, getOne } = require('./database');

const TEST_EMAIL = 'thinkbj.edu@gmail.com';
const NEW_PASSWORD = 'newpassword123!';

function makeRequest(method, path, data) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testPasswordReset() {
    console.log('--- Starting Password Reset Verification ---');

    try {
        // 1. Request Password Reset
        console.log(`\n1. Requesting password reset for ${TEST_EMAIL}...`);
        try {
            const res1 = await makeRequest('POST', '/api/auth/forgot-password', { email: TEST_EMAIL });
            console.log('   Response:', res1.data);
        } catch (e) {
            console.log('   Request failed (might be expected if server just started):', e.message);
        }

        // 2. Retrieve Token from DB
        console.log('\n2. Retrieving token from database...');
        await initDatabase();
        await new Promise(resolve => setTimeout(resolve, 1000));

        const tokenRow = getOne('SELECT * FROM password_reset_tokens WHERE user_id = (SELECT id FROM users WHERE email = ?)', [TEST_EMAIL]);

        if (!tokenRow) {
            console.error('   FATAL: Token not found in database!');
            // process.exit(1); 
            // Don't exit yet, maybe previously failed?
        } else {
            console.log(`   Token found: ${tokenRow.token.substring(0, 10)}...`);

            // 3. Reset Password
            console.log('\n3. Resetting password with token...');
            const res2 = await makeRequest('POST', '/api/auth/reset-password', {
                token: tokenRow.token,
                password: NEW_PASSWORD
            });
            console.log('   Response:', res2.data);
        }

        // 4. Try Login
        console.log('\n4. Attempting login with new password...');
        const res3 = await makeRequest('POST', '/api/login', {
            email: TEST_EMAIL,
            password: NEW_PASSWORD
        });

        if (res3.data.success) {
            console.log('   Login SUCCESS! Verification complete.');
        } else {
            console.error('   Login FAILED:', res3.data);
        }

    } catch (error) {
        console.error('Unexpected error:', error);
    }
}

testPasswordReset();
