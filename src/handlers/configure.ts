import type { Manifest, ManifestConfigType } from '../deps.ts';
import type { Config } from '../types.ts';
import { isKeyInitialized } from '../lib/crypto.ts';

export function serveConfigPage(
    requestUrl: URL,
    manifest: Manifest,
    existingConfig: Config | null = null
): Response {
    const currentHost = requestUrl.origin;
    const keyInitialized = isKeyInitialized();
    const bitmagnetUrlFromEnv = Deno.env.get("BITMAGNET_URL");
    let formHtml = '';

    // Build form fields from manifest.config
    manifest.config?.forEach((item: ManifestConfigType) => {
        const requiredLabel = item.required ? ' (Required)' : ' (Optional)';
        const inputId = `config_${item.key}`;
        let valueToSet: string | undefined = undefined;
        let checkedToSet = false;
        const existingValue = existingConfig ? existingConfig[item.key as keyof Config] : undefined;

        if (existingValue !== undefined) {
            if (item.type === 'checkbox') {
                checkedToSet = Boolean(existingValue);
            } else {
                valueToSet = String(existingValue);
            }
        } else if (item.default !== undefined) {
            if (item.type === 'checkbox') {
                checkedToSet = (item.default === 'checked');
            } else {
                valueToSet = item.default;
            }
        }

        const valueAttr = (valueToSet !== undefined && item.type !== 'password') ? `value="${escapeHtml(valueToSet)}"` : '';
        const checkedAttr = (item.type === 'checkbox' && checkedToSet) ? 'checked' : '';

        formHtml += `<label for="${inputId}">${escapeHtml(item.title)}${requiredLabel}:</label>\n`;
        switch (item.type) {
            case 'password':
                formHtml += `<input type="password" id="${inputId}" name="${escapeHtml(item.key)}" ${item.required ? 'required' : ''} placeholder="${escapeHtml(item.title || '')}">\n`;
                break;
            case 'text':
                if (item.key === 'bitmagnetUrl') {
                    if (bitmagnetUrlFromEnv) {
                        formHtml += `<p style="padding: 10px; background-color: rgba(28, 10, 51, 0.7); border-radius: 6px; border: 1px solid rgba(126, 59, 255, 0.3); word-break: break-all;">${escapeHtml(bitmagnetUrlFromEnv)}</p>\n`;
                        formHtml += `<small>This URL is set via the BITMAGNET_URL environment variable and cannot be changed here.</small>\n`;
                        formHtml += `<input type="hidden" name="${escapeHtml(item.key)}" value="${escapeHtml(bitmagnetUrlFromEnv)}">\n`;
                    } else {
                        formHtml += `<input type="url" id="${inputId}" name="${escapeHtml(item.key)}" required placeholder="https://your-bitmagnet.example.com" ${valueAttr} pattern="https?://.+">\n`;
                        formHtml += `<small>Must start with http:// or https://</small>\n`;
                    }
                } else {
                    formHtml += `<input type="text" id="${inputId}" name="${escapeHtml(item.key)}" ${item.required ? 'required' : ''} placeholder="${escapeHtml(item.title || '')}" ${valueAttr}>\n`;
                }
                break;
            case 'number':
                formHtml += `<input type="number" id="${inputId}" name="${escapeHtml(item.key)}" ${item.required ? 'required' : ''} ${valueAttr} min="${item.key === 'bitmagnetSearchLimit' ? '1' : '5'}" max="${item.key === 'bitmagnetSearchLimit' ? '100' : ''}">\n`;
                break;
            case 'checkbox':
                formHtml += `<input type="checkbox" id="${inputId}" name="${escapeHtml(item.key)}" ${checkedAttr}>\n`;
                break;
            case 'select':
                formHtml += `<select id="${inputId}" name="${escapeHtml(item.key)}">\n`;
                item.options?.forEach((opt: string) => {
                    const isSelected =
                        (valueToSet !== undefined && valueToSet === opt) ||
                        (valueToSet === undefined && item.default === opt);
                    formHtml += `  <option value="${escapeHtml(opt)}" ${isSelected ? 'selected' : ''}>${escapeHtml(opt)}</option>\n`;
                });
                formHtml += `</select>\n`;
                break;
        }
    });

    const headers = new Headers({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Bitmagnet Addon Configuration</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        :root {
            --deep-purple: #2a0b4f;
            --vibrant-purple: #7e3bff;
            --light-purple: #b388ff;
            --accent-purple: #9c4dff;
            --dark-bg: #1a052f;
            --darker-bg: #120324;
            --text-light: #e2d9f3;
            --text-lighter: #f5f0ff;
            --error-red: #ff6b6b;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: var(--text-light);
            background-color: var(--dark-bg);
            min-height: 100vh;
        }
        
        h1, h2 {
            color: var(--text-lighter);
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
        }
        
        h1 {
            border-bottom: 2px solid var(--vibrant-purple);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }
        
        .error-message {
            color: var(--error-red);
            font-weight: bold;
            background-color: rgba(255, 107, 107, 0.1);
            padding: 10px;
            border-radius: 6px;
            border-left: 4px solid var(--error-red);
        }
        
        #config-form {
            display: flex;
            flex-direction: column;
            gap: 18px;
            margin-bottom: 25px;
            background-color: var(--darker-bg);
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(126, 59, 255, 0.2);
        }
        
        #config-form label {
            font-weight: 600;
            display: block;
            margin-bottom: 8px;
            color: var(--light-purple);
            font-size: 0.95rem;
        }
        
        #config-form input:not([type=checkbox]), 
        #config-form select {
            width: 100%;
            padding: 12px;
            box-sizing: border-box;
            border: 1px solid rgba(126, 59, 255, 0.3);
            border-radius: 6px;
            background-color: rgba(28, 10, 51, 0.7);
            color: var(--text-light);
            font-size: 0.95rem;
            transition: all 0.3s ease;
        }
        
        #config-form input:focus:not([type=checkbox]), 
        #config-form select:focus {
            outline: none;
            border-color: var(--vibrant-purple);
            box-shadow: 0 0 0 3px rgba(126, 59, 255, 0.2);
            background-color: rgba(28, 10, 51, 0.9);
        }
        
        #config-form input[type=checkbox] {
            width: 18px;
            height: 18px;
            accent-color: var(--vibrant-purple);
        }
        
        button, .button-link {
            background: linear-gradient(135deg, var(--vibrant-purple), var(--accent-purple));
            color: white;
            border: none;
            padding: 14px 24px;
            text-align: center;
            text-decoration: none;
            display: inline-block;
            font-size: 1rem;
            margin: 15px 0;
            cursor: pointer;
            border-radius: 8px;
            transition: all 0.3s ease;
            font-weight: 600;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
        }
        
        button:hover, .button-link:hover {
            background: linear-gradient(135deg, var(--accent-purple), var(--vibrant-purple));
            transform: translateY(-2px);
            box-shadow: 0 6px 8px rgba(0, 0, 0, 0.3);
        }
        
        button:active, .button-link:active {
            transform: translateY(0);
        }
        
        button:disabled {
            background: #3a2a5a;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
            opacity: 0.7;
        }
        
        #install-link-container {
            display: none;
            margin-top: 30px;
            padding: 25px;
            background-color: var(--darker-bg);
            border-radius: 10px;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(126, 59, 255, 0.2);
            border-left: 4px solid var(--vibrant-purple);
        }
        
        .copy-button {
            background: linear-gradient(135deg, #9c4dff, #7e3bff);
        }
        
        .copy-button:hover {
            background: linear-gradient(135deg, #8a3bff, #6e2bff);
        }
        
        small {
            display: block;
            color: var(--light-purple);
            font-size: 0.85rem;
            margin-top: 6px;
            opacity: 0.8;
        }
        
        hr {
            border: none;
            height: 1px;
            background: linear-gradient(90deg, transparent, rgba(126, 59, 255, 0.5), transparent);
            margin: 25px 0;
        }
        
        #web-install-link-text {
            display: inline-block;
            padding: 12px;
            background-color: rgba(28, 10, 51, 0.7);
            border-radius: 6px;
            margin: 12px 0;
            word-break: break-all;
            font-family: monospace;
            border: 1px dashed rgba(126, 59, 255, 0.3);
        }
        
        #copy-status {
            margin-left: 12px;
            font-style: italic;
            color: var(--light-purple);
            font-size: 0.9rem;
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }
        
        ::-webkit-scrollbar-track {
            background: var(--dark-bg);
        }
        
        ::-webkit-scrollbar-thumb {
            background: var(--vibrant-purple);
            border-radius: 4px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
            background: var(--accent-purple);
        }
    </style>
