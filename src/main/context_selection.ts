import applescript from 'applescript'

// AXSelectedText reads the selection without replacing the user's clipboard.
// Apps that do not expose this attribute fall back to an editable empty preview.
export const readSelectedContext = (): Promise<string> => new Promise((resolve, reject) => {
  applescript.execString(`
    with timeout of 5 seconds
    tell application "System Events"
      set foregroundProcess to first application process whose frontmost is true
      tell foregroundProcess
        set focusedElement to value of attribute "AXFocusedUIElement"
        try
          set selectedText to value of attribute "AXSelectedText" of focusedElement
          if selectedText is missing value then return ""
          return selectedText as text
        on error
          return ""
        end try
      end tell
    end tell
    end timeout
  `, (error: Error | null, result: unknown) => {
    if (error) reject(new Error('Could not read selected text. Enable Accessibility for Summon (Electron in development), or paste text in the preview.'))
    else resolve(typeof result === 'string' ? result : '')
  })
})
