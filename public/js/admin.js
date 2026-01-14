// 管理画面処理

// ログイン処理
const adminLoginForm = document.getElementById('admin-login-form');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      const data = getFormData(adminLoginForm);

      const result = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify(data)
      });

      // 管理画面を表示
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-screen').style.display = 'flex';

      document.getElementById('admin-screen').style.display = 'flex';

      switchTab('dashboard');
    } catch (error) {
      const alertContainer = document.getElementById('login-alert');
      alertContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
      hideLoading(submitBtn);
    }
  });
}

// ログアウト
async function adminLogout() {
  try {
    await apiRequest('/api/admin/logout', { method: 'POST' });
    location.reload();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// タブ切り替え
let currentTab = 'dashboard';
let salesChart = null;
let productChart = null;

function switchTab(tab) {
  currentTab = tab;

  // メニューの活性化
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-${tab}`).classList.add('active');

  // コンテンツの切り替え
  document.getElementById('dashboard-content').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('orders-content').style.display = tab === 'orders' ? 'block' : 'none';
  document.getElementById('users-content').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('products-content').style.display = tab === 'products' ? 'block' : 'none';
  document.getElementById('settings-content').style.display = tab === 'settings' ? 'block' : 'none';

  // タイトルの変更
  const titles = {
    'dashboard': 'ダッシュボード',
    'orders': '注文管理',
    'users': 'ユーザー管理',
    'products': '商品管理',
    'settings': '設定'
  };
  document.getElementById('admin-title').textContent = titles[tab] || '管理画面';

  // データの読み込み
  loadCurrentTab();
}

// ダッシュボード日付選択
const dashboardMonthInput = document.getElementById('dashboard-month');
if (dashboardMonthInput) {
  dashboardMonthInput.addEventListener('change', (e) => {
    loadDashboard(e.target.value);
  });
}

function loadCurrentTab() {
  if (currentTab === 'dashboard') {
    const month = document.getElementById('dashboard-month')?.value;
    loadDashboard(month);
  } else if (currentTab === 'orders') {
    loadOrders();
  } else if (currentTab === 'users') {
    loadUsers();
  } else if (currentTab === 'products') {
    loadProducts();
  }
}

async function loadDashboard(month) {
  try {
    // 月指定がない場合は今月をデフォルトにする
    if (!month) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      month = `${y}-${m}`;

      // 入力欄も更新
      const monthInput = document.getElementById('dashboard-month');
      if (monthInput && !monthInput.value) {
        monthInput.value = month;
      }
    }

    let url = '/api/admin/dashboard';
    if (month) url += `?month=${month}`;

    const data = await apiRequest(url);

    // inputの値を更新（サーバーからの返り値で上書き、あるいは初回ロード同期）
    if (data.targetMonth) {
      const monthInput = document.getElementById('dashboard-month');
      if (monthInput) monthInput.value = data.targetMonth;

      // ラベルの動的更新
      const parts = data.targetMonth.split('-');
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      const labelText = `${y}年${m}月の`;

      const labelSales = document.getElementById('label-month-sales');
      if (labelSales) labelSales.textContent = `${labelText}売上`;

      const labelOrders = document.getElementById('label-month-orders');
      if (labelOrders) labelOrders.textContent = `${labelText}注文数`;

      const labelQuantity = document.getElementById('label-month-quantity');
      if (labelQuantity) labelQuantity.textContent = `${labelText}販売数`;
    }

    // KPI更新
    document.getElementById('stat-month-sales').textContent = `¥${parseInt(data.summary.currentMonthSales).toLocaleString()}`;
    document.getElementById('stat-month-orders').textContent = `${data.summary.currentMonthOrders}件`;
    document.getElementById('stat-month-quantity').textContent = `${data.summary.currentMonthQuantity}個`;
    document.getElementById('stat-total-orders').textContent = `${data.summary.totalOrders}件`;
    document.getElementById('stat-active-products').textContent = `${data.summary.activeProducts}`;

    const growthEl = document.getElementById('stat-growth-rate');
    const rate = data.summary.growthRate;
    growthEl.className = `stat-trend ${rate >= 0 ? 'up' : 'down'}`;
    growthEl.innerHTML = `<span>${rate >= 0 ? '↗' : '↘'} ${Math.abs(rate)}%</span><span>前月比</span>`;

    // グラフ更新
    if (window.Chart) {
      updateCharts(data);
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    // エラーでもアラートを出さない（遷移時のちらつき防止）
  }
}

function updateCharts(data) {
  if (salesChart) salesChart.destroy();
  if (productChart) productChart.destroy();

  // Sales Chart
  const salesCtx = document.getElementById('salesChart');
  if (salesCtx) {
    salesChart = new Chart(salesCtx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: data.salesTrend.map(d => d.month),
        datasets: [{
          label: '売上 (円)',
          data: data.salesTrend.map(d => d.sales),
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  }

  // Product Chart
  const productCtx = document.getElementById('productChart');
  if (productCtx) {
    productChart = new Chart(productCtx.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: data.productRanking.map(p => p.name),
        datasets: [{
          data: data.productRanking.map(p => p.total_sales),
          backgroundColor: [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)',
            'rgba(255, 206, 86, 0.7)',
            'rgba(75, 192, 192, 0.7)',
            'rgba(153, 102, 255, 0.7)'
          ]
        }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true
      }
    });
  }
}

// 注文一覧読み込み
let ordersData = []; // 注文データを保存

async function loadOrders() {
  try {
    const orders = await apiRequest('/api/admin/orders');
    ordersData = orders; // データを保存
    const container = document.getElementById('orders-table');

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📦</div>
          <h3 class="empty-state-title">注文がありません</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>注文ID</th>
              <th>注文日時</th>
              <th>事業者名</th>
              <th>合計金額</th>
              <th>入金状況</th>
              <th>ステータス</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="orders-tbody">
            ${orders.map(order => `
              <tr>
                <td><strong>#${order.id}</strong></td>
                <td>${formatDate(order.created_at)}</td>
                <td>${order.company_name}</td>
                <td><strong>${formatPrice(order.total_price)}</strong></td>
                <td>${getPaymentBadge(order.payment_confirmed)}</td>
                <td>${getStatusBadge(order.status)}</td>
                <td>
                  <div style="display: flex; gap: var(--spacing-xs);">
                    <button class="btn btn-sm btn-primary" onclick="showOrderDetail(${order.id})">
                      詳細
                    </button>
                    <button class="btn btn-sm btn-outline" onclick="updateStatus(${order.id}, '${order.status}')">
                      ステータス変更
                    </button>
                    ${order.payment_confirmed !== 1 ? `
                      <button class="btn btn-sm btn-success" onclick="confirmPayment(${order.id})" style="background-color: #16a34a; border-color: #16a34a;">
                        💰 入金確認
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // 検索機能の初期化
    initOrderSearch();
  } catch (error) {
    console.error('Orders error:', error);
    const alertContainer = document.getElementById('admin-alert');
    if (alertContainer) {
      alertContainer.innerHTML = `<div class="alert alert-error">注文一覧の取得に失敗しました</div>`;
    }
  }
}


// 注文検索・フィルタリング機能
function initOrderSearch() {
  const searchInput = document.getElementById('order-search');
  const filterDateFrom = document.getElementById('filter-date-from');
  const filterDateTo = document.getElementById('filter-date-to');
  const filterStatus = document.getElementById('filter-status');
  const filterPayment = document.getElementById('filter-payment');

  if (!searchInput) return;

  // 検索・フィルタリング処理
  const applyFilters = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const dateFrom = filterDateFrom?.value;
    const dateTo = filterDateTo?.value;
    const status = filterStatus?.value;
    const payment = filterPayment?.value;

    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;

    const rows = tbody.getElementsByTagName('tr');

    for (let row of rows) {
      const orderId = row.cells[0].textContent.toLowerCase();
      const orderDate = row.cells[1].textContent;
      const companyName = row.cells[2].textContent.toLowerCase();
      const rowStatus = row.cells[5].textContent.trim();
      const paymentBadge = row.cells[4].textContent.trim();

      // 検索条件チェック
      const matchesSearch = orderId.includes(searchTerm) || companyName.includes(searchTerm);

      // 日付範囲チェック
      let matchesDateRange = true;
      if (dateFrom || dateTo) {
        const orderDateStr = orderDate.split(' ')[0]; // "2024-01-01 12:00" -> "2024-01-01"
        if (dateFrom && orderDateStr < dateFrom) matchesDateRange = false;
        if (dateTo && orderDateStr > dateTo) matchesDateRange = false;
      }

      // ステータスチェック
      const matchesStatus = !status || rowStatus === status;

      // 入金状況チェック
      let matchesPayment = true;
      if (payment) {
        const isPaid = paymentBadge.includes('入金済み');
        matchesPayment = (payment === '1' && isPaid) || (payment === '0' && !isPaid);
      }

      // すべての条件を満たす場合のみ表示
      if (matchesSearch && matchesDateRange && matchesStatus && matchesPayment) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  };

  // イベントリスナー設定
  searchInput.addEventListener('input', applyFilters);
  filterDateFrom?.addEventListener('change', applyFilters);
  filterDateTo?.addEventListener('change', applyFilters);
  filterStatus?.addEventListener('change', applyFilters);
  filterPayment?.addEventListener('change', applyFilters);
}

// フィルタークリア機能
function clearOrderFilters() {
  document.getElementById('order-search').value = '';
  document.getElementById('filter-date-from').value = '';
  document.getElementById('filter-date-to').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-payment').value = '';

  // フィルターを再適用
  const tbody = document.getElementById('orders-tbody');
  if (tbody) {
    const rows = tbody.getElementsByTagName('tr');
    for (let row of rows) {
      row.style.display = '';
    }
  }
}


// CSV出力機能
function exportOrdersToCSV() {
  if (ordersData.length === 0) {
    alert('出力する注文データがありません');
    return;
  }

  // CSVヘッダー
  const headers = ['注文ID', '注文日時', '事業者名', '担当者', 'メールアドレス', '電話番号', '商品', '数量', '単価', '合計金額', 'ステータス', '配送先ラベル', '郵便番号', '住所', '配送先電話番号'];

  // CSVデータ作成
  const csvRows = [headers.join(',')];

  ordersData.forEach(order => {
    const row = [
      `#${order.id}`,
      formatDate(order.created_at),
      `"${order.company_name}"`,
      `"${order.user_name}"`,
      order.user_email || '',
      order.user_phone || '',
      'BASE (ココア味)',
      order.quantity,
      order.unit_price,
      order.total_price,
      order.status,
      order.shipping_address ? `"${order.shipping_address.label}"` : '',
      order.shipping_address ? order.shipping_address.postal_code : '',
      order.shipping_address ? `"${order.shipping_address.address}"` : '',
      order.shipping_address ? order.shipping_address.phone : ''
    ];
    csvRows.push(row.join(','));
  });

  // BOM付きCSVデータ作成（Excel対応）
  const csvContent = '\uFEFF' + csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  // ダウンロード
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const filename = `orders_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.csv`;

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 成功メッセージ
  const alertContainer = document.getElementById('admin-alert');
  if (alertContainer) {
    alertContainer.innerHTML = `<div class="alert alert-success">CSVファイルをダウンロードしました</div>`;
    setTimeout(() => {
      alertContainer.innerHTML = '';
    }, 3000);
  }
}

