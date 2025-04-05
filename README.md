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

Configuration is handled via environment variables. Create a `.env` file in the root directory by copying `.env.example`:

```bash
cp .env.example .env
```

Then, edit the `.env` file with your specific values:

*   `PORT`: The port the addon server will listen on (default: 7000).
*   `BITMAGNET_URL`: The full URL to your Bitmagnet instance's GraphQL API (e.g., `http://your-bitmagnet-ip:3333`).
*   `BITMAGNET_TIMEOUT`: Timeout in seconds for requests to Bitmagnet (default: 30). Increase if your Bitmagnet instance is slow.
*   `TMDB_API_KEY`: Your TMDB API key (v3). Required for reliable title/year lookup.
*   `BITMAGNET_SORT_FIELD`: (Optional) Field to sort Bitmagnet search results by. Defaults to `Seeders`. Valid options: `Relevance`, `PublishedAt`, `UpdatedAt`, `Size`, `Files`, `Seeders`, `Leechers`, `Name`, `InfoHash`.
*   `BITMAGNET_SORT_DESCENDING`: (Optional) Set to `true` (default) or `false` to control the sort direction for `BITMAGNET_SORT_FIELD`.
*   `BITMAGNET_SEARCH_LIMIT`: (Optional) Maximum number of results to fetch from Bitmagnet per search (default: 20).
*   `PREMIUMIZE_API_KEY`: Your Premiumize API key.

## Usage in Stremio

1.  Visit `http://<your-server-ip>:7000`.
2.  Click "Install".

The addon should now be listed, and stream sources from Bitmagnet/Premiumize will appear when viewing movie/series details.