# Security Policy

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull
requests.**

Instead, report them privately using GitHub's private vulnerability reporting:

- Open a private advisory: <https://github.com/HallyAus/Tesla/security/advisories/new>

Please include:

- The affected product (Dashcam Viewer or Tesla Tracker) and version / commit.
- A description of the issue and its impact.
- Steps to reproduce, if possible.

We aim to acknowledge reports within a few days and will keep you updated on remediation. Please
give us a reasonable opportunity to fix the issue before any public disclosure.

## Supported versions

This is a community project under active development. Security fixes are applied to the latest
release on the `main` branch. Older versions are not maintained — please update to the latest
release before reporting.

| Version | Supported          |
| ------- | ------------------ |
| latest (`main`) | :white_check_mark: |
| older releases  | :x:                |

## Tesla tokens & secrets

- **Tesla tokens never belong in this repository.** Authentication for Tesla Tracker is handled by
  the official **Tesla Fleet** integration inside the user's own Home Assistant instance. Tokens
  live only there and must never be committed, logged, or shared.
- The **Dashcam Viewer** is 100% client-side. It reads footage locally via the browser File System
  Access API and uploads nothing — there is no server and no credential to leak.
- If you discover a token, key, or `secrets.yaml` committed anywhere in the repo or its history,
  please report it privately as described above so it can be rotated and purged.