// ステータス更新モーダル
function updateStatus(orderId, currentStatus) {
  document.getElementById('status-order-id').value = orderId;
  document.querySelector('#status-form select[name="status"]').value = currentStatus;
  openModal('status-modal');
}

// 入金確認モーダル
function confirmPayment(orderId) {
  document.getElementById('payment-order-id').value = orderId;
  // 今日の日付をデフォルトで設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('payment-date-input').value = today;
  openModal('payment-modal');
}

// 入金確認送信
const paymentForm = document.getElementById('payment-form');
if (paymentForm) {
  paymentForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = paymentForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      const orderId = document.getElementById('payment-order-id').value;
      const paymentDate = document.getElementById('payment-date-input').value;

      const result = await apiRequest(`/api/admin/orders/${orderId}/payment`, {
        method: 'PUT',
        body: JSON.stringify({
          payment_confirmed: 1,
          payment_date: paymentDate
        })
      });

      const alertContainer = document.getElementById('admin-alert');
      if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
        setTimeout(() => {
          alertContainer.innerHTML = '';
        }, 3000);
      }

      closeModal('payment-modal');
      loadOrders();
      hideLoading(submitBtn);
    } catch (error) {
      const alertContainer = document.getElementById('admin-alert');
      if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
      }
      hideLoading(submitBtn);
    }
  });
}

