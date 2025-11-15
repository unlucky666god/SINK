const authManager = {
  // Проверяет, есть ли токен, и если есть — редиректит на /index.html
  async redirectIfAuthenticated() {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await fetch('/index.html', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          window.location.href = '/index.html';
          return true;
        }
      } catch (e) {
        console.error('Auth check failed:', e);
      }
    }
    return false;
  }
};