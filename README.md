# プロテイン注文システム

高齢者向けプロテイン販売のための注文管理システムです。ユーザー登録、商品注文、管理者による注文管理、PDF請求書・領収書発行などの機能を提供します。

## 主な機能

### ユーザー機能
- 会員登録・ログイン
- パスワードリセット
- 商品注文(最小10袋から)
- 配送先管理
- 注文履歴確認
- 領収書ダウンロード

### 管理者機能
- ダッシュボード(売上統計、グラフ表示)
- 注文管理(ステータス更新、入金確認)
- 商品管理(追加、編集、画像アップロード)
- ユーザー管理
- CSV出力
- PDF請求書・領収書発行

## 技術スタック

- **Backend**: Node.js, Express
- **Database**: SQLite (開発環境) / PostgreSQL (本番環境)
- **PDF生成**: PDFKit
- **メール送信**: Nodemailer
- **認証**: bcryptjs, express-session

## セットアップ手順

### 1. リポジトリのクローン

```bash
git clone <repository-url>
cd プロテイン注文
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. 環境変数の設定

`.env.example`をコピーして`.env`ファイルを作成し、必要な情報を設定してください。

```bash
cp .env.example .env
```

`.env`ファイルの内容:

```env
# メール設定
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
ADMIN_EMAIL=admin@example.com

# PDF発行元情報
COMPANY_NAME=株式会社YourCompany
COMPANY_ADDRESS=東京都〇〇区〇〇1-2-3
INVOICE_NUMBER=T1234567890123

# データベース設定(本番環境のみ)
DATABASE_URL=postgresql://user:password@host:port/database
```

### 4. アップロードディレクトリの作成

```bash
mkdir -p public/uploads
```

### 5. サーバーの起動

```bash
npm start
```

サーバーは `http://localhost:3000` で起動します。

## 初期アカウント

### 管理者アカウント
- **ユーザー名**: `admin`
- **パスワード**: `admin123`

**重要**: 本番環境では必ずパスワードを変更してください。

### テストユーザー
- **メールアドレス**: `test@example.com`
- **パスワード**: `test123`

## ディレクトリ構造

```
プロテイン注文/
├── public/              # 静的ファイル
│   ├── css/            # スタイルシート
│   ├── js/             # クライアントサイドJS
│   ├── uploads/        # アップロードされた画像
│   └── *.html          # HTMLページ
├── services/           # サービスレイヤー
│   └── pdfService.js   # PDF生成サービス
├── database.js         # データベース接続・操作
├── server.js           # メインサーバーファイル
├── .env                # 環境変数(Git管理外)
└── package.json        # 依存関係
```

## Renderへのデプロイ

### 1. PostgreSQLデータベースの作成

Renderダッシュボードで新しいPostgreSQLデータベースを作成します。

### 2. Web Serviceの作成

- **Build Command**: `npm install`
- **Start Command**: `npm start`

### 3. 環境変数の設定

Renderの環境変数設定で、`.env`ファイルの内容を設定してください。特に以下は必須です:

- `DATABASE_URL`: RenderのPostgreSQLデータベースURL(自動設定される場合もあります)
- `SMTP_*`: メール送信設定
- `COMPANY_*`: PDF発行元情報

### 4. デプロイ

GitHubリポジトリと連携してデプロイします。

## メール設定について

Gmailを使用する場合:
1. Googleアカウントで2段階認証を有効化
2. アプリパスワードを生成
3. `.env`の`SMTP_PASS`にアプリパスワードを設定

## トラブルシューティング

### データベースが初期化されない
サーバー起動時に自動的にテーブルが作成されます。エラーが出る場合は、データベースファイルを削除して再起動してください。

### メールが送信されない
- SMTP設定が正しいか確認
- Gmailの場合、アプリパスワードを使用しているか確認
- ファイアウォールやセキュリティソフトがブロックしていないか確認

### 画像がアップロードできない
`public/uploads/`ディレクトリが存在し、書き込み権限があるか確認してください。

## ライセンス

このプロジェクトは私的利用のために作成されています。

## サポート

問題が発生した場合は、GitHubのIssuesで報告してください。
