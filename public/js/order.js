// 注文処理
let currentProduct = null;
let products = [];

// 商品一覧読み込み
async function loadProducts() {
    try {
        products = await apiRequest('/api/products');
        if (products.length === 0) {
            showAlert('販売中の商品がありません', 'error');
            return;
        }

        const select = document.getElementById('product-select');
        select.innerHTML = '';

        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            // 税込価格表示
            option.textContent = `${product.name} ${product.flavor ? `(${product.flavor})` : ''} - ¥${product.price.toLocaleString()}`;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            const productId = parseInt(e.target.value);
            currentProduct = products.find(p => p.id === productId);
            updateProductUI();
        });

        // デフォルトで最初の商品を選択
        currentProduct = products[0];
        updateProductUI();
    } catch (error) {
        console.error('Products error:', error);
    }
}

// UIに商品情報を反映
function updateProductUI() {
    if (!currentProduct) return;

    // 商品情報の表示更新
    const img = document.getElementById('product-image');
    if (img && currentProduct.image_url) img.src = currentProduct.image_url;

    const nameEl = document.getElementById('product-name');
    if (nameEl) nameEl.textContent = currentProduct.name;

    const flavorEl = document.getElementById('product-flavor');
    if (flavorEl) flavorEl.textContent = currentProduct.flavor || '';

    const priceDisplay = document.getElementById('product-price-display');
    if (priceDisplay) {
        priceDisplay.innerHTML = `${formatPrice(currentProduct.price)} <span style="font-size: var(--font-size-sm); font-weight: normal; color: var(--color-text-secondary);">/ 袋（税込）</span>`;
    }

    // 商品説明
    const descriptionList = document.getElementById('product-description');
    if (descriptionList && currentProduct.description) {
        descriptionList.innerHTML = currentProduct.description.split('。').filter(s => s).map(s => `<li><strong>${s}</strong></li>`).join('');
    }

    // キャッチコピー
    const catchCopy = document.getElementById('product-catch-copy');
    if (catchCopy) {
        if (currentProduct.catch_copy) {
            catchCopy.innerHTML = currentProduct.catch_copy.replace(/\r?\n/g, '<br>');
        } else {
            catchCopy.innerHTML = '';
        }
    }

    // 最小注文数とステップの設定
    const quantityInput = document.getElementById('quantity');
    if (quantityInput) {
        quantityInput.min = currentProduct.min_quantity;
        quantityInput.step = currentProduct.quantity_step;
        quantityInput.value = currentProduct.min_quantity;
    }

    const minQtyLabel = document.querySelector('.note-box p');
    if (minQtyLabel) minQtyLabel.textContent = `${currentProduct.min_quantity}袋から注文可能です`;

    const helpText = document.querySelector('.form-help');
    if (helpText) helpText.textContent = `最小注文数量: ${currentProduct.min_quantity}袋(${currentProduct.quantity_step}個単位)`;

    // 単価の表示更新
    const summaryUnitPrice = document.getElementById('summary-unit-price');
    if (summaryUnitPrice) summaryUnitPrice.textContent = formatPrice(currentProduct.price);

    const modalUnitPrice = document.getElementById('modal-unit-price');
    if (modalUnitPrice) modalUnitPrice.textContent = formatPrice(currentProduct.price);

    const modalProductName = document.getElementById('modal-product-name');
    if (modalProductName) modalProductName.textContent = `${currentProduct.name} ${currentProduct.flavor ? `(${currentProduct.flavor})` : ''}`;

    updateSummary();
}

// 配送先読み込み
async function loadShippingAddresses() {
    try {
        const addresses = await apiRequest('/api/shipping-addresses');
        const select = document.getElementById('shipping_address_id');

        if (addresses.length === 0) {
            select.innerHTML = '<option value="">配送先を登録してください</option>';
            return;
        }

        select.innerHTML = '<option value="">配送先を選択してください</option>';
        addresses.forEach(addr => {
            const option = document.createElement('option');
            option.value = addr.id;
            option.textContent = `${addr.label} - ${addr.address}`;
            if (addr.is_default) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Shipping addresses error:', error);
    }
}

// 合計金額更新
function updateSummary() {
    if (!currentProduct) return;
    const quantity = parseInt(document.getElementById('quantity').value);
    const total = quantity * currentProduct.price;

    document.getElementById('summary-quantity').textContent = `${quantity}袋`;
    document.getElementById('summary-total').textContent = formatPrice(total);
}

// 数量変更時
document.getElementById('quantity').addEventListener('input', updateSummary);

// 注文送信
const orderForm = document.getElementById('order-form');
const confirmBtn = document.getElementById('confirm-order-btn');

orderForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
        if (!currentProduct) throw new Error('商品情報を読み込み中です');

        const quantity = parseInt(document.getElementById('quantity').value);
        const shippingSelect = document.getElementById('shipping_address_id');
        const shipping_address_id = parseInt(shippingSelect.value);

        if (!shipping_address_id) {
            throw new Error('配送先を選択してください');
        }

        if (quantity < currentProduct.min_quantity) {
            throw new Error(`最小注文数量は${currentProduct.min_quantity}袋です`);
        }

        if (quantity % currentProduct.quantity_step !== 0) {
            throw new Error(`数量は${currentProduct.quantity_step}個単位で入力してください`);
        }

        // モーダルに情報を反映
        document.getElementById('modal-quantity').textContent = `${quantity}袋`;
        document.getElementById('modal-total').textContent = formatPrice(quantity * currentProduct.price);
        document.getElementById('modal-shipping-address').textContent = shippingSelect.options[shippingSelect.selectedIndex].text;

        // モーダルの商品名も更新
        const modalProductName = document.querySelector('#confirm-modal span[style*="font-weight: var(--font-weight-bold)"]');
        if (modalProductName) modalProductName.textContent = `${currentProduct.name} ${currentProduct.flavor ? `(${currentProduct.flavor})` : ''}`;

        // 前回のエラーメッセージをクリア
        const errorDiv = document.getElementById('modal-error-message');
        if (errorDiv) errorDiv.style.display = 'none';

        // モーダルを表示
        openModal('confirm-modal');

    } catch (error) {
        showAlert(error.message, 'error');
    }
});

// モーダル内の「確定」ボタンが押された時の処理
confirmBtn.addEventListener('click', async () => {
    showLoading(confirmBtn);

    try {
        const quantity = parseInt(document.getElementById('quantity').value);
        const shipping_address_id = parseInt(document.getElementById('shipping_address_id').value);

        const result = await apiRequest('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
                product_id: currentProduct.id,
                shipping_address_id,
                quantity
            })
        });

        showAlert(result.message, 'success');
        closeModal('confirm-modal');

        // 注文履歴へリダイレクト
        setTimeout(() => {
            window.location.href = '/history.html';
        }, 1500);

    } catch (error) {
        // モーダル内にエラーを表示
        const errorDiv = document.getElementById('modal-error-message');
        const errorText = document.getElementById('modal-error-text');
        if (errorDiv && errorText) {
            errorText.textContent = error.message;
            errorDiv.style.display = 'block';
        }
        hideLoading(confirmBtn);
    }
});

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

// ページ読み込み時
loadProducts();
loadShippingAddresses();
