const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db'); // Подключаем файл с базой данных

const app = express();
const PORT = 3000;

const JWT_SECRET = '666';

app.use(express.json());
app.use(express.static('public'));

// Мидлвар для проверки токена
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1] || req.cookies?.token || localStorage.getItem('token');

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid token.' });
  }
};

// Регистрация
app.post('/api/auth/signup', async (req, res) => {
  const { username: name, email, password } = req.body;

  // Проверка на существование
  db.get('SELECT id FROM users WHERE name = ? OR email = ?', [name, email], async (err, row) => {
    if (err) {
      console.error('Database error on user check:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (row) return res.status(400).json({ message: 'User already exists.' });

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
      function (err) {
        if (err) {
          console.error('Database error on insert:', err);
          return res.status(500).json({ message: 'Database error.' });
        }

        const token = jwt.sign({ id: this.lastID, name }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
          token,
          user: { id: this.lastID, name, email }
        });
      }
    );
  });
});

// Вход
app.post('/api/auth/signin', async (req, res) => {
  const { username: name, password } = req.body;

  db.get('SELECT * FROM users WHERE name = ?', [name], async (err, user) => {
    if (err) {
      console.error('Database error on signin:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!user) return res.status(400).json({ message: 'Invalid credentials.' });

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return res.status(400).json({ message: 'Invalid credentials.' });

    // Update status to online
    db.run('UPDATE users SET status = ? WHERE id = ?', ['online', user.id], (err3) => {
      if (err3) {
        console.error('Error updating status:', err3);
      }
    });

    const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email }
    });
  });
});

// Принятие запроса в друзья
app.post('/api/friends/accept', authenticateToken, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'ID is required.' });

  // Get current user
  db.get('SELECT friends, waiting FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Database error on get user:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let friends = JSON.parse(user.friends || '[]');
    let waiting = JSON.parse(user.waiting || '[]');

    if (!waiting.includes(id)) return res.status(400).json({ message: 'No such request.' });

    // Remove from waiting, add to friends
    waiting = waiting.filter(w => w != id);
    friends.push(id);

    // Update current user
    db.run('UPDATE users SET friends = ?, waiting = ? WHERE id = ?', [JSON.stringify(friends), JSON.stringify(waiting), req.user.id], (err2) => {
      if (err2) {
        console.error('Database error on update user:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Update target user: add to friends, remove from waiting if any
      db.get('SELECT friends FROM users WHERE id = ?', [id], (err3, target) => {
        if (err3) {
          console.error('Database error on get target:', err3);
          return res.status(500).json({ message: 'Database error.' });
        }
        if (!target) return res.status(404).json({ message: 'Target user not found.' });

        let targetFriends = JSON.parse(target.friends || '[]');
        if (!targetFriends.includes(req.user.id)) {
          targetFriends.push(req.user.id);
        }

        db.run('UPDATE users SET friends = ? WHERE id = ?', [JSON.stringify(targetFriends), id], (err4) => {
          if (err4) {
            console.error('Database error on update target:', err4);
            return res.status(500).json({ message: 'Database error.' });
          }
          res.json({ message: 'Friend added.' });
        });
      });
    });
  });
});

// Отклонение запроса в друзья
app.post('/api/friends/cancel', authenticateToken, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'ID is required.' });

  // Get current user
  db.get('SELECT waiting FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Database error on get user:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let waiting = JSON.parse(user.waiting || '[]');

    if (!waiting.includes(id)) return res.status(400).json({ message: 'No such request.' });

    // Remove from waiting
    waiting = waiting.filter(w => w != id);

    // Update DB
    db.run('UPDATE users SET waiting = ? WHERE id = ?', [JSON.stringify(waiting), req.user.id], (err2) => {
      if (err2) {
        console.error('Database error on update waiting:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }
      res.json({ message: 'Request cancelled.' });
    });
  });
});

// Отправка запроса в друзья
app.post('/api/friends/request', authenticateToken, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'Name is required.' });

  // Find target user
  db.get('SELECT id, waiting FROM users WHERE name = ?', [name], (err, target) => {
    if (err) {
      console.error('Database error on find target:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!target) return res.status(404).json({ message: 'User not found.' });
    if (target.id === req.user.id) return res.status(400).json({ message: 'Cannot add yourself.' });

    // Parse waiting
    let waiting = [];
    try {
      waiting = JSON.parse(target.waiting || '[]');
    } catch (e) {
      console.error('Error parsing waiting JSON:', e);
      return res.status(500).json({ message: 'Database error.' });
    }

    // Check if already waiting
    if (waiting.includes(req.user.id)) return res.status(400).json({ message: 'Request already sent.' });

    // Add to waiting
    waiting.push(req.user.id);

    // Update DB
    db.run('UPDATE users SET waiting = ? WHERE id = ?', [JSON.stringify(waiting), target.id], (err2) => {
      if (err2) {
        console.error('Database error on update waiting:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }
      res.json({ message: 'Friend request sent.' });
    });
  });
});

// Получение данных текущего пользователя
app.get('/api/user', authenticateToken, (req, res) => {
  db.get('SELECT id, name, email, friends, waiting, status FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Database error on get user:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Parse friends JSON
    let friends = [];
    try {
      friends = JSON.parse(user.friends || '[]');
    } catch (e) {
      console.error('Error parsing friends JSON:', e);
    }

    // Parse waiting JSON
    let waiting = [];
    try {
      waiting = JSON.parse(user.waiting || '[]');
    } catch (e) {
      console.error('Error parsing waiting JSON:', e);
    }

    // Get friends' names and status
    if (friends.length > 0) {
      const placeholders = friends.map(() => '?').join(',');
      db.all(`SELECT id, name, status FROM users WHERE id IN (${placeholders})`, friends, (err2, friendUsers) => {
        if (err2) {
          console.error('Database error on get friends:', err2);
          return res.status(500).json({ message: 'Database error.' });
        }
        // Get waiting users' names
        if (waiting.length > 0) {
          const placeholders2 = waiting.map(() => '?').join(',');
          db.all(`SELECT id, name FROM users WHERE id IN (${placeholders2})`, waiting, (err3, waitingUsers) => {
            if (err3) {
              console.error('Database error on get waiting:', err3);
              return res.status(500).json({ message: 'Database error.' });
            }
            res.json({ ...user, friends: friendUsers, waiting: waitingUsers });
          });
        } else {
          res.json({ ...user, friends: friendUsers, waiting: [] });
        }
      });
    } else {
      // Get waiting users' names
      if (waiting.length > 0) {
        const placeholders2 = waiting.map(() => '?').join(',');
        db.all(`SELECT id, name FROM users WHERE id IN (${placeholders2})`, waiting, (err3, waitingUsers) => {
          if (err3) {
            console.error('Database error on get waiting:', err3);
            return res.status(500).json({ message: 'Database error.' });
          }
          res.json({ ...user, friends: [], waiting: waitingUsers });
        });
      } else {
        res.json({ ...user, friends: [], waiting: [] });
      }
    }
  });
});

// Защищённый маршрут
app.get('/index.html', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/singin.html');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});