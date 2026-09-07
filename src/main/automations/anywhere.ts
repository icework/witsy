
import { Application } from 'types/automation';
import { openQuickChat } from '../screenshot_action'
import * as window from '../window'

export default class PromptAnywhere {

  static open = async (): Promise<void> => {

    // Ordinary Quick Chat shares the main chat host. AI Commands still open
    // Prompt Anywhere directly for their copy/insert/replace output flow.
    openQuickChat();
  }

  static close = async (sourceApp?: Application): Promise<void> => {
    await window.closePromptAnywhere(sourceApp);
  }
  
}
