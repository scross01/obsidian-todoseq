#!/bin/bash

# Complete debugging workflow for TODOseq plugin

echo "🚀 Starting TODOseq Debug Workflow..."

# Step 1: Build with source maps and copy to Obsidian
echo "📦 Building plugin with source maps..."
npm run build:debug

# Step 2: Start Obsidian with debug port
echo "🔍 Starting Obsidian with remote debugging..."
# Try to find Obsidian app and start with remote debugging
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  OBSIDIAN_PATH="/Applications/Obsidian.app/Contents/MacOS/Obsidian"
  if [[ -f "$OBSIDIAN_PATH" ]]; then
    "$OBSIDIAN_PATH" --remote-debugging-port=9222 &
  else
    echo "❌ Obsidian not found at $OBSIDIAN_PATH"
    echo "Please install Obsidian or update the path in this script"
  fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  OBSIDIAN_PATH=$(which obsidian 2>/dev/null)
  if [[ -n "$OBSIDIAN_PATH" ]]; then
    "$OBSIDIAN_PATH" --remote-debugging-port=9222 &
  else
    echo "❌ Obsidian not found in PATH"
    echo "Please install Obsidian or update the path in this script"
  fi
else
  echo "❌ Unsupported operating system: $OSTYPE"
  echo "Please manually start Obsidian with --remote-debugging-port=9222"
fi

# Step 3: Wait for user to attach debugger
echo ""
echo "✅ Plugin built and Obsidian started!"
echo ""
echo "📌 Next steps:"
echo "   1. In VSCode, go to Run and Debug (Ctrl+Shift+D or Cmd+Shift+D)"
echo "   2. Select 'Attach to Obsidian' from the dropdown"
echo "   3. Click the green play button to attach the debugger"
echo "   4. Set breakpoints in your TypeScript files"
echo "   5. Use your plugin in Obsidian to trigger breakpoints"
echo ""
echo "💡 Tip: Use 'npm run dev:watch' for continuous development with auto-copy"