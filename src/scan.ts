import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DOTFILE = '.gogitlocalstats';

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

function sliceContains(slice: string[], value: string): boolean {
  return slice.includes(value);
}

function joinSlices(newItems: string[], existingItems: string[]): string[] {
  const newSet = new Set(newItems);
  for (const item of existingItems) {
    newSet.add(item);
  }
  return Array.from(newSet);
}

function dumpStringsSliceToFile(repos: string[], filePath: string): void {
  const content = repos.join('\n');
  fs.writeFileSync(filePath, content, 'utf-8');
}

function addNewSliceElementsToFile(filePath: string, newRepos: string[]): void {
  const existingRepos = parseFileLinesToSlice(filePath);
  const repos = joinSlices(newRepos, existingRepos);
  dumpStringsSliceToFile(repos, filePath);
}

function scanGitFolders(folder: string): string[] {
    let results: string[] = [];
    const items = fs.readdirSync(folder);

    for (const item of items) {
        const itemPath = path.join(folder, item);
        if (item === '.git') {
            results.push(folder);
            return results; // Stop searching deeper in this path
        }
        // Ignore node_modules and vendor folders
        if (item === 'node_modules' || item === 'vendor') {
            continue;
        }
        try {
            const stat = fs.statSync(itemPath);
            if (stat.isDirectory()) {
                results = results.concat(scanGitFolders(itemPath));
            }
        } catch (err) {
            // Ignore errors from statSync (e.g. permission denied)
        }
    }
    return results;
}


export function scan(folder: string): void {
  console.log('Found folders:\n');
  const repositories = scanGitFolders(folder);
  repositories.forEach(repo => console.log(repo));
  const filePath = getDotFilePath();
  addNewSliceElementsToFile(filePath, repositories);
  console.log('\n\nSuccessfully added\n\n');
}
