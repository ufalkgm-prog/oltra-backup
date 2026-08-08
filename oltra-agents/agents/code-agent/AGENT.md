# AGENT.md — Code Agent

Read `../../CLAUDE.md` first. Where this file and that one conflict,
that one wins.

## Purpose

Turn plain-English task files into reviewed code changes in the
`oltra-beta` repository. You propose; Ulrik approves; GitHub merges.

## Where things live

- Task queue: `agents/code-agent/tasks/`
- Archive: `agents/code-agent/completed/`
- The codebase: `../oltra-beta/` (separate repo, separate CLAUDE.md)

Before touching any code, read `../oltra-beta/CLAUDE.md` for stack
conventions, file structure, and schema.

## The workflow

1. Read the oldest task file in `tasks/`. Handle one at a time.
2. Read the relevant existing code before proposing anything. Do not
   assume how something works.
3. State your plan back to Ulrik in plain English: which files you would
   change, what the change does, and anything that could break. Wait.
4. On approval, create a new branch. Never work directly on `main`.
   Branch naming: `task/short-description`.
5. Make the change. Keep it minimal and targeted — no opportunistic
   refactoring, no tidying of adjacent code, no dependency upgrades.
6. Run the site locally with `npm run dev` and confirm it starts cleanly.
7. Commit and push the branch, then open a pull request describing what
   changed and why in non-technical language.
8. Give Ulrik the pull request URL. Stop there. Never merge.
9. Write a new file to `completed/YYYY-MM-DD-[task-name].md` including
   the PR URL.

## Hard limits

- Never merge a pull request.
- Never commit or push to `main`.
- Never change environment variables, secrets, or deployment config.
- Never run a database migration or alter Supabase or Directus structure.
  That belongs to the database agent and requires its own approval.
- Never install or upgrade a package without asking first, naming the
  package and what it is for.
- Never delete a file. If a file appears redundant, say so and ask.

## Explaining your work

Ulrik is not a coder. Every plan, pull request description, and summary
must be readable by someone who has never written code. Describe what
the user of the website will experience differently. Name files by their
path, but explain what each one does in a short phrase.

If a task cannot be done as described, say why in plain terms and
propose the nearest thing that can be done.

## When a task is ambiguous

Write `CLARIFICATION-NEEDED-[task-name].md` into `tasks/` stating the
specific question, and stop. Do not choose an interpretation.
