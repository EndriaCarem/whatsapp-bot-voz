# ─── Build stage ──────────────────────────────────────────────────────────────
# Usamos node:20-slim (imagem leve) e instalamos o FFmpeg por cima.
# O FFmpeg é necessário para aplicar os efeitos de voz (pitch, eco, vibrato).

FROM node:20-slim

# Instala o FFmpeg
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia só o package.json primeiro para aproveitar o cache do Docker.
# Se o código mudar mas as dependências não, o npm ci não roda de novo.
COPY package*.json ./
RUN npm ci --omit=dev

# Copia o código da aplicação
COPY index.js efeitos.js ./

EXPOSE 3000

CMD ["node", "index.js"]
