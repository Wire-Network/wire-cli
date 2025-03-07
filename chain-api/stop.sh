#!/bin/bash

CHAIN_CONFIG_DIR=/opt/wire-network/chain-api/config
CHAIN_DATA_DIR=/opt/wire-network/chain-api/data

if [ -f "$CHAIN_CONFIG_DIR/nodeop.pid" ]; then
    pid=$(cat "$CHAIN_CONFIG_DIR/nodeop.pid")
    echo "$pid"
    kill "$pid"

    echo -ne "Stopping Nodeop"
    while true; do
        # Check if the /proc/$pid/fd directory is gone, which means the process is no longer running
        [ ! -d "/proc/$pid/fd" ] && break
        echo -ne "."
        sleep 1
    done
    
    rm -f "$CHAIN_CONFIG_DIR/nodeop.pid"

    # Create a timestamp for archiving
    DATE=$(date -d "now" +'%Y_%m_%d-%H_%M')

    # Ensure the logs directory exists
    if [ ! -d "$CHAIN_DATA_DIR/logs" ]; then
        mkdir -p "$CHAIN_DATA_DIR/logs"
    fi

    # If nodeop.log exists, archive it
    if [ -f "$CHAIN_DATA_DIR/nodeop.log" ]; then
        # Compress and store the old log in logs directory
        tar -pcvzf "$CHAIN_DATA_DIR/logs/nodeop-$DATE.txt.tar.gz" -C "$CHAIN_DATA_DIR" nodeop.log
    fi

    echo -ne "\rNodeop Stopped.\n"
fi