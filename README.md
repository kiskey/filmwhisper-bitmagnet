# FilmWhisper: Bitmagnet Stremio Addon

This project provides a Stremio addon that searches a Bitmagnet instance for torrents related to movies and series requested by Stremio. It then uses Premiumize to potentially generate direct download links, presenting them as streamable sources within Stremio.

**Note:** As indicated in the compose files, this is primarily intended for local/personal use.

## Features

*   Integrates with Stremio to provide streaming sources.
*   Queries a Bitmagnet instance for relevant torrents based on IMDB ID.
*   Optionally uses TMDB API to enhance metadata lookup.
*   Leverages Premiumize API to check cache status and potentially provide direct download links.

## Requirements

*   Docker and Docker Compose
*   A running Bitmagnet instance accessible from this addon.
*   A Premiumize API Key.
*   A TMDB API Key.

## Configuration

This addon uses a web interface for configuration, but requires a server-side secret key for encrypting the settings.

**1. Server Setup (Environment Variables):**

Before running the addon server, you **must** set the `ADDON_SECRET_KEY` environment variable. Create a `.env` file by copying `.env.example`:

```bash
cp .env.example .env
```

Edit the `.env` file and set:

*   `ADDON_SECRET_KEY`: **Required.** A strong, unique passphrase (at least 32 characters recommended). This is used to encrypt user configuration. **Keep this secret!** Anyone with this key can potentially decrypt user API keys if they intercept an installation URL.
*   `PORT`: Optional. The port the addon server will listen on (default: 7000).
*   `BITMAGNET_URL`: Optional. Allows setting a static Bitmagnet GraphQL API URL (e.g., `http://bitmagnet:3333`). If set, the addon will skip the Bitmagnet URL configuration step in the web interface. This is useful if running within the same Docker network as Bitmagnet, allowing you to use the service name (`bitmagnet`) instead of exposing the Bitmagnet port externally.

**2. User Configuration (Web Interface):**

Once the server is running with the `ADDON_SECRET_KEY` set:

*   Navigate your browser to the addon's configuration page (e.g., `http://<your-server-ip>:<port>/configure`).
*   Fill in the required and optional settings:
    *   **Bitmagnet URL (Required):** The full URL to your Bitmagnet instance's GraphQL API (e.g., `http://your-bitmagnet-ip:3333`).
    *   **TMDB API Key (Optional):** Your TMDB API key (v3). Needed for better metadata matching.
    *   **Premiumize API Key (Optional):** Your Premiumize API key. Needed for generating direct download links.
    *   **Advanced Options:** Timeout, Sort Field, Sort Direction, Search Limit.
*   Click "Generate Installation Link".
*   The page will display a Stremio installation link (e.g., `stremio://<host>/<encrypted-token>/manifest.json`). This link contains your configuration, encrypted using the server's `ADDON_SECRET_KEY`.

## How to Run

There are several ways to run the addon:

**1. Using Docker (Recommended for Production/Full Setup):**

This method runs the addon, Bitmagnet, and a PostgreSQL database together.

*   Ensure you have Docker and Docker Compose installed.
*   Make sure you have created and configured your `.env` file as described in the **Configuration** section.
*   Run the following command in your terminal:

    ```bash
    docker compose up -d
    ```

**2. Using Docker (Development - Addon Only):**

This method builds and runs only the addon container, assuming you have a separate Bitmagnet instance running and accessible.

*   Ensure you have Docker and Docker Compose installed.
*   Make sure you have created and configured your `.env` file.
*   Run the following command:

    ```bash
    docker compose -f DEVELOPMENT-docker-compose.yml up --build -d
    ```

**3. Using Deno (Directly):**

This method runs the addon directly using the Deno runtime. Useful for development if you prefer not to use Docker for the addon itself.

*   Ensure you have Deno installed (https://deno.land/).
*   Make sure you have created and configured your `.env` file.
*   Run the following command in your terminal:

    ```bash
    deno task dev
    ```
    *(This uses the `dev` task defined in `deno.json`, which includes `--watch` for automatic restarts on file changes.)*

---

## Usage in Stremio

1.  Ensure the addon server is running with the correct `ADDON_SECRET_KEY` set in its environment (e.g., via Docker Compose with the `.env` file or `deno run --allow-env ...`).
2.  Generate the installation link using the `/configure` page as described above.
3.  Click the generated "Install Addon" link (or copy/paste it into Stremio's search bar).
4.  Stremio will install the addon using the URL containing the encrypted configuration token.

The addon should now be listed, and stream sources from Bitmagnet/Premiumize will appear when viewing movie/series details.