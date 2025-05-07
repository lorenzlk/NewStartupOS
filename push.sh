#!/bin/bash
# Auto-commit all changes before pushing to Google Apps Script

git add .
git commit -m "Auto-commit before clasp push on $(date '+%Y-%m-%d %H:%M:%S')" || echo "Nothing to commit"
clasp push
git push
