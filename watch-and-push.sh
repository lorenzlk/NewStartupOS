#!/bin/bash
# Watch all files in the current directory and trigger push.sh on any change
fswatch -o . | xargs -n1 ./push.sh
