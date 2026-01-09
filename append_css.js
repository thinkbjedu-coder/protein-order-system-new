const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'components.css');
const cssContent = `
/* ダッシュボード */
.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-lg);
}

.stat-card {
    background-color: var(--color-bg-primary);
    border-radius: var(--border-radius-lg);
    padding: var(--spacing-lg);
    box-shadow: var(--shadow-sm);
    display: flex;
    flex-direction: column;
}

.stat-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-xs);
}

.stat-value {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
}

.stat-trend {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm);
    margin-top: var(--spacing-sm);
}

.stat-trend.up { color: var(--color-success); }
.stat-trend.down { color: var(--color-danger); }
`;

fs.appendFileSync(cssPath, cssContent);
console.log('CSSを追記しました');
