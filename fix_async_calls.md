# 非同期処理の修正が必要な箇所

## 問題
PostgreSQLでは`getOne`、`getAll`、`runQuery`は非同期関数ですが、多くの箇所で`await`なしで呼ばれています。
これがRenderでログインできない原因です。

## 修正方針
1. 全ての`getOne`、`getAll`呼び出しに`await`を追加
2. 全ての`runQuery`呼び出しに`await`を追加  
3. 呼び出し元の関数が`async`でない場合は`async`に変更

## 主な修正箇所
- `/api/login` (175行目) - **最優先**
- `/api/register` (149行目)
- `/api/products` (118行目)
- その他多数

修正後、GitHubにプッシュしてRenderで再デプロイが必要です。
