
import { App } from 'electron'
import { RunCommandParams } from 'types/automation'
import { Configuration } from 'types/config'
import LlmFactory, { ILlmManager } from '@renderer/services/llms/llm'
import { loadSettings } from '../config'
import { useI18nLlm } from '../i18n'
import { getCachedText, putCachedText } from '../utils'
import * as window from '../window'
import Automation from './automation'
import Automator from './automator'

export const askMeAnythingId = '00000000-0000-0000-0000-000000000000'

export const notEditablePrompts = [
  askMeAnythingId
]

export default class Commander {

  static initCommand = async (app: App, timeout?: number): Promise<void> => {

    // start time
    const startTime = Date.now();

    const automator = new Automator();
    const text = await Automation.grabSelectedText(automator, timeout);

    // A notification alone can be invisible when notifications are disabled.
    // Keep the command workflow available with explicit manual input instead.
    if (!text?.trim()) {
      window.openCommandPicker({ needsInput: true, captureFailed: text == null, startTime });
      return;
    }

    // go on with a cached text id
    const textId = putCachedText(text);
    const sourceApp = await automator.getForemostApp();
    window.openCommandPicker({ textId, sourceApp, startTime });

  }

  execCommand = async (app: App, params: RunCommandParams): Promise<boolean> => {

    // deconstruct
    const { textId, sourceApp, command } = params;
    
    // get text
    const text = params.text ?? getCachedText(textId);

    try {

      // check
      if (!text?.trim()) {
        console.error('No text to process');
        return false;
      }

      // config
      const config: Configuration = loadSettings(app);
      const llmManager: ILlmManager = LlmFactory.manager(config);

      // extract what we need
      let engine = command.engine || config.commands.engine;
      let model = command.model || config.commands.model;
      if (!engine?.length || !model?.length) {
        ({ engine, model } = llmManager.getChatEngineModel(false));
      }

      // template may be localized
      let template = command.template
      if (!template) {
        const t = useI18nLlm(app);
        template = t(`commands.commands.${command.id}.template`)
      }

      // build prompt
      const prompt = template.replace('{input}', text);

      // build the params
      const promptParams = {
        promptId: putCachedText(prompt),
        sourceApp: params.text !== undefined ? null : sourceApp,
        engine: engine || command.engine,
        model: model || command.model,
        execute: command.id != askMeAnythingId,
        action: params.text !== undefined ? 'default' : (params.action || 'default'),
        replace: params.text === undefined,
      };
      
      // and open the window
      window.openPromptAnywhere(promptParams);
      return true;

    } catch (error) {
      console.error('Error while executing command', error);
    }

    // done
    return false;

  }

}
