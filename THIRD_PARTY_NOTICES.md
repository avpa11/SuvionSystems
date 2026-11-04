# Third-party notices

The root MIT license covers original Suvion Systems code and documentation.
Dependencies retain their own licenses; installing them does not relicense them.

- [Signal K server](https://github.com/SignalK/signalk-server) is an optional upstream
  Git submodule under Apache-2.0. Its license remains in `apps/signalk-server/LICENSE`.
  The core build does not require downloading or modifying that checkout.
- Next.js, React, Express, Socket.IO, Mongoose, PDFKit, and Lucide retain their
  package license notices. See the exact installed versions in `package-lock.json`
  and the license files distributed with those packages.
- MongoDB and container images have their own distribution terms. The root MIT
  license does not cover the MongoDB server or optional hosted services.
- IMO, EPA, and BCIT are cited as references. Their publications, logos, and photos
  are not relicensed by this repository. Linking to a source does not imply endorsement.
- Dashboard screenshots in `docs/images` are generated from synthetic simulator
  data. The architecture illustration is original SVG artwork stored in this repo.
