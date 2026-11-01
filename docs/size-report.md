# Distribution size, v0.4.0

Update 0.5.0: adding logging, process charts, restart policy and project wizard
introduced no runtime dependency. The clean Windows unpacked folder is
331,262,584 bytes (315.92 MiB); installer 104,789,002 bytes (99.93 MiB).
The frontend uses SVG charts, existing React and Lucide. Loguru is an optional
integration with the bot's own installation and is not bundled with the dashboard.

Measured locally on Windows x64, 2026-10-30. MiB = 1,048,576 bytes.

| Artifact | v0.3.2 | v0.4.0 |
| --- | ---: | ---: |
| Unpacked desktop application | 389.59 MiB | 315.88 MiB |
| Windows installer | 109.98 MiB | 99.93 MiB |
| Application ASAR | 29.21 MiB | 0.49 MiB |
| Chromium locales | 46.65 MiB | 1.65 MiB |

The desktop folder shrank by 73.71 MiB (18.9%).
React, React DOM and Lucide remain build dependencies, but are not copied again as
runtime node_modules: Vite already bundles the used UI code. Only en-US and ru
Chromium locales are shipped. Runtime DLLs, ICU data, renderer fallbacks and license
files remain intact. Local Latin/Cyrillic Inter WOFF2 files total about 65.4 KiB.

The web-enabled Python wheel is about 0.20 MiB. A fresh base installation with
psutil, pip and venv launchers is 13.00 MiB, excluding
the separately installed Python runtime. It contains no aiogram. Existing bots keep
their own framework; aiogram can be installed with the optional extra when needed.

The development checkout is much larger because it contains node_modules, SDK
build tools, old releases and isolated test copies. These are ignored by Git and
are not shipped in the source archive or installer. Old test copies/build caches
can be removed separately; the active bot database and configuration must remain.
This task did not delete third-party installed-package internals or working bot data.

The independent web mode avoids distributing Electron at all. Moving desktop to a
system-webview framework could reduce it further, but is a separate architecture
change and was not done in this release.
