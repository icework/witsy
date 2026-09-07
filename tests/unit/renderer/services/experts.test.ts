
import { vi, beforeAll, beforeEach, expect, test } from 'vitest'
import fs from 'fs'
import { useWindowMock } from '@tests/mocks/window'
import * as main from '@main/experts'
import * as service from '@services/experts'
import { app } from 'electron'

vi.mock('electron', async() => {
  return {
    app: {
      getPath: vi.fn(() => '')
    },
  }
})

vi.mock('fs', async (importOriginal) => {
  const mod: any = await importOriginal()
  return { default: {
    ...mod,
    writeFileSync: vi.fn(),
  }}
})

beforeAll(() => {
  useWindowMock()
})

test('New expert', () => {
  const expert = service.newExpert()
  expect(expert).toStrictEqual({
    id: null,
    type: 'user',
    name: 'New expert',
    prompt: '',
    state: 'enabled',
    triggerApps: [],

  })
})

beforeEach(() => {
  vi.clearAllMocks()
})

test('New workspaces have no built-in experts or categories', () => {
  const experts = main.loadExperts(app, 'test-workspace')
  expect(experts).toEqual([])
  expect(main.loadCategories(app, 'test-workspace')).toEqual([])
})

test('Load custom experts', () => {
  const experts = main.loadExperts('./tests/fixtures/experts1.json', 'test-workspace')
  expect(experts).toEqual([{
    id: 'user-expert-1',
    type: 'user',
    name: 'User Expert 1',
    prompt: 'User Prompt 1',
    state: 'enabled',
    stats: { timesUsed: 0 },
  }])
  expect(fs.writeFileSync).toHaveBeenCalledWith('./tests/fixtures/experts1.json', JSON.stringify({
    categories: [], experts,
  }, null, 2))
})

test('Removes installed system presets and preserves custom content on repeated loads', () => {
  const data = {
    categories: [
      { id: 'system-category', type: 'system', state: 'enabled' },
      { id: 'user-category', type: 'user', name: 'Custom category', state: 'enabled' },
    ],
    experts: [
      { id: 'system-expert', type: 'system', state: 'enabled' },
      { id: 'custom', type: 'user', name: 'Custom', prompt: 'My prompt', categoryId: 'system-category', stats: { timesUsed: 7 } },
      { id: 'categorized', type: 'user', name: 'Categorized', prompt: 'Other prompt', categoryId: 'user-category', stats: { timesUsed: 1 } },
    ],
  }
  let saved = JSON.stringify(data)
  const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => saved)
  vi.mocked(fs.writeFileSync).mockImplementation((_path, contents) => { saved = contents as string })
  try {
    const experts = main.loadExperts('/test/experts.json', 'test-workspace')
    expect(experts).toEqual([
      { id: 'custom', type: 'user', name: 'Custom', prompt: 'My prompt', stats: { timesUsed: 7 } },
      data.experts[2],
    ])
    expect(main.loadCategories('/test/experts.json', 'test-workspace')).toEqual([data.categories[1]])
    expect(main.loadExperts('/test/experts.json', 'test-workspace')).toEqual(experts)
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1)
  } finally {
    read.mockRestore()
    vi.mocked(fs.writeFileSync).mockReset()
  }
})
