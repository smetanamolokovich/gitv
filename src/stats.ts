import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit, { DefaultLogFields, ListLogLine } from 'simple-git';
import chalk from 'chalk';
import ora from 'ora';

// ===== CONSTANTS =====
const CONFIG = {
  DOTFILE: '.gogitlocalstats',
  DAYS_IN_LAST_SIX_MONTHS: 183,
  WEEKS_IN_LAST_SIX_MONTHS: 26,
  OUT_OF_RANGE: 99999,
  DAYS_PER_WEEK: 7,
} as const;

const COLORS = {
  NO_CONTRIBUTIONS: '#161b22',
  LIGHT_GREEN: '#0e4429',
  MEDIUM_GREEN: '#006d32',
  DARK_GREEN: '#26a641',
  BRIGHT_GREEN: '#39d353',
  TODAY_HIGHLIGHT: 'blue',
} as const;

const CONTRIBUTION_LEVELS = {
  NONE: 0,
  LOW: 3,
  MEDIUM: 6,
  HIGH: 9,
} as const;

// ===== TYPES AND INTERFACES =====
type Column = number[];
type CommitMap = Map<number, number>;
type ColumnMap = Map<number, Column>;

interface IDateCalculator {
  getBeginningOfDay(date: Date): Date;
  countDaysSinceDate(date: Date): number;
  calcWeekOffset(): number;
}

interface IFileRepository {
  getDotFilePath(): string;
  parseFileLinesToSlice(filePath: string): string[];
}

interface IContributionProcessor {
  processAllRepositories(email: string): Promise<CommitMap>;
}

interface IGridBuilder {
  sortCommitKeys(commits: CommitMap): number[];
  buildColumns(keys: number[], commits: CommitMap): ColumnMap;
}

interface IRenderer {
  renderContributionGraph(commits: CommitMap): void;
}

// ===== IMPLEMENTATIONS =====
class DateCalculator implements IDateCalculator {
  getBeginningOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  countDaysSinceDate(date: Date): number {
    const now = this.getBeginningOfDay(new Date());
    const commitDate = this.getBeginningOfDay(date);
    const diffTime = now.getTime() - commitDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > CONFIG.DAYS_IN_LAST_SIX_MONTHS ? CONFIG.OUT_OF_RANGE : diffDays;
  }

  calcWeekOffset(): number {
    const weekday = new Date().getDay();
    return CONFIG.DAYS_PER_WEEK - weekday;
  }
}

class FileRepository implements IFileRepository {
  getDotFilePath(): string {
    return path.join(os.homedir(), CONFIG.DOTFILE);
  }

  parseFileLinesToSlice(filePath: string): string[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(line => line.length > 0);
  }
}

class ContributionProcessor implements IContributionProcessor {
  constructor(
    private dateCalculator: IDateCalculator,
    private fileRepository: IFileRepository
  ) {}

  private async fillCommitsFromRepo(
    email: string, 
    repoPath: string, 
    commits: CommitMap
  ): Promise<void> {
    const git = simpleGit(repoPath);
    try {
      const log = await git.log();
      const offset = this.dateCalculator.calcWeekOffset();
      
      log.all.forEach((c: DefaultLogFields | ListLogLine) => {
        const commit = c as DefaultLogFields;
        if (commit.author_email === email) {
          const daysAgo = this.dateCalculator.countDaysSinceDate(new Date(commit.date));
          if (daysAgo !== CONFIG.OUT_OF_RANGE) {
            const day = daysAgo + offset;
            commits.set(day, (commits.get(day) || 0) + 1);
          }
        }
      });
    } catch (err) {
      // Silently ignore repository errors
    }
  }

  async processAllRepositories(email: string): Promise<CommitMap> {
    const filePath = this.fileRepository.getDotFilePath();
    const repos = this.fileRepository.parseFileLinesToSlice(filePath);
    
    if (repos.length === 0) {
      console.log('No repositories found. Run "gitv add <folder>" first to scan for repositories.');
      return new Map();
    }

    // Initialize commits map
    const commits = new Map<number, number>();
    for (let i = CONFIG.DAYS_IN_LAST_SIX_MONTHS; i > 0; i--) {
      commits.set(i, 0);
    }

    // Process repositories with progress indicator
    const spinner = ora(`Processing ${repos.length} repositories...`).start();
    
    for (let i = 0; i < repos.length; i++) {
      const repoPath = repos[i];
      spinner.text = `Processing repository ${i + 1}/${repos.length}: ${path.basename(repoPath)}`;
      await this.fillCommitsFromRepo(email, repoPath, commits);
    }

    spinner.succeed(`Processed ${repos.length} repositories`);
    return commits;
  }
}

class GridBuilder implements IGridBuilder {
  sortCommitKeys(commits: CommitMap): number[] {
    return Array.from(commits.keys()).sort((a, b) => a - b);
  }

  buildColumns(keys: number[], commits: CommitMap): ColumnMap {
    const cols = new Map<number, Column>();
    let col: Column = [];

    for (const k of keys) {
      const week = Math.floor(k / CONFIG.DAYS_PER_WEEK);
      const dayInWeek = k % CONFIG.DAYS_PER_WEEK;

      if (dayInWeek === 0) {
        col = [];
      }

      col.push(commits.get(k) || 0);

      if (dayInWeek === 6) {
        cols.set(week, col);
      }
    }
    
    return cols;
  }
}

class Renderer implements IRenderer {
  constructor(
    private dateCalculator: IDateCalculator,
    private gridBuilder: IGridBuilder
  ) {}

