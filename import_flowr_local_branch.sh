#!/usr/bin/env sh

# get flowr repo if it's not here already
# (if this fails, assume flowr repo is already cloned)
git clone https://github.com/flowr-analysis/flowr
set -e
mkdir -p vendor

cd flowr
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
