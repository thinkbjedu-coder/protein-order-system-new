// ユーティリティ関数

// APIリクエスト
async function apiRequest(url, options = {}) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (options.body instanceof FormData) {
            delete headers['Content-Type'];
        }

        const response = await fetch(url, {
            headers,
            ...options
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'リクエストに失敗しました');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// アラート表示
function showAlert(message, type = 'info') {
    const container = document.getElementById('alert-container');
    if (!container) return;

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;

    container.innerHTML = '';
    container.appendChild(alert);

    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// 日付フォーマット
function formatDate(dateString) {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

// 金額フォーマット
function formatPrice(price) {
    return new Intl.NumberFormat('ja-JP', {
        style: 'currency',
        currency: 'JPY'
    }).format(price);
}

// フォームデータ取得
function getFormData(form) {
    const formData = new FormData(form);
    const data = {};

    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }

    return data;
}

// ローディング表示
function showLoading(button) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = '<span class="loading"></span> 処理中...';
}

function hideLoading(button) {
    button.disabled = false;
    button.textContent = button.dataset.originalText || 'Submit';
}

// 認証チェック
async function checkAuth() {
    try {
        const user = await apiRequest('/api/me');
        return user;
    } catch (error) {
        return null;
    }
}

// ログアウト
async function logout() {
    try {
        await apiRequest('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// ステータスバッジ
function getStatusBadge(status) {
    const badges = {
        '受付': 'badge-info',
        '処理中': 'badge-info', // 互換性
        '準備中': 'badge-warning',
        '発送完了': 'badge-success',
        '到着': 'badge-success',
        'キャンセル': 'badge-danger',
        '保留': 'badge-warning'
    };

    const badgeClass = badges[status] || 'badge-primary';
    return `<span class="badge ${badgeClass}">${status}</span>`;
}

// 入金バッジ
function getPaymentBadge(paymentConfirmed) {
    if (paymentConfirmed === 1) {
        return `<span class="badge badge-success">✓ 入金済</span>`;
    } else {
        return `<span class="badge badge-danger">未入金</span>`;
    }
}

// モーダル制御
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// ページ読み込み時の認証チェック（認証不要なページ以外）
if (!window.location.pathname.includes('index.html') &&
    window.location.pathname !== '/' &&
    !window.location.pathname.includes('forgot_password.html') &&
    !window.location.pathname.includes('reset_password.html') &&
    !window.location.pathname.includes('admin.html')) {
    checkAuth().then(user => {
        if (!user) {
            window.location.href = '/';
        }
    });
}
