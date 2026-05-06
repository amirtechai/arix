module.exports = {
  apps: [
    {
      name: 'arix-dashboard',
      script: '/home/fatih/arix/packages/dashboard/dist/run.js',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        PORT: '7432',
        STORAGE_DIR: '/home/fatih/.arix/sessions',
      },
      restart_delay: 3000,
      max_restarts: 10,
      watch: false,
    },
  ],
}
