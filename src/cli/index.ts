#!/usr/bin/env node

import {
  initCommand,
  startCommand,
  stopCommand,
  statusCommand,
  chatCommand,
  taskCommand,
  agentsCommand,
  agentStatusCommand,
  sessionListCommand,
  sessionNewCommand,
  sessionResumeCommand,
  configShowCommand,
  configSetCommand,
  pluginsListCommand,
  pluginsInstallCommand,
  exportCommand,
  importCommand,
  versionCommand,
  helpCommand,
} from './commands';
import { printError } from './utils';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const arg1 = args[2];
const arg2 = args[3];

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'init':
        await initCommand();
        break;

      case 'start':
        await startCommand();
        break;

      case 'stop':
        await stopCommand();
        break;

      case 'status':
        await statusCommand();
        break;

      case 'chat':
        await chatCommand();
        break;

      case 'task':
        await taskCommand(arg1 ?? args.slice(1).join(' '));
        break;

      case 'agents':
        await agentsCommand();
        break;

      case 'agent':
        if (subcommand === 'status') {
          await agentStatusCommand(arg1 ?? '');
        } else {
          printError(`Unknown agent subcommand: ${subcommand}`);
          helpCommand();
        }
        break;

      case 'session':
        switch (subcommand) {
          case 'list':
            await sessionListCommand();
            break;
          case 'new':
            await sessionNewCommand();
            break;
          case 'resume':
            await sessionResumeCommand(arg1 ?? '');
            break;
          default:
            printError(`Unknown session subcommand: ${subcommand}`);
            helpCommand();
        }
        break;

      case 'config':
        switch (subcommand) {
          case 'show':
            await configShowCommand();
            break;
          case 'set':
            await configSetCommand(arg1 ?? '', arg2 ?? '');
            break;
          default:
            printError(`Unknown config subcommand: ${subcommand}`);
            helpCommand();
        }
        break;

      case 'plugins':
        switch (subcommand) {
          case 'list':
            await pluginsListCommand();
            break;
          case 'install':
            await pluginsInstallCommand(arg1 ?? '');
            break;
          default:
            printError(`Unknown plugins subcommand: ${subcommand}`);
            helpCommand();
        }
        break;

      case 'export':
        await exportCommand(subcommand ?? '');
        break;

      case 'import':
        await importCommand(subcommand ?? '');
        break;

      case 'version':
        versionCommand();
        break;

      case 'help':
      case undefined:
        helpCommand();
        break;

      default:
        printError(`Unknown command: ${command}`);
        helpCommand();
        process.exit(1);
    }
  } catch (err) {
    printError(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
