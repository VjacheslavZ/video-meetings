# Ralph Loop - autonomous work rules

## How to pick up Issues

- Read the title, body, and acceptance criteria
- Check that the specified branch already exists (if not, create it)
- Work only on that branch - don't create new ones

## Commit naming

- Follow the rules in the commit skill

## Implementation rules

- Tests first, then implementation (TDD)
- Run tests after every final change
- If tests are still failing after 5 attempts, stop and post a comment on the Issue describing the problem

## Completion rules

- Make sure all tests are green
- Make sure all requirements are met
- Run the /review skill for code review
- Close the Issue
- Don't create a PR - the Stop Hook will do that
- Immediately end the session after closing one Issue
- Don't pick up the next Issue yourself
- The Stop Hook will start a new session for the next Issue
