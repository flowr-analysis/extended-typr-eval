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
git switch 174-add-type-inference
git pull

npm i
npm run build:dev
npm run pack-library
mv eagleoutice-flowr-*.tgz ../vendor/

# install this package as a local dependency
# (installs newest file in vendor/)
cd ..
npm i ./vendor/"$(ls -t vendor | head -n 1)"
npm i

echo "setup complete => npm run main [...]"
