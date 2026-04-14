#!/bin/bash

# Build script for web version
# Exports static files for deployment to GitHub Pages

set -e

echo "🚀 Building Visual Novel Engine for web..."

# Clean previous build
echo "🧹 Cleaning previous build..."
rm -rf dist

# Export web build
echo "📦 Exporting web build..."
npx expo export --platform web

# Check if build was successful
if [ ! -d "dist" ]; then
  echo "❌ Build failed - dist directory not found"
  exit 1
fi

# Create .nojekyll file to disable Jekyll processing
echo "📝 Creating .nojekyll file..."
touch dist/.nojekyll

# Copy CNAME if it exists (for custom domain)
if [ -f "CNAME" ]; then
  echo "📋 Copying CNAME file..."
  cp CNAME dist/CNAME
fi

echo "✅ Build complete!"
echo "📁 Output directory: dist/"
echo ""
echo "To test locally:"
echo "  npx serve dist"
echo ""
echo "To deploy to GitHub Pages:"
echo "  1. Push to main branch (automatic via GitHub Actions)"
echo "  2. Or manually: gh-pages -d dist"
