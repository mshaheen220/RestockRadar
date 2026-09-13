// PM2 process definition for TheForge, matching the FloraSync/Spoolman pattern:
// the PHP backend runs as a long-lived PM2 process; the frontend is built to static
// files (frontend/dist) and served directly by Caddy — no PM2 process needed for it.
module.exports = {
  apps: [
    {
      name: 'restockradar-backend',
      cwd: __dirname + '/backend',
      script: 'php',
      args: '-S 127.0.0.1:8734 -t public',
      env: {
        RESTOCKRADAR_DB_PATH: __dirname + '/backend/database/restockradar.sqlite',
        RESTOCKRADAR_ALLOWED_ORIGIN: 'https://restockradar.theforge.local',
      },
    },
  ],
};
