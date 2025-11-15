// UI related functions

let currentFilter = 'all';
let currentChatUser = null;

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

// Function to render direct messages
function renderDirectMessages(friends) {
  const directContainer = document.querySelector('.direct');
  if (directContainer) {
    // Clear existing except the template if any
    const existing = directContainer.querySelectorAll('.direct-position');
    existing.forEach(el => el.remove());

    friends.forEach(friend => {
      const directElement = document.createElement('div');
      directElement.className = 'direct-position';
      directElement.setAttribute('data-user', friend.id);
      directElement.innerHTML = `
        <img src="#" alt="user logo">
        <div class="info">
          <div class="position-name title">${friend.name}</div>
          <label class="status subtitle">${friend.status}</label>
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
  const friend = window.user.friends.find(f => f.id === userId);
  if (!friend) return;

  currentChatUser = friend;
  // Update chat header
  const chatTitle = document.querySelector('.chat-title');
  const chatStatus = document.querySelector('.chat-status');
  if (chatTitle) chatTitle.textContent = friend.name;
  if (chatStatus) chatStatus.textContent = friend.status;

  showSection('chat');
}

// Event listeners for UI
document.addEventListener('DOMContentLoaded', () => {
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
      const target = e.target.closest('.action-btn[data-action="chat"]');
      if (target) {
        e.preventDefault();
        const userId = parseInt(target.getAttribute('data-user'));
        openChat(userId);
      }
    });
  }
});