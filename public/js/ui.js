// UI related functions

let currentFilter = 'all';
let currentChatUser = null;
let currentGroup = null;
let socket = null;

// Initialize Socket.io connection
function initSocket() {
  socket = io();
  
  // Authenticate socket
  const token = localStorage.getItem('token');
  if (token) {
    socket.emit('authenticate', token);
  }
  
  // Handle authentication success
  socket.on('authenticated', (data) => {
    console.log('Socket authenticated for user:', data.userId);
  });
  
  // Handle authentication error
  socket.on('authentication_error', (data) => {
    console.error('Socket authentication error:', data.message);
  });
  
  // Handle incoming messages
  socket.on('new_message', (messageData) => {
    console.log('New message received:', messageData);
    
    // If we're currently chatting with the sender, add message to UI
    if (currentChatUser && (currentChatUser.interlocutor_id === messageData.from_user || currentChatUser.id === messageData.from_user)) {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        // Remove "empty message" if exists
        const emptyMessage = chatMessages.querySelector('.empty-message');
        if (emptyMessage) {
          emptyMessage.remove();
        }
        
        // Add new message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message received';
        messageDiv.innerHTML = `
          <img src="#" alt="user logo" class="message-logo">
          <div class="message-content">
            <div class="message-username title">${currentChatUser.name}</div>
            <div class="message-text subtitle">${messageData.message}</div>
            <div class="message-time subtitle">${new Date(messageData.date).toLocaleTimeString()}</div>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
    
    // Update dialogues list
    fetch('/api/dialogues', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(dialogues => {
      window.dialogues = dialogues;
      renderDirectMessages(dialogues);
    });
  });
  
  // Handle message sent confirmation
  socket.on('message_sent', (messageData) => {
    console.log('Message sent successfully:', messageData);
  });
  
  // Handle user status changes
  socket.on('user_status', (data) => {
    console.log('User status update:', data);
    
    // Update friend status in window.user.friends
    if (window.user && window.user.friends) {
      const friend = window.user.friends.find(f => f.id === data.userId);
      if (friend) {
        friend.status = data.status;
        renderFriendsList(window.user.friends, currentFilter);
      }
    }
    
    // Update dialogue status
    if (window.dialogues) {
      const dialogue = window.dialogues.find(d => d.interlocutor_id === data.userId);
      if (dialogue) {
        dialogue.status = data.status;
        renderDirectMessages(window.dialogues);
      }
    }
    
    // Update current chat status if chatting with this user
    if (currentChatUser && (currentChatUser.interlocutor_id === data.userId || currentChatUser.id === data.userId)) {
      const chatStatus = document.querySelector('.chat-status');
      if (chatStatus) {
        chatStatus.textContent = data.status;
      }
    }
  });
  
  // Handle new group messages
  socket.on('new_group_message', (messageData) => {
    console.log('New group message received:', messageData);
    
    // If we're currently in this group chat, add message to UI
    if (currentGroup && currentGroup.id === messageData.group_id) {
      const chatMessages = document.querySelector('.chat-messages');
      if (chatMessages) {
        // Remove "empty message" if exists
        const emptyMessage = chatMessages.querySelector('.empty-message');
        if (emptyMessage) {
          emptyMessage.remove();
        }
        
        // Add new message
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message received';
        messageDiv.innerHTML = `
          <img src="#" alt="user logo" class="message-logo">
          <div class="message-content">
            <div class="message-username title">${messageData.user_name}</div>
            <div class="message-text subtitle">${messageData.message}</div>
            <div class="message-time subtitle">${new Date(messageData.date).toLocaleTimeString()}</div>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  });
  
  // Handle group message sent confirmation
  socket.on('group_message_sent', (messageData) => {
    console.log('Group message sent successfully:', messageData);
  });

  // Handle errors
  socket.on('error', (data) => {
    console.error('Socket error:', data.message);
  });
  
  // Initialize call handlers
  initCallHandlers();
}

// Function to show create group modal
function showCreateGroupModal() {
  const modal = document.getElementById('create-group-modal');
  const friendsList = document.getElementById('friends-checkbox-list');
  
  if (modal && friendsList) {
    // Clear previous selections
    friendsList.innerHTML = '';
    
    // Populate with friends
    if (window.user && window.user.friends) {
      window.user.friends.forEach(friend => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'friend-checkbox-item';
        checkboxDiv.innerHTML = `
          <input type="checkbox" id="friend-${friend.id}" value="${friend.id}">
          <label for="friend-${friend.id}">${friend.name}</label>
        `;
        friendsList.appendChild(checkboxDiv);
      });
    }
    
    modal.style.display = 'flex';
  }
}

