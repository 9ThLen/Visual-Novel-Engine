# Web Deployment Guide

This guide explains how to build and deploy the Visual Novel Engine web version to GitHub Pages.

## Prerequisites

- Node.js 18+
- pnpm 9+
- Git

## Building for Web

### Local Build

To build the web version locally:

```bash
# Using the build script
bash scripts/build-web.sh

# Or manually
npx expo export --platform web
```

The build output will be in the `dist/` directory.

### Test Locally

To test the build locally before deploying:

```bash
# Install serve if you don't have it
npm install -g serve

# Serve the dist folder
npx serve dist
```

Open http://localhost:3000 in your browser.

## Deploying to GitHub Pages

### Automatic Deployment (Recommended)

The repository is configured with GitHub Actions for automatic deployment.

**Setup Steps:**

1. **Enable GitHub Pages:**
   - Go to your repository settings
   - Navigate to "Pages" section
   - Under "Build and deployment":
     - Source: Select "GitHub Actions"
   - Save

2. **Push to main branch:**
   ```bash
   git push origin main
   ```

3. **Wait for deployment:**
   - Go to the "Actions" tab in your repository
   - Watch the "Deploy to GitHub Pages" workflow
   - Once complete, your site will be live at:
     `https://[username].github.io/[repository-name]/`

### Manual Deployment

If you prefer manual deployment:

```bash
# Build the web version
bash scripts/build-web.sh

# Install gh-pages if you don't have it
npm install -g gh-pages

# Deploy to gh-pages branch
gh-pages -d dist
```

## Custom Domain

To use a custom domain:

1. **Create CNAME file:**
   ```bash
   echo "yourdomain.com" > CNAME
   ```

2. **Rebuild and deploy:**
   ```bash
   bash scripts/build-web.sh
   ```

3. **Configure DNS:**
   - Add a CNAME record pointing to `[username].github.io`
   - Or add A records pointing to GitHub Pages IPs:
     - 185.199.108.153
     - 185.199.109.153
     - 185.199.110.153
     - 185.199.111.153

4. **Update GitHub settings:**
   - Go to repository Settings → Pages
   - Enter your custom domain
   - Enable "Enforce HTTPS"

## Environment Variables

If your app needs environment variables:

1. **Create `.env` file:**
   ```bash
   EXPO_PUBLIC_API_URL=https://api.example.com
   ```

2. **Add to GitHub Secrets:**
   - Go to Settings → Secrets and variables → Actions
   - Add your secrets
   - Update `.github/workflows/deploy-web.yml` to use them

## Troubleshooting

### Build Fails

**Issue:** Build fails with "out of memory" error

**Solution:**
```bash
# Increase Node memory limit
NODE_OPTIONS=--max-old-space-size=4096 npx expo export --platform web
```

### Assets Not Loading

**Issue:** Images/fonts not loading after deployment

**Solution:**
- Check that assets are in the `assets/` folder
- Verify `app.config.ts` has correct asset paths
- Clear browser cache and try again

### Routing Issues

**Issue:** Direct URLs (e.g., `/editor`) return 404

**Solution:**
- GitHub Pages doesn't support client-side routing by default
- The build includes a 404.html redirect workaround
- Alternatively, use hash routing (not recommended)

### Blank Page

**Issue:** Deployed site shows blank page

**Solution:**
1. Check browser console for errors
2. Verify `.nojekyll` file exists in dist/
3. Check that `web.output: "static"` is set in `app.config.ts`
4. Clear GitHub Pages cache (redeploy)

## Build Configuration

The web build is configured in `app.config.ts`:

```typescript
web: {
  bundler: "metro",
  output: "static",
  favicon: "./assets/images/favicon.png",
}
```

## Performance Optimization

### Code Splitting

The build automatically code-splits by route. To optimize further:

```typescript
// Use dynamic imports for heavy components
const HeavyComponent = React.lazy(() => import('./HeavyComponent'));
```

### Asset Optimization

- Use WebP images for better compression
- Lazy load images with `expo-image`
- Compress audio files (MP3 at 128kbps is usually sufficient)

### Caching

GitHub Pages automatically caches static assets. To force cache refresh:

1. Update asset filenames
2. Or add cache-busting query params

## Monitoring

### Analytics

To add analytics:

1. **Google Analytics:**
   ```typescript
   // In app/_layout.tsx
   useEffect(() => {
     if (Platform.OS === 'web') {
       // Add GA script
     }
   }, []);
   ```

2. **Plausible (privacy-friendly):**
   - Add script to `public/index.html` if needed

### Error Tracking

Consider adding error tracking:

- Sentry
- LogRocket
- Bugsnag

## Continuous Deployment

The GitHub Actions workflow runs on:
- Every push to `main` branch
- Manual trigger via "Actions" tab

To disable automatic deployment:
- Remove the workflow file
- Or change the trigger conditions

## Rollback

To rollback to a previous version:

```bash
# Find the commit hash of the working version
git log

# Reset to that commit
git reset --hard <commit-hash>

# Force push (be careful!)
git push origin main --force
```

Or use GitHub's deployment history to redeploy a previous version.

## Support

For issues:
- Check the [GitHub Issues](https://github.com/9ThLen/Visual-Novel-Engine/issues)
- Review Expo documentation: https://docs.expo.dev/distribution/publishing-websites/
- GitHub Pages docs: https://docs.github.com/pages
