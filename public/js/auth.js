// 認証処理

// タブ切り替え
const tabs = document.querySelectorAll('.auth-tab');
const forms = document.querySelectorAll('.auth-form');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const targetTab = tab.dataset.tab;

        tabs.forEach(t => t.classList.remove('active'));
        forms.forEach(f => f.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${targetTab}-form`).classList.add('active');
    });
});

// URLパラメータによるタブ切り替え
const urlParams = new URLSearchParams(window.location.search);
const initialTab = urlParams.get('tab');
if (initialTab && (initialTab === 'login' || initialTab === 'register')) {
    const targetTabBtn = document.querySelector(`.auth-tab[data-tab="${initialTab}"]`);
    if (targetTabBtn) {
        targetTabBtn.click();
    }
}

// 新規登録
const registerForm = document.getElementById('register-form');
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = registerForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
        const data = getFormData(registerForm);

        // パスワードバリデーション
        if (data.password.length < 8) {
            throw new Error('パスワードは8文字以上で入力してください');
        }

        const result = await apiRequest('/api/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showAlert(result.message, 'success');

        // ホーム画面へリダイレクト
        setTimeout(() => {
            window.location.href = '/home.html';
        }, 1000);

    } catch (error) {
        showAlert(error.message, 'error');
        hideLoading(submitBtn);
    }
});

// ログイン
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
        const data = getFormData(loginForm);

        const result = await apiRequest('/api/login', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showAlert('ログインしました', 'success');

        // ホーム画面へリダイレクト
        setTimeout(() => {
            window.location.href = '/home.html';
        }, 500);

    } catch (error) {
        showAlert(error.message, 'error');
        hideLoading(submitBtn);
    }
});

// すでにログイン済みの場合はホームへリダイレクト
checkAuth().then(user => {
    if (user) {
        window.location.href = '/home.html';
    }
});
