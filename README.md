Getting started is easy!
------------------------

To start using this template simply replace the variables in the provided [pipeline.yml](./.buildkite/pipeline.yml).  In particular ensure you replace `REPO_NAME` with the name of your new repo.

Once done run `docker build -t redbubble/REPO_NAME:0 .` and `docker push redbubble/REPO_NAME:0` to push to docker hub and create your docker hub repo.

Check https://github.com/redbubble/dev-env/blob/master/README.md for anything else you may want to add (e.g. a `dev` directory or `Makefile`).
