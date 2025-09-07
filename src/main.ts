#!/usr/bin/env node
import yargs, { Argv } from 'yargs'
import { hideBin } from 'yargs/helpers'
import { scan } from './scan'
import { stats } from './stats'

interface AddCommandArgs {
  folder: string
}

interface StatsCommandArgs {
  email: string
}

const handleAddCommand = (argv: AddCommandArgs): void => {
  if (argv.folder) {
    scan(argv.folder)
  } else {
    console.error('❌ Folder path is required')
    process.exit(1)
  }
}

const handleStatsCommand = async (argv: StatsCommandArgs): Promise<void> => {
  if (argv.email) {
    await stats(argv.email)
  } else {
    console.error('❌ Email address is required')
    process.exit(1)
  }
}

const setupCLI = () => {
  return yargs(hideBin(process.argv))
    .scriptName('gitv')
    .usage('Usage: $0 <command> [options]')
    .example('$0 add ~/projects', 'Scan ~/projects folder for Git repositories')
    .example(
      '$0 stats john@example.com',
      'Show contribution graph for john@example.com'
    )
    .command(
      'add <folder>',
      'Add a new folder to scan for Git repositories',
      (yargs: Argv) => {
        return yargs.positional('folder', {
          describe: 'The folder path to scan for repositories',
          type: 'string',
          demandOption: true,
        })
      },
      handleAddCommand
    )
    .command(
      'stats <email>',
      'Generate a contribution graph for the specified email',
      (yargs: Argv) => {
        return yargs.positional('email', {
          describe: 'The email address to analyze commits for',
          type: 'string',
          demandOption: true,
        })
      },
      handleStatsCommand
    )
    .demandCommand(1, 'You must specify a command')
    .help('h')
    .alias('h', 'help')
    .version()
    .strict()
}

const main = async (): Promise<void> => {
  try {
    await setupCLI().parse()
  } catch (error) {
    console.error('❌ An error occurred:', error)
    process.exit(1)
  }
}

// Run the CLI
main()
