# Python Backend Port Status

The Python application is the backend selected by the POS PM2 configuration. It has broad route coverage, but complete parity with the former Node backend has not been independently verified; run the API tests and validate your required cashier workflows before relying on it in production.

## Safe Development

Use a disposable copy of the SQLite database. The Python print-store initializer checks database integrity and creates an online backup before adding its station/job tables, but it must not be used as a repair tool for an unreadable production database.

```powershell
python -m pip install -r requirements-dev.txt
$env:POS_DB_PATH = 'C:\POS-Test\dev-copy.db'
python -m unittest discover -s tests -v
python server.py
```

The Python server binds to `0.0.0.0:5000` by default. Vite binds to `0.0.0.0:5173`, so both listeners accept connections on network interfaces that become available after the processes start. On Windows, run `setup_autostart_server.bat` to install PM2 (if needed), start both processes, save the PM2 process list, and restore it at user sign-in. Run the installer as Administrator to add firewall rules limited to the local subnet. For another device, open `http://<server-PC-LAN-IP>:5173`; find the current IP with `ipconfig`. `pm2 status` shows process health. A changed LAN IP changes the URL, but does not require restarting Vite. `POS_DB_PATH` selects the database file; otherwise the app checks root `dev.db`, then `prisma/dev.db`.

Set `POS_SESSION_SECRET` to a long, random value shared by all backend workers. If it is unset, the server generates a process-local secret; existing sessions then become invalid after a restart, and multiple workers will not share sessions. User-management writes require an authenticated admin or an assigned shop manager (cashier accounts in that manager's shop only); salon reset is admin-only.

## Receipt Printing

The frontend sends receipt data to the selected station's server queue. A Windows print agent on each cashier PC sends ESC/POS bytes directly to that PC's Windows default printer using `pywin32`, without a browser print dialog or PDF rendering. Each PC needs one active station token. Remote agents may use HTTP on the trusted local network; the server URL must use the server PC's LAN IP, not `localhost`.

On the server PC, build the small transfer package with `package_print_agent.ps1`. Copy only `release/POSPrintAgent-Windows.zip` to the cashier PC and extract it. The cashier PC does not need the POS project, database, frontend, or server code, but does need Python installed. Set that PC's Windows default printer, then run `install_print_agent.ps1` from the extracted folder. Enter the server URL (use the server PC's LAN IP, not `localhost`) and that PC's station token; the agent discovers the default printer automatically and starts at Windows login. Choose the corresponding station in the POS app on that PC. An admin test-print action sends a non-sale test receipt to the selected station.

The existing old queued jobs are preserved. Jobs older than 15 minutes become `unknown` and require cashier review before they can print.

Before relying on the Python backend for production, port and test the remaining routes, real-database schema compatibility, backups, Windows printer behavior, and multi-station workflows.