</head>
<body>
    <h1>Configure Bitmagnet Stremio Addon</h1>
    <p>Enter details below. Configuration will be encrypted in the installation link.</p>
    ${!keyInitialized ? '<p class="error-message">Warning: ADDON_SECRET_KEY not set. Configuration cannot be saved securely.</p>' : ''}
    <form id="config-form">
        ${formHtml}
        <button type="submit" ${!keyInitialized ? 'disabled' : ''}>Generate Installation Link</button>
        ${!keyInitialized ? '<p class="error-message">Cannot generate link: ADDON_SECRET_KEY not configured.</p>' : ''}
    </form>
    <div id="install-link-container">
        <h2>Installation Link Generated!</h2>
        <p>Click the button below to install directly in the Stremio app:</p>
        <a id="install-link" href="#" class="button-link">Install in Stremio App</a>
        <hr>
        <p>Or, copy the link below for use on the Stremio website or other platforms:</p>
        <span id="web-install-link-text"></span>
        <button type="button" class="copy-button" onclick="copyWebLink()">Copy Link</button>
        <span id="copy-status"></span>
    </div>
    <script>
        // Inject the current host correctly without escaped quotes
        const currentHostFromServer = "${escapeJsString(currentHost)}";
        // Remove trailing slash if present
        const currentHostTrimmed = currentHostFromServer.replace(/\\/$/, '');
    
        document.getElementById("config-form").addEventListener("submit", async (event) => {
            event.preventDefault();
            const installContainer = document.getElementById('install-link-container');
            const installLink = document.getElementById('install-link');
            installContainer.style.display = 'none';
    
            const formData = new FormData(event.target);
            // Handle checkboxes
            document.querySelectorAll('#config-form input[type=checkbox]').forEach(cb => {
                if (cb.checked) {
                    formData.set(cb.name, 'on');
                } else {
                    formData.delete(cb.name);
                }
            });
    
            try {
                const response = await fetch('/api/generate-config-token', {
                    method: 'POST',
                    body: formData
                });
                if (response.ok) {
                    const result = await response.json();
                    const token = result.token;
                    // Remove protocol for the stremio:// link
                    const hostOnly = currentHostTrimmed.replace(/^https?:\\/\\//, '');
                    const stremioInstallUrl = 'stremio://' + hostOnly + '/' + token + '/manifest.json';
                    const webInstallUrl = currentHostTrimmed + '/' + token + '/manifest.json';
    
                    installLink.href = stremioInstallUrl;
                    document.getElementById('web-install-link-text').textContent = webInstallUrl;
                    document.getElementById('copy-status').textContent = '';
                    installContainer.style.display = 'block';
                } else {
                    alert('Error generating token: ' + await response.text());
                }
            } catch (error) {
                alert('Error submitting config: ' + error.message);
            }
        });
    
        function copyWebLink() {
            const linkText = document.getElementById('web-install-link-text').textContent;
            const copyStatus = document.getElementById('copy-status');
            navigator.clipboard.writeText(linkText).then(() => {
                copyStatus.textContent = 'Copied!';
                setTimeout(() => { copyStatus.textContent = ''; }, 2000);
            }).catch(err => {
                copyStatus.textContent = 'Failed to copy';
                console.error('Failed to copy link: ', err);
            });
        }
    </script>
</body>
</html>
`;

    return new Response(html, { headers });
}

function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJsString(unsafe: string): string {
    return unsafe
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}