// Function to hide create group modal
function hideCreateGroupModal() {
  const modal = document.getElementById('create-group-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Function to create group
function createGroup() {
  const groupNameInput = document.getElementById('group-name');
  const groupName = groupNameInput.value.trim();
  
  if (!groupName) {
    alert('Please enter a group name');
    return;
  }
  
  // Get selected friends
  const checkboxes = document.querySelectorAll('#friends-checkbox-list input[type="checkbox"]:checked');
  const selectedUsers = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  if (selectedUsers.length === 0) {
    alert('Please select at least one friend');
    return;
  }
  
  // Create group via API
  fetch('/api/groups/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ name: groupName, users: selectedUsers })
  })
  .then(res => res.json())
  .then(data => {
    console.log('Group created:', data);
    hideCreateGroupModal();
    groupNameInput.value = '';
    
    // Reload groups
    loadGroups();
  })
  .catch(err => console.error('Error creating group:', err));
}

// Function to load and render groups
function loadGroups() {
  fetch('/api/groups', {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  })
  .then(res => res.json())
  .then(groups => {
    window.groups = groups;
    renderGroups(groups);
  })
  .catch(err => console.error('Error loading groups:', err));
}

// Function to render groups in sidebar
function renderGroups(groups) {
  const directColumn = document.querySelector('.direct-column');
  if (!directColumn) return;
  
  // Check if groups section exists
  let groupsSection = directColumn.querySelector('.groups-section');
  if (!groupsSection) {
    // Create groups section after direct messages
    groupsSection = document.createElement('div');
    groupsSection.className = 'groups-section';
    groupsSection.innerHTML = '<label class="groups-title title">GROUPS</label><div class="groups-list"></div>';
    directColumn.appendChild(groupsSection);
  }
  
  const groupsList = groupsSection.querySelector('.groups-list');
  if (groupsList) {
    groupsList.innerHTML = '';
    
    groups.forEach(group => {
      const groupElement = document.createElement('div');
      groupElement.className = 'group-item';
      groupElement.setAttribute('data-group', group.id);
      groupElement.innerHTML = `
        <img src="#" alt="group logo">
        <div class="info">
          <div class="group-name title">${group.name}</div>
          <label class="group-members subtitle">${group.users.length} members</label>
        </div>
      `;
      groupElement.addEventListener('click', () => openGroupChat(group.id));
      groupsList.appendChild(groupElement);
    });
  }
}

// Function to open group chat
function openGroupChat(groupId) {
  const group = window.groups.find(g => g.id === groupId);
  if (!group) return;
  
  currentGroup = group;
  currentChatUser = null;
  
  // Update chat header
  const chatTitle = document.querySelector('.chat-title');
  const chatStatus = document.querySelector('.chat-status');
  if (chatTitle) chatTitle.textContent = group.name;
  if (chatStatus) chatStatus.textContent = `${group.users.length} members`;
  
  // Hide create group button, show group actions and call button in group chat
  const createGroupBtn = document.querySelector('.create-group');
  const groupActions = document.querySelector('.group-actions');
  const callBtn = document.getElementById('start-call-btn');
  if (createGroupBtn) createGroupBtn.style.display = 'none';
  if (groupActions) groupActions.style.display = 'flex';
  if (callBtn) callBtn.style.display = 'block';
  
  // Load group messages
  fetch(`/api/groups/${groupId}/messages`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  })
  .then(res => res.json())
  .then(messages => {
    renderGroupMessages(messages);
  })
  .catch(err => console.error('Error loading group messages:', err));
  
  // Join group room
  if (socket) {
    socket.emit('join_group', groupId);
  }
  
  showSection('chat');
}

