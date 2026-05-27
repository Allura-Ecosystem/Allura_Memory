# Allura Memory Brand Dashboard — Static SPA
# Serves the HTML prototype on nginx

FROM nginx:alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the app files
COPY index.html /usr/share/nginx/html/
COPY tokens.css /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/

# Copy brand logos (mounted from sibling directory)
COPY logos/ /usr/share/nginx/html/logos/

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1/health || exit 1

EXPOSE 80
