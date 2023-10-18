## Installing mongo locally
```shell
brew install mongodb-atlas-cli
brew install mongosh
brew install mongodb-compass
brew install podman
```

Add the following to your .env file:
```shell
cat >>.env<<EOL

MONGO_CONNECTION_STR=mongodb://localhost:27017/?directConnection=true
MONGO_DATABASE=august-sf1
EOL
```

and to start the mongo service
```shell
atlas deployments setup
```

choose local installation with custom configuration. Change to use the 6.0 release.

to delete a local installation use
```shell
atlas deployments delete
```