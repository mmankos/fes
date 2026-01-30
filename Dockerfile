FROM public.ecr.aws/lambda/nodejs:22

# Install Chromium dependencies for Amazon Linux 2023
RUN dnf install -y atk at-spi2-atk cups-libs libdrm libXcomposite libXdamage \
    libXext libXfixes libXrandr mesa-libgbm pango cairo alsa-lib nss \
    libXScrnSaver libxshmfence

# Copy Tailscale from official image
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscaled /var/runtime/tailscaled
COPY --from=docker.io/tailscale/tailscale:stable /usr/local/bin/tailscale /var/runtime/tailscale

# Setup Tailscale directories
RUN mkdir -p /var/run /var/cache /var/lib && \
    ln -s /tmp/tailscale /var/run/tailscale && \
    ln -s /tmp/tailscale /var/cache/tailscale && \
    ln -s /tmp/tailscale /var/lib/tailscale

# Copy your code
WORKDIR /var/task
COPY . .
RUN npm install --omit-dev

# Set up bootstrap
COPY bootstrap /var/runtime/bootstrap
RUN chmod +x /var/runtime/bootstrap

ENTRYPOINT ["/var/runtime/bootstrap"]
