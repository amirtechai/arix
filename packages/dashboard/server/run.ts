import { startDashboard } from './index.js'
import { homedir } from 'node:os'
import { join } from 'node:path'

const port = parseInt(process.env['PORT'] ?? '7432', 10)
const storageDir = process.env['STORAGE_DIR'] ?? join(homedir(), '.arix', 'sessions')

startDashboard({ port, storageDir })
  .then((server) => {
    console.log(`Arix dashboard running at ${server.url}`)
  })
  .catch((err: unknown) => {
    console.error('Failed to start dashboard:', err)
    process.exit(1)
  })
