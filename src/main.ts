#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { scan } from './scan';
import { stats } from './stats';

yargs(hideBin(process.argv))
  .command(
    'add <folder>',
    'add a new folder to scan for Git repositories',
    (yargs) => {
      return yargs.positional('folder', {
        describe: 'The folder to scan',
        type: 'string',
      });
    },
    (argv) => {
      if (argv.folder) {
        scan(argv.folder);
      }
    }
  )
  .command(
    'stats <email>',
    'generates a nice graph of your Git contributions',
    (yargs) => {
      return yargs.positional('email', {
        describe: 'the email to scan',
        type: 'string',
      });
    },
    (argv) => {
      if (argv.email) {
        stats(argv.email);
      }
    }
  )
  .demandCommand(1)
  .parse();
