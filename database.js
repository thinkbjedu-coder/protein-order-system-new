require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// 環境変数でPostgreSQLかSQLiteかを判定
const isProduction = process.env.DATABASE_URL ? true : false;

let db;
let dbType = isProduction ? 'postgresql' : 'sqlite';

// PostgreSQL用
let pgPool;
if (isProduction) {
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
  });
  console.log('PostgreSQLデータベースに接続します');
}

// SQLite用
let SQL;
const dbPath = path.join(__dirname, 'database.db');

// データベース初期化
async function initDatabase() {
  if (isProduction) {
    await initPostgreSQL();
  } else {
    await initSQLite();
  }
}

// PostgreSQL初期化
async function initPostgreSQL() {
  const client = await pgPool.connect();
  try {
    // テーブル作成
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        company_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        first_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        postal_code TEXT,
        address TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS shipping_addresses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        postal_code TEXT NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        flavor TEXT,
        price INTEGER NOT NULL,
        image_url TEXT,
        description TEXT,
        catch_copy TEXT,
        min_quantity INTEGER DEFAULT 10,
        quantity_step INTEGER DEFAULT 10,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        product_id INTEGER,
        shipping_address_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER,
        total_price INTEGER NOT NULL,
        status TEXT DEFAULT '受付',
        payment_confirmed INTEGER DEFAULT 0,
        payment_date TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shipping_address_id) REFERENCES shipping_addresses(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // デフォルト管理者アカウント作成
    const adminExists = await client.query('SELECT id FROM admin_users WHERE username = $1', ['admin']);
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await client.query('INSERT INTO admin_users (username, password) VALUES ($1, $2)', ['admin', hashedPassword]);
      console.log('デフォルト管理者アカウントを作成しました (username: admin, password: admin123)');
    }

    // テストユーザーアカウント作成
    const testUserExists = await client.query('SELECT id FROM users WHERE email = $1', ['thinkbj.edu@gmail.com']);
    if (testUserExists.rows.length === 0) {
      const hashedPassword = await bcrypt.hash('think0305', 10);
      await client.query(
        'INSERT INTO users (email, password, company_name, last_name, first_name, phone, postal_code, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        ['thinkbj.edu@gmail.com', hashedPassword, 'Think Body Japan', 'テスト', 'ユーザー', '08012345678', '', '']
      );
      console.log('テストユーザーアカウントを作成しました (email: thinkbj.edu@gmail.com, password: think0305)');
    }

    // デフォルト商品の登録
    const productExists = await client.query('SELECT id FROM products WHERE name = $1', ['BASE']);
    if (productExists.rows.length === 0) {
      await client.query(
        'INSERT INTO products (name, flavor, price, image_url, description, min_quantity, quantity_step) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['BASE', 'ココア味', 1500, '/product.png', '無駄な添加物を徹底的に省いた高品質設計。腸内環境にも安心できるやさしい内容。プロテイン習慣を始めるのに最適なバランス。', 10, 10]
      );
      console.log('デフォルト商品を登録しました');
    }

    console.log('PostgreSQLデータベースを初期化しました');
  } finally {
    client.release();
  }
}

