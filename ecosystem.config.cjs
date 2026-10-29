const path = require('node:path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'pos-python-backend',
      script: 'server.py',
      interpreter: 'python',
      cwd: root,
      env: {
        HOST: '0.0.0.0',
        PORT: '5000',
        PYTHONUNBUFFERED: '1',
      },
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 15,
      min_uptime: '10s',
      windowsHide: true,
    },
    {
      name: 'pos-vite-frontend',
      script: path.join(root, 'frontend', 'node_modules', 'vite', 'bin', 'vite.js'),
      interpreter: 'node',
      cwd: path.join(root, 'frontend'),
      args: '--host 0.0.0.0 --port 5173 --strictPort',
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 15,
      min_uptime: '10s',
      windowsHide: true,
    },
  ],
};