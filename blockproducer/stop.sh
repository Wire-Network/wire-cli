#!/bin/bash

BP_CONFIG_DIR=/opt/wire-network/blockproducer/config;
BP_DATA_DIR=/opt/wire-network/blockproducer/data

if [ -f "$BP_CONFIG_DIR/nodeop.pid" ]; then
    pid=$(cat "$BP_CONFIG_DIR/nodeop.pid")
    echo "$pid"
    kill "$pid"

    echo -ne "Stopping Nodeop"
    while true; do
        [ ! -d "/proc/$pid/fd" ] && break
        echo -ne "."
        sleep 1
    done

    rm -f "$BP_CONFIG_DIR/nodeop.pid"

    # Create a timestamp
    DATE=$(date -d "now" +'%Y_%m_%d-%H_%M')

    if [ ! -d "$BP_DATA_DIR/logs" ]; then
        mkdir -p "$BP_DATA_DIR/logs"
    fi

    # If nodeop.log exists, archive it
    if [ -f "$BP_DATA_DIR/nodeop.log" ]; then
        tar -pcvzf "$BP_DATA_DIR/logs/nodeop-$DATE.txt.tar.gz" -C "$BP_DATA_DIR" nodeop.log
    fi

    echo -ne "\rNodeop Stopped.\n"
fi