// ステータス更新送信
const statusForm = document.getElementById('status-form');
if (statusForm) {
  statusForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = statusForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      const orderId = document.getElementById('status-order-id').value;
      const status = statusForm.elements.status.value;

      const result = await apiRequest(`/api/admin/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });

      const alertContainer = document.getElementById('admin-alert');
      if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
        setTimeout(() => {
          alertContainer.innerHTML = '';
        }, 3000);
      }

      closeModal('status-modal');
      loadOrders();
      hideLoading(submitBtn);
    } catch (error) {
      const alertContainer = document.getElementById('admin-alert');
      if (alertContainer) {
        alertContainer.innerHTML = `<div class="alert alert-error">${error.message}</div>`;
      }
      hideLoading(submitBtn);
    }
  });
}

// 注文詳細表示
function showOrderDetail(orderId) {
  const order = ordersData.find(o => o.id === orderId);
  if (!order) {
    console.error('Order not found:', orderId);
    return;
  }

  const detailContent = document.getElementById('detail-content');

  // トラッキング状況の計算
  const statusesList = ['受付', '準備中', '発送完了', '到着'];
  const currentStatus = order.status === '処理中' ? '受付' : order.status;
  const statusIndex = statusesList.indexOf(currentStatus);

  let trackingHtml = '';
  if (statusIndex !== -1) {
    const progressPercent = statusIndex * 33.33;
    trackingHtml = `
      <div class="tracking-container" style="margin-bottom: var(--spacing-xl);">
        <div class="tracking-steps">
          <div class="tracking-progress-fill" style="width: ${progressPercent}%;"></div>
          ${statusesList.map((s, idx) => {
      let className = 'tracking-step';
      if (idx < statusIndex) className += ' completed';
      if (idx === statusIndex) className += ' active';
      return `
              <div class="${className}">
                <div class="tracking-dot"></div>
                <div class="tracking-label">${s}</div>
              </div>
            `;
    }).join('')}
        </div>
      </div>
    `;
  }

  detailContent.innerHTML = `
    ${trackingHtml}
    <div style="display: grid; gap: var(--spacing-lg);">
      <!-- 基本情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          📋 基本情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">注文ID:</div>
          <div><strong>#${order.id}</strong></div>
          
          <div style="color: var(--color-text-secondary);">注文日時:</div>
          <div>${formatDate(order.created_at)}</div>
          
          <div style="color: var(--color-text-secondary);">ステータス:</div>
          <div>${getStatusBadge(order.status)}</div>

          <div style="color: var(--color-text-secondary);">入金状況:</div>
          <div>
            ${getPaymentBadge(order.payment_confirmed)}
            ${order.payment_confirmed === 1 && order.payment_date ? `<span style="margin-left: 8px; font-size: 0.9em; color: var(--color-text-secondary);">(${formatDate(order.payment_date).split(' ')[0]})</span>` : ''}
          </div>
        </div>
      </div>

      <!-- 顧客情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          👤 顧客情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">事業者名:</div>
          <div><strong>${order.company_name}</strong></div>
          
          <div style="color: var(--color-text-secondary);">担当者:</div>
          <div>${order.user_name}</div>
        </div>
      </div>

      <!-- 注文内容 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          🛒 注文内容
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">商品:</div>
          <div>BASE</div>
          
          <div style="color: var(--color-text-secondary);">数量:</div>
          <div>${order.quantity}袋</div>
          
          <div style="color: var(--color-text-secondary);">単価:</div>
          <div>${formatPrice(order.unit_price)}</div>
          
          <div style="color: var(--color-text-secondary);">合計金額:</div>
          <div><strong style="font-size: var(--font-size-lg); color: var(--color-accent);">${formatPrice(order.total_price)}</strong></div>
        </div>
      </div>

      <!-- 配送先情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          📦 配送先情報
        </h4>
        ${order.shipping_address ? `
          <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
            <div style="color: var(--color-text-secondary);">ラベル:</div>
            <div><strong>${order.shipping_address.label}</strong></div>
            
            <div style="color: var(--color-text-secondary);">郵便番号:</div>
            <div>${order.shipping_address.postal_code}</div>
            
            <div style="color: var(--color-text-secondary);">住所:</div>
            <div>${order.shipping_address.address}</div>
            
            <div style="color: var(--color-text-secondary);">電話番号:</div>
            <div>${order.shipping_address.phone}</div>
          </div>
        ` : '<p style="color: var(--color-text-secondary);">配送先情報がありません</p>'}
      </div>
      <!-- 帳票発行アクション -->
      <div style="margin-top: var(--spacing-xl); padding-top: var(--spacing-lg); border-top: 1px solid var(--color-border); display: flex; gap: var(--spacing-md); justify-content: flex-end;">
          <button class="btn btn-outline" onclick="window.open('/api/admin/orders/${order.id}/invoice', '_blank')">
            📄 請求書発行
          </button>
      </div>
    </div>
  `;

  openModal('detail-modal');
}

// ユーザー一覧読み込み
let usersData = [];

// ユーザー取得
async function loadUsers() {
  try {
    const users = await apiRequest('/api/admin/users');
    usersData = users;
    const container = document.getElementById('users-table');
    const statsContainer = document.getElementById('users-stats');

    // 統計の表示
    statsContainer.innerHTML = `
      <div class="card">
        <div class="card-body" style="text-align: center; padding: var(--spacing-lg);">
          <div style="font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: var(--spacing-xs);">総会員数</div>
          <div style="font-size: var(--font-size-4xl); font-weight: var(--font-weight-bold); color: var(--color-primary);">${users.length} <span style="font-size: var(--font-size-lg);">社</span></div>
        </div>
      </div>
    `;

    if (users.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👤</div>
          <h3 class="empty-state-title">ユーザーが登録されていません</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>事業者名</th>
              <th>担当者</th>
              <th>メールアドレス</th>
              <th>電話番号</th>
              <th>登録日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(user => `
              <tr>
                <td><strong>#${user.id}</strong></td>
                <td><strong>${user.company_name}</strong></td>
                <td>${user.last_name} ${user.first_name}</td>
                <td>${user.email}</td>
                <td>${user.phone}</td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="showUserDetail(${user.id})">
                    詳細
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    console.error('Users error:', error);
    const alertContainer = document.getElementById('admin-alert');
    if (alertContainer) {
      alertContainer.innerHTML = `<div class="alert alert-error">ユーザー一覧の取得に失敗しました</div>`;
    }
  }
}

