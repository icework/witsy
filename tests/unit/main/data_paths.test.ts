import { afterEach, expect, test, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { configureDataPaths } from '@main/data_paths'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('leaves normal application paths unchanged without an override', () => {
  const app = { setPath: vi.fn(), setAppLogsPath: vi.fn() }
  configureDataPaths(app)
  configureDataPaths(app, '')
  expect(app.setPath).not.toHaveBeenCalled()
  expect(app.setAppLogsPath).not.toHaveBeenCalled()
})

test('isolates Electron storage, cache, logs and crashes in an existing absolute directory', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-paths-'))
  directories.push(directory)
  const root = path.join(directory, 'new home')
  const app = {
    setPath: vi.fn((_name: string, target: string) => {
      expect(path.isAbsolute(target)).toBe(true)
      expect(fs.statSync(target).isDirectory()).toBe(true)
    }),
    setAppLogsPath: vi.fn(),
  }
  configureDataPaths(app, path.relative(process.cwd(), root))
  expect(app.setPath.mock.calls).toEqual([
    ['userData', root],
    ['sessionData', path.join(root, 'session')],
    ['crashDumps', path.join(root, 'crashes')],
  ])
  expect(app.setAppLogsPath).toHaveBeenCalledWith(path.join(root, 'logs'))
  // Reusing a test home must preserve existing settings and history.
  fs.writeFileSync(path.join(root, 'settings.json'), '{"marker":"preserved"}')
  configureDataPaths(app, root)
  expect(fs.readFileSync(path.join(root, 'settings.json'), 'utf8')).toBe('{"marker":"preserved"}')
})

test('fails before changing Electron paths when the requested home cannot be created', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'summon-paths-'))
  directories.push(directory)
  const file = path.join(directory, 'file')
  fs.writeFileSync(file, 'not a directory')
  const app = { setPath: vi.fn(), setAppLogsPath: vi.fn() }
  expect(() => configureDataPaths(app, path.join(file, 'home'))).toThrow()
  expect(app.setPath).not.toHaveBeenCalled()
})
