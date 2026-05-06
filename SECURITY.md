# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | Yes       |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Send a report to **info@amirtech.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (optional)

You will receive a response within 48 hours. We aim to release a fix within 7 days of confirmation.

## Security Considerations

- API keys are stored in `~/.config/arix/config.json` with `600` permissions
- Keys are never logged — sensitive fields are scrubbed (`apiKey`, `token`, `password`, `secret`, `authorization`)
- Shell commands run via `execFile` (no shell injection via string interpolation)
- File operations are sandboxed to the current working directory by default
