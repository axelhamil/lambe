# Security Policy

## Supported versions

Only the latest release is supported, on the Chrome Web Store and on [GitHub releases](https://github.com/axelhamil/lambe/releases).

## Reporting a vulnerability

Report it through [GitHub private vulnerability reporting](https://github.com/axelhamil/lambe/security/advisories/new). Do not open a public issue.

Useful in a report: the Lambë version (in **Privacy and about**), the browser and its version, the provider (Ollama or OpenAI-compatible), and the steps or page that trigger it.

## Scope

Lambë's extension code, its packages, its build and its CI workflows. Typical concerns: page text or an API key reaching anyone but the provider the user configured, a page script reaching the extension, a permission wider than [the listing](docs/store/listing.en.md) justifies. What the extension handles is described in the [privacy policy](docs/privacy-policy.md).

Vulnerabilities in Ollama, in an OpenAI-compatible server or in the browser belong to their own projects.
