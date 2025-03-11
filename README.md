
# wire-cli


## Overview 

`wire-cli` is a TypeScript-based command-line tool for spinning up a local node. It automates tasks such as installing Wire Sysio core and CDT, deploying system contracts, and starting blockproducer and chain-api nodes.

## Requirements
- Only Linux supported at the moment (Ubuntu v20/v24 recommended). Not compatible with macOS or Windows at this time.
- Root privileges (run via sudo).
- Node.js 18+ to run the CLI.

## Installation

```sh
npm i -g @wireio/wire-cli
```

## Development

1. Clone this repo

```sh 
git clone https://github.com/Wire-Network/wire-cli.git
```

2. Build the project:

```sh 
npm run build
```

3. Link the executable 

```sh 
npm link
```
	
> [!NOTE]: By default, `sudo` resets environment variables, causing `wire-cli` and Node.js binaries to be unavailable. In order to run the script as root you need to use  
> `visudo` to preserve environment variables (`PATH`, `NVM_DIR`, `NODE_PATH`) so that sudo can access `wire-cli` and the correct Node.js version.

Get NODE_PATH:

```sh 
which node 
```

Run: 

```sh 
sudo visudo
```

Add value of `NODE_PATH` to `secure_path`, hit Save and Exit.

Example: 

```
Defaults        secure_path = /usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/<your-user>/.nvm/versions/node/<node-version>/bin
```


### Usage

Once linked, you can run `wire-cli` from your terminal.

```sh 
sudo wire-cli install --g --enable-roa
```

[LICENSE](./LICENSE.md)