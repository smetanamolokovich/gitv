# gitv

`gitv` is a command-line tool that visualizes your local Git contributions in a graph similar to the one on GitHub. It scans your local repositories, analyzes your commit history, and generates a color-coded grid representing your coding activity over the last six months.

## Features

*   Scan local directories for Git repositories.
*   Generate a contribution graph based on your commit email.
*   Customizable color scheme for the graph.
*   Run as a global command `gitv`.

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd git-visual
    ```
2.  Install dependencies:
    ```bash
    yarn install
    ```
3.  Build the project:
    ```bash
    yarn build
    ```
4.  Link the package to make the `gitv` command available globally:
    ```bash
    yarn link
    ```

## Usage

1.  **Add a folder to scan for Git repositories:**
    ```bash
    gitv add /path/to/your/projects
    ```
    Replace `/path/to/your/projects` with the path to your code.

2.  **Generate the contribution graph:**
    ```bash
    gitv stats your-email@example.com
    ```
    Replace `your-email@example.com` with the email address you use for your Git commits.


