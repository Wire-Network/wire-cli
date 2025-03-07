#!/usr/bin/env bash

# Function to display script usage
usage() {
  echo "========================================"
  echo "🚀 Blockproducer Node Start Script"
  echo "========================================"
  echo "Usage: $0 [options]"
  echo "Options:"
  echo "  -r, --replay-blockchain       Replay the blockchain from the blocks.log file"
  echo "  -hr, --hard-replay-blockchain Hard replay of the blockchain (handles potential corruption)"
  echo "  -s, --snapshot <path>         Start from a snapshot (provide snapshot file path)"
  echo "  --help                        Show this help message"
  echo "========================================"
}

SIGNING_PUB_KEY="<SIGNING_PUB_KEY>"
SIGNING_PRIV_KEY="<SIGNING_PRIV_KEY>"

BP_CONFIG_DIR="/opt/wire-network/blockproducer/config"
BP_DATA_DIR="/opt/wire-network/blockproducer/data"
REPLAY_OPTION=""
SNAPSHOT_OPTION=""


while [[ "$#" -gt 0 ]]; do
  case $1 in
    -r|--replay-blockchain)
      REPLAY_OPTION="--replay-blockchain"
      shift
      ;;
    -hr|--hard-replay-blockchain)
      REPLAY_OPTION="--hard-replay-blockchain"
      shift
      ;;
    -s|--snapshot)
      if [[ -z "$2" || "$2" == -* ]]; then
        echo "❌ Error: Missing snapshot path after $1"
        echo "Usage: $0 -s <path-to-snapshot>"
        exit 1
      fi
      SNAPSHOT_OPTION="--snapshot $2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "❌ Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

# Validation: Replay and snapshot options cannot be used together
if [[ -n "$REPLAY_OPTION" && -n "$SNAPSHOT_OPTION" ]]; then
  echo "❌ Error: Replay and snapshot options cannot be used together."
  exit 1
fi


echo "========================================"
echo "🚀 Starting Blockproducer Node..."
echo "========================================"

ulimit -c unlimited
ulimit -n 65535
ulimit -s 64000
echo "🔧 Resource limits set:"
echo "   - Core dump size: unlimited"
echo "   - Max open files: 65535"
echo "   - Stack size: 64000"
echo ""

if [[ ! -d "$BP_DATA_DIR" ]]; then
  echo "📂 Creating data directory: $BP_DATA_DIR"
  mkdir -p "$BP_DATA_DIR"
fi

if [[ -n "$SNAPSHOT_OPTION" ]]; then
  echo "📸 Snapshot detected. Verifying data directory for cleanup..."
  pre_snapshot_files=("state")
  temp_dir="$BP_DATA_DIR/tmp_$(date +%s)"
  mkdir -p "$temp_dir"
  for file in "${pre_snapshot_files[@]}"; do
    if [[ -e "$BP_DATA_DIR/$file" ]]; then
      echo "⚠️  Found files that should be cleaned up: $BP_DATA_DIR/$file"
      mv "$BP_DATA_DIR/$file" "$temp_dir/"
      echo "   Moved to temp directory: $temp_dir/"
    fi
  done
  echo "✅ Data directory cleanup complete."
fi

start_nodeop="nodeop \
  --config-dir $BP_CONFIG_DIR \
  --contracts-console \
  --data-dir $BP_DATA_DIR \
  --s-chain-contract settle.wns \
  --s-chain-actions batchw \
  --plugin sysio::sub_chain_plugin \
  --signature-provider $SIGNING_PUB_KEY=KEY:$SIGNING_PRIV_KEY"

if [[ -n "$REPLAY_OPTION" ]]; then
  echo "🟡 Replay option enabled: $REPLAY_OPTION"
  start_nodeop+=" $REPLAY_OPTION"
  [[ "$REPLAY_OPTION" != "--hard-replay-blockchain" ]] && start_nodeop+=" --disable-replay-opts"
elif [[ -n "$SNAPSHOT_OPTION" ]]; then
  echo "🟡 Starting from snapshot: $SNAPSHOT_OPTION"
  start_nodeop+=" --disable-replay-opts $SNAPSHOT_OPTION"
else
  echo "🟢 No special options detected. Using default configuration."
  start_nodeop+=" --disable-replay-opts"
fi

echo ""
echo "Executing the following command:"
echo "----------------------------------------"
echo "$start_nodeop"
echo "----------------------------------------"
echo ""

$start_nodeop 2> "$BP_DATA_DIR/nodeop.log" &
NODE_PID=$!
echo "✅ Node started successfully. PID: $NODE_PID"

echo "$NODE_PID" > "$BP_CONFIG_DIR/nodeop.pid"
echo "💾 PID saved to: $BP_CONFIG_DIR/nodeop.pid"

echo ""
echo "========================================"
echo "✨ Block producer node is running!"
echo "========================================"