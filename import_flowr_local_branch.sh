#!/usr/bin/env bash

# typeR0-eval: 9ac04377fa73c734dc30cfb43879f062b086bfc0 (typeR0 with newer `subsumes`)
# typeR0: 04180666450fadc1d2f2510c7cfa6673ee3478a3

if echo "$1" | grep -E '\.tgz$'; then
  echo "Importing pre-vendored .tgz"

  if echo "$1" | grep -E '^/'; then
    npm i "$1"
  else
    npm i "./$1"
  fi
  npm i

  echo "import complete => npm run main [...]"
else
  # get flowr repo if it's not here already
  # (if this fails, assume flowr repo is already cloned)
  git clone https://github.com/flowr-analysis/flowr
  set -e
  mkdir -p vendor

  cd flowr
  git switch 174-add-type-inference
  git pull

  if [ ! -z "$1" ]; then
    echo "-> Creating copy of repository before checking out commit/branch"
    cd ..
    cp -r flowr .flowr_checkout
    cd .flowr_checkout
    git checkout "$1"
  fi

  npm i
  npm run build:dev
  npm run pack-library
  mv eagleoutice-flowr-*.tgz ../vendor/

  # install this package as a local dependency
  # (installs newest file in vendor/)
  cd ..
  vendored="$(ls -t vendor | head -n 1)"
  npm i ./vendor/"$vendored"
  npm i

  echo "imported $vendored"
  echo "setup complete => npm run main [...]"
fi
