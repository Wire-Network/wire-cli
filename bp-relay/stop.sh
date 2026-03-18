#!/bin/bash

BP_RELAY_CONFIG_DIR=/opt/wire-network/bp-relay/config
BP_RELAY_DATA_DIR=/opt/wire-network/bp-relay/data

if [ -f "$BP_RELAY_CONFIG_DIR/nodeop.pid" ]; then
    pid=$(cat "$BP_RELAY_CONFIG_DIR/nodeop.pid")
    echo "$pid"
    kill "$pid"

    echo -ne "Stopping Nodeop"
    while true; do
        # Check if the /proc/$pid/fd directory is gone, which means the process is no longer running
        [ ! -d "/proc/$pid/fd" ] && break
        echo -ne "."
        sleep 1
    done
    
    rm -f "$BP_RELAY_CONFIG_DIR/nodeop.pid"

    # Create a timestamp for archiving
    DATE=$(date -d "now" +'%Y_%m_%d-%H_%M')

    # Ensure the logs directory exists
    if [ ! -d "$BP_RELAY_DATA_DIR/logs" ]; then
        mkdir -p "$BP_RELAY_DATA_DIR/logs"
    fi

    # If nodeop.log exists, archive it
    if [ -f "$BP_RELAY_DATA_DIR/nodeop.log" ]; then
        # Compress and store the old log in logs directory
        tar -pcvzf "$BP_RELAY_DATA_DIR/logs/nodeop-$DATE.txt.tar.gz" -C "$BP_RELAY_DATA_DIR" nodeop.log
    fi

    echo -ne "\rNodeop Stopped.\n"
fi