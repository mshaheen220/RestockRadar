FROM php:8.3-cli

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

RUN apt-get update && apt-get install -y --no-install-recommends libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/* \
    && docker-php-ext-install pdo_sqlite

WORKDIR /app
COPY . /app

# Real transaction_log.csv is bind-mounted at runtime (see docker-compose.yml); it is
# gitignored and never baked into the image.
EXPOSE 8734

CMD ["php", "-S", "0.0.0.0:8734", "-t", "public"]
