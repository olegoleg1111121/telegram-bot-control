# Third-party notices

Telegram Bot Control is an independent project. It is not affiliated with or endorsed
by Telegram, GitHub, Electron, or the aiogram maintainers.

Key dependencies retain their own licenses:

| Dependency | License | Purpose |
| --- | --- | --- |
| Python | PSF | Bot integration and local bridge |
| aiogram | MIT | Telegram event handling |
| psutil | BSD-3-Clause | Process identity and lifecycle |
| Electron | MIT, with bundled Chromium/Node notices | Desktop runtime |
| React | MIT | Interface |
| Lucide | ISC | Interface icons |
| SQLite | Public domain | Embedded storage |
| Vite | MIT | Frontend build |
| Sharp | Apache-2.0 | Icon generation during development |
| Inter | SIL OFL-1.1 | Local Latin/Cyrillic interface font |

The bundled web UI includes full React/React DOM/Lucide notices in
`WEB-LIBRARY-LICENSES.txt` and the Inter license in `INTER-LICENSE.txt`.

Electron distributions include their upstream `LICENSE` (renamed to
`LICENSE.electron.txt` in the Windows application) and `LICENSES.chromium.html`.
Keep those files with the packaged application. Exact dependency versions are recorded
in `desktop/pnpm-lock.yaml` and `requirements-dev.lock`.

The original application icon and portfolio screenshots are part of this repository
and are covered by its MIT license. Screenshots use explicitly generated demo data.
