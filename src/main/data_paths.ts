import type { App } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Call before creating stores, sessions, logs or acquiring the instance lock.
export const configureDataPaths = (app: Pick<App, 'setPath' | 'setAppLogsPath'>, home?: string): void => {
  if (!home) return

  const root = path.resolve(home)
  const session = path.join(root, 'session')
  const logs = path.join(root, 'logs')
  const crashes = path.join(root, 'crashes')
  for (const directory of [root, session, logs, crashes]) {
    fs.mkdirSync(directory, { recursive: true })
  }

  app.setPath('userData', root)
  app.setPath('sessionData', session)
  app.setPath('crashDumps', crashes)
  app.setAppLogsPath(logs)
}
