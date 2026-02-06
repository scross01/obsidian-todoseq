#!/bin/bash

# Script to copy built plugin files to Obsidian plugin directory

# Get the absolute path of the workspace
WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$HOME/Development/todoseq/.obsidian/plugins/todoseq"

# Create plugin directory if it doesn't exist
mkdir -p "$PLUGIN_DIR"

# Copy necessary files
echo "Copying plugin files to Obsidian plugin directory..."
cp "$WORKSPACE_DIR/main.js" "$PLUGIN_DIR/"
# cp "$WORKSPACE_DIR/main.js.map" "$PLUGIN_DIR/"
cp "$WORKSPACE_DIR/styles.css" "$PLUGIN_DIR/"
cp "$WORKSPACE_DIR/manifest.json" "$PLUGIN_DIR/"

echo "✅ Plugin files copied to: $PLUGIN_DIR"
echo "🔄 Reload the TODOseq plugin in Obsidian to apply changes"