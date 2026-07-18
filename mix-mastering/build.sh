#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "=== Building Audio Mastering Tool ==="

# Run tests
echo "Running tests..."
go test ./pkg/... -count=1 -short
echo ""

# Build CLI
echo "Building CLI..."
mkdir -p bin
go build -o bin/master ./cmd/master/
echo "  -> bin/master"

# Build WASM
echo "Building WASM..."
mkdir -p web/public
GOOS=js GOARCH=wasm go build -o web/public/engine.wasm ./cmd/wasm/
echo "  -> web/public/engine.wasm"

# Copy wasm_exec.js
GOROOT=$(go env GOROOT)
cp "$GOROOT/lib/wasm/wasm_exec.js" web/public/ 2>/dev/null || \
cp "$GOROOT/misc/wasm/wasm_exec.js" web/public/ 2>/dev/null || \
echo "  Warning: wasm_exec.js not found"
echo "  -> web/public/wasm_exec.js"

# Build web UI
echo "Building Web UI..."
cd web
if [ ! -d node_modules ]; then
  npm install
fi
npx vite build
echo "  -> web/dist/"
cd ..

# Report sizes
echo ""
echo "=== Build Sizes ==="
ls -lh bin/master web/public/engine.wasm 2>/dev/null
du -sh web/dist/ 2>/dev/null

echo ""
echo "=== Build Complete ==="
echo ""
echo "Usage:"
echo "  CLI:  ./bin/master process input.wav -o output.wav"
echo "  CLI:  ./bin/master analyze input.wav --target headphones"
echo "  CLI:  ./bin/master preset list"
echo "  Web:  cd web && npx vite"
