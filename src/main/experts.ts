
import { Expert, ExpertCategory, ExpertData } from 'types/index'
import { App } from 'electron'
import { workspaceFolderPath } from './workspace'
import Monitor from './monitor'
import * as window from './window'
import * as file from './file'
import path from 'path'
import fs from 'fs'

const monitor: Monitor = new Monitor(() => {
  window.emitIpcEventToAll('file-modified', 'experts');
});

export const expertsFilePath = (app: App, workspaceId: string): string => {
  const workspacePath = workspaceFolderPath(app, workspaceId)
  return path.join(workspacePath, 'experts.json')
}

export const loadExperts = (source: App|string, workspaceId: string): Expert[] => {
  const expertData = loadExpertData(source, workspaceId)
  return expertData.experts
}

export const saveExperts = (dest: App|string, workspaceId: string, content: Expert[]): void => {
  try {
    const expertData = loadExpertData(dest, workspaceId)
    expertData.experts = content
    saveExpertData(dest, workspaceId, expertData)
  } catch (error) {
    console.log('Error saving experts data', error)
  }
}

export const loadCategories = (source: App|string, workspaceId: string): ExpertCategory[] => {
  const expertData = loadExpertData(source, workspaceId)
  return expertData.categories
}

export const saveCategories = (dest: App|string, workspaceId: string, content: ExpertCategory[]): void => {
  try {
    const expertData = loadExpertData(dest, workspaceId)
    expertData.categories = content
    saveExpertData(dest, workspaceId, expertData)
  } catch (error) {
    console.log('Error saving categories', error)
  }
}

const loadExpertData = (source: App|string, workspaceId: string): ExpertData => {

  // init
  let jsonData: any
  const expertsFile = typeof source === 'string' ? source : expertsFilePath(source, workspaceId)

  // read
  try {
    jsonData = JSON.parse(fs.readFileSync(expertsFile, 'utf-8'))
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.log('Error retrieving experts', error)
    }
  }

  // migrations can update
  let updated = false

  // migrate old experts format
  const expertData: ExpertData = {
    categories: [],
    experts: [],
  }
  
  if (Array.isArray(jsonData)) {

    // this is a migration from old array format
    // as this is a breaking change we backup the old file
    try {
      if (!process.env.TEST) {
        const backupFile = expertsFile.replace('.json', '-backup-v2.json')
        fs.copyFileSync(expertsFile, backupFile)
      }
    } catch (error) {
      console.warn('Error creating experts backup file', error)
    }

    // migrate to new format
    expertData.experts = jsonData as Expert[]
    updated = true
  } else if (jsonData?.categories && jsonData?.experts) {
    expertData.categories = jsonData.categories as ExpertCategory[]
    expertData.experts = jsonData.experts as Expert[]
  } else {
    return expertData
  }

  // Built-in experts have been retired in favor of agents.
  const removedCategoryIds = new Set(expertData.categories
    .filter(category => category.type === 'system')
    .map(category => category.id))
  const userExperts = expertData.experts.filter(expert => expert.type !== 'system')
  const userCategories = expertData.categories.filter(category => category.type !== 'system')
  updated ||= userExperts.length !== expertData.experts.length || userCategories.length !== expertData.categories.length
  expertData.experts = userExperts
  expertData.categories = userCategories

  for (const expert of expertData.experts) {
    if (removedCategoryIds.has(expert.categoryId)) {
      delete expert.categoryId
      updated = true
    }
    if (!expert.stats) {
      expert.stats = { timesUsed: 0 }
      updated = true
    }
  }

  // save if needed
  if (updated) {
    saveExpertData(source, workspaceId, expertData)
  }

  // start monitoring
  if (typeof source !== 'string') {
    monitor.start(expertsFile)
  }

  // done
  return expertData

}

export const saveExpertData = (dest: App|string, workspaceId: string, content: ExpertData): void => {
  try {
    const expertsFile = typeof dest === 'string' ? dest : expertsFilePath(dest, workspaceId)
    fs.writeFileSync(expertsFile, JSON.stringify(content, null, 2))
  } catch (error) {
    console.log('Error saving experts', error)
  }
}

export const exportExperts = (app: App, workspaceId: string) => {

  // pick a directory
  const filepath = file.pickDirectory(app)
  if (!filepath) {
    return false
  }

  // load defaults file content
  const contents = fs.readFileSync(expertsFilePath(app, workspaceId), 'utf-8')

  // write
  const target = path.join(filepath, 'experts.json')
  fs.writeFileSync(target, contents)
  
  // done
  return true

}

export const importExperts = (app: App, workspaceId: string) => {

  // pick the file
  const filename = file.pickFile(app, { location: true, filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (!filename) {
    return false
  }

  // read and write
  const contents = fs.readFileSync(filename as string, 'utf-8')
  fs.writeFileSync(expertsFilePath(app, workspaceId), contents)

  // done
  return true

}
