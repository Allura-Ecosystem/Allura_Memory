# Allura Memory Brand Dashboard — Static SPA
# Build context: clients/allura-memory/brand-assets/

FROM nginx:alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY allura/nginx.conf /etc/nginx/conf.d/default.conf

# Copy the app files from allura/ directory
COPY allura/index.html /usr/share/nginx/html/
COPY allura/tokens.css /usr/share/nginx/html/
COPY allura/src/ /usr/share/nginx/html/src/

# Copy brand logos from logos/ directory
COPY logos/ /usr/share/nginx/html/logos/

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

EXPOSE 80