// Function to render group messages
function renderGroupMessages(messages) {
  const chatMessages = document.querySelector('.chat-messages');
  if (chatMessages) {
    chatMessages.innerHTML = '';
    
    if (messages.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'Диалог пуст';
      chatMessages.appendChild(emptyMessage);
    } else {
      messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = msg.from_user === window.user.id ? 'message sent' : 'message received';
        messageDiv.innerHTML = `
          <img src="#" alt="user logo" class="message-logo">
          <div class="message-content">
            <div class="message-username title">${msg.from_user === window.user.id ? 'You' : msg.user_name}</div>
            <div class="message-text subtitle">${msg.message}</div>
            <div class="message-time subtitle">${new Date(msg.date).toLocaleTimeString()}</div>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
      });
    }
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Function to show group info modal
function showGroupInfoModal() {
  if (!currentGroup) return;
  
  const modal = document.getElementById('group-info-modal');
  const membersList = document.getElementById('members-list');
  
  if (modal && membersList) {
    membersList.innerHTML = '';
    
    // Get user names for group members
    const placeholders = currentGroup.users.map(() => '?').join(',');
    fetch(`/api/user`, {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(res => res.json())
    .then(userData => {
      // Fetch all users to get member names
      currentGroup.users.forEach(userId => {
        const memberDiv = document.createElement('div');
        memberDiv.className = 'member-item';
        
        // Find member name
        let memberName = 'User ' + userId;
        if (window.user.friends) {
          const friend = window.user.friends.find(f => f.id === userId);
          if (friend) memberName = friend.name;
        }
        if (userId === window.user.id) memberName = 'You';
        
        memberDiv.innerHTML = `
          <div class="member-info">
            <img src="#" alt="member logo">
            <span class="member-name">${memberName}</span>
          </div>
          ${userId !== window.user.id ? `<button class="delete-member-btn" data-user-id="${userId}"><img src="/static/imgs/delete.svg" alt="remove"></button>` : ''}
        `;
        membersList.appendChild(memberDiv);
      });
      
      // Add click handlers for delete buttons
      const deleteButtons = membersList.querySelectorAll('.delete-member-btn');
      deleteButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = parseInt(btn.getAttribute('data-user-id'));
          removeUserFromGroup(userId);
        });
      });
    });
    
    modal.style.display = 'flex';
  }
}

// Function to hide group info modal
function hideGroupInfoModal() {
  const modal = document.getElementById('group-info-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Function to show add user modal
function showAddUserModal() {
  if (!currentGroup) return;
  
  const modal = document.getElementById('add-user-modal');
  const friendsList = document.getElementById('add-user-friends-list');
  
  if (modal && friendsList) {
    friendsList.innerHTML = '';
    
    // Show only friends who are not in the group
    if (window.user && window.user.friends) {
      const availableFriends = window.user.friends.filter(f => !currentGroup.users.includes(f.id));
      
      if (availableFriends.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-message';
        emptyMsg.textContent = 'All friends are already in the group';
        friendsList.appendChild(emptyMsg);
      } else {
        availableFriends.forEach(friend => {
          const checkboxDiv = document.createElement('div');
          checkboxDiv.className = 'friend-checkbox-item';
          checkboxDiv.innerHTML = `
            <input type="checkbox" id="add-friend-${friend.id}" value="${friend.id}">
            <label for="add-friend-${friend.id}">${friend.name}</label>
          `;
          friendsList.appendChild(checkboxDiv);
        });
      }
    }
    
    modal.style.display = 'flex';
  }
}

// Function to hide add user modal
function hideAddUserModal() {
  const modal = document.getElementById('add-user-modal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// Function to add user to group
function addUserToGroup() {
  if (!currentGroup) return;
  
  const checkboxes = document.querySelectorAll('#add-user-friends-list input[type="checkbox"]:checked');
  const selectedUsers = Array.from(checkboxes).map(cb => parseInt(cb.value));
  
  if (selectedUsers.length === 0) {
    alert('Please select at least one friend');
    return;
  }
  
  // Add each selected user
  selectedUsers.forEach(userId => {
    fetch(`/api/groups/${currentGroup.id}/add-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ userId })
    })
    .then(res => res.json())
    .then(data => {
      console.log('User added:', data);
      // Reload groups and update UI
      loadGroups();
      hideAddUserModal();
      
      // Update current group object
      if (data.users) {
        currentGroup.users = data.users;
        const chatStatus = document.querySelector('.chat-status');
        if (chatStatus) chatStatus.textContent = `${data.users.length} members`;
      }
    })
    .catch(err => console.error('Error adding user:', err));
  });
}

