import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import { isDeepStrictEqual } from 'node:util'

// Only the source checkout is variable. Never inherit a temporary WITSY_HOME.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataRoot = path.join(os.homedir(), 'Library/Application Support/Summon')
const electronApp = path.join(repo, 'node_modules/electron/dist/Electron.app')
const electronExecutable = path.join(electronApp, 'Contents/MacOS/Electron')
const label = 'com.icework.summon.dev'
const domain = `gui/${process.getuid()}`
const service = `${domain}/${label}`
const plistPath = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`)
const logPath = path.join(os.homedir(), 'Library/Logs/Summon/launcher.log')

function command(executable, args, options = {}) {
  return spawnSync(executable, args, { encoding: 'utf8', timeout: 10000, ...options })
}

function requireSuccess(result, message) {
  if (result.status !== 0) throw new Error(message)
  return result.stdout
}

function appIsRunning() {
  const output = requireSuccess(command('/bin/ps', ['-axo', 'pid=,ppid=,command=']), 'Cannot inspect running Summon processes.')
  const processes = output.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
  const app = processes.find(([, , , cmd]) => cmd === `${electronExecutable} .`)
  if (!app) return false
  const helpers = processes.filter(([, , parent, cmd]) => parent === app[1] && cmd.includes('--user-data-dir='))
  if (!helpers.length) return false // Electron is still initializing.
  if (helpers.some(([, , , cmd]) => !cmd.includes(`--user-data-dir=${dataRoot} --`))) {
    throw new Error('Another Summon instance uses a different settings folder. Quit it before launching Summon here.')
  }
  return true
}

function activate() {
  requireSuccess(command('/usr/bin/open', ['-a', electronApp]), 'Summon is running, but macOS could not show its window.')
  console.log('Summon opened — saved settings retained.')
}

async function launch() {
  if (process.platform !== 'darwin') throw new Error('This launcher requires macOS.')
  if (!fs.existsSync(electronExecutable) || !fs.existsSync(path.join(repo, 'node_modules/@electron-forge/cli/dist/electron-forge.js'))) {
    throw new Error('Summon dependencies are missing. Run npm install in the repository first.')
  }
  // Reuse both launcher-managed and manually started copies of this checkout.
  if (appIsRunning()) return activate()

  const definition = {
    Label: label,
    ProgramArguments: ['/bin/bash', path.join(repo, 'raycast/summon.sh'), '--run'],
    WorkingDirectory: repo,
    RunAtLoad: false,
    KeepAlive: false,
    ProcessType: 'Interactive',
    StandardOutPath: logPath,
    StandardErrorPath: logPath,
  }
  fs.mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 })
  fs.closeSync(fs.openSync(logPath, 'a', 0o600))
  fs.chmodSync(logPath, 0o600)
  fs.mkdirSync(path.dirname(plistPath), { recursive: true, mode: 0o700 })

  // Keep the registered job consistent if the checkout was moved. Never stop a
  // running job: a second invocation can arrive during Forge's initial compile.
  const previous = fs.existsSync(plistPath)
    ? command('/usr/bin/plutil', ['-convert', 'json', '-o', '-', plistPath])
    : null
  const loaded = command('/bin/launchctl', ['print', service])
  if (loaded.status === 0 && previous?.stdout && !isDeepStrictEqual(JSON.parse(previous.stdout), definition)) {
    if (/\bstate = running\b/.test(loaded.stdout)) throw new Error('Summon is starting from another checkout. Quit it before changing the launcher.')
    requireSuccess(command('/bin/launchctl', ['bootout', service]), 'Cannot update the Summon launcher registration.')
  }
  const plist = requireSuccess(command('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', '-'], { input: JSON.stringify(definition) }), 'Cannot prepare the Summon launcher.')
  fs.writeFileSync(plistPath, plist, { mode: 0o600 })
  fs.chmodSync(plistPath, 0o600)
  if (command('/bin/launchctl', ['print', service]).status !== 0) {
    const bootstrap = command('/bin/launchctl', ['bootstrap', domain, plistPath])
    // Another simultaneous invocation may have registered it first.
    if (bootstrap.status !== 0 && command('/bin/launchctl', ['print', service]).status !== 0) {
      throw new Error('macOS could not register the Summon launcher.')
    }
  }
  // Without -k, launchd reuses an already-running job instead of restarting it.
  requireSuccess(command('/bin/launchctl', ['kickstart', service]), 'macOS could not start Summon.')
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (appIsRunning()) return activate()
    await setTimeout(500)
    const status = command('/bin/launchctl', ['print', service])
    if (status.status !== 0 || !/\bstate = running\b/.test(status.stdout)) {
      throw new Error(`Summon stopped during startup. See ${logPath}`)
    }
  }
  throw new Error(`Summon is taking longer to start. See ${logPath}`)
}

launch().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
