# Use an official Deno runtime as a parent image (using a specific version for stability)
FROM denoland/deno:alpine-2.2.7
WORKDIR /app

COPY deno.lock .
COPY deno.json .

COPY src/ .

RUN deno cache main.ts --lock=deno.lock

EXPOSE 7000

CMD ["deno", "run", "--unstable-kv", "--allow-env", "--allow-write", "--allow-read", "--allow-net", "main.ts"]