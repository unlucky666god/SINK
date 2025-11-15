const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./db'); // Подключаем файл с базой данных

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const JWT_SECRET = '666';

// Store online users
const onlineUsers = new Map(); // userId -> socketId

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

// Удаление друга
app.post('/api/friends/remove', authenticateToken, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ message: 'ID is required.' });

  // Get current user
  db.get('SELECT friends FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Database error on get user:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!user) return res.status(404).json({ message: 'User not found.' });

    let friends = JSON.parse(user.friends || '[]');

    if (!friends.includes(id)) return res.status(400).json({ message: 'Not friends.' });

    // Remove from friends
    friends = friends.filter(f => f != id);

    // Update current user
    db.run('UPDATE users SET friends = ? WHERE id = ?', [JSON.stringify(friends), req.user.id], (err2) => {
      if (err2) {
        console.error('Database error on update user:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Update target user: remove from friends
      db.get('SELECT friends FROM users WHERE id = ?', [id], (err3, target) => {
        if (err3) {
          console.error('Database error on get target:', err3);
          return res.status(500).json({ message: 'Database error.' });
        }
        if (!target) return res.status(404).json({ message: 'Target user not found.' });

        let targetFriends = JSON.parse(target.friends || '[]');
        targetFriends = targetFriends.filter(f => f != req.user.id);

        db.run('UPDATE users SET friends = ? WHERE id = ?', [JSON.stringify(targetFriends), id], (err4) => {
          if (err4) {
            console.error('Database error on update target:', err4);
            return res.status(500).json({ message: 'Database error.' });
          }
          res.json({ message: 'Friend removed.' });
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

// Получение диалогов пользователя
app.get('/api/dialogues', authenticateToken, (req, res) => {
  const currentUserId = req.user.id;

  db.all(
    'SELECT * FROM messages WHERE from_user = ? OR to_user = ? ORDER BY date DESC',
    [currentUserId, currentUserId],
    (err, messages) => {
      if (err) {
        console.error('Database error on get dialogues:', err);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Группировка по собеседнику
      const dialoguesMap = new Map();
      messages.forEach(msg => {
        const interlocutorId = msg.from_user === currentUserId ? msg.to_user : msg.from_user;
        if (!dialoguesMap.has(interlocutorId)) {
          dialoguesMap.set(interlocutorId, {
            interlocutor_id: interlocutorId,
            last_message: msg.message,
            date: msg.date
          });
        }
      });

      const dialogues = Array.from(dialoguesMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));

      // Получить имена и статусы собеседников
      if (dialogues.length > 0) {
        const placeholders = dialogues.map(() => '?').join(',');
        db.all(`SELECT id, name, status FROM users WHERE id IN (${placeholders})`, dialogues.map(d => d.interlocutor_id), (err2, users) => {
          if (err2) {
            console.error('Database error on get users:', err2);
            return res.status(500).json({ message: 'Database error.' });
          }
          const userMap = new Map(users.map(u => [u.id, u]));
          dialogues.forEach(d => {
            const user = userMap.get(d.interlocutor_id);
            if (user) {
              d.name = user.name;
              d.status = user.status;
            }
          });
          res.json(dialogues);
        });
      } else {
        res.json([]);
      }
    }
  );
});

// Получение сообщений с пользователем
app.get('/api/messages/:userId', authenticateToken, (req, res) => {
  const targetUserId = parseInt(req.params.userId);
  if (!targetUserId) return res.status(400).json({ message: 'Invalid user ID.' });

  const currentUserId = req.user.id;

  db.all(
    'SELECT * FROM messages WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?) ORDER BY date ASC',
    [currentUserId, targetUserId, targetUserId, currentUserId],
    (err, messages) => {
      if (err) {
        console.error('Database error on get messages:', err);
        return res.status(500).json({ message: 'Database error.' });
      }
      res.json(messages);
    }
  );
});

// Отправка сообщения
app.post('/api/messages', authenticateToken, (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ message: 'To and message are required.' });

  const from = req.user.id;

  db.run(
    'INSERT INTO messages (from_user, to_user, message) VALUES (?, ?, ?)',
    [from, to, message],
    function (err) {
      if (err) {
        console.error('Database error on insert message:', err);
        return res.status(500).json({ message: 'Database error.' });
      }
      res.json({ id: this.lastID, message: 'Message sent.' });
    }
  );
});

// Создание группы
app.post('/api/groups/create', authenticateToken, (req, res) => {
  const { name, users } = req.body;
  if (!name || !users || !Array.isArray(users)) {
    return res.status(400).json({ message: 'Name and users array are required.' });
  }

  // Add creator to users list if not present
  if (!users.includes(req.user.id)) {
    users.push(req.user.id);
  }

  // Insert group metadata
  db.run(
    'INSERT INTO groups (name, users, created_by) VALUES (?, ?, ?)',
    [name, JSON.stringify(users), req.user.id],
    function (err) {
      if (err) {
        console.error('Error creating group:', err);
        return res.status(500).json({ message: 'Database error.' });
      }

      const groupId = this.lastID;

      // Create dynamic table for group messages
      db.run(`
        CREATE TABLE IF NOT EXISTS group_${groupId} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          group_id INTEGER NOT NULL,
          from_user INTEGER NOT NULL,
          message TEXT NOT NULL,
          date DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (from_user) REFERENCES users (id),
          FOREIGN KEY (group_id) REFERENCES groups (id)
        )
      `, (err2) => {
        if (err2) {
          console.error('Error creating group table:', err2);
          return res.status(500).json({ message: 'Failed to create group table.' });
        }

        // Update users' groups field
        users.forEach(userId => {
          db.get('SELECT groups FROM users WHERE id = ?', [userId], (err3, user) => {
            if (!err3 && user) {
              let userGroups = JSON.parse(user.groups || '[]');
              if (!userGroups.includes(groupId)) {
                userGroups.push(groupId);
                db.run('UPDATE users SET groups = ? WHERE id = ?', [JSON.stringify(userGroups), userId]);
              }
            }
          });
        });

        res.json({
          groupId,
          name,
          users,
          message: 'Group created successfully.'
        });
      });
    }
  );
});

// Получение групп пользователя
app.get('/api/groups', authenticateToken, (req, res) => {
  db.get('SELECT groups FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) {
      console.error('Error getting user groups:', err);
      return res.status(500).json({ message: 'Database error.' });
    }

    const groupIds = JSON.parse(user.groups || '[]');
    if (groupIds.length === 0) {
      return res.json([]);
    }

    const placeholders = groupIds.map(() => '?').join(',');
    db.all(`SELECT * FROM groups WHERE id IN (${placeholders})`, groupIds, (err2, groups) => {
      if (err2) {
        console.error('Error fetching groups:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Parse users field for each group
      groups.forEach(group => {
        group.users = JSON.parse(group.users || '[]');
      });

      res.json(groups);
    });
  });
});

// Получение сообщений группы
app.get('/api/groups/:groupId/messages', authenticateToken, (req, res) => {
  const groupId = parseInt(req.params.groupId);
  if (!groupId) return res.status(400).json({ message: 'Invalid group ID.' });

  // Verify user is member of group
  db.get('SELECT users FROM groups WHERE id = ?', [groupId], (err, group) => {
    if (err) {
      console.error('Error fetching group:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const users = JSON.parse(group.users || '[]');
    if (!users.includes(req.user.id)) {
      return res.status(403).json({ message: 'Not a member of this group.' });
    }

    // Fetch messages from group table
    db.all(`SELECT * FROM group_${groupId} ORDER BY date ASC`, (err2, messages) => {
      if (err2) {
        console.error('Error fetching group messages:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Get user names for messages
      if (messages.length > 0) {
        const userIds = [...new Set(messages.map(m => m.from_user))];
        const placeholders = userIds.map(() => '?').join(',');
        db.all(`SELECT id, name FROM users WHERE id IN (${placeholders})`, userIds, (err3, usersList) => {
          if (err3) {
            console.error('Error fetching users:', err3);
            return res.json(messages);
          }
          const userMap = new Map(usersList.map(u => [u.id, u.name]));
          messages.forEach(msg => {
            msg.user_name = userMap.get(msg.from_user);
          });
          res.json(messages);
        });
      } else {
        res.json([]);
      }
    });
  });
});

// Добавление пользователя в группу
app.post('/api/groups/:groupId/add-user', authenticateToken, (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const { userId } = req.body;
  
  if (!groupId || !userId) {
    return res.status(400).json({ message: 'Group ID and User ID are required.' });
  }

  // Get group
  db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
    if (err) {
      console.error('Error fetching group:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const users = JSON.parse(group.users || '[]');
    
    // Check if user is already in group
    if (users.includes(userId)) {
      return res.status(400).json({ message: 'User already in group.' });
    }

    // Add user to group
    users.push(userId);
    db.run('UPDATE groups SET users = ? WHERE id = ?', [JSON.stringify(users), groupId], (err2) => {
      if (err2) {
        console.error('Error updating group:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Update user's groups list
      db.get('SELECT groups FROM users WHERE id = ?', [userId], (err3, user) => {
        if (!err3 && user) {
          let userGroups = JSON.parse(user.groups || '[]');
          if (!userGroups.includes(groupId)) {
            userGroups.push(groupId);
            db.run('UPDATE users SET groups = ? WHERE id = ?', [JSON.stringify(userGroups), userId]);
          }
        }
      });

      res.json({ message: 'User added to group.', users });
    });
  });
});

// Удаление пользователя из группы
app.post('/api/groups/:groupId/remove-user', authenticateToken, (req, res) => {
  const groupId = parseInt(req.params.groupId);
  const { userId } = req.body;
  
  if (!groupId || !userId) {
    return res.status(400).json({ message: 'Group ID and User ID are required.' });
  }

  // Get group
  db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
    if (err) {
      console.error('Error fetching group:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    let users = JSON.parse(group.users || '[]');
    
    // Remove user from group
    users = users.filter(u => u !== userId);
    
    db.run('UPDATE groups SET users = ? WHERE id = ?', [JSON.stringify(users), groupId], (err2) => {
      if (err2) {
        console.error('Error updating group:', err2);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Update user's groups list
      db.get('SELECT groups FROM users WHERE id = ?', [userId], (err3, user) => {
        if (!err3 && user) {
          let userGroups = JSON.parse(user.groups || '[]');
          userGroups = userGroups.filter(g => g !== groupId);
          db.run('UPDATE users SET groups = ? WHERE id = ?', [JSON.stringify(userGroups), userId]);
        }
      });

      res.json({ message: 'User removed from group.', users });
    });
  });
});

// Удаление группы
app.delete('/api/groups/:groupId', authenticateToken, (req, res) => {
  const groupId = parseInt(req.params.groupId);
  
  if (!groupId) {
    return res.status(400).json({ message: 'Group ID is required.' });
  }

  // Get group to verify creator
  db.get('SELECT * FROM groups WHERE id = ?', [groupId], (err, group) => {
    if (err) {
      console.error('Error fetching group:', err);
      return res.status(500).json({ message: 'Database error.' });
    }
    if (!group) return res.status(404).json({ message: 'Group not found.' });

    const users = JSON.parse(group.users || '[]');

    // Delete group table
    db.run(`DROP TABLE IF EXISTS group_${groupId}`, (err2) => {
      if (err2) {
        console.error('Error dropping group table:', err2);
      }
    });

    // Delete group from groups table
    db.run('DELETE FROM groups WHERE id = ?', [groupId], (err3) => {
      if (err3) {
        console.error('Error deleting group:', err3);
        return res.status(500).json({ message: 'Database error.' });
      }

      // Remove group from all users' groups lists
      users.forEach(userId => {
        db.get('SELECT groups FROM users WHERE id = ?', [userId], (err4, user) => {
          if (!err4 && user) {
            let userGroups = JSON.parse(user.groups || '[]');
            userGroups = userGroups.filter(g => g !== groupId);
            db.run('UPDATE users SET groups = ? WHERE id = ?', [JSON.stringify(userGroups), userId]);
          }
        });
      });

      res.json({ message: 'Group deleted successfully.' });
    });
  });
});

// Защищённый маршрут
app.get('/index.html', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.redirect('/singin.html');
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('New socket connection:', socket.id);

  // Authenticate socket connection
  socket.on('authenticate', (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.userId = decoded.id;
      socket.userName = decoded.name;
      
      // Store user's socket
      onlineUsers.set(decoded.id, socket.id);
      
      // Update user status to online
      db.run('UPDATE users SET status = ? WHERE id = ?', ['online', decoded.id], (err) => {
        if (err) console.error('Error updating status:', err);
      });
      
      // Notify all clients about user coming online
      io.emit('user_status', { userId: decoded.id, status: 'online' });
      
      socket.emit('authenticated', { userId: decoded.id });
      console.log(`User ${decoded.name} (${decoded.id}) authenticated`);
    } catch (err) {
      console.error('Socket authentication failed:', err);
      socket.emit('authentication_error', { message: 'Invalid token' });
    }
  });

  // Handle sending messages
  socket.on('send_message', (data) => {
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { to, message } = data;
    if (!to || !message) {
      socket.emit('error', { message: 'Invalid message data' });
      return;
    }

    // Save message to database
    db.run(
      'INSERT INTO messages (from_user, to_user, message) VALUES (?, ?, ?)',
      [socket.userId, to, message],
      function (err) {
        if (err) {
          console.error('Database error on insert message:', err);
          socket.emit('error', { message: 'Failed to send message' });
          return;
        }

        const messageData = {
          id: this.lastID,
          from_user: socket.userId,
          to_user: to,
          message: message,
          date: new Date().toISOString()
        };

        // Send message back to sender
        socket.emit('message_sent', messageData);

        // Send message to recipient if they're online
        const recipientSocketId = onlineUsers.get(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('new_message', messageData);
        }

        console.log(`Message from ${socket.userId} to ${to}: ${message}`);
      }
    );
  });

  // Handle sending group messages
  socket.on('send_group_message', (data) => {
    if (!socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { groupId, message } = data;
    if (!groupId || !message) {
      socket.emit('error', { message: 'Invalid group message data' });
      return;
    }

    // Verify user is member of group
    db.get('SELECT users FROM groups WHERE id = ?', [groupId], (err, group) => {
      if (err || !group) {
        socket.emit('error', { message: 'Group not found' });
        return;
      }

      const users = JSON.parse(group.users || '[]');
      if (!users.includes(socket.userId)) {
        socket.emit('error', { message: 'Not a member of this group' });
        return;
      }

      // Save message to group table
      db.run(
        `INSERT INTO group_${groupId} (group_id, from_user, message) VALUES (?, ?, ?)`,
        [groupId, socket.userId, message],
        function (err2) {
          if (err2) {
            console.error('Database error on insert group message:', err2);
            socket.emit('error', { message: 'Failed to send message' });
            return;
          }

          const messageData = {
            id: this.lastID,
            group_id: groupId,
            from_user: socket.userId,
            user_name: socket.userName,
            message: message,
            date: new Date().toISOString()
          };

          // Send message back to sender
          socket.emit('group_message_sent', messageData);

          // Send message to all group members who are online
          users.forEach(userId => {
            if (userId !== socket.userId) {
              const memberSocketId = onlineUsers.get(userId);
              if (memberSocketId) {
                io.to(memberSocketId).emit('new_group_message', messageData);
              }
            }
          });

          console.log(`Group message from ${socket.userId} to group ${groupId}: ${message}`);
        }
      );
    });
  });

  // Handle joining group room
  socket.on('join_group', (groupId) => {
    if (!socket.userId) return;
    
    // Verify user is member
    db.get('SELECT users FROM groups WHERE id = ?', [groupId], (err, group) => {
      if (err || !group) return;
      
      const users = JSON.parse(group.users || '[]');
      if (users.includes(socket.userId)) {
        socket.join(`group_${groupId}`);
        console.log(`User ${socket.userId} joined group ${groupId}`);
      }
    });
  });

  // Handle leaving group room
  socket.on('leave_group', (groupId) => {
    socket.leave(`group_${groupId}`);
    console.log(`User ${socket.userId} left group ${groupId}`);
  });

  // Handle initiating a call
  socket.on('initiate_call', (data) => {
    if (!socket.userId) return;
    
    const { callId, to, isGroup } = data;
    
    if (isGroup) {
      // Group call - notify all group members
      db.get('SELECT name, users FROM groups WHERE id = ?', [to], (err, group) => {
        if (err || !group) return;
        
        const users = JSON.parse(group.users || '[]');
        users.forEach(userId => {
          if (userId !== socket.userId) {
            const userSocketId = onlineUsers.get(userId);
            if (userSocketId) {
              io.to(userSocketId).emit('incoming_call', {
                callId,
                callerId: socket.userId,
                callerName: socket.userName,
                groupName: group.name,
                isGroup: true,
                participants: users
              });
            }
          }
        });
      });
    } else {
      // Individual call
      const userSocketId = onlineUsers.get(to);
      if (userSocketId) {
        db.get('SELECT name FROM users WHERE id = ?', [socket.userId], (err, caller) => {
          io.to(userSocketId).emit('incoming_call', {
            callId,
            callerId: socket.userId,
            callerName: caller ? caller.name : socket.userName,
            isGroup: false,
            participants: [socket.userId, to]
          });
        });
      }
    }
  });
  
  // Handle accepting call
  socket.on('accept_call', (data) => {
    if (!socket.userId) return;
    
    const { callId, participants, isGroup } = data;
    
    // Notify caller and other participants
    socket.broadcast.emit('call_accepted', {
      callId,
      userId: socket.userId,
      userName: socket.userName,
      participants: participants || [],
      isGroup: isGroup || false
    });
  });
  
  // Handle declining call
  socket.on('decline_call', (data) => {
    if (!socket.userId) return;
    
    const { callId } = data;
    
    socket.broadcast.emit('call_declined', {
      callId,
      userId: socket.userId,
      userName: socket.userName
    });
  });
  
  // WebRTC signaling
  socket.on('webrtc_offer', (data) => {
    const { to, offer } = data;
    const userSocketId = onlineUsers.get(to);
    if (userSocketId) {
      io.to(userSocketId).emit('webrtc_offer', {
        from: socket.userId,
        offer
      });
    }
  });
  
  socket.on('webrtc_answer', (data) => {
    const { to, answer } = data;
    const userSocketId = onlineUsers.get(to);
    if (userSocketId) {
      io.to(userSocketId).emit('webrtc_answer', {
        from: socket.userId,
        answer
      });
    }
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    const { to, candidate } = data;
    const userSocketId = onlineUsers.get(to);
    if (userSocketId) {
      io.to(userSocketId).emit('webrtc_ice_candidate', {
        from: socket.userId,
        candidate
      });
    }
  });
  
  // Handle ending call
  socket.on('end_call', (data) => {
    if (!socket.userId) return;
    
    socket.broadcast.emit('call_ended', {
      callId: data.callId,
      userId: socket.userId
    });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      
      // Update user status to offline
      db.run('UPDATE users SET status = ? WHERE id = ?', ['offline', socket.userId], (err) => {
        if (err) console.error('Error updating status:', err);
      });
      
      // Notify all clients about user going offline
      io.emit('user_status', { userId: socket.userId, status: 'offline' });
      
      console.log(`User ${socket.userName} (${socket.userId}) disconnected`);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});