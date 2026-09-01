#!/usr/bin/env sh

# TODO: todos in this script
#       + remove dependencies commonmark, gray-matter, smol-toml
#         (they should be dependencies of flowr, not the eval;
#          they are required due to flowr main todo from below)

# get flowr repo if it's not here already
# (if this fails, assume flowr repo is already cloned)
git clone https://github.com/flowr-analysis/flowr
set -e
mkdir -p vendor

cd flowr
git pull

# build flowr - TODO: REMOVE once branch is up-to-date
# this uses branch `main`, which provides `dist/src/index.js`
# (possibly among other files missing from the feature branch).
# this means we package a mix of `main` and the (outdated)
# feature branch. this somehow works but it's just so wrong :(
git switch main
npm i
npm run build:dev

# TODO: switch to my actual branch, don't copy script
COPY1="$(cat ./scripts/stage-library.ts)"
git switch 174-add-type-inference
echo "$COPY1" > ./scripts/stage-library.ts

# build and package flowr
npm i
npm run build-dev # in main: build:dev
ts-node --transpile-only scripts/stage-library.ts
npm pack ./dist/src --pack-destination ../vendor/

# install this package as a local dependency
# (installs newest file in vendor/)
cd ..
npm i ./vendor/"$(ls -t vendor | head -n 1)"
npm i

echo "setup complete => npm run main [...]"
