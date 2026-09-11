# Third-party sandbox profile

`seccomp_profile.json` is derived from Microsoft Playwright v1.63.0:
https://github.com/microsoft/playwright/blob/v1.63.0/utils/docker/seccomp_profile.json

Original upstream SHA-256: `cc3e61cabda6bbc1e53e54d27ba4d55a9d3be829b6dd1a596f4a7b31b1cc7849`.

Modified for Broker on September 10, 2026: explicitly allow `chroot`. Docker's inherited profile otherwise allows it only when the outer container has SYS_CHROOT, which Broker drops. Chromium uses it inside its own user namespace to establish its sandbox. The kernel still requires appropriate namespace capabilities; this does not grant the container a host capability. All other upstream rules remain unchanged.

Copyright Microsoft Corporation. Distributed under the Apache License 2.0; see PLAYWRIGHT-LICENSE. The profile extends Docker's default syscall policy to permit Chromium's user-namespace sandbox. It is used only by the trusted browser container, together with unprivileged user, dropped capabilities and no-new-privileges.
