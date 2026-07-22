import { execFileSync } from 'node:child_process'

const generated = ['public/r', 'public/demo']
const status = execFileSync(
  'git',
  ['status', '--short', '--untracked-files=all', '--', ...generated],
  { encoding: 'utf8' },
).trim()

if (status) {
  console.error('Generated registry or demo artifacts are out of date:')
  console.error(status)
  console.error('\nRun `npm run registry:build` and `npm run demo:build`, then commit the results.')
  process.exit(1)
}

console.log('Generated registry and demo artifacts are up to date.')
