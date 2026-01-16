# Renderデプロイ設定ガイド

このドキュメントでは、Renderへのデプロイと環境変数の設定方法を説明します。

## 前提条件

- Renderアカウントを作成済み
- GitHubリポジトリにコードをプッシュ済み
- Gmailアカウントで2段階認証を有効化し、アプリパスワードを取得済み

## 1. PostgreSQLデータベースの作成

1. Renderダッシュボードにログイン
2. 「New +」→「PostgreSQL」を選択
3. 以下の設定を入力:
   - **Name**: `protein-order-db`（任意）
   - **Database**: `protein_order`（任意）
   - **User**: 自動生成
   - **Region**: `Singapore (Southeast Asia)`（日本に最も近いリージョン）
   - **Plan**: `Free`
4. 「Create Database」をクリック
5. データベースが作成されたら、**Internal Database URL**をコピー（後で使用）

## 2. Web Serviceの作成

1. Renderダッシュボードで「New +」→「Web Service」を選択
2. GitHubリポジトリを接続
3. 以下の設定を入力:
   - **Name**: `protein-order-app`（任意）
   - **Region**: `Singapore (Southeast Asia)`
   - **Branch**: `main`（または`master`）
   - **Root Directory**: 空欄（プロジェクトルートの場合）
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

## 3. 環境変数の設定

Web Serviceの設定画面で「Environment」タブを開き、以下の環境変数を追加します。

### 必須の環境変数

| キー | 値 | 説明 |
|------|-----|------|
| `DATABASE_URL` | （PostgreSQLのInternal Database URL） | データベース接続URL |
| `SMTP_HOST` | `smtp.gmail.com` | Gmail SMTPサーバー |
| `SMTP_PORT` | `587` | SMTP接続ポート（TLS） |
| `SMTP_USER` | `thinkbj.edu@gmail.com` | 送信元メールアドレス |
| `SMTP_PASS` | `yznfvaayapoqvdvx` | Gmailアプリパスワード |
| `ADMIN_EMAIL` | `thinkbj.edu@gmail.com` | 管理者メールアドレス |
| `COMPANY_NAME` | `株式会社Think Life` | PDF発行元会社名 |
| `COMPANY_ADDRESS` | `愛知県名古屋市北区山田二丁目4-58` | PDF発行元住所 |
| `INVOICE_NUMBER` | `T1234567890123` | インボイス番号 |
| `SESSION_SECRET` | （ランダムな長い文字列） | セッション暗号化キー |
| `NODE_ENV` | `production` | 本番環境フラグ |

### セッションシークレットの生成方法

セキュアなランダム文字列を生成するには、ローカル環境で以下のコマンドを実行:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

出力された文字列を`SESSION_SECRET`に設定してください。

### 環境変数の追加手順

1. 「Add Environment Variable」をクリック
2. **Key**に変数名を入力（例: `SMTP_HOST`）
3. **Value**に値を入力（例: `smtp.gmail.com`）
4. すべての環境変数を追加したら「Save Changes」をクリック
5. サービスが自動的に再デプロイされます

## 4. データベース接続の設定

1. PostgreSQLダッシュボードで「Internal Database URL」をコピー
2. Web Serviceの環境変数で`DATABASE_URL`に貼り付け
3. または、Renderが自動的に設定する場合もあります（Environment Groupsを使用）

## 5. デプロイの確認

### ログの確認

1. Web Serviceのダッシュボードで「Logs」タブを開く
2. 以下のメッセージが表示されることを確認:
   ```
   データベース準備完了
   メール設定を読み込みました
   SMTP Config: smtp.gmail.com:587 (Secure: false)
   Server running on port 10000
   ```

### エラーがある場合

- 環境変数が正しく設定されているか確認
- データベースURLが正しいか確認
- ログでエラーメッセージを確認

## 6. メール送信のテスト

### テスト手順

1. デプロイされたアプリケーションにアクセス
2. 新規ユーザー登録を行う
3. 商品を注文する
4. 以下を確認:
   - 注文確認メールが顧客に届く
   - 新規注文通知メールが管理者に届く
   - Renderのログに以下が表示される:
     ```
     ✓ メール送信成功: [メールアドレス]
     件名: 【Think Body Japan】ご注文ありがとうございます
     Message ID: [メッセージID]
     ```

### 管理画面での発送完了テスト

1. 管理画面にログイン（`/admin.html`）
2. 注文一覧から注文を選択
3. ステータスを「発送済み」に変更
4. 顧客に発送完了メールが送信されることを確認

## トラブルシューティング

### メールが送信されない

**症状**: ログに「メール送信がスキップされました」と表示される

**原因**: 環境変数が正しく設定されていない

**解決策**:
1. Renderの環境変数設定を確認
2. 以下の変数が全て設定されているか確認:
   - `SMTP_HOST`
   - `SMTP_USER`
   - `SMTP_PASS`
3. 値にスペースや改行が含まれていないか確認
4. 「Save Changes」をクリックして再デプロイ

### メール送信でエラーが発生する

**症状**: ログに「メール送信エラー」と表示される

**原因1**: Gmailアプリパスワードが正しくない

**解決策**:
1. Googleアカウントで2段階認証が有効か確認
2. 新しいアプリパスワードを生成
3. `SMTP_PASS`を更新

**原因2**: Gmailのセキュリティブロック

**解決策**:
1. Gmailアカウントのセキュリティ設定を確認
2. 「安全性の低いアプリのアクセス」は不要（アプリパスワード使用時）
3. Googleから「不審なアクティビティ」の通知が来ていないか確認

### データベース接続エラー

**症状**: 「サーバー準備中です」と表示され続ける

**原因**: データベースURLが正しくない

**解決策**:
1. PostgreSQLの「Internal Database URL」をコピー
2. Web Serviceの`DATABASE_URL`環境変数に正しく設定されているか確認
3. URLの形式: `postgresql://user:password@host:port/database`

### セッションが保持されない

**症状**: ログイン後すぐにログアウトされる

**原因**: `SESSION_SECRET`が設定されていない

**解決策**:
1. セキュアなランダム文字列を生成
2. `SESSION_SECRET`環境変数に設定

## メンテナンス

### 環境変数の更新

環境変数を更新する場合:
1. Renderダッシュボードで「Environment」タブを開く
2. 変数を編集
3. 「Save Changes」をクリック
4. 自動的に再デプロイされます

### ログの監視

定期的にログを確認し、以下をチェック:
- メール送信の成功/失敗
- データベースエラー
- セキュリティ関連の警告

### バックアップ

Renderは自動的にPostgreSQLのバックアップを取得しますが、重要なデータは定期的に手動でエクスポートすることを推奨します。

## セキュリティのベストプラクティス

1. **環境変数を公開しない**: GitHubリポジトリに`.env`ファイルをコミットしない
2. **強力なセッションシークレット**: 長くランダムな文字列を使用
3. **定期的なパスワード変更**: 管理者パスワードとGmailアプリパスワードを定期的に更新
4. **ログの監視**: 不審なアクティビティがないか定期的に確認

## サポート

問題が解決しない場合:
1. Renderのログを詳細に確認
2. GitHubのIssuesで報告
3. Renderのサポートに問い合わせ