// Function to remove user from group
function removeUserFromGroup(userId) {
  if (!currentGroup) return;
  
  if (!confirm('Are you sure you want to remove this user from the group?')) return;
  
  fetch(`/api/groups/${currentGroup.id}/remove-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify({ userId })
  })
  .then(res => res.json())
  .then(data => {
    console.log('User removed:', data);
    // Reload groups and update UI
    loadGroups();
    hideGroupInfoModal();
    
    // Update current group object
    if (data.users) {
      currentGroup.users = data.users;
      const chatStatus = document.querySelector('.chat-status');
      if (chatStatus) chatStatus.textContent = `${data.users.length} members`;
    }
  })
  .catch(err => console.error('Error removing user:', err));
}

// Function to delete group
function deleteGroup() {
  if (!currentGroup) return;
  
  if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
  
  fetch(`/api/groups/${currentGroup.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  })
  .then(res => res.json())
  .then(data => {
    console.log('Group deleted:', data);
    // Reload groups
    loadGroups();
    // Go back to friends page
    showSection('friends');
    currentGroup = null;
  })
  .catch(err => console.error('Error deleting group:', err));
}

// Function to render friends list
function renderFriendsList(friends, filter = 'all') {
  const friendsList = document.querySelector('.friends-list');
  if (friendsList) {
    // Clear existing
    friendsList.innerHTML = '';

    let filteredFriends = friends;
    if (filter === 'online') {
      filteredFriends = friends.filter(f => f.status === 'online');
    }

    if (filteredFriends.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'Список пуст';
      friendsList.appendChild(emptyMessage);
    } else {
      filteredFriends.forEach(friend => {
        const friendElement = document.createElement('div');
        friendElement.className = 'friend';
        friendElement.innerHTML = `
          <img src="#" alt="logo">
          <div class="info">
            <div class="name title">${friend.name}</div>
            <div class="status subtitle">${friend.status}</div>
          </div>
          <div class="actions-btns">
            <a href="#" class="action-btn" data-action="call" data-user="${friend.id}"><img src="/static/imgs/call.svg" alt="call-logo" class="call"></a>
            <a href="#" class="action-btn" data-action="chat" data-user="${friend.id}"><img src="/static/imgs/chat.svg" alt="chat-logo" class="chat"></a>
            <a href="#" class="action-btn" data-action="delete" data-user="${friend.id}"><img src="/static/imgs/delete.svg" alt="del-logo" class="delete"></a>
          </div>
        `;
        friendsList.appendChild(friendElement);
      });
    }
  }
}

