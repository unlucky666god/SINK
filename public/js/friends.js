// Friends related functions

// Function to refresh user data
async function refreshUserData() {
  const token = localStorage.getItem('token');
  const userResponse = await fetch('/api/user', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  if (userResponse.ok) {
    const updatedUser = await userResponse.json();
    window.user = updatedUser; // Update global user
    renderDirectMessages(updatedUser.friends || []);
    renderFriendsList(updatedUser.friends || [], currentFilter);
    renderWaitingList(updatedUser.waiting || []);
  }
}

// Event listeners for friends
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');

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

  // Delete friend
  const friendsList = document.querySelector('.friends-list');
  if (friendsList) {
    friendsList.addEventListener('click', async (e) => {
      const target = e.target.closest('.action-btn[data-action="delete"]');
      if (target) {
        e.preventDefault();
        const userId = parseInt(target.getAttribute('data-user'));
        if (!userId) return;


        try {
          const response = await fetch('/api/friends/remove', {
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
            await refreshUserData();
          } else {
            alert(data.message || 'Error.');
          }
        } catch (error) {
          console.error('Error removing friend:', error);
          alert('Network error.');
        }
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
          await refreshUserData();
        } else {
          alert(data.message || 'Error.');
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Network error.');
      }
    });
  }
});