// ユーザー詳細表示
function showUserDetail(userId) {
  const user = usersData.find(u => u.id === userId);
  if (!user) {
    console.error('User not found:', userId);
    return;
  }

  const detailContent = document.getElementById('user-detail-content');

  detailContent.innerHTML = `
    <div style="display: grid; gap: var(--spacing-lg);">
      <!-- 基本情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          🏢 事業者情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">ユーザーID:</div>
          <div><strong>#${user.id}</strong></div>
          
          <div style="color: var(--color-text-secondary);">事業者名:</div>
          <div><strong>${user.company_name}</strong></div>
          
          <div style="color: var(--color-text-secondary);">登録日:</div>
          <div>${formatDate(user.created_at)}</div>
        </div>
      </div>

      <!-- 担当者情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          👤 担当者情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">氏名:</div>
          <div><strong>${user.last_name} ${user.first_name}</strong></div>
          
          <div style="color: var(--color-text-secondary);">メールアドレス:</div>
          <div>${user.email}</div>
          
          <div style="color: var(--color-text-secondary);">電話番号:</div>
          <div>${user.phone}</div>
        </div>
      </div>

      <!-- 住所情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          📍 住所情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">郵便番号:</div>
          <div>${user.postal_code || '未登録'}</div>
          
          <div style="color: var(--color-text-secondary);">住所:</div>
          <div>${user.address || '未登録'}</div>
        </div>
      </div>

      <!-- セキュリティ情報 -->
      <div>
        <h4 style="font-weight: var(--font-weight-bold); margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-sm); border-bottom: 2px solid var(--color-border);">
          🔒 セキュリティ情報
        </h4>
        <div style="display: grid; grid-template-columns: 150px 1fr; gap: var(--spacing-sm); font-size: var(--font-size-base);">
          <div style="color: var(--color-text-secondary);">パスワード:</div>
          <div style="color: var(--color-text-secondary);">●●●●●●●● (セキュリティのため非表示)</div>
        </div>
      </div>
    </div>
  `;

  openModal('user-detail-modal');
}

