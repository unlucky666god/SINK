document.addEventListener('DOMContentLoaded', async () => {
  // Check if user is authenticated
  if (!localStorage.getItem('token')) {
    window.location.href = '/singin.html';
    return;
  }

  try {
    const response = await fetch('/api/user', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
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

    // Set global user
    window.user = user;

    // Update the user name in the UI
    const userNameElement = document.querySelector('.user-place .info .name');
    if (userNameElement) {
      userNameElement.textContent = user.name;
    }

    // Fetch dialogues
    const dialoguesResponse = await fetch('/api/dialogues', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    let dialogues = [];
    if (dialoguesResponse.ok) {
      dialogues = await dialoguesResponse.json();
    } else {
      console.error('Failed to fetch dialogues:', dialoguesResponse.status);
    }

    // Ensure dialogues is an array
    if (!Array.isArray(dialogues)) {
      dialogues = [];
    }

    // Set global dialogues
    window.dialogues = dialogues;

    // Initialize Socket.io
    initSocket();
    
    // Load groups
    loadGroups();
    
    // Initial render
    renderDirectMessages(dialogues);
    renderFriendsList(user.friends || [], currentFilter);
    renderWaitingList(user.waiting || []);
    showSection('friends');
  } catch (e) {
    console.error('Failed to fetch user:', e);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/singin.html';
  }
});