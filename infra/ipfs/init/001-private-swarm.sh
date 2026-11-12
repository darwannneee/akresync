#!/bin/sh
# Dijalankan entrypoint Kubo setelah `ipfs init`, sebelum daemon: jadikan node ini swarm privat tanpa peer publik.
set -e
cp /swarm.key /data/ipfs/swarm.key
chmod 600 /data/ipfs/swarm.key
ipfs bootstrap rm --all
ipfs config Addresses.API /ip4/0.0.0.0/tcp/5001
ipfs config Addresses.Gateway /ip4/0.0.0.0/tcp/8080
ipfs config --json Discovery.MDNS.Enabled false
ipfs config --json Swarm.RelayClient.Enabled false
ipfs config --json Swarm.RelayService.Enabled false
ipfs config Routing.Type none
ipfs config --json Swarm.ConnMgr '{"Type":"basic","LowWater":20,"HighWater":40}'