  private getContributionColor(val: number, isToday: boolean = false) {
    if (isToday) {
      return chalk.bgBlue.white;
    }

    if (val === CONTRIBUTION_LEVELS.NONE) {
      return chalk.bgBlack.white;
    } else if (val <= CONTRIBUTION_LEVELS.LOW) {
      return chalk.bgHex(COLORS.LIGHT_GREEN).white;
    } else if (val <= CONTRIBUTION_LEVELS.MEDIUM) {
      return chalk.bgHex(COLORS.MEDIUM_GREEN).white;
    } else if (val <= CONTRIBUTION_LEVELS.HIGH) {
      return chalk.bgHex(COLORS.DARK_GREEN).black;
    } else {
      return chalk.bgHex(COLORS.BRIGHT_GREEN).black;
    }
  }

  private formatCellValue(val: number): string {
    // Ensure consistent 3-character width
    if (val === 0) {
      return ' - ';
    } else if (val < 10) {
      return ` ${val} `;
    } else if (val < 100) {
      return `${val} `;
    } else {
      return `${val}`;
    }
  }

  private printCell(val: number, isToday: boolean = false): void {
    // Safety check for undefined values
    if (val === undefined || val === null || isNaN(val)) {
      val = 0;
    }

    const colorFunction = this.getContributionColor(val, isToday);
    const formattedValue = this.formatCellValue(val);
    process.stdout.write(colorFunction(formattedValue));
  }

  private printMonthHeaders(): void {
    let week = new Date();
    week.setDate(week.getDate() - CONFIG.DAYS_IN_LAST_SIX_MONTHS);
    let month = week.getMonth();
    let output = '    ';
    
    while (week < new Date()) {
      if (week.getMonth() !== month) {
        output += chalk.gray(`${week.toLocaleString('default', { month: 'short' })} `);
        month = week.getMonth();
      } else {
        output += '   ';
      }
      week.setDate(week.getDate() + CONFIG.DAYS_PER_WEEK);
    }
    
    console.log(output);
  }

  private printDayLabel(day: number): void {
    const dayLabels = ['   ', 'Mon', '   ', 'Wed', '   ', 'Fri', '   '];
    const label = dayLabels[day] || '   ';
    process.stdout.write(chalk.gray(label + ' '));
  }

  private printGrid(cols: ColumnMap): void {
    this.printMonthHeaders();
    
    for (let j = 6; j >= 0; j--) {
      for (let i = CONFIG.WEEKS_IN_LAST_SIX_MONTHS + 1; i >= 0; i--) {
        if (i === CONFIG.WEEKS_IN_LAST_SIX_MONTHS + 1) {
          this.printDayLabel(j);
        }
        
        const col = cols.get(i);
        if (col) {
          if (i === 0 && j === this.dateCalculator.calcWeekOffset() - 1) {
            const cellValue = col[j] !== undefined ? col[j] : 0;
            this.printCell(cellValue, true);
            continue;
          } else {
            if (col.length > j && col[j] !== undefined) {
              this.printCell(col[j], false);
              continue;
            }
          }
        }
        this.printCell(0, false);
      }
      process.stdout.write('\n');
    }
  }

  private printLegend(): void {
    console.log('\n');
    process.stdout.write(chalk.gray('    Less '));
    
    // Print legend with actual colors
    process.stdout.write(chalk.bgBlack.white(' - '));
    process.stdout.write(' ');
    process.stdout.write(chalk.bgHex(COLORS.LIGHT_GREEN).white(' 1 '));
    process.stdout.write(' ');
    process.stdout.write(chalk.bgHex(COLORS.MEDIUM_GREEN).white(' 4 '));
    process.stdout.write(' ');
    process.stdout.write(chalk.bgHex(COLORS.DARK_GREEN).black(' 7 '));
    process.stdout.write(' ');
    process.stdout.write(chalk.bgHex(COLORS.BRIGHT_GREEN).black('10+'));
    
    console.log(chalk.gray(' More'));
  }

  renderContributionGraph(commits: CommitMap): void {
    const spinner = ora('Generating contribution graph...').start();
    
    try {
      const keys = this.gridBuilder.sortCommitKeys(commits);
      const cols = this.gridBuilder.buildColumns(keys, commits);
      
      spinner.succeed('Contribution graph generated');
      console.log('\n📊 Your Git Contribution Graph:\n');
      
      this.printGrid(cols);
      this.printLegend();
      
      // Calculate and display total commits
      const totalCommits = Array.from(commits.values()).reduce((sum, count) => sum + count, 0);
      console.log(`\n📈 Total commits in the last 6 months: ${totalCommits}`);
    } catch (error) {
      spinner.fail('Failed to generate contribution graph');
      console.error(error);
    }
  }
}

// ===== DEPENDENCY INJECTION CONTAINER =====
class StatsService {
  private contributionProcessor: IContributionProcessor;
  private renderer: IRenderer;

  constructor() {
    const dateCalculator = new DateCalculator();
    const fileRepository = new FileRepository();
    const gridBuilder = new GridBuilder();
    
    this.contributionProcessor = new ContributionProcessor(dateCalculator, fileRepository);
    this.renderer = new Renderer(dateCalculator, gridBuilder);
  }

  async generateStats(email: string): Promise<void> {
    console.log(`\n🔍 Analyzing contributions for: ${email}\n`);
    
    const commits = await this.contributionProcessor.processAllRepositories(email);
    
    if (commits.size === 0) {
      return;
    }
    
    this.renderer.renderContributionGraph(commits);
  }
}

// ===== MAIN EXPORT =====
export async function stats(email: string): Promise<void> {
  const statsService = new StatsService();
  await statsService.generateStats(email);
}

// ===== EXPORTS FOR TESTING =====
export {
  DateCalculator,
  FileRepository,
  ContributionProcessor,
  GridBuilder,
  Renderer,
  StatsService,
  IDateCalculator,
  IFileRepository,
  IContributionProcessor,
  IGridBuilder,
  IRenderer,
};
