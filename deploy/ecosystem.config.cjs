// PM2 — Gestionnaire de processus Node.js
// Usage :
//   pm2 start deploy/ecosystem.config.cjs   ← premier démarrage
//   pm2 reload mqr --update-env             ← rechargement sans coupure (utilisé par CI/CD)
//   pm2 save                                ← persister après redémarrage serveur
//   pm2 startup                             ← lancer PM2 au démarrage du VPS

module.exports = {
  apps: [
    {
      name: "mqr",
      script: ".output/server/index.mjs",   // chemin de sortie de `bun run build` (TanStack Start / Nitro)
      interpreter: "node",
      instances: 1,                         // 1 instance suffit sur VPS-1/VPS-2 ; mettre "max" sur VPS-4+
      exec_mode: "fork",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        // Les variables secrètes sont chargées depuis /srv/mqr/.env (voir .env.example)
        // Ne jamais les mettre ici.
      },
      // Redémarrage automatique si l'application plante
      max_restarts: 10,
      restart_delay: 5000,
      // Logs
      out_file: "/var/log/mqr/out.log",
      error_file: "/var/log/mqr/error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