// Function to render direct messages (dialogues)
function renderDirectMessages(dialogues) {
  const directContainer = document.querySelector('.direct');
  if (directContainer) {
    // Clear existing except the template if any
    const existing = directContainer.querySelectorAll('.direct-position');
    existing.forEach(el => el.remove());

    dialogues.forEach(dialogue => {
      const directElement = document.createElement('div');
      directElement.className = 'direct-position';
      directElement.setAttribute('data-user', dialogue.interlocutor_id);
      directElement.innerHTML = `
        <img src="#" alt="user logo">
        <div class="info">
          <div class="position-name title">${dialogue.name}</div>
          <label class="status subtitle">${dialogue.status}</label>
        </div>
      `;
      directContainer.appendChild(directElement);
    });

    // Re-add event listeners
    const newDirectPositions = directContainer.querySelectorAll('.direct-position');
    newDirectPositions.forEach(pos => {
      pos.addEventListener('click', (e) => {
        e.preventDefault();
        const userId = parseInt(pos.getAttribute('data-user'));
        openChat(userId);
      });
    });
  }
}

// Function to render waiting list
function renderWaitingList(waiting) {
  const waitingList = document.querySelector('.waiting-list');
  if (waitingList) {
    // Clear existing
    waitingList.innerHTML = '';

    if (waiting.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'Список пуст';
      waitingList.appendChild(emptyMessage);
    } else {
      waiting.forEach(wait => {
        const waitElement = document.createElement('div');
        waitElement.className = 'friend';
        waitElement.innerHTML = `
          <img src="#" alt="logo">
          <div class="info">
            <div class="name title">${wait.name}</div>
            <div class="status subtitle">Waiting</div>
          </div>
          <div class="actions-btns">
            <a href="#" class="action-btn accept-btn" data-user="${wait.id}"><img src="/static/imgs/check.svg" alt="accept-logo" class="accept"></a>
            <a href="#" class="action-btn cancel-btn" data-user="${wait.id}"><img src="/static/imgs/close.svg" alt="cancel-logo" class="cancel"></a>
          </div>
        `;
        waitingList.appendChild(waitElement);
      });
    }
  }
}