// 商品管理ロジック
let productsData = [];

async function loadProducts() {
  try {
    const products = await apiRequest('/api/admin/products');
    productsData = products;
    const container = document.getElementById('products-table');
    if (!container) return;

    if (products.length === 0) {
      container.innerHTML = '<div class="empty-state">商品が登録されていません</div>';
      return;
    }

    container.innerHTML = `
      <div class="table-container">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>商品名</th>
              <th>味</th>
              <th>価格</th>
              <th>最小注文数</th>
              <th>ステータス</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td>#${p.id}</td>
                <td><strong>${p.name}</strong></td>
                <td>${p.flavor || '-'}</td>
                <td>${formatPrice(p.price)}</td>
                <td>${p.min_quantity}袋〜</td>
                <td>
                  <span class="badge ${p.is_active ? 'badge-success' : 'badge-danger'}">
                    ${p.is_active ? '公開中' : '停止中'}
                  </span>
                </td>
                <td>
                  <button class="btn btn-sm btn-outline" onclick="editProduct(${p.id})">編集</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    console.error('Products load error:', error);
  }
}

function showProductModal(productId = null) {
  const modalTitle = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');
  form.reset();
  document.getElementById('product-id').value = '';

  const previewContainer = document.getElementById('current-image-preview');
  const previewImage = previewContainer.querySelector('img');

  if (productId) {
    modalTitle.textContent = '商品編集';
    const product = productsData.find(p => p.id === productId);
    if (product) {
      form.id.value = product.id;
      form.name.value = product.name;
      form.flavor.value = product.flavor || '';
      form.price.value = product.price;
      form.min_quantity.value = product.min_quantity;
      form.quantity_step.value = product.quantity_step;
      form.description.value = product.description || '';
      form.catch_copy.value = product.catch_copy || '';
      form.is_active.value = product.is_active;

      if (product.image_url) {
        previewImage.src = product.image_url;
        previewContainer.style.display = 'block';
      } else {
        previewContainer.style.display = 'none';
      }
    }
  } else {
    modalTitle.textContent = '新規商品追加';
    previewContainer.style.display = 'none';
  }
  openModal('product-modal');
}

window.editProduct = (id) => showProductModal(id);

const productForm = document.getElementById('product-form');
if (productForm) {
  productForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = productForm.querySelector('button[type="submit"]');
    showLoading(submitBtn);

    try {
      const formData = new FormData(productForm);
      const id = formData.get('id');

      const url = id ? `/api/admin/products/${id}` : '/api/admin/products';
      const method = id ? 'PUT' : 'POST';

      await apiRequest(url, {
        method,
        body: formData
      });

      showAlert(id ? '商品を更新しました' : '商品を追加しました', 'success');
      closeModal('product-modal');
      loadProducts();
    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      hideLoading(submitBtn);
    }
  });
}

// ドラッグ&ドロップとプレビュー機能
const dropZone = document.getElementById('image-drop-zone');
const fileInput = document.getElementById('product-image-input');
const dropZoneContent = document.getElementById('drop-zone-content');
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');

if (dropZone && fileInput) {
  // クリックでファイル選択
  dropZone.addEventListener('click', (e) => {
    if (e.target !== removeImageBtn && !removeImageBtn.contains(e.target)) {
      fileInput.click();
    }
  });

  // ドラッグオーバー
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--color-primary)';
    dropZone.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
  });

  // ドラッグリーブ
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--color-border)';
    dropZone.style.backgroundColor = 'var(--color-bg-secondary)';
  });

  // ドロップ
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--color-border)';
    dropZone.style.backgroundColor = 'var(--color-bg-secondary)';

    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
      handleImageFile(files[0]);
    }
  });

  // ファイル選択
  fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleImageFile(files[0]);
    }
  });

  // 画像削除ボタン
  if (removeImageBtn) {
    removeImageBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.value = '';
      previewContainer.style.display = 'none';
      dropZoneContent.style.display = 'block';
    });
  }

  // 画像ファイル処理
  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImage.src = e.target.result;
      dropZoneContent.style.display = 'none';
      previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // FileListを作成してinputに設定
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
  }
}

// パスワード変更フォーム
const passwordChangeForm = document.getElementById('password-change-form');
if (passwordChangeForm) {
  passwordChangeForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = passwordChangeForm.querySelector('button[type="submit"]');
    const formData = new FormData(passwordChangeForm);
    const currentPassword = formData.get('current_password');
    const newPassword = formData.get('new_password');
    const newPasswordConfirm = formData.get('new_password_confirm');

    // パスワード確認
    if (newPassword !== newPasswordConfirm) {
      showAlert('新しいパスワードが一致しません', 'error');
      return;
    }

    showLoading(submitBtn);

    try {
      const result = await apiRequest('/api/admin/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      showAlert(result.message, 'success');
      passwordChangeForm.reset();
    } catch (error) {
      showAlert(error.message, 'error');
    } finally {
      hideLoading(submitBtn);
    }
  });
}

// ページ読み込み時に管理者セッションをチェック
(async function checkAdminSession() {
  try {
    const admin = await apiRequest('/api/admin/me');
    // セッションが有効な場合、管理画面を表示
    if (admin) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-screen').style.display = 'flex';
      loadDashboard();
    }
  } catch (error) {
    // セッションが無効な場合、ログイン画面を表示（デフォルト）
    console.log('管理者セッションなし、ログイン画面を表示');
  }
})();

