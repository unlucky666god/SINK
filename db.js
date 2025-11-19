require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');

// Определяем тип базы данных
const DB_TYPE = process.env.DB_TYPE || 'sqlite';

// Создаем папку db если не существует
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log('Created db directory:', dbDir);
}

// Настройки для MySQL
const mysqlConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sinc_chat',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let db;

if (DB_TYPE === 'mysql') {
  // Используем MySQL
  const pool = mysql.createPool(mysqlConfig);
  db = pool.promise();

  // Создание таблиц для MySQL
  const createTablesMySQL = async () => {
    try {
      // Таблица users
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password VARCHAR(255) NOT NULL,
          friends JSON DEFAULT ('[]'),
          waiting JSON DEFAULT ('[]'),
          status ENUM('online', 'offline') DEFAULT 'offline',
          groups JSON DEFAULT ('[]'),
          servers JSON DEFAULT ('[]'),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Таблица messages
      await db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          from_user INT NOT NULL,
          to_user INT NOT NULL,
          message TEXT NOT NULL,
          date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_user) REFERENCES users (id) ON DELETE CASCADE,
          FOREIGN KEY (to_user) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Таблица groups
      await db.execute(`
        CREATE TABLE IF NOT EXISTS groups (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          users JSON NOT NULL,
          created_by INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      console.log('MySQL tables created successfully');
    } catch (error) {
      console.error('Error creating MySQL tables:', error);
    }
  };

  createTablesMySQL();

} else {
  // Используем SQLite (по умолчанию) - теперь в папке db
  const dbPath = path.join(dbDir, 'database.db');
  
  console.log('SQLite database path:', dbPath);
  
  const sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database');
      initSQLiteTables(sqliteDb);
    }
  });

  // Функция инициализации таблиц SQLite
  function initSQLiteTables(db) {
    db.serialize(() => {
      // Таблица users
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          friends TEXT DEFAULT '[]',
          waiting TEXT DEFAULT '[]',
          status TEXT DEFAULT 'offline',
          groups TEXT DEFAULT '[]',
          servers TEXT DEFAULT '[]',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
        } else {
          console.log('Users table ready');
          // Добавляем колонки если их нет
          addColumnIfNotExists(db, 'users', 'waiting', 'TEXT DEFAULT \"[]\"');
          addColumnIfNotExists(db, 'users', 'status', 'TEXT DEFAULT \"offline\"');
          addColumnIfNotExists(db, 'users', 'groups', 'TEXT DEFAULT \"[]\"');
          addColumnIfNotExists(db, 'users', 'servers', 'TEXT DEFAULT \"[]\"');
          addColumnIfNotExists(db, 'users', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
        }
      });

      // Таблица messages
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          from_user INTEGER NOT NULL,
          to_user INTEGER NOT NULL,
          message TEXT NOT NULL,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_user) REFERENCES users (id),
          FOREIGN KEY (to_user) REFERENCES users (id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating messages table:', err);
        } else {
          console.log('Messages table ready');
        }
      });

      // Таблица groups
      db.run(`
        CREATE TABLE IF NOT EXISTS groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          users TEXT NOT NULL,
          created_by INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (created_by) REFERENCES users (id)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating groups table:', err);
        } else {
          console.log('Groups table ready');
        }
      });
    });
  }

  // Функция для добавления колонки если она не существует
  function addColumnIfNotExists(db, table, column, definition) {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return;

      const columnExists = rows.some(col => col.name === column);
      if (!columnExists) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (err2) => {
          if (err2) {
            console.error(`Error adding column ${column} to ${table}:`, err2);
          } else {
            console.log(`Added column ${column} to ${table}`);
          }
        });
      }
    });
  }

  // Обертка для совместимости с MySQL API
  db = {
    get: (sql, params = [], callback) => {
      if (callback) {
        // Callback style
        sqliteDb.get(sql, params, callback);
      } else {
        // Promise style
        return new Promise((resolve, reject) => {
          sqliteDb.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
          });
        });
      }
    },

    all: (sql, params = [], callback) => {
      if (callback) {
        // Callback style
        sqliteDb.all(sql, params, callback);
      } else {
        // Promise style
        return new Promise((resolve, reject) => {
          sqliteDb.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
          });
        });
      }
    },

    run: (sql, params = [], callback) => {
      if (callback) {
        // Callback style
        sqliteDb.run(sql, params, callback);
      } else {
        // Promise style
        return new Promise((resolve, reject) => {
          sqliteDb.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
          });
        });
      }
    },

    // Для обратной совместимости с вашим кодом
    serialize: (callback) => {
      sqliteDb.serialize(callback);
    }
  };
}

module.exports = db;