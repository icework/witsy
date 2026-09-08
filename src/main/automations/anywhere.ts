
import { Application } from 'types/automation';
import * as window from '../window'

export default class PromptAnywhere {

  static open = async (): Promise<void> => {

    window.openMainWindow({ queryParams: { view: 'chat' } });
  }

  static close = async (sourceApp?: Application): Promise<void> => {
    await window.closePromptAnywhere(sourceApp);
  }
  
}
