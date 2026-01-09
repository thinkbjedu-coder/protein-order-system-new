-- テストユーザーを追加するSQLスクリプト
-- メールアドレス: thinkbj.edu@gmail.com
-- パスワード: think0305
-- ハッシュ化されたパスワード: $2a$10$UonPPrDbs8qsvYfIqM0RyOYY06gzG91MyQHkC1HgCactULVtqQIAa

INSERT INTO users (email, password, company_name, last_name, first_name, phone, postal_code, address)
VALUES (
  'thinkbj.edu@gmail.com',
  '$2a$10$UonPPrDbs8qsvYfIqM0RyOYY06gzG91MyQHkC1HgCactULVtqQIAa',
  'Think Body Japan',
  'テスト',
  'ユーザー',
  '08012345678',
  '',
  ''
);
