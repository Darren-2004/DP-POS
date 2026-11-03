const path = require('node:path');
const { execSync } = require('node:child_process');

const root = __dirname;

/**
 * Détecte le chemin absolu de l'interpréteur Python disponible sur la machine.
 * Ordre de priorité :
 *  1. Variable d'environnement POS_PYTHON_PATH (définie par les scripts .ps1)
 *  2. `py`     — Windows Launcher (présent même si python.exe n'est pas dans PATH)
 *  3. `python` — fallback classique
 */
function getPythonInterpreter() {
  if (process.env.POS_PYTHON_PATH) {
    return process.env.POS_PYTHON_PATH;
  }
  try {
    const detected = execSync('py -c "import sys; print(sys.executable)"', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (detected) return detected;
  } catch (_) {}
  try {
    const detected = execSync('python -c "import sys; print(sys.executable)"', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (detected) return detected;
  } catch (_) {}
  return 'python';
}

const pythonInterpreter = getPythonInterpreter();
console.log('[PM2 POS] Interpréteur Python détecté :', pythonInterpreter);

module.exports = {
  apps: [
    {
      name: 'pos-python-backend',
      script: 'server.py',
      interpreter: pythonInterpreter,
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