// Function to render chat messages
function renderMessages(messages, currentUserId, friendName) {
  const chatMessages = document.querySelector('.chat-messages');
  if (chatMessages) {
    chatMessages.innerHTML = '';

    if (messages.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'empty-message';
      emptyMessage.textContent = 'Диалог пуст';
      chatMessages.appendChild(emptyMessage);
    } else {
      messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = msg.from_user === currentUserId ? 'message sent' : 'message received';
        messageDiv.innerHTML = `
          <img src="#" alt="user logo" class="message-logo">
          <div class="message-content">
            <div class="message-username title">${msg.from_user === currentUserId ? 'You' : friendName}</div>
            <div class="message-text subtitle">${msg.message}</div>
            <div class="message-time subtitle">${new Date(msg.date).toLocaleTimeString()}</div>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
      });
    }
  }
}

// Function to show section
function showSection(section) {
  const friendsPage = document.querySelector('.friends-page');
  const chatPage = document.querySelector('.chat-page');
  friendsPage.style.display = ['friends', 'waiting', 'add'].includes(section) ? 'block' : 'none';
  chatPage.style.display = section === 'chat' ? 'block' : 'none';

  // Show sub-sections within friends-page
  const friendsList = document.querySelector('.friends-list');
  const waitingList = document.querySelector('.waiting-list');
  const addFriendForm = document.querySelector('.add-friend-form');
  friendsList.style.display = section === 'friends' ? 'block' : 'none';
  waitingList.style.display = section === 'waiting' ? 'block' : 'none';
  addFriendForm.style.display = section === 'add' ? 'block' : 'none';
}

// Function to open chat
function openChat(userId) {
  let chatUser = window.dialogues.find(d => d.interlocutor_id === userId);
  if (!chatUser) {
    // If no dialogue, find in friends
    chatUser = window.user.friends.find(f => f.id === userId);
    if (!chatUser) return;
    // Create a dialogue-like object
    chatUser = {
      interlocutor_id: chatUser.id,
      id: chatUser.id,
      name: chatUser.name,
      status: chatUser.status
    };
  }

  currentChatUser = chatUser;
  currentGroup = null;
  
  // Show create group button and call button, hide group actions in direct chat
  const createGroupBtn = document.querySelector('.create-group');
  const groupActions = document.querySelector('.group-actions');
  const callBtn = document.getElementById('start-call-btn');
  if (createGroupBtn) createGroupBtn.style.display = 'block';
  if (groupActions) groupActions.style.display = 'none';
  if (callBtn) callBtn.style.display = 'block';
  
  // Update chat header
  const chatTitle = document.querySelector('.chat-title');
  const chatStatus = document.querySelector('.chat-status');
  if (chatTitle) chatTitle.textContent = chatUser.name;
  if (chatStatus) chatStatus.textContent = chatUser.status;

  // Load messages
  fetch(`/api/messages/${userId}`, {
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  })
  .then(res => res.json())
  .then(messages => {
    renderMessages(messages, window.user.id, chatUser.name);
  })
  .catch(err => console.error('Error loading messages:', err));

  showSection('chat');
}

// Event listeners for UI
document.addEventListener('DOMContentLoaded', () => {
  // Friends button in leftbar
  const friendsBtn = document.querySelector('.leftbar .friends');
  if (friendsBtn) {
    friendsBtn.addEventListener('click', () => {
      showSection('friends');
    });
  }

  // Filter buttons
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const filter = btn.getAttribute('data-filter');
      if (filter === 'all' || filter === 'online') {
        currentFilter = filter;
        renderFriendsList(window.user.friends || [], currentFilter);
        showSection('friends');
      } else if (filter === 'waiting') {
        showSection('waiting');
      } else if (filter === 'add') {
        showSection('add');
      }
    });
  });

  // Chat buttons in friends list
  const friendsListContainer = document.querySelector('.friends-list');
  if (friendsListContainer) {
    friendsListContainer.addEventListener('click', (e) => {
      const chatTarget = e.target.closest('.action-btn[data-action="chat"]');
      if (chatTarget) {
        e.preventDefault();
        const userId = parseInt(chatTarget.getAttribute('data-user'));
        openChat(userId);
        return;
      }
      
      const callTarget = e.target.closest('.action-btn[data-action="call"]');
      if (callTarget) {
        e.preventDefault();
        const userId = parseInt(callTarget.getAttribute('data-user'));
        initiateCall(userId, false);
      }
    });
  }

  // Send message button
  const sendBtn = document.querySelector('.send-btn');
  const messageInput = document.querySelector('.message-input');
  if (sendBtn && messageInput) {
    const sendMessage = () => {
      const message = messageInput.value.trim();
      if (!message) return;

      if (socket && socket.connected) {
        if (currentGroup) {
          // Send group message
          socket.emit('send_group_message', { groupId: currentGroup.id, message });
          
          // Add message to UI immediately
          const chatMessages = document.querySelector('.chat-messages');
          if (chatMessages) {
            // Remove "empty message" if exists
            const emptyMessage = chatMessages.querySelector('.empty-message');
            if (emptyMessage) {
              emptyMessage.remove();
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message sent';
            messageDiv.innerHTML = `
              <img src="#" alt="user logo" class="message-logo">
              <div class="message-content">
                <div class="message-username title">You</div>
                <div class="message-text subtitle">${message}</div>
                <div class="message-time subtitle">${new Date().toLocaleTimeString()}</div>
              </div>
            `;
            chatMessages.appendChild(messageDiv);
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
        } else if (currentChatUser) {
          // Send direct message
          const recipientId = currentChatUser.interlocutor_id || currentChatUser.id;
          socket.emit('send_message', { to: recipientId, message });
          
          // Add message to UI immediately
          const chatMessages = document.querySelector('.chat-messages');
          if (chatMessages) {
            // Remove "empty message" if exists
            const emptyMessage = chatMessages.querySelector('.empty-message');
            if (emptyMessage) {
              emptyMessage.remove();
            }
            
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message sent';
            messageDiv.innerHTML = `
              <img src="#" alt="user logo" class="message-logo">
              <div class="message-content">
                <div class="message-username title">You</div>
                <div class="message-text subtitle">${message}</div>
                <div class="message-time subtitle">${new Date().toLocaleTimeString()}</div>
              </div>
            `;
            chatMessages.appendChild(messageDiv);
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          
          // Update dialogues list
          fetch('/api/dialogues', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
          })
          .then(res => res.json())
          .then(dialogues => {
            window.dialogues = dialogues;
            renderDirectMessages(dialogues);
          });
        }
        
        messageInput.value = '';
      } else {
        console.error('Socket not connected');
      }
    };

    sendBtn.addEventListener('click', sendMessage);
    
    // Allow sending with Enter key
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }

  // Create group button
  const createGroupBtn = document.querySelector('.create-group');
  if (createGroupBtn) {
    createGroupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showCreateGroupModal();
    });
  }

  // Modal close button
  const closeModalBtn = document.querySelector('.close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', hideCreateGroupModal);
  }

  // Cancel group button
  const cancelGroupBtn = document.getElementById('cancel-group-btn');
  if (cancelGroupBtn) {
    cancelGroupBtn.addEventListener('click', hideCreateGroupModal);
  }

  // Create group button
  const createGroupSubmitBtn = document.getElementById('create-group-btn');
  if (createGroupSubmitBtn) {
    createGroupSubmitBtn.addEventListener('click', createGroup);
  }

  // Close modal on outside click
  const modal = document.getElementById('create-group-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideCreateGroupModal();
      }
    });
  }

  // Group action buttons
  const addUserBtn = document.querySelector('.add-user-btn');
  if (addUserBtn) {
    addUserBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showAddUserModal();
    });
  }

  const groupInfoBtn = document.querySelector('.group-info-btn');
  if (groupInfoBtn) {
    groupInfoBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showGroupInfoModal();
    });
  }

  const deleteGroupBtn = document.querySelector('.delete-group-btn');
  if (deleteGroupBtn) {
    deleteGroupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      deleteGroup();
    });
  }

  // Group info modal handlers
  const groupInfoModal = document.getElementById('group-info-modal');
  if (groupInfoModal) {
    const closeInfoBtn = groupInfoModal.querySelector('.close-modal');
    if (closeInfoBtn) {
      closeInfoBtn.addEventListener('click', hideGroupInfoModal);
    }
    
    const closeInfoBtnFooter = document.getElementById('close-info-btn');
    if (closeInfoBtnFooter) {
      closeInfoBtnFooter.addEventListener('click', hideGroupInfoModal);
    }
    
    groupInfoModal.addEventListener('click', (e) => {
      if (e.target === groupInfoModal) {
        hideGroupInfoModal();
      }
    });
  }

  // Add user modal handlers
  const addUserModal = document.getElementById('add-user-modal');
  if (addUserModal) {
    const closeAddUserBtn = addUserModal.querySelector('.close-modal');
    if (closeAddUserBtn) {
      closeAddUserBtn.addEventListener('click', hideAddUserModal);
    }
    
    const cancelAddUserBtn = document.getElementById('cancel-add-user-btn');
    if (cancelAddUserBtn) {
      cancelAddUserBtn.addEventListener('click', hideAddUserModal);
    }
    
    const confirmAddUserBtn = document.getElementById('confirm-add-user-btn');
    if (confirmAddUserBtn) {
      confirmAddUserBtn.addEventListener('click', addUserToGroup);
    }
    
    addUserModal.addEventListener('click', (e) => {
      if (e.target === addUserModal) {
        hideAddUserModal();
      }
    });
  }

  // Start call button
  const startCallBtn = document.getElementById('start-call-btn');
  if (startCallBtn) {
    startCallBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (currentGroup) {
        // Group call
        initiateCall(currentGroup.id, true);
      } else if (currentChatUser) {
        // Individual call
        const userId = currentChatUser.interlocutor_id || currentChatUser.id;
        initiateCall(userId, false);
      }
    });
  }
});