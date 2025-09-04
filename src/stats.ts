import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit, { DefaultLogFields, ListLogLine } from 'simple-git';
import chalk from 'chalk';

const DOTFILE = '.gogitlocalstats';
const DAYS_IN_LAST_SIX_MONTHS = 183;
const WEEKS_IN_LAST_SIX_MONTHS = 26;
const OUT_OF_RANGE = 99999;

type Column = number[];

function getDotFilePath(): string {
  return path.join(os.homedir(), DOTFILE);
}

function parseFileLinesToSlice(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').filter(line => line.length > 0);
}

function getBeginningOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function countDaysSinceDate(date: Date): number {
  const now = getBeginningOfDay(new Date());
  const commitDate = getBeginningOfDay(date);
  const diffTime = now.getTime() - commitDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > DAYS_IN_LAST_SIX_MONTHS ? OUT_OF_RANGE : diffDays;
}

function calcOffset(): number {
  const weekday = new Date().getDay();
  return 7 - weekday;
}

async function fillCommits(email: string, repoPath: string, commits: Map<number, number>): Promise<Map<number, number>> {
  const git = simpleGit(repoPath);
  try {
    const log = await git.log();
    const offset = calcOffset();
    log.all.forEach((c: DefaultLogFields | ListLogLine) => {
      const commit = c as DefaultLogFields;
      if (commit.author_email === email) {
        const daysAgo = countDaysSinceDate(new Date(commit.date));
        if (daysAgo !== OUT_OF_RANGE) {
          const day = daysAgo + offset;
          commits.set(day, (commits.get(day) || 0) + 1);
        }
      }
    });
  } catch (err) {
    // ignore errors
  }
  return commits;
}

async function processRepositories(email: string): Promise<Map<number, number>> {
  const filePath = getDotFilePath();
  const repos = parseFileLinesToSlice(filePath);
  const commits = new Map<number, number>();
  for (let i = DAYS_IN_LAST_SIX_MONTHS; i > 0; i--) {
    commits.set(i, 0);
  }

  for (const repoPath of repos) {
    await fillCommits(email, repoPath, commits);
  }

  return commits;
}

function sortMapIntoSlice(m: Map<number, number>): number[] {
  return Array.from(m.keys()).sort((a, b) => a - b);
}

function buildCols(keys: number[], commits: Map<number, number>): Map<number, Column> {
  const cols = new Map<number, Column>();
  let col: Column = [];

  for (const k of keys) {
    const week = Math.floor(k / 7);
    const dayinweek = k % 7;

    if (dayinweek === 0) {
      col = [];
    }

    col.push(commits.get(k) || 0);

    if (dayinweek === 6) {
      cols.set(week, col);
    }
  }
  return cols;
}

function printMonths() {
  let week = new Date();
  week.setDate(week.getDate() - DAYS_IN_LAST_SIX_MONTHS);
  let month = week.getMonth();
  let output = '         ';
  while (week < new Date()) {
    if (week.getMonth() !== month) {
      output += `${week.toLocaleString('default', { month: 'short' })} `;
      month = week.getMonth();
    } else {
      output += '    ';
    }
    week.setDate(week.getDate() + 7);
  }
  console.log(output);
}

function printDayCol(day: number) {
  let out = '     ';
  switch (day) {
    case 1:
      out = ' Mon ';
      break;
    case 3:
      out = ' Wed ';
      break;
    case 5:
      out = ' Fri ';
      break;
  }
  process.stdout.write(out);
}

function printCell(val: number, today: boolean) {
  let escape = chalk.bgBlack.white;
  if (val > 0 && val < 5) {
    escape = chalk.bgWhite.black;
  } else if (val >= 5 && val < 10) {
    escape = chalk.bgYellow.black;
  } else if (val >= 10) {
    escape = chalk.bgGreen.black;
  }

  if (today) {
    escape = chalk.bgMagenta.white;
  }

  let str = val === 0 ? '  - ' : ` ${val} `;
  if (val >= 10) str = ` ${val} `;
  if (val >= 100) str = `${val} `;

  process.stdout.write(escape(str));
}

function printCells(cols: Map<number, Column>) {
  printMonths();
  for (let j = 6; j >= 0; j--) {
    for (let i = WEEKS_IN_LAST_SIX_MONTHS + 1; i >= 0; i--) {
      if (i === WEEKS_IN_LAST_SIX_MONTHS + 1) {
        printDayCol(j);
      }
      const col = cols.get(i);
      if (col) {
        if (i === 0 && j === calcOffset() - 1) {
          printCell(col[j], true);
          continue;
        } else {
          if (col.length > j) {
            printCell(col[j], false);
            continue;
          }
        }
      }
      printCell(0, false);
    }
    process.stdout.write('\n');
  }
}

function printCommitsStats(commits: Map<number, number>) {
  const keys = sortMapIntoSlice(commits);
  const cols = buildCols(keys, commits);
  printCells(cols);
}

export async function stats(email: string): Promise<void> {
  const commits = await processRepositories(email);
  printCommitsStats(commits);
}
