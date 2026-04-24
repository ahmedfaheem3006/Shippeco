import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)

const env = {
  ...process.env,
  PW_HEADED: '1',
  PW_SLOWMO_MS: process.env.PW_SLOWMO_MS || '250',
}

const result = spawnSync('npx', ['playwright', 'test', ...args], {
  stdio: 'inherit',
  shell: true,
  env,
})

process.exit(result.status ?? 1)