// SQLite初期化
async function initSQLite() {
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs();

  // 既存のデータベースファイルがあれば読み込む
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // テーブル作成
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      company_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      postal_code TEXT,
      address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS shipping_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      postal_code TEXT NOT NULL,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      flavor TEXT,
      price INTEGER NOT NULL,
      image_url TEXT,
      description TEXT,
      catch_copy TEXT,
      min_quantity INTEGER DEFAULT 10,
      quantity_step INTEGER DEFAULT 10,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      shipping_address_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER,
      total_price INTEGER NOT NULL,
      status TEXT DEFAULT '受付',
      payment_confirmed INTEGER DEFAULT 0,
      payment_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shipping_address_id) REFERENCES shipping_addresses(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // デフォルト管理者アカウント作成
  const adminExists = db.exec('SELECT id FROM admin_users WHERE username = "admin"');
  if (adminExists.length === 0 || adminExists[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', hashedPassword]);
    console.log('デフォルト管理者アカウントを作成しました (username: admin, password: admin123)');
  }

  // テストユーザーアカウント作成
  const testUserExists = db.exec('SELECT id FROM users WHERE email = "thinkbj.edu@gmail.com"');
  if (testUserExists.length === 0 || testUserExists[0].values.length === 0) {
    const hashedPassword = bcrypt.hashSync('think0305', 10);
    db.run('INSERT INTO users (email, password, company_name, last_name, first_name, phone, postal_code, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['thinkbj.edu@gmail.com', hashedPassword, 'Think Body Japan', 'テスト', 'ユーザー', '08012345678', '', '']);
    console.log('テストユーザーアカウントを作成しました (email: thinkbj.edu@gmail.com, password: think0305)');
  }

  // デフォルト商品の登録
  const productExists = db.exec('SELECT id FROM products WHERE name = "BASE"');
  if (productExists.length === 0 || productExists[0].values.length === 0) {
    db.run(`
      INSERT INTO products (name, flavor, price, image_url, description, min_quantity, quantity_step)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, ['BASE', 'ココア味', 1500, '/product.png', '無駄な添加物を徹底的に省いた高品質設計。腸内環境にも安心できるやさしい内容。プロテイン習慣を始めるのに最適なバランス。', 10, 10]);
    console.log('デフォルト商品を登録しました');
  }

  saveDatabase();
  console.log('SQLiteデータベースを初期化しました');
}

// データベースをファイルに保存 (SQLiteのみ)
function saveDatabase() {
  if (!isProduction && db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// ヘルパー関数
async function runQuery(sql, params = []) {
  try {
    if (isProduction) {
      // PostgreSQL用のパラメータ変換 (? を $1, $2... に変換)
      let pgSql = sql;
      let pgParams = params;
      if (sql.includes('?')) {
        pgParams = [];
        let paramIndex = 1;
        pgSql = sql.replace(/\?/g, () => {
          pgParams.push(params[paramIndex - 1]);
          return `$${paramIndex++}`;
        });
      }
      await pgPool.query(pgSql, pgParams);
    } else {
      db.run(sql, params);
      saveDatabase();
    }
    return { success: true };
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

async function getOne(sql, params = []) {
  if (isProduction) {
    // PostgreSQL用のパラメータ変換
    let pgSql = sql;
    let pgParams = params;
    if (sql.includes('?')) {
      pgParams = [];
      let paramIndex = 1;
      pgSql = sql.replace(/\?/g, () => {
        pgParams.push(params[paramIndex - 1]);
        return `$${paramIndex++}`;
      });
    }
    const result = await pgPool.query(pgSql, pgParams);
    return result.rows.length > 0 ? result.rows[0] : null;
  } else {
    const result = db.exec(sql, params);
    if (result.length === 0 || result[0].values.length === 0) {
      return null;
    }

    const columns = result[0].columns;
    const values = result[0].values[0];
    const row = {};
    columns.forEach((col, i) => {
      row[col] = values[i];
    });
    return row;
  }
}

async function getAll(sql, params = []) {
  if (isProduction) {
    // PostgreSQL用のパラメータ変換
    let pgSql = sql;
    let pgParams = params;
    if (sql.includes('?')) {
      pgParams = [];
      let paramIndex = 1;
      pgSql = sql.replace(/\?/g, () => {
        pgParams.push(params[paramIndex - 1]);
        return `$${paramIndex++}`;
      });
    }
    const result = await pgPool.query(pgSql, pgParams);
    return result.rows;
  } else {
    const result = db.exec(sql, params);
    if (result.length === 0) {
      return [];
    }

    const columns = result[0].columns;
    return result[0].values.map(values => {
      const row = {};
      columns.forEach((col, i) => {
        row[col] = values[i];
      });
      return row;
    });
  }
}

async function getLastInsertId() {
  if (isProduction) {
    // PostgreSQLでは、INSERTクエリで RETURNING id を使用する必要があるため、
    // この関数は使用せず、runQueryの戻り値を拡張する必要があります
    // 一時的な実装として、最後に挿入されたIDを取得
    const result = await pgPool.query('SELECT lastval() as id');
    return result.rows[0].id;
  } else {
    const result = db.exec('SELECT last_insert_rowid() as id');
    return result[0].values[0][0];
  }
}

module.exports = {
  initDatabase,
  saveDatabase,
  runQuery,
  getOne,
  getAll,
  getLastInsertId,
  isProduction
};
