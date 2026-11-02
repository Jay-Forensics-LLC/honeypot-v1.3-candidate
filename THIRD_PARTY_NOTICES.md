# Bundled source notices

## Sentinel-Forensics

This repository includes the complete tracked source tree of
[Jay-Forensics-LLC/sentinel-forensics](https://github.com/Jay-Forensics-LLC/sentinel-forensics)
under `sentinel-forensics/`.

- Upstream commit: `187bec14835fc9497b05594ca467a49259553d64`.
- Upstream Git tree: `45e7025dd351732dfa0d321362891ff353f8b940`.
- Bundled license: **GNU Affero General Public License, version 3**;
  the full text is preserved at [sentinel-forensics/LICENSE](sentinel-forensics/LICENSE).
- Import method: complete committed tree with 66 recorded replacements and 33 local additions, without upstream Git metadata/history
  or untracked files. See [the source manifest](docs/sentinel-source.json).

Keep the component's license and existing source notices with copies of the
bundled project and follow its applicable license terms when conveying or
modifying that component. This notice identifies the bundled component's license;
it does not replace existing notices elsewhere in HoneyTrace or declare a blanket
relicense of every file in the outer repository.

The full upstream source includes its React/Base44 application, backend functions,
offline analyzer, tests and documentation. HoneyTrace's local launcher currently
integrates the offline analyzer through its own case/job API and minimized
exchange consumer. Retaining other upstream source is not a claim that all of
those capabilities are activated in the master dashboard. The import also does
not convey installed npm/Python/OS dependency packages; those dependencies retain
their own applicable licenses.

Publication note: GitHub push protection rejected a credential-shaped value in
Sentinel's mocked code-audit input. That one demo literal is replaced by an
explicit placeholder, with a modification notice. The source manifest records
both effective and upstream tree identities and each changed file. A second
recorded patch closes test-owned descriptors on setup/diagnostic failure after PR
review; production reconstruction behavior is unchanged. Snapshot
validation verifies both trees; the 1,416 upstream files and license remain.
The current 1,449-file bundle records 66 replacements and 33 local additions;
the two Markdown renames preserve their original upstream blobs and tree pin.
