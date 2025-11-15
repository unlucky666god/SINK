const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Создание таблицы users
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      friends TEXT DEFAULT '[]',    -- JSON-строка с массивом ID друзей
      waiting TEXT DEFAULT '[]',    -- JSON-строка с массивом ID ожидающих запросов в друзья
      status TEXT DEFAULT 'offline', -- Статус пользователя (online/offline)
      groups TEXT DEFAULT '[]',     -- JSON-строка с массивом ID групп
      servers TEXT DEFAULT '[]'     -- JSON-строка с массивом ID серверов
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table created or already exists.');
      // Add waiting column if not exists
      db.run(`ALTER TABLE users ADD COLUMN waiting TEXT DEFAULT '[]'`, (err2) => {
        if (err2 && !err2.message.includes('duplicate column name')) {
          console.error('Error adding waiting column:', err2);
        }
      });
      // Add status column if not exists
      db.run(`ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'offline'`, (err3) => {
        if (err3 && !err3.message.includes('duplicate column name')) {
          console.error('Error adding status column:', err3);
        }
      });
    }
  });

  // Создание таблицы messages
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
      console.log('Messages table created or already exists.');
    }
  });

  // Создание таблицы groups
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
      console.log('Groups table created or already exists.');
    }
  });
});

module.exports = db;