// PM2 — Configuration environnement STAGING
// Port 3001 (différent du port 3000 de la production)
module.exports = {
  apps: [
    {
      name: "mqr-staging",
      script: ".output/server/index.mjs",
      cwd: "/srv/mqr-staging",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "staging",
        PORT: 3001,
      },
      out_file: "/var/log/mqr/staging-out.log",
      error_file: "/var/log/mqr/staging-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      restart_delay: 1000,
      max_restarts: 5,
    },
  ],
};
