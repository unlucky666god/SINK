document.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/singin.html';
    return;
  }

  try {
    const response = await fetch('/api/user', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!response.ok) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/singin.html';
      return;
    }
    const user = await response.json();
    console.log('Current user:', user);

    // Update the user name in the UI
    const userNameElement = document.querySelector('.user-place .info .name');
    if (userNameElement) {
      userNameElement.textContent = user.name;
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
                <a href="#" class="action-btn" data-action="call"><img src="/static/imgs/call.svg" alt="call-logo" class="call"></a>
                <a href="#" class="action-btn" data-action="chat" data-user="${friend.id}"><img src="/static/imgs/chat.svg" alt="chat-logo" class="chat"></a>
                <a href="#" class="action-btn" data-action="delete"><img src="/static/imgs/delete.svg" alt="del-logo" class="delete"></a>
              </div>
            `;
            friendsList.appendChild(friendElement);
          });
        }
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

    // Current filter
    let currentFilter = 'all';

    // Function to show section
    function showSection(section) {
      const friendsList = document.querySelector('.friends-list');
      const waitingList = document.querySelector('.waiting-list');
      const addFriendForm = document.querySelector('.add-friend-form');
      friendsList.style.display = section === 'friends' ? 'block' : 'none';
      waitingList.style.display = section === 'waiting' ? 'block' : 'none';
      addFriendForm.style.display = section === 'add' ? 'block' : 'none';
    }

    // Initial render
    renderFriendsList(user.friends || [], currentFilter);
    renderWaitingList(user.waiting || []);
    showSection('friends');

    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const filter = btn.getAttribute('data-filter');
        if (filter === 'all' || filter === 'online') {
          currentFilter = filter;
          renderFriendsList(user.friends || [], currentFilter);
          showSection('friends');
        } else if (filter === 'waiting') {
          showSection('waiting');
        } else if (filter === 'add') {
          showSection('add');
        }
      });
    });

    // Add friend functionality
    const sendRequestBtn = document.getElementById('send-request-btn');
    const cancelAddBtn = document.getElementById('cancel-add-btn');
    const friendUsernameInput = document.getElementById('friend-username');

    if (cancelAddBtn) {
      cancelAddBtn.addEventListener('click', () => {
        showSection('friends');
        friendUsernameInput.value = '';
      });
    }

    if (sendRequestBtn) {
      sendRequestBtn.addEventListener('click', async () => {
        const name = friendUsernameInput.value.trim();
        if (!name) {
          alert('Please enter a username.');
          return;
        }

        try {
          const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ name })
          });

          const data = await response.json();
          if (response.ok) {
            alert('Friend request sent!');
            showSection('friends');
            friendUsernameInput.value = '';
          } else {
            alert(data.message || 'Error sending request.');
          }
        } catch (error) {
          console.error('Error sending friend request:', error);
          alert('Network error.');
        }
      });
    }

    // Waiting actions
    const waitingList = document.querySelector('.waiting-list');
    if (waitingList) {
      waitingList.addEventListener('click', async (e) => {
        e.preventDefault();
        const target = e.target.closest('.action-btn');
        if (!target) return;

        const userId = parseInt(target.getAttribute('data-user'));
        if (!userId) return;

        let endpoint = '';
        if (target.classList.contains('accept-btn')) {
          endpoint = '/api/friends/accept';
        } else if (target.classList.contains('cancel-btn')) {
          endpoint = '/api/friends/cancel';
        } else {
          return;
        }

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: userId })
          });

          const data = await response.json();
          if (response.ok) {
            alert(data.message);
            // Refresh user data
            const userResponse = await fetch('/api/user', {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            });
            if (userResponse.ok) {
              const updatedUser = await userResponse.json();
              user = updatedUser; // Update local user
              renderFriendsList(updatedUser.friends || [], currentFilter);
              renderWaitingList(updatedUser.waiting || []);
            }
          } else {
            alert(data.message || 'Error.');
          }
        } catch (error) {
          console.error('Error:', error);
          alert('Network error.');
        }
      });
    }
  } catch (e) {
    console.error('Failed to fetch user:', e);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/singin.html';
  